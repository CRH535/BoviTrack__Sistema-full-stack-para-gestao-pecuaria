# Runbook de implantação e rollback — BoviTrack RLS

Preparado em 11/11/2026. **Documento para execução futura autorizada; nenhuma operação de produção abaixo foi executada nesta etapa.** Estado atual: BLOQUEADO. Resultados e limitações: `PREPARACAO_PRODUCAO_RLS_BOVITRACK.md`.

## 0. Autorização, operadores e condições de início

É obrigatória autorização humana explícita contendo SHA, janela, alteração de roles/secrets/variáveis, migrations 012–019, manutenção/deploy/promoção e permissão para exportar/restaurar dados privados no equipamento e diretório definidos. Autorização anterior para homologação não serve para produção. Não gerar segredos antes de existir cofre autorizado. Não executar blocos inteiros sem verificar a saída de cada comando.

Operador deve ter administração Supabase do projeto `znpmzebrryqtjkgnvlcw`, acesso Vercel ao time `crh535`, Resend/DNS e máquina confiável com volume criptografado, ACL de arquivos restrita e sem sincronização pública. O cluster local de restauração usa trust em loopback; somente máquina privada sem outros usuários não confiáveis é aceitável. Não executar a cópia de dados reais em ambiente compartilhado. Dumps/restores e seus logs contêm dados privados e devem obedecer à retenção autorizada. Não excluir arquivos automaticamente; destinação futura deve respeitar a preferência do usuário pela lixeira.

Interromper antes da janela se: banco indisponível, catálogo divergente sem reconciliação, envio real não comprovado, cota/plano pendente, falta de backup/armazenamento autorizado, credencial sem menor privilégio, SHA alterado ou testes relevantes reprovados. Nunca trocar `verify-full` por TLS sem validação para contornar erro.

## 1. Checkout e pré-voo sem escrita em produção

PowerShell, raiz deste worktree. Exige Git, Node 24, npm e CLI autenticada. Tag local criada pela etapa 3:

```powershell
$ErrorActionPreference = 'Stop'
$releaseTag = 'bovitrack-rls-rc-20261111'
$releaseSha = (git rev-parse "$releaseTag^{commit}").Trim()
if ($LASTEXITCODE -or $releaseSha -notmatch '^[a-f0-9]{40}$') { throw 'Tag invalida' }
if ((git rev-parse HEAD).Trim() -ne $releaseSha) { throw 'Checkout diferente do aprovado' }
git status --short
git fetch origin --prune
git log --oneline --left-right origin/main...HEAD
git diff --stat origin/main...HEAD
$env:VERCEL_TELEMETRY_DISABLED = '1'
npx --yes vercel@65.14.0 whoami
npx --yes vercel@65.14.0 api /v9/projects/prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --raw
```

Não salvar saída integral de metadados/env em documento público. Guardar apenas campos selecionados, sem valores de secrets. Conferir projeto/root/branch/domínios e os deployments atuais novamente; IDs registrados na preparação são referências históricas:

- API: `dpl_3kyRDbPdoHw5WxxMfAQs7SooDduQ`, SHA d22d106, `bovitrack-api.vercel.app`.
- Web: `dpl_FkRoQZxUXuoGTyTeMajhHgNA3nVC`, SHA d22d106, `bovitrack-xi.vercel.app`.
- Root backend/frontend; Node24; produção main; integração Git ativa nos dois projetos.

Consultar Supabase por ferramenta associada **explicitamente ao project ref de produção**: status, plano/cota, versão e catálogo. Reativar apenas se essa ação estiver incluída na nova autorização; não apagar homologação nem alterar cobrança/membros automaticamente. Capturar estrutura/roles/functions/triggers/policies/ACLs/contagens sem linhas pessoais. Comparar às migrations históricas e ao ensaio. Esperado no legado auditado: 15 tabelas, sem 013, sem bovitrack_seg, RLS desligado. Qualquer desvio exige reconciliação antes do prepare; não marcar migrations como aplicadas por suposição.

Antes do corte, provar Resend em endereço de teste expressamente autorizado: domínio verificado, SPF/DKIM exatos do painel, DMARC revisado, key com acesso ao domínio, mensagem recebida, código aceito uma vez, reenvio/expiração/revogação adequados. O remetente atual onboarding@resend.dev não é prova de entrega própria. Nenhum usuário real deve receber teste sem autorização.

Preparar o pacote local (se já existe, reutilizar manifesto com mesmo SHA; não sobrescrever):

```powershell
node scripts/prepare-release-sources.cjs $releaseSha
if ($LASTEXITCODE) { throw 'Empacotamento falhou' }
$candidate = Get-Content outputs/rls-etapa3/release-candidate.json -Raw | ConvertFrom-Json
if ($candidate.sha -ne $releaseSha -or $candidate.published) { throw 'Manifesto divergente' }
$sourceRoot = $candidate.directory
npx --yes vercel@65.14.0 deploy $sourceRoot --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --prod --dry --non-interactive
npx --yes vercel@65.14.0 deploy $sourceRoot --project prj_zymSeKZ3qH06rcUcjT2rTcFxh2Vm --scope crh535 --prod --dry --non-interactive
```

`--dry` não publica. Inspecionar lista de fontes: nenhum .env, dump, teste, cache, node_modules ou evidência privada. O SHA/tree hash no manifesto prova fonte local; o deployment CLI futuro terá seu próprio ID, que deverá ser registrado.

## 2. Cofre e configuração privada, após a autorização

Copiar `release/production-config.example` para **backend/.env.release-production**, ignorado pelo Git, em ACL restrita. Não colocar valores em comando, histórico, chat ou commit. Preencher com editor seguro/cofre:

| Campo | Valor/origem |
|---|---|
| BOVITRACK_RELEASE_SHA | SHA completo aprovado |
| BOVITRACK_PRODUCTION_APPROVAL | `approve:znpmzebrryqtjkgnvlcw:<SHA>` |
| BOVITRACK_RELEASE_ADMIN_URL | Session pooler :5432, postgres.znpmzebrryqtjkgnvlcw, ou direta db.znpmzebrryqtjkgnvlcw.supabase.co:5432/postgres; sem query string |
| BOVITRACK_RELEASE_POOLER_HOST | host de São Paulo mostrado em Connect **desse projeto** |
| DB_SSL / DB_SSL_CA_PATH | verify-full / caminho absoluto da CA baixada do projeto |
| DB_RLS_CONTEXT_KEY | 32 bytes aleatórios em hex (64 caracteres), gerados no cofre |
| BOVITRACK_AUTH_LOGIN_PASSWORD | senha aleatória exclusiva >=32 caracteres para novo auth login |
| BOVITRACK_DOMAIN_LOGIN_PASSWORD | senha aleatória exclusiva >=32 caracteres para novo domain login |
| DATABASE_URL | Transaction pooler :6543, usuário bovitrack_app_rls_login.znpmzebrryqtjkgnvlcw |
| DATABASE_AUTH_URL | Transaction pooler :6543, usuário bovitrack_app_auth_login.znpmzebrryqtjkgnvlcw |
| BOVITRACK_RELEASE_PRIVATE_BACKUP_DIR | diretório absoluto fora do checkout, privado, criptografado, aprovado e já existente |
| BOVITRACK_AUTHORIZE_PRIVATE_DATA_RESTORE | `export-and-restore:<SHA>`, somente após autorização dessa cópia |
| BOVITRACK_RELEASE_BACKUP_MANIFEST | caminho privado para backup-restore-results.json, produzido na seção 4 |
| BOVITRACK_RELEASE_MAINTENANCE_STARTED_AT | UTC ISO da seção 3 |

Senhas devem estar percent-encoded nas URLs. Nunca reutilizar chave/senhas da homologação. JWT_SECRET e EMAIL_VERIFICATION_PEPPER são independentes da chave HMAC; mantê-los no cofre. Não rotacionar JWT/pepper desnecessariamente durante o corte.

```powershell
node scripts/release-production.cjs --check
if ($LASTEXITCODE) { throw 'Identidade/TLS/pre-voo recusados' }
```

Esperado: ref produção, banco postgres, role postgres, PostgreSQL17, written:false. `--check` não precisa de marcador SQL e abre transação READ ONLY. Nenhum modo deve usar URL de homologação. O executor recusa código de backend/scripts/release não commitado, SHA errado, URL/ref/porta/TLS inadequados.

## 3. Fechar escritas e registrar o início

Comunicar janela aos usuários: logout obrigatório e nova verificação de e-mail para contas legadas. Não publicar código/main antes da janela. Preparar suporte para entrega/reenvio e não marcar em massa contas reais como verificadas para contornar entrega.

**Primeira alteração de aplicação, somente após autorização:** publicar a manutenção sem acesso ao banco. Usar o pacote aprovado:

```powershell
$maintenanceRoot = Join-Path $sourceRoot 'release/maintenance'
$maintenanceDeployment = (npx --yes vercel@65.14.0 deploy $maintenanceRoot --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --prod --skip-domain --non-interactive | Select-Object -Last 1).Trim()
if ($LASTEXITCODE) { throw 'Manutencao nao foi criada' }
if ($maintenanceDeployment -notmatch '^https://[a-z0-9-]+\.vercel\.app/?$') { throw 'URL de manutencao invalida' }
# Registrar a URL capturada e conferir projeto/conteudo antes de promover.
npx --yes vercel@65.14.0 inspect $maintenanceDeployment --scope crh535
npx --yes vercel@65.14.0 promote $maintenanceDeployment --scope crh535 --yes
if ($LASTEXITCODE) { throw 'Promocao de manutencao falhou' }
$maintenanceStartedAt = [DateTime]::UtcNow.ToString('o')
```

Salvar UTC no arquivo privado. Verificar GET/POST/OPTIONS em /auth/login, /propriedades e /health: 503 JSON codigo MANUTENCAO, no-store, Retry-After. Verificar aliases API conhecidos `bovitrack-api.vercel.app`, `bovitrack-api-crh535.vercel.app`, `bovitrack-api-git-main-crh535.vercel.app`; alias protegido deve negar acesso a usuários comuns. Se uma rota ainda aceita escrita, parar. O artefato foi testado localmente; o primeiro comportamento Vercel real será confirmado aqui.

URLs imutáveis de deployments antigos podem continuar existindo. **Manutenção de alias sozinha não congela o banco.** Pelo canal Supabase explicitamente associado ao ref correto, após confirmar o SHA aprovado, registrar o marcador SQL (substituir `<SHA>` pelo valor validado de 40 caracteres):

```sql
COMMENT ON DATABASE postgres IS 'bovitrack-release:znpmzebrryqtjkgnvlcw:<SHA>';
```

Registrar o comentário anterior para restauração de metadados em eventual cancelamento. Não é dado de negócio; esta alteração está sujeita à autorização da janela. O marcador, URL allowlist, TLS e identidade SQL compõem os guardas do executor.

```powershell
node scripts/release-production.cjs --freeze-legacy
if ($LASTEXITCODE) { throw 'Congelamento recusado; manter manutencao' }
```

Esse modo é a exceção anterior ao backup: apenas ALTER ROLE bovitrack_app_login NOLOGIN e encerramento de suas conexões, sem mudar dados. Exige autorização por SHA, manutenção, TLS e marcador; não exige o backup que ainda será criado. Conferir no catálogo que não restaram conexões desse login. Investigar **outros escritores** (jobs, consoles, previews com outras roles, serviços) e suspendê-los mediante autorização específica. Registrar pg_stat_activity sem texto/argumentos de consultas pessoais. Não iniciar backup enquanto houver escritor desconhecido. Novos logins da candidata serão diferentes; o antigo permanecerá bloqueado durante e após o corte.

Cancelamento neste ponto, antes de qualquer migration de negócio: reabilitar LOGIN apenas no login legado e promover os deployments iniciais capturados, com autorização do operador. Não é o rollback após 013/019.

## 4. Backup fresco e restore obrigatório

O ensaio usa binários PG17.6 em `outputs/rls-etapa3/pg17/pgsql/bin` e cluster local atestado em `local-cluster.json`, porta55441. Se a máquina/cluster mudar, repetir o bootstrap isolado e o ensaio, revisar system_identifier e caminhos; não editar o atestado para apontar a um banco existente. A origem oficial dos binários está no relatório. Não usar binário pg_dump mais antigo que o servidor.

Confirmar volume privado, tamanho livre e autorização de cópia. Abaixo é o **único modo que permite dados reais**, ainda não executado:

```powershell
node scripts/backup-restore-homologacao.cjs --production-approved
if ($LASTEXITCODE) { throw 'Backup/restore nao validado; nao migrar' }
```

O modo padrão do script continua exclusivo de homologação. O modo aprovado recusa outro projeto, falta de aprovação para dados privados, pasta no checkout, login legado habilitado, sessões legadas, marcador errado ou manutenção ausente. Exporta snapshot READ ONLY, verifica SHA/listagem do arquivo, cria um banco **novo** loopback atestado e restaura com exit-on-error. Não restaura sobre produção nem sobre banco local preexistente. Não usar --clean em qualquer destino diferente desse banco novo atestado.

Verificar o manifesto privado `backup-restore-results.json`: completed e verifiedRestore verdadeiros, projectRef correto, sourceSha aprovado, finishedAt posterior ao início, archive existente e SHA256 correspondente, contagens/digests e snapshots de segurança equivalentes, constraints validadas. Armazenar cópia criptografada em destino autorizado independente da máquina. Permissões/roles não contêm passwords de plataforma; credenciais são recuperadas do cofre.

Este backup abrange schemas da aplicação, roles/memberships necessárias e dependências declaradas; não substitui backup de Storage/Auth/plataforma. No legado não haverá bovitrack_seg: o script detecta schemas presentes. Se existirem objetos adicionais de que a aplicação dependa, parar e ampliar o plano antes do dump.

Se dados/ACLs diferirem ou o restore falhar, **não gerar manualmente verifiedRestore:true**. Corrigir/repetir a prova. O executor seguinte verifica o arquivo, o SHA e a data, mas a qualidade da autorização/revisão do manifesto é responsabilidade do operador.

## 5. Preparar banco e novas credenciais

```powershell
node scripts/release-production.cjs --prepare
if ($LASTEXITCODE) { throw 'Preparacao interrompida; manter manutencao' }
node scripts/release-production.cjs --provision
if ($LASTEXITCODE) { throw 'Provisionamento interrompido; manter manutencao' }
```

Prepare aplica **012–018**, uma transação por migration, ledger bovitrack_release com SHA-256 na mesma transação. Se já houver schema preparado sem ledger, recusa para reconciliação. Não forçar hash nem apagar ledger para reaplicar. 012/013 foram reaplicadas no ensaio; o ledger evita repetir 014–018 indiscriminadamente. A 013 revoga sessões existentes e torna contas legadas pendentes, sem excluir usuários. 019 ainda não foi ativada.

Provision cria `bovitrack_app_rls_login` e `bovitrack_app_auth_login` com flags restritas e grupos separados; grava chave HMAC no schema privado. Recusa roles/chave já existentes, em vez de rotacionar silenciosamente. Conferir NO SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE/REPLICATION, ausência de ownership e de memberships cruzadas. Conferir pgcrypto e grants em extensions para bovitrack_rls_identidade. O login legado continua NOLOGIN.

Após cada fase, comparar contagens/relacionamentos com backup, mudanças esperadas de sessões e funções/triggers de 012/017. Lock timeout ou divergência: manter manutenção, inspecionar a transação que falhou; migrations anteriores podem já estar commitadas. O ledger permite retomada sem reaplicar as concluídas. Não restaurar backup automaticamente por uma falha transacional.

## 6. Configuração Vercel, sem publicar ainda

Somente valores do cofre, ambiente production. Para adicionar/atualizar Secret, usar prompt mascarado; **não usar --value com segredo**, nem env pull/export para transportar segredos. Comando para cada nome (substituir o nome, sem substituir por valor):

```powershell
npx --yes vercel@65.14.0 env add DATABASE_AUTH_URL --environment production --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --sensitive --force
npx --yes vercel@65.14.0 env add DB_RLS_CONTEXT_KEY --environment production --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --sensitive --force
npx --yes vercel@65.14.0 env add DATABASE_URL --environment production --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --sensitive --force
```

Conferir no painel o escopo production e classificação Secret. Fazer o mesmo com RESEND_API_KEY, EMAIL_VERIFICATION_PEPPER e JWT_SECRET **sem rotacionar o valor existente apenas pela classificação**; transição de tipo pode exigir procedimento no painel. Separar preview com credenciais de homologação em alteração própria autorizada; não mudar o escopo compartilhado sem revisar consumidores.

Config não secreta:

```powershell
npx --yes vercel@65.14.0 env add DB_POOL_MAX --environment production --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --no-sensitive --force --value 3 --yes
npx --yes vercel@65.14.0 env add DB_SSL --environment production --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --no-sensitive --force --value verify-full --yes
```

Conferir DB_SSL_CA_BASE64 (CA do projeto em base64, não path local no servidor), JWT_ISSUER=bovitrack-api, JWT_AUDIENCE=bovitrack-web, FRONTEND_URL=https://bovitrack-xi.vercel.app, EMAIL_FROM com domínio aprovado, query/statement/lock/idle timeouts atuais. Não remover limites para acomodar fila. Pool3 significa seis conexões por instância; conferir orçamento agregado e plataforma. Frontend VITE_API_URL=https://bovitrack-api.vercel.app; se alterar, será incorporada no próximo build.

Falha na configuração: manter manutenção e banco preparado; não promover deployment sem todas as variáveis. Alteração de env não altera deployment antigo; construir novos a seguir.

## 7. Construir versões compatíveis, ativar e validar fechado

```powershell
$apiCandidate = (npx --yes vercel@65.14.0 deploy $sourceRoot --project prj_v0SXYazTtfH659wnuvk97W4bdqR9 --scope crh535 --prod --skip-domain --non-interactive | Select-Object -Last 1).Trim()
if ($LASTEXITCODE) { throw 'Build API falhou' }
if ($apiCandidate -notmatch '^https://[a-z0-9-]+\.vercel\.app/?$') { throw 'URL API invalida' }
$webCandidate = (npx --yes vercel@65.14.0 deploy $sourceRoot --project prj_zymSeKZ3qH06rcUcjT2rTcFxh2Vm --scope crh535 --prod --skip-domain --non-interactive | Select-Object -Last 1).Trim()
if ($LASTEXITCODE) { throw 'Build web falhou' }
if ($webCandidate -notmatch '^https://[a-z0-9-]+\.vercel\.app/?$') { throw 'URL web invalida' }
# Registrar as URLs e IDs dos dois deployments inspecionados.
npx --yes vercel@65.14.0 inspect $apiCandidate --scope crh535
npx --yes vercel@65.14.0 inspect $webCandidate --scope crh535
node scripts/release-production.cjs --activate
if ($LASTEXITCODE) { throw 'Ativacao recusada; manter manutencao' }
```

Os builds usam valores production, mas **--skip-domain mantém os aliases na manutenção**. URLs de staging podem ter SSO; usar sessão autorizada/Vercel curl, sem desabilitar proteção e sem criar bypass automaticamente. O frontend de staging usa API canônica em manutenção: não alegar E2E público completo antes da abertura. Não testar usuários reais nem criar fixtures sem autorização específica; se houver conta controlada aprovada, os testes fechados de API devem usar apenas seus dados.

Activate verifica hashes de dependências, chave e policies e aplica 019. Conferir checagem usando as duas URLs novas do arquivo privado, nunca admin como runtime:

```powershell
node -e "const fs=require('node:fs');Object.assign(process.env,require('./backend/node_modules/dotenv').parse(fs.readFileSync('backend/.env.release-production')));require('./backend/scripts/check-security-readonly.js')"
if ($LASTEXITCODE) { throw 'Seguranca recusada; manter manutencao' }
```

Esperado: logins distintos, 16 tabelas RLS, policies, zero linhas sem contexto, grants sensíveis/auth direto negados. Em leitura administrativa comparar contagens/órfãos/flags/roles. Provar login verificado, /auth/me, propriedade própria, acesso cruzado negado com duas contas controladas autorizadas, refresh/CSRF/logout; pendente deve exigir verificação. Se não há contas de teste autorizadas, parar para autorização concreta antes desse teste; não criar conta escondida. API candidata deve ter TLS, assinatura e sessões coerentes; /health sozinho não é suficiente.

## 8. Abrir e observar

```powershell
npx --yes vercel@65.14.0 promote $webCandidate --scope crh535 --yes
if ($LASTEXITCODE) { throw 'Frontend nao promovido; API continua manutencao' }
npx --yes vercel@65.14.0 promote $apiCandidate --scope crh535 --yes
if ($LASTEXITCODE) { throw 'Backend nao promovido' }
```

Frontend novo primeiro, API nova por último. O breve intervalo apresenta manutenção; impede expor backend que exige e-mail ao frontend antigo. Recarregar/nova sessão nos navegadores de teste. Em domínio canônico, completar login, verificação/recepção real autorizada, navegação, gravação/edição **somente de fixture expressamente aprovada**, refresh e logout. Confirmar persistência por leitura administrativa da fixture e remoção apenas se autorizada. Conferir 403/401 esperados, ausência de 5xx inesperados, 42501, assinatura/contexto inválido, filas/timeout e erros de e-mail nos logs sanitizados.

Monitorar durante a janela acordada e no primeiro período real de uso; não inventar SLA. Usar medições de homologação como referência contextual, não como meta de produção. Registrar IDs de deployment, SHA/tree hashes, migrations/ledger, backupmanifest privado, métricas e responsável. Só anunciar estabilidade após observar fluxo completo. Manter manutenção pronta e os secrets no cofre.

## 9. Rollback coordenado

Qualquer falha bloqueante: promover novamente `$maintenanceDeployment`, verificar 503, cessar testes/escritas e registrar o ponto de falha. Não usar rollback Vercel sozinho para retornar d22d106 com RLS ativo: o ensaio recebeu **503**; além disso, o login antigo estará NOLOGIN.

| Situação | Recuperação permitida após avaliação |
|---|---|
| Antes de 012–018 | Cancelar janela, reabilitar login legado e promover IDs originais; conferir nenhum dado/migration alterado |
| Falha em uma migration | Manter manutenção, consultar ledger, corrigir causa e retomar apenas a pendente; transação falha é revertida |
| Problema específico de RLS | Preferir candidata + rollback 019, mantendo e-mail e novas credenciais |
| Problema de código | Construir SHA compatível revisado com novas credenciais; testar fechado e promover coordenadamente |
| Corrupção de dados | Recuperação específica autorizada, sem sobrescrever gravações novas |

Rollback RLS, com manutenção confirmada, mesmo SHA, backupmanifest e autorização:

```powershell
node scripts/release-production.cjs --rollback-rls
if ($LASTEXITCODE) { throw 'Rollback recusado; manter manutencao' }
```

Efeito ensaiado: remove flags/grants de corte para permitir código compatível; mantém schema, policies e dados; verificacoes_email conserva proteção específica da arquitetura anterior. **Reduz a proteção no banco**, mesmo com autorização na aplicação. A checagem estrita de 16 RLS falhará nesse estado por definição. Verificar flags e grants esperados pelo SQL de rollback, login/me/refresh/logout, integridade e isolamento da API. A candidata continuou funcionando nesse estado; reabrir somente após prova e aceite da proteção reduzida. Reativação: maintenance -> --activate -> checagem estrita -> testes -> promoções.

Não reverter 013 apagando colunas nem restaurar sessões revogadas: preservar contas pendentes, hashes e histórico. O fallback 91a07aa foi testado sobre rollback; o d22d106 também funcionou, mas ignora verificação e contém dependências antigas. Qualquer uso emergencial exige build com credenciais novas, avaliação de vulnerabilidades e aprovação específica. Os IDs antigos não recebem automaticamente as variáveis novas. Preferir candidata com RLS revertido quando o defeito estiver no corte RLS.

**Depois de novas gravações:** registrar horário, fechar escritas, preservar banco atual e exportar diferenças/eventos antes de restaurar. Um backup pré-corte não contém esses registros. Restaurar primeiro em destino isolado autorizado; reconciliar alterações/IDs/relacionamentos com revisão. Restaurar sobre produção só com autorização específica e plano para preservar as novas gravações. PITR não está contratado/verificado; não prometer recuperação por WAL nem RPO zero. Não usar este runner de restore local para sobrescrever produção.

Roles/secrets: manter logins novos e chave coerentes com o backend selecionado; não recuperar senhas copiando-as de logs. Login legado deve permanecer desabilitado após adoção da candidata. Revisar remoção/revogação futura separadamente; não executar DROP automático de roles/schema/dados.

## 10. Integração GitHub após estabilidade

Nenhum push/merge nesta etapa. Antes da integração futura, combinar o controle dos autodeploys de main nos dois projetos; não permitir um merge disparar publicação fora da janela. Revisar/pausar via configuração autorizada, ou manter o candidato já publicado e provar que a construção automática é equivalente.

```powershell
git fetch origin --prune
git log --oneline --left-right "origin/main...$releaseSha"
git branch "release/rls-integracao-$($releaseSha.Substring(0,12))" $releaseSha
git worktree add ../rls-integracao "release/rls-integracao-$($releaseSha.Substring(0,12))"
# No novo worktree, apos revisao dos commits remotos:
git -C ../rls-integracao merge --no-ff --no-commit origin/main
```

Resolver conflitos preservando mudanças de terceiros, testar o resultado e revisar diff. Se há commits remotos novos, o SHA resultante é uma **nova candidata**, exigindo nova prova/autorização; não fingir que é a tag ensaiada. Só então commit, push normal da branch e PR mediante autorização específica. Nunca force push, reset destrutivo ou merge automático em main. Registrar SHA final e IDs publicados; encerrar janela com aceite humano.
