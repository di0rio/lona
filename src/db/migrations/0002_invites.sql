CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"company_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"branch_id" uuid,
	"role_id" uuid NOT NULL,
	"level" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unq" UNIQUE("token_hash"),
	CONSTRAINT "invites_level_valid" CHECK ("invites"."level" IN ('view', 'operate'))
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_users_id_fk" FOREIGN KEY ("used_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_company_id_branch_id_branches_company_id_id_fk" FOREIGN KEY ("company_id","branch_id") REFERENCES "public"."branches"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_company_id_role_id_roles_company_id_id_fk" FOREIGN KEY ("company_id","role_id") REFERENCES "public"."roles"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_company_id_idx" ON "invites" USING btree ("company_id","expires_at");--> statement-breakpoint

-- Convite de usuário por link único: RLS de empresa como nas demais tabelas.
SELECT lona_protect_table('invites');
--> statement-breakpoint

-- Quem abre o link ainda não tem vínculo, então não passa pelo RLS da empresa. As duas funções abaixo são o único
-- caminho: SECURITY DEFINER, achadas só pelo hash do token (sha256; o token nunca chega ao banco) e só enquanto o
-- convite vale (não usado, não revogado, não vencido, empresa viva e filial ativa). Convite que não vale não aparece,
-- sem dizer o motivo.
CREATE FUNCTION lona_find_invite(p_hash text)
RETURNS TABLE (company_name text, uses_branches boolean, inviter_name text, role_name text, branch_name text, level text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT c.name, (c.settings->>'uses_branches')::boolean, u.name, r.name, b.name, i.level
	FROM invites i
	JOIN companies c ON c.id = i.company_id
	JOIN auth.users u ON u.id = i.created_by
	JOIN roles r ON r.company_id = i.company_id AND r.id = i.role_id
	LEFT JOIN branches b ON b.company_id = i.company_id AND b.id = i.branch_id
	WHERE i.token_hash = p_hash
		AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
		AND NOT c.is_template AND (c.expires_at IS NULL OR c.expires_at > now())
		AND (i.branch_id IS NULL OR b.active)
$$;
--> statement-breakpoint

-- Aceita o convite para o usuário do contexto: marca como usado e cria o vínculo, tudo numa transação. O UPDATE
-- condicional trava a linha, então duas abas ao mesmo tempo não usam o convite duas vezes: a segunda espera, relê a
-- linha já usada e não acha nada. Devolve a empresa, ou nulo se o convite não vale. Se o usuário já tem esse vínculo,
-- o INSERT falha (unique) e a transação inteira volta, deixando o convite livre.
CREATE FUNCTION lona_accept_invite(p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
	v_invite invites%ROWTYPE;
BEGIN
	IF lona_current_user() IS NULL THEN
		RAISE EXCEPTION 'o convite precisa de um usuário no contexto' USING ERRCODE = 'insufficient_privilege';
	END IF;

	UPDATE invites i SET used_at = now(), used_by = lona_current_user()
	FROM companies c
	WHERE c.id = i.company_id
		AND i.token_hash = p_hash
		AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
		AND NOT c.is_template AND (c.expires_at IS NULL OR c.expires_at > now())
		AND (i.branch_id IS NULL OR EXISTS (
			SELECT 1 FROM branches b
			WHERE b.company_id = i.company_id AND b.id = i.branch_id AND b.active
		))
	RETURNING i.* INTO v_invite;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	INSERT INTO memberships (company_id, user_id, branch_id, role_id, level)
	VALUES (v_invite.company_id, lona_current_user(), v_invite.branch_id, v_invite.role_id, v_invite.level);

	RETURN v_invite.company_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lona_find_invite(text), lona_accept_invite(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_find_invite(text), lona_accept_invite(text) TO lona_app;
--> statement-breakpoint

-- Convites não vão para demonstrações novas: o copiador existe só porque todo company_id precisa de um (ADR 0002).
CREATE FUNCTION lona_copy_invites(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	NULL;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lona_copy_invites(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
INSERT INTO lona_copiers (position, table_name, function_name) VALUES (40, 'invites', 'lona_copy_invites');
--> statement-breakpoint

-- Quem aceita um convite pode já ter uma demonstração (mais nova que a empresa real): empresa real vem antes da
-- demonstração, e entre as do mesmo tipo vale a mais recente.
CREATE OR REPLACE FUNCTION lona_user_companies() RETURNS TABLE (company_id uuid, name text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT c.id, c.name, c.expires_at
	FROM companies c
	WHERE NOT c.is_template
		AND (c.expires_at IS NULL OR c.expires_at > now())
		AND EXISTS (
			SELECT 1 FROM memberships m
			WHERE m.company_id = c.id AND m.user_id = lona_current_user()
		)
	ORDER BY (c.expires_at IS NULL) DESC, c.created_at DESC
$$;
