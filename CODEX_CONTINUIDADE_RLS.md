# Continuidade da implementação RLS

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

No worktree, executar `node scripts/test-isolated.cjs offline` e definir `BOVITRACK_TEST_POSTGRES_URL` para uma instância local descartável com privilégios de criação de banco e roles. Rodar `node scripts/test-isolated.cjs rls` para a validação curta de grants, isolamento, contexto, rollback e reativação, ou `node scripts/test-isolated.cjs integration` para a matriz HTTP completa.

Próxima ação externa é reproduzir o rollout em Supabase de homologação com PostgreSQL 17, as duas credenciais de runtime, Supavisor transacional e Vercel de preview. Verificar métricas, reuso físico, plano da 013 e rollback para o binário legado antes de pedir autorização para produção. O procedimento está em [DEPLOY_RLS_BOVITRACK.md](DEPLOY_RLS_BOVITRACK.md).
