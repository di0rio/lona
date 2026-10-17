import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const porta = 3100;
const origem = `http://localhost:${porta}`;

export default defineConfig({
	testDir: "./e2e",
	// Os testes criam demonstrações no mesmo banco; em série, cada um limpa o que criou sem pisar no outro.
	workers: 1,
	// O primeiro teste pega servidor e conexões com o Neon frios, e cada etapa (limite de taxa, cópia) é uma ida ao banco.
	expect: { timeout: 15_000 },
	use: { baseURL: origem, locale: "pt-BR" },
	webServer: {
		command: `bun run build && bun run start -p ${porta}`,
		url: origem,
		reuseExistingServer: true,
		timeout: 240_000,
		// O Better Auth confere a origem das requisições contra esta URL.
		env: { BETTER_AUTH_URL: origem },
	},
});
