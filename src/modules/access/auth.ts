import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { authDb } from "@/db/client";
import { accounts, sessions, users, verifications } from "./schema";
import { viewAs } from "./view-as-plugin";

export const auth = betterAuth({
	database: drizzleAdapter(authDb, {
		provider: "pg",
		schema: {
			user: users,
			session: sessions,
			account: accounts,
			verification: verifications,
		},
	}),
	// Quem gera o id é o banco (uuidv7()), igual às demais tabelas.
	advanced: { database: { generateId: false } },
	// Verificação por código e 2FA ficam para a etapa 1b, quando o envio de e-mail existir.
	emailAndPassword: { enabled: true },
	plugins: [
		anonymous({ generateName: () => "Visitante" }),
		viewAs(),
		nextCookies(), // sempre o último: grava o cookie de sessão quando o login acontece num Server Action
	],
});
