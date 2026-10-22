import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createCompany, createMembership } from "@/modules/access";
import { deleteLeftoverTestData, rememberE2eUser } from "./cleanup";
import {
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "./database";

describe.skipIf(!hasDatabase)("cleanup of leftover test data", () => {
	let owner: pg.Pool;
	let realUser: string;
	let realCompany: string;

	beforeAll(() => {
		owner = connectAsOwner();
	});

	afterAll(async () => {
		await owner.query("DELETE FROM companies WHERE id = $1", [realCompany]);
		await owner.query("DELETE FROM auth.users WHERE id = $1", [realUser]);
		await owner.end();
	});

	/** Uma empresa com prazo (como uma demonstração) e o usuário dono dela. */
	async function companyOf(userId: string) {
		const db = drizzleAsOwner(owner);
		const company = await createCompany(db, {
			name: "Empresa da limpeza",
			cnpjRoot: "11222333",
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		});
		await createMembership(db, {
			companyId: company.companyId,
			userId,
			branchId: null,
			roleId: company.roleIds.dono,
			level: "operate",
		});
		return company.companyId;
	}

	const exists = async (table: string, id: string) =>
		(await owner.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id]))
			.rowCount === 1;

	test("deletes test users and their demos, including e2e visitors without e-mail, and keeps real ones", async () => {
		const testUser = await createTestUser(owner, "sobra");
		const testCompany = await companyOf(testUser);

		const { rows } = await owner.query<{ id: string }>(
			// E-mail fora do domínio de teste, como o do visitante anônimo: só o arquivo de ids o acha.
			"INSERT INTO auth.users (name, email, is_anonymous) VALUES ('Visitante', $1, true) RETURNING id",
			[`temp-${randomUUID()}@visitante.lona`],
		);
		const e2eVisitor = rows[0].id;
		const e2eCompany = await companyOf(e2eVisitor);
		rememberE2eUser(e2eVisitor);

		const { rows: real } = await owner.query<{ id: string }>(
			"INSERT INTO auth.users (name, email) VALUES ('Gente de verdade', $1) RETURNING id",
			[`real-${randomUUID().slice(0, 8)}@exemplo.com.br`],
		);
		realUser = real[0].id;
		realCompany = await companyOf(realUser);

		await deleteLeftoverTestData();

		expect(await exists("companies", testCompany)).toBe(false);
		expect(await exists("auth.users", testUser)).toBe(false);
		expect(await exists("companies", e2eCompany)).toBe(false);
		expect(await exists("auth.users", e2eVisitor)).toBe(false);
		expect(await exists("companies", realCompany)).toBe(true);
		expect(await exists("auth.users", realUser)).toBe(true);
	});
});
