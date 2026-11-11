# Segurança do banco em produção

> Procedimento histórico do login único anterior ao RLS. O runtime publicado utiliza dois logins restritos, contexto assinado e migrations posteriores. Consulte o [registro da publicação e reversão](../../DEPLOY_PRODUCAO_RLS_SEM_VERIFICACAO_EMAIL.md) para os requisitos atuais.

1. Execute `009_seguranca_sessoes_rate_limit.sql` e depois
   `010_hardening_supabase_runtime.sql` usando a conexão administrativa de
   migration. Os scripts não removem dados.
2. No SQL Editor, crie um login separado com uma senha gerada no gerenciador de
   segredos e torne-o membro de `bovitrack_runtime`. Não grave a senha no Git:

   ```sql
   CREATE ROLE bovitrack_app_login
     LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
     PASSWORD 'INFORME_UMA_SENHA_GERADA_FORA_DO_GIT';
   GRANT bovitrack_runtime TO bovitrack_app_login;
   ```

3. Troque `DATABASE_URL` do backend na Vercel para o usuário
   `bovitrack_app_login`. Mantenha a URL administrativa somente no processo de
   migration.
4. Use o Transaction Pooler do Supabase para o runtime serverless. Confirme a
   porta e o host exibidos pelo botão **Connect** do projeto; não reutilize uma
   URL de exemplo.
5. Configure `DB_SSL=verify-full` e disponibilize a CA confiável pelo caminho
   indicado em `DB_SSL_CA_PATH` ou, na Vercel, como PEM codificado em base64
   através de `DB_SSL_CA_BASE64`.
6. Em **Supabase > Integrations > Data API**, desative a Data API, pois o
   BoviTrack acessa o banco somente pelo Express. Depois confirme que requests
   REST/GraphQL com chave pública não alcançam as tabelas.
7. Consulte os grants depois da migration e confirme que `anon` e
   `authenticated` não possuem privilégios nas tabelas/sequences do BoviTrack.

Se o projeto não permitir alterar os default privileges de `supabase_admin`,
faça essa revogação com a ferramenta administrativa oferecida pelo Supabase ou
mantenha a Data API desativada e valide todo novo objeto após migrations.

## Variáveis e deploy na Vercel

No projeto **backend**, configure sem reutilizar valores do repositório:

- `NODE_ENV=production`
- `DATABASE_URL` com o login de runtime e o Transaction Pooler
- `JWT_SECRET` novo, aleatório e com pelo menos 32 bytes
- `JWT_ACCESS_EXPIRES_IN=15m`
- `JWT_REFRESH_EXPIRES_IN=7d`
- `JWT_ISSUER=bovitrack-api`
- `JWT_AUDIENCE=bovitrack-web`
- `FRONTEND_URL` com a origem HTTPS exata; se houver previews autorizados,
  informe cada origem separada por vírgula
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=none` quando frontend e backend forem cross-site
- `DB_SSL=verify-full` e uma das variáveis de CA documentadas acima
- timeouts e `DB_POOL_MAX=2` conforme `.env.example`

No projeto **frontend**, mantenha somente `VITE_API_URL` com a URL HTTPS pública
do backend. Nenhum segredo, connection string ou chave administrativa pode usar
o prefixo `VITE_`.

Depois de alterar as variáveis, faça redeploy dos dois projetos. A rotação de
`JWT_SECRET` é obrigatória porque um valor antigo apareceu no histórico Git;
ela invalida os access tokens anteriores. Não imprima nem copie o segredo para
issues, logs ou commits.

## Verificação pós-deploy

1. Execute `npm run db:check:security` com a `DATABASE_URL` de runtime.
2. Confirme que `current_user` não possui `SUPERUSER`, `CREATEDB`, `CREATEROLE`,
   `REPLICATION` ou `BYPASSRLS`.
3. Confirme que a consulta não encontra grants para `anon`/`authenticated`.
4. Teste cadastro, login, refresh, logout e `logout-all` em uma conta de teste.
5. Confirme que uma origem não listada recebe 403 e que o frontend autorizado
   continua enviando o cookie HttpOnly.
6. Verifique no navegador que não há JWT em Local Storage, Session Storage ou
   IndexedDB.
