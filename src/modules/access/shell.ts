import { cache } from "react";
import { withContext } from "@/db/client";
import { enterActiveCompany, summaryOf } from "./service";
import { targetsOf } from "./view-as";

/**
 * Tudo que a casca do painel e a tela inicial precisam da empresa, lido numa transação só (um BEGIN, um
 * set_config e um COMMIT em vez de três transações). O `cache` do React guarda o resultado durante o pedido:
 * o layout e a página chamam e o banco é consultado uma vez. Dura só aquele pedido e a chave é o usuário,
 * então nada passa de um usuário ou empresa pra outro e uma permissão alterada vale no pedido seguinte.
 */
export const panelShell = cache(async (userId: string, viewingAs: boolean) =>
	withContext(
		{ userId },
		async (tx) => {
			const active = await enterActiveCompany(tx);
			const summary = active ? await summaryOf(tx, userId, active) : null;
			// Quem já está "como alguém" não escolhe outra pessoa: volta pro dono primeiro.
			const targets =
				active && summary && !viewingAs
					? await targetsOf(tx, userId, active)
					: [];
			return { summary, targets };
		},
		{ repeatableRead: true },
	),
);
