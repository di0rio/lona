-- A limpeza das vencidas passa a ser o primeiro passo da própria cópia (ADR 0002): vale para qualquer chamador e
-- poupa uma ida ao banco. O resto da função é o mesmo da migração 0003.
CREATE OR REPLACE FUNCTION lona_clonar_demonstracao(p_modelo uuid, p_usuario uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
	v_empresa uuid;
	v_copiador record;
BEGIN
	IF p_usuario IS NULL OR p_usuario IS DISTINCT FROM lona_usuario_atual() THEN
		RAISE EXCEPTION 'o usuário da cópia precisa ser o do contexto' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF NOT EXISTS (SELECT 1 FROM empresas WHERE id = p_modelo AND eh_modelo) THEN
		RAISE EXCEPTION 'modelo não encontrado' USING ERRCODE = 'no_data_found';
	END IF;

	PERFORM lona_apagar_demonstracoes_vencidas();

	CREATE TEMP TABLE IF NOT EXISTS lona_mapa (
		tabela text NOT NULL,
		antigo uuid NOT NULL,
		novo uuid NOT NULL,
		PRIMARY KEY (tabela, antigo)
	) ON COMMIT DROP;
	TRUNCATE lona_mapa;

	INSERT INTO empresas (nome, raiz_cnpj, eh_modelo, expira_em, cor, config)
	SELECT nome, raiz_cnpj, false, now() + interval '2 hours', cor, config
	FROM empresas
	WHERE id = p_modelo
	RETURNING id INTO v_empresa;

	FOR v_copiador IN SELECT funcao FROM lona_copiadores ORDER BY ordem LOOP
		EXECUTE format('SELECT %I($1, $2)', v_copiador.funcao) USING p_modelo, v_empresa;
	END LOOP;

	INSERT INTO vinculos (empresa_id, usuario_id, filial_id, cargo_id, nivel)
	SELECT v_empresa, p_usuario, NULL, c.id, 'operar'
	FROM cargos c
	WHERE c.empresa_id = v_empresa AND c.padrao AND c.nome = 'dono';

	RETURN v_empresa;
END
$$;
