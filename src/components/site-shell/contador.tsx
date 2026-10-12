"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

const AVISO_EM_MS = 10 * 60 * 1000;

function formatar(ms: number) {
	const total = Math.ceil(ms / 1000);
	const horas = Math.floor(total / 3600);
	const minutos = Math.floor((total % 3600) / 60);
	const segundos = total % 60;
	return `${horas}:${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

/** Contagem regressiva fixa no topo. Ao zerar, pede a página de novo: o servidor já não encontra a empresa. */
export function Contador({
	expiraEm,
	copy,
	acao,
}: {
	expiraEm: number;
	copy: { rotulo: string; aviso: string };
	/** Ação da faixa da demonstração (hoje, o botão de resetar), ao lado do contador. */
	acao?: ReactNode;
}) {
	const router = useRouter();
	// Só depois de montar: o relógio do navegador não existe no HTML do servidor.
	const [restante, setRestante] = useState<number | null>(null);
	const ultimaTentativa = useRef(0);

	useEffect(() => {
		const tick = () => {
			const falta = Math.max(0, expiraEm - Date.now());
			setRestante(falta);
			// Se o relógio do navegador adiantar, o servidor ainda pode ter a empresa: tenta de novo a cada 5 s.
			if (falta === 0 && Date.now() - ultimaTentativa.current > 5000) {
				ultimaTentativa.current = Date.now();
				router.refresh();
			}
		};
		tick();
		const id = setInterval(tick, 1000);
		return () => clearInterval(id);
	}, [expiraEm, router]);

	const perto = restante !== null && restante <= AVISO_EM_MS;

	return (
		<div className="sticky top-0 z-10 flex flex-col gap-1 border-b bg-background/95 px-4 py-3 backdrop-blur">
			<div className="flex items-center justify-between gap-3">
				<p className="flex items-baseline gap-2 text-sm">
					<span className="text-muted-foreground">{copy.rotulo}</span>
					<span className="font-mono font-semibold tabular-nums">
						{restante === null ? "-:--:--" : formatar(restante)}
					</span>
				</p>
				{acao}
			</div>
			{perto && (
				<p
					className="text-destructive text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200"
					role="status"
				>
					{copy.aviso}
				</p>
			)}
		</div>
	);
}
