// Dígito verificador do CNPJ (módulo 11, pesos de 2 a 9 da direita para a esquerda). Desde jul/2026 o CNPJ pode
// ter letras: o valor do caractere é o código ASCII menos 48 ("0" = 0, "A" = 17), o que não muda nada nos numéricos.
function checkDigit(base: string) {
	let sum = 0;
	let weight = 2;
	for (let i = base.length - 1; i >= 0; i--) {
		sum += (base.charCodeAt(i) - 48) * weight;
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

/** CNPJ de 14 caracteres (letras e dígitos, sem máscara) com os dois dígitos verificadores certos. */
export function isValidCnpj(cnpj: string) {
	if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
	const base = cnpj.slice(0, 12);
	const d1 = checkDigit(base);
	return cnpj.slice(12) === `${d1}${checkDigit(`${base}${d1}`)}`;
}

/** CNPJ de 14 caracteres no formato de exibição: 11.222.333/0001-81. */
export function formatCnpj(cnpj: string) {
	return cnpj.replace(
		/^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/,
		"$1.$2.$3/$4-$5",
	);
}
