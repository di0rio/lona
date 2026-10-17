import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous, twoFactor } from "better-auth/plugins";
import { authDb } from "@/db/client";
import {
	accounts,
	sessions,
	twoFactor as twoFactors,
	users,
	verifications,
} from "./schema";
import { viewAs } from "./view-as-plugin";

export const auth = betterAuth({
	database: drizzleAdapter(authDb, {
		provider: "pg",
		schema: {
			user: users,
			session: sessions,
			account: accounts,
			verification: verifications,
			twoFactor: twoFactors,
		},
	}),
	// Quem gera o id é o banco (uuidv7()), igual às demais tabelas.
	advanced: { database: { generateId: false } },
	// Verificação de e-mail por código fica para quando o envio de e-mail existir.
	emailAndPassword: { enabled: true },
	plugins: [
		anonymous({ generateName: () => "Visitante" }),
		// Só app autenticador (TOTP) e códigos de recuperação: sem sendOTP o plugin não oferece OTP por e-mail ou SMS.
		// Segredo e códigos de recuperação ficam criptografados no banco (padrão do plugin).
		twoFactor({ issuer: "Lona" }),
		viewAs(),
		nextCookies(), // sempre o último: grava o cookie de sessão quando o login acontece num Server Action
	],
});
