import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { enableAppRole } from "../src/db/app-role";
import {
	assertProductionTarget,
	PRODUCTION_BRANCH,
} from "../src/db/production-target";
import { safeUrl } from "../src/db/url";

// Recria do zero o banco da produção (roteiro em docs/deploy.md): esquemas, migrações, papel lona_app e modelo.
// As URLs vêm só deste arquivo, nunca do ambiente: o Bun carrega o .env.local (dev) sozinho e misturar os
// dois poderia apagar o banco errado. O nome não é .env.production.local de propósito: esse o next build/start
// carrega sozinho, e um e2e local acabaria na produção. Nenhuma URL ou senha é impressa.
const envFile = ".env.main.local";

const env = parseEnv(readFileSync(envFile, "utf8"));
const { ownerUrl, pooledUrl } = assertProductionTarget(
	env,
	process.argv.slice(2),
);
const typed = prompt(
	`Isto APAGA todos os dados da branch ${PRODUCTION_BRANCH} do Neon. Digite o nome da branch para confirmar:`,
);
if (typed?.trim() !== PRODUCTION_BRANCH)
	throw new Error("Nome diferente; nada foi feito.");

const pool = new pg.Pool({ connectionString: safeUrl(ownerUrl) });
try {
	// autenticacao é o esquema de auth de antes dos nomes em inglês; neon_auth é do Neon e fica.
	// Sem parâmetros, o pg manda tudo numa transação implícita só: ou recria tudo ou não muda nada.
	// O public volta como o PostgreSQL 15+ cria: dono pg_database_owner e só USAGE pro PUBLIC.
	await pool.query(`
		DROP SCHEMA IF EXISTS public, auth, autenticacao, drizzle CASCADE;
		CREATE SCHEMA public AUTHORIZATION pg_database_owner;
		GRANT USAGE ON SCHEMA public TO PUBLIC;
	`);
	console.log("Esquemas antigos apagados e public recriado.");

	const db = drizzle({ client: pool });
	await migrate(db, { migrationsFolder: "src/db/migrations" });
	console.log("Migrações aplicadas.");

	// A senha antiga do lona_app deixa de valer: o arquivo fica só com a URL nova.
	const appUrl = await enableAppRole(ownerUrl, pooledUrl);
	const rest = readFileSync(envFile, "utf8").replace(
		/^DATABASE_URL_APP=.*\n?/gm,
		"",
	);
	writeFileSync(envFile, `${rest.trimEnd()}\nDATABASE_URL_APP="${appUrl}"\n`);
	console.log(`Papel lona_app ligado; DATABASE_URL_APP nova no ${envFile}.`);

	// O módulo demo abre o pool do app ao carregar e exige DATABASE_URL_APP: só importa com a da produção setada.
	process.env.DATABASE_URL_APP = appUrl;
	const { seedTemplate } = await import("../src/modules/demo");
	const template = await db.transaction((tx) => seedTemplate(tx));
	console.log(`Modelo semeado: ${template.companyId}`);
} finally {
	await pool.end();
}
