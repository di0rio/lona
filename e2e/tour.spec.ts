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

const countdown = /\d:\d{2}:\d{2}/;

async function startDemo(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "Testar demonstração" }).click();
	await expect(page).toHaveURL(/\/painel$/);
}

test("the tour shows on the first demonstration entry and walks through every step", async ({
	page,
}) => {
	await startDemo(page);

	const tour = page.getByRole("dialog", { name: "Menu lateral" });
	await expect(tour).toBeVisible();
	await expect(tour).toHaveAttribute("aria-modal", "false");
	await expect(tour).toContainText("1 de 4");
	await expect(tour).toBeFocused();

	// Não bloqueia a página: o resto continua clicável.
	await expect(page.getByRole("link", { name: "Clientes" })).toBeEnabled();

	await tour.getByRole("button", { name: "Próximo" }).click();
	await expect(page.getByRole("dialog", { name: "Busca" })).toContainText(
		"2 de 4",
	);
	await page.getByRole("button", { name: "Próximo" }).click();
	await expect(page.getByRole("dialog", { name: "Ver como" })).toContainText(
		"3 de 4",
	);
	await page.getByRole("button", { name: "Próximo" }).click();
	await expect(
		page.getByRole("dialog", { name: "Contador da demonstração" }),
	).toContainText("4 de 4");
	await page.getByRole("button", { name: "Concluir" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("skipping closes the tour and it does not come back after a reload", async ({
	page,
}) => {
	await startDemo(page);

	await page.getByRole("button", { name: "Pular" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);

	await page.reload();
	// O contador só mostra a hora depois de hidratar, então o tour já teria aberto.
	await expect(page.getByText(countdown)).toBeVisible();
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Ver o tour in the user menu shows the tour again from the first step", async ({
	page,
}) => {
	await startDemo(page);
	await page.getByRole("button", { name: "Pular" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);

	await page.getByRole("button", { name: /Visitante/ }).click();
	await page.getByRole("menuitem", { name: "Ver o tour" }).click();

	const tour = page.getByRole("dialog", { name: "Menu lateral" });
	await expect(tour).toContainText("1 de 4");
	await expect(tour).toBeFocused();
});

test("opening Ver como in the middle of the tour closes it", async ({
	page,
}) => {
	await startDemo(page);
	await expect(page.getByRole("dialog", { name: "Menu lateral" })).toBeVisible();

	await page.getByRole("button", { name: /Visitante/ }).click();
	await page.getByRole("menuitem", { name: /Paulo Mendes/ }).click();
	await expect(
		page.getByRole("status").filter({ hasText: "Você está como" }),
	).toBeVisible();
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("arrow keys move between steps and Esc closes the tour", async ({
	page,
}) => {
	await startDemo(page);
	await expect(
		page.getByRole("dialog", { name: "Menu lateral" }),
	).toBeFocused();

	await page.keyboard.press("ArrowRight");
	await expect(page.getByRole("dialog", { name: "Busca" })).toContainText(
		"2 de 4",
	);
	await page.keyboard.press("ArrowLeft");
	await expect(
		page.getByRole("dialog", { name: "Menu lateral" }),
	).toContainText("1 de 4");

	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);

	await page.reload();
	await expect(page.getByText(countdown)).toBeVisible();
	await expect(page.getByRole("dialog")).toHaveCount(0);
});
