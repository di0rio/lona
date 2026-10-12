import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { type Transaction, withContext } from "@/db/client";
import { branchCnpj } from "./cnpj";
import { readyRoles } from "./ready-roles";
import {
	branches,
	type Color,
	type CompanySettings,
	companies,
	defaultSettings,
	type Level,
	memberships,
	roleLimits,
	rolePermissions,
	roles,
} from "./schema";

type Writable = Pick<Transaction, "insert">;

export type NewCompany = {
	name: string;
	cnpjRoot: string;
	color?: Color;
	settings?: Partial<CompanySettings>;
	isTemplate?: boolean;
	expiresAt?: Date | null;
	/** A matriz nasce junto (ADR 0003); por padrão, "Matriz" / MTZ. */
	headquarters?: { name: string; code: string };
};

/**
 * Cria a empresa já com a matriz (ADR 0003) e os cargos prontos. Roda com a conexão do dono (seed, testes, ou o
 * futuro cadastro), porque o app não tem permissão de inserir em companies.
 */
export async function createCompany(tx: Writable, data: NewCompany) {
	const [company] = await tx
		.insert(companies)
		.values({
			name: data.name,
			cnpjRoot: data.cnpjRoot,
			color: data.color,
			isTemplate: data.isTemplate,
			expiresAt: data.expiresAt,
			settings: { ...defaultSettings, ...data.settings },
		})
		.returning({ id: companies.id });

	const [headquarters] = await tx
		.insert(branches)
		.values({
			companyId: company.id,
			name: data.headquarters?.name ?? "Matriz",
			code: data.headquarters?.code ?? "MTZ",
			cnpj: branchCnpj(data.cnpjRoot, 1),
			isHeadquarters: true,
		})
		.returning({ id: branches.id });

	const created = await tx
		.insert(roles)
		.values(
			readyRoles.map((ready) => ({
				companyId: company.id,
				name: ready.name,
				isPreset: true,
			})),
		)
		.returning({ id: roles.id, name: roles.name });
	const roleIds = Object.fromEntries(created.map((c) => [c.name, c.id]));

	await tx.insert(rolePermissions).values(
		readyRoles.flatMap((ready) =>
			ready.permissions.map((permission) => ({
				companyId: company.id,
				roleId: roleIds[ready.name],
				permission,
			})),
		),
	);
	await tx.insert(roleLimits).values(
		readyRoles.flatMap((ready) =>
			Object.entries(ready.limits).map(([limitKey, value]) => ({
				companyId: company.id,
				roleId: roleIds[ready.name],
				limitKey,
				value,
			})),
		),
	);

	return { companyId: company.id, headquartersId: headquarters.id, roleIds };
}

export type NewBranch = {
	companyId: string;
	name: string;
	code: string;
	cnpjRoot: string;
	/** Número de ordem depois da barra: 2 vira /0002. */
	order: number;
};

export async function createBranch(tx: Writable, data: NewBranch) {
	const [branch] = await tx
		.insert(branches)
		.values({
			companyId: data.companyId,
			name: data.name,
			code: data.code,
			cnpj: branchCnpj(data.cnpjRoot, data.order),
		})
		.returning({ id: branches.id });
	return branch.id;
}

export type NewMembership = {
	companyId: string;
	userId: string;
	/** null = todas as filiais. */
	branchId: string | null;
	roleId: string;
	level: Level;
};

export async function createMembership(tx: Writable, data: NewMembership) {
	await tx.insert(memberships).values(data);
}

/**
 * A empresa ativa mais recente do usuário, ou null (nunca teve, ou a demonstração venceu).
 * Dentro de uma transação que já tem o contexto do usuário, passe `tx` para não abrir outra.
 */
export async function userActiveCompany(userId: string, tx?: Transaction) {
	const find = async (t: Transaction) => {
		const { rows } = await t.execute<{
			company_id: string;
			name: string;
			expires_at: Date | null;
		}>(sql`SELECT * FROM lona_user_companies() LIMIT 1`);
		const company = rows[0];
		return company
			? {
					companyId: company.company_id,
					name: company.name,
					expiresAt: company.expires_at,
				}
			: null;
	};
	return tx ? find(tx) : withContext({ userId }, find);
}

export type DashboardSummary = {
	company: { id: string; name: string; expiresAt: Date | null; color: Color };
	branch: { name: string; code: string };
	role: string;
	level: Level;
};

/** Empresa, filial atual (a matriz, ou a primeira que o usuário consulta) e cargo, para a tela provisória do painel. */
export async function dashboardSummary(
	userId: string,
): Promise<DashboardSummary | null> {
	// Acha a empresa ativa e lê filial/vínculo na mesma transação (REPEATABLE READ), senão um
	// `resetDemo` concorrente pode trocar a empresa entre as duas leituras e devolver 404.
	return withContext(
		{ userId },
		async (tx) => {
			const active = await userActiveCompany(userId, tx);
			if (!active) return null;

			await tx.execute(
				sql`SELECT set_config('app.company_id', ${active.companyId}, true)`,
			);

			// lona_user_companies() não devolve cor; um SELECT extra na mesma transação evita migration só pra isso.
			const [companyRow] = await tx
				.select({ color: companies.color })
				.from(companies)
				.where(eq(companies.id, active.companyId))
				.limit(1);

			const [branch] = await tx
				.select({ id: branches.id, name: branches.name, code: branches.code })
				.from(branches)
				.orderBy(desc(branches.isHeadquarters), asc(branches.name))
				.limit(1);
			if (!branch) return null;

			// Vínculo específico da filial primeiro; o de "todas" cobre quando não houver.
			const [membership] = await tx
				.select({ role: roles.name, level: memberships.level })
				.from(memberships)
				.innerJoin(
					roles,
					and(
						eq(roles.companyId, memberships.companyId),
						eq(roles.id, memberships.roleId),
					),
				)
				.where(
					and(
						eq(memberships.userId, userId),
						or(
							isNull(memberships.branchId),
							eq(memberships.branchId, branch.id),
						),
					),
				)
				.orderBy(sql`${memberships.branchId} IS NULL`)
				.limit(1);
			if (!membership) return null;

			return {
				company: {
					id: active.companyId,
					name: active.name,
					expiresAt: active.expiresAt,
					color: companyRow?.color ?? "gray",
				},
				branch: { name: branch.name, code: branch.code },
				role: membership.role,
				level: membership.level,
			};
		},
		{ repeatableRead: true },
	);
}
