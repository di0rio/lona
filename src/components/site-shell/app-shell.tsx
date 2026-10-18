"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import type { Locale } from "@/i18n/generated";
import { localePath, stripLocale } from "@/i18n/path";
import type { DashboardSummary, ViewAsTarget } from "@/modules/access";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { CommandMenu } from "./command-menu";
import { Countdown } from "./countdown";
import { navItems } from "./nav-items";
import { ResetButton } from "./reset-button";
import { StartAnother } from "./start-another";
import { BackToOwner, ViewAsBanner, type ViewAsCopy } from "./view-as-banner";

type Copy = {
	search: string;
	sidebar: {
		theme: { label: string; light: string; dark: string; system: string };
		account: string;
		signOut: string;
	};
	commandMenu: {
		goTo: string;
		actions: string;
		toggleTheme: string;
		reset: string;
		empty: string;
	};
	countdown: { label: string; warning: string };
	viewAs: ViewAsCopy & { menu: string };
	reset: { button: string; resetting: string; error: string };
	expired: {
		title: string;
		text: string;
		button: string;
		starting: string;
		error: string;
		rateLimited: string;
		full: string;
	};
};

/**
 * Casca do app logado: sidebar, header com busca e a faixa da demonstração, visíveis em toda página do painel.
 * Sem empresa (demonstração vencida), substitui tudo pela tela de "começar outra".
 */
export function AppShell({
	summary,
	userName,
	dashboardTitle,
	branchesTitle,
	rolesTitle,
	usersTitle,
	settingsTitle,
	locale,
	copy,
	signOutTo,
	viewAsTargets,
	viewingAs,
	children,
}: {
	summary: DashboardSummary | null;
	userName: string;
	dashboardTitle: string;
	branchesTitle: string;
	rolesTitle: string;
	usersTitle: string;
	settingsTitle: string;
	locale: Locale;
	copy: Copy;
	signOutTo: string;
	/** A quem o dono pode "ver como" (vazio para quem não é dono). */
	viewAsTargets: ViewAsTarget[];
	/** A sessão atual é de uma pessoa fictícia aberta pelo dono. */
	viewingAs: boolean;
	children: ReactNode;
}) {
	const [searchOpen, setSearchOpen] = useState(false);
	const pathname = stripLocale(usePathname());

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setSearchOpen((open) => !open);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	if (!summary) {
		return (
			<div data-color="gray">
				<section
					className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-12 outline-none"
					id="conteudo"
					tabIndex={-1}
				>
					<h1 className="font-semibold text-2xl">{copy.expired.title}</h1>
					<p className="max-w-prose text-muted-foreground">
						{copy.expired.text}
					</p>
					{viewingAs ? (
						<BackToOwner copy={copy.viewAs} />
					) : (
						<StartAnother copy={copy.expired} />
					)}
				</section>
			</div>
		);
	}

	const expiresAt = summary.company.expiresAt
		? new Date(summary.company.expiresAt).getTime()
		: null;
	const items = navItems(
		{
			dashboard: dashboardTitle,
			branches: branchesTitle,
			roles: rolesTitle,
			users: usersTitle,
			settings: settingsTitle,
		},
		locale,
		summary.usesBranches,
	);
	const accountHref = localePath(locale, "/painel/conta");
	const title =
		pathname === accountHref
			? copy.sidebar.account
			: (items.find((item) => item.href === pathname)?.title ?? dashboardTitle);

	return (
		<div data-color={summary.company.color}>
			<SidebarProvider>
				<AppSidebar
					companyName={summary.company.name}
					accountHref={accountHref}
					copy={copy.sidebar}
					items={items}
					signOutTo={signOutTo}
					viewAs={{ copy: copy.viewAs, targets: viewAsTargets }}
					viewingAs={viewingAs}
					user={{
						name: userName,
						line2: `${summary.role} · ${summary.branch.name}`,
					}}
				/>
				<SidebarInset>
					<AppHeader
						onSearchClick={() => setSearchOpen(true)}
						searchLabel={copy.search}
						title={title}
					/>
					<div className="sticky top-0 z-10">
						{viewingAs && (
							<ViewAsBanner
								copy={copy.viewAs}
								line={`${summary.role}, ${summary.branch.name}`}
								name={userName}
							/>
						)}
						{expiresAt && (
							<Countdown
								action={viewingAs ? null : <ResetButton copy={copy.reset} />}
								copy={copy.countdown}
								expiresAt={expiresAt}
							/>
						)}
					</div>
					<div className="flex flex-1 flex-col gap-6 p-4">{children}</div>
				</SidebarInset>
			</SidebarProvider>
			<CommandMenu
				canReset={Boolean(expiresAt)}
				copy={copy.commandMenu}
				items={items}
				onOpenChange={setSearchOpen}
				open={searchOpen}
			/>
			<Toaster />
		</div>
	);
}
