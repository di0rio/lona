import type { Locale } from "./generated";

/** Português fica sem prefixo; os outros idiomas ganham `/<locale>`. Ex.: ("en", "/painel") → "/en/painel". */
export function localePath(locale: Locale, path: string) {
	if (locale === "pt") return path;
	return `/${locale}${path === "/" ? "" : path}`;
}

/** Tira o prefixo de idioma (inclusive o /pt interno do servidor): "/en/painel" → "/painel". */
export function stripLocale(pathname: string) {
	return pathname.replace(/^\/(en|pt)(?=\/|$)/, "") || "/";
}
