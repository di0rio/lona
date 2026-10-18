import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import {
	addRole,
	createCompany,
	createMembership,
	DuplicateRoleError,
	listRoles,
	PermissionDeniedError,
	PresetRoleError,
	type RoleInput,
	RoleInUseError,
	removeRole,
	SelfLockoutError,
	updateRole,
} from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

describe.skipIf(!hasDatabase)("roles", () => {
	let owner: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let ownerA: string;
	let ownerB: string;
	let manager: string; // gerente de A: não tem roles.manage
	let outsider: string; // sem vínculo nenhum
	let clerk: string; // vai receber um vínculo com um cargo criado
	let companyA: string;

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
		clerk = await newUser("balconista-a");
		companyA = a.companyId;
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

	const roleNamed = async (userId: string, name: string) => {
		const found = (await listRoles(userId))?.roles.find((r) => r.name === name);
		if (!found) throw new Error(`cargo ${name} não encontrado`);
		return found;
	};

	test("lists the five ready roles with how many memberships use each", async () => {
		const view = await listRoles(ownerA);
		expect(view?.canManage).toBe(true);
		expect(view?.roles.map((r) => [r.name, r.isPreset]).sort()).toEqual(
			[
				["balconista", true],
				["dono", true],
				["financeiro", true],
				["gerente", true],
				["mecânico", true],
			].sort(),
		);
		const members = Object.fromEntries(
			(view?.roles ?? []).map((r) => [r.name, r.members]),
		);
		expect(members).toMatchObject({ dono: 1, gerente: 1, balconista: 0 });
		expect((await roleNamed(ownerA, "balconista")).limits).toEqual({
			max_discount_pct: 5,
			max_purchase_order: 0,
		});
		expect((await roleNamed(ownerA, "dono")).limits).toEqual({
			max_discount_pct: null,
			max_purchase_order: null,
		});
	});

	test("creates a role, and creates one by copying another", async () => {
		const blank: RoleInput = {
			name: " Estagiário ",
			permissions: ["inventory.view"],
			limits: { max_discount_pct: 0, max_purchase_order: null },
		};
		await addRole(ownerA, blank);
		expect(await roleNamed(ownerA, "Estagiário")).toMatchObject({
			isPreset: false,
			members: 0,
			permissions: ["inventory.view"],
			limits: { max_discount_pct: 0, max_purchase_order: null },
		});

		// A cópia é o que a tela faz: parte dos valores do cargo escolhido e muda o que quiser.
		const source = await roleNamed(ownerA, "balconista");
		await addRole(ownerA, {
			name: "Balconista sênior",
			permissions: [...source.permissions, "sale.cancel"],
			limits: { ...source.limits, max_discount_pct: 10 },
		});
		const copy = await roleNamed(ownerA, "Balconista sênior");
		expect(copy.permissions.sort()).toEqual(
			[...source.permissions, "sale.cancel"].sort(),
		);
		expect(copy.limits).toEqual({
			max_discount_pct: 10,
			max_purchase_order: 0,
		});
		// O original não muda.
		expect((await roleNamed(ownerA, "balconista")).permissions).toEqual(
			source.permissions,
		);
	});

	test("edits name, permissions and limits of a ready role and of a created one", async () => {
		const clerk = await roleNamed(ownerA, "balconista");
		expect(
			await updateRole(ownerA, clerk.id, {
				name: "atendente",
				permissions: ["inventory.view", "customer.view"],
				limits: { max_discount_pct: null, max_purchase_order: 1500.5 },
			}),
		).toBe(true);
		expect(await roleNamed(ownerA, "atendente")).toMatchObject({
			id: clerk.id,
			isPreset: true,
			limits: { max_discount_pct: null, max_purchase_order: 1500.5 },
		});
		expect((await roleNamed(ownerA, "atendente")).permissions.sort()).toEqual([
			"customer.view",
			"inventory.view",
		]);

		const trainee = await roleNamed(ownerA, "Estagiário");
		await updateRole(ownerA, trainee.id, {
			name: "Estagiário",
			permissions: [],
			limits: { max_discount_pct: 2, max_purchase_order: 0 },
		});
		expect((await roleNamed(ownerA, "Estagiário")).permissions).toEqual([]);
	});

	test("nobody takes roles.manage away from their own role", async () => {
		const ownRole = await roleNamed(ownerA, "dono");
		const withoutManage = ownRole.permissions.filter(
			(permission) => permission !== "roles.manage",
		);
		await expect(
			updateRole(ownerA, ownRole.id, {
				name: ownRole.name,
				permissions: withoutManage,
				limits: ownRole.limits,
			}),
		).rejects.toBeInstanceOf(SelfLockoutError);
		expect((await roleNamed(ownerA, "dono")).permissions).toContain(
			"roles.manage",
		);
	});

	test("a repeated name is refused", async () => {
		const input: RoleInput = {
			name: "gerente",
			permissions: [],
			limits: { max_discount_pct: 0, max_purchase_order: 0 },
		};
		await expect(addRole(ownerA, input)).rejects.toBeInstanceOf(
			DuplicateRoleError,
		);
		const trainee = await roleNamed(ownerA, "Estagiário");
		await expect(updateRole(ownerA, trainee.id, input)).rejects.toBeInstanceOf(
			DuplicateRoleError,
		);
	});

	test("deletes a created role nobody uses; refuses one in use and a ready one", async () => {
		const trainee = await roleNamed(ownerA, "Estagiário");
		expect(await removeRole(ownerA, trainee.id)).toBe(true);
		expect((await listRoles(ownerA))?.roles.map((r) => r.name)).not.toContain(
			"Estagiário",
		);
		const leftovers = await owner.query(
			"SELECT 1 FROM role_permissions WHERE role_id = $1 UNION ALL SELECT 1 FROM role_limits WHERE role_id = $1",
			[trainee.id],
		);
		expect(leftovers.rowCount).toBe(0);

		const senior = await roleNamed(ownerA, "Balconista sênior");
		await createMembership(drizzleAsOwner(owner), {
			companyId: companyA,
			userId: clerk,
			branchId: null,
			roleId: senior.id,
			level: "view",
		});
		await expect(removeRole(ownerA, senior.id)).rejects.toBeInstanceOf(
			RoleInUseError,
		);
		expect((await roleNamed(ownerA, "Balconista sênior")).members).toBe(1);

		const manager_ = await roleNamed(ownerA, "gerente");
		await expect(removeRole(ownerA, manager_.id)).rejects.toBeInstanceOf(
			PresetRoleError,
		);
		const dono = await roleNamed(ownerA, "dono");
		await expect(removeRole(ownerA, dono.id)).rejects.toBeInstanceOf(
			PresetRoleError,
		);
	});

	test("without roles.manage, reads the list but cannot write", async () => {
		const view = await listRoles(manager);
		expect(view?.canManage).toBe(false);
		expect(view?.roles.length).toBeGreaterThan(0);

		const input: RoleInput = {
			name: "Novo",
			permissions: ["roles.manage"],
			limits: { max_discount_pct: null, max_purchase_order: null },
		};
		await expect(addRole(manager, input)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		const clerk = await roleNamed(manager, "atendente");
		await expect(updateRole(manager, clerk.id, input)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		await expect(removeRole(manager, clerk.id)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		expect((await roleNamed(manager, "atendente")).permissions).toHaveLength(2);
	});

	test("companies are isolated: same name in each, no cross-reading or editing", async () => {
		await addRole(ownerB, {
			name: "Balconista sênior",
			permissions: [],
			limits: { max_discount_pct: 0, max_purchase_order: 0 },
		});
		expect((await roleNamed(ownerB, "Balconista sênior")).permissions).toEqual(
			[],
		);
		expect((await listRoles(ownerB))?.roles.map((r) => r.name)).not.toContain(
			"atendente",
		);

		// Não enxerga nem altera nem apaga cargo de outra empresa.
		const ofA = await roleNamed(ownerA, "atendente");
		const input: RoleInput = {
			name: "Invadido",
			permissions: [],
			limits: { max_discount_pct: 0, max_purchase_order: 0 },
		};
		expect(await updateRole(ownerB, ofA.id, input)).toBe(false);
		expect(await removeRole(ownerB, ofA.id)).toBe(false);
		expect((await roleNamed(ownerA, "atendente")).id).toBe(ofA.id);
	});

	test("a user without an active company gets null", async () => {
		const input: RoleInput = {
			name: "X",
			permissions: [],
			limits: { max_discount_pct: 0, max_purchase_order: 0 },
		};
		expect(await listRoles(outsider)).toBeNull();
		expect(await addRole(outsider, input)).toBeNull();
	});
});
