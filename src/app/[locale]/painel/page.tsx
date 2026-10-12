import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { resumoDoPainel, usuarioDaSessao } from "@/modules/acesso";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.title };
}

// A casca (src/app/[locale]/painel/layout.tsx) já trata sessão ausente e demonstração vencida.
export default async function Painel() {
	const { t } = await getT();
	const copy = t.app.painel;
	const usuario = await usuarioDaSessao();
	// A casca já redirecionou/mostrou a tela de demonstração vencida; aqui a sessão e a empresa existem.
	const resumo = usuario ? await resumoDoPainel(usuario.id) : null;
	if (!resumo) return null;

	return (
		<section className="flex flex-col gap-6">
			<h1 className="font-semibold text-2xl">{copy.title}</h1>
			<dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2">
				<dt className="text-muted-foreground">{copy.empresa}</dt>
				<dd>{resumo.empresa.nome}</dd>
				<dt className="text-muted-foreground">{copy.filial}</dt>
				<dd>{resumo.filial.nome}</dd>
				<dt className="text-muted-foreground">{copy.cargo}</dt>
				<dd>
					{resumo.cargo} ({copy.nivel[resumo.nivel]})
				</dd>
			</dl>
		</section>
	);
}
