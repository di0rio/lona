import { type Limit, type Permission, permissions } from "./permissions";

export type ReadyRole = {
	/** Nome de exibição, em português: dado da empresa, editável (não precisa de i18n). */
	name: string;
	permissions: readonly Permission[];
	/** null = sem limite. */
	limits: Record<Limit, number | null>;
};

// Os cinco cargos que toda empresa nasce tendo. A empresa pode editar e criar outros depois.
export const readyRoles: readonly ReadyRole[] = [
	{
		name: "dono",
		permissions,
		limits: { max_discount_pct: null, max_purchase_order: null },
	},
	{
		name: "gerente",
		permissions: permissions.filter(
			(p) => p !== "company.configure" && p !== "roles.manage",
		),
		limits: { max_discount_pct: 15, max_purchase_order: 20000 },
	},
	{
		name: "balconista",
		permissions: [
			"inventory.view",
			"inventory.view_other_branches",
			"sale.create",
			"sale.finalize_direct",
			"work_order.create",
			"customer.view",
			"customer.create",
			"cash_register.operate",
		],
		limits: { max_discount_pct: 5, max_purchase_order: 0 },
	},
	{
		name: "mecânico",
		permissions: [
			"inventory.view",
			"work_order.create",
			"work_order.apply_part",
			"work_order.log_labor",
			"work_order.finish",
			"customer.view",
		],
		limits: { max_discount_pct: 0, max_purchase_order: 0 },
	},
	{
		name: "financeiro",
		permissions: [
			"purchasing.view",
			"customer.view",
			"customer.change_credit_limit",
			"finance.view",
			"finance.receive",
			"finance.pay",
			"cash_register.close",
			"payment_methods.manage",
		],
		limits: { max_discount_pct: 0, max_purchase_order: 0 },
	},
];
