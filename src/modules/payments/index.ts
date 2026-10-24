// API pública do módulo payments: é só o que outros módulos podem importar.

export {
	type Fee,
	type Installment,
	NoFeeInForceError,
	type Schedule,
	type ScheduleInput,
	scheduleInstallments,
} from "./installments";
export { paymentsRoutes } from "./routes";
export type { MethodKind, Modality } from "./schema";
export { seedPaymentsTemplate } from "./seed";
export {
	type AcquirerFeeRow,
	type AcquirerInput,
	type AcquirerRow,
	addAcquirer,
	addFee,
	addMethod,
	addTerm,
	copyFees,
	DuplicatePaymentError,
	type FeeInput,
	InvalidPaymentError,
	type MethodInput,
	type PaymentMethodRow,
	type PaymentsView,
	type PaymentTermRow,
	paymentsView,
	removeFee,
	type TermInput,
	updateAcquirer,
	updateFee,
	updateMethod,
	updateTerm,
} from "./service";
