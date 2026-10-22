"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Breadcrumb "Empresa › Página" + gatilho da busca. Cresce para mais segmentos quando houver sub-rotas. */
export function AppHeader({
	companyName,
	title,
	searchLabel,
	onSearchClick,
}: {
	companyName: string;
	title: string;
	searchLabel: string;
	onSearchClick: () => void;
}) {
	// Só depois de montar: o server não sabe o sistema do visitante.
	const [mac, setMac] = useState(false);
	useEffect(() => {
		setMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
	}, []);

	return (
		<header className="flex h-12 items-center justify-between gap-2 border-b px-4 md:px-6">
			<div className="flex min-w-0 items-center gap-2">
				<SidebarTrigger />
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem className="hidden max-w-40 sm:inline-flex">
							<span className="truncate">{companyName}</span>
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden sm:block" />
						<BreadcrumbItem>
							<BreadcrumbPage>{title}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>
			<Button
				aria-label={searchLabel}
				onClick={onSearchClick}
				className="bg-canvas text-muted-foreground hover:bg-[color-mix(in_oklch,var(--canvas),var(--foreground)_4%)] sm:min-w-[220px] sm:justify-start"
				size="sm"
				variant="ghost"
			>
				<SearchIcon />
				<span className="hidden sm:inline">{searchLabel}</span>
				<KbdGroup className="sm:ml-auto">
					<Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
					<Kbd>K</Kbd>
				</KbdGroup>
			</Button>
		</header>
	);
}
