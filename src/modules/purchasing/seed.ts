import type { Transaction } from "@/db/client";
import { demoSuppliers } from "./demo-suppliers";
import { suppliers } from "./schema";

/** Fornecedores do modelo da demonstração, num INSERT só. */
export async function seedPurchasingTemplate(
	tx: Pick<Transaction, "insert">,
	companyId: string,
) {
	await tx
		.insert(suppliers)
		.values(demoSuppliers.map((s) => ({ companyId, ...s })));
}
