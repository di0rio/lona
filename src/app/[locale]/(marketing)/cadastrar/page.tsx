import type { Metadata } from "next";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { CadastrarForm } from "./cadastrar-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.cadastrar.title };
}

export default async function Cadastrar() {
	const { t, locale } = await getT();

	return (
		<CadastrarForm
			copy={t.app.cadastrar}
			entrarHref={localePath(locale, "/entrar")}
			painelHref={localePath(locale, "/painel")}
		/>
	);
}
