-- btree_gin: deixa o índice de busca começar por company_id (ADR 0001) e ainda usar pg_trgm em nome e documento.
CREATE EXTENSION IF NOT EXISTS btree_gin;
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"document" text NOT NULL,
	"phone" text,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"credit_limit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_company_id_id_unq" UNIQUE("company_id","id"),
	CONSTRAINT "customers_company_id_document_unq" UNIQUE("company_id","document"),
	CONSTRAINT "customers_kind_valid" CHECK ("customers"."kind" IN ('fleet_owner', 'owner_operator')),
	CONSTRAINT "customers_status_valid" CHECK ("customers"."status" IN ('active', 'blocked')),
	CONSTRAINT "customers_document_format" CHECK (("customers"."kind" = 'fleet_owner' AND "customers"."document" ~ '^[0-9]{14}$') OR ("customers"."kind" = 'owner_operator' AND "customers"."document" ~ '^[0-9]{11}$')),
	CONSTRAINT "customers_phone_format" CHECK ("customers"."phone" IS NULL OR "customers"."phone" ~ '^[0-9]{10,11}$'),
	CONSTRAINT "customers_credit_limit_not_negative" CHECK ("customers"."credit_limit" >= 0),
	CONSTRAINT "customers_credit_limit_fleet_owner_only" CHECK ("customers"."kind" = 'fleet_owner' OR "customers"."credit_limit" = 0)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"model" text NOT NULL,
	"axles" smallint NOT NULL,
	"year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_company_id_plate_unq" UNIQUE("company_id","plate"),
	CONSTRAINT "vehicles_plate_format" CHECK ("vehicles"."plate" ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
	CONSTRAINT "vehicles_axles_range" CHECK ("vehicles"."axles" BETWEEN 2 AND 9),
	CONSTRAINT "vehicles_year_range" CHECK ("vehicles"."year" IS NULL OR "vehicles"."year" BETWEEN 1950 AND 2100)
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_customer_id_customers_company_id_id_fk" FOREIGN KEY ("company_id","customer_id") REFERENCES "public"."customers"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_search_idx" ON "customers" USING gin ("company_id","name" gin_trgm_ops,"document" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vehicles_company_id_customer_id_idx" ON "vehicles" USING btree ("company_id","customer_id");

-- Clientes e veículos são da empresa inteira (não de uma filial): RLS de empresa como nas demais tabelas.
SELECT lona_protect_table('customers');
--> statement-breakpoint
SELECT lona_protect_table('vehicles');
--> statement-breakpoint

-- Copiadores da demonstração (ver lona_copiers em 0001): clientes primeiro, veículos depois (chave estrangeira).
-- A faixa 100-109 é da etapa 2a.
CREATE FUNCTION lona_copy_customers(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'customers', id, uuidv7() FROM customers WHERE company_id = p_template;
	INSERT INTO customers (id, company_id, kind, name, document, phone, city, state, credit_limit, status)
	SELECT m.new_id, p_company, c.kind, c.name, c.document, c.phone, c.city, c.state, c.credit_limit, c.status
	FROM customers c
	JOIN lona_id_map m ON m.table_name = 'customers' AND m.old_id = c.id
	WHERE c.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_vehicles(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO vehicles (company_id, customer_id, plate, model, axles, year)
	SELECT p_company, lona_new_id('customers', v.customer_id), v.plate, v.model, v.axles, v.year
	FROM vehicles v
	WHERE v.company_id = p_template;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lona_copy_customers(uuid, uuid), lona_copy_vehicles(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
INSERT INTO lona_copiers (position, table_name, function_name) VALUES
	(100, 'customers', 'lona_copy_customers'),
	(101, 'vehicles', 'lona_copy_vehicles');
