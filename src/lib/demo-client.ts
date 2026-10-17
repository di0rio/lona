import { api } from "./api";
import { authClient } from "./auth-client";

export type StartFailure = "rate-limited" | "full" | "error";

/** Garante um usuário na sessão (visitante anônimo, se ninguém entrou) e pede a demonstração. */
export async function startDemo(): Promise<"ok" | StartFailure> {
	const session = await authClient.getSession();
	if (!session.data) {
		const { error } = await authClient.signIn.anonymous();
		if (error) return error.status === 429 ? "rate-limited" : "error";
	}
	const { error } = await api().demo.start.post();
	if (!error) return "ok";
	return error.status === 503 ? "full" : "error";
}
