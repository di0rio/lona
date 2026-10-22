import type { Metadata } from "next";
import { PageHeader } from "@/components/site-shell/page-header";
import { getT } from "@/i18n/server";
import { dashboardSummary, sessionUser } from "@/modules/access";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Painel() {
	const { t } = await getT();
	const copy = t.app.painel;
	const user = await sessionUser();
	// A casca já redirecionou/mostrou a tela de demonstração vencida; aqui a sessão e a empresa existem.
	const summary = user ? await dashboardSummary(user.id) : null;
	if (!summary) return null;

	return (
		<section className="flex flex-col gap-6">
			<PageHeader title={copy.title} />
			<dl className="grid gap-3 sm:grid-cols-3">
				<div className="rounded-2xl bg-canvas px-4 py-3.5">
					<dt className="text-[12.5px] text-muted-foreground">
						{copy.company}
					</dt>
					<dd className="mt-1 font-semibold text-2xl leading-[1.1] tracking-[-0.03em]">
						{summary.company.name}
					</dd>
				</div>
				<div className="rounded-2xl bg-canvas px-4 py-3.5">
					<dt className="text-[12.5px] text-muted-foreground">{copy.branch}</dt>
					<dd className="mt-1 font-semibold text-2xl leading-[1.1] tracking-[-0.03em]">
						{summary.branch.name}
					</dd>
				</div>
				<div className="rounded-2xl bg-canvas px-4 py-3.5">
					<dt className="text-[12.5px] text-muted-foreground">{copy.role}</dt>
					<dd className="mt-1 font-semibold text-2xl leading-[1.1] tracking-[-0.03em]">
						{summary.role} ({copy.level[summary.level]})
					</dd>
				</div>
			</dl>
		</section>
	);
}
