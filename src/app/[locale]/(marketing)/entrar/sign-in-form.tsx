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

type Copy = {
	title: string;
	description: string;
	email: string;
	password: string;
	submit: string;
	submitting: string;
	error: string;
	noAccountYet: string;
	register: string;
};

export function SignInForm({
	copy,
	dashboardHref,
	registerHref,
}: {
	copy: Copy;
	dashboardHref: string;
	registerHref: string;
}) {
	const router = useRouter();
	const [error, setError] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(false);
		setSubmitting(true);
		const data = new FormData(event.currentTarget);
		const { error: signInError } = await authClient.signIn.email({
			email: String(data.get("email")),
			password: String(data.get("password")),
		});
		if (signInError) {
			setError(true);
			setSubmitting(false);
			return;
		}
		router.push(dashboardHref);
		router.refresh();
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-lg">{copy.title}</CardTitle>
				<CardDescription>{copy.description}</CardDescription>
			</CardHeader>
			<form onSubmit={submit}>
				<CardContent className="flex flex-col gap-4">
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
							autoComplete="current-password"
							id="password"
							name="password"
							required
							type="password"
						/>
					</div>
					{error && (
						<p className="text-destructive text-sm" role="alert">
							{copy.error}
						</p>
					)}
				</CardContent>
				<CardFooter className="mt-4 flex-col items-stretch gap-3 border-t">
					<Button disabled={submitting} type="submit">
						{submitting ? copy.submitting : copy.submit}
					</Button>
					<p className="text-center text-muted-foreground text-sm">
						{copy.noAccountYet}{" "}
						<Link className="underline" href={registerHref}>
							{copy.register}
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
