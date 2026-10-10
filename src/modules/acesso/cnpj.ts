// Dígito verificador do CNPJ (módulo 11, pesos de 2 a 9 da direita para a esquerda).
function digito(base: string) {
	let soma = 0;
	let peso = 2;
	for (let i = base.length - 1; i >= 0; i--) {
		soma += Number(base[i]) * peso;
		peso = peso === 9 ? 2 : peso + 1;
	}
	const resto = soma % 11;
	return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ de 14 dígitos a partir da raiz (8) e do número de ordem (1 = matriz, /0001; 2 = /0002...). */
export function cnpjDaFilial(raiz: string, ordem: number) {
	const base = `${raiz}${String(ordem).padStart(4, "0")}`;
	const d1 = digito(base);
	return `${base}${d1}${digito(`${base}${d1}`)}`;
}
