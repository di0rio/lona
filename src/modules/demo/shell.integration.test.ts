import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { dashboardSummary, panelShell, viewAsTargets } from "@/modules/access";
import { connectAsOwner, createTestUser, hasDatabase } from "@/test/database";
import { startDemo } from "./service";

// Conta quantas transações com contexto o código abre, pra provar que a casca lê tudo numa só.
const transactions = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/db/client", async (original) => {
	const real = await original<typeof import("@/db/client")>();
	return {
		...real,
		withContext: (...args: Parameters<typeof real.withContext>) => {
			transactions.count++;
			return real.withContext(...args);
		},
	};
});

describe.skipIf(!hasDatabase)("panelShell", () => {
	let owner: pg.Pool;
	let ownerId: string;
	let outsiderId: string;
	let companyId: string;

	beforeAll(async () => {
		owner = connectAsOwner();
		ownerId = await createTestUser(owner, "dono-casca");
		outsiderId = await createTestUser(owner, "sem-vinculo-casca");
		companyId = await startDemo(ownerId);
	});

	afterAll(async () => {
		// Apagar a empresa leva junto as pessoas fictícias dela (demo_company_id).
		await owner.query("DELETE FROM companies WHERE id = $1", [companyId]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [
			[ownerId, outsiderId],
		]);
		await owner.end();
	});

	test("gives the same data as the two separate reads, in a single transaction", async () => {
		const expected = {
			summary: await dashboardSummary(ownerId),
			targets: await viewAsTargets(ownerId),
		};
		expect(expected.summary?.company.id).toBe(companyId);
		expect(expected.targets.length).toBeGreaterThan(0);

		transactions.count = 0;
		expect(await panelShell(ownerId, false)).toEqual(expected);
		expect(transactions.count).toBe(1);
	});

	test("does not offer people to view as when the session already is one", async () => {
		const shell = await panelShell(ownerId, true);
		expect(shell.summary?.company.id).toBe(companyId);
		expect(shell.targets).toEqual([]);
	});

	test("is empty for a user without an active company", async () => {
		expect(await panelShell(outsiderId, false)).toEqual({
			summary: null,
			targets: [],
		});
	});
});
