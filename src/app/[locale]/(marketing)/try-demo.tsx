"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { startDemo } from "@/lib/demo-client";

export function TryDemo({
	copy,
	dashboardHref,
}: {
	copy: { try: string; preparing: string; error: string };
	dashboardHref: string;
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(false);

	async function start() {
		setError(false);
		setBusy(true);
		if (!(await startDemo())) {
			setError(true);
			setBusy(false);
			return;
		}
		router.push(dashboardHref);
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={busy} onClick={start} size="lg">
				{busy ? copy.preparing : copy.try}
			</Button>
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{copy.error}
				</p>
			)}
		</div>
	);
}
