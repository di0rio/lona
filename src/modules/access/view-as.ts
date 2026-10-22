import { and, asc, eq, sql } from "drizzle-orm";
import { type Transaction, withContext } from "@/db/client";
import { branches, memberships, roles, users } from "./schema";
import { enterActiveCompany } from "./service";

/** A quem o dono pode "ver como": uma pessoa fictícia da demonstração dele. */
export type ViewAsTarget = {
	id: string;
	name: string;
	role: string;
	branch: string | null;
};

/**
 * A demonstração ativa do usuário, se ele é dono dela. "Dono" é quem tem `company.configure` (só o cargo dono
 * nasce com ela; o nome do cargo é editável, a permissão não depende dele). Empresa de verdade (sem
 * `expires_at`) nunca passa. A transação já tem a empresa ativa no contexto (`enterActiveCompany`).
 */
async function ownedDemo(tx: Transaction, userId: string, active: Active) {
	if (!active?.expiresAt) return null;
	const result = await tx.execute(
		sql`SELECT 1 FROM memberships m
			JOIN role_permissions rp ON rp.company_id = m.company_id AND rp.role_id = m.role_id
			WHERE m.company_id = ${active.companyId} AND m.user_id = ${userId} AND rp.permission = 'company.configure'
			LIMIT 1`,
	);
	return result.rowCount ? active.companyId : null;
}

type Active = Awaited<ReturnType<typeof enterActiveCompany>>;

/** As pessoas fictícias da demonstração do dono, numa transação que já entrou na empresa ativa. */
export async function targetsOf(
	tx: Transaction,
	userId: string,
	active: Active,
): Promise<ViewAsTarget[]> {
	const companyId = await ownedDemo(tx, userId, active);
	if (!companyId) return [];
	const rows = await tx
		.select({
			id: users.id,
			name: users.name,
			role: roles.name,
			branch: branches.name,
		})
		.from(users)
		.innerJoin(memberships, eq(memberships.userId, users.id))
		.innerJoin(
			roles,
			and(
				eq(roles.companyId, memberships.companyId),
				eq(roles.id, memberships.roleId),
			),
		)
		.leftJoin(
			branches,
			and(
				eq(branches.companyId, memberships.companyId),
				eq(branches.id, memberships.branchId),
			),
		)
		.where(
			and(
				eq(users.demoCompanyId, companyId),
				eq(memberships.companyId, companyId),
			),
		)
		.orderBy(asc(users.name), asc(users.id));
	// Uma linha por pessoa: o primeiro vínculo dela (as fictícias têm um só, menos a gerente, que tem dois).
	return [...new Map(rows.map((row) => [row.id, row])).values()];
}

/** As pessoas fictícias da demonstração do dono (vazio para quem não é dono ou não está numa demonstração). */
export async function viewAsTargets(userId: string): Promise<ViewAsTarget[]> {
	return withContext(
		{ userId },
		async (tx) => targetsOf(tx, userId, await enterActiveCompany(tx)),
		{ repeatableRead: true },
	);
}

/** O dono pode ver como esta pessoa? Só uma fictícia da MESMA demonstração dele. */
export async function canViewAs(ownerId: string, targetId: string) {
	return (await viewAsTargets(ownerId)).some((t) => t.id === targetId);
}
