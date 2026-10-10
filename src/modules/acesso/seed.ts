import { eq, inArray } from "drizzle-orm";
import type { Transacao } from "@/db/client";
import { empresas, type Nivel, usuarios } from "./schema";
import { criarEmpresa, criarFilial, criarVinculo } from "./service";

type Banco = Pick<Transacao, "insert" | "delete" | "select">;

const raizCnpj = "11222333"; // fictícia, só no formato

// Uma pessoa por cargo, para o "ver como". Sem senha: ninguém entra com elas, só se olha pelos olhos delas.
const pessoas: {
	nome: string;
	email: string;
	cargo: string;
	vinculos: { filial: "JAU" | "BAU" | null; nivel: Nivel }[];
}[] = [
	{
		nome: "Marcos Freitas",
		email: "marcos@modelo.lona.test",
		cargo: "dono",
		vinculos: [{ filial: null, nivel: "operar" }],
	},
	{
		nome: "Renata Lopes",
		email: "renata@modelo.lona.test",
		cargo: "gerente",
		vinculos: [
			{ filial: "JAU", nivel: "operar" },
			{ filial: "BAU", nivel: "consultar" },
		],
	},
	{
		nome: "Paulo Mendes",
		email: "paulo@modelo.lona.test",
		cargo: "balconista",
		vinculos: [{ filial: "JAU", nivel: "operar" }],
	},
	{
		nome: "Edson Carvalho",
		email: "edson@modelo.lona.test",
		cargo: "mecânico",
		vinculos: [{ filial: "BAU", nivel: "operar" }],
	},
	{
		nome: "Camila Rocha",
		email: "camila@modelo.lona.test",
		cargo: "financeiro",
		vinculos: [{ filial: null, nivel: "operar" }],
	},
];

/**
 * Parte do modelo que pertence ao acesso: a empresa "Freios Rodovia Ltda", as filiais de Jaú e Bauru, os cargos
 * prontos e as pessoas fictícias. Sempre os mesmos dados; roda de novo apagando o modelo anterior (as
 * demonstrações já copiadas não são afetadas, porque cada uma tem os seus próprios registros).
 */
export async function semearModeloAcesso(tx: Banco) {
	await tx.delete(empresas).where(eq(empresas.ehModelo, true));

	const emails = pessoas.map((p) => p.email);
	await tx
		.insert(usuarios)
		.values(
			pessoas.map((p) => ({
				name: p.nome,
				email: p.email,
				emailVerified: true,
			})),
		)
		.onConflictDoNothing();
	const existentes = await tx
		.select({ id: usuarios.id, email: usuarios.email })
		.from(usuarios)
		.where(inArray(usuarios.email, emails));
	const usuarioIds = new Map(existentes.map((u) => [u.email, u.id]));

	const empresa = await criarEmpresa(tx, {
		nome: "Freios Rodovia Ltda",
		raizCnpj,
		cor: "laranja",
		ehModelo: true,
		matriz: { nome: "Matriz Jaú", codigo: "JAU" },
		config: {
			usa_filiais: true,
			fluxo_os: "completo",
			venda_com_orcamento: true,
			caixa_obrigatorio: true,
		},
	});
	const filiaisPorCodigo = {
		JAU: empresa.matrizId,
		BAU: await criarFilial(tx, {
			empresaId: empresa.empresaId,
			nome: "Filial Bauru",
			codigo: "BAU",
			raizCnpj,
			ordem: 2,
		}),
	};

	for (const pessoa of pessoas) {
		for (const vinculo of pessoa.vinculos) {
			await criarVinculo(tx, {
				empresaId: empresa.empresaId,
				usuarioId: usuarioIds.get(pessoa.email) as string,
				filialId: vinculo.filial ? filiaisPorCodigo[vinculo.filial] : null,
				cargoId: empresa.cargoIds[pessoa.cargo],
				nivel: vinculo.nivel,
			});
		}
	}

	return empresa;
}
