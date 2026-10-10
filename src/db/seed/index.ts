import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { semearModelo } from "@/modules/demonstracao";
import { urlSegura } from "../url";

// Semeia o modelo com a conexão do dono (o app não enxerga nem insere o modelo). O Bun já carrega o .env.local.
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw new Error("DATABASE_URL_UNPOOLED é obrigatória");

const pool = new Pool({ connectionString: urlSegura(url) });
try {
	const db = drizzle({ client: pool });
	const modelo = await db.transaction((tx) => semearModelo(tx));
	console.log(`Modelo semeado: ${modelo.empresaId}`);
} finally {
	await pool.end();
}
