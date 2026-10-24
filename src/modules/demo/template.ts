import { seedAccessTemplate } from "@/modules/access";
import { seedCustomersTemplate } from "@/modules/customers";
import { seedInventoryTemplate } from "@/modules/inventory";
import { seedPaymentsTemplate } from "@/modules/payments";
import { seedPurchasingTemplate } from "@/modules/purchasing";

/**
 * O modelo "Freios Rodovia Ltda", de onde toda demonstração é copiada. Cresce a cada etapa: um bloco por módulo
 * que ganha tabelas (e, junto, um copiador em SQL: ver lona_copiers).
 */
export async function seedTemplate(
	tx: Parameters<typeof seedAccessTemplate>[0] &
		Parameters<typeof seedCustomersTemplate>[0],
) {
	const access = await seedAccessTemplate(tx);
	await seedPaymentsTemplate(tx, access.companyId);
	await seedCustomersTemplate(tx, access.companyId);
	await seedInventoryTemplate(tx, access.companyId);
	await seedPurchasingTemplate(tx, access.companyId);
	return { companyId: access.companyId };
}
