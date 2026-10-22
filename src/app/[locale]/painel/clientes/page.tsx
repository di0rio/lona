import type { Metadata } from "next";
import { EmptyState } from "@/components/site-shell/empty-state";
import { getT } from "@/i18n/server";
import { PermissionDeniedError, sessionUser } from "@/modules/access";
import { listCustomers } from "@/modules/customers";
import { CustomersList } from "./customers-list";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.clientes.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Clientes({
	searchParams,
}: PageProps<"/[locale]/painel/clientes">) {
	const { t, locale } = await getT();
	const copy = t.app.painel.clientes;
	const user = await sessionUser();
	const { q } = await searchParams;
	const query = typeof q === "string" ? q.trim().slice(0, 120) : "";
	// Sem customer.view o service lança PermissionDeniedError: vira o estado "sem acesso".
	const view = user
		? await listCustomers(user.id, query).catch((error) => {
				if (error instanceof PermissionDeniedError) return "denied" as const;
				throw error;
			})
		: null;
	if (!view) return null;
	if (view === "denied") {
		return <EmptyState text={copy.noAccess.text} title={copy.noAccess.title} />;
	}

	return (
		<CustomersList copy={copy} locale={locale} query={query} view={view} />
	);
}
