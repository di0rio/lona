import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
	hasPermission,
	inActiveCompany,
	PermissionDeniedError,
} from "@/modules/access";
import { type Axle, partApplications, parts, type Unit } from "./schema";

export type PartApplicationInput = { vehicleModel: string; axle: Axle | null };

export type PartInput = {
	code: string;
	description: string;
	brand: string;
	manufacturerRef: string | null;
	unit: Unit;
	ncm: string | null;
	/** Ponto decimal, até 2 casas: "1234.50". */
	salePrice: string;
	applications: PartApplicationInput[];
};

export type PartRow = PartInput & { id: string; active: boolean };

export type PartsView = {
	parts: PartRow[];
	canManage: boolean;
	/** A lista parou no limite: refine a busca para ver o resto. */
	limited: boolean;
};

const LIMIT = 200;

/** Código já usado por outra peça da empresa; o banco garante (unique), aqui só traduzimos. */
export class DuplicatePartCodeError extends Error {
	constructor() {
		super("Já existe peça com esse código.");
	}
}

function translateDuplicate(error: unknown): never {
	const cause = (error as { cause?: unknown }).cause ?? error;
	const { code, constraint } = cause as { code?: string; constraint?: string };
	if (code === "23505" && constraint === "parts_company_id_code_unq") {
		throw new DuplicatePartCodeError();
	}
	throw error;
}

const columns = (input: PartInput) => ({
	code: input.code.trim(),
	description: input.description.trim(),
	brand: input.brand.trim(),
	manufacturerRef: input.manufacturerRef?.trim() || null,
	unit: input.unit,
	ncm: input.ncm,
	salePrice: input.salePrice,
});

/**
 * Peças da empresa ativa, ordenadas por código. A busca ignora acento e caixa e olha o código, a descrição, a marca,
 * a referência do fabricante e as aplicações (modelos de veículo). Exige `inventory.view`.
 */
export async function listParts(
	userId: string,
	search?: string,
): Promise<PartsView | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (!(await hasPermission(tx, userId, companyId, "inventory.view"))) {
			throw new PermissionDeniedError("inventory.view");
		}
		// Cada palavra (até 5) precisa estar na peça ou em alguma aplicação dela: "lona atego" acha a lona do Atego.
		const words = (search ?? "")
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 5);
		const matches = words.map((word) => {
			// Normaliza primeiro (unaccent come a barra) e só então escapa \ % _ para a palavra valer como texto puro.
			const pattern = sql`'%' || replace(replace(replace(lona_unaccent(lower(${word})), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%'`;
			return sql`(${parts.search} LIKE ${pattern} OR EXISTS (
				SELECT 1 FROM ${partApplications}
				WHERE ${partApplications.partId} = ${parts.id} AND ${partApplications.search} LIKE ${pattern}
			))`;
		});
		const rows = await tx
			.select()
			.from(parts)
			.where(matches.length ? and(...matches) : undefined)
			.orderBy(asc(parts.code))
			.limit(LIMIT + 1);
		const page = rows.slice(0, LIMIT);

		const applications = page.length
			? await tx
					.select()
					.from(partApplications)
					.where(
						inArray(
							partApplications.partId,
							page.map((p) => p.id),
						),
					)
					.orderBy(asc(partApplications.id))
			: [];
		return {
			parts: page.map((p) => ({
				id: p.id,
				code: p.code,
				description: p.description,
				brand: p.brand,
				manufacturerRef: p.manufacturerRef,
				unit: p.unit,
				ncm: p.ncm,
				salePrice: p.salePrice,
				active: p.active,
				applications: applications
					.filter((a) => a.partId === p.id)
					.map((a) => ({ vehicleModel: a.vehicleModel, axle: a.axle })),
			})),
			canManage: await hasPermission(
				tx,
				userId,
				companyId,
				"inventory.manage_parts",
			),
			limited: rows.length > LIMIT,
		};
	});
}

/** Cria uma peça com as aplicações. Exige `inventory.manage_parts`. Devolve o id; null se não há empresa ativa. */
export async function createPart(
	userId: string,
	input: PartInput,
): Promise<string | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (
			!(await hasPermission(tx, userId, companyId, "inventory.manage_parts"))
		) {
			throw new PermissionDeniedError("inventory.manage_parts");
		}
		try {
			const [part] = await tx
				.insert(parts)
				.values({ companyId, ...columns(input) })
				.returning({ id: parts.id });
			await insertApplications(tx, companyId, part.id, input.applications);
			return part.id;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

async function insertApplications(
	tx: Transaction,
	companyId: string,
	partId: string,
	applications: PartApplicationInput[],
) {
	if (!applications.length) return;
	await tx.insert(partApplications).values(
		applications.map((a) => ({
			companyId,
			partId,
			vehicleModel: a.vehicleModel.trim(),
			axle: a.axle,
		})),
	);
}

/**
 * Troca os dados da peça e a lista inteira de aplicações. Exige `inventory.manage_parts`. Devolve false se a peça não existe
 * (ou é de outra empresa).
 */
export async function updatePart(
	userId: string,
	partId: string,
	input: PartInput,
): Promise<boolean | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (
			!(await hasPermission(tx, userId, companyId, "inventory.manage_parts"))
		) {
			throw new PermissionDeniedError("inventory.manage_parts");
		}
		try {
			const updated = await tx
				.update(parts)
				.set(columns(input))
				.where(eq(parts.id, partId))
				.returning({ id: parts.id });
			if (!updated.length) return false;
			await tx
				.delete(partApplications)
				.where(eq(partApplications.partId, partId));
			await insertApplications(tx, companyId, partId, input.applications);
			return true;
		} catch (error) {
			return translateDuplicate(error);
		}
	});
}

/** Peça com histórico só se inativa, nunca se apaga. Exige `inventory.manage_parts`. Devolve false se a peça não existe. */
export async function setPartActive(
	userId: string,
	partId: string,
	active: boolean,
): Promise<boolean | null> {
	return inActiveCompany(userId, async (tx, companyId) => {
		if (
			!(await hasPermission(tx, userId, companyId, "inventory.manage_parts"))
		) {
			throw new PermissionDeniedError("inventory.manage_parts");
		}
		const updated = await tx
			.update(parts)
			.set({ active })
			.where(eq(parts.id, partId))
			.returning({ id: parts.id });
		return updated.length > 0;
	});
}
