import {
	BuildingIcon,
	ContactIcon,
	CreditCardIcon,
	LayoutDashboardIcon,
	type LucideIcon,
	PackageIcon,
	SettingsIcon,
	ShieldCheckIcon,
	TruckIcon,
	UsersIcon,
} from "lucide-react";
import type { Locale } from "@/i18n/generated";
import { localePath } from "@/i18n/path";

export type NavItem = { title: string; href: string; icon: LucideIcon };

/** Itens de navegação do painel, em ordem. Filiais só aparece quando a empresa usa filiais (ADR 0003). */
export function navItems(
	copy: {
		dashboard: string;
		customers: string;
		parts: string;
		suppliers: string;
		branches: string;
		roles: string;
		users: string;
		payments: string;
		settings: string;
	},
	locale: Locale,
	usesBranches: boolean,
	/** Permissões do usuário na empresa ativa: cadastro que ele não pode consultar não aparece no menu. */
	permissions: readonly string[],
): NavItem[] {
	const can = (permission: string) => permissions.includes(permission);
	const when = (allowed: boolean, item: NavItem) => (allowed ? [item] : []);
	return [
		{
			title: copy.dashboard,
			href: localePath(locale, "/painel"),
			icon: LayoutDashboardIcon,
		},
		...when(can("customer.view"), {
			title: copy.customers,
			href: localePath(locale, "/painel/clientes"),
			icon: ContactIcon,
		}),
		...when(can("inventory.view"), {
			title: copy.parts,
			href: localePath(locale, "/painel/pecas"),
			icon: PackageIcon,
		}),
		...when(can("purchasing.view"), {
			title: copy.suppliers,
			href: localePath(locale, "/painel/fornecedores"),
			icon: TruckIcon,
		}),
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
			title: copy.users,
			href: localePath(locale, "/painel/usuarios"),
			icon: UsersIcon,
		},
		{
			title: copy.payments,
			href: localePath(locale, "/painel/pagamentos"),
			icon: CreditCardIcon,
		},
		{
			title: copy.settings,
			href: localePath(locale, "/painel/configuracoes"),
			icon: SettingsIcon,
		},
	];
}
