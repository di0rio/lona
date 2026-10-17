import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import { defaultSettings } from "./schema";
import {
	companySettings,
	createCompany,
	createMembership,
	PermissionDeniedError,
	updateCompanySettings,
} from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

describe.skipIf(!hasDatabase)("company settings", () => {
	let owner: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let ownerA: string;
	let ownerB: string;
	let manager: string; // gerente de A: não tem company.configure
	let outsider: string; // sem vínculo nenhum

	beforeAll(async () => {
		owner = connectAsOwner();
		const db = drizzleAsOwner(owner);
		const newUser = async (nickname: string) => {
			const id = await createTestUser(owner, nickname);
			userIds.push(id);
			return id;
		};
		const newCompany = async (name: string) => {
			const company = await createCompany(db, {
				name,
				cnpjRoot: "11222333",
				expiresAt: TWO_HOURS_FROM_NOW(),
			});
			companyIds.push(company.companyId);
			return company;
		};
		const a = await newCompany("Empresa A");
		const b = await newCompany("Empresa B");
		ownerA = await newUser("dono-a");
		ownerB = await newUser("dono-b");
		manager = await newUser("gerente-a");
		outsider = await newUser("sem-vinculo");
		for (const [company, userId, role] of [
			[a, ownerA, "dono"],
			[b, ownerB, "dono"],
			[a, manager, "gerente"],
		] as const) {
			await createMembership(db, {
				companyId: company.companyId,
				userId,
				branchId: null,
				roleId: company.roleIds[role],
				level: "operate",
			});
		}
	});

	afterAll(async () => {
		if (companyIds.length) {
			await owner.query("DELETE FROM companies WHERE id = ANY($1)", [
				companyIds,
			]);
		}
		if (userIds.length) {
			await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		}
		await owner.end();
	});

	test("reads the defaults, and the owner can configure", async () => {
		expect(await companySettings(ownerA)).toEqual({
			settings: defaultSettings,
			canConfigure: true,
		});
	});

	test("saves only the options sent and keeps the others", async () => {
		const saved = await updateCompanySettings(ownerA, {
			sale_requires_quote: true,
			work_order_flow: "full",
		});
		expect(saved).toEqual({
			...defaultSettings,
			sale_requires_quote: true,
			work_order_flow: "full",
		});
		expect((await companySettings(ownerA))?.settings).toEqual(saved);

		// Alteração de outra opção não desfaz a anterior.
		const next = await updateCompanySettings(ownerA, { uses_branches: true });
		expect(next).toEqual({ ...saved, uses_branches: true });
	});

	test("without company.configure, reads but cannot save", async () => {
		const before = await companySettings(manager);
		expect(before?.canConfigure).toBe(false);

		await expect(
			updateCompanySettings(manager, { cash_register_required: true }),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		expect((await companySettings(manager))?.settings).toEqual(
			before?.settings,
		);
	});

	test("companies are isolated: saving in one does not touch the other", async () => {
		await updateCompanySettings(ownerB, { cash_register_required: true });
		expect((await companySettings(ownerB))?.settings).toEqual({
			...defaultSettings,
			cash_register_required: true,
		});
		expect(
			(await companySettings(ownerA))?.settings.cash_register_required,
		).toBe(false);
	});

	test("rejects an invalid work order flow", async () => {
		await expect(
			updateCompanySettings(ownerA, {
				work_order_flow: "banana" as "simple",
			}),
		).rejects.toThrow();
		expect((await companySettings(ownerA))?.settings.work_order_flow).toBe(
			"full",
		);
	});

	test("a user without an active company gets null", async () => {
		expect(await companySettings(outsider)).toBeNull();
		expect(
			await updateCompanySettings(outsider, { uses_branches: true }),
		).toBeNull();
	});
});
