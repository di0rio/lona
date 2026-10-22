"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/generated";
import { localePath, stripLocale } from "@/i18n/path";
import { cn } from "@/lib/utils";

const languages: Locale[] = ["pt", "en"];

/** pt/en como links de verdade: cada idioma é uma URL. Só é montado com NEXT_PUBLIC_SHOW_EN ligada. */
export function LocaleSwitch({
	label,
	locale,
}: {
	label: string;
	locale: Locale;
}) {
	const pathname = stripLocale(usePathname());

	return (
		<nav
			aria-label={label}
			className="flex rounded-lg border p-0.5 font-mono text-sm"
		>
			{languages.map((language) => (
				<Link
					prefetch={false}
					aria-current={language === locale ? "page" : undefined}
					className={cn(
						"rounded-md px-2 py-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
						language === locale && "bg-accent text-foreground",
					)}
					href={localePath(language, pathname)}
					hrefLang={language}
					key={language}
					lang={language}
				>
					{language}
				</Link>
			))}
		</nav>
	);
}
