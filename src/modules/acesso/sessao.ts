import { headers } from "next/headers";
import { auth } from "./auth";

/** O usuário da sessão do pedido atual (Server Components e Server Actions), ou null. */
export async function usuarioDaSessao() {
	const atual = await auth.api.getSession({ headers: await headers() });
	if (!atual) return null;
	return {
		id: atual.user.id,
		nome: atual.user.name,
		anonimo: atual.user.isAnonymous === true,
	};
}
