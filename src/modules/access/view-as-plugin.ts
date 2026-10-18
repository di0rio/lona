import {
	APIError,
	type BetterAuthPlugin,
	type StandardSchemaV1,
} from "better-auth";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { canViewAs } from "./view-as";

// A demonstração dura 2 horas; a sessão "como outra pessoa" vive o bastante para a tela de "acabou" ainda abrir.
const SESSION_SECONDS = 2 * 60 * 60;

// O projeto não tem zod próprio; o Better Auth aceita qualquer Standard Schema como corpo.
const startBody: StandardSchemaV1<{ userId: string }> = {
	"~standard": {
		version: 1,
		vendor: "lona",
		validate: (value) =>
			typeof value === "object" &&
			value !== null &&
			"userId" in value &&
			typeof value.userId === "string"
				? { value: { userId: value.userId } }
				: { issues: [{ message: "userId é obrigatório." }] },
	},
};

/**
 * "Ver como": o dono da demonstração entra, de verdade, como uma pessoa fictícia da mesma demonstração.
 * Não usa o plugin admin do Better Auth: ele dá a qualquer admin o poder de virar QUALQUER usuário (inclusive
 * real), e guarda a sessão de origem num cookie. Aqui a origem fica na própria sessão (`impersonated_by`), que só o
 * servidor grava, e quem pode virar quem é conferido contra o banco a cada pedido.
 */
export const viewAs = () =>
	({
		id: "view-as",
		endpoints: {
			startViewAs: createAuthEndpoint(
				"/view-as/start",
				{
					method: "POST",
					body: startBody,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const { session, user } = ctx.context.session;
					// Sem encadear: quem já está "como alguém" volta pro dono antes de ir pra outro.
					if (session.impersonatedBy) {
						throw APIError.fromStatus("FORBIDDEN", {
							message: "Volte pro dono antes de ver como outra pessoa.",
						});
					}
					const targetId = ctx.body.userId;
					if (!(await canViewAs(user.id, targetId))) {
						throw APIError.fromStatus("FORBIDDEN", {
							message: "Você não pode ver como esta pessoa.",
						});
					}
					const target =
						await ctx.context.internalAdapter.findUserById(targetId);
					if (!target) throw APIError.fromStatus("NOT_FOUND");
					const created = await ctx.context.internalAdapter.createSession(
						target.id,
						true,
						{
							impersonatedBy: user.id,
							expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
						},
						true,
					);
					await setSessionCookie(ctx, { session: created, user: target }, true);
					return ctx.json({ ok: true });
				},
			),
			stopViewAs: createAuthEndpoint(
				"/view-as/stop",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const { session } = ctx.context.session;
					// O dono vem da sessão no banco, nunca do pedido.
					if (!session.impersonatedBy) {
						throw APIError.fromStatus("BAD_REQUEST", {
							message: "Você não está vendo como outra pessoa.",
						});
					}
					const owner = await ctx.context.internalAdapter.findUserById(
						session.impersonatedBy,
					);
					if (!owner) throw APIError.fromStatus("NOT_FOUND");
					const restored = await ctx.context.internalAdapter.createSession(
						owner.id,
						false,
					);
					await ctx.context.internalAdapter.deleteSession(session.token);
					await setSessionCookie(ctx, { session: restored, user: owner });
					return ctx.json({ ok: true });
				},
			),
		},
		// Mesma coluna que o plugin admin usa; input: false impede o cliente de preencher.
		schema: {
			session: {
				fields: {
					impersonatedBy: { type: "string", required: false, input: false },
				},
			},
		},
	}) satisfies BetterAuthPlugin;
