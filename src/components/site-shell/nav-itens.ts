import { LayoutDashboardIcon, type LucideIcon } from "lucide-react";
import type { Locale } from "@/i18n/generated";
import { localePath } from "@/i18n/path";

export type NavItem = { titulo: string; href: string; icone: LucideIcon };

/** Itens de navegação do painel, em ordem. Hoje só "Painel"; cresce aqui conforme novas páginas nascerem. */
export function navItens(copy: { painel: string }, locale: Locale): NavItem[] {
	return [
		{
			titulo: copy.painel,
			href: localePath(locale, "/painel"),
			icone: LayoutDashboardIcon,
		},
	];
}
