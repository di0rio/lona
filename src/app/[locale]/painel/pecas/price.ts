/**
 * "1.234,56" (campo) para "1234.56" (API); null se não for um preço válido.
 * Com vírgula, os pontos são milhar e a vírgula é o decimal; sem vírgula, o ponto é o decimal ("12.50").
 */
export function parsePrice(text: string) {
	const value = text.trim();
	const plain = value.includes(",")
		? value.replace(/\./g, "").replace(",", ".")
		: value;
	return /^\d{1,10}(\.\d{1,2})?$/.test(plain) ? plain : null;
}
