import { describe, expect, test } from "vitest";
import { assertProductionTarget } from "./production-target";

const host = "ep-mute-scene-b7vm7eiy.c-13.us-east-1.aws.neon.tech";
const pooledHost = host.replace(".c-13", "-pooler.c-13");
const production = {
	DATABASE_URL: `postgresql://neondb_owner:senha-secreta@${pooledHost}/neondb?sslmode=require`,
	DATABASE_URL_UNPOOLED: `postgresql://neondb_owner:senha-secreta@${host}/neondb?sslmode=require`,
};
const otherBranch = `postgresql://neondb_owner:senha-secreta@ep-cool-river-a1b2c3d4.c-13.us-east-1.aws.neon.tech/neondb`;

describe("assertProductionTarget", () => {
	test("returns both URLs when they are from the main branch and --confirm was given", () => {
		expect(assertProductionTarget(production, ["--confirm"])).toEqual({
			pooledUrl: production.DATABASE_URL,
			ownerUrl: production.DATABASE_URL_UNPOOLED,
		});
	});

	test("refuses without --confirm", () => {
		expect(() => assertProductionTarget(production, [])).toThrow(/--confirm/);
	});

	test.each([
		["DATABASE_URL", { ...production, DATABASE_URL: otherBranch }],
		[
			"DATABASE_URL_UNPOOLED",
			{ ...production, DATABASE_URL_UNPOOLED: otherBranch },
		],
		["DATABASE_URL", { ...production, DATABASE_URL: undefined }],
		["DATABASE_URL", { ...production, DATABASE_URL: "nem-url senha-secreta" }],
	])("refuses when %s is not the main branch", (name, env) => {
		expect(() => assertProductionTarget(env, ["--confirm"])).toThrow(
			`${name} não é da branch main`,
		);
	});

	test("never puts the password in the message", () => {
		expect(() =>
			assertProductionTarget(
				{ ...production, DATABASE_URL_UNPOOLED: otherBranch },
				["--confirm"],
			),
		).toThrow(
			expect.objectContaining({
				message: expect.not.stringContaining("senha-secreta"),
			}),
		);
	});
});
