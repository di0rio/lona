import { LayoutDashboardIcon, type LucideIcon } from "lucide-react";
import type { Locale } from "@/i18n/generated";
import { localePath } from "@/i18n/path";

export type NavItem = { title: string; href: string; icon: LucideIcon };

/** Itens de navegação do painel, em ordem. Hoje só "Painel"; cresce aqui conforme novas páginas nascerem. */
export function navItems(
	copy: { dashboard: string },
	locale: Locale,
): NavItem[] {
	return [
		{
			title: copy.dashboard,
			href: localePath(locale, "/painel"),
			icon: LayoutDashboardIcon,
		},
	];
}
