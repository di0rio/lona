// API pública do módulo access: é só o que outros módulos podem importar.

export { auth } from "./auth";
export { branchCnpj } from "./cnpj";
export {
	type Limit,
	limits,
	type Permission,
	permissions,
} from "./permissions";
export { readyRoles } from "./ready-roles";
export { accessRoutes, session } from "./routes";
export type { Color, CompanySettings, Level } from "./schema";
export { seedAccessTemplate } from "./seed";
export {
	type CompanySettingsView,
	companySettings,
	createBranch,
	createCompany,
	createMembership,
	type DashboardSummary,
	dashboardSummary,
	type NewBranch,
	type NewCompany,
	type NewMembership,
	PermissionDeniedError,
	updateCompanySettings,
	userActiveCompany,
} from "./service";
export { sessionUser } from "./session";
