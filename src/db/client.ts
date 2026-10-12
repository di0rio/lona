import { attachDatabasePool } from "@vercel/functions";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { safeUrl } from "./url";

// O app conecta como lona_app (sem BYPASSRLS), pelo pooler do Neon. A URL do dono só serve a migração, ao seed e aos testes.
function createPool() {
	const url = process.env.DATABASE_URL_APP;
	if (!url)
		throw new Error("DATABASE_URL_APP não definida (rode bun run db:app-role)");
	const pool = new Pool({ connectionString: safeUrl(url) });
	// Sem este ouvinte, o erro de uma conexão ociosa derrubada pelo Neon encerraria o processo.
	pool.on("error", (error) => console.error("pool do banco", error.message));
	attachDatabasePool(pool); // mantém a função viva até as conexões ociosas fecharem (Fluid compute)
	return pool;
}

// No dev o Next recarrega os módulos; guardar o pool no globalThis evita abrir um novo a cada recarga.
const scope = globalThis as typeof globalThis & { lonaPool?: Pool };
scope.lonaPool ??= createPool();

const db = drizzle({ client: scope.lonaPool });

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type Context = {
	/** Só a rotina de limpeza roda sem usuário. */
	userId?: string;
	/** Sem empresa só dá pra chamar o que não precisa dela (achar as empresas do usuário, copiar a demonstração). */
	companyId?: string;
};

/**
 * Único caminho para consulta de negócio: abre uma transação e seta o contexto do RLS com set_config(..., true),
 * que vale só até o COMMIT. Isso funciona atrás do pooler (PgBouncer em modo transação), que mantém a mesma
 * conexão do BEGIN ao COMMIT.
 */
export function withContext<T>(
	context: Context,
	fn: (tx: Transaction) => Promise<T>,
	// Pra quando a função achar a empresa ativa e só depois ler o que depende dela, tudo precisa vir do
	// mesmo retrato: sem isso, READ COMMITTED tira um retrato novo a cada consulta e um commit concorrente
	// (ex.: resetar a demonstração) pode apagar a empresa entre as duas leituras.
	options?: { repeatableRead?: boolean },
): Promise<T> {
	return db.transaction(async (tx) => {
		if (options?.repeatableRead) {
			await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
		}
		await tx.execute(
			sql`SELECT set_config('app.user_id', ${context.userId ?? ""}, true), set_config('app.company_id', ${context.companyId ?? ""}, true)`,
		);
		return fn(tx);
	});
}

/** Só pra Better Auth, que lê e grava as tabelas de autenticação (sem RLS de empresa). */
export { db as authDb };
