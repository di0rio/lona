import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

// O proxy lê a flag do inglês ao carregar o módulo, então cada caso importa uma cópia nova.
async function load(showEnglish: boolean) {
	vi.resetModules();
	vi.stubEnv("NEXT_PUBLIC_SHOW_EN", showEnglish ? "true" : "false");
	const { proxy } = await import("./proxy");
	return (path: string) =>
		proxy(new NextRequest(`http://localhost:3000${path}`));
}

const rewrite = (res: Response) => res.headers.get("x-middleware-rewrite");

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
	test("the matcher covers pages and excludes the API, internals and files", async () => {
		vi.resetModules();
		const { config } = await import("./proxy");
		const matches = (path: string) =>
			new RegExp(`^${config.matcher[0]}$`).test(path);
		for (const path of ["/", "/painel", "/entrar", "/en/painel"]) {
			expect(matches(path), path).toBe(true);
		}
		for (const path of [
			"/api/auth/ok",
			"/api/access/dashboard",
			"/_next/static/x.js",
			"/favicon.ico",
		]) {
			expect(matches(path), path).toBe(false);
		}
	});

	test("portuguese at the root is rewritten to /pt without changing the URL", async () => {
		const run = await load(false);
		expect(rewrite(run("/"))).toBe("http://localhost:3000/pt");
		expect(rewrite(run("/painel"))).toBe("http://localhost:3000/pt/painel");
	});

	test("keeps the query string in the rewrite", async () => {
		const run = await load(false);
		expect(rewrite(run("/painel?x=1"))).toBe(
			"http://localhost:3000/pt/painel?x=1",
		);
	});

	test("/pt redirects (308) to the URL without the prefix", async () => {
		const run = await load(false);
		const res = run("/pt/painel");
		expect(res.status).toBe(308);
		expect(res.headers.get("location")).toBe("http://localhost:3000/painel");
		expect(run("/pt").headers.get("location")).toBe("http://localhost:3000/");
	});

	test("with english off, /en falls into the catch-all route (404)", async () => {
		const run = await load(false);
		expect(rewrite(run("/en"))).toBe("http://localhost:3000/pt/en");
		expect(rewrite(run("/en/painel"))).toBe(
			"http://localhost:3000/pt/en/painel",
		);
	});

	test("with english on, /en passes through", async () => {
		const run = await load(true);
		for (const path of ["/en", "/en/painel"]) {
			const res = run(path);
			expect(rewrite(res)).toBeNull();
			expect(res.status).toBe(200);
		}
	});

	test("/english does not count as /en", async () => {
		const run = await load(true);
		expect(rewrite(run("/english"))).toBe("http://localhost:3000/pt/english");
	});
});
