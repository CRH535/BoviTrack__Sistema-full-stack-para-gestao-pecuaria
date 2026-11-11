# Deploy de produção — RLS ativo e verificação de e-mail opcional

Preparado em 11/11/2026 na branch `feat/rls-bovitrack`, a partir de `0402506f65de40b8d06f5f9a455d55276da8e1d8`. O commit `97a1cf2` consolida a auditoria de ignore e preserva os arquivos locais retirados do índice. O commit `30f0414` contém a feature flag, as migrations aditivas e os testes. O commit `316fe97` contém os executores de backup, ensaio e corte coordenado. O commit `ca8785f` mantém os ensaios históricos compatíveis com a política SQL nova. O commit `6b6cf1b` inclui o teste de ícones necessário ao prebuild no pacote Vercel. O commit `9d700a5` cobre a aba que recebeu false antes de a API passar a exigir verificação. O SHA candidato completo será obtido de HEAD após o registro final das provas.

**Publicado em produção em 11/11/2026, com RLS ativo e obrigatoriedade de e-mail desativada.** O usuário autorizou expressamente o corte do candidato `79f65c7f52c992364f42016688fdb6a82568d67c` e as três fixtures com limpeza. O remetente Resend permanece reservado à futura ativação da verificação.

## Resultado observado da publicação

- Frontend em https://bovitrack-xi.vercel.app, promoção inicial `dpl_CStSJwtf6gpCBgDyyYogmtWgLtLi`.
- API em https://bovitrack-api.vercel.app, promoção inicial `dpl_E9YuntSkLRBKuaSZWyQ3LW8CbUCe`.
- Supabase `znpmzebrryqtjkgnvlcw` ACTIVE_HEALTHY, PostgreSQL17.6, 16 tabelas com RLS/policies, dois logins de aplicação distintos e restritos, TLS verify-full no Transaction pooler. Advisor de segurança sem apontamentos.
- Aplicadas via ledger as migrations 012, 020, 014, 015, 016, 017, 018, 021 e 019. A 013 original permaneceu preservada. Configuração SQL false e `EMAIL_VERIFICATION_REQUIRED=false` confirmadas por HTTP na API candidata protegida e no domínio canônico.
- O login legado `bovitrack_app_login` foi bloqueado e suas conexões encerradas. Os novos logins são `bovitrack_app_rls_login` e `bovitrack_app_auth_login`, com pool3 por role. JWT, cookies e credenciais de e-mail existentes foram conservados.
- O backup fresco de 84.211 bytes, incluindo a primeira fixture autorizada, foi restaurado e validado antes das migrations. As 15 tabelas legadas e as sessões foram comparadas antes da abertura do tráfego. O backup e o cofre de release estão cifrados por DPAPI.
- Cadastro e login reais, refresh/F5, cookies HttpOnly/Secure/SameSite=None, propriedades, animais, ficha, dashboard, isolamento HTTP, 12 leituras concorrentes com reuso de contexto, expiração de sessão, logout/revogação e rate limiting passaram em produção.
- A sessão criada pela primeira fixture no backend legado renovou com sucesso no backend RLS. Seu access token já estava naturalmente expirado ao ser consultado e retornou401; o refresh legado retornou200 e o token renovado acessou `/auth/me` com200.
- A interface passou cadastro/login e navegação em1366×768, além de navegação, F5, ficha, tema escuro, responsividade e logout em1366×768 e390×844. Os relatórios concluídos não registraram pageerrors nem falhas de imagens. Uma primeira tentativa de navegação terminou com erro genérico sem diagnóstico suficiente; a repetição com diagnóstico ampliado passou nas duas resoluções sem mudança na aplicação. A causa inicial não foi determinada.
- A tentativa autorizada de tornar a terceira fixture administrativa foi rejeitada por `usuarios_admin_unico_idx`. A transação foi revertida e as três fixtures permaneceram comuns. A regra de administrador único foi preservada. O usuário confirmou o login do administrador principal e o carregamento da tela Usuários; o catálogo confirmou sua sessão ativa e e-mail ainda não verificado.
- As três fixtures foram excluídas pela própria API, com sessões invalidadas. As seis contas originais mantiveram seus campos legados e os dados das 11 tabelas de negócio conferiram com o snapshot congelado. A tabela de desafios permaneceu vazia e há um único administrador.
- A consulta disponível dos últimos20min retornou zero erros/fatais de runtime e zero respostas5xx no deployment API. A consulta inicial de1h excedeu a retenção Hobby e foi reduzida ao período disponível.
- `vercel curl` criou automaticamente uma credencial de automação para testar o candidato protegido. Ela foi revogada após o smoke test, com zero bypasses de automação restantes. A chamada usou autenticação existente, e os valores permaneceram em memória/cofre. As opções próprias do comando foram conferidas no help e na documentação oficial. [Documentação do comando](https://vercel.com/docs/cli/curl), [revogação de bypass](https://vercel.com/docs/rest-api/projects/update-protection-bypass-for-automation).

Evidências sanitizadas em `outputs/rls-email-flag/production-*.json`, `candidate-*.json`, `cut-*.log`, `production-ui-*.json` e screenshots. Os registros brutos de runtime foram cifrados fora do checkout. A integração Git mantém as mesmas trees de backend/frontend do candidato aprovado; deployments Git posteriores à promoção inicial devem ser conferidos no registro final local `production-release-final.json`.

## Comportamento da candidata

- `EMAIL_VERIFICATION_REQUIRED=false` no backend; parsing aceita apenas true/false.
- PostgreSQL guarda a política em `bovitrack_seg.configuracao_email`, alterável apenas administrativamente. A API falha fechado se divergir da política SQL. Não há flag escolhida por HTTP/frontend/GUC do login de domínio.
- Contas não verificadas podem cadastrar, entrar, renovar sessão, usar dados próprios e administrar quando seu perfil permitir. Não são marcadas artificialmente como verificadas.
- Cadastro/login não enviam código. O cadastro público preserva resposta uniforme para contas novas/existentes. As rotas de código continuam implementadas, mas respondem EMAIL_VERIFICATION_DISABLED com a flag false.
- Frontend segue a resposta da API e consulta `/auth/config`. Cadastro opcional termina no login; F5/refresh não exigem verificação. Troca de e-mail ainda invalida sessões por mudança de credencial; edição somente do nome não exige código.
- RLS, contexto HMAC por transação, JWT, sessão/expiração/replay, rate limiting, CSRF/CORS, autorização administrativa e isolamento continuam ativos. Todos os serviços, telas, testes e migrations de e-mail foram preservados.

Ativação futura e impactos das transições: `ATIVACAO_FUTURA_VERIFICACAO_EMAIL.md`.

## Estado real reconfirmado antes do corte

### Supabase

Produção `znpmzebrryqtjkgnvlcw`, São Paulo: o usuário reativou o projeto; confirmado **ACTIVE_HEALTHY**, PostgreSQL **17.6**, conexão administrativa TLS verify-full válida. Consulta de catálogo: 15 tabelas públicas, todas RLS OFF, zero policies, sem schema privado nem ledger. Seis contas, todas ativas, zero e-mails fora da normalização/formato exigidos; 41 índices, quatro triggers de usuário e zero constraints não validadas. `extensions.hmac(bytea,bytea,text)` disponível.

As roles legadas são `bovitrack_runtime` NOLOGIN e `bovitrack_app_login` LOGIN, sem SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE. A credencial administrativa postgres tem CREATEDB/CREATEROLE e é dona de extensions e da função hmac utilizada. O comentário anterior do banco é `default administrative connection database`, a reconfirmar e preservar antes do marcador do corte. O catálogo foi consultado somente em leitura. Nenhum teste de escrita ocorreu nessa origem.

Homologação remota `atlcangotqhtgybjsdau` está INACTIVE. Os novos ensaios usam PostgreSQL 17.6 isolado e a cópia privada restaurada da produção. Os testes Supavisor/TLS anteriores permanecem como evidência da arquitetura. A flag nova foi validada localmente e as novas credenciais do pooler de produção serão verificadas no corte aprovado.

### Vercel e Git

Time `crh535` / `team_JpA0BrPXYpcRrnRVZHPjIsdK`, repositório `CRH535/BoviTrack__Sistema-full-stack-para-gestao-pecuaria`, produção main, Node24.

| Projeto | ID | Deployment anterior |
|---|---|---|
| bovitrack-api, root backend, Express | prj_v0SXYazTtfH659wnuvk97W4bdqR9 | dpl_3kyRDbPdoHw5WxxMfAQs7SooDduQ |
| bovitrack, root frontend, Vite | prj_zymSeKZ3qH06rcUcjT2rTcFxh2Vm | dpl_FkRoQZxUXuoGTyTeMajhHgNA3nVC |

Ambos permaneciam READY em d22d106 antes do corte. Os domínios são https://bovitrack-api.vercel.app e https://bovitrack-xi.vercel.app. Configuração de roots/build/functions e aliases permanece descrita no relatório da etapa 3; reconfirmar antes de publicar. Fetch atual confirmou origin/main d22d106; sua diferença sobre origin/DEV é somente de histórico, sem arquivos diferentes. O ensaio `git merge-tree --write-tree HEAD origin/main` terminou sem conflitos e produziu a mesma tree de HEAD. A integração remota fica para a etapa de publicação coordenada. Não houve force push nem descarte de trabalho.

DATABASE_AUTH_URL, DB_RLS_CONTEXT_KEY e EMAIL_VERIFICATION_REQUIRED ainda precisam ser configuradas para esta candidata. Valores JWT/cookies/Resend existentes serão conservados. Não se leem chaves Resend nem JWT_SECRET para copiar entre ambientes. O frontend usa somente a URL pública da API; não há segunda flag Vite de e-mail.

## Migrations e preservação de contas/sessões

As migrations originais **013–019 permanecem byte a byte inalteradas**. A 013 original revoga sessões pendentes e não será executada no corte opcional.

Ordem ensaiada para o banco legado atual:

1. `012_integridade_parentesco_indices.sql`.
2. `020_estrutura_email_sem_revogar_sessoes.sql` — estrutura equivalente de e-mail, sem a revogação da 013; não verifica contas.
3. `014_rls_contexto.sql`, `015_rls_autenticacao.sql`, `016_rls_verificacao_email.sql`, `017_rls_integridade.sql`, `018_rls_politicas.sql`.
4. `021_email_verificacao_configuravel.sql` — configuração privada e correção aditiva de ator/admin/sessão/refresh; conserva true em bancos já preparados até uma decisão administrativa explícita.
5. Provisionamento dos dois logins novos, chave HMAC e configuração administrativa false.
6. `019_rls_ativacao.sql` — 16 tabelas protegidas, grants de coluna e policies existentes preservados.

`release-migration-executor.cjs` registra SHA-256 e migration na mesma transação, recusa hash diferente e só admite reativação explícita da 019. `optionalEmailFiles` fixa essa ordem; o caminho histórico com 013 continua disponível para ensaios anteriores. Não marcar 013 como aplicada quando se usou 020, nem editar seu hash para reconciliar ambientes.

## Backup e ensaio sobre dados restaurados

`node scripts/backup-production-readonly.cjs` confirmou destino/TLS, abriu snapshot REPEATABLE READ READ ONLY e exportou os schemas da aplicação com pg_dump17.6. Dados não foram exibidos: dump em memória e arquivo cifrado por **Windows DPAPI CurrentUser**, em diretório externo ao checkout com ACL somente para o usuário e SYSTEM.

O dump de **83.815 bytes / 15 tabelas** foi decifrado e restaurado em cluster novo privado, loopback55442, SCRAM-SHA-256. Hashes de conteúdo, contagens, ownership/ACLs, memberships necessárias e constraints foram comparados; senha inválida de restauração foi rejeitada. As roles copiadas ficam NOLOGIN nessa restauração. O servidor privado foi parado ao terminar. A repetição com os scripts commitados em 316fe97 passou novamente, incluindo o ensaio de migração/token/refresh/rollback sobre o novo restore. O backup dessa repetição começou às 11h59min32s e terminou às 12h01min51s, horário de São Paulo. Nenhum arquivo com dados reais foi versionado.

Manifesto local sanitizado: `outputs/rls-email-flag/production-backup-result.json`; manifesto privado contém SHA-256, arquivo cifrado, horários, roles/memberships e digests. O backup DPAPI depende do perfil/chaves do usuário Windows: não equivale a uma cópia portátil de desastre. Definir cópia externa/cofre e retenção próprios antes de depender dele para perda total da máquina. Não há PITR contratado/verificado neste plano Free. O escopo não inclui Storage, Auth da plataforma nem toda a configuração Supabase; a aplicação usa JWT/usuários próprios.

`node scripts/rehearse-production-snapshot.cjs` modificou somente essa cópia privada: preservou as 15 tabelas e os campos legados de usuários, executou a ordem proposta, aceitou token e refresh gerados pelo código antigo com conta sintética não verificada, conferiu acesso apenas à propriedade da fixture, executou rollback/reativação da 019 e a checagem estrita de grants/RLS. Zero e-mails. A limpeza normal de sessões expiradas do código antigo foi neutralizada na preparação da fixture para comparar o efeito das migrations separadamente. O arquivo cifrado original permanece imutável.

Na janela aprovada será criado **novo backup fresco após bloquear os escritores legados**, novamente restaurado e validado. O executor recusa um backup iniciado antes da manutenção ou com SHA diferente. Restaurar produção após novas gravações continua exigindo decisão específica e reconciliação; nenhum restore sobre produção é automático.

## Testes e evidências

| Prova | Resultado observado |
|---|---|
| Flag FALSE/TRUE/transições | 11 grupos, PostgreSQL17.6 real, Resend mock, 90 transações concorrentes com pool3 |
| Caminho histórico 013 + 021 e flag TRUE | 26 grupos de e-mail aprovados; expiração, tentativas, reenvio, replay e logs |
| Integração completa TRUE | aprovada: 141 verificações de autorização, 24 de leite, 18 de manejo, RLS, regressões, integridade e rollback |
| Offline e segurança | aprovados, incluindo parsing inválido e operação false sem Resend/pepper |
| Frontend unitário / lint / build | 11 testes e saídas0 |
| npm audit backend/frontend | zero vulnerabilidades |
| Snapshot de produção restaurado | dados/sessões legadas preservados, token/refresh antigo aceitos, grants e rollback/reativação aprovados |
| Ensaios históricos com 013 + 021 | oito casos de compatibilidade aprovados, incluindo APIs legada/atual, navegadores e rollback; restore de homologação com HTTP/dashboard e guardas também aprovados |
| Fontes de publicação | CLI65.14.0 dry nos projetos API/web/manutenção; inventário sem arquivos privados, npm ci nas duas pastas e prebuild/build frontend aprovados |
| E2E integral TRUE, sete resoluções | 140/140 aprovados na repetição completa, 32,6 minutos, saída0 e sem retries |
| E2E transição da política recebida pela aba | falha reproduzida antes do ajuste; 7/7 aprovados após o ajuste, com login/código e PostgreSQL reais |
| E2E cadastro de propriedade/animal/ficha/pesagem | 14/14 aprovados em duas repetições nas sete resoluções, sem retries |
| E2E específico FALSE, sete resoluções | 7/7 aprovados novamente após o último ajuste, incluindo cadastro, login, F5, dashboard, edição do nome e rota manual de verificação |

Logs e JSONs em `outputs/rls-email-flag/`, ignorados. Os testes de escrita usam bancos isolados. A correção visual do menu min-height42px permanece preservada; o teste original não foi enfraquecido. Os 87 artefatos locais retirados do índice pela auditoria anterior foram consolidados separadamente, mantendo os arquivos físicos.

O trace da falha inicial mostrou POST de animal 201 e listagem 200. O teste digitava a busca antes de terminar a atualização da lista, perdendo o preenchimento quando o componente era remontado. Foi ajustado para aguardar a mensagem de sucesso e o fim do carregamento. A repetição ampliada também expôs a suposição de que uma propriedade recém-criada estaria na primeira página com mais de dez registros. O teste agora usa a busca da própria interface para localizar sua fixture. Todas as verificações de cadastro, modal, ficha e persistência de pesagem foram mantidas. O primeiro ensaio ampliado e seus traces estão preservados junto do resultado final 14/14.

A inspeção do pacote identificou que `.vercelignore` excluía todos os testes, incluindo `frontend/tests/icons.test.js`, chamado pelo prebuild. A exceção foi corrigida. Os três dry runs da Vercel terminaram com saída0 e reconheceram Express, Vite e manutenção. Uma cópia independente contendo os arquivos exatos do inventário passou npm ci nos dois projetos e `npm run build` no frontend, incluindo o teste de ícones. A API desse pacote iniciou com NODE_ENV=production, flag false e configuração sintética, e respondeu ao health HTTP. Essa prova de inicialização usa destino SQL local sem servidor e não comprova conexão com o banco de produção.

Após a execução integral de 140 casos, uma nova regressão reproduziu uma aba que ainda guardava false quando o login passou a retornar EMAIL_NOT_VERIFIED. A interface agora atualiza sua política ao iniciar a verificação exigida pela API. A alteração de uma linha em AuthContext foi validada por sete casos novos de transição, pela repetição dos sete casos FALSE, por lint e pelos 11 testes unitários. O novo teste simula apenas a configuração antiga recebida ao abrir a aba; login, código e SQL usam o backend TRUE real com transporte de e-mail simulado. Os 140 casos originais foram executados antes dessa última linha, e os casos específicos posteriores cobrem seu efeito.

## Sequência executável do corte — somente após aprovação específica

PowerShell, raiz do worktree, código e scripts commitados. Usar o SHA completo revisado, sem alterações em backend/scripts/release. Não trocar de projeto nem reativar outro ambiente para contornar a cota.

```powershell
$releaseSha=(git rev-parse HEAD).Trim()
node scripts/prepare-release-sources.cjs $releaseSha
$sourceRoot=(Get-Content outputs/rls-etapa3/release-candidate.json -Raw | ConvertFrom-Json).directory
```

Reutilizar manifesto existente somente se SHA/tree hashes conferirem; o empacotador recusa sobrescrever diretório. CLI65.14.0 e fontes são verificados com --dry antes de qualquer publicação. O pacote não contém .env, dumps ou evidências privadas.

Após o aceite humano do SHA e das operações SQL:

```powershell
node scripts/prepare-production-cutover.cjs --authorize $releaseSha
```

Esse comando prepara o cofre ignorado `backend/.env.release-production.dpapi`, sem SQL nem alteração Vercel. Gera senhas independentes e chave HMAC somente neste ponto; não reutiliza homologação nem altera JWT/Resend.

Publicar e promover a manutenção no projeto API, conferindo o ID/URL antes de promover:

```powershell
$maintenanceRoot=Join-Path $sourceRoot 'release/maintenance'
$maintenanceBuild=npx --yes vercel@65.14.0 deploy $maintenanceRoot --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --prod --skip-domain --non-interactive --json | ConvertFrom-Json
$maintenanceDeployment=$maintenanceBuild.deployment.url
if($LASTEXITCODE -or $maintenanceDeployment -notmatch '^https://[a-z0-9-]+\.vercel\.app/?$'){throw 'Manutencao invalida'}
npx --yes vercel@65.14.0 promote $maintenanceDeployment --scope crh535 --yes
if($LASTEXITCODE){throw 'Promocao falhou'}
node scripts/prepare-production-cutover.cjs --maintenance $releaseSha
```

Conferir 503 MANUTENCAO/no-store em todos os aliases API. Pelo canal Supabase associado programaticamente ao ref correto, registrar o marcador com o SHA aprovado:

```sql
COMMENT ON DATABASE postgres IS 'bovitrack-release:znpmzebrryqtjkgnvlcw:<SHA_APROVADO>';
```

Registrar comentário anterior. Esta é a primeira escrita SQL de metadados e só ocorre depois da aprovação; o backup inicial já foi validado. Em seguida:

```powershell
node scripts/release-production.cjs --freeze-legacy
node scripts/backup-production-readonly.cjs
node scripts/prepare-production-cutover.cjs --backup $releaseSha
node scripts/release-production.cjs --prepare
node scripts/release-production.cjs --provision
node scripts/configure-production-vercel.cjs
```

**Verificar saída0 em cada comando e parar ao primeiro erro.** Freeze bloqueia LOGIN de bovitrack_app_login e encerra suas conexões, impedindo escritores de deployments antigos. Investigar outros escritores antes do backup. Prepare executa 012/020/014–018/021 via ledger; provision cria bovitrack_app_rls_login e bovitrack_app_auth_login, chave e configuração false. Nenhum usuário é verificado artificialmente e nenhuma sessão é revogada por ausência de verificação.

O configurador Vercel verifica a preparação SQL e envia secrets por stdin ao CLI autenticado: DATABASE_URL, DATABASE_AUTH_URL, DB_RLS_CONTEXT_KEY, CA; fixa TLS verify-full, pool3 por role, EMAIL_VERIFICATION_REQUIRED=false e URL pública da API. Não lê nem rotaciona JWT/Resend, nem altera preview. Não imprime valores. Revisar o orçamento agregado de conexões de todas as instâncias.

Construir API/web production com --skip-domain, mantendo os aliases em manutenção; registrar os URLs retornados e inspecionar READY, projeto e versão. Ativar a 019 somente após os builds compatíveis estarem prontos:

```powershell
$apiBuild=npx --yes vercel@65.14.0 deploy $sourceRoot --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --prod --skip-domain --non-interactive --json --meta releaseSha=$releaseSha | ConvertFrom-Json
$apiCandidate=$apiBuild.deployment.url
if($LASTEXITCODE){throw 'Build API falhou'}
$webBuild=npx --yes vercel@65.14.0 deploy $sourceRoot --project prj_zymSeKZ3qH06rcUcjT2rTcFxh2Vm --scope crh535 --prod --skip-domain --non-interactive --json --meta releaseSha=$releaseSha | ConvertFrom-Json
$webCandidate=$webBuild.deployment.url
if($LASTEXITCODE){throw 'Build web falhou'}
node scripts/release-production.cjs --activate
if($LASTEXITCODE){throw 'RLS recusado; manter manutencao'}
```

Verificar TLS/identidade dos dois logins no Transaction pooler, 16 RLS/policies, grants sensíveis negados e zero linhas sem contexto. Provar API candidata fechada com fixture expressamente autorizada; staging protegido exige acesso autenticado, sem remover a proteção. Se não houver autorização de contas de teste, não criar contas reais escondidas.

Promover frontend novo primeiro e API por último. Confirmar no domínio canônico cadastro/login/refresh/F5/logout, dados próprios, isolamento, admin, cookies, CORS e ausência de desafios/envios. Testes destrutivos ficam restritos às próprias fixtures expressamente autorizadas. Saúde/READY sozinhos não comprovam autenticação. Registrar os IDs efetivamente publicados e o SHA; só declarar implantação concluída após observar o fluxo real.

## Rollback coordenado e critérios de parada

- Falha antes das migrations: manter manutenção, verificar que nada de negócio mudou, reabilitar o login legado e promover os deployments anteriores mediante decisão do operador.
- Falha no prepare: parar, manter manutenção e consultar ledger. Cada migration é atômica; etapas anteriores podem estar commitadas. Corrigir a causa antes de retomar. Não restaurar dados automaticamente.
- Falha de código/env: manter banco protegido, corrigir a configuração/candidata e construir novamente. Não promover d22d106 diretamente com RLS ativo nem reutilizar deployment antigo com credenciais bloqueadas.
- Se for indispensável rollback RLS: manter manutenção, congelar os escritores ativos, executar `node scripts/release-production.cjs --rollback-rls` com os mesmos guardas. A candidata false foi testada nesse estado; validar antes de reabrir. Isso reduz proteção SQL e exige aceite explícito, não é mecanismo para desligar e-mail.
- Fallback histórico d22d106 exige estado SQL de rollback compatível e login/variáveis coerentes. Suas dependências antigas têm riscos já corrigidos na candidata; não é o fallback preferido. A 020/021 não devem ser removidas para esse retorno.
- Após novas gravações: fechar escritores, preservar estado atual e reconciliar diferenças/IDs/histórico em cópia isolada antes de qualquer restore autorizado. Nunca sobrescrever silenciosamente dados novos com o backup pré-corte.

Não fazer push/merge em main enquanto houver bloqueios. Autodeploy de main nos dois projetos precisa de coordenação para não publicar fora da janela. Atualizar refs, integrar commits remotos em branch isolada e testar conflitos; nunca force push. Um SHA novo exige avaliação própria, mesmo quando só há divergência histórica.

## Skills e limites

Graphify; Migration; Surgical Patch; Investigate First; Verify and Stop; Supabase/Postgres Best Practices; Ponytail/Entry; Vercel Deployments & CI/CD, Env Vars, CLI/feature flags; Playwright. O grafo foi atualizado por AST. O extrator SQL opcional está ausente e as migrations foram exercitadas no PostgreSQL. Nenhuma skill nova instalada, nenhum contexto/segredo enviado a serviço de compactação externo. Foi usada configuração nativa de ambiente + tabela administrativa, sem dependência adicional de feature flags. Entrega Resend real só será requisito para a ativação futura.
