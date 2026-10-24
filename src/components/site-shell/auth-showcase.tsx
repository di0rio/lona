import { getT } from "@/i18n/server";
import { InitialsAvatar } from "./initials-avatar";

const bars = [40, 55, 48, 70, 62, 90];

/**
 * Vitrine das telas de entrar, cadastrar e convite: lona ao fundo, tracejado da estrada e três cards
 * flutuantes com dados fictícios da demonstração. Puramente decorativa (aria-hidden) e some no celular.
 */
export async function AuthShowcase() {
	const { t } = await getT();
	const copy = t.app.showcase;

	return (
		<div
			aria-hidden="true"
			className="relative hidden flex-col justify-center overflow-hidden bg-canvas p-12 md:sticky md:top-0 md:flex md:h-svh md:self-start"
		>
			<div className="absolute inset-0 bg-tarp" />
			<div className="road-dash absolute inset-x-0 top-[46%] -rotate-[8deg]" />
			<div className="relative h-[340px]">
				<div className="absolute top-0 left-[4%] w-[62%] -rotate-[2.5deg] rounded-2xl bg-background p-4 shadow-float">
					<small className="text-muted-foreground text-xs">
						{copy.revenue}
					</small>
					<b className="mt-1 block font-semibold text-[26px] tabular-nums tracking-[-0.03em]">
						{copy.revenueValue}
					</b>
					<span className="mt-1.5 inline-flex rounded-full bg-[oklch(0.62_0.14_150/12%)] px-2 py-0.5 font-medium text-[oklch(0.52_0.14_150)] text-xs dark:text-[oklch(0.78_0.14_150)]">
						{copy.trend}
					</span>
					<div className="mt-3 flex h-14 items-end gap-[5px]">
						{bars.map((height, i) => (
							<i
								className="origin-bottom flex-1 animate-[bar-grow_700ms_var(--ease-out)_backwards] rounded-t-[4px] rounded-b-[2px] bg-accent-soft last:bg-primary motion-reduce:animate-none"
								key={height}
								style={{
									height: `${height}%`,
									animationDelay: `${60 + i * 40}ms`,
								}}
							/>
						))}
					</div>
				</div>
				<div className="absolute top-[110px] right-[2%] w-[52%] rotate-2 rounded-2xl bg-background p-4 shadow-float">
					<small className="text-muted-foreground text-xs">{copy.orders}</small>
					<b className="mt-1 block font-semibold text-[26px] tabular-nums tracking-[-0.03em]">
						7
					</b>
					<span className="text-[12.5px] text-muted-foreground">
						{copy.ordersNote}
					</span>
				</div>
				<div className="absolute bottom-0 left-[14%] w-[58%] -rotate-1 rounded-2xl bg-background p-4 shadow-float">
					<div className="flex items-center gap-3">
						<InitialsAvatar name={copy.saleName} />
						<div>
							<div className="font-medium">{copy.sale}</div>
							<div className="text-[12.5px] text-muted-foreground">
								{copy.saleMeta}
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="relative mt-7 max-w-[46ch]">
				<p className="text-[17px] leading-[1.45] tracking-[-0.01em]">
					{copy.quote}
				</p>
				<small className="mt-2 block text-muted-foreground">
					{copy.quoteSource}
				</small>
			</div>
		</div>
	);
}
