"use client";

import {
	ChevronsUpDownIcon,
	LockKeyholeIcon,
	LogOutIcon,
	MonitorIcon,
	MoonIcon,
	SunIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
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
import { viewAsStart } from "@/lib/view-as-client";
import type { ViewAsTarget } from "@/modules/access";
import { LonaMark } from "./lona-mark";
import type { NavItem } from "./nav-items";

export function AppSidebar({
	accountHref,
	companyName,
	items,
	user,
	signOutTo,
	viewAs,
	viewingAs,
	copy,
}: {
	accountHref: string;
	companyName: string;
	items: NavItem[];
	user: { name: string; line2: string };
	signOutTo: string;
	viewAs: { copy: { menu: string; error: string }; targets: ViewAsTarget[] };
	viewingAs: boolean;
	copy: {
		theme: { label: string; light: string; dark: string; system: string };
		account: string;
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

	async function viewAsPerson(userId: string) {
		if (await viewAsStart(userId)) router.refresh();
		else toast(viewAs.copy.error);
	}

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader>
				<div className="flex items-center gap-2.5 px-2 py-1.5">
					<LonaMark />
					<span className="truncate font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
						{companyName}
					</span>
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
								{viewAs.targets.length > 0 && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuGroup>
											<DropdownMenuLabel>{viewAs.copy.menu}</DropdownMenuLabel>
											{viewAs.targets.map((target) => (
												<DropdownMenuItem
													key={target.id}
													onClick={() => viewAsPerson(target.id)}
												>
													{target.name} ({target.role}
													{target.branch ? `, ${target.branch}` : ""})
												</DropdownMenuItem>
											))}
										</DropdownMenuGroup>
									</>
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem render={<Link href={accountHref} />}>
									<LockKeyholeIcon /> {copy.account}
								</DropdownMenuItem>
								{!viewingAs && (
									<>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={signOut} variant="destructive">
											<LogOutIcon /> {copy.signOut}
										</DropdownMenuItem>
									</>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
