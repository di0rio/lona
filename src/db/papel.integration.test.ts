import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { conectarComoApp, temBanco } from "@/test/banco";

describe.skipIf(!temBanco)("papel lona_app", () => {
	let app: pg.Pool;

	beforeAll(() => {
		app = conectarComoApp();
	});
	afterAll(() => app.end());

	test("não é superusuário nem ignora RLS", async () => {
		const { rows } = await app.query(
			"SELECT current_user AS papel, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
		);
		expect(rows[0]).toEqual({
			papel: "lona_app",
			rolsuper: false,
			rolbypassrls: false,
		});
	});

	test("não é dono de nenhuma tabela", async () => {
		const { rows } = await app.query(
			"SELECT count(*)::int AS total FROM pg_tables WHERE tableowner = 'lona_app'",
		);
		expect(rows[0].total).toBe(0);
	});

	test("não enxerga o registro de copiadores", async () => {
		await expect(app.query("SELECT * FROM lona_copiadores")).rejects.toThrow(
			/permission denied/,
		);
	});

	test("não cria objetos nem lê o histórico de migrações", async () => {
		await expect(app.query("CREATE TABLE intruso (id int)")).rejects.toThrow(
			/permission denied/,
		);
		await expect(
			app.query("SELECT * FROM drizzle.__drizzle_migrations"),
		).rejects.toThrow(/permission denied/);
	});
});
