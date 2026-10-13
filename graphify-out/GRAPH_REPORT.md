# Graph Report - BoviTrack__Sistema-full-stack-para-gestao-pecuaria  (2026-10-13)

## Corpus Check
- 195 files · ~229,874 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1317 nodes · 2306 edges · 104 communities (94 shown, 7 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 120 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2b3cd231`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- PreferencesProvider.jsx
- app.js
- migrate-to-supabase.js
- scripts
- desmamasRoutes.js
- devDependencies
- React + Vite template
- ControleLeiteiro
- authRoutes.js
- security-hardening.js
- App.jsx
- api.js
- AuthContext.jsx
- usuariosRoutes.js
- BoviTrack — Reformulação Visual
- Desmamas.jsx
- csrf.js
- validacoes.js
- formatarDataSemFuso
- auth-permissions.js
- receitasRoutes.js
- ControlePesagens.jsx
- Lotes
- propriedadesRoutes.js
- What You Must Do When Invoked
- registrarErro
- calf-management.js
- impactoExclusao.js
- graphify reference: extra exports and benchmark
- migrate-auth.js
- ListaAnimais.jsx
- Animais
- Lucros
- Usuarios
- MinhaConta
- pool.js
- lotesRoutes.js
- Despesas
- Vacinacoes
- receitas.js
- Propriedades
- Vacinas
- check-database.js
- BoviTrack
- erros.js
- migrate-users.js
- migrate-expenses.js
- BOVITRACK — RELATÓRIO DE EVOLUÇÃO
- dependencies
- Cópia transacional por ordem de foreign keys
- BoviTrack Login Hero Image
- Expenses Icon
- Properties Icon
- Livestock Identification Icon
- Livestock Production Icon
- Livestock Vaccinations Icon
- Green Home Leaf Icon
- Logout Icon
- vercel.json
- Green B Leaf Brand Mark
- Cattle
- Animal-Lot Association
- Pasture Fence
- Calendar With Checkmark
- Medicine Bottle and Capsules
- Ícone verde de grupo de usuários
- graphify reference: query, path, explain
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- AGENTS.md
- extraction-spec.md
- Q: Como adicionar o proprietário das propriedades somente para administradores no BoviTrack?
- tests/clima.js
- animaisRoutes.js
- milk-production.js
- Q: Quais componentes e estilos causam overflow e sobreposição no Dashboard do BoviTrack?
- FichaAnimal
- calf-management-integration.js
- server.js
- contextoRequisicao.js
- Q: Onde estão os campos de senha de Login, Cadastro e usuários?
- test-isolated.cjs
- producoesLeiteirasRoutes.js
- Migração do BoviTrack para o Supabase
- backend/package.json
- Segurança do banco em produção
- test-isolation.cjs
- bovitrack.spec.js
- sessoes.js
- Data API desativada
- playwright.config.js
- Lucros.jsx
- usuarios.js
- Continuidade da reformulação visual
- ui-interactions.spec.js
- visual-audit.spec.js
- final-flows.spec.js
- ListaAnimais

## God Nodes (most connected - your core abstractions)
1. `scripts` - 29 edges
2. `formatarDataSemFuso()` - 28 edges
3. `registrarErro()` - 27 edges
4. `api` - 26 edges
5. `converterId()` - 23 edges
6. `BOVITRACK — RELATÓRIO DE EVOLUÇÃO` - 19 edges
7. `validarCamposPermitidos()` - 18 edges
8. `useAuth()` - 17 edges
9. `Icone()` - 17 edges
10. `BoviTrack` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Gestão pecuária de animais, lotes, vacinações e despesas` --conceptually_related_to--> `Migração do BoviTrack para o Supabase`  [INFERRED]
  frontend/index.html → backend/MIGRACAO_SUPABASE.md
- `Frontend limitado a VITE_API_URL` --conceptually_related_to--> `BoviTrack HTML entry`  [INFERRED]
  backend/database/SEGURANCA_PRODUCAO.md → frontend/index.html
- `Migração do BoviTrack para o Supabase` --conceptually_related_to--> `Segurança do banco em produção`  [INFERRED]
  backend/MIGRACAO_SUPABASE.md → backend/database/SEGURANCA_PRODUCAO.md
- `TLS verify-full com CA confiável` --semantically_similar_to--> `TLS verify-full no runtime`  [INFERRED] [semantically similar]
  backend/MIGRACAO_SUPABASE.md → backend/database/SEGURANCA_PRODUCAO.md
- `Supabase Auth, Data API e RLS fora do fluxo` --semantically_similar_to--> `Data API desativada`  [INFERRED] [semantically similar]
  backend/MIGRACAO_SUPABASE.md → backend/database/SEGURANCA_PRODUCAO.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Fluxo seguro de migração para Supabase** — backend_migracao_supabase_copia_transacional, backend_migracao_supabase_destino_vazio, backend_migracao_supabase_sequence_verification_002, backend_migracao_supabase_rollback_local [EXTRACTED 1.00]
- **Runtime serverless seguro do banco** — backend_database_seguranca_producao_runtime_least_privilege, backend_database_seguranca_producao_transaction_pooler_runtime, backend_database_seguranca_producao_tls_verify_full, backend_database_seguranca_producao_data_api_desativada, backend_database_seguranca_producao_post_deploy_verification [EXTRACTED 1.00]
- **Superfície de runtime do frontend BoviTrack** — frontend_readme_react_vite_template, frontend_index_bovitrack_html_entry, backend_database_seguranca_producao_frontend_public_config [INFERRED 0.75]

## Communities (104 total, 7 thin omitted)

### Community 0 - "PreferencesProvider.jsx"
Cohesion: 0.06
Nodes (39): App(), Configuracoes, IconeConfiguracoes(), BlackHoleTransition(), PARTICULAS, obterElementosFocaveis(), TutorialDialog(), controlarTeclado() (+31 more)

### Community 1 - "app.js"
Cohesion: 0.09
Nodes (21): animaisRoutes, { autenticar }, authRoutes, climaRoutes, { contextoRequisicao }, cors, { criarConfiguracaoCors }, dashboardRoutes (+13 more)

### Community 2 - "migrate-to-supabase.js"
Cohesion: 0.06
Nodes (48): analisarUrl(), configurarSsl(), criarConfiguracaoBanco(), criarConfiguracaoLegada(), criarConfiguracaoPorUrl(), fs, inteiroPositivo(), PARAMETROS_SSL_URL (+40 more)

### Community 3 - "scripts"
Cohesion: 0.07
Nodes (29): scripts, db:check, db:check:deletions, db:check:security, migrate:animal-lots, migrate:animals, migrate:auth, migrate:bezerros (+21 more)

### Community 4 - "desmamasRoutes.js"
Cohesion: 0.09
Nodes (25): {
  buscarAnimalPermitido,
  buscarLoteCompativel,
  buscarMaeCompativel,
}, {
  converterId,
  normalizarDataCalendario,
  normalizarDesmama,
  normalizarPaginacao,
  responderPagina,
  validarCamposPermitidos,
  normalizarTextoOpcional,
  normalizarNumeroFinito,
  idOpcionalInformado,
}, express, pool, { registrarErro }, router, { sincronizarPesoAtual }, { validarParametroId } (+17 more)

### Community 5 - "devDependencies"
Cohesion: 0.05
Nodes (42): axios, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, dependencies, axios, react (+34 more)

### Community 6 - "React + Vite template"
Cohesion: 0.18
Nodes (11): Frontend limitado a VITE_API_URL, Gestão pecuária de animais, lotes, vacinações e despesas, BoviTrack HTML entry, Ponto de montagem React root, Inicialização antecipada de tema, HMR e regras ESLint, @vitejs/plugin-react com Oxc, @vitejs/plugin-react-swc com SWC (+3 more)

### Community 7 - "ControleLeiteiro"
Cohesion: 0.09
Nodes (26): ControleDesmama(), abrirConclusao(), cancelar(), carregar(), concluir(), planejar(), salvar(), ControleLeiteiro() (+18 more)

### Community 8 - "authRoutes.js"
Cohesion: 0.12
Nodes (21): { autenticar }, bcrypt, { consumirLimite }, {
  criarSessaoRefresh,
  criarTokenAcesso,
  definirCookieRefresh,
  encerrarSessaoRefresh,
  encerrarTodasSessoes,
  lerRefreshToken,
  limparCookieRefresh,
  renovarSessaoRefresh,
}, emailNormalizado(), express, limitarCadastro, limitarLoginConta (+13 more)

### Community 9 - "security-hardening.js"
Cohesion: 0.09
Nodes (20): configuracao, dotenv, duracaoEmSegundos(), DURACOES, validarAmbiente(), { app }, assert, { consumirLimite } (+12 more)

### Community 10 - "App.jsx"
Cohesion: 0.08
Nodes (26): Animais, Cadastro, Dashboard, Despesas, Login, Lotes, MinhaConta, Producao (+18 more)

### Community 11 - "api.js"
Cohesion: 0.21
Nodes (16): caminhos, Icone(), ColecaoRegistros(), FormularioCadastro(), VoltarInicio(), useMensagem(), CAMPOS_BUSCA, CAMPOS_BUSCA (+8 more)

### Community 12 - "AuthContext.jsx"
Cohesion: 0.17
Nodes (20): AuthContext, AuthProvider(), avisarOutrasAbas(), finalizarLogoutVisual(), login(), logout(), logoutTodosDispositivos(), restaurarSessao() (+12 more)

### Community 13 - "usuariosRoutes.js"
Cohesion: 0.12
Nodes (18): autenticar(), exigirAutenticacaoRecente(), pool, { registrarErro }, somenteAdmin(), { verificarTokenAcesso }, { alterarAtivoUsuario, excluirUsuarioComDados }, express (+10 more)

### Community 14 - "BoviTrack — Reformulação Visual"
Cohesion: 0.13
Nodes (14): Acessibilidade, BoviTrack — Reformulação Visual, Componentes criados, Dados e comportamento, Design System, Evidências locais, Melhorias dark mode, Melhorias mobile (+6 more)

### Community 15 - "Desmamas.jsx"
Cohesion: 0.11
Nodes (11): Desmamas, Pesagens, RegistroFichaNotice(), Desmamas(), ROTULOS_STATUS, ROTULOS_TIPO, STATUS, TIPOS (+3 more)

### Community 16 - "csrf.js"
Cohesion: 0.42
Nodes (7): criarConfiguracaoCors(), normalizarOrigem(), obterOrigensPermitidas(), {
  normalizarOrigem,
  obterOrigensPermitidas,
}, origemDoReferer(), protegerContraCsrf(), { registrarEvento }

### Community 17 - "validacoes.js"
Cohesion: 0.16
Nodes (23): normalizarFiltros(), normalizarReceita(), express, normalizarDadosVacinacao(), { normalizarPaginacao, responderPagina, validarCamposPermitidos, converterId, normalizarDataCalendario, normalizarTextoOpcional }, pool, { registrarErro }, router (+15 more)

### Community 18 - "formatarDataSemFuso"
Cohesion: 0.11
Nodes (25): FichaAnimal, ResumoAnimal(), VacinacaoAnimal(), ClimaPropriedade(), ROTULOS_TIPO, STATUS, TIPOS, RESUMO_INICIAL (+17 more)

### Community 19 - "auth-permissions.js"
Cohesion: 0.33
Nodes (8): { app, pool }, assert, bcrypt, confirmar(), executar(), criarConjunto(), login(), requisitar()

### Community 20 - "receitasRoutes.js"
Cohesion: 0.18
Nodes (8): construirFiltro(), {
  converterId,
  normalizarDataCalendario,
  normalizarNumeroFinito,
  normalizarPaginacao,
  normalizarTextoObrigatorio,
  normalizarTextoOpcional,
  responderPagina,
  validarCamposPermitidos,
}, express, PERIODOS, pool, { registrarErro }, router, { validarParametroId }

### Community 21 - "ControlePesagens.jsx"
Cohesion: 0.15
Nodes (12): ConfirmacaoExclusao(), descreverRegistro(), detalhesResumo(), formatarData(), ResumoImpactoExclusao(), ROTULOS_RESUMO, gmd(), METODOS (+4 more)

### Community 22 - "Lotes"
Cohesion: 0.31
Nodes (8): Lotes(), adicionarAnimalAoLote(), carregarAnimaisDoLote(), gerenciarAnimais(), limparFormulario(), recarregarLotes(), removerAnimalDoLote(), salvarLote()

### Community 23 - "propriedadesRoutes.js"
Cohesion: 0.11
Nodes (18): {
  excluirPropriedadeComDados,
  obterImpactoExclusaoPropriedade,
}, express, { normalizarPaginacao, responderPagina, validarCamposPermitidos, normalizarTextoObrigatorio, normalizarNumeroFinito, normalizarEstado }, pool, { registrarErro, registrarEvento }, router, { validarParametroId }, alterarAtivoUsuario() (+10 more)

### Community 24 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 25 - "registrarErro"
Cohesion: 0.16
Nodes (17): { criarUsuarioComum }, { registrarEvento, registrarErro }, responderCriacaoUsuario(), { consumirLimite }, limitarRequisicoes(), { registrarErro, registrarEvento }, express, pool (+9 more)

### Community 26 - "calf-management.js"
Cohesion: 0.32
Nodes (9): calcularGMD(), calcularIdadeEmDias(), calcularP205(), dataUtc(), montarResumoPesagens(), ordenarPesagens(), assert, {
  calcularGMD,
  calcularIdadeEmDias,
  calcularP205,
  montarResumoPesagens,
} (+1 more)

### Community 27 - "impactoExclusao.js"
Cohesion: 0.16
Nodes (24): executar(), {
  obterImpactoExclusaoPropriedade,
  obterImpactoExclusaoUsuario,
}, pool, VERIFICACOES_ORFAOS, adicionarSemDuplicar(), agregarGrupos(), buscarPropriedadeAutorizada(), consultarRegistrosDaPropriedade() (+16 more)

### Community 28 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 29 - "migrate-auth.js"
Cohesion: 0.25
Nodes (8): bcrypt, email, executar(), fs, lerMigracao(), nome, path, pool

### Community 30 - "ListaAnimais.jsx"
Cohesion: 0.17
Nodes (13): colunas, colunas, ClimaDashboard(), DashboardConteudo(), moeda(), colunas, Card(), Distribuicao() (+5 more)

### Community 31 - "Animais"
Cohesion: 0.38
Nodes (5): Animais(), limparFormulario(), recarregarAnimais(), salvarAnimal(), obterDataAtualLocal()

### Community 32 - "Lucros"
Cohesion: 0.29
Nodes (3): Lucros(), limparFormulario(), salvarReceita()

### Community 33 - "Usuarios"
Cohesion: 0.25
Nodes (7): Usuarios(), alterarSituacao(), excluirUsuario(), fecharExclusaoUsuario(), fecharFormulario(), recarregarUsuarios(), salvarUsuario()

### Community 35 - "pool.js"
Cohesion: 0.06
Nodes (20): { criarConfiguracaoBanco }, pool, { Pool, types }, { registrarErro }, pool, fs, path, pool (+12 more)

### Community 36 - "lotesRoutes.js"
Cohesion: 0.13
Nodes (14): { converterId, normalizarPaginacao, responderPagina, validarCamposPermitidos, normalizarTextoObrigatorio, normalizarTextoOpcional }, express, pool, { registrarErro }, router, { validarParametroId }, express, { normalizarPaginacao, responderPagina, validarCamposPermitidos, normalizarTextoObrigatorio, normalizarTextoOpcional } (+6 more)

### Community 37 - "Despesas"
Cohesion: 0.38
Nodes (5): Despesas(), limparFormulario(), recarregarDespesas(), salvarDespesa(), formatarDataSemFuso()

### Community 38 - "Vacinacoes"
Cohesion: 0.47
Nodes (4): Vacinacoes(), limparFormulario(), recarregarVacinacoes(), salvarVacinacao()

### Community 39 - "receitas.js"
Cohesion: 0.29
Nodes (10): { app, pool }, assert, bcrypt, confirmar(), { dataHojeNoFuso }, executar(), limpar(), login() (+2 more)

### Community 40 - "Propriedades"
Cohesion: 0.36
Nodes (6): Propriedades(), excluirPropriedade(), fecharExclusao(), limparFormulario(), recarregarPropriedades(), salvarPropriedade()

### Community 41 - "Vacinas"
Cohesion: 0.47
Nodes (4): Vacinas(), limparFormulario(), recarregarVacinas(), salvarVacina()

### Community 42 - "check-database.js"
Cohesion: 0.40
Nodes (5): executar(), pool, TABELAS, TABELAS_COM_SEQUENCE, verificar()

### Community 43 - "BoviTrack"
Cohesion: 0.06
Nodes (32): 1. Obter o código e instalar dependências, 2. Preparar um PostgreSQL local vazio, 3. Iniciar o backend, 4. Iniciar o frontend, API, Arquitetura, Autoria e contribuição, Backend (+24 more)

### Community 44 - "erros.js"
Cohesion: 0.50
Nodes (3): { registrarErro }, rotaNaoEncontrada(), tratarErros()

### Community 45 - "migrate-users.js"
Cohesion: 0.40
Nodes (3): fs, path, pool

### Community 46 - "migrate-expenses.js"
Cohesion: 0.40
Nodes (3): fs, path, pool

### Community 47 - "BOVITRACK — RELATÓRIO DE EVOLUÇÃO"
Cohesion: 0.11
Nodes (19): 10. Responsividade, 11. Acessibilidade, 12. Testes, 13. Skills utilizadas, 14. Arquivos principais modificados, 15. Migrations, 16. Variáveis de ambiente, 17. Problemas não resolvidos (+11 more)

### Community 48 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, bcryptjs, cors, dotenv, express, helmet, jsonwebtoken, pg (+7 more)

### Community 49 - "Cópia transacional por ordem de foreign keys"
Cohesion: 0.67
Nodes (3): Cópia transacional por ordem de foreign keys, Guarda de destino vazio, Preservação de IDs INTEGER

### Community 50 - "BoviTrack Login Hero Image"
Cohesion: 0.60
Nodes (5): Agricultural Landscape, Cultivated Green Fields, Farm Buildings, Golden-Hour Light, BoviTrack Login Hero Image

### Community 51 - "Expenses Icon"
Cohesion: 0.50
Nodes (5): Currency Symbol, Expense Tracking, Expenses Icon, Financial Receipt, Stacked Coins

### Community 52 - "Properties Icon"
Cohesion: 0.50
Nodes (5): Green Farm Barn, Cultivated Field Rows, Properties Icon, Rural Property, Farm Silo

### Community 53 - "Livestock Identification Icon"
Cohesion: 0.67
Nodes (4): Livestock Identification Icon, Livestock Identification, Identification Number 1234, Green Numbered Ear Tag

### Community 54 - "Livestock Production Icon"
Cohesion: 0.67
Nodes (4): Livestock Production Icon, Livestock Production Growth, Rising Green Bar Chart, Upward Trend

### Community 55 - "Livestock Vaccinations Icon"
Cohesion: 0.67
Nodes (4): Livestock Vaccinations Icon, Livestock Vaccination, Syringe with Green Liquid, Vaccine Vial

### Community 56 - "Green Home Leaf Icon"
Cohesion: 0.50
Nodes (4): Green Home Leaf Icon, Home Navigation, Leaf Motif, Sustainable Agriculture

### Community 57 - "Logout Icon"
Cohesion: 0.50
Nodes (4): Doorway, Logout Icon, Outbound Arrow, Sign Out

### Community 58 - "vercel.json"
Cohesion: 0.50
Nodes (3): headers, rewrites, $schema

### Community 59 - "Green B Leaf Brand Mark"
Cohesion: 0.67
Nodes (3): Bold White Letter B, Green B Leaf Brand Mark, Mint Green Leaf Sprout

### Community 60 - "Cattle"
Cohesion: 0.67
Nodes (3): Cattle, Cow Head Icon, Livestock Farming

### Community 61 - "Animal-Lot Association"
Cohesion: 1.00
Nodes (3): Animal-Lot Association, Green Chain Link, Animals and Lots Icon

### Community 62 - "Pasture Fence"
Cohesion: 0.67
Nodes (3): Fenced Paddock Icon, Livestock Lot, Pasture Fence

### Community 63 - "Calendar With Checkmark"
Cohesion: 0.67
Nodes (3): Calendar With Checkmark, Upcoming Vaccinations, Vaccination Schedule Icon

### Community 64 - "Medicine Bottle and Capsules"
Cohesion: 0.67
Nodes (3): Animal Vaccination, Medicine Bottle and Capsules, Vaccine Medication Icon

### Community 65 - "Ícone verde de grupo de usuários"
Cohesion: 0.67
Nodes (3): Gestão de usuários, Ícone verde de grupo de usuários, Três perfis humanos agrupados

### Community 69 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 70 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 71 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 72 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 77 - "Q: Como adicionar o proprietário das propriedades somente para administradores no BoviTrack?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Como adicionar o proprietário das propriedades somente para administradores no BoviTrack?, Source Nodes

### Community 78 - "tests/clima.js"
Cohesion: 0.10
Nodes (27): climaService, criarConsultarClima(), { ErroClima }, pool, { registrarErro }, climaService, criarClimaService(), { criarOpenMeteoProvider } (+19 more)

### Community 79 - "animaisRoutes.js"
Cohesion: 0.13
Nodes (19): {
  converterId,
  idOpcionalInformado,
  normalizarDataNascimento,
  normalizarNumeroBrinco,
  normalizarPaginacao,
  responderPagina,
  validarCamposPermitidos,
  normalizarTextoObrigatorio,
  normalizarTextoOpcional,
  normalizarNumeroFinito,
}, express, normalizarDadosAnimal(), pool, { registrarErro }, router, { validarParametroId }, express (+11 more)

### Community 80 - "milk-production.js"
Cohesion: 0.33
Nodes (8): { app, pool }, assert, confirmar(), dataNoFuso(), executar(), login(), requisitar(), somarDias()

### Community 81 - "Q: Quais componentes e estilos causam overflow e sobreposição no Dashboard do BoviTrack?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Quais componentes e estilos causam overflow e sobreposição no Dashboard do BoviTrack?, Source Nodes

### Community 82 - "FichaAnimal"
Cohesion: 0.67
Nodes (3): FichaAnimal(), atualizarAnimal(), atualizarManejo()

### Community 83 - "calf-management-integration.js"
Cohesion: 0.32
Nodes (6): { app, pool }, assert, confirmar(), emails, executar(), requisitar()

### Community 84 - "server.js"
Cohesion: 0.50
Nodes (3): app, pool, { app, pool }

### Community 87 - "Q: Onde estão os campos de senha de Login, Cadastro e usuários?"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Onde estão os campos de senha de Login, Cadastro e usuários?, Source Nodes

### Community 88 - "test-isolated.cjs"
Cohesion: 0.17
Nodes (12): adminUrl, bcrypt, { Client }, crypto, databaseUrl, env, main(), path (+4 more)

### Community 89 - "producoesLeiteirasRoutes.js"
Cohesion: 0.14
Nodes (13): { converterId }, validarParametroId(), { consultarClima }, express, router, { validarParametroId }, { buscarAnimalPermitido }, {
  converterId,
  normalizarDataCalendario,
  normalizarProducaoLeiteira,
  normalizarPaginacao,
  responderPagina,
} (+5 more)

### Community 90 - "Migração do BoviTrack para o Supabase"
Cohesion: 0.28
Nodes (6): Migration 012: parentesco e indices, Migração do BoviTrack para o Supabase, Migrations incrementais de sessões e leite, Retorno temporário ao PostgreSQL local, 001_schema_bovitrack.sql, 002_verificar_e_corrigir_sequences.sql

### Community 91 - "backend/package.json"
Cohesion: 0.22
Nodes (8): author, description, keywords, license, main, name, type, version

### Community 93 - "Segurança do banco em produção"
Cohesion: 0.20
Nodes (10): Cookie HttpOnly e ausência de JWT em storage, Migrations de segurança e hardening, Rotação obrigatória de JWT_SECRET, Verificação de segurança pós-deploy, Login runtime de menor privilégio, Segurança do banco em produção, TLS verify-full no runtime, Transaction Pooler para runtime serverless (+2 more)

### Community 94 - "test-isolation.cjs"
Cohesion: 0.25
Nodes (7): ./frontend/playwright.config.js, assert, configResult, path, result, root, { spawnSync }

### Community 95 - "bovitrack.spec.js"
Cohesion: 0.28
Nodes (7): abrirMenu(), db, dismissTutorial(), login(), navegar(), { Pool }, require

### Community 96 - "sessoes.js"
Cohesion: 0.12
Nodes (28): {
  audience,
  expiracaoAcesso,
  issuer,
}, criarSessaoRefresh(), criarTokenAcesso(), crypto, definirCookieRefresh(), duracaoEmMilissegundos(), encerrarSessaoRefresh(), encerrarTodasSessoes() (+20 more)

### Community 97 - "Data API desativada"
Cohesion: 0.50
Nodes (4): Data API desativada, Backend com pg e JWT, Supabase Auth, Data API e RLS fora do fluxo, Supabase como PostgreSQL hospedado

### Community 102 - "Lucros.jsx"
Cohesion: 0.22
Nodes (11): Lucros, Lancamentos(), GraficoFinanceiro(), moeda(), PainelFinanceiro(), CATEGORIAS_SUGERIDAS, FILTROS_INICIAIS, FORMAS_RECEBIMENTO (+3 more)

### Community 103 - "usuarios.js"
Cohesion: 0.36
Nodes (7): bcrypt, criarErroValidacao(), criarUsuarioComum(), { excluirUsuarioComDados }, pool, { validarCamposPermitidos }, validarSenha()

### Community 104 - "Continuidade da reformulação visual"
Cohesion: 0.25
Nodes (7): Ambiente de testes, Concluído, Continuidade da reformulação visual, Decisões de design, Escopo e branch, Etapa atual, Próximas etapas

### Community 105 - "ui-interactions.spec.js"
Cohesion: 0.33
Nodes (3): db, { Pool }, require

### Community 106 - "visual-audit.spec.js"
Cohesion: 0.33
Nodes (4): db, { Pool }, require, prepararReferenciaVisual()

### Community 110 - "final-flows.spec.js"
Cohesion: 0.40
Nodes (3): db, { Pool }, require

### Community 113 - "ListaAnimais"
Cohesion: 1.00
Nodes (3): ListaAnimais(), limpar(), pesquisar()

## Knowledge Gaps
- **565 isolated node(s):** `express`, `cors`, `helmet`, `{ criarConfiguracaoCors }`, `{ autenticar }` (+560 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 678 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `formatarDataSemFuso()` connect `formatarDataSemFuso` to `Vacinacoes`, `ControleLeiteiro`, `api.js`, `Desmamas.jsx`, `FichaAnimal`, `ControlePesagens.jsx`, `ListaAnimais.jsx`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `registrarErro()` connect `registrarErro` to `migrate-to-supabase.js`, `pool.js`, `desmamasRoutes.js`, `lotesRoutes.js`, `authRoutes.js`, `erros.js`, `usuariosRoutes.js`, `tests/clima.js`, `animaisRoutes.js`, `validacoes.js`, `receitasRoutes.js`, `propriedadesRoutes.js`, `producoesLeiteirasRoutes.js`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `api` connect `api.js` to `Lucros.jsx`, `App.jsx`, `AuthContext.jsx`, `Desmamas.jsx`, `formatarDataSemFuso`, `ControlePesagens.jsx`, `ListaAnimais.jsx`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `express`, `cors`, `helmet` to the rest of the system?**
  _565 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PreferencesProvider.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06168831168831169 - nodes in this community are weakly interconnected._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `migrate-to-supabase.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06386066763425254 - nodes in this community are weakly interconnected._