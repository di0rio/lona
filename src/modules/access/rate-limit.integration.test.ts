import { randomInt } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { connectAsOwner, hasDatabase } from "@/test/database";
import { auth } from "./auth";

// Um IP aleatório por teste: o contador mora no banco e sobrevive entre execuções.
const newIp = () =>
	`10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;

describe.skipIf(!hasDatabase)("rate limit in Postgres", () => {
	let owner: pg.Pool;
	const ips: string[] = [];
	const userIds: string[] = [];

	beforeAll(() => {
		owner = connectAsOwner();
	});

	afterAll(async () => {
		await owner.query("DELETE FROM auth.rate_limits WHERE key LIKE ANY($1)", [
			ips.map((ip) => `${ip}|%`),
		]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await owner.end();
	});

	// Passa pelo handler (e não por auth.api) porque o limite mora no roteador.
	async function signInAnonymously(ip: string) {
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/sign-in/anonymous", {
				method: "POST",
				headers: { "x-forwarded-for": ip, "content-type": "application/json" },
				body: "{}",
			}),
		);
		if (response.ok) {
			const { user } = (await response.clone().json()) as {
				user: { id: string };
			};
			userIds.push(user.id);
		}
		return response;
	}

	test("the 6th try of the same IP gets 429, another IP still passes", async () => {
		const ip = newIp();
		const other = newIp();
		ips.push(ip, other);

		for (let i = 0; i < 5; i++) {
			expect((await signInAnonymously(ip)).status).toBe(200);
		}
		expect((await signInAnonymously(ip)).status).toBe(429);
		expect((await signInAnonymously(other)).status).toBe(200);
	});

	test("after the window the same IP passes again", async () => {
		const ip = newIp();
		ips.push(ip);
		for (let i = 0; i < 5; i++) await signInAnonymously(ip);
		expect((await signInAnonymously(ip)).status).toBe(429);

		// Anda o relógio do contador 10 min e 1 s pra trás.
		await owner.query(
			"UPDATE auth.rate_limits SET last_request = last_request - 601000 WHERE key LIKE $1",
			[`${ip}|%`],
		);

		expect((await signInAnonymously(ip)).status).toBe(200);
	});

	test("password sign-in is tighter than the default: 5 tries, the 6th gets 429", async () => {
		const ip = newIp();
		ips.push(ip);
		const attempt = () =>
			auth.handler(
				new Request("http://localhost:3000/api/auth/sign-in/email", {
					method: "POST",
					headers: {
						"x-forwarded-for": ip,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email: "ninguem@teste.lona.test",
						password: "senha-errada-123",
					}),
				}),
			);

		for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
		expect((await attempt()).status).toBe(429);
	});
});
