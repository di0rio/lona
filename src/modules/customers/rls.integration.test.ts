import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { withCheckDigits } from "@/lib/document";
import { createCompany, createMembership } from "@/modules/access";
import {
	asApp,
	connectAsApp,
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

describe.skipIf(!hasDatabase)("RLS of the customers module", () => {
	let owner: pg.Pool;
	let appPool: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let a: string;
	let b: string;
	let ownerA: string;
	let ownerB: string;
	let customerB: string;

	beforeAll(async () => {
		owner = connectAsOwner();
		appPool = connectAsApp();
		const db = drizzleAsOwner(owner);
		const setup = async (name: string, nickname: string) => {
			const company = await createCompany(db, {
				name,
				cnpjRoot: "11222333",
				expiresAt: TWO_HOURS_FROM_NOW(),
			});
			companyIds.push(company.companyId);
			const userId = await createTestUser(owner, nickname);
			userIds.push(userId);
			await createMembership(db, {
				companyId: company.companyId,
				userId,
				branchId: null,
				roleId: company.roleIds.dono,
				level: "operate",
			});
			return { companyId: company.companyId, userId };
		};
		const companyA = await setup("Empresa A", "dono-a");
		const companyB = await setup("Empresa B", "dono-b");
		a = companyA.companyId;
		b = companyB.companyId;
		ownerA = companyA.userId;
		ownerB = companyB.userId;

		for (const [company, root, plate] of [
			[a, "11222333", "AAA1A11"],
			[b, "44555666", "BBB2B22"],
		] as const) {
			const customer = await owner.query<{ id: string }>(
				`INSERT INTO customers (company_id, kind, name, document, city, state)
				VALUES ($1, 'fleet_owner', 'Cliente', $2, 'Jaú', 'SP') RETURNING id`,
				[company, withCheckDigits(`${root}0001`)],
			);
			await owner.query(
				`INSERT INTO vehicles (company_id, customer_id, plate, model, axles)
				VALUES ($1, $2, $3, 'Scania R 450', 3)`,
				[company, customer.rows[0].id, plate],
			);
			if (company === b) customerB = customer.rows[0].id;
		}
	});

	afterAll(async () => {
		await owner.query("DELETE FROM companies WHERE id = ANY($1)", [companyIds]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await owner.end();
		await appPool.end();
	});

	const companiesSeen = (table: string, userId: string, companyId: string) =>
		asApp(appPool, { userId, companyId }, async (c) => {
			const { rows } = await c.query(
				`SELECT DISTINCT company_id FROM ${table}`,
			);
			return rows.map((r) => r.company_id);
		});

	test("each company sees only its own customers and vehicles", async () => {
		for (const table of ["customers", "vehicles"]) {
			expect(await companiesSeen(table, ownerA, a), table).toEqual([a]);
			expect(await companiesSeen(table, ownerB, b), table).toEqual([b]);
		}
	});

	test("pointing the context at another company shows nothing", async () => {
		for (const table of ["customers", "vehicles"]) {
			expect(await companiesSeen(table, ownerA, b), table).toEqual([]);
		}
	});

	test("without a context there is not a single row", async () => {
		for (const table of ["customers", "vehicles"]) {
			expect(await companiesSeen(table, "", ""), table).toEqual([]);
		}
	});

	test("a company cannot write customers or vehicles into another", async () => {
		await expect(
			asApp(appPool, { userId: ownerA, companyId: a }, (c) =>
				c.query(
					`INSERT INTO customers (company_id, kind, name, document, city, state)
					VALUES ($1, 'fleet_owner', 'Invasor', $2, 'Jaú', 'SP')`,
					[b, withCheckDigits("777888990001")],
				),
			),
		).rejects.toThrow(/row-level security/);

		await expect(
			asApp(appPool, { userId: ownerA, companyId: a }, (c) =>
				c.query(
					`INSERT INTO vehicles (company_id, customer_id, plate, model, axles)
					VALUES ($1, $2, 'CCC3C33', 'Invasor', 2)`,
					[b, customerB],
				),
			),
		).rejects.toThrow(/row-level security/);
	});

	test("a company cannot change or delete the other's rows", async () => {
		const result = await asApp(
			appPool,
			{ userId: ownerA, companyId: a },
			async (c) => {
				const update = await c.query(
					"UPDATE customers SET name = 'Hackeado' WHERE id = $1",
					[customerB],
				);
				const del = await c.query(
					"DELETE FROM vehicles WHERE customer_id = $1",
					[customerB],
				);
				return [update.rowCount, del.rowCount];
			},
		);
		expect(result).toEqual([0, 0]);
	});

	test("the vehicle must belong to a customer of its own company", async () => {
		await expect(
			owner.query(
				`INSERT INTO vehicles (company_id, customer_id, plate, model, axles)
				VALUES ($1, $2, 'DDD4D44', 'Cruzado', 2)`,
				[a, customerB],
			),
		).rejects.toThrow(/foreign key/);
	});
});
