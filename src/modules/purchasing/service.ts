import { asc, eq } from "drizzle-orm";
import {
	hasPermission,
	inActiveCompany,
	isValidCnpj,
	PermissionDeniedError,
} from "@/modules/access";
import { suppliers } from "./schema";

export type SupplierInput = {
	legalName: string;
	/** 14 caracteres (letras maiúsculas e dígitos), sem máscara. */
	cnpj: string;
	contactName: string | null;
	/** Só dígitos, com DDD. */
	phone: string | null;
	city: string;
	/** UF. */
	state: string;
};

export type SupplierRow = SupplierInput & { id: string; active: boolean };

export type SuppliersView = { suppliers: SupplierRow[]; canManage: boolean };

/** CNPJ já cadastrado na empresa; o banco garante (unique), aqui só traduzimos. */
export class DuplicateSupplierCnpjError extends Error {
	constructor() {
		super("Já existe fornecedor com esse CNPJ.");
	}
}

/** CNPJ com formato ou dígitos verificadores errados. */
export class InvalidCnpjError extends Error {
	constructor() {
		super("CNPJ inválido.");
	}
}

function translateDuplicate(error: unknown): never {
	const cause = (error as { cause?: unknown }).cause ?? error;
	const { code, constraint } = cause as { code?: string; constraint?: string };
	if (code === "23505" && constraint === "suppliers_company_id_cnpj_unq") {
		throw new DuplicateSupplierCnpjError();
	}
	throw error;
}

const columns = (input: SupplierInput) => {
	if (!isValidCnpj(input.cnpj)) throw new InvalidCnpjError();
	return {
		legalName: input.legalName.trim(),
		cnpj: input.cnpj,
		contactName: input.contactName?.trim() || null,
		phone: input.phone || null,
		city: input.city.trim(),
		state: input.state,
	};
};

/** Fornecedores da empresa ativa, por razão social. Exige `purchasing.view`. */
export async function listSuppliers(
	userId: string,
): Promise<SuppliersView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "purchasing.view"))) {
			throw new PermissionDeniedError("purchasing.view");
		}
		const rows = await tx
			.select()
			.from(suppliers)
			.orderBy(asc(suppliers.legalName));
		return {
			suppliers: rows.map((s) => ({
				id: s.id,
				legalName: s.legalName,
				cnpj: s.cnpj,
				contactName: s.contactName,
				phone: s.phone,
				city: s.city,
				state: s.state,
				active: s.active,
			})),
			canManage: await hasPermission(
				tx,
				userId,
				companyId,
				"purchasing.manage_suppliers",
			),
		};
	});
}

/** Cadastra um fornecedor. Exige `purchasing.manage_suppliers`. Devolve o id; null se não há empresa ativa. */
export async function createSupplier(
	userId: string,
	input: SupplierInput,
): Promise<string | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (
			!(await hasPermission(
				tx,
				userId,
				companyId,
				"purchasing.manage_suppliers",
			))
		) {
			throw new PermissionDeniedError("purchasing.manage_suppliers");
		}
		try {
			const [supplier] = await tx
				.insert(suppliers)
				.values({ companyId, ...columns(input) })
				.returning({ id: suppliers.id });
			return supplier.id;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

/** Troca os dados do fornecedor. Exige `purchasing.manage_suppliers`. Devolve false se ele não existe (ou é de outra empresa). */
export async function updateSupplier(
	userId: string,
	supplierId: string,
	input: SupplierInput,
): Promise<boolean | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (
			!(await hasPermission(
				tx,
				userId,
				companyId,
				"purchasing.manage_suppliers",
			))
		) {
			throw new PermissionDeniedError("purchasing.manage_suppliers");
		}
		try {
			const updated = await tx
				.update(suppliers)
				.set(columns(input))
				.where(eq(suppliers.id, supplierId))
				.returning({ id: suppliers.id });
			return updated.length > 0;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

/** Fornecedor com histórico só se inativa, nunca se apaga. Exige `purchasing.manage_suppliers`. */
export async function setSupplierActive(
	userId: string,
	supplierId: string,
	active: boolean,
): Promise<boolean | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (
			!(await hasPermission(
				tx,
				userId,
				companyId,
				"purchasing.manage_suppliers",
			))
		) {
			throw new PermissionDeniedError("purchasing.manage_suppliers");
		}
		const updated = await tx
			.update(suppliers)
			.set({ active })
			.where(eq(suppliers.id, supplierId))
			.returning({ id: suppliers.id });
		return updated.length > 0;
	});
}
