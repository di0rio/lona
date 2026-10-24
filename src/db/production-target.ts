// Branch main (produção) do projeto Neon little-tree-73660693. O endpoint não é segredo: é o começo do host.
export const PRODUCTION_BRANCH = "main";
const PRODUCTION_ENDPOINT = "ep-mute-scene-b7vm7eiy";

/** Host pooled (ep-x-pooler.região...) ou direto (ep-x.região...): o endpoint é o mesmo. */
function isProduction(url: string | undefined): url is string {
	// canParse antes: o erro do new URL() traria a URL inteira, com a senha, na mensagem.
	if (!url || !URL.canParse(url)) return false;
	const endpoint = new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");
	return endpoint === PRODUCTION_ENDPOINT;
}

const notProduction = (name: string) =>
	new Error(
		`${name} não é da branch ${PRODUCTION_BRANCH} do Neon (${PRODUCTION_ENDPOINT}). Nada foi feito.`,
	);

/**
 * Guarda do db:rebuild-production: recusa sem --confirm ou se alguma URL não for da branch main do Neon.
 * As mensagens nunca mostram a URL.
 */
export function assertProductionTarget(
	env: Record<string, string | undefined>,
	args: string[],
) {
	if (!args.includes("--confirm"))
		throw new Error(
			"Este script apaga o banco de produção. Rode de novo com --confirm.",
		);
	const { DATABASE_URL: pooledUrl, DATABASE_URL_UNPOOLED: ownerUrl } = env;
	if (!isProduction(pooledUrl)) throw notProduction("DATABASE_URL");
	if (!isProduction(ownerUrl)) throw notProduction("DATABASE_URL_UNPOOLED");
	return { pooledUrl, ownerUrl };
}
