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
import type { NavItem } from "./nav-items";

export function AppSidebar({
	companyName,
	items,
	user,
	signOutTo,
	copy,
}: {
	companyName: string;
	items: NavItem[];
	user: { name: string; line2: string };
	signOutTo: string;
	copy: {
		theme: { label: string; light: string; dark: string; system: string };
		signOut: string;
	};
}) {
	const pathname = stripLocale(usePathname());
	const { theme, setTheme } = useTheme();
	const router = useRouter();

	async function signOut() {
		await authClient.signOut();
		router.push(signOutTo);
		router.refresh();
	}

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center gap-2 px-2 py-1.5">
					<span className="truncate font-semibold text-sm">{companyName}</span>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarMenu>
					{items.map((item) => (
						<SidebarMenuItem key={item.href}>
							<SidebarMenuButton
								isActive={pathname === item.href}
								render={<Link href={item.href} />}
							>
								<item.icon />
								<span>{item.title}</span>
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
											<span className="truncate text-sm">{user.name}</span>
											<span className="truncate text-muted-foreground text-xs">
												{user.line2}
											</span>
										</div>
										<ChevronsUpDownIcon className="ml-auto" />
									</SidebarMenuButton>
								}
							/>
							<DropdownMenuContent align="start" side="top">
								<DropdownMenuGroup>
									<DropdownMenuLabel>{copy.theme.label}</DropdownMenuLabel>
									<DropdownMenuRadioGroup
										onValueChange={setTheme}
										value={theme ?? "system"}
									>
										<DropdownMenuRadioItem value="light">
											<SunIcon /> {copy.theme.light}
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="dark">
											<MoonIcon /> {copy.theme.dark}
										</DropdownMenuRadioItem>
										<DropdownMenuRadioItem value="system">
											<MonitorIcon /> {copy.theme.system}
										</DropdownMenuRadioItem>
									</DropdownMenuRadioGroup>
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={signOut} variant="destructive">
									<LogOutIcon /> {copy.signOut}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
