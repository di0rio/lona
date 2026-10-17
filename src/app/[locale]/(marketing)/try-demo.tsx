"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { type StartFailure, startDemo } from "@/lib/demo-client";

export function TryDemo({
	copy,
	dashboardHref,
}: {
	copy: {
		try: string;
		preparing: string;
		error: string;
		rateLimited: string;
		full: string;
	};
	dashboardHref: string;
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<StartFailure | null>(null);

	async function start() {
		setError(null);
		setBusy(true);
		const result = await startDemo();
		if (result !== "ok") {
			setError(result);
			setBusy(false);
			return;
		}
		router.push(dashboardHref);
	}

	const errorText: Record<StartFailure, string> = {
		"rate-limited": copy.rateLimited,
		full: copy.full,
		error: copy.error,
	};

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={busy} onClick={start} size="lg">
				{busy ? copy.preparing : copy.try}
			</Button>
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{errorText[error]}
				</p>
			)}
		</div>
	);
}
