import { redirect } from "next/navigation";
import { AppShell } from "@/components/site-shell/app-shell";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { dashboardSummary, sessionUser } from "@/modules/access";

export default async function PainelLayout({
	children,
}: LayoutProps<"/[locale]/painel">) {
	const { t, locale } = await getT();
	const user = await sessionUser();
	if (!user) redirect(localePath(locale, "/entrar"));

	const summary = await dashboardSummary(user.id);
	const shell = t.components["site-shell"];

	return (
		<AppShell
			copy={shell}
			dashboardTitle={t.app.painel.title}
			locale={locale}
			signOutTo={localePath(locale, "/")}
			summary={summary}
			userName={user.name}
		>
			<main className="outline-none" id="conteudo" tabIndex={-1}>
				{children}
			</main>
		</AppShell>
	);
}
