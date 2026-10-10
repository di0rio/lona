import { sql } from "drizzle-orm";
import { comContexto, type Transacao } from "@/db/client";
import { empresaAtivaDoUsuario } from "@/modules/acesso";

export const DURACAO_EM_HORAS = 2;

// A função de cópia apaga antes as demonstrações vencidas (limpeza preguiçosa, ADR 0002).
async function copiarModelo(tx: Transacao, usuarioId: string) {
	const { rows } = await tx.execute<{ empresa_id: string }>(
		sql`SELECT lona_clonar_demonstracao(lona_modelo_id(), ${usuarioId}::uuid) AS empresa_id`,
	);
	return rows[0].empresa_id;
}

/**
 * Dá ao visitante uma demonstração de 2 horas. Se ele já tem uma ativa, devolve essa mesma: clique duplo ou aba
 * repetida não gasta outra cópia.
 */
export async function iniciarDemonstracao(usuarioId: string) {
	return comContexto({ usuarioId }, async (tx) => {
		const ativa = await empresaAtivaDoUsuario(usuarioId, tx);
		return ativa ? ativa.empresaId : copiarModelo(tx, usuarioId);
	});
}

/**
 * "Resetar pra demonstração original": apaga a empresa atual e copia de novo, mantendo o usuário logado.
 * Tudo na mesma transação, então ou o visitante troca de demonstração ou fica com a que tinha.
 * Devolve null se a empresa atual não for uma demonstração (empresa de verdade nunca é apagada por aqui).
 */
export async function resetarDemonstracao(usuarioId: string) {
	const ativa = await empresaAtivaDoUsuario(usuarioId);

	return comContexto({ usuarioId, empresaId: ativa?.empresaId }, async (tx) => {
		if (ativa) {
			// A política só deixa o app apagar demonstração (expira_em preenchido) da empresa do contexto.
			const apagada = await tx.execute(sql`DELETE FROM empresas`);
			if (apagada.rowCount === 0) return null;
		}
		return copiarModelo(tx, usuarioId);
	});
}

/** Rotina diária: apaga o que a limpeza preguiçosa deixou para trás. */
export async function limparDemonstracoesVencidas() {
	return comContexto({}, async (tx) => {
		const { rows } = await tx.execute<{ apagadas: number }>(
			sql`SELECT lona_apagar_demonstracoes_vencidas() AS apagadas`,
		);
		return rows[0].apagadas;
	});
}
