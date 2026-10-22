import { seedAccessTemplate } from "@/modules/access";
import { seedInventoryTemplate } from "@/modules/inventory";
import { seedPurchasingTemplate } from "@/modules/purchasing";

/**
 * O modelo "Freios Rodovia Ltda", de onde toda demonstração é copiada. Cresce a cada etapa: um bloco por módulo
 * que ganha tabelas (e, junto, um copiador em SQL: ver lona_copiers).
 */
export async function seedTemplate(
	tx: Parameters<typeof seedAccessTemplate>[0],
) {
	const access = await seedAccessTemplate(tx);
	await seedInventoryTemplate(tx, access.companyId);
	await seedPurchasingTemplate(tx, access.companyId);
	return { companyId: access.companyId };
}
