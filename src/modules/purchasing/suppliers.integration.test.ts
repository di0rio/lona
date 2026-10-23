import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "@/api";
import {
	auth,
	branchCnpj,
	createCompany,
	createMembership,
	PermissionDeniedError,
} from "@/modules/access";
import {
	asApp,
	connectAsApp,
	connectAsOwner,
	drizzleAsOwner,
	hasDatabase,
} from "@/test/database";
import {
	createSupplier,
	DuplicateSupplierCnpjError,
	InvalidCnpjError,
	listSuppliers,
	type SupplierInput,
	setSupplierActive,
	updateSupplier,
} from "./service";

// CNPJ válido e diferente a cada número, só para os testes não colidirem.
const cnpjOf = (n: number) => branchCnpj(`1000000${n}`, 1);

const supplier = (over: Partial<SupplierInput> = {}): SupplierInput => ({
	legalName: "Freios Brasil Ltda",
	cnpj: "11222333000181",
	contactName: "Ana Souza",
	phone: "14999998888",
	city: "Jaú",
	state: "SP",
	...over,
});

describe.skipIf(!hasDatabase)("suppliers", () => {
	let owner: pg.Pool;
	let appPool: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let companyAId: string;
	let companyBId: string;
	let ownerA: { id: string; cookie: string };
	let ownerB: { id: string; cookie: string };
	let financeA: { id: string; cookie: string }; // consulta, não cadastra
	let mechanicA: { id: string; cookie: string }; // nem consulta

	async function signUp(nickname: string) {
		const response = await auth.api.signUpEmail({
			body: {
				name: nickname,
				email: `${nickname}-${randomUUID().slice(0, 8)}@teste.lona.test`,
				password: "senha-de-teste-123",
			},
			asResponse: true,
		});
		const { user } = (await response.json()) as { user: { id: string } };
		userIds.push(user.id);
		const cookie = response.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");
		return { id: user.id, cookie };
	}

	beforeAll(async () => {
		owner = connectAsOwner();
		appPool = connectAsApp();
		const db = drizzleAsOwner(owner);
		const newCompany = async (name: string) => {
			const company = await createCompany(db, {
				name,
				cnpjRoot: "11222333",
				expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
			});
			companyIds.push(company.companyId);
			return company;
		};
		const companyA = await newCompany("Empresa A");
		const companyB = await newCompany("Empresa B");
		companyAId = companyA.companyId;
		companyBId = companyB.companyId;
		ownerA = await signUp("dono-a");
		ownerB = await signUp("dono-b");
		financeA = await signUp("financeiro-a");
		mechanicA = await signUp("mecanico-a");
		for (const [company, user, role] of [
			[companyA, ownerA, "dono"],
			[companyB, ownerB, "dono"],
			[companyA, financeA, "financeiro"],
			[companyA, mechanicA, "mecânico"],
		] as const) {
			await createMembership(db, {
				companyId: company.companyId,
				userId: user.id,
				branchId: null,
				roleId: company.roleIds[role],
				level: "operate",
			});
		}
	});

	afterAll(async () => {
		await owner.query("DELETE FROM companies WHERE id = ANY($1)", [companyIds]);
		await owner.query("DELETE FROM auth.users WHERE id = ANY($1)", [userIds]);
		await Promise.all([owner.end(), appPool.end()]);
	});

	test("creates a supplier and lists it by legal name", async () => {
		const id = await createSupplier(ownerA.id, supplier());
		await createSupplier(
			ownerA.id,
			supplier({ legalName: "Alfa Autopeças", cnpj: "11444777000161" }),
		);

		const view = await listSuppliers(ownerA.id);

		expect(view?.canManage).toBe(true);
		expect(view?.suppliers.map((s) => s.legalName)).toEqual([
			"Alfa Autopeças",
			"Freios Brasil Ltda",
		]);
		expect(view?.suppliers[1]).toEqual({ ...supplier(), id, active: true });
	});

	test("accepts an alphanumeric CNPJ and a supplier without contact or phone", async () => {
		await createSupplier(
			ownerA.id,
			supplier({
				legalName: "Nova Era",
				cnpj: "12ABC34501DE35",
				contactName: null,
				phone: null,
			}),
		);
		const found = (await listSuppliers(ownerA.id))?.suppliers.find(
			(s) => s.cnpj === "12ABC34501DE35",
		);
		expect(found).toMatchObject({ contactName: null, phone: null });
	});

	test("rejects an invalid CNPJ", async () => {
		await expect(
			createSupplier(ownerA.id, supplier({ cnpj: "11222333000182" })),
		).rejects.toBeInstanceOf(InvalidCnpjError);
	});

	test("rejects a duplicated CNPJ in the same company, but allows it in another", async () => {
		await expect(createSupplier(ownerA.id, supplier())).rejects.toBeInstanceOf(
			DuplicateSupplierCnpjError,
		);
		await expect(createSupplier(ownerB.id, supplier())).resolves.toEqual(
			expect.any(String),
		);
	});

	test("edits and inactivates a supplier", async () => {
		const id = (await createSupplier(
			ownerA.id,
			supplier({ legalName: "Editar Ltda", cnpj: cnpjOf(1) }),
		)) as string;

		expect(
			await updateSupplier(
				ownerA.id,
				id,
				supplier({ legalName: "Editada Ltda", cnpj: cnpjOf(1), city: "Bauru" }),
			),
		).toBe(true);
		expect(await setSupplierActive(ownerA.id, id, false)).toBe(true);

		const row = (await listSuppliers(ownerA.id))?.suppliers.find(
			(s) => s.id === id,
		);
		expect(row).toMatchObject({
			legalName: "Editada Ltda",
			city: "Bauru",
			active: false,
		});
		expect(await updateSupplier(ownerA.id, randomUUID(), supplier())).toBe(
			false,
		);
	});

	test("finance views but does not create, edit or inactivate", async () => {
		const view = await listSuppliers(financeA.id);
		expect(view?.canManage).toBe(false);
		expect(view?.suppliers.length).toBeGreaterThan(0);
		const id = view?.suppliers[0].id as string;

		await expect(
			createSupplier(financeA.id, supplier({ cnpj: cnpjOf(2) })),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			updateSupplier(financeA.id, id, supplier()),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(
			setSupplierActive(financeA.id, id, false),
		).rejects.toBeInstanceOf(PermissionDeniedError);
	});

	test("a mechanic cannot even view suppliers", async () => {
		await expect(listSuppliers(mechanicA.id)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
	});

	test("RLS: the other company sees none of it and cannot write into this one", async () => {
		const mine = await asApp(
			appPool,
			{ userId: ownerA.id, companyId: companyAId },
			async (c) =>
				(await c.query("SELECT DISTINCT company_id FROM suppliers")).rows,
		);
		expect(mine).toEqual([{ company_id: companyAId }]);

		// B tenta ler A, escrever em A e mexer num fornecedor de A.
		await asApp(
			appPool,
			{ userId: ownerB.id, companyId: companyBId },
			async (c) => {
				const { rows } = await c.query(
					"SELECT 1 FROM suppliers WHERE company_id = $1",
					[companyAId],
				);
				expect(rows).toEqual([]);
				const update = await c.query(
					"UPDATE suppliers SET active = false WHERE company_id = $1",
					[companyAId],
				);
				expect(update.rowCount).toBe(0);
				await expect(
					c.query(
						`INSERT INTO suppliers (company_id, legal_name, cnpj, city, state)
						VALUES ($1, 'Invasor', '11222333000181', 'Jaú', 'SP')`,
						[companyAId],
					),
				).rejects.toThrow(/row-level security/);
			},
		);

		// Sem empresa no contexto, nada aparece.
		const none = await asApp(
			appPool,
			{ userId: ownerA.id },
			async (c) => (await c.query("SELECT 1 FROM suppliers")).rowCount,
		);
		expect(none).toBe(0);
	});

	describe("routes", () => {
		const call = (
			cookie: string,
			method: string,
			path: string,
			body?: unknown,
		) =>
			app.handle(
				new Request(`http://localhost/api/suppliers${path}`, {
					method,
					headers: { cookie, "content-type": "application/json" },
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
			);

		test("without a session it answers 401", async () => {
			expect((await call("", "GET", "")).status).toBe(401);
		});

		test("POST accepts a valid body and GET lists it", async () => {
			const created = await call(
				ownerA.cookie,
				"POST",
				"",
				supplier({ legalName: "Rota Ltda", cnpj: cnpjOf(3) }),
			);
			expect(created.status).toBe(200);

			const response = await call(ownerA.cookie, "GET", "");
			expect(response.status).toBe(200);
			const view = (await response.json()) as {
				suppliers: { legalName: string }[];
			};
			expect(view.suppliers.map((s) => s.legalName)).toContain("Rota Ltda");
		});

		test("403 for finance on write, 403 for a mechanic on read", async () => {
			const write = await call(
				financeA.cookie,
				"POST",
				"",
				supplier({ cnpj: cnpjOf(4) }),
			);
			expect(write.status).toBe(403);
			expect((await call(mechanicA.cookie, "GET", "")).status).toBe(403);
		});

		test("409 for a duplicated CNPJ and 422 for a wrong check digit", async () => {
			const duplicate = await call(ownerA.cookie, "POST", "", supplier());
			expect(duplicate.status).toBe(409);
			expect(await duplicate.json()).toMatchObject({ field: "cnpj" });

			const invalid = await call(
				ownerA.cookie,
				"POST",
				"",
				supplier({ cnpj: "11222333000182" }),
			);
			expect(invalid.status).toBe(422);
		});

		test("PUT edits, PATCH inactivates, and an unknown or foreign id is 404", async () => {
			const id = (await listSuppliers(ownerA.id))?.suppliers[0].id as string;
			const current = (await listSuppliers(ownerA.id))
				?.suppliers[0] as SupplierInput;

			const put = await call(ownerA.cookie, "PUT", `/${id}`, {
				...current,
				city: "Marília",
			});
			expect(put.status).toBe(200);
			const patch = await call(ownerA.cookie, "PATCH", `/${id}/active`, {
				active: false,
			});
			expect(patch.status).toBe(200);

			expect(
				(await call(ownerA.cookie, "PUT", `/${randomUUID()}`, supplier()))
					.status,
			).toBe(404);
			const foreign = await call(ownerB.cookie, "PATCH", `/${id}/active`, {
				active: true,
			});
			expect(foreign.status).toBe(404);
		});

		test("422 when the body is invalid", async () => {
			const bad: unknown[] = [
				supplier({ legalName: "  " }),
				supplier({ cnpj: "11.222.333/0001-81" }),
				supplier({ cnpj: "1122233300018" }),
				supplier({ phone: "(14) 99999-8888" }),
				supplier({ state: "XX" }),
				supplier({ city: "" }),
			];
			for (const body of bad) {
				expect((await call(ownerA.cookie, "POST", "", body)).status).toBe(422);
			}
		});
	});
});
