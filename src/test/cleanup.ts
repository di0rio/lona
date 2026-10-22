import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import pg from "pg";
import { safeUrl } from "../db/url";

// Imports relativos: este arquivo também roda no globalSetup do Playwright, que não resolve o alias "@/".

/** Todo usuário criado por teste usa este domínio (reservado, nunca é de gente de verdade). */
export const TEST_EMAIL_DOMAIN = "@teste.lona.test";

/** Visitantes anônimos do e2e não têm e-mail: o id de cada um vai para este arquivo assim que a sessão existe. */
const E2E_IDS_FILE = "e2e/.test-users";

export function rememberE2eUser(userId: string) {
	appendFileSync(E2E_IDS_FILE, `${userId}\n`);
}

/**
 * Apaga as demonstrações e os usuários que testes anteriores deixaram, inclusive de rodadas interrompidas no meio
 * (sem isso, as sobras enchem o teto de demonstrações vivas e travam os testes seguintes). Roda no começo de cada
 * suíte. Apagar a empresa leva junto as pessoas fictícias dela (demo_company_id).
 */
export async function deleteLeftoverTestData() {
	if (!process.env.DATABASE_URL_UNPOOLED) return;
	const ids = existsSync(E2E_IDS_FILE)
		? readFileSync(E2E_IDS_FILE, "utf8").split("\n").filter(Boolean)
		: [];
	const pool = new pg.Pool({
		connectionString: safeUrl(process.env.DATABASE_URL_UNPOOLED),
		max: 1,
	});
	try {
		const testUsers = `SELECT id FROM auth.users WHERE email LIKE '%' || $1 OR id = ANY($2::uuid[])`;
		await pool.query(
			`DELETE FROM companies WHERE NOT is_template AND id IN (SELECT company_id FROM memberships WHERE user_id IN (${testUsers}))`,
			[TEST_EMAIL_DOMAIN, ids],
		);
		await pool.query(`DELETE FROM auth.users WHERE id IN (${testUsers})`, [
			TEST_EMAIL_DOMAIN,
			ids,
		]);
		rmSync(E2E_IDS_FILE, { force: true });
	} finally {
		await pool.end();
	}
}
