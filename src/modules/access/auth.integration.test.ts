import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "@/api";
import { connectAsOwner, drizzleAsOwner, hasDatabase } from "@/test/database";
import { auth } from "./auth";
import { createCompany, createMembership } from "./service";

const UUID_V7 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const password = "senha-de-teste-123";
const newEmail = () => `auth-${randomUUID().slice(0, 8)}@teste.lona.test`;

describe.skipIf(!hasDatabase)(
	"Better Auth and the /api/access/dashboard route",
	() => {
		let owner: pg.Pool;
		const companyIds: string[] = [];
		const userIds: string[] = [];

		beforeAll(() => {
			owner = connectAsOwner();
		});

		afterAll(async () => {
			await owner.query("DELETE FROM companies WHERE id = ANY($1)", [
				companyIds,
			]);
			await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
			await owner.end();
		});

		// O Better Auth devolve a sessão em Set-Cookie; para mandar de volta basta o par nome=valor.
		const cookieFrom = (response: Response) =>
			response.headers
				.getSetCookie()
				.map((c) => c.split(";")[0])
				.join("; ");

		const dashboard = (cookie?: string) =>
			app.handle(
				new Request("http://localhost/api/access/dashboard", {
					headers: cookie ? { cookie } : {},
				}),
			);

		async function signUp(email: string) {
			const response = await auth.api.signUpEmail({
				body: { name: "Cadastro de teste", email, password },
				asResponse: true,
			});
			const { user } = (await response.json()) as { user: { id: string } };
			userIds.push(user.id);
			return { id: user.id, cookie: cookieFrom(response), response };
		}

		test("signs up with email and password and the id is born as a UUIDv7 in the database", async () => {
			const signedUp = await signUp(newEmail());
			expect(signedUp.response.status).toBe(200);
			expect(signedUp.id).toMatch(UUID_V7);
		});

		test("rejects a repeated email and the wrong password", async () => {
			const email = newEmail();
			await signUp(email);
			await expect(
				auth.api.signUpEmail({
					body: { name: "Outra", email, password },
				}),
			).rejects.toThrow();
			await expect(
				auth.api.signInEmail({ body: { email, password: "senha-errada-123" } }),
			).rejects.toThrow();
			await expect(
				auth.api.signInEmail({ body: { email, password } }),
			).resolves.toBeDefined();
		});

		test("anonymous login creates a visitor", async () => {
			const response = await auth.api.signInAnonymous({ asResponse: true });
			const { user } = (await response.json()) as {
				user: { id: string; name: string; isAnonymous: boolean };
			};
			userIds.push(user.id);
			expect(user).toMatchObject({ name: "Visitante", isAnonymous: true });
		});

		test("the dashboard route requires a session", async () => {
			expect((await dashboard()).status).toBe(401);
		});

		test("with a session but no active company, the dashboard route returns 404", async () => {
			const { cookie } = await signUp(newEmail());
			expect((await dashboard(cookie)).status).toBe(404);
		});

		test("with a membership in an active company, the dashboard route returns company, branch and role", async () => {
			const db = drizzleAsOwner(owner);
			const company = await createCompany(db, {
				name: "Empresa do painel",
				cnpjRoot: "11222333",
				expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			});
			companyIds.push(company.companyId);
			const { id, cookie } = await signUp(newEmail());
			await createMembership(db, {
				companyId: company.companyId,
				userId: id,
				branchId: null,
				roleId: company.roleIds.balconista,
				level: "operate",
			});

			const response = await dashboard(cookie);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				company: { id: company.companyId, name: "Empresa do painel" },
				branch: { name: "Matriz", code: "MTZ" },
				role: "balconista",
				level: "operate",
			});

			// Vencida, a mesma sessão deixa de ter empresa.
			await owner.query(
				"UPDATE companies SET expires_at = now() - interval '1 second' WHERE id = $1",
				[company.companyId],
			);
			expect((await dashboard(cookie)).status).toBe(404);
		});
	},
);
