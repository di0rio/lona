import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import {
	createBranch,
	createCompany,
	createMembership,
	DuplicateMembershipError,
	InvalidMembershipError,
	listUsers,
	PermissionDeniedError,
	SelfLockoutError,
	updateUserMemberships,
} from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

describe.skipIf(!hasDatabase)("users", () => {
	let owner: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let ownerA: string;
	let ownerB: string;
	let manager: string; // gerente de A: tem users.manage
	let clerk: string; // balconista de A: não tem users.manage
	let companyA: {
		companyId: string;
		headquartersId: string;
		roleIds: Record<string, string>;
	};
	let companyB: { companyId: string; roleIds: Record<string, string> };
	let bauru: string;
	let closed: string; // filial inativa

	beforeAll(async () => {
		owner = connectAsOwner();
		const db = drizzleAsOwner(owner);
		const newUser = async (nickname: string) => {
			const id = await createTestUser(owner, nickname);
			userIds.push(id);
			return id;
		};
		companyA = await createCompany(db, {
			name: "Empresa A",
			cnpjRoot: "11222333",
			expiresAt: TWO_HOURS_FROM_NOW(),
			settings: { uses_branches: true },
		});
		companyB = await createCompany(db, {
			name: "Empresa B",
			cnpjRoot: "11222333",
			expiresAt: TWO_HOURS_FROM_NOW(),
		});
		companyIds.push(companyA.companyId, companyB.companyId);
		bauru = await createBranch(db, {
			companyId: companyA.companyId,
			name: "Bauru",
			code: "BAU",
			cnpjRoot: "11222333",
			order: 2,
		});
		closed = await createBranch(db, {
			companyId: companyA.companyId,
			name: "Fechada",
			code: "FEC",
			cnpjRoot: "11222333",
			order: 3,
		});
		await owner.query("UPDATE branches SET active = false WHERE id = $1", [
			closed,
		]);
		ownerA = await newUser("dono-a");
		ownerB = await newUser("dono-b");
		manager = await newUser("gerente-a");
		clerk = await newUser("balconista-a");
		for (const [company, userId, role, branchId] of [
			[companyA, ownerA, "dono", null],
			[companyB, ownerB, "dono", null],
			[companyA, manager, "gerente", null],
			[companyA, clerk, "balconista", companyA.headquartersId],
		] as const) {
			await createMembership(db, {
				companyId: company.companyId,
				userId,
				branchId,
				roleId: company.roleIds[role],
				level: "operate",
			});
		}
	});

	afterAll(async () => {
		await owner.query("DELETE FROM companies WHERE id = ANY($1)", [companyIds]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await owner.end();
	});

	const role = (name: string) => companyA.roleIds[name];
	const membershipsOf = async (viewer: string, target: string) =>
		(await listUsers(viewer))?.users.find((u) => u.id === target)?.memberships;

	test("lists the company users with their memberships, in the company only", async () => {
		const view = await listUsers(ownerA);
		expect(view?.canManage).toBe(true);
		expect(view?.usesBranches).toBe(true);
		expect(view?.users.map((u) => u.id).sort()).toEqual(
			[ownerA, manager, clerk].sort(),
		);
		expect(await membershipsOf(ownerA, clerk)).toEqual([
			{
				branchId: companyA.headquartersId,
				branchName: "Matriz",
				roleId: role("balconista"),
				roleName: "balconista",
				level: "operate",
			},
		]);
		expect((await membershipsOf(ownerA, ownerA))?.[0]).toMatchObject({
			branchId: null,
			branchName: null,
			roleName: "dono",
		});
		expect(view?.roles.map((r) => r.name)).toContain("mecânico");
		expect(view?.branches.map((b) => b.name)).toEqual([
			"Matriz",
			"Bauru",
			"Fechada",
		]);
		expect((await listUsers(clerk))?.canManage).toBe(false);
		// Outra empresa vê só os seus.
		expect((await listUsers(ownerB))?.users.map((u) => u.id)).toEqual([ownerB]);
	});

	test("adds, changes and removes memberships", async () => {
		const headquarters = companyA.headquartersId;
		await updateUserMemberships(ownerA, clerk, [
			{ branchId: headquarters, roleId: role("balconista"), level: "operate" },
			{ branchId: bauru, roleId: role("mecânico"), level: "view" },
		]);
		expect(await membershipsOf(ownerA, clerk)).toMatchObject([
			{ branchId: bauru, roleName: "mecânico", level: "view" },
			{ branchId: headquarters, roleName: "balconista", level: "operate" },
		]);

		await updateUserMemberships(ownerA, clerk, [
			{ branchId: headquarters, roleId: role("gerente"), level: "view" },
		]);
		expect(await membershipsOf(ownerA, clerk)).toMatchObject([
			{ branchId: headquarters, roleName: "gerente", level: "view" },
		]);

		// Trocar a filial do único vínculo (apaga o antigo, cria o novo).
		await updateUserMemberships(ownerA, clerk, [
			{ branchId: bauru, roleId: role("gerente"), level: "view" },
		]);
		expect(await membershipsOf(ownerA, clerk)).toMatchObject([
			{ branchId: bauru, roleName: "gerente" },
		]);

		await updateUserMemberships(ownerA, clerk, []);
		expect(await membershipsOf(ownerA, clerk)).toBeUndefined();
		expect(await updateUserMemberships(ownerA, clerk, [])).toBe(false);

		// Volta para os outros testes.
		await owner.query(
			"INSERT INTO memberships (company_id, user_id, branch_id, role_id, level) VALUES ($1, $2, $3, $4, 'operate')",
			[companyA.companyId, clerk, headquarters, role("balconista")],
		);
	});

	test("refuses a duplicate membership in the same branch (database constraint)", async () => {
		const item = (branchId: string | null) => ({
			branchId,
			roleId: role("balconista"),
			level: "operate" as const,
		});
		await expect(
			updateUserMemberships(ownerA, clerk, [item(bauru), item(bauru)]),
		).rejects.toThrow(DuplicateMembershipError);
		await expect(
			updateUserMemberships(ownerA, clerk, [item(null), item(null)]),
		).rejects.toThrow(DuplicateMembershipError);
		// Duas vezes o vínculo que já existia também.
		await expect(
			updateUserMemberships(ownerA, clerk, [
				item(companyA.headquartersId),
				item(companyA.headquartersId),
			]),
		).rejects.toThrow(DuplicateMembershipError);
		// A transação desfez tudo.
		expect(await membershipsOf(ownerA, clerk)).toMatchObject([
			{ branchId: companyA.headquartersId, roleName: "balconista" },
		]);
	});

	test("does not give a new membership on an inactive branch, but keeps an old one", async () => {
		await expect(
			updateUserMemberships(ownerA, clerk, [
				{ branchId: closed, roleId: role("balconista"), level: "view" },
			]),
		).rejects.toThrow(/inativa/);

		await owner.query(
			"INSERT INTO memberships (company_id, user_id, branch_id, role_id, level) VALUES ($1, $2, $3, $4, 'view')",
			[companyA.companyId, clerk, closed, role("balconista")],
		);
		await updateUserMemberships(ownerA, clerk, [
			{
				branchId: companyA.headquartersId,
				roleId: role("balconista"),
				level: "operate",
			},
			{ branchId: closed, roleId: role("mecânico"), level: "view" },
		]);
		expect(await membershipsOf(ownerA, clerk)).toMatchObject([
			{ branchId: closed, roleName: "mecânico" },
			{ branchId: companyA.headquartersId },
		]);
		await updateUserMemberships(ownerA, clerk, [
			{
				branchId: companyA.headquartersId,
				roleId: role("balconista"),
				level: "operate",
			},
		]);
	});

	test("refuses unknown role or branch, and a role or branch of another company", async () => {
		await expect(
			updateUserMemberships(ownerA, clerk, [
				{
					branchId: null,
					roleId: companyB.roleIds.dono,
					level: "operate",
				},
			]),
		).rejects.toThrow(InvalidMembershipError);
		await expect(
			updateUserMemberships(ownerA, clerk, [
				{
					branchId: "019db000-0000-7000-8000-000000000000",
					roleId: role("balconista"),
					level: "operate",
				},
			]),
		).rejects.toThrow(InvalidMembershipError);
	});

	test("refuses a branch when the company does not use branches", async () => {
		await owner.query(
			"UPDATE companies SET settings = settings || '{\"uses_branches\": false}'::jsonb WHERE id = $1",
			[companyA.companyId],
		);
		try {
			await expect(
				updateUserMemberships(ownerA, clerk, [
					{ branchId: bauru, roleId: role("balconista"), level: "operate" },
				]),
			).rejects.toThrow(/não usa filiais/);
			expect((await listUsers(ownerA))?.usesBranches).toBe(false);
		} finally {
			await owner.query(
				"UPDATE companies SET settings = settings || '{\"uses_branches\": true}'::jsonb WHERE id = $1",
				[companyA.companyId],
			);
		}
	});

	test("does not let someone remove or demote their own users.manage", async () => {
		await expect(updateUserMemberships(manager, manager, [])).rejects.toThrow(
			SelfLockoutError,
		);
		await expect(
			updateUserMemberships(manager, manager, [
				{ branchId: null, roleId: role("balconista"), level: "operate" },
			]),
		).rejects.toThrow(SelfLockoutError);
		expect(await membershipsOf(ownerA, manager)).toMatchObject([
			{ roleName: "gerente" },
		]);

		// Mudar filial ou nível do próprio vínculo, mantendo o cargo, pode.
		await updateUserMemberships(manager, manager, [
			{ branchId: null, roleId: role("gerente"), level: "view" },
			{ branchId: bauru, roleId: role("gerente"), level: "operate" },
		]);
		expect(await membershipsOf(ownerA, manager)).toHaveLength(2);
		await updateUserMemberships(manager, manager, [
			{ branchId: null, roleId: role("gerente"), level: "operate" },
		]);
		// Outra pessoa pode rebaixar o gerente.
		await updateUserMemberships(ownerA, manager, [
			{ branchId: null, roleId: role("balconista"), level: "operate" },
		]);
		await updateUserMemberships(ownerA, manager, [
			{ branchId: null, roleId: role("gerente"), level: "operate" },
		]);
	});

	test("refuses without users.manage and for people outside the company", async () => {
		await expect(updateUserMemberships(clerk, clerk, [])).rejects.toThrow(
			PermissionDeniedError,
		);
		await expect(updateUserMemberships(clerk, manager, [])).rejects.toThrow(
			PermissionDeniedError,
		);
		expect(await membershipsOf(ownerA, manager)).toHaveLength(1);
	});

	test("only who manages users sees e-mails", async () => {
		const asOwner = await listUsers(ownerA);
		expect(asOwner?.users.every((u) => u.email !== null)).toBe(true);
		const asClerk = await listUsers(clerk);
		expect(asClerk?.users.length).toBeGreaterThan(0);
		expect(asClerk?.users.every((u) => u.email === null)).toBe(true);
	});

	test("does not touch users of another company", async () => {
		await expect(updateUserMemberships(ownerB, clerk, [])).resolves.toBe(false);
		await expect(updateUserMemberships(ownerA, ownerB, [])).resolves.toBe(
			false,
		);
		expect(await membershipsOf(ownerA, clerk)).toHaveLength(1);
		expect(await membershipsOf(ownerB, ownerB)).toHaveLength(1);
	});
});
