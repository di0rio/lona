"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type Copy = {
	accept: string;
	accepting: string;
	error: string;
	invalid: { title: string };
};

export function AcceptButton({
	token,
	dashboardHref,
	copy,
}: {
	token: string;
	dashboardHref: string;
	copy: Copy;
}) {
	const router = useRouter();
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);

	async function accept() {
		setSubmitting(true);
		setError("");
		const { error: failed } = await api().access.invites.accept.post({ token });
		if (failed) {
			setError(
				failed.status === 409
					? failed.value.message
					: failed.status === 404
						? copy.invalid.title
						: copy.error,
			);
			setSubmitting(false);
			return;
		}
		router.push(dashboardHref);
		router.refresh();
	}

	return (
		<div className="flex flex-col gap-3">
			{error && (
				<p className="text-destructive text-sm" role="alert">
					{error}
				</p>
			)}
			<Button disabled={submitting} onClick={accept}>
				{submitting ? copy.accepting : copy.accept}
			</Button>
		</div>
	);
}
