# Continuidade da implementação RLS

## Estado mais recente — etapa 3, 11/11/2026

**BLOQUEADO para implantação; preparação técnica executada.** Os tópicos abaixo deste bloco são históricos. Branch `feat/rls-bovitrack`; base inicial `51cb1c5d21d75a863bd03aa55361933cd722501b`. Correção da etapa 2 consolidada em `9cf9c8d`; correção visual em `d22d15f`. Release final identificado pela tag local `bovitrack-rls-rc-20261111`: obter SHA completo com `git rev-parse bovitrack-rls-rc-20261111^{commit}`. Sem push/merge/deploy de produção.

- Preservado o listener temporário de conexão adquirida; testes provam descarte, ausência de COMMIT e remoção dos listeners. Novo check de grants efetivos rejeita escalada por UPDATE(perfil) direto; teste com grant real e revogação passou em cópia local.
- Menu ilustrado corrigido com min-height 42px; teste original intacto. **140/140 E2E nas sete resoluções, PostgreSQL 17.6, 32,4 min.** Relatório integral preservado em `outputs/rls-etapa3/e2e-seven-report/index.html`.
- Frontend 11/11, lint/build, offline com 15 grupos de segurança, integração PG17.6 e npm audit backend/frontend passaram; auditorias sem vulnerabilidades. Homologação remota 12 grupos SQL/HTTP passou; advisor final de segurança sem apontamentos. Nenhuma falha atual na suíte completa. Tentativa inicial sobre PG18 teve ERR_CONNECTION_REFUSED após término do backend; a repetição PG17.6 passou, e os logs foram preservados.
- Upgrade legado sintético reconstruído do d22d106 em PG17.6: 012–019 ensaiadas; ledger SHA256 atômico compartilhado com futuro executor; dados/relacionamentos preservados; 013 revoga três sessões antigas e torna contas pendentes, sem excluir usuários. Oito casos de compatibilidade, incluindo binários reais d22d106/91a07aa/candidata, rollback e reativação. Legado com RLS ativo dá 503; frontend antigo não atende pendência de verificação. Preferir candidata + rollback 019 para recuperação.
- Backup de homologação restaurado em banco novo atestado, 17 tabelas, digests/ACLs/policies equivalentes, constraints validadas e HTTP login/dashboard aprovados. Dependência pgcrypto USAGE/EXECUTE foi identificada e corrigida no restore. Dump privado/ignorado; tempos pequenos de ensaio não são RTO. Nenhuma cópia de dados reais. Modo futuro de backup de produção exige autorização adicional de exportação/restore e pasta privada fora do checkout.
- Carga limitada com 10–30 pessoas esperadas: 1.200 GETs e 30 logins, zero erros. Recomendado pool3 por role, sujeito a orçamento agregado de instâncias. GET p95 com 30 concorrentes: pool2 2.967ms, pool3 2.010ms, pool5 1.379ms. Não é SLA. Três FKs sem índice foram medidas localmente; índices permanentes adiados nesta escala.
- Produção Supabase `znpmzebrryqtjkgnvlcw` continua INACTIVE, SQL inacessível; não reativada. Causa exata não exposta. Homologação `atlcangotqhtgybjsdau` ativa PG17.11. Reconfirmar catálogo atual quando produção voltar; snapshot estrutural disponível é anterior à pausa.
- Vercel permanece d22d106 nos dois projetos, roots frontend/backend, Node24, main e autodeploy Git ativos. DATABASE_AUTH_URL e DB_RLS_CONTEXT_KEY ainda ausentes. Secrets encrypted compartilhados com preview exigem revisão autorizada. EMAIL_FROM atual é onboarding@resend.dev; subdomínio próprio e DKIM planejados retornaram NXDOMAIN. Entrega/permissão Resend real não comprovadas; nenhum e-mail real enviado.
- Novos scripts operacionais consolidados em `76097aec234cc3ff0cebba788bef7c9c81462bcf`: backup/restore, probes de runtime, ensaio legado, planos de índices, carga, guardas, executor/ledger, empacotamento, manutenção e prova de grants. Artefato `release/maintenance` retorna503 sem DB. Modelo vazio de configuração em `release/production-config.example`. `.vercelignore` e ignore de outputs evitam envio/versionamento de artefatos privados.
- A futura janela deve publicar manutenção, bloquear login SQL legado e encerrar conexões antigas antes do backup, criar logins novos de domínio/auth e coordenar frontend/API/019. Alias de manutenção sozinho não impede deployments antigos de escrever. Os modos de produção não foram executados; guardas e componentes locais foram testados. Nenhum segredo de produção foi gerado.
- Relatório obrigatório: `PREPARACAO_PRODUCAO_RLS_BOVITRACK.md`; sequência executável e rollback: `RUNBOOK_DEPLOY_RLS_BOVITRACK.md`. Evidências ignoradas em `outputs/rls-etapa3/`. Arquivos gerados Graphify anteriormente sujos permanecem preservados fora do release; atualização AST sem API realizada, sem extrator SQL opcional.
- Próximas ações humanas: disponibilizar produção/cota; validar domínio/remetente e destinatário de teste; autorizar janela/cópia privada/backup/secrets; revisar e autorizar SHA/runbook antes de qualquer alteração de produção. Não instalar ferramentas opcionais redundantes. Nenhuma skill instalada nesta etapa.

## Referência e ambiente

- Branch `feat/rls-bovitrack`, worktree `.worktrees/rls-bovitrack`, base DEV `91a07aa`. A branch original, a auditoria e os artefatos existentes foram preservados.
- Produção consultada somente via SELECT de catálogo. Confirmadas 15 tabelas, zero policies e ausência da 013 e dos sete índices. Nenhuma alteração de produção ou deploy.
- O banco local descartável foi criado com PostgreSQL 18.4 em loopback, porta 55438. O runner cria e remove um banco com nome aleatório e logins exclusivos para cada execução. As suítes de e-mail usam mock da Resend.

## Skills

- Graphify para mapa do fluxo de autenticação, SQL e serviços.
- Supabase e Supabase Postgres Best Practices para roles, políticas, pooler, índices e grants.
- Caveman Safe Refactor e Migration para baseline, propagação do executor e corte reversível.
- Ponytail e Entry Ponytail para reutilizar `pg`, validações, fluxo Express, autenticação e runner existentes.
- Playwright para validar a candidata no navegador com o backend usando login SQL restrito.
- Nenhuma skill foi instalada. O conjunto disponível cobriu a implementação e os testes requeridos.
- `graphify update .` atualizou o grafo do código. O extrator SQL opcional não estava instalado. A validação das migrations foi feita executando SQL no PostgreSQL isolado.

## Estado

1. Auditoria lida, catálogo reconfirmado e linha de base DEV exercitada.
2. Executor, atestado transacional e separação dos logins implementados.
3. Rotas e serviços migrados para o cliente explícito ou funções restritas.
4. Migrations 013–019, correção de integridade e rollback versionáveis preparados.
5. `integration` terminou com código 0. Passaram 26 grupos de e-mail, 141 verificações de autorização, 24 de produção leiteira, 16 de receitas, 18 de pesagem/desmama e 13 regressões de backend, além das verificações de catálogo, grants, exclusões e órfãos.
6. `rls` passou com os 16 objetos, logins restritos, acesso cruzado negado, reuso, assinatura rejeitada em outra transação, finalidade adulterada, sessão inválida/revogada/expirada, replay, timeout, rollback e reativação.
7. `offline` passou com 14 grupos de segurança, cálculos de manejo, clima, exclusão, regressões HTTP simuladas e 9 testes de frontend. `scripts/test-isolation.cjs` recusou protocolos, hosts e overrides incompatíveis.
8. Playwright passou os seis cenários selecionados no Chromium a 1366×768, com saída 0. A primeira execução no sandbox excedeu o limite no encerramento de processos. A repetição autorizada fora do sandbox encerrou o runner e removeu o banco de teste.

## Retomada

### Atualização da etapa 2 — 11/11/2026

- Homologação criada e validada: `bovitrack-homologacao`, ref `atlcangotqhtgybjsdau`, organização `ttgiomayofzntmxoasyt`, São Paulo, PostgreSQL 17.11. A cota gratuita foi resolvida pelo usuário alterando a permissão de um membro; nenhum membro foi alterado pelo agente.
- Schema inicial, sessões, 007–010 e 012–019 aplicados exclusivamente nesse projeto. Supavisor `aws-1-sa-east-1.pooler.supabase.com`: administração em 5432, domínio/auth em 6543. TLS verify-full conferido nas três conexões.
- Dois logins restritos e chave exclusiva provisionados. Configuração privada em `backend/.env.homologacao`, ignorada pelo Git. Não imprimir, copiar ou versionar esse arquivo. Não repetir o script de provisionamento para rotacionar credenciais.
- Estado final: 16 tabelas com RLS/policies, grants mínimos, zero apontamentos do advisor de segurança. Rollback da 019 e reativação exercitados, com snapshots equivalentes de ACLs, defaults, colunas e policies.
- Runner remoto `node scripts/test-supabase-homologacao.cjs`: 12 grupos aprovados com SQL/HTTP reais, Resend mock e 90 operações concorrentes. Dados remotos são somente sintéticos; cada execução acrescenta fixtures para diagnóstico.
- Defeito reproduzido no Supavisor: cliente adquirido do pg-pool sem listener para erro assíncrono de conexão encerrava o processo. Corrigido em `backend/database/contextoRls.js`, com descarte do cliente e regressão em `security-hardening.js`; falha física real e timeout do driver passaram depois da correção.
- Regressões finais: audits backend/frontend sem vulnerabilidades, lint/build e 11 testes frontend aprovados; offline com 15 grupos de segurança aprovado; integração completa aprovada na repetição. Uma execução anterior teve saída nativa do Node no Windows 3221226505 sem causa conclusiva; o log permanece preservado.
- E2E integral nas sete resoluções: 139 aprovados e uma falha visual conhecida de altura das linhas do menu em 1366×768. Não foi ocultada. Seis E2E selecionados repetidos após a correção passaram.
- Relatório final e limites: `HOMOLOGACAO_RLS_BOVITRACK.md`. Evidências em `outputs/rls-etapa2/`; relatório E2E completo em `e2e-full-report/index.html`. A cópia `e2e-full-test-results` é parcial devido a caminhos longos do PowerShell.
- Classificação: APROVADO COM RESSALVAS NÃO BLOQUEANTES para preparar implantação. Carga pequena, minor 17.11 diferente da produção 17.6, falha visual independente e necessidade de ensaiar backup/corte/binário legado antes de produzir.
- Produção `znpmzebrryqtjkgnvlcw` foi apenas consultada por SELECT de catálogo; a pausa observada foi externa ao agente. Não reativar, escrever, fazer deploy, push ou merge automaticamente.
- Nenhum commit/push/merge/deploy nesta etapa; HEAD `51cb1c5` preservado. Graphify atualizado por AST, sem API. Skills adicionais utilizadas nesta etapa: Caveman Surgical Patch; nenhuma skill instalada.
- Cluster local de apoio em `outputs/rls-etapa2/postgres-data`, porta 55440, encerrado ao finalizar; arquivos preservados. Para repetir localmente, iniciar com `pg_ctl -D outputs/rls-etapa2/postgres-data -l outputs/rls-etapa2/postgres.log -o '-h 127.0.0.1 -p 55440' -w start` antes do runner.

Retomada segura da homologação existente:

```powershell
node scripts/test-supabase-homologacao-guard.cjs
node --env-file=backend/.env.homologacao scripts/check-supabase-homologacao.cjs
# Somente se uma nova rodada de escrita sintética for necessária:
node scripts/test-supabase-homologacao.cjs
```

Os parágrafos seguintes descrevem a retomada local anterior à etapa 2; o Supabase de homologação já foi validado conforme esta atualização.

No worktree, executar `node scripts/test-isolated.cjs offline` e definir `BOVITRACK_TEST_POSTGRES_URL` para uma instância local descartável com privilégios de criação de banco e roles. Rodar `node scripts/test-isolated.cjs rls` para a validação curta de grants, isolamento, contexto, rollback e reativação, ou `node scripts/test-isolated.cjs integration` para a matriz HTTP completa.

Próxima ação externa é reproduzir o rollout em Supabase de homologação com PostgreSQL 17, as duas credenciais de runtime, Supavisor transacional e Vercel de preview. Verificar métricas, reuso físico, plano da 013 e rollback para o binário legado antes de pedir autorização para produção. O procedimento está em [DEPLOY_RLS_BOVITRACK.md](DEPLOY_RLS_BOVITRACK.md).
