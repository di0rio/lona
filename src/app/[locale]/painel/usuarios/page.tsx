import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { listUsers, sessionUser } from "@/modules/access";
import { UsersManager } from "./users-manager";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.usuarios.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Usuarios() {
	const { t } = await getT();
	const copy = t.app.painel.usuarios;
	const user = await sessionUser();
	const view = user ? await listUsers(user.id) : null;
	if (!view) return null;

	return <UsersManager copy={copy} view={view} />;
}
