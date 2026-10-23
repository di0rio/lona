import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/site-shell/empty-state";
import { getT } from "@/i18n/server";
import { PermissionDeniedError, sessionUser } from "@/modules/access";
import { customerDetail } from "@/modules/customers";
import { CustomerDetailView } from "./customer-detail";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.clientes.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Cliente({
	params,
}: PageProps<"/[locale]/painel/clientes/[id]">) {
	const { t, locale } = await getT();
	const copy = t.app.painel.clientes;
	const user = await sessionUser();
	const { id } = await params;
	if (!user) return null;

	const detail = await customerDetail(user.id, id).catch((error) => {
		if (error instanceof PermissionDeniedError) return "denied" as const;
		throw error;
	});
	if (detail === "denied") {
		return <EmptyState text={copy.noAccess.text} title={copy.noAccess.title} />;
	}
	if (!detail) notFound();

	return <CustomerDetailView copy={copy} detail={detail} locale={locale} />;
}
