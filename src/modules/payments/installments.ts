import type { MethodKind, Modality } from "./schema";

/** Uma linha de taxa da operadora (acquirer_fees). Porcentagens como string decimal: "2.79". */
export type Fee = {
	modality: Modality;
	installments: number;
	feePct: string;
	daysToReceive: number;
	anticipation: boolean;
	anticipationFeePct: string | null;
	validFrom: string; // YYYY-MM-DD
};

export type ScheduleInput = {
	amountCents: number;
	saleDate: string; // YYYY-MM-DD
	kind: MethodKind;
	/** Em cartão só a quantidade de parcelas conta: as datas de recebimento vêm da taxa da operadora. */
	installmentDays: number[];
	issuerInstallments: boolean;
	fees: Fee[];
};

export type Installment = {
	number: number;
	dueDate: string;
	receiveDate: string;
	grossCents: number;
	feeCents: number;
	anticipationCents: number;
	netCents: number;
};

export type Schedule = {
	installments: Installment[];
	totals: Pick<
		Installment,
		"grossCents" | "feeCents" | "anticipationCents" | "netCents"
	>;
};

/** Nenhuma taxa da operadora vale na data da venda para a modalidade e as parcelas pedidas. */
export class NoFeeInForceError extends Error {
	constructor(
		readonly modality: Modality,
		readonly installments: number,
		readonly saleDate: string,
	) {
		super(`No fee in force for ${modality}/${installments} on ${saleDate}`);
		this.name = "NoFeeInForceError";
	}
}

function addDays(date: string, days: number) {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

// "2.79" -> 279 (centésimos de ponto percentual), para o cálculo ficar em inteiros.
function hundredths(pct: string) {
	return Math.round(Number(pct) * 100);
}

// Divide em centavos inteiros: o resto vai 1 centavo para cada uma das primeiras parcelas.
function splitCents(total: number, parts: number) {
	const base = Math.floor(total / parts);
	const rest = total % parts;
	return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

// Arredonda meio para cima (half-up) numerador / denominador, só com inteiros.
function roundDiv(numerator: number, denominator: number) {
	return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

function modalityOf(
	kind: MethodKind,
	parts: number,
	issuerInstallments: boolean,
): Modality {
	if (kind === "debit_card") return "debit";
	if (parts === 1) return "credit";
	return issuerInstallments ? "issuer_installments" : "merchant_installments";
}

function feeInForce(
	fees: Fee[],
	modality: Modality,
	installments: number,
	saleDate: string,
) {
	// Datas ISO comparam como texto.
	const fee = fees
		.filter(
			(f) =>
				f.modality === modality &&
				f.installments === installments &&
				f.validFrom <= saleDate,
		)
		.sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
	if (!fee) throw new NoFeeInForceError(modality, installments, saleDate);
	return fee;
}

export function scheduleInstallments(input: ScheduleInput): Schedule {
	const { amountCents, saleDate, kind, installmentDays } = input;
	const parts = installmentDays.length;
	// O valor da venda nunca pode sumir em silêncio.
	if (parts < 1 || !Number.isInteger(amountCents) || amountCents < 0) {
		throw new Error("Invalid schedule input");
	}
	const isCard = kind === "debit_card" || kind === "credit_card";

	if (!isCard) {
		const gross = splitCents(amountCents, parts);
		return summarize(
			gross.map((grossCents, i) => {
				const date = addDays(saleDate, installmentDays[i]);
				return {
					number: i + 1,
					dueDate: date,
					receiveDate: date,
					grossCents,
					feeCents: 0,
					anticipationCents: 0,
					netCents: grossCents,
				};
			}),
		);
	}

	const modality = modalityOf(kind, parts, input.issuerInstallments);
	const merchant = modality === "merchant_installments";
	const fee = feeInForce(input.fees, modality, merchant ? parts : 1, saleDate);
	// Só o lojista recebe parcela a parcela; os demais recebem o valor todo de uma vez.
	const gross = merchant ? splitCents(amountCents, parts) : [amountCents];

	return summarize(
		gross.map((grossCents, i) => {
			const days = merchant ? (i + 1) * fee.daysToReceive : fee.daysToReceive;
			const dueDate = addDays(saleDate, days);
			const feeCents = roundDiv(grossCents * hundredths(fee.feePct), 10000);
			const afterFee = grossCents - feeCents;

			// Antecipação: recebe em D+1 e paga a taxa (a.m.) pelos dias que adiantou, em mês de 30 dias.
			let anticipationCents = 0;
			let receiveDate = dueDate;
			if (fee.anticipation && fee.anticipationFeePct !== null && days > 1) {
				receiveDate = addDays(saleDate, 1);
				anticipationCents = roundDiv(
					afterFee * hundredths(fee.anticipationFeePct) * (days - 1),
					10000 * 30,
				);
			}

			return {
				number: i + 1,
				dueDate,
				receiveDate,
				grossCents,
				feeCents,
				anticipationCents,
				netCents: afterFee - anticipationCents,
			};
		}),
	);
}

function summarize(installments: Installment[]): Schedule {
	const sum = (key: keyof Schedule["totals"]) =>
		installments.reduce((total, p) => total + p[key], 0);
	return {
		installments,
		totals: {
			grossCents: sum("grossCents"),
			feeCents: sum("feeCents"),
			anticipationCents: sum("anticipationCents"),
			netCents: sum("netCents"),
		},
	};
}
