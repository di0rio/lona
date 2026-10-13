import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";
import { safeUrl } from "./src/db/url";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/modules/*/schema.ts",
	out: "./src/db/migrations",
	// Migração roda como dono, direto no Postgres (sem o pooler).
	dbCredentials: { url: safeUrl(process.env.DATABASE_URL_UNPOOLED ?? "") },
});
