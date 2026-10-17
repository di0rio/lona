import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous, twoFactor } from "better-auth/plugins";
import { authDb } from "@/db/client";
import {
	accounts,
	rateLimit,
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
			rateLimit,
		},
	}),
	// Quem gera o id é o banco (uuidv7()), igual às demais tabelas.
	advanced: { database: { generateId: false } },
	// O contador fica no Postgres porque cada instância da Vercel tem a sua memória e o limite não valeria.
	// Desligado só no "next dev", onde todo mundo seria o mesmo IP (127.0.0.1). O IP vem de x-forwarded-for, que
	// a Vercel sobrescreve com o do cliente (não dá pra forjar); o Better Auth só o aceita com um único valor.
	rateLimit: {
		enabled: process.env.NODE_ENV !== "development",
		storage: "database",
		// Janela em segundos, por IP e rota. Mais apertado que o padrão do Better Auth (3 a cada 10s).
		customRules: {
			// "Testar demonstração": cada clique cria um visitante e uma cópia dos dados.
			// Quem já tem sessão não chama esta rota; 5 a cada 10 min cobre quem testa de uma rede compartilhada.
			"/sign-in/anonymous": { window: 600, max: 5 },
			// Tentativas de senha: 5 a cada 5 min deixa errar à vontade e limita força bruta a ~1.400 por dia e IP.
			"/sign-in/email": { window: 300, max: 5 },
			"/sign-up/email": { window: 600, max: 5 },
			// Código de 6 dígitos: o plugin já trava o usuário após falhas; este limite é por IP.
			"/two-factor/verify-*": { window: 300, max: 5 },
		},
	},
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
