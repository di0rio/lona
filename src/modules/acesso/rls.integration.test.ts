import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
	comoApp,
	conectarComoApp,
	conectarComoDono,
	criarUsuarioDeTeste,
	drizzleDoDono,
	temBanco,
} from "@/test/banco";
import { criarEmpresa, criarFilial, criarVinculo } from "./service";

const MAIS_DUAS_HORAS = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
const UM_MINUTO_ATRAS = () => new Date(Date.now() - 60 * 1000);

// Tabela de estoque de mentira, só para provar o ajudante de tabelas de filial que as próximas etapas vão usar.
const tabelaDeFilial = `teste_filial_${randomUUID().slice(0, 8)}`;

describe.skipIf(!temBanco)("RLS do módulo acesso", () => {
	let dono: pg.Pool;
	let app: pg.Pool;

	const empresaIds: string[] = [];
	const usuarioIds: string[] = [];

	// Duas empresas ativas, cada uma com um dono em todas as filiais.
	let a: Awaited<ReturnType<typeof criarEmpresa>> & { filialBauru: string };
	let b: Awaited<ReturnType<typeof criarEmpresa>>;
	let donoA: string;
	let donoB: string;
	let soConsulta: string; // consulta a matriz de A
	let operaMatrizConsultaBauru: string; // opera a matriz de A e só consulta Bauru
	let vencida: Awaited<ReturnType<typeof criarEmpresa>>;
	let donoVencida: string;
	let modelo: Awaited<ReturnType<typeof criarEmpresa>>;
	let donoModelo: string;

	beforeAll(async () => {
		dono = conectarComoDono();
		app = conectarComoApp();
		const bd = drizzleDoDono(dono);

		const novaEmpresa = async (
			nome: string,
			extra: { expiraEm?: Date | null; ehModelo?: boolean } = {},
		) => {
			const empresa = await criarEmpresa(bd, {
				nome,
				raizCnpj: "11222333",
				expiraEm: MAIS_DUAS_HORAS(),
				...extra,
			});
			empresaIds.push(empresa.empresaId);
			return empresa;
		};
		const novoUsuario = async (apelido: string) => {
			const id = await criarUsuarioDeTeste(dono, apelido);
			usuarioIds.push(id);
			return id;
		};

		a = {
			...(await novaEmpresa("Empresa A")),
			filialBauru: "",
		};
		a.filialBauru = await criarFilial(bd, {
			empresaId: a.empresaId,
			nome: "Bauru",
			codigo: "BAU",
			raizCnpj: "11222333",
			ordem: 2,
		});
		b = await novaEmpresa("Empresa B");
		vencida = await novaEmpresa("Empresa vencida", {
			expiraEm: UM_MINUTO_ATRAS(),
		});
		modelo = await novaEmpresa("Modelo de teste", {
			expiraEm: null,
			ehModelo: true,
		});

		donoA = await novoUsuario("dono-a");
		donoB = await novoUsuario("dono-b");
		donoVencida = await novoUsuario("dono-vencida");
		donoModelo = await novoUsuario("dono-modelo");
		soConsulta = await novoUsuario("so-consulta");
		operaMatrizConsultaBauru = await novoUsuario("opera-matriz");

		const vincularDono = (
			e: { empresaId: string; cargoIds: Record<string, string> },
			usuarioId: string,
		) =>
			criarVinculo(bd, {
				empresaId: e.empresaId,
				usuarioId,
				filialId: null,
				cargoId: e.cargoIds.dono,
				nivel: "operar",
			});
		await vincularDono(a, donoA);
		await vincularDono(b, donoB);
		await vincularDono(vencida, donoVencida);
		await vincularDono(modelo, donoModelo);
		await criarVinculo(bd, {
			empresaId: a.empresaId,
			usuarioId: soConsulta,
			filialId: a.matrizId,
			cargoId: a.cargoIds.balconista,
			nivel: "consultar",
		});
		await criarVinculo(bd, {
			empresaId: a.empresaId,
			usuarioId: operaMatrizConsultaBauru,
			filialId: a.matrizId,
			cargoId: a.cargoIds.gerente,
			nivel: "operar",
		});
		await criarVinculo(bd, {
			empresaId: a.empresaId,
			usuarioId: operaMatrizConsultaBauru,
			filialId: a.filialBauru,
			cargoId: a.cargoIds.gerente,
			nivel: "consultar",
		});

		await dono.query(
			`CREATE TABLE ${tabelaDeFilial} (
				id uuid PRIMARY KEY DEFAULT uuidv7(),
				empresa_id uuid NOT NULL,
				filial_id uuid NOT NULL,
				quantidade int NOT NULL
			)`,
		);
		await dono.query("SELECT lona_proteger_tabela_de_filial($1::regclass)", [
			tabelaDeFilial,
		]);
		await dono.query(
			`INSERT INTO ${tabelaDeFilial} (empresa_id, filial_id, quantidade) VALUES ($1, $2, 1), ($1, $3, 2), ($4, $5, 3)`,
			[a.empresaId, a.matrizId, a.filialBauru, b.empresaId, b.matrizId],
		);
	});

	afterAll(async () => {
		await dono.query(`DROP TABLE IF EXISTS ${tabelaDeFilial}`);
		if (empresaIds.length) {
			await dono.query("DELETE FROM empresas WHERE id = ANY($1)", [empresaIds]);
		}
		if (usuarioIds.length) {
			await dono.query("DELETE FROM autenticacao.usuarios WHERE id = ANY($1)", [
				usuarioIds,
			]);
		}
		await Promise.all([dono.end(), app.end()]);
	});

	const contar = async (
		contexto: { usuarioId?: string; empresaId?: string },
		tabela: string,
	) =>
		comoApp(app, contexto, async (c) => {
			const { rows } = await c.query(
				`SELECT count(*)::int AS n FROM ${tabela}`,
			);
			return rows[0].n as number;
		});

	test("toda tabela de negócio tem RLS ligado e forçado", async () => {
		const { rows } = await dono.query<{ tabela: string }>(
			`SELECT c.relname AS tabela
			FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public' AND c.relkind = 'r'
				AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
				AND c.relname <> 'lona_copiadores' -- infraestrutura da cópia: não tem empresa e o app nem a enxerga
				AND c.relname NOT LIKE 'teste\\_%'`,
		);
		expect(rows).toEqual([]);
	});

	test("duas empresas não enxergam os dados uma da outra", async () => {
		for (const tabela of ["empresas", "filiais", "cargos", "vinculos"]) {
			const deA = await comoApp(
				app,
				{ usuarioId: donoA, empresaId: a.empresaId },
				async (c) => {
					const coluna = tabela === "empresas" ? "id" : "empresa_id";
					const { rows } = await c.query(
						`SELECT DISTINCT ${coluna} AS empresa FROM ${tabela}`,
					);
					return rows.map((r) => r.empresa);
				},
			);
			expect(deA, tabela).toEqual([a.empresaId]);
		}
		expect(
			await contar({ usuarioId: donoB, empresaId: b.empresaId }, "filiais"),
		).toBe(1);
	});

	test("apontar o contexto para a empresa de outro não mostra nada", async () => {
		for (const tabela of ["empresas", "filiais", "cargos", "vinculos"]) {
			expect(
				await contar({ usuarioId: donoA, empresaId: b.empresaId }, tabela),
				tabela,
			).toBe(0);
		}
	});

	test("sem contexto não há nenhuma linha", async () => {
		for (const tabela of ["empresas", "filiais", "cargos", "vinculos"]) {
			expect(await contar({}, tabela), tabela).toBe(0);
		}
	});

	test("o papel lona_app não ignora o RLS (o dono ignora)", async () => {
		const { rows } = await dono.query(
			"SELECT count(*)::int AS n FROM empresas WHERE id = ANY($1)",
			[[a.empresaId, b.empresaId]],
		);
		expect(rows[0].n).toBe(2);
		expect(await contar({}, "empresas")).toBe(0);
	});

	test("empresa vencida não devolve linha nenhuma, mesmo com o contexto setado", async () => {
		for (const tabela of ["empresas", "filiais", "cargos", "vinculos"]) {
			expect(
				await contar(
					{ usuarioId: donoVencida, empresaId: vencida.empresaId },
					tabela,
				),
				tabela,
			).toBe(0);
		}
	});

	test("a empresa vence no meio do uso: ativa lê, vencida não lê", async () => {
		const efemera = await criarEmpresa(drizzleDoDono(dono), {
			nome: "Vence logo",
			raizCnpj: "11222333",
			expiraEm: MAIS_DUAS_HORAS(),
		});
		empresaIds.push(efemera.empresaId);
		const usuarioId = await criarUsuarioDeTeste(dono, "efemero");
		usuarioIds.push(usuarioId);
		await criarVinculo(drizzleDoDono(dono), {
			empresaId: efemera.empresaId,
			usuarioId,
			filialId: null,
			cargoId: efemera.cargoIds.dono,
			nivel: "operar",
		});

		const contexto = { usuarioId, empresaId: efemera.empresaId };
		expect(await contar(contexto, "filiais")).toBe(1);
		await dono.query(
			"UPDATE empresas SET expira_em = now() - interval '1 second' WHERE id = $1",
			[efemera.empresaId],
		);
		expect(await contar(contexto, "filiais")).toBe(0);
	});

	test("o modelo não aparece para ninguém, nem para quem tem vínculo nele", async () => {
		expect(
			await contar(
				{ usuarioId: donoModelo, empresaId: modelo.empresaId },
				"filiais",
			),
		).toBe(0);
	});

	test("sem vínculo na empresa, não vê nada (ADR 0006)", async () => {
		const semVinculo = await criarUsuarioDeTeste(dono, "sem-vinculo");
		usuarioIds.push(semVinculo);
		expect(
			await contar(
				{ usuarioId: semVinculo, empresaId: a.empresaId },
				"filiais",
			),
		).toBe(0);
	});

	test("lona_empresas_do_usuario devolve só a empresa ativa de quem pergunta", async () => {
		const nomes = async (usuarioId: string) =>
			comoApp(app, { usuarioId }, async (c) => {
				const { rows } = await c.query(
					"SELECT nome FROM lona_empresas_do_usuario()",
				);
				return rows.map((r) => r.nome);
			});
		expect(await nomes(donoA)).toEqual(["Empresa A"]);
		expect(await nomes(donoVencida)).toEqual([]);
		expect(await nomes(donoModelo)).toEqual([]);
	});

	describe("consultar e operar (ADR 0006)", () => {
		const contextoConsulta = () => ({
			usuarioId: soConsulta,
			empresaId: a.empresaId,
		});

		test("quem só consulta vê a filial do vínculo e não as outras", async () => {
			const nomes = await comoApp(app, contextoConsulta(), async (c) => {
				const { rows } = await c.query("SELECT nome FROM filiais");
				return rows.map((r) => r.nome);
			});
			expect(nomes).toEqual(["Matriz"]);
		});

		test("quem só consulta não consegue INSERT na filial", async () => {
			await expect(
				comoApp(app, contextoConsulta(), (c) =>
					c.query(
						"INSERT INTO filiais (empresa_id, nome, codigo, cnpj) VALUES ($1, 'Nova', 'NOV', '11222333000362')",
						[a.empresaId],
					),
				),
			).rejects.toThrow(/row-level security/);
		});

		test("quem só consulta não consegue UPDATE nem DELETE na filial", async () => {
			const resultado = await comoApp(app, contextoConsulta(), async (c) => {
				const alterou = await c.query(
					"UPDATE filiais SET nome = 'Invadida' WHERE id = $1",
					[a.matrizId],
				);
				const apagou = await c.query("DELETE FROM filiais WHERE id = $1", [
					a.matrizId,
				]);
				return [alterou.rowCount, apagou.rowCount];
			});
			expect(resultado).toEqual([0, 0]);
			const { rows } = await dono.query(
				"SELECT nome FROM filiais WHERE id = $1",
				[a.matrizId],
			);
			expect(rows[0].nome).toBe("Matriz");
		});

		test("quem opera na matriz e só consulta Bauru altera a matriz e não Bauru", async () => {
			const contexto = {
				usuarioId: operaMatrizConsultaBauru,
				empresaId: a.empresaId,
			};
			const [matriz, bauru] = await comoApp(app, contexto, async (c) => {
				const m = await c.query(
					"UPDATE filiais SET nome = 'Matriz Jaú' WHERE id = $1",
					[a.matrizId],
				);
				const bau = await c.query(
					"UPDATE filiais SET nome = 'Bauru 2' WHERE id = $1",
					[a.filialBauru],
				);
				return [m.rowCount, bau.rowCount];
			});
			expect([matriz, bauru]).toEqual([1, 0]);
		});

		test("só quem opera em todas as filiais cria filial nova", async () => {
			const nova = (c: pg.PoolClient) =>
				c.query(
					"INSERT INTO filiais (empresa_id, nome, codigo, cnpj) VALUES ($1, 'Marília', 'MAR', '11222333000443')",
					[a.empresaId],
				);
			await expect(
				comoApp(
					app,
					{ usuarioId: operaMatrizConsultaBauru, empresaId: a.empresaId },
					nova,
				),
			).rejects.toThrow(/row-level security/);
			await expect(
				comoApp(app, { usuarioId: donoA, empresaId: a.empresaId }, nova),
			).resolves.toBeDefined();
		});

		test("tabela de filial: consultar lê, operar escreve (ajudante pronto para as próximas etapas)", async () => {
			const consulta = await comoApp(app, contextoConsulta(), async (c) => {
				const { rows } = await c.query(
					`SELECT quantidade FROM ${tabelaDeFilial} ORDER BY quantidade`,
				);
				return rows.map((r) => r.quantidade);
			});
			// Só a matriz de A: Bauru fica de fora e a linha da empresa B nem existe para ele.
			expect(consulta).toEqual([1]);

			await expect(
				comoApp(app, contextoConsulta(), (c) =>
					c.query(
						`INSERT INTO ${tabelaDeFilial} (empresa_id, filial_id, quantidade) VALUES ($1, $2, 9)`,
						[a.empresaId, a.matrizId],
					),
				),
			).rejects.toThrow(/row-level security/);

			const contexto = {
				usuarioId: operaMatrizConsultaBauru,
				empresaId: a.empresaId,
			};
			const [naMatriz, emBauru, leitura] = await comoApp(
				app,
				contexto,
				async (c) => {
					const m = await c.query(
						`UPDATE ${tabelaDeFilial} SET quantidade = 10 WHERE filial_id = $1`,
						[a.matrizId],
					);
					const bau = await c.query(
						`UPDATE ${tabelaDeFilial} SET quantidade = 20 WHERE filial_id = $1`,
						[a.filialBauru],
					);
					const visiveis = await c.query(
						`SELECT count(*)::int AS n FROM ${tabelaDeFilial}`,
					);
					return [m.rowCount, bau.rowCount, visiveis.rows[0].n];
				},
			);
			expect([naMatriz, emBauru, leitura]).toEqual([1, 0, 2]);

			// Mudar a linha para outra filial (onde só consulta) também é barrado pelo WITH CHECK.
			await expect(
				comoApp(app, contexto, (c) =>
					c.query(
						`UPDATE ${tabelaDeFilial} SET filial_id = $1 WHERE filial_id = $2`,
						[a.filialBauru, a.matrizId],
					),
				),
			).rejects.toThrow(/row-level security/);
		});
	});

	describe("empresas", () => {
		const contextoDono = () => ({ usuarioId: donoA, empresaId: a.empresaId });

		test("o app não ajusta o vencimento nem cria empresa", async () => {
			await expect(
				comoApp(app, contextoDono(), (c) =>
					c.query("UPDATE empresas SET expira_em = NULL"),
				),
			).rejects.toThrow(/permission denied/);
			await expect(
				comoApp(app, contextoDono(), (c) =>
					c.query(
						"INSERT INTO empresas (nome, raiz_cnpj) VALUES ('Invasora', '11222333')",
					),
				),
			).rejects.toThrow(/permission denied/);
		});

		test("o app ajusta nome, cor e configuração da própria empresa", async () => {
			const alteradas = await comoApp(app, contextoDono(), async (c) => {
				const r = await c.query(
					"UPDATE empresas SET nome = 'Empresa A Ltda', cor = 'verde'",
				);
				return r.rowCount;
			});
			expect(alteradas).toBe(1);
		});

		test("o app só apaga demonstração, nunca empresa de verdade", async () => {
			const real = await criarEmpresa(drizzleDoDono(dono), {
				nome: "Empresa real",
				raizCnpj: "11444777",
			});
			empresaIds.push(real.empresaId);
			const usuarioId = await criarUsuarioDeTeste(dono, "dono-real");
			usuarioIds.push(usuarioId);
			await criarVinculo(drizzleDoDono(dono), {
				empresaId: real.empresaId,
				usuarioId,
				filialId: null,
				cargoId: real.cargoIds.dono,
				nivel: "operar",
			});

			const apagou = await comoApp(
				app,
				{ usuarioId, empresaId: real.empresaId },
				async (c) => (await c.query("DELETE FROM empresas")).rowCount,
			);
			expect(apagou).toBe(0);
		});
	});
});
