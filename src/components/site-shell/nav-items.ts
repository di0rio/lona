import {
	LayoutDashboardIcon,
	type LucideIcon,
	SettingsIcon,
} from "lucide-react";
import type { Locale } from "@/i18n/generated";
import { localePath } from "@/i18n/path";

export type NavItem = { title: string; href: string; icon: LucideIcon };

/** Itens de navegação do painel, em ordem. Cresce aqui conforme novas páginas nascerem. */
export function navItems(
	copy: { dashboard: string; settings: string },
	locale: Locale,
): NavItem[] {
	return [
		{
			title: copy.dashboard,
			href: localePath(locale, "/painel"),
			icon: LayoutDashboardIcon,
		},
		{
			title: copy.settings,
			href: localePath(locale, "/painel/configuracoes"),
			icon: SettingsIcon,
		},
	];
}
