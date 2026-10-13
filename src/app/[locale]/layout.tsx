import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "../globals.css";
import { ThemeProvider } from "@/components/site-shell/theme-provider";
import { getT, locales } from "@/i18n/server";
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
			lang={locale === "pt" ? "pt-BR" : locale}
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
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
