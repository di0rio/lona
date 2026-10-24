import { randomBytes } from "node:crypto";
import pg from "pg";
import { safeUrl } from "./url";

/**
 * Liga o papel lona_app (criado na migração 0001) com uma senha aleatória nova e devolve a URL dele pelo pooler.
 * A senha nunca é impressa: quem chama decide onde guardar a URL.
 */
export async function enableAppRole(ownerUrl: string, pooledUrl: string) {
	const password = randomBytes(24).toString("base64url");
	const client = new pg.Client({ connectionString: safeUrl(ownerUrl) });
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

	const url = new URL(pooledUrl);
	url.username = "lona_app";
	url.password = password;
	return url.toString();
}
