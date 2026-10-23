import { Elysia } from "elysia";
import { accessRoutes } from "@/modules/access";
import { customersRoutes } from "@/modules/customers";
import { demoRoutes } from "@/modules/demo";

// Cada módulo entra como plugin; os caminhos saem de /api/...
export const app = new Elysia({ prefix: "/api" })
	.use(accessRoutes)
	.use(customersRoutes)
	.use(demoRoutes);

export type App = typeof app;
