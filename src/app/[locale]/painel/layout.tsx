import { redirect } from "next/navigation";
import { AppShell } from "@/components/site-shell/app-shell";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { dashboardSummary, sessionUser, viewAsTargets } from "@/modules/access";

export default async function PainelLayout({
	children,
}: LayoutProps<"/[locale]/painel">) {
	const { t, locale } = await getT();
	const user = await sessionUser();
	if (!user) redirect(localePath(locale, "/entrar"));

	const [summary, targets] = await Promise.all([
		dashboardSummary(user.id),
		// Quem já está "como alguém" não escolhe outra pessoa: volta pro dono primeiro.
		user.viewingAs ? [] : viewAsTargets(user.id),
	]);
	const shell = t.components["site-shell"];

	return (
		<AppShell
			copy={shell}
			dashboardTitle={t.app.painel.title}
			branchesTitle={t.app.painel.filiais.nav}
			rolesTitle={t.app.painel.cargos.nav}
			usersTitle={t.app.painel.usuarios.nav}
			settingsTitle={t.app.painel.configuracoes.nav}
			locale={locale}
			signOutTo={localePath(locale, "/")}
			summary={summary}
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
