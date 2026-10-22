import { cn } from "cn";

function initialsOf(name: string) {
	const words = name.trim().split(/\s+/);
	const first = words[0]?.[0] ?? "";
	const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
	return (first + last).toUpperCase();
}

/** Avatar de iniciais em --accent-soft. Decorativo: o nome já aparece em texto ao lado. */
export function InitialsAvatar({
	name,
	className,
}: {
	name: string;
	className?: string;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"grid size-[34px] shrink-0 place-items-center rounded-full bg-accent-soft font-semibold text-primary text-xs ring-1 ring-border ring-inset",
				className,
			)}
		>
			{initialsOf(name)}
		</span>
	);
}
