# BoviTrack

**Gestão de propriedades, rebanhos e registros da atividade pecuária em uma aplicação web.**

O BoviTrack reúne informações de propriedades, animais, lotes, manejo, vacinação, produção leiteira e movimentações financeiras. A interface utiliza React; uma API Express concentra as regras de negócio, a autenticação e o acesso ao PostgreSQL.

> **Status:** projeto em desenvolvimento. Esta documentação foi conferida com os arquivos disponíveis em 12 de outubro de 2026. Veja o [relatório de evolução](docs/RELATORIO_EVOLUCAO_2026-10-12.md) para alterações, testes e limites da validação local.

## Sumário

- [Problema, objetivo e público-alvo](#problema-objetivo-e-público-alvo)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Segurança e autenticação](#segurança-e-autenticação)
- [Pré-requisitos](#pré-requisitos)
- [Instalação e execução local](#instalação-e-execução-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts úteis](#scripts-úteis)
- [Banco de dados e Supabase](#banco-de-dados-e-supabase)
- [Deploy em Vercel](#deploy-em-vercel)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Observações sobre produção](#observações-sobre-produção)
- [Autoria e contribuição](#autoria-e-contribuição)
- [Licença](#licença)

## Problema, objetivo e público-alvo

Registros distribuídos entre planilhas e anotações dificultam acompanhar o histórico dos animais, o manejo sanitário e o resultado financeiro de uma propriedade.

O objetivo do BoviTrack é centralizar esses registros e facilitar a consulta de informações para apoiar a organização da atividade pecuária.

O público-alvo são produtores rurais, responsáveis pelo manejo de rebanhos e gestores de propriedades que precisam registrar e acompanhar sua operação.

## Funcionalidades

| Área | Recursos presentes no projeto |
| --- | --- |
| Acesso | Cadastro, login, renovação de sessão e logout; perfis de usuário e administrador. |
| Propriedades | Cadastro e manutenção de propriedades, com cidade, estado e área. |
| Animais | Cadastro, identificação por brinco, data de nascimento e ficha individual. |
| Lotes | Organização de animais em lotes vinculados às propriedades. |
| Pesagens e desmamas | Registro e acompanhamento do manejo, com histórico de pesagens e gráficos de peso. |
| Sanidade | Cadastro de vacinas e registro de aplicações, próxima dose e observações. |
| Controle leiteiro | Registro de produções por animal e visualização do histórico na ficha, incluindo gráfico. |
| Finanças | Despesas e receitas por propriedade; categorias, formas de pagamento/recebimento e resumo de receitas, despesas e lucro líquido com filtros. |
| Dashboard | Visão consolidada dos registros acessíveis ao usuário e alertas. |
| Clima | Consulta de condições atuais e previsão por cidade/estado da propriedade, via Open-Meteo, com alertas de chuva, calor e vento. |
| Administração | Área de gestão de usuários restrita ao administrador. |
| Preferências | Configurações visuais e tutorial de navegação. |

As consultas meteorológicas dependem do serviço externo e da localização encontrada para a cidade. O resumo financeiro é calculado sobre os registros cadastrados; não equivale a um sistema contábil completo.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Interface | JavaScript, React 19, React Router 7, CSS e Axios. |
| Desenvolvimento e build | Vite 8 e ESLint 10. |
| API | Node.js, Express 5 e módulos CommonJS. |
| Banco | PostgreSQL, acessado pelo driver `pg` e pool de conexões. |
| Autenticação | `jsonwebtoken`, `bcryptjs` e sessões de renovação persistidas no banco. |
| Proteções HTTP | Helmet, CORS e middlewares próprios de validação, CSRF e limitação de requisições. |
| Configuração | `dotenv` no backend e variáveis `VITE_*` no frontend. |
| Serviços externos | Supabase como PostgreSQL hospedado; Open-Meteo para clima. |
| Hospedagem documentada | Vercel para frontend e API, em projetos separados. |

Os intervalos de versões estão em `frontend/package.json` e `backend/package.json`; os arquivos de lock registram as versões resolvidas.

## Arquitetura

```text
Navegador
   |
   +-- React + React Router
   |      |
   |      +-- Axios --> API Express --> PostgreSQL local ou Supabase
   |                          |
   |                          +------> Open-Meteo
   |
   +-- Access token em memória + cookie HttpOnly de renovação
```

O frontend é uma SPA. O backend expõe rotas HTTP sem prefixo global `/api`, aplica autenticação e autorização e executa consultas pelo `pg`.

`backend/app.js` configura e exporta o Express. `backend/server.js` inicia a escuta no ambiente local. As rotas são separadas por domínio; controllers, services e middlewares apoiam os módulos. A aplicação não possui scripts npm na raiz: execute os comandos na pasta correspondente.

O navegador não acessa o PostgreSQL diretamente. O Supabase é utilizado como banco hospedado; Supabase Auth e Data API não fazem parte do fluxo de autenticação da aplicação.

## Segurança e autenticação

- Senhas são armazenadas como hashes com `bcryptjs`.
- O login emite um JWT de acesso, mantido em memória pelo frontend e enviado no cabeçalho `Authorization: Bearer ...`.
- A renovação utiliza cookie HttpOnly e sessões no PostgreSQL, com rotação e revogação. O cliente Axios envia cookies com `withCredentials` e tenta renovar a sessão quando recebe um erro de autenticação apropriado.
- Os tokens de autenticação não são persistidos pelo cliente atual em Local Storage. Preferências visuais podem usar esse armazenamento.
- O cadastro público cria o perfil `usuario`. O administrador inicial é criado por script administrativo; rotas administrativas também verificam o perfil no backend.
- A autorização de dados privados ocorre no backend. Propriedades e vacinas têm vínculo direto com o usuário; os demais registros herdam o acesso pelos relacionamentos.
- Listagens, alterações, vínculos entre entidades e agregações devem respeitar esse escopo. Recursos de terceiros são tratados como indisponíveis, inclusive diante de IDs manipulados.
- CORS, validação de origem nas rotas de sessão, limites de requisições, limites de corpo JSON e cabeçalhos de segurança complementam as verificações de acesso.

As configurações de produção são validadas na inicialização. Use HTTPS, segredo JWT aleatório, origens explícitas, cookies seguros e TLS com verificação de certificado para o banco.

## Pré-requisitos

- Git e npm.
- Node.js compatível com as dependências instaladas. Para este projeto com Vite 8, use Node.js **22.12 ou superior em uma linha suportada**, verificando também os requisitos do ESLint e do lockfile. Consulte os [requisitos oficiais do Vite](https://vite.dev/guide/).
- PostgreSQL acessível localmente ou um projeto Supabase.
- Ferramentas PostgreSQL `psql` e `createdb` para o exemplo de instalação abaixo. A cópia para Supabase também utiliza `pg_dump`.
- Acesso à internet para instalar dependências e consultar o clima.

## Instalação e execução local

Os comandos abaixo podem ser executados no PowerShell. Substitua os placeholders antes de usá-los.

### 1. Obter o código e instalar dependências

```powershell
git clone "URL_DO_REPOSITORIO" BoviTrack
cd BoviTrack/backend
npm ci
Copy-Item .env.example .env

cd ../frontend
npm ci
Copy-Item .env.example .env
cd ..
```

Use `npm ci` com os arquivos `package-lock.json` versionados. Se estiver trabalhando com uma distribuição sem lockfile, use `npm install` e revise o lockfile gerado.

Edite os dois arquivos `.env` conforme a seção de configuração. Escolha uma senha administrativa própria e gere o segredo JWT; copiar o exemplo não configura credenciais utilizáveis.

### 2. Preparar um PostgreSQL local vazio

O arquivo de schema abaixo cria as tabelas de negócio iniciais. Apesar do nome da pasta `supabase`, utiliza SQL PostgreSQL e pode inicializar um banco local vazio. Ele não deve ser reaplicado em um banco já populado.

Antes dos scripts npm, configure `DB_*` no `.env` para esse banco e informe `ADMIN_NOME`, `ADMIN_EMAIL` e `ADMIN_SENHA` para `migrate:auth`. Mantenha `DATABASE_URL` ausente se quiser utilizar `DB_*`.

```powershell
createdb -h localhost -p 5432 -U postgres bovitrack
cd backend
psql -h localhost -p 5432 -U postgres -d bovitrack -v ON_ERROR_STOP=1 -f database/supabase/001_schema_bovitrack.sql

npm run migrate:auth
npm run migrate:sessions
npm run migrate:milk
npm run migrate:bezerros

psql -h localhost -p 5432 -U postgres -d bovitrack -v ON_ERROR_STOP=1 -f database/migrations/009_seguranca_sessoes_rate_limit.sql
psql -h localhost -p 5432 -U postgres -d bovitrack -v ON_ERROR_STOP=1 -f database/migrations/012_integridade_parentesco_indices.sql
npm run db:check
```

Configure `DB_*` para esse banco no `.env` e mantenha `DATABASE_URL` ausente se quiser utilizar essas variáveis. Os comandos PostgreSQL solicitam a senha da conexão; não coloque a senha na linha de comando.

O schema inicial já inclui receitas e os campos básicos de identificação dos animais e despesas. As migrações acima acrescentam sessões, produção leiteira e manejo de bezerros; a migração `009` completa as estruturas de segurança da sessão e dos limites de requisição.

`migrate:auth` utiliza `ADMIN_NOME`, `ADMIN_EMAIL` e `ADMIN_SENHA`. Se o e-mail administrativo já existir, o script pode atualizar sua senha e dados. Execute-o conscientemente.

Para bancos existentes, revise o estado antes de escolher migrações incrementais. A migração `010` é destinada ao ambiente Supabase e referencia suas roles; ela não integra a inicialização local acima.

### 3. Iniciar o backend

No primeiro terminal, dentro de `backend`:

```powershell
npm start
```

A API usa `http://localhost:3000` por padrão. `GET /` retorna `{"status":"ok"}`; essa resposta verifica a disponibilidade HTTP, mas não comprova que o schema e todas as consultas ao banco estão válidos.

### 4. Iniciar o frontend

No segundo terminal, dentro de `frontend`:

```powershell
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`. Se a porta estiver ocupada e o Vite escolher outra, ajuste a configuração de origem quando necessário.

Entre com a conta administrativa criada no passo anterior ou utilize o cadastro público para criar um usuário comum. Valide os registros e o isolamento entre contas em um banco de desenvolvimento.

## Variáveis de ambiente

Todos os valores abaixo são exemplos. Não versione arquivos `.env`, URIs reais, senhas ou tokens.

### Frontend — `frontend/.env`

```dotenv
VITE_API_URL=http://localhost:3000
```

Em produção, substitua por `https://SEU_BACKEND.vercel.app`, sem `/api` e sem barra final. Variáveis `VITE_*` entram no bundle e ficam visíveis no navegador: nunca use esse prefixo para segredos ou credenciais do banco.

### Backend — desenvolvimento local

```dotenv
NODE_ENV=development
PORT=3000
DB_USER=postgres
DB_HOST=localhost
DB_NAME=bovitrack
DB_PASSWORD=SUBSTITUA_PELA_SENHA_LOCAL
DB_PORT=5432
DB_SSL=disable

FRONTEND_URL=http://localhost:5173
CORS_ALLOW_LOCALHOST=false
CSRF_ALLOW_NO_ORIGIN=true
APP_TIMEZONE=America/Sao_Paulo

JWT_SECRET=SUBSTITUA_POR_UM_VALOR_ALEATORIO_GERADO
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=bovitrack-api
JWT_AUDIENCE=bovitrack-web
COOKIE_SAME_SITE=lax
COOKIE_SECURE=false
JSON_BODY_LIMIT=100kb

DB_POOL_MAX=2
DB_CONNECTION_TIMEOUT_MS=5000
DB_IDLE_TIMEOUT_MS=10000
DB_QUERY_TIMEOUT_MS=15000
DB_STATEMENT_TIMEOUT_MS=15000

ADMIN_NOME=Administrador
ADMIN_EMAIL=admin@example.com
ADMIN_SENHA=SUBSTITUA_POR_UMA_SENHA_FORTE_E_UNICA
ALLOW_TEST_DB_WRITES=false
```

`DB_SSL=disable` é apropriado apenas para o exemplo de PostgreSQL local. Conexões remotas devem utilizar TLS. Os valores de `ADMIN_*` são usados na configuração administrativa, não devem ser credenciais públicas e não precisam ficar no runtime hospedado.

### Backend — produção e migrações

| Variável | Configuração e finalidade |
| --- | --- |
| `NODE_ENV` | `production` no backend hospedado. |
| `DATABASE_URL` | URI do login de execução do banco; tem precedência sobre `DB_*`. Exemplo estrutural: `postgresql://USUARIO_RUNTIME:SENHA_URL_ENCODED@HOST_POOLER:6543/postgres`. |
| `DB_SSL` | `verify-full` em produção. |
| `DB_SSL_CA_BASE64` ou `DB_SSL_CA_PATH` | CA confiável em PEM codificado em base64, ou caminho do certificado disponível no servidor. Configure uma alternativa. |
| `FRONTEND_URL` | Origem HTTPS exata do frontend; várias origens autorizadas são separadas por vírgula. |
| `COOKIE_SECURE` | `true` em produção. |
| `COOKIE_SAME_SITE` | `none` quando a comunicação for cross-site; nesse caso `Secure` é obrigatório. |
| `JWT_SECRET` | Valor novo e aleatório, com pelo menos 32 bytes, sem palavras ou valores de exemplo. |
| `JWT_ACCESS_EXPIRES_IN` | Padrão documentado: `15m`; em produção, a validação aceita entre `1m` e `30m`. |
| `JWT_REFRESH_EXPIRES_IN` | Padrão documentado: `7d`; em produção, entre `1h` e `30d`. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `bovitrack-api` / `bovitrack-web`, ou valores consistentes definidos pela instalação. |
| `CORS_ALLOW_LOCALHOST` | Mantenha `false` em produção. |
| `CSRF_ALLOW_NO_ORIGIN` | Mantenha `false` em produção para exigir origem nas operações protegidas de sessão. |
| `SUPABASE_MIGRATION_URL` | Conexão administrativa para migrações que a utilizam; Direct connection ou Session pooler, normalmente porta `5432`. Não configure no runtime da Vercel. |
| `LOCAL_DATABASE_URL` | URI opcional da origem na cópia para Supabase; alternativamente, o script usa `DB_*`. |
| `ALLOW_TEST_DB_WRITES` | `true` somente em banco isolado de teste para suítes que gravam/excluem dados. |

Os ajustes de pool, timeouts, tamanho do JSON e fuso podem seguir o exemplo local. Consulte `backend/.env.example` para a lista mantida pelo projeto.

Não combine parâmetros SSL na URI, como `sslmode`, com `DB_SSL` e as variáveis de CA: o backend rejeita configurações conflitantes. Codifique caracteres especiais de senhas ao montar URIs.

## Scripts úteis

### Frontend

| Comando | Finalidade |
| --- | --- |
| `npm run dev` ou `npm start` | Servidor de desenvolvimento Vite. |
| `npm run build` | Build estático em `dist/`. |
| `npm run preview` | Visualização local do build; não é um servidor de produção. |
| `npm run lint` | Análise estática com ESLint. |
| `npm test` | Regressões do cliente HTTP e isolamento de sessões, sem banco. |
| `npm run test:e2e` | Playwright através do runner que cria banco local descartável. |

### Backend

| Comando | Finalidade |
| --- | --- |
| `npm start` | Iniciar a API local. |
| `npm run db:check` | Inspecionar estrutura e integridade do banco. |
| `npm run db:check:security` | Verificações de segurança do banco em modo de leitura. |
| `npm run db:check:deletions` | Verificar integridade relacionada a exclusões. |
| `npm run migrate:auth` | Estrutura de autenticação, administrador inicial e atribuição de dados legados. |
| `npm run migrate:users` | Campo de ativação de usuários. |
| `npm run migrate:animal-lots` | Ajustes do relacionamento entre animais e lotes. |
| `npm run migrate:animals` | Campos de brinco e nascimento. |
| `npm run migrate:expenses` | Forma de pagamento das despesas. |
| `npm run migrate:revenues` | Estrutura e permissões de receitas, via conexão administrativa. |
| `npm run migrate:milk` | Estrutura de produção leiteira. |
| `npm run migrate:bezerros` | Estrutura de pesagens e desmamas. |
| `npm run migrate:sessions` | Estrutura inicial das sessões de renovação. |
| `npm run migrate:security` | Migrações `009` e `010`, via conexão administrativa do Supabase. |
| `npm run migrate:integrity` | Migração `012`: proteção de parentesco e índices, via conexão administrativa explícita. |
| `npm run migrate:supabase` | Backup e cópia do banco de origem para Supabase. |
| `npm test` | Suíte de autenticação e permissões. |
| `npm run test:milk` | Produção leiteira. |
| `npm run test:bezerros` / `npm run test:bezerros:integration` | Manejo de bezerros e integração. |
| `npm run test:security` | Validações de segurança. |
| `npm run test:receitas` | Receitas e isolamento de acesso. |
| `npm run test:clima` | Serviço de clima. |
| `npm run test:deletion-impact` | Impacto de exclusões. |
| `npm run test:offline` | Suítes offline do backend e do cliente HTTP. |
| `npm run test:isolated` | Integração em banco novo local, criado e removido pelo runner. |
| `npm run test:regressions` / `npm run test:regressions:integration` | Regressões de validação, sessão, ownership, agregações e parentesco. |

Leia as pré-condições de cada script. As suítes de integração podem inserir e excluir registros; use banco isolado, com `ALLOW_TEST_DB_WRITES=true` somente durante esses testes. Não execute testes que gravam dados no banco de produção.

### Validação reproduzível em banco descartável

Depois de `npm ci` nas duas pastas, use um PostgreSQL **local dedicado aos testes**, com permissão de criar bancos. Na raiz, configure a conexão administrativa local do runner; o exemplo exige que você substitua a senha fictícia:

```powershell
$env:BOVITRACK_TEST_POSTGRES_URL = 'postgresql://postgres:SENHA_DE_TESTE@127.0.0.1:5432/postgres'
node scripts/test-isolated.cjs offline
node scripts/test-isolation.cjs
node scripts/test-isolated.cjs integration
cd frontend
npx playwright install chromium
cd ..
node scripts/test-isolated.cjs e2e
```

`all` executa integração e E2E. O runner aceita somente URI PostgreSQL em loopback, sem query/hash, cria nome aleatório `bovitrack_test_*`, aplica schema e migrations (incluindo reaplicação de `012`), define configuração de teste e remove somente seu banco ao terminar normalmente ou diante de falha da suíte. A URL de negócio do ambiente é substituída. Os processos filhos legados podem ler `.env`, mas os valores explícitos do runner prevalecem. Não use conexão de produção. Uma interrupção forçada do processo pode deixar recursos de teste para limpeza manual.

O Playwright inicia API e Vite nas portas `3005` e `5175`, recusa reutilizar servidores existentes, usa Chromium e sete viewports. Dados e autenticação são reais; apenas clima externo e o cenário explícito de erro do dashboard são simulados. Capturas ficam em `frontend/test-results/` e relatório HTML em `frontend/playwright-report/`, ambos ignorados pelo Git. O workflow [CI](.github/workflows/ci.yml) instala dependências e executa lint, build, auditoria e testes em serviço PostgreSQL próprio.

## Banco de dados e Supabase

O modelo utiliza propriedades como vínculo central dos registros de negócio. As entidades principais incluem `usuarios`, `propriedades`, `animais`, `lotes`, `animais_lotes`, `vacinas`, `vacinacoes`, `despesas`, `receitas`, `producoes_leiteiras`, `pesagens` e `desmamas`. Sessões e limites de requisições possuem tabelas próprias.

Os IDs das entidades de negócio permanecem inteiros; não converta os relacionamentos para UUID para hospedar o banco no Supabase.

### Migrar dados existentes

**Limite do copiador legado:** `migrate:supabase` copia somente nove tabelas do schema inicial. Agora recusa, antes de conectar ao destino, origens com tabelas adicionais ou `animais.mae_id`; portanto não serve para copiar uma instalação atual com sessões, leite, pesagens e desmamas. Nesse caso, planeje backup/restauração completos e ensaie em destino isolado. Não remova históricos para contornar a proteção.

1. Faça backup e interrompa escritas na origem.
2. Configure `SUPABASE_MIGRATION_URL` para um destino vazio, usando Direct connection ou Session pooler; informe a origem por `LOCAL_DATABASE_URL` ou `DB_*`.
3. Confirme que a origem é compatível com as nove tabelas do copiador legado; dentro de `backend`, execute `npm run migrate:supabase`.
4. O script cria backup em `backend/backups/`, valida o destino, copia os registros, preserva IDs, ajusta sequences e compara contagens antes do commit.
5. Depois da cópia, revise e aplique as migrações incrementais necessárias para o estado da origem e os módulos atuais. Não presuma que a cópia do schema base conclui todas as migrações posteriores.
6. Após completar as migrações do destino, execute `npm run db:check` e valide a aplicação antes de liberar novas escritas. Preserve a origem e o backup até concluir a conferência. O checker atual exige os módulos posteriores, por isso não é uma pré-condição compatível com o schema legado.

O script recusa destinos com dados existentes ou estruturas parciais. As instruções detalhadas estão em [backend/MIGRACAO_SUPABASE.md](backend/MIGRACAO_SUPABASE.md); para produção, siga também os requisitos atuais de TLS e permissões em [backend/database/SEGURANCA_PRODUCAO.md](backend/database/SEGURANCA_PRODUCAO.md).

A migração `012` não reescreve dados históricos e deve ser aplicada em janela de manutenção: a criação normal de índices pode bloquear escritas. Consulte [INTEGRIDADE_012.md](backend/database/INTEGRIDADE_012.md) para pré-condições e reversão. Inconsistências existentes são reportadas por `db:check`, sem correção automática.

### Preparar o runtime no Supabase

Com as tabelas e migrações funcionais presentes, execute `migrate:security` e `migrate:revenues` pela conexão administrativa. A migração de segurança pressupõe, entre outras, as estruturas de sessões, produção leiteira, pesagens e desmamas.

Crie um login dedicado com os privilégios limitados documentados e associe-o à role `bovitrack_runtime`. Use esse login na `DATABASE_URL` da aplicação. Alguns scripts antigos de migração usam a conexão normal do pool: execute-os em um contexto administrativo de manutenção, nunca com o login restrito de runtime.

A separação de usuários da aplicação é aplicada pelo Express. RLS não integra esse fluxo. Desative a Data API quando o projeto Supabase for dedicado a esse uso e confira a ausência de privilégios de acesso de `anon` e `authenticated` às tabelas e sequences.

Para a Vercel, use o Transaction pooler, normalmente na porta `6543`, com pool pequeno. Para migrações, use Direct connection ou Session pooler, normalmente na porta `5432`. Copie host, usuário e porta do painel do seu projeto. Consulte a [documentação de conexões do Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) e a [verificação TLS](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Deploy em Vercel

O repositório pode ser conectado a dois projetos Vercel, com diretórios raiz diferentes.

### API

1. Importe o repositório e configure **Root Directory: `backend`**.
2. Use a detecção do framework Express. `app.js` exporta a aplicação; não há build de frontend nessa pasta.
3. Configure as variáveis de produção do backend, incluindo `DATABASE_URL` de runtime, TLS e CA, segredo JWT, origens autorizadas e cookies seguros.
4. Prepare o banco previamente por um processo administrativo separado. Não execute migrações no início de cada requisição nem guarde a conexão administrativa no projeto hospedado.
5. Publique e registre a URL HTTPS da API.

A Vercel documenta a detecção e execução do Express como função em [Express on Vercel](https://vercel.com/docs/frameworks/backend/express). Confirme a versão de Node configurada e as opções disponíveis no painel durante o deploy.

### Interface

1. Importe o mesmo repositório em outro projeto, com **Root Directory: `frontend`**.
2. Selecione Vite; confirme **Build Command: `npm run build`** e **Output Directory: `dist`**.
3. Configure `VITE_API_URL` com a URL HTTPS da API.
4. Publique. O arquivo `frontend/vercel.json` já contém cabeçalhos e rewrite para o `index.html`, permitindo acessar diretamente as rotas da SPA.
5. Atualize `FRONTEND_URL` no backend com a origem exata da interface e faça redeploy quando alterar suas variáveis.

As variáveis Vite são incorporadas durante o build: mudar `VITE_API_URL` exige novo build/deploy. Consulte [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).

Quando frontend e API forem cross-site, configure `COOKIE_SAME_SITE=none` e `COOKIE_SECURE=true`. Verifique o funcionamento dos cookies nos navegadores de destino; políticas de bloqueio de cookies de terceiros podem exigir ajuste dos domínios utilizados. Autorize explicitamente as origens de preview que realmente precisem acessar a API.

### Conferência após publicar

- Verifique disponibilidade HTTP e conexão com o banco separadamente.
- Teste cadastro, login, renovação, logout e acesso administrativo com contas de teste.
- Confirme o isolamento entre usuários e os resumos do Dashboard e das finanças.
- Abra uma rota interna da SPA diretamente e recarregue a página.
- Confira cookies, CORS, TLS e ausência de credenciais no bundle e nos logs.
- Execute `npm run db:check:security` a partir de um ambiente seguro com o login de runtime.

## Estrutura de pastas

```text
BoviTrack/
├── frontend/
│   ├── public/                 # Assets e inicialização de tema
│   ├── src/
│   │   ├── auth/               # Contexto de autenticação e proteção de rotas
│   │   ├── components/         # Componentes, gráficos e diálogos
│   │   ├── pages/              # Telas dos módulos
│   │   ├── preferences/        # Preferências da interface
│   │   ├── services/api.js     # Axios, token em memória e renovação
│   │   ├── transitions/        # Transições visuais
│   │   ├── tutorial/           # Tutorial de navegação
│   │   ├── utils/              # Utilitários de datas e clima
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── package.json
│   ├── vercel.json
│   └── vite.config.js
├── backend/
│   ├── config/                 # Ambiente e CORS
│   ├── controllers/            # Controllers dos módulos que os utilizam
│   ├── database/
│   │   ├── migrations/         # Evolução incremental do banco
│   │   ├── supabase/           # Schema base e SQL de apoio
│   │   ├── config.js
│   │   └── pool.js
│   ├── middleware/             # Autenticação, CSRF, limites e erros
│   ├── routes/                 # Rotas por domínio
│   ├── scripts/                # Migrações e verificações
│   ├── services/               # Sessões, clima, manejo e regras auxiliares
│   ├── tests/                  # Suítes automatizadas
│   ├── utils/
│   ├── .env.example
│   ├── MIGRACAO_SUPABASE.md
│   ├── app.js
│   ├── server.js
│   └── package.json
└── README.md
```

Arquivos de lock e outros recursos foram omitidos para manter a visão resumida. `backend/backups/` é gerado durante a migração e pode conter dados sensíveis.

## Observações sobre produção

- Configure backups, restauração, observabilidade e atualização de dependências antes de disponibilizar dados reais.
- Use credenciais novas por ambiente e mantenha migração e runtime separados. O documento de segurança do projeto registra exposição histórica de um segredo JWT: gere outro valor antes de publicar e trate credenciais expostas conforme seu processo de rotação.
- Nunca publique dumps, backups ou arquivos `.env`. Não use dados reais em suítes de integração.
- Valide permissões após novas migrações, inclusive nas tabelas adicionadas posteriormente.
- O ambiente serverless pode criar várias instâncias. Ajuste pool e timeouts ao limite do banco; o cache de clima em memória é apenas uma otimização por instância.
- A resposta de saúde HTTP, um build concluído ou a existência de testes não substituem a validação funcional do ambiente implantado.

## Autoria e contribuição

**Autores e mantenedores:** a definir. Preencha com os nomes e perfis dos responsáveis antes da publicação oficial.

Para contribuir:

1. Descreva a alteração ou problema em uma issue.
2. Crie uma branch a partir da branch de desenvolvimento adotada pelo projeto.
3. Preserve a arquitetura existente e aplique mudanças incrementais.
4. Atualize a documentação e execute as verificações pertinentes em ambiente isolado.
5. Abra um pull request com a motivação, o comportamento resultante e a validação realizada.

Não envie segredos, backups ou dados de usuários em issues ou pull requests.

## Licença

**A definir pelos responsáveis pelo projeto.** Adicione um arquivo `LICENSE` e alinhe os metadados dos pacotes quando a licença for escolhida. O `backend/package.json` contém atualmente `ISC`, mas não se assume que esse campo isolado define a licença de todo o repositório.
