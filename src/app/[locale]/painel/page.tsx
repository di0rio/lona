import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { resumoDoPainel, usuarioDaSessao } from "@/modules/acesso";
import { ComecarOutra } from "./comecar-outra";
import { Contador } from "./contador";
import { ResetarButton } from "./resetar-button";
import { SairButton } from "./sair-button";

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return { title: t.app.painel.title };
}

// Tela provisória: mostra o essencial da empresa. O visual de verdade vem na etapa 1b.
export default async function Painel() {
	const { t, locale } = await getT();
	const copy = t.app.painel;
	const usuario = await usuarioDaSessao();
	if (!usuario) redirect(localePath(locale, "/entrar"));

	const resumo = await resumoDoPainel(usuario.id);

	if (!resumo) {
		return (
			<section className="flex flex-col items-start gap-4">
				<h1 className="font-semibold text-2xl">{copy.encerrada.title}</h1>
				<p className="max-w-prose text-muted-foreground">
					{copy.encerrada.texto}
				</p>
				<ComecarOutra copy={copy.encerrada} />
			</section>
		);
	}

	const expiraEm = resumo.empresa.expiraEm
		? new Date(resumo.empresa.expiraEm).getTime()
		: null;

	return (
		<section className="flex flex-col gap-6">
			{expiraEm && <Contador copy={copy.contador} expiraEm={expiraEm} />}
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
			<div className="flex flex-wrap gap-3">
				{expiraEm && <ResetarButton copy={copy.resetar} />}
				<SairButton label={copy.sair} redirectTo={localePath(locale, "/")} />
			</div>
		</section>
	);
}
