import { headers } from "next/headers";
import { auth } from "./auth";

/** O usuário da sessão do pedido atual (Server Components e Server Actions), ou null. */
export async function sessionUser() {
	const current = await auth.api.getSession({ headers: await headers() });
	if (!current) return null;
	return {
		id: current.user.id,
		name: current.user.name,
		anonymous: current.user.isAnonymous === true,
		/** Está "vendo como" uma pessoa fictícia (a sessão foi aberta pelo dono da demonstração). */
		viewingAs: Boolean(current.session.impersonatedBy),
	};
}
