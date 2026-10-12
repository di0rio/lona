import { eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { companies, type Level, users } from "./schema";
import { createBranch, createCompany, createMembership } from "./service";

type Db = Pick<Transaction, "insert" | "delete" | "select">;

const cnpjRoot = "11222333"; // fictícia, só no formato

// Uma pessoa por cargo, para o "ver como". Sem senha: ninguém entra com elas, só se olha pelos olhos delas.
const people: {
	name: string;
	email: string;
	role: string;
	memberships: { branch: "JAU" | "BAU" | null; level: Level }[];
}[] = [
	{
		name: "Marcos Freitas",
		email: "marcos@modelo.lona.test",
		role: "dono",
		memberships: [{ branch: null, level: "operate" }],
	},
	{
		name: "Renata Lopes",
		email: "renata@modelo.lona.test",
		role: "gerente",
		memberships: [
			{ branch: "JAU", level: "operate" },
			{ branch: "BAU", level: "view" },
		],
	},
	{
		name: "Paulo Mendes",
		email: "paulo@modelo.lona.test",
		role: "balconista",
		memberships: [{ branch: "JAU", level: "operate" }],
	},
	{
		name: "Edson Carvalho",
		email: "edson@modelo.lona.test",
		role: "mecânico",
		memberships: [{ branch: "BAU", level: "operate" }],
	},
	{
		name: "Camila Rocha",
		email: "camila@modelo.lona.test",
		role: "financeiro",
		memberships: [{ branch: null, level: "operate" }],
	},
];

/**
 * Parte do modelo que pertence ao access: a empresa "Freios Rodovia Ltda", as filiais de Jaú e Bauru, os cargos
 * prontos e as pessoas fictícias. Sempre os mesmos dados; roda de novo apagando o modelo anterior (as
 * demonstrações já copiadas não são afetadas, porque cada uma tem os seus próprios registros).
 */
export async function seedAccessTemplate(db: Db) {
	await db.delete(companies).where(eq(companies.isTemplate, true));

	const emails = people.map((p) => p.email);
	await db
		.insert(users)
		.values(
			people.map((p) => ({
				name: p.name,
				email: p.email,
				emailVerified: true,
			})),
		)
		.onConflictDoNothing();
	const existing = await db
		.select({ id: users.id, email: users.email })
		.from(users)
		.where(inArray(users.email, emails));
	const userIdByEmail = new Map(existing.map((u) => [u.email, u.id]));

	const company = await createCompany(db, {
		name: "Freios Rodovia Ltda",
		cnpjRoot,
		color: "orange",
		isTemplate: true,
		headquarters: { name: "Matriz Jaú", code: "JAU" },
		settings: {
			uses_branches: true,
			work_order_flow: "full",
			sale_requires_quote: true,
			cash_register_required: true,
		},
	});
	const branchIdByCode = {
		JAU: company.headquartersId,
		BAU: await createBranch(db, {
			companyId: company.companyId,
			name: "Filial Bauru",
			code: "BAU",
			cnpjRoot,
			order: 2,
		}),
	};

	for (const person of people) {
		for (const membership of person.memberships) {
			await createMembership(db, {
				companyId: company.companyId,
				userId: userIdByEmail.get(person.email) as string,
				branchId: membership.branch ? branchIdByCode[membership.branch] : null,
				roleId: company.roleIds[person.role],
				level: membership.level,
			});
		}
	}

	return company;
}
