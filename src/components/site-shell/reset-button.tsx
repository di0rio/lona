"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ResetButton({
	copy,
}: {
	copy: { button: string; resetting: string; error: string };
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);

	async function reset() {
		setError(false);
		setBusy(true);
		const { error: resetError } = await api().demo.reset.post();
		setBusy(false);
		if (resetError) {
			setError(true);
			return;
		}
		router.refresh();
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={busy} onClick={reset} size="sm" variant="outline">
				{busy ? copy.resetting : copy.button}
			</Button>
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{copy.error}
				</p>
			)}
		</div>
	);
}
