import { sql } from "drizzle-orm";
import { type Transaction, withContext } from "@/db/client";
import { userActiveCompany } from "@/modules/access";

export const DURATION_IN_HOURS = 2;

// Teto de demonstrações vivas ao mesmo tempo. O plano grátis do Neon tem 0,5 GB e cada demonstração é uma cópia
// dos dados do modelo (hoje uns poucos KB, mas a meta é ~12 meses de movimento, na casa de 10 MB). 30 x 10 MB
// deixa folga no banco, e como cada uma dura 2 horas dá até 360 por dia. Rever quando o modelo crescer.
export const MAX_ACTIVE_DEMOS = 30;

export class DemoLimitReachedError extends Error {
	constructor() {
		super("Limite de demonstrações ativas atingido.");
	}
}

// Confere o teto (e apaga as vencidas) antes de copiar. Se estourar, a transação inteira desfaz.
async function copyTemplate(tx: Transaction, userId: string, max: number) {
	const { rows: room } = await tx.execute<{ ok: boolean }>(
		sql`SELECT lona_demo_has_room(${max}) AS ok`,
	);
	if (!room[0].ok) throw new DemoLimitReachedError();
	const { rows } = await tx.execute<{ company_id: string }>(
		sql`SELECT lona_clone_demo(lona_template_id(), ${userId}::uuid) AS company_id`,
	);
	return rows[0].company_id;
}

/**
 * Dá ao visitante uma demonstração de 2 horas. Se ele já tem uma ativa, devolve essa mesma: clique duplo ou aba
 * repetida não gasta outra cópia.
 */
export async function startDemo(userId: string, max = MAX_ACTIVE_DEMOS) {
	return withContext({ userId }, async (tx) => {
		const active = await userActiveCompany(userId, tx);
		return active ? active.companyId : copyTemplate(tx, userId, max);
	});
}

/**
 * "Resetar pra demonstração original": apaga a empresa atual e copia de novo, mantendo o usuário logado.
 * Tudo na mesma transação, então ou o visitante troca de demonstração ou fica com a que tinha.
 * Devolve null se a empresa atual não for uma demonstração (empresa de verdade nunca é apagada por aqui).
 */
export async function resetDemo(userId: string, max = MAX_ACTIVE_DEMOS) {
	const active = await userActiveCompany(userId);

	return withContext({ userId, companyId: active?.companyId }, async (tx) => {
		if (active) {
			// A política só deixa o app apagar demonstração (expires_at preenchido) da empresa do contexto.
			const deleted = await tx.execute(sql`DELETE FROM companies`);
			if (deleted.rowCount === 0) return null;
		}
		return copyTemplate(tx, userId, max);
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
