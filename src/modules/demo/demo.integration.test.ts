import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { app } from "@/api";
import { auth, createCompany, createMembership } from "@/modules/access";
import {
	asApp,
	connectAsApp,
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import {
	DemoLimitReachedError,
	deleteExpiredDemos,
	resetDemo,
	startDemo,
} from "./service";
import { seedTemplate } from "./template";

// BotID só existe na Vercel; aqui cada teste decide se o visitante é robô.
const { isBotMock } = vi.hoisted(() => ({
	isBotMock: vi.fn(async () => false),
}));
vi.mock("@/lib/bot", () => ({ isBot: isBotMock }));

// Deixa o teste forçar o teto estourado na rota; fora isso é o startDemo de verdade.
vi.mock("./service", async (importOriginal) => {
	const original = await importOriginal<typeof import("./service")>();
	return { ...original, startDemo: vi.fn(original.startDemo) };
});

// Tabelas que a cópia reproduz, na ordem das chaves estrangeiras, com a coluna que as liga à empresa.
const idsOf = (pool: pg.Pool, table: string, companyId: string) =>
	pool
		.query<{ id: string }>(
			`SELECT concat_ws('|', ${
				table === "role_permissions"
					? "role_id, permission"
					: table === "role_limits"
						? "role_id, limit_key"
						: "id"
			}) AS id FROM ${table} WHERE company_id = $1`,
			[companyId],
		)
		.then(({ rows }) => rows.map((r) => r.id));

describe.skipIf(!hasDatabase)("demo", () => {
	let owner: pg.Pool;
	let appPool: pg.Pool;
	let templateId: string;
	let createdTemplate = false;
	const userIds: string[] = [];
	const companyIds: string[] = [];

	const newVisitor = async (nickname = "visitante") => {
		const id = await createTestUser(owner, nickname);
		userIds.push(id);
		return id;
	};

	const exists = async (companyId: string) => {
		const { rows } = await owner.query(
			"SELECT 1 FROM companies WHERE id = $1",
			[companyId],
		);
		return rows.length === 1;
	};

	beforeAll(async () => {
		owner = connectAsOwner();
		appPool = connectAsApp();
		// O modelo vem do `bun run db:seed`; se o banco ainda não o tem, o teste semeia e remove depois.
		const current = await owner.query<{ id: string | null }>(
			"SELECT lona_template_id() AS id",
		);
		if (current.rows[0].id) {
			templateId = current.rows[0].id;
		} else {
			const db = drizzleAsOwner(owner);
			templateId = (await db.transaction((tx) => seedTemplate(tx))).companyId;
			createdTemplate = true;
		}
		await appPool.query("SELECT 1"); // esquenta a conexão: o tempo medido é o da cópia, não o do TLS
	});

	afterAll(async () => {
		// As demonstrações de teste saem pelos vínculos dos visitantes; só depois os visitantes.
		await owner.query(
			"DELETE FROM companies WHERE NOT is_template AND (id = ANY($1) OR id IN (SELECT company_id FROM memberships WHERE user_id = ANY($2)))",
			[companyIds, userIds],
		);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		if (createdTemplate) {
			await owner.query("DELETE FROM companies WHERE id = $1", [templateId]);
		}
		await Promise.all([owner.end(), appPool.end()]);
	});

	test("every table with company_id has a registered copier", async () => {
		const { rows } = await owner.query<{ table: string }>(
			`SELECT c.table_name AS table
			FROM information_schema.columns c
			JOIN information_schema.tables t USING (table_schema, table_name)
			WHERE c.table_schema = 'public' AND c.column_name = 'company_id'
				AND t.table_type = 'BASE TABLE'
				AND c.table_name NOT LIKE 'test\\_%'
				AND c.table_name NOT IN (SELECT table_name FROM lona_copiers)`,
		);
		expect(rows).toEqual([]);
	});

	test("the copy remaps every id and keeps everything from the template", async () => {
		const visitor = await newVisitor();
		const start = Date.now();
		const copyId = await startDemo(visitor);
		companyIds.push(copyId);

		expect(copyId).not.toBe(templateId);

		const { rows: copiers } = await owner.query<{ table: string }>(
			"SELECT table_name AS table FROM lona_copiers ORDER BY position",
		);
		const tables = copiers.map((c) => c.table);
		expect(tables).toContain("branches");

		for (const table of tables) {
			const fromTemplate = await idsOf(owner, table, templateId);
			const fromCopy = await idsOf(owner, table, copyId);
			// Os vínculos ganham o do visitante; nas outras tabelas a quantidade é a mesma.
			expect(fromCopy.length, table).toBe(
				fromTemplate.length + (table === "memberships" ? 1 : 0),
			);
			if (table === "role_permissions" || table === "role_limits") continue; // chaves compostas: o cargo já é conferido em roles
			// Nenhum id da cópia pode ser um id do modelo.
			expect(
				fromCopy.filter((id) => fromTemplate.includes(id)),
				table,
			).toEqual([]);
		}
		expect(Date.now() - start).toBeLessThan(5000);

		// Quem copiou é dono em todas as filiais e a demonstração vence em 2 horas.
		const { rows } = await owner.query(
			`SELECT m.branch_id, m.level, r.name AS role,
				c.is_template, extract(epoch FROM (c.expires_at - now())) / 60 AS minutes
			FROM memberships m
			JOIN roles r ON r.company_id = m.company_id AND r.id = m.role_id
			JOIN companies c ON c.id = m.company_id
			WHERE m.company_id = $1 AND m.user_id = $2`,
			[copyId, visitor],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			branch_id: null,
			level: "operate",
			role: "dono",
			is_template: false,
		});
		expect(Number(rows[0].minutes)).toBeGreaterThan(118);
		expect(Number(rows[0].minutes)).toBeLessThanOrEqual(120);
	});

	test("the copy's foreign keys point to the copy itself", async () => {
		const visitor = await newVisitor();
		const copyId = await startDemo(visitor);
		companyIds.push(copyId);

		const { rows } = await owner.query(
			`SELECT
				(SELECT count(*) FROM memberships m JOIN branches b ON b.id = m.branch_id WHERE m.company_id = $1 AND b.company_id <> $1)::int AS swapped_branches,
				(SELECT count(*) FROM memberships m JOIN roles r ON r.id = m.role_id WHERE m.company_id = $1 AND r.company_id <> $1)::int AS swapped_roles`,
			[copyId],
		);
		expect(rows[0]).toEqual({ swapped_branches: 0, swapped_roles: 0 });
	});

	test("measures the copy: under 1 second", async () => {
		// Uma cópia de aquecimento abre a conexão do app (TLS) e esquenta os planos; a medida é a do uso corrente.
		companyIds.push(await startDemo(await newVisitor("aquece")));

		const visitor = await newVisitor();

		// Tempo de relógio da transação inteira (limpeza + cópia), como o app a executa.
		const before = performance.now();
		const copyId = await startDemo(visitor);
		const total = performance.now() - before;
		companyIds.push(copyId);

		// Tempo só da função no servidor, sem as idas e vindas de rede.
		const other = await newVisitor("medida");
		const plan = await asApp(appPool, { userId: other }, async (c) => {
			const { rows } = await c.query<{ "QUERY PLAN": string }>(
				"EXPLAIN (ANALYZE) SELECT lona_clone_demo(lona_template_id(), $1::uuid)",
				[other],
			);
			return rows.map((r) => r["QUERY PLAN"]).join("\n");
		});
		const inDatabase = Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1]);

		console.info(
			`cópia da demonstração: ${total.toFixed(0)} ms ao todo (transação completa), ${inDatabase.toFixed(0)} ms dentro do banco`,
		);
		// A meta de 1 s vale para a cópia no banco. O tempo ao todo soma 5 idas e vindas (BEGIN, contexto, busca,
		// cópia, COMMIT) e, rodando daqui até o Neon em us-east-1, é quase só rede; por isso o teto dele é folgado.
		expect(inDatabase).toBeLessThan(1000);
		expect(total).toBeLessThan(2500);
	});

	test("two demos cannot see each other's data", async () => {
		const a = await newVisitor("visitante-a");
		const b = await newVisitor("visitante-b");
		const companyA = await startDemo(a);
		const companyB = await startDemo(b);
		companyIds.push(companyA, companyB);
		expect(companyA).not.toBe(companyB);

		const branchesSeen = (userId: string, companyId: string) =>
			asApp(appPool, { userId, companyId }, async (c) => {
				const { rows } = await c.query<{ company_id: string }>(
					"SELECT DISTINCT company_id FROM branches",
				);
				return rows.map((r) => r.company_id);
			});

		expect(await branchesSeen(a, companyA)).toEqual([companyA]);
		expect(await branchesSeen(b, companyB)).toEqual([companyB]);
		expect(await branchesSeen(a, companyB)).toEqual([]);
		expect(await branchesSeen(b, companyA)).toEqual([]);
	});

	test("starting twice returns the same demo", async () => {
		const visitor = await newVisitor();
		const first = await startDemo(visitor);
		companyIds.push(first);
		expect(await startDemo(visitor)).toBe(first);
	});

	test("the app only copies for the user in the context and only copies the template", async () => {
		const a = await newVisitor();
		const b = await newVisitor();
		await expect(
			asApp(appPool, { userId: a }, (c) =>
				c.query("SELECT lona_clone_demo($1, $2)", [templateId, b]),
			),
		).rejects.toThrow(/usuário da cópia/);

		const real = await createCompany(drizzleAsOwner(owner), {
			name: "Empresa real do teste",
			cnpjRoot: "11444777",
		});
		companyIds.push(real.companyId);
		await expect(
			asApp(appPool, { userId: a }, (c) =>
				c.query("SELECT lona_clone_demo($1, $2)", [real.companyId, a]),
			),
		).rejects.toThrow(/modelo não encontrado/);
	});

	test("lazy cleanup: starting a demo really deletes the expired ones, with everything inside", async () => {
		const old = await newVisitor("antigo");
		const expired = await startDemo(old);
		companyIds.push(expired);
		await owner.query(
			"UPDATE companies SET expires_at = now() - interval '1 minute' WHERE id = $1",
			[expired],
		);
		expect(await exists(expired)).toBe(true);

		const fresh = await newVisitor("novo");
		companyIds.push(await startDemo(fresh));

		expect(await exists(expired)).toBe(false);
		for (const table of ["branches", "roles", "memberships"]) {
			const { rows } = await owner.query(
				`SELECT count(*)::int AS n FROM ${table} WHERE company_id = $1`,
				[expired],
			);
			expect(rows[0].n, table).toBe(0);
		}
		// O modelo continua lá.
		expect(await exists(templateId)).toBe(true);
	});

	test("whoever had an expired demo starts another one", async () => {
		const visitor = await newVisitor();
		const expired = await startDemo(visitor);
		companyIds.push(expired);
		await owner.query(
			"UPDATE companies SET expires_at = now() - interval '1 minute' WHERE id = $1",
			[expired],
		);

		const another = await startDemo(visitor);
		companyIds.push(another);
		expect(another).not.toBe(expired);
		expect(await exists(expired)).toBe(false);
		expect(await exists(another)).toBe(true);
	});

	test("reset deletes the current one, copies again and keeps the user", async () => {
		const visitor = await newVisitor();
		const current = await startDemo(visitor);
		companyIds.push(current);
		await owner.query(
			"UPDATE branches SET name = 'Mexida' WHERE company_id = $1",
			[current],
		);

		const fresh = await resetDemo(visitor);
		expect(fresh).toBeTruthy();
		companyIds.push(fresh as string);
		expect(fresh).not.toBe(current);
		expect(await exists(current)).toBe(false);

		const { rows } = await owner.query(
			`SELECT count(*)::int AS n FROM branches WHERE company_id = $1 AND name = 'Mexida'`,
			[fresh],
		);
		expect(rows[0].n).toBe(0);
		const { rows: memberships } = await owner.query(
			"SELECT count(*)::int AS n FROM memberships WHERE company_id = $1 AND user_id = $2",
			[fresh, visitor],
		);
		expect(memberships[0].n).toBe(1);
	});

	test("reset never deletes a real company", async () => {
		const user = await newVisitor();
		const db = drizzleAsOwner(owner);
		const real = await createCompany(db, {
			name: "Empresa de verdade",
			cnpjRoot: "11444777",
		});
		companyIds.push(real.companyId);
		await createMembership(db, {
			companyId: real.companyId,
			userId: user,
			branchId: null,
			roleId: real.roleIds.dono,
			level: "operate",
		});

		expect(await resetDemo(user)).toBeNull();
		expect(await exists(real.companyId)).toBe(true);
	});

	describe("ceiling of active demos", () => {
		const liveDemos = async () =>
			(
				await owner.query<{ n: number }>(
					"SELECT count(*)::int AS n FROM companies WHERE NOT is_template AND expires_at > now()",
				)
			).rows[0].n;

		test("refuses when the ceiling is reached and creates below it", async () => {
			const live = await liveDemos();
			const visitor = await newVisitor();

			await expect(startDemo(visitor, live)).rejects.toBeInstanceOf(
				DemoLimitReachedError,
			);
			const { rowCount } = await owner.query(
				"SELECT 1 FROM memberships WHERE user_id = $1",
				[visitor],
			);
			expect(rowCount).toBe(0);

			companyIds.push(await startDemo(visitor, live + 1));
		});

		test("an expired demo does not count toward the ceiling", async () => {
			const live = await liveDemos();
			const old = await startDemo(await newVisitor());
			companyIds.push(old);
			await owner.query(
				"UPDATE companies SET expires_at = now() - interval '1 minute' WHERE id = $1",
				[old],
			);

			companyIds.push(await startDemo(await newVisitor(), live + 1));
		});

		test("simultaneous creations do not pass the ceiling", async () => {
			const live = await liveDemos();
			const visitors = await Promise.all([
				newVisitor(),
				newVisitor(),
				newVisitor(),
			]);

			const results = await Promise.allSettled(
				visitors.map((visitor) => startDemo(visitor, live + 1)),
			);

			const created = results.filter((r) => r.status === "fulfilled");
			expect(created).toHaveLength(1);
			companyIds.push(created[0].value);
			for (const r of results) {
				if (r.status === "rejected")
					expect(r.reason).toBeInstanceOf(DemoLimitReachedError);
			}
		});

		test("reset that hits the ceiling keeps the demo the user already had", async () => {
			const visitor = await newVisitor();
			const current = await startDemo(visitor);
			companyIds.push(current);
			// Sem o teto da própria demonstração (apagada no reset), ainda não cabe: desfaz tudo.
			await expect(resetDemo(visitor, 0)).rejects.toBeInstanceOf(
				DemoLimitReachedError,
			);
			expect(await exists(current)).toBe(true);
		});
	});

	describe("POST /api/demo/start", () => {
		const signUp = async () => {
			const response = await auth.api.signUpEmail({
				body: {
					name: "Visitante de teste",
					email: `teto-${randomUUID().slice(0, 8)}@teste.lona.test`,
					password: "senha-de-teste-123",
				},
				asResponse: true,
			});
			const { user } = (await response.json()) as { user: { id: string } };
			userIds.push(user.id);
			const cookie = response.headers
				.getSetCookie()
				.map((c) => c.split(";")[0])
				.join("; ");
			return { id: user.id, cookie };
		};

		const start = (cookie: string) =>
			app.handle(
				new Request("http://localhost/api/demo/start", {
					method: "POST",
					headers: { cookie },
				}),
			);

		test("a bot is refused with 403 and gets no demo", async () => {
			const visitor = await signUp();
			isBotMock.mockResolvedValueOnce(true);

			expect((await start(visitor.cookie)).status).toBe(403);
			const { rowCount } = await owner.query(
				"SELECT 1 FROM memberships WHERE user_id = $1",
				[visitor.id],
			);
			expect(rowCount).toBe(0);
		});

		test("a human gets the demo", async () => {
			const visitor = await signUp();

			const response = await start(visitor.cookie);

			expect(response.status).toBe(200);
			companyIds.push(
				((await response.json()) as { companyId: string }).companyId,
			);
		});

		test("the ceiling reached answers 503", async () => {
			const visitor = await signUp();
			vi.mocked(startDemo).mockRejectedValueOnce(new DemoLimitReachedError());

			expect((await start(visitor.cookie)).status).toBe(503);
		});
	});

	describe("daily routine /api/cron/clean", () => {
		const call = (authorization?: string) =>
			app.handle(
				new Request("http://localhost/api/cron/clean", {
					headers: authorization ? { authorization } : {},
				}),
			);

		test("rejects without the secret or with the wrong secret", async () => {
			vi.stubEnv("CRON_SECRET", "segredo-de-teste");
			expect((await call()).status).toBe(401);
			expect((await call("Bearer outro-segredo")).status).toBe(401);
			vi.unstubAllEnvs();
		});

		test("with the secret, deletes the leftover expired ones", async () => {
			const visitor = await newVisitor();
			const expired = await startDemo(visitor);
			companyIds.push(expired);
			await owner.query(
				"UPDATE companies SET expires_at = now() - interval '1 minute' WHERE id = $1",
				[expired],
			);

			vi.stubEnv("CRON_SECRET", "segredo-de-teste");
			const response = await call("Bearer segredo-de-teste");
			vi.unstubAllEnvs();

			expect(response.status).toBe(200);
			expect(
				((await response.json()) as { deleted: number }).deleted,
			).toBeGreaterThanOrEqual(1);
			expect(await exists(expired)).toBe(false);
			expect(await exists(templateId)).toBe(true);
		});

		test("without CRON_SECRET configured, never authorizes", async () => {
			vi.stubEnv("CRON_SECRET", "");
			expect((await call("Bearer ")).status).toBe(401);
			vi.unstubAllEnvs();
		});

		test("deleteExpiredDemos returns how many it deleted", async () => {
			expect(await deleteExpiredDemos()).toBeGreaterThanOrEqual(0);
		});
	});
});
