import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	check,
	foreignKey,
	index,
	jsonb,
	numeric,
	pgSchema,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// UUIDv7 nativo: o Neon roda Postgres 18, que já traz uuidv7(). Ids ordenados no tempo mantêm os índices compactos.
const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);

const momento = (nome: string) =>
	timestamp(nome, { withTimezone: true }).notNull().defaultNow();

export const cores = [
	"azul",
	"verde",
	"vermelho",
	"laranja",
	"amarelo",
	"roxo",
	"rosa",
	"cinza",
] as const;

export type Cor = (typeof cores)[number];

export type ConfigEmpresa = {
	usa_filiais: boolean;
	fluxo_os: "simples" | "completo";
	venda_com_orcamento: boolean;
	caixa_obrigatorio: boolean;
};

export const configPadrao: ConfigEmpresa = {
	usa_filiais: false,
	fluxo_os: "simples",
	venda_com_orcamento: false,
	caixa_obrigatorio: false,
};

export type Nivel = "consultar" | "operar";

export const empresas = pgTable(
	"empresas",
	{
		id: id(),
		nome: text("nome").notNull(),
		raizCnpj: char("raiz_cnpj", { length: 8 }).notNull(),
		ehModelo: boolean("eh_modelo").notNull().default(false),
		// null para empresa real e para o modelo; a demonstração vence 2 horas depois de copiada.
		expiraEm: timestamp("expira_em", { withTimezone: true }),
		cor: text("cor").$type<Cor>().notNull().default("azul"),
		config: jsonb("config")
			.$type<ConfigEmpresa>()
			.notNull()
			.default(configPadrao),
		criadaEm: momento("criada_em"),
	},
	(t) => [
		check("empresas_raiz_cnpj_formato", sql`${t.raizCnpj} ~ '^[0-9]{8}$'`),
		check(
			"empresas_cor_valida",
			sql`${t.cor} IN (${sql.raw(cores.map((c) => `'${c}'`).join(", "))})`,
		),
		check(
			"empresas_modelo_nao_expira",
			sql`NOT ${t.ehModelo} OR ${t.expiraEm} IS NULL`,
		),
		check(
			"empresas_config_valida",
			sql`${t.config}->>'fluxo_os' IN ('simples', 'completo')`,
		),
		// Limpeza das demonstrações vencidas (única consulta que não parte da empresa).
		index("empresas_expira_em_idx")
			.on(t.expiraEm)
			.where(sql`${t.expiraEm} IS NOT NULL`),
	],
);

export const filiais = pgTable(
	"filiais",
	{
		id: id(),
		empresaId: uuid("empresa_id")
			.notNull()
			.references(() => empresas.id, { onDelete: "cascade" }),
		nome: text("nome").notNull(),
		codigo: text("codigo").notNull(),
		// 14 dígitos: raiz do CNPJ (8) + número de ordem (4: 0001, 0002...) + dígitos verificadores (2).
		cnpj: char("cnpj", { length: 14 }).notNull(),
		ehMatriz: boolean("eh_matriz").notNull().default(false),
		ativa: boolean("ativa").notNull().default(true),
		criadaEm: momento("criada_em"),
	},
	(t) => [
		unique("filiais_empresa_id_id_unq").on(t.empresaId, t.id),
		unique("filiais_empresa_id_codigo_unq").on(t.empresaId, t.codigo),
		unique("filiais_empresa_id_cnpj_unq").on(t.empresaId, t.cnpj),
		// ADR 0003: a matriz é uma só por empresa e termina em /0001.
		uniqueIndex("filiais_matriz_unq").on(t.empresaId).where(sql`${t.ehMatriz}`),
		check("filiais_cnpj_formato", sql`${t.cnpj} ~ '^[0-9]{14}$'`),
		check(
			"filiais_matriz_ordem_0001",
			sql`NOT ${t.ehMatriz} OR substr(${t.cnpj}, 9, 4) = '0001'`,
		),
	],
);

export const cargos = pgTable(
	"cargos",
	{
		id: id(),
		empresaId: uuid("empresa_id")
			.notNull()
			.references(() => empresas.id, { onDelete: "cascade" }),
		nome: text("nome").notNull(),
		padrao: boolean("padrao").notNull().default(false),
		criadoEm: momento("criado_em"),
	},
	(t) => [
		unique("cargos_empresa_id_id_unq").on(t.empresaId, t.id),
		unique("cargos_empresa_id_nome_unq").on(t.empresaId, t.nome),
	],
);

// As tabelas filhas repetem empresa_id (e a chave estrangeira composta o confere) para o RLS e os índices
// poderem partir sempre da empresa (ADR 0001).
export const cargoPermissoes = pgTable(
	"cargo_permissoes",
	{
		empresaId: uuid("empresa_id").notNull(),
		cargoId: uuid("cargo_id").notNull(),
		permissao: text("permissao").notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.empresaId, t.cargoId, t.permissao] }),
		foreignKey({
			columns: [t.empresaId, t.cargoId],
			foreignColumns: [cargos.empresaId, cargos.id],
		}).onDelete("cascade"),
	],
);

export const cargoLimites = pgTable(
	"cargo_limites",
	{
		empresaId: uuid("empresa_id").notNull(),
		cargoId: uuid("cargo_id").notNull(),
		limite: text("limite").notNull(),
		// null = sem limite.
		valor: numeric("valor", { precision: 14, scale: 2, mode: "number" }),
	},
	(t) => [
		primaryKey({ columns: [t.empresaId, t.cargoId, t.limite] }),
		foreignKey({
			columns: [t.empresaId, t.cargoId],
			foreignColumns: [cargos.empresaId, cargos.id],
		}).onDelete("cascade"),
		check("cargo_limites_valor_nao_negativo", sql`${t.valor} >= 0`),
	],
);

// Tabelas do Better Auth. O banco usa nomes em português; as chaves do objeto são as que o Better Auth espera.
// Ficam num schema à parte e sem RLS de empresa: a pessoa existe fora de qualquer empresa, e o elo é o vínculo.
export const autenticacao = pgSchema("autenticacao");

export const usuarios = autenticacao.table(
	"usuarios",
	{
		id: id(),
		name: text("nome").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verificado").notNull().default(false),
		image: text("imagem"),
		isAnonymous: boolean("eh_anonimo").notNull().default(false),
		createdAt: momento("criado_em"),
		updatedAt: momento("atualizado_em").$onUpdate(() => new Date()),
	},
	(t) => [
		// Limpeza dos visitantes anônimos antigos.
		index("usuarios_anonimos_idx").on(t.createdAt).where(sql`${t.isAnonymous}`),
	],
);

export const sessoes = autenticacao.table(
	"sessoes",
	{
		id: id(),
		expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: momento("criada_em"),
		updatedAt: momento("atualizada_em").$onUpdate(() => new Date()),
		ipAddress: text("ip"),
		userAgent: text("agente"),
		userId: uuid("usuario_id")
			.notNull()
			.references(() => usuarios.id, { onDelete: "cascade" }),
	},
	(t) => [index("sessoes_usuario_id_idx").on(t.userId)],
);

export const contas = autenticacao.table(
	"contas",
	{
		id: id(),
		accountId: text("conta_id").notNull(),
		providerId: text("provedor_id").notNull(),
		userId: uuid("usuario_id")
			.notNull()
			.references(() => usuarios.id, { onDelete: "cascade" }),
		accessToken: text("token_acesso"),
		refreshToken: text("token_renovacao"),
		idToken: text("token_id"),
		accessTokenExpiresAt: timestamp("token_acesso_expira_em", {
			withTimezone: true,
		}),
		refreshTokenExpiresAt: timestamp("token_renovacao_expira_em", {
			withTimezone: true,
		}),
		scope: text("escopo"),
		password: text("senha"),
		createdAt: momento("criada_em"),
		updatedAt: momento("atualizada_em").$onUpdate(() => new Date()),
	},
	(t) => [index("contas_usuario_id_idx").on(t.userId)],
);

export const verificacoes = autenticacao.table(
	"verificacoes",
	{
		id: id(),
		identifier: text("identificador").notNull(),
		value: text("valor").notNull(),
		expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
		createdAt: momento("criada_em"),
		updatedAt: momento("atualizada_em").$onUpdate(() => new Date()),
	},
	(t) => [index("verificacoes_identificador_idx").on(t.identifier)],
);

export const vinculos = pgTable(
	"vinculos",
	{
		id: id(),
		empresaId: uuid("empresa_id")
			.notNull()
			.references(() => empresas.id, { onDelete: "cascade" }),
		usuarioId: uuid("usuario_id")
			.notNull()
			.references(() => usuarios.id, { onDelete: "cascade" }),
		// null = todas as filiais (ADR 0006).
		filialId: uuid("filial_id"),
		cargoId: uuid("cargo_id").notNull(),
		nivel: text("nivel").$type<Nivel>().notNull(),
	},
	(t) => [
		// Com filial_id nulo a chave estrangeira composta não confere, que é o desejado: nulo é "todas".
		foreignKey({
			columns: [t.empresaId, t.filialId],
			foreignColumns: [filiais.empresaId, filiais.id],
		}).onDelete("cascade"),
		// Cargo em uso não pode ser apagado.
		foreignKey({
			columns: [t.empresaId, t.cargoId],
			foreignColumns: [cargos.empresaId, cargos.id],
		}).onDelete("restrict"),
		// Um vínculo por usuário e filial (e um só para "todas").
		unique("vinculos_empresa_usuario_filial_unq")
			.on(t.empresaId, t.usuarioId, t.filialId)
			.nullsNotDistinct(),
		// Exceção à regra de partir da empresa: achar as empresas de quem acabou de entrar.
		index("vinculos_usuario_id_idx").on(t.usuarioId, t.empresaId),
		check("vinculos_nivel_valido", sql`${t.nivel} IN ('consultar', 'operar')`),
	],
);
