import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "@/api";
import {
	auth,
	createCompany,
	createMembership,
	PermissionDeniedError,
} from "@/modules/access";
import { connectAsOwner, drizzleAsOwner, hasDatabase } from "@/test/database";
import {
	createPart,
	DuplicatePartCodeError,
	listParts,
	type PartInput,
	setPartActive,
	updatePart,
} from "./service";

const part = (over: Partial<PartInput> = {}): PartInput => ({
	code: "PF-001",
	description: "Válvula relé de freio",
	brand: "Wabco",
	manufacturerRef: null,
	unit: "UN",
	ncm: "87083090",
	salePrice: "1234.50",
	applications: [
		{ vehicleModel: "Mercedes-Benz Atego 2426", axle: "rear" },
		{ vehicleModel: "Volvo FH 460", axle: null },
	],
	...over,
});

const main = () => part({ manufacturerRef: "973 011 000 0" });

describe.skipIf(!hasDatabase)("parts", () => {
	let owner: pg.Pool;
	const companyIds: string[] = [];
	const userIds: string[] = [];

	let ownerA: { id: string; cookie: string };
	let ownerB: { id: string; cookie: string };
	let companyBId: string;
	let clerkA: { id: string; cookie: string }; // balconista: consulta, não cria
	let outsider: string; // sem vínculo

	// Usuário real (com sessão), para os testes das rotas.
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
		companyBId = companyB.companyId;
		ownerA = await signUp("dono-a");
		ownerB = await signUp("dono-b");
		clerkA = await signUp("balconista-a");
		outsider = (await signUp("sem-vinculo")).id;
		for (const [company, user, role] of [
			[companyA, ownerA, "dono"],
			[companyB, ownerB, "dono"],
			[companyA, clerkA, "balconista"],
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
		await owner.end();
	});

	const codes = async (userId: string, search?: string) =>
		(await listParts(userId, search))?.parts.map((p) => p.code);

	test("creates a part with its applications and lists it", async () => {
		const id = await createPart(ownerA.id, main());
		const view = await listParts(ownerA.id);

		expect(view?.canManage).toBe(true);
		expect(view?.limited).toBe(false);
		expect(view?.parts).toEqual([{ ...main(), id, active: true }]);
	});

	test("rejects a duplicated code in the same company, but allows it in another", async () => {
		await expect(createPart(ownerA.id, part())).rejects.toBeInstanceOf(
			DuplicatePartCodeError,
		);
		await expect(createPart(ownerB.id, part())).resolves.toEqual(
			expect.any(String),
		);
	});

	test("edits a part replacing the whole list of applications", async () => {
		const id = (await createPart(
			ownerA.id,
			part({ code: "ED-001", description: "Pastilha de freio" }),
		)) as string;

		const found = await updatePart(
			ownerA.id,
			id,
			part({
				code: "ED-001",
				description: "Pastilha de freio traseira",
				salePrice: "99.90",
				applications: [{ vehicleModel: "Scania R 450", axle: "front" }],
			}),
		);

		expect(found).toBe(true);
		const edited = (await listParts(ownerA.id, "ED-001"))?.parts[0];
		expect(edited?.description).toBe("Pastilha de freio traseira");
		expect(edited?.salePrice).toBe("99.90");
		expect(edited?.applications).toEqual([
			{ vehicleModel: "Scania R 450", axle: "front" },
		]);
	});

	test("editing to another code in use is a duplicate, and an unknown id is not found", async () => {
		const id = (await createPart(ownerA.id, part({ code: "DUP-1" }))) as string;
		await expect(
			updatePart(ownerA.id, id, part({ code: "PF-001" })),
		).rejects.toBeInstanceOf(DuplicatePartCodeError);
		expect(await updatePart(ownerA.id, randomUUID(), part())).toBe(false);
	});

	test("deactivates and reactivates a part without deleting it", async () => {
		const id = (await createPart(
			ownerA.id,
			part({ code: "IN-001" }),
		)) as string;

		expect(await setPartActive(ownerA.id, id, false)).toBe(true);
		const view = await listParts(ownerA.id, "IN-001");
		expect(view?.parts[0]).toMatchObject({ code: "IN-001", active: false });

		await setPartActive(ownerA.id, id, true);
		expect((await listParts(ownerA.id, "IN-001"))?.parts[0].active).toBe(true);
	});

	test("searches by code, ignoring case", async () => {
		expect(await codes(ownerA.id, "pf-001")).toEqual(["PF-001"]);
	});

	test("searches the description without accents: 'valvula' finds 'Válvula'", async () => {
		expect(await codes(ownerA.id, "valvula")).toContain("PF-001");
		expect(await codes(ownerA.id, "VÁLVULA RELÉ")).toContain("PF-001");
	});

	test("searches by manufacturer reference and by application", async () => {
		expect(await codes(ownerA.id, "973 011")).toEqual(["PF-001"]);
		expect(await codes(ownerA.id, "atego")).toContain("PF-001");
		expect(await codes(ownerA.id, "scania")).toEqual(["ED-001"]);
	});

	test("every word of the search must match the part or one of its applications", async () => {
		const lona = (code: string, side: string, model: string) =>
			createPart(
				ownerA.id,
				part({
					code,
					description: `Lona de freio ${side}`,
					applications: [{ vehicleModel: model, axle: null }],
				}),
			);
		await lona("LN-T", "traseira", "Mercedes-Benz Atego 2426");
		await lona("LN-D", "dianteira", "Mercedes-Benz Atego 2426");
		await lona("LN-V", "traseira", "Volvo FH 460");

		expect(await codes(ownerA.id, "lona atego traseira")).toEqual(["LN-T"]);
		expect(await codes(ownerA.id, "  LONA   atego ")).toEqual(["LN-D", "LN-T"]);
		expect(await codes(ownerA.id, "lona volvo dianteira")).toEqual([]);
	});

	test("the search treats % and _ as plain text", async () => {
		expect(await codes(ownerA.id, "%")).toEqual([]);
		expect(await codes(ownerA.id, "PF_001")).toEqual([]);
	});

	test("lists in code order and flags when it hit the limit", async () => {
		// Direto pelo dono: 201 transações do app seriam lentas e não é isso que se testa.
		await owner.query(
			`INSERT INTO parts (company_id, code, description, brand, unit, sale_price)
			SELECT $1, 'LIM-' || lpad(n::text, 3, '0'), 'Peça', 'Marca', 'UN', 1 FROM generate_series(0, 200) n`,
			[companyBId],
		);

		const view = await listParts(ownerB.id, "LIM-");
		expect(view?.parts).toHaveLength(200);
		expect(view?.limited).toBe(true);
		expect(view?.parts[0].code).toBe("LIM-000");
		expect(view?.parts[199].code).toBe("LIM-199");
	}, 120_000);

	test("a clerk can view but not create, edit or deactivate", async () => {
		expect((await listParts(clerkA.id))?.canManage).toBe(false);
		const id = (await listParts(clerkA.id, "PF-001"))?.parts[0].id as string;
		await expect(
			createPart(clerkA.id, part({ code: "NOVA" })),
		).rejects.toBeInstanceOf(PermissionDeniedError);
		await expect(updatePart(clerkA.id, id, part())).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
		await expect(setPartActive(clerkA.id, id, false)).rejects.toBeInstanceOf(
			PermissionDeniedError,
		);
	});

	test("without a company there is nothing to list", async () => {
		expect(await listParts(outsider)).toBeNull();
		expect(await createPart(outsider, part())).toBeNull();
	});

	describe("routes", () => {
		const call = (
			cookie: string,
			method: string,
			path: string,
			body?: unknown,
		) =>
			app.handle(
				new Request(`http://localhost/api/parts${path}`, {
					method,
					headers: { cookie, "content-type": "application/json" },
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
			);

		test("without a session it answers 401", async () => {
			expect((await call("", "GET", "")).status).toBe(401);
		});

		test("GET lists with ?search= and POST creates", async () => {
			const created = await call(
				ownerA.cookie,
				"POST",
				"",
				part({ code: "RT-001", description: "Cuíca de freio" }),
			);
			expect(created.status).toBe(200);

			const response = await call(ownerA.cookie, "GET", "?search=cuica");
			expect(response.status).toBe(200);
			const view = (await response.json()) as { parts: { code: string }[] };
			expect(view.parts.map((p) => p.code)).toEqual(["RT-001"]);
		});

		test("403 for a clerk, 409 for a duplicated code", async () => {
			const denied = await call(
				clerkA.cookie,
				"POST",
				"",
				part({ code: "RT-002" }),
			);
			expect(denied.status).toBe(403);

			const duplicate = await call(
				ownerA.cookie,
				"POST",
				"",
				part({ code: "RT-001" }),
			);
			expect(duplicate.status).toBe(409);
			expect(await duplicate.json()).toMatchObject({ field: "code" });
		});

		test("PUT edits, PATCH inactivates, and an unknown or foreign id is 404", async () => {
			const created = await call(
				ownerA.cookie,
				"POST",
				"",
				part({ code: "RT-003" }),
			);
			const { id } = (await created.json()) as { id: string };

			const put = await call(
				ownerA.cookie,
				"PUT",
				`/${id}`,
				part({ code: "RT-003", brand: "Knorr" }),
			);
			expect(put.status).toBe(200);
			const patch = await call(ownerA.cookie, "PATCH", `/${id}/active`, {
				active: false,
			});
			expect(patch.status).toBe(200);
			const edited = (await listParts(ownerA.id, "RT-003"))?.parts[0];
			expect(edited).toMatchObject({ brand: "Knorr", active: false });

			const unknown = await call(
				ownerA.cookie,
				"PUT",
				`/${randomUUID()}`,
				part(),
			);
			expect(unknown.status).toBe(404);
			// Peça de outra empresa também é 404: o RLS não a mostra.
			const foreign = await call(ownerB.cookie, "PATCH", `/${id}/active`, {
				active: true,
			});
			expect(foreign.status).toBe(404);
		});

		test("422 when the body is invalid", async () => {
			const bad: unknown[] = [
				part({ code: "   " }),
				part({ ncm: "123" }),
				part({ unit: "XX" as never }),
				part({ salePrice: "12,50" }),
				part({ salePrice: "1.234" }),
				part({
					applications: [{ vehicleModel: "Atego", axle: "left" as never }],
				}),
			];
			for (const body of bad) {
				expect((await call(ownerA.cookie, "POST", "", body)).status).toBe(422);
			}
			const badId = await call(ownerA.cookie, "PATCH", "/nao-e-uuid/active", {
				active: true,
			});
			expect(badId.status).toBe(422);
		});
	});
});
