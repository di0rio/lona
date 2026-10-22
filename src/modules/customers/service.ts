import { asc, eq, ilike, or, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/document";
import {
	grantedPermissions,
	inActiveCompany,
	PermissionDeniedError,
} from "@/modules/access";
import {
	type CustomerKind,
	type CustomerStatus,
	customerKinds,
	customerStatuses,
	customers,
	vehicles,
} from "./schema";
import { isValidPlate, normalizePlate, STATES } from "./validation";

export type { CustomerKind, CustomerStatus };

export type CustomerRow = {
	id: string;
	kind: CustomerKind;
	name: string;
	/** Só dígitos. */
	document: string;
	phone: string | null;
	city: string;
	state: string;
	/** Decimal com ponto, como "1234.50". */
	creditLimit: string;
	status: CustomerStatus;
	vehicleCount: number;
};

export type VehicleRow = {
	id: string;
	/** Normalizada (maiúsculas, sem hífen). */
	plate: string;
	model: string;
	axles: number;
	year: number | null;
};

export type CustomerPermissions = {
	create: boolean;
	edit: boolean;
	changeCreditLimit: boolean;
};

export type CustomersView = {
	customers: CustomerRow[];
	/** Havia mais clientes do que o limite da lista; refine a busca. */
	truncated: boolean;
	can: CustomerPermissions;
};

export type CustomerDetail = {
	customer: CustomerRow;
	vehicles: VehicleRow[];
	can: CustomerPermissions;
};

export type CustomerInput = {
	kind: CustomerKind;
	name: string;
	/** Aceita com máscara. */
	document: string;
	phone: string | null;
	city: string;
	state: string;
	/** Decimal com ponto; "0" quando não há limite. */
	creditLimit: string;
	status: CustomerStatus;
};

export type VehicleInput = {
	plate: string;
	model: string;
	axles: number;
	year: number | null;
};

/** Documento ou placa já usados por outro registro da empresa; o banco garante (unique), aqui só traduzimos. */
export class DuplicateDocumentError extends Error {
	constructor() {
		super("Já existe cliente com esse documento.");
	}
}

export class DuplicatePlateError extends Error {
	constructor() {
		super("Já existe veículo com essa placa.");
	}
}

/** Campo inválido (documento, placa, UF...); a rota converte em 422 dizendo qual. */
export class InvalidCustomerError extends Error {
	constructor(readonly field: string) {
		super(`Valor inválido em ${field}.`);
	}
}

/** Traduz a violação de unicidade do Postgres (23505) pelo nome da constraint; qualquer outro erro segue como está. */
function translateDuplicate(error: unknown): never {
	const cause = (error as { cause?: unknown }).cause ?? error;
	const { code, constraint } = cause as { code?: string; constraint?: string };
	if (code === "23505") {
		if (constraint === "customers_company_id_document_unq") {
			throw new DuplicateDocumentError();
		}
		if (constraint === "vehicles_company_id_plate_unq") {
			throw new DuplicatePlateError();
		}
	}
	throw error;
}

const LIST_LIMIT = 100;

// Texto fixo: o Drizzle tira o nome da tabela das colunas numa seleção de tabela única, e aqui as duas tabelas têm
// company_id.
const vehicleCount = sql<number>`(
	SELECT count(*)::int FROM vehicles v
	WHERE v.company_id = customers.company_id AND v.customer_id = customers.id
)`;

const customerColumns = {
	id: customers.id,
	kind: customers.kind,
	name: customers.name,
	document: customers.document,
	phone: customers.phone,
	city: customers.city,
	state: customers.state,
	creditLimit: customers.creditLimit,
	status: customers.status,
	vehicleCount,
};

/** O que o usuário pode fazer com clientes na empresa ativa (uma consulta só). */
async function grantsOf(tx: Transaction, userId: string, companyId: string) {
	const granted = new Set(await grantedPermissions(tx, userId, companyId));
	return {
		view: granted.has("customer.view"),
		can: {
			create: granted.has("customer.create"),
			edit: granted.has("customer.edit"),
			changeCreditLimit: granted.has("customer.change_credit_limit"),
		},
	};
}

async function requireView(tx: Transaction, userId: string, companyId: string) {
	const grants = await grantsOf(tx, userId, companyId);
	if (!grants.view) throw new PermissionDeniedError("customer.view");
	return grants.can;
}

/** Clientes da empresa ativa por nome ou documento (parcial), por ordem de nome. Exige `customer.view`. */
export async function listCustomers(
	userId: string,
	query = "",
): Promise<CustomersView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const can = await requireView(tx, userId, companyId);
		const text = query.trim();
		// Só busca por documento quando a busca parece um documento (sem letras), senão "Auto 2" acharia quase todos.
		const digits = /^[\d\s.\-/]+$/.test(text) ? onlyDigits(text) : "";
		const escaped = text.replace(/[\\%_]/g, "\\$&");
		const match = text
			? or(
					ilike(customers.name, `%${escaped}%`),
					digits ? ilike(customers.document, `%${digits}%`) : undefined,
				)
			: undefined;
		const rows = await tx
			.select(customerColumns)
			.from(customers)
			.where(match)
			.orderBy(asc(customers.name), asc(customers.id))
			.limit(LIST_LIMIT + 1);
		return {
			customers: rows.slice(0, LIST_LIMIT),
			truncated: rows.length > LIST_LIMIT,
			can,
		};
	});
}

/** Um cliente e seus veículos. Exige `customer.view`. null se a empresa não tem o cliente. */
export async function customerDetail(
	userId: string,
	customerId: string,
): Promise<CustomerDetail | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const can = await requireView(tx, userId, companyId);
		const [customer] = await tx
			.select(customerColumns)
			.from(customers)
			.where(eq(customers.id, customerId));
		if (!customer) return null;
		const rows = await tx
			.select({
				id: vehicles.id,
				plate: vehicles.plate,
				model: vehicles.model,
				axles: vehicles.axles,
				year: vehicles.year,
			})
			.from(vehicles)
			.where(eq(vehicles.customerId, customerId))
			.orderBy(asc(vehicles.plate));
		return { customer, vehicles: rows, can };
	});
}

const oneOf = <T extends string>(
	values: readonly T[],
	value: string,
): value is T => (values as readonly string[]).includes(value);

/** Confere e limpa os campos de um cliente inteiro (documento só dígitos, UF maiúscula...). */
function cleanCustomer(input: CustomerInput): CustomerInput {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 120) {
		throw new InvalidCustomerError("name");
	}
	if (!oneOf(customerKinds, input.kind)) {
		throw new InvalidCustomerError("kind");
	}
	const document = onlyDigits(input.document);
	const validDocument =
		input.kind === "fleet_owner" ? isValidCnpj(document) : isValidCpf(document);
	if (!validDocument) throw new InvalidCustomerError("document");
	const phone = input.phone ? onlyDigits(input.phone) : null;
	if (phone !== null && !/^\d{10,11}$/.test(phone)) {
		throw new InvalidCustomerError("phone");
	}
	const city = input.city.trim();
	if (city.length < 1 || city.length > 80) {
		throw new InvalidCustomerError("city");
	}
	const state = input.state.trim().toUpperCase();
	if (!oneOf(STATES, state)) throw new InvalidCustomerError("state");
	if (!/^\d{1,10}(\.\d{1,2})?$/.test(input.creditLimit)) {
		throw new InvalidCustomerError("creditLimit");
	}
	const creditLimit = Number(input.creditLimit).toFixed(2);
	// Limite de crédito é do frotista; o autônomo compra no balcão.
	if (input.kind === "owner_operator" && Number(creditLimit) !== 0) {
		throw new InvalidCustomerError("creditLimit");
	}
	if (!oneOf(customerStatuses, input.status)) {
		throw new InvalidCustomerError("status");
	}
	return {
		kind: input.kind,
		name,
		document,
		phone,
		city,
		state,
		creditLimit,
		status: input.status,
	};
}

/** Cria um cliente na empresa ativa. Exige `customer.create`; com limite acima de zero, também `customer.change_credit_limit`. */
export async function createCustomer(
	userId: string,
	input: CustomerInput,
): Promise<string | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const { can } = await grantsOf(tx, userId, companyId);
		if (!can.create) throw new PermissionDeniedError("customer.create");
		const data = cleanCustomer(input);
		if (Number(data.creditLimit) !== 0 && !can.changeCreditLimit) {
			throw new PermissionDeniedError("customer.change_credit_limit");
		}
		try {
			const [row] = await tx
				.insert(customers)
				.values({ ...data, companyId })
				.returning({ id: customers.id });
			return row.id;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

/**
 * Altera só o que foi enviado e de fato muda: campos comuns exigem `customer.edit`; o limite de crédito exige
 * `customer.change_credit_limit`. false se o cliente não existe.
 */
export async function updateCustomer(
	userId: string,
	customerId: string,
	patch: Partial<CustomerInput>,
): Promise<boolean | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const { can } = await grantsOf(tx, userId, companyId);
		// Antes de ler o cliente: quem não pode editar nada não descobre por 404/403 se ele existe.
		if (!can.edit && !can.changeCreditLimit) {
			throw new PermissionDeniedError("customer.edit");
		}
		const [current] = await tx
			.select({
				kind: customers.kind,
				name: customers.name,
				document: customers.document,
				phone: customers.phone,
				city: customers.city,
				state: customers.state,
				creditLimit: customers.creditLimit,
				status: customers.status,
			})
			.from(customers)
			.where(eq(customers.id, customerId));
		if (!current) return false;

		const next = cleanCustomer({ ...current, ...patch });
		const changed = (Object.keys(next) as (keyof CustomerInput)[]).filter(
			(key) => next[key] !== current[key],
		);
		if (changed.includes("creditLimit") && !can.changeCreditLimit) {
			throw new PermissionDeniedError("customer.change_credit_limit");
		}
		if (changed.some((key) => key !== "creditLimit") && !can.edit) {
			throw new PermissionDeniedError("customer.edit");
		}
		if (changed.length === 0) return true;
		try {
			await tx
				.update(customers)
				.set({ ...next, updatedAt: new Date() })
				.where(eq(customers.id, customerId));
			return true;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

/** Confere e limpa só os campos de veículo que vieram. */
function cleanVehicle(input: Partial<VehicleInput>): Partial<VehicleInput> {
	const clean: Partial<VehicleInput> = {};
	if (input.plate !== undefined) {
		clean.plate = normalizePlate(input.plate);
		if (!isValidPlate(clean.plate)) throw new InvalidCustomerError("plate");
	}
	if (input.model !== undefined) {
		clean.model = input.model.trim();
		if (clean.model.length < 1 || clean.model.length > 80) {
			throw new InvalidCustomerError("model");
		}
	}
	if (input.axles !== undefined) {
		if (!Number.isInteger(input.axles) || input.axles < 2 || input.axles > 9) {
			throw new InvalidCustomerError("axles");
		}
		clean.axles = input.axles;
	}
	if (input.year !== undefined) {
		if (
			input.year !== null &&
			(!Number.isInteger(input.year) || input.year < 1950 || input.year > 2100)
		) {
			throw new InvalidCustomerError("year");
		}
		clean.year = input.year;
	}
	return clean;
}

/** Cadastra um veículo no cliente. Exige `customer.create` ou `customer.edit`. null se o cliente não existe. */
export async function addVehicle(
	userId: string,
	customerId: string,
	input: VehicleInput,
): Promise<string | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const { can } = await grantsOf(tx, userId, companyId);
		if (!can.create && !can.edit) {
			throw new PermissionDeniedError("customer.create");
		}
		const data = { ...input, ...cleanVehicle(input) };
		const [customer] = await tx
			.select({ id: customers.id })
			.from(customers)
			.where(eq(customers.id, customerId));
		if (!customer) return null;
		try {
			const [row] = await tx
				.insert(vehicles)
				.values({ ...data, companyId, customerId })
				.returning({ id: vehicles.id });
			return row.id;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

/** Altera só o que foi enviado. Exige `customer.edit`. false se o veículo não existe. */
export async function updateVehicle(
	userId: string,
	vehicleId: string,
	patch: Partial<VehicleInput>,
): Promise<boolean | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const { can } = await grantsOf(tx, userId, companyId);
		if (!can.edit) throw new PermissionDeniedError("customer.edit");
		const data = cleanVehicle(patch);
		try {
			const updated = await tx
				.update(vehicles)
				.set({ ...data, updatedAt: new Date() })
				.where(eq(vehicles.id, vehicleId))
				.returning({ id: vehicles.id });
			return updated.length > 0;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}
