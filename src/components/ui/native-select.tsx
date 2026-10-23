import { cn } from "cn";
import type * as React from "react";

/** Select nativo com a pele do Input: lista curta e fixa (unidade, eixo, UF), sem popover. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
	return (
		<select
			data-slot="native-select"
			className={cn(
				"h-9 w-full min-w-0 rounded-lg border border-border-strong bg-background px-2.5 py-1 text-base shadow-[inset_0_1px_2px_oklch(0_0_0/3%)] transition-[box-shadow,border-color] duration-150 outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-accent-soft disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/20 md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { NativeSelect };
