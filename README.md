# BoviTrack

Aplicação web para propriedades, rebanhos, lotes, vacinação, pesagens, desmamas, produção leiteira e finanças. Inclui dashboard, previsão do tempo, administração de usuários e temas claro/escuro.

Este é o documento principal do projeto. Configurações completas ficam nos `.env.example`; comandos disponíveis, nos `package.json`. Os relatos de auditoria e os guias de publicação anteriores podem ser consultados no [histórico do repositório](https://github.com/CRH535/BoviTrack__Sistema-full-stack-para-gestao-pecuaria/tree/e45c6786fb99c31abe5aa281935eb6caea958427). Este guia descreve o código e os procedimentos; não certifica o estado atual de produção.

## Estrutura e arquitetura

| Local | Responsabilidade |
| --- | --- |
| `frontend/` | SPA em React 19, React Router, Axios e Vite 8. |
| `backend/` | API Node.js/Express 5, CommonJS, JWT e driver `pg`. `app.js` exporta o Express; `server.js` inicia o servidor local. |
| `backend/database/` | Configuração PostgreSQL, contexto RLS, schema, migrations e rollbacks. |
| `scripts/` | Testes isolados, homologação, backup e operações de release. |
| `release/maintenance/` | API de manutenção utilizada no corte de produção. |
| `.github/workflows/ci.yml` | Validação automática com PostgreSQL próprio. |
| `design/fontes-originais/`, `documentos-originais/` | Originais visuais e documentos de referência; não substituem os assets da aplicação. |

Fluxo: navegador → API Express → PostgreSQL local ou hospedado no Supabase. A API não tem prefixo global `/api`. Supabase Auth e Data API não fazem parte da autenticação da aplicação. O clima usa Open-Meteo e depende de disponibilidade externa.

Não há pacote npm na raiz. Os exemplos abaixo partem da raiz do checkout e usam PowerShell. Use Node.js 24 e os lockfiles versionados; as versões exatas das dependências estão nos manifests e locks.

## Instalação e execução local

```powershell
npm ci --prefix backend
npm ci --prefix frontend
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Copie os exemplos somente quando os `.env` de destino ainda não existirem. Edite as credenciais e prepare o banco antes de iniciar a API. Os exemplos não provisionam usuários SQL, migrations ou segredos.

Em dois terminais:

```powershell
# Terminal 1: API em http://localhost:3000
npm start --prefix backend

# Terminal 2: interface; abra a URL exibida pelo Vite
npm run dev --prefix frontend
```

`GET /` da API retorna `{"status":"ok"}`. Isso confirma disponibilidade HTTP, não autenticação ou integridade do banco. Se a porta do Vite mudar, mantenha a origem autorizada do backend consistente.

### Configuração

Frontend — `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:3000
```

Use a URL base da API, sem `/api` nem barra final. Todo `VITE_*` fica visível no bundle: nunca coloque segredos nesse prefixo.

Backend — valores de referência para um PostgreSQL **local já provisionado**:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://LOGIN_DOMINIO:SENHA_CODIFICADA@127.0.0.1:5432/bovitrack
DATABASE_AUTH_URL=postgresql://LOGIN_AUTH:SENHA_CODIFICADA@127.0.0.1:5432/bovitrack
DB_RLS_CONTEXT_KEY=CHAVE_HEXADECIMAL_DE_64_CARACTERES
DB_SSL=disable
FRONTEND_URL=http://localhost:5173
JWT_SECRET=SUBSTITUA_POR_SEGREDO_ALEATORIO_DE_PELO_MENOS_32_BYTES
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=bovitrack-api
JWT_AUDIENCE=bovitrack-web
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
EMAIL_VERIFICATION_REQUIRED=false
ALLOW_TEST_DB_WRITES=false
```

Os placeholders não são valores utilizáveis. `DB_RLS_CONTEXT_KEY` é uma chave aleatória de 32 bytes em hexadecimal, igual à provisionada no schema privado e independente de JWT e do pepper de e-mail. Codifique caracteres especiais das senhas nas URIs. `DATABASE_URL` prevalece sobre as opções legadas `DB_*`.

Consulte [backend/.env.example](backend/.env.example) para pool, timeouts, CORS, fuso, remetente e demais opções. `ADMIN_*` pertence ao provisionamento administrativo; não deve ser usado pelo runtime hospedado. `migrate:auth` pode atualizar a senha de um administrador já existente: revise o script e o destino antes de executá-lo.

## Banco de dados e RLS

A autorização combina regras do backend com RLS no PostgreSQL. O login de domínio deve ser membro de `bovitrack_runtime`; o de autenticação, de `bovitrack_auth_runtime`. Ambos devem ser restritos, sem `SUPERUSER`, `BYPASSRLS` ou privilégios administrativos. O contexto assinado é instalado por transação **no mesmo cliente `pg`** que executa as consultas. Não substitua esse fluxo por consultas soltas no pool.

Os relacionamentos de negócio usam IDs inteiros. Propriedades e vacinas têm vínculo direto ao usuário; registros dependentes herdam o escopo. Novas tabelas e operações precisam preservar autorização, isolamento, parentesco e integridade de exclusão.

### Banco novo de desenvolvimento

Use um cluster dedicado: roles PostgreSQL são compartilhadas pelo cluster. O procedimento de referência testável está em [scripts/test-isolated.cjs](scripts/test-isolated.cjs). Para um ambiente persistente, execute o provisionamento com uma credencial administrativa separada:

1. Aplicar `backend/database/supabase/001_schema_bovitrack.sql` e `003_sessoes_refresh.sql`, depois migrations `007`, `008`, `009` e `012`.
2. Aplicar `020_estrutura_email_sem_revogar_sessoes.sql`, `014`–`018` e `021_email_verificacao_configuravel.sql`.
3. Criar os dois logins com senhas próprias e suas memberships; inserir a chave em `bovitrack_seg.chaves_contexto`. Configurar `bovitrack_seg.configuracao_email.obrigatoria=false` e a flag correspondente da API.
4. Provisionar as contas locais necessárias, aplicar `019_rls_ativacao.sql` e validar autenticação, isolamento e integridade antes de usar o banco.

A aplicação não executa migrations ao iniciar. Em banco existente, inspecione catálogo, grants e histórico antes de escolher o caminho:

| Estado inicial | Caminho relevante |
| --- | --- |
| Legado sem e-mail/RLS | Após o schema anterior compatível: `012` → `020` → `014`–`018` → `021` → provisionamento/configuração → `019`. |
| `013`–`019` já instaladas | Aplicar `021` após preflight; o valor inicial é obrigatório (`true`). Coordenar qualquer mudança de política com a API. |
| `021` já instalada | Não reaplicar migrations para alternar a política de e-mail. |

**`020` é a alternativa à `013` para preservar sessões de contas pendentes. Não execute a `013` original no caminho opcional: ela revoga essas sessões.** A `021` preserva a configuração existente quando reaplicada.

A migration `012` mantém históricos e reforça parentesco/índices; a criação de índices pode bloquear escritas. Planeje manutenção, confira inconsistências e não remova registros para contornar validações.

### Dados existentes e diagnósticos

`migrate:supabase` é um copiador legado limitado a nove tabelas. Ele recusa origens com módulos posteriores ou `animais.mae_id`; não serve para transferir uma instalação atual. Use backup/restauração completos, preservando IDs, sequences e dependências, com ensaio em destino isolado. Não elimine histórico para tornar a origem compatível com o copiador.

```powershell
npm run db:check --prefix backend
npm run db:check:security --prefix backend
npm run db:check:deletions --prefix backend
```

Esses comandos consultam o banco configurado. Confira o destino antes de executar. Migrações e cópias usam credencial administrativa própria; nunca reutilize essa credencial no runtime.

## Sessões e verificação de e-mail

Senhas usam `bcryptjs`. O JWT de acesso fica somente em memória; renovação usa cookie HttpOnly e sessões persistidas, com rotação/revogação. Preserve as verificações de perfil, ownership, CSRF, origem, limites de requisições e campos permitidos. O cadastro público cria `usuario`; operações administrativas são autorizadas no backend.

`EMAIL_VERIFICATION_REQUIRED=false` é o padrão do código. Nessa política, contas pendentes podem cadastrar, entrar e renovar a sessão; seu estado real não é alterado e esses fluxos não enviam códigos automaticamente. A API e `bovitrack_seg.configuracao_email.obrigatoria` precisam concordar: divergência bloqueia autenticação com 503. O frontend consulta `GET /auth/config`; não há flag Vite independente.

Para exigir verificação, prepare remetente/domínio e chave Resend válidos, `EMAIL_FROM`, `EMAIL_VERIFICATION_PEPPER` independente com pelo menos 32 bytes e prova real de recebimento. O remetente de desenvolvimento `resend.dev` tem destinatários restritos e não comprova entrega para usuários externos. Defina recuperação de acesso e comunicação para contas antigas, incluindo o administrador. Não marque contas como verificadas artificialmente.

A troca de política exige manutenção e mudança coordenada da configuração administrativa SQL e da variável da API, seguida de validação. Ligar a obrigatoriedade pode revogar sessões pendentes durante o refresh; desligá-la não restaura sessões já revogadas. Não precisa desativar RLS nem remover desafios para alternar essa política.

Quando habilitado, o fluxo usa código de seis dígitos, validade de dez minutos, até cinco tentativas e cooldown de sessenta segundos. O ticket restrito de trinta minutos fica em memória e é enviado por `X-Email-Verification` para `POST /auth/email/verificar` ou `/auth/email/reenviar`; não serve como Bearer token. Código, ticket, e-mail e credenciais não devem ir à URL, storage ou logs. Após verificar, o usuário faz novo login.

## Testes e build

Verificações sem banco de dados:

```powershell
npm run lint --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
node scripts/test-isolated.cjs offline
node scripts/test-isolation.cjs
```

O build inclui os testes de ícones, imports e caixa dos assets para Linux/Vercel. A saída fica em `frontend/dist/`; `npm run preview --prefix frontend` apenas a visualiza localmente.

Para integração e Playwright, prepare um PostgreSQL **local e exclusivo para testes**, com permissão de criar bancos e roles. Ajuste a senha e a porta do exemplo ao cluster dedicado:

```powershell
$env:BOVITRACK_TEST_POSTGRES_URL = 'postgresql://postgres:SENHA_DE_TESTE@127.0.0.1:55432/postgres'
node scripts/test-isolated.cjs integration
node scripts/test-isolated.cjs email-flag
Push-Location frontend
npx playwright install chromium
Pop-Location
node scripts/test-isolated.cjs all
$env:BOVITRACK_TEST_EMAIL_REQUIRED = 'false'
node scripts/test-isolated.cjs e2e email-optional.spec.js
$env:BOVITRACK_TEST_EMAIL_REQUIRED = $null
```

`all` inclui integração e E2E com obrigatoriedade ativa por padrão; `email-flag` cobre as duas políticas e transições. O runner recusa URLs fora de loopback, sem aceitar query/hash; cria banco e logins temporários e os remove ao terminar. Interrupção forçada pode deixar recursos para revisão manual. Resend é simulado: aprovação local não prova entrega real. Não execute suítes avulsas que gravam dados contra produção nem habilite `ALLOW_TEST_DB_WRITES` nesse ambiente.

Playwright usa API `3005` e Vite `5175`, sem reutilizar servidores existentes. Saídas: `frontend/test-results/` e `frontend/playwright-report/`. O CI em [.github/workflows/ci.yml](.github/workflows/ci.yml) executa lint, build, auditorias e testes em PostgreSQL próprio. Para verificar dependências, use `npm audit --prefix backend` e `npm audit --prefix frontend`; não aplique correções forçadas sem revisar o impacto. O override de `minimatch` está no manifest frontend e deve ser reavaliado ao atualizar seus consumidores.

## Interface e manutenção

Reutilize os componentes de `frontend/src/components/` e os tokens em `frontend/src/styles/tokens.css`, com layout em `layout.css` e controles em `ui.css`. Preserve foco visível, nomes acessíveis, navegação por teclado, retorno de foco dos diálogos, responsividade e `prefers-reduced-motion`.

Ícones de ação usam o registro em `frontend/src/components/Icone.jsx`; ilustrações de navegação usam `IlustracaoModulo.jsx` e assets próprios. Preserve adaptadores, nomes e identidade visual. Originais em `design/fontes-originais/` não são instrução para substituir automaticamente os assets em uso.

Valores financeiros são agregados em centavos e os períodos seguem `APP_TIMEZONE` (`America/Sao_Paulo` por padrão). O resumo reflete os registros cadastrados; não é uma contabilidade completa. Não altere as regras de filtros e acesso ao fazer mudanças visuais.

## Produção, publicação e recuperação

| Configuração | Requisito |
| --- | --- |
| Vercel API | Root Directory `backend`, Express e Node 24. |
| Vercel frontend | Root Directory `frontend`, build `npm run build`, saída `dist`; rewrites da SPA em `frontend/vercel.json`. |
| Banco remoto | Logins separados de domínio/auth; runtime via Transaction pooler, normalmente `6543`, com pool pequeno; administração/dumps por Direct ou Session pooler, normalmente `5432`. Use os dados do projeto correto. |
| TLS | `DB_SSL=verify-full` e CA confiável por `DB_SSL_CA_PATH` ou `DB_SSL_CA_BASE64`. Não misture parâmetros SSL da URI com opções conflitantes de configuração. |
| Sessão e origem | `NODE_ENV=production`, `FRONTEND_URL` com origens HTTPS explícitas, `COOKIE_SECURE=true`; `COOKIE_SAME_SITE=none` para cross-site. Testar restrições de cookies dos navegadores. |
| Segredos | JWT aleatório com pelo menos 32 bytes; chave RLS independente, logins restritos e política de e-mail coerente com SQL. Nenhuma credencial administrativa no runtime ou no frontend. |

Mudanças em `VITE_API_URL` exigem novo build. Mudanças de variáveis no serviço exigem novo deployment. Preserve `.vercelignore`, inclusive a exceção que inclui `frontend/tests/icons.test.js` no prebuild. Não versionar `.env`, dumps, DPAPI, backups, tokens ou dados pessoais. Segredos expostos precisam de rotação coordenada.

Para um corte com mudança de schema/roles, seguir esta ordem, com autorização específica do SHA e do ambiente:

1. Revisar código, compatibilidade e permissões; validar backup com restauração em cópia isolada. Usar armazenamento privado externo ao checkout. Materializar fontes versionadas com `scripts/prepare-release-sources.cjs`; não reutilizar pacote de outro SHA.
2. Colocar todos os aliases da API em manutenção, drenar escritores e bloquear o login legado. Conferir projeto, TLS, SHA e marcador administrativo. `scripts/prepare-production-cutover.cjs` prepara o cofre DPAPI; `scripts/release-production.cjs` impõe os guardas. Esses scripts estão vinculados ao projeto de produção definido no código; não os reutilize em outro projeto sem revisão.
3. Fazer backup fresco após o freeze, conferir manifesto e executar preparo/provisionamento pelo ledger. O caminho opcional usa `012/020/014–018/021`; ativação `019` vem depois. Cada migration é atômica, mas migrations anteriores podem já estar commitadas quando outra falha.
4. Configurar os dois runtimes com `scripts/configure-production-vercel.cjs`; construir API e frontend sem promover aliases. Ativar RLS somente quando as versões compatíveis estiverem prontas. Conferir políticas, grants, isolamento e fluxos reais no deployment fechado.
5. Promover frontend e depois API; validar cadastro/login/refresh/F5/logout, perfil administrativo, dados próprios, acesso cruzado negado, CORS e cookies. Health/READY não bastam. Fixtures em produção precisam de autorização e limpeza próprias.

Os modos administrativos do executor são `--check`, `--freeze-legacy`, `--prepare`, `--provision`, `--activate` e `--rollback-rls`. Eles exigem checkout/SHA compatíveis; as escritas também exigem aprovação, manutenção e demais guardas previstos no código. Não execute a sequência como instalação genérica nem repita um provisionamento já concluído. Autodeploys precisam ser coordenados com a janela.

Em falha, mantenha manutenção e examine o ledger. Não promova código legado sobre banco com RLS ativo nem tente corrigir retorno de e-mail desligando RLS. Um rollback SQL reduz proteção e exige decisão própria; use o executor e [backend/database/rollback/019_rls_rollback_dev.sql](backend/database/rollback/019_rls_rollback_dev.sql) somente após conferir suas pré-condições. Não remova `020/021` nem históricos. Se houve novas gravações, preserve o estado atual e reconcilie em cópia isolada antes de qualquer restore. Desligar a flag de e-mail não recupera sessões revogadas.

Backups privados e evidências de homologação devem ser preservados até validar recuperação. Não mova a pasta proprietária do `.git` de um worktree sem conferir `git worktree list` e dependências locais de configuração. Para o grafo e as instruções de ferramentas, consulte `AGENTS.md`; esses arquivos funcionais e os snapshots gerados não fazem parte da documentação humana consolidada.
