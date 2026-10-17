// API pública do módulo access: é só o que outros módulos podem importar.

export { auth } from "./auth";
export { branchCnpj, formatCnpj } from "./cnpj";
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
	addBranch,
	type BranchesView,
	type BranchInput,
	type BranchRow,
	type CompanySettingsView,
	companySettings,
	createBranch,
	createCompany,
	createMembership,
	type DashboardSummary,
	DuplicateBranchError,
	dashboardSummary,
	HeadquartersLockedError,
	listBranches,
	type NewBranch,
	type NewCompany,
	type NewMembership,
	PermissionDeniedError,
	updateBranch,
	updateCompanySettings,
	userActiveCompany,
} from "./service";
export { sessionUser } from "./session";
