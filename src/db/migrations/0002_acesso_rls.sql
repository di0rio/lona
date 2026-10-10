-- RLS das tabelas do módulo acesso (ADR 0001, 0002 e 0006).
-- As funções abaixo são SECURITY DEFINER para ler empresas e vínculos sem cair nas próprias políticas (recursão);
-- por isso cada uma fixa o search_path e só devolve o que o contexto da transação (usuario_id, empresa_id) permite.

-- A empresa do contexto, ou nada. Nada quando: não há contexto, é o modelo (ninguém o usa direto), a empresa venceu
-- (ADR 0002) ou o usuário não tem vínculo nela (ADR 0006: sem vínculo, não vê nada).
CREATE FUNCTION lona_empresa_atual() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT e.id
	FROM empresas e
	WHERE e.id = nullif(current_setting('app.empresa_id', true), '')::uuid
		AND NOT e.eh_modelo
		AND (e.expira_em IS NULL OR e.expira_em > now())
		AND EXISTS (
			SELECT 1 FROM vinculos v
			WHERE v.empresa_id = e.id AND v.usuario_id = lona_usuario_atual()
		)
$$;
--> statement-breakpoint

-- Filiais que o usuário consulta (qualquer vínculo; filial_id nulo vale para todas).
CREATE FUNCTION lona_filiais_consultar() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT f.id
	FROM filiais f
	WHERE f.empresa_id = lona_empresa_atual()
		AND EXISTS (
			SELECT 1 FROM vinculos v
			WHERE v.empresa_id = f.empresa_id
				AND v.usuario_id = lona_usuario_atual()
				AND (v.filial_id IS NULL OR v.filial_id = f.id)
		)
$$;
--> statement-breakpoint

-- Filiais em que o usuário opera (vínculo com nível operar). Quem opera também consulta.
CREATE FUNCTION lona_filiais_operar() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT f.id
	FROM filiais f
	WHERE f.empresa_id = lona_empresa_atual()
		AND EXISTS (
			SELECT 1 FROM vinculos v
			WHERE v.empresa_id = f.empresa_id
				AND v.usuario_id = lona_usuario_atual()
				AND v.nivel = 'operar'
				AND (v.filial_id IS NULL OR v.filial_id = f.id)
		)
$$;
--> statement-breakpoint

-- Opera em todas as filiais: quem pode criar filial nova.
CREATE FUNCTION lona_opera_todas_filiais() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT EXISTS (
		SELECT 1 FROM vinculos v
		WHERE v.empresa_id = lona_empresa_atual()
			AND v.usuario_id = lona_usuario_atual()
			AND v.nivel = 'operar'
			AND v.filial_id IS NULL
	)
$$;
--> statement-breakpoint

-- Logo depois do login ainda não há empresa no contexto: esta função acha as empresas ativas do usuário.
-- Empresa vencida não aparece (a tela "sua demonstração acabou" parte de não haver nenhuma).
CREATE FUNCTION lona_empresas_do_usuario() RETURNS TABLE (empresa_id uuid, nome text, expira_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT e.id, e.nome, e.expira_em
	FROM empresas e
	WHERE NOT e.eh_modelo
		AND (e.expira_em IS NULL OR e.expira_em > now())
		AND EXISTS (
			SELECT 1 FROM vinculos v
			WHERE v.empresa_id = e.id AND v.usuario_id = lona_usuario_atual()
		)
	ORDER BY e.criada_em DESC
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lona_empresa_atual(), lona_filiais_consultar(), lona_filiais_operar(), lona_opera_todas_filiais(), lona_empresas_do_usuario() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_empresa_atual(), lona_filiais_consultar(), lona_filiais_operar(), lona_opera_todas_filiais(), lona_empresas_do_usuario() TO lona_app;
--> statement-breakpoint

-- empresas: o app lê e ajusta a própria empresa. Não cria (quem cria é a cópia da demonstração, em SQL) e só apaga
-- demonstração. Nome, cor e configuração são as únicas colunas que ele altera: nada de adiar o vencimento.
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE empresas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY empresa_consultar ON empresas FOR SELECT USING (id = (SELECT lona_empresa_atual()));
--> statement-breakpoint
CREATE POLICY empresa_alterar ON empresas FOR UPDATE
	USING (id = (SELECT lona_empresa_atual()))
	WITH CHECK (id = (SELECT lona_empresa_atual()));
--> statement-breakpoint
CREATE POLICY empresa_apagar ON empresas FOR DELETE
	USING (id = (SELECT lona_empresa_atual()) AND expira_em IS NOT NULL);
--> statement-breakpoint
GRANT SELECT, DELETE ON empresas TO lona_app;
--> statement-breakpoint
GRANT UPDATE (nome, cor, config) ON empresas TO lona_app;
--> statement-breakpoint

-- filiais é tabela de filial: o usuário só enxerga as que consulta e só mexe nas que opera. Filial nova nasce nas
-- mãos de quem opera em todas (a filial ainda não existe, então não dá para conferir a lista de operar).
ALTER TABLE filiais ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE filiais FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY filial_consultar ON filiais FOR SELECT
	USING (empresa_id = (SELECT lona_empresa_atual()) AND id IN (SELECT lona_filiais_consultar()));
--> statement-breakpoint
CREATE POLICY filial_inserir ON filiais FOR INSERT
	WITH CHECK (empresa_id = (SELECT lona_empresa_atual()) AND (SELECT lona_opera_todas_filiais()));
--> statement-breakpoint
CREATE POLICY filial_alterar ON filiais FOR UPDATE
	USING (empresa_id = (SELECT lona_empresa_atual()) AND id IN (SELECT lona_filiais_operar()))
	WITH CHECK (empresa_id = (SELECT lona_empresa_atual()) AND id IN (SELECT lona_filiais_operar()));
--> statement-breakpoint
CREATE POLICY filial_apagar ON filiais FOR DELETE
	USING (empresa_id = (SELECT lona_empresa_atual()) AND id IN (SELECT lona_filiais_operar()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON filiais TO lona_app;
--> statement-breakpoint

SELECT lona_proteger_tabela('cargos');
--> statement-breakpoint
SELECT lona_proteger_tabela('cargo_permissoes');
--> statement-breakpoint
SELECT lona_proteger_tabela('cargo_limites');
--> statement-breakpoint
SELECT lona_proteger_tabela('vinculos');
--> statement-breakpoint

-- Tabelas do Better Auth: sem RLS de empresa, só o que o app precisa.
GRANT USAGE ON SCHEMA autenticacao TO lona_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON autenticacao.usuarios, autenticacao.sessoes, autenticacao.contas, autenticacao.verificacoes TO lona_app;
