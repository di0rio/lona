import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "@/api";
import {
	auth,
	createCompany,
	createMembership,
	viewAsTargets,
} from "@/modules/access";
import { connectAsOwner, drizzleAsOwner, hasDatabase } from "@/test/database";
import { startDemo } from "./service";

describe.skipIf(!hasDatabase)('"ver como" na demonstração', () => {
	let owner: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	beforeAll(() => {
		owner = connectAsOwner();
	});

	afterAll(async () => {
		// Apagar a empresa leva junto as pessoas fictícias dela (demo_company_id) e as sessões.
		await owner.query("DELETE FROM companies WHERE id = ANY($1)", [companyIds]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await owner.end();
	});

	const cookieFrom = (response: Response) =>
		response.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");

	/** Um visitante com cadastro, a demonstração dele e o cookie da sessão. */
	async function newOwner() {
		const response = await auth.api.signUpEmail({
			body: {
				name: "Dono de teste",
				email: `ver-como-${randomUUID().slice(0, 8)}@teste.lona.test`,
				password: "senha-de-teste-123",
			},
			asResponse: true,
		});
		const { user } = (await response.json()) as { user: { id: string } };
		userIds.push(user.id);
		const companyId = await startDemo(user.id);
		companyIds.push(companyId);
		return { id: user.id, cookie: cookieFrom(response), companyId };
	}

	const viewAs = (cookie: string, userId: string) =>
		auth.api.startViewAs({
			headers: new Headers({ cookie }),
			body: { userId },
			asResponse: true,
		});

	const stop = (cookie: string) =>
		auth.api.stopViewAs({ headers: new Headers({ cookie }), asResponse: true });

	const sessionOf = (cookie: string) =>
		auth.api.getSession({ headers: new Headers({ cookie }) });

	const dashboard = (cookie: string) =>
		app.handle(
			new Request("http://localhost/api/access/dashboard", {
				headers: { cookie },
			}),
		);

	async function personNamed(ownerId: string, role: string) {
		const targets = await viewAsTargets(ownerId);
		const target = targets.find((t) => t.role === role);
		if (!target) throw new Error(`sem ${role} na demonstração`);
		return target.id;
	}

	async function roleId(companyId: string, name: string) {
		const { rows } = await owner.query<{ id: string }>(
			"SELECT id FROM roles WHERE company_id = $1 AND name = $2",
			[companyId, name],
		);
		return rows[0].id;
	}

	test("the owner views as a fictional person of the same demonstration, for real", async () => {
		const visitor = await newOwner();
		const clerk = await personNamed(visitor.id, "balconista");

		const response = await viewAs(visitor.cookie, clerk);
		expect(response.status).toBe(200);
		const cookie = cookieFrom(response);

		const current = await sessionOf(cookie);
		expect(current?.user.id).toBe(clerk);
		expect(current?.session.impersonatedBy).toBe(visitor.id);

		// O resto do app responde pela sessão dela: mesma demonstração, cargo de balconista.
		const summary = (await (await dashboard(cookie)).json()) as {
			company: { id: string };
			role: string;
		};
		expect(summary.company.id).toBe(visitor.companyId);
		expect(summary.role).toBe("balconista");
	});

	test("refuses on a real company (no expiry)", async () => {
		const db = drizzleAsOwner(owner);
		const response = await auth.api.signUpEmail({
			body: {
				name: "Dono real",
				email: `ver-como-${randomUUID().slice(0, 8)}@teste.lona.test`,
				password: "senha-de-teste-123",
			},
			asResponse: true,
		});
		const { user } = (await response.json()) as { user: { id: string } };
		userIds.push(user.id);
		const company = await createCompany(db, {
			name: "Empresa real",
			cnpjRoot: "11222333",
			headquarters: { name: "Matriz", code: "MTZ" },
		});
		companyIds.push(company.companyId);
		await createMembership(db, {
			companyId: company.companyId,
			userId: user.id,
			branchId: null,
			roleId: company.roleIds.dono,
			level: "operate",
		});
		// Mesmo com uma pessoa marcada como fictícia dela, empresa sem prazo nunca libera.
		const { rows } = await owner.query<{ id: string }>(
			"INSERT INTO auth.users (name, email, demo_company_id) VALUES ('Falsa', $1, $2) RETURNING id",
			[`falsa-${randomUUID().slice(0, 8)}@teste.lona.test`, company.companyId],
		);
		await createMembership(db, {
			companyId: company.companyId,
			userId: rows[0].id,
			branchId: null,
			roleId: company.roleIds.balconista,
			level: "operate",
		});

		const denied = await viewAs(cookieFrom(response), rows[0].id);
		expect(denied.status).toBe(403);
	});

	test("refuses a person from another demonstration", async () => {
		const a = await newOwner();
		const b = await newOwner();
		const otherClerk = await personNamed(b.id, "balconista");
		expect((await viewAs(a.cookie, otherClerk)).status).toBe(403);
	});

	test("refuses a real user, even one who is a member of the demonstration", async () => {
		const visitor = await newOwner();
		const db = drizzleAsOwner(owner);
		const { rows } = await owner.query<{ id: string }>(
			"INSERT INTO auth.users (name, email) VALUES ('Real', $1) RETURNING id",
			[`real-${randomUUID().slice(0, 8)}@teste.lona.test`],
		);
		userIds.push(rows[0].id);
		await createMembership(db, {
			companyId: visitor.companyId,
			userId: rows[0].id,
			branchId: null,
			roleId: await roleId(visitor.companyId, "balconista"),
			level: "operate",
		});
		expect((await viewAs(visitor.cookie, rows[0].id)).status).toBe(403);
	});

	test("refuses someone who is not the owner of the demonstration", async () => {
		const visitor = await newOwner();
		const clerk = await personNamed(visitor.id, "balconista");
		const response = await auth.api.signUpEmail({
			body: {
				name: "Colega",
				email: `ver-como-${randomUUID().slice(0, 8)}@teste.lona.test`,
				password: "senha-de-teste-123",
			},
			asResponse: true,
		});
		const { user } = (await response.json()) as { user: { id: string } };
		userIds.push(user.id);
		await createMembership(drizzleAsOwner(owner), {
			companyId: visitor.companyId,
			userId: user.id,
			branchId: null,
			roleId: await roleId(visitor.companyId, "gerente"),
			level: "operate",
		});
		expect((await viewAs(cookieFrom(response), clerk)).status).toBe(403);
	});

	test("going back restores the owner and ends the borrowed session", async () => {
		const visitor = await newOwner();
		const clerk = await personNamed(visitor.id, "balconista");
		const borrowed = cookieFrom(await viewAs(visitor.cookie, clerk));

		const back = await stop(borrowed);
		expect(back.status).toBe(200);
		const restored = await sessionOf(cookieFrom(back));
		expect(restored?.user.id).toBe(visitor.id);
		expect(restored?.session.impersonatedBy).toBeFalsy();
		expect(await sessionOf(borrowed)).toBeNull();
	});

	test("does not chain: from a borrowed session, no one else can be viewed", async () => {
		const visitor = await newOwner();
		const clerk = await personNamed(visitor.id, "balconista");
		const boss = await personNamed(visitor.id, "dono");
		const asClerk = cookieFrom(await viewAs(visitor.cookie, clerk));
		expect((await viewAs(asClerk, boss)).status).toBe(403);

		// Nem a pessoa fictícia que é dona vira ponto de partida de outra.
		const asBoss = cookieFrom(await viewAs(visitor.cookie, boss));
		expect((await viewAs(asBoss, clerk)).status).toBe(403);
	});

	test("going back needs a borrowed session, so it cannot be used to become someone", async () => {
		const visitor = await newOwner();
		expect((await stop(visitor.cookie)).status).toBe(400);
	});

	test("the borrowed person cannot reset or restart the owner's demonstration", async () => {
		const visitor = await newOwner();
		const asClerk = cookieFrom(
			await viewAs(visitor.cookie, await personNamed(visitor.id, "balconista")),
		);
		for (const path of ["/api/demo/reset", "/api/demo/start"]) {
			const response = await app.handle(
				new Request(`http://localhost${path}`, {
					method: "POST",
					headers: { cookie: asClerk },
				}),
			);
			expect(response.status).toBe(403);
		}
		const { rows } = await owner.query(
			"SELECT 1 FROM companies WHERE id = $1",
			[visitor.companyId],
		);
		expect(rows).toHaveLength(1);
	});

	test("when the demonstration expires while viewing as, the session still works and can go back", async () => {
		const visitor = await newOwner();
		const asClerk = cookieFrom(
			await viewAs(visitor.cookie, await personNamed(visitor.id, "balconista")),
		);
		await owner.query(
			"UPDATE companies SET expires_at = now() - interval '1 minute' WHERE id = $1",
			[visitor.companyId],
		);

		expect((await sessionOf(asClerk))?.user).toBeDefined();
		expect((await dashboard(asClerk)).status).toBe(404);
		const back = await stop(asClerk);
		expect(back.status).toBe(200);
		expect((await sessionOf(cookieFrom(back)))?.user.id).toBe(visitor.id);
	});
});
