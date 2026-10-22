import Link from "next/link";
import { Button } from "@/components/ui/button";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";

export default async function NotFound() {
	const { t, locale } = await getT();

	return (
		<section className="flex flex-col items-start gap-4">
			<h1 className="page-title">{t.app.notFound.title}</h1>
			<Button
				nativeButton={false}
				render={<Link href={localePath(locale, "/")} />}
				variant="outline"
			>
				{t.app.notFound.home}
			</Button>
		</section>
	);
}
