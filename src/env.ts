// O que o app precisa pra rodar em produção. DATABASE_URL e DATABASE_URL_UNPOOLED ficam de fora: só os
// scripts de banco usam (migração, seed, db:app-role), o app conecta como lona_app.
const requiredInProduction = [
	"DATABASE_URL_APP",
	"BETTER_AUTH_SECRET",
	"BETTER_AUTH_URL",
	"CRON_SECRET",
] as const;

/**
 * Chamada no next.config.ts: na Vercel, faltar variável derruba o build e o deploy anterior continua no ar,
 * em vez de subir um app que só quebra na primeira requisição. Fora da produção (dev, CI, preview) não checa.
 */
export function assertProductionEnv(env: Record<string, string | undefined>) {
	if (env.VERCEL_ENV !== "production") return;
	const missing = requiredInProduction.filter((name) => !env[name]);
	if (missing.length > 0)
		throw new Error(
			`Faltam variáveis de ambiente na produção: ${missing.join(", ")}. Veja docs/deploy.md.`,
		);
}
