"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { comecarDemonstracao } from "@/lib/demonstracao-client";

export function ComecarOutra({
	copy,
}: {
	copy: { botao: string; iniciando: string; erro: string };
}) {
	const router = useRouter();
	const [ocupado, setOcupado] = useState(false);
	const [erro, setErro] = useState(false);

	async function comecar() {
		setErro(false);
		setOcupado(true);
		const ok = await comecarDemonstracao();
		setOcupado(false);
		if (!ok) {
			setErro(true);
			return;
		}
		router.refresh();
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={ocupado} onClick={comecar}>
				{ocupado ? copy.iniciando : copy.botao}
			</Button>
			{erro && (
				<p className="text-destructive text-sm" role="alert">
					{copy.erro}
				</p>
			)}
		</div>
	);
}
