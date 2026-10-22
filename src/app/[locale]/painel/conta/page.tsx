import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/site-shell/page-header";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { sessionUser } from "@/modules/access";
import { SecurityForm } from "./security-form";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.conta.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Conta() {
	const { t, locale } = await getT();
	const copy = t.app.painel.conta;
	const user = await sessionUser();
	if (!user) return null;

	return (
		<section className="flex max-w-3xl flex-col gap-6">
			<PageHeader description={copy.description} title={copy.title} />
			{user.anonymous ? (
				<div className="flex flex-col items-start gap-3">
					<p>{copy.anonymous}</p>
					<Link
						className="font-medium underline"
						href={localePath(locale, "/cadastrar")}
					>
						{copy.createAccount}
					</Link>
				</div>
			) : user.viewingAs ? (
				// Ativar 2FA aqui valeria para a pessoa fictícia, não para o dono: só leitura.
				<p>{copy.viewingAs}</p>
			) : (
				<SecurityForm copy={copy} enabled={user.twoFactorEnabled} />
			)}
		</section>
	);
}
