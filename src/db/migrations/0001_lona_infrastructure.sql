-- Base do isolamento por empresa (ADR 0001): extensões, o papel do app e os ajudantes de RLS.
-- Cada tabela de negócio chama lona_protect_table() (ou a versão de filial) aqui embaixo.

-- pg_trgm: usada na busca por texto das próximas etapas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- Papel do app: sem BYPASSRLS e sem ser dono de nada. O LOGIN e a senha vêm do script db:app-role, nunca de migração versionada.
DO $$
BEGIN
	IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lona_app') THEN
		CREATE ROLE lona_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
	END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO lona_app;
--> statement-breakpoint

-- Quem está usando o sistema nesta transação. O app seta com set_config(..., true), então some no COMMIT.
CREATE FUNCTION lona_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
	SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_current_user() TO lona_app;
--> statement-breakpoint

-- Tabela de negócio comum: só enxerga e escreve a empresa do contexto. FORCE vale até pro dono da tabela.
CREATE FUNCTION lona_protect_table(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
	EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
	EXECUTE format('DROP POLICY IF EXISTS company ON %s', target);
	EXECUTE format(
		'CREATE POLICY company ON %s USING (company_id = (SELECT lona_current_company())) WITH CHECK (company_id = (SELECT lona_current_company()))',
		target
	);
	EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO lona_app', target);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lona_protect_table(regclass) FROM PUBLIC;
--> statement-breakpoint

-- Tabela de filial (ADR 0006): consultar para ler, operar para criar, alterar e apagar.
-- Uma política por comando, porque políticas do mesmo comando se somam (OR) e uma política geral anularia a de operar.
CREATE FUNCTION lona_protect_branch_table(target regclass, column_name text DEFAULT 'branch_id') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
	EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
	EXECUTE format('DROP POLICY IF EXISTS branch_view ON %s', target);
	EXECUTE format('DROP POLICY IF EXISTS branch_insert ON %s', target);
	EXECUTE format('DROP POLICY IF EXISTS branch_update ON %s', target);
	EXECUTE format('DROP POLICY IF EXISTS branch_delete ON %s', target);
	EXECUTE format(
		'CREATE POLICY branch_view ON %s FOR SELECT USING (company_id = (SELECT lona_current_company()) AND %I IN (SELECT lona_branches_view()))',
		target, column_name
	);
	EXECUTE format(
		'CREATE POLICY branch_insert ON %s FOR INSERT WITH CHECK (company_id = (SELECT lona_current_company()) AND %I IN (SELECT lona_branches_operate()))',
		target, column_name
	);
	EXECUTE format(
		'CREATE POLICY branch_update ON %s FOR UPDATE USING (company_id = (SELECT lona_current_company()) AND %I IN (SELECT lona_branches_operate())) WITH CHECK (company_id = (SELECT lona_current_company()) AND %I IN (SELECT lona_branches_operate()))',
		target, column_name, column_name
	);
	EXECUTE format(
		'CREATE POLICY branch_delete ON %s FOR DELETE USING (company_id = (SELECT lona_current_company()) AND %I IN (SELECT lona_branches_operate()))',
		target, column_name
	);
	EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO lona_app', target);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lona_protect_branch_table(regclass, text) FROM PUBLIC;
--> statement-breakpoint

-- RLS das tabelas do módulo access (ADR 0001, 0002 e 0006).
-- As funções abaixo são SECURITY DEFINER para ler empresas e vínculos sem cair nas próprias políticas (recursão);
-- por isso cada uma fixa o search_path e só devolve o que o contexto da transação (user_id, company_id) permite.

-- A empresa do contexto, ou nada. Nada quando: não há contexto, é o modelo (ninguém o usa direto), a empresa venceu
-- (ADR 0002) ou o usuário não tem vínculo nela (ADR 0006: sem vínculo, não vê nada).
CREATE FUNCTION lona_current_company() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT c.id
	FROM companies c
	WHERE c.id = nullif(current_setting('app.company_id', true), '')::uuid
		AND NOT c.is_template
		AND (c.expires_at IS NULL OR c.expires_at > now())
		AND EXISTS (
			SELECT 1 FROM memberships m
			WHERE m.company_id = c.id AND m.user_id = lona_current_user()
		)
$$;
--> statement-breakpoint

-- Filiais que o usuário consulta (qualquer vínculo; branch_id nulo vale para todas).
CREATE FUNCTION lona_branches_view() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT b.id
	FROM branches b
	WHERE b.company_id = lona_current_company()
		AND EXISTS (
			SELECT 1 FROM memberships m
			WHERE m.company_id = b.company_id
				AND m.user_id = lona_current_user()
				AND (m.branch_id IS NULL OR m.branch_id = b.id)
		)
$$;
--> statement-breakpoint

-- Filiais em que o usuário opera (vínculo com nível operate). Quem opera também consulta.
CREATE FUNCTION lona_branches_operate() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT b.id
	FROM branches b
	WHERE b.company_id = lona_current_company()
		AND EXISTS (
			SELECT 1 FROM memberships m
			WHERE m.company_id = b.company_id
				AND m.user_id = lona_current_user()
				AND m.level = 'operate'
				AND (m.branch_id IS NULL OR m.branch_id = b.id)
		)
$$;
--> statement-breakpoint

-- Opera em todas as filiais: quem pode criar filial nova.
CREATE FUNCTION lona_operates_all_branches() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT EXISTS (
		SELECT 1 FROM memberships m
		WHERE m.company_id = lona_current_company()
			AND m.user_id = lona_current_user()
			AND m.level = 'operate'
			AND m.branch_id IS NULL
	)
$$;
--> statement-breakpoint

-- Logo depois do login ainda não há empresa no contexto: esta função acha as empresas ativas do usuário.
-- Empresa vencida não aparece (a tela "sua demonstração acabou" parte de não haver nenhuma).
CREATE FUNCTION lona_user_companies() RETURNS TABLE (company_id uuid, name text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT c.id, c.name, c.expires_at
	FROM companies c
	WHERE NOT c.is_template
		AND (c.expires_at IS NULL OR c.expires_at > now())
		AND EXISTS (
			SELECT 1 FROM memberships m
			WHERE m.company_id = c.id AND m.user_id = lona_current_user()
		)
	ORDER BY c.created_at DESC
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lona_current_company(), lona_branches_view(), lona_branches_operate(), lona_operates_all_branches(), lona_user_companies() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_current_company(), lona_branches_view(), lona_branches_operate(), lona_operates_all_branches(), lona_user_companies() TO lona_app;
--> statement-breakpoint

-- companies: o app lê e ajusta a própria empresa. Não cria (quem cria é a cópia da demonstração, em SQL) e só apaga
-- demonstração. Nome, cor e configuração são as únicas colunas que ele altera: nada de adiar o vencimento.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY company_view ON companies FOR SELECT USING (id = (SELECT lona_current_company()));
--> statement-breakpoint
CREATE POLICY company_update ON companies FOR UPDATE
	USING (id = (SELECT lona_current_company()))
	WITH CHECK (id = (SELECT lona_current_company()));
--> statement-breakpoint
CREATE POLICY company_delete ON companies FOR DELETE
	USING (id = (SELECT lona_current_company()) AND expires_at IS NOT NULL);
--> statement-breakpoint
GRANT SELECT, DELETE ON companies TO lona_app;
--> statement-breakpoint
GRANT UPDATE (name, color, settings) ON companies TO lona_app;
--> statement-breakpoint

-- branches é tabela de filial: o usuário só enxerga as que consulta e só mexe nas que opera. Filial nova nasce nas
-- mãos de quem opera em todas (a filial ainda não existe, então não dá para conferir a lista de operar).
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY branch_view ON branches FOR SELECT
	USING (company_id = (SELECT lona_current_company()) AND id IN (SELECT lona_branches_view()));
--> statement-breakpoint
CREATE POLICY branch_insert ON branches FOR INSERT
	WITH CHECK (company_id = (SELECT lona_current_company()) AND (SELECT lona_operates_all_branches()));
--> statement-breakpoint
CREATE POLICY branch_update ON branches FOR UPDATE
	USING (company_id = (SELECT lona_current_company()) AND id IN (SELECT lona_branches_operate()))
	WITH CHECK (company_id = (SELECT lona_current_company()) AND id IN (SELECT lona_branches_operate()));
--> statement-breakpoint
CREATE POLICY branch_delete ON branches FOR DELETE
	USING (company_id = (SELECT lona_current_company()) AND id IN (SELECT lona_branches_operate()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON branches TO lona_app;
--> statement-breakpoint

SELECT lona_protect_table('roles');
--> statement-breakpoint
SELECT lona_protect_table('role_permissions');
--> statement-breakpoint
SELECT lona_protect_table('role_limits');
--> statement-breakpoint
SELECT lona_protect_table('memberships');
--> statement-breakpoint

-- Tabelas do Better Auth: sem RLS de empresa, só o que o app precisa.
GRANT USAGE ON SCHEMA auth TO lona_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON auth.users, auth.sessions, auth.accounts, auth.verifications TO lona_app;
--> statement-breakpoint

-- Demonstração (ADR 0002): a cópia do modelo e a limpeza das vencidas, tudo em SQL para ficar numa transação só.

-- Registro das funções que copiam cada tabela do modelo. Para uma tabela nova de negócio, a etapa que a cria
-- escreve uma função lona_copy_<table>(p_template, p_company) e uma linha aqui, na ordem das chaves estrangeiras.
-- A função lona_clone_demo() nunca precisa mudar.
CREATE TABLE lona_copiers (
	position integer PRIMARY KEY,
	table_name text NOT NULL UNIQUE,
	function_name name NOT NULL
);
--> statement-breakpoint

-- Id antigo -> id novo, por tabela, vivo só dentro da transação da cópia (lona_id_map é temporária).
-- Em plpgsql porque uma função SQL é conferida na criação e a tabela temporária ainda não existe.
CREATE FUNCTION lona_new_id(p_table text, p_old uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
	v_new uuid;
BEGIN
	SELECT new_id INTO v_new FROM lona_id_map WHERE table_name = p_table AND old_id = p_old;
	RETURN v_new;
END
$$;
--> statement-breakpoint

-- Cada copiador: 1) sorteia o id novo de cada linha do modelo em lona_id_map; 2) insere as linhas na empresa nova
-- trocando os ids próprios e as chaves estrangeiras pelo mapa.
CREATE FUNCTION lona_copy_branches(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'branches', id, uuidv7() FROM branches WHERE company_id = p_template;
	INSERT INTO branches (id, company_id, name, code, cnpj, is_headquarters, active)
	SELECT m.new_id, p_company, b.name, b.code, b.cnpj, b.is_headquarters, b.active
	FROM branches b
	JOIN lona_id_map m ON m.table_name = 'branches' AND m.old_id = b.id
	WHERE b.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_roles(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_id_map SELECT 'roles', id, uuidv7() FROM roles WHERE company_id = p_template;
	INSERT INTO roles (id, company_id, name, is_preset)
	SELECT m.new_id, p_company, r.name, r.is_preset
	FROM roles r
	JOIN lona_id_map m ON m.table_name = 'roles' AND m.old_id = r.id
	WHERE r.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_role_permissions(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO role_permissions (company_id, role_id, permission)
	SELECT p_company, m.new_id, rp.permission
	FROM role_permissions rp
	JOIN lona_id_map m ON m.table_name = 'roles' AND m.old_id = rp.role_id
	WHERE rp.company_id = p_template;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copy_role_limits(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO role_limits (company_id, role_id, limit_key, value)
	SELECT p_company, m.new_id, rl.limit_key, rl.value
	FROM role_limits rl
	JOIN lona_id_map m ON m.table_name = 'roles' AND m.old_id = rl.role_id
	WHERE rl.company_id = p_template;
END
$$;
--> statement-breakpoint

-- Os vínculos do modelo são dos usuários fictícios (um por cargo), que servem ao "ver como". O usuário é o mesmo
-- em todas as demonstrações; o que muda é a empresa, a filial e o cargo.
CREATE FUNCTION lona_copy_memberships(p_template uuid, p_company uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO memberships (company_id, user_id, branch_id, role_id, level)
	SELECT p_company, m.user_id, lona_new_id('branches', m.branch_id), lona_new_id('roles', m.role_id), m.level
	FROM memberships m
	WHERE m.company_id = p_template;
END
$$;
--> statement-breakpoint

INSERT INTO lona_copiers (position, table_name, function_name) VALUES
	(10, 'branches', 'lona_copy_branches'),
	(20, 'roles', 'lona_copy_roles'),
	(21, 'role_permissions', 'lona_copy_role_permissions'),
	(22, 'role_limits', 'lona_copy_role_limits'),
	(30, 'memberships', 'lona_copy_memberships');
--> statement-breakpoint

-- O modelo (ninguém o usa direto): o mais antigo marcado is_template.
CREATE FUNCTION lona_template_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT id FROM companies WHERE is_template ORDER BY created_at, id LIMIT 1
$$;
--> statement-breakpoint

-- Copia o modelo para uma empresa nova que vence em 2 horas e faz do visitante o dono, com todas as filiais.
-- SECURITY DEFINER porque o app não pode ler o modelo nem inserir em companies; em troca, só copia para quem
-- está no contexto (o usuário informado precisa ser o da transação) e só copia empresas marcadas como modelo.
CREATE FUNCTION lona_clone_demo(p_template uuid, p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
	v_company uuid;
	v_copier record;
BEGIN
	IF p_user IS NULL OR p_user IS DISTINCT FROM lona_current_user() THEN
		RAISE EXCEPTION 'o usuário da cópia precisa ser o do contexto' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_template AND is_template) THEN
		RAISE EXCEPTION 'modelo não encontrado' USING ERRCODE = 'no_data_found';
	END IF;

	PERFORM lona_delete_expired_demos();

	CREATE TEMP TABLE IF NOT EXISTS lona_id_map (
		table_name text NOT NULL,
		old_id uuid NOT NULL,
		new_id uuid NOT NULL,
		PRIMARY KEY (table_name, old_id)
	) ON COMMIT DROP;
	TRUNCATE lona_id_map;

	INSERT INTO companies (name, cnpj_root, is_template, expires_at, color, settings)
	SELECT name, cnpj_root, false, now() + interval '2 hours', color, settings
	FROM companies
	WHERE id = p_template
	RETURNING id INTO v_company;

	FOR v_copier IN SELECT function_name FROM lona_copiers ORDER BY position LOOP
		EXECUTE format('SELECT %I($1, $2)', v_copier.function_name) USING p_template, v_company;
	END LOOP;

	INSERT INTO memberships (company_id, user_id, branch_id, role_id, level)
	SELECT v_company, p_user, NULL, r.id, 'operate'
	FROM roles r
	WHERE r.company_id = v_company AND r.is_preset AND r.name = 'dono';

	RETURN v_company;
END
$$;
--> statement-breakpoint

-- Apaga de verdade (em cascata) as demonstrações vencidas e os visitantes anônimos que ficaram sem nenhuma.
-- Roda antes de cada cópia nova e na rotina diária, que só limpa o que sobrar (ADR 0002).
CREATE FUNCTION lona_delete_expired_demos() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
	v_deleted integer;
BEGIN
	DELETE FROM companies WHERE NOT is_template AND expires_at IS NOT NULL AND expires_at <= now();
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	-- Um dia de folga: o visitante cuja demonstração acabou ainda vê a tela "sua demonstração acabou".
	DELETE FROM auth.users u
	WHERE u.is_anonymous
		AND u.created_at < now() - interval '1 day'
		AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id);

	RETURN v_deleted;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lona_new_id(text, uuid), lona_copy_branches(uuid, uuid), lona_copy_roles(uuid, uuid), lona_copy_role_permissions(uuid, uuid), lona_copy_role_limits(uuid, uuid), lona_copy_memberships(uuid, uuid), lona_template_id(), lona_clone_demo(uuid, uuid), lona_delete_expired_demos() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_template_id(), lona_clone_demo(uuid, uuid), lona_delete_expired_demos() TO lona_app;
