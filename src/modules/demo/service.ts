import { sql } from "drizzle-orm";
import { type Transaction, withContext } from "@/db/client";
import { userActiveCompany } from "@/modules/access";

export const DURATION_IN_HOURS = 2;

// A função de cópia apaga antes as demonstrações vencidas (limpeza preguiçosa, ADR 0002).
async function copyTemplate(tx: Transaction, userId: string) {
	const { rows } = await tx.execute<{ company_id: string }>(
		sql`SELECT lona_clone_demo(lona_template_id(), ${userId}::uuid) AS company_id`,
	);
	return rows[0].company_id;
}

/**
 * Dá ao visitante uma demonstração de 2 horas. Se ele já tem uma ativa, devolve essa mesma: clique duplo ou aba
 * repetida não gasta outra cópia.
 */
export async function startDemo(userId: string) {
	return withContext({ userId }, async (tx) => {
		const active = await userActiveCompany(userId, tx);
		return active ? active.companyId : copyTemplate(tx, userId);
	});
}

/**
 * "Resetar pra demonstração original": apaga a empresa atual e copia de novo, mantendo o usuário logado.
 * Tudo na mesma transação, então ou o visitante troca de demonstração ou fica com a que tinha.
 * Devolve null se a empresa atual não for uma demonstração (empresa de verdade nunca é apagada por aqui).
 */
export async function resetDemo(userId: string) {
	const active = await userActiveCompany(userId);

	return withContext({ userId, companyId: active?.companyId }, async (tx) => {
		if (active) {
			// A política só deixa o app apagar demonstração (expires_at preenchido) da empresa do contexto.
			const deleted = await tx.execute(sql`DELETE FROM companies`);
			if (deleted.rowCount === 0) return null;
		}
		return copyTemplate(tx, userId);
	});
}

/** Rotina diária: apaga o que a limpeza preguiçosa deixou para trás. */
export async function deleteExpiredDemos() {
	return withContext({}, async (tx) => {
		const { rows } = await tx.execute<{ deleted: number }>(
			sql`SELECT lona_delete_expired_demos() AS deleted`,
		);
		return rows[0].deleted;
	});
}
