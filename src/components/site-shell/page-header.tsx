import type { ReactNode } from "react";

/** Cabeçalho de página (DESIGN.md): título e apoio à esquerda, ação principal à direita na mesma linha. */
export function PageHeader({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
			<div className="flex flex-col gap-1">
				<h1 className="page-title">{title}</h1>
				{description && (
					<p className="text-muted-foreground text-sm">{description}</p>
				)}
			</div>
			{action}
		</div>
	);
}
