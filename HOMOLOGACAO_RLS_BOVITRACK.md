# Homologação RLS BoviTrack — etapa 2

Execução em 10–11/11/2026, America/Sao_Paulo. Branch `feat/rls-bovitrack`, HEAD preservado `51cb1c5`.

**APROVADO COM RESSALVAS NÃO BLOQUEANTES para preparar a implantação em produção.** PostgreSQL 17, Supavisor transacional, TLS, dois logins restritos, RLS, autenticação, concorrência, falha física e rollback foram exercitados no projeto isolado. A aprovação não autoriza alteração ou deploy de produção.

## A. Ambiente de homologação

| Item | Estado confirmado |
| --- | --- |
| Projeto | `bovitrack-homologacao` |
| Project ref | `atlcangotqhtgybjsdau` |
| Organização | `CRH535's Org` — `ttgiomayofzntmxoasyt`, escolhida pelo usuário |
| Região | `sa-east-1`, São Paulo |
| PostgreSQL | SQL `17.11`, distribuição `17.11.0.018` |
| Database | `postgres` |
| Host direto | `db.atlcangotqhtgybjsdau.supabase.co` |
| Host Supavisor | `aws-1-sa-east-1.pooler.supabase.com` |
| Administração | Session pooler, porta 5432, SQL identity `postgres` |
| Domínio/autenticação | Transaction pooler, porta 6543, logins distintos |
| TLS | `verify-full`; socket criptografado e certificado autorizado em todas as três conexões |
| Estado final | `ACTIVE_HEALTHY`; 16 tabelas com RLS e policies |

A integração oficial cotou US$ 0/mês; o usuário confirmou organização e custo. A primeira criação foi recusada pela cota global dos membros Owner/Admin. Após a liberação de vaga e mudança de permissão realizadas pelo usuário, o projeto foi criado. A regra foi confirmada na [documentação oficial de cotas](https://supabase.com/docs/guides/platform/billing-faq#how-many-free-projects-can-i-have).

Produção protegida: `znpmzebrryqtjkgnvlcw`, PostgreSQL 17.6. Apenas SELECT de catálogo para comparar funções/triggers, sem dados de clientes. O agente não executou escrita, pausa, restauração, deploy, alteração de secrets, push ou merge de produção. Durante a sessão, a listagem de produção mudou externamente de ACTIVE_HEALTHY para PAUSING/INACTIVE. Nenhuma dessas ações foi chamada pelo agente.

A minor 17.11 da homologação difere da 17.6 de produção. O provisionamento oferece a versão atual; não foi feito downgrade. A compatibilidade foi comprovada na major 17 disponível.

## B. Migrations e reconciliação

Aplicadas **somente na homologação**: bootstrap de identidade/default privileges, schema 001, sessões 003, 007, 008, 009, 010, **012, 013, 014, 015, 016, 017, 018 e 019**.

A integração oficial registra as migrations até a 019 em `supabase_migrations.schema_migrations`. A 019 também foi executada/reaplicada diretamente pelo runner durante os ensaios; o rollback não cria uma migration histórica nova.

| Migration | Conteúdo e tratamento |
| --- | --- |
| 012 | Parentesco, desmama, trigger de animais e sete índices. Aplicada sobre estrutura nova sem dados reais, evitando substituir cegamente funções de um banco legado. Reaplicabilidade exercitada localmente. |
| 013 | Estado de verificação, desafios, índices, trigger de alteração de e-mail e revogação de sessões pendentes. Aplicada isoladamente e exercitada em contas sintéticas novas/legadas. |
| 014 | Quatro roles sem login, schema privado, chave, desafio xid8, identidade/sessão assinadas e policies de identidade. Não idempotente: CREATE SCHEMA/FUNCTION exige controle de versão. |
| 015 | Funções restritas de cadastro/login, sessões/refresh/revogação, limites, status e alteração de e-mail; grants/policies internos. Aplicação única versionada. |
| 016 | Reserva, entrega e resolução restritas dos desafios de e-mail. Aplicação única versionada. |
| 017 | Reconcilia parentesco/desmama/pesagem/movimentação, bloqueia referências, protege animal/lote e vacinações, audita vínculos e cria índices. Contém CREATE FUNCTION/TRIGGER não reaplicáveis indiscriminadamente. |
| 018 | Policies de usuários e domínio, incluindo USING/WITH CHECK e privilégios administrativos previstos. Aplicação única versionada. |
| 019 | Reduz grants, remove policy legada de desafios e ativa RLS atomicamente nas 16 tabelas. Pré-condições, snapshots, rollback e reativação executados. |

O catálogo de produção confirmou divergências já tratadas pela 017: trigger de parentesco sem UPDATE OF sexo, comparações legadas que não rejeitam todos os NULLs e diferença na função de desmama. Não foi necessário alterar as migrations existentes para a estrutura vazia de homologação.

O bootstrap revogou defaults de acesso público antes de criar tabelas, e a 010 endureceu os grants. Após 018 havia 56 policies para 16 tabelas e nenhum grant de tabela/coluna para `anon`/`authenticated`. A 019 só foi ativada depois de provisionar e conferir a chave, roles, funções e isolamento.

`migrate-email-verification.js --check` foi inspecionado e executado com credencial administrativa exclusiva: abre BEGIN READ ONLY, consulta agregados, faz COMMIT e retorna antes de aplicar SQL. Evidência: `outputs/rls-etapa2/remote-email-check.log`. As fixtures remotas usam endereços sintéticos reservados em `example.com`; o script rejeita domínios .test/.local/.example/.invalid, sem precisar enfraquecer a auditoria.

## C. Roles, credenciais e TLS

- `bovitrack_homolog_dominio`: login membro de `bovitrack_runtime`, porta 6543.
- `bovitrack_homolog_auth`: login membro de `bovitrack_auth_runtime`, porta 6543.
- Nenhum login possui SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ou BYPASSRLS, ownership de objetos ou membership nas roles internas; os dois grupos não herdam um ao outro.
- Roles internas `bovitrack_rls_identidade` e `bovitrack_rls_interno`: NOLOGIN, usadas somente pelas funções/grants previstos.
- Senhas, JWT, pepper e chave RLS foram gerados com `crypto.randomBytes`, exclusivamente para homologação. A chave tem 32 bytes em hexadecimal; a gravação foi feita por bind parameter.
- DDL de senha usa função temporária com parâmetros e `format(%L)`; senhas não foram colocadas em SQL literal nas chamadas de ferramentas nem impressas.
- Configuração privada em `backend/.env.homologacao`, ignorada pelo Git. CA em `C:/Users/pfalg/Downloads/prod-ca-2021.crt`. Nenhuma credencial de produção copiada.
- O contexto usa `set_config(..., true)` dentro da transação, assinado para xid/usuário/sessão/finalidade. Não foram encontrados prepared statements nomeados no fluxo inspecionado.
- Preflight validou identidade SQL, marcador do database, versão 17, roles, host/porta fixados e TLS. Credencial administrativa em 5432; runtimes em 6543.

Referências: [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS](https://supabase.com/docs/guides/platform/ssl-enforcement).

## D. Testes, comandos e evidências

| Verificação | Resultado |
| --- | --- |
| npm audit final backend/frontend | Zero vulnerabilidades reportadas em ambos; exit 0 |
| Frontend lint/build | Exit 0; build inclui teste de ícones |
| Frontend npm test | 11 aprovados, zero falhas |
| Offline após correção | 15 grupos de segurança, manejo, clima, exclusão, regressões HTTP e nove testes frontend aprovados |
| Guards local e remoto | Aprovados; destinos/overrides perigosos recusados sem rede |
| Integração local após correção | 26 grupos de e-mail; 141 verificações de autorização; 24 leite; 16 receitas; 18 pesagens/desmamas; 13 regressões; catálogo, integridade e rollback aprovados |
| Supabase/Supavisor real | 12 grupos remotos aprovados, exit 0 |
| E2E integral, sete resoluções | **139 aprovados / 1 falha visual conhecida**, 31,6 minutos |
| E2E selecionados após correção | 6 aprovados em 1366×768, 57,3 segundos |
| Advisor Supabase segurança | Zero apontamentos após ativação |
| Advisor desempenho | Somente INFO: três FKs sem índice de cobertura e índices ainda sem uso |
| Verificação de segredos | Nenhum valor dos segredos privados encontrado nos arquivos públicos/logs inspecionados |

Os 12 grupos remotos cobrem:

1. A/B/admin, SELECT sem identidade e SELECT/UPDATE/DELETE alheios nas tabelas de domínio, confirmando estado administrativo.
2. INSERT alheio, alteração de proprietário, vínculo animal/lote e vacinação cruzados, pesagem/desmama/movimentação inválidas e sexo NULL de mãe referenciada.
3. Assinatura copiada de outra transação, finalidade adulterada, sessão de outro usuário, divisão por zero, rollback e timeout SQL.
4. UPDATE/DELETE próprios, vínculos preservados e valores financeiros conferidos no banco.
5. Encerramento físico do backend PostgreSQL dentro de uma transação autenticada; erro de conexão conferido, processo preservado e conexão seguinte sem contexto. Timeout do driver e recuperação também conferidos.
6. 90 operações concorrentes A/B/admin, assinaturas e visibilidade conferidas por transação, reuso de PIDs e ausência de identidade em transações seguintes.
7. HTTP cadastro, conta pendente, código inválido, verificação concorrente, login, refresh/rotação, logout e tokens rejeitados após logout.
8. Replay, refresh expirado, sessão revogada e conta desativada.
9. Conta legada sem verificação, código expirado, novo envio mock, verificação e alteração de e-mail com revogação real de sessões.
10. HTTP admin, totais de dashboard comparados com agregações SQL, desativação/reativação sem ressuscitar sessão antiga e expiração durante transação.
11. Medições RLS ligado/desligado, rollback com flags/grants/policies, reativação e comparação exata dos snapshots de ACLs/defaults/colunas/policies.
12. Exclusão da propriedade e dependências pelo serviço real, confirmando remoção de filhos e preservação dos dados de B.

A Resend foi substituída por mock explícito no processo de teste. Não houve envio externo. As suítes locais mantêm seus próprios mocks e guards originais.

Na primeira repetição local após a correção ocorreu uma saída nativa do Node no Windows (`3221226505`), sem stack JavaScript. Não foi identificada causa conclusiva; a repetição integral posterior passou. A ocorrência foi preservada em `integration-after-fix.log`; aprovação da repetição em `integration-after-fix-retry.log`.

Comandos reproduzíveis na raiz:

```powershell
node scripts/test-supabase-homologacao-guard.cjs
node --env-file=backend/.env.homologacao scripts/check-supabase-homologacao.cjs
node scripts/test-supabase-homologacao.cjs
node scripts/test-isolation.cjs
node scripts/test-isolated.cjs offline
$env:BOVITRACK_TEST_POSTGRES_URL='postgresql://postgres@127.0.0.1:55440/postgres'
node scripts/test-isolated.cjs integration
node scripts/test-isolated.cjs e2e
node scripts/test-isolated.cjs e2e bovitrack.spec.js email-verification.spec.js --project=1366x768
```

`prepare-supabase-homologacao.cjs` foi executado uma vez para provisionar credenciais; recusa sobrescrever logins/chave existentes. **Não repetir para rotacionar automaticamente.** O runner remoto cria novas fixtures sintéticas a cada execução e mantém dados para diagnóstico; não deve ser usado como teste contínuo indiscriminado.

O cluster local PostgreSQL 18 de apoio foi encerrado depois dos testes; seus arquivos foram preservados. Para repetir as suítes locais, inicie-o com `pg_ctl -D outputs/rls-etapa2/postgres-data -l outputs/rls-etapa2/postgres.log -o '-h 127.0.0.1 -p 55440' -w start`. A homologação Supabase permanece ativa.

## E. Segurança e correção encontrada

O teste real de falha física reproduziu um encerramento do processo por evento `error` não tratado num cliente PostgreSQL emprestado pelo pool. O listener de erro da pool é removido enquanto esse cliente está adquirido.

Correção mínima em `backend/database/contextoRls.js`: listener temporário durante a transação, descarte persistente após falha de conexão, interrupção antes de COMMIT e retirada do listener ao liberar. Nenhuma policy foi ampliada.

A regressão unitária emite o erro assíncrono, exige descarte, ausência de COMMIT e zero listeners residuais. Os doubles de três suítes passaram a usar EventEmitter. O cenário real no Supavisor passou depois da correção, incluindo recuperação sem identidade herdada.

O runner local e sua fixture continuam restritos a loopback. O mecanismo remoto usa allowlist versionada com apenas a ref aprovada, host exato, database, login e marcador SQL; proíbe produção/LG_Vagas, parâmetros de URL, fragmentos, portas e papéis inesperados. Não aceita URLs por argumentos. O provisionamento/ativação/rollback reconfirmam a identidade antes de escrever.

As tentativas intermediárias também identificaram dois erros de expectativa no runner novo: código expirado retorna CODE_EXPIRED, e os totais do dashboard ficam em resumo. Somente o teste foi corrigido para o contrato existente; os resultados finais são os da rodada concluída.

## F. Concorrência e desempenho

| Medida final remota | Resultado |
| --- | --- |
| Rajada concorrente | 90 operacoes, 0 erros, 3 PIDs fisicos |
| Latencia da rajada | p50 2004.42 ms; p95 3748.32 ms; maximo 3879.49 ms |
| Pool | maximo 3 clientes; 87 aguardando; fila final 0; ociosos finais 3 |
| RLS ligado - leitura/JOIN/financas/escrita | p50 170.01 ms; p95 171.45 ms; 20 amostras |
| RLS desligado - mesma transacao | p50 163.22 ms; p95 164.48 ms; 20 amostras |
| Diferenca de medianas desta execucao | 4.16% |
| HTTP login ligado/desligado | 531.46 / 519.20 ms |
| HTTP refresh ligado/desligado | 42.20 / 41.92 ms |
| HTTP /propriedades ligado/desligado | 206.99 / 201.84 ms |
| HTTP /animais ligado/desligado | 207.22 / 200.71 ms |
| HTTP /dashboard ligado/desligado | 270.40 / 256.76 ms |
| HTTP /despesas ligado/desligado | 206.05 / 200.13 ms |
| HTTP /receitas ligado/desligado | 203.68 / 202.00 ms |

Os tempos concorrentes incluem fila no pool e latência até São Paulo. O pico de 87 aguardando é consequência da rajada de 90 operações com pool limitado a três clientes, não uma medida de duração SQL individual. Não houve vazamento ou fila residual.

A comparação RLS ligado/desligado usa 20 amostras de uma transação com listagem de propriedades/animais, JOINs, soma financeira e UPDATE. As medições HTTP de login/refresh/listagens/dashboard/finanças são **amostras individuais**, sem valor de p95. Servem para confirmar funcionamento e registrar uma linha de base; o volume é pequeno e não dimensiona produção.

Advisor INFO: FKs `desmamas.registrado_por`, `pesagens.registrado_por` e `sessoes_refresh_usados.sessao_id` sem índice de cobertura. Índices existentes sem uso são esperados nesta base pequena. Nenhum índice foi removido ou acrescentado sem uma medição que justificasse a mudança.

## G. Rollback

Snapshots preservados em `remote-before-019.json`, `remote-after-019.json` e `remote-rollback-019.json`, incluindo flags, owners, ACLs, grants por coluna, default privileges e policies.

No rollback documentado, somente verificacoes_email permaneceu com RLS. Foram conferidos acesso legado a propriedades, coluna de senha e desafios, além do benchmark e dos fluxos HTTP sob RLS desligado. A 019 foi reaplicada em finally; o snapshot ativo final coincidiu exatamente com o estado ativo inicial, e A/B/grants foram retestados.

O binário legado completo não foi iniciado remotamente; a compatibilidade conferida foi a superfície SQL do rollback e o backend candidato nos dois estados. A restauração completa de backup/PITR e o corte com binários de produção são atividades da preparação operacional posterior.

Estado final: **RLS habilitado nas 16 tabelas**, grants restritos e policy temporária verificacoes_runtime ausente. Nenhum rollback em produção.

## H. Arquivos e versionamento

- `backend/database/contextoRls.js`: correção do erro assíncrono da conexão.
- `backend/tests/security-hardening.js`: regressão e double com eventos.
- `backend/tests/backend-regressions.js` e `deletion-impact.js`: doubles compatíveis com o cliente real.
- `scripts/supabase-homologacao.json`: allowlist pública sem credenciais.
- `scripts/check-supabase-homologacao.cjs`: preflight somente leitura, reutilizando o check de segurança existente.
- `scripts/prepare-supabase-homologacao.cjs`: provisionamento exclusivo com segredos gerados localmente.
- `scripts/test-supabase-homologacao.cjs`: suíte remota com dados sintéticos, métricas e rollback.
- `scripts/test-supabase-homologacao-guard.cjs`: regressão das fronteiras de acesso.
- Este relatório e `CODEX_CONTINUIDADE_RLS.md`: resultados e retomada.
- Graphify atualizado após código, por AST, sem custo de API.

Alterações anteriores em Graphify, DEPLOY_PRODUCAO_BOVITRACK.md e outputs preservadas. Nenhum arquivo de usuário foi excluído. Ao copiar anexos E2E, o PowerShell encontrou limites de caminho longo; o relatório HTML completo foi preservado em `outputs/rls-etapa2/e2e-full-report/index.html`, com seus anexos em data, e o log integral permanece em e2e.log. A pasta e2e-full-test-results contém cópia parcial e não deve ser tomada como arquivo completo.

Sem commit, push, merge ou deploy nesta etapa. HEAD original preservado; mudanças ficam disponíveis para revisão.

## I. Skills

Usadas: Graphify (mapa e atualização); Supabase (docs/integração/provisionamento); Supabase Postgres Best Practices (pooling/RLS/privilégios); Caveman Migration (sequência/rollback); Caveman Surgical Patch (defeito reproduzido e correção mínima); Ponytail e Entry Ponytail (reuso de pg/config/checks); Playwright (E2E existente solicitado).

Nenhuma skill instalada: as disponíveis cobriram a execução. Superpowers não consta no catálogo e não foi necessária uma alternativa redundante. Nenhum subagente utilizado.

## J. Ressalvas e próximos passos

1. Corrigir separadamente a falha visual conhecida de altura das linhas do menu em 1366×768. O teste não foi ocultado nem desativado.
2. Dimensionar pool e concorrência com volume sintético maior e limiares definidos; avaliar os índices informativos com EXPLAIN/carga representativa.
3. Considerar a diferença minor 17.11 versus produção 17.6 no plano de atualização.
4. Preparar backup/restauração, ensaio do binário legado e corte coordenado antes da autorização de produção.
5. O navegador foi validado na infraestrutura local; o backend com banco hospedado foi validado por HTTP/SQL real. Não houve deployment de preview/Vercel nesta etapa.
6. O projeto gratuito permanece criado e contém somente fixtures sintéticas. Segredos locais não devem ser publicados. Não reativar/mudar produção automaticamente por causa da cota.

## K. Conclusão

**APROVADO COM RESSALVAS NÃO BLOQUEANTES.**

A arquitetura RLS funcionou no PostgreSQL 17 hospedado e Supavisor transacional com TLS validado, dois logins restritos, identidade assinada, autenticação/e-mail, CRUD/integridade, concorrência, falhas e rollback/reaplicação reais. O defeito de desconexão foi corrigido e verificado. Permanecem uma falha visual independente e as limitações de carga/implantação descritas acima.

O BoviTrack está tecnicamente apto a **preparar** a implantação em produção. Este resultado não constitui autorização para modificar o banco ou publicar a aplicação de produção.
