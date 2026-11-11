# BoviTrack — verificação para publicação em produção

> Relatório histórico de 10/11/2026. A publicação posterior com RLS ativo e e-mail opcional está registrada em [Deploy de produção](DEPLOY_PRODUCAO_RLS_SEM_VERIFICACAO_EMAIL.md). As vulnerabilidades npm citadas abaixo foram corrigidas posteriormente. As seções seguintes preservam os resultados daquela auditoria.

Data: 10/11/2026, America/Sao_Paulo. Verificação realizada nesta sessão.

## Resultado: BLOQUEADO

A versão local mais recente foi identificada e passou nas verificações funcionais executadas, mas **não está aprovada para produção**. O banco vivo não possui as estruturas exigidas por essa versão. O `npm audit` também retornou vulnerabilidades de severidade alta. Nenhum novo deployment, push, merge, migration remota, alteração de ambiente ou ativação de RLS foi realizado.

Frontend e backend continuam no commit `d22d106889debe59cad67f344efbe94810c7912a`, com deployments READY. Esse é também o commit atual de `origin/main`, atualizado por `git fetch origin`. Não existe uma atualização local mais nova, compatível e aprovada nas verificações executadas que possa ser publicada sob as condições autorizadas. Republicar o mesmo código seria redundante.

## 1. Repositórios e versão selecionada

Repositório remoto: https://github.com/CRH535/BoviTrack__Sistema-full-stack-para-gestao-pecuaria

| Local/ref | Commit | Situação confirmada |
|---|---|---|
| `C:\Users\pfalg\Downloads\Bovitrack\BoviTrack__Sistema-full-stack-para-gestao-pecuaria` | `8b502baff96a24bd80f3547be11616fd7f23f6aa` | Worktree original, branch `fazendo-audit-de-segurança`; código da aplicação coincide com `origin/DEV` e `origin/main` |
| `.worktrees/rls-bovitrack` | `df038df2e189b2d6664b953a08c81fe836bf225b` | Branch `feat/rls-bovitrack`, candidata local mais recente |
| `DEV` local | `91a07aadab54a42ccce82966ed1368e2847e0a88` | Três commits à frente de `origin/DEV`; inclui verificação de e-mail |
| `origin/DEV` | `8b502baff96a24bd80f3547be11616fd7f23f6aa` | Último código da DEV publicado no GitHub |
| `origin/main` | `d22d106889debe59cad67f344efbe94810c7912a` | Merge da DEV, já implantado nos dois projetos |
| `main` local | `62235a9299a78f365cd71b060ed264cdf6d3dc11` | Sete commits atrás da main remota; preservada |
| `design/reformulacao-visual` | `4eab00cc6b983bb09086aac2ea8c88ee748a17e2` | Trabalho anterior, incorporado pela DEV |

A busca ficou limitada aos diretórios de desenvolvimento relacionados: pasta `Downloads/Bovitrack`, worktrees registrados e caminhos de cópias anteriores conhecidos. `Downloads/Bovitrack/Teste` e `Downloads/TCC-TI/Teste` não existem atualmente. Não houve varredura de arquivos pessoais. Não foi localizada outra cópia candidata dentro desse escopo.

`git rev-list --left-right --count origin/main...HEAD` retornou `1 4`: a candidata não contém o commit de merge da main, mas possui quatro commits próprios. O merge remoto não acrescenta diferenças à árvore de `backend/` e `frontend/` em relação a `origin/DEV`; `git diff --quiet origin/main origin/DEV -- backend frontend` retornou 0. Portanto, a divergência histórica não representa uma funcionalidade remota perdida.

### Commits locais ainda não enviados

1. `dcf0e84` — backend: verificação obrigatória de e-mail, Resend, desafios PostgreSQL e migration 013.
2. `be5c1ec` — frontend: telas e fluxo de verificação de e-mail, autenticação e testes.
3. `91a07aa` — documentação da verificação e atualização do grafo.
4. `df038df` — executor transacional, credenciais separadas, contexto assinado, migrations 014–019, integridade e políticas RLS.

No início havia modificações e caches não rastreados apenas em `graphify-out/` neste worktree. Foram preservados. A consulta Graphify também atualizou `graphify-out/cache/last_query_stamp`. Não havia mudanças de código da aplicação sem commit. No worktree original havia artefatos locais e a auditoria RLS não rastreados, além do cache do grafo; nada foi descartado.

## 2. Produção identificada por IDs, domínios e SHA

Equipe Vercel: `crh535`, ID `team_JpA0BrPXYpcRrnRVZHPjIsdK`.

| Item | Frontend | Backend |
|---|---|---|
| Projeto | `bovitrack` | `bovitrack-api` |
| Project ID | `prj_zymSeKZ3qH06rcUcjT2rTcFxh2Vm` | `prj_v0SXYazTtfH659wnuvk97W4bdqR9` |
| Framework | Vite | Express |
| Node | `24.x` | `24.x` |
| Domínio de produção verificado | https://bovitrack-xi.vercel.app | https://bovitrack-api.vercel.app |
| Deployment atual | `dpl_FkRoQZxUXuoGTyTeMajhHgNA3nVC` | `dpl_3kyRDbPdoHw5WxxMfAQs7SooDduQ` |
| URL do deployment | https://bovitrack-okzdzdxt9-crh535.vercel.app | https://bovitrack-hh7skhchs-crh535.vercel.app |
| SHA | `d22d106889debe59cad67f344efbe94810c7912a` | `d22d106889debe59cad67f344efbe94810c7912a` |
| Branch registrada | `main` | `main` |
| Origem | Git | Redeploy do mesmo SHA |
| Estado | READY, sem aliasError | READY, sem aliasError |
| Região registrada | `iad1` | `iad1` |

Os metadados e os logs de clone dos dois builds identificam `CRH535/BoviTrack__Sistema-full-stack-para-gestao-pecuaria`, branch `main`, commit `d22d106`. Os domínios foram confirmados no cadastro dos projetos e nos aliases dos deployments. O frontend tem publicação via Git; o backend tem histórico de publicação via Git e posterior redeploy do mesmo commit. Não foi criado deployment duplicado.

O build anterior do frontend terminou com Vite 8.2.2 e saída `dist/`; o backend terminou o build Express e a publicação de functions sem erro impeditivo. Ambos registram o aviso npm sobre `cache-dir`. O frontend publicado usa `/assets/index-rAD_eWYu.js`, que contém `https://bovitrack-api.vercel.app` como endereço da API.

**Limite da inspeção de configuração:** as respostas disponíveis do conector não expuseram `rootDirectory`, os overrides dos comandos de build/instalação, a configuração atual da branch de produção nem os limites detalhados de functions. O navegador integrado retornou `The browser access host is unavailable`. Esses campos não foram presumidos nem alterados. A branch e a saída acima descrevem os deployments observados; não substituem a leitura dos overrides atuais.

## 3. Ambiente Vercel, sem leitura de valores secretos

As variáveis foram listadas com `decrypt=false`. Foram preservados somente nomes, alvos e classificações nas evidências.

- Frontend: `VITE_API_URL`, alvo production. O endereço correto foi confirmado no bundle público.
- Backend: `DATABASE_URL`, `DB_SSL`, `DB_SSL_CA_BASE64`, `DB_POOL_MAX`, timeouts de conexão/statement/query/idle, `NODE_ENV`, `FRONTEND_URL`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, tempos de acesso/refresh, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `APP_TIMEZONE`, `RESEND_API_KEY`, `EMAIL_VERIFICATION_PEPPER` e `EMAIL_FROM`.
- **Ausentes:** `DATABASE_AUTH_URL` e `DB_RLS_CONTEXT_KEY`. A candidata exige ambas em produção; a primeira precisa de login PostgreSQL separado e a segunda de chave hexadecimal independente de 32 bytes, pareada com o banco.
- As variáveis de e-mail existem, mas sua presença não comprova domínio/remetente Resend validado ou entrega real. Nenhum e-mail real foi enviado.
- O conector marcou `RESEND_API_KEY` e `EMAIL_VERIFICATION_PEPPER` como `readable-secret`. Não foram descriptografadas, expostas ou alteradas. Revisar a classificação Sensitive antes do rollout; isso não equivale a comprovar vazamento.
- O login SQL, a porta, o tamanho efetivo do pool e os valores de TLS/cookies da instância publicada não foram extraídos de segredos. O comportamento CORS público foi validado separadamente.

## 4. Banco Supabase e bloqueio concreto

Projeto confirmado: `bovitrack`, ref `znpmzebrryqtjkgnvlcw`, São Paulo, ACTIVE_HEALTHY, PostgreSQL 17.6. Foram executadas apenas consultas de catálogo e leitura de advisories/migrations.

| Requisito | Estado vivo observado | Consequência |
|---|---|---|
| `usuarios.email_verificado` e `email_verificado_em` | Ambas ausentes | A DEV local de e-mail já é incompatível com o banco atual |
| `verificacoes_email` | Ausente; existem 15 tabelas da aplicação | Migration 013 não materializada |
| Schema `bovitrack_seg` e funções | Ausente | Executor e autenticação da candidata não podem operar |
| Role `bovitrack_auth_runtime` | Ausente | Segundo login e privilégios específicos ainda não preparados |
| Roles atuais | `bovitrack_runtime` e `bovitrack_app_login`, ambas sem BYPASSRLS | Estado legado; login separado de autenticação não demonstrado |
| RLS / FORCE / policies em `public` | OFF / OFF / zero em todas as 15 tabelas | Implementação RLS ainda não ativada em produção |
| Histórico retornado por `list_migrations` | Vazio | Não demonstra ausência de todas as migrations: o catálogo comprova estruturas legadas aplicadas por outro fluxo |
| Migration 012 | Sete índices ausentes e funções vivas diferentes do SQL local | Reconciliação pendente; não pode ser declarada integralmente aplicada |
| 014–018 | Schema, roles e funções necessários ausentes | Dependências obrigatórias antes de disponibilizar o backend novo |
| 019 | Não ativa no banco observado | A ativação de RLS exige autorização específica e rollout próprio |

Índices da 012 ausentes: `animais_propriedade_id_idx`, `lotes_propriedade_id_idx`, `despesas_propriedade_data_idx`, `vacinacoes_animal_data_idx`, `vacinacoes_vacina_id_idx`, `animais_lotes_lote_id_idx` e `desmamas_mae_id_idx`. As funções de parentesco e desmama foram comparadas com o código local e confirmam a divergência descrita na auditoria.

A role `authenticator` tem `pgrst.db_schemas=pgrst_no_exposed_schemas`; as tabelas em `public` não têm grants para `anon`, `authenticated` ou PUBLIC. Portanto, RLS OFF não foi tratado isoladamente como prova de exposição pela Data API. Não houve mudança dessa configuração.

O advisor de segurança retornou quatro avisos `function_search_path_mutable`: parentesco, movimentação de lote, pesagem e desmama. Correção requer mudança no banco, fora da autorização concedida para esta execução. Referência: [Supabase database linter](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).

Foram lidos `AUDITORIA_RLS_BOVITRACK.md`, `IMPLEMENTACAO_RLS_BOVITRACK.md`, `DEPLOY_RLS_BOVITRACK.md` e `CODEX_CONTINUIDADE_RLS.md`. As dependências relatadas foram conferidas no código e no catálogo atual. O executor usa cliente explícito, transação, HMAC e funções restritas; simplesmente deixar RLS desligado não oferece compatibilidade com o banco legado.

As policies SQL e o rollback existem e passaram no banco descartável. A implementação local está funcional no ambiente testado; **isso não confirma homologação em Supabase/PostgreSQL 17 com Supavisor transacional, TLS e credenciais da Vercel**. As [regras de RLS do PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) também exigem policies apropriadas quando a proteção é habilitada; ativar a flag isoladamente não constitui um rollout.

## 5. Diferenças a publicar futuramente

### Frontend

Tela `/verificar-email`, desafios sem persistência de ticket em URL/storage, tratamento de conta pendente em login/cadastro/conta, encerramento da sessão ao perder a verificação e interceptadores que não tentam refresh nos endpoints de código. O runtime do frontend da branch RLS coincide com o da DEV local; as diferenças adicionais são de configuração e fixtures de testes.

### Backend

Verificação obrigatória de e-mail e integração Resend; migration 013; executor transacional com contexto assinado; autenticação por segundo pool/login; operações SQL restritas para cadastro, login, refresh, logout, e-mail e administração; serviços e rotas de domínio adaptados; integridade, policies, ativação e rollback nas migrations 014–019.

Publicar apenas o frontend novo deixaria seu fluxo dependente de endpoints de e-mail ausentes no backend atual. Publicar o backend novo no banco atual falharia na configuração e nas funções SQL. A alternativa DEV sem o commit RLS também requer a 013, que está ausente. Não foi criado fallback que removesse as proteções.

## 6. Testes executados nesta sessão

Runtime local: Node 24.15.0, npm 12.0.2, PostgreSQL 18.4. As dependências já estavam instaladas; `npm ls --depth=0` passou nos dois diretórios. Não houve instalação/reinstalação nem atualização de dependências.

| Verificação | Resultado |
|---|---|
| `npm run lint` em frontend | PASSOU |
| `npm test` em frontend | PASSOU, 11 testes, incluindo registro de ícones, imports e caixa dos assets para Linux/Vercel |
| `npm run build` em frontend | PASSOU, Vite 8.2.2, 175 módulos, `dist/`; inclui os dois testes de ícones do prebuild |
| `node scripts/test-isolated.cjs offline` | PASSOU: 14 grupos de segurança, cálculos de manejo, clima, exclusão, regressões HTTP e 9 testes frontend |
| `node scripts/test-isolation.cjs` | PASSOU: destinos externos, protocolo e parâmetros de override recusados antes da conexão |
| `node scripts/test-isolated.cjs integration` | PASSOU, código de saída 0 |
| Suíte RLS incluída na integração | PASSOU: 16 tabelas, grants, A/B/admin, contexto assinado, replay, timeout e expiração |
| Verificação de e-mail | PASSOU: 26 grupos, PostgreSQL real e Resend mock, nenhuma entrega externa |
| Autorização HTTP | PASSOU: 141 verificações |
| Produção leiteira | PASSOU: 24 verificações |
| Receitas | PASSOU: 16 verificações |
| Pesagem/desmama | PASSOU: 18 verificações |
| Regressões integradas backend | PASSOU: 13 verificações |
| Rollback e reativação RLS | PASSOU em banco descartável; flags e grants efetivos conferidos |
| Checks de segurança, schema, dependências de exclusão e órfãos | PASSARAM no banco descartável |
| E2E Chromium: `bovitrack.spec.js` e `email-verification.spec.js` | PASSOU: 12 cenários, 1366×768 e 390×844, saída 0 |
| `npm audit --audit-level=high --prefix backend` | FALHOU: 1 high e 1 moderate |
| `npm audit --audit-level=high --prefix frontend` | FALHOU: 3 high e 4 moderate |

Os E2E cobriram cadastro, login, refresh/F5, cookie privado, logout e novo login; navegação, dark/light, ausência de overflow; criação de propriedade/animal e pesagem; modal por teclado; recuperação de erro do dashboard; verificação de e-mail de conta antiga e rejeição de URL manual/contexto em storage. A mensagem de erro do dashboard nos logs pertence ao cenário que injeta uma falha e verifica a recuperação; o cenário passou. A suíte completa de sete resoluções não foi executada nesta sessão.

Os testes de escrita usaram exclusivamente dois bancos com nomes aleatórios `bovitrack_test_*`, criados pelo runner em cluster novo, loopback `127.0.0.1:55439`. Cada execução removeu seu banco e suas roles de teste. A consulta final não retornou bancos `bovitrack_test_*`; o cluster foi parado com `pg_ctl ... -m fast -w stop`. Seus arquivos e logs foram preservados. Nenhuma instância existente na porta 5432 foi alterada.

### Alertas de dependências não corrigidos nesta execução

- Backend: `body-parser` high ([GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828)); `qs` moderate.
- Frontend: `follow-redirects`, Vite e Zod classificados como high; cadeia de minimatch/ESLint moderate. Vite é ferramenta de desenvolvimento/build; o alerta de `follow-redirects` exige distinguir o adaptador Node da distribuição de navegador. Os totais acima são classificações do audit, não prova de exploração no site estático publicado.
- Não foi executado `npm audit fix --force`, que propõe downgrade incompatível de ESLint. Nenhum lockfile ou pacote foi modificado. Os alertas permanecem pendentes; a candidata não foi rotulada como segura ou aprovada para release. A etapa de publicação já estava interrompida pela incompatibilidade obrigatória do banco.

## 7. Verificação da produção existente

Foram feitos somente GETs sem credenciais e OPTIONS de CORS; nenhum login, cadastro, refresh autenticado, exclusão ou escrita de dados reais foi executado.

| Probe | Resultado |
|---|---|
| Frontend `/`, `/login`, `/cadastro`, `/animais` | HTTP 200, HTML do SPA e CSP presentes; não comprova acesso autenticado à rota |
| Bundle JS público | HTTP acessível, endereço `https://bovitrack-api.vercel.app` confirmado |
| API `/` | HTTP 200, `{"status":"ok"}` |
| API `/auth/me` anônimo | HTTP 401, token não informado |
| API `/propriedades` anônimo | HTTP 401, token não informado |
| API com Origin legítima | HTTP 200, allow-origin exato e credentials=true |
| API com Origin externa | HTTP 403, sem allow-origin |
| OPTIONS `/auth/login` com Origin legítima | HTTP 204, allow-origin exato e credentials=true |
| Runtime errors dos dois projetos, última hora | Nenhum retornado pelo conector na janela consultada |
| Logs error/fatal da API atual, últimos 30 minutos | Nenhum retornado pelo conector na janela consultada |

**Login real, persistência de sessão, dashboards autenticados e conexão do deployment com o PostgreSQL não foram comprovados em produção nesta execução.** A leitura do Supabase comprova acesso ao banco pela integração MCP; o health check da API não consulta o banco. Não foram fornecidas credenciais de uma conta de teste nem autorização específica para criar sessões em produção. Os fluxos passaram apenas no ambiente isolado descrito acima.

## 8. Publicação e rollback

- Commits criados nesta sessão: nenhum.
- Branches integradas: nenhuma.
- Push: não realizado.
- Projetos atualizados: nenhum.
- Novo SHA publicado: nenhum.
- Frontend/backend permanecem nos deployments e SHA da seção 2.
- Nenhum rollback de produção foi necessário, pois nenhuma release nova foi promovida.

Referências preservadas para eventual restauração do estado anterior ao próximo rollout: frontend `dpl_FkRoQZxUXuoGTyTeMajhHgNA3nVC`, backend `dpl_3kyRDbPdoHw5WxxMfAQs7SooDduQ`, ambos `d22d106`. O histórico Vercel os sinaliza como candidatos a rollback. Isso confirma a disponibilidade dos artefatos, sem comprovar que o binário antigo continuará compatível após futuras migrations.

O rollback local de 019 foi ensaiado. A reversão de uma release RLS real exigiria coordenar o binário e os grants conforme `DEPLOY_RLS_BOVITRACK.md`; **não executar o SQL de rollback ou restaurar dados automaticamente**. A [documentação de integração Git da Vercel](https://vercel.com/docs/git) sustenta acompanhar o fluxo existente quando a versão estiver aprovada, evitando deployments duplicados.

## 9. Pendências para retomar

1. Homologar o conjunto de e-mail/RLS no Supabase PostgreSQL 17 com Supavisor transacional, TLS e duas credenciais restritas. Medir concorrência, reutilização, latência e rollback.
2. Preparar e aprovar concretamente o plano de dados: reconciliação da 012/017, adoção da 013, tratamento de contas legadas/sessões, backup e restauração ensaiada, roles, funções e chave pareada. **Aplicar migrations de produção e ativar RLS continuam sem autorização.**
3. Corrigir e revalidar os alertas altos de dependências em atualização controlada, preservando o stack e evitando `--force`.
4. Conferir os overrides Vercel não expostos nesta inspeção, configurar as variáveis novas somente no backend, verificar remetente/domínio Resend e classificação dos segredos.
5. Confirmar uma conta/dataset específico para testes de autenticação em produção, com autorização para as escritas de sessão correspondentes, ou definir outro probe autorizado que comprove o fluxo.
6. Após todos os gates, preparar commit de release rastreável que integre `origin/main` e a candidata, rodar os checks, e usar o fluxo Git/Vercel confirmado. Coordenar a compatibilidade do banco, backend e frontend e registrar os novos IDs antes de promover tráfego.

## 10. Skills e ferramentas

| Skill | Uso |
|---|---|
| Graphify | Consulta inicial do grafo sobre deploy, autenticação, executor e migrations; confirmação dirigida nos arquivos |
| Vercel Deployments & CI/CD | Identificação de equipe/projetos/commit, histórico Git, builds, promoção e rollback |
| Supabase | Consultas somente leitura do catálogo, migrations e advisor; revisão dos requisitos de RLS |
| Playwright | Orientação de verificação de navegador; executadas as suítes já existentes do projeto, sem criar testes novos |
| Computer Use | Consultada para a tentativa complementar de leitura de configurações; host do navegador integrado indisponível, sem alteração de UI |

Nenhuma skill foi instalada. Graphify, Supabase, Vercel e os testes do projeto já cobriram a investigação necessária. Superpowers não consta no catálogo disponível; não foi instalada uma skill redundante para planejamento. Não houve alteração de código, portanto `graphify update .` não foi necessário nesta sessão.

## 11. Evidências locais

- `outputs/deploy-producao-20261110/vercel-snapshot.json`: metadados dos deployments, domínios, nomes de variáveis, eventos de build e resultados de observabilidade, sem valores de ambiente.
- `outputs/deploy-producao-20261110/production-http.json`: probes de produção e cabeçalhos relevantes.
- `outputs/deploy-producao-20261110/integration.log`: integração PostgreSQL, RLS e rollback.
- `outputs/deploy-producao-20261110/e2e.log`: 12 cenários Chromium e saída final.
- `outputs/email-verification/`: capturas desktop/mobile dos estados light/dark geradas pelas suítes existentes.

Os arquivos de evidência e este relatório foram mantidos localmente; nenhum foi enviado ao GitHub ou a produção. Os demais arquivos e branches existentes foram preservados.
