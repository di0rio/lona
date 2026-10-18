"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { encode } from "uqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

type Copy = {
	status: { on: string; off: string };
	password: string;
	passwordHelp: string;
	actions: {
		enable: string;
		disable: string;
		regenerate: string;
		confirm: string;
		cancel: string;
		working: string;
	};
	scan: {
		title: string;
		qrLabel: string;
		keyHelp: string;
		code: string;
		codeHelp: string;
	};
	codes: {
		title: string;
		help: string;
		copy: string;
		copied: string;
		done: string;
	};
	error: string;
};

type Action = "enable" | "disable" | "regenerate";

// Chave, URI e códigos só existem aqui, na memória, entre ligar e o usuário guardar os códigos.
// "confirmed" fica falso até o primeiro código do app ser aceito; só então os códigos de recuperação aparecem.
type Setup = { uri: string; key: string; codes: string[]; confirmed: boolean };

function QrCode({ uri, label }: { uri: string; label: string }) {
	const { data } = encode(uri);
	// Um só <path> com um quadrado por módulo escuro.
	const path = data
		.flatMap((row, y) =>
			row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")),
		)
		.join("");
	return (
		// Fundo branco fixo: o leitor do app precisa de contraste, mesmo no tema escuro.
		<svg
			aria-label={label}
			className="size-48 rounded-md bg-white p-2"
			role="img"
			fill="#000"
			shapeRendering="crispEdges"
			viewBox={`0 0 ${data.length} ${data.length}`}
		>
			<path d={path} />
		</svg>
	);
}

export function SecurityForm({
	enabled,
	copy,
}: {
	enabled: boolean;
	copy: Copy;
}) {
	const router = useRouter();
	const [action, setAction] = useState<Action | null>(null);
	const [setup, setSetup] = useState<Setup | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);

	function reset() {
		setAction(null);
		setSetup(null);
		setFailed(false);
	}

	async function run(work: () => Promise<boolean>) {
		setFailed(false);
		setBusy(true);
		const ok = await work();
		setBusy(false);
		if (!ok) setFailed(true);
	}

	function submitPassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const password = String(new FormData(event.currentTarget).get("password"));
		run(async () => {
			if (action === "enable") {
				const { data } = await authClient.twoFactor.enable({ password });
				if (!data || !("totpURI" in data)) return false;
				setSetup({
					uri: data.totpURI,
					key: new URL(data.totpURI).searchParams.get("secret") ?? "",
					codes: data.backupCodes,
					confirmed: false,
				});
				return true;
			}
			if (action === "regenerate") {
				const { data } = await authClient.twoFactor.generateBackupCodes({
					password,
				});
				if (!data) return false;
				setSetup({
					uri: "",
					key: "",
					codes: data.backupCodes,
					confirmed: true,
				});
				return true;
			}
			const { error } = await authClient.twoFactor.disable({ password });
			if (error) return false;
			reset();
			router.refresh();
			return true;
		});
	}

	function submitCode(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const code = String(new FormData(event.currentTarget).get("code")).trim();
		run(async () => {
			const { error } = await authClient.twoFactor.verifyTotp({ code });
			if (error) return false;
			// A chave e a URI saem da memória assim que o código é aceito.
			setSetup((current) =>
				current ? { ...current, uri: "", key: "", confirmed: true } : current,
			);
			return true;
		});
	}

	async function copyCodes(codes: string[]) {
		try {
			await navigator.clipboard.writeText(codes.join("\n"));
			toast(copy.codes.copied);
		} catch {
			toast(copy.error);
		}
	}

	function done() {
		reset();
		router.refresh();
	}

	const error = failed && (
		<p className="text-destructive text-sm" role="alert">
			{copy.error}
		</p>
	);

	if (setup?.confirmed) {
		return (
			<div className="flex flex-col gap-4">
				<h2 className="font-medium text-lg">{copy.codes.title}</h2>
				<p className="text-muted-foreground text-sm">{copy.codes.help}</p>
				<ul className="grid max-w-sm grid-cols-2 gap-2 font-mono text-sm">
					{setup.codes.map((code) => (
						<li key={code}>{code}</li>
					))}
				</ul>
				<div className="flex gap-2">
					<Button onClick={() => copyCodes(setup.codes)} variant="outline">
						{copy.codes.copy}
					</Button>
					<Button onClick={done}>{copy.codes.done}</Button>
				</div>
			</div>
		);
	}

	if (setup) {
		return (
			<form className="flex max-w-sm flex-col gap-4" onSubmit={submitCode}>
				<h2 className="font-medium text-lg">{copy.scan.title}</h2>
				<QrCode label={copy.scan.qrLabel} uri={setup.uri} />
				<p className="text-sm">
					{copy.scan.keyHelp}{" "}
					<code className="break-all font-mono" data-testid="totp-key">
						{setup.key}
					</code>
				</p>
				<div className="flex flex-col gap-1.5">
					<label className="font-medium text-sm" htmlFor="code">
						{copy.scan.code}
					</label>
					<Input
						autoComplete="one-time-code"
						id="code"
						inputMode="numeric"
						name="code"
						required
					/>
					<p className="text-muted-foreground text-sm">{copy.scan.codeHelp}</p>
				</div>
				{error}
				<div className="flex gap-2">
					<Button disabled={busy} type="submit">
						{busy ? copy.actions.working : copy.actions.confirm}
					</Button>
					<Button onClick={reset} type="button" variant="ghost">
						{copy.actions.cancel}
					</Button>
				</div>
			</form>
		);
	}

	if (action) {
		return (
			<form className="flex max-w-sm flex-col gap-4" onSubmit={submitPassword}>
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
					<p className="text-muted-foreground text-sm">{copy.passwordHelp}</p>
				</div>
				{error}
				<div className="flex gap-2">
					<Button
						disabled={busy}
						type="submit"
						variant={action === "disable" ? "destructive" : "default"}
					>
						{busy ? copy.actions.working : copy.actions.confirm}
					</Button>
					<Button onClick={reset} type="button" variant="ghost">
						{copy.actions.cancel}
					</Button>
				</div>
			</form>
		);
	}

	return (
		<div className="flex flex-col items-start gap-4">
			<p className="font-medium">
				{enabled ? copy.status.on : copy.status.off}
			</p>
			{enabled ? (
				<div className="flex flex-wrap gap-2">
					<Button onClick={() => setAction("regenerate")} variant="outline">
						{copy.actions.regenerate}
					</Button>
					<Button onClick={() => setAction("disable")} variant="destructive">
						{copy.actions.disable}
					</Button>
				</div>
			) : (
				<Button onClick={() => setAction("enable")}>
					{copy.actions.enable}
				</Button>
			)}
		</div>
	);
}
