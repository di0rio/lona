import { randomInt } from "node:crypto";
import { afterAll, describe, expect, test, vi } from "vitest";
import { connectAsOwner, hasDatabase } from "@/test/database";

const { isBotMock } = vi.hoisted(() => ({
	isBotMock: vi.fn(async () => false),
}));
vi.mock("@/lib/bot", () => ({ isBot: isBotMock }));

describe.skipIf(!hasDatabase)("BotID in the Better Auth route", () => {
	const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
	const userIds: string[] = [];

	afterAll(async () => {
		const owner = connectAsOwner();
		await owner.query("DELETE FROM auth.rate_limits WHERE key LIKE $1", [
			`${ip}|%`,
		]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await owner.end();
	});

	const anonymous = async () => {
		const { POST } = await import("./[...all]/route");
		return POST(
			new Request("http://localhost:3000/api/auth/sign-in/anonymous", {
				method: "POST",
				headers: { "x-forwarded-for": ip, "content-type": "application/json" },
				body: "{}",
			}),
		);
	};

	test("a bot is refused with 403 and no visitor is created", async () => {
		isBotMock.mockResolvedValueOnce(true);

		const response = await anonymous();

		expect(response.status).toBe(403);
		expect(response.headers.getSetCookie()).toHaveLength(0);
	});

	test("a human signs in as a visitor", async () => {
		const response = await anonymous();

		expect(response.status).toBe(200);
		const { user } = (await response.json()) as { user: { id: string } };
		userIds.push(user.id);
	});
});
