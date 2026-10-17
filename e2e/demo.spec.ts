import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";

// Conexão do dono só para preparar o cenário (vencer a demonstração) e limpar o que o teste criou.
const owner = new pg.Pool({
	connectionString: (process.env.DATABASE_URL_UNPOOLED ?? "").replace(
		"sslmode=require",
		"sslmode=verify-full",
	),
	max: 2,
});
const userIds = new Set<string>();

// O rate limit do Better Auth em /sign-in e /sign-up é por IP (3 por 10s). Os testes rodam em série no
// mesmo processo; sem um IP próprio por teste, todos cairiam no mesmo balde e um bloquearia o outro.
function visitorIp() {
	return `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
}

test.beforeEach(async ({ page }) => {
	await page.context().setExtraHTTPHeaders({ "x-forwarded-for": visitorIp() });
});

async function sessionUser(page: Page) {
	const response = await page.request.get("/api/auth/get-session");
	const session = (await response.json()) as { user: { id: string } } | null;
	if (!session) throw new Error("sem sessão");
	userIds.add(session.user.id);
	return session.user.id;
}

async function dashboardCompany(page: Page) {
	const response = await page.request.get("/api/access/dashboard");
	expect(response.status()).toBe(200);
	return ((await response.json()) as { company: { id: string } }).company.id;
}

const countdown = /\d:\d{2}:\d{2}/;

// Mesmo quando o teste falha no meio, a sessão dele entra na lista de limpeza.
test.afterEach(async ({ page }) => {
	const response = await page.request.get("/api/auth/get-session");
	const session = (await response.json()) as { user: { id: string } } | null;
	if (session) userIds.add(session.user.id);
});

test.afterAll(async () => {
	const ids = [...userIds];
	await owner.query(
		"DELETE FROM companies WHERE NOT is_template AND id IN (SELECT company_id FROM memberships WHERE user_id = ANY($1))",
		[ids],
	);
	await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [ids]);
	await owner.end();
});

test("trying the demonstration leads to the dashboard with the countdown", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();

	await expect(page).toHaveURL(/\/painel$/);
	await expect(page.getByText("Demonstração acaba em")).toBeVisible();
	await expect(page.getByText(countdown)).toBeVisible();
	await expect(page.getByText("Freios Rodovia Ltda").first()).toBeVisible();
	await expect(page.getByText("Matriz Jaú").first()).toBeVisible();
	await expect(page.getByText("dono (opera)")).toBeVisible();
	await expect(page.locator("[data-color]").first()).toHaveAttribute(
		"data-color",
		"orange",
	);
	await sessionUser(page);
});

test("reset swaps the demonstration for a new one and keeps the user", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	const user = await sessionUser(page);
	const before = await dashboardCompany(page);

	await page
		.getByRole("button", { name: "Resetar para a demonstração original" })
		.click();
	await expect(page.getByText(countdown)).toBeVisible();
	await expect
		.poll(async () => dashboardCompany(page), { timeout: 15_000 })
		.not.toBe(before);

	expect(await sessionUser(page)).toBe(user);
	const { rows } = await owner.query("SELECT 1 FROM companies WHERE id = $1", [
		before,
	]);
	expect(rows).toHaveLength(0);
});

test("signing up with email and password also gets a demonstration", async ({
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
	await expect(page.getByText(countdown)).toBeVisible();
	await expect(page.getByText("Freios Rodovia Ltda").first()).toBeVisible();
	await sessionUser(page);
});

test("sign in with the email and password from the registration", async ({
	page,
	context,
}) => {
	const email = `e2e-${randomUUID().slice(0, 8)}@teste.lona.test`;
	await page.goto("/cadastrar");
	await page.getByLabel("Nome").fill("Pessoa de Teste");
	await page.getByLabel("E-mail").fill(email);
	await page.getByLabel("Senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Cadastrar" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	// "Sair" vive no menu do usuário, no rodapé da sidebar.
	await page.getByRole("button", { name: /Pessoa de Teste/ }).click();
	await page.getByRole("menuitem", { name: "Sair" }).click();
	await expect(page).toHaveURL(/\/$/);
	await context.clearCookies();

	await page.goto("/entrar");
	await page.getByLabel("E-mail").fill(email);
	await page.getByLabel("Senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Entrar" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await expect(page.getByText("Freios Rodovia Ltda").first()).toBeVisible();
});

test("on expiry, shows that the demonstration is over and allows starting another", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	const user = await sessionUser(page);
	const expired = await dashboardCompany(page);

	await owner.query(
		"UPDATE companies SET expires_at = now() - interval '1 minute' WHERE id = $1",
		[expired],
	);
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Sua demonstração acabou" }),
	).toBeVisible();

	await page
		.getByRole("button", { name: "Começar outra demonstração" })
		.click();
	await expect(page.getByText(countdown)).toBeVisible();
	expect(await sessionUser(page)).toBe(user);
	expect(await dashboardCompany(page)).not.toBe(expired);
});

test("the countdown warns when less than 10 minutes are left", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);
	const company = await dashboardCompany(page);
	await expect(page.getByRole("status")).toHaveCount(0);

	await owner.query(
		"UPDATE companies SET expires_at = now() + interval '9 minutes' WHERE id = $1",
		[company],
	);
	await page.reload();
	await expect(page.getByRole("status")).toContainText("menos de 10 minutos");
});

test("english stays hidden: /en gives 404 and there is no language switch", async ({
	page,
}) => {
	const response = await page.goto("/en");
	expect(response?.status()).toBe(404);
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Idioma" })).toHaveCount(0);
});

test("Ctrl+K opens the palette and navigates via Painel", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	await page.keyboard.press("Control+k");
	const palette = page.getByRole("dialog");
	await expect(palette).toBeVisible();
	await palette.getByText("Painel", { exact: true }).click();
	await expect(palette).toBeHidden();
	await expect(page).toHaveURL(/\/painel$/);
});

test("toggling theme in the user menu switches to dark", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	await page.getByRole("button", { name: /dono · Matriz Jaú/ }).click();
	await page.getByRole("menuitemradio", { name: "Escuro" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
});

test("settings: opens from the menu, saves a toggle and keeps it after reloading", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	await page.getByRole("link", { name: "Configurações" }).click();
	await expect(page).toHaveURL(/\/painel\/configuracoes$/);
	await expect(
		page.getByRole("heading", { name: "Como sua empresa trabalha" }),
	).toBeVisible();
	// Regressão: o breadcrumb ficava "Painel" em qualquer página.
	await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveText(
		"Configurações",
	);

	const quote = page.getByRole("switch", {
		name: "Venda começa com orçamento",
	});
	// O modelo da demonstração já traz valores próprios; o teste inverte o que encontrar.
	const was = await quote.isChecked();
	await quote.click();
	await expect(quote).toBeChecked({ checked: !was });
	await expect(page.getByText("Salvo.")).toBeVisible();

	await page.reload();
	await expect(
		page.getByRole("switch", { name: "Venda começa com orçamento" }),
	).toBeChecked({ checked: !was });

	// O servidor recusa valor inválido e corpo vazio.
	const invalid = await page.request.patch("/api/access/settings", {
		data: { work_order_flow: "banana" },
	});
	expect(invalid.status()).toBe(422);
	const empty = await page.request.patch("/api/access/settings", { data: {} });
	expect(empty.status()).toBe(422);
});

test("settings: Desfazer brings the previous value back", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);
	await page.goto("/painel/configuracoes");

	const cash = page.getByRole("switch", {
		name: "Caixa obrigatório para vender",
	});
	const was = await cash.isChecked();
	await cash.click();
	await expect(cash).toBeChecked({ checked: !was });
	await page.getByRole("button", { name: "Desfazer" }).click();
	await expect(cash).toBeChecked({ checked: was });
	await page.reload();
	await expect(
		page.getByRole("switch", { name: "Caixa obrigatório para vender" }),
	).toBeChecked({ checked: was });
});

test("branches: turning them on shows the menu item, then create, deactivate and undo", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);
	await page.goto("/painel/configuracoes");

	// O modelo já usa filiais; desliga para ver o menu sumir e a página explicar.
	const uses = page.getByRole("switch", { name: "Usa filiais" });
	await expect(uses).toBeChecked();
	await uses.click();
	await expect(page.getByRole("link", { name: "Filiais" })).toHaveCount(0);
	await page.goto("/painel/filiais");
	await expect(
		page.getByRole("heading", { name: "Sua empresa trabalha só com a matriz" }),
	).toBeVisible();
	await page.getByRole("link", { name: "Ir para Configurações" }).click();

	await page.getByRole("switch", { name: "Usa filiais" }).click();
	await page.getByRole("link", { name: "Filiais" }).click();
	await expect(page).toHaveURL(/\/painel\/filiais$/);
	await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveText(
		"Filiais",
	);
	await expect(page.getByRole("cell", { name: "Filial Bauru" })).toBeVisible();

	await page.getByRole("button", { name: "Nova filial" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("button", { name: "Salvar" }).click();
	await expect(dialog.getByText("Informe o nome da filial.")).toBeVisible();
	await dialog.getByLabel("Nome").fill("Filial Marília");
	await dialog.getByLabel("Código").fill("mar");
	await dialog.getByLabel("Número de ordem").fill("2");
	await dialog.getByRole("button", { name: "Salvar" }).click();
	await expect(
		dialog.getByText("Já existe filial com essa ordem."),
	).toBeVisible();
	await dialog.getByLabel("Número de ordem").fill("3");
	await dialog.getByRole("button", { name: "Salvar" }).click();
	await expect(dialog).toBeHidden();
	const row = page.getByRole("row", { name: /Filial Marília/ });
	await expect(row).toContainText(/\/0003-\d{2}/);
	await expect(row).toContainText("Ativa");

	await row.getByRole("button", { name: "Inativar" }).click();
	await expect(row).toContainText("Inativa");
	await page.getByRole("button", { name: "Desfazer" }).click();
	await expect(row).toContainText("Ativa");
});
