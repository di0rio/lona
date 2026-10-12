import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";

// Conexão do dono só para preparar o cenário (vencer a demonstração) e limpar o que o teste criou.
const dono = new pg.Pool({
	connectionString: (process.env.DATABASE_URL_UNPOOLED ?? "").replace(
		"sslmode=require",
		"sslmode=verify-full",
	),
	max: 2,
});
const usuarioIds = new Set<string>();

// O rate limit do Better Auth em /sign-in e /sign-up é por IP (3 por 10s). Os testes rodam em série no
// mesmo processo; sem um IP próprio por teste, todos cairiam no mesmo balde e um bloquearia o outro.
function ipDoVisitante() {
	return `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
}

test.beforeEach(async ({ page }) => {
	await page
		.context()
		.setExtraHTTPHeaders({ "x-forwarded-for": ipDoVisitante() });
});

async function usuarioDaSessao(page: Page) {
	const resposta = await page.request.get("/api/auth/get-session");
	const sessao = (await resposta.json()) as { user: { id: string } } | null;
	if (!sessao) throw new Error("sem sessão");
	usuarioIds.add(sessao.user.id);
	return sessao.user.id;
}

async function empresaDoPainel(page: Page) {
	const resposta = await page.request.get("/api/acesso/painel");
	expect(resposta.status()).toBe(200);
	return ((await resposta.json()) as { empresa: { id: string } }).empresa.id;
}

const contador = /\d:\d{2}:\d{2}/;

// Mesmo quando o teste falha no meio, a sessão dele entra na lista de limpeza.
test.afterEach(async ({ page }) => {
	const resposta = await page.request.get("/api/auth/get-session");
	const sessao = (await resposta.json()) as { user: { id: string } } | null;
	if (sessao) usuarioIds.add(sessao.user.id);
});

test.afterAll(async () => {
	const ids = [...usuarioIds];
	await dono.query(
		"DELETE FROM empresas WHERE NOT eh_modelo AND id IN (SELECT empresa_id FROM vinculos WHERE usuario_id = ANY($1))",
		[ids],
	);
	await dono.query("DELETE FROM autenticacao.usuarios WHERE id = ANY($1)", [
		ids,
	]);
	await dono.end();
});

test("testar demonstração leva ao painel com o contador", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();

	await expect(page).toHaveURL(/\/painel$/);
	await expect(page.getByText("Demonstração acaba em")).toBeVisible();
	await expect(page.getByText(contador)).toBeVisible();
	await expect(page.getByText("Freios Rodovia Ltda")).toBeVisible();
	await expect(page.getByText("Matriz Jaú")).toBeVisible();
	await expect(page.getByText("dono (opera)")).toBeVisible();
	await usuarioDaSessao(page);
});

test("resetar troca a demonstração por uma nova e mantém o usuário", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	const usuario = await usuarioDaSessao(page);
	const antes = await empresaDoPainel(page);

	await page
		.getByRole("button", { name: "Resetar para a demonstração original" })
		.click();
	await expect(page.getByText(contador)).toBeVisible();
	await expect
		.poll(async () => empresaDoPainel(page), { timeout: 15_000 })
		.not.toBe(antes);

	expect(await usuarioDaSessao(page)).toBe(usuario);
	const { rows } = await dono.query("SELECT 1 FROM empresas WHERE id = $1", [
		antes,
	]);
	expect(rows).toHaveLength(0);
});

test("cadastro com e-mail e senha também recebe uma demonstração", async ({
	page,
}) => {
	await page.goto("/cadastrar");
	await page.getByLabel("Nome").fill("Pessoa de Teste");
	await page
		.getByLabel("E-mail")
		.fill(`e2e-${randomUUID().slice(0, 8)}@teste.lona.test`);
	await page.getByLabel("Senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await expect(page).toHaveURL(/\/painel$/);
	await expect(page.getByText(contador)).toBeVisible();
	await expect(page.getByText("Freios Rodovia Ltda")).toBeVisible();
	await usuarioDaSessao(page);
});

test("entrar com o e-mail e a senha do cadastro", async ({ page, context }) => {
	const email = `e2e-${randomUUID().slice(0, 8)}@teste.lona.test`;
	await page.goto("/cadastrar");
	await page.getByLabel("Nome").fill("Pessoa de Teste");
	await page.getByLabel("E-mail").fill(email);
	await page.getByLabel("Senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Cadastrar" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await usuarioDaSessao(page);

	await page.getByRole("button", { name: "Sair" }).click();
	await expect(page).toHaveURL(/\/$/);
	await context.clearCookies();

	await page.goto("/entrar");
	await page.getByLabel("E-mail").fill(email);
	await page.getByLabel("Senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Entrar" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await expect(page.getByText("Freios Rodovia Ltda")).toBeVisible();
});

test("ao vencer, mostra que a demonstração acabou e deixa começar outra", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	const usuario = await usuarioDaSessao(page);
	const vencida = await empresaDoPainel(page);

	await dono.query(
		"UPDATE empresas SET expira_em = now() - interval '1 minute' WHERE id = $1",
		[vencida],
	);
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Sua demonstração acabou" }),
	).toBeVisible();

	await page
		.getByRole("button", { name: "Começar outra demonstração" })
		.click();
	await expect(page.getByText(contador)).toBeVisible();
	expect(await usuarioDaSessao(page)).toBe(usuario);
	expect(await empresaDoPainel(page)).not.toBe(vencida);
});

test("o contador avisa quando faltam menos de 10 minutos", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await usuarioDaSessao(page);
	const empresa = await empresaDoPainel(page);
	await expect(page.getByRole("status")).toHaveCount(0);

	await dono.query(
		"UPDATE empresas SET expira_em = now() + interval '9 minutes' WHERE id = $1",
		[empresa],
	);
	await page.reload();
	await expect(page.getByRole("status")).toContainText("menos de 10 minutos");
});

test("o inglês fica escondido: /en dá 404 e não há seletor de idioma", async ({
	page,
}) => {
	const resposta = await page.goto("/en");
	expect(resposta?.status()).toBe(404);
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Idioma" })).toHaveCount(0);
});
