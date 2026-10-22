import { existsSync } from "node:fs";
import { deleteLeftoverTestData } from "./cleanup";

/** globalSetup do Vitest e do Playwright: limpa as sobras de rodadas anteriores antes de começar. */
export default async function globalSetup() {
	if (existsSync(".env.local")) process.loadEnvFile(".env.local");
	await deleteLeftoverTestData();
}
