/**
 * O token que veio na query de /entrar e /cadastrar (`?convite=`), para voltar ao convite depois. Só o formato do
 * token (base64url) é aceito, então a query nunca vira um endereço qualquer (open redirect).
 */
export async function inviteToken(
	searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
	const { convite } = await searchParams;
	return typeof convite === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(convite)
		? convite
		: null;
}
