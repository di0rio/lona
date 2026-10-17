import { checkBotId } from "botid/server";

/**
 * BotID (Vercel). Fora da Vercel (next dev, CI, e2e com next start) não existe o serviço para consultar,
 * então todo mundo conta como humano; na Vercel a checagem é de verdade.
 */
export async function isBot() {
	const verification = await checkBotId({
		developmentOptions: { isDevelopment: !process.env.VERCEL },
	});
	return verification.isBot;
}
