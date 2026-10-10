import { defineConfig } from "@playwright/test";

const porta = 3100;

export default defineConfig({
	testDir: "./e2e",
	// Os testes criam demonstrações no mesmo banco; em série, cada um limpa o que criou sem pisar no outro.
	workers: 1,
	use: { baseURL: `http://localhost:${porta}`, locale: "pt-BR" },
	webServer: {
		command: `bun run build && bun run start -p ${porta}`,
		url: `http://localhost:${porta}`,
		reuseExistingServer: true,
		timeout: 180_000,
	},
});
