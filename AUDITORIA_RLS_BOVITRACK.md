# Auditoria técnica de preparação para RLS · BoviTrack

10 de novembro de 2026 · Auditoria estática e consultas SELECT ao Supabase. Os exemplos SQL deste relatório são propostas para homologação.

## A. Resumo executivo

**O BoviTrack ainda precisa de preparação antes de ativar RLS.** O Supabase tem 15 tabelas da aplicação em `public`, todas com RLS e FORCE desabilitados. A autorização atual pertence ao Express e às condições SQL dos handlers. A credencial SQL da aplicação, se utilizada pelo deployment, tem CRUD irrestrito por linha nessas tabelas. O backend usa o mesmo pool para tráfego autenticado, descoberta de identidade, autenticação pública e manutenção de sessões. Ativar RLS com política de proprietário agora impediria o bootstrap da sessão, bloquearia escritas e ocultaria dados necessários às exclusões e agregações.

Há três frentes antes da ativação. A primeira é estabelecer contexto por transação e separar as operações anteriores à autenticação. A segunda é preservar as regras administrativas e garantir integridade entre propriedades, inclusive quando RLS ocultar referências de triggers. A terceira é reconciliar o esquema vivo com as migrations, especialmente a 012. A verificação de e-mail da DEV exige homologação conjunta ou posterior, com atenção à política ampla da 013 e à revogação de sessões prevista nessa migration.

### Evidência e escopo

| Fonte | Evidência |
|---|---|
| Checkout `fazendo-audit-de-segurança`, `8b502baff96a24bd80f3547be11616fd7f23f6aa` | Código auditado no filesystem. O backend tem a mesma árvore de `main` local, `62235a9299a78f365cd71b060ed264cdf6d3dc11`. A ref local `origin/DEV` aponta ao commit do checkout. |
| `DEV` local, `91a07aadab54a42ccce82966ed1368e2847e0a88` | Contém verificação de e-mail via Resend e migration 013. `origin/main` local coincide com `main`. Refs de rastreamento refletem o estado local. |
| Supabase `bovitrack`, região São Paulo | PostgreSQL 17.6, catálogo consultado via MCP. Conferidos objetos, ACLs, policies, roles, dependências, índices, triggers e contagens de integridade. A role `authenticator` está configurada com `pgrst.db_schemas=pgrst_no_exposed_schemas`, coerente com a desativação da exposição da Data API. A chave administrativa de ativação da integração no painel ficou sem verificação direta. |
| Vercel | Listagem do deployment de produção recusada com HTTP 403. SHA implantado, usuário SQL efetivamente utilizado, porta, TLS e tamanho efetivo do pool seguem sem confirmação no deployment. O catálogo comprova as roles e não mostrou sessão visível de `bovitrack_app_login` naquele instante. O código suporta Supabase via `pg`, com TLS validado em produção e pool padrão de 2 por instância Vercel, configurável. A documentação local indica pooler de transações, porta 6543. |

Graphify orientou a navegação. A atribuição dos fluxos e regras foi conferida nos arquivos e a do esquema foi conferida em `pg_catalog`. Nenhuma operação de escrita, migration, teste de mutação, push ou deploy foi executado. Nenhuma credencial, conteúdo pessoal, valor de sessão ou hash de usuário foi coletado do banco.

`pg_stat_statements` confirma uso histórico de `bovitrack_app_login` neste banco, com 292 chamadas em 34 assinaturas de consulta na janela acumulada disponível. Foram coletados apenas agregados por role. Essa evidência confirma atividade da role no projeto Supabase, sem atribuição a uma instância, deployment ou modo de conexão.

## B. Estado atual do banco e matriz de acesso

Para **cada uma das 15 tabelas da matriz**, o catálogo confirma proprietário `postgres`, RLS OFF, FORCE OFF e zero policies. `bovitrack_runtime` e `bovitrack_app_login` têm efetivamente SELECT, INSERT, UPDATE e DELETE em cada uma delas. `anon`, `authenticated` e PUBLIC ficam sem grants de tabela. `service_role` recebe todos os privilégios de tabela, incluindo TRUNCATE, REFERENCES, TRIGGER e MAINTAIN. Não apareceram grants adicionais de coluna. Em `public`, PUBLIC tem USAGE e a role da aplicação tem USAGE sem CREATE. As sequências da aplicação são de `postgres`, com USAGE e SELECT para runtime, e USAGE, SELECT e UPDATE para `service_role`. Preserve USAGE apenas para quem efetivamente inserir.

**Matriz proposta.** S = SELECT, I = INSERT, U = UPDATE, D = DELETE. “Próprio” segue o caminho de posse indicado. “Admin” é o administrador da aplicação validado no banco e no Express. As ações “internas” são operações específicas mediadas por função. Fora dos acessos listados, a operação deve ser negada. Restrições de colunas e regras de negócio continuam valendo.

| Tabela · classificação | PK e FKs / posse | Usuário comum | Administrador | Outros acessos internos e pontos de atenção |
|---|---|---|---|---|
| `usuarios` · identidade administrativa e pessoal | `id integer`. E-mail único. Índice único parcial de perfil admin. | S e U de campos próprios autorizados, D da própria conta por fluxo transacional. | S de projeção pública da conta, I de usuário comum via operação dedicada, U e D conforme regras administrativas. A conta admin permanece protegida dos endpoints que desativam/excluem contas. | Cadastro público I limitado a perfil comum e sem controle de status pelo cliente. Login S por e-mail normalizado. Senha e campos sensíveis fora do SELECT genérico. `perfil`, `ativo`, senha e verificação protegidos por grants de coluna e operações específicas. |
| `propriedades` · privada | `id`; `usuario_id → usuarios.id` sem cascade. | S/I/U/D próprias, sem transferência de dono. | S/U/D globais; I com dono igual ao ator, como hoje. | Exclusão explícita de filhos. JOIN opcional de usuário para mostrar proprietário ao admin. |
| `animais` · privada por propriedade | `id`; `propriedade_id → propriedades.id`; `mae_id → animais.id` SET NULL. | S/I/U/D próprios. Origem e destino autorizados no U. | S/I/U/D globais, mantendo coerência de manejo e vacinação em movimentações. | Atualização de peso e parentesco. Brinco único por propriedade quando preenchido. |
| `lotes` · privada por propriedade | `id`; `propriedade_id → propriedades.id` sem cascade. | S/I/U/D próprios. | S/I/U/D globais. | Mudança de propriedade depende de animais e históricos compatíveis. |
| `animais_lotes` · associação privada | PK `(animal_id,lote_id)`; ambos os FKs CASCADE para os respectivos pais. | S/I/D quando ambos os lados são autorizados; I exige mesma propriedade. U direto dispensável. | S/I/D, com a mesma exigência de integridade em I. | Conclusão de desmama pode escrever na associação. PK resolve duplicidade sob concorrência. |
| `vacinas` · catálogo privado por usuário | `id`; `usuario_id → usuarios.id` sem cascade. | S/I/U/D próprias. | S/U/D globais e I com dono igual ao ator. | Exclusão de vacina utilizada pode ser bloqueada por FK. |
| `vacinacoes` · privada por animal e catálogo | `id`; `animal_id → animais.id`, `vacina_id → vacinas.id`, ambos sem cascade. | S/I/U/D quando animal e vacina estão no próprio escopo. | S/U/D globais, com validação de mesmo dono no estado novo de I/U. | A rota de exclusão atualmente filtra pelo animal, enquanto listagens comuns usam os dois donos. O catálogo retornou zero divergências. Se aparecer legado divergente, resolver por operação controlada antes de ativar a política dupla. |
| `despesas` · financeira privada | `id`; `propriedade_id → propriedades.id` sem cascade. | S/I/U/D próprias. | S/I/U/D globais. | Duas rotas aninhadas por propriedade e agregações de categorias. |
| `receitas` · financeira privada | `id`; `propriedade_id → propriedades.id` CASCADE. | S/I/U/D próprias. | S/I/U/D globais. | O resumo consulta também despesas. |
| `producoes_leiteiras` · privada por animal | `id`; `animal_id → animais.id` CASCADE. | S/I/U/D próprias. | S/I/U/D globais. | Séries por período/turno e totais no mesmo escopo. |
| `pesagens` · privada por animal | `id`; `animal_id → animais.id` CASCADE; `lote_id → lotes.id` e `registrado_por → usuarios.id` SET NULL. | S/I/U/D próprias. | S/I/U/D globais. | Lote da mesma propriedade e autor derivado do ator no I. `registrado_por` é atribuição de auditoria. |
| `desmamas` · privada por animal | `id`; `animal_id → animais.id` CASCADE. `mae_id → animais.id`, `lote_destino_id → lotes.id`, `peso_desmama_id → pesagens.id`, `registrado_por → usuarios.id` SET NULL. | S/I/U próprias; D pela exclusão do pai/conta. Cancelar usa U. | S/I/U globais; D em exclusão orquestrada. | Pesagem única, do mesmo animal, mãe fêmea e lote da mesma propriedade. A função de exclusão orquestrada precisa de D sobre o escopo autorizado. |
| `sessoes_refresh` · interna | PK `id bigint`; `usuario_id → usuarios.id` CASCADE; hash e `session_id` únicos. | Sem CRUD direto. Logout geral e autoexclusão via operações limitadas. | Sem CRUD direto. Revogação ao desativar conta e exclusão pelas operações autorizadas. | S/I/U/D no executor de autenticação por propósito: bootstrap, criação, rotação, revogação, limpeza e exclusão. |
| `sessoes_refresh_usados` · interna | PK `token_hash`; `sessao_id bigint → sessoes_refresh.id` CASCADE. | Sem CRUD direto. | Sem CRUD direto. | S/I para detecção de replay, D via cascade/limpeza. U dispensável no código auditado. |
| `limites_requisicao` · infraestrutura interna | PK `(escopo,chave_hash,janela_inicio)`; sem FK. | Sem CRUD direto. | Sem CRUD direto. | S/I/U para upsert com RETURNING; D somente para expiração. Escopos por ação e entradas validadas. |
| `verificacoes_email` · interna, **somente DEV** | 013 propõe UUID e `usuario_id → usuarios.id` CASCADE. Índice parcial único de desafio vigente por usuário, composto usuário/criação e índice de expiração. | Sem CRUD direto. | Sem CRUD direto. | I/S/U por desafio e finalidade validada, D por cascade/limpeza quando prevista. A policy `verificacoes_runtime` da 013 usa TRUE para CRUD e deve ser substituída antes de integrar o fluxo ao modelo proposto. |

As tabelas de negócio têm isolamento por proprietário e escopo administrativo transversal. O código e as FKs indicam um único dono por propriedade e nenhum mecanismo de compartilhamento entre contas comuns. O esquema `public` é o namespace SQL. Nenhuma tabela da aplicação exige leitura pública irrestrita.

### Roles, funções, triggers e divergência de migrations

- `bovitrack_app_login` tem LOGIN e herda `bovitrack_runtime`, com opção SET. Ambas têm NOBYPASSRLS, NOSUPERUSER e sem CREATE em `public`. O login não é membro de `postgres`, `service_role` ou das roles de API. BYPASSRLS presente em `postgres`, `service_role`, `supabase_admin`, `supabase_etl_admin` e `supabase_read_only_user`. Apenas `supabase_admin` aparece como superuser. FORCE aplica RLS ao dono comum e continua permitindo bypass às roles com esse atributo. Revise `service_role` e os grants default do criador real antes de qualquer mudança. Hoje os defaults de `postgres` em `public` concedem CRUD ao runtime e privilégios amplos a `service_role`. Os defaults de `supabase_admin` ainda concedem privilégios a roles da API nesse esquema.
- O catálogo não retornou policies em nenhum esquema. RLS está habilitado em parte dos objetos gerenciados, discriminados no apêndice. Nenhuma view ou materialized view da aplicação. Existem `extensions.pg_stat_statements`, `extensions.pg_stat_statements_info` e `vault.decrypted_secrets` (depende de `vault.secrets`), sem dependências observadas de tabelas BoviTrack. Nenhuma materialized view de usuário foi encontrada. A publicação `supabase_realtime` não listou tabelas.
- Há quatro triggers de linha da aplicação, todos BEFORE e habilitados. `animais_parentesco_consistente_trg` → `validar_parentesco_animais()` consulta animais, lotes, pesagens e desmamas. `lotes_movimentacao_consistente_trg` → `validar_movimentacao_lote()` consulta associação, animais, pesagens e desmamas. `pesagens_referencias_consistentes_trg` → `validar_referencias_pesagem()` consulta animais e lotes. `desmamas_referencias_consistentes_trg` → `validar_referencias_desmama()` consulta animais, lotes e pesagens. As quatro funções são INVOKER, de `postgres`, com EXECUTE efetivo via ACL para `postgres` e `service_role`; o trigger instalado executa conforme os privilégios do invocador durante DML. Não há DEFINER da aplicação. Os DEFINER visíveis são `pgbouncer.get_auth(text)`, `vault.create_secret(text,text,text,uuid)` e `vault.update_secret(uuid,text,text,text,uuid)`, de `supabase_admin`, com EXECUTE restrito a seus consumidores administrativos. As triggers de plataforma detectadas pertencem a Storage/Realtime, além de event triggers gerenciados de DDL.
- **A migration 012 local não está refletida integralmente no banco.** A função de parentesco viva deixa de disparar em mudança só de `sexo` e difere no tratamento de NULL, bloqueio de mãe, dependência de desmama e SQLSTATE. A função de desmama viva também difere. Os sete índices de 012 listados em H estão ausentes. A 013 está ausente do catálogo consultado, inclusive colunas de verificação e trigger de mudança de e-mail. Trate a conciliação da 012 e a adoção da 013 como decisões de release separadas, com revisão do SQL real. A 013 marca contas legadas como pendentes e revoga as sessões ativas dessas contas, exigindo plano operacional de verificação e reentrada.
- A consulta de integridade retornou zero divergências para lote/animal, mãe/animal, lote/pesagem, referências de desmama e divergência de dono vacina/animal. A fotografia tinha 6 usuários, 1 admin, 5 propriedades, 3 animais e nenhuma vacina. A ausência de divergências nessa amostra tem valor de preflight e precisa ser complementada por fixtures com relacionamentos de todos os tipos. Contadores de `pg_stat_user_tables` são estimativas e não foram usados como contagem de registros.

## C. Alterações necessárias no código

Os 23 arquivos abaixo são a superfície de alteração proposta para a árvore de `main` auditada, com executor explícito e funções de autenticação. O número representa os caminhos concretos deste desenho, sem contar migrations, configuração operacional e testes. Para integrar a DEV, há mais um arquivo de runtime a adaptar, `backend/services/verificacaoEmail.js`, além de revisar a 013 ou criar migration sucessora. Se o contrato HTTP permanecer estável, o frontend pode ser mantido. Na DEV ele já carrega a interface de verificação e seus códigos de resposta.

| Arquivo | Função afetada | Problema | Alteração necessária | Prioridade |
|---|---|---|---|---|
| `backend/database/pool.js` | export do pool | `pool.query` livre e `connect` descentralizado. | Executor transacional, contratos explícitos para domínio e autenticação, descarte de conexão em falha de rollback. | Crítica |
| `backend/middleware/autenticacao.js` | `autenticar`, `somenteAdmin` | JWT HS256 validado com emissor/audiência, mas o JOIN de validação por `sub` e `sid` ocorre antes de definir contexto. | Bootstrap por função restrita, com sessão não revogada, ativa e vigente. Manter reautenticação administrativa e usar usuário/perfil retornados pelo banco. | Crítica |
| `backend/routes/authRoutes.js` | handlers de cadastro, login, refresh, logout e logout-all | Lookup por e-mail e operações por cookie ocorrem sem usuário de domínio. Logout-all tem JWT. | Separar entrada pública e autenticada. Login recebe projeção dedicada, executa bcrypt fora da transação e só emite JWT/cookie após criação bem-sucedida da sessão. Preservar rate limit, CSRF existente e respostas. | Crítica |
| `backend/controllers/usuariosController.js` | `responderCriacaoUsuario` | Mesmo controlador serve cadastro público e cadastro administrativo. | Separar propósito de execução e vincular ator administrativo ao caminho protegido. | Alta |
| `backend/services/usuarios.js` | `criarUsuarioComum`, `alterarAtivoUsuario` | Pré-checagem por e-mail e INSERT RETURNING; alteração de ativo bloqueia usuário e revoga sessões na mesma transação. | Encapsular criação e alteração de status. Preservar bcrypt, 23505/409 e proteção ao admin. Adotar executor comum. | Crítica |
| `backend/services/sessoes.js` | `criarSessaoRefresh`, `renovarSessaoRefresh`, `encerrarSessaoRefresh`, `encerrarTodasSessoes` | Criação limpa expiradas e limita sessões, refresh bloqueia a sessão, consulta usados e atualiza família. Logout usa hash atual ou já usado. | Funções SQL por ação com acesso interno limitado. Manter rotação, concorrência/replay, revogação de família, limites, compatibilidade de cookies e atomicidade. Separar limpeza global do escopo de usuário. | Crítica |
| `backend/services/limitesRequisicao.js` | `consumirLimite` | Upsert antes da autenticação e limpeza probabilística assíncrona. | Consumir contador via função limitada por escopo, incluindo os privilégios exigidos por ON CONFLICT/RETURNING. Executar limpeza em transação própria com erro monitorado. | Alta |
| `backend/routes/usuariosRoutes.js` | `GET/PUT/DELETE /usuarios…` e previews, `PUT /usuarios/:id/ativo` | Própria conta usa ID autenticado, operações por ID de terceiro dependem de `somenteAdmin`. | Usar ator validado e executores apropriados em todos os handlers com banco. Restringir colunas, admin-alvo e autoria da exclusão. | Crítica |
| `backend/services/impactoExclusao.js` | `obterImpactoExclusaoPropriedade`, `excluirPropriedadeComDados`, `obterImpactoExclusaoUsuario`, `excluirUsuarioComDados` | Previews e DELETEs multitabulares usam consultas internas por IDs. Exclusão de usuário recebe alvo e depende do chamador para autorizar o ator. | Distinguir ator/alvo, manter bloqueios e ordem, verificar contagens e executar com o mesmo cliente. Manter caminho restrito para sessões internas e exclusão de desmamas. | Crítica |
| `backend/routes/propriedadesRoutes.js` | CRUD e `/exclusao-preview` | JOIN de metadados de dono para admin, uso de serviço de exclusão. | Contexto para JOIN e CRUD, dono vem do ator no I, preservar coerência entre preview e confirmação. | Alta |
| `backend/routes/animaisRoutes.js` | CRUD, listagem por propriedade e helpers de parentesco | Valida propriedade, mãe e vínculos antes de gravar. Movimentação consulta associações, desmamas, pesagens e vacinas. | Executar validações e gravação na mesma transação. Rever referências invisíveis e concorrência de alteração de pai/filhos. | Crítica |
| `backend/routes/lotesRoutes.js` | CRUD e rotas de associação nos dois sentidos | Validam lote e animal em queries distintas, movimentação consulta vínculos, INSERT faz pré-checagem de duplicidade. | Checar os dois lados, mesma propriedade, e tratar concorrência pela PK. Estabelecer ordem de locks para mover/associar. | Alta |
| `backend/routes/vacinasRoutes.js` | CRUD de vacinas | Proprietário direto e bypass administrativo no SQL atual. | Executor com contexto, manter filtros e 409 por dependências quando aplicável. | Alta |
| `backend/routes/vacinacoesRoutes.js` | CRUD, próximas doses e por animal | SELECTs multi-JOIN, checagens separadas de origem/destino, filtros de delete e listagem diferentes. | Contexto nas duas pontas, garantir igualdade de donos no I/U e validar histórico antes do corte. | Crítica |
| `backend/routes/despesasRoutes.js` | CRUD, listagem e resumo por propriedade | Agregações e filtros dependem do gate anterior da propriedade. | Passar executor a cada consulta; unificar escopo do gate com listagem, resumo e categorias. Preservar períodos e limites. | Alta |
| `backend/routes/receitasRoutes.js` | CRUD, `validarAcessoPropriedade`, `GET /receitas/resumo` | O resumo usa dois SELECTs em `Promise.all`; destino checado fora do UPDATE. | Executar receitas/despesas com contexto único e snapshot coerente para totais. Validar origem e destino no U. | Alta |
| `backend/routes/producoesLeiteirasRoutes.js` | CRUD e resumo de produção por animal | Gate de animal, agregados paralelos e consultas por ID através do animal. | Encaminhar executor e alinhar os totais, séries e listagem. | Alta |
| `backend/routes/pesagensRoutes.js` | CRUD, resumos, `validarLote` | Transações próprias, `FOR UPDATE` e atualização do peso derivado. | Reusar executor, validar lote/autor e verificar `rowCount` na sincronização de peso. | Crítica |
| `backend/routes/desmamasRoutes.js` | criar, editar, concluir, cancelar, listar | Conclusão transacional pode criar pesagem, associar a lote e atualizar animal/desmama. | Reusar executor e tratar visibilidade/locks de cada escrita, preservando transições, histórico e rollback. | Crítica |
| `backend/services/acessoAnimais.js` | `buscarAnimalPermitido`, `buscarLoteCompativel`, `buscarMaeCompativel` | Executor padrão é o pool mesmo quando a rota já usa uma transação. | Tornar executor explícito para cada operação de domínio. | Alta |
| `backend/services/pesoAtual.js` | `bloquearAnimalParaPeso`, `sincronizarPesoAtual` | Helper recebe cliente, mas ignora retorno falso do bloqueio e resultado do UPDATE. | Falhar e reverter se o animal esperado não for bloqueado/atualizado; preservar regra de peso da última pesagem. | Alta |
| `backend/routes/dashboardRoutes.js` | `GET /dashboard` | Contagens e subconsultas de vários módulos e próximas vacinas; receitas têm tratamento próprio de tabela ausente. | Mesmo escopo em todas as consultas. Caso seja mantido fallback SQL, usar savepoint ou consulta compatível com o esquema para evitar transação abortada. | Alta |
| `backend/controllers/climaController.js` | `criarConsultarClima` | Leitura da propriedade e chamada ao Open-Meteo no mesmo handler. | Liberar cliente logo após leitura autorizada, antes da rede. | Média |

**Verificação de e-mail na DEV.** `prepararVerificacao` valida ticket com finalidade, e-mail vinculado e expiração; as operações são anteriores à sessão normal. `solicitarCodigo` usa bloqueios e invalida desafios anteriores, libera a transação antes de enviar e grava o resultado em consultas posteriores. `verificarCodigo` valida tentativas/código, atualiza `usuarios` e revoga sessões atomicamente. Manter HMAC do código e respostas que limitam enumeração. Vincular a confirmação de envio ao mesmo ID de desafio e estado, em transação separada. Tratar a trigger de troca de e-mail como operação restrita que reseta a verificação e revoga as sessões corretas. Preservar os tickets limitados a essa finalidade. Nenhuma recuperação de senha foi localizada nos routers e nos clientes inspecionados.

**Operações sem identidade.** `GET /` responde status sem SQL. O cadastro, login e refresh têm rate limit antes da identidade. A limpeza global de sessões ocorre na criação e a dos contadores é disparada por amostragem. Não foi localizado agendamento de manutenção no código/CI inspecionado. Os scripts `check-database.js` e `check-deletion-integrity.js` precisam de execução administrativa de leitura quando usados para inventário global. `check-security-readonly.js` deve passar a provar o comportamento do login real sem contexto, grants e policies. Os scripts `migrate-*.js` e `run-security-migrations.js` pertencem ao caminho administrativo fora do runtime; confirmar a credencial em cada runner antes de usá-los. Os scripts históricos de importação, bootstrap de admin, sequência, cópia e migração foram inventariados e ficaram sem execução.

## D. Arquitetura recomendada

1. **Identidade.** O Express valida assinatura HS256, algoritmo, emissor, audiência, expiração, `sub` inteiro positivo e `sid`. Uma operação SQL dedicada confirma conta ativa e sessão vigente e devolve projeção mínima. Em DEV, incluir verificação de e-mail. O middleware mantém `req.usuario` e `req.autenticacao`, mais `somenteAdmin` e reautenticação recente nas operações atuais. Identificadores em rota/body representam alvos. O ator vem exclusivamente desse contexto validado.
2. **Unidade transacional.** Para cada unidade SQL de negócio, obter um `PoolClient`, `BEGIN`, instalar contexto parametrizado e validar o ator, executar consultas e helpers com o mesmo cliente, então `COMMIT` ou `ROLLBACK` e `release` em finally. Se rollback falhar ou a conexão estiver quebrada, descartá-la. O handler envia o resultado HTTP depois do commit. Propagar o cliente para serviços existentes. Evitar `pool.query` dentro do callback e transações aninhadas; em recuperação específica usar savepoint explícito sem reconfigurar a identidade. Adoção de `REPEATABLE READ READ ONLY` para relatórios que exigem snapshot único depende de teste dos SQLs e uso restrito a leituras. Serializar operações no mesmo cliente ou combinar SQL em uma consulta. Manter rede, bcrypt e e-mail fora da transação.
3. **Contexto.** Preferir `SELECT pg_catalog.set_config('bovitrack.usuario_id', $1, true)` e `set_config('bovitrack.session_id',$2,true)` no cliente já em transação. `SET LOCAL` tem o mesmo ciclo de vida, com ergonomia inferior para bind de valores; não interpolar entrada. `current_setting(..., true)` pode devolver NULL ou string vazia após reset. Converter somente representação canônica entre 1 e 2147483647; rejeitar ausência, vazio, formato inválido, overflow, sessão inválida ou conta inativa. Revogação concorre com transações abertas. Para escrita administrativa sensível, revalidar e bloquear o registro relevante de usuário/sessão quando necessário, com ordem consistente. Não prometer revogação retroativa de transação já iniciada.
4. **Administrador.** Derivar perfil de `public.usuarios` no banco, associado a um ator e sessão válidos. O perfil no JWT ou um GUC booleano de admin não deve autorizar operações. Uma função de consulta `SECURITY DEFINER` com proprietário dedicado NOLOGIN/NOBYPASSRLS pode consultar a projeção mínima de usuário e sessão. Usar policies de leitura específicas para essa role, separadas por `TO`, de modo que a consulta dentro do DEFINER não reentre na policy de `usuarios` do runtime. A role do helper deve ficar fora da árvore de memberships do login. O helper devolve somente ator validado/perfil ou booleanos, sem senha, hash ou lista de sessões. Manter grants de coluna e escrita de perfil/status em operações separadas.
5. **Caminhos públicos e internos.** Criar funções de escopo estreito para lookup de credencial por e-mail, criação de conta comum, emissão de sessão após bcrypt, refresh/logout por hash, rate limit, manutenção, autoexclusão, suspensão e verificação futura. Usar roles NOLOGIN/NOBYPASSRLS proprietárias de funções, com policies específicas por comando e grants mínimos nas tabelas internas. Dar ao login EXECUTE apenas onde necessário, com `search_path` fixo e nomes de objeto qualificados, sem SQL dinâmico livre. Restringir separadamente SELECT da credencial de login. Se o modelo de ameaça exigir isolamento do caminho público contra execução arbitrária na conexão de domínio, usar credencial separada que só executa as funções públicas; o mesmo login com permissão para ambos os grupos pode chamar ambos em SQL.
6. **Limite de confiança dos GUCs.** Um executor que consegue rodar SQL arbitrário como runtime pode alterar GUCs. Validação de sessão por ID reduz erro de programação e contexto falso, mas uma sessão conhecida continua sensível. O modelo base confia no backend e em SQL parametrizado. Para cobrir falsificação por SQL arbitrário no runtime, adicionar atestado curto assinado pelo backend, validado no helper com chave fora dos grants de runtime, audiência própria, `sub`, `sid`, validade curta e vínculo à transação ou nonce de uso restrito. Projetar rotação e impedir acesso do SQL de domínio às operações de login privilegiadas. O desenho não depende de Supabase Auth, nem de `auth.uid()`, que não recebe o JWT próprio nesse protocolo.

O pooler de transações mantém a sessão de servidor durante uma transação explícita. `BEGIN` e os comandos seguintes precisam usar o mesmo cliente do `pg`. Após COMMIT/ROLLBACK, o próximo consumidor pode receber outra conexão física. Evitar SET persistente, prepared statements nomeados no modo transacional, estado dependente de sessão e locks consultivos de sessão. O catálogo comprova compatibilidade estrutural das roles. O endpoint implantado e o comportamento de reuso ainda precisam ser medidos pela credencial real em homologação. [Supabase, conexão PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) · [node-postgres, transações](https://node-postgres.com/features/transactions) · [PostgreSQL 17, SET](https://www.postgresql.org/docs/17/sql-set.html)

## E. Proposta de migrations e políticas

### E1. Preparar fronteiras de acesso

Inventariar grants e dependências por credencial efetiva. Criar schema privado `bovitrack_seg`, funções e roles dedicadas. Remover EXECUTE de PUBLIC na mesma transação de criação; conceder schema USAGE e EXECUTE nominalmente. Aplicar default privileges por role criadora real, incluindo para funções, sequências e tabelas. Tratar `service_role` conforme consumidores verificados, sem usá-la no Express. Reduzir grants de coluna em `usuarios` e grants diretos de tabelas internas após migrar chamadores. Tirar UPDATE dos vínculos se não há operação de atualização e garantir D para os fluxos autorizados de exclusão. Roles proprietárias de funções não devem possuir tabelas de negócio. Evitar funções genéricas que recebam nome de tabela, fragmento SQL ou ID de ator arbitrário.

Exemplo de parser do GUC, com retorno nulo para contexto inválido. A função efetivamente usada pelas policies deve conferir sessão e atividade conforme D. A leitura administrativa abaixo pressupõe `bovitrack_seg.ator_id()` e `bovitrack_seg.eh_admin()` resolvidas pelo helper restrito; `ator_id()` devolve NULL quando a sessão falha, e `eh_admin()` devolve FALSE nesse caso.

```sql
CREATE FUNCTION bovitrack_seg.usuario_id_contexto()
RETURNS integer LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN v ~ '^[1-9][0-9]{0,9}$'
              THEN CASE WHEN v::bigint <= 2147483647
                        THEN v::integer END
         END
  FROM (SELECT current_setting('bovitrack.usuario_id', true) AS v) AS contexto;
$$;
REVOKE ALL ON FUNCTION bovitrack_seg.usuario_id_contexto() FROM PUBLIC;
-- Conceder EXECUTE apenas à role do helper de identidade.
```

Para o bootstrap, conceder SELECT restrito de `usuarios(id,perfil,ativo)` e `sessoes_refresh(usuario_id,session_id,expires_at,revoked_at)` à role de leitura do helper, ampliando projeção somente na função que carrega nome/e-mail para o middleware. Em ambas as tabelas protegidas, políticas `FOR SELECT TO <role_do_helper>` com escopo por `sub`/`sid` e atividade, usando somente GUC bruto validado e colunas da própria linha. Fazer o JOIN com igualdade de ID e sessão, checar revogação/expiração e, na DEV, e-mail verificado. O runtime não herda a role interna. Funções de bootstrap e auth têm projeções e provas diferentes e suas políticas não chamam os helpers do domínio. Considerar `statement_timestamp()` para vigência na unidade e validar semântica de tempo versus o `CURRENT_TIMESTAMP` atual.

A unidade de bootstrap só recebe `sub` e `sid` depois da validação criptográfica do JWT. Ela configura os GUCs locais e executa somente a função que confirma a sessão. O middleware só popula `req.usuario` após esse retorno. Cada unidade de domínio subsequente reinstala os valores validados no próprio cliente e volta a confirmar vigência. Na emissão de uma nova sessão após bcrypt, revalidar atividade e o estado da credencial observado no lookup antes do INSERT, para evitar emitir sessão para credencial alterada durante a comparação. No refresh e logout, procurar a sessão pelo hash do cookie recebido, validar estado e executar rotação/revogação com bloqueio, sem aceitar ID de conta como substituto dessa prova.

### E2. Políticas de domínio, exemplos e expansão

```sql
CREATE POLICY propriedades_select ON public.propriedades FOR SELECT
TO bovitrack_runtime
USING (usuario_id = (SELECT bovitrack_seg.ator_id())
       OR (SELECT bovitrack_seg.eh_admin()));

CREATE POLICY propriedades_insert ON public.propriedades FOR INSERT
TO bovitrack_runtime
WITH CHECK (usuario_id = (SELECT bovitrack_seg.ator_id()));

CREATE POLICY propriedades_update ON public.propriedades FOR UPDATE
TO bovitrack_runtime
USING (usuario_id = (SELECT bovitrack_seg.ator_id())
       OR (SELECT bovitrack_seg.eh_admin()))
WITH CHECK (usuario_id = (SELECT bovitrack_seg.ator_id())
            OR (SELECT bovitrack_seg.eh_admin()));
-- Remover UPDATE de tabela antes de conceder UPDATE apenas nas colunas editáveis.
-- O grant de coluna deve excluir usuario_id também para o admin de aplicação.

CREATE POLICY propriedades_delete ON public.propriedades FOR DELETE
TO bovitrack_runtime
USING (usuario_id = (SELECT bovitrack_seg.ator_id())
       OR (SELECT bovitrack_seg.eh_admin()));

CREATE POLICY animais_select ON public.animais FOR SELECT TO bovitrack_runtime
USING (EXISTS (SELECT 1 FROM public.propriedades p
               WHERE p.id = animais.propriedade_id));

CREATE POLICY despesas_update ON public.despesas FOR UPDATE TO bovitrack_runtime
USING (EXISTS (SELECT 1 FROM public.propriedades p
               WHERE p.id = despesas.propriedade_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.propriedades p
                    WHERE p.id = despesas.propriedade_id));

CREATE POLICY animais_lotes_insert ON public.animais_lotes FOR INSERT
TO bovitrack_runtime
WITH CHECK (EXISTS (
  SELECT 1 FROM public.animais a JOIN public.lotes l
    ON l.propriedade_id = a.propriedade_id
  WHERE a.id = animais_lotes.animal_id AND l.id = animais_lotes.lote_id
));

CREATE POLICY vacinacoes_insert ON public.vacinacoes FOR INSERT TO bovitrack_runtime
WITH CHECK (EXISTS (
  SELECT 1
  FROM public.animais a JOIN public.propriedades p ON p.id = a.propriedade_id
  JOIN public.vacinas v ON v.usuario_id = p.usuario_id
  WHERE a.id = vacinacoes.animal_id AND v.id = vacinacoes.vacina_id
));
```

| Grupo | Expansão da proposta |
|---|---|
| Propriedades e vacinas | Quatro comandos separados. O admin pode consultar e gerenciar linhas globais segundo a matriz, e cria linhas em nome próprio. Excluir alteração do dono nos grants de coluna. |
| Animais, lotes, despesas, receitas | S/D por existência da propriedade visível; I por `WITH CHECK` da propriedade; U com propriedade visível na linha antiga e na nova. Manter regras de movimentação e conferir filhos e históricos sob concorrência. |
| Produção leiteira | S/I/U/D por animal visível. `WITH CHECK` avalia o animal do estado novo. |
| Vínculos e vacinações | Visibilidade por ambas as pontas para usuários comuns. Admin mantém visibilidade para remediar históricos. Aplicar igualdade de propriedade/dono nos estados novos. Testar D de vínculos e vacinação na exclusão de propriedade/conta. |
| Pesagens e desmamas | Visibilidade por animal. Novas referências opcionais exigem existência no escopo e igualdade de propriedade ou animal, mesmo quando a FK isolada aceita o ID. Na desmama, conferir sexo/mãe e estado. Proteger `registrado_por` e campos derivados por grant/operação. |
| Usuários | S da própria projeção ou admin; U só das colunas editáveis, sobre o próprio usuário ou alvo permitido. I e D por funções de criação/exclusão. Atualizações de senha, atividade e verificação por operações específicas. Guardar regra de proteção do admin. |
| Sessões, usados, limites e desafio de e-mail | Default deny para runtime. Policies por role executora e ação, com grants de coluna e funções de escopo estreito. Contadores exigem S/I/U para upsert; expiração tem D específico. |

O encadeamento de policies é acíclico: propriedade e vacina são raízes de domínio, animal/lote/despesa/receita dependem da propriedade, produção/pesagem/desmama dependem do animal e associação/vacinação dependem das duas pontas. A leitura de pesagem na verificação de desmama pode depender do animal, sem dependência reversa. Checks sobre descendentes em movimentações devem ficar em constraints ou validações transacionais, evitando dependência circular de policies. Um role grant ou policy permissiva extra combina por OR com as existentes; valide o conjunto efetivo e use policies restritivas apenas com uma permissiva aplicável.

FK/UNIQUE e ações referenciais verificam integridade além das linhas visíveis em RLS, podendo revelar existência via erros e efetuar CASCADE/SET NULL em linhas fora do resultado de um SELECT comum. Os DELETEs explícitos em `impactoExclusao.js` obedecem a RLS. Um filho invisível pode causar 23503 no pai, omitir itens da prévia ou ficar de fora de uma etapa. Triggers INVOKER podem esconder inconsistências. Corrigir comparações vulneráveis a NULL, qualificar nomes e validar existência das referências. Priorizar constraints relacionais e validações no estado novo. Se uma verificação precisar enxergar linhas ocultas, limitar uma função de integridade a verificação booleana, role de leitura dedicada e erros opacos, com concorrência coberta em teste. [PostgreSQL 17, segurança de linha](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) · [PostgreSQL 17, CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html)

### E3. Ativação e reversão SQL

Preparar migrations separadas para grants/helpers, políticas em estado inativo e ativação. Habilitar RLS por coorte coerente de dependências após o deploy compatível, somente depois de testar as policies com o login real. Uma política de filho que confia na visibilidade do pai exige que a policy do pai esteja ativa na mesma coorte ou que já exista predicado explícito de dono. Deixar as policies instaladas em rollback operacional de RLS quando a referência anterior tiver RLS desabilitado, registrar flags e ACLs anteriores, e reverter grants apenas com o pacote de rollback compatível. Verificar a restauração de cada fluxo do app anterior. Avaliar FORCE separadamente para owners não privilegiados; o runtime já não é proprietário, e `postgres` conserva BYPASSRLS.

```sql
-- Exemplo de transação de corte da coorte financeira, depois das suas
-- políticas e da política da propriedade estarem instaladas.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.propriedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
COMMIT;

-- Exemplo de reversão dessas flags para a linha de base observada.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.receitas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.propriedades DISABLE ROW LEVEL SECURITY;
COMMIT;
```

Esse exemplo delimita o SQL de flags. O corte real precisa levar em conta os filhos já ativados, clientes antigos e grants revogados no mesmo release.

## F. Riscos

| Criticidade | Risco | Controle para o corte |
|---|---|---|
| Crítico | Ativar com `pool.query` fora de contexto ou bootstrap preso em RLS. | Executor único, caminho explícito para auth e testes com login não privilegiado. |
| Crítico | Login ou segredo administrativo exposto a toda query ou usuário muda `perfil` via UPDATE. | Grants de coluna, funções estreitas e perfil consultado no banco com sessão vigente. Garantir que runtime não consegue SET ROLE de executor interno. |
| Crítico | Trigger de integridade deixa de ver filhos/referências, ou exclusão/associação afeta outro dono. | Preflight de consistência, predicates das duas pontas, triggers testadas sob a role real, validação de DELETE/SET NULL/CASCADE e travas coerentes. |
| Alto | Migration 012 divergente e 013 incompatível com o estado vivo. | Reconciliar definições/índices em homologação, testar coorte de e-mail com dados legados e ajustar a política ampla. |
| Alto | Privilégios amplos de `service_role` e defaults reintroduzem acesso. | Inventariar consumidores, restringir defaults e validar privilégios após cada migration. Manter a API sem exposição. |
| Alto | O dashboard retorna zeros/parciais ou o resumo muda silenciosamente após RLS. | Comparar IDs, paginação, contagens, valores e próximos vencimentos por perfil antes/depois. |
| Alto | Contexto falsificado se houver SQL injection/execução arbitrária. | Parâmetros, executor limitado, validação de sessão e, se esse for o modelo de ameaça, atestado e credencial separada. |
| Médio | Bloqueio, deadlocks e excesso de conexões sob concorrência na Vercel. | Unidades SQL curtas, ordem estável de locks, timeouts, monitorar espera no pool e SQLSTATE 40P01/40001. Repetir apenas unidades idempotentes em novo cliente/contexto. |
| Médio | Vazamento de existência via erros de FK/unique/trigger, enumeração no cadastro ou alteração de status HTTP. | Mensagens sem detalhe SQL, decisão uniforme 403/404 por contrato, 23505/23503/23514 tratados conforme operação, 42501 monitorado. Manter proteção existente e revisar a resposta 409 explícita do cadastro da árvore main. |
| Baixo | View futura com owner que contorna RLS. | Revisar novos grants e usar `security_invoker=true` nas views de domínio apropriadas ao PG 17. Revisar materializações como novos objetos com ACL própria. |

As queries examinadas passam valores via parâmetros de `pg`. A construção dinâmica em `construirFiltro`, despesas e sufixos `FOR UPDATE` usa aliases/fragmentos controlados e parâmetros gerados. Isso não equivale a teste de exploração de todos os caminhos. A camada RLS deve manter proteção mesmo quando um filtro de linha do Express for esquecido. Logs atuais registram código/tipo e retiram metadados sensíveis; preservar essa disciplina para falhas de contexto e remover detalhes de constraints da resposta pública quando houver risco de revelar linhas.

## G. Ordem de implementação e ativação

1. **Preparação.** Confirmar SHA e ambiente implantados, porta/modo do pooler, TLS, credencial efetiva e quotas sem exportar valores sensíveis. Comparar catálogo com a linha de base registrada. Decidir o release de e-mail e reconciliar a 012 em banco de homologação representativo.
2. **Contexto.** Implementar o executor e a separação dos caminhos públicos e autenticados com RLS ainda desligado. Migrar primeiro login/cadastro/refresh/ratelimit e depois usuários e serviços de exclusão. Migrar todos os executores de domínio. Checar cliente por transação e impedir consultas de domínio sem o helper.
3. **Migrations de preparação.** Criar schema privado, helpers, roles, policies e grants mínimos. Validar PK/FK e integridade sob a role que executará cada fluxo. Planejar os índices da seção H separadamente. Fazer backup e ensaio de restauração em homologação. Confirmar o plano de PITR/backup disponível no projeto.
4. **Compatibilidade e homologação.** Ativar RLS em clone/ambiente isolado e executar a matriz H, inclusive contra pooler transacional com fixtures de duas contas e admin. Comparar release anterior com a candidata em cada contrato HTTP. Executar testes de carga e capturar planos com os dois perfis.
5. **Ativação gradual.** Implantar o backend compatível antes de alterar flags. Drenar versões antigas, inclusive conexões e previews que compartilhem o banco. Ativar primeiro uma coorte coerente de domínio com escopo já funcional; incluir tabelas internas e de identidade em janela separada, com probes de login e rotação. Enquanto houver exceção temporária de grants, registrá-la e encerrá-la após confirmar que todos os consumidores usam a nova interface.
6. **Critério de rollback.** Vazamento de qualquer linha, falhas de login/cadastro/refresh, aumento sustentado de 5xx/42501/timeouts sobre a linha de base, contagens divergentes, exclusões incompletas e contenção acima do limite acordado interrompem a promoção. Em indisponibilidade, reverter flags/grants da coorte e voltar ao release compatível. Em incidente de isolamento, restringir o tráfego afetado antes de considerar restauração de acesso amplo. Restaurar dados somente diante de incidente de integridade com plano próprio, preservando escritas legítimas posteriores.

## H. Checklist de testes e desempenho

- [ ] Tabelas de domínio testadas com A, B e admin via a role real. Exercitar S/I/U/D por ID direto, listagem, JOIN e IDs inexistentes. Checar GET de propriedade de B por A, animal de B, troca de propriedade, tentativas de gravar `usuario_id`, perfil, ativo e autor. Garantir que zero linhas não seja tratado como sucesso de mutação.
- [ ] Inserção/mudança de animal e lote, associação em ambos os sentidos, vacinação com vacina de outro dono, produção, despesa/receita em outra propriedade, pesagem com lote errado e desmama com mãe, lote ou pesagem incompatíveis. Incluir admin para testar a invariável entre entidades mesmo com acesso global.
- [ ] Cadastro válido e duplicado, perfil forjado, senha inválida, login de admin, ativo/inativo, refresh válido, expirado, revogado, simultâneo, replay, logout e logout-all. Verificar proteção CSRF e cookies. JWT inválido, expirado, `sid` trocado, contexto ausente, vazio, malformado e fora do intervalo. Confirmar zero acesso de domínio sem contexto.
- [ ] Em DEV, ticket de verificação expirado, vinculado a outro endereço, código inválido/expirado/usado, concorrência, falha de envio, reenvio, mudança de e-mail, revogação de sessão e novo login. Assegurar caminho administrativo e cadastro público com o mesmo contrato atual.
- [ ] Preview e exclusão confirmada de propriedade/conta, autoexclusão e exclusão por admin com reautenticação recente; proteção do admin principal. Verificar contagens, bloqueios de concorrência, FKs, SET NULL, CASCADE, limpeza de sessões e rollback após erro injetado. Confirmar que B permanece intacto.
- [ ] Dashboard admin global, dashboard usuário, totais de despesas/receitas por período e categoria, leite por turno, próximas vacinas e peso sincronizado. Medir distribuição de latência e diferenças de resultados com fixtures e volume representativo.
- [ ] Forçar reuso com pool pequeno, A e B em concorrência, admin seguido de comum, commit, rollback, erro de statement, timeout, desconexão e encerramento da requisição. Testar reset dos GUCs e deny sem contexto no mesmo cliente reutilizado. Conferir ausência de query externa à unidade e de conexões presas após erro.
- [ ] Testar grants e políticas por role, ausência de acesso direto a hashes/credenciais, EXECUTE público ou SET ROLE interno. Medir waits, deadlocks e tempo de transação com estatísticas do pool, Vercel e Supabase sem logar JWTs, hashes ou SQL com parâmetros sensíveis.

**Índices observados e candidatos.** A lista completa de índices atuais está no apêndice. Já existem `propriedades(usuario_id)`, `vacinas(usuario_id)`, `receitas(propriedade_id,data DESC,id DESC)`, `pesagens(animal_id,data_pesagem DESC,id DESC)`, `desmamas(animal_id,data_planejada DESC,id DESC)`, `producoes_leiteiras(animal_id,data DESC)` e os índices de lookup das sessões. O índice por propriedade de animais é parcial por brinco preenchido; a PK da associação começa por animal. Os seguintes índices previstos na 012 estão ausentes no catálogo. Validar os candidatos com `EXPLAIN (ANALYZE, BUFFERS)` em homologação, com volumes representativos e role/policy efetivas:

- `animais_propriedade_id_idx`, `lotes_propriedade_id_idx`, `despesas_propriedade_data_idx` para escopo, relatórios e exclusão do pai.
- `vacinacoes_animal_data_idx`, `vacinacoes_vacina_id_idx`, `animais_lotes_lote_id_idx`, `desmamas_mae_id_idx` para caminho inverso, FKs e histórico.
- Medir separadamente se os scans de FK por `registrado_por` em pesagens/desmamas ou por `sessao_id` em usados merecem índice. A PK e os índices por família/hash existentes atendem acessos distintos.

Usar consultas estáveis por statement para avaliar ator/admin e medir o custo de EXISTS aninhados por perfil. Criar índices aprovados em fase independente e avaliar `CREATE INDEX CONCURRENTLY` com a conexão administrativa apropriada. O pool padrão de 2 é por instância, logo a soma depende da concorrência e do número de funções/deployments ativos. Observar filas, tempo em transação, round trips e limite de conexões do pooler. O cliente `pg` e o servidor têm timeouts distintos; testar timeout no pooler e assegurar rollback/descarte sem reaproveitar estado residual.

## I. Estimativa de complexidade

| Alteração | Complexidade | Motivo |
|---|---|---|
| Executor e adoção em consultas simples | Moderada | Reaproveitar cliente, preservar retorno e tratar rollback. Rotas simples de vacina/clima têm migração localizada. |
| Login, sessão, rate limit, bootstrap e grants de coluna | Complexa | Entrada sem identidade de domínio, proteção de credenciais, rotação/replay e concorrência. |
| Propriedades, vacinas e escopo financeiro | Moderada | Predicados diretos ou via propriedade, integração de listagem e totais. |
| Movimentação, associação, vacinação e manejo | Complexa | Regras envolvendo várias entidades, triggers, visibilidade e locks. |
| Administração e exclusão | Complexa | Separação ator/alvo, revogação, conta protegida, prévia e dependências. |
| Reconciliação 012 e homologação de 013 | Complexa | Divergência de integridade viva e impacto em contas legadas. |
| Revisão de índices e validação de grants | Moderada | Comparar catálogo e planos, aplicar mudanças reversíveis com donos corretos. |
| Atualização de smoke tests e documentação | Simples | Registrar cenário, perfil e resultados, além de atualizar checks administrativos. |
| Testes de concorrência e corte | Complexa | Ambiente realista, pool transacional, reuso e rollback coordenado. |

## J. Conclusão

1. **Pronto para ativar?** Ainda precisa de executor transacional, ponte de autenticação, proteção das rotinas internas, políticas administrativas e reconciliação de integridade.
2. **Quantas tabelas?** 15 tabelas confirmadas no Supabase entram no plano de políticas, incluindo 3 internas acessadas por funções restritas. A tabela `verificacoes_email` é a 16ª somente se o esquema da DEV for adotado.
3. **Quantos arquivos?** 23 arquivos existentes de runtime da árvore auditada foram identificados na seção C para o desenho proposto. A DEV tem mais um arquivo de serviço confirmado para adaptar. Migrations, testes e ferramentas de verificação estão fora dessa contagem.
4. **Manter autenticação?** Sim. Preservar JWT próprio, verificação server-side da sessão, refresh em cookie HttpOnly, autorização do Express e contratos de frontend.
5. **Pooler compatível?** O modo transacional documentado é compatível com contexto local por transação no mesmo cliente. A configuração efetiva do deployment ficou pendente.
6. **Maior risco de incompatibilidade?** Login/cadastro/refresh, verificação de e-mail da DEV, administração e exclusões encadeadas, movimentação/associações, pesagem/desmama e agregações que podem retornar resultados parciais.
7. **Estratégia mais segura?** Implantar primeiro o backend com contexto e caminhos internos, reconciliar as migrations, provar isolamento em homologação com o pooler e o login reais, então ativar coortes de tabelas com dependências e rollback verificados.

## Apêndice 1. Índices da aplicação observados no catálogo

Todos os índices abaixo são B-tree. UNIQUE inclui os índices de PK. Os nomes e predicados refletem o catálogo, com a cláusula de criação abreviada.

| Tabela | Índices |
|---|---|
| `animais` | `animais_pkey` `UNIQUE (id)`<br>`animais_mae_id_idx` `(mae_id)`<br>`animais_propriedade_numero_brinco_uidx` `UNIQUE (propriedade_id, numero_brinco) WHERE (numero_brinco IS NOT NULL)` |
| `animais_lotes` | `animais_lotes_pkey` `UNIQUE (animal_id, lote_id)` |
| `desmamas` | `desmamas_pkey` `UNIQUE (id)`<br>`desmamas_animal_data_idx` `(animal_id, data_planejada DESC, id DESC)`<br>`desmamas_status_data_idx` `(status, data_planejada)`<br>`desmamas_lote_destino_id_idx` `(lote_destino_id)`<br>`desmamas_peso_desmama_id_key` `UNIQUE (peso_desmama_id)`<br>`desmamas_definitiva_unica_idx` `UNIQUE (animal_id) WHERE (((tipo_desmama)::text <> 'TEMPORARIA'::text) AND ((status)::text <> 'CANCELADA'::text))` |
| `despesas` | `despesas_pkey` `UNIQUE (id)` |
| `limites_requisicao` | `limites_requisicao_pkey` `UNIQUE (escopo, chave_hash, janela_inicio)`<br>`limites_requisicao_expira_idx` `(janela_fim)` |
| `lotes` | `lotes_pkey` `UNIQUE (id)` |
| `pesagens` | `pesagens_pkey` `UNIQUE (id)`<br>`pesagens_tipo_idx` `(tipo_pesagem)`<br>`pesagens_lote_id_idx` `(lote_id)`<br>`pesagens_animal_data_idx` `(animal_id, data_pesagem DESC, id DESC)` |
| `producoes_leiteiras` | `producoes_leiteiras_pkey` `UNIQUE (id)`<br>`producoes_leiteiras_animal_data_idx` `(animal_id, data DESC)` |
| `propriedades` | `propriedades_pkey` `UNIQUE (id)`<br>`propriedades_usuario_id_idx` `(usuario_id)` |
| `receitas` | `receitas_pkey` `UNIQUE (id)`<br>`receitas_categoria_idx` `(categoria)`<br>`receitas_propriedade_data_idx` `(propriedade_id, data DESC, id DESC)` |
| `sessoes_refresh` | `sessoes_refresh_pkey` `UNIQUE (id)`<br>`sessoes_refresh_ativa_idx` `(usuario_id, session_id) WHERE (revoked_at IS NULL)`<br>`sessoes_refresh_family_id_idx` `(family_id)`<br>`sessoes_refresh_expires_at_idx` `(expires_at)`<br>`sessoes_refresh_token_hash_key` `UNIQUE (token_hash)`<br>`sessoes_refresh_usuario_id_idx` `(usuario_id)`<br>`sessoes_refresh_session_id_uidx` `UNIQUE (session_id)` |
| `sessoes_refresh_usados` | `sessoes_refresh_usados_pkey` `UNIQUE (token_hash)`<br>`sessoes_refresh_usados_expira_idx` `(expires_at)`<br>`sessoes_refresh_usados_family_idx` `(family_id)` |
| `usuarios` | `usuarios_pkey` `UNIQUE (id)`<br>`usuarios_email_key` `UNIQUE (email)`<br>`usuarios_admin_unico_idx` `UNIQUE (perfil) WHERE ((perfil)::text = 'admin'::text)` |
| `vacinacoes` | `vacinacoes_pkey` `UNIQUE (id)` |
| `vacinas` | `vacinas_pkey` `UNIQUE (id)`<br>`vacinas_usuario_id_idx` `(usuario_id)` |

## Apêndice 2. Tabelas gerenciadas do Supabase

39 tabelas gerenciadas adicionais, incluindo a tabela particionada `realtime.messages`. A matriz CRUD da aplicação não se aplica a esses esquemas. Os consumidores são serviços e operadores de plataforma, definidos pelas ACLs gerenciadas. Nenhuma policy foi encontrada no catálogo e todas as flags FORCE estavam desligadas. As chaves abaixo incluem PKs e FKs, e o inventário não inclui catálogos nativos do PostgreSQL.

| Tabela | Proprietário | RLS | PK e FKs | Índices |
|---|---|---|---|---|
| `auth.audit_log_entries` | `supabase_auth_admin` | ON | `PRIMARY KEY (id)` | `audit_log_entries_pkey, audit_logs_instance_id_idx` |
| `auth.custom_oauth_providers` | `supabase_auth_admin` | OFF | `PRIMARY KEY (id)` | `custom_oauth_providers_created_at_idx, custom_oauth_providers_enabled_idx, custom_oauth_providers_identifier_idx, custom_oauth_providers_identifier_key, custom_oauth_providers_pkey, custom_oauth_providers_provider_type_idx` |
| `auth.flow_state` | `supabase_auth_admin` | ON | `PRIMARY KEY (id)` | `flow_state_created_at_idx, flow_state_pkey, idx_auth_code, idx_user_id_auth_method` |
| `auth.identities` | `supabase_auth_admin` | ON | `PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `identities_email_idx, identities_pkey, identities_provider_id_provider_unique, identities_user_id_idx` |
| `auth.instances` | `supabase_auth_admin` | ON | `PRIMARY KEY (id)` | `instances_pkey` |
| `auth.mfa_amr_claims` | `supabase_auth_admin` | ON | `PRIMARY KEY (id) \| FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE` | `amr_id_pk, mfa_amr_claims_session_id_authentication_method_pkey` |
| `auth.mfa_challenges` | `supabase_auth_admin` | ON | `FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE \| PRIMARY KEY (id)` | `mfa_challenge_created_at_idx, mfa_challenges_pkey` |
| `auth.mfa_factors` | `supabase_auth_admin` | ON | `PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `factor_id_created_at_idx, mfa_factors_last_challenged_at_key, mfa_factors_pkey, mfa_factors_user_friendly_name_unique, mfa_factors_user_id_idx, unique_phone_factor_per_user` |
| `auth.mfa_recovery_code_sets` | `supabase_auth_admin` | OFF | `FOREIGN KEY (mfa_factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE \| PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `mfa_recovery_code_sets_mfa_factor_id_key, mfa_recovery_code_sets_pkey, mfa_recovery_code_sets_user_id_key` |
| `auth.mfa_recovery_codes` | `supabase_auth_admin` | OFF | `FOREIGN KEY (mfa_recovery_code_set_id) REFERENCES auth.mfa_recovery_code_sets(id) ON DELETE CASCADE \| PRIMARY KEY (id)` | `mfa_recovery_codes_pkey, mfa_recovery_codes_set_id_idx` |
| `auth.oauth_authorizations` | `supabase_auth_admin` | OFF | `FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE \| PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `oauth_auth_pending_exp_idx, oauth_authorizations_authorization_code_key, oauth_authorizations_authorization_id_key, oauth_authorizations_pkey` |
| `auth.oauth_client_states` | `supabase_auth_admin` | OFF | `PRIMARY KEY (id)` | `idx_oauth_client_states_created_at, oauth_client_states_pkey` |
| `auth.oauth_clients` | `supabase_auth_admin` | OFF | `PRIMARY KEY (id)` | `oauth_clients_deleted_at_idx, oauth_clients_pkey` |
| `auth.oauth_consents` | `supabase_auth_admin` | OFF | `FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE \| PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `oauth_consents_active_client_idx, oauth_consents_active_user_client_idx, oauth_consents_pkey, oauth_consents_user_client_unique, oauth_consents_user_order_idx` |
| `auth.one_time_tokens` | `supabase_auth_admin` | ON | `PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `one_time_tokens_pkey, one_time_tokens_relates_to_hash_idx, one_time_tokens_token_hash_hash_idx, one_time_tokens_user_id_token_type_key` |
| `auth.refresh_tokens` | `supabase_auth_admin` | ON | `PRIMARY KEY (id) \| FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE` | `refresh_tokens_instance_id_idx, refresh_tokens_instance_id_user_id_idx, refresh_tokens_parent_idx, refresh_tokens_pkey, refresh_tokens_session_id_revoked_idx, refresh_tokens_token_unique, refresh_tokens_updated_at_idx` |
| `auth.saml_providers` | `supabase_auth_admin` | ON | `PRIMARY KEY (id) \| FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE` | `saml_providers_entity_id_key, saml_providers_pkey, saml_providers_sso_provider_id_idx` |
| `auth.saml_relay_states` | `supabase_auth_admin` | ON | `FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE \| PRIMARY KEY (id) \| FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE` | `saml_relay_states_created_at_idx, saml_relay_states_for_email_idx, saml_relay_states_pkey, saml_relay_states_sso_provider_id_idx` |
| `auth.schema_migrations` | `supabase_auth_admin` | ON | `PRIMARY KEY (version)` | `schema_migrations_pkey` |
| `auth.scim_tokens` | `supabase_auth_admin` | OFF | `PRIMARY KEY (id) \| FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE` | `scim_tokens_expires_at_idx, scim_tokens_pkey, scim_tokens_revoked_at_idx, scim_tokens_sso_provider_id_idx, scim_tokens_token_hash_key` |
| `auth.scim_users` | `supabase_auth_admin` | OFF | `PRIMARY KEY (id) \| FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL` | `scim_users_created_at_idx, scim_users_deleted_at_idx, scim_users_external_id_key, scim_users_id_idx, scim_users_pkey, scim_users_sso_provider_id_idx, scim_users_updated_at_idx, scim_users_user_id_idx, scim_users_user_name_idx, scim_users_user_name_key` |
| `auth.sessions` | `supabase_auth_admin` | ON | `FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE \| PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `sessions_not_after_idx, sessions_oauth_client_id_idx, sessions_pkey, sessions_user_id_idx, user_id_created_at_idx` |
| `auth.sso_domains` | `supabase_auth_admin` | ON | `PRIMARY KEY (id) \| FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE` | `sso_domains_domain_idx, sso_domains_pkey, sso_domains_sso_provider_id_idx` |
| `auth.sso_providers` | `supabase_auth_admin` | ON | `PRIMARY KEY (id)` | `sso_providers_pkey, sso_providers_resource_id_idx, sso_providers_resource_id_pattern_idx` |
| `auth.users` | `supabase_auth_admin` | ON | `PRIMARY KEY (id)` | `confirmation_token_idx, email_change_token_current_idx, email_change_token_new_idx, idx_users_created_at_desc, idx_users_email, idx_users_last_sign_in_at_desc, idx_users_name, reauthentication_token_idx, recovery_token_idx, users_email_partial_key, users_instance_id_email_idx, users_instance_id_idx, users_is_anonymous_idx, users_phone_key, users_pkey` |
| `auth.webauthn_challenges` | `supabase_auth_admin` | OFF | `PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `webauthn_challenges_expires_at_idx, webauthn_challenges_pkey, webauthn_challenges_user_id_idx` |
| `auth.webauthn_credentials` | `supabase_auth_admin` | OFF | `PRIMARY KEY (id) \| FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | `webauthn_credentials_credential_id_key, webauthn_credentials_pkey, webauthn_credentials_user_id_idx` |
| `realtime.messages` | `supabase_realtime_admin` | ON | `PRIMARY KEY (id, inserted_at)` | `messages_inserted_at_topic_index, messages_pkey` |
| `realtime.schema_migrations` | `supabase_admin` | OFF | `PRIMARY KEY (version)` | `schema_migrations_pkey` |
| `realtime.subscription` | `supabase_realtime_admin` | OFF | `PRIMARY KEY (id)` | `ix_realtime_subscription_entity, pk_subscription, subscription_subscription_id_entity_filters_action_filter_selec` |
| `storage.buckets` | `supabase_storage_admin` | ON | `PRIMARY KEY (id)` | `bname, buckets_pkey` |
| `storage.buckets_analytics` | `supabase_storage_admin` | ON | `PRIMARY KEY (id)` | `buckets_analytics_pkey, buckets_analytics_unique_name_idx` |
| `storage.buckets_vectors` | `supabase_storage_admin` | ON | `PRIMARY KEY (id)` | `buckets_vectors_pkey` |
| `storage.migrations` | `supabase_storage_admin` | ON | `PRIMARY KEY (id)` | `migrations_name_key, migrations_pkey` |
| `storage.objects` | `supabase_storage_admin` | ON | `FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id) \| PRIMARY KEY (id)` | `idx_objects_bucket_id_name, idx_objects_bucket_id_name_lower, idx_objects_current_version, idx_objects_delete_markers, idx_objects_null_version, name_prefix_search, objects_bucket_id_name_version_key, objects_pkey` |
| `storage.s3_multipart_uploads` | `supabase_storage_admin` | ON | `FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id) \| PRIMARY KEY (id)` | `idx_multipart_uploads_list, s3_multipart_uploads_pkey` |
| `storage.s3_multipart_uploads_parts` | `supabase_storage_admin` | ON | `FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id) \| PRIMARY KEY (id) \| FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE` | `s3_multipart_uploads_parts_pkey` |
| `storage.vector_indexes` | `supabase_storage_admin` | ON | `FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id) \| PRIMARY KEY (id)` | `vector_indexes_name_bucket_id_idx, vector_indexes_pkey` |
| `vault.secrets` | `supabase_admin` | OFF | `PRIMARY KEY (id)` | `secrets_name_idx, secrets_pkey` |

## Apêndice 3. Inventário estático de chamadas SQL no runtime

221 pontos sintáticos de `.query()` ou `.connect()` em 21 arquivos da árvore auditada. Inclui BEGIN, COMMIT, ROLLBACK e chamadas com executor injetado. Conta pontos de código, sem inferir volume, quantidade de statements efetivamente executados ou unicidade do SQL. A seção C documenta o impacto por fluxo. Os scripts administrativos, os testes e as diferenças da DEV são tratados separadamente.

| Arquivo | Linhas no checkout auditado |
|---|---|
| [backend/controllers/climaController.js](backend/controllers/climaController.js#L10) | 10 |
| [backend/middleware/autenticacao.js](backend/middleware/autenticacao.js#L51) | 51 |
| [backend/routes/animaisRoutes.js](backend/routes/animaisRoutes.js#L50) | 50, 101, 161, 175, 204, 219, 230, 246, 302, 315, 333, 344, 361, 396, 470 |
| [backend/routes/authRoutes.js](backend/routes/authRoutes.js#L84) | 84 |
| [backend/routes/dashboardRoutes.js](backend/routes/dashboardRoutes.js#L12) | 12, 70, 87 |
| [backend/routes/desmamasRoutes.js](backend/routes/desmamasRoutes.js#L28) | 28, 54, 71, 122, 131, 174, 183, 213, 214, 216, 218, 222, 227, 231, 233, 246, 250, 253, 276, 277, 280, 284, 288, 294, 300, 304, 311, 314, 320, 331, 335, 339, 347, 355, 362, 365, 384, 428 |
| [backend/routes/despesasRoutes.js](backend/routes/despesasRoutes.js#L31) | 31, 45, 78, 110, 148, 162, 176, 231, 278, 405, 442, 565, 578 |
| [backend/routes/lotesRoutes.js](backend/routes/lotesRoutes.js#L15) | 15, 47, 91, 105, 138, 151, 165, 189, 238, 286, 301, 324, 337, 376, 391, 427, 472, 487 |
| [backend/routes/pesagensRoutes.js](backend/routes/pesagensRoutes.js#L57) | 57, 87, 95, 155, 156, 159, 163, 168, 178, 181, 197, 198, 199, 209, 214, 219, 228, 231, 244, 245, 246, 256, 260, 272, 276, 279, 313 |
| [backend/routes/producoesLeiteirasRoutes.js](backend/routes/producoesLeiteirasRoutes.js#L39) | 39, 108, 184, 222, 271, 319 |
| [backend/routes/propriedadesRoutes.js](backend/routes/propriedadesRoutes.js#L41) | 41, 79, 154, 186 |
| [backend/routes/receitasRoutes.js](backend/routes/receitasRoutes.js#L168) | 168, 196, 236, 268, 275, 299, 320, 344, 383 |
| [backend/routes/usuariosRoutes.js](backend/routes/usuariosRoutes.js#L28) | 28, 68, 139, 209 |
| [backend/routes/vacinacoesRoutes.js](backend/routes/vacinacoesRoutes.js#L32) | 32, 47, 67, 99, 165, 206, 249, 266, 281, 301, 356, 397, 412 |
| [backend/routes/vacinasRoutes.js](backend/routes/vacinasRoutes.js#L20) | 20, 46, 69, 105, 139 |
| [backend/services/acessoAnimais.js](backend/services/acessoAnimais.js#L4) | 4, 20, 34 |
| [backend/services/impactoExclusao.js](backend/services/impactoExclusao.js#L151) | 151, 164, 249, 258, 261, 269, 273, 322, 342, 376, 385, 406, 423, 551, 560, 563, 568, 572 |
| [backend/services/limitesRequisicao.js](backend/services/limitesRequisicao.js#L15) | 15, 26 |
| [backend/services/pesoAtual.js](backend/services/pesoAtual.js#L2) | 2, 11 |
| [backend/services/sessoes.js](backend/services/sessoes.js#L136) | 136, 139, 140, 149, 152, 159, 170, 172, 187, 190, 191, 204, 215, 221, 224, 227, 236, 240, 247, 253, 270, 280, 282, 285, 290, 298, 305, 307, 315 |
| [backend/services/usuarios.js](backend/services/usuarios.js#L53) | 53, 67, 85, 87, 88, 96, 102, 109, 112 |

## Referências

- Escopo, bypass, permissões e integridade referencial. [PostgreSQL 17, Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) · [PostgreSQL 17, CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html)
- Ciclo de vida do contexto local e uso do cliente. [PostgreSQL 17, SET](https://www.postgresql.org/docs/17/sql-set.html) · [PostgreSQL 17, funções de configuração](https://www.postgresql.org/docs/17/functions-admin.html) · [node-postgres, transações](https://node-postgres.com/features/transactions)
- Pooler, segurança da Data API e custo de RLS. [Supabase, conexão PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Supabase, proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api) · [Supabase, Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Reprodução da leitura do catálogo

Usar `pg_class`, `pg_namespace` e `pg_attribute` para owners, tipos e flags, `pg_constraint` e `pg_index` com as funções `pg_get_*def` para chaves/índices, `pg_trigger` e `pg_proc` para triggers e rotinas, `pg_policies` e `pg_rewrite/pg_depend` para políticas e dependências de views. Conferir `pg_roles`, `pg_auth_members`, `pg_default_acl` e `has_table_privilege` para privilégios herdados. Consultar somente as chaves PostgREST pertinentes de `pg_db_role_setting`. O preflight de integridade usa `count(*)` sobre JOINs de filhos e pais e retorna somente agregados. Conferir novamente imediatamente antes do corte.
