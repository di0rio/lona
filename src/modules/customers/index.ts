// API pública do módulo customers: é só o que outros módulos podem importar.
// (O formulário do cliente importa "./validation" direto, porque este index puxa o banco.)

export { customersRoutes } from "./routes";
export { seedCustomersTemplate } from "./seed";
export {
	addVehicle,
	type CustomerDetail,
	type CustomerInput,
	type CustomerKind,
	type CustomerPermissions,
	type CustomerRow,
	type CustomerStatus,
	type CustomersView,
	createCustomer,
	customerDetail,
	DuplicateDocumentError,
	DuplicatePlateError,
	InvalidCustomerError,
	listCustomers,
	updateCustomer,
	updateVehicle,
	type VehicleInput,
	type VehicleRow,
} from "./service";
