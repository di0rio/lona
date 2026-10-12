import type { Metadata } from "next";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.entrar.title };
}

export default async function Entrar() {
	const { t, locale } = await getT();

	return (
		<SignInForm
			copy={t.app.entrar}
			dashboardHref={localePath(locale, "/painel")}
			registerHref={localePath(locale, "/cadastrar")}
		/>
	);
}
