import type { Metadata } from "next";
import { EmptyState } from "@/components/site-shell/empty-state";
import { getT } from "@/i18n/server";
import { PermissionDeniedError, sessionUser } from "@/modules/access";
import { listSuppliers } from "@/modules/purchasing";
import { SuppliersManager } from "./suppliers-manager";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.fornecedores.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Fornecedores() {
	const { t } = await getT();
	const copy = t.app.painel.fornecedores;
	const user = await sessionUser();
	if (!user) return null;

	let view: Awaited<ReturnType<typeof listSuppliers>>;
	try {
		view = await listSuppliers(user.id);
	} catch (error) {
		if (!(error instanceof PermissionDeniedError)) throw error;
		return <EmptyState text={copy.noAccess.text} title={copy.noAccess.title} />;
	}
	if (!view) return null;

	return (
		<SuppliersManager
			canManage={view.canManage}
			copy={copy}
			suppliers={view.suppliers}
		/>
	);
}
