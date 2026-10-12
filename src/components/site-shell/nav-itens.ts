import { LayoutDashboardIcon, type LucideIcon } from "lucide-react";

export type NavItem = { titulo: string; href: string; icone: LucideIcon };

/** Itens de navegação do painel, em ordem. Hoje só "Painel"; cresce aqui conforme novas páginas nascerem. */
export function navItens(copy: { painel: string }): NavItem[] {
	return [{ titulo: copy.painel, href: "/painel", icone: LayoutDashboardIcon }];
}
