import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { sessionUser } from "@/modules/access";
import { paymentsView } from "@/modules/payments";
import { PaymentsManager } from "./payments-manager";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.pagamentos.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Pagamentos() {
	const { t } = await getT();
	const user = await sessionUser();
	const view = user ? await paymentsView(user.id) : null;
	if (!view) return null;

	// "Hoje" no fuso do Brasil decide qual vigência de taxa está valendo.
	const today = new Date().toLocaleDateString("sv-SE", {
		timeZone: "America/Sao_Paulo",
	});

	return (
		<PaymentsManager copy={t.app.painel.pagamentos} today={today} view={view} />
	);
}
