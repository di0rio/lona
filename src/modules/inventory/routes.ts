import { Elysia, t } from "elysia";
import { PermissionDeniedError, session } from "@/modules/access";
import { units } from "./schema";
import {
	createPart,
	DuplicatePartCodeError,
	listParts,
	setPartActive,
	updatePart,
} from "./service";

const text = (maxLength: number) =>
	t.String({ minLength: 1, maxLength, pattern: "\\S" });

const partBody = t.Object(
	{
		code: text(40),
		description: text(200),
		brand: text(80),
		manufacturerRef: t.Union([text(80), t.Null()]),
		unit: t.UnionEnum([...units]),
		ncm: t.Union([t.String({ pattern: "^[0-9]{8}$" }), t.Null()]),
		// Até 10 inteiros e 2 decimais: cabe em numeric(12,2).
		salePrice: t.String({ pattern: "^\\d{1,10}(\\.\\d{1,2})?$" }),
		applications: t.Array(
			t.Object(
				{
					vehicleModel: text(120),
					axle: t.Union([t.Literal("front"), t.Literal("rear"), t.Null()]),
				},
				{ additionalProperties: false },
			),
			{ maxItems: 100 },
		),
	},
	{ additionalProperties: false },
);

const idParams = t.Object({ id: t.String({ format: "uuid" }) });

export const inventoryRoutes = new Elysia({ prefix: "/parts" })
	.use(session)
	.onError(({ error, status }) => {
		if (error instanceof PermissionDeniedError) {
			return status(403, "Seu cargo não permite isso.");
		}
		if (error instanceof DuplicatePartCodeError) {
			return status(409, {
				field: "code",
				message: "Já existe peça com esse código.",
			});
		}
	})
	.get(
		"/",
		async ({ userId, query, status }) => {
			const view = await listParts(userId, query.search);
			return view ?? status(404, "Nenhuma empresa ativa.");
		},
		{
			session: true,
			query: t.Object({ search: t.Optional(t.String({ maxLength: 100 })) }),
		},
	)
	.post(
		"/",
		async ({ userId, body, status }) => {
			const id = await createPart(userId, body);
			return id ? { id } : status(404, "Nenhuma empresa ativa.");
		},
		{ session: true, body: partBody },
	)
	.put(
		"/:id",
		async ({ userId, params, body, status }) => {
			const found = await updatePart(userId, params.id, body);
			return found ? { id: params.id } : status(404, "Peça não encontrada.");
		},
		{ session: true, params: idParams, body: partBody },
	)
	.patch(
		"/:id/active",
		async ({ userId, params, body, status }) => {
			const found = await setPartActive(userId, params.id, body.active);
			return found ? { id: params.id } : status(404, "Peça não encontrada.");
		},
		{
			session: true,
			params: idParams,
			body: t.Object({ active: t.Boolean() }, { additionalProperties: false }),
		},
	);
