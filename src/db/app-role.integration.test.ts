import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { connectAsApp, hasDatabase } from "@/test/database";

describe.skipIf(!hasDatabase)("lona_app role", () => {
	let app: pg.Pool;

	beforeAll(() => {
		app = connectAsApp();
	});
	afterAll(() => app.end());

	test("is not a superuser nor bypasses RLS", async () => {
		const { rows } = await app.query(
			"SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
		);
		expect(rows[0]).toEqual({
			role: "lona_app",
			rolsuper: false,
			rolbypassrls: false,
		});
	});

	test("owns no table", async () => {
		const { rows } = await app.query(
			"SELECT count(*)::int AS total FROM pg_tables WHERE tableowner = 'lona_app'",
		);
		expect(rows[0].total).toBe(0);
	});

	test("cannot see the copiers registry", async () => {
		await expect(app.query("SELECT * FROM lona_copiers")).rejects.toThrow(
			/permission denied/,
		);
	});

	test("cannot create objects nor read the migration history", async () => {
		await expect(app.query("CREATE TABLE intruso (id int)")).rejects.toThrow(
			/permission denied/,
		);
		await expect(
			app.query("SELECT * FROM drizzle.__drizzle_migrations"),
		).rejects.toThrow(/permission denied/);
	});
});
