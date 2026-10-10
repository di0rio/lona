import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { sessao } from "@/modules/acesso";
import {
	iniciarDemonstracao,
	limparDemonstracoesVencidas,
	resetarDemonstracao,
} from "./service";

// A Vercel chama a rotina agendada com `Authorization: Bearer <CRON_SECRET>`.
function cronAutorizado(authorization: string | undefined) {
	const segredo = process.env.CRON_SECRET;
	if (!segredo || !authorization) return false;
	const esperado = Buffer.from(`Bearer ${segredo}`);
	const recebido = Buffer.from(authorization);
	return (
		esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
	);
}

export const demonstracaoRoutes = new Elysia()
	.use(sessao)
	.post(
		"/demonstracao/iniciar",
		async ({ usuarioId }) => ({
			empresaId: await iniciarDemonstracao(usuarioId),
		}),
		{ sessao: true },
	)
	.post(
		"/demonstracao/resetar",
		async ({ usuarioId, status }) => {
			const empresaId = await resetarDemonstracao(usuarioId);
			return empresaId
				? { empresaId }
				: status(409, "A empresa atual não é uma demonstração.");
		},
		{ sessao: true },
	)
	.get("/cron/limpar", async ({ headers, status }) => {
		if (!cronAutorizado(headers.authorization)) return status(401, "Negado.");
		return { apagadas: await limparDemonstracoesVencidas() };
	});
