import { describe, expect, test } from "vitest";
import {
	type Fee,
	NoFeeInForceError,
	type ScheduleInput,
	scheduleInstallments,
} from "./installments";

const fee = (over: Partial<Fee>): Fee => ({
	modality: "credit",
	installments: 1,
	feePct: "3.00",
	daysToReceive: 30,
	anticipation: false,
	anticipationFeePct: null,
	validFrom: "2026-01-01",
	...over,
});

const schedule = (over: Partial<ScheduleInput>) =>
	scheduleInstallments({
		amountCents: 10000,
		saleDate: "2026-03-10",
		kind: "credit_card",
		installmentDays: [0],
		issuerInstallments: false,
		fees: [],
		...over,
	});

describe("scheduleInstallments without card", () => {
	test("cash in full is received on the sale date with no fee", () => {
		const { installments, totals } = schedule({
			kind: "cash",
			installmentDays: [0],
		});
		expect(installments).toEqual([
			{
				number: 1,
				dueDate: "2026-03-10",
				receiveDate: "2026-03-10",
				grossCents: 10000,
				feeCents: 0,
				anticipationCents: 0,
				netCents: 10000,
			},
		]);
		expect(totals.netCents).toBe(10000);
	});

	test("bank slip 30/60/90 splits the amount and adds the days", () => {
		const { installments, totals } = schedule({
			kind: "bank_slip",
			installmentDays: [30, 60, 90],
		});
		expect(installments.map((p) => p.dueDate)).toEqual([
			"2026-04-09",
			"2026-05-09",
			"2026-06-08",
		]);
		expect(installments.map((p) => p.receiveDate)).toEqual(
			installments.map((p) => p.dueDate),
		);
		expect(installments.map((p) => p.grossCents)).toEqual([3334, 3333, 3333]);
		expect(totals.grossCents).toBe(10000);
	});
});

describe("scheduleInstallments with card", () => {
	test("debit receives the whole amount once, minus the fee", () => {
		const { installments } = schedule({
			kind: "debit_card",
			fees: [fee({ modality: "debit", feePct: "1.10", daysToReceive: 1 })],
		});
		expect(installments).toHaveLength(1);
		expect(installments[0]).toMatchObject({
			dueDate: "2026-03-11",
			receiveDate: "2026-03-11",
			feeCents: 110,
			netCents: 9890,
		});
	});

	test("merchant installments: installment n arrives n x days later with the fee of n", () => {
		const { installments, totals } = schedule({
			installmentDays: [0, 0, 0],
			fees: [
				fee({ modality: "merchant_installments", installments: 2 }),
				fee({
					modality: "merchant_installments",
					installments: 3,
					feePct: "4.50",
				}),
			],
		});
		expect(installments.map((p) => p.grossCents)).toEqual([3334, 3333, 3333]);
		expect(installments.map((p) => p.receiveDate)).toEqual([
			"2026-04-09",
			"2026-05-09",
			"2026-06-08",
		]);
		// half-up por parcela: 3334 x 4,5% = 150,03 -> 150; 3333 x 4,5% = 149,985 -> 150
		expect(installments.map((p) => p.feeCents)).toEqual([150, 150, 150]);
		expect(totals.grossCents).toBe(10000);
	});

	test("issuer installments: company receives everything at once with the issuer fee", () => {
		const { installments } = schedule({
			installmentDays: [0, 0, 0],
			issuerInstallments: true,
			fees: [
				fee({ modality: "credit" }),
				fee({ modality: "issuer_installments", feePct: "3.20" }),
			],
		});
		expect(installments).toHaveLength(1);
		expect(installments[0]).toMatchObject({
			receiveDate: "2026-04-09",
			grossCents: 10000,
			feeCents: 320,
		});
	});

	test("fee uses the latest validFrom on or before the sale date", () => {
		const fees = [
			fee({ feePct: "2.00", validFrom: "2025-01-01" }),
			fee({ feePct: "3.00", validFrom: "2026-03-10" }),
			fee({ feePct: "9.00", validFrom: "2026-03-11" }),
		];
		expect(schedule({ fees }).installments[0].feeCents).toBe(300);
		expect(
			schedule({ fees, saleDate: "2026-03-09" }).installments[0].feeCents,
		).toBe(200);
	});

	test("throws when no fee is in force", () => {
		expect(() =>
			schedule({ fees: [fee({ validFrom: "2026-03-11" })] }),
		).toThrow(NoFeeInForceError);
		expect(() => schedule({ fees: [fee({ installments: 2 })] })).toThrow(
			NoFeeInForceError,
		);
	});

	test("anticipation receives on D+1 and charges the monthly rate on the days advanced", () => {
		const { installments, totals } = schedule({
			fees: [
				fee({
					feePct: "2.00",
					anticipation: true,
					anticipationFeePct: "1.80",
				}),
			],
		});
		// líquido da taxa 9800; 9800 x 1,8% x 29/30 = 170,52 -> 171
		expect(installments[0]).toMatchObject({
			dueDate: "2026-04-09",
			receiveDate: "2026-03-11",
			feeCents: 200,
			anticipationCents: 171,
			netCents: 9629,
		});
		expect(totals.netCents).toBe(9629);
	});

	test("anticipation does not charge when the money already arrives by D+1", () => {
		const { installments } = schedule({
			kind: "debit_card",
			fees: [
				fee({
					modality: "debit",
					daysToReceive: 1,
					anticipation: true,
					anticipationFeePct: "1.80",
				}),
			],
		});
		expect(installments[0].anticipationCents).toBe(0);
		expect(installments[0].receiveDate).toBe("2026-03-11");
	});

	test("refuses input that would make the sale amount vanish", () => {
		expect(() => schedule({ installmentDays: [] })).toThrow();
		expect(() => schedule({ amountCents: 100.5 })).toThrow();
		expect(() => schedule({ amountCents: -1 })).toThrow();
	});
});
