import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { dbAutenticacao } from "@/db/client";
import { contas, sessoes, usuarios, verificacoes } from "./schema";

export const auth = betterAuth({
	database: drizzleAdapter(dbAutenticacao, {
		provider: "pg",
		schema: {
			user: usuarios,
			session: sessoes,
			account: contas,
			verification: verificacoes,
		},
	}),
	// Quem gera o id é o banco (uuidv7()), igual às demais tabelas.
	advanced: { database: { generateId: false } },
	// Verificação por código e 2FA ficam para a etapa 1b, quando o envio de e-mail existir.
	emailAndPassword: { enabled: true },
	plugins: [
		anonymous({ generateName: () => "Visitante" }),
		nextCookies(), // sempre o último: grava o cookie de sessão quando o login acontece num Server Action
	],
});
