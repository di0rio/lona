# Deploy na Vercel

Roteiro do primeiro deploy do Lona e dos seguintes. Quem segue é o dono da conta da Vercel: os passos que pedem login ou painel só ele faz.

O que já está pronto no código:
- `vercel.ts`: região `iad1` (Washington, perto do Neon em `us-east-1`) e a rotina diária `/api/cron/clean` às 6h UTC.
- `next.config.ts`: no build de produção da Vercel, se faltar alguma variável obrigatória, o build para com a mensagem `Faltam variáveis de ambiente na produção: ...`. O deploy anterior continua no ar.
- `bun run db:rebuild-production`: recria o banco da produção do zero (detalhes em [O que o script faz](#o-que-o-script-faz)).

## Variáveis da produção

| Variável                | O que é                                                             | De onde vem                                  |
| ----------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| `DATABASE_URL`          | URL do dono do banco, pelo pooler                                   | Integração do Neon na Vercel (branch `main`) |
| `DATABASE_URL_UNPOOLED` | URL do dono do banco, direta (migrações e seed)                     | Integração do Neon na Vercel (branch `main`) |
| `DATABASE_URL_APP`      | URL do papel `lona_app`, que o app usa (sem passar por cima do RLS) | Gerada pelo `db:rebuild-production`          |
| `BETTER_AUTH_SECRET`    | Segredo que assina as sessões                                       | Você gera (passo 3)                          |
| `BETTER_AUTH_URL`       | Endereço público do app, ex.: `https://lona.com.br`                 | O domínio da produção                        |
| `CRON_SECRET`           | Senha que a Vercel manda ao chamar `/api/cron/clean`                | Você gera (passo 3)                          |

O app em si só lê `DATABASE_URL_APP`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` e `CRON_SECRET`; são essas que o build confere. As duas do dono servem aos scripts de banco.

`NEXT_PUBLIC_SHOW_EN` é opcional (liga o inglês). Sem ela, só português.

## Primeiro deploy

### 1. Entrar na Vercel e ligar o projeto

```bash
npm i -g vercel
```

```bash
vercel login
```

Na pasta do repositório:

```bash
vercel link
```

Escolha o time e o projeto `lona` que já existe (é ele que tem a integração do Neon). Isso cria a pasta `.vercel`, que o git ignora.

No painel, em **Settings → Git**, confira que o repositório `di0rio/lona` está conectado com a branch de produção `main`. Assim cada merge na `main` vira um deploy de produção.

Se preferir não usar a CLI, autorizar o MCP da Vercel (`/mcp` no Claude Code) também deixa o Claude fazer os passos de CLI por você.

### 2. Conferir as variáveis do banco

```bash
vercel env ls production
```

`DATABASE_URL` e `DATABASE_URL_UNPOOLED` precisam aparecer (a integração do Neon cria). Elas devem apontar pra branch `main` do Neon, endpoint `ep-mute-scene-b7vm7eiy`. O script recusa rodar se não apontarem.

### 3. Criar os segredos

Gere dois valores aleatórios (um pra cada variável):

```bash
openssl rand -base64 32
```

Cadastre cada um. A CLI pergunta o valor; cole e confirme:

```bash
vercel env add BETTER_AUTH_SECRET production
```

```bash
vercel env add CRON_SECRET production
```

```bash
vercel env add BETTER_AUTH_URL production
```

Em `BETTER_AUTH_URL` vai o endereço público, com `https://` e sem barra no fim. Sem domínio próprio ainda, use o da Vercel (`https://<projeto>.vercel.app`) e troque no passo 6.

### 4. Recriar o banco da produção

A branch `main` do Neon ainda tem o esquema antigo (nomes em português). Não há dado real nela. O script apaga tudo e monta de novo.

Baixe as variáveis da produção pra um arquivo local (o git ignora `.env*`). Use esse nome mesmo: um `.env.production.local` seria carregado sozinho pelo `next build` local, e o e2e rodaria contra a produção.

```bash
vercel env pull .env.main.local --environment=production
```

Rode o script:

```bash
bun run db:rebuild-production --confirm
```

Ele pede pra digitar `main`. Qualquer outra coisa cancela sem mexer em nada. No fim aparece:

```
Esquemas antigos apagados e public recriado.
Migrações aplicadas.
Papel lona_app ligado; DATABASE_URL_APP nova no .env.main.local.
Modelo semeado: <id>
```

Se ele disser que `DATABASE_URL` ou `DATABASE_URL_UNPOOLED` "não é da branch main", o arquivo veio sem essas URLs (variável marcada como sensível não desce no `env pull`) ou com a branch errada. Copie as duas do console do Neon (**Connect**, branch `main`, com e sem pooler) pro `.env.main.local` e rode de novo.

Agora mande a `DATABASE_URL_APP` nova pra Vercel. Abra o `.env.main.local`, copie o valor da última linha (sem as aspas) e cole quando a CLI pedir:

```bash
vercel env add DATABASE_URL_APP production
```

Se ela já existia, remova antes com `vercel env rm DATABASE_URL_APP production`: a senha antiga parou de valer.

Depois apague o arquivo local, que tem senhas da produção:

```bash
rm .env.main.local
```

### 5. Painel da Vercel

- **BotID:** a checagem básica já funciona sozinha na Vercel (o código chama o `checkBotId`). No plano Pro, ligue a análise profunda em **Firewall → Rules → Vercel BotID Deep Analysis**.
- **OIDC:** em **Settings → Security → Secure backend access with OIDC federation**, deixe o modo **Team** e salve.
- **Região:** nada a fazer, o `vercel.ts` já fixa `iad1`.

### 6. Domínio

Em **Settings → Domains**, adicione o domínio e crie no seu provedor de DNS o registro que a Vercel mostrar. Quando o domínio ficar verde, atualize `BETTER_AUTH_URL` pra ele:

```bash
vercel env rm BETTER_AUTH_URL production
```

```bash
vercel env add BETTER_AUTH_URL production
```

### 7. Publicar

```bash
vercel deploy --prod
```

Ou faça merge na `main`. Variável nova ou alterada só vale num deploy novo: depois de mexer nelas, publique de novo.

Se o build parar com `Faltam variáveis de ambiente na produção: ...`, cadastre as que a mensagem lista e publique de novo.

## O que o script faz

`bun run db:rebuild-production --confirm` (`scripts/rebuild-production-db.ts`):
1. Lê as URLs só do `.env.main.local`, nunca do ambiente, pra não misturar com o `.env.local` do desenvolvimento.
2. Recusa sem `--confirm` e recusa se `DATABASE_URL` ou `DATABASE_URL_UNPOOLED` não forem do endpoint da branch `main` do Neon (`ep-mute-scene-b7vm7eiy`).
3. Pede pra digitar o nome da branch (`main`).
4. Numa transação só, apaga os esquemas `public`, `auth`, `autenticacao` (o de antes da troca pra inglês) e `drizzle`, e recria o `public` como o PostgreSQL 15+ cria: dono `pg_database_owner` e só `USAGE` pro `PUBLIC`. O esquema `neon_auth`, do próprio Neon, fica.
5. Roda as migrações de `src/db/migrations`.
6. Dá uma senha aleatória nova ao papel `lona_app` e grava a `DATABASE_URL_APP` no `.env.main.local`, trocando a antiga.
7. Semeia o modelo da demonstração.

Nenhuma URL nem senha aparece na tela. Ele foi ensaiado numa branch descartável criada a partir da `main`.

## Conferir que deu certo

Troque `https://lona.com.br` pelo endereço da produção.
1. **Landing:** abra `https://lona.com.br`. A página carrega sem erro.
2. **Demonstração:** clique em "Testar demonstração". Deve abrir o painel com a empresa de exemplo. "Acesso negado" quer dizer que o BotID achou que é robô: teste num navegador comum, sem extensão de automação.
3. **Conta:** crie uma conta com e-mail e senha, saia e entre de novo.
4. **Rotina diária:** sem a senha, a rota recusa:

   ```bash
   curl -i https://lona.com.br/api/cron/clean
   ```

   Deve responder `401`. Com a senha, apaga as demonstrações vencidas:

   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" https://lona.com.br/api/cron/clean
   ```

   Deve responder `{"deleted":0}` (ou outro número). No painel, **Settings → Cron Jobs** mostra `/api/cron/clean` e deixa rodar na hora.
5. **Logs:** `vercel logs <url-do-deploy>` sem erros.

## Deploys seguintes

- Merge na `main` com o CI verde publica sozinho.
- **Migração nova:** rode na produção antes do merge, e escreva a migração de um jeito que o código antigo continue funcionando com ela (os dois convivem durante o deploy):

  ```bash
  vercel env pull .env.main.local --environment=production
  ```

  ```bash
  bun --env-file=.env.main.local run db:migrate
  ```

  Depois apague o `.env.main.local`.
- **Nunca** rode `db:rebuild-production` com dado real na produção: ele apaga tudo. Ele serve só pro primeiro deploy.
- Deploy ruim: em **Deployments**, escolha o anterior e use **Instant Rollback**.
