"use client";

import {
	ChevronsUpDownIcon,
	LogOutIcon,
	MonitorIcon,
	MoonIcon,
	SunIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { stripLocale } from "@/i18n/path";
import { authClient } from "@/lib/auth-client";
import type { NavItem } from "./nav-itens";

export function AppSidebar({
	empresaNome,
	itens,
	usuario,
	sairPara,
	copy,
}: {
	empresaNome: string;
	itens: NavItem[];
	usuario: { nome: string; linha2: string };
	sairPara: string;
	copy: {
		tema: { label: string; claro: string; escuro: string; sistema: string };
		sair: string;
	};
}) {
	const pathname = stripLocale(usePathname());
	const { theme, setTheme } = useTheme();
	const router = useRouter();

	async function sair() {
		await authClient.signOut();
		router.push(sairPara);
		router.refresh();
	}

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2 py-1.5">
					<span className="truncate font-semibold text-sm">{empresaNome}</span>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarMenu>
					{itens.map((item) => (
						<SidebarMenuItem key={item.href}>
							<SidebarMenuButton
								isActive={pathname === item.href}
								render={<Link href={item.href} />}
							>
								<item.icone />
								<span>{item.titulo}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<SidebarMenuButton size="lg">
										<div className="flex min-w-0 flex-col">
											<span className="truncate text-sm">{usuario.nome}</span>
											<span className="truncate text-muted-foreground text-xs">
												{usuario.linha2}
											</span>
										</div>
										<ChevronsUpDownIcon className="ml-auto" />
									</SidebarMenuButton>
								}
							/>
							<DropdownMenuContent align="start" side="top">
								<DropdownMenuGroup>
									<DropdownMenuLabel>{copy.tema.label}</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										onValueChange={setTheme}
										value={theme ?? "system"}
									>
										<DropdownMenuRadioItem value="light">
											<SunIcon /> {copy.tema.claro}
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="dark">
											<MoonIcon /> {copy.tema.escuro}
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="system">
											<MonitorIcon /> {copy.tema.sistema}
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={sair} variant="destructive">
									<LogOutIcon /> {copy.sair}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
