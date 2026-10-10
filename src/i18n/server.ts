import { locale as localeParam } from "next/root-params";
import { type Locale, translations } from "./generated";

/** O inglês existe nas traduções, mas só vira rota com NEXT_PUBLIC_SHOW_EN ligada. */
export const mostrarEn = process.env.NEXT_PUBLIC_SHOW_EN === "true";

export const locales: Locale[] = mostrarEn ? ["pt", "en"] : ["pt"];

/**
 * Traduções do idioma da URL (`/` = pt, `/en` = en), pra usar em qualquer Server Component.
 * O `[locale]` é o segmento raiz, então dá pra ler sem passar `params` adiante.
 */
export async function getT() {
	const value = await localeParam();
	const locale: Locale = locales.includes(value as Locale)
		? (value as Locale)
		: "pt";
	return { locale, t: translations[locale] };
}
