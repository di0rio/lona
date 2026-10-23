# Lona

ERP para lojas de peças e oficinas de freio de caminhão. A ideia é a loja cuidar de tudo num lugar só: cadastros, estoque por filial, venda de balcão, ordem de serviço e caixa. Várias empresas usam o mesmo sistema, e uma nunca vê os dados da outra.

Na página inicial tem o botão "Testar demonstração". Ele cria uma empresa de exemplo já com dados, a Freios Rodovia, que dura 2 horas. Não precisa de cadastro.

A v1 está sendo construída em etapas. O que já entrou, o que falta e o que ficou para a v2 estão em [`docs/escopo.md`](docs/escopo.md).

## Stack

- [Next.js 16](https://nextjs.org) (App Router) com React 19, para as telas.
- [Elysia](https://elysiajs.com) montado em `/api` dentro do próprio Next, com o cliente Eden do lado da tela.
- [Drizzle](https://orm.drizzle.team) sobre Postgres no [Neon](https://neon.com). O isolamento entre empresas é feito por Row Level Security no banco ([ADR 0001](docs/adr/0001-empresas-isoladas-por-coluna-com-rls.md)).
- [Better Auth](https://better-auth.com) para entrar, cadastrar, 2FA e a sessão anônima da demonstração.
- [shadcn/ui](https://ui.shadcn.com) (estilo base-nova, em cima do Base UI) e Tailwind 4.
- [Bun](https://bun.sh) para instalar e rodar tudo. Vitest e Playwright nos testes, Biome no lint.

## Rodando na sua máquina

Precisa do Bun 1.3 ou mais novo e de acesso a um projeto no Neon.

```bash
bun install
cp .env.example .env.local
```

O `bun install` também liga os hooks de git do projeto (`.githooks`).

No Neon, crie uma branch só sua para desenvolver. Se o projeto já tem a branch `dev-limpo`, crie a sua a partir dela. A `dev-limpo` é compartilhada e só recebe migration que já está na `main`, então não rode migration nova direto nela. Copie as duas URLs da sua branch para o `.env.local`: a com pooling vai em `DATABASE_URL` e a direta em `DATABASE_URL_UNPOOLED`.

Gere um segredo para o Better Auth e coloque em `BETTER_AUTH_SECRET`:

```bash
bun -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

Depois prepare o banco:

```bash
bun run db:migrate
bun run db:app-role
bun run db:seed
```

O `db:migrate` cria as tabelas e as políticas de RLS. O `db:app-role` dá uma senha aleatória ao papel `lona_app`, que é o usuário sem permissão de furar o RLS que o app usa, e grava a URL dele em `DATABASE_URL_APP` no `.env.local`. O `db:seed` cria a empresa modelo que cada demonstração copia.

Agora é só subir:

```bash
bun run dev
```

O app abre em http://localhost:3000. Para ver a interface em inglês também, mude `NEXT_PUBLIC_SHOW_EN` para `true`.

## Testes

```bash
bun run test
bun run test:e2e
```

O `test` roda o Vitest: testes de unidade e os de integração, que falam com o banco de verdade para conferir service e RLS. Os de integração dependem de `DATABASE_URL`. Sem ela no ambiente, eles pulam sozinhos e só os de unidade rodam. O `test:e2e` roda o Playwright, que faz o build, sobe o app na porta 3100 e passa pelas telas como uma pessoa.

Enquanto trabalha, rode só o que a sua mudança afeta:

```bash
bun run test:changed
bun run test:e2e:changed
```

Os dois comparam com a `origin/main`. Antes de abrir PR, rode a suíte completa, junto com `bun run lint` e `bun run typecheck`. O CI roda os mesmos comandos numa branch temporária do Neon, e a `main` só aceita merge com tudo verde. Commit `fix:` precisa vir com um teste de regressão, senão o CI barra.

## Como o código está organizado

```
src/
  app/          páginas do Next, com as URLs em português (/painel, /entrar)
  api/          monta o Elysia com as rotas de cada módulo
  components/   casca do app (site-shell) e componentes do shadcn (ui)
  db/           conexão, migrations, seed e o helper withContext
  modules/      um diretório por módulo de negócio
  i18n/         idioma da URL e leitura dos textos (cada tela tem o seu t.ts)
e2e/            testes do Playwright
docs/adr/       decisões de arquitetura
```

Cada módulo em `src/modules/<módulo>/` tem o mesmo formato: `schema.ts` com as tabelas, `service.ts` com as regras, `routes.ts` com as rotas da API e `index.ts`, que é a única porta de entrada. Um módulo usa outro só pelo `index.ts` dele, nunca importando as tabelas de outro módulo. `access` cuida de empresas, filiais, cargos e usuários, `demo` da demonstração e `customers` de clientes e veículos. Os próximos seguem o mesmo molde.

Toda consulta de negócio passa pelo `withContext` (`src/db/`), que abre a transação e diz ao Postgres qual empresa e qual usuário estão ali. É isso que faz o RLS funcionar.

O código, o banco e a API ficam em inglês. A interface, as URLs, os comentários e a documentação ficam em português. A tradução de cada termo de negócio está no glossário.

## Antes de mexer

- [`GLOSSARY.md`](GLOSSARY.md): o que cada termo quer dizer e como ele se chama no código.
- [`DESIGN.md`](DESIGN.md): cores, tipografia, movimento e componentes da interface.
- [`docs/adr/`](docs/adr): por que as decisões grandes foram tomadas do jeito que foram.
- [`docs/escopo.md`](docs/escopo.md): a ordem de construção da v1 e o que ficou para a v2.
- [`AGENTS.md`](AGENTS.md): as regras do projeto, para gente e para agente de IA.
