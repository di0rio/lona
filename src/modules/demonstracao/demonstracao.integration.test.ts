import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { app } from "@/api";
import { criarEmpresa, criarVinculo } from "@/modules/acesso";
import {
	comoApp,
	conectarComoApp,
	conectarComoDono,
	criarUsuarioDeTeste,
	drizzleDoDono,
	temBanco,
} from "@/test/banco";
import { semearModelo } from "./modelo";
import {
	iniciarDemonstracao,
	limparDemonstracoesVencidas,
	resetarDemonstracao,
} from "./service";

// Tabelas que a cópia reproduz, na ordem das chaves estrangeiras, com a coluna que as liga à empresa.
const ids = (pool: pg.Pool, tabela: string, empresaId: string) =>
	pool
		.query<{ id: string }>(
			`SELECT concat_ws('|', ${
				tabela === "cargo_permissoes"
					? "cargo_id, permissao"
					: tabela === "cargo_limites"
						? "cargo_id, limite"
						: "id"
			}) AS id FROM ${tabela} WHERE empresa_id = $1`,
			[empresaId],
		)
		.then(({ rows }) => rows.map((r) => r.id));

describe.skipIf(!temBanco)("demonstração", () => {
	let dono: pg.Pool;
	let app_: pg.Pool;
	let modeloId: string;
	let criouModelo = false;
	const usuarioIds: string[] = [];
	const empresaIds: string[] = [];

	const novoVisitante = async (apelido = "visitante") => {
		const id = await criarUsuarioDeTeste(dono, apelido);
		usuarioIds.push(id);
		return id;
	};

	const existe = async (empresaId: string) => {
		const { rows } = await dono.query("SELECT 1 FROM empresas WHERE id = $1", [
			empresaId,
		]);
		return rows.length === 1;
	};

	beforeAll(async () => {
		dono = conectarComoDono();
		app_ = conectarComoApp();
		// O modelo vem do `bun run db:seed`; se o banco ainda não o tem, o teste semeia e remove depois.
		const atual = await dono.query<{ id: string | null }>(
			"SELECT lona_modelo_id() AS id",
		);
		if (atual.rows[0].id) {
			modeloId = atual.rows[0].id;
		} else {
			const bd = drizzleDoDono(dono);
			modeloId = (await bd.transaction((tx) => semearModelo(tx))).empresaId;
			criouModelo = true;
		}
		await app_.query("SELECT 1"); // esquenta a conexão: o tempo medido é o da cópia, não o do TLS
	});

	afterAll(async () => {
		// As demonstrações de teste saem pelos vínculos dos visitantes; só depois os visitantes.
		await dono.query(
			"DELETE FROM empresas WHERE NOT eh_modelo AND (id = ANY($1) OR id IN (SELECT empresa_id FROM vinculos WHERE usuario_id = ANY($2)))",
			[empresaIds, usuarioIds],
		);
		await dono.query("DELETE FROM autenticacao.usuarios WHERE id = ANY($1)", [
			usuarioIds,
		]);
		if (criouModelo) {
			await dono.query("DELETE FROM empresas WHERE id = $1", [modeloId]);
		}
		await Promise.all([dono.end(), app_.end()]);
	});

	test("toda tabela com empresa_id tem um copiador registrado", async () => {
		const { rows } = await dono.query<{ tabela: string }>(
			`SELECT c.table_name AS tabela
			FROM information_schema.columns c
			JOIN information_schema.tables t USING (table_schema, table_name)
			WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id'
				AND t.table_type = 'BASE TABLE'
				AND c.table_name NOT LIKE 'teste\\_%'
				AND c.table_name NOT IN (SELECT tabela FROM lona_copiadores)`,
		);
		expect(rows).toEqual([]);
	});

	test("a cópia remapeia todos os ids e mantém tudo do modelo", async () => {
		const visitante = await novoVisitante();
		const inicio = Date.now();
		const copiaId = await iniciarDemonstracao(visitante);
		empresaIds.push(copiaId);

		expect(copiaId).not.toBe(modeloId);

		const { rows: copiadores } = await dono.query<{ tabela: string }>(
			"SELECT tabela FROM lona_copiadores ORDER BY ordem",
		);
		const tabelas = copiadores.map((c) => c.tabela);
		expect(tabelas).toContain("filiais");

		for (const tabela of tabelas) {
			const doModelo = await ids(dono, tabela, modeloId);
			const daCopia = await ids(dono, tabela, copiaId);
			// Os vínculos ganham o do visitante; nas outras tabelas a quantidade é a mesma.
			expect(daCopia.length, tabela).toBe(
				doModelo.length + (tabela === "vinculos" ? 1 : 0),
			);
			if (tabela === "cargo_permissoes" || tabela === "cargo_limites") continue; // chaves compostas: o cargo já é conferido em cargos
			// Nenhum id da cópia pode ser um id do modelo.
			expect(
				daCopia.filter((id) => doModelo.includes(id)),
				tabela,
			).toEqual([]);
		}
		expect(Date.now() - inicio).toBeLessThan(5000);

		// Quem copiou é dono em todas as filiais e a demonstração vence em 2 horas.
		const { rows } = await dono.query(
			`SELECT v.filial_id, v.nivel, c.nome AS cargo,
				e.eh_modelo, extract(epoch FROM (e.expira_em - now())) / 60 AS minutos
			FROM vinculos v
			JOIN cargos c ON c.empresa_id = v.empresa_id AND c.id = v.cargo_id
			JOIN empresas e ON e.id = v.empresa_id
			WHERE v.empresa_id = $1 AND v.usuario_id = $2`,
			[copiaId, visitante],
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			filial_id: null,
			nivel: "operar",
			cargo: "dono",
			eh_modelo: false,
		});
		expect(Number(rows[0].minutos)).toBeGreaterThan(118);
		expect(Number(rows[0].minutos)).toBeLessThanOrEqual(120);
	});

	test("as chaves estrangeiras da cópia apontam para a própria cópia", async () => {
		const visitante = await novoVisitante();
		const copiaId = await iniciarDemonstracao(visitante);
		empresaIds.push(copiaId);

		const { rows } = await dono.query(
			`SELECT
				(SELECT count(*) FROM vinculos v JOIN filiais f ON f.id = v.filial_id WHERE v.empresa_id = $1 AND f.empresa_id <> $1)::int AS filiais_trocadas,
				(SELECT count(*) FROM vinculos v JOIN cargos c ON c.id = v.cargo_id WHERE v.empresa_id = $1 AND c.empresa_id <> $1)::int AS cargos_trocados`,
			[copiaId],
		);
		expect(rows[0]).toEqual({ filiais_trocadas: 0, cargos_trocados: 0 });
	});

	test("mede a cópia: abaixo de 1 segundo", async () => {
		// Uma cópia de aquecimento abre a conexão do app (TLS) e esquenta os planos; a medida é a do uso corrente.
		empresaIds.push(await iniciarDemonstracao(await novoVisitante("aquece")));

		const visitante = await novoVisitante();

		// Tempo de relógio da transação inteira (limpeza + cópia), como o app a executa.
		const antes = performance.now();
		const copiaId = await iniciarDemonstracao(visitante);
		const total = performance.now() - antes;
		empresaIds.push(copiaId);

		// Tempo só da função no servidor, sem as idas e vindas de rede.
		const outro = await novoVisitante("medida");
		const plano = await comoApp(app_, { usuarioId: outro }, async (c) => {
			const { rows } = await c.query<{ "QUERY PLAN": string }>(
				"EXPLAIN (ANALYZE) SELECT lona_clonar_demonstracao(lona_modelo_id(), $1::uuid)",
				[outro],
			);
			return rows.map((r) => r["QUERY PLAN"]).join("\n");
		});
		const noBanco = Number(/Execution Time: ([\d.]+) ms/.exec(plano)?.[1]);

		console.info(
			`cópia da demonstração: ${total.toFixed(0)} ms ao todo (transação completa), ${noBanco.toFixed(0)} ms dentro do banco`,
		);
		// A meta de 1 s vale para a cópia no banco. O tempo ao todo soma 5 idas e vindas (BEGIN, contexto, busca,
		// cópia, COMMIT) e, rodando daqui até o Neon em us-east-1, é quase só rede; por isso o teto dele é folgado.
		expect(noBanco).toBeLessThan(1000);
		expect(total).toBeLessThan(2500);
	});

	test("duas demonstrações não enxergam os dados uma da outra", async () => {
		const a = await novoVisitante("visitante-a");
		const b = await novoVisitante("visitante-b");
		const empresaA = await iniciarDemonstracao(a);
		const empresaB = await iniciarDemonstracao(b);
		empresaIds.push(empresaA, empresaB);
		expect(empresaA).not.toBe(empresaB);

		const filiaisVistas = (usuarioId: string, empresaId: string) =>
			comoApp(app_, { usuarioId, empresaId }, async (c) => {
				const { rows } = await c.query<{ empresa_id: string }>(
					"SELECT DISTINCT empresa_id FROM filiais",
				);
				return rows.map((r) => r.empresa_id);
			});

		expect(await filiaisVistas(a, empresaA)).toEqual([empresaA]);
		expect(await filiaisVistas(b, empresaB)).toEqual([empresaB]);
		expect(await filiaisVistas(a, empresaB)).toEqual([]);
		expect(await filiaisVistas(b, empresaA)).toEqual([]);
	});

	test("iniciar duas vezes devolve a mesma demonstração", async () => {
		const visitante = await novoVisitante();
		const primeira = await iniciarDemonstracao(visitante);
		empresaIds.push(primeira);
		expect(await iniciarDemonstracao(visitante)).toBe(primeira);
	});

	test("o app só copia para o usuário do contexto e só copia o modelo", async () => {
		const a = await novoVisitante();
		const b = await novoVisitante();
		await expect(
			comoApp(app_, { usuarioId: a }, (c) =>
				c.query("SELECT lona_clonar_demonstracao($1, $2)", [modeloId, b]),
			),
		).rejects.toThrow(/usuário da cópia/);

		const real = await criarEmpresa(drizzleDoDono(dono), {
			nome: "Empresa real do teste",
			raizCnpj: "11444777",
		});
		empresaIds.push(real.empresaId);
		await expect(
			comoApp(app_, { usuarioId: a }, (c) =>
				c.query("SELECT lona_clonar_demonstracao($1, $2)", [real.empresaId, a]),
			),
		).rejects.toThrow(/modelo não encontrado/);
	});

	test("limpeza preguiçosa: criar uma demonstração apaga as vencidas de verdade, com tudo dentro", async () => {
		const antigo = await novoVisitante("antigo");
		const vencida = await iniciarDemonstracao(antigo);
		empresaIds.push(vencida);
		await dono.query(
			"UPDATE empresas SET expira_em = now() - interval '1 minute' WHERE id = $1",
			[vencida],
		);
		expect(await existe(vencida)).toBe(true);

		const novo = await novoVisitante("novo");
		empresaIds.push(await iniciarDemonstracao(novo));

		expect(await existe(vencida)).toBe(false);
		for (const tabela of ["filiais", "cargos", "vinculos"]) {
			const { rows } = await dono.query(
				`SELECT count(*)::int AS n FROM ${tabela} WHERE empresa_id = $1`,
				[vencida],
			);
			expect(rows[0].n, tabela).toBe(0);
		}
		// O modelo continua lá.
		expect(await existe(modeloId)).toBe(true);
	});

	test("quem estava com a demonstração vencida começa outra", async () => {
		const visitante = await novoVisitante();
		const vencida = await iniciarDemonstracao(visitante);
		empresaIds.push(vencida);
		await dono.query(
			"UPDATE empresas SET expira_em = now() - interval '1 minute' WHERE id = $1",
			[vencida],
		);

		const outra = await iniciarDemonstracao(visitante);
		empresaIds.push(outra);
		expect(outra).not.toBe(vencida);
		expect(await existe(vencida)).toBe(false);
		expect(await existe(outra)).toBe(true);
	});

	test("resetar apaga a atual, copia de novo e mantém o usuário", async () => {
		const visitante = await novoVisitante();
		const atual = await iniciarDemonstracao(visitante);
		empresaIds.push(atual);
		await dono.query(
			"UPDATE filiais SET nome = 'Mexida' WHERE empresa_id = $1",
			[atual],
		);

		const nova = await resetarDemonstracao(visitante);
		expect(nova).toBeTruthy();
		empresaIds.push(nova as string);
		expect(nova).not.toBe(atual);
		expect(await existe(atual)).toBe(false);

		const { rows } = await dono.query(
			`SELECT count(*)::int AS n FROM filiais WHERE empresa_id = $1 AND nome = 'Mexida'`,
			[nova],
		);
		expect(rows[0].n).toBe(0);
		const { rows: vinculos } = await dono.query(
			"SELECT count(*)::int AS n FROM vinculos WHERE empresa_id = $1 AND usuario_id = $2",
			[nova, visitante],
		);
		expect(vinculos[0].n).toBe(1);
	});

	test("resetar não apaga empresa de verdade", async () => {
		const usuario = await novoVisitante();
		const bd = drizzleDoDono(dono);
		const real = await criarEmpresa(bd, {
			nome: "Empresa de verdade",
			raizCnpj: "11444777",
		});
		empresaIds.push(real.empresaId);
		await criarVinculo(bd, {
			empresaId: real.empresaId,
			usuarioId: usuario,
			filialId: null,
			cargoId: real.cargoIds.dono,
			nivel: "operar",
		});

		expect(await resetarDemonstracao(usuario)).toBeNull();
		expect(await existe(real.empresaId)).toBe(true);
	});

	describe("rotina diária /api/cron/limpar", () => {
		const chamar = (authorization?: string) =>
			app.handle(
				new Request("http://localhost/api/cron/limpar", {
					headers: authorization ? { authorization } : {},
				}),
			);

		test("recusa sem o segredo ou com o segredo errado", async () => {
			vi.stubEnv("CRON_SECRET", "segredo-de-teste");
			expect((await chamar()).status).toBe(401);
			expect((await chamar("Bearer outro-segredo")).status).toBe(401);
			vi.unstubAllEnvs();
		});

		test("com o segredo, apaga as vencidas que sobraram", async () => {
			const visitante = await novoVisitante();
			const vencida = await iniciarDemonstracao(visitante);
			empresaIds.push(vencida);
			await dono.query(
				"UPDATE empresas SET expira_em = now() - interval '1 minute' WHERE id = $1",
				[vencida],
			);

			vi.stubEnv("CRON_SECRET", "segredo-de-teste");
			const resposta = await chamar("Bearer segredo-de-teste");
			vi.unstubAllEnvs();

			expect(resposta.status).toBe(200);
			expect(
				((await resposta.json()) as { apagadas: number }).apagadas,
			).toBeGreaterThanOrEqual(1);
			expect(await existe(vencida)).toBe(false);
			expect(await existe(modeloId)).toBe(true);
		});

		test("sem CRON_SECRET configurado, nunca autoriza", async () => {
			vi.stubEnv("CRON_SECRET", "");
			expect((await chamar("Bearer ")).status).toBe(401);
			vi.unstubAllEnvs();
		});

		test("limparDemonstracoesVencidas devolve quantas apagou", async () => {
			expect(await limparDemonstracoesVencidas()).toBeGreaterThanOrEqual(0);
		});
	});
});
