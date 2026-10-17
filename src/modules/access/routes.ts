import { Elysia, t } from "elysia";
import { auth } from "./auth";
import {
	companySettings,
	dashboardSummary,
	PermissionDeniedError,
	updateCompanySettings,
} from "./service";

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

export const accessRoutes = new Elysia({ prefix: "/access" })
	.use(session)
	.get(
		"/dashboard",
		async ({ userId, status }) => {
			const summary = await dashboardSummary(userId);
			return summary ?? status(404, "Nenhuma empresa ativa.");
		},
		{ session: true },
	)
	.get(
		"/settings",
		async ({ userId, status }) => {
			const view = await companySettings(userId);
			return view ?? status(404, "Nenhuma empresa ativa.");
		},
		{ session: true },
	)
	.patch(
		"/settings",
		async ({ userId, body, status }) => {
			try {
				const settings = await updateCompanySettings(userId, body);
				return settings ?? status(404, "Nenhuma empresa ativa.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só o dono muda como a empresa trabalha.");
				}
				throw error;
			}
		},
		{
			session: true,
			// Só as opções enviadas mudam; ao menos uma, e nenhuma chave desconhecida.
			body: t.Partial(
				t.Object(
					{
						uses_branches: t.Boolean(),
						work_order_flow: t.Union([t.Literal("simple"), t.Literal("full")]),
						sale_requires_quote: t.Boolean(),
						cash_register_required: t.Boolean(),
					},
					{ additionalProperties: false, minProperties: 1 },
				),
			),
		},
	);
