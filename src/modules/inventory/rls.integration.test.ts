import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createCompany, createMembership } from "@/modules/access";
import {
	asApp,
	connectAsApp,
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";

describe.skipIf(!hasDatabase)("RLS of the inventory module", () => {
	let owner: pg.Pool;
	let appPool: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let a: { companyId: string; userId: string; partId: string };
	let b: { companyId: string; userId: string; partId: string };

	beforeAll(async () => {
		owner = connectAsOwner();
		appPool = connectAsApp();
		const db = drizzleAsOwner(owner);
		const setup = async (name: string) => {
			const company = await createCompany(db, {
				name,
				cnpjRoot: "11222333",
				expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
			});
			companyIds.push(company.companyId);
			const userId = await createTestUser(owner, name);
			userIds.push(userId);
			await createMembership(db, {
				companyId: company.companyId,
				userId,
				branchId: null,
				roleId: company.roleIds.dono,
				level: "operate",
			});
			const { rows } = await owner.query<{ id: string }>(
				`INSERT INTO parts (company_id, code, description, brand, unit, sale_price)
				VALUES ($1, 'P-1', 'Peça de ' || $2::text, 'Marca', 'UN', 10) RETURNING id`,
				[company.companyId, name],
			);
			await owner.query(
				`INSERT INTO part_applications (company_id, part_id, vehicle_model)
				VALUES ($1, $2, 'Atego 2426')`,
				[company.companyId, rows[0].id],
			);
			return { companyId: company.companyId, userId, partId: rows[0].id };
		};
		a = await setup("Empresa A");
		b = await setup("Empresa B");
	});

	afterAll(async () => {
		await owner.query("DELETE FROM companies WHERE id = ANY($1)", [companyIds]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await Promise.all([owner.end(), appPool.end()]);
	});

	test("each company sees only its own parts and applications", async () => {
		for (const table of ["parts", "part_applications"]) {
			const rows = await asApp(
				appPool,
				{ userId: a.userId, companyId: a.companyId },
				async (c) =>
					(await c.query(`SELECT DISTINCT company_id FROM ${table}`)).rows,
			);
			expect(rows, table).toEqual([{ company_id: a.companyId }]);
		}
	});

	test("without a company in the context nothing shows", async () => {
		await asApp(appPool, { userId: a.userId }, async (c) => {
			expect((await c.query("SELECT 1 FROM parts")).rowCount).toBe(0);
			expect((await c.query("SELECT 1 FROM part_applications")).rowCount).toBe(
				0,
			);
		});
	});

	test("a company cannot read, change, delete or insert into another one", async () => {
		await asApp(
			appPool,
			{ userId: b.userId, companyId: b.companyId },
			async (c) => {
				const read = await c.query("SELECT 1 FROM parts WHERE id = $1", [
					a.partId,
				]);
				expect(read.rowCount).toBe(0);
				const update = await c.query(
					"UPDATE parts SET active = false WHERE id = $1",
					[a.partId],
				);
				expect(update.rowCount).toBe(0);
				const remove = await c.query(
					"DELETE FROM part_applications WHERE company_id = $1",
					[a.companyId],
				);
				expect(remove.rowCount).toBe(0);
				await expect(
					c.query(
						`INSERT INTO parts (company_id, code, description, brand, unit, sale_price)
						VALUES ($1, 'X', 'Invasora', 'Marca', 'UN', 1)`,
						[a.companyId],
					),
				).rejects.toThrow(/row-level security/);
			},
		);
	});

	test("an application cannot point to a part of another company", async () => {
		// Com a empresa certa no contexto, a chave composta (company_id, part_id) recusa a peça alheia.
		await asApp(
			appPool,
			{ userId: b.userId, companyId: b.companyId },
			async (c) => {
				await expect(
					c.query(
						`INSERT INTO part_applications (company_id, part_id, vehicle_model)
						VALUES ($1, $2, 'Volvo FH')`,
						[b.companyId, a.partId],
					),
				).rejects.toThrow(/foreign key/);
			},
		);
	});

	test("the copier gives the demo its own parts and applications, pointing to the new ids", async () => {
		const target = await createCompany(drizzleAsOwner(owner), {
			name: "Cópia",
			cnpjRoot: "11222333",
			expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
		});
		companyIds.push(target.companyId);
		const client = await owner.connect();
		try {
			await client.query("BEGIN");
			await client.query(
				`CREATE TEMP TABLE lona_id_map (table_name text NOT NULL, old_id uuid NOT NULL, new_id uuid NOT NULL, PRIMARY KEY (table_name, old_id)) ON COMMIT DROP`,
			);
			await client.query("SELECT lona_copy_parts($1, $2)", [
				a.companyId,
				target.companyId,
			]);
			await client.query("SELECT lona_copy_part_applications($1, $2)", [
				a.companyId,
				target.companyId,
			]);
			const { rows } = await client.query(
				`SELECT p.id <> $3 AS new_id, a.vehicle_model
				FROM parts p JOIN part_applications a ON a.company_id = p.company_id AND a.part_id = p.id
				WHERE p.company_id = $1 AND p.code = 'P-1' AND a.company_id = $2`,
				[target.companyId, target.companyId, a.partId],
			);
			expect(rows).toEqual([{ new_id: true, vehicle_model: "Atego 2426" }]);
		} finally {
			await client.query("ROLLBACK");
			client.release();
		}
	});
});
