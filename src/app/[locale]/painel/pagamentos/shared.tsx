import type { ReactNode } from "react";
import type { translations } from "@/i18n/generated";

// As traduções são literais por idioma; a tela aceita o texto de qualquer um.
type Texts<T> = T extends string ? string : { [K in keyof T]: Texts<T[K]> };
export type Copy = Texts<
	(typeof translations)["pt"]["app"]["painel"]["pagamentos"]
>;

/** Campo de formulário: rótulo, controle e erro embaixo (padrão do cargos). */
export function Field({
	id,
	label,
	error,
	help,
	children,
}: {
	id: string;
	label: string;
	error?: string;
	help?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="font-medium" htmlFor={id}>
				{label}
			</label>
			{children}
			{help && <p className="text-muted-foreground text-xs">{help}</p>}
			{error && (
				<p className="text-destructive text-sm" id={`${id}-error`}>
					{error}
				</p>
			)}
		</div>
	);
}

export const selectClass =
	"h-9 rounded-md border border-input bg-transparent px-3 text-sm";

/** Mensagem do servidor (409 e 422 trazem `message`); qualquer outra falha cai no texto genérico. */
export function failure(error: { value: unknown }, fallback: string) {
	const { value } = error;
	if (
		typeof value === "object" &&
		value !== null &&
		"message" in value &&
		typeof value.message === "string"
	) {
		return value.message;
	}
	return fallback;
}

/** "2.79" -> "2,79" */
export const pctText = (pct: string) => pct.replace(".", ",");

/** "2026-03-01" -> "01/03/2026", sem passar por Date para não mexer com fuso. */
export function dateText(date: string) {
	const [year, month, day] = date.split("-");
	return `${day}/${month}/${year}`;
}
