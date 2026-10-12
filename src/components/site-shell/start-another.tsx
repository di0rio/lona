"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startDemo } from "@/lib/demo-client";

export function StartAnother({
	copy,
}: {
	copy: { button: string; starting: string; error: string };
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);

	async function start() {
		setError(false);
		setBusy(true);
		const ok = await startDemo();
		setBusy(false);
		if (!ok) {
			setError(true);
			return;
		}
		router.refresh();
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={busy} onClick={start}>
				{busy ? copy.starting : copy.button}
			</Button>
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{copy.error}
				</p>
			)}
		</div>
	);
}
