# 11 — Deploy na Netlify

Arquitetura em produção, tudo num único domínio (`https://<seu-site>.netlify.app`):

| Parte | Onde roda |
|---|---|
| App (React PWA) | CDN da Netlify (`apps/web/dist`) |
| API (`/api/*`) | Netlify Function (`netlify/functions/api.mjs`), reaproveitando o mesmo Fastify de `apps/api` |
| Banco PostgreSQL | Netlify DB (Neon) **ou** qualquer PostgreSQL gerenciado (ex.: Neon, Supabase) |

O build (`scripts/netlify-build.sh`) gera o Prisma Client, **aplica as migrações** no banco, compila a Function e o frontend. A cada `git push` na branch configurada, a Netlify publica de novo.

## Passo a passo (uma vez)

### 1. Criar o site
1. Acesse https://app.netlify.com → **Add new project → Import an existing project → GitHub**.
2. Escolha o repositório `App-Financeiro-medico` e a branch (`main` depois do merge, ou `claude/medfinance-fase-1-2`).
3. Não altere as configurações de build: elas vêm do `netlify.toml`. Enquanto o banco e os segredos não estiverem configurados, o site publica uma tela de **"Configuração pendente"** listando o que falta (o build não falha).

### 2. Banco de dados (escolha uma opção)

**Opção A — Netlify DB (mais simples):** no projeto, **Extensions → Neon → Add database**. A Netlify cria as variáveis `NETLIFY_DATABASE_URL` e `NETLIFY_DATABASE_URL_UNPOOLED` automaticamente.
> ⚠️ Bancos do Netlify DB não "reivindicados" são apagados após 7 dias. Clique em **Claim database** e conecte uma conta Neon (gratuita) para mantê-lo.

**Opção B — Neon/Supabase por conta própria:** crie o banco e copie a *connection string* **direta** (sem pooler). Em **Project configuration → Environment variables**, crie `DATABASE_URL` com esse valor.

### 3. Segredos
Em **Project configuration → Environment variables**, crie (marque como *secret*):

| Variável | Valor |
|---|---|
| `COOKIE_SECRET` | 64 caracteres aleatórios — `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 64 caracteres hexadecimais — `openssl rand -hex 32` (criptografa os segredos de MFA; **não troque depois**, senão o MFA dos usuários deixa de funcionar) |

### 4. Publicar
**Deploys → Trigger deploy → Deploy site**. Ao terminar, abra a URL do site, crie sua conta e, no celular, use "Adicionar à tela inicial" para instalar o app.

## Detalhes técnicos

- A Function é compilada por `scripts/build-netlify-function.mjs` (esbuild): o código TypeScript do monorepo é embutido; dependências npm ficam externas para a Netlify incluí-las.
- O Prisma gera o motor `rhel-openssl-3.0.x` (runtime das Functions). O pacote final tem ~11 MB (limite: 50 MB).
- Conexões: a Function usa `connection_limit=1` (e `pgbouncer=true` quando a URL é do pooler do Neon).
- Cookies `Secure`/`SameSite=Strict` funcionam porque app e API estão no mesmo domínio.
- O service worker não guarda respostas da API em cache.
- Cabeçalhos de segurança (HSTS, `X-Frame-Options`, etc.) em `netlify.toml`.

## Verificado neste repositório

- Function empacotada com `@netlify/zip-it-and-ship-it` (a mesma ferramenta da Netlify) e executada isoladamente: cadastro, cookie `Secure`, plantão, dashboard, 404 e 401 corretos.
- `scripts/netlify-build.sh` executado de ponta a ponta usando `NETLIFY_DATABASE_URL_UNPOOLED`.

## Limitações do plano gratuito

Functions têm "partida a frio" (a primeira requisição após inatividade leva ~1–2 s) e tempo máximo de 10 s por requisição (suficiente para o volume de um usuário). O rate limit é por instância da Function.
