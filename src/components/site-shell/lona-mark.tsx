import { cn } from "cn";

/**
 * Marca do Lona: quadrado na cor da empresa com as listras da lona e o tracejado da estrada (DESIGN.md).
 * Só CSS, sem imagem: muda junto com a cor da empresa porque usa --primary.
 */
export function LonaMark({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"relative block size-[30px] shrink-0 overflow-hidden rounded-[9px] bg-primary shadow-[inset_0_1px_0_oklch(1_0_0/25%),0_1px_2px_oklch(0_0_0/20%)] before:absolute before:inset-0 before:bg-[repeating-linear-gradient(90deg,oklch(1_0_0/22%)_0_4px,transparent_4px_8px)] after:absolute after:inset-x-[5px] after:bottom-[6px] after:h-0.5 after:bg-[repeating-linear-gradient(90deg,var(--road)_0_4px,transparent_4px_7px)]",
				className,
			)}
		/>
	);
}
