// API pública do módulo inventory: é só o que outros módulos podem importar.

export { inventoryRoutes } from "./routes";
export type { Axle, Unit } from "./schema";
export { units } from "./schema";
export { seedInventoryTemplate } from "./seed";
export {
	createPart,
	DuplicatePartCodeError,
	listParts,
	type PartApplicationInput,
	type PartInput,
	type PartRow,
	type PartsView,
	setPartActive,
	updatePart,
} from "./service";
