"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { viewAsStop } from "@/lib/view-as-client";

export type ViewAsCopy = {
	prefix: string;
	back: string;
	error: string;
};

/** Botão "Voltar pro dono": restaura a sessão do dono da demonstração. */
export function BackToOwner({ copy }: { copy: ViewAsCopy }) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);

	async function back() {
		setError(false);
		setBusy(true);
		const ok = await viewAsStop();
		setBusy(false);
		if (!ok) {
			setError(true);
			return;
		}
		router.refresh();
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={busy} onClick={back} size="sm" variant="outline">
				{copy.back}
			</Button>
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{copy.error}
				</p>
			)}
		</div>
	);
}

/** Faixa fixa enquanto o dono está "vendo como" outra pessoa da demonstração. */
export function ViewAsBanner({
	name,
	line,
	copy,
}: {
	name: string;
	line: string;
	copy: ViewAsCopy;
}) {
	return (
		<div
			className="flex items-center justify-between gap-3 border-b bg-muted px-4 py-2"
			role="status"
		>
			<p className="text-sm">
				{copy.prefix} <strong>{name}</strong> ({line})
			</p>
			<BackToOwner copy={copy} />
		</div>
	);
}
