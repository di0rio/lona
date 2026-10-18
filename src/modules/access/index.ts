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
	addRole,
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
	DuplicateMembershipError,
	DuplicateRoleError,
	dashboardSummary,
	HeadquartersLockedError,
	InvalidMembershipError,
	listBranches,
	listRoles,
	listUsers,
	type MembershipInput,
	type MembershipRow,
	type NewBranch,
	type NewCompany,
	type NewMembership,
	PermissionDeniedError,
	PresetRoleError,
	type RoleInput,
	RoleInUseError,
	type RoleRow,
	type RolesView,
	removeRole,
	SelfLockoutError,
	type UserRow,
	type UsersView,
	updateBranch,
	updateCompanySettings,
	updateRole,
	updateUserMemberships,
	userActiveCompany,
} from "./service";
export { sessionUser } from "./session";
