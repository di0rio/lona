import { Elysia, t } from "elysia";
import { PermissionDeniedError, session } from "@/modules/access";
import { states } from "./schema";
import {
	createSupplier,
	DuplicateSupplierCnpjError,
	InvalidCnpjError,
	listSuppliers,
	setSupplierActive,
	updateSupplier,
} from "./service";

const text = (maxLength: number) =>
	t.String({ minLength: 1, maxLength, pattern: "\\S" });

const supplierBody = t.Object(
	{
		legalName: text(150),
		// Só o formato: os dígitos verificadores o service confere (422).
		cnpj: t.String({ pattern: "^[0-9A-Z]{12}[0-9]{2}$" }),
		contactName: t.Union([text(80), t.Null()]),
		phone: t.Union([t.String({ pattern: "^[0-9]{10,11}$" }), t.Null()]),
		city: text(80),
		state: t.UnionEnum([...states]),
	},
	{ additionalProperties: false },
);

const idParams = t.Object({ id: t.String({ format: "uuid" }) });

export const purchasingRoutes = new Elysia({ prefix: "/suppliers" })
	.use(session)
	.onError(({ error, status }) => {
		if (error instanceof PermissionDeniedError) {
			return status(403, "Seu cargo não permite isso.");
		}
		if (error instanceof DuplicateSupplierCnpjError) {
			return status(409, {
				field: "cnpj",
				message: "Já existe fornecedor com esse CNPJ.",
			});
		}
		if (error instanceof InvalidCnpjError) {
			return status(422, { field: "cnpj", message: "CNPJ inválido." });
		}
	})
	.get(
		"/",
		async ({ userId, status }) => {
			const view = await listSuppliers(userId);
			return view ?? status(404, "Nenhuma empresa ativa.");
		},
		{ session: true },
	)
	.post(
		"/",
		async ({ userId, body, status }) => {
			const id = await createSupplier(userId, body);
			return id ? { id } : status(404, "Nenhuma empresa ativa.");
		},
		{ session: true, body: supplierBody },
	)
	.put(
		"/:id",
		async ({ userId, params, body, status }) => {
			const found = await updateSupplier(userId, params.id, body);
			return found
				? { id: params.id }
				: status(404, "Fornecedor não encontrado.");
		},
		{ session: true, params: idParams, body: supplierBody },
	)
	.patch(
		"/:id/active",
		async ({ userId, params, body, status }) => {
			const found = await setSupplierActive(userId, params.id, body.active);
			return found
				? { id: params.id }
				: status(404, "Fornecedor não encontrado.");
		},
		{
			session: true,
			params: idParams,
			body: t.Object({ active: t.Boolean() }, { additionalProperties: false }),
		},
	);
