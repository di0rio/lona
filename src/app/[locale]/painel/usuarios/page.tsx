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

	return (
		<section className="flex max-w-4xl flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-semibold text-2xl">{copy.title}</h1>
				<p className="text-muted-foreground">{copy.description}</p>
			</div>
			<UsersManager copy={copy} view={view} />
		</section>
	);
}
