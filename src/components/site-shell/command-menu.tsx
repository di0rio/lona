"use client";

import { MoonIcon, RotateCcwIcon, SunIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { api } from "@/lib/api";
import type { NavItem } from "./nav-items";

/** A paleta em si: "Ir para" navega pelos itens da sidebar, "Ações" alterna tema e, com demonstração ativa, reseta. Quem abre e fecha é o AppShell (Ctrl+K e o botão "Buscar" do header controlam o mesmo estado). */
export function CommandMenu({
	open,
	onOpenChange,
	items,
	canReset,
	copy,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: NavItem[];
	canReset: boolean;
	copy: {
		goTo: string;
		actions: string;
		toggleTheme: string;
		reset: string;
		empty: string;
	};
}) {
	const router = useRouter();
	const { resolvedTheme, setTheme } = useTheme();

	function go(href: string) {
		onOpenChange(false);
		router.push(href);
	}

	async function reset() {
		onOpenChange(false);
		const { error } = await api().demo.reset.post();
		if (!error) router.refresh();
	}

	return (
		<CommandDialog onOpenChange={onOpenChange} open={open}>
			<Command>
				<CommandList>
					<CommandEmpty>{copy.empty}</CommandEmpty>
					<CommandGroup heading={copy.goTo}>
						{items.map((item) => (
							<CommandItem key={item.href} onSelect={() => go(item.href)}>
								<item.icon />
								{item.title}
							</CommandItem>
						))}
					</CommandGroup>
					<CommandGroup heading={copy.actions}>
						<CommandItem
							onSelect={() =>
								setTheme(resolvedTheme === "dark" ? "light" : "dark")
							}
						>
							{resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
							{copy.toggleTheme}
						</CommandItem>
						{canReset && (
							<CommandItem onSelect={reset}>
								<RotateCcwIcon />
								{copy.reset}
							</CommandItem>
						)}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
