import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import pg from "pg";
import { safeUrl } from "../src/db/url";

// Liga o papel lona_app (criado na migração 0000) com uma senha aleatória e grava DATABASE_URL_APP no .env.local.
// Nada de senha impressa: o valor só vai pro arquivo, que o git ignora. O Bun já carrega o .env.local sozinho.

const { DATABASE_URL, DATABASE_URL_UNPOOLED, DATABASE_URL_APP } = process.env;
if (!DATABASE_URL || !DATABASE_URL_UNPOOLED) {
	throw new Error("DATABASE_URL e DATABASE_URL_UNPOOLED são obrigatórias");
}
if (DATABASE_URL_APP) {
	console.log("DATABASE_URL_APP já existe; nada a fazer.");
	process.exit(0);
}

const password = randomBytes(24).toString("base64url");
const client = new pg.Client({
	connectionString: safeUrl(DATABASE_URL_UNPOOLED),
});
await client.connect();
try {
	const { rows } = await client.query<{ command: string }>(
		"SELECT format('ALTER ROLE lona_app LOGIN PASSWORD %L', $1::text) AS command",
		[password],
	);
	await client.query(rows[0].command);
} finally {
	await client.end();
}

const url = new URL(DATABASE_URL);
url.username = "lona_app";
url.password = password;
appendFileSync(".env.local", `\nDATABASE_URL_APP="${url.toString()}"\n`);
console.log("Papel lona_app ligado; DATABASE_URL_APP gravada no .env.local.");
