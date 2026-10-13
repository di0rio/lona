"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { comecarDemonstracao } from "@/lib/demonstracao-client";

export function TestarDemonstracao({
	copy,
	painelHref,
}: {
	copy: { testar: string; testando: string; erro: string };
	painelHref: string;
}) {
	const router = useRouter();
	const [ocupado, setOcupado] = useState(false);
	const [erro, setErro] = useState(false);

	async function testar() {
		setErro(false);
		setOcupado(true);
		if (!(await comecarDemonstracao())) {
			setErro(true);
			setOcupado(false);
			return;
		}
		router.push(painelHref);
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button disabled={ocupado} onClick={testar} size="lg">
				{ocupado ? copy.testando : copy.testar}
			</Button>
			{erro && (
				<p className="text-destructive text-sm" role="alert">
					{copy.erro}
				</p>
			)}
		</div>
	);
}
