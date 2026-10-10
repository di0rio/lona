import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
	framework: "nextjs",
	// Mesma região do banco (Neon em us-east-1): a função fica a poucos milissegundos dele.
	regions: ["iad1"],
	// No plano grátis a rotina roda no máximo uma vez por dia; a expiração não depende dela (ADR 0002).
	// A Vercel chama com `Authorization: Bearer <CRON_SECRET>`.
	crons: [{ path: "/api/cron/limpar", schedule: "0 6 * * *" }],
};
