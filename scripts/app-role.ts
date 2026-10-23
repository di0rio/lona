import { appendFileSync } from "node:fs";
import { enableAppRole } from "../src/db/app-role";

// Liga o papel lona_app com uma senha aleatória e grava DATABASE_URL_APP no .env.local.
// Nada de senha impressa: o valor só vai pro arquivo, que o git ignora. O Bun já carrega o .env.local sozinho.

const { DATABASE_URL, DATABASE_URL_UNPOOLED, DATABASE_URL_APP } = process.env;
if (!DATABASE_URL || !DATABASE_URL_UNPOOLED) {
	throw new Error("DATABASE_URL e DATABASE_URL_UNPOOLED são obrigatórias");
}
if (DATABASE_URL_APP) {
	console.log("DATABASE_URL_APP já existe; nada a fazer.");
	process.exit(0);
}

const url = await enableAppRole(DATABASE_URL_UNPOOLED, DATABASE_URL);
appendFileSync(".env.local", `\nDATABASE_URL_APP="${url}"\n`);
console.log("Papel lona_app ligado; DATABASE_URL_APP gravada no .env.local.");
