// API pública do módulo acesso: é só o que outros módulos podem importar.

export { auth } from "./auth";
export { cargosProntos } from "./cargos-prontos";
export { cnpjDaFilial } from "./cnpj";
export { type Limite, limites, type Permissao, permissoes } from "./permissoes";
export { acessoRoutes, sessao } from "./routes";
export type { ConfigEmpresa, Cor, Nivel } from "./schema";
export {
	criarEmpresa,
	criarFilial,
	criarVinculo,
	empresaAtivaDoUsuario,
	type NovaEmpresa,
	type NovaFilial,
	type NovoVinculo,
	type ResumoDoPainel,
	resumoDoPainel,
} from "./service";
export { usuarioDaSessao } from "./sessao";
