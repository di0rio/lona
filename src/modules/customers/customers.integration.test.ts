import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "@/api";
import { withCheckDigits } from "@/lib/document";
import {
	auth,
	createCompany,
	createMembership,
	dashboardSummary,
	PermissionDeniedError,
} from "@/modules/access";
import { connectAsOwner, drizzleAsOwner, hasDatabase } from "@/test/database";
import { seedCustomersTemplate } from "./seed";
import {
	addVehicle,
	type CustomerInput,
	createCustomer,
	customerDetail,
	DuplicateDocumentError,
	DuplicatePlateError,
	InvalidCustomerError,
	listCustomers,
	updateCustomer,
	updateVehicle,
} from "./service";

const TWO_HOURS_FROM_NOW = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
const password = "senha-de-teste-123";

const cnpj = (root: string) => withCheckDigits(`${root}0001`);
const cpf = (base: string) => withCheckDigits(base);

const fleet = (over: Partial<CustomerInput> = {}): CustomerInput => ({
	kind: "fleet_owner",
	name: "Transportes Teste Ltda",
	document: cnpj("11222333"),
	phone: "(14) 99999-0000",
	city: "Jaú",
	state: "SP",
	creditLimit: "10000",
	status: "active",
	...over,
});

const soloDriver = (over: Partial<CustomerInput> = {}): CustomerInput => ({
	kind: "owner_operator",
	name: "João Autônomo",
	document: cpf("529982247"),
	phone: null,
	city: "Bauru",
	state: "SP",
	creditLimit: "0",
	status: "active",
	...over,
});

const aVehicle = {
	plate: "ZZZ9Z99",
	model: "Teste",
	axles: 2,
	year: null,
};

describe.skipIf(!hasDatabase)("customers", () => {
	let owner: pg.Pool;
	let companyId: string;
	const userIds: string[] = [];
	const extraCompanyIds: string[] = [];

	let boss: { id: string; cookie: string }; // dono
	let clerk: { id: string; cookie: string }; // balconista: view + create
	let mechanic: { id: string; cookie: string }; // só view
	let finance: { id: string; cookie: string }; // view + change_credit_limit
	let noView: string; // cargo sem nenhuma permissão de cliente
	let outsider: string; // sem vínculo

	beforeAll(async () => {
		owner = connectAsOwner();
		const db = drizzleAsOwner(owner);
		const company = await createCompany(db, {
			name: "Empresa de clientes",
			cnpjRoot: "11222333",
			expiresAt: TWO_HOURS_FROM_NOW(),
		});
		companyId = company.companyId;

		async function signUp(nickname: string, roleId: string | null) {
			const response = await auth.api.signUpEmail({
				body: {
					name: nickname,
					email: `${nickname}-${randomUUID().slice(0, 8)}@teste.lona.test`,
					password,
				},
				asResponse: true,
			});
			const { user } = (await response.json()) as { user: { id: string } };
			userIds.push(user.id);
			if (roleId) {
				await createMembership(db, {
					companyId,
					userId: user.id,
					branchId: null,
					roleId,
					level: "operate",
				});
			}
			const cookie = response.headers
				.getSetCookie()
				.map((c) => c.split(";")[0])
				.join("; ");
			return { id: user.id, cookie };
		}
		boss = await signUp("dono-clientes", company.roleIds.dono);
		clerk = await signUp("balconista-clientes", company.roleIds.balconista);
		mechanic = await signUp("mecanico-clientes", company.roleIds["mecânico"]);
		finance = await signUp("financeiro-clientes", company.roleIds.financeiro);
		outsider = (await signUp("sem-vinculo-clientes", null)).id;

		const { rows } = await owner.query<{ id: string }>(
			"INSERT INTO roles (company_id, name) VALUES ($1, 'sem-clientes') RETURNING id",
			[companyId],
		);
		noView = (await signUp("sem-view-clientes", rows[0].id)).id;
	});

	afterAll(async () => {
		// Apagar a empresa leva junto clientes e veículos (cascata).
		await owner.query("DELETE FROM companies WHERE id = ANY($1)", [
			[companyId, ...extraCompanyIds],
		]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await owner.end();
	});

	test("the template seed fits every constraint of the tables", async () => {
		const db = drizzleAsOwner(owner);
		const company = await createCompany(db, {
			name: "Empresa do seed",
			cnpjRoot: "11222333",
			expiresAt: TWO_HOURS_FROM_NOW(),
		});
		extraCompanyIds.push(company.companyId);
		const { customers } = await seedCustomersTemplate(db, company.companyId);
		expect(customers).toBe(40);
		const { rows } = await owner.query(
			"SELECT count(*)::int AS n FROM vehicles WHERE company_id = $1",
			[company.companyId],
		);
		expect(rows[0].n).toBeGreaterThan(100);
	});

	test("the dashboard summary lists the permissions of the user", async () => {
		const summary = await dashboardSummary(clerk.id);
		expect(summary?.permissions).toContain("customer.create");
		expect(summary?.permissions).not.toContain("customer.edit");
	});

	test("the clerk creates but cannot edit or set a credit limit", async () => {
		const id = await createCustomer(
			clerk.id,
			soloDriver({ name: "Do balcão" }),
		);
		expect(id).toBeTruthy();
		await expect(
			updateCustomer(clerk.id, id as string, { name: "Outro nome" }),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			createCustomer(
				clerk.id,
				fleet({ document: cnpj("22333444"), creditLimit: "5000" }),
			),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		// Sem limite, o balconista cadastra frotista normalmente.
		expect(
			await createCustomer(
				clerk.id,
				fleet({ document: cnpj("22333444"), creditLimit: "0" }),
			),
		).toBeTruthy();
		expect((await listCustomers(clerk.id))?.can).toEqual({
			create: true,
			edit: false,
			changeCreditLimit: false,
		});
	});

	test("finance changes only the credit limit", async () => {
		const id = (await createCustomer(
			boss.id,
			fleet({ document: cnpj("33444555") }),
		)) as string;
		// O formulário manda tudo; o que não muda não conta.
		expect(
			await updateCustomer(finance.id, id, {
				name: "Transportes Teste Ltda",
				creditLimit: "25000.5",
			}),
		).toBe(true);
		expect((await customerDetail(finance.id, id))?.customer.creditLimit).toBe(
			"25000.50",
		);
		await expect(
			updateCustomer(finance.id, id, { city: "Bauru" }),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			updateCustomer(finance.id, id, { creditLimit: "-1" }),
		).rejects.toBeInstanceOf(InvalidCustomerError);
	});

	test("the mechanic only sees", async () => {
		const id = (await createCustomer(
			boss.id,
			fleet({ document: cnpj("12121212") }),
		)) as string;
		expect((await listCustomers(mechanic.id))?.can).toEqual({
			create: false,
			edit: false,
			changeCreditLimit: false,
		});
		await expect(
			createCustomer(mechanic.id, soloDriver()),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			updateCustomer(mechanic.id, id, { name: "x" }),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(addVehicle(mechanic.id, id, aVehicle)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
	});

	test("without customer.view nothing is listed or shown", async () => {
		await expect(listCustomers(noView)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		await expect(customerDetail(noView, randomUUID())).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		// Sem empresa ativa não há lista.
		expect(await listCustomers(outsider)).toBeNull();
	});

	test("searches by partial name, ignoring case, and by partial document", async () => {
		await createCustomer(
			boss.id,
			fleet({ name: "Rodoviário Quintana", document: cnpj("44555666") }),
		);
		await createCustomer(
			boss.id,
			soloDriver({ name: "Zé da Quintana", document: cpf("111444777") }),
		);
		const byName = await listCustomers(boss.id, "quintana");
		expect(byName?.customers.map((c) => c.name)).toEqual([
			"Rodoviário Quintana",
			"Zé da Quintana",
		]);
		const byDocument = await listCustomers(boss.id, "44.555.666");
		expect(byDocument?.customers.map((c) => c.name)).toEqual([
			"Rodoviário Quintana",
		]);
		// % e _ da busca valem como texto, não como curinga.
		expect((await listCustomers(boss.id, "%"))?.customers).toEqual([]);
	});

	test("validates the fields", async () => {
		const field = (input: CustomerInput) =>
			createCustomer(boss.id, input).catch(
				(error: InvalidCustomerError) => error.field,
			);
		expect(await field(fleet({ document: "11222333000182" }))).toBe("document");
		expect(await field(soloDriver({ document: cnpj("55666777") }))).toBe(
			"document",
		);
		expect(await field(fleet({ document: cpf("111444777") }))).toBe("document");
		expect(await field(soloDriver({ creditLimit: "100" }))).toBe("creditLimit");
		expect(await field(fleet({ state: "XX" }))).toBe("state");
		expect(await field(fleet({ phone: "123" }))).toBe("phone");
		expect(await field(fleet({ name: "   " }))).toBe("name");
	});

	test("a repeated document is refused, even typed with the mask", async () => {
		await createCustomer(
			boss.id,
			fleet({ name: "Primeiro", document: cnpj("66777888") }),
		);
		await expect(
			createCustomer(
				boss.id,
				fleet({ name: "Segundo", document: cnpj("66777888") }),
			),
		).rejects.toBeInstanceOf(DuplicateDocumentError);
	});

	test("vehicles: normalizes the plate, refuses a repeat and bad data", async () => {
		const id = (await createCustomer(
			boss.id,
			fleet({ document: cnpj("77888999") }),
		)) as string;
		const vehicleId = (await addVehicle(clerk.id, id, {
			plate: "abc-1d23",
			model: "Scania R 450",
			axles: 3,
			year: 2021,
		})) as string;
		expect(vehicleId).toBeTruthy();
		const detail = await customerDetail(boss.id, id);
		expect(detail?.vehicles).toEqual([
			{
				id: vehicleId,
				plate: "ABC1D23",
				model: "Scania R 450",
				axles: 3,
				year: 2021,
			},
		]);
		expect(detail?.customer.vehicleCount).toBe(1);
		await expect(
			addVehicle(boss.id, id, { ...aVehicle, plate: "ABC1D23" }),
		).rejects.toBeInstanceOf(DuplicatePlateError);
		await expect(
			addVehicle(boss.id, id, { ...aVehicle, plate: "12345" }),
		).rejects.toMatchObject({ field: "plate" });
		await expect(
			addVehicle(boss.id, id, { ...aVehicle, axles: 12 }),
		).rejects.toMatchObject({ field: "axles" });
		expect(await addVehicle(boss.id, randomUUID(), aVehicle)).toBeNull();

		await expect(
			updateVehicle(clerk.id, vehicleId, { model: "x" }),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		expect(
			await updateVehicle(boss.id, vehicleId, {
				year: 2022,
				plate: "xyz-9876",
			}),
		).toBe(true);
		expect((await customerDetail(boss.id, id))?.vehicles[0]).toMatchObject({
			plate: "XYZ9876",
			year: 2022,
		});
		expect(await updateVehicle(boss.id, randomUUID(), { year: 2000 })).toBe(
			false,
		);
	});

	test("update edits, blocks, rechecks the document against the kind and reports a missing customer", async () => {
		const id = (await createCustomer(
			boss.id,
			fleet({ document: cnpj("88999000") }),
		)) as string;
		expect(
			await updateCustomer(boss.id, id, { status: "blocked", phone: null }),
		).toBe(true);
		expect((await customerDetail(boss.id, id))?.customer).toMatchObject({
			status: "blocked",
			phone: null,
		});
		await expect(
			updateCustomer(boss.id, id, { kind: "owner_operator" }),
		).rejects.toMatchObject({ field: "document" });
		expect(await updateCustomer(boss.id, randomUUID(), { name: "x" })).toBe(
			false,
		);
		expect(await customerDetail(boss.id, randomUUID())).toBeNull();
	});

	describe("routes", () => {
		const call = (
			cookie: string,
			method: string,
			path: string,
			body?: unknown,
		) =>
			app.handle(
				new Request(`http://localhost/api${path}`, {
					method,
					headers: { cookie, "content-type": "application/json" },
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
			);

		test("need a session", async () => {
			const response = await app.handle(
				new Request("http://localhost/api/customers"),
			);
			expect(response.status).toBe(401);
		});

		test("create, list, duplicate (409), invalid (422), forbidden (403), missing (404)", async () => {
			const document = cnpj("99000111");
			const created = await call(
				boss.cookie,
				"POST",
				"/customers",
				fleet({ document }),
			);
			expect(created.status).toBe(200);
			const { id } = (await created.json()) as { id: string };

			const listed = await call(boss.cookie, "GET", `/customers?q=${document}`);
			expect(listed.status).toBe(200);
			const view = (await listed.json()) as { customers: { id: string }[] };
			expect(view.customers.map((c) => c.id)).toEqual([id]);

			const duplicate = await call(
				boss.cookie,
				"POST",
				"/customers",
				fleet({ document }),
			);
			expect(duplicate.status).toBe(409);
			expect(await duplicate.json()).toMatchObject({ field: "document" });

			const invalid = await call(
				boss.cookie,
				"POST",
				"/customers",
				fleet({ document: "11222333000182" }),
			);
			expect(invalid.status).toBe(422);
			expect(await invalid.json()).toMatchObject({ field: "document" });

			const vehicle = {
				plate: "RTE5A67",
				model: "Volvo FH 540",
				axles: 3,
				year: 2020,
			};
			const added = await call(
				boss.cookie,
				"POST",
				`/customers/${id}/vehicles`,
				vehicle,
			);
			expect(added.status).toBe(200);
			const samePlate = await call(
				boss.cookie,
				"POST",
				`/customers/${id}/vehicles`,
				vehicle,
			);
			expect(samePlate.status).toBe(409);
			expect(await samePlate.json()).toMatchObject({ field: "plate" });

			expect(
				(await call(mechanic.cookie, "GET", `/customers/${id}`)).status,
			).toBe(200);
			expect(
				(
					await call(mechanic.cookie, "PATCH", `/customers/${id}`, {
						name: "x",
					})
				).status,
			).toBe(403);
			expect(
				(
					await call(boss.cookie, "PATCH", `/customers/${id}`, {
						name: "Novo nome",
					})
				).status,
			).toBe(200);
			expect(
				(await call(boss.cookie, "GET", `/customers/${randomUUID()}`)).status,
			).toBe(404);
		});
	});
});
