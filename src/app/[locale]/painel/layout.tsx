import { redirect } from "next/navigation";
import { AppShell } from "@/components/site-shell/app-shell";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { resumoDoPainel, usuarioDaSessao } from "@/modules/acesso";

export default async function PainelLayout({
	children,
}: LayoutProps<"/[locale]/painel">) {
	const { t, locale } = await getT();
	const usuario = await usuarioDaSessao();
	if (!usuario) redirect(localePath(locale, "/entrar"));

	const resumo = await resumoDoPainel(usuario.id);
	const shell = t.components["site-shell"];

	return (
		<AppShell
			copy={shell}
			locale={locale}
			painelTitulo={t.app.painel.title}
			resumo={resumo}
			sairPara={localePath(locale, "/")}
			usuarioNome={usuario.nome}
		>
			<main className="outline-none" id="conteudo" tabIndex={-1}>
				{children}
			</main>
		</AppShell>
	);
}
