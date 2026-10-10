import { api } from "./api";
import { authClient } from "./auth-client";

/** Garante um usuário na sessão (visitante anônimo, se ninguém entrou) e pede a demonstração. Devolve se deu certo. */
export async function comecarDemonstracao() {
	const sessao = await authClient.getSession();
	if (!sessao.data) {
		const { error } = await authClient.signIn.anonymous();
		if (error) return false;
	}
	const { error } = await api().demonstracao.iniciar.post();
	return !error;
}
