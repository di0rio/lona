"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { startDemo as startDemoRequest } from "@/lib/demo-client";

type Copy = {
	title: string;
	description: string;
	name: string;
	email: string;
	password: string;
	passwordHint: string;
	submit: string;
	submitting: string;
	alreadyExists: string;
	error: string;
	rateLimited: string;
	demoFull: string;
	alreadyRegistered: string;
	signIn: string;
};

export function RegisterForm({
	copy,
	dashboardHref,
	signInHref,
	startDemo,
}: {
	copy: Copy;
	dashboardHref: string;
	signInHref: string;
	startDemo: boolean;
}) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setSubmitting(true);
		const data = new FormData(event.currentTarget);
		const { error: signUpError } = await authClient.signUp.email({
			name: String(data.get("name")),
			email: String(data.get("email")),
			password: String(data.get("password")),
		});
		if (signUpError) {
			if (signUpError.status === 429) setError(copy.rateLimited);
			else
				setError(
					signUpError.code?.startsWith("USER_ALREADY_EXISTS")
						? copy.alreadyExists
						: copy.error,
				);
			setSubmitting(false);
			return;
		}
		// Quem se cadastra também recebe uma demonstração de 2 horas.
		if (startDemo && (await startDemoRequest()) === "full") {
			// A conta já existe; só a demonstração ficou para depois.
			setError(copy.demoFull);
			setSubmitting(false);
			return;
		}
		router.push(dashboardHref);
		router.refresh();
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">
					{copy.title}
				</CardTitle>
				<CardDescription>{copy.description}</CardDescription>
			</CardHeader>
			<form onSubmit={submit}>
				<CardContent className="flex flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<label className="font-medium text-sm" htmlFor="name">
							{copy.name}
						</label>
						<Input
							autoComplete="name"
							id="name"
							name="name"
							required
							type="text"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="font-medium text-sm" htmlFor="email">
							{copy.email}
						</label>
						<Input
							autoComplete="email"
							id="email"
							name="email"
							required
							type="email"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<label className="font-medium text-sm" htmlFor="password">
							{copy.password}
						</label>
						<Input
							aria-describedby="password-hint"
							autoComplete="new-password"
							id="password"
							minLength={8}
							name="password"
							required
							type="password"
						/>
						<p className="text-muted-foreground text-xs" id="password-hint">
							{copy.passwordHint}
						</p>
					</div>
					{error && (
						<p className="text-destructive text-sm" role="alert">
							{error}
						</p>
					)}
				</CardContent>
				<CardFooter className="mt-4 flex-col items-stretch gap-3 border-t">
					<Button disabled={submitting} type="submit">
						{submitting ? copy.submitting : copy.submit}
					</Button>
					<p className="text-center text-muted-foreground text-sm">
						{copy.alreadyRegistered}{" "}
						<Link className="underline" href={signInHref}>
							{copy.signIn}
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
