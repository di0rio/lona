import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import {
	addBranch,
	createCompany,
	createMembership,
	DuplicateBranchError,
	HeadquartersLockedError,
	listBranches,
	PermissionDeniedError,
	updateBranch,
} from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

describe.skipIf(!hasDatabase)("branches", () => {
	let owner: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let ownerA: string;
	let ownerB: string;
	let manager: string; // gerente de A: consulta as filiais, mas não tem company.configure
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

	const names = async (userId: string) =>
		(await listBranches(userId))?.branches.map((b) => b.name);

	test("lists the headquarters first, with the full formatted CNPJ", async () => {
		const view = await listBranches(ownerA);
		expect(view?.canConfigure).toBe(true);
		expect(view?.cnpjRoot).toBe("11.222.333");
		expect(view?.branches).toEqual([
			expect.objectContaining({
				name: "Matriz",
				order: 1,
				cnpj: "11.222.333/0001-81",
				isHeadquarters: true,
				active: true,
			}),
		]);
	});

	test("creates a branch whose CNPJ is the company root plus its own order", async () => {
		await addBranch(ownerA, { name: " Bauru ", code: "bau", order: 2 });
		const view = await listBranches(ownerA);
		expect(view?.branches.map((b) => [b.name, b.code, b.order])).toEqual([
			["Matriz", "MTZ", 1],
			["Bauru", "BAU", 2],
		]);
		expect(view?.branches[1].cnpj).toMatch(/^11\.222\.333\/0002-\d{2}$/);
	});

	test("a repeated order or code is refused with a clear error", async () => {
		await expect(
			addBranch(ownerA, { name: "Outra", code: "OUT", order: 2 }),
		).rejects.toMatchObject({ field: "order" });
		await expect(
			addBranch(ownerA, { name: "Outra", code: "BAU", order: 3 }),
		).rejects.toBeInstanceOf(DuplicateBranchError);
		expect(await names(ownerA)).toEqual(["Matriz", "Bauru"]);
	});

	test("edits name, code and order; keeps the uniqueness on edit", async () => {
		const id = await addBranch(ownerA, {
			name: "Marília",
			code: "MAR",
			order: 3,
		});
		if (!id) throw new Error("filial não criada");
		expect(
			await updateBranch(ownerA, id, { name: "Marília Centro", order: 4 }),
		).toBe(true);
		const edited = (await listBranches(ownerA))?.branches.find(
			(b) => b.id === id,
		);
		expect(edited).toMatchObject({ name: "Marília Centro", order: 4 });
		await expect(updateBranch(ownerA, id, { order: 2 })).rejects.toBeInstanceOf(
			DuplicateBranchError,
		);
	});

	test("deactivates and reactivates a branch, but never the headquarters", async () => {
		const view = await listBranches(ownerA);
		const bauru = view?.branches.find((b) => b.code === "BAU");
		const headquarters = view?.branches.find((b) => b.isHeadquarters);
		if (!bauru || !headquarters) throw new Error("filiais do cenário");

		await updateBranch(ownerA, bauru.id, { active: false });
		expect(
			(await listBranches(ownerA))?.branches.find((b) => b.id === bauru.id)
				?.active,
		).toBe(false);
		await updateBranch(ownerA, bauru.id, { active: true });
		expect(
			(await listBranches(ownerA))?.branches.find((b) => b.id === bauru.id)
				?.active,
		).toBe(true);

		await expect(
			updateBranch(ownerA, headquarters.id, { active: false }),
		).rejects.toBeInstanceOf(HeadquartersLockedError);
		await expect(
			updateBranch(ownerA, headquarters.id, { order: 5 }),
		).rejects.toBeInstanceOf(HeadquartersLockedError);
		// Nome e código da matriz podem mudar.
		expect(
			await updateBranch(ownerA, headquarters.id, { name: "Matriz Jaú" }),
		).toBe(true);
	});

	test("without company.configure, reads the list but cannot write", async () => {
		const view = await listBranches(manager);
		expect(view?.canConfigure).toBe(false);
		expect(view?.branches.length).toBeGreaterThan(0);

		const before = await names(manager);
		await expect(
			addBranch(manager, { name: "Nova", code: "NOV", order: 9 }),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		const id = view?.branches[1].id as string;
		await expect(
			updateBranch(manager, id, { active: false }),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		expect(await names(manager)).toEqual(before);
	});

	test("companies are isolated: same order and code in each, no cross-reading", async () => {
		await addBranch(ownerB, { name: "Bauru B", code: "BAU", order: 2 });
		expect(await names(ownerB)).toEqual(["Matriz", "Bauru B"]);
		expect(await names(ownerA)).not.toContain("Bauru B");

		// Não enxerga nem altera filial de outra empresa.
		const ofA = (await listBranches(ownerA))?.branches[1].id as string;
		expect(await updateBranch(ownerB, ofA, { name: "Invadida" })).toBe(false);
		expect(await names(ownerA)).not.toContain("Invadida");
	});

	test("a user without an active company gets null", async () => {
		expect(await listBranches(outsider)).toBeNull();
		expect(
			await addBranch(outsider, { name: "X", code: "XX", order: 2 }),
		).toBeNull();
	});
});
