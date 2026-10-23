import { Elysia, type status as elysiaStatus, t } from "elysia";
import { PermissionDeniedError, session } from "@/modules/access";
import { customerKinds, customerStatuses } from "./schema";
import {
	addVehicle,
	createCustomer,
	customerDetail,
	DuplicateDocumentError,
	DuplicatePlateError,
	InvalidCustomerError,
	listCustomers,
	updateCustomer,
	updateVehicle,
} from "./service";

const customerFields = {
	kind: t.UnionEnum([...customerKinds]),
	name: t.String({ minLength: 1, maxLength: 120 }),
	document: t.String({ minLength: 1, maxLength: 20 }),
	phone: t.Union([t.String({ maxLength: 20 }), t.Null()]),
	city: t.String({ minLength: 1, maxLength: 80 }),
	state: t.String({ minLength: 2, maxLength: 2 }),
	creditLimit: t.String({ pattern: "^[0-9]{1,10}(\\.[0-9]{1,2})?$" }),
	status: t.UnionEnum([...customerStatuses]),
};

const vehicleFields = {
	plate: t.String({ minLength: 1, maxLength: 10 }),
	model: t.String({ minLength: 1, maxLength: 80 }),
	axles: t.Integer({ minimum: 2, maximum: 9 }),
	year: t.Union([t.Integer({ minimum: 1950, maximum: 2100 }), t.Null()]),
};

const uuidParam = t.Object({ id: t.String({ format: "uuid" }) });

// Erros do service que viram resposta: 403 sem permissão, 409 duplicado, 422 campo inválido.
function failure(error: unknown, status: typeof elysiaStatus) {
	if (error instanceof PermissionDeniedError) {
		return status(403, "Você não tem permissão para isso.");
	}
	if (error instanceof DuplicateDocumentError) {
		return status(409, { field: "document", message: error.message });
	}
	if (error instanceof DuplicatePlateError) {
		return status(409, { field: "plate", message: error.message });
	}
	if (error instanceof InvalidCustomerError) {
		return status(422, { field: error.field, message: error.message });
	}
	throw error;
}

export const customersRoutes = new Elysia()
	.use(session)
	.get(
		"/customers",
		async ({ userId, query, status }) => {
			try {
				const view = await listCustomers(userId, query.q);
				return view ?? status(404, "Nenhuma empresa ativa.");
			} catch (error) {
				return failure(error, status);
			}
		},
		{
			session: true,
			query: t.Object({ q: t.Optional(t.String({ maxLength: 120 })) }),
		},
	)
	.get(
		"/customers/:id",
		async ({ userId, params, status }) => {
			try {
				const detail = await customerDetail(userId, params.id);
				return detail ?? status(404, "Cliente não encontrado.");
			} catch (error) {
				return failure(error, status);
			}
		},
		{ session: true, params: uuidParam },
	)
	.post(
		"/customers",
		async ({ userId, body, status }) => {
			try {
				const id = await createCustomer(userId, body);
				return id ? { id } : status(404, "Nenhuma empresa ativa.");
			} catch (error) {
				return failure(error, status);
			}
		},
		{
			session: true,
			body: t.Object(customerFields, { additionalProperties: false }),
		},
	)
	.patch(
		"/customers/:id",
		async ({ userId, params, body, status }) => {
			try {
				const found = await updateCustomer(userId, params.id, body);
				return found ? { ok: true } : status(404, "Cliente não encontrado.");
			} catch (error) {
				return failure(error, status);
			}
		},
		{
			session: true,
			params: uuidParam,
			body: t.Partial(t.Object(customerFields), {
				additionalProperties: false,
			}),
		},
	)
	.post(
		"/customers/:id/vehicles",
		async ({ userId, params, body, status }) => {
			try {
				const id = await addVehicle(userId, params.id, body);
				return id ? { id } : status(404, "Cliente não encontrado.");
			} catch (error) {
				return failure(error, status);
			}
		},
		{
			session: true,
			params: uuidParam,
			body: t.Object(vehicleFields, { additionalProperties: false }),
		},
	)
	.patch(
		"/vehicles/:id",
		async ({ userId, params, body, status }) => {
			try {
				const found = await updateVehicle(userId, params.id, body);
				return found ? { ok: true } : status(404, "Veículo não encontrado.");
			} catch (error) {
				return failure(error, status);
			}
		},
		{
			session: true,
			params: uuidParam,
			body: t.Partial(t.Object(vehicleFields), { additionalProperties: false }),
		},
	);
