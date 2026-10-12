import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	check,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgSchema,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// UUIDv7 nativo: o Neon roda Postgres 18, que já traz uuidv7(). Ids ordenados no tempo mantêm os índices compactos.
const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

const timestampColumn = (name: string) =>
	timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const colors = [
	"blue",
	"green",
	"red",
	"orange",
	"yellow",
	"purple",
	"pink",
	"gray",
] as const;

export type Color = (typeof colors)[number];

export type CompanySettings = {
	uses_branches: boolean;
	work_order_flow: "simple" | "full";
	sale_requires_quote: boolean;
	cash_register_required: boolean;
};

export const defaultSettings: CompanySettings = {
	uses_branches: false,
	work_order_flow: "simple",
	sale_requires_quote: false,
	cash_register_required: false,
};

export type Level = "view" | "operate";

export const companies = pgTable(
	"companies",
	{
		id: id(),
		name: text("name").notNull(),
		cnpjRoot: char("cnpj_root", { length: 8 }).notNull(),
		isTemplate: boolean("is_template").notNull().default(false),
		// null para empresa real e para o modelo; a demonstração vence 2 horas depois de copiada.
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		color: text("color").$type<Color>().notNull().default("gray"),
		settings: jsonb("settings")
			.$type<CompanySettings>()
			.notNull()
			.default(defaultSettings),
		createdAt: timestampColumn("created_at"),
	},
	(t) => [
		check("companies_cnpj_root_format", sql`${t.cnpjRoot} ~ '^[0-9]{8}$'`),
		check(
			"companies_color_valid",
			sql`${t.color} IN (${sql.raw(colors.map((c) => `'${c}'`).join(", "))})`,
		),
		check(
			"companies_template_never_expires",
			sql`NOT ${t.isTemplate} OR ${t.expiresAt} IS NULL`,
		),
		check(
			"companies_settings_valid",
			sql`${t.settings}->>'work_order_flow' IN ('simple', 'full')`,
		),
		// Limpeza das demonstrações vencidas (única consulta que não parte da empresa).
		index("companies_expires_at_idx")
			.on(t.expiresAt)
			.where(sql`${t.expiresAt} IS NOT NULL`),
	],
);

export const branches = pgTable(
	"branches",
	{
		id: id(),
		companyId: uuid("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		code: text("code").notNull(),
		// 14 dígitos: raiz do CNPJ (8) + número de ordem (4: 0001, 0002...) + dígitos verificadores (2).
		cnpj: char("cnpj", { length: 14 }).notNull(),
		isHeadquarters: boolean("is_headquarters").notNull().default(false),
		active: boolean("active").notNull().default(true),
		createdAt: timestampColumn("created_at"),
	},
	(t) => [
		unique("branches_company_id_id_unq").on(t.companyId, t.id),
		unique("branches_company_id_code_unq").on(t.companyId, t.code),
		unique("branches_company_id_cnpj_unq").on(t.companyId, t.cnpj),
		// ADR 0003: a matriz é uma só por empresa e termina em /0001.
		uniqueIndex("branches_headquarters_unq")
			.on(t.companyId)
			.where(sql`${t.isHeadquarters}`),
		check("branches_cnpj_format", sql`${t.cnpj} ~ '^[0-9]{14}$'`),
		check(
			"branches_headquarters_order_0001",
			sql`NOT ${t.isHeadquarters} OR substr(${t.cnpj}, 9, 4) = '0001'`,
		),
	],
);

export const roles = pgTable(
	"roles",
	{
		id: id(),
		companyId: uuid("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),
		// Nome de exibição: dado da empresa, editável; cargos prontos nascem em português e a empresa pode renomear.
		name: text("name").notNull(),
		isPreset: boolean("is_preset").notNull().default(false),
		createdAt: timestampColumn("created_at"),
	},
	(t) => [
		unique("roles_company_id_id_unq").on(t.companyId, t.id),
		unique("roles_company_id_name_unq").on(t.companyId, t.name),
	],
);

// As tabelas filhas repetem company_id (e a chave estrangeira composta o confere) para o RLS e os índices
// poderem partir sempre da empresa (ADR 0001).
export const rolePermissions = pgTable(
	"role_permissions",
	{
		companyId: uuid("company_id").notNull(),
		roleId: uuid("role_id").notNull(),
		permission: text("permission").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.companyId, t.roleId, t.permission] }),
		foreignKey({
			columns: [t.companyId, t.roleId],
			foreignColumns: [roles.companyId, roles.id],
		}).onDelete("cascade"),
	],
);

export const roleLimits = pgTable(
	"role_limits",
	{
		companyId: uuid("company_id").notNull(),
		roleId: uuid("role_id").notNull(),
		// "limit" é palavra reservada do SQL; limit_key evita precisar citar o identificador toda hora.
		limitKey: text("limit_key").notNull(),
		// null = sem limite.
		value: numeric("value", { precision: 14, scale: 2, mode: "number" }),
	},
	(t) => [
		primaryKey({ columns: [t.companyId, t.roleId, t.limitKey] }),
		foreignKey({
			columns: [t.companyId, t.roleId],
			foreignColumns: [roles.companyId, roles.id],
		}).onDelete("cascade"),
		check("role_limits_value_not_negative", sql`${t.value} >= 0`),
	],
);

// Tabelas do Better Auth, nos nomes padrão em inglês que a biblioteca espera. Ficam num schema à parte e sem RLS
// de empresa: a pessoa existe fora de qualquer empresa, e o elo é o vínculo.
export const auth = pgSchema("auth");

export const users = auth.table(
	"users",
	{
		id: id(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		isAnonymous: boolean("is_anonymous").notNull().default(false),
		createdAt: timestampColumn("created_at"),
		updatedAt: timestampColumn("updated_at").$onUpdate(() => new Date()),
	},
	(t) => [
		// Limpeza dos visitantes anônimos antigos.
		index("users_anonymous_idx").on(t.createdAt).where(sql`${t.isAnonymous}`),
	],
);

export const sessions = auth.table(
	"sessions",
	{
		id: id(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestampColumn("created_at"),
		updatedAt: timestampColumn("updated_at").$onUpdate(() => new Date()),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
	},
	(t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = auth.table(
	"accounts",
	{
		id: id(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestampColumn("created_at"),
		updatedAt: timestampColumn("updated_at").$onUpdate(() => new Date()),
	},
	(t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = auth.table(
	"verifications",
	{
		id: id(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestampColumn("created_at"),
		updatedAt: timestampColumn("updated_at").$onUpdate(() => new Date()),
	},
	(t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const memberships = pgTable(
	"memberships",
	{
		id: id(),
		companyId: uuid("company_id")
			.notNull()
			.references(() => companies.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// null = todas as filiais (ADR 0006).
		branchId: uuid("branch_id"),
		roleId: uuid("role_id").notNull(),
		level: text("level").$type<Level>().notNull(),
	},
	(t) => [
		// Com branch_id nulo a chave estrangeira composta não confere, que é o desejado: nulo é "todas".
		foreignKey({
			columns: [t.companyId, t.branchId],
			foreignColumns: [branches.companyId, branches.id],
		}).onDelete("cascade"),
		// Cargo em uso não pode ser apagado.
		foreignKey({
			columns: [t.companyId, t.roleId],
			foreignColumns: [roles.companyId, roles.id],
		}).onDelete("restrict"),
		// Um vínculo por usuário e filial (e um só para "todas").
		unique("memberships_company_user_branch_unq")
			.on(t.companyId, t.userId, t.branchId)
			.nullsNotDistinct(),
		// Exceção à regra de partir da empresa: achar as empresas de quem acabou de entrar.
		index("memberships_user_id_idx").on(t.userId, t.companyId),
		check("memberships_level_valid", sql`${t.level} IN ('view', 'operate')`),
	],
);
