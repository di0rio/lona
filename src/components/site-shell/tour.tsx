"use client";

import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useIsMac } from "./app-header";
import { type TourStepId, tourSteps } from "./tour-steps";

export type TourCopy = {
	of: string;
	skip: string;
	next: string;
	finish: string;
	restart: string;
	steps: Record<TourStepId, { title: string; text: string }>;
};

const storageKey = (userId: string) => `lona:tour:${userId}`;

/** Abre sozinho na primeira entrada de cada pessoa na demonstração; `start` reabre do começo. */
export function useTour(userId: string, enabled: boolean) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!enabled) return;
		try {
			if (!localStorage.getItem(storageKey(userId))) setOpen(true);
		} catch {
			// Sem armazenamento não dá para lembrar que já viu; melhor não insistir a cada página.
		}
	}, [userId, enabled]);

	const start = useCallback(() => setOpen(true), []);
	const close = useCallback(() => {
		setOpen(false);
		try {
			localStorage.setItem(storageKey(userId), "1");
		} catch {
			// Sem armazenamento: o tour só não fica marcado como visto.
		}
	}, [userId]);

	return { open, start, close };
}

type Placed = {
	card: { top: number; left: number };
	ring: { top: number; left: number; width: number; height: number };
};

const GAP = 12;
const MARGIN = 16;

/** Cartão flutuante que não bloqueia a página: sem fundo escurecido, o resto continua clicável. */
export function Tour({
	copy,
	onClose,
}: {
	copy: TourCopy;
	onClose: () => void;
}) {
	const mac = useIsMac();
	const titleId = useId();
	const cardRef = useRef<HTMLDivElement>(null);
	const [available, setAvailable] = useState<
		{ step: (typeof tourSteps)[number]; element: HTMLElement }[]
	>([]);
	const [index, setIndex] = useState(0);
	const [placed, setPlaced] = useState<Placed | null>(null);

	// Só os passos cujo elemento está na tela agora.
	useLayoutEffect(() => {
		setAvailable(
			tourSteps.flatMap((step) => {
				const element = document.querySelector<HTMLElement>(
					`[data-tour="${step.anchor}"]`,
				);
				return element && element.getClientRects().length > 0
					? [{ step, element }]
					: [];
			}),
		);
	}, []);

	const current = available[index];

	const place = useCallback(() => {
		const card = cardRef.current;
		if (!card || !current) return;
		const rect = current.element.getBoundingClientRect();
		const clamp = (value: number, size: number, viewport: number) =>
			Math.min(Math.max(value, MARGIN), viewport - size - MARGIN);
		const below = current.step.placement === "below";
		let top = below ? rect.bottom + GAP : rect.top;
		// Sem espaço embaixo, vai para cima do elemento.
		if (below && top + card.offsetHeight > innerHeight - MARGIN) {
			top = rect.top - GAP - card.offsetHeight;
		}
		setPlaced({
			card: {
				top: clamp(top, card.offsetHeight, innerHeight),
				left: clamp(
					below ? rect.left : rect.right + GAP,
					card.offsetWidth,
					innerWidth,
				),
			},
			ring: {
				top: rect.top,
				left: rect.left,
				width: rect.width,
				height: rect.height,
			},
		});
	}, [current]);

	useLayoutEffect(place, [place]);

	useEffect(() => {
		addEventListener("resize", place);
		addEventListener("scroll", place, { capture: true, passive: true });
		return () => {
			removeEventListener("resize", place);
			removeEventListener("scroll", place, { capture: true });
		};
	}, [place]);

	// Foco no cartão a cada passo, sem rolar a página.
	// Só depois de posicionado: antes disso o cartão está escondido e não aceita foco.
	const ready = placed !== null;
	useEffect(() => {
		if (current && ready) cardRef.current?.focus({ preventScroll: true });
	}, [current, ready]);

	if (!current) return null;

	const last = index === available.length - 1;
	const text = copy.steps[current.step.id];

	function onKeyDown(event: React.KeyboardEvent) {
		if (event.key === "Escape") onClose();
		else if (event.key === "ArrowRight" && !last) setIndex(index + 1);
		else if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
	}

	return (
		<>
			{placed && (
				<div
					aria-hidden
					className="pointer-events-none fixed z-40 rounded-lg outline-2 outline-offset-2 outline-ring"
					style={placed.ring}
				/>
			)}
			<div
				aria-labelledby={titleId}
				aria-modal="false"
				className="fixed z-40 flex w-80 max-w-[calc(100vw-2rem)] origin-top-left flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground shadow-float outline-none transition-[opacity,scale] duration-150 ease-out starting:scale-[0.96] starting:opacity-0 motion-reduce:starting:scale-100"
				onKeyDown={onKeyDown}
				ref={cardRef}
				role="dialog"
				style={placed?.card ?? { top: 0, left: 0, visibility: "hidden" }}
				tabIndex={-1}
			>
				<div className="flex flex-col gap-1">
					<h2
						className="font-semibold text-[15px] leading-[1.3] tracking-[-0.01em]"
						id={titleId}
					>
						{text.title}
					</h2>
					<p className="text-[13px] text-muted-foreground leading-[1.45]">
						{text.text}
					</p>
					{"shortcut" in current.step && (
						<KbdGroup className="mt-1">
							<Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
							<Kbd>K</Kbd>
						</KbdGroup>
					)}
				</div>
				<div className="flex items-center justify-between gap-2">
					<span className="text-[12.5px] text-muted-foreground tabular-nums">
						{index + 1} {copy.of} {available.length}
					</span>
					<div className="flex gap-2">
						<Button onClick={onClose} size="sm" variant="ghost">
							{copy.skip}
						</Button>
						<Button
							onClick={() => (last ? onClose() : setIndex(index + 1))}
							size="sm"
						>
							{last ? copy.finish : copy.next}
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
