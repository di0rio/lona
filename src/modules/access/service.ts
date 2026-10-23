import { createHash, randomBytes } from "node:crypto";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import { type Transaction, withContext } from "@/db/client";
import { branchCnpj, formatCnpj } from "./cnpj";
import { type Limit, limits, type Permission } from "./permissions";
import { readyRoles } from "./ready-roles";
import {
	branches,
	type Color,
	type CompanySettings,
	companies,
	defaultSettings,
	invites,
	type Level,
	memberships,
	roleLimits,
	rolePermissions,
	roles,
	users,
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
	return tx
		? findActiveCompany(tx, false)
		: withContext({ userId }, (t) => findActiveCompany(t, false));
}

/**
 * Como `userActiveCompany`, e já seta a empresa achada no contexto do RLS, na mesma ida ao banco.
 * A transação precisa ter o contexto do usuário.
 */
export function enterActiveCompany(tx: Transaction) {
	return findActiveCompany(tx, true);
}

async function findActiveCompany(tx: Transaction, enter: boolean) {
	// O LIMIT 1 fica na subconsulta: set_config é volátil e só pode rodar na linha que sobrou.
	const { rows } = await tx.execute<{
		company_id: string;
		name: string;
		expires_at: Date | null;
	}>(
		enter
			? sql`SELECT c.*, set_config('app.company_id', c.company_id::text, true) FROM (SELECT * FROM lona_user_companies() LIMIT 1) c`
			: sql`SELECT * FROM lona_user_companies() LIMIT 1`,
	);
	const company = rows[0];
	return company
		? {
				companyId: company.company_id,
				name: company.name,
				expiresAt: company.expires_at,
			}
		: null;
}

export type DashboardSummary = {
	company: { id: string; name: string; expiresAt: Date | null; color: Color };
	/** A casca só mostra o menu de Filiais quando a empresa usa filiais (ADR 0003). */
	usesBranches: boolean;
	branch: { name: string; code: string };
	role: string;
	level: Level;
	/** Todas as permissões do usuário na empresa ativa (a casca filtra o menu por elas). */
	permissions: Permission[];
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
			const active = await enterActiveCompany(tx);
			return active ? summaryOf(tx, userId, active) : null;
		},
		{ repeatableRead: true },
	);
}

/**
 * O resumo da empresa `active`, dentro de uma transação que já tem o contexto dela (`enterActiveCompany`).
 * Quem precisa de mais coisas da mesma empresa lê tudo numa transação só.
 */
export async function summaryOf(
	tx: Transaction,
	userId: string,
	active: NonNullable<Awaited<ReturnType<typeof userActiveCompany>>>,
): Promise<DashboardSummary | null> {
	// lona_user_companies() não devolve cor nem configurações; juntar com a filial evita migration e uma ida ao banco.
	const [branch] = await tx
		.select({
			id: branches.id,
			name: branches.name,
			code: branches.code,
			color: companies.color,
			settings: companies.settings,
		})
		.from(branches)
		.innerJoin(companies, eq(companies.id, branches.companyId))
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
				or(isNull(memberships.branchId), eq(memberships.branchId, branch.id)),
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
			color: branch.color,
		},
		usesBranches: branch.settings.uses_branches,
		branch: { name: branch.name, code: branch.code },
		role: membership.role,
		level: membership.level,
		permissions: await grantedPermissions(tx, userId, active.companyId),
	};
}

/** Lançado quando o usuário não tem a permissão que a ação pede; a rota converte em 403. */
export class PermissionDeniedError extends Error {
	constructor(permission: Permission) {
		super(`Sem a permissão ${permission}.`);
	}
}

/** Todas as permissões que os cargos do usuário dão na empresa (conferido dentro da transação). */
export async function grantedPermissions(
	tx: Transaction,
	userId: string,
	companyId: string,
) {
	const rows = await tx
		.selectDistinct({ permission: rolePermissions.permission })
		.from(memberships)
		.innerJoin(
			rolePermissions,
			and(
				eq(rolePermissions.companyId, memberships.companyId),
				eq(rolePermissions.roleId, memberships.roleId),
			),
		)
		.where(
			and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)),
		);
	return rows.map((row) => row.permission as Permission);
}

/** Alguma das ligações do usuário na empresa ativa tem um cargo com a permissão? (Conferido dentro da transação.) */
async function hasPermission(
	tx: Transaction,
	userId: string,
	companyId: string,
	permission: Permission,
) {
	const [row] = await tx
		.select({ one: sql<number>`1` })
		.from(memberships)
		.innerJoin(
			rolePermissions,
			and(
				eq(rolePermissions.companyId, memberships.companyId),
				eq(rolePermissions.roleId, memberships.roleId),
			),
		)
		.where(
			and(
				eq(memberships.companyId, companyId),
				eq(memberships.userId, userId),
				eq(rolePermissions.permission, permission),
			),
		)
		.limit(1);
	return Boolean(row);
}

/** Quem chama tentou dar ou tirar um cargo com permissão que ele mesmo não tem; a rota converte em 403. */
export class RoleEscalationError extends Error {
	constructor() {
		super(
			"Você só pode dar ou tirar cargos com permissões que você também tem.",
		);
	}
}

/** Sem isso, quem gerencia usuários se daria (ou daria a outra pessoa) um cargo maior que o seu, como o de dono. */
async function assertHoldsRolePermissions(
	tx: Transaction,
	userId: string,
	companyId: string,
	roleIds: string[],
) {
	const own = tx
		.select({ permission: rolePermissions.permission })
		.from(memberships)
		.innerJoin(
			rolePermissions,
			and(
				eq(rolePermissions.companyId, memberships.companyId),
				eq(rolePermissions.roleId, memberships.roleId),
			),
		)
		.where(
			and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)),
		);
	const [missing] = await tx
		.select({ one: sql<number>`1` })
		.from(rolePermissions)
		.where(
			and(
				eq(rolePermissions.companyId, companyId),
				inArray(rolePermissions.roleId, roleIds),
				notInArray(rolePermissions.permission, own),
			),
		)
		.limit(1);
	if (missing) throw new RoleEscalationError();
}

export type CompanySettingsView = {
	settings: CompanySettings;
	/** Quem não tem `company.configure` só consulta. */
	canConfigure: boolean;
};

/** Roda `fn` na empresa ativa do usuário, já com o contexto do RLS; null se ele não tem empresa ativa. */
export async function inActiveCompany<T>(
	userId: string,
	fn: (tx: Transaction, companyId: string) => Promise<T>,
): Promise<T | null> {
	return withContext(
		{ userId },
		async (tx) => {
			const active = await enterActiveCompany(tx);
			return active ? fn(tx, active.companyId) : null;
		},
		{ repeatableRead: true },
	);
}

/** Configurações da empresa ativa do usuário e se ele pode mudá-las. */
export async function companySettings(
	userId: string,
): Promise<CompanySettingsView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const [company] = await tx
			.select({ settings: companies.settings })
			.from(companies)
			.where(eq(companies.id, companyId));
		return {
			settings: company.settings,
			canConfigure: await hasPermission(
				tx,
				userId,
				companyId,
				"company.configure",
			),
		};
	});
}

/**
 * Altera só as opções enviadas (as outras ficam como estão). Exige `company.configure`.
 * O merge é feito no banco, pra duas alterações ao mesmo tempo em opções diferentes não se sobrescreverem.
 */
export async function updateCompanySettings(
	userId: string,
	patch: Partial<CompanySettings>,
): Promise<CompanySettings | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "company.configure"))) {
			throw new PermissionDeniedError("company.configure");
		}
		const [company] = await tx
			.update(companies)
			.set({
				settings: sql`${companies.settings} || ${JSON.stringify(patch)}::jsonb`,
			})
			.where(eq(companies.id, companyId))
			.returning({ settings: companies.settings });
		return company.settings;
	});
}

export type BranchRow = {
	id: string;
	name: string;
	code: string;
	/** Número de ordem do CNPJ: 1 é a matriz, 2 vira /0002. */
	order: number;
	/** CNPJ completo, formatado para exibição. */
	cnpj: string;
	isHeadquarters: boolean;
	active: boolean;
};

export type BranchesView = {
	branches: BranchRow[];
	usesBranches: boolean;
	/** Raiz do CNPJ já formatada (11.222.333), para a tela mostrar o que vem antes da ordem. */
	cnpjRoot: string;
	canConfigure: boolean;
};

/** Filiais que o usuário consulta na empresa ativa, a matriz primeiro. */
export async function listBranches(
	userId: string,
): Promise<BranchesView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const [company] = await tx
			.select({ cnpjRoot: companies.cnpjRoot, settings: companies.settings })
			.from(companies)
			.where(eq(companies.id, companyId));
		const rows = await tx
			.select()
			.from(branches)
			.orderBy(desc(branches.isHeadquarters), asc(branches.cnpj));
		return {
			branches: rows.map((row) => ({
				id: row.id,
				name: row.name,
				code: row.code,
				order: Number(row.cnpj.slice(8, 12)),
				cnpj: formatCnpj(row.cnpj),
				isHeadquarters: row.isHeadquarters,
				active: row.active,
			})),
			usesBranches: company.settings.uses_branches,
			cnpjRoot: company.cnpjRoot.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3"),
			canConfigure: await hasPermission(
				tx,
				userId,
				companyId,
				"company.configure",
			),
		};
	});
}

/** Código ou ordem já usados por outra filial da empresa; o banco garante (unique), aqui só traduzimos. */
export class DuplicateBranchError extends Error {
	constructor(readonly field: "code" | "order") {
		super(`Já existe filial com esse valor em ${field}.`);
	}
}

/** A matriz não muda de ordem nem é inativada. */
export class HeadquartersLockedError extends Error {
	constructor() {
		super("A matriz não pode mudar de ordem nem ser inativada.");
	}
}

const duplicateField: Record<string, "code" | "order"> = {
	branches_company_id_code_unq: "code",
	branches_company_id_cnpj_unq: "order",
};

/** Traduz a violação de unicidade do Postgres (23505); qualquer outro erro segue como está. */
function translateDuplicate(error: unknown): never {
	const cause = (error as { cause?: unknown }).cause ?? error;
	const { code, constraint } = cause as { code?: string; constraint?: string };
	if (code === "23505" && constraint && constraint in duplicateField) {
		throw new DuplicateBranchError(duplicateField[constraint]);
	}
	throw error;
}

export type BranchInput = { name: string; code: string; order: number };

/** Cria uma filial na empresa ativa. Exige `company.configure`. O CNPJ vem da raiz da empresa e da ordem. */
export async function addBranch(userId: string, data: BranchInput) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "company.configure"))) {
			throw new PermissionDeniedError("company.configure");
		}
		const [company] = await tx
			.select({ cnpjRoot: companies.cnpjRoot })
			.from(companies)
			.where(eq(companies.id, companyId));
		try {
			const code = data.code.trim().toUpperCase();
			// Sem RETURNING: a política de consulta usa uma função STABLE, que não enxerga a linha criada no mesmo comando.
			await tx.insert(branches).values({
				companyId,
				name: data.name.trim(),
				code,
				cnpj: branchCnpj(company.cnpjRoot, data.order),
			});
			const [branch] = await tx
				.select({ id: branches.id })
				.from(branches)
				.where(eq(branches.code, code));
			return branch.id;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

/**
 * Altera só o que foi enviado (nome, código, ordem, ativa). Exige `company.configure`. Devolve false se a filial
 * não existe ou o usuário não a enxerga. Filial com histórico só se inativa, nunca se apaga.
 */
export async function updateBranch(
	userId: string,
	branchId: string,
	patch: Partial<BranchInput & { active: boolean }>,
) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "company.configure"))) {
			throw new PermissionDeniedError("company.configure");
		}
		const [current] = await tx
			.select({ isHeadquarters: branches.isHeadquarters })
			.from(branches)
			.where(eq(branches.id, branchId));
		if (!current) return false;
		if (
			current.isHeadquarters &&
			(patch.order !== undefined || patch.active === false)
		) {
			throw new HeadquartersLockedError();
		}
		const [company] = await tx
			.select({ cnpjRoot: companies.cnpjRoot })
			.from(companies)
			.where(eq(companies.id, companyId));
		try {
			const updated = await tx
				.update(branches)
				.set({
					name: patch.name?.trim(),
					code: patch.code?.trim().toUpperCase(),
					cnpj:
						patch.order === undefined
							? undefined
							: branchCnpj(company.cnpjRoot, patch.order),
					active: patch.active,
				})
				.where(eq(branches.id, branchId))
				.returning({ id: branches.id });
			return updated.length > 0;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

export type RoleInput = {
	name: string;
	permissions: Permission[];
	/** null = sem limite. */
	limits: Record<Limit, number | null>;
};

export type RoleRow = RoleInput & {
	id: string;
	isPreset: boolean;
	/** Quantos vínculos usam o cargo. */
	members: number;
};

export type RolesView = { roles: RoleRow[]; canManage: boolean };

/** Cargos da empresa ativa (os prontos primeiro), com permissões, limites e quantos vínculos usam cada um. */
export async function listRoles(userId: string): Promise<RolesView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const rows = await tx
			.select()
			.from(roles)
			.orderBy(desc(roles.isPreset), asc(roles.name));
		const granted = await tx.select().from(rolePermissions);
		const limitRows = await tx.select().from(roleLimits);
		const used = await tx
			.select({ roleId: memberships.roleId, total: count() })
			.from(memberships)
			.groupBy(memberships.roleId);
		return {
			roles: rows.map((row) => ({
				id: row.id,
				name: row.name,
				isPreset: row.isPreset,
				members: used.find((u) => u.roleId === row.id)?.total ?? 0,
				permissions: granted
					.filter((g) => g.roleId === row.id)
					.map((g) => g.permission as Permission),
				// Sem linha o cargo não tem folga nenhuma (0); NULL é sem limite.
				limits: Object.fromEntries(
					limits.map((key) => {
						const found = limitRows.find(
							(l) => l.roleId === row.id && l.limitKey === key,
						);
						return [key, found ? found.value : 0];
					}),
				) as Record<Limit, number | null>,
			})),
			canManage: await hasPermission(tx, userId, companyId, "roles.manage"),
		};
	});
}

/** Já existe cargo com esse nome na empresa; o banco garante (unique), aqui só traduzimos. */
export class DuplicateRoleError extends Error {
	constructor() {
		super("Já existe cargo com esse nome.");
	}
}

/** O cargo é usado por algum vínculo (FK restrict de memberships). */
export class RoleInUseError extends Error {
	constructor() {
		super("Há vínculos usando este cargo.");
	}
}

/** Os cargos prontos podem ser editados, mas não apagados. */
/** Quem edita não pode tirar `roles.manage` do próprio cargo: a empresa ficaria sem ninguém para desfazer. */
export class SelfLockoutError extends Error {
	constructor(
		message = "Você não pode tirar de você mesmo a permissão de gerenciar cargos.",
	) {
		super(message);
	}
}

export class PresetRoleError extends Error {
	constructor() {
		super("Cargo pronto não pode ser apagado.");
	}
}

/** Traduz unicidade (23505) e cargo em uso (FK restrict) do Postgres; qualquer outro erro segue como está. */
function translateRoleError(error: unknown): never {
	const cause = (error as { cause?: unknown }).cause ?? error;
	const { code } = cause as { code?: string };
	if (code === "23505") throw new DuplicateRoleError();
	// ON DELETE RESTRICT levanta 23001; NO ACTION levantaria 23503.
	if (code === "23001" || code === "23503") throw new RoleInUseError();
	throw error;
}

async function writeRoleGrants(
	tx: Transaction,
	companyId: string,
	roleId: string,
	data: RoleInput,
) {
	await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
	await tx.delete(roleLimits).where(eq(roleLimits.roleId, roleId));
	if (data.permissions.length > 0) {
		await tx.insert(rolePermissions).values(
			data.permissions.map((permission) => ({
				companyId,
				roleId,
				permission,
			})),
		);
	}
	await tx.insert(roleLimits).values(
		limits.map((limitKey) => ({
			companyId,
			roleId,
			limitKey,
			value: data.limits[limitKey],
		})),
	);
}

/** Cria um cargo (não pronto) na empresa ativa. Exige `roles.manage`. */
export async function addRole(userId: string, data: RoleInput) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "roles.manage"))) {
			throw new PermissionDeniedError("roles.manage");
		}
		try {
			const [role] = await tx
				.insert(roles)
				.values({ companyId, name: data.name.trim() })
				.returning({ id: roles.id });
			await writeRoleGrants(tx, companyId, role.id, data);
			return role.id;
		} catch (error) {
			return translateRoleError(error);
		}
	});
}

/** Troca nome, permissões e limites de um cargo (pronto ou criado). Exige `roles.manage`. false se não existe. */
export async function updateRole(
	userId: string,
	roleId: string,
	data: RoleInput,
) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "roles.manage"))) {
			throw new PermissionDeniedError("roles.manage");
		}
		if (!data.permissions.includes("roles.manage")) {
			const [own] = await tx
				.select({ id: memberships.id })
				.from(memberships)
				.where(
					and(
						eq(memberships.companyId, companyId),
						eq(memberships.userId, userId),
						eq(memberships.roleId, roleId),
					),
				)
				.limit(1);
			if (own) throw new SelfLockoutError();
		}
		try {
			const updated = await tx
				.update(roles)
				.set({ name: data.name.trim() })
				.where(eq(roles.id, roleId))
				.returning({ id: roles.id });
			if (updated.length === 0) return false;
			await writeRoleGrants(tx, companyId, roleId, data);
			return true;
		} catch (error) {
			return translateRoleError(error);
		}
	});
}

/** Apaga um cargo criado que nenhum vínculo usa. Exige `roles.manage`. false se não existe. */
export async function removeRole(userId: string, roleId: string) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "roles.manage"))) {
			throw new PermissionDeniedError("roles.manage");
		}
		const [role] = await tx
			.select({ isPreset: roles.isPreset })
			.from(roles)
			.where(eq(roles.id, roleId));
		if (!role) return false;
		if (role.isPreset) throw new PresetRoleError();
		try {
			await tx.delete(roles).where(eq(roles.id, roleId));
			return true;
		} catch (error) {
			return translateRoleError(error);
		}
	});
}

export type MembershipInput = {
	/** null = todas as filiais. */
	branchId: string | null;
	roleId: string;
	level: Level;
};

export type MembershipRow = MembershipInput & {
	/** null quando é "todas" ou quando o usuário não enxerga essa filial. */
	branchName: string | null;
	roleName: string;
};

export type UserRow = {
	id: string;
	name: string;
	/** null para visitante anônimo (o e-mail dele é só um marcador interno). */
	email: string | null;
	memberships: MembershipRow[];
};

export type InviteRow = {
	id: string;
	createdByName: string;
	branchId: string | null;
	/** null quando é "todas" ou quando o usuário não enxerga essa filial. */
	branchName: string | null;
	roleName: string;
	level: Level;
	expiresAt: Date;
};

export type UsersView = {
	users: UserRow[];
	/** Convites que ainda valem; só quem gerencia usuários os vê. */
	invites: InviteRow[];
	/** Filiais que o usuário enxerga, para escolher no vínculo. */
	branches: { id: string; name: string; active: boolean }[];
	roles: { id: string; name: string }[];
	usesBranches: boolean;
	canManage: boolean;
};

/**
 * Usuários da empresa ativa (quem tem ao menos um vínculo nela) com seus vínculos. auth.users não tem RLS,
 * então o recorte vem de partir dos vínculos, que têm.
 */
export async function listUsers(userId: string): Promise<UsersView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		const [company] = await tx
			.select({ settings: companies.settings })
			.from(companies)
			.where(eq(companies.id, companyId));
		const rows = await tx
			.select({
				userId: users.id,
				name: users.name,
				email: users.email,
				isAnonymous: users.isAnonymous,
				branchId: memberships.branchId,
				branchName: branches.name,
				roleId: memberships.roleId,
				roleName: roles.name,
				level: memberships.level,
			})
			.from(memberships)
			.innerJoin(users, eq(users.id, memberships.userId))
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
			.where(eq(memberships.companyId, companyId))
			.orderBy(
				asc(users.name),
				asc(users.id),
				sql`${memberships.branchId} IS NOT NULL`,
				asc(branches.name),
			);

		// E-mail é dado pessoal (LGPD): só quem gerencia usuários vê.
		const canManage = await hasPermission(
			tx,
			userId,
			companyId,
			"users.manage",
		);
		const byUser = new Map<string, UserRow>();
		for (const row of rows) {
			const user = byUser.get(row.userId) ?? {
				id: row.userId,
				name: row.name,
				email:
					canManage && !row.isAnonymous
						? modelEmail(row.userId, row.email)
						: null,
				memberships: [],
			};
			user.memberships.push({
				branchId: row.branchId,
				branchName: row.branchName,
				roleId: row.roleId,
				roleName: row.roleName,
				level: row.level,
			});
			byUser.set(row.userId, user);
		}

		const pending = canManage
			? await tx
					.select({
						id: invites.id,
						createdByName: users.name,
						branchId: invites.branchId,
						branchName: branches.name,
						roleName: roles.name,
						level: invites.level,
						expiresAt: invites.expiresAt,
					})
					.from(invites)
					.innerJoin(users, eq(users.id, invites.createdBy))
					.innerJoin(
						roles,
						and(
							eq(roles.companyId, invites.companyId),
							eq(roles.id, invites.roleId),
						),
					)
					.leftJoin(
						branches,
						and(
							eq(branches.companyId, invites.companyId),
							eq(branches.id, invites.branchId),
						),
					)
					.where(
						and(
							eq(invites.companyId, companyId),
							isNull(invites.usedAt),
							isNull(invites.revokedAt),
							gt(invites.expiresAt, sql`now()`),
						),
					)
					.orderBy(asc(invites.expiresAt), asc(invites.id))
			: [];

		return {
			users: [...byUser.values()],
			invites: pending,
			branches: await tx
				.select({
					id: branches.id,
					name: branches.name,
					active: branches.active,
				})
				.from(branches)
				.orderBy(desc(branches.isHeadquarters), asc(branches.name)),
			roles: await tx
				.select({ id: roles.id, name: roles.name })
				.from(roles)
				.orderBy(desc(roles.isPreset), asc(roles.name)),
			usesBranches: company.settings.uses_branches,
			canManage,
		};
	});
}

/** A cópia de cada pessoa fictícia ganha o e-mail `<id>.<e-mail do modelo>` (único por demonstração); mostra o do modelo. */
function modelEmail(userId: string, email: string) {
	return email.startsWith(`${userId}.`)
		? email.slice(userId.length + 1)
		: email;
}

/** O mesmo usuário e filial já têm vínculo; o banco garante (unique), aqui só traduzimos. */
export class DuplicateMembershipError extends Error {
	constructor() {
		super(
			"Esta pessoa já tem vínculo nessa filial. Use um vínculo só por filial.",
		);
	}
}

/** Cargo ou filial inexistente, filial inativa recebendo vínculo novo, ou filial escolhida numa empresa sem filiais. */
export class InvalidMembershipError extends Error {}

/** Traduz unicidade (23505) e chave estrangeira (23503) de memberships; qualquer outro erro segue como está. */
function translateMembershipError(error: unknown): never {
	const cause = (error as { cause?: unknown }).cause ?? error;
	const { code } = cause as { code?: string };
	if (code === "23505") throw new DuplicateMembershipError();
	if (code === "23503") {
		throw new InvalidMembershipError("Cargo ou filial não encontrado.");
	}
	throw error;
}

/**
 * Troca todos os vínculos de um usuário pela lista enviada (lista vazia tira o usuário da empresa). Exige
 * `users.manage` e todas as permissões dos cargos dados e tirados. false se o usuário não tem vínculo na empresa.
 * Ninguém fica sem `users.manage` por conta própria.
 * Escreve só a diferença (insere, atualiza, depois apaga) para o próprio vínculo do usuário nunca sumir no meio:
 * o RLS confere o vínculo a cada comando.
 */
export async function updateUserMemberships(
	userId: string,
	targetId: string,
	items: MembershipInput[],
) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "users.manage"))) {
			throw new PermissionDeniedError("users.manage");
		}
		const current = await tx
			.select({
				id: memberships.id,
				branchId: memberships.branchId,
				roleId: memberships.roleId,
			})
			.from(memberships)
			.where(
				and(
					eq(memberships.companyId, companyId),
					eq(memberships.userId, targetId),
				),
			);
		if (current.length === 0) return false;
		// Os cargos atuais também: rebaixar ou tirar o dono é tirar dele permissões que quem chama não tem.
		await assertHoldsRolePermissions(tx, userId, companyId, [
			...current.map((c) => c.roleId),
			...items.map((i) => i.roleId),
		]);

		if (targetId === userId) {
			const [keeps] = await tx
				.select({ one: sql<number>`1` })
				.from(rolePermissions)
				.where(
					and(
						inArray(
							rolePermissions.roleId,
							items.map((i) => i.roleId),
						),
						eq(rolePermissions.permission, "users.manage"),
					),
				)
				.limit(1);
			if (!keeps) {
				throw new SelfLockoutError(
					"Você não pode ficar sem a permissão de gerenciar usuários.",
				);
			}
		}

		const [company] = await tx
			.select({ settings: companies.settings })
			.from(companies)
			.where(eq(companies.id, companyId));
		const branchRows = await tx
			.select({ id: branches.id, active: branches.active })
			.from(branches);
		const roleIds = new Set(
			(await tx.select({ id: roles.id }).from(roles)).map((r) => r.id),
		);
		const linked = new Set(current.map((c) => c.branchId));
		for (const item of items) {
			if (!roleIds.has(item.roleId)) {
				throw new InvalidMembershipError("Cargo não encontrado.");
			}
			if (item.branchId === null) continue;
			const branch = branchRows.find((b) => b.id === item.branchId);
			if (!branch) throw new InvalidMembershipError("Filial não encontrada.");
			if (!company.settings.uses_branches) {
				throw new InvalidMembershipError(
					"A empresa não usa filiais: o vínculo vale para todas.",
				);
			}
			// Vínculo que já existia numa filial depois inativada pode continuar (e trocar de cargo ou nível).
			if (!branch.active && !linked.has(item.branchId)) {
				throw new InvalidMembershipError(
					"Filial inativa não recebe vínculo novo.",
				);
			}
		}

		const existing = new Map(current.map((c) => [c.branchId, c.id]));
		const kept: string[] = [];
		try {
			for (const item of items) {
				const id = existing.get(item.branchId);
				// Repetida na lista: cai no insert e o unique do banco recusa.
				if (id && !kept.includes(id)) {
					kept.push(id);
					await tx
						.update(memberships)
						.set({ roleId: item.roleId, level: item.level })
						.where(eq(memberships.id, id));
				} else {
					await tx
						.insert(memberships)
						.values({ companyId, userId: targetId, ...item });
				}
			}
			const removed = current
				.map((c) => c.id)
				.filter((id) => !kept.includes(id));
			if (removed.length > 0) {
				await tx.delete(memberships).where(inArray(memberships.id, removed));
			}
		} catch (error) {
			return translateMembershipError(error);
		}
		return true;
	});
}

/** Hash sha256 do token: é o que o banco guarda e o que as funções lona_*_invite recebem. */
const hashToken = (token: string) =>
	createHash("sha256").update(token).digest("hex");

/**
 * Cria um convite com o vínculo já definido (mesmas regras de vínculo de `updateUserMemberships`). Vale 48 horas e
 * uma vez só. O token volta aqui e em nenhum outro lugar: no banco fica só o hash. Exige `users.manage` e todas
 * as permissões do cargo do convite.
 */
export async function createInvite(userId: string, input: MembershipInput) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "users.manage"))) {
			throw new PermissionDeniedError("users.manage");
		}
		const [role] = await tx
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.id, input.roleId));
		if (!role) throw new InvalidMembershipError("Cargo não encontrado.");
		await assertHoldsRolePermissions(tx, userId, companyId, [input.roleId]);
		if (input.branchId !== null) {
			const [branch] = await tx
				.select({ active: branches.active })
				.from(branches)
				.where(eq(branches.id, input.branchId));
			if (!branch) throw new InvalidMembershipError("Filial não encontrada.");
			const [company] = await tx
				.select({ settings: companies.settings })
				.from(companies)
				.where(eq(companies.id, companyId));
			if (!company.settings.uses_branches) {
				throw new InvalidMembershipError(
					"A empresa não usa filiais: o vínculo vale para todas.",
				);
			}
			if (!branch.active) {
				throw new InvalidMembershipError(
					"Filial inativa não recebe vínculo novo.",
				);
			}
		}

		const token = randomBytes(32).toString("base64url");
		const [invite] = await tx
			.insert(invites)
			.values({
				companyId,
				tokenHash: hashToken(token),
				branchId: input.branchId,
				roleId: input.roleId,
				level: input.level,
				createdBy: userId,
				expiresAt: sql`now() + interval '48 hours'`,
			})
			.returning({ id: invites.id, expiresAt: invites.expiresAt });
		return { id: invite.id, token, expiresAt: invite.expiresAt };
	});
}

/** Revoga um convite que ainda não foi usado. Exige `users.manage`. false se não existe, já foi usado ou revogado. */
export async function revokeInvite(userId: string, inviteId: string) {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "users.manage"))) {
			throw new PermissionDeniedError("users.manage");
		}
		const revoked = await tx
			.update(invites)
			.set({ revokedAt: sql`now()` })
			.where(
				and(
					eq(invites.id, inviteId),
					isNull(invites.usedAt),
					isNull(invites.revokedAt),
				),
			)
			.returning({ id: invites.id });
		return revoked.length > 0;
	});
}

export type InviteInfo = {
	companyName: string;
	usesBranches: boolean;
	inviterName: string;
	roleName: string;
	/** null = todas as filiais. */
	branchName: string | null;
	level: Level;
};

/**
 * O que o convite oferece, para quem abriu o link (sem login e sem vínculo, então fora do RLS da empresa: vem da
 * função lona_find_invite). null para token inexistente, vencido, usado ou revogado, sem dizer qual.
 */
export async function findInvite(token: string): Promise<InviteInfo | null> {
	return withContext({}, async (tx) => {
		const { rows } = await tx.execute<{
			company_name: string;
			uses_branches: boolean;
			inviter_name: string;
			role_name: string;
			branch_name: string | null;
			level: Level;
		}>(sql`SELECT * FROM lona_find_invite(${hashToken(token)})`);
		const row = rows[0];
		return row
			? {
					companyName: row.company_name,
					usesBranches: row.uses_branches,
					inviterName: row.inviter_name,
					roleName: row.role_name,
					branchName: row.branch_name,
					level: row.level,
				}
			: null;
	});
}

/** Link vencido, usado, revogado ou inexistente: um erro só, para não vazar qual. */
export class InvalidInviteError extends Error {}

/** Visitante anônimo da demonstração não aceita convite; precisa criar uma conta. */
export class AnonymousInviteError extends Error {}

/**
 * Aceita o convite: cria o vínculo e marca o convite como usado, de forma atômica (ver lona_accept_invite). Devolve a
 * empresa do vínculo, que passa a ser a empresa ativa (userActiveCompany prefere empresa real a demonstração).
 */
export async function acceptInvite(userId: string, token: string) {
	return withContext({ userId }, async (tx) => {
		const [user] = await tx
			.select({ isAnonymous: users.isAnonymous })
			.from(users)
			.where(eq(users.id, userId));
		if (!user || user.isAnonymous) throw new AnonymousInviteError();
		try {
			const { rows } = await tx.execute<{ company_id: string | null }>(
				sql`SELECT lona_accept_invite(${hashToken(token)}) AS company_id`,
			);
			const companyId = rows[0].company_id;
			if (!companyId) throw new InvalidInviteError();
			return companyId;
		} catch (error) {
			if (error instanceof InvalidInviteError) throw error;
			return translateMembershipError(error);
		}
	});
}
