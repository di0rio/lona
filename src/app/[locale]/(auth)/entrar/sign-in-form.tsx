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
	rateLimited: string;
	noAccountYet: string;
	register: string;
	totp: {
		title: string;
		description: string;
		label: string;
		useBackup: string;
	};
	backup: {
		title: string;
		description: string;
		label: string;
		useTotp: string;
	};
	codeSubmit: string;
	codeError: string;
};

// Depois de e-mail e senha, quem tem 2FA passa por um segundo passo: código do app ou código de recuperação.
type Step = "password" | "totp" | "backup";

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
	const [step, setStep] = useState<Step>("password");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setSubmitting(true);
		const data = new FormData(event.currentTarget);
		const { data: result, error: signInError } = await authClient.signIn.email({
			email: String(data.get("email")),
			password: String(data.get("password")),
		});
		if (signInError) {
			setError(signInError.status === 429 ? copy.rateLimited : copy.error);
			setSubmitting(false);
			return;
		}
		if (result && "twoFactorRedirect" in result) {
			setStep("totp");
			setSubmitting(false);
			return;
		}
		router.push(dashboardHref);
		router.refresh();
	}

	async function submitCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setSubmitting(true);
		const code = String(new FormData(event.currentTarget).get("code")).trim();
		const { error: codeError } =
			step === "backup"
				? await authClient.twoFactor.verifyBackupCode({ code })
				: await authClient.twoFactor.verifyTotp({ code });
		if (codeError) {
			setError(codeError.status === 429 ? copy.rateLimited : copy.codeError);
			setSubmitting(false);
			return;
		}
		router.push(dashboardHref);
		router.refresh();
	}

	if (step !== "password") {
		const stepCopy = step === "totp" ? copy.totp : copy.backup;
		return (
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-[30px] leading-[1.1] font-semibold tracking-[-0.03em]">
						{stepCopy.title}
					</CardTitle>
					<CardDescription>{stepCopy.description}</CardDescription>
				</CardHeader>
				<form key={step} onSubmit={submitCode}>
					<CardContent className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<label className="font-medium text-sm" htmlFor="code">
								{stepCopy.label}
							</label>
							<Input
								autoComplete="one-time-code"
								autoFocus
								id="code"
								inputMode={step === "totp" ? "numeric" : "text"}
								name="code"
								required
							/>
						</div>
						{error && (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						)}
					</CardContent>
					<CardFooter className="mt-4 flex-col items-stretch gap-3 border-t">
						<Button disabled={submitting} type="submit">
							{copy.codeSubmit}
						</Button>
						<Button
							onClick={() => {
								setError(null);
								setStep(step === "totp" ? "backup" : "totp");
							}}
							type="button"
							variant="link"
						>
							{step === "totp" ? copy.totp.useBackup : copy.backup.useTotp}
						</Button>
					</CardFooter>
				</form>
			</Card>
		);
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
							{error}
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
