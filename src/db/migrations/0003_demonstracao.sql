-- Demonstração (ADR 0002): a cópia do modelo e a limpeza das vencidas, tudo em SQL para ficar numa transação só.

-- Registro das funções que copiam cada tabela do modelo. Para uma tabela nova de negócio, a etapa que a cria
-- escreve uma função lona_copiar_<tabela>(p_modelo, p_empresa) e uma linha aqui, na ordem das chaves estrangeiras.
-- A função lona_clonar_demonstracao() nunca precisa mudar.
CREATE TABLE lona_copiadores (
	ordem integer PRIMARY KEY,
	tabela text NOT NULL UNIQUE,
	funcao name NOT NULL
);
--> statement-breakpoint

-- Id antigo -> id novo, por tabela, vivo só dentro da transação da cópia (lona_mapa é temporária).
-- Em plpgsql porque uma função SQL é conferida na criação e a tabela temporária ainda não existe.
CREATE FUNCTION lona_novo_id(p_tabela text, p_antigo uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
	v_novo uuid;
BEGIN
	SELECT novo INTO v_novo FROM lona_mapa WHERE tabela = p_tabela AND antigo = p_antigo;
	RETURN v_novo;
END
$$;
--> statement-breakpoint

-- Cada copiador: 1) sorteia o id novo de cada linha do modelo em lona_mapa; 2) insere as linhas na empresa nova
-- trocando os ids próprios e as chaves estrangeiras pelo mapa.
CREATE FUNCTION lona_copiar_filiais(p_modelo uuid, p_empresa uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_mapa SELECT 'filiais', id, uuidv7() FROM filiais WHERE empresa_id = p_modelo;
	INSERT INTO filiais (id, empresa_id, nome, codigo, cnpj, eh_matriz, ativa)
	SELECT m.novo, p_empresa, f.nome, f.codigo, f.cnpj, f.eh_matriz, f.ativa
	FROM filiais f
	JOIN lona_mapa m ON m.tabela = 'filiais' AND m.antigo = f.id
	WHERE f.empresa_id = p_modelo;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copiar_cargos(p_modelo uuid, p_empresa uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO lona_mapa SELECT 'cargos', id, uuidv7() FROM cargos WHERE empresa_id = p_modelo;
	INSERT INTO cargos (id, empresa_id, nome, padrao)
	SELECT m.novo, p_empresa, c.nome, c.padrao
	FROM cargos c
	JOIN lona_mapa m ON m.tabela = 'cargos' AND m.antigo = c.id
	WHERE c.empresa_id = p_modelo;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copiar_cargo_permissoes(p_modelo uuid, p_empresa uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO cargo_permissoes (empresa_id, cargo_id, permissao)
	SELECT p_empresa, m.novo, cp.permissao
	FROM cargo_permissoes cp
	JOIN lona_mapa m ON m.tabela = 'cargos' AND m.antigo = cp.cargo_id
	WHERE cp.empresa_id = p_modelo;
END
$$;
--> statement-breakpoint

CREATE FUNCTION lona_copiar_cargo_limites(p_modelo uuid, p_empresa uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO cargo_limites (empresa_id, cargo_id, limite, valor)
	SELECT p_empresa, m.novo, cl.limite, cl.valor
	FROM cargo_limites cl
	JOIN lona_mapa m ON m.tabela = 'cargos' AND m.antigo = cl.cargo_id
	WHERE cl.empresa_id = p_modelo;
END
$$;
--> statement-breakpoint

-- Os vínculos do modelo são dos usuários fictícios (um por cargo), que servem ao "ver como". O usuário é o mesmo
-- em todas as demonstrações; o que muda é a empresa, a filial e o cargo.
CREATE FUNCTION lona_copiar_vinculos(p_modelo uuid, p_empresa uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO vinculos (empresa_id, usuario_id, filial_id, cargo_id, nivel)
	SELECT p_empresa, v.usuario_id, lona_novo_id('filiais', v.filial_id), lona_novo_id('cargos', v.cargo_id), v.nivel
	FROM vinculos v
	WHERE v.empresa_id = p_modelo;
END
$$;
--> statement-breakpoint

INSERT INTO lona_copiadores (ordem, tabela, funcao) VALUES
	(10, 'filiais', 'lona_copiar_filiais'),
	(20, 'cargos', 'lona_copiar_cargos'),
	(21, 'cargo_permissoes', 'lona_copiar_cargo_permissoes'),
	(22, 'cargo_limites', 'lona_copiar_cargo_limites'),
	(30, 'vinculos', 'lona_copiar_vinculos');
--> statement-breakpoint

-- O modelo (ninguém o usa direto): o mais antigo marcado eh_modelo.
CREATE FUNCTION lona_modelo_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
	SELECT id FROM empresas WHERE eh_modelo ORDER BY criada_em, id LIMIT 1
$$;
--> statement-breakpoint

-- Copia o modelo para uma empresa nova que vence em 2 horas e faz do visitante o dono, com todas as filiais.
-- SECURITY DEFINER porque o app não pode ler o modelo nem inserir em empresas; em troca, só copia para quem
-- está no contexto (o usuário informado precisa ser o da transação) e só copia empresas marcadas como modelo.
CREATE FUNCTION lona_clonar_demonstracao(p_modelo uuid, p_usuario uuid) RETURNS uuid
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
--> statement-breakpoint

-- Apaga de verdade (em cascata) as demonstrações vencidas e os visitantes anônimos que ficaram sem nenhuma.
-- Roda antes de cada cópia nova e na rotina diária, que só limpa o que sobrar (ADR 0002).
CREATE FUNCTION lona_apagar_demonstracoes_vencidas() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
	v_apagadas integer;
BEGIN
	DELETE FROM empresas WHERE NOT eh_modelo AND expira_em IS NOT NULL AND expira_em <= now();
	GET DIAGNOSTICS v_apagadas = ROW_COUNT;

	-- Um dia de folga: o visitante cuja demonstração acabou ainda vê a tela "sua demonstração acabou".
	DELETE FROM autenticacao.usuarios u
	WHERE u.eh_anonimo
		AND u.criado_em < now() - interval '1 day'
		AND NOT EXISTS (SELECT 1 FROM vinculos v WHERE v.usuario_id = u.id);

	RETURN v_apagadas;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION lona_novo_id(text, uuid), lona_copiar_filiais(uuid, uuid), lona_copiar_cargos(uuid, uuid), lona_copiar_cargo_permissoes(uuid, uuid), lona_copiar_cargo_limites(uuid, uuid), lona_copiar_vinculos(uuid, uuid), lona_modelo_id(), lona_clonar_demonstracao(uuid, uuid), lona_apagar_demonstracoes_vencidas() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lona_modelo_id(), lona_clonar_demonstracao(uuid, uuid), lona_apagar_demonstracoes_vencidas() TO lona_app;
