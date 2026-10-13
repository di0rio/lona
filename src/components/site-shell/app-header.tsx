"use client";

import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Breadcrumb simples (só o título da página de hoje) + gatilho da busca. Cresce para vários segmentos quando houver sub-rotas. */
export function AppHeader({
	titulo,
	buscarLabel,
	onBuscarClick,
}: {
	titulo: string;
	buscarLabel: string;
	onBuscarClick: () => void;
}) {
	// Só depois de montar: o server não sabe o sistema do visitante.
	const [mac, setMac] = useState(false);
	useEffect(() => {
		setMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
	}, []);

	return (
		<header className="flex h-12 items-center justify-between gap-2 border-b px-4">
			<div className="flex items-center gap-2">
				<SidebarTrigger />
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbPage>{titulo}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</div>
			<Button
				aria-label={buscarLabel}
				onClick={onBuscarClick}
				size="sm"
				variant="outline"
			>
				<SearchIcon />
				<span className="hidden sm:inline">{buscarLabel}</span>
				<KbdGroup>
					<Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
					<Kbd>K</Kbd>
				</KbdGroup>
			</Button>
		</header>
	);
}
