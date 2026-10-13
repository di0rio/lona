import Link from "next/link";
import { Button } from "@/components/ui/button";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { TryDemo } from "./try-demo";

export default async function Home() {
	const { t, locale } = await getT();

	return (
		<section className="flex flex-col items-start gap-6">
			<div className="flex flex-col gap-4">
				<h1 className="font-semibold text-4xl tracking-tight">
					{t.app.meta.title}
				</h1>
				<p className="max-w-prose text-lg text-muted-foreground">
					{t.app.meta.description}
				</p>
			</div>
			<TryDemo
				copy={t.app.home}
				dashboardHref={localePath(locale, "/painel")}
			/>
			<div className="flex flex-wrap gap-3">
				<Button
					nativeButton={false}
					render={<Link href={localePath(locale, "/entrar")} />}
					variant="outline"
				>
					{t.app.home.signIn}
				</Button>
				<Button
					nativeButton={false}
					render={<Link href={localePath(locale, "/cadastrar")} />}
					variant="outline"
				>
					{t.app.home.register}
				</Button>
			</div>
		</section>
	);
}
