import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { usuarioDaSessao } from "@/modules/acesso";
import { SairButton } from "./sair-button";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.title };
}

export default async function Painel() {
	const { t, locale } = await getT();
	const usuario = await usuarioDaSessao();
	if (!usuario) redirect(localePath(locale, "/entrar"));

	return (
		<section className="flex flex-col items-start gap-4">
			<h1 className="font-semibold text-2xl">{t.app.painel.title}</h1>
			<p>{t.app.painel.ola({ nome: usuario.nome })}</p>
			<SairButton
				label={t.app.painel.sair}
				redirectTo={localePath(locale, "/")}
			/>
		</section>
	);
}
