import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { comContexto, type Transacao } from "@/db/client";
import { cargosProntos } from "./cargos-prontos";
import { cnpjDaFilial } from "./cnpj";
import {
	type ConfigEmpresa,
	type Cor,
	cargoLimites,
	cargoPermissoes,
	cargos,
	configPadrao,
	empresas,
	filiais,
	type Nivel,
	vinculos,
} from "./schema";

type Escrita = Pick<Transacao, "insert">;

export type NovaEmpresa = {
	nome: string;
	raizCnpj: string;
	cor?: Cor;
	config?: Partial<ConfigEmpresa>;
	ehModelo?: boolean;
	expiraEm?: Date | null;
	/** A matriz nasce junto (ADR 0003); por padrão, "Matriz" / MTZ. */
	matriz?: { nome: string; codigo: string };
};

/**
 * Cria a empresa já com a matriz (ADR 0003) e os cargos prontos. Roda com a conexão do dono (seed, testes, ou o
 * futuro cadastro), porque o app não tem permissão de inserir em empresas.
 */
export async function criarEmpresa(tx: Escrita, dados: NovaEmpresa) {
	const [empresa] = await tx
		.insert(empresas)
		.values({
			nome: dados.nome,
			raizCnpj: dados.raizCnpj,
			cor: dados.cor,
			ehModelo: dados.ehModelo,
			expiraEm: dados.expiraEm,
			config: { ...configPadrao, ...dados.config },
		})
		.returning({ id: empresas.id });

	const [matriz] = await tx
		.insert(filiais)
		.values({
			empresaId: empresa.id,
			nome: dados.matriz?.nome ?? "Matriz",
			codigo: dados.matriz?.codigo ?? "MTZ",
			cnpj: cnpjDaFilial(dados.raizCnpj, 1),
			ehMatriz: true,
		})
		.returning({ id: filiais.id });

	const criados = await tx
		.insert(cargos)
		.values(
			cargosProntos.map((pronto) => ({
				empresaId: empresa.id,
				nome: pronto.nome,
				padrao: true,
			})),
		)
		.returning({ id: cargos.id, nome: cargos.nome });
	const cargoIds = Object.fromEntries(criados.map((c) => [c.nome, c.id]));

	await tx.insert(cargoPermissoes).values(
		cargosProntos.flatMap((pronto) =>
			pronto.permissoes.map((permissao) => ({
				empresaId: empresa.id,
				cargoId: cargoIds[pronto.nome],
				permissao,
			})),
		),
	);
	await tx.insert(cargoLimites).values(
		cargosProntos.flatMap((pronto) =>
			Object.entries(pronto.limites).map(([limite, valor]) => ({
				empresaId: empresa.id,
				cargoId: cargoIds[pronto.nome],
				limite,
				valor,
			})),
		),
	);

	return { empresaId: empresa.id, matrizId: matriz.id, cargoIds };
}

export type NovaFilial = {
	empresaId: string;
	nome: string;
	codigo: string;
	raizCnpj: string;
	/** Número de ordem depois da barra: 2 vira /0002. */
	ordem: number;
};

export async function criarFilial(tx: Escrita, dados: NovaFilial) {
	const [filial] = await tx
		.insert(filiais)
		.values({
			empresaId: dados.empresaId,
			nome: dados.nome,
			codigo: dados.codigo,
			cnpj: cnpjDaFilial(dados.raizCnpj, dados.ordem),
		})
		.returning({ id: filiais.id });
	return filial.id;
}

export type NovoVinculo = {
	empresaId: string;
	usuarioId: string;
	/** null = todas as filiais. */
	filialId: string | null;
	cargoId: string;
	nivel: Nivel;
};

export async function criarVinculo(tx: Escrita, dados: NovoVinculo) {
	await tx.insert(vinculos).values(dados);
}

/**
 * A empresa ativa mais recente do usuário, ou null (nunca teve, ou a demonstração venceu).
 * Dentro de uma transação que já tem o contexto do usuário, passe `tx` para não abrir outra.
 */
export async function empresaAtivaDoUsuario(usuarioId: string, tx?: Transacao) {
	const buscar = async (t: Transacao) => {
		const { rows } = await t.execute<{
			empresa_id: string;
			nome: string;
			expira_em: Date | null;
		}>(sql`SELECT * FROM lona_empresas_do_usuario() LIMIT 1`);
		const empresa = rows[0];
		return empresa
			? {
					empresaId: empresa.empresa_id,
					nome: empresa.nome,
					expiraEm: empresa.expira_em,
				}
			: null;
	};
	return tx ? buscar(tx) : comContexto({ usuarioId }, buscar);
}

export type ResumoDoPainel = {
	empresa: { id: string; nome: string; expiraEm: Date | null };
	filial: { nome: string; codigo: string };
	cargo: string;
	nivel: Nivel;
};

/** Empresa, filial atual (a matriz, ou a primeira que o usuário consulta) e cargo, para a tela provisória do painel. */
export async function resumoDoPainel(
	usuarioId: string,
): Promise<ResumoDoPainel | null> {
	const ativa = await empresaAtivaDoUsuario(usuarioId);
	if (!ativa) return null;

	return comContexto({ usuarioId, empresaId: ativa.empresaId }, async (tx) => {
		const [filial] = await tx
			.select({ id: filiais.id, nome: filiais.nome, codigo: filiais.codigo })
			.from(filiais)
			.orderBy(desc(filiais.ehMatriz), asc(filiais.nome))
			.limit(1);
		if (!filial) return null;

		// Vínculo específico da filial primeiro; o de "todas" cobre quando não houver.
		const [vinculo] = await tx
			.select({ cargo: cargos.nome, nivel: vinculos.nivel })
			.from(vinculos)
			.innerJoin(
				cargos,
				and(
					eq(cargos.empresaId, vinculos.empresaId),
					eq(cargos.id, vinculos.cargoId),
				),
			)
			.where(
				and(
					eq(vinculos.usuarioId, usuarioId),
					or(isNull(vinculos.filialId), eq(vinculos.filialId, filial.id)),
				),
			)
			.orderBy(sql`${vinculos.filialId} IS NULL`)
			.limit(1);
		if (!vinculo) return null;

		return {
			empresa: {
				id: ativa.empresaId,
				nome: ativa.nome,
				expiraEm: ativa.expiraEm,
			},
			filial: { nome: filial.nome, codigo: filial.codigo },
			cargo: vinculo.cargo,
			nivel: vinculo.nivel,
		};
	});
}
