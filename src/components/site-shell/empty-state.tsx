/** Estado vazio: título que convida e uma linha que explica. Em tela grande leva a lona ao fundo (DESIGN.md). */
export function EmptyState({ title, text }: { title: string; text: string }) {
	return (
		<div className="flex flex-col gap-1 rounded-xl bg-canvas p-6 sm:bg-tarp">
			<p className="font-semibold tracking-tight">{title}</p>
			<p className="text-muted-foreground text-sm">{text}</p>
		</div>
	);
}
