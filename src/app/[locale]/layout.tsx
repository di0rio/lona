import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "../globals.css";
import { LocaleSwitch } from "@/components/site-shell/locale-switch";
import { ThemeProvider } from "@/components/site-shell/theme-provider";
import { ThemeSwitch } from "@/components/site-shell/theme-switch";
import { getT, locales, mostrarEn } from "@/i18n/server";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const dynamicParams = false;

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
	const { t } = await getT();
	return {
		title: { default: t.app.meta.title, template: `%s · ${t.app.meta.title}` },
		description: t.app.meta.description,
	};
}

export default async function RootLayout({
	children,
}: LayoutProps<"/[locale]">) {
	const { locale, t } = await getT();
	const shell = t.components["site-shell"];

	return (
		<html
			className={cn("h-full antialiased", geist.variable)}
			lang={locale}
			suppressHydrationWarning
		>
			<body className="flex min-h-full flex-col">
				<ThemeProvider>
					<a
						className="sr-only rounded-md bg-background px-3 py-1.5 text-sm outline-none focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:ring-2 focus:ring-ring"
						href="#conteudo"
					>
						{shell.skip}
					</a>
					<header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-6">
						<Link className="font-semibold text-lg" href="/">
							{t.app.meta.title}
						</Link>
						<div className="flex items-center gap-2">
							{mostrarEn && (
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
				</ThemeProvider>
			</body>
		</html>
	);
}
