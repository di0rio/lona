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

/** Contagem regressiva fixa no topo. Ao zerar, pede a página de novo: o servidor já não encontra a empresa. */
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
		<div className="sticky top-0 z-10 flex flex-col gap-1 border-b bg-background/95 px-4 py-3 backdrop-blur">
			<div className="flex items-center justify-between gap-3">
				<p className="flex items-baseline gap-2 text-sm">
					<span className="text-muted-foreground">{copy.label}</span>
					<span className="font-mono font-semibold tabular-nums">
						{remaining === null ? "-:--:--" : format(remaining)}
					</span>
				</p>
				{action}
			</div>
			{close && (
				<p
					className="text-destructive text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
					role="status"
				>
					{copy.warning}
				</p>
			)}
		</div>
	);
}
