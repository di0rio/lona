import { Elysia, t } from "elysia";
import { auth } from "./auth";
import {
	addBranch,
	companySettings,
	DuplicateBranchError,
	dashboardSummary,
	HeadquartersLockedError,
	listBranches,
	PermissionDeniedError,
	updateBranch,
	updateCompanySettings,
} from "./service";

const branchName = t.String({ minLength: 1, maxLength: 80, pattern: "\\S" });
const branchCode = t.String({ pattern: "^[A-Za-z0-9]{2,6}$" });
// A ordem 1 é da matriz, que nasce com a empresa.
const branchOrder = t.Integer({ minimum: 2, maximum: 9999 });

const duplicateMessage = {
	code: "Já existe filial com esse código.",
	order: "Já existe filial com essa ordem.",
};

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
	)
	.get(
		"/branches",
		async ({ userId, status }) => {
			const view = await listBranches(userId);
			return view ?? status(404, "Nenhuma empresa ativa.");
		},
		{ session: true },
	)
	.post(
		"/branches",
		async ({ userId, body, status }) => {
			try {
				const id = await addBranch(userId, body);
				return id ? { id } : status(404, "Nenhuma empresa ativa.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem configura a empresa cria filiais.");
				}
				if (error instanceof DuplicateBranchError) {
					return status(409, {
						field: error.field,
						message: duplicateMessage[error.field],
					});
				}
				throw error;
			}
		},
		{
			session: true,
			body: t.Object(
				{ name: branchName, code: branchCode, order: branchOrder },
				{ additionalProperties: false },
			),
		},
	)
	.patch(
		"/branches/:id",
		async ({ userId, params, body, status }) => {
			try {
				const found = await updateBranch(userId, params.id, body);
				return found
					? { id: params.id }
					: status(404, "Filial não encontrada.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem configura a empresa altera filiais.");
				}
				if (error instanceof HeadquartersLockedError) {
					return status(409, {
						field: null,
						message: "A matriz não pode mudar de ordem nem ser inativada.",
					});
				}
				if (error instanceof DuplicateBranchError) {
					return status(409, {
						field: error.field,
						message: duplicateMessage[error.field],
					});
				}
				throw error;
			}
		},
		{
			session: true,
			params: t.Object({ id: t.String({ format: "uuid" }) }),
			body: t.Partial(
				t.Object(
					{
						name: branchName,
						code: branchCode,
						order: branchOrder,
						active: t.Boolean(),
					},
					{ additionalProperties: false, minProperties: 1 },
				),
			),
		},
	);
