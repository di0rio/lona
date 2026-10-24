import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
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
import { companies } from "@/modules/access/schema";

// UUIDv7 nativo, igual ao módulo access.
const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

const companyId = () =>
	uuid("company_id")
		.notNull()
		.references(() => companies.id, { onDelete: "cascade" });

const createdAt = () =>
	timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const methodKinds = [
	"cash",
	"pix",
	"debit_card",
	"credit_card",
	"bank_slip",
	"on_account",
] as const;

export type MethodKind = (typeof methodKinds)[number];

export const modalities = [
	"debit",
	"credit",
	"merchant_installments",
	"issuer_installments",
] as const;

export type Modality = (typeof modalities)[number];

const inList = (values: readonly string[]) =>
	sql.raw(values.map((v) => `'${v}'`).join(", "));

export const acquirers = pgTable(
	"acquirers",
	{
		id: id(),
		companyId: companyId(),
		name: text("name").notNull(),
		active: boolean("active").notNull().default(true),
		createdAt: createdAt(),
	},
	(t) => [
		unique("acquirers_company_id_id_unq").on(t.companyId, t.id),
		unique("acquirers_company_id_name_unq").on(t.companyId, t.name),
	],
);

export const acquirerFees = pgTable(
	"acquirer_fees",
	{
		id: id(),
		companyId: companyId(),
		acquirerId: uuid("acquirer_id").notNull(),
		modality: text("modality").$type<Modality>().notNull(),
		installments: smallint("installments").notNull(),
		// Percentuais trafegam como texto decimal ("2.79"): o numeric do banco volta como string, sem float.
		feePct: numeric("fee_pct", { precision: 5, scale: 2 }).notNull(),
		// Débito, crédito e emissor: dias até cair o valor todo. Lojista: dias de cada parcela.
		daysToReceive: smallint("days_to_receive").notNull(),
		anticipation: boolean("anticipation").notNull().default(false),
		// Taxa de antecipação ao mês; só existe quando há antecipação.
		anticipationFeePct: numeric("anticipation_fee_pct", {
			precision: 5,
			scale: 2,
		}),
		validFrom: date("valid_from", { mode: "string" }).notNull(),
		createdAt: createdAt(),
	},
	(t) => [
		unique("acquirer_fees_company_id_id_unq").on(t.companyId, t.id),
		unique("acquirer_fees_validity_unq").on(
			t.companyId,
			t.acquirerId,
			t.modality,
			t.installments,
			t.validFrom,
		),
		foreignKey({
			columns: [t.companyId, t.acquirerId],
			foreignColumns: [acquirers.companyId, acquirers.id],
		}).onDelete("cascade"),
		check(
			"acquirer_fees_modality_valid",
			sql`${t.modality} IN (${inList(modalities)})`,
		),
		check(
			"acquirer_fees_installments_valid",
			sql`(${t.modality} = 'merchant_installments' AND ${t.installments} BETWEEN 2 AND 12) OR (${t.modality} <> 'merchant_installments' AND ${t.installments} = 1)`,
		),
		check(
			"acquirer_fees_fee_pct_range",
			sql`${t.feePct} >= 0 AND ${t.feePct} < 100`,
		),
		check("acquirer_fees_days_not_negative", sql`${t.daysToReceive} >= 0`),
		check(
			"acquirer_fees_anticipation_pct",
			sql`${t.anticipation} = (${t.anticipationFeePct} IS NOT NULL) AND (${t.anticipationFeePct} IS NULL OR (${t.anticipationFeePct} >= 0 AND ${t.anticipationFeePct} < 100))`,
		),
	],
);

export const paymentMethods = pgTable(
	"payment_methods",
	{
		id: id(),
		companyId: companyId(),
		name: text("name").notNull(),
		kind: text("kind").$type<MethodKind>().notNull(),
		// Só as formas de cartão têm operadora (e, por ela, taxa e prazo).
		acquirerId: uuid("acquirer_id"),
		active: boolean("active").notNull().default(true),
		createdAt: createdAt(),
	},
	(t) => [
		unique("payment_methods_company_id_id_unq").on(t.companyId, t.id),
		unique("payment_methods_company_id_name_unq").on(t.companyId, t.name),
		// Não apaga operadora em uso.
		foreignKey({
			columns: [t.companyId, t.acquirerId],
			foreignColumns: [acquirers.companyId, acquirers.id],
		}).onDelete("restrict"),
		check(
			"payment_methods_kind_valid",
			sql`${t.kind} IN (${inList(methodKinds)})`,
		),
		check(
			"payment_methods_card_has_acquirer",
			sql`(${t.kind} IN ('debit_card', 'credit_card')) = (${t.acquirerId} IS NOT NULL)`,
		),
	],
);

export const paymentTerms = pgTable(
	"payment_terms",
	{
		id: id(),
		companyId: companyId(),
		name: text("name").notNull(),
		paymentMethodId: uuid("payment_method_id").notNull(),
		// Dias de cada parcela a partir da venda: {0} à vista, {30,60,90}, {0,30,60} entrada + 2x.
		installmentDays: smallint("installment_days").array().notNull(),
		// Só faz sentido em crédito com mais de uma parcela (o service confere).
		issuerInstallments: boolean("issuer_installments").notNull().default(false),
		active: boolean("active").notNull().default(true),
		createdAt: createdAt(),
	},
	(t) => [
		unique("payment_terms_company_id_name_unq").on(t.companyId, t.name),
		foreignKey({
			columns: [t.companyId, t.paymentMethodId],
			foreignColumns: [paymentMethods.companyId, paymentMethods.id],
		}).onDelete("restrict"),
		index("payment_terms_method_idx").on(t.companyId, t.paymentMethodId),
		check(
			"payment_terms_installments_count",
			sql`cardinality(${t.installmentDays}) BETWEEN 1 AND 12`,
		),
		check(
			"payment_terms_first_day_not_negative",
			sql`${t.installmentDays}[1] >= 0`,
		),
	],
);
