import { seedAccessTemplate } from "@/modules/access";

/**
 * O modelo "Freios Rodovia Ltda", de onde toda demonstração é copiada. Cresce a cada etapa: um bloco por módulo
 * que ganha tabelas (e, junto, um copiador em SQL: ver lona_copiers).
 */
export async function seedTemplate(
	tx: Parameters<typeof seedAccessTemplate>[0],
) {
	const access = await seedAccessTemplate(tx);
	return { companyId: access.companyId };
}
