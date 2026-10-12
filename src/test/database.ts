import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { safeUrl } from "@/db/url";

/** Os testes de integração só rodam com banco; sem DATABASE_URL (como no CI sem segredo) eles pulam. */
export const hasDatabase = Boolean(process.env.DATABASE_URL);

/** Conexão do dono (ignora RLS): serve pra montar e limpar dados. Nunca pra testar regra. */
export function connectAsOwner() {
	return new pg.Pool({
		connectionString: safeUrl(process.env.DATABASE_URL_UNPOOLED ?? ""),
		max: 2,
	});
}

/** Conexão do papel lona_app, igual à do app em produção. */
export function connectAsApp() {
	return new pg.Pool({
		connectionString: safeUrl(process.env.DATABASE_URL_APP ?? ""),
		max: 2,
	});
}

/** Roda uma consulta como lona_app numa transação com o contexto do RLS, e desfaz no fim. */
export async function asApp<T>(
	pool: pg.Pool,
	context: { userId?: string; companyId?: string },
	fn: (client: pg.PoolClient) => Promise<T>,
) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query(
			"SELECT set_config('app.user_id', $1, true), set_config('app.company_id', $2, true)",
			[context.userId ?? "", context.companyId ?? ""],
		);
		return await fn(client);
	} finally {
		await client.query("ROLLBACK");
		client.release();
	}
}

/** Drizzle em cima da conexão do dono, pra montar dados de teste com os mesmos services do app. */
export function drizzleAsOwner(pool: pg.Pool) {
	return drizzle({ client: pool });
}

/** Cria um usuário só para o teste (a tabela de autenticação não tem RLS). */
export async function createTestUser(pool: pg.Pool, nickname: string) {
	const suffix = randomUUID().slice(0, 8);
	const { rows } = await pool.query<{ id: string }>(
		"INSERT INTO auth.users (name, email) VALUES ($1, $2) RETURNING id",
		[nickname, `${nickname}-${suffix}@teste.lona.test`],
	);
	return rows[0].id;
}
