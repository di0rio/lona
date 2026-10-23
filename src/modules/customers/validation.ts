// Puro (sem banco): o formulário do cliente importa este arquivo direto, não o index do módulo.

/** Maiúsculas, sem hífen nem espaço. */
export const normalizePlate = (value: string) =>
	value.replace(/[\s-]/g, "").toUpperCase();

/** Antiga (ABC1234) ou Mercosul (ABC1D23), já normalizada. */
export const isValidPlate = (value: string) =>
	/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value);

/** Antiga com hífen (ABC-1234); Mercosul como está (ABC1D23). */
export function formatPlate(value: string) {
	const plate = normalizePlate(value);
	return /^[A-Z]{3}[0-9]{4}$/.test(plate)
		? `${plate.slice(0, 3)}-${plate.slice(3)}`
		: plate;
}

export const STATES = [
	"AC",
	"AL",
	"AP",
	"AM",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MT",
	"MS",
	"MG",
	"PA",
	"PB",
	"PR",
	"PE",
	"PI",
	"RJ",
	"RN",
	"RS",
	"RO",
	"RR",
	"SC",
	"SP",
	"SE",
	"TO",
] as const;
