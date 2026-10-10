import { Elysia } from "elysia";
import { acessoRoutes } from "@/modules/acesso";

// Cada módulo entra como plugin; os caminhos saem de /api/<módulo>/...
export const app = new Elysia({ prefix: "/api" }).use(acessoRoutes);

export type App = typeof app;
