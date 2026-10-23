// CPF e CNPJ: puro (sem import de servidor), porque o formulário do cliente usa as mesmas regras do servidor.

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

// Dígito verificador: soma dos dígitos ponderados, resto da divisão por 11 (resto < 2 vira 0).
function checkDigit(digits: number[], weights: number[]) {
	const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
	const rest = sum % 11;
	return rest < 2 ? 0 : 11 - rest;
}

function hasValidCheckDigits(value: string, length: number, weights: number[]) {
	const digits = value.split("").map(Number);
	if (digits.length !== length || digits.every((d) => d === digits[0])) {
		return false;
	}
	const first = checkDigit(digits, weights.slice(1));
	const second = checkDigit([...digits.slice(0, length - 1), first], weights);
	return digits[length - 2] === first && digits[length - 1] === second;
}

const CPF_WEIGHTS = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** CPF com 11 dígitos e dígitos verificadores certos (aceita máscara). */
export function isValidCpf(value: string) {
	const digits = onlyDigits(value);
	return digits.length === 11 && hasValidCheckDigits(digits, 11, CPF_WEIGHTS);
}

/** CNPJ com 14 dígitos e dígitos verificadores certos (aceita máscara). */
export function isValidCnpj(value: string) {
	const digits = onlyDigits(value);
	return digits.length === 14 && hasValidCheckDigits(digits, 14, CNPJ_WEIGHTS);
}

/** Completa 9 (CPF) ou 12 (CNPJ) dígitos com os verificadores: para dados fictícios de seed e de teste. */
export function withCheckDigits(base: string) {
	const weights = base.length === 9 ? CPF_WEIGHTS : CNPJ_WEIGHTS;
	const digits = base.split("").map(Number);
	const first = checkDigit(digits, weights.slice(1));
	const second = checkDigit([...digits, first], weights);
	return `${base}${first}${second}`;
}

/** 000.000.000-00 ou 00.000.000/0000-00; o que não tem 11 nem 14 dígitos volta como veio. */
export function formatDocument(value: string) {
	const d = onlyDigits(value);
	if (d.length === 11) {
		return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
	}
	if (d.length === 14) {
		return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
	}
	return value;
}
