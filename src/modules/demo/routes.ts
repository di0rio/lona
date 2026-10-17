import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { isBot } from "@/lib/bot";
import { session } from "@/modules/access";
import {
	DemoLimitReachedError,
	deleteExpiredDemos,
	resetDemo,
	startDemo,
} from "./service";

// A Vercel chama a rotina agendada com `Authorization: Bearer <CRON_SECRET>`.
function cronAuthorized(authorization: string | undefined) {
	const secret = process.env.CRON_SECRET;
	if (!secret || !authorization) return false;
	const expected = Buffer.from(`Bearer ${secret}`);
	const received = Buffer.from(authorization);
	return (
		expected.length === received.length && timingSafeEqual(expected, received)
	);
}

export const demoRoutes = new Elysia()
	.use(session)
	// Teto de demonstrações vivas atingido (ao iniciar ou ao resetar): 503, e a tela explica.
	.onError(({ error, status }) => {
		if (error instanceof DemoLimitReachedError)
			return status(503, error.message);
	})
	.post(
		"/demo/start",
		async ({ userId, viewingAs, status }) => {
			if (viewingAs) return status(403, "Volte pro dono antes.");
			if (await isBot()) return status(403, "Acesso negado.");
			return { companyId: await startDemo(userId) };
		},
		{ session: true },
	)
	.post(
		"/demo/reset",
		async ({ userId, viewingAs, status }) => {
			// A pessoa fictícia não apaga a demonstração do dono nem ganha uma própria.
			if (viewingAs) return status(403, "Volte pro dono antes.");
			const companyId = await resetDemo(userId);
			return companyId
				? { companyId }
				: status(409, "A empresa atual não é uma demonstração.");
		},
		{ session: true },
	)
	.get("/cron/clean", async ({ headers, status }) => {
		if (!cronAuthorized(headers.authorization)) return status(401, "Negado.");
		return { deleted: await deleteExpiredDemos() };
	});
