// Dígito verificador do CNPJ (módulo 11, pesos de 2 a 9 da direita para a esquerda).
function checkDigit(base: string) {
	let sum = 0;
	let weight = 2;
	for (let i = base.length - 1; i >= 0; i--) {
		sum += Number(base[i]) * weight;
		weight = weight === 9 ? 2 : weight + 1;
	}
	const remainder = sum % 11;
	return remainder < 2 ? 0 : 11 - remainder;
}

/** CNPJ de 14 dígitos a partir da raiz (8) e do número de ordem (1 = matriz, /0001; 2 = /0002...). */
export function branchCnpj(root: string, order: number) {
	const base = `${root}${String(order).padStart(4, "0")}`;
	const d1 = checkDigit(base);
	return `${base}${d1}${checkDigit(`${base}${d1}`)}`;
}
