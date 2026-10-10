import pg from "pg";
import { urlSegura } from "@/db/url";

/** Os testes de integração só rodam com banco; sem DATABASE_URL (como no CI sem segredo) eles pulam. */
export const temBanco = Boolean(process.env.DATABASE_URL);

/** Conexão do dono (ignora RLS): serve pra montar e limpar dados. Nunca pra testar regra. */
export function conectarComoDono() {
	return new pg.Pool({
		connectionString: urlSegura(process.env.DATABASE_URL_UNPOOLED ?? ""),
		max: 2,
	});
}

/** Conexão do papel lona_app, igual à do app em produção. */
export function conectarComoApp() {
	return new pg.Pool({
		connectionString: urlSegura(process.env.DATABASE_URL_APP ?? ""),
		max: 2,
	});
}

/** Roda uma consulta como lona_app numa transação com o contexto do RLS, e desfaz no fim. */
export async function comoApp<T>(
	pool: pg.Pool,
	contexto: { usuarioId?: string; empresaId?: string },
	fn: (cliente: pg.PoolClient) => Promise<T>,
) {
	const cliente = await pool.connect();
	try {
		await cliente.query("BEGIN");
		await cliente.query(
			"SELECT set_config('app.usuario_id', $1, true), set_config('app.empresa_id', $2, true)",
			[contexto.usuarioId ?? "", contexto.empresaId ?? ""],
		);
		return await fn(cliente);
	} finally {
		await cliente.query("ROLLBACK");
		cliente.release();
	}
}
