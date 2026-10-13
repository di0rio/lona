import { Elysia } from "elysia";
import { auth } from "./auth";
import { dashboardSummary } from "./service";

// Plugin com a sessão: a rota que declara `{ session: true }` só roda com usuário logado e recebe `userId`.
export const session = new Elysia({ name: "access.session" }).macro({
	session: {
		async resolve({ request, status }) {
			const current = await auth.api.getSession({ headers: request.headers });
			if (!current) return status(401, "Entre para continuar.");
			return { userId: current.user.id };
		},
	},
});

export const accessRoutes = new Elysia({ prefix: "/access" }).use(session).get(
	"/dashboard",
	async ({ userId, status }) => {
		const summary = await dashboardSummary(userId);
		return summary ?? status(404, "Nenhuma empresa ativa.");
	},
	{ session: true },
);
