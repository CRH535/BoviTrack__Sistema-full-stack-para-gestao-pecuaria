# Auditoria do .gitignore — BoviTrack

Data: 11/11/2026. Branch preservada: `feat/rls-bovitrack`. HEAD preservado: `0402506f65de40b8d06f5f9a455d55276da8e1d8`. Nenhum commit, push, deploy, alteração de ambiente ou operação de banco foi executado nesta tarefa.

## Situação anterior

Foram examinados os três `.gitignore` do projeto: raiz, backend e frontend. Arquivos de exclusão de dependências e artefatos dentro de diretórios já ignorados não são configurações do projeto e não foram modificados. A análise incluiu os 409 arquivos rastreados, diretórios locais/ignorados, scripts npm, Vite/ESLint/Playwright, CI, migrations, ferramentas de agentes e empacotamento de release.

- A raiz não cobria uniformemente builds, logs, temporários, estado Vercel e arquivos de credenciais. Algumas regras existiam apenas no frontend/backend.
- Dependências e regras de ambiente se repetiam nos três arquivos. A inspeção do empacotador mostrou que parte dessa repetição é necessária, pois ele exporta os módulos sem o `.gitignore` da raiz.
- Sete nomes de relatórios, memória técnica, diagramas e dicionários de dados estavam bloqueados sem justificativa atual. Nenhum desses sete arquivos existe neste checkout; os bloqueios foram removidos para permitir documentação futura.
- `outputs/` já abrangia quatro regras específicas redundantes de evidências.
- 84 arquivos já ignorados continuavam rastreados: 74 caches e dez cópias históricas do Graphify.
- Outros três artefatos rastreados eram locais: dois arquivos com caminhos da máquina e um backup de hooks.
- O frontend ignorava indiscriminadamente arquivos `.sln`, `.njsproj` e qualquer extensão `sw?`; definições de projeto compartilháveis não devem ser bloqueadas como temporários.

## Alterações realizadas

### Raiz

Regras comuns centralizadas para `node_modules/`, `dist/`, `dist-ssr/`, `build/`, `.vite/`, `.cache/`, `.eslintcache` e `coverage/`; ambientes `.env`/`.env.*` com exceção para `.env.example`; logs npm/yarn/pnpm/lerna e arquivos temporários; `.DS_Store`, `Thumbs.db` e `Desktop.ini`.

Foram acrescentadas regras para chaves/containers `*.key`, `*.pem`, `*.p12`, `*.pfx` e dumps `*.dump`/`*.backup`. PEM é bloqueado por poder conter chave privada; um eventual PEM público compartilhado exige revisão e exceção pontual. Certificados públicos `.crt` não são bloqueados pela extensão. Não foi acrescentada regra genérica para SQL, JSON, imagens ou arquivos compactados.

Estado Vercel fica em `.vercel/`. Para Supabase, somente `**/supabase/.temp/` e `**/supabase/.branches/` são excluídos, conforme os [padrões publicados no repositório oficial](https://github.com/supabase/supabase/blob/master/.gitignore). Migrations, seed e config.toml continuam permitidos; nenhuma pasta Supabase inteira foi bloqueada.

Mantidos resultados Playwright e `/outputs/`; removidas as quatro exclusões redundantes de subpastas de outputs. Regras Graphify foram limitadas aos caches, backups datados e caminhos locais `.graphify_python`/`.graphify_root`. Em `.codex`, apenas scripts temporários `ui-*.cjs` e backups `*.graphify-bak` são excluídos. Hooks, skills, instruções, grafo atual, consultas e lições compartilhadas foram preservados.

Foram removidos os bloqueios de `SECURITY_AUDIT.md`, `SECURITY_AUDIT_PRE_LAUNCH.md`, `BOVITRACK_MEMORIA_ATUALIZADA_29-08-2026.md`, `DER_BOVITRACK.png`, `DICIONARIO_DADOS_BOVITRACK.png`, `DICIONARIO_DADOS_TCC.md` e `DICIONARIO_DADOS.md`.

### Backend e frontend

`backend/.gitignore` conserva dependências, ambientes e Vercel, além de `/backups/` (exportação gerada pelo migrador, potencialmente com dados privados) e `/certificates/` (configuração local de TLS).

`frontend/.gitignore` conserva dependências, builds, ambientes, Vercel, logs, preferências locais e arquivos de IDE, com a exceção compartilhável `.vscode/extensions.json`. Removidos os bloqueios de `.sln`, `.njsproj` e o curinga amplo `*.sw?`; swaps concretos `.swp`/`.swo` são tratados na raiz.

As proteções essenciais de cada módulo permanecem repetidas intencionalmente: `prepare-release-sources.cjs` exporta backend/frontend e `.vercelignore`, sem o `.gitignore` da raiz. Não se alterou o empacotador nem a configuração de deploy para eliminar essa repetição. Foram conferidas também as regras dos módulos em repositório temporário isolado, sem herdar as regras da raiz.

## Arquivos retirados somente do índice

Executado `git rm --cached -- <lista explícita de arquivos>`, após dry-run e confirmação de que cada caminho corresponde às regras de exclusão. Não foi usado `git rm -r --cached .`. Nenhum arquivo físico foi removido ou movido.

| Caminho/categoria | Quantidade | Motivo |
|---|---:|---|
| `graphify-out/cache/ast/**`, `cache/semantic/**`, `cache/last_query_stamp`, `cache/stat-index.json` | 74 | Caches regeneráveis e estado de consultas |
| `graphify-out/2026-09-04/{.graphify_labels.json,GRAPH_REPORT.md,cost.json,graph.json,manifest.json}` | 5 | Backup automático duplicado |
| `graphify-out/2026-10-01/{.graphify_labels.json,GRAPH_REPORT.md,cost.json,graph.json,manifest.json}` | 5 | Backup automático duplicado |
| `graphify-out/.graphify_python` | 1 | Caminho do interpretador da máquina |
| `graphify-out/.graphify_root` | 1 | Caminho local do checkout |
| `.codex/hooks.json.graphify-bak` | 1 | Cópia automática; hooks atuais preservados |
| **Total** | **87** | **Todos continuam presentes localmente, com SHA-256 igual ao anterior** |

A relação completa dos 87 caminhos e seus hashes está em `outputs/gitignore-audit/untracked-from-index.json`, evidência local ignorada pelo Git. Essa retirada será efetivada no versionamento pelo futuro commit que o usuário decidir criar; não apaga os objetos já existentes no histórico e não reduz retroativamente o tamanho dos clones.

## Segurança e preservação

Os 409 arquivos do índice anterior foram examinados sem exibir valores. A verificação comparou sete valores secretos locais conhecidos e procurou padrões de chaves privadas, tokens GitHub e chaves Resend. Não houve achados. Os dois `.env.example` foram preservados e passaram nessas verificações. O arquivo privado `backend/.env.homologacao` permanece ignorado e não foi modificado.

Trata-se de verificação do índice atual, não de varredura integral de todos os commits históricos nem prova de ausência de qualquer formato desconhecido de segredo. Nenhuma revogação/rotação foi indicada pelos achados desta tarefa; nenhum secret foi alterado.

Permanecem rastreados e fora das regras de exclusão **todos os outros 322 arquivos**, incluindo manifests/lockfiles, fontes, testes/fixtures, scripts operacionais, migrations/rollback, CI, configurações Vite/ESLint/Playwright/Vercel, exemplos de ambiente, documentação, assets e skills/hooks. O conteúdo dos oito arquivos previamente modificados foi conferido por hash e preservado, incluindo os dois caches agora locais e ignorados.

## Validação efetiva

| Verificação | Resultado |
|---|---|
| Inventário `git ls-files`, status e arquivos ignorados | 409 arquivos antes; 322 rastreados depois; 87 retiradas somente do índice |
| `git check-ignore -v --no-index` | Regras e exceções conferidas em caminhos representativos |
| Matriz de exclusão com `git check-ignore --no-index -z --stdin` | 56 casos de artefatos/segredos ignorados |
| Matriz de preservação com o mesmo comando | 322 arquivos rastreados + 21 exemplos de arquivos compartilháveis permitidos |
| Módulos exportados sem `.gitignore` da raiz | 13 casos ignorados e oito arquivos essenciais permitidos em repositório isolado |
| `git ls-files --cached --ignored --exclude-standard` | Zero arquivos rastreados correspondendo às exclusões |
| Hashes dos arquivos retirados | 87/87 presentes e idênticos |
| Hashes das alterações preexistentes | 8/8 preservados |
| `git diff --check -- .gitignore backend/.gitignore frontend/.gitignore` | Saída 0 |
| `git diff --cached --check` | Saída 0; índice contém exclusivamente as 87 retiradas planejadas |
| `git diff --check` integral | Saída 2 por 824 avisos preexistentes em `graphify-out/GRAPH_REPORT.md`, exatamente iguais aos da linha de base; nenhuma nova ocorrência |
| `npm run build --prefix frontend` | Saída 0, incluindo o prebuild de testes de ícones |
| Branch e HEAD | Inalterados |

Evidências locais: `outputs/gitignore-audit/baseline.json`, `security-before.json`, `validation.json`, `export-validation.json`, `untracked-from-index.json`, `diff-check-before.txt`, `diff-check-after.txt` e `frontend-build.log`. Não foi necessário repetir testes de banco/E2E: não houve mudança de código ou configuração de runtime, os arquivos de teste/CI/deploy continuam rastreados e o build passou.

## Estado final e próxima ação

Alterados somente os três `.gitignore` e acrescentado este relatório. Há 87 retiradas preparadas no índice e as modificações preexistentes do grafo permanecem preservadas. Não foi criado commit nem alterada a tag de release. O relatório e as regras estão disponíveis para revisão e eventual commit autorizado pelo usuário.

Skills aplicadas: Graphify para navegação, Surgical Patch e Ponytail/Entry Ponytail para limitar o escopo; orientações Supabase consultadas para separar caches CLI de migrations. Nenhuma skill foi instalada; não houve necessidade de Superpowers nem de recuperação de evidências Fast Jev nesta tarefa.
