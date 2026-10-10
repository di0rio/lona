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
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

type Copy = {
	title: string;
	description: string;
	nome: string;
	email: string;
	senha: string;
	senhaDica: string;
	enviar: string;
	enviando: string;
	erroExistente: string;
	erro: string;
	jaTemCadastro: string;
	entrar: string;
};

export function CadastrarForm({
	copy,
	painelHref,
	entrarHref,
}: {
	copy: Copy;
	painelHref: string;
	entrarHref: string;
}) {
	const router = useRouter();
	const [erro, setErro] = useState<string | null>(null);
	const [enviando, setEnviando] = useState(false);

	async function enviar(evento: FormEvent<HTMLFormElement>) {
		evento.preventDefault();
		setErro(null);
		setEnviando(true);
		const dados = new FormData(evento.currentTarget);
		const { error } = await authClient.signUp.email({
			name: String(dados.get("nome")),
			email: String(dados.get("email")),
			password: String(dados.get("senha")),
		});
		if (error) {
			setErro(
				error.code?.startsWith("USER_ALREADY_EXISTS")
					? copy.erroExistente
					: copy.erro,
			);
			setEnviando(false);
			return;
		}
		// Quem se cadastra também recebe uma demonstração de 2 horas.
		await api().demonstracao.iniciar.post();
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
						<label className="font-medium text-sm" htmlFor="nome">
							{copy.nome}
						</label>
						<Input
							autoComplete="name"
							id="nome"
							name="nome"
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
						<label className="font-medium text-sm" htmlFor="senha">
							{copy.senha}
						</label>
						<Input
							aria-describedby="senha-dica"
							autoComplete="new-password"
							id="senha"
							minLength={8}
							name="senha"
							required
							type="password"
						/>
						<p className="text-muted-foreground text-xs" id="senha-dica">
							{copy.senhaDica}
						</p>
					</div>
					{erro && (
						<p className="text-destructive text-sm" role="alert">
							{erro}
						</p>
					)}
				</CardContent>
				<CardFooter className="mt-4 flex-col items-stretch gap-3 border-t">
					<Button disabled={enviando} type="submit">
						{enviando ? copy.enviando : copy.enviar}
					</Button>
					<p className="text-center text-muted-foreground text-sm">
						{copy.jaTemCadastro}{" "}
						<Link className="underline" href={entrarHref}>
							{copy.entrar}
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}
