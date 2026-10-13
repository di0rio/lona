import type { Metadata } from "next";
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
			<h1 className="font-semibold text-2xl">{copy.title}</h1>
			<dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2">
				<dt className="text-muted-foreground">{copy.company}</dt>
				<dd>{summary.company.name}</dd>
				<dt className="text-muted-foreground">{copy.branch}</dt>
				<dd>{summary.branch.name}</dd>
				<dt className="text-muted-foreground">{copy.role}</dt>
				<dd>
					{summary.role} ({copy.level[summary.level]})
				</dd>
			</dl>
		</section>
	);
}
