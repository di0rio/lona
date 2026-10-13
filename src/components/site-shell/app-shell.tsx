"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Locale } from "@/i18n/generated";
import type { ResumoDoPainel } from "@/modules/acesso";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { ComecarOutra } from "./comecar-outra";
import { CommandMenu } from "./command-menu";
import { Contador } from "./contador";
import { navItens } from "./nav-itens";
import { ResetarButton } from "./resetar-button";

type Copy = {
	buscar: string;
	sidebar: {
		tema: { label: string; claro: string; escuro: string; sistema: string };
		sair: string;
	};
	commandMenu: {
		irPara: string;
		acoes: string;
		alternarTema: string;
		resetar: string;
		vazio: string;
	};
	contador: { rotulo: string; aviso: string };
	resetar: { botao: string; resetando: string; erro: string };
	encerrada: {
		title: string;
		texto: string;
		botao: string;
		iniciando: string;
		erro: string;
	};
};

/**
 * Casca do app logado: sidebar, header com busca e a faixa da demonstração, visíveis em toda página do painel.
 * Sem empresa (demonstração vencida), substitui tudo pela tela de "começar outra".
 */
export function AppShell({
	resumo,
	usuarioNome,
	painelTitulo,
	locale,
	copy,
	sairPara,
	children,
}: {
	resumo: ResumoDoPainel | null;
	usuarioNome: string;
	painelTitulo: string;
	locale: Locale;
	copy: Copy;
	sairPara: string;
	children: ReactNode;
}) {
	const [buscaAberta, setBuscaAberta] = useState(false);

	useEffect(() => {
		function onKeyDown(evento: KeyboardEvent) {
			if (
				evento.key.toLowerCase() === "k" &&
				(evento.metaKey || evento.ctrlKey)
			) {
				evento.preventDefault();
				setBuscaAberta((aberta) => !aberta);
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	if (!resumo) {
		return (
			<div data-cor="cinza">
				<section
					className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-12 outline-none"
					id="conteudo"
					tabIndex={-1}
				>
					<h1 className="font-semibold text-2xl">{copy.encerrada.title}</h1>
					<p className="max-w-prose text-muted-foreground">
						{copy.encerrada.texto}
					</p>
					<ComecarOutra copy={copy.encerrada} />
				</section>
			</div>
		);
	}

	const expiraEm = resumo.empresa.expiraEm
		? new Date(resumo.empresa.expiraEm).getTime()
		: null;
	const itens = navItens({ painel: painelTitulo }, locale);

	return (
		<div data-cor={resumo.empresa.cor}>
			<SidebarProvider>
				<AppSidebar
					copy={copy.sidebar}
					empresaNome={resumo.empresa.nome}
					itens={itens}
					sairPara={sairPara}
					usuario={{
						nome: usuarioNome,
						linha2: `${resumo.cargo} · ${resumo.filial.nome}`,
					}}
				/>
				<SidebarInset>
					<AppHeader
						buscarLabel={copy.buscar}
						onBuscarClick={() => setBuscaAberta(true)}
						titulo={painelTitulo}
					/>
					{expiraEm && (
						<Contador
							acao={<ResetarButton copy={copy.resetar} />}
							copy={copy.contador}
							expiraEm={expiraEm}
						/>
					)}
					<div className="flex flex-1 flex-col gap-6 p-4">{children}</div>
				</SidebarInset>
			</SidebarProvider>
			<CommandMenu
				aberto={buscaAberta}
				copy={copy.commandMenu}
				itens={itens}
				onAbertoChange={setBuscaAberta}
				podeResetar={Boolean(expiraEm)}
			/>
		</div>
	);
}
