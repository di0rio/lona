import type { Metadata } from "next";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { inviteToken } from "../convite/invite-token";
import { SignInForm } from "./sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.entrar.title };
}

export default async function Entrar({
	searchParams,
}: PageProps<"/[locale]/entrar">) {
	const { t, locale } = await getT();
	const invite = await inviteToken(searchParams);

	return (
		<SignInForm
			copy={t.app.entrar}
			// Quem veio de um convite volta para ele depois de entrar.
			dashboardHref={localePath(
				locale,
				invite ? `/convite/${invite}` : "/painel",
			)}
			registerHref={localePath(
				locale,
				invite ? `/cadastrar?convite=${invite}` : "/cadastrar",
			)}
		/>
	);
}
