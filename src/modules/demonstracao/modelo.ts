import { semearModeloAcesso } from "@/modules/acesso";

/**
 * O modelo "Freios Rodovia Ltda", de onde toda demonstração é copiada. Cresce a cada etapa: um bloco por módulo
 * que ganha tabelas (e, junto, um copiador em SQL: ver lona_copiadores).
 */
export async function semearModelo(
	tx: Parameters<typeof semearModeloAcesso>[0],
) {
	const acesso = await semearModeloAcesso(tx);
	return { empresaId: acesso.empresaId };
}
