import { getT } from "@/i18n/server";

export default async function Home() {
	const { t } = await getT();

	return (
		<section className="flex flex-col gap-4">
			<h1 className="font-semibold text-4xl tracking-tight">
				{t.app.meta.title}
			</h1>
			<p className="max-w-prose text-lg text-muted-foreground">
				{t.app.meta.description}
			</p>
		</section>
	);
}
