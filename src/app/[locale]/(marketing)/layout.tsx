import Link from "next/link";
import { LocaleSwitch } from "@/components/site-shell/locale-switch";
import { LonaMark } from "@/components/site-shell/lona-mark";
import { ThemeSwitch } from "@/components/site-shell/theme-switch";
import { getT, showEnglish } from "@/i18n/server";

export default async function MarketingLayout({
	children,
}: LayoutProps<"/[locale]">) {
	const { locale, t } = await getT();
	const shell = t.components["site-shell"];

	return (
		<>
			<header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-6">
				<Link
					prefetch={false}
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
				className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-12 outline-none"
				id="conteudo"
				tabIndex={-1}
			>
				{children}
			</main>
		</>
	);
}
