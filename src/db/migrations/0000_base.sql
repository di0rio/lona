-- Base do isolamento por empresa (ADR 0001): extensões, o papel do app e os ajudantes de RLS.
-- Cada tabela de negócio chama lona_proteger_tabela() (ou a versão de filial) na migração em que nasce.

-- pg_trgm: usada na busca por texto das próximas etapas.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

-- Papel do app: sem BYPASSRLS e sem ser dono de nada. O LOGIN e a senha vêm do script db:papel, nunca de migração versionada.
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
CREATE FUNCTION lona_usuario_atual() RETURNS uuid
LANGUAGE sql STABLE AS $$
	SELECT nullif(current_setting('app.usuario_id', true), '')::uuid
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_usuario_atual() TO lona_app;
--> statement-breakpoint

-- Tabela de negócio comum: só enxerga e escreve a empresa do contexto. FORCE vale até pro dono da tabela.
CREATE FUNCTION lona_proteger_tabela(tabela regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabela);
	EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabela);
	EXECUTE format('DROP POLICY IF EXISTS empresa ON %s', tabela);
	EXECUTE format(
		'CREATE POLICY empresa ON %s USING (empresa_id = (SELECT lona_empresa_atual())) WITH CHECK (empresa_id = (SELECT lona_empresa_atual()))',
		tabela
	);
	EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO lona_app', tabela);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lona_proteger_tabela(regclass) FROM PUBLIC;
--> statement-breakpoint

-- Tabela de filial (ADR 0006): consultar para ler, operar para criar, alterar e apagar.
-- Uma política por comando, porque políticas do mesmo comando se somam (OR) e uma política geral anularia a de operar.
CREATE FUNCTION lona_proteger_tabela_de_filial(tabela regclass, coluna text DEFAULT 'filial_id') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabela);
	EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabela);
	EXECUTE format('DROP POLICY IF EXISTS filial_consultar ON %s', tabela);
	EXECUTE format('DROP POLICY IF EXISTS filial_inserir ON %s', tabela);
	EXECUTE format('DROP POLICY IF EXISTS filial_alterar ON %s', tabela);
	EXECUTE format('DROP POLICY IF EXISTS filial_apagar ON %s', tabela);
	EXECUTE format(
		'CREATE POLICY filial_consultar ON %s FOR SELECT USING (empresa_id = (SELECT lona_empresa_atual()) AND %I IN (SELECT lona_filiais_consultar()))',
		tabela, coluna
	);
	EXECUTE format(
		'CREATE POLICY filial_inserir ON %s FOR INSERT WITH CHECK (empresa_id = (SELECT lona_empresa_atual()) AND %I IN (SELECT lona_filiais_operar()))',
		tabela, coluna
	);
	EXECUTE format(
		'CREATE POLICY filial_alterar ON %s FOR UPDATE USING (empresa_id = (SELECT lona_empresa_atual()) AND %I IN (SELECT lona_filiais_operar())) WITH CHECK (empresa_id = (SELECT lona_empresa_atual()) AND %I IN (SELECT lona_filiais_operar()))',
		tabela, coluna, coluna
	);
	EXECUTE format(
		'CREATE POLICY filial_apagar ON %s FOR DELETE USING (empresa_id = (SELECT lona_empresa_atual()) AND %I IN (SELECT lona_filiais_operar()))',
		tabela, coluna
	);
	EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO lona_app', tabela);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lona_proteger_tabela_de_filial(regclass, text) FROM PUBLIC;
