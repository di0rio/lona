import { Elysia } from "elysia";
import { acessoRoutes } from "@/modules/acesso";
import { demonstracaoRoutes } from "@/modules/demonstracao";

// Cada módulo entra como plugin; os caminhos saem de /api/...
export const app = new Elysia({ prefix: "/api" })
	.use(acessoRoutes)
	.use(demonstracaoRoutes);

export type App = typeof app;
