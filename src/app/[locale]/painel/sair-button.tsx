"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SairButton({
	label,
	redirectTo,
}: {
	label: string;
	redirectTo: string;
}) {
	const router = useRouter();

	return (
		<Button
			onClick={async () => {
				await authClient.signOut();
				router.push(redirectTo);
				router.refresh();
			}}
			variant="outline"
		>
			{label}
		</Button>
	);
}
