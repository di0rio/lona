import type { Metadata } from "next";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.cadastrar.title };
}

export default async function Cadastrar() {
	const { t, locale } = await getT();

	return (
		<RegisterForm
			copy={t.app.cadastrar}
			dashboardHref={localePath(locale, "/painel")}
			signInHref={localePath(locale, "/entrar")}
		/>
	);
}
