import { Elysia, t } from "elysia";
import { auth } from "./auth";
import { permissions } from "./permissions";
import {
	AnonymousInviteError,
	acceptInvite,
	addBranch,
	addRole,
	companySettings,
	createInvite,
	DuplicateBranchError,
	DuplicateMembershipError,
	DuplicateRoleError,
	dashboardSummary,
	HeadquartersLockedError,
	InvalidInviteError,
	InvalidMembershipError,
	listBranches,
	listRoles,
	listUsers,
	PermissionDeniedError,
	PresetRoleError,
	RoleInUseError,
	removeRole,
	revokeInvite,
	SelfLockoutError,
	updateBranch,
	updateCompanySettings,
	updateRole,
	updateUserMemberships,
} from "./service";

const branchName = t.String({ minLength: 1, maxLength: 80, pattern: "\\S" });
const branchCode = t.String({ pattern: "^[A-Za-z0-9]{2,6}$" });
// A ordem 1 é da matriz, que nasce com a empresa.
const branchOrder = t.Integer({ minimum: 2, maximum: 9999 });

const roleBody = t.Object(
	{
		name: t.String({ minLength: 1, maxLength: 80, pattern: "\\S" }),
		permissions: t.Array(t.UnionEnum([...permissions]), { uniqueItems: true }),
		// null = sem limite. Tetos: 100% no desconto e 12 dígitos no valor (cabe em numeric(14,2)).
		limits: t.Object(
			{
				max_discount_pct: t.Union([
					t.Number({ minimum: 0, maximum: 100 }),
					t.Null(),
				]),
				max_purchase_order: t.Union([
					t.Number({ minimum: 0, maximum: 999999999999 }),
					t.Null(),
				]),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

const membershipBody = t.Object(
	{
		branchId: t.Union([t.String({ format: "uuid" }), t.Null()]),
		roleId: t.String({ format: "uuid" }),
		level: t.UnionEnum(["view", "operate"]),
	},
	{ additionalProperties: false },
);

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
			return {
				userId: current.user.id,
				viewingAs: Boolean(current.session.impersonatedBy),
			};
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
	)
	.get(
		"/roles",
		async ({ userId, status }) => {
			const view = await listRoles(userId);
			return view ?? status(404, "Nenhuma empresa ativa.");
		},
		{ session: true },
	)
	.post(
		"/roles",
		async ({ userId, body, status }) => {
			try {
				const id = await addRole(userId, body);
				return id ? { id } : status(404, "Nenhuma empresa ativa.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem gerencia cargos cria cargos.");
				}
				if (error instanceof DuplicateRoleError) {
					return status(409, { field: "name", message: error.message });
				}
				throw error;
			}
		},
		{ session: true, body: roleBody },
	)
	.put(
		"/roles/:id",
		async ({ userId, params, body, status }) => {
			try {
				const found = await updateRole(userId, params.id, body);
				return found ? { id: params.id } : status(404, "Cargo não encontrado.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem gerencia cargos altera cargos.");
				}
				if (error instanceof SelfLockoutError) {
					return status(409, { field: "permissions", message: error.message });
				}
				if (error instanceof DuplicateRoleError) {
					return status(409, { field: "name", message: error.message });
				}
				throw error;
			}
		},
		{
			session: true,
			params: t.Object({ id: t.String({ format: "uuid" }) }),
			body: roleBody,
		},
	)
	.delete(
		"/roles/:id",
		async ({ userId, params, status }) => {
			try {
				const found = await removeRole(userId, params.id);
				return found ? { id: params.id } : status(404, "Cargo não encontrado.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem gerencia cargos apaga cargos.");
				}
				if (error instanceof RoleInUseError) {
					return status(409, {
						message:
							"Há vínculos usando este cargo. Troque o cargo deles antes de apagar.",
					});
				}
				if (error instanceof PresetRoleError) {
					return status(409, {
						message: "Cargo pronto não pode ser apagado, só editado.",
					});
				}
				throw error;
			}
		},
		{ session: true, params: t.Object({ id: t.String({ format: "uuid" }) }) },
	)
	.get(
		"/users",
		async ({ userId, status }) => {
			const view = await listUsers(userId);
			return view ?? status(404, "Nenhuma empresa ativa.");
		},
		{ session: true },
	)
	.put(
		"/users/:id/memberships",
		async ({ userId, params, body, status }) => {
			try {
				const found = await updateUserMemberships(
					userId,
					params.id,
					body.memberships,
				);
				return found
					? { id: params.id }
					: status(404, "Usuário não encontrado.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem gerencia usuários altera vínculos.");
				}
				if (
					error instanceof SelfLockoutError ||
					error instanceof DuplicateMembershipError ||
					error instanceof InvalidMembershipError
				) {
					return status(409, { message: error.message });
				}
				throw error;
			}
		},
		{
			session: true,
			params: t.Object({ id: t.String({ format: "uuid" }) }),
			body: t.Object(
				{
					// Lista vazia tira o usuário da empresa.
					memberships: t.Array(
						t.Object(
							{
								branchId: t.Union([t.String({ format: "uuid" }), t.Null()]),
								roleId: t.String({ format: "uuid" }),
								level: t.UnionEnum(["view", "operate"]),
							},
							{ additionalProperties: false },
						),
						{ maxItems: 50 },
					),
				},
				{ additionalProperties: false },
			),
		},
	)
	.post(
		"/invites",
		async ({ userId, body, status }) => {
			try {
				const invite = await createInvite(userId, body);
				return invite ?? status(404, "Nenhuma empresa ativa.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem gerencia usuários cria convites.");
				}
				if (error instanceof InvalidMembershipError) {
					return status(409, { message: error.message });
				}
				throw error;
			}
		},
		{ session: true, body: membershipBody },
	)
	.delete(
		"/invites/:id",
		async ({ userId, params, status }) => {
			try {
				const found = await revokeInvite(userId, params.id);
				return found
					? { id: params.id }
					: status(404, "Convite não encontrado.");
			} catch (error) {
				if (error instanceof PermissionDeniedError) {
					return status(403, "Só quem gerencia usuários revoga convites.");
				}
				throw error;
			}
		},
		{ session: true, params: t.Object({ id: t.String({ format: "uuid" }) }) },
	)
	.post(
		"/invites/accept",
		async ({ userId, body, status }) => {
			try {
				return { companyId: await acceptInvite(userId, body.token) };
			} catch (error) {
				if (error instanceof AnonymousInviteError) {
					return status(403, "Crie uma conta para aceitar o convite.");
				}
				// Vencido, usado, revogado e inexistente respondem igual: a resposta não vaza qual.
				if (error instanceof InvalidInviteError) {
					return status(404, "Convite não encontrado.");
				}
				if (error instanceof DuplicateMembershipError) {
					return status(409, {
						message: "Você já tem vínculo nessa filial.",
					});
				}
				if (error instanceof InvalidMembershipError) {
					return status(409, { message: error.message });
				}
				throw error;
			}
		},
		{
			session: true,
			body: t.Object(
				{ token: t.String({ minLength: 1, maxLength: 200 }) },
				{ additionalProperties: false },
			),
		},
	);
