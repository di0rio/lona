"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

const WARNING_AT_MS = 10 * 60 * 1000;

function format(ms: number) {
	const total = Math.ceil(ms / 1000);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;
	return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Faixa fina com a contagem regressiva, logo abaixo do cabeçalho. Ao zerar, pede a página de novo: o servidor já não encontra a empresa. */
export function Countdown({
	expiresAt,
	copy,
	action,
}: {
	expiresAt: number;
	copy: { label: string; warning: string };
	/** Ação da faixa da demonstração (hoje, o botão de resetar), ao lado do contador. */
	action?: ReactNode;
}) {
	const router = useRouter();
	// Só depois de montar: o relógio do navegador não existe no HTML do servidor.
	const [remaining, setRemaining] = useState<number | null>(null);
	const lastAttempt = useRef(0);

	useEffect(() => {
		const tick = () => {
			const left = Math.max(0, expiresAt - Date.now());
			setRemaining(left);
			// Se o relógio do navegador adiantar, o servidor ainda pode ter a empresa: tenta de novo a cada 5 s.
			if (left === 0 && Date.now() - lastAttempt.current > 5000) {
				lastAttempt.current = Date.now();
				router.refresh();
			}
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [expiresAt, router]);

	const close = remaining !== null && remaining <= WARNING_AT_MS;

	return (
		<div
			className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b bg-canvas px-4 py-1 md:px-6"
			data-tour="countdown"
		>
			<p className="flex shrink-0 items-baseline gap-2 text-[13px]">
				<span className="text-muted-foreground">{copy.label}</span>
				<span
					className={`font-mono font-semibold tabular-nums ${close ? "text-destructive" : ""}`}
				>
					{remaining === null ? "-:--:--" : format(remaining)}
				</span>
			</p>
			{action}
			{close && (
				<p className="basis-full text-destructive text-[13px]" role="status">
					{copy.warning}
				</p>
			)}
		</div>
	);
}
