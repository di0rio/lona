import type { Transaction } from "@/db/client";
import { demoParts } from "./demo-parts";
import { partApplications, parts } from "./schema";

/** Peças do modelo da demonstração, com as aplicações. Duas idas ao banco, não uma por peça. */
export async function seedInventoryTemplate(
	tx: Pick<Transaction, "insert">,
	companyId: string,
) {
	const inserted = await tx
		.insert(parts)
		.values(
			demoParts.map((p) => ({
				companyId,
				code: p.code,
				description: p.description,
				brand: p.brand,
				manufacturerRef: p.manufacturerRef,
				unit: p.unit,
				ncm: p.ncm,
				salePrice: p.salePrice,
			})),
		)
		.returning({ id: parts.id, code: parts.code });
	const idByCode = new Map(inserted.map((p) => [p.code, p.id]));

	const applications = demoParts.flatMap((p) =>
		p.applications.map((a) => ({
			companyId,
			partId: idByCode.get(p.code) as string,
			vehicleModel: a.vehicleModel,
			axle: a.axle,
		})),
	);
	if (applications.length) {
		await tx.insert(partApplications).values(applications);
	}
}
