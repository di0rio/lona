import { randomInt } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { rememberE2eUser } from "../src/test/cleanup";

// Conexão do dono só para limpar o que o teste criou.
const owner = new pg.Pool({
	connectionString: (process.env.DATABASE_URL_UNPOOLED ?? "").replace(
		"sslmode=require",
		"sslmode=verify-full",
	),
	max: 2,
});
const userIds = new Set<string>();

// Mesmo motivo do demo.spec.ts: o rate limit é por IP, então cada teste usa o seu.
test.beforeEach(async ({ page }) => {
	await page.context().setExtraHTTPHeaders({
		"x-forwarded-for": `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`,
	});
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

async function startDemo(page: Page, path: string) {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	await page.goto(path);
}

test("parts: search by application, create with two applications, edit and deactivate", async ({
	page,
}) => {
	await startDemo(page, "/painel/pecas");
	await expect(page.getByRole("heading", { name: "Peças" })).toBeVisible();

	// Cria uma peça com duas aplicações.
	await page.getByRole("button", { name: "Nova peça" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Código", { exact: true }).fill("E2E-001");
	await sheet.getByLabel("Descrição").fill("Pastilha de freio de teste");
	await sheet.getByLabel("Marca", { exact: true }).fill("Teste");
	await sheet.getByLabel("Preço de venda (R$)").fill("1.234,56");
	await sheet.getByRole("button", { name: "Adicionar aplicação" }).click();
	await sheet
		.getByLabel("Modelo do veículo 1")
		.fill("Mercedes-Benz Atego 2426");
	await sheet.getByLabel("Eixo 1").selectOption("rear");
	await sheet.getByRole("button", { name: "Adicionar aplicação" }).click();
	await sheet.getByLabel("Modelo do veículo 2").fill("Scania R450");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();

	// Busca por aplicação: atualiza ?q= na URL e filtra a lista.
	await page.getByRole("searchbox", { name: "Buscar peça" }).fill("atego");
	await expect(page).toHaveURL(/[?&]q=atego/);
	const row = page.getByRole("row", { name: /E2E-001/ });
	await expect(row).toContainText("Mercedes-Benz Atego 2426");
	await expect(row).toContainText("+1");
	await expect(row).toContainText("1.234,56");

	// Código repetido mostra o erro no campo.
	await page.getByRole("button", { name: "Nova peça" }).click();
	await sheet.getByLabel("Código", { exact: true }).fill("E2E-001");
	await sheet.getByLabel("Descrição").fill("Outra");
	await sheet.getByLabel("Marca", { exact: true }).fill("Teste");
	await sheet.getByLabel("Preço de venda (R$)").fill("10");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet.getByRole("alert")).toContainText(
		"Já existe peça com esse código",
	);
	await sheet.getByRole("button", { name: "Close" }).click();
	await expect(sheet).toBeHidden();

	// Edita.
	await row.getByRole("button", { name: "Editar" }).click();
	await sheet.getByLabel("Descrição").fill("Pastilha de freio revisada");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();
	await expect(row).toContainText("Pastilha de freio revisada");

	// Inativa.
	await row.getByRole("button", { name: "Inativar" }).click();
	await expect(row).toContainText("Inativa");
});

test("suppliers: invalid CNPJ shows an error, valid one is created and edited", async ({
	page,
}) => {
	await startDemo(page, "/painel/fornecedores");
	await expect(
		page.getByRole("heading", { name: "Fornecedores" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Novo fornecedor" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Razão social").fill("Freios E2E Ltda");
	await sheet.getByLabel("CNPJ").fill("11222333000182");
	await sheet.getByLabel("Cidade").fill("Jaú");
	await sheet.getByLabel("UF").selectOption("SP");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet.getByRole("alert")).toContainText("CNPJ inválido");

	await sheet.getByLabel("CNPJ").fill("11222333000181");
	await sheet.getByLabel("Contato (opcional)").fill("Marcos");
	await sheet.getByLabel("Telefone (opcional)").fill("14912345678");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();

	const row = page.getByRole("row", { name: /Freios E2E/ });
	await expect(row).toContainText("11.222.333/0001-81");
	await expect(row).toContainText("(14) 91234-5678");
	await expect(row).toContainText("Jaú/SP");

	await row.getByRole("button", { name: "Editar" }).click();
	await sheet.getByLabel("Cidade").fill("Bauru");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();
	await expect(row).toContainText("Bauru/SP");
});
