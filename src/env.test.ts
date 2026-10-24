import { describe, expect, test } from "vitest";
import { assertProductionEnv } from "./env";

const complete = {
	VERCEL_ENV: "production",
	DATABASE_URL_APP: "postgresql://lona_app@host/db",
	BETTER_AUTH_SECRET: "segredo",
	BETTER_AUTH_URL: "https://lona.example",
	CRON_SECRET: "segredo-do-cron",
};

describe("assertProductionEnv", () => {
	test("passes when production has every variable", () => {
		expect(() => assertProductionEnv(complete)).not.toThrow();
	});

	test("names every missing or empty variable in production", () => {
		expect(() =>
			assertProductionEnv({
				...complete,
				CRON_SECRET: "",
				DATABASE_URL_APP: undefined,
			}),
		).toThrow(
			"Faltam variáveis de ambiente na produção: DATABASE_URL_APP, CRON_SECRET.",
		);
	});

	test("does not check outside production", () => {
		expect(() => assertProductionEnv({ VERCEL_ENV: "preview" })).not.toThrow();
		expect(() => assertProductionEnv({})).not.toThrow();
	});
});
