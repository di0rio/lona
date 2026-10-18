import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { connectAsOwner, hasDatabase } from "@/test/database";
import { secretFromUri, totpCode } from "@/test/totp";
import { auth } from "./auth";

const password = "senha-de-teste-123";

describe.skipIf(!hasDatabase)("two-factor authentication (TOTP)", () => {
	let owner: pg.Pool;
	const userIds: string[] = [];

	beforeAll(() => {
		owner = connectAsOwner();
	});

	afterAll(async () => {
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await owner.end();
	});

	// O Better Auth devolve a sessão em Set-Cookie; para mandar de volta basta o par nome=valor.
	const cookieFrom = (response: Response) =>
		response.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");

	async function signUp() {
		const email = `2fa-${randomUUID().slice(0, 8)}@teste.lona.test`;
		const response = await auth.api.signUpEmail({
			body: { name: "Cadastro de teste", email, password },
			asResponse: true,
		});
		const { user } = (await response.json()) as { user: { id: string } };
		userIds.push(user.id);
		return { id: user.id, email, cookie: cookieFrom(response) };
	}

	// Só TOTP está ligado no plugin; o tipo de retorno também prevê o OTP por e-mail, que não existe aqui.
	async function enable(cookie: string) {
		const enabled = await auth.api.enableTwoFactor({
			body: { password },
			headers: { cookie },
		});
		if (!("totpURI" in enabled)) throw new Error("esperava TOTP");
		return enabled;
	}

	// Cadastra, liga o 2FA e confirma o primeiro código; devolve o que o teste precisa para entrar de novo.
	async function withTwoFactor() {
		const user = await signUp();
		const enabled = await enable(user.cookie);
		const secret = secretFromUri(enabled.totpURI);
		const verified = await auth.api.verifyTOTP({
			body: { code: totpCode(secret) },
			headers: { cookie: user.cookie },
			asResponse: true,
		});
		expect(verified.status).toBe(200);
		return {
			...user,
			secret,
			backupCodes: enabled.backupCodes,
			// Ligar e confirmar troca a sessão: o cookie novo é o que vale.
			cookie: cookieFrom(verified),
		};
	}

	const signIn = (email: string) =>
		auth.api.signInEmail({
			body: { email, password },
			asResponse: true,
		});

	const twoFactorEnabled = async (id: string) =>
		(
			await owner.query(
				"SELECT two_factor_enabled FROM auth.users WHERE id = $1",
				[id],
			)
		).rows[0].two_factor_enabled;

	test("enabling needs the password and only turns on after the first code is confirmed", async () => {
		const user = await signUp();
		await expect(
			auth.api.enableTwoFactor({
				body: { password: "senha-errada-123" },
				headers: { cookie: user.cookie },
			}),
		).rejects.toThrow();

		const enabled = await enable(user.cookie);
		expect(enabled.totpURI).toMatch(/^otpauth:\/\/totp\//);
		expect(enabled.backupCodes).toHaveLength(10);
		expect(await twoFactorEnabled(user.id)).toBe(false);

		await auth.api.verifyTOTP({
			body: { code: totpCode(secretFromUri(enabled.totpURI)) },
			headers: { cookie: user.cookie },
		});
		expect(await twoFactorEnabled(user.id)).toBe(true);
	});

	test("secret and recovery codes are encrypted in the database", async () => {
		const user = await withTwoFactor();
		const { rows } = await owner.query(
			"SELECT secret, backup_codes FROM auth.two_factors WHERE user_id = $1",
			[user.id],
		);
		expect(rows[0].secret).not.toContain(user.secret);
		for (const code of user.backupCodes) {
			expect(rows[0].backup_codes).not.toContain(code);
		}
	});

	test("sign-in asks for the second step and no session exists before it", async () => {
		const user = await withTwoFactor();
		const response = await signIn(user.email);
		expect(await response.json()).toMatchObject({
			twoFactorRedirect: true,
			twoFactorMethods: ["totp"],
		});
		const cookies = response.headers.getSetCookie().join(";");
		expect(cookies).toContain("two_factor");

		const half = cookieFrom(response);
		const session = await auth.api.getSession({ headers: { cookie: half } });
		expect(session).toBeNull();
	});

	test("a wrong code is refused and the right one signs in", async () => {
		const user = await withTwoFactor();
		const half = cookieFrom(await signIn(user.email));
		const wrong = totpCode(user.secret, Date.now() + 5 * 60 * 1000);
		await expect(
			auth.api.verifyTOTP({
				body: { code: wrong },
				headers: { cookie: half },
			}),
		).rejects.toThrow();

		const ok = await auth.api.verifyTOTP({
			body: { code: totpCode(user.secret) },
			headers: { cookie: half },
			asResponse: true,
		});
		expect(ok.status).toBe(200);
		const session = await auth.api.getSession({
			headers: { cookie: cookieFrom(ok) },
		});
		expect(session?.user.id).toBe(user.id);
	});

	test("a recovery code works once", async () => {
		const user = await withTwoFactor();
		const code = user.backupCodes[0];

		const first = await auth.api.verifyBackupCode({
			body: { code },
			headers: { cookie: cookieFrom(await signIn(user.email)) },
			asResponse: true,
		});
		expect(first.status).toBe(200);

		await expect(
			auth.api.verifyBackupCode({
				body: { code },
				headers: { cookie: cookieFrom(await signIn(user.email)) },
			}),
		).rejects.toThrow();
	});

	test("generating new recovery codes and disabling both need the password", async () => {
		const user = await withTwoFactor();
		const headers = { cookie: user.cookie };

		await expect(
			auth.api.generateBackupCodes({
				body: { password: "senha-errada-123" },
				headers,
			}),
		).rejects.toThrow();
		const fresh = await auth.api.generateBackupCodes({
			body: { password },
			headers,
		});
		expect(fresh.backupCodes).toHaveLength(10);
		expect(fresh.backupCodes).not.toContain(user.backupCodes[0]);

		await expect(
			auth.api.disableTwoFactor({
				body: { password: "senha-errada-123" },
				headers,
			}),
		).rejects.toThrow();
		expect(await twoFactorEnabled(user.id)).toBe(true);

		await auth.api.disableTwoFactor({ body: { password }, headers });
		expect(await twoFactorEnabled(user.id)).toBe(false);
		// Sem 2FA, entrar volta a ser só e-mail e senha.
		expect(await (await signIn(user.email)).json()).not.toHaveProperty(
			"twoFactorRedirect",
		);
	});

	test("an anonymous visitor has no password, so it cannot enable two-factor", async () => {
		const response = await auth.api.signInAnonymous({ asResponse: true });
		const { user } = (await response.json()) as { user: { id: string } };
		userIds.push(user.id);
		await expect(
			auth.api.enableTwoFactor({
				body: { password },
				headers: { cookie: cookieFrom(response) },
			}),
		).rejects.toThrow();
		expect(await twoFactorEnabled(user.id)).toBe(false);
	});
});
