import {
	BanknoteIcon,
	BoxesIcon,
	LayoutDashboardIcon,
	PackageIcon,
	ReceiptIcon,
	ShieldCheckIcon,
	UsersIcon,
	WrenchIcon,
} from "lucide-react";
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

	const about = copy.about;
	const topics = [
		{ icon: UsersIcon, ...about.registers },
		{ icon: PackageIcon, ...about.stock },
		{ icon: ReceiptIcon, ...about.sales },
		{ icon: WrenchIcon, ...about.orders },
		{ icon: BanknoteIcon, ...about.finance },
		{ icon: LayoutDashboardIcon, ...about.dashboard },
	];

	return (
		<div className="w-full max-w-md">
			{/* A introdução ocupa a primeira tela (descontando cabeçalho e respiros); a seção abaixo fica além da dobra. */}
			<section className="flex min-h-[calc(100svh-9rem)] flex-col items-start justify-center gap-8">
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
						prefetch={false}
						className="font-medium text-foreground underline-offset-4 hover:underline"
						href={localePath(locale, "/entrar")}
					>
						{copy.signIn}
					</Link>
					{" · "}
					<Link
						prefetch={false}
						className="font-medium text-foreground underline-offset-4 hover:underline"
						href={localePath(locale, "/cadastrar")}
					>
						{copy.register}
					</Link>
				</p>
			</section>
			<section
				aria-labelledby="sobre"
				className="flex flex-col gap-6 pt-16 pb-6"
			>
				<div className="flex flex-col gap-1.5">
					<h2
						className="font-semibold text-2xl leading-[1.15] tracking-[-0.025em]"
						id="sobre"
					>
						{about.title}
					</h2>
					<p className="text-muted-foreground">{about.lead}</p>
				</div>
				<ul className="flex flex-col gap-5">
					{topics.map(({ icon: Icon, title, text }) => (
						<li className="flex items-start gap-3" key={title}>
							<span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-primary">
								<Icon aria-hidden="true" className="size-4" />
							</span>
							<div>
								<h3 className="font-semibold text-[15px] leading-[1.3] tracking-[-0.01em]">
									{title}
								</h3>
								<p className="mt-0.5 text-muted-foreground text-sm">{text}</p>
							</div>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
