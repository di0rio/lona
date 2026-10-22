import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { listRoles, permissions, sessionUser } from "@/modules/access";
import { RolesManager } from "./roles-manager";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.cargos.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Cargos() {
	const { t } = await getT();
	const copy = t.app.painel.cargos;
	const user = await sessionUser();
	const view = user ? await listRoles(user.id) : null;
	if (!view) return null;

	return (
		<RolesManager
			canManage={view.canManage}
			copy={copy}
			permissions={[...permissions]}
			roles={view.roles}
		/>
	);
}
