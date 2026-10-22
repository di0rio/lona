import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	createCompany,
	createMembership,
	PermissionDeniedError,
} from "@/modules/access";
import {
	asApp,
	connectAsApp,
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import {
	addAcquirer,
	addFee,
	addMethod,
	addTerm,
	DuplicatePaymentError,
	type FeeInput,
	InvalidPaymentError,
	paymentsView,
	removeFee,
	updateAcquirer,
	updateFee,
	updateMethod,
	updateTerm,
} from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

describe.skipIf(!hasDatabase)("payments", () => {
	let owner: pg.Pool;
	let appPool: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let companyA: string;
	let companyB: string;
	let ownerA: string;
	let ownerB: string;
	let finance: string; // financeiro de A: gerencia pagamentos
	let clerk: string; // balconista de A: só consulta
	let outsider: string; // sem vínculo

	beforeAll(async () => {
		owner = connectAsOwner();
		appPool = connectAsApp();
		const db = drizzleAsOwner(owner);
		const newUser = async (nickname: string) => {
			const id = await createTestUser(owner, nickname);
			userIds.push(id);
			return id;
		};
		const newCompany = async (name: string) => {
			const company = await createCompany(db, {
				name,
				cnpjRoot: "11222333",
				expiresAt: TWO_HOURS_FROM_NOW(),
			});
			companyIds.push(company.companyId);
			return company;
		};
		const a = await newCompany("Empresa A");
		const b = await newCompany("Empresa B");
		companyA = a.companyId;
		companyB = b.companyId;
		ownerA = await newUser("dono-a");
		ownerB = await newUser("dono-b");
		finance = await newUser("financeiro-a");
		clerk = await newUser("balconista-a");
		outsider = await newUser("sem-vinculo");
		for (const [company, userId, role] of [
			[a, ownerA, "dono"],
			[b, ownerB, "dono"],
			[a, finance, "financeiro"],
			[a, clerk, "balconista"],
		] as const) {
			await createMembership(db, {
				companyId: company.companyId,
				userId,
				branchId: null,
				roleId: company.roleIds[role],
				level: "operate",
			});
		}
	});

	afterAll(async () => {
		if (companyIds.length) {
			await owner.query("DELETE FROM companies WHERE id = ANY($1)", [
				companyIds,
			]);
		}
		if (userIds.length) {
			await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		}
		await Promise.all([owner.end(), appPool.end()]);
	});

	const fee = (
		acquirerId: string,
		patch: Partial<FeeInput> = {},
	): FeeInput => ({
		acquirerId,
		modality: "credit",
		installments: 1,
		feePct: "2.99",
		daysToReceive: 30,
		anticipationFeePct: null,
		validFrom: "2026-01-01",
		...patch,
	});

	const view = async (userId: string) => {
		const found = await paymentsView(userId);
		if (!found) throw new Error("sem empresa ativa");
		return found;
	};

	test("the owner manages acquirers, fees, methods and terms", async () => {
		const acquirerId = await addAcquirer(ownerA, { name: " Stone " });
		expect(acquirerId).toBeTruthy();
		const id = acquirerId as string;
		await addFee(ownerA, fee(id));
		await addFee(
			ownerA,
			fee(id, {
				validFrom: "2026-06-01",
				feePct: "2.79",
				anticipationFeePct: "1.80",
			}),
		);
		const creditId = (await addMethod(ownerA, {
			name: "Crédito Stone",
			kind: "credit_card",
			acquirerId: id,
		})) as string;
		const cashId = (await addMethod(ownerA, {
			name: "Dinheiro",
			kind: "cash",
			acquirerId: null,
		})) as string;
		await addTerm(ownerA, {
			name: "Cartão 3x",
			paymentMethodId: creditId,
			installmentDays: [0, 30, 60],
			issuerInstallments: false,
		});
		await addTerm(ownerA, {
			name: "À vista",
			paymentMethodId: cashId,
			installmentDays: [0],
			issuerInstallments: false,
		});

		const found = await view(ownerA);
		expect(found.canManage).toBe(true);
		expect(found.acquirers).toHaveLength(1);
		expect(found.acquirers[0]).toMatchObject({ name: "Stone", active: true });
		expect(
			found.acquirers[0].fees.map((f) => [
				f.validFrom,
				f.feePct,
				f.anticipationFeePct,
			]),
		).toEqual([
			["2026-01-01", "2.99", null],
			["2026-06-01", "2.79", "1.80"],
		]);
		expect(found.acquirers[0].fees[1].anticipation).toBe(true);
		expect(found.methods.map((m) => m.name).sort()).toEqual([
			"Crédito Stone",
			"Dinheiro",
		]);
		expect(
			found.terms.find((t) => t.name === "Cartão 3x")?.installmentDays,
		).toEqual([0, 30, 60]);

		// Edição e inativação (sem apagar o que está em uso).
		expect(await updateAcquirer(ownerA, id, { name: "Stone Pagamentos" })).toBe(
			true,
		);
		const [first] = found.acquirers[0].fees;
		expect(
			await updateFee(ownerA, first.id, {
				feePct: "3.10",
				anticipationFeePct: "1.50",
			}),
		).toBe(true);
		expect(
			await updateFee(ownerA, first.id, { anticipationFeePct: null }),
		).toBe(true);
		expect(await updateMethod(ownerA, cashId, { active: false })).toBe(true);
		const after = await view(ownerA);
		expect(after.acquirers[0]).toMatchObject({ name: "Stone Pagamentos" });
		expect(after.acquirers[0].fees[0]).toMatchObject({
			feePct: "3.10",
			anticipation: false,
			anticipationFeePct: null,
		});
		expect(after.methods.find((m) => m.id === cashId)?.active).toBe(false);

		// Forma inativa não entra em condição nova.
		await expect(
			addTerm(ownerA, {
				name: "Dinheiro 2",
				paymentMethodId: cashId,
				installmentDays: [0],
				issuerInstallments: false,
			}),
		).rejects.toBeInstanceOf(InvalidPaymentError);

		const term = after.terms.find((t) => t.name === "Cartão 3x");
		expect(
			await updateTerm(ownerA, term?.id as string, {
				issuerInstallments: true,
			}),
		).toBe(true);
		expect(await removeFee(ownerA, after.acquirers[0].fees[1].id)).toBe(true);
		expect((await view(ownerA)).acquirers[0].fees).toHaveLength(1);
		expect(
			await updateAcquirer(ownerA, crypto.randomUUID(), { active: false }),
		).toBe(false);
	});

	test("the finance role manages; the clerk can read but not manage", async () => {
		expect((await view(finance)).canManage).toBe(true);
		expect(await addAcquirer(finance, { name: "Cielo" })).toBeTruthy();

		const seen = await view(clerk);
		expect(seen.canManage).toBe(false);
		expect(seen.acquirers.map((a) => a.name)).toContain("Cielo");
		await expect(addAcquirer(clerk, { name: "Rede" })).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		await expect(removeFee(clerk, crypto.randomUUID())).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);

		expect(await paymentsView(outsider)).toBeNull();
		expect(await addAcquirer(outsider, { name: "Rede" })).toBeNull();
	});

	test("translates duplicates and rejects invalid combinations", async () => {
		const acquirers = (await view(ownerA)).acquirers;
		const stone = acquirers.find((a) => a.name === "Stone Pagamentos");
		const duplicateName = await addAcquirer(ownerA, { name: "Cielo" }).catch(
			(e) => e,
		);
		expect(duplicateName).toBeInstanceOf(DuplicatePaymentError);
		expect(duplicateName.field).toBe("name");
		const duplicateFee = await addFee(ownerA, fee(stone?.id as string)).catch(
			(e) => e,
		);
		expect(duplicateFee).toBeInstanceOf(DuplicatePaymentError);
		expect(duplicateFee.field).toBe("validFrom");

		const cielo = acquirers.find((a) => a.name === "Cielo")?.id as string;
		await expect(
			addFee(
				ownerA,
				fee(cielo, { modality: "merchant_installments", installments: 1 }),
			),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		await expect(
			addFee(ownerA, fee(cielo, { installments: 3 })),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		// Passa no formato da rota, mas não existe: sem a conferência viraria erro 500 do Postgres.
		await expect(
			addFee(ownerA, fee(cielo, { validFrom: "2026-02-30" })),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		// Cartão sem operadora, e dinheiro com operadora.
		await expect(
			addMethod(ownerA, {
				name: "Débito X",
				kind: "debit_card",
				acquirerId: null,
			}),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		await expect(
			addMethod(ownerA, {
				name: "Dinheiro X",
				kind: "cash",
				acquirerId: cielo,
			}),
		).rejects.toBeInstanceOf(InvalidPaymentError);

		const debit = (await addMethod(ownerA, {
			name: "Débito Cielo",
			kind: "debit_card",
			acquirerId: cielo,
		})) as string;
		const credit = (await addMethod(ownerA, {
			name: "Crédito Cielo",
			kind: "credit_card",
			acquirerId: cielo,
		})) as string;
		const base = { name: "T", installmentDays: [0], issuerInstallments: false };
		await expect(
			addTerm(ownerA, {
				...base,
				paymentMethodId: debit,
				installmentDays: [0, 30],
			}),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		await expect(
			addTerm(ownerA, {
				...base,
				paymentMethodId: credit,
				installmentDays: [30, 0],
			}),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		await expect(
			addTerm(ownerA, {
				...base,
				paymentMethodId: credit,
				installmentDays: [0],
				issuerInstallments: true,
			}),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		await expect(
			addTerm(ownerA, {
				...base,
				paymentMethodId: credit,
				installmentDays: Array.from({ length: 13 }, (_, i) => i * 30),
			}),
		).rejects.toBeInstanceOf(InvalidPaymentError);
		expect(
			await addTerm(ownerA, {
				...base,
				name: "Emissor 6x",
				paymentMethodId: credit,
				installmentDays: [0, 30, 60, 90, 120, 150],
				issuerInstallments: true,
			}),
		).toBeTruthy();
	});

	test("RLS isolates the four tables between companies", async () => {
		const acquirerA = (await view(ownerA)).acquirers[0].id;
		await addAcquirer(ownerB, { name: "Stone" }); // mesmo nome noutra empresa: permitido
		const viewB = await view(ownerB);
		expect(viewB.acquirers).toHaveLength(1);
		expect(viewB.methods).toHaveLength(0);

		for (const table of [
			"acquirers",
			"acquirer_fees",
			"payment_methods",
			"payment_terms",
		]) {
			const seenByB = await asApp(
				appPool,
				{ userId: ownerB, companyId: companyB },
				async (c) =>
					(await c.query(`SELECT company_id FROM ${table}`)).rows.map(
						(r) => r.company_id,
					),
			);
			expect(
				seenByB.every((id) => id === companyB),
				table,
			).toBe(true);
			const seenWithoutCompany = await asApp(
				appPool,
				{ userId: outsider },
				async (c) => (await c.query(`SELECT 1 FROM ${table}`)).rowCount,
			);
			expect(seenWithoutCompany, table).toBe(0);
		}

		// B não grava nem aponta para dados de A.
		await expect(
			asApp(appPool, { userId: ownerB, companyId: companyB }, (c) =>
				c.query(
					"INSERT INTO acquirers (company_id, name) VALUES ($1, 'Invasora')",
					[companyA],
				),
			),
		).rejects.toThrow();
		await expect(
			asApp(appPool, { userId: ownerB, companyId: companyB }, (c) =>
				c.query(
					"INSERT INTO payment_methods (company_id, name, kind, acquirer_id) VALUES ($1, 'Cartão', 'debit_card', $2)",
					[companyB, acquirerA],
				),
			),
		).rejects.toThrow();
	});

	test("the database rejects invalid rows even without the service", async () => {
		const acquirerId = (await view(ownerA)).acquirers[0].id;
		const insertFee = (
			modality: string,
			installments: number,
			pct = "2.00",
			anticipation: string | null = null,
			anticipationFlag = anticipation !== null,
		) =>
			owner.query(
				`INSERT INTO acquirer_fees (company_id, acquirer_id, modality, installments, fee_pct, days_to_receive, anticipation, anticipation_fee_pct, valid_from)
				VALUES ($1, $2, $3, $4, $5, 1, $6, $7, '2020-01-01')`,
				[
					companyA,
					acquirerId,
					modality,
					installments,
					pct,
					anticipationFlag,
					anticipation,
				],
			);
		await expect(insertFee("merchant_installments", 13)).rejects.toThrow(
			/acquirer_fees_installments_valid/,
		);
		await expect(insertFee("merchant_installments", 1)).rejects.toThrow(
			/acquirer_fees_installments_valid/,
		);
		await expect(insertFee("debit", 2)).rejects.toThrow(
			/acquirer_fees_installments_valid/,
		);
		await expect(insertFee("pix", 1)).rejects.toThrow(
			/acquirer_fees_modality_valid/,
		);
		await expect(insertFee("debit", 1, "100.00")).rejects.toThrow(
			/acquirer_fees_fee_pct_range/,
		);
		await expect(insertFee("debit", 1, "2.00", "1.50", false)).rejects.toThrow(
			/acquirer_fees_anticipation_pct/,
		);
		await expect(insertFee("debit", 1, "2.00", null, true)).rejects.toThrow(
			/acquirer_fees_anticipation_pct/,
		);

		const insertMethod = (
			name: string,
			kind: string,
			acquirer: string | null,
		) =>
			owner.query(
				"INSERT INTO payment_methods (company_id, name, kind, acquirer_id) VALUES ($1, $2, $3, $4)",
				[companyA, name, kind, acquirer],
			);
		await expect(insertMethod("c1", "credit_card", null)).rejects.toThrow(
			/payment_methods_card_has_acquirer/,
		);
		await expect(insertMethod("c2", "cash", acquirerId)).rejects.toThrow(
			/payment_methods_card_has_acquirer/,
		);
		await expect(insertMethod("c3", "voucher", null)).rejects.toThrow(
			/payment_methods_kind_valid/,
		);

		// Operadora em uso por uma forma não pode ser apagada.
		await expect(
			owner.query("DELETE FROM acquirers WHERE company_id = $1 AND id = $2", [
				companyA,
				acquirerId,
			]),
		).rejects.toThrow(/payment_methods/);

		const methodId = (await view(ownerA)).methods[0].id;
		const insertTerm = (days: string) =>
			owner.query(
				"INSERT INTO payment_terms (company_id, name, payment_method_id, installment_days) VALUES ($1, 'x', $2, $3::smallint[])",
				[companyA, methodId, days],
			);
		await expect(insertTerm("{}")).rejects.toThrow(
			/payment_terms_installments_count/,
		);
		await expect(insertTerm("{0,1,2,3,4,5,6,7,8,9,10,11,12}")).rejects.toThrow(
			/payment_terms_installments_count/,
		);
		await expect(insertTerm("{-1}")).rejects.toThrow(
			/payment_terms_first_day_not_negative/,
		);
	});

	test("the demo template carries payment data", async () => {
		const { rows } = await owner.query<{ table: string; total: number }>(
			`SELECT 'acquirers' AS table, count(*)::int AS total FROM acquirers WHERE company_id = lona_template_id()
			UNION ALL SELECT 'acquirer_fees', count(*)::int FROM acquirer_fees WHERE company_id = lona_template_id()
			UNION ALL SELECT 'payment_methods', count(*)::int FROM payment_methods WHERE company_id = lona_template_id()
			UNION ALL SELECT 'payment_terms', count(*)::int FROM payment_terms WHERE company_id = lona_template_id()`,
		);
		expect(Object.fromEntries(rows.map((r) => [r.table, r.total]))).toEqual({
			acquirers: 2,
			acquirer_fees: 2 * 2 * 14,
			payment_methods: 8,
			payment_terms: 9,
		});
	});
});
