import { randomInt } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { rememberE2eUser } from "../src/test/cleanup";

// Conexão do dono só para limpar o que o teste criou (mesmo esquema do demo.spec.ts).
const owner = new pg.Pool({
	connectionString: (process.env.DATABASE_URL_UNPOOLED ?? "").replace(
		"sslmode=require",
		"sslmode=verify-full",
	),
	max: 2,
});
const userIds = new Set<string>();

// Rate limit do Better Auth é por IP: um IP próprio por teste evita um bloquear o outro.
test.beforeEach(async ({ page }) => {
	const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
	await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
});

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

async function openPayments(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await page.getByRole("link", { name: "Pagamentos" }).click();
	await expect(page).toHaveURL(/\/painel\/pagamentos$/);
}

const acquirersTab = (page: Page) =>
	page.getByRole("tab", { name: "Operadoras e taxas" });
const termsTab = (page: Page) => page.getByRole("tab", { name: "Condições" });

test("payments: see the demo fees and terms, edit a fee inline and create a term, both kept after reload", async ({
	page,
}) => {
	await openPayments(page);
	await expect(page.getByRole("cell", { name: "Débito Stone" })).toBeVisible();

	await acquirersTab(page).click();
	const stone = page.locator('[data-acquirer="Stone"]');
	await expect(stone).toBeVisible();
	await expect(page.locator('[data-acquirer="Cielo"]')).toBeVisible();
	await expect(stone.getByLabel("Débito: Taxa", { exact: true })).toHaveValue(
		"1,09",
	);
	const credit = stone.getByLabel("Crédito à vista: Taxa", { exact: true });
	// Esc desfaz a edição: volta ao valor anterior e não salva.
	const before = await credit.inputValue();
	await credit.fill("9,99");
	await credit.press("Escape");
	await expect(credit).toHaveValue(before);
	await expect(page.getByText("Taxa salva.")).toHaveCount(0);

	await credit.fill("3,10");
	await credit.press("Enter");
	await expect(page.getByText("Taxa salva.")).toBeVisible();
	await expect(credit).toHaveValue("3,10");

	// Valor inválido é recusado e volta ao anterior.
	await credit.fill("abc");
	await credit.press("Enter");
	await expect(page.getByText("Use uma taxa de 0 a 99,99.")).toBeVisible();
	await expect(credit).toHaveValue("3,10");

	// Vigência antiga é só consulta: nenhuma célula editável.
	await stone.getByLabel("Vigência").selectOption("2025-01-01");
	await expect(stone.locator("input")).toHaveCount(0);
	await stone.getByLabel("Vigência").selectOption("2026-03-01");
	await expect(credit).toHaveValue("3,10");

	await termsTab(page).click();
	await expect(
		page.getByRole("cell", { name: "Faturado 30/60/90" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Nova condição" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet.getByText("Informe o nome da condição.")).toBeVisible();
	await sheet.getByLabel("Nome").fill("Pix 2x");
	await sheet.getByLabel("Forma de pagamento").selectOption({ label: "Pix" });
	await sheet.getByLabel("Dias das parcelas").fill("0/30");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();

	// Dias das parcelas: "30/60/90" é aceito; dias diminuindo são recusados.
	await page.getByRole("button", { name: "Nova condição" }).click();
	await sheet.getByLabel("Nome").fill("Pix 3x");
	await sheet.getByLabel("Forma de pagamento").selectOption({ label: "Pix" });
	await sheet.getByLabel("Dias das parcelas").fill("60/30");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(
		sheet.getByText("Use de 1 a 12 números de dias, sem diminuir"),
	).toBeVisible();
	await sheet.getByLabel("Dias das parcelas").fill("30/60/90");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();

	await page.reload();
	await acquirersTab(page).click();
	await expect(
		page
			.locator('[data-acquirer="Stone"]')
			.getByLabel("Crédito à vista: Taxa", { exact: true }),
	).toHaveValue("3,10");
	await termsTab(page).click();
	const row = page.getByRole("row", { name: /Pix 2x/ });
	await expect(row).toContainText("0/30");
	await expect(row).toContainText("Pix");
	await expect(page.getByRole("row", { name: /Pix 3x/ })).toContainText(
		"30/60/90",
	);
});

test("payments: a second cell committed while a save is in flight warns instead of clashing", async ({
	page,
}) => {
	await openPayments(page);
	await acquirersTab(page).click();
	const stone = page.locator('[data-acquirer="Stone"]');
	// Segura a resposta do salvamento para a segunda edição acontecer com a primeira em andamento.
	await page.route("**/api/payments/fees**", async (route) => {
		if (route.request().method() === "PATCH") {
			await new Promise((resolve) => setTimeout(resolve, 1500));
		}
		await route.continue();
	});
	const debit = stone.getByLabel("Débito: Taxa", { exact: true });
	const days = stone.getByLabel("Débito: Dias para receber", { exact: true });
	await debit.fill("1,20");
	await debit.press("Enter");
	await days.fill("5");
	await days.press("Enter");
	await expect(
		page.getByText("Aguarde: a taxa anterior ainda está sendo salva."),
	).toBeVisible();
	await expect(page.getByText(/Já existe/)).toHaveCount(0);
	await expect(page.getByText("Taxa salva.")).toBeVisible();
	await expect(debit).toHaveValue("1,20");
});

test("payments: new validity copies the rates once and a repeated date shows the duplicate message", async ({
	page,
}) => {
	await openPayments(page);
	await acquirersTab(page).click();
	const stone = page.locator('[data-acquirer="Stone"]');
	const future = `${new Date().getFullYear() + 1}-05-10`;

	await stone.getByRole("button", { name: "Nova vigência" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Começa em").fill(future);
	await sheet.getByRole("button", { name: "Criar vigência" }).click();
	await expect(sheet).toBeHidden();
	await expect(stone.getByLabel("Vigência")).toHaveValue(future);
	await expect(stone.getByLabel("Débito: Taxa", { exact: true })).toHaveValue(
		"1,09",
	);

	await stone.getByRole("button", { name: "Nova vigência" }).click();
	await sheet.getByLabel("Começa em").fill(future);
	await sheet.getByRole("button", { name: "Criar vigência" }).click();
	await expect(
		sheet.getByText(/Já existe uma taxa dessa modalidade/),
	).toBeVisible();
});

test("payments: view as the counter clerk is read-only", async ({ page }) => {
	await openPayments(page);
	await expect(page.getByRole("button", { name: "Nova forma" })).toBeVisible();

	await page.getByRole("button", { name: /Visitante/ }).click();
	await page.getByRole("menuitem", { name: /Paulo Mendes/ }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "Você está como" }),
	).toBeVisible();

	await expect(page.getByText(/Só quem gerencia pagamentos/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Nova forma" })).toHaveCount(0);
	await acquirersTab(page).click();
	await expect(page.locator('[data-acquirer="Stone"]')).toBeVisible();
	await expect(page.getByLabel("Débito: Taxa", { exact: true })).toHaveCount(0);
	// Nenhum campo editável na área de operadoras.
	await expect(page.getByRole("tabpanel").locator("input")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Nova vigência" })).toHaveCount(
		0,
	);
	// "Ver" abre a operadora só para consulta, sem botão de salvar.
	await page
		.locator('[data-acquirer="Stone"]')
		.getByRole("button", { name: "Ver" })
		.click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(
		page.getByRole("dialog").getByRole("button", { name: "Salvar" }),
	).toHaveCount(0);
});
