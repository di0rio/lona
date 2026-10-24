import type { Transaction } from "@/db/client";
import {
	acquirerFees,
	acquirers,
	type MethodKind,
	type Modality,
	paymentMethods,
	paymentTerms,
} from "./schema";

type Db = Pick<Transaction, "insert">;

// Datas fixas no passado: a demonstração mostra o histórico (taxa antiga e atual) sempre igual.
const oldFrom = "2025-01-01";
const currentFrom = "2026-03-01";

type Rates = {
	debit: string;
	credit: string;
	/** Parcelado lojista de 2x; cada parcela a mais soma `step`. */
	merchant2: string;
	step: string;
	/** Antecipação ao mês, só no crédito; null = sem antecipação. */
	anticipation: string | null;
};

// A Cielo antecipa sozinha: o dinheiro do crédito cai em D+1 com a taxa de antecipação (ao mês) descontada.
const acquirerSeeds: {
	name: string;
	old: Rates;
	current: Rates;
}[] = [
	{
		name: "Stone",
		old: {
			debit: "1.19",
			credit: "3.19",
			merchant2: "3.99",
			step: "0.30",
			anticipation: null,
		},
		current: {
			debit: "1.09",
			credit: "2.99",
			merchant2: "3.79",
			step: "0.28",
			anticipation: null,
		},
	},
	{
		name: "Cielo",
		old: {
			debit: "1.39",
			credit: "3.09",
			merchant2: "3.89",
			step: "0.30",
			anticipation: "1.90",
		},
		current: {
			debit: "1.29",
			credit: "2.89",
			merchant2: "3.69",
			step: "0.27",
			anticipation: "1.80",
		},
	},
];

const toCents = (pct: string) => Math.round(Number(pct) * 100);

function feeLines(rates: Rates) {
	const line = (
		modality: Modality,
		installments: number,
		feePct: string,
		daysToReceive: number,
	) => {
		const anticipationFeePct = modality === "debit" ? null : rates.anticipation;
		return {
			modality,
			installments,
			feePct,
			daysToReceive,
			anticipation: anticipationFeePct !== null,
			anticipationFeePct,
		};
	};
	return [
		line("debit", 1, rates.debit, 1),
		line("credit", 1, rates.credit, 30),
		// Parcelado emissor: a empresa recebe como no crédito à vista.
		line("issuer_installments", 1, rates.credit, 30),
		...Array.from({ length: 11 }, (_, i) =>
			line(
				"merchant_installments",
				i + 2,
				((toCents(rates.merchant2) + i * toCents(rates.step)) / 100).toFixed(2),
				30,
			),
		),
	];
}

/**
 * Parte do modelo que pertence ao payments: operadoras Stone e Cielo com taxas (uma vigência antiga e uma atual),
 * as formas de pagamento e as condições da "Freios Rodovia". Roda depois do access, que cria a empresa.
 */
export async function seedPaymentsTemplate(db: Db, companyId: string) {
	const acquirerIds = new Map<string, string>();
	for (const seed of acquirerSeeds) {
		const [acquirer] = await db
			.insert(acquirers)
			.values({ companyId, name: seed.name })
			.returning({ id: acquirers.id });
		acquirerIds.set(seed.name, acquirer.id);
		await db.insert(acquirerFees).values(
			[
				{ rates: seed.old, validFrom: oldFrom },
				{ rates: seed.current, validFrom: currentFrom },
			].flatMap(({ rates, validFrom }) =>
				feeLines(rates).map((fee) => ({
					...fee,
					companyId,
					acquirerId: acquirer.id,
					validFrom,
				})),
			),
		);
	}

	const methodSeeds: { name: string; kind: MethodKind; acquirer?: string }[] = [
		{ name: "Dinheiro", kind: "cash" },
		{ name: "Pix", kind: "pix" },
		{ name: "Débito Stone", kind: "debit_card", acquirer: "Stone" },
		{ name: "Crédito Stone", kind: "credit_card", acquirer: "Stone" },
		{ name: "Débito Cielo", kind: "debit_card", acquirer: "Cielo" },
		{ name: "Crédito Cielo", kind: "credit_card", acquirer: "Cielo" },
		{ name: "Boleto", kind: "bank_slip" },
		{ name: "Faturado", kind: "on_account" },
	];
	const methods = await db
		.insert(paymentMethods)
		.values(
			methodSeeds.map((m) => ({
				companyId,
				name: m.name,
				kind: m.kind,
				acquirerId: m.acquirer ? acquirerIds.get(m.acquirer) : null,
			})),
		)
		.returning({ id: paymentMethods.id, name: paymentMethods.name });
	const methodId = (name: string) => {
		const found = methods.find((m) => m.name === name);
		if (!found) throw new Error(`forma ${name} não semeada`);
		return found.id;
	};

	await db.insert(paymentTerms).values(
		[
			{ name: "À vista em dinheiro", method: "Dinheiro", days: [0] },
			{ name: "Pix", method: "Pix", days: [0] },
			{ name: "Débito", method: "Débito Stone", days: [0] },
			{ name: "Crédito à vista", method: "Crédito Stone", days: [0] },
			{
				name: "Cartão 3x sem juros",
				method: "Crédito Stone",
				days: [0, 30, 60],
			},
			{
				name: "Cartão 6x sem juros",
				method: "Crédito Cielo",
				days: [0, 30, 60, 90, 120, 150],
			},
			{
				name: "Cartão 6x emissor",
				method: "Crédito Stone",
				days: [30, 60, 90, 120, 150, 180],
				issuer: true,
			},
			{ name: "Boleto 28 dias", method: "Boleto", days: [28] },
			{ name: "Faturado 30/60/90", method: "Faturado", days: [30, 60, 90] },
			{ name: "Entrada + 30/60", method: "Faturado", days: [0, 30, 60] },
		].map((t) => ({
			companyId,
			name: t.name,
			paymentMethodId: methodId(t.method),
			installmentDays: t.days,
			issuerInstallments: t.issuer ?? false,
		})),
	);
}
