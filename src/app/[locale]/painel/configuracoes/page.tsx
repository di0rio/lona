import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { companySettings, sessionUser } from "@/modules/access";
import { SettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.configuracoes.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Configuracoes() {
	const { t } = await getT();
	const copy = t.app.painel.configuracoes;
	const user = await sessionUser();
	const view = user ? await companySettings(user.id) : null;
	if (!view) return null;

	return (
		<section className="flex max-w-2xl flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-semibold text-2xl">{copy.title}</h1>
				<p className="text-muted-foreground">{copy.description}</p>
			</div>
			<SettingsForm
				canConfigure={view.canConfigure}
				copy={copy}
				initial={view.settings}
			/>
		</section>
	);
}
