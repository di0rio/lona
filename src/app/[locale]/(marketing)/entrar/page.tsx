import type { Metadata } from "next";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { EntrarForm } from "./entrar-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.entrar.title };
}

export default async function Entrar() {
	const { t, locale } = await getT();

	return (
		<EntrarForm
			cadastrarHref={localePath(locale, "/cadastrar")}
			copy={t.app.entrar}
			painelHref={localePath(locale, "/painel")}
		/>
	);
}
