import { Elysia } from "elysia";
import { auth } from "./auth";
import { resumoDoPainel } from "./service";

// Plugin com a sessão: a rota que declara `{ sessao: true }` só roda com usuário logado e recebe `usuarioId`.
export const sessao = new Elysia({ name: "acesso.sessao" }).macro({
	sessao: {
		async resolve({ request, status }) {
			const atual = await auth.api.getSession({ headers: request.headers });
			if (!atual) return status(401, "Entre para continuar.");
			return { usuarioId: atual.user.id };
		},
	},
});

export const acessoRoutes = new Elysia({ prefix: "/acesso" }).use(sessao).get(
	"/painel",
	async ({ usuarioId, status }) => {
		const resumo = await resumoDoPainel(usuarioId);
		return resumo ?? status(404, "Nenhuma empresa ativa.");
	},
	{ sessao: true },
);
