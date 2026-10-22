import { BoxesIcon, ShieldCheckIcon, WrenchIcon } from "lucide-react";
import Link from "next/link";
import { localePath } from "@/i18n/path";
import { getT } from "@/i18n/server";
import { TryDemo } from "./try-demo";

export default async function Home() {
	const { t, locale } = await getT();
	const copy = t.app.home;
	const highlights = [
		{ icon: BoxesIcon, text: copy.highlights.branches },
		{ icon: WrenchIcon, text: copy.highlights.workshop },
		{ icon: ShieldCheckIcon, text: copy.highlights.roles },
	];

	return (
		<section className="flex w-full max-w-md flex-col items-start gap-8">
			<div className="flex flex-col items-start gap-5">
				<span className="inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1 font-medium text-muted-foreground text-xs ring-1 ring-border">
					<span aria-hidden="true" className="road-dash w-4" />
					{copy.eyebrow}
				</span>
				<h1 className="font-semibold text-[56px] leading-[1] tracking-[-0.045em]">
					{t.app.meta.title}
				</h1>
				<p className="text-lg text-muted-foreground leading-relaxed">
					{t.app.meta.description}
				</p>
			</div>
			<div className="flex flex-col items-start gap-2">
				<TryDemo copy={copy} dashboardHref={localePath(locale, "/painel")} />
				<p className="text-muted-foreground text-sm">{copy.tryNote}</p>
			</div>
			<ul className="flex flex-col gap-2.5">
				{highlights.map(({ icon: Icon, text }) => (
					<li className="flex items-center gap-3 text-sm" key={text}>
						<span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-primary">
							<Icon aria-hidden="true" className="size-4" />
						</span>
						{text}
					</li>
				))}
			</ul>
			<p className="text-muted-foreground text-sm">
				{copy.haveAccount}{" "}
				<Link
					className="font-medium text-foreground underline-offset-4 hover:underline"
					href={localePath(locale, "/entrar")}
				>
					{copy.signIn}
				</Link>
				{" · "}
				<Link
					className="font-medium text-foreground underline-offset-4 hover:underline"
					href={localePath(locale, "/cadastrar")}
				>
					{copy.register}
				</Link>
			</p>
		</section>
	);
}
