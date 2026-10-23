import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	check,
	index,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

export const states = [
	"AC",
	"AL",
	"AM",
	"AP",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MT",
	"MS",
	"MG",
	"PA",
	"PB",
	"PR",
	"PE",
	"PI",
	"RJ",
	"RN",
	"RS",
	"RO",
	"RR",
	"SC",
	"SP",
	"SE",
	"TO",
] as const;

export const suppliers = pgTable(
	"suppliers",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		// A chave estrangeira para companies fica na migration em SQL: um módulo não importa as tabelas de outro.
		companyId: uuid("company_id").notNull(),
		// Razão social.
		legalName: text("legal_name").notNull(),
		// 14 caracteres sem máscara; o CNPJ alfanumérico vale desde jul/2026.
		cnpj: char("cnpj", { length: 14 }).notNull(),
		contactName: text("contact_name"),
		phone: text("phone"),
		city: text("city").notNull(),
		state: char("state", { length: 2 }).notNull(),
		active: boolean("active").notNull().default(true),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("suppliers_company_id_cnpj_unq").on(t.companyId, t.cnpj),
		check("suppliers_cnpj_format", sql`${t.cnpj} ~ '^[0-9A-Z]{12}[0-9]{2}$'`),
		check("suppliers_phone_format", sql`${t.phone} ~ '^[0-9]{10,11}$'`),
		check(
			"suppliers_state_valid",
			sql`${t.state} IN (${sql.raw(states.map((s) => `'${s}'`).join(", "))})`,
		),
		index("suppliers_legal_name_idx").on(t.companyId, t.legalName),
	],
);
