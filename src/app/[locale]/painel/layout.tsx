import { redirect } from "next/navigation";
import { AppShell } from "@/components/site-shell/app-shell";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { panelShell, sessionUser } from "@/modules/access";

export default async function PainelLayout({
	children,
}: LayoutProps<"/[locale]/painel">) {
	const { t, locale } = await getT();
	const user = await sessionUser();
	if (!user) redirect(localePath(locale, "/entrar"));

	const { summary, targets } = await panelShell(user.id, user.viewingAs);
	const shell = t.components["site-shell"];

	return (
		<AppShell
			copy={shell}
			dashboardTitle={t.app.painel.title}
			customersTitle={t.app.painel.clientes.nav}
			branchesTitle={t.app.painel.filiais.nav}
			rolesTitle={t.app.painel.cargos.nav}
			usersTitle={t.app.painel.usuarios.nav}
			settingsTitle={t.app.painel.configuracoes.nav}
			locale={locale}
			signOutTo={localePath(locale, "/")}
			summary={summary}
			userId={user.id}
			userName={user.name}
			viewAsTargets={targets}
			viewingAs={user.viewingAs}
		>
			<main className="outline-none" id="conteudo" tabIndex={-1}>
				{children}
			</main>
		</AppShell>
	);
}
