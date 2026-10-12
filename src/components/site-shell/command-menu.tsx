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
import type { NavItem } from "./nav-itens";

/** A paleta em si: "Ir para" navega pelos itens da sidebar, "Ações" alterna tema e, com demonstração ativa, reseta. Quem abre e fecha é o AppShell (Ctrl+K e o botão "Buscar" do header controlam o mesmo estado). */
export function CommandMenu({
	aberto,
	onAbertoChange,
	itens,
	podeResetar,
	copy,
}: {
	aberto: boolean;
	onAbertoChange: (aberto: boolean) => void;
	itens: NavItem[];
	podeResetar: boolean;
	copy: {
		irPara: string;
		acoes: string;
		alternarTema: string;
		resetar: string;
		vazio: string;
	};
}) {
	const router = useRouter();
	const { resolvedTheme, setTheme } = useTheme();

	function ir(href: string) {
		onAbertoChange(false);
		router.push(href);
	}

	async function resetar() {
		onAbertoChange(false);
		const { error } = await api().demonstracao.resetar.post();
		if (!error) router.refresh();
	}

	return (
		<CommandDialog onOpenChange={onAbertoChange} open={aberto}>
			<Command>
				<CommandList>
					<CommandEmpty>{copy.vazio}</CommandEmpty>
					<CommandGroup heading={copy.irPara}>
						{itens.map((item) => (
							<CommandItem key={item.href} onSelect={() => ir(item.href)}>
								<item.icone />
								{item.titulo}
							</CommandItem>
						))}
					</CommandGroup>
					<CommandGroup heading={copy.acoes}>
						<CommandItem
							onSelect={() =>
								setTheme(resolvedTheme === "dark" ? "light" : "dark")
							}
						>
							{resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
							{copy.alternarTema}
						</CommandItem>
						{podeResetar && (
							<CommandItem onSelect={resetar}>
								<RotateCcwIcon />
								{copy.resetar}
							</CommandItem>
						)}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
