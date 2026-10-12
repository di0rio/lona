import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { seedTemplate } from "@/modules/demo";
import { safeUrl } from "../url";

// Semeia o modelo com a conexão do dono (o app não enxerga nem insere o modelo). O Bun já carrega o .env.local.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED é obrigatória");

const pool = new Pool({ connectionString: safeUrl(url) });
try {
	const db = drizzle({ client: pool });
	const template = await db.transaction((tx) => seedTemplate(tx));
	console.log(`Modelo semeado: ${template.companyId}`);
} finally {
	await pool.end();
}
