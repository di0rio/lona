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
	senha: string;
	enviar: string;
	enviando: string;
	erro: string;
	semCadastro: string;
	cadastrar: string;
};

export function EntrarForm({
	copy,
	painelHref,
	cadastrarHref,
}: {
	copy: Copy;
	painelHref: string;
	cadastrarHref: string;
}) {
	const router = useRouter();
	const [erro, setErro] = useState(false);
	const [enviando, setEnviando] = useState(false);

	async function enviar(evento: FormEvent<HTMLFormElement>) {
		evento.preventDefault();
		setErro(false);
		setEnviando(true);
		const dados = new FormData(evento.currentTarget);
		const { error } = await authClient.signIn.email({
			email: String(dados.get("email")),
			password: String(dados.get("senha")),
		});
		if (error) {
			setErro(true);
			setEnviando(false);
			return;
		}
		router.push(painelHref);
		router.refresh();
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-lg">{copy.title}</CardTitle>
				<CardDescription>{copy.description}</CardDescription>
			</CardHeader>
			<form onSubmit={enviar}>
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
						<label className="font-medium text-sm" htmlFor="senha">
							{copy.senha}
						</label>
						<Input
							autoComplete="current-password"
							id="senha"
							name="senha"
							required
							type="password"
						/>
					</div>
					{erro && (
						<p className="text-destructive text-sm" role="alert">
							{copy.erro}
						</p>
					)}
				</CardContent>
				<CardFooter className="mt-4 flex-col items-stretch gap-3 border-t">
					<Button disabled={enviando} type="submit">
						{enviando ? copy.enviando : copy.enviar}
					</Button>
					<p className="text-center text-muted-foreground text-sm">
						{copy.semCadastro}{" "}
						<Link className="underline" href={cadastrarHref}>
							{copy.cadastrar}
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
