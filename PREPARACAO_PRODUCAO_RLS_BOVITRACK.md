# Preparação de produção — RLS BoviTrack

Data: 11/11/2026. Branch: `feat/rls-bovitrack`. Candidata: tag local `bovitrack-rls-rc-20261111`; resolver o SHA com `git rev-parse bovitrack-rls-rc-20261111^{commit}`. Base da etapa: `51cb1c5d21d75a863bd03aa55361933cd722501b`.

**Classificação: BLOQUEADO para implantação.** A preparação técnica foi executada, com correções, ensaios, backup restaurado e release local. A disponibilidade do banco de produção e a entrega real de e-mail ainda dependem de ação humana. Não houve escrita SQL em produção, reativação, alteração de secrets, push, merge em main, deploy ou promoção.

## Correções e mecanismos entregues

- Preservada e revisada a correção de `backend/database/contextoRls.js`: listener temporário no cliente adquirido, descarte da conexão comprometida, remoção do listener no finally, erro antes de COMMIT. Regressão cobre encerramento assíncrono, ausência de COMMIT e zero listeners residuais. SQL/HTTP em Supavisor também exercitaram falha física e reutilização do pool.
- Corrigido o menu desktop em `frontend/src/styles/navigation-images.css`: o breakpoint compacto definia mínimo de 38 px, menor que o contrato de 42 px das ilustrações e do padding. Um único `min-height:42px` no seletor específico resolve a contração. O teste original foi preservado.
- `check-security-readonly.js` agora rejeita privilégios efetivos de UPDATE em colunas sensíveis e acesso direto às tabelas pelo login de autenticação. Ensaio local concedeu temporariamente UPDATE(perfil) ao login de domínio: a checagem falhou como esperado; a revogação restaurou o resultado positivo, sem alterar dados.
- Criados executores com destino fixado, atestado de cluster, TLS, aprovação futura por SHA, ledger transacional SHA-256 das migrations, backup/restauração, prova de runtime restaurado e artefato de manutenção 503 sem banco. O executor de produção foi preparado e teve suas recusas testadas; seus modos de escrita não foram executados contra produção.
- `outputs/` e cache do grafo foram isolados do versionamento; `.vercelignore` exclui arquivos privados e evidências. Arquivos gerados do grafo já modificados foram preservados fora dos commits de release.

## Resultados efetivos

| Verificação | Resultado observado |
|---|---|
| Playwright completo, sete resoluções | **140/140**, 32,4 minutos, PostgreSQL 17.6 |
| Frontend unitário | 11/11 |
| Frontend lint e build | saída 0 |
| Backend offline | saída 0; 15 grupos de segurança e regressões de manejo, clima, exclusões e HTTP |
| Integração isolada PostgreSQL 17.6 | saída 0: isolamento RLS, e-mail, autorização, leite, receitas, manejo, regressões, catálogo e órfãos |
| Supabase homologação, PostgreSQL 17.11 | 12 grupos SQL/HTTP reais aprovados, dois logins, TLS verify-full, 90 operações concorrentes e rollback/reativação |
| Upgrade legado PostgreSQL 17.6 | 012–019 e oito casos de compatibilidade aprovados |
| Backup e restore | dump custom restaurado; contagens e digests de 17 tabelas, ACLs, policies, defaults e colunas equivalentes; runtime HTTP aprovado |
| Grants de escalada injetados | rejeitados pela checagem; grant removido no finally |
| npm audit completo | backend e frontend: zero vulnerabilidades |
| Guardas operacionais e manutenção | saídas 0; destinos/overrides inválidos recusados, cinco métodos HTTP retornam 503 |

Evidências locais ignoradas: `outputs/rls-etapa3/`. Logs principais: `e2e-seven-resolutions.log`, `integration-final.log`, `backend-offline-final.log`, `frontend-*-final.log`, `legacy-upgrade-final.log`, `backup-final.log`, `restored-runtime-final.log`, `pool-sizing-30.log`, `privilege-guard.log`. Resultados estruturados: `legacy-upgrade-results.json`, `backup-restore-results.json`, `restored-runtime-results.json`, `pool-sizing-results.json`, `fk-index-plans.json`, `vercel-projects-sanitized.json`, `dns-evidence.json`. Evidências da etapa 2 permanecem em sua pasta própria.

Uma tentativa visual inicial sobre o cluster PG18 falhou porque o processo backend deixou de responder (`ERR_CONNECTION_REFUSED`); não foi uma falha geométrica. A repetição focada e a suíte integral sobre PG17.6 passaram. O encerramento nativo anterior do Node no Windows não teve causa conclusiva; os logs foram retidos. Não há falha atual conhecida na suíte integral.

## Upgrade legado e compatibilidade

O ensaio usou PostgreSQL **17.6**, mesma minor observada anteriormente em produção, com binários portáteis oficiais EDB obtidos pelo link do [PostgreSQL para Windows](https://www.postgresql.org/download/windows/). Não houve instalação global. Homologação remota continua na minor 17.11; portanto os dois caminhos foram exercitados.

O esquema legado foi reconstruído das migrations históricas do commit efetivamente publicado `d22d106889debe59cad67f344efbe94810c7912a` (001/003/007/008/009/010), comparadas ao catálogo estrutural previamente capturado. Como produção está pausada, a fotografia estrutural anterior não pôde ser reconfirmada por SQL nesta etapa. **A reconciliação do catálogo atual é condição de corte.** Não houve cópia de dados reais.

Fixtures: admin, dois produtores, duas propriedades, mães/bezerros, lotes/vínculos, vacinas/vacinações, pesagens, desmamas, despesas, receitas, leite e três sessões originais ativas/expiradas. O ensaio compara conteúdo e contagens das 15 tabelas de negócio anteriores, relacionamentos e constraints. A 012 corrigiu as funções/triggers de parentesco, peso e desmama e foi reaplicada sem alteração de dados. A 013 foi aplicada e reaplicada: **três sessões originais revogadas, zero usuários removidos, contas antigas inicialmente pendentes**. Apenas as contas sintéticas designadas foram depois verificadas para exercitar o estado final.

As 014–019 usam `release-migration-executor.cjs`: conteúdo SHA-256 registrado junto da migration na mesma transação; conteúdo divergente é recusado; reaplicação com hash igual é ignorada. Reativação explícita só permite a 019. O ensaio e o futuro driver de produção compartilham esse executor. Não se presume idempotência livre de todas as migrations. Após os probes com binário legado, sua limpeza normal removeu a sessão já expirada; ficaram duas sessões originais. Essa remoção pertence ao código legado, não à 013.

| Banco | Backend real | Frontend/conta | Observado |
|---|---|---|---|
| Legado | d22d106 | legado | login/me/propriedade/refresh/logout aprovados |
| Preparado 012–018 | d22d106 | legado | login permitido, inclusive pendentes; ignora a nova obrigação de e-mail |
| Preparado 012–018 | candidata | legado | conta verificada usa API; pendente recebe 403 e fica no login sem caminho adequado de verificação |
| Preparado 012–018 | candidata | novo | pendente alcança `/verificar-email`; fluxo verificado aprovado |
| 019 ativa | candidata | novo | login, isolamento, refresh e revogação aprovados; verificação acessível |
| 019 ativa | d22d106 | qualquer | **incompatível: login 503**, permissão do rate limiter negada |
| Rollback 019 | 91a07aa (e-mail) | compatível com e-mail | login verificado 200; pendente 403; sessão/refresh/logout aprovados |
| Rollback 019 | d22d106 | legado | API volta; pendentes 200, portanto perde a obrigação de verificação |
| Rollback 019 | candidata | novo | aprovado; mantém obrigação de verificação, opção preferida |

O rollback e a reativação produziram snapshots equivalentes de policies, grants, defaults e colunas. A 013 torna inadequado um rollout público com frontend antigo. A janela de manutenção deve abranger preparação, atualização coordenada e ativação. Os binários históricos servem como prova de compatibilidade; possuem dependências antigas e não são o fallback recomendado.

## Backup e recuperação

`node scripts/backup-restore-homologacao.cjs` exportou apenas dados sintéticos do projeto autorizado, em snapshot READ ONLY repetível, usando pg_dump 17.6, TLS e Session pooler. Ensaio do código commitado: **189.948 bytes**, aproximadamente **3,78 s** de exportação e **0,81 s** de restore local; SHA-256 `8eb37a2c1c1d40149e2899da06e3ac58503cb8f543b6445782652a101bcf9075`, registrado em `backup-committed.log`. O nome do banco restaurado está no manifesto local. Esses tempos são de uma base pequena; não constituem RTO de produção.

O restore foi feito em um novo banco local atestado por system_identifier, versão, porta e comentário SQL. Foram comparados digests de dados, constraints validadas, RLS e ACLs. Roles são reconstruídas sem senhas da plataforma. Detectamos e corrigimos uma dependência que uma simples comparação de contagens não revelava: o dono da função de identidade precisa de USAGE no schema `extensions` e EXECUTE em `extensions.hmac(bytea,bytea,text)`. Depois da correção, a API restaurada executou login e dashboard coerente com SQL administrativo.

Escopo: schemas da aplicação `public` e `bovitrack_seg`; o modo futuro também inclui `bovitrack_release` se existir. Não é backup integral de Supabase Auth, Storage, Realtime, configurações de plataforma nem objetos globais. Roles/memberships e dependência pgcrypto são registradas. O modo futuro `--production-approved` exige autorização adicional explícita para exportar e restaurar dados privados, diretório externo privado, SHA, marcador do projeto e manutenção. Nunca foi executado em produção.

A organização está no plano Free. A [documentação de backups do Supabase](https://supabase.com/docs/guides/platform/backups) orienta exportações próprias no Free; backups diários gerenciados e PITR dependem de plano/recursos pagos. PITR não foi considerado disponível. A futura implantação exige backup fresco restaurado e validado após cessarem as escritas, em armazenamento privado autorizado. Backup sintético não substitui esse backup. Recuperação depois de novas gravações exige reconciliação; não há promessa de RPO zero.

## Infraestrutura confirmada por leitura

### Supabase

- Produção `znpmzebrryqtjkgnvlcw`: **INACTIVE**, São Paulo, distribuição 17.6.1.165. Consulta SQL somente leitura falhou por banco inacessível. Nenhuma reativação foi tentada. O motivo exato da pausa não foi exposto pela integração.
- Homologação `atlcangotqhtgybjsdau`: **ACTIVE_HEALTHY**, PostgreSQL 17.11, 16 tabelas RLS, logins separados sem privilégios administrativos, pooler transacional e TLS válidos.
- Organização correta: `CRH535's Org`, `ttgiomayofzntmxoasyt`, Free. LG_Vagas e homologação estavam ativos. A [cota gratuita](https://supabase.com/docs/guides/platform/billing-faq) depende de participação como owner/admin; pode exigir ajuste para reativar um terceiro projeto. Trata-se de risco a conferir, não de uma falha de reativação observada nesta etapa. Não alterar membros, cobrança nem excluir homologação automaticamente.

### Vercel e GitHub

Time `crh535`, `team_JpA0BrPXYpcRrnRVZHPjIsdK`. Repositório `CRH535/BoviTrack__Sistema-full-stack-para-gestao-pecuaria`; produção em `main`, integração Git ativa.

| Campo | Frontend | Backend |
|---|---|---|
| Projeto | bovitrack | bovitrack-api |
| ID | prj_zymSeKZ3qH06rcUcjT2rTcFxh2Vm | prj_v0SXYazTtfH659wnuvk97W4bdqR9 |
| Root / framework | frontend / vite | backend / express |
| Build / saída | vite build / dist | automático / automático |
| Instalação | automático | automático |
| Node / região de functions | 24.x / iad1 | 24.x / iad1 |
| Fluid | true | true |
| Memória / timeout explícitos | null / null | null / null |
| Deployment atual | dpl_FkRoQZxUXuoGTyTeMajhHgNA3nVC | dpl_3kyRDbPdoHw5WxxMfAQs7SooDduQ |
| SHA publicado | d22d106 | d22d106 |
| Estado | READY, rollbackCandidate | READY, rollbackCandidate |
| Domínio principal | bovitrack-xi.vercel.app | bovitrack-api.vercel.app |

`null` significa ausência de override explícito, não prova de um valor efetivo de memória/timeout. Há proteção SSO `all_except_custom_domains`. READY não prova login, conexão SQL nem entrega de e-mail. CLI autenticada 65.14.0 permitiu consultar os campos que o MCP omitia. Nenhuma configuração foi atualizada. O artefato de manutenção foi verificado com `deploy --dry`, sem criação de deployment.

Variáveis atuais de backend incluem DATABASE_URL, DB_SSL, CA, pool/timeouts, JWT, frontend e e-mail. **DATABASE_AUTH_URL e DB_RLS_CONTEXT_KEY não existem ainda em produção.** Não foram lidos valores secretos. RESEND_API_KEY e EMAIL_VERIFICATION_PEPPER aparecem como `encrypted`, compartilhados entre preview e production: planejar classificação Secret/Sensitive e separar credenciais de preview na etapa autorizada. DATABASE_URL deverá apontar para o novo login de domínio `bovitrack_app_rls_login`; DATABASE_AUTH_URL, para `bovitrack_app_auth_login`; ambos Transaction pooler, com verify-full e CA do projeto. A futura janela bloqueia `bovitrack_app_login` com NOLOGIN e encerra suas conexões antes do backup, evitando que URLs de deployments antigos continuem gravando. Chave HMAC própria de produção, independente de JWT e pepper. Modelo vazio: `release/production-config.example`.

## E-mail e autenticação

O único valor não secreto explicitamente consultado foi EMAIL_FROM: **`BoviTrack <onboarding@resend.dev>`**. O remetente planejado `no-reply@mail.bovitrack.com.br` não está configurado.

DNS consultado por HTTPS: domínio raiz tem SPF Google e DMARC `p=none`; `mail.bovitrack.com.br`, `send.mail.bovitrack.com.br` e `resend._domainkey.mail.bovitrack.com.br` retornaram NXDOMAIN. Não se deve acrescentar um segundo SPF no mesmo nome; usar os registros exatos que a Resend fornecer para o domínio/subdomínio cadastrado. [Documentação de domínio da Resend](https://resend.com/docs/dashboard/domains/introduction).

Permissões da API key e entrega real continuam **não verificadas**: não há conector Resend autorizado, não se exportou a key de produção, não foi fornecido destinatário de teste e não se enviaram mensagens reais. Bloqueio exige validar domínio/DKIM/SPF, configurar remetente e provar recepção em endereço explicitamente autorizado, incluindo reenvio, expiração e verificação.

Código revisado e testes com provedor simulado: código de seis dígitos, validade 10 min, cinco tentativas, cooldown 60 s, limites de 5 envios/h e 12/dia por conta, limites por IP, tempo mínimo de resposta pública, armazenamento por hash/pepper, ticket limitado, revogação de sessões e mensagens genéricas. Timeout de envio 3 s; erros do provedor e códigos não são registrados. Mock prova contrato e proteção de logs, não entrega externa.

## Desempenho e índices

Uso informado pelo usuário: **10–30 pessoas simultâneas**. Carga limitada: 100 GETs por rodada, concorrências 1/5/10/30, pools 2/3/5 por role, dois pools por instância. Total **1.200 GETs e 30 logins reais** em homologação. Zero erros, zero vazamentos entre usuários, filas drenadas e conexões reutilizadas. `max_connections=120`, 18 conexões no banco no início; isso não significa 102 conexões integralmente disponíveis para o app.

| Máximo por role | GET p95, 10 simultâneos | GET p95, 30 simultâneos | GET p99, 30 | Espera por conexão p95, 30 | Login p95, 10 |
|---|---|---|---|---|---|
| 2 | 1.002 ms | 2.967 ms | 2.977 ms | 1.514 ms | 4.562 ms |
| **3** | **711 ms** | **2.010 ms** | **2.011 ms** | **975 ms** | **4.377 ms** |
| 5 | 460 ms | 1.379 ms | 1.388 ms | 629 ms | 4.349 ms |

Recomendação inicial: **DB_POOL_MAX=3 por role**, até seis conexões por instância, sujeita ao orçamento total de instâncias da Vercel/Supavisor e reserva administrativa. Pool 5 melhora latência mas consome até dez conexões por instância; não adotá-lo sem conhecer escala horizontal. Pessoas simultâneas não equivalem a requisições continuamente simultâneas. A latência inclui rede e fila; login inclui bcrypt/CPU local. Dez logins não permitem um p99 estatisticamente confiável. Critério técnico de proteção usado: zero erros e p99 GET abaixo de metade do query_timeout configurado (7,5 s); **não é SLA de negócio**. Nenhuma variável de produção foi alterada.

Índices informativos foram avaliados em cópia local com 10 mil linhas sintéticas por relação e seletividade de 1%. Pesagens: Seq Scan 1,202 ms versus Index Scan 0,120 ms; desmamas 1,480 versus 0,107 ms; sessões usadas 1,298 versus 0,106 ms. Índices temporários foram revertidos por ROLLBACK. Não há consulta corrente de negócio filtrando `registrado_por`; o custo principal surgiria em remoções/limpeza com histórico grande. Adiada criação permanente nesta escala. Planos medem buscas representativas, não tempo completo de cascatas. Nenhuma migration de índice especulativa foi adicionada.

## Segurança, Git e limites restantes

Revalidados isolamento por usuário/admin, SQL roles/grants, assinatura e contexto transacional, falsificação/replay, sessões/refresh/revogação, CORS/CSRF, rate limit, e-mail, cascatas, vínculos, triggers, injeção e tratamento de falhas. As suites executam contas/DBs isolados; produção não serviu de teste. Advisors remotos e catálogos de homologação foram consultados; os três índices informativos foram tratados acima.

`origin/main=d22d106889debe59cad67f344efbe94810c7912a`; `origin/DEV=8b502baff96a24bd80f3547be11616fd7f23f6aa`; DEV local histórico `91a07aa`. Fetch somente leitura do remoto foi executado. Main acrescenta histórico sobre DEV, sem diferença funcional correspondente. A integração futura deve refazer fetch, revisar commits novos e ensaiar merge em branch isolada; nunca force push. **Um push/merge em main pode disparar deploy automático nos dois projetos**, portanto não faz parte desta etapa.

Commits locais lógicos: `9cf9c8d` consolida homologação/correção de conexão; `d22d15f` corrige o menu; `76097aec234cc3ff0cebba788bef7c9c81462bcf` contém o código operacional e a checagem de privilégios. O commit de documentação e a tag final completam a candidata. Tag e manifesto gerado por `prepare-release-sources.cjs` identificam o conteúdo. Não versionar arquivos .env, dumps, binários, relatórios com dados nem caches. O grafo permanece como evidência gerada independente do release. Não foram excluídos arquivos do usuário.

Skills utilizadas nesta etapa e na revisão: Graphify; Supabase; Supabase Postgres Best Practices; Caveman Migration, Surgical Patch e Investigate First; Ponytail/Entry; Playwright; Vercel Deployments & CI/CD, CLI e Env Vars; Computer Use e Plugin Management na busca de alternativa de acesso. Computer Use não pôde iniciar por módulo ausente; a CLI autenticada supriu a inspeção. Nenhuma skill instalada; Superpowers opcional não estava disponível e não era necessário. Graphify usa AST, sem API; extração SQL opcional ausente, substituída por execução real no PostgreSQL.

## Dependências humanas e decisão

1. Disponibilizar produção, após autorização específica, e resolver eventual cota/retomada com o Supabase; reconfirmar catálogo e dados antes de escrever.
2. Validar domínio/remetente na Resend e autorizar destinatário controlado para prova de entrega. Conferir permissões da key no provedor.
3. Autorizar janela de manutenção, exportação privada/restauração de dados reais e armazenamento seguro; produzir backup fresco validado.
4. Autorizar provisionamento de role auth/chave HMAC/secrets e atualização de variáveis production, isoladas de preview.
5. Revisar e autorizar o runbook e o SHA candidato antes de migrations, RLS, deploys, promoções ou integração em main.

O código e os ensaios estão preparados. **O lançamento permanece BLOQUEADO até essas condições serem verificadas.** O procedimento executável e os caminhos de recuperação estão em `RUNBOOK_DEPLOY_RLS_BOVITRACK.md`.
