"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type StartFailure, startDemo } from "@/lib/demo-client";

export function StartAnother({
	copy,
}: {
	copy: {
		button: string;
		starting: string;
		error: string;
		rateLimited: string;
		full: string;
	};
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<StartFailure | null>(null);

	async function start() {
		setError(null);
		setBusy(true);
		const result = await startDemo();
		setBusy(false);
		if (result !== "ok") {
			setError(result);
			return;
		}
		router.refresh();
	}

	const errorText: Record<StartFailure, string> = {
		"rate-limited": copy.rateLimited,
		full: copy.full,
		error: copy.error,
	};

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={busy} onClick={start}>
				{busy ? copy.starting : copy.button}
			</Button>
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{errorText[error]}
				</p>
			)}
		</div>
	);
}
