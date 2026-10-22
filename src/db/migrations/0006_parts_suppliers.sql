-- Peças com aplicação e fornecedores (etapa 2b): busca sem acento, as três tabelas e o que o modelo da demonstração precisa.

-- btree_gin deixa o índice de busca começar pela empresa (uuid); unaccent tira os acentos para "valvula" achar "Válvula".
CREATE EXTENSION IF NOT EXISTS btree_gin;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

-- unaccent() em si é STABLE, e coluna gerada e índice exigem IMMUTABLE. Fixar o dicionário (e o schema) é o que a
-- torna segura de declarar IMMUTABLE.
CREATE FUNCTION lona_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
	SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_unaccent(text) TO lona_app;
--> statement-breakpoint

CREATE TABLE "part_applications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"vehicle_model" text NOT NULL,
	"axle" text,
	"search" text GENERATED ALWAYS AS (lona_unaccent(lower(vehicle_model))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_applications_axle_valid" CHECK ("part_applications"."axle" IN ('front', 'rear'))
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"brand" text NOT NULL,
	"manufacturer_ref" text,
	"unit" text NOT NULL,
	"ncm" char(8),
	"sale_price" numeric(12, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"search" text GENERATED ALWAYS AS (lona_unaccent(lower(code || ' ' || description || ' ' || brand || ' ' || coalesce(manufacturer_ref, '')))) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parts_company_id_id_unq" UNIQUE("company_id","id"),
	CONSTRAINT "parts_company_id_code_unq" UNIQUE("company_id","code"),
	CONSTRAINT "parts_unit_valid" CHECK ("parts"."unit" IN ('UN', 'PC', 'JG', 'KIT', 'PAR', 'CJ')),
	CONSTRAINT "parts_ncm_format" CHECK ("parts"."ncm" ~ '^[0-9]{8}$'),
	CONSTRAINT "parts_sale_price_not_negative" CHECK ("parts"."sale_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"cnpj" char(14) NOT NULL,
	"contact_name" text,
	"phone" text,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_company_id_cnpj_unq" UNIQUE("company_id","cnpj"),
	CONSTRAINT "suppliers_cnpj_format" CHECK ("suppliers"."cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$'),
	CONSTRAINT "suppliers_phone_format" CHECK ("suppliers"."phone" ~ '^[0-9]{10,11}$'),
	CONSTRAINT "suppliers_state_valid" CHECK ("suppliers"."state" IN ('AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'))
);
--> statement-breakpoint
ALTER TABLE "part_applications" ADD CONSTRAINT "part_applications_company_id_part_id_parts_company_id_id_fk" FOREIGN KEY ("company_id","part_id") REFERENCES "public"."parts"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_applications_search_idx" ON "part_applications" USING gin ("company_id","search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "part_applications_part_idx" ON "part_applications" USING btree ("company_id","part_id");--> statement-breakpoint
CREATE INDEX "parts_search_idx" ON "parts" USING gin ("company_id","search" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "suppliers_legal_name_idx" ON "suppliers" USING btree ("company_id","legal_name");
--> statement-breakpoint

-- Chaves para a empresa (o schema do Drizzle não as declara: um módulo não importa as tabelas de outro).
ALTER TABLE "parts" ADD CONSTRAINT "parts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "part_applications" ADD CONSTRAINT "part_applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- RLS de empresa nas três tabelas.
SELECT lona_protect_table('parts');
--> statement-breakpoint
SELECT lona_protect_table('part_applications');
--> statement-breakpoint
SELECT lona_protect_table('suppliers');
--> statement-breakpoint

-- Copiadores da demonstração (ver lona_copiers em 0001): fornecedores, peças e depois as aplicações, que apontam
-- para as peças já copiadas. A coluna search é gerada, então fica fora dos INSERTs.
CREATE FUNCTION lona_copy_suppliers(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO suppliers (company_id, legal_name, cnpj, contact_name, phone, city, state, active)
	SELECT p_company, s.legal_name, s.cnpj, s.contact_name, s.phone, s.city, s.state, s.active
	FROM suppliers s
	WHERE s.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_parts(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'parts', id, uuidv7() FROM parts WHERE company_id = p_template;
	INSERT INTO parts (id, company_id, code, description, brand, manufacturer_ref, unit, ncm, sale_price, active)
	SELECT m.new_id, p_company, p.code, p.description, p.brand, p.manufacturer_ref, p.unit, p.ncm, p.sale_price, p.active
	FROM parts p
	JOIN lona_id_map m ON m.table_name = 'parts' AND m.old_id = p.id
	WHERE p.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_part_applications(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO part_applications (company_id, part_id, vehicle_model, axle)
	SELECT p_company, m.new_id, a.vehicle_model, a.axle
	FROM part_applications a
	JOIN lona_id_map m ON m.table_name = 'parts' AND m.old_id = a.part_id
	WHERE a.company_id = p_template;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lona_copy_suppliers(uuid, uuid), lona_copy_parts(uuid, uuid), lona_copy_part_applications(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint

INSERT INTO lona_copiers (position, table_name, function_name) VALUES
	(210, 'suppliers', 'lona_copy_suppliers'),
	(220, 'parts', 'lona_copy_parts'),
	(221, 'part_applications', 'lona_copy_part_applications');
--> statement-breakpoint

-- Empresas que já existem: o dono e o gerente prontos ganham as permissões novas (cargo de empresa nova já nasce
-- com elas, por ready-roles.ts).
INSERT INTO role_permissions (company_id, role_id, permission)
SELECT r.company_id, r.id, p.permission
FROM roles r
CROSS JOIN (VALUES ('inventory.manage_parts'), ('purchasing.manage_suppliers')) AS p (permission)
WHERE r.is_preset AND r.name IN ('dono', 'gerente')
ON CONFLICT DO NOTHING;
