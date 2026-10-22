import type { Metadata } from "next";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { inviteToken } from "../convite/invite-token";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.cadastrar.title };
}

export default async function Cadastrar({
	searchParams,
}: PageProps<"/[locale]/cadastrar">) {
	const { t, locale } = await getT();
	const invite = await inviteToken(searchParams);

	return (
		<RegisterForm
			// Quem veio de um convite não ganha demonstração e volta para o convite depois de cadastrar.
			copy={{
				...t.app.cadastrar,
				description: invite
					? t.app.cadastrar.inviteDescription
					: t.app.cadastrar.description,
			}}
			dashboardHref={localePath(
				locale,
				invite ? `/convite/${invite}` : "/painel",
			)}
			signInHref={localePath(
				locale,
				invite ? `/entrar?convite=${invite}` : "/entrar",
			)}
			startDemo={!invite}
		/>
	);
}
