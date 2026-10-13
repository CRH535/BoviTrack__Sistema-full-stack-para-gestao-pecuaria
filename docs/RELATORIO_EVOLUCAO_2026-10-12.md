# BOVITRACK — RELATÓRIO DE EVOLUÇÃO

Data: 12 de outubro de 2026. Base investigada: `main`, commit `bfa8081`.
Escopo: evolução incremental local, preservando React/Vite/Axios, Express/CommonJS,
`pg` e PostgreSQL. Nenhum push, deploy ou alteração de banco de produção.

## 1. Diagnóstico inicial

A investigação começou por Graphify, estrutura, documentação, histórico e testes
existentes. O sistema já tinha refresh rotativo, autorização no backend, proteção
CSRF, rate limit persistido, receitas, leite e manejo; essas estruturas foram
mantidas. Os problemas confirmados incluíam corridas entre refresh/logout e
desativação, aceitação de IDs por coerção, perda de associações no histórico de
peso, edição concorrente de desmama concluída, falsos zeros financeiros quando
o schema de receitas estava ausente e respostas antigas no frontend.

Havia dependências de `backend/node_modules` versionadas, páginas carregadas
todas no JavaScript inicial, formulários sem labels associados e modal sem a
contenção nativa de foco. O copiador legado do banco não abrangia os módulos
atuais. Foram distinguidos defeitos demonstrados, riscos condicionais e melhorias
opcionais; não se reescreveram módulos por preferência de estilo.

## 2. Arquitetura

React Router organiza a SPA; Axios acessa rotas Express sem prefixo global
`/api`. O backend aplica autenticação, perfil e ownership, usa services para
transações e consultas parametrizadas pelo pool `pg`. Propriedades e vacinas
pertencem ao usuário; registros relacionados herdam o escopo. Supabase é
PostgreSQL hospedado, sem Supabase Auth ou Data API no fluxo da aplicação.

O access token fica em memória; o cookie HttpOnly transporta refresh opaco,
cujo hash e revogação são persistidos. `app.js` exporta a aplicação e `server.js`
inicia o servidor local. Vercel continua sendo a hospedagem documentada, com
frontend e backend separados. Não foi validado um ambiente remoto nesta missão.

## 3. Alterações realizadas

| Categoria | Entrega |
| --- | --- |
| Sessão | Geração de sessão no cliente, descarte de respostas obsoletas, proteção entre contas e locks de revogação. |
| API | IDs e números estritos, allowlists de corpo, limites compatíveis com schema e ownership antes de validar vínculos. |
| Banco | Migration 012 transacional, sete índices, verificações de integridade ampliadas e proteção do copiador legado. |
| Interface | Lazy loading, ErrorBoundary, estados de erro/carregamento, formulários semânticos, modal nativo e ajustes de tutorial/gráfico. |
| Validação | Regressões offline e reais de concorrência, runner descartável, E2E em sete viewports e workflow CI. |
| Repositório | Retirada de dependências geradas do versionamento e documentação atualizada. |

## 4. Bugs corrigidos

| Causa | Correção |
| --- | --- |
| Refresh resolvia depois de logout ou novo login. | Cada operação captura a geração; tokens/respostas de uma geração antiga são descartados. |
| Cookie de outra conta podia renovar JWT sob identidade antiga da interface. | Refresh compara o usuário ativo; divergência encerra a sessão local. Login comunica mudança às outras abas. |
| Paginação podia combinar páginas de contas diferentes ou truncar silenciosamente. | Verificação de geração em toda a composição; limite de 10 mil gera erro explícito. |
| Logout via hash antigo não encontrava sessão já rotacionada. | Transação resolve hash atual ou usado e bloqueia a sessão antes de revogar. |
| Reativar usuário permitia reaproveitar sessões antigas. | Desativação revoga sessões na mesma transação; reativar não remove revogação. |
| Edição de desmama lia status antes de lock. | Lock e revalidação de status/ownership dentro da transação; conflito retorna 409. |
| `DISTINCT` descartava lotes do animal no resumo de peso. | Agregação preserva todas as associações. |
| Ausência do schema de receitas era apresentada como zero. | Totais indisponíveis são `null` e sinalizados; zero real continua zero. |
| Troca de ficha/filtros podia aplicar resposta de consulta anterior. | Remontagem por ID e descarte/cancelamento de consultas obsoletas. |
| Proteção de mãe não cobria sexo NULL/referência só em desmama. | Triggers da 012 cobrem ambos e bloqueiam a mãe durante novas referências. |
| Trigger novo podia interromper cascata de exclusão. | Permite atualização interna quando o animal já está em cascata; FK continua recusando vínculo inválido normal. |
| Tutorial ficava sem saída com alvo ausente. | Fallback com Pular/Sair e Escape. |
| API devolve evolução em ordem inversa e a área do gráfico cruzava. | Cópia cronológica e fechamento nas coordenadas reais das extremidades, inclusive quando há um só ponto. |

## 5. Segurança

Foram revisados auth, CSRF, CORS exato, cookies, exposição de variáveis VITE,
perfil administrativo, transações, validação, agregações e logs. As proteções
existentes de JWT (algoritmo, issuer, audience, expiração), rate limit, corpo
JSON, segredo forte e TLS de produção permanecem, com regressões passando.

| Caminho de ataque ou falha | Tratamento e evidência |
| --- | --- |
| IDs de terceiros ou vínculo cruzado | Ownership aplicado antes de validar relações; suíte de permissões e regressões HTTP. |
| Alteração de perfil pelo cadastro público | Perfil `usuario` imposto no backend; campos legados de privilégio são ignorados, outros desconhecidos recusados. |
| Token anterior após logout/desativação | Locks, revogação persistida, geração no cliente e teste de concorrência real. |
| CSRF/rotação/replay | Origem validada e replay revoga família; suíte existente mantida. |
| Confusão de identidade entre abas | Broadcast de mudança e validação do ID retornado pelo refresh. |
| URL de teste aparentemente local com `?host=` remoto | Runner e guard recusam query/hash antes de conectar; teste de isolamento dedicado. |
| Migração parcial apagando histórico por omissão | Copiador legado recusa schema ampliado antes de acessar destino. |

`npm audit --audit-level=high` retornou **0 vulnerabilidades** em backend e
frontend. A revisão local de secrets examinou 162 arquivos atuais e 416 blobs
históricos em 43 commits: não encontrou valores reais reconhecidos pelos
padrões usados; exemplos foram classificados sem publicar credenciais. Isso
não certifica ausência de qualquer segredo nem substitui rotação de valores
anteriormente expostos. Arquivos `.env` reais não foram copiados para documentos.

## 6. Frontend

As páginas são importadas sob demanda, com Suspense e ErrorBoundary recuperável.
Os formulários principais têm labels ligados aos campos, limites coerentes,
feedback e controles desabilitados durante envio. Dashboard distingue erro,
carregamento e indisponibilidade de receitas; oferece tentativa novamente e
mostra os totais já calculados no backend. A identidade BoviTrack, assets,
temas e animação existente foram preservados. E2E usa movimento reduzido; o
tempo visual da animação completa não é coberto automaticamente.

## 7. Backend

Foram endurecidas validações comuns e rotas de propriedades, animais, lotes,
pesagens, desmamas, despesas, receitas e vacinação. IDs aceitam somente formato
decimal inteiro positivo no limite PostgreSQL INTEGER; booleanos, arrays,
hexadecimais e notação exponencial são recusados. Valores numéricos devem ser
finitos e respeitar limites. UF segue lista válida; nascimento futuro considera
`APP_TIMEZONE`. Erros esperados de constraints são traduzidos sem expor SQL.

Despesas, receitas e vacinações verificam posse do registro antes dos vínculos.
Desmamas e usuários usam transações para preservar invariantes concorrentes.
O pool possui listener de erro de conexão ociosa com log sanitizado. Datas de
resumo/alertas consultam o fuso configurado, sem depender do fuso do servidor.

## 8. Banco

`012_integridade_parentesco_indices.sql` substitui funções/trigger de parentesco
e cria índices de propriedades, lotes, despesas, vacinação, relações de lotes e
mães de desmama. Não reescreve linhas de negócio. A reaplicação foi exercitada em
banco descartável. `db:check` agora verifica 15 tabelas esperadas, referências,
propriedade/usuário, mães e sequences em snapshot de leitura.

A revisão reproduziu e corrigiu a interação entre `ON DELETE CASCADE` e
`ON DELETE SET NULL`. Foram exercitados com rollback: mãe com sexo inválido ou
NULL, mãe citada só em desmama, exclusão de família/propriedade e FK inválida.
Não se aplicou migration em base de negócio existente ou remota, somente em
bancos descartáveis de teste; históricos existentes
inconsistentes devem ser tratados separadamente após backup.

## 9. Performance

No build local, o JavaScript de entrada passou de **443,02 kB / 126,59 kB gzip**
para **316,58 kB / 103,43 kB gzip**: redução de aproximadamente 28,5% no tamanho
original e 18,3% comprimido. Páginas adicionais continuam baixadas conforme uso;
isso não representa a redução de todo o tráfego da aplicação. Consultas contam
com sete índices alinhados aos filtros/joins existentes. Não houve benchmark de
latência/carga em produção nem EXPLAIN com volume representativo.

A imagem hero do login permanece com aproximadamente 2,4 MB no build; compressão
e formatos modernos ficam como melhoria opcional, preservando o asset original.

## 10. Responsividade

O Playwright define 1920×1080, 1366×768, 1024×768, 768×1024, 430×932, 390×844
e 360×800. A suíte verifica navegação, Dashboard, formulários, ficha, tema
escuro e largura do documento; capturas de Dashboard claro e ficha escura são
geradas por viewport. Resultados finais constam na seção 12.

Não foi simulado um dispositivo físico, toque real, Safari ou Firefox. A revisão
visual é por capturas Chromium e não constitui auditoria de todos os estados.

## 11. Acessibilidade

Labels/id/htmlFor nos formulários, nomes acessíveis na navegação compacta,
skip-link, estados `status`/`alert`, foco visível e ajustes de contraste no
gráfico/tema escuro. O `<dialog>` nativo contém foco, torna fundo inerte,
aceita Escape e devolve foco ao botão que o abriu; teclado está coberto no E2E.
Tutorial possui saída mesmo sem alvo. Movimento reduzido permanece respeitado.
Não foi realizada certificação WCAG ou sessão com leitor de tela.

## 12. Testes

| Execução | Resultado |
| --- | --- |
| Frontend ESLint e build Vite | Passaram. |
| Auditoria npm backend/frontend | 0 vulnerabilidades nos dois. |
| Offline existente | 13 grupos de segurança; 5 grupos de cálculo/manejo; clima e impacto de exclusões passaram. |
| Regressões offline backend | Validação HTTP, ownership, sessão rotacionada e revogação passaram. |
| Cliente HTTP (`node --test`) | 6 testes passaram, incluindo paginação entre contas e cookie com identidade divergente. |
| Integração PostgreSQL | 141 auth/permissões + 24 leite + 16 receitas + 18 manejo + 13 regressões = **212 verificações passaram**. |
| Integridade | Checker de 15 tabelas e checker de exclusões passaram em banco criado pelo runner. |
| Guard de testes | Hosts remotos e query que substitui host/porta recusados antes da conexão. |
| Playwright | 28 cenários passaram; detalhes abaixo. |

**Playwright: 28/28 passaram**, quatro cenários em cada um dos sete viewports,
sem retries (3,4 minutos). Após ajuste visual do preenchimento do gráfico,
o cenário de navegação/ficha foi repetido para conferir as capturas finais.
Essa repetição passou **7/7** (53,5 segundos), com a área do gráfico corrigida
e sem overflow nos sete tamanhos. Capturas claras/escuras desktop e mobile foram
inspecionadas diretamente.

O E2E contém quatro cenários por viewport: cadastro/login/F5/cookie
HttpOnly/logout/novo login; navegação/tema/ficha/overflow/erros JavaScript;
cadastro real de propriedade/animal/pesagem e modal por teclado; falha explícita
do Dashboard com recuperação sem totais fictícios. Dados de negócio e auth
usam Express/PostgreSQL reais. Clima externo é respondido com 503 explícito para
não depender de disponibilidade externa. O caso de erro do Dashboard intercepta
somente esse endpoint durante o cenário.

As falhas intermediárias de E2E foram investigadas: seletor de botão de cadastro,
espera da página antes de preencher campo, preview vazio de propriedade e
seletor de mensagem de pesagem. Não se mascararam falhas com retries. Relatório
HTML, traces de falha e capturas ficam ignorados em `frontend/`.

A integração foi repetida durante a divergência de datas UTC/São Paulo. A fixture
de receitas usava UTC e criava lançamento considerado futuro pelo filtro; foi
corrigida para `dataHojeNoFuso()` e as 212 verificações passaram novamente.

O workflow foi preparado e seus comandos foram exercitados localmente; ainda não
foi executado no GitHub. As execuções locais não comprovam o ambiente Ubuntu da CI.

## 13. Skills utilizadas

**Graphify**: consulta inicial do grafo e atualização AST ao final (1212 nós,
2044 relações no update final). O parser opcional `tree_sitter_sql` não está
instalado; os 16 arquivos SQL não foram extraídos nesse update e foram revisados
diretamente, com migrations exercitadas no PostgreSQL. Revisão,
investigação de documentação, análise de caminhos de ataque, scan de secrets,
diff e Playwright foram realizados diretamente com as ferramentas disponíveis.
As skills `frontend-design`, `code-review`, `find-docs`, `playwright-cli`,
`security-scan`, `security-diff-scan`, `attack-path-analysis` e
`api-design-principles` não estavam disponíveis nesta sessão e não são listadas
como utilizadas. Houve divisão explícita de investigação/implementação/revisão
entre agentes de frontend, backend e banco, conforme solicitado.

Documentação primária consultada para os pontos técnicos: [React ErrorBoundary](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary),
[Axios](https://axios-http.com/docs/req_config), [Playwright](https://playwright.dev/docs/test-webserver),
[PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html),
[node-postgres pool](https://node-postgres.com/apis/pool),
[checkout v7](https://github.com/actions/checkout/tree/v7) e
[setup-node v7](https://github.com/actions/setup-node/tree/v7).

## 14. Arquivos principais modificados

| Grupo | Finalidade |
| --- | --- |
| `frontend/src/auth/AuthContext.jsx`, `services/api.js` | Sessão em memória, restauração, concorrência e isolamento entre contas. |
| `frontend/src/App.jsx`, `components/AppErrorBoundary.jsx` | Rotas lazy e recuperação de erro de renderização. |
| `frontend/src/pages/`, `components/`, `index.css` | Formulários, estados, ficha, acessibilidade, gráfico, tutorial e modal. |
| `backend/routes/`, `utils/validacoes.js` | Validação consistente, ownership e tratamento de erros. |
| `backend/services/sessoes.js`, `usuarios.js` | Rotação/logout/desativação sob locks e revogação transacional. |
| `backend/database/`, `backend/scripts/` | Migração incremental, listener do pool e diagnóstico/cópia segura. |
| `backend/tests/`, `frontend/tests/`, `scripts/` | Regressões e runner de integração/E2E isolado. |
| `.github/workflows/ci.yml`, package/lock, `.gitignore`, README | Automação, dependência de teste, higiene e execução documentada. |

## 15. Migrations

Criada somente **012_integridade_parentesco_indices.sql**; migrations antigas
foram preservadas. Aplicação manual pela conexão administrativa
`SUPABASE_MIGRATION_URL` via `npm run migrate:integrity`; nunca no startup.
Pré-condições, locks e reversão estão em
[INTEGRIDADE_012.md](../backend/database/INTEGRIDADE_012.md).
Faça backup, confira inconsistências com `db:check`, planeje janela e valide após
aplicar. Índices normais podem bloquear escritas enquanto são criados.

## 16. Variáveis de ambiente

Nenhuma variável nova é exigida pelo runtime de produção. O frontend mantém
somente `VITE_API_URL` como configuração documentada, sem secrets. O script
administrativo usa a variável existente `SUPABASE_MIGRATION_URL` separada do
runtime. O runner aceita a variável nova e opcional
`BOVITRACK_TEST_POSTGRES_URL` para uma conexão administrativa **local de testes**;
padrão `127.0.0.1:55432/postgres`. As demais flags E2E são internas, definidas
pelo runner. `APP_TIMEZONE`, TLS/CA, cookies e origens continuam documentados.

## 17. Problemas não resolvidos

- A cópia completa de uma base moderna para Supabase ainda precisa de um fluxo
  de backup/restauração integral ensaiado; o script legado foi protegido, não
  ampliado artificialmente para migrar todos os módulos.
- Domínios reais, HTTPS, cookies cross-site, pool/TLS/roles remotos e configurações
  Vercel não foram validados com produção; não houve credencial ou deploy usado.
- CI remota, volume/carga, Safari/Firefox, leitor de tela e animação completa
  permanecem fora da evidência automatizada local.
- Interrupção forçada do runner pode deixar recursos descartáveis; o cleanup
  documentado cobre término normal e falha da suíte, não kill do processo.
- A revisão não resolve automaticamente inconsistências históricas nem substitui
  rotação de secrets previamente expostos.

## 18. Recomendações futuras

Antes de produção: ensaiar backup/restauração completo, aplicar a 012 em janela,
rodar verificações no destino, revisar origens/cookies/TLS/permissões com domínios
reais e executar a CI remota. Essas são etapas operacionais pendentes, não
ações executadas nesta missão.

Melhorias opcionais: comprimir hero e ícones, adicionar cobertura cross-browser,
leitor de tela, métricas de carga com dados representativos, limpeza resiliente
a sinais do runner e paginação visível para conjuntos acima de 10 mil itens.
Revisar fluxos menos frequentes com usuários reais antes de ampliar o design.
