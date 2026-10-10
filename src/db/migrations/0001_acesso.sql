CREATE SCHEMA "autenticacao";
--> statement-breakpoint
CREATE TABLE "cargo_limites" (
	"empresa_id" uuid NOT NULL,
	"cargo_id" uuid NOT NULL,
	"limite" text NOT NULL,
	"valor" numeric(14, 2),
	CONSTRAINT "cargo_limites_empresa_id_cargo_id_limite_pk" PRIMARY KEY("empresa_id","cargo_id","limite"),
	CONSTRAINT "cargo_limites_valor_nao_negativo" CHECK ("cargo_limites"."valor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "cargo_permissoes" (
	"empresa_id" uuid NOT NULL,
	"cargo_id" uuid NOT NULL,
	"permissao" text NOT NULL,
	CONSTRAINT "cargo_permissoes_empresa_id_cargo_id_permissao_pk" PRIMARY KEY("empresa_id","cargo_id","permissao")
);
--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargos_empresa_id_id_unq" UNIQUE("empresa_id","id"),
	CONSTRAINT "cargos_empresa_id_nome_unq" UNIQUE("empresa_id","nome")
);
--> statement-breakpoint
CREATE TABLE "autenticacao"."contas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"conta_id" text NOT NULL,
	"provedor_id" text NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_acesso" text,
	"token_renovacao" text,
	"token_id" text,
	"token_acesso_expira_em" timestamp with time zone,
	"token_renovacao_expira_em" timestamp with time zone,
	"escopo" text,
	"senha" text,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"nome" text NOT NULL,
	"raiz_cnpj" char(8) NOT NULL,
	"eh_modelo" boolean DEFAULT false NOT NULL,
	"expira_em" timestamp with time zone,
	"cor" text DEFAULT 'azul' NOT NULL,
	"config" jsonb DEFAULT '{"usa_filiais":false,"fluxo_os":"simples","venda_com_orcamento":false,"caixa_obrigatorio":false}'::jsonb NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_raiz_cnpj_formato" CHECK ("empresas"."raiz_cnpj" ~ '^[0-9]{8}$'),
	CONSTRAINT "empresas_cor_valida" CHECK ("empresas"."cor" IN ('azul', 'verde', 'vermelho', 'laranja', 'amarelo', 'roxo', 'rosa', 'cinza')),
	CONSTRAINT "empresas_modelo_nao_expira" CHECK (NOT "empresas"."eh_modelo" OR "empresas"."expira_em" IS NULL),
	CONSTRAINT "empresas_config_valida" CHECK ("empresas"."config"->>'fluxo_os' IN ('simples', 'completo'))
);
--> statement-breakpoint
CREATE TABLE "filiais" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"codigo" text NOT NULL,
	"cnpj" char(14) NOT NULL,
	"eh_matriz" boolean DEFAULT false NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filiais_empresa_id_id_unq" UNIQUE("empresa_id","id"),
	CONSTRAINT "filiais_empresa_id_codigo_unq" UNIQUE("empresa_id","codigo"),
	CONSTRAINT "filiais_empresa_id_cnpj_unq" UNIQUE("empresa_id","cnpj"),
	CONSTRAINT "filiais_cnpj_formato" CHECK ("filiais"."cnpj" ~ '^[0-9]{14}$'),
	CONSTRAINT "filiais_matriz_ordem_0001" CHECK (NOT "filiais"."eh_matriz" OR substr("filiais"."cnpj", 9, 4) = '0001')
);
--> statement-breakpoint
CREATE TABLE "autenticacao"."sessoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"agente" text,
	"usuario_id" uuid NOT NULL,
	CONSTRAINT "sessoes_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "autenticacao"."usuarios" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"email_verificado" boolean DEFAULT false NOT NULL,
	"imagem" text,
	"eh_anonimo" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "autenticacao"."verificacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identificador" text NOT NULL,
	"valor" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vinculos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"filial_id" uuid,
	"cargo_id" uuid NOT NULL,
	"nivel" text NOT NULL,
	CONSTRAINT "vinculos_empresa_usuario_filial_unq" UNIQUE NULLS NOT DISTINCT("empresa_id","usuario_id","filial_id"),
	CONSTRAINT "vinculos_nivel_valido" CHECK ("vinculos"."nivel" IN ('consultar', 'operar'))
);
--> statement-breakpoint
ALTER TABLE "cargo_limites" ADD CONSTRAINT "cargo_limites_empresa_id_cargo_id_cargos_empresa_id_id_fk" FOREIGN KEY ("empresa_id","cargo_id") REFERENCES "public"."cargos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargo_permissoes" ADD CONSTRAINT "cargo_permissoes_empresa_id_cargo_id_cargos_empresa_id_id_fk" FOREIGN KEY ("empresa_id","cargo_id") REFERENCES "public"."cargos"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autenticacao"."contas" ADD CONSTRAINT "contas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "autenticacao"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filiais" ADD CONSTRAINT "filiais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autenticacao"."sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "autenticacao"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "autenticacao"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_empresa_id_filial_id_filiais_empresa_id_id_fk" FOREIGN KEY ("empresa_id","filial_id") REFERENCES "public"."filiais"("empresa_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vinculos" ADD CONSTRAINT "vinculos_empresa_id_cargo_id_cargos_empresa_id_id_fk" FOREIGN KEY ("empresa_id","cargo_id") REFERENCES "public"."cargos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contas_usuario_id_idx" ON "autenticacao"."contas" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "empresas_expira_em_idx" ON "empresas" USING btree ("expira_em") WHERE "empresas"."expira_em" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "filiais_matriz_unq" ON "filiais" USING btree ("empresa_id") WHERE "filiais"."eh_matriz";--> statement-breakpoint
CREATE INDEX "sessoes_usuario_id_idx" ON "autenticacao"."sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "usuarios_anonimos_idx" ON "autenticacao"."usuarios" USING btree ("criado_em") WHERE "autenticacao"."usuarios"."eh_anonimo";--> statement-breakpoint
CREATE INDEX "verificacoes_identificador_idx" ON "autenticacao"."verificacoes" USING btree ("identificador");--> statement-breakpoint
CREATE INDEX "vinculos_usuario_id_idx" ON "vinculos" USING btree ("usuario_id","empresa_id");