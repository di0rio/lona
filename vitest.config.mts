import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		include: ["src/**/*.test.ts"],
		setupFiles: ["./vitest.setup.ts"],
		// Os testes de integração dividem o mesmo banco; um arquivo por vez evita um limpar o dado do outro.
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
