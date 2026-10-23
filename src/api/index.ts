import { Elysia } from "elysia";
import { accessRoutes } from "@/modules/access";
import { customersRoutes } from "@/modules/customers";
import { demoRoutes } from "@/modules/demo";
import { inventoryRoutes } from "@/modules/inventory";
import { paymentsRoutes } from "@/modules/payments";
import { purchasingRoutes } from "@/modules/purchasing";

// Cada módulo entra como plugin; os caminhos saem de /api/...
export const app = new Elysia({ prefix: "/api" })
	.use(accessRoutes)
	.use(customersRoutes)
	.use(demoRoutes)
	.use(inventoryRoutes)
	.use(paymentsRoutes)
	.use(purchasingRoutes);

export type App = typeof app;
