import Link from "next/link";
import { AuthShowcase } from "@/components/site-shell/auth-showcase";
import { LocaleSwitch } from "@/components/site-shell/locale-switch";
import { LonaMark } from "@/components/site-shell/lona-mark";
import { ThemeSwitch } from "@/components/site-shell/theme-switch";
import { getT, showEnglish } from "@/i18n/server";

/**
 * Entrar, cadastrar e convite em tela inteira: o formulário à esquerda e a vitrine à direita (some no celular).
 * O Card do formulário perde anel e fundo aqui, porque a própria tela já faz esse papel.
 */
export default async function AuthLayout({
	children,
}: LayoutProps<"/[locale]">) {
	const { locale, t } = await getT();
	const shell = t.components["site-shell"];

	return (
		<div className="grid min-h-svh md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
			<div className="flex flex-col bg-background px-6 py-6 md:px-12">
				<header className="flex items-center justify-between">
					<Link
						className="flex items-center gap-2.5 font-[650] text-[17px] lowercase tracking-[-0.03em]"
						href="/"
					>
						<LonaMark />
						{t.app.meta.title}
					</Link>
					<div className="flex items-center gap-2">
						{showEnglish && (
							<LocaleSwitch label={shell.language.label} locale={locale} />
						)}
						<ThemeSwitch label={shell.theme.toggle} />
					</div>
				</header>
				<main
					className="flex flex-1 items-center justify-center py-10 outline-none [&_[data-slot=card-footer]]:border-t-0 [&_[data-slot=card-footer]]:bg-transparent [&_[data-slot=card]]:bg-transparent [&_[data-slot=card]]:ring-0"
					id="conteudo"
					tabIndex={-1}
				>
					{children}
				</main>
			</div>
			<AuthShowcase />
		</div>
	);
}
