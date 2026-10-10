import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

// O proxy lê a flag do inglês ao carregar o módulo, então cada caso importa uma cópia nova.
async function carregar(mostrarEn: boolean) {
	vi.resetModules();
	vi.stubEnv("NEXT_PUBLIC_SHOW_EN", mostrarEn ? "true" : "false");
	const { proxy } = await import("./proxy");
	return (path: string) =>
		proxy(new NextRequest(`http://localhost:3000${path}`));
}

const reescrita = (res: Response) => res.headers.get("x-middleware-rewrite");

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
	test("português na raiz é reescrito pra /pt sem mudar a URL", async () => {
		const run = await carregar(false);
		expect(reescrita(run("/"))).toBe("http://localhost:3000/pt");
		expect(reescrita(run("/painel"))).toBe("http://localhost:3000/pt/painel");
	});

	test("mantém a query na reescrita", async () => {
		const run = await carregar(false);
		expect(reescrita(run("/painel?x=1"))).toBe(
			"http://localhost:3000/pt/painel?x=1",
		);
	});

	test("/pt redireciona (308) pra URL sem prefixo", async () => {
		const run = await carregar(false);
		const res = run("/pt/painel");
		expect(res.status).toBe(308);
		expect(res.headers.get("location")).toBe("http://localhost:3000/painel");
		expect(run("/pt").headers.get("location")).toBe("http://localhost:3000/");
	});

	test("com o inglês desligado, /en cai na rota pega-tudo (404)", async () => {
		const run = await carregar(false);
		expect(reescrita(run("/en"))).toBe("http://localhost:3000/pt/en");
		expect(reescrita(run("/en/painel"))).toBe(
			"http://localhost:3000/pt/en/painel",
		);
	});

	test("com o inglês ligado, /en passa direto", async () => {
		const run = await carregar(true);
		for (const path of ["/en", "/en/painel"]) {
			const res = run(path);
			expect(reescrita(res)).toBeNull();
			expect(res.status).toBe(200);
		}
	});

	test("/english não conta como /en", async () => {
		const run = await carregar(true);
		expect(reescrita(run("/english"))).toBe("http://localhost:3000/pt/english");
	});
});
