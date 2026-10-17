import {
	BuildingIcon,
	LayoutDashboardIcon,
	type LucideIcon,
	SettingsIcon,
	ShieldCheckIcon,
} from "lucide-react";
import type { Locale } from "@/i18n/generated";
import { localePath } from "@/i18n/path";

export type NavItem = { title: string; href: string; icon: LucideIcon };

/** Itens de navegação do painel, em ordem. Filiais só aparece quando a empresa usa filiais (ADR 0003). */
export function navItems(
	copy: {
		dashboard: string;
		branches: string;
		roles: string;
		settings: string;
	},
	locale: Locale,
	usesBranches: boolean,
): NavItem[] {
	return [
		{
			title: copy.dashboard,
			href: localePath(locale, "/painel"),
			icon: LayoutDashboardIcon,
		},
		...(usesBranches
			? [
					{
						title: copy.branches,
						href: localePath(locale, "/painel/filiais"),
						icon: BuildingIcon,
					},
				]
			: []),
		{
			title: copy.roles,
			href: localePath(locale, "/painel/cargos"),
			icon: ShieldCheckIcon,
		},
		{
			title: copy.settings,
			href: localePath(locale, "/painel/configuracoes"),
			icon: SettingsIcon,
		},
	];
}
