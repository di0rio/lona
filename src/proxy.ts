import { type NextRequest, NextResponse } from "next/server";

const showEnglish = process.env.NEXT_PUBLIC_SHOW_EN === "true";

// Português na raiz, inglês em /en. Por dentro tudo vive em app/[locale]: "/" vira "/pt" sem mudar a URL.
// Com NEXT_PUBLIC_SHOW_EN desligada, /en cai na rota pega-tudo e dá 404, como qualquer outro caminho.
export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (showEnglish && /^\/en(\/|$)/.test(pathname)) return NextResponse.next();

	// /pt/... é só a versão interna; quem digitar vai pra URL sem prefixo.
	if (/^\/pt(\/|$)/.test(pathname)) {
		const url = request.nextUrl.clone();
		url.pathname = pathname.slice(3) || "/";
		return NextResponse.redirect(url, 308);
	}

	const url = request.nextUrl.clone();
	url.pathname = `/pt${pathname}`;
	return NextResponse.rewrite(url);
}

export const config = {
	// Fora: arquivos internos, a API (Elysia e Better Auth) e qualquer arquivo com extensão (ícones, robots, /public).
	matcher: ["/((?!_next|api|.*\\..*).*)"],
};
