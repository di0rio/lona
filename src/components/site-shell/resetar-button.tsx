"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ResetarButton({
	copy,
}: {
	copy: { botao: string; resetando: string; erro: string };
}) {
	const router = useRouter();
	const [ocupado, setOcupado] = useState(false);
	const [erro, setErro] = useState(false);

	async function resetar() {
		setErro(false);
		setOcupado(true);
		const { error } = await api().demonstracao.resetar.post();
		setOcupado(false);
		if (error) {
			setErro(true);
			return;
		}
		router.refresh();
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={ocupado} onClick={resetar} variant="outline">
				{ocupado ? copy.resetando : copy.botao}
			</Button>
			{erro && (
				<p className="text-destructive text-sm" role="alert">
					{copy.erro}
				</p>
			)}
		</div>
	);
}
