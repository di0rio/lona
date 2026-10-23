import { randomInt, randomUUID } from "node:crypto";
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

/** CNPJ válido (com os dígitos verificadores) a partir de 12 dígitos aleatórios. */
function randomCnpj() {
	const digits = Array.from({ length: 12 }, () => randomInt(0, 10));
	for (const weights of [
		[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
		[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
	]) {
		const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
		digits.push(sum % 11 < 2 ? 0 : 11 - (sum % 11));
	}
	return digits.join("");
}

async function startDemo(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
	// O tour é um dialog não modal e entraria nos `getByRole("dialog")` dos sheets; ele tem teste próprio em tour.spec.ts.
	await page.getByRole("button", { name: "Pular" }).click();
}

async function viewAs(page: Page, person: RegExp) {
	await page.getByRole("button", { name: /Visitante/ }).click();
	await page.getByRole("menuitem", { name: person }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "Você está como" }),
	).toBeVisible();
}

test("owner adds a fleet owner and a vehicle, finds it by name and document, and edits the credit limit", async ({
	page,
}) => {
	const suffix = randomUUID().slice(0, 8);
	const name = `Transportes ${suffix} Ltda`;
	const cnpj = randomCnpj();
	await startDemo(page);

	await page.getByRole("link", { name: "Clientes" }).click();
	await expect(page).toHaveURL(/\/painel\/clientes$/);
	await page.getByRole("button", { name: "Novo cliente" }).click();

	const sheet = page.getByRole("dialog");
	await sheet.getByLabel("Nome").fill(name);
	await sheet.getByLabel("CNPJ").fill("11111111000111");
	await sheet.getByLabel("CNPJ").blur();
	await expect(sheet.getByRole("alert")).toContainText("Documento inválido");

	await sheet.getByLabel("CNPJ").fill(cnpj);
	await sheet.getByLabel("Cidade").fill("Jaú");
	await sheet.getByLabel("UF").selectOption("SP");
	await sheet.getByLabel("Limite de crédito").fill("15.000,00");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();

	const row = page.getByRole("row", { name: new RegExp(name) });
	await expect(row).toContainText("Frotista");
	await expect(row).toContainText(/R\$\s15\.000,00/);

	const search = page.getByRole("searchbox", { name: "Buscar cliente" });
	await search.fill(suffix);
	await expect(page).toHaveURL(new RegExp(`q=${suffix}`));
	await expect(row).toBeVisible();
	await search.fill(cnpj.slice(0, 8));
	await expect(page).toHaveURL(new RegExp(`q=${cnpj.slice(0, 8)}`));
	await expect(row).toBeVisible();
	await search.fill(`zz${suffix}`);
	await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
	await search.fill(suffix);

	await row.getByRole("link", { name }).click();
	await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(page.getByText("Nenhum veículo cadastrado")).toBeVisible();

	await page.getByRole("button", { name: "Adicionar veículo" }).click();
	const vehicleSheet = page.getByRole("dialog");
	await vehicleSheet.getByLabel("Placa").fill("BRA2E19");
	await vehicleSheet.getByLabel("Modelo").fill("Scania R450");
	await vehicleSheet.getByLabel("Eixos").fill("3");
	await vehicleSheet.getByLabel("Ano").fill("2021");
	await vehicleSheet.getByRole("button", { name: "Salvar" }).click();
	await expect(vehicleSheet).toBeHidden();
	await expect(
		page.getByRole("cell", { name: "BRA2E19", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("cell", { name: "Scania R450", exact: true }),
	).toBeVisible();

	await page
		.getByRole("button", { name: "Editar", exact: true })
		.first()
		.click();
	const editSheet = page.getByRole("dialog");
	await editSheet.getByLabel("Limite de crédito").fill("20.000,00");
	await editSheet.getByRole("button", { name: "Salvar" }).click();
	await expect(editSheet).toBeHidden();
	await expect(page.getByText(/R\$\s20\.000,00/)).toBeVisible();
});

test("counter clerk can add customers but not edit them, and the mechanic cannot add", async ({
	page,
}) => {
	const name = `Autônomo ${randomUUID().slice(0, 8)}`;
	await startDemo(page);
	await page.goto("/painel/clientes");
	await page.getByRole("button", { name: "Novo cliente" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("radio", { name: "Autônomo" }).click();
	await sheet.getByLabel("Nome").fill(name);
	await sheet.getByLabel("CPF").fill("52998224725");
	await sheet.getByLabel("Cidade").fill("Bauru");
	await sheet.getByLabel("UF").selectOption("SP");
	await sheet.getByRole("button", { name: "Salvar" }).click();
	await expect(sheet).toBeHidden();
	const row = page.getByRole("row", { name: new RegExp(name) });
	await expect(row).toContainText("529.982.247-25");
	await row.getByRole("link", { name }).click();
	await expect(page.getByRole("heading", { name })).toBeVisible();
	const detailUrl = page.url();
	await expect(
		page.getByRole("button", { name: "Editar", exact: true }),
	).toBeVisible();

	await viewAs(page, /Paulo Mendes/);
	await page.goto("/painel/clientes");
	await expect(
		page.getByRole("button", { name: "Novo cliente" }),
	).toBeVisible();
	await page.goto(detailUrl);
	await expect(page.getByRole("heading", { name })).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Editar", exact: true }),
	).toHaveCount(0);

	await page.getByRole("button", { name: "Voltar pro dono" }).click();
	await viewAs(page, /Edson Carvalho/);
	await page.goto("/painel/clientes");
	await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible();
	await expect(page.getByRole("button", { name: "Novo cliente" })).toHaveCount(
		0,
	);
});
