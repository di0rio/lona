<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Lona

- Leia `GLOSSARY.md` e `docs/adr/` antes de mudar qualquer coisa. Código, banco e API em inglês, com os termos do glossário (linha "No código" de cada termo). Interface, URLs das páginas, comentários e docs em português. Commits em inglês (Conventional Commits).
- Cada módulo vive em `src/modules/<module>/` (`schema.ts`, `service.ts`, `routes.ts`, `index.ts`). Um módulo só usa outro pelo `index.ts` dele, nunca importando as tabelas de outro módulo.
- Toda consulta de negócio passa pelo helper de transação com contexto (`src/db/`, `withContext`), que seta a empresa e o usuário para o RLS. Nunca rode consulta de negócio fora dele.
- Confira a documentação da versão instalada de cada biblioteca antes de escrever código para ela.
- O banco compartilhado de desenvolvimento (branch `dev-limpo` do Neon) só recebe migration que já está na `main`. Para testar uma migration nova, crie uma branch própria do Neon a partir da `dev-limpo` e aponte o `.env.local` do seu worktree para ela.
- Antes de mexer em interface, leia `DESIGN.md`: tokens, tipografia, movimento e componentes seguem ele.
- Toda feature nova vem com teste (integração no Vitest para service e RLS, e2e no Playwright para o fluxo da tela).
- Todo bug corrigido vem com um teste de regressão: primeiro um teste que falha reproduzindo o bug, depois a correção que faz ele passar. Commit `fix:` sem arquivo `*.test.ts` ou `*.spec.ts` alterado é barrado no CI.
- Durante o trabalho, rode só os testes afetados (`bun run test:changed`, `bun run test:e2e:changed`, ou o arquivo de teste direto). Antes de abrir PR: `bun run lint`, `bun run typecheck`, `bun run test` e `bun run test:e2e` verdes. O CI roda os mesmos comandos e a `main` só aceita merge com ele verde.
