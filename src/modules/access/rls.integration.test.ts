import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	asApp,
	connectAsApp,
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import { createBranch, createCompany, createMembership } from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
const ONE_MINUTE_AGO = () => new Date(Date.now() - 60 * 1000);

// Tabela de estoque de mentira, só para provar o ajudante de tabelas de filial que as próximas etapas vão usar.
const branchTable = `test_branch_${randomUUID().slice(0, 8)}`;

describe.skipIf(!hasDatabase)("RLS of the access module", () => {
	let owner: pg.Pool;
	let appPool: pg.Pool;

	const companyIds: string[] = [];
	const userIds: string[] = [];

	// Duas empresas ativas, cada uma com um dono em todas as filiais.
	let a: Awaited<ReturnType<typeof createCompany>> & { branchBauru: string };
	let b: Awaited<ReturnType<typeof createCompany>>;
	let ownerA: string;
	let ownerB: string;
	let viewerUser: string; // consulta a matriz de A
	let hqOperatorBranchViewer: string; // opera a matriz de A e só consulta Bauru
	let expiredCompany: Awaited<ReturnType<typeof createCompany>>;
	let expiredOwner: string;
	let templateCompany: Awaited<ReturnType<typeof createCompany>>;
	let templateOwner: string;

	beforeAll(async () => {
		owner = connectAsOwner();
		appPool = connectAsApp();
		const db = drizzleAsOwner(owner);

		const newCompany = async (
			name: string,
			extra: { expiresAt?: Date | null; isTemplate?: boolean } = {},
		) => {
			const company = await createCompany(db, {
				name,
				cnpjRoot: "11222333",
				expiresAt: TWO_HOURS_FROM_NOW(),
				...extra,
			});
			companyIds.push(company.companyId);
			return company;
		};
		const newUser = async (nickname: string) => {
			const id = await createTestUser(owner, nickname);
			userIds.push(id);
			return id;
		};

		a = {
			...(await newCompany("Empresa A")),
			branchBauru: "",
		};
		a.branchBauru = await createBranch(db, {
			companyId: a.companyId,
			name: "Bauru",
			code: "BAU",
			cnpjRoot: "11222333",
			order: 2,
		});
		b = await newCompany("Empresa B");
		expiredCompany = await newCompany("Empresa vencida", {
			expiresAt: ONE_MINUTE_AGO(),
		});
		templateCompany = await newCompany("Modelo de teste", {
			expiresAt: null,
			isTemplate: true,
		});

		ownerA = await newUser("dono-a");
		ownerB = await newUser("dono-b");
		expiredOwner = await newUser("dono-vencida");
		templateOwner = await newUser("dono-modelo");
		viewerUser = await newUser("so-consulta");
		hqOperatorBranchViewer = await newUser("opera-matriz");

		const linkOwner = (
			e: { companyId: string; roleIds: Record<string, string> },
			userId: string,
		) =>
			createMembership(db, {
				companyId: e.companyId,
				userId,
				branchId: null,
				roleId: e.roleIds.dono,
				level: "operate",
			});
		await linkOwner(a, ownerA);
		await linkOwner(b, ownerB);
		await linkOwner(expiredCompany, expiredOwner);
		await linkOwner(templateCompany, templateOwner);
		await createMembership(db, {
			companyId: a.companyId,
			userId: viewerUser,
			branchId: a.headquartersId,
			roleId: a.roleIds.balconista,
			level: "view",
		});
		await createMembership(db, {
			companyId: a.companyId,
			userId: hqOperatorBranchViewer,
			branchId: a.headquartersId,
			roleId: a.roleIds.gerente,
			level: "operate",
		});
		await createMembership(db, {
			companyId: a.companyId,
			userId: hqOperatorBranchViewer,
			branchId: a.branchBauru,
			roleId: a.roleIds.gerente,
			level: "view",
		});

		await owner.query(
			`CREATE TABLE ${branchTable} (
				id uuid PRIMARY KEY DEFAULT uuidv7(),
				company_id uuid NOT NULL,
				branch_id uuid NOT NULL,
				quantity int NOT NULL
			)`,
		);
		await owner.query("SELECT lona_protect_branch_table($1::regclass)", [
			branchTable,
		]);
		await owner.query(
			`INSERT INTO ${branchTable} (company_id, branch_id, quantity) VALUES ($1, $2, 1), ($1, $3, 2), ($4, $5, 3)`,
			[
				a.companyId,
				a.headquartersId,
				a.branchBauru,
				b.companyId,
				b.headquartersId,
			],
		);
	});

	afterAll(async () => {
		await owner.query(`DROP TABLE IF EXISTS ${branchTable}`);
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

	const countRows = async (
		context: { userId?: string; companyId?: string },
		table: string,
	) =>
		asApp(appPool, context, async (c) => {
			const { rows } = await c.query(`SELECT count(*)::int AS n FROM ${table}`);
			return rows[0].n as number;
		});

	test("every business table has RLS enabled and forced", async () => {
		const { rows } = await owner.query<{ table: string }>(
			`SELECT c.relname AS table
			FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public' AND c.relkind = 'r'
				AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
				AND c.relname <> 'lona_copiers' -- infraestrutura da cópia: não tem empresa e o app nem a enxerga
				AND c.relname NOT LIKE 'test\\_%'`,
		);
		expect(rows).toEqual([]);
	});

	test("two companies cannot see each other's data", async () => {
		for (const table of ["companies", "branches", "roles", "memberships"]) {
			const fromA = await asApp(
				appPool,
				{ userId: ownerA, companyId: a.companyId },
				async (c) => {
					const column = table === "companies" ? "id" : "company_id";
					const { rows } = await c.query(
						`SELECT DISTINCT ${column} AS company FROM ${table}`,
					);
					return rows.map((r) => r.company);
				},
			);
			expect(fromA, table).toEqual([a.companyId]);
		}
		expect(
			await countRows({ userId: ownerB, companyId: b.companyId }, "branches"),
		).toBe(1);
	});

	test("pointing the context at another company's id shows nothing", async () => {
		for (const table of ["companies", "branches", "roles", "memberships"]) {
			expect(
				await countRows({ userId: ownerA, companyId: b.companyId }, table),
				table,
			).toBe(0);
		}
	});

	test("without a context there is not a single row", async () => {
		for (const table of ["companies", "branches", "roles", "memberships"]) {
			expect(await countRows({}, table), table).toBe(0);
		}
	});

	test("the lona_app role does not bypass RLS (the owner does)", async () => {
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM companies WHERE id = ANY($1)",
			[[a.companyId, b.companyId]],
		);
		expect(rows[0].n).toBe(2);
		expect(await countRows({}, "companies")).toBe(0);
	});

	test("an expired company returns no rows, even with the context set", async () => {
		for (const table of ["companies", "branches", "roles", "memberships"]) {
			expect(
				await countRows(
					{ userId: expiredOwner, companyId: expiredCompany.companyId },
					table,
				),
				table,
			).toBe(0);
		}
	});

	test("the company expires mid-use: active reads, expired does not", async () => {
		const ephemeral = await createCompany(drizzleAsOwner(owner), {
			name: "Vence logo",
			cnpjRoot: "11222333",
			expiresAt: TWO_HOURS_FROM_NOW(),
		});
		companyIds.push(ephemeral.companyId);
		const userId = await createTestUser(owner, "efemero");
		userIds.push(userId);
		await createMembership(drizzleAsOwner(owner), {
			companyId: ephemeral.companyId,
			userId,
			branchId: null,
			roleId: ephemeral.roleIds.dono,
			level: "operate",
		});

		const context = { userId, companyId: ephemeral.companyId };
		expect(await countRows(context, "branches")).toBe(1);
		await owner.query(
			"UPDATE companies SET expires_at = now() - interval '1 second' WHERE id = $1",
			[ephemeral.companyId],
		);
		expect(await countRows(context, "branches")).toBe(0);
	});

	test("the template never shows up, not even for who has a membership in it", async () => {
		expect(
			await countRows(
				{ userId: templateOwner, companyId: templateCompany.companyId },
				"branches",
			),
		).toBe(0);
	});

	test("without a membership in the company, sees nothing (ADR 0006)", async () => {
		const noMembership = await createTestUser(owner, "sem-vinculo");
		userIds.push(noMembership);
		expect(
			await countRows(
				{ userId: noMembership, companyId: a.companyId },
				"branches",
			),
		).toBe(0);
	});

	test("lona_user_companies returns only the active company of who asks", async () => {
		const names = async (userId: string) =>
			asApp(appPool, { userId }, async (c) => {
				const { rows } = await c.query(
					"SELECT name FROM lona_user_companies()",
				);
				return rows.map((r) => r.name);
			});
		expect(await names(ownerA)).toEqual(["Empresa A"]);
		expect(await names(expiredOwner)).toEqual([]);
		expect(await names(templateOwner)).toEqual([]);
	});

	describe("view and operate (ADR 0006)", () => {
		const viewerContext = () => ({
			userId: viewerUser,
			companyId: a.companyId,
		});

		test("a viewer sees the branch of the membership and not the others", async () => {
			const names = await asApp(appPool, viewerContext(), async (c) => {
				const { rows } = await c.query("SELECT name FROM branches");
				return rows.map((r) => r.name);
			});
			expect(names).toEqual(["Matriz"]);
		});

		test("a viewer cannot INSERT into branches", async () => {
			await expect(
				asApp(appPool, viewerContext(), (c) =>
					c.query(
						"INSERT INTO branches (company_id, name, code, cnpj) VALUES ($1, 'Nova', 'NOV', '11222333000362')",
						[a.companyId],
					),
				),
			).rejects.toThrow(/row-level security/);
		});

		test("a viewer cannot UPDATE nor DELETE a branch", async () => {
			const result = await asApp(appPool, viewerContext(), async (c) => {
				const updated = await c.query(
					"UPDATE branches SET name = 'Invadida' WHERE id = $1",
					[a.headquartersId],
				);
				const deleted = await c.query("DELETE FROM branches WHERE id = $1", [
					a.headquartersId,
				]);
				return [updated.rowCount, deleted.rowCount];
			});
			expect(result).toEqual([0, 0]);
			const { rows } = await owner.query(
				"SELECT name FROM branches WHERE id = $1",
				[a.headquartersId],
			);
			expect(rows[0].name).toBe("Matriz");
		});

		test("an operator at headquarters who only views Bauru updates headquarters and not Bauru", async () => {
			const context = {
				userId: hqOperatorBranchViewer,
				companyId: a.companyId,
			};
			const [headquarters, bauru] = await asApp(appPool, context, async (c) => {
				const hq = await c.query(
					"UPDATE branches SET name = 'Matriz Jaú' WHERE id = $1",
					[a.headquartersId],
				);
				const bau = await c.query(
					"UPDATE branches SET name = 'Bauru 2' WHERE id = $1",
					[a.branchBauru],
				);
				return [hq.rowCount, bau.rowCount];
			});
			expect([headquarters, bauru]).toEqual([1, 0]);
		});

		test("only who operates in all branches creates a new branch", async () => {
			const newBranch = (c: pg.PoolClient) =>
				c.query(
					"INSERT INTO branches (company_id, name, code, cnpj) VALUES ($1, 'Marília', 'MAR', '11222333000443')",
					[a.companyId],
				);
			await expect(
				asApp(
					appPool,
					{ userId: hqOperatorBranchViewer, companyId: a.companyId },
					newBranch,
				),
			).rejects.toThrow(/row-level security/);
			await expect(
				asApp(appPool, { userId: ownerA, companyId: a.companyId }, newBranch),
			).resolves.toBeDefined();
		});

		test("branch table: view reads, operate writes (helper ready for the next steps)", async () => {
			const viewResult = await asApp(appPool, viewerContext(), async (c) => {
				const { rows } = await c.query(
					`SELECT quantity FROM ${branchTable} ORDER BY quantity`,
				);
				return rows.map((r) => r.quantity);
			});
			// Só a matriz de A: Bauru fica de fora e a linha da empresa B nem existe para ele.
			expect(viewResult).toEqual([1]);

			await expect(
				asApp(appPool, viewerContext(), (c) =>
					c.query(
						`INSERT INTO ${branchTable} (company_id, branch_id, quantity) VALUES ($1, $2, 9)`,
						[a.companyId, a.headquartersId],
					),
				),
			).rejects.toThrow(/row-level security/);

			const context = {
				userId: hqOperatorBranchViewer,
				companyId: a.companyId,
			};
			const [atHeadquarters, atBauru, visible] = await asApp(
				appPool,
				context,
				async (c) => {
					const hq = await c.query(
						`UPDATE ${branchTable} SET quantity = 10 WHERE branch_id = $1`,
						[a.headquartersId],
					);
					const bau = await c.query(
						`UPDATE ${branchTable} SET quantity = 20 WHERE branch_id = $1`,
						[a.branchBauru],
					);
					const visibleRows = await c.query(
						`SELECT count(*)::int AS n FROM ${branchTable}`,
					);
					return [hq.rowCount, bau.rowCount, visibleRows.rows[0].n];
				},
			);
			expect([atHeadquarters, atBauru, visible]).toEqual([1, 0, 2]);

			// Mudar a linha para outra filial (onde só consulta) também é barrado pelo WITH CHECK.
			await expect(
				asApp(appPool, context, (c) =>
					c.query(
						`UPDATE ${branchTable} SET branch_id = $1 WHERE branch_id = $2`,
						[a.branchBauru, a.headquartersId],
					),
				),
			).rejects.toThrow(/row-level security/);
		});
	});

	describe("companies", () => {
		const ownerContext = () => ({ userId: ownerA, companyId: a.companyId });

		test("the app does not adjust the expiration nor create a company", async () => {
			await expect(
				asApp(appPool, ownerContext(), (c) =>
					c.query("UPDATE companies SET expires_at = NULL"),
				),
			).rejects.toThrow(/permission denied/);
			await expect(
				asApp(appPool, ownerContext(), (c) =>
					c.query(
						"INSERT INTO companies (name, cnpj_root) VALUES ('Invasora', '11222333')",
					),
				),
			).rejects.toThrow(/permission denied/);
		});

		test("the app adjusts name, color and settings of its own company", async () => {
			const updated = await asApp(appPool, ownerContext(), async (c) => {
				const r = await c.query(
					"UPDATE companies SET name = 'Empresa A Ltda', color = 'green'",
				);
				return r.rowCount;
			});
			expect(updated).toBe(1);
		});

		test("the app only deletes a demo, never a real company", async () => {
			const real = await createCompany(drizzleAsOwner(owner), {
				name: "Empresa real",
				cnpjRoot: "11444777",
			});
			companyIds.push(real.companyId);
			const userId = await createTestUser(owner, "dono-real");
			userIds.push(userId);
			await createMembership(drizzleAsOwner(owner), {
				companyId: real.companyId,
				userId,
				branchId: null,
				roleId: real.roleIds.dono,
				level: "operate",
			});

			const deleted = await asApp(
				appPool,
				{ userId, companyId: real.companyId },
				async (c) => (await c.query("DELETE FROM companies")).rowCount,
			);
			expect(deleted).toBe(0);
		});
	});
});
