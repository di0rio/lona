import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { rememberE2eUser } from "../src/test/cleanup";
import { totpCode } from "../src/test/totp";

// Conexão do dono só para preparar o cenário (vencer a demonstração) e limpar o que o teste criou.
const owner = new pg.Pool({
	connectionString: (process.env.DATABASE_URL_UNPOOLED ?? "").replace(
		"sslmode=require",
		"sslmode=verify-full",
	),
	max: 2,
});
const userIds = new Set<string>();

// O rate limit do Better Auth (src/modules/access/auth.ts) é por IP e rota, e o contador fica no banco. Os testes rodam em série no
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
	rememberE2eUser(session.user.id);
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
	if (session) {
		userIds.add(session.user.id);
		rememberE2eUser(session.user.id);
	}
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

test("signing up with the demonstration cap full explains it instead of showing an expired demo", async ({
	page,
}) => {
	await page.route("**/api/demo/start", (route) =>
		route.fulfill({ status: 503, body: "Muita gente testando agora." }),
	);
	await page.goto("/cadastrar");
	await page.getByLabel("Nome").fill("Pessoa de Teste");
	await page
		.getByLabel("E-mail")
		.fill(`e2e-${randomUUID().slice(0, 8)}@teste.lona.test`);
	await page.getByLabel("Senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await expect(
		page.getByText(/Conta criada, mas tem muita gente testando/),
	).toBeVisible();
	await expect(page).toHaveURL(/\/cadastrar$/);
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

test("turning on two-factor makes the next sign-in ask for the authenticator code", async ({
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

	await page.getByRole("button", { name: /Pessoa de Teste/ }).click();
	await page.getByRole("menuitem", { name: "Segurança da conta" }).click();
	await expect(page).toHaveURL(/\/painel\/conta$/);
	await page.getByRole("button", { name: "Ativar" }).click();
	await page.getByLabel("Sua senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Confirmar" }).click();

	// A chave que o app autenticador receberia pelo QR code; o teste faz o papel do app.
	const key = (await page.getByTestId("totp-key").textContent()) ?? "";
	await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
	await expect(
		page.getByText("Guarde seus códigos de recuperação"),
	).toHaveCount(0);
	await page.getByLabel("Código do app").fill(totpCode(key));
	await page.getByRole("button", { name: "Confirmar" }).click();

	await expect(
		page.getByText("Guarde seus códigos de recuperação"),
	).toBeVisible();
	await page.getByRole("button", { name: "Guardei os códigos" }).click();
	await expect(
		page.getByText("Verificação em duas etapas ligada."),
	).toBeVisible();

	await page.getByRole("button", { name: /Pessoa de Teste/ }).click();
	await page.getByRole("menuitem", { name: "Sair" }).click();
	await expect(page).toHaveURL(/\/$/);
	await context.clearCookies();

	await page.goto("/entrar");
	await page.getByLabel("E-mail").fill(email);
	await page.getByLabel("Senha").fill("senha-de-teste-123");
	await page.getByRole("button", { name: "Entrar" }).click();
	await expect(page.getByText("Código do app autenticador")).toBeVisible();
	await expect(page).not.toHaveURL(/\/painel$/);
	await page.getByLabel("Código", { exact: true }).fill(totpCode(key));
	await page.getByRole("button", { name: "Verificar" }).click();
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
	await expect(
		page
			.getByRole("navigation", { name: "breadcrumb" })
			.locator('[aria-current="page"]'),
	).toHaveText("Configurações");

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
	// O "Desfazer" só aparece depois que o primeiro PATCH respondeu; esperar por ele antes garante que o
	// waitForResponse abaixo pega o PATCH do desfazer, não o primeiro (era isso que deixava o teste instável).
	const undo = page.getByRole("button", { name: "Desfazer" });
	await expect(undo).toBeVisible();
	// Espera o PATCH do desfazer terminar: recarregar antes o cancela e o valor volta ao salvo.
	const undone = page.waitForResponse(
		(r) =>
			r.url().endsWith("/api/access/settings") &&
			r.request().method() === "PATCH",
	);
	await undo.click();
	await expect(cash).toBeChecked({ checked: was });
	await undone;
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
	await expect(
		page
			.getByRole("navigation", { name: "breadcrumb" })
			.locator('[aria-current="page"]'),
	).toHaveText("Filiais");
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

test("roles: create one copying balconista, tick a permission, save and see it after reload", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	await page.getByRole("link", { name: "Cargos" }).click();
	await expect(page).toHaveURL(/\/painel\/cargos$/);
	await expect(page.getByRole("cell", { name: /^balconista/ })).toBeVisible();

	await page.getByRole("button", { name: "Novo cargo" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet.getByText("Informe o nome do cargo.")).toBeVisible();
	await sheet.getByLabel("Nome").fill("Balconista sênior");
	await sheet
		.getByLabel("Partir de uma cópia de")
		.selectOption({ label: "balconista" });
	await expect(sheet.getByLabel("Desconto máximo")).toHaveValue("5");
	const cancel = sheet.getByLabel("Cancelar venda");
	await expect(cancel).not.toBeChecked();
	await cancel.check();
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();

	await page.reload();
	const row = page.getByRole("row", { name: /Balconista sênior/ });
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: "Editar" }).click();
	await expect(page.getByLabel("Cancelar venda")).toBeChecked();
	await expect(page.getByLabel("Desconto máximo")).toHaveValue("5");
	await expect(page.getByLabel("Fazer venda de balcão")).toBeChecked();

	// Permissão fora do catálogo é recusada pelo servidor.
	const invalid = await page.request.post("/api/access/roles", {
		data: {
			name: "Fantasma",
			permissions: ["nope.nothing"],
			limits: { max_discount_pct: null, max_purchase_order: null },
		},
	});
	expect(invalid.status()).toBe(422);
});

test("users: change a fictitious user's role, save and see it after reload", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	await page.getByRole("link", { name: "Usuários" }).click();
	await expect(page).toHaveURL(/\/painel\/usuarios$/);
	const row = page.getByRole("row", { name: /Paulo Mendes/ });
	await expect(row).toContainText("balconista em Matriz Jaú · opera");

	await row.getByRole("button", { name: "Editar vínculos" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Cargo").selectOption({ label: "financeiro" });
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();

	await page.reload();
	await expect(page.getByRole("row", { name: /Paulo Mendes/ })).toContainText(
		"financeiro em Matriz Jaú · opera",
	);

	// Duas vezes a mesma filial: o banco recusa e a tela mostra o motivo.
	await page
		.getByRole("row", { name: /Paulo Mendes/ })
		.getByRole("button", { name: "Editar vínculos" })
		.click();
	await sheet.getByRole("button", { name: "Adicionar vínculo" }).click();
	await sheet.getByLabel("Filial").last().selectOption({ label: "Matriz Jaú" });
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet.getByRole("alert")).toContainText("já tem vínculo");
});

test("invites: the owner creates and copies the link, a new person signs up through it and shows up in the users list", async ({
	page,
	context,
	browser,
}) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"]);
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);
	const company = await dashboardCompany(page);

	await page.getByRole("link", { name: "Usuários" }).click();
	await page.getByRole("button", { name: "Convidar" }).click();
	const sheet = page.getByRole("dialog");
	await expect(sheet.getByText("O Lona não envia e-mail")).toBeVisible();
	await sheet.getByLabel("Cargo").selectOption({ label: "balconista" });
	await sheet.getByLabel("Filial").selectOption({ label: "Matriz Jaú" });
	await sheet.getByRole("button", { name: "Gerar link" }).click();

	const link = await sheet.getByLabel("Link do convite").inputValue();
	expect(link).toMatch(/\/convite\/[\w-]{43}$/);
	await sheet.getByRole("button", { name: "Copiar link" }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

	// Outra pessoa, em outro navegador: abre o link, cria a conta e volta para o convite.
	const guestContext = await browser.newContext({
		locale: "pt-BR",
		extraHTTPHeaders: { "x-forwarded-for": visitorIp() },
	});
	try {
		const guest = await guestContext.newPage();
		await guest.goto(link);
		await expect(
			guest.getByText(
				/convidou você para Freios Rodovia Ltda como balconista em Matriz Jaú/,
			),
		).toBeVisible();
		await guest.getByRole("button", { name: "Criar conta" }).click();
		await expect(guest).toHaveURL(/\/cadastrar\?convite=/);
		await guest.getByLabel("Nome").fill("Convidada de Teste");
		await guest
			.getByLabel("E-mail")
			.fill(`e2e-${randomUUID().slice(0, 8)}@teste.lona.test`);
		await guest.getByLabel("Senha").fill("senha-de-teste-123");
		await guest.getByRole("button", { name: "Cadastrar" }).click();

		await expect(guest).toHaveURL(/\/convite\/[\w-]+$/);
		await sessionUser(guest);
		await guest.getByRole("button", { name: "Aceitar convite" }).click();
		await expect(guest).toHaveURL(/\/painel$/);
		const dashboard = await guest.request.get("/api/access/dashboard");
		expect(await dashboard.json()).toMatchObject({
			company: { id: company },
			role: "balconista",
		});

		// Link usado: mesma mensagem de qualquer link que não vale.
		await guest.goto(link);
		await expect(guest.getByText("Este link não vale mais")).toBeVisible();
	} finally {
		await guestContext.close();
	}

	await page.goto("/painel/usuarios");
	await expect(
		page.getByRole("row", { name: /Convidada de Teste/ }),
	).toContainText("balconista em Matriz Jaú · opera");
	await expect(page.getByText("Convites pendentes")).toHaveCount(0);
});

test("invites: a revoked link no longer works", async ({ page, browser }) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	await page.goto("/painel/usuarios");
	await page.getByRole("button", { name: "Convidar" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("button", { name: "Gerar link" }).click();
	const link = await sheet.getByLabel("Link do convite").inputValue();
	await page.keyboard.press("Escape");

	const pending = page
		.getByRole("row")
		.filter({ has: page.getByRole("button", { name: "Revogar" }) });
	await expect(page.getByText("Convites pendentes")).toBeVisible();
	await pending.getByRole("button", { name: "Revogar" }).click();
	await expect(page.getByText("Convites pendentes")).toHaveCount(0);

	const guestContext = await browser.newContext({ locale: "pt-BR" });
	try {
		const guest = await guestContext.newPage();
		await guest.goto(link);
		await expect(guest.getByText("Este link não vale mais")).toBeVisible();
	} finally {
		await guestContext.close();
	}
});

test("view as the counter clerk hides what only the owner sees, and going back brings it back", async ({
	page,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await sessionUser(page);

	await page.goto("/painel/cargos");
	await expect(page.getByRole("button", { name: "Novo cargo" })).toBeVisible();

	await page.getByRole("button", { name: /Visitante/ }).click();
	await page.getByRole("menuitem", { name: /Paulo Mendes/ }).click();

	const banner = page.getByRole("status").filter({ hasText: "Você está como" });
	await expect(banner).toContainText("Paulo Mendes (balconista, Matriz Jaú)");
	await expect(page.getByRole("button", { name: "Novo cargo" })).toHaveCount(0);
	await expect(page.getByText(/Só quem gerencia cargos/)).toBeVisible();

	await banner.getByRole("button", { name: "Voltar pro dono" }).click();
	await expect(banner).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Novo cargo" })).toBeVisible();
});
