import { Elysia, t } from "elysia";
import { PermissionDeniedError, session } from "@/modules/access";
import { methodKinds, modalities } from "./schema";
import {
	addAcquirer,
	addFee,
	addMethod,
	addTerm,
	copyFees,
	DuplicatePaymentError,
	InvalidPaymentError,
	paymentsView,
	removeFee,
	updateAcquirer,
	updateFee,
	updateMethod,
	updateTerm,
} from "./service";

const name = t.String({ minLength: 1, maxLength: 80, pattern: "\\S" });
const id = t.String({ format: "uuid" });
const idParams = t.Object({ id });
// Percentual como texto decimal, de 0.00 a 99.99.
const pct = t.String({ pattern: "^[0-9]{1,2}(\\.[0-9]{1,2})?$" });
const date = t.String({
	pattern: "^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$",
});
const days = t.Integer({ minimum: 0, maximum: 999 });

const feeBody = t.Object(
	{
		acquirerId: id,
		modality: t.UnionEnum([...modalities]),
		installments: t.Integer({ minimum: 1, maximum: 12 }),
		feePct: pct,
		daysToReceive: days,
		anticipationFeePct: t.Union([pct, t.Null()]),
		validFrom: date,
	},
	{ additionalProperties: false },
);

const termDays = t.Array(days, { minItems: 1, maxItems: 12 });

const notFound = {
	acquirer: "Operadora não encontrada.",
	fee: "Taxa não encontrada.",
	method: "Forma de pagamento não encontrada.",
	term: "Condição de pagamento não encontrada.",
};

// Mesmo tratamento de erro em todas as escritas: cada rota só diz o que a permissão faz.
async function guarded<T>(
	status: (code: 403 | 409 | 422, body: unknown) => unknown,
	deniedMessage: string,
	run: () => Promise<T>,
) {
	try {
		return await run();
	} catch (error) {
		if (error instanceof PermissionDeniedError)
			return status(403, deniedMessage);
		if (error instanceof DuplicatePaymentError) {
			return status(409, { field: error.field, message: error.message });
		}
		if (error instanceof InvalidPaymentError) {
			return status(422, { message: error.message });
		}
		throw error;
	}
}

export const paymentsRoutes = new Elysia({ prefix: "/payments" })
	.use(session)
	.get(
		"/",
		async ({ userId, status }) => {
			const view = await paymentsView(userId);
			return view ?? status(404, "Nenhuma empresa ativa.");
		},
		{ session: true },
	)
	.post(
		"/acquirers",
		({ userId, body, status }) =>
			guarded(
				status,
				"Só quem gerencia pagamentos cria operadoras.",
				async () => {
					const created = await addAcquirer(userId, body);
					return created
						? { id: created }
						: status(404, "Nenhuma empresa ativa.");
				},
			),
		{
			session: true,
			body: t.Object({ name }, { additionalProperties: false }),
		},
	)
	.patch(
		"/acquirers/:id",
		({ userId, params, body, status }) =>
			guarded(
				status,
				"Só quem gerencia pagamentos altera operadoras.",
				async () => {
					const found = await updateAcquirer(userId, params.id, body);
					return found ? { id: params.id } : status(404, notFound.acquirer);
				},
			),
		{
			session: true,
			params: idParams,
			body: t.Partial(
				t.Object(
					{ name, active: t.Boolean() },
					{ additionalProperties: false },
				),
			),
		},
	)
	.post(
		"/fees",
		({ userId, body, status }) =>
			guarded(status, "Só quem gerencia pagamentos cria taxas.", async () => {
				const created = await addFee(userId, body);
				return created
					? { id: created }
					: status(404, "Nenhuma empresa ativa.");
			}),
		{ session: true, body: feeBody },
	)
	.post(
		"/fees/copy",
		({ userId, body, status }) =>
			guarded(status, "Só quem gerencia pagamentos cria taxas.", async () => {
				const copied = await copyFees(userId, body);
				return copied === null
					? status(404, "Nenhuma empresa ativa.")
					: { copied };
			}),
		{
			session: true,
			body: t.Object(
				{ acquirerId: id, from: date, to: date },
				{ additionalProperties: false },
			),
		},
	)
	.patch(
		"/fees/:id",
		({ userId, params, body, status }) =>
			guarded(status, "Só quem gerencia pagamentos altera taxas.", async () => {
				const found = await updateFee(userId, params.id, body);
				return found ? { id: params.id } : status(404, notFound.fee);
			}),
		{
			session: true,
			params: idParams,
			body: t.Partial(
				t.Object(
					{
						feePct: pct,
						daysToReceive: days,
						anticipationFeePct: t.Union([pct, t.Null()]),
						validFrom: date,
					},
					{ additionalProperties: false },
				),
			),
		},
	)
	.delete(
		"/fees/:id",
		({ userId, params, status }) =>
			guarded(status, "Só quem gerencia pagamentos apaga taxas.", async () => {
				const found = await removeFee(userId, params.id);
				return found ? { id: params.id } : status(404, notFound.fee);
			}),
		{ session: true, params: idParams },
	)
	.post(
		"/methods",
		({ userId, body, status }) =>
			guarded(status, "Só quem gerencia pagamentos cria formas.", async () => {
				const created = await addMethod(userId, body);
				return created
					? { id: created }
					: status(404, "Nenhuma empresa ativa.");
			}),
		{
			session: true,
			body: t.Object(
				{
					name,
					kind: t.UnionEnum([...methodKinds]),
					acquirerId: t.Union([id, t.Null()]),
				},
				{ additionalProperties: false },
			),
		},
	)
	.patch(
		"/methods/:id",
		({ userId, params, body, status }) =>
			guarded(
				status,
				"Só quem gerencia pagamentos altera formas.",
				async () => {
					const found = await updateMethod(userId, params.id, body);
					return found ? { id: params.id } : status(404, notFound.method);
				},
			),
		{
			session: true,
			params: idParams,
			body: t.Partial(
				t.Object(
					{ name, acquirerId: id, active: t.Boolean() },
					{ additionalProperties: false },
				),
			),
		},
	)
	.post(
		"/terms",
		({ userId, body, status }) =>
			guarded(
				status,
				"Só quem gerencia pagamentos cria condições.",
				async () => {
					const created = await addTerm(userId, body);
					return created
						? { id: created }
						: status(404, "Nenhuma empresa ativa.");
				},
			),
		{
			session: true,
			body: t.Object(
				{
					name,
					paymentMethodId: id,
					installmentDays: termDays,
					issuerInstallments: t.Boolean(),
				},
				{ additionalProperties: false },
			),
		},
	)
	.patch(
		"/terms/:id",
		({ userId, params, body, status }) =>
			guarded(
				status,
				"Só quem gerencia pagamentos altera condições.",
				async () => {
					const found = await updateTerm(userId, params.id, body);
					return found ? { id: params.id } : status(404, notFound.term);
				},
			),
		{
			session: true,
			params: idParams,
			body: t.Partial(
				t.Object(
					{
						name,
						installmentDays: termDays,
						issuerInstallments: t.Boolean(),
						active: t.Boolean(),
					},
					{ additionalProperties: false },
				),
			),
		},
	);
