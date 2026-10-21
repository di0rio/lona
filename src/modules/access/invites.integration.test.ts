import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	connectAsOwner,
	createTestUser,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import {
	AnonymousInviteError,
	acceptInvite,
	createBranch,
	createCompany,
	createInvite,
	createMembership,
	DuplicateMembershipError,
	findInvite,
	InvalidInviteError,
	InvalidMembershipError,
	listUsers,
	PermissionDeniedError,
	RoleEscalationError,
	revokeInvite,
	userActiveCompany,
} from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);

describe.skipIf(!hasDatabase)("invites", () => {
	let owner: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let ownerA: string;
	let ownerB: string;
	let clerk: string; // balconista de A, só na matriz: não tem users.manage
	let companyA: {
		companyId: string;
		headquartersId: string;
		roleIds: Record<string, string>;
	};
	let companyB: { companyId: string; roleIds: Record<string, string> };
	let bauru: string;

	beforeAll(async () => {
		owner = connectAsOwner();
		const db = drizzleAsOwner(owner);
		// A é empresa real (sem vencimento): o teste de empresa ativa compara com uma demonstração mais nova.
		companyA = await createCompany(db, {
			name: "Empresa A",
			cnpjRoot: "11222333",
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
		ownerA = await newUser("dono-a");
		ownerB = await newUser("dono-b");
		clerk = await newUser("balconista-a");
		for (const [company, userId, role, branchId] of [
			[companyA, ownerA, "dono", null],
			[companyB, ownerB, "dono", null],
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

	async function newUser(nickname: string) {
		const id = await createTestUser(owner, nickname);
		userIds.push(id);
		return id;
	}

	const hash = (token: string) =>
		createHash("sha256").update(token).digest("hex");
	const membershipCount = (userId: string) =>
		owner
			.query(
				"SELECT count(*)::int AS n FROM memberships WHERE user_id = $1 AND company_id = $2",
				[userId, companyA.companyId],
			)
			.then(({ rows }) => rows[0].n as number);
	const clerkInvite = async (branchId: string | null = bauru) => {
		const invite = await createInvite(ownerA, {
			branchId,
			roleId: companyA.roleIds.balconista,
			level: "operate",
		});
		if (!invite) throw new Error("sem empresa ativa");
		return invite;
	};

	test("creating stores the hash of the token, never the token, and lasts 48 hours", async () => {
		const invite = await clerkInvite();
		expect(invite.token.length).toBeGreaterThanOrEqual(43); // 32 bytes em base64url

		const { rows } = await owner.query(
			"SELECT token_hash, to_jsonb(invites)::text AS everything FROM invites WHERE id = $1",
			[invite.id],
		);
		expect(rows[0].token_hash).toBe(hash(invite.token));
		expect(rows[0].everything).not.toContain(invite.token);

		const hours = (invite.expiresAt.getTime() - Date.now()) / 3_600_000;
		// Folga pequena: o relógio do banco e o do teste não são o mesmo.
		expect(Math.abs(hours - 48)).toBeLessThan(0.1);
	});

	test("the link shows who invited, the company and the membership, even without a login", async () => {
		const invite = await clerkInvite();
		expect(await findInvite(invite.token)).toEqual({
			companyName: "Empresa A",
			usesBranches: true,
			inviterName: expect.stringContaining("dono-a"),
			roleName: "balconista",
			branchName: "Bauru",
			level: "operate",
		});
		expect(await findInvite("token-que-nao-existe")).toBeNull();
	});

	test("accepting creates the membership and marks the invite as used", async () => {
		const invite = await clerkInvite();
		const guest = await newUser("convidado");

		expect(await acceptInvite(guest, invite.token)).toBe(companyA.companyId);

		const { rows } = await owner.query(
			"SELECT branch_id, level, role_id FROM memberships WHERE user_id = $1",
			[guest],
		);
		expect(rows).toEqual([
			{
				branch_id: bauru,
				level: "operate",
				role_id: companyA.roleIds.balconista,
			},
		]);
		const used = await owner.query(
			"SELECT used_at, used_by FROM invites WHERE id = $1",
			[invite.id],
		);
		expect(used.rows[0].used_at).not.toBeNull();
		expect(used.rows[0].used_by).toBe(guest);
		expect(await findInvite(invite.token)).toBeNull();
	});

	test("the second use of the same link is refused", async () => {
		const invite = await clerkInvite();
		await acceptInvite(await newUser("primeiro"), invite.token);
		await expect(
			acceptInvite(await newUser("segundo"), invite.token),
		).rejects.toBeInstanceOf(InvalidInviteError);
	});

	test("concurrent accepts: only one wins and only one membership is created", async () => {
		const invite = await clerkInvite();
		const first = await newUser("corrida-1");
		const second = await newUser("corrida-2");

		// Dois usuários, e cada um com duas abas.
		const results = await Promise.allSettled([
			acceptInvite(first, invite.token),
			acceptInvite(first, invite.token),
			acceptInvite(second, invite.token),
			acceptInvite(second, invite.token),
		]);

		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		for (const result of results) {
			if (result.status === "rejected") {
				expect(result.reason).toBeInstanceOf(InvalidInviteError);
			}
		}
		expect(
			(await membershipCount(first)) + (await membershipCount(second)),
		).toBe(1);
	});

	test("an expired link is refused", async () => {
		const invite = await clerkInvite();
		await owner.query(
			"UPDATE invites SET expires_at = now() - interval '1 minute' WHERE id = $1",
			[invite.id],
		);

		expect(await findInvite(invite.token)).toBeNull();
		await expect(
			acceptInvite(await newUser("tarde"), invite.token),
		).rejects.toBeInstanceOf(InvalidInviteError);
	});

	test("a revoked link is refused", async () => {
		const invite = await clerkInvite();
		expect(await revokeInvite(ownerA, invite.id)).toBe(true);
		// Revogar de novo não acha nada pendente.
		expect(await revokeInvite(ownerA, invite.id)).toBe(false);

		expect(await findInvite(invite.token)).toBeNull();
		await expect(
			acceptInvite(await newUser("revogado"), invite.token),
		).rejects.toBeInstanceOf(InvalidInviteError);
	});

	test("without users.manage the user neither creates nor revokes", async () => {
		await expect(
			createInvite(clerk, {
				branchId: null,
				roleId: companyA.roleIds.balconista,
				level: "view",
			}),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		const invite = await clerkInvite();
		await expect(revokeInvite(clerk, invite.id)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		expect(await findInvite(invite.token)).not.toBeNull();
	});

	test("a manager does not invite someone as owner", async () => {
		const manager = await newUser("gerente-a");
		await owner.query(
			"INSERT INTO memberships (company_id, user_id, role_id, level) VALUES ($1, $2, $3, 'operate')",
			[companyA.companyId, manager, companyA.roleIds.gerente],
		);
		await expect(
			createInvite(manager, {
				branchId: null,
				roleId: companyA.roleIds.dono,
				level: "operate",
			}),
		).rejects.toBeInstanceOf(RoleEscalationError);
		// Cargo com permissões que o gerente também tem, ele convida.
		await expect(
			createInvite(manager, {
				branchId: null,
				roleId: companyA.roleIds.gerente,
				level: "operate",
			}),
		).resolves.toMatchObject({ token: expect.any(String) });
	});

	test("companies neither see nor revoke the invites of each other", async () => {
		const invite = await clerkInvite();

		expect(await revokeInvite(ownerB, invite.id)).toBe(false);
		expect(await findInvite(invite.token)).not.toBeNull();
		expect((await listUsers(ownerB))?.invites).toEqual([]);

		const own = (await listUsers(ownerA))?.invites.map((i) => i.id);
		expect(own).toContain(invite.id);
	});

	test("the pending list has who created, the membership and the expiry; only for who manages", async () => {
		const invite = await clerkInvite();
		const used = await clerkInvite();
		await acceptInvite(await newUser("lista"), used.token);
		const revoked = await clerkInvite();
		await revokeInvite(ownerA, revoked.id);

		const pending = (await listUsers(ownerA))?.invites ?? [];
		const ids = pending.map((i) => i.id);
		expect(ids).toContain(invite.id);
		expect(ids).not.toContain(used.id);
		expect(ids).not.toContain(revoked.id);
		expect(pending.find((i) => i.id === invite.id)).toMatchObject({
			createdByName: expect.stringContaining("dono-a"),
			branchName: "Bauru",
			roleName: "balconista",
			level: "operate",
		});

		expect((await listUsers(clerk))?.invites).toEqual([]);
	});

	test("someone who already has the membership is refused with a clear error, and the link stays valid", async () => {
		const invite = await clerkInvite(companyA.headquartersId);

		await expect(acceptInvite(clerk, invite.token)).rejects.toBeInstanceOf(
			DuplicateMembershipError,
		);
		expect(await findInvite(invite.token)).not.toBeNull();

		// O link não foi gasto: outra pessoa ainda usa.
		const other = await newUser("outra-pessoa");
		await expect(acceptInvite(other, invite.token)).resolves.toBe(
			companyA.companyId,
		);
	});

	test("an anonymous visitor cannot accept", async () => {
		const invite = await clerkInvite();
		const visitor = await newUser("visitante");
		await owner.query(
			"UPDATE auth.users SET is_anonymous = true WHERE id = $1",
			[visitor],
		);

		await expect(acceptInvite(visitor, invite.token)).rejects.toBeInstanceOf(
			AnonymousInviteError,
		);
		expect(await findInvite(invite.token)).not.toBeNull();
	});

	test("the invited company becomes the active one, even over a newer demonstration", async () => {
		const db = drizzleAsOwner(owner);
		const guest = await newUser("com-demo");
		const demo = await createCompany(db, {
			name: "Demonstração do convidado",
			cnpjRoot: "99888777",
			expiresAt: TWO_HOURS_FROM_NOW(),
		});
		companyIds.push(demo.companyId);
		await createMembership(db, {
			companyId: demo.companyId,
			userId: guest,
			branchId: null,
			roleId: demo.roleIds.dono,
			level: "operate",
		});
		expect((await userActiveCompany(guest))?.companyId).toBe(demo.companyId);

		await acceptInvite(guest, (await clerkInvite()).token);

		expect((await userActiveCompany(guest))?.companyId).toBe(
			companyA.companyId,
		);
	});

	test("the membership of the invite follows the rules of the users screen", async () => {
		await expect(
			createInvite(ownerA, {
				branchId: null,
				roleId: randomUUID(),
				level: "view",
			}),
		).rejects.toBeInstanceOf(InvalidMembershipError);
		await expect(
			createInvite(ownerA, {
				branchId: randomUUID(),
				roleId: companyA.roleIds.balconista,
				level: "view",
			}),
		).rejects.toBeInstanceOf(InvalidMembershipError);
		// A empresa B não usa filiais: o vínculo só vale para todas.
		const { rows } = await owner.query(
			"SELECT id FROM branches WHERE company_id = $1",
			[companyB.companyId],
		);
		await expect(
			createInvite(ownerB, {
				branchId: rows[0].id,
				roleId: companyB.roleIds.balconista,
				level: "view",
			}),
		).rejects.toBeInstanceOf(InvalidMembershipError);
	});
});
