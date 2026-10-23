import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	check,
	foreignKey,
	index,
	numeric,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// Unidade de venda: unidade, peça, jogo, kit, par, conjunto.
export const units = ["UN", "PC", "JG", "KIT", "PAR", "CJ"] as const;

export type Unit = (typeof units)[number];

export const axles = ["front", "rear"] as const;

export type Axle = (typeof axles)[number];

export const parts = pgTable(
	"parts",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		// A chave estrangeira para companies fica na migration em SQL: um módulo não importa as tabelas de outro.
		companyId: uuid("company_id").notNull(),
		// Código interno da empresa (o que o balconista digita).
		code: text("code").notNull(),
		description: text("description").notNull(),
		brand: text("brand").notNull(),
		// Código do fabricante, para achar a peça pela referência da caixa.
		manufacturerRef: text("manufacturer_ref"),
		unit: text("unit").$type<Unit>().notNull(),
		ncm: char("ncm", { length: 8 }),
		salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
		active: boolean("active").notNull().default(true),
		// Texto de busca sem acento e em minúsculas; o banco mantém sozinho (ver migration 0006).
		search: text("search")
			.notNull()
			.generatedAlwaysAs(
				sql`lona_unaccent(lower(code || ' ' || description || ' ' || brand || ' ' || coalesce(manufacturer_ref, '')))`,
			),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		unique("parts_company_id_id_unq").on(t.companyId, t.id),
		unique("parts_company_id_code_unq").on(t.companyId, t.code),
		check(
			"parts_unit_valid",
			sql`${t.unit} IN (${sql.raw(units.map((u) => `'${u}'`).join(", "))})`,
		),
		check("parts_ncm_format", sql`${t.ncm} ~ '^[0-9]{8}$'`),
		check("parts_sale_price_not_negative", sql`${t.salePrice} >= 0`),
		index("parts_search_idx").using(
			"gin",
			t.companyId,
			sql`${t.search} gin_trgm_ops`,
		),
	],
);

// Em que veículo a peça serve; sem eixo = serve em qualquer um.
export const partApplications = pgTable(
	"part_applications",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		companyId: uuid("company_id").notNull(),
		partId: uuid("part_id").notNull(),
		vehicleModel: text("vehicle_model").notNull(),
		axle: text("axle").$type<Axle>(),
		search: text("search")
			.notNull()
			.generatedAlwaysAs(sql`lona_unaccent(lower(vehicle_model))`),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		foreignKey({
			columns: [t.companyId, t.partId],
			foreignColumns: [parts.companyId, parts.id],
		}).onDelete("cascade"),
		check("part_applications_axle_valid", sql`${t.axle} IN ('front', 'rear')`),
		index("part_applications_search_idx").using(
			"gin",
			t.companyId,
			sql`${t.search} gin_trgm_ops`,
		),
		index("part_applications_part_idx").on(t.companyId, t.partId),
	],
);
