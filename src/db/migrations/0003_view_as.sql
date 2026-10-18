ALTER TABLE "auth"."sessions" ADD COLUMN "impersonated_by" uuid;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD COLUMN "demo_company_id" uuid;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."users" ADD CONSTRAINT "users_demo_company_id_companies_id_fk" FOREIGN KEY ("demo_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_demo_company_id_idx" ON "auth"."users" USING btree ("demo_company_id") WHERE "auth"."users"."demo_company_id" IS NOT NULL;--> statement-breakpoint

-- Cada demonstração ganha a sua própria cópia das pessoas fictícias do modelo (o "ver como"). Antes elas eram as
-- mesmas em todas as demonstrações, e entrar como uma delas cairia na demonstração de outro visitante.
-- demo_company_id liga a pessoa à demonstração; apagar a demonstração apaga as pessoas (e as sessões delas).
CREATE OR REPLACE FUNCTION lona_copy_memberships(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'users', user_id, uuidv7() FROM (SELECT DISTINCT user_id FROM memberships WHERE company_id = p_template) t;
	INSERT INTO auth.users (id, name, email, email_verified, demo_company_id)
	SELECT m.new_id, u.name, m.new_id || '.' || u.email, true, p_company
	FROM auth.users u
	JOIN lona_id_map m ON m.table_name = 'users' AND m.old_id = u.id;

	INSERT INTO memberships (company_id, user_id, branch_id, role_id, level)
	SELECT p_company, lona_new_id('users', m.user_id), lona_new_id('branches', m.branch_id), lona_new_id('roles', m.role_id), m.level
	FROM memberships m
	WHERE m.company_id = p_template;
END
$$;
