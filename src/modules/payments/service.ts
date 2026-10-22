import { and, asc, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
	hasPermission,
	inActiveCompany,
	PermissionDeniedError,
} from "@/modules/access";
import {
	acquirerFees,
	acquirers,
	type MethodKind,
	type Modality,
	paymentMethods,
	paymentTerms,
} from "./schema";

export type { MethodKind, Modality };

// Percentuais trafegam como texto decimal com até 2 casas ("2.79"), o mesmo formato do numeric do banco.
export type AcquirerFeeRow = {
	id: string;
	acquirerId: string;
	modality: Modality;
	installments: number;
	feePct: string;
	daysToReceive: number;
	anticipation: boolean;
	anticipationFeePct: string | null;
	/** YYYY-MM-DD */
	validFrom: string;
};

export type AcquirerRow = {
	id: string;
	name: string;
	active: boolean;
	fees: AcquirerFeeRow[];
};

export type PaymentMethodRow = {
	id: string;
	name: string;
	kind: MethodKind;
	acquirerId: string | null;
	active: boolean;
};

export type PaymentTermRow = {
	id: string;
	name: string;
	paymentMethodId: string;
	installmentDays: number[];
	issuerInstallments: boolean;
	active: boolean;
};

export type PaymentsView = {
	acquirers: AcquirerRow[];
	methods: PaymentMethodRow[];
	terms: PaymentTermRow[];
	/** Quem não tem `payment_methods.manage` só consulta. */
	canManage: boolean;
};

/** Formas, operadoras (com as taxas), condições e se o usuário pode mudá-las; null se ele não tem empresa ativa. */
export async function paymentsView(
	userId: string,
): Promise<PaymentsView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const acquirerRows = await tx
			.select()
			.from(acquirers)
			.orderBy(asc(acquirers.name));
		const feeRows = await tx
			.select()
			.from(acquirerFees)
			.orderBy(
				asc(acquirerFees.modality),
				asc(acquirerFees.installments),
				asc(acquirerFees.validFrom),
			);
		const methodRows = await tx
			.select()
			.from(paymentMethods)
			.orderBy(asc(paymentMethods.name));
		const termRows = await tx
			.select()
			.from(paymentTerms)
			.orderBy(asc(paymentTerms.name));
		return {
			acquirers: acquirerRows.map((a) => ({
				id: a.id,
				name: a.name,
				active: a.active,
				fees: feeRows
					.filter((f) => f.acquirerId === a.id)
					.map((f) => ({
						id: f.id,
						acquirerId: f.acquirerId,
						modality: f.modality,
						installments: f.installments,
						feePct: f.feePct,
						daysToReceive: f.daysToReceive,
						anticipation: f.anticipation,
						anticipationFeePct: f.anticipationFeePct,
						validFrom: f.validFrom,
					})),
			})),
			methods: methodRows.map((m) => ({
				id: m.id,
				name: m.name,
				kind: m.kind,
				acquirerId: m.acquirerId,
				active: m.active,
			})),
			terms: termRows.map((t) => ({
				id: t.id,
				name: t.name,
				paymentMethodId: t.paymentMethodId,
				installmentDays: t.installmentDays,
				issuerInstallments: t.issuerInstallments,
				active: t.active,
			})),
			canManage: await hasPermission(
				tx,
				userId,
				companyId,
				"payment_methods.manage",
			),
		};
	});
}

/** Já existe item com esse nome (ou taxa com essa vigência); o banco garante (unique), aqui só traduzimos. */
export class DuplicatePaymentError extends Error {
	constructor(readonly field: "name" | "validFrom") {
		super(
			field === "name"
				? "Já existe um item com esse nome."
				: "Já existe uma taxa dessa modalidade e parcelas com essa vigência.",
		);
	}
}

/** Os dados enviados quebram uma regra de pagamento; a rota converte em 422. */
export class InvalidPaymentError extends Error {}

// Um PATCH sem nenhum campo viraria UPDATE sem SET e estouraria como erro 500.
function assertPatchNotEmpty(patch: object) {
	if (Object.values(patch).every((value) => value === undefined)) {
		throw new InvalidPaymentError("Nada para alterar.");
	}
}

const duplicateField: Record<string, "name" | "validFrom"> = {
	acquirers_company_id_name_unq: "name",
	payment_methods_company_id_name_unq: "name",
	payment_terms_company_id_name_unq: "name",
	acquirer_fees_validity_unq: "validFrom",
};

/** Traduz a violação de unicidade do Postgres (23505); qualquer outro erro segue como está. */
function translateDuplicate(error: unknown): never {
	const cause = (error as { cause?: unknown }).cause ?? error;
	const { code, constraint } = cause as { code?: string; constraint?: string };
	if (code === "23505" && constraint && constraint in duplicateField) {
		throw new DuplicatePaymentError(duplicateField[constraint]);
	}
	throw error;
}

/** Roda `fn` na empresa ativa exigindo `payment_methods.manage`; null se o usuário não tem empresa ativa. */
function asManager<T>(
	userId: string,
	fn: (tx: Transaction, companyId: string) => Promise<T>,
): Promise<T | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (
			!(await hasPermission(tx, userId, companyId, "payment_methods.manage"))
		) {
			throw new PermissionDeniedError("payment_methods.manage");
		}
		try {
			return await fn(tx, companyId);
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

const isCard = (kind: MethodKind) =>
	kind === "debit_card" || kind === "credit_card";

// Operadoras

export type AcquirerInput = { name: string };

/** Cria uma operadora na empresa ativa. Exige `payment_methods.manage`. */
export async function addAcquirer(userId: string, data: AcquirerInput) {
	return asManager(userId, async (tx, companyId) => {
		const [row] = await tx
			.insert(acquirers)
			.values({ companyId, name: data.name.trim() })
			.returning({ id: acquirers.id });
		return row.id;
	});
}

/** Altera só o que foi enviado. Exige `payment_methods.manage`. Devolve false se a operadora não existe. */
export async function updateAcquirer(
	userId: string,
	acquirerId: string,
	patch: Partial<AcquirerInput & { active: boolean }>,
) {
	return asManager(userId, async (tx) => {
		assertPatchNotEmpty(patch);
		const updated = await tx
			.update(acquirers)
			.set({ name: patch.name?.trim(), active: patch.active })
			.where(eq(acquirers.id, acquirerId))
			.returning({ id: acquirers.id });
		return updated.length > 0;
	});
}

// Taxas

export type FeeInput = {
	acquirerId: string;
	modality: Modality;
	installments: number;
	feePct: string;
	daysToReceive: number;
	/** null = sem antecipação. */
	anticipationFeePct: string | null;
	validFrom: string;
};

// A rota só confere o formato; 2026-02-30 passa por ele e o Postgres recusaria com erro 500.
function assertValidFrom(date: string | undefined) {
	if (date === undefined) return;
	const parsed = new Date(`${date}T00:00:00Z`);
	if (
		Number.isNaN(parsed.getTime()) ||
		parsed.getUTCFullYear() < 1 ||
		parsed.toISOString().slice(0, 10) !== date
	) {
		throw new InvalidPaymentError("Data de vigência inválida.");
	}
}

/** Cria uma taxa (uma nova vigência) da operadora. Exige `payment_methods.manage`. */
export async function addFee(userId: string, data: FeeInput) {
	return asManager(userId, async (tx, companyId) => {
		assertValidFrom(data.validFrom);
		const merchant = data.modality === "merchant_installments";
		const validCount = merchant
			? data.installments >= 2 && data.installments <= 12
			: data.installments === 1;
		if (!validCount) {
			throw new InvalidPaymentError(
				"Parcelado lojista vai de 2 a 12 parcelas; as outras modalidades têm 1.",
			);
		}
		const [acquirer] = await tx
			.select({ id: acquirers.id })
			.from(acquirers)
			.where(eq(acquirers.id, data.acquirerId));
		if (!acquirer) throw new InvalidPaymentError("Operadora não encontrada.");
		const [row] = await tx
			.insert(acquirerFees)
			.values({
				companyId,
				acquirerId: data.acquirerId,
				modality: data.modality,
				installments: data.installments,
				feePct: data.feePct,
				daysToReceive: data.daysToReceive,
				anticipation: data.anticipationFeePct !== null,
				anticipationFeePct: data.anticipationFeePct,
				validFrom: data.validFrom,
			})
			.returning({ id: acquirerFees.id });
		return row.id;
	});
}

/** Altera valores de uma taxa existente (modalidade e parcelas não mudam: crie outra). Devolve false se não existe. */
export async function updateFee(
	userId: string,
	feeId: string,
	patch: Partial<
		Pick<
			FeeInput,
			"feePct" | "daysToReceive" | "anticipationFeePct" | "validFrom"
		>
	>,
) {
	return asManager(userId, async (tx) => {
		assertPatchNotEmpty(patch);
		assertValidFrom(patch.validFrom);
		const updated = await tx
			.update(acquirerFees)
			.set({
				feePct: patch.feePct,
				daysToReceive: patch.daysToReceive,
				anticipation:
					patch.anticipationFeePct === undefined
						? undefined
						: patch.anticipationFeePct !== null,
				anticipationFeePct: patch.anticipationFeePct,
				validFrom: patch.validFrom,
			})
			.where(eq(acquirerFees.id, feeId))
			.returning({ id: acquirerFees.id });
		return updated.length > 0;
	});
}

/** Apaga uma taxa (o histórico de vigências é da empresa). Devolve false se não existe. */
export async function removeFee(userId: string, feeId: string) {
	return asManager(userId, async (tx) => {
		const removed = await tx
			.delete(acquirerFees)
			.where(eq(acquirerFees.id, feeId))
			.returning({ id: acquirerFees.id });
		return removed.length > 0;
	});
}

// Formas de pagamento

export type MethodInput = {
	name: string;
	kind: MethodKind;
	/** Obrigatória nas formas de cartão, proibida nas outras. */
	acquirerId: string | null;
};

/** Operadora precisa existir quando a forma é de cartão; nas outras formas não pode haver operadora. */
async function assertAcquirer(
	tx: Transaction,
	kind: MethodKind,
	acquirerId: string | null,
) {
	if (isCard(kind) !== (acquirerId !== null)) {
		throw new InvalidPaymentError(
			"Só formas de cartão têm operadora, e elas precisam de uma.",
		);
	}
	if (acquirerId === null) return;
	const [found] = await tx
		.select({ id: acquirers.id })
		.from(acquirers)
		.where(eq(acquirers.id, acquirerId));
	if (!found) throw new InvalidPaymentError("Operadora não encontrada.");
}

/** Cria uma forma de pagamento. Exige `payment_methods.manage`. */
export async function addMethod(userId: string, data: MethodInput) {
	return asManager(userId, async (tx, companyId) => {
		await assertAcquirer(tx, data.kind, data.acquirerId);
		const [row] = await tx
			.insert(paymentMethods)
			.values({
				companyId,
				name: data.name.trim(),
				kind: data.kind,
				acquirerId: data.acquirerId,
			})
			.returning({ id: paymentMethods.id });
		return row.id;
	});
}

/** Altera nome, operadora (só de cartão) ou ativa; o tipo não muda. Devolve false se a forma não existe. */
export async function updateMethod(
	userId: string,
	methodId: string,
	patch: Partial<{ name: string; acquirerId: string; active: boolean }>,
) {
	return asManager(userId, async (tx) => {
		assertPatchNotEmpty(patch);
		const [current] = await tx
			.select({ kind: paymentMethods.kind })
			.from(paymentMethods)
			.where(eq(paymentMethods.id, methodId));
		if (!current) return false;
		if (patch.acquirerId !== undefined) {
			await assertAcquirer(tx, current.kind, patch.acquirerId);
		}
		await tx
			.update(paymentMethods)
			.set({
				name: patch.name?.trim(),
				acquirerId: patch.acquirerId,
				active: patch.active,
			})
			.where(eq(paymentMethods.id, methodId));
		return true;
	});
}

// Condições de pagamento

export type TermInput = {
	name: string;
	paymentMethodId: string;
	installmentDays: number[];
	issuerInstallments: boolean;
};

/** Regras da condição em relação à forma: parcelas, ordem dos dias e parcelado emissor. */
function assertTerm(
	kind: MethodKind,
	days: number[],
	issuerInstallments: boolean,
) {
	if (days.length < 1 || days.length > 12) {
		throw new InvalidPaymentError("A condição tem de 1 a 12 parcelas.");
	}
	const badDays = days.some(
		(d, i) => !Number.isInteger(d) || d < 0 || (i > 0 && d < days[i - 1]),
	);
	if (badDays) {
		throw new InvalidPaymentError(
			"Os dias das parcelas não podem ser negativos nem diminuir.",
		);
	}
	if (kind === "debit_card" && days.length > 1) {
		throw new InvalidPaymentError("Débito é sempre em uma parcela.");
	}
	if (issuerInstallments && (kind !== "credit_card" || days.length < 2)) {
		throw new InvalidPaymentError(
			"Parcelado emissor só existe no crédito com mais de uma parcela.",
		);
	}
}

/** Cria uma condição de pagamento. Exige `payment_methods.manage`. A forma precisa existir e estar ativa. */
export async function addTerm(userId: string, data: TermInput) {
	return asManager(userId, async (tx, companyId) => {
		const [method] = await tx
			.select({ kind: paymentMethods.kind, active: paymentMethods.active })
			.from(paymentMethods)
			.where(eq(paymentMethods.id, data.paymentMethodId));
		if (!method) {
			throw new InvalidPaymentError("Forma de pagamento não encontrada.");
		}
		if (!method.active) {
			throw new InvalidPaymentError("Forma de pagamento inativa.");
		}
		assertTerm(method.kind, data.installmentDays, data.issuerInstallments);
		const [row] = await tx
			.insert(paymentTerms)
			.values({
				companyId,
				name: data.name.trim(),
				paymentMethodId: data.paymentMethodId,
				installmentDays: data.installmentDays,
				issuerInstallments: data.issuerInstallments,
			})
			.returning({ id: paymentTerms.id });
		return row.id;
	});
}

/** Altera só o que foi enviado; a forma da condição não muda. Devolve false se a condição não existe. */
export async function updateTerm(
	userId: string,
	termId: string,
	patch: Partial<Omit<TermInput, "paymentMethodId"> & { active: boolean }>,
) {
	return asManager(userId, async (tx) => {
		assertPatchNotEmpty(patch);
		const [current] = await tx
			.select({
				installmentDays: paymentTerms.installmentDays,
				issuerInstallments: paymentTerms.issuerInstallments,
				kind: paymentMethods.kind,
				methodActive: paymentMethods.active,
			})
			.from(paymentTerms)
			.innerJoin(
				paymentMethods,
				and(
					eq(paymentMethods.companyId, paymentTerms.companyId),
					eq(paymentMethods.id, paymentTerms.paymentMethodId),
				),
			)
			.where(eq(paymentTerms.id, termId));
		if (!current) return false;
		if (patch.active === true && !current.methodActive) {
			throw new InvalidPaymentError("Forma de pagamento inativa.");
		}
		assertTerm(
			current.kind,
			patch.installmentDays ?? current.installmentDays,
			patch.issuerInstallments ?? current.issuerInstallments,
		);
		await tx
			.update(paymentTerms)
			.set({
				name: patch.name?.trim(),
				installmentDays: patch.installmentDays,
				issuerInstallments: patch.issuerInstallments,
				active: patch.active,
			})
			.where(eq(paymentTerms.id, termId));
		return true;
	});
}
