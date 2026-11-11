# Limpeza final do BoviTrack

Conferência local em 11/11/2026. Branch `chore/limpeza-final-bovitrack`, criada sobre `origin/main` em `4e0f4ceb2a8f8a5bfab277d135f71de1e902bb31`.

## A. Resumo executivo

A limpeza enviou à Lixeira 6.360 arquivos gerados em cinco pastas, somando 115.078.723 bytes. Foram arquivados dois relatórios históricos, criado um índice de documentação e corrigidas instruções sobre RLS, provisionamento local e e-mail opcional. A análise de 208 arquivos JavaScript identificou três declarações sem uso, removidas de testes e scripts.

A investigação do CI encontrou um defeito reproduzível no runner de testes. Os logins temporários eram criados sem senha e falhavam em servidores com autenticação SCRAM. Agora recebem senhas aleatórias distintas, utilizadas nas respectivas conexões. A integração completa passou em PostgreSQL 17.6 local com SCRAM após a reprodução da falha original.

O build final contém os mesmos 55 arquivos e 935.913 bytes do baseline, com hashes SHA-256 idênticos. As dependências e os lockfiles foram preservados. Os dois audits completos retornaram zero vulnerabilidades antes e depois da limpeza.

O estado publicado foi consultado em modo de leitura. Os projetos Vercel estavam READY no commit `4e0f4ce`, e o Supabase estava ACTIVE_HEALTHY, com 16 tabelas públicas sob RLS e configuração SQL de e-mail false. Os detalhes da publicação permanecem em [Deploy de produção](DEPLOY_PRODUCAO_RLS_SEM_VERIFICACAO_EMAIL.md).

## B. Arquivos removidos do workspace

Todos os itens abaixo foram enviados à Lixeira do Windows. A conferência encontrou as cinco pastas na Lixeira e confirmou a ausência dos caminhos originais.

| Caminho | Arquivos | Bytes | Finalidade e risco |
| --- | --- | --- | --- |
| `frontend/dist/` | 55 | 935.896 | Build gerado, regenerável por `npm run build`. Risco baixo. |
| `outputs/rls-email-flag/upload-source-verified-6b6cf1bd8f24/frontend/node_modules/` | 5.231 | 108.077.215 | Instalação duplicada usada no ensaio do pacote. Regenerável pelo lockfile da cópia. Risco baixo. |
| `outputs/rls-email-flag/upload-source-verified-6b6cf1bd8f24/backend/node_modules/` | 964 | 4.193.803 | Instalação duplicada do mesmo ensaio. Regenerável pelo lockfile. Risco baixo. |
| `outputs/rls-email-flag/upload-source-verified-6b6cf1bd8f24/frontend/dist/` | 55 | 935.896 | Build do ensaio, com fontes e inventário preservados. Risco baixo. |
| `outputs/rls-email-flag/upload-source-verified-6b6cf1bd8f24/frontend/dist-79f65c7f52c9/` | 55 | 935.913 | Segunda saída de build do ensaio. O pacote aprovado e suas fontes permanecem preservados. Risco baixo. |
| **Total** | **6.360** | **115.078.723** | **Cinco pastas recuperáveis na Lixeira.** |

O inventário anterior à operação registra os hashes de cada arquivo. Os recibos locais estão em `outputs/limpeza-final-20261111/recycle-candidates.json`, `recycle-receipts.json` e `recycle-verification.json`. A leitura das pastas já recicladas confirmou novamente os 6.360 arquivos e 115.078.723 bytes em `recycle-content-verification.json`. As instalações principais de dependências continuam disponíveis. A cópia verificada conserva suas fontes, lockfiles e o resultado histórico `outputs/rls-email-flag/upload-source-check.json`.

## C. Arquivos preservados

Os tamanhos abaixo são fotografias do inventário inicial e podem crescer durante testes.

| Candidato preservado | Motivo |
| --- | --- |
| Todos os `.env`, arquivos DPAPI e certificados | Configuração e material privado dos ambientes. |
| `outputs/rls-etapa3/postgres17-data/`, aproximadamente 234 MB | Cluster local efetivamente utilizado na validação. Contém dados de teste e exige conferência própria antes de desativação. |
| `outputs/rls-etapa3/pg17/`, aproximadamente 137 MB | Binários PostgreSQL 17.6 utilizados nos testes e ensaios. |
| `outputs/rls-etapa3/revisions/`, aproximadamente 121 MB | Revisões históricas utilizadas por testes de compatibilidade. |
| `outputs/deploy-producao-20261110/postgres-data/`, aproximadamente 59 MB | Diretório de banco anterior, preservado por conter dados. |
| `outputs/rls-etapa2/`, aproximadamente 108 MB | Evidências de homologação, permissões e pooler. |
| Relatórios, traces e capturas em `outputs/rls-etapa3/` e `outputs/rls-email-flag/` | Provas de isolamento, regressões, ensaios de rollback e validação visual. |
| `outputs/iconografia/` e `outputs/navigation-images/` | Capturas e material de referência visual. Alguns relatórios HTML já estavam ausentes antes desta limpeza. |
| `outputs/rls-email-flag/upload-source-6b6cf1bd8f24/` e fontes da cópia verificada | Cópias históricas com migrations e fonte do pacote. |
| `outputs/rls-etapa3/release-79f65c7f52c9*` e material privado externo ao checkout | Pacote aprovado e continuidade do processo de recuperação. |
| `graphify-out/`, caches e backups datados | Mistura de índices gerados e conhecimento curado. Snapshot dos seis arquivos inicialmente modificados preservado em `outputs/limpeza-final-20261111/graph-before/`. |
| Os 13 PNGs originais dos módulos e o PNG original do login | Fontes visuais documentadas. A navegação utiliza derivados WebP e o login utiliza JPEG. |
| Migrations, rollbacks, scripts legados e documentação de implantação | Compatibilidade com estados anteriores e recuperação operacional. |

As evidências desta limpeza estão em `outputs/limpeza-final-20261111/`. O cluster SCRAM criado para reproduzir o CI usou somente loopback e credenciais sintéticas. Foi encerrado após a confirmação de zero bancos e zero logins temporários remanescentes. Seus arquivos foram preservados como candidato a uma manutenção local posterior.

## D. Código ajustado

- `backend/tests/email-verification.js` teve removido um import de `bcryptjs` sem referências.
- `scripts/test-supabase-homologacao.cjs` teve removidos o helper `hex` sem chamadas e seu import exclusivo de `node:crypto`.
- `scripts/test-isolated.cjs` passou a gerar duas senhas hexadecimais aleatórias de 32 bytes, configurar cada URL de login e criar as roles temporárias com essas senhas. O erro SCRAM foi reproduzido antes da alteração e a integração foi aprovada depois.

A revisão estática final encontrou zero imports locais quebrados, zero arquivos JavaScript órfãos em `frontend/src` a partir de `main.jsx` e zero declarações sem uso no escopo auditado do backend/scripts. Os 28 assets versionados foram inventariados por hash, sem duplicatas exatas. Os originais visuais têm finalidade documentada.

O diff de código ficou restrito a testes e scripts. A comparação do bundle confirma a preservação dos arquivos entregues ao navegador. As verificações automatizadas cobrem autenticação, integridade, isolamento, formulários, ícones, temas, navegação e responsividade.

## E. Dependências

| Projeto | Diretas de produção | Diretas de desenvolvimento | Entradas resolvidas no lock | Vulnerabilidades |
| --- | --- | --- | --- | --- |
| Backend | 8 | 0 | 103 | 0 |
| Frontend | 4 | 11 | 201 | 0 |

Foram removidas zero dependências. Resend permanece utilizado pelo serviço de e-mail e por testes. Os pacotes de tipos React apoiam a edição e a análise de JSX. As demais referências foram conferidas em código, scripts, testes e configurações.

`npm ls --all --json` terminou com saída zero nos dois projetos e sem `problems`. A verificação dos requisitos `engines.node` dos lockfiles encontrou zero incompatibilidades com Node 24.15.0. O override `minimatch=11.0.7` foi preservado.

`npm outdated --json` identificou atualizações disponíveis, incluindo `pg` 8.23.1 e versões posteriores de React, Vite e Playwright. Também indicou majors posteriores de dotenv e Babel parser. As versões auditadas e testadas foram mantidas nesta limpeza. Os inventários completos ficam em `dependencies-*-outdated.json` e `dependencies-*-tree.json`, dentro da pasta de evidências.

## F. Organização e configurações

A organização documental envolveu 14 arquivos, incluindo dois relatórios arquivados, dez documentos existentes atualizados e dois documentos criados, o índice e este relatório.

- Dois arquivos foram movidos para `docs/archive/`, preservando o conteúdo histórico e corrigindo os links relativos.
- `docs/README.md` reúne arquitetura, desenvolvimento, segurança, operação e histórico.
- O README principal documenta o runtime RLS, os dois logins, a chave assinada, o caminho de migrations com `020`/`021`, o default de e-mail false e os comandos para validar as duas configurações.
- Os guias anteriores de implantação e segurança receberam indicação do estado histórico e referência à publicação posterior. Os relatórios visuais preservam os caminhos das evidências originais e registram quais HTMLs já estavam ausentes.
- Os três `.gitignore` foram mantidos. Backend e frontend também são empacotados separadamente, o que justifica regras nos respectivos diretórios. O `.vercelignore` mantém a exceção necessária ao teste de ícones executado no prebuild.
- O CI passou de 20 para 60 minutos. A execução completa anterior do E2E havia medido 32,6 minutos. O healthcheck especifica o usuário e o banco, e o workflow inclui a suíte de transições da flag e o E2E FALSE após a suíte completa.
- `graphify update .` atualizou o grafo por AST, de 2.033 para 2.038 nós, com 3.611 arestas. O Graphify preservou backup curado e os seis arquivos gerados ficaram fora dos commits de limpeza. O extrator SQL opcional continua ausente.

## G. Desempenho

A operação retirou das cinco pastas selecionadas 115.078.723 bytes, aproximadamente 109,75 MiB, em instalações e builds duplicados. Os arquivos continuam recuperáveis na Lixeira. Novas provas de validação e o cluster SCRAM foram mantidos na pasta de evidências.

O bundle de referência e o final são idênticos por caminho, tamanho e SHA-256, com 55 arquivos e 935.913 bytes. O build observado levou 8,151 segundos no baseline e 7,872 segundos na execução final. São amostras individuais realizadas durante outras tarefas locais, sujeitas à variação de carga.

Pool, consultas SQL, contexto RLS e os assets utilizados pela interface conservaram a configuração validada. A melhoria comprovada concentra-se na retirada de cópias geradas, na compatibilidade do runner com SCRAM e na organização das instruções operacionais.

## H. Segurança

Os testes de RLS verificaram 16 tabelas, grants, perfis A/B/admin, contexto assinado, rollback/reativação, timeout, replay e expiração. A integração confirmou dois logins distintos, privilégios sensíveis negados e zero linhas sem contexto. A checagem de integridade concluiu sem relações órfãs.

As suítes também exercitaram JWT, renovação/revogação de sessões, cookies, CSRF/CORS, limites, permissões administrativas, ownership e concorrência. As configurações e migrations de produção conservaram seus arquivos. Credenciais reais e dados pessoais ficaram fora dos commits.

A consulta remota desta tarefa foi de leitura. API Vercel `dpl_F4skRvEB6jxH8y9oVMSdTRcyK4nh` e frontend `dpl_7ThXBQFU3TsCPU2CvUuWFox1NEiU` estavam READY para `4e0f4ce`. Supabase `znpmzebrryqtjkgnvlcw` estava ACTIVE_HEALTHY em PostgreSQL 17.6, com 16 tabelas públicas sob RLS. O trabalho de limpeza foi realizado na branch local identificada no início deste relatório.

## I. Verificação de e-mail

`EMAIL_VERIFICATION_REQUIRED=false` permanece no exemplo e na configuração publicada consultada. A configuração SQL foi confirmada false. O GET público `/auth/config` respondeu HTTP 200 com `verificacaoEmailObrigatoria=false` às 18h11 UTC de 11/11/2026. Serviços Resend, rotas, tickets, geração/validação de códigos, telas, limites, tabelas, migrations e testes permanecem implementados.

A suíte de flag aprovou 11 grupos com FALSE, TRUE e transições. Cobriu cadastro, login, refresh, contas existentes, estado real de verificação, ausência de envio automático com false e falha fechada quando API/SQL divergem. A suíte histórica de e-mail obrigatório também passou com 26 grupos.

## J. Testes e evidências

Os comandos de banco usaram PostgreSQL 17.6 dedicado em loopback, fixtures sintéticas e os bancos aleatórios criados pelo runner. A URL administrativa local foi informada por `BOVITRACK_TEST_POSTGRES_URL`. Os arquivos `*-results.json` registram códigos de saída e duração.

| Comando ou verificação | Resultado |
| --- | --- |
| `npm audit --json` em backend e frontend | Baseline e final com zero vulnerabilidades de todas as severidades. |
| `npm ls --all --json` nos dois projetos | Saída 0, sem problemas de árvore. |
| `node --test tests/api.test.js tests/financas.test.js tests/icons.test.js`, no frontend | 11 testes aprovados antes e depois. |
| `npm run lint --prefix frontend` | Baseline e final aprovados. |
| `npm run build --prefix frontend -- --outDir ../outputs/limpeza-final-20261111/final-dist` | Aprovado, com prebuild de ícones. Comparação SHA-256 idêntica ao baseline. |
| `node scripts/test-isolated.cjs offline` | Baseline e final aprovados. |
| `node scripts/test-isolated.cjs rls` | Baseline local aprovado. Reprodução SCRAM anterior à correção falhou com o mesmo erro do CI. |
| `node scripts/test-isolated.cjs integration` em SCRAM | Aprovado após a correção. Inclui RLS, e-mail, auth/permissões, leite, receitas, bezerros, regressões, segurança e integridade. |
| `node scripts/test-isolated.cjs email` | Baseline e final aprovados, com 26 grupos e Resend mock. Execução final em SCRAM. |
| `node scripts/test-isolated.cjs email-flag` | 11 grupos aprovados. |
| `node scripts/test-isolation.cjs` | Guardas de destino, URL e protocolo aprovados. |
| `node scripts/test-supabase-homologacao-guard.cjs` | Aprovado sem conexão remota ou escrita de teste. |
| `node scripts/test-isolated.cjs e2e --grep-invert 'flag FALSE'` | 147/147 aprovados nas sete resoluções, 32,6 minutos, saída 0 e zero retries. |
| `BOVITRACK_TEST_EMAIL_REQUIRED=false`, seguido de `node scripts/test-isolated.cjs e2e email-optional.spec.js` | 7/7 aprovados nas sete resoluções, 1,6 minuto, saída 0 e zero retries. Execução em SCRAM. |
| Verificação estática de 208 arquivos JS/JSX/CJS | Zero declarações sem uso remanescentes e zero imports locais quebrados no escopo analisado. |
| `graphify update .` | Saída 0. Aviso preexistente de parser SQL opcional ausente. |
| `git diff --check -- . ':!graphify-out'` | Aprovado no escopo da limpeza. O relatório gerado do Graphify possui diferenças CRLF fora dos commits. |

Os 154 E2E concluíram com aprovação, incluindo as duas configurações de e-mail. As evidências foram preservadas em `outputs/limpeza-final-20261111/e2e-true-report/index.html`, `e2e-true-results/`, `e2e-false-report/index.html` e `e2e-false-results/`.

O GitHub Actions de `main` foi consultado em modo de leitura. O job de [execução 43062423324](https://github.com/CRH535/BoviTrack__Sistema-full-stack-para-gestao-pecuaria/actions/runs/43062423324) falhou antes do E2E com `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`. Esse erro foi reproduzido no cluster SCRAM local e corrigido no runner. As correções do workflow têm validação local e revisão do YAML. A execução do workflow atualizado no GitHub depende da publicação posterior dos commits.

## K. Skills

- Graphify apoiou a análise de relações e a atualização AST do grafo existente.
- Safe Refactor orientou alterações pequenas, preservação do comportamento e prova antes/depois.
- Investigate First orientou a investigação do CI a partir do log e a reprodução do erro SCRAM.
- Surgical Patch orientou a correção no runner responsável pela falha.
- Verify and Stop orientou os gates finais e o encerramento dentro do escopo.
- Supabase apoiou a conferência de leitura do ambiente publicado.

O catálogo foi revisado. As skills disponíveis atenderam ao trabalho. Foram instaladas zero skills. A análise Graphify ocorreu por AST local.

## L. Pendências e continuidade

- Publicar e executar o workflow corrigido no GitHub depende de uma etapa posterior de revisão/publicação. A última execução remota consultada continua sendo a falha descrita acima.
- Os candidatos com dados, backups, conhecimento curado e evidências relevantes continuam preservados na seção C.
- Alguns HTMLs e inventários das auditorias visuais antigas já estavam ausentes neste checkout. As capturas disponíveis e os resultados históricos foram preservados.
- O extrator SQL opcional do Graphify continua indisponível. As validações de RLS e SQL foram feitas contra PostgreSQL real.
- Os seis arquivos Graphify inicialmente modificados conservam snapshot anterior e permanecem como alterações locais geradas.

A limpeza local está validada para revisão e manutenção. As fontes da aplicação correspondem à versão publicada conferida. Os commits `6f8540e`, `af8f8d7` e `8f7d309` registram as alterações de testes, CI e documentação. Este relatório e a continuidade formam o registro final separado. Consulte [CODEX_CONTINUIDADE_RLS.md](CODEX_CONTINUIDADE_RLS.md) para retomar o trabalho.
