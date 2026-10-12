import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { session } from "@/modules/access";
import { deleteExpiredDemos, resetDemo, startDemo } from "./service";

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
	.post(
		"/demo/start",
		async ({ userId }) => ({
			companyId: await startDemo(userId),
		}),
		{ session: true },
	)
	.post(
		"/demo/reset",
		async ({ userId, status }) => {
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
