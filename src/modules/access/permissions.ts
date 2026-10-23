// Catálogo de permissões: vive no código (não no banco) porque cada permissão só faz sentido onde alguém a confere.
// Quem confere é o service do módulo dono da ação; o cargo só guarda o nome em role_permissions.
export const permissions = [
	"inventory.view",
	"inventory.view_other_branches",
	"inventory.adjust",
	"inventory.manage_parts",
	"purchasing.view",
	"purchasing.create_order",
	"purchasing.receive",
	"purchasing.manage_suppliers",
	"sale.create",
	"sale.finalize_direct",
	"sale.cancel",
	"work_order.create",
	"work_order.apply_part",
	"work_order.log_labor",
	"work_order.finish",
	"customer.view",
	"customer.create",
	"customer.edit",
	"customer.change_credit_limit",
	"cash_register.operate",
	"cash_register.close",
	"finance.view",
	"finance.receive",
	"finance.pay",
	"override.grant",
	"roles.manage",
	"users.manage",
	"company.configure",
] as const;

export type Permission = (typeof permissions)[number];

// Limites: o máximo que o cargo faz sem pedir liberação. Sem linha em role_limits o cargo não tem folga nenhuma;
// valor NULL quer dizer sem limite.
export const limits = ["max_discount_pct", "max_purchase_order"] as const;

export type Limit = (typeof limits)[number];
