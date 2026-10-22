import { sql } from "drizzle-orm";
import {
	char,
	check,
	foreignKey,
	index,
	numeric,
	pgTable,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

const timestampColumn = (name: string) =>
	timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const customerKinds = ["fleet_owner", "owner_operator"] as const;
export const customerStatuses = ["active", "blocked"] as const;

export type CustomerKind = (typeof customerKinds)[number];
export type CustomerStatus = (typeof customerStatuses)[number];

const list = (values: readonly string[]) =>
	sql.raw(values.map((v) => `'${v}'`).join(", "));

export const customers = pgTable(
	"customers",
	{
		id: id(),
		// A chave estrangeira para companies (ON DELETE CASCADE) está à mão na migration: um módulo não importa
		// as tabelas de outro.
		companyId: uuid("company_id").notNull(),
		kind: text("kind").$type<CustomerKind>().notNull(),
		name: text("name").notNull(),
		// Só dígitos: CNPJ (14) do frotista, CPF (11) do autônomo.
		document: text("document").notNull(),
		// Só dígitos, com DDD.
		phone: text("phone"),
		city: text("city").notNull(),
		state: char("state", { length: 2 }).notNull(),
		creditLimit: numeric("credit_limit", { precision: 12, scale: 2 })
			.notNull()
			.default("0"),
		status: text("status").$type<CustomerStatus>().notNull().default("active"),
		createdAt: timestampColumn("created_at"),
		updatedAt: timestampColumn("updated_at"),
	},
	(t) => [
		unique("customers_company_id_id_unq").on(t.companyId, t.id),
		unique("customers_company_id_document_unq").on(t.companyId, t.document),
		check("customers_kind_valid", sql`${t.kind} IN (${list(customerKinds)})`),
		check(
			"customers_status_valid",
			sql`${t.status} IN (${list(customerStatuses)})`,
		),
		check(
			"customers_document_format",
			sql`(${t.kind} = 'fleet_owner' AND ${t.document} ~ '^[0-9]{14}$') OR (${t.kind} = 'owner_operator' AND ${t.document} ~ '^[0-9]{11}$')`,
		),
		check(
			"customers_phone_format",
			sql`${t.phone} IS NULL OR ${t.phone} ~ '^[0-9]{10,11}$'`,
		),
		check("customers_credit_limit_not_negative", sql`${t.creditLimit} >= 0`),
		// Limite de crédito é do frotista; o autônomo compra no balcão.
		check(
			"customers_credit_limit_fleet_owner_only",
			sql`${t.kind} = 'fleet_owner' OR ${t.creditLimit} = 0`,
		),
		// Busca por nome e documento parcial; começa pela empresa (ADR 0001).
		index("customers_search_idx").using(
			"gin",
			t.companyId,
			t.name.op("gin_trgm_ops"),
			t.document.op("gin_trgm_ops"),
		),
	],
);

export const vehicles = pgTable(
	"vehicles",
	{
		id: id(),
		companyId: uuid("company_id").notNull(),
		customerId: uuid("customer_id").notNull(),
		// Maiúsculas e sem hífen: antiga (ABC1234) ou Mercosul (ABC1D23).
		plate: text("plate").notNull(),
		model: text("model").notNull(),
		axles: smallint("axles").notNull(),
		year: smallint("year"),
		createdAt: timestampColumn("created_at"),
		updatedAt: timestampColumn("updated_at"),
	},
	(t) => [
		foreignKey({
			columns: [t.companyId, t.customerId],
			foreignColumns: [customers.companyId, customers.id],
		}).onDelete("cascade"),
		unique("vehicles_company_id_plate_unq").on(t.companyId, t.plate),
		index("vehicles_company_id_customer_id_idx").on(t.companyId, t.customerId),
		check(
			"vehicles_plate_format",
			sql`${t.plate} ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'`,
		),
		check("vehicles_axles_range", sql`${t.axles} BETWEEN 2 AND 9`),
		check(
			"vehicles_year_range",
			sql`${t.year} IS NULL OR ${t.year} BETWEEN 1950 AND 2100`,
		),
	],
);
