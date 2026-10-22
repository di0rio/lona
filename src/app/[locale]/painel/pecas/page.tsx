import type { Metadata } from "next";
import { EmptyState } from "@/components/site-shell/empty-state";
import { getT } from "@/i18n/server";
import { PermissionDeniedError, sessionUser } from "@/modules/access";
import { listParts } from "@/modules/inventory";
import { PartsManager } from "./parts-manager";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.pecas.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Pecas({
	searchParams,
}: PageProps<"/[locale]/painel/pecas">) {
	const { t } = await getT();
	const copy = t.app.painel.pecas;
	const user = await sessionUser();
	if (!user) return null;

	const { q } = await searchParams;
	const query = (typeof q === "string" ? q : "").trim();
	let view: Awaited<ReturnType<typeof listParts>>;
	try {
		view = await listParts(user.id, query || undefined);
	} catch (error) {
		if (!(error instanceof PermissionDeniedError)) throw error;
		return <EmptyState text={copy.noAccess.text} title={copy.noAccess.title} />;
	}
	if (!view) return null;

	return (
		<PartsManager
			canManage={view.canManage}
			copy={copy}
			limited={view.limited}
			parts={view.parts}
			query={query}
		/>
	);
}
