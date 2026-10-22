import type { ReactNode } from "react";

/** Campo de formulário: rótulo, controle, ajuda e erro embaixo. */
export function Field({
	id,
	label,
	help,
	error,
	children,
}: {
	id: string;
	label: string;
	help?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="font-medium" htmlFor={id}>
				{label}
			</label>
			{children}
			{help && (
				<p className="text-muted-foreground text-xs" id={`${id}-help`}>
					{help}
				</p>
			)}
			{error && (
				<p className="text-destructive text-sm" id={`${id}-error`}>
					{error}
				</p>
			)}
		</div>
	);
}
