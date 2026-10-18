async function post(path: string, body?: unknown) {
	const response = await fetch(`/api/auth/view-as/${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body ?? {}),
	});
	return response.ok;
}

/** O dono da demonstração entra como uma pessoa fictícia dela. Devolve se deu certo. */
export const viewAsStart = (userId: string) => post("start", { userId });

/** Volta pro dono. Devolve se deu certo. */
export const viewAsStop = () => post("stop");
