import { initBotId } from "botid/client/core";

// Só na Vercel: fora dela o desafio do BotID não existe e o fetch das rotas protegidas ficaria esperando por ele
// (next.config.ts liga a variável na hora do build). O servidor faz a mesma distinção em src/lib/bot.ts.
if (process.env.NEXT_PUBLIC_BOTID === "on") {
	// Mesmas rotas que o servidor confere com checkBotId.
	initBotId({
		protect: [
			{ path: "/api/auth/sign-in/anonymous", method: "POST" },
			{ path: "/api/auth/sign-up/email", method: "POST" },
			{ path: "/api/demo/start", method: "POST" },
		],
	});
}
