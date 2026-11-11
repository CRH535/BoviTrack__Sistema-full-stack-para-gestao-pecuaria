# Implementação de RLS no BoviTrack

## Escopo

Implementação na branch `feat/rls-bovitrack`, criada da DEV local em `91a07aa` para incorporar a verificação de e-mail. O [relatório de auditoria](AUDITORIA_RLS_BOVITRACK.md) foi a referência de autorização e integridade. A nova leitura do catálogo Supabase confirmou 15 tabelas, zero policies, zero tabelas com RLS ativo e ausência de `verificacoes_email` e dos sete índices da 012. Essa leitura foi a única ação no banco remoto.

## Arquitetura

- `backend/database/contextoRls.js` abre uma transação no cliente `pg`, recebe um desafio PostgreSQL vinculado ao xid da transação, calcula HMAC-SHA256 com chave exclusiva, grava os parâmetros via `set_config(..., true)` e revalida sessão, atividade, verificação de e-mail e perfil antes do SQL de domínio. O HMAC vincula xid, ID, sessão e finalidade. A role runtime não lê a chave, a role que possui o helper é NOLOGIN e o contexto expira no fim da transação.
- O middleware valida o JWT atual e faz o bootstrap pela mesma função restrita. As rotas de domínio passam o cliente explícito para consultas e serviços. O executor confirma a transação antes da resposta de sucesso, reverte as respostas de erro e descarta o cliente se rollback falhar ou o driver expirar a leitura. Open-Meteo, Resend e bcrypt ocorrem fora de transações de domínio. O acesso a clima encerra a leitura antes de iniciar a chamada externa.
- `backend/database/poolAutenticacao.js` separa o login SQL de autenticação. A role de grupo recebe EXECUTE nas operações públicas e nenhum CRUD nas tabelas. As funções acessam dados via proprietários NOLOGIN, NOBYPASSRLS, sem ownership das tabelas, com `search_path` fixo, ACL explícita e políticas próprias. O lookup de login entrega o hash bcrypt exclusivamente ao processo Node pela conexão de autenticação. A sessão é criada somente após bcrypt, prova transacional assinada e confirmação da mesma credencial, conta ativa e e-mail verificado. A resolução do desafio de e-mail também exige prova transacional assinada.
- `rodar_refresh` preserva rotação, período de concorrência e revogação por replay. O fluxo de e-mail mantém desafios vinculados à conta, HMAC do código, cooldown, expiração, tentativas, revogação e respostas contra enumeração. A entrega externa ocorre entre a reserva e a confirmação de envio. A troca de e-mail dispara revogação e invalidação por trigger de privilégio restrito.
- A autorização do Express permanece. O banco consulta o perfil atual e exige sessão recente para desativar usuários e excluir contas de terceiros. A finalidade assinada de exclusão é reservada aos handlers que excluem propriedade ou conta. As rotas SQL não aceitam perfil nem identidade do frontend como prova.

## Migrations e políticas

| Arquivo | Efeito |
|---|---|
| `013_verificacao_email.sql` | Cria o esquema de e-mail em instalação nova sem instalar uma policy de acesso para o runtime. Reexecução preserva a trigger mais nova. A revogação de contas pendentes continua prevista na migration. |
| `014_rls_contexto.sql` | Roles, schema privado, chave e funções de identidade com políticas próprias de leitura. |
| `015_rls_autenticacao.sql` | Funções de cadastro, login, refresh, logout, rate limit, administração, preview de sessões e trigger de mudança de e-mail. |
| `016_rls_verificacao_email.sql` | Operações específicas de desafio e grants de execução para o login de autenticação. |
| `017_rls_integridade.sql` | Corrige a divergência da 012, cria os sete índices previstos quando ausentes, valida dados legados e protege associação, movimentação, vacinação, pesagem e desmama. |
| `018_rls_politicas.sql` | Policies de domínio e de usuários. |
| `019_rls_ativacao.sql` | Confere chave e políticas esperadas, elimina a policy ampla da 013 anterior, restringe ACLs e ativa as 16 tabelas em uma transação. |
| `rollback/019_rls_rollback_dev.sql` | Restaura as flags e os grants necessários ao binário da DEV anterior com a 013 original. A ampliação temporária faz parte desse rollback e não do estado RLS ativo. |

O escopo protegido inclui `propriedades`, `animais`, `lotes`, `animais_lotes`, `vacinas`, `vacinacoes`, `despesas`, `receitas`, `producoes_leiteiras`, `pesagens`, `desmamas`, `usuarios`, `sessoes_refresh`, `sessoes_refresh_usados`, `limites_requisicao` e `verificacoes_email`. Propriedades e vacinas filtram dono diretamente. Filhos usam o pai visível. Vínculos e vacinações conferem ambas as pontas. Pesagens e desmamas validam referências opcionais e registram o ator no INSERT. Campos de dono, perfil, hash, status administrativo e autoria de manejo recebem restrições de coluna ou operações dedicadas. As quatro tabelas internas ficam sem CRUD direto para os dois logins.

As exclusões de conta e propriedade mantêm a prévia, os locks e as operações dependentes no mesmo cliente. Sessões e histórico são removidos pelas FKs da conta. A exclusão exige uma linha no alvo final. Pesagem e conclusão de desmama verificam a atualização obrigatória de peso e estado antes de responder sucesso.

## Arquivos por área

- Configuração e banco: `backend/.env.example`, `backend/config/ambiente.js`, `backend/database/contextoRls.js`, `backend/database/poolAutenticacao.js` e os SQLs da matriz.
- Entrada HTTP: `backend/middleware/autenticacao.js`, `backend/controllers/climaController.js` e as rotas de auth, usuários, dashboard, propriedades, animais, lotes, vacinas, vacinações, despesas, receitas, produção leiteira, pesagens e desmamas em `backend/routes/`.
- Serviços: `acessoAnimais.js`, `impactoExclusao.js`, `limitesRequisicao.js`, `pesoAtual.js`, `sessoes.js`, `usuarios.js` e `verificacaoEmail.js`.
- Verificação: `scripts/test-isolated.cjs`, `backend/scripts/check-security-readonly.js`, `backend/scripts/check-deletion-integrity.js`, `backend/tests/rls-isolamento.js`, `backend/tests/helpers/bancoFixture.js` e as suítes existentes ajustadas à separação entre login da API e operações de fixture. As mudanças no frontend se limitam à configuração e às fixtures de Playwright.

## Validação e limites

O runner cria banco descartável, dois logins restritos e uma credencial administrativa separada para fixtures, e recusa destinos externos. A linha de base DEV passou antes das mudanças. As suítes de autorização, e-mail, leite, finanças, pesagem/desmama e regressões HTTP foram executadas com PostgreSQL real. A seção de continuidade registra os resultados do último ciclo.

As suítes integradas registraram 238 verificações e grupos funcionais, além da suíte direta de RLS e dos checks de catálogo. O rollback foi aplicado e a 019 reaplicada no banco descartável. A checagem de segurança usou os dois logins da aplicação. Em fixtures pequenas, `EXPLAIN (ANALYZE, BUFFERS)` usou Index Scan no filtro de despesas por propriedade, com aproximadamente 0,8–0,9 ms no servidor e resultados corretos para A, B e admin. A amostra não representa carga de produção.

O Playwright passou seis cenários a 1366×768, incluindo e-mail, sessão no navegador, navegação, cadastro de propriedade/animal, pesagem e recuperação de erro no dashboard. Os arquivos de implementação, testes e documentação somam 60, além da cópia do relatório de auditoria e dos artefatos gerados pelo Graphify.

O PostgreSQL local é 18.4 e a produção consultada é 17.6. Ainda é necessária homologação Supabase com o pooler transacional, TLS e as roles efetivas da Vercel. O HMAC reduz falsificação de contexto por SQL arbitrário na conexão de domínio, mas o comprometimento do processo Node ou do login de autenticação permanece crítico. `service_role` e os operadores do Supabase conservam os privilégios de plataforma, a revisar com os consumidores reais antes do corte. O XID é alocado por unidade autenticada, inclusive leituras. Monitorar consumo de XIDs, latência, filas e o custo da revalidação por statement no volume real. A revogação afeta novas consultas e não desfaz uma instrução já iniciada com sessão válida.
