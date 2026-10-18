import { toNextJsHandler } from "better-auth/next-js";
import { isBot } from "@/lib/bot";
import { auth } from "@/modules/access";

const handler = toNextJsHandler(auth);

// Rotas que criam visitante ou conta: são as que um robô usaria para encher o banco.
const protectedPaths = [
	"/api/auth/sign-in/anonymous",
	"/api/auth/sign-up/email",
];

export const { GET } = handler;

export async function POST(request: Request) {
	if (
		protectedPaths.includes(new URL(request.url).pathname) &&
		(await isBot())
	) {
		return Response.json({ message: "Acesso negado." }, { status: 403 });
	}
	return handler.POST(request);
}
