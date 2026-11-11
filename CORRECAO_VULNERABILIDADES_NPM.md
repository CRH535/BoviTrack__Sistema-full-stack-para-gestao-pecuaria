# Correção de vulnerabilidades npm — BoviTrack

Data: 10/11/2026, America/Sao_Paulo.

## Resultado

**Etapa de segurança de dependências aprovada, com ressalva de um teste visual preexistente.** O npm audit completo passou de 2 para 0 ocorrências no backend e de 7 para 0 no frontend, incluindo as dependências de desenvolvimento. Foram eliminadas as 4 ocorrências altas e as 5 moderadas; nenhuma crítica estava presente. Build, lint, testes unitários e integração com PostgreSQL/RLS passaram. A seleção E2E teve 13 cenários aprovados e uma falha visual reproduzida também com o código e as dependências anteriores.

Essa aprovação é restrita às dependências e à compatibilidade exercitada. Zero alertas no npm audit não garante ausência de outras vulnerabilidades. Não houve push, merge, deploy, acesso ao Supabase de produção nem alteração de migrations/policies SQL.

## Estado inicial e escopo

- Repositório: `C:\Users\pfalg\Downloads\Bovitrack\BoviTrack__Sistema-full-stack-para-gestao-pecuaria\.worktrees\rls-bovitrack`.
- Branch confirmada: `feat/rls-bovitrack`.
- Base confirmada: `df038df2e189b2d6664b953a08c81fe836bf225b`.
- Node.js 24.15.0 e npm 12.0.2.
- Alterações anteriores em `graphify-out/`, o relatório de deploy não rastreado e os artefatos de `outputs/` foram preservados e não integram o commit desta correção.
- Somente os dois `package.json`, seus lockfiles e este relatório integram a alteração versionada. React, router, PostgreSQL, Resend, autenticação, código da aplicação, scripts de testes e SQL foram mantidos.

Foram executados separadamente em backend e frontend: `npm audit --json`, `npm outdated --json`, `npm ls --depth=0 --json` e `npm ls --all --json`. Os JSONs iniciais e finais estão em `outputs/npm-audit-20261110/`. As decisões usaram esses resultados atuais, não apenas a auditoria anterior de deploy.

## Diagnóstico inicial

Os totais abaixo são os registros de pacote do npm audit. Os três registros propagados de ESLint não representam três falhas independentes do minimatch. Um pacote, como Vite, também pode reunir vários advisories.

| Projeto / pacote | Versão anterior | Severidade npm | Identificador | Dependência de origem / caminho |
|---|---|---|---|---|
| Backend / body-parser | 2.3.0 | Alta | GHSA-27r3-jxmh-p828; CVE-2026-111181 | express 5.2.1 → body-parser |
| Backend / qs | 6.16.0 | Moderada | GHSA-6pq8-jhm2-2vcw | express → qs; express → body-parser → qs |
| Frontend / follow-redirects | 1.16.0 | Alta | GHSA-q3jh-wrc6-jgq8; GHSA-8r9p-f939-6h3c; GHSA-mrwp-f3q8-3g9p | axios 1.20.0 → follow-redirects |
| Frontend / vite | 8.2.2 | Alta no agregado | GHSA-698v-4r3x-3vcv; GHSA-r825-w8mm-5pxw; GHSA-587h-7wmj-h5pm; GHSA-9jrq-w75r-8gcw; GHSA-rq7h-c2jc-7f22; GHSA-vfpm-58rq-9qcg | Dependência direta de desenvolvimento/build |
| Frontend / zod | 4.4.3 | Alta | GHSA-mrhx-c7xc-m3w5; CVE-2023-54404 | eslint-plugin-react-hooks 7.1.1 → zod; também via zod-validation-error 4.0.2 |
| Frontend / minimatch | 10.2.6 | Moderada | GHSA-g3hv-75wg-m249; CVE-2026-118764 | eslint → minimatch; eslint → @eslint/config-array → minimatch |
| Frontend / @eslint/config-array | 0.23.5 | Moderada, propagada | GHSA-g3hv-75wg-m249 | Dependência de minimatch vulnerável |
| Frontend / eslint | 10.9.0 | Moderada, propagada | GHSA-g3hv-75wg-m249 | Dependência direta e indireta de minimatch vulnerável |
| Frontend / @eslint/js | 10.0.1 | Moderada, propagada | GHSA-g3hv-75wg-m249 | Relação com a instalação de eslint 10 afetada |

### Alcance e condições de exploração

- **body-parser:** afeta o runtime da API. `backend/app.js` utiliza `express.json` com inflação habilitada por padrão, antes das rotas/autenticação. Um corpo comprimido malformado pode causar encerramento do processo nas versões afetadas; o limite de 100 kB não substitui a correção. A versão corrigida mínima dessa linha é 2.4.0. Fonte primária: [advisory do body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).
- **qs:** está no runtime do Express, mas o advisory requer `qs.stringify` com `arrayFormat: 'comma'` e valores controlados por atacante. Não foi localizada essa chamada no código da aplicação. A presença do pacote não demonstra que a condição seja alcançável nesta API. Corrigido mesmo assim; mínimo 6.16.1. Fonte: [advisory do qs](https://github.com/ljharb/qs/security/advisories/GHSA-6pq8-jhm2-2vcw).
- **follow-redirects:** as falhas envolvem remoção de cabeçalhos sensíveis em redirecionamentos HTTP do adaptador Node. O BoviTrack usa Axios no SPA de navegador; o mapa `browser` do Axios substitui o adaptador HTTP Node, sem SSR neste projeto. O alerta não comprova esse vazamento no navegador, mas afeta a árvore instalada e eventual uso Node. A atualização adotada resolve os três avisos; mínimo 1.16.2 para o conjunto. Fonte: [advisory do mantenedor](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p). Esse aviso específico tem classificação moderada na página do mantenedor; o npm audit recebido classificava o pacote e seus três avisos como high. Foram preservadas as classificações e fontes, sem rebaixar o gate.
- **Vite:** problemas de servidor de desenvolvimento, middleware de abertura de editor, caminhos e arquivos. O BoviTrack está em Windows, portanto os avisos específicos desse sistema merecem atenção. Não se trata de um servidor Vite executando no runtime do bundle estático publicado. Corrigidos mantendo Vite 8.2; mínimo 8.2.4 nos avisos encontrados, instalada 8.2.6. Referência: [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
- **Zod:** chega pelo lint do React Hooks, sem import direto da aplicação. A falha envolve consumo de memória ao validar coleções grandes. Neste projeto a exposição é da ferramenta de desenvolvimento, não de validação de payloads do Express. Corrigido dentro da linha 4, acima do mínimo 4.6.6. Referência: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
- **minimatch:** envolve amplificação de padrões glob controlados por atacante, especialmente otimização de nível 2. Seus únicos consumidores nesta árvore são ESLint e @eslint/config-array, usados no lint. Não há glob vindo de usuário HTTP. Não existe versão 10 corrigida no registro consultado: a linha termina em 10.2.6; o advisory indica correção em 11.0.1. Fonte: [advisory do minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).

## Correções implementadas

| Pacote | Versão anterior instalada | Nova versão instalada/lock | Tipo | Resultado |
|---|---|---|---|---|
| express | 5.2.1 | 5.3.0 | Minor, mesma major | Atualizado o pai das dependências HTTP; manifesto `^5.3.0` |
| body-parser | 2.3.0 | 2.4.0 | Minor transitiva | Alerta alto eliminado |
| qs | 6.16.0 | 6.17.1 | Minor transitiva | Alerta moderado eliminado; uma cópia compartilhada |
| axios | 1.20.0 | 1.21.1 | Minor, mesma major | Pai atualizado; manifesto `^1.21.1` |
| follow-redirects | 1.16.0 | 1.16.3 | Patch transitiva | Três advisories eliminados |
| vite | 8.2.2 | 8.2.6 | Patch, mesma linha 8.2 | Alertas eliminados; manifesto `^8.2.6` |
| eslint | 10.9.0 | 10.14.0 | Minor, mesma major | Versão atual compatível, sem downgrade; manifesto `^10.14.0` |
| minimatch | 10.2.6 | 11.0.7 | Major transitiva por override | Falha e três registros propagados eliminados |
| zod | 4.4.3 | 4.6.7 | Minor transitiva | Alerta alto eliminado, sem adicionar dependência direta |
| @eslint/config-array | 0.23.5 | 0.23.5 | Sem troca de versão | Registro propagado eliminado pelo minimatch corrigido |
| @eslint/js | 10.0.1 | 10.0.1 | Sem troca de versão | Registro propagado eliminado pela árvore corrigida |

O `eslint-plugin-react-hooks` 7.1.1 já é a versão mais recente consultada e aceita Zod 3 ou 4. Atualizou-se a resolução de Zod dentro da major 4 existente, sem override e sem forçar nova major do plugin.

As atualizações trouxeram dependências internas esperadas: content-type/content-disposition do Express, rolldown/bindings do Vite, e cache/plugin-kit do ESLint. As majors transitivas de content-type/content-disposition e dos caches foram escolhas dos respectivos pais atualizados, sem chamadas diretas da aplicação a essas APIs. O diff completo das versões, novas entradas, deduplicações e integridades está em `outputs/npm-audit-20261110/lock-review.json`.

### Justificativa e limite do override

`frontend/package.json` contém apenas:

```json
"overrides": {
  "minimatch": "11.0.7"
}
```

Atualizar somente o pai não basta: ESLint 10.14.0 e @eslint/config-array 0.23.5 continuam declarando minimatch `^10.2.6` e `^10.2.4`. Não foi aplicado o downgrade para ESLint 9 sugerido pelo audit. A única troca de major deliberadamente forçada é minimatch, confinada à ferramenta de lint na árvore atual, com versão exata para permitir revisão.

O diff/changelog oficial de minimatch 10→11 foi examinado. A versão 11 remove `makeRe`, `regexp`, `AST` e métodos internos, e muda a representação de `Minimatch.set`. Os consumidores desta instalação usam o construtor `Minimatch` e `.match`, que permanecem disponíveis; não dependem das APIs removidas. O matcher também muda casos de segmentos vazios, parcial e caminhos Windows, por isso a compatibilidade não foi presumida apenas pela assinatura.

Provas executadas:

1. Comparação, antes/depois, de todas as regras resolvidas, globais e decisões de ignore para oito classes: App JSX, serviço JS, teste unitário, teste E2E, Vite config, Playwright config, `dist/` e `node_modules/`. Resultados idênticos.
2. Um trecho com variável não utilizada continuou gerando `no-unused-vars` pelo ESLint real; nenhuma regra foi desativada para passar.
3. `npm run lint` passou no projeto inteiro.
4. Os dois consumidores resolvem exatamente o mesmo arquivo de minimatch 11.0.7; existe apenas uma cópia no lockfile final.

Evidências: `eslint-scope-before.json`, `eslint-scope-after.json` e `minimatch-11-upstream-diff.json`. A justificativa é específica desta árvore e das classes de arquivo exercitadas; não afirma compatibilidade universal de minimatch 11 com consumidores futuros. Reavaliar/remover o override quando o ESLint adotar uma versão corrigida nativamente.

## Instalação e revisão dos lockfiles

Operações de resolução executadas, sempre sem `--force` e sem `--legacy-peer-deps`:

```text
npm install --prefix backend --package-lock-only --ignore-scripts --no-audit express@5.3.0
npm update --prefix backend body-parser qs --package-lock-only --ignore-scripts --no-audit
npm install --prefix frontend --package-lock-only --ignore-scripts --no-audit axios@1.21.1
npm install --prefix frontend --save-dev --package-lock-only --ignore-scripts --no-audit vite@8.2.6 eslint@10.14.0
npm update --prefix frontend zod --package-lock-only --ignore-scripts --no-audit
npm update --prefix frontend minimatch --package-lock-only --ignore-scripts --no-audit
```

Após preservar os diretórios anteriores, foram feitas instalações novas com `npm ci --prefix backend --ignore-scripts --engine-strict --no-audit` e o equivalente para frontend. O uso temporário de `--no-audit` apenas separou a instalação da auditoria explícita completa executada em seguida; nenhum gate de segurança foi removido. `--ignore-scripts` impediu execução automática de lifecycle scripts durante a instalação inspecionada; não alterou scripts do projeto ou CI.

- `npm ci` com `--engine-strict` passou no Node 24 nos dois projetos.
- `npm ls --all` e `npm ls --depth=0` terminaram com código 0: nenhuma árvore inválida, dependência ausente ou peer dependency incompatível reportada.
- Os lockfiles permanecem na versão 3, com URLs `https://registry.npmjs.org/` e integridades presentes nas entradas novas/alteradas. Nenhuma origem Git/local/remota inesperada foi introduzida.
- Nenhum pacote do lockfile final está marcado como deprecated. Isso não é garantia de manutenção de todo pacote; não foi identificada necessidade de substituição de stack nesta correção.
- O único `hasInstallScript` no frontend é `fsevents`, opcional e exclusivo de macOS, já presente antes; não foi instalado no Windows. O backend não tem pacote marcado com lifecycle de instalação. Nenhum script suspeito novo foi identificado nas entradas examinadas.
- O backend terminou sem nomes de pacote duplicados. No frontend, Zod e minimatch são compartilhados; permanecem duas majors de eslint-visitor-keys e duas de hookified requeridas por pais distintos da ferramenta de lint. Não foram forçadas versões incompatíveis para remover essas duplicações legítimas.
- `npm outdated` continua listando atualizações não relacionadas à correção. Ele retorna 1 quando há pacotes desatualizados, não quando comprova falha funcional. Foram preservadas, por exemplo, as versões atuais de React, PostgreSQL/pg, Resend e dotenv; não se aplicou a major nova do dotenv. Vite 8.3 está disponível, mas foi mantida a correção patch 8.2.6 validada.

Não foram excluídos manualmente arquivos. Os `node_modules` anteriores e a instalação intermediária foram movidos e preservados em `C:\Users\pfalg\AppData\Local\BoviTrack\dependency-backups\20261110-rls`. As cópias iniciais dos manifests e lockfiles também estão nas evidências locais.

## Testes e resultados reais

| Comando/verificação | Resultado |
|---|---|
| `npm ci --ignore-scripts --engine-strict` por projeto | PASSOU, instalações novas a partir dos lockfiles |
| `npm run lint --prefix frontend` | PASSOU, código 0 |
| `npm test --prefix frontend` | PASSOU, 11 testes |
| `npm run build --prefix frontend` | PASSOU, Vite 8.2.6, 178 módulos; prebuild incluiu dois testes de ícones/assets |
| Comparação de configuração ESLint para oito classes + probe `no-unused-vars` | PASSOU, configuração efetiva preservada |
| `node scripts/test-isolated.cjs offline` | PASSOU após atualizar o backend: segurança, cálculos de manejo, clima, exclusões, regressões HTTP e 9 testes frontend; estes também estão cobertos pelo `npm test` final com as dependências frontend novas |
| `node scripts/test-isolation.cjs` | PASSOU: URLs externas, protocolo e parâmetros de override recusados antes de conectar |
| `node scripts/test-isolated.cjs integration` | PASSOU, código 0, PostgreSQL 18.4 descartável |
| Suíte RLS incluída na integração | PASSOU: 16 tabelas, grants, A/B/admin, contexto assinado, timeout, replay e expiração |
| Verificação de e-mail incluída na integração | PASSOU, 26 grupos, Resend mock e PostgreSQL real |
| Autorização HTTP | PASSOU, 141 verificações |
| Produção leiteira / receitas | PASSOU, 24 / 16 verificações |
| Pesagens/desmamas | PASSOU, 18 verificações |
| Regressões backend integradas | PASSOU, 13 verificações |
| Rollback/reaplicação RLS, schema, grants e órfãos | PASSARAM no banco descartável |
| E2E selecionado, comando abaixo | 13 PASSARAM; 1 FALHOU, preexistente e reproduzido na baseline |
| `npm audit --audit-level=high` por projeto | PASSOU em ambos, código 0 |
| `npm audit --json` completo por projeto | PASSOU em ambos, zero em todas as severidades |
| `npm ls --depth=0` e `npm ls --all` por projeto | PASSARAM em ambos, código 0 |
| `npm outdated --json` por projeto | Executado e registrado antes/depois; atualizações não relacionadas permaneceram disponíveis |
| `git diff --check` nos arquivos alterados | PASSOU |

E2E executado com as dependências finais:

```text
node scripts/test-isolated.cjs e2e bovitrack.spec.js email-verification.spec.js navigation-images.spec.js --project=1366x768 --project=390x844 --reporter=list
```

Passaram os 12 cenários de cadastro, login, refresh/F5, cookies, logout, conta antiga e verificação de e-mail, bloqueios por URL/storage, dashboard com recuperação de erro, propriedade/animal, pesagem, modo escuro e navegação, nas duas resoluções. A auditoria de miniaturas/menu passou em 390×844 e falhou em 1366×768. A suíte completa de sete resoluções não foi executada.

### Falha visual preexistente, mantida visível

O teste `navigation-images.spec.js:72` espera altura de linha de 42 px e reportou `altura da linha` em 13 itens do menu desktop, na etapa `admin-light-dashboard`. A aplicação e o teste não foram alterados para ocultar o resultado.

Para determinar se a atualização causou regressão, exportou-se `git archive df038df` para `C:\Users\pfalg\AppData\Local\BoviTrack\dependency-baselines\npm-20261110`, com junctions para os `node_modules` originais preservados. Nesse código e árvore antigos, executou-se o mesmo teste desktop:

```text
node scripts/test-isolated.cjs e2e navigation-images.spec.js --project=1366x768 --reporter=list
```

Ele também terminou com código 1, na mesma etapa, linha e com os mesmos 13 itens. Uma comparação programática dos detalhes das duas falhas confirmou igualdade. Logo, essa falha já existia antes da correção npm; não foi classificada como regressão introduzida pela atualização. A divergência entre CSS e expectativa visual permanece como pendência separada. Não se afirma que toda a suíte E2E passou.

### Isolamento

Todas as escritas de testes ocorreram em bancos aleatórios `bovitrack_test_*`, no cluster local `127.0.0.1:55439`. O runner cria e remove somente esses bancos e suas roles exclusivas; Resend foi mockado, sem envio externo. A baseline usou o mesmo mecanismo protegido. Ao final não restaram bancos de teste, e o cluster usado foi parado. Não se acessou o Supabase nem a Vercel nesta tarefa.

## Auditoria antes/depois

| Projeto | Críticas antes → depois | Altas antes → depois | Moderadas antes → depois | Baixas/info antes → depois | Total antes → depois |
|---|---|---|---|---|---|
| Backend | 0 → 0 | 1 → 0 | 1 → 0 | 0 → 0 | **2 → 0** |
| Frontend | 0 → 0 | 3 → 0 | 4 → 0 | 0 → 0 | **7 → 0** |
| Total | 0 → 0 | **4 → 0** | **5 → 0** | 0 → 0 | **9 → 0** |

Auditorias completas, sem `--omit=dev`. Nenhuma vulnerabilidade reportada permanece na árvore final consultada. As informações descrevem o registro npm consultado nesta data e devem ser verificadas novamente em futuras releases.

## Compatibilidade e preservação

React/React DOM 19.2.8, router 7.18.2, pg 8.23.0, Resend 6.33.0, bcrypt/JWT e as configurações do banco permanecem nas versões anteriores. Express continua na major 5, Axios na 1, Vite na 8.2 e ESLint na 10.

Não houve mudança nos executores transacionais, contexto RLS assinado, pools, JWT, cookies HttpOnly, refresh tokens, rate limiting, autorização, funções de cadastro/e-mail, migrations ou policies. Os fluxos funcionais passaram no PostgreSQL isolado com os dois logins e RLS ativo. O runtime da aplicação e os testes foram preservados byte a byte segundo o diff Git; nenhuma adaptação de código foi necessária.

O `graphify update .` foi executado com saída 0, sem LLM, conforme AGENTS.md. Recriou o grafo de código e preservou backup dos artefatos curados em `graphify-out/2026-11-10/`. Houve aviso de ausência de `tree_sitter_sql` e de rótulos de comunidades a atualizar. Como nenhum SQL foi alterado e havia alterações do grafo anteriores à tarefa, esses artefatos continuam locais e fora do commit de dependências. Não foram instalados extratores ou feitas mudanças adicionais para tratar avisos fora deste escopo.

## Skills

- **Graphify:** navegação inicial por dependências/autenticação/testes e atualização AST após as mudanças.
- **Ponytail / Entry Ponytail:** limitar a correção aos manifests e lockfiles, reutilizando os testes existentes.
- **Investigate First:** rastrear os pais das dependências e comparar a falha visual com a baseline antes de atribuir causalidade.
- **Verify and Stop:** conferir os critérios com auditoria completa, instalações válidas e regressões relevantes, sem refatorações adicionais.
- As suítes Playwright já existentes foram executadas pelo runner isolado do projeto. Não se criou uma nova infraestrutura de testes.

Nenhuma skill foi instalada. Superpowers não consta no catálogo disponível, e as ferramentas existentes cobriram as necessidades desta tarefa.

## Pendências e próxima fase

1. Resolver separadamente a divergência preexistente de altura das linhas no teste visual desktop; ele continua falhando, sem ser desativado ou enfraquecido.
2. Revisar o override minimatch quando ESLint/@eslint/config-array passarem a aceitar uma versão corrigida nativamente. Sua compatibilidade foi demonstrada neste projeto, não para APIs removidas ou consumidores futuros.
3. As dependências ainda disponíveis em `npm outdated` não geraram alertas no audit final e não foram atualizadas sem necessidade.
4. A etapa de dependências não elimina os pré-requisitos de homologação/banco descritos no relatório de deploy anterior. Não autoriza migrations, RLS, push ou produção.

Não foi identificada incompatibilidade funcional introduzida pelas atualizações nos checks executados. A ressalva E2E está explicitamente documentada, e não é substituída por uma afirmação genérica de testes aprovados.

## Evidências e controle de versão

`outputs/npm-audit-20261110/` contém auditorias, outdated, árvores de dependências, manifests/locks iniciais, revisão do lockfile, configuração ESLint antes/depois, logs de integração, E2E e baseline, e `baseline-comparison.json`.

Foi preparado um commit local lógico com a mensagem `FIX: corrige vulnerabilidades npm do frontend e backend`. O SHA deve ser consultado com `git log -1`; o relatório não inclui o próprio hash para evitar autorreferência. O commit contém apenas este relatório e os quatro arquivos npm. Nenhum segredo, `.env`, backup, artefato de teste, grafo preexistente ou relatório de outra tarefa foi incluído. Não houve push ou merge para main.
