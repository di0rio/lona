import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { listBranches, sessionUser } from "@/modules/access";
import { BranchesManager } from "./branches-manager";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.filiais.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Filiais() {
	const { t, locale } = await getT();
	const copy = t.app.painel.filiais;
	const user = await sessionUser();
	const view = user ? await listBranches(user.id) : null;
	if (!view) return null;

	if (!view.usesBranches) {
		return (
			<section className="flex max-w-xl flex-col items-start gap-4">
				<h1 className="font-semibold text-2xl">{copy.off.title}</h1>
				<p className="text-muted-foreground">{copy.off.text}</p>
				<Link
					className={buttonVariants()}
					href={localePath(locale, "/painel/configuracoes")}
				>
					{copy.off.link}
				</Link>
			</section>
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-6">
			<div className="flex flex-col gap-2">
				<h1 className="font-semibold text-2xl">{copy.title}</h1>
				<p className="text-muted-foreground">{copy.description}</p>
			</div>
			<BranchesManager
				branches={view.branches}
				canConfigure={view.canConfigure}
				cnpjRoot={view.cnpjRoot}
				copy={copy}
			/>
		</section>
	);
}
