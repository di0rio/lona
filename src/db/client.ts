import { attachDatabasePool } from "@vercel/functions";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { urlSegura } from "./url";

// O app conecta como lona_app (sem BYPASSRLS), pelo pooler do Neon. A URL do dono só serve a migração, ao seed e aos testes.
function criarPool() {
	const url = process.env.DATABASE_URL_APP;
	if (!url)
		throw new Error("DATABASE_URL_APP não definida (rode bun run db:papel)");
	const pool = new Pool({ connectionString: urlSegura(url) });
	// Sem este ouvinte, o erro de uma conexão ociosa derrubada pelo Neon encerraria o processo.
	pool.on("error", (erro) => console.error("pool do banco", erro.message));
	attachDatabasePool(pool); // mantém a função viva até as conexões ociosas fecharem (Fluid compute)
	return pool;
}

// No dev o Next recarrega os módulos; guardar o pool no globalThis evita abrir um novo a cada recarga.
const escopo = globalThis as typeof globalThis & { lonaPool?: Pool };
escopo.lonaPool ??= criarPool();

const db = drizzle({ client: escopo.lonaPool });

export type Transacao = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Contexto = {
	usuarioId: string;
	/** Sem empresa só dá pra chamar o que não precisa dela (achar as empresas do usuário, copiar a demonstração). */
	empresaId?: string;
};

/**
 * Único caminho para consulta de negócio: abre uma transação e seta o contexto do RLS com set_config(..., true),
 * que vale só até o COMMIT. Isso funciona atrás do pooler (PgBouncer em modo transação), que mantém a mesma
 * conexão do BEGIN ao COMMIT.
 */
export function comContexto<T>(
	contexto: Contexto,
	fn: (tx: Transacao) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('app.usuario_id', ${contexto.usuarioId}, true), set_config('app.empresa_id', ${contexto.empresaId ?? ""}, true)`,
		);
		return fn(tx);
	});
}

/** Só pra Better Auth, que lê e grava as tabelas de autenticação (sem RLS de empresa). */
export { db as dbAutenticacao };
