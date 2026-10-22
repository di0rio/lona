CREATE TABLE "acquirer_fees" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"acquirer_id" uuid NOT NULL,
	"modality" text NOT NULL,
	"installments" smallint NOT NULL,
	"fee_pct" numeric(5, 2) NOT NULL,
	"days_to_receive" smallint NOT NULL,
	"anticipation" boolean DEFAULT false NOT NULL,
	"anticipation_fee_pct" numeric(5, 2),
	"valid_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquirer_fees_company_id_id_unq" UNIQUE("company_id","id"),
	CONSTRAINT "acquirer_fees_validity_unq" UNIQUE("company_id","acquirer_id","modality","installments","valid_from"),
	CONSTRAINT "acquirer_fees_modality_valid" CHECK ("acquirer_fees"."modality" IN ('debit', 'credit', 'merchant_installments', 'issuer_installments')),
	CONSTRAINT "acquirer_fees_installments_valid" CHECK (("acquirer_fees"."modality" = 'merchant_installments' AND "acquirer_fees"."installments" BETWEEN 2 AND 12) OR ("acquirer_fees"."modality" <> 'merchant_installments' AND "acquirer_fees"."installments" = 1)),
	CONSTRAINT "acquirer_fees_fee_pct_range" CHECK ("acquirer_fees"."fee_pct" >= 0 AND "acquirer_fees"."fee_pct" < 100),
	CONSTRAINT "acquirer_fees_days_not_negative" CHECK ("acquirer_fees"."days_to_receive" >= 0),
	CONSTRAINT "acquirer_fees_anticipation_pct" CHECK ("acquirer_fees"."anticipation" = ("acquirer_fees"."anticipation_fee_pct" IS NOT NULL) AND ("acquirer_fees"."anticipation_fee_pct" IS NULL OR ("acquirer_fees"."anticipation_fee_pct" >= 0 AND "acquirer_fees"."anticipation_fee_pct" < 100)))
);
--> statement-breakpoint
CREATE TABLE "acquirers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acquirers_company_id_id_unq" UNIQUE("company_id","id"),
	CONSTRAINT "acquirers_company_id_name_unq" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"acquirer_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_company_id_id_unq" UNIQUE("company_id","id"),
	CONSTRAINT "payment_methods_company_id_name_unq" UNIQUE("company_id","name"),
	CONSTRAINT "payment_methods_kind_valid" CHECK ("payment_methods"."kind" IN ('cash', 'pix', 'debit_card', 'credit_card', 'bank_slip', 'on_account')),
	CONSTRAINT "payment_methods_card_has_acquirer" CHECK (("payment_methods"."kind" IN ('debit_card', 'credit_card')) = ("payment_methods"."acquirer_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_terms" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"installment_days" smallint[] NOT NULL,
	"issuer_installments" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_terms_company_id_name_unq" UNIQUE("company_id","name"),
	CONSTRAINT "payment_terms_installments_count" CHECK (cardinality("payment_terms"."installment_days") BETWEEN 1 AND 12),
	CONSTRAINT "payment_terms_first_day_not_negative" CHECK ("payment_terms"."installment_days"[1] >= 0)
);
--> statement-breakpoint
ALTER TABLE "acquirer_fees" ADD CONSTRAINT "acquirer_fees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquirer_fees" ADD CONSTRAINT "acquirer_fees_company_id_acquirer_id_acquirers_company_id_id_fk" FOREIGN KEY ("company_id","acquirer_id") REFERENCES "public"."acquirers"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acquirers" ADD CONSTRAINT "acquirers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_company_id_acquirer_id_acquirers_company_id_id_fk" FOREIGN KEY ("company_id","acquirer_id") REFERENCES "public"."acquirers"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_terms" ADD CONSTRAINT "payment_terms_company_id_payment_method_id_payment_methods_company_id_id_fk" FOREIGN KEY ("company_id","payment_method_id") REFERENCES "public"."payment_methods"("company_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_terms_method_idx" ON "payment_terms" USING btree ("company_id","payment_method_id");--> statement-breakpoint

-- Formas, operadoras, taxas e condições de pagamento: RLS de empresa como nas demais tabelas.
SELECT lona_protect_table('acquirers');
--> statement-breakpoint
SELECT lona_protect_table('acquirer_fees');
--> statement-breakpoint
SELECT lona_protect_table('payment_methods');
--> statement-breakpoint
SELECT lona_protect_table('payment_terms');
--> statement-breakpoint

-- Cargos prontos que já existem (empresas reais e o modelo) ganham a permissão nova.
-- Roda como dono do banco, que ignora o RLS (como o resto das migrações).
INSERT INTO role_permissions (company_id, role_id, permission)
SELECT company_id, id, 'payment_methods.manage'
FROM roles
WHERE is_preset AND name IN ('dono', 'gerente', 'financeiro')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Copiadores da demonstração, na ordem das chaves estrangeiras (as posições 50-69 são de outros módulos).
CREATE FUNCTION lona_copy_acquirers(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'acquirers', id, uuidv7() FROM acquirers WHERE company_id = p_template;
	INSERT INTO acquirers (id, company_id, name, active)
	SELECT m.new_id, p_company, a.name, a.active
	FROM acquirers a
	JOIN lona_id_map m ON m.table_name = 'acquirers' AND m.old_id = a.id
	WHERE a.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_acquirer_fees(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'acquirer_fees', id, uuidv7() FROM acquirer_fees WHERE company_id = p_template;
	INSERT INTO acquirer_fees (id, company_id, acquirer_id, modality, installments, fee_pct, days_to_receive, anticipation, anticipation_fee_pct, valid_from)
	SELECT m.new_id, p_company, lona_new_id('acquirers', f.acquirer_id), f.modality, f.installments, f.fee_pct, f.days_to_receive, f.anticipation, f.anticipation_fee_pct, f.valid_from
	FROM acquirer_fees f
	JOIN lona_id_map m ON m.table_name = 'acquirer_fees' AND m.old_id = f.id
	WHERE f.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_payment_methods(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'payment_methods', id, uuidv7() FROM payment_methods WHERE company_id = p_template;
	INSERT INTO payment_methods (id, company_id, name, kind, acquirer_id, active)
	SELECT m.new_id, p_company, pm.name, pm.kind, lona_new_id('acquirers', pm.acquirer_id), pm.active
	FROM payment_methods pm
	JOIN lona_id_map m ON m.table_name = 'payment_methods' AND m.old_id = pm.id
	WHERE pm.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_payment_terms(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'payment_terms', id, uuidv7() FROM payment_terms WHERE company_id = p_template;
	INSERT INTO payment_terms (id, company_id, name, payment_method_id, installment_days, issuer_installments, active)
	SELECT m.new_id, p_company, pt.name, lona_new_id('payment_methods', pt.payment_method_id), pt.installment_days, pt.issuer_installments, pt.active
	FROM payment_terms pt
	JOIN lona_id_map m ON m.table_name = 'payment_terms' AND m.old_id = pt.id
	WHERE pt.company_id = p_template;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lona_copy_acquirers(uuid, uuid), lona_copy_acquirer_fees(uuid, uuid), lona_copy_payment_methods(uuid, uuid), lona_copy_payment_terms(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
INSERT INTO lona_copiers (position, table_name, function_name) VALUES
	(70, 'acquirers', 'lona_copy_acquirers'),
	(71, 'acquirer_fees', 'lona_copy_acquirer_fees'),
	(72, 'payment_methods', 'lona_copy_payment_methods'),
	(73, 'payment_terms', 'lona_copy_payment_terms');
