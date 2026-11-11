# Implantação e reversão de RLS

> Runbook histórico da candidata com verificação de e-mail obrigatória. O corte posterior usou `020` e `021`, preservando sessões e mantendo a flag false. Consulte o [registro da publicação](DEPLOY_PRODUCAO_RLS_SEM_VERIFICACAO_EMAIL.md) e o [procedimento de ativação futura](ATIVACAO_FUTURA_VERIFICACAO_EMAIL.md) para a configuração atual.

## Pré-requisitos

- Aprovação explícita para produção, identificação do deployment Vercel e ambiente Supabase de homologação com PostgreSQL 17 e pooler de transações.
- Backup verificável de schema e dados, snapshot de ACLs, memberships, owners, defaults e policies. Ensaiar restauração separada e registrar janela de PITR disponível. Separar a conexão administrativa de migrations das conexões da API. A conexão direta ou pooler de sessão é o caminho de manutenção.
- Antes do corte, conferir Data API sem schemas expostos, grants de `anon` e `authenticated`, consumidores de `service_role` e qualquer aplicação ou preview apontando ao mesmo banco. Conferir que os logins da API são distintos, sem BYPASSRLS, sem ownership e sem SET ROLE para os papéis proprietários de funções.
- Confirmar disponibilidade e permissões de `extensions.hmac`, versionamento das migrations 001–012, histórico de 013 e privilégios de criação/ownership de roles pela credencial administrativa. A 017 contém o preflight de vínculos. Resolver divergências antes de executar o corte.

## Ordem

1. **Homologar e-mail e dados legados.** Executar a auditoria agregada da 013 com `node backend/scripts/migrate-email-verification.js --check` usando credencial de homologação. Validar contas antigas, endereço do admin, domínio autorizado no Resend e suporte a reentrada. A 013 adiciona estado de verificação e pode revogar sessões de contas pendentes. Planejar comunicação e recuperação de acesso antes de adotar essa release.
2. **Preparar o banco.** Executar 013 se pendente, seguida de 014–018 na ordem, via credencial administrativa e execução que interrompa no primeiro erro. A 017 cria os índices faltantes em transação e usa lock timeout. Para tabelas grandes, medir e pré-criar os índices aprovados com `CREATE INDEX CONCURRENTLY` em comandos administrativos separados, verificando validade e definição. Os logs administrativos devem omitir bind parameters sensíveis.
3. **Preparar logins e chave.** Confirmar que o login de domínio pertence a `bovitrack_runtime`. Criar um segundo login PostgreSQL separado para `bovitrack_auth_runtime`. Nenhum deve herdar o outro grupo. Gerar chave aleatória de 32 bytes, independente do JWT e do pepper de e-mail. Pelo cliente administrativo e com bind de parâmetro, gravar a mesma chave enviada ao cofre da aplicação com `INSERT INTO bovitrack_seg.chaves_contexto(chave) VALUES (decode($1,'hex'))`. O parâmetro é a chave hexadecimal, sem registrá-la em logs ou SQL literal. Para rotacionar, inserir nova chave, trocar a configuração em todas as instâncias, validar e retirar a antiga na credencial administrativa.
4. **Configurar Vercel.** Definir `DATABASE_URL` para domínio, `DATABASE_AUTH_URL` para autenticação e `DB_RLS_CONTEXT_KEY` para o atestado, todas exclusivas do backend. Manter TLS `verify-full`, CA e configurações de cookies, CSRF, JWT e Resend. Dimensionar o total das duas pools por instância serverless. Validar login SQL efetivo, endpoints/portas e isolamento entre preview e produção sem imprimir valores. O backend novo requer 014–018 e chave antes de receber tráfego.
5. **Validar a candidata.** Em homologação, testar a API com a migration 019 ativa e com ambos os logins através do Supavisor em modo transacional. Executar A/B/admin, casos sem contexto, logout/refresh simultâneo, verificação, alterações de conta, exclusão, relatórios e reuso de conexão. Comparar planos com volume representativo e medir p95, filas, conexões, deadlocks e rollback. Registrar a linha de base e os limiares antes de ampliar tráfego.
6. **Promover com corte coordenado.** Drenar a versão anterior e previews que compartilham o banco. A 019 ativa grupos de identidade, infraestrutura e domínio em uma transação. Filhos confiam na visibilidade dos pais e o bootstrap depende das policies próprias de identidade, então o banco de produção não deve operar com apenas parte desse grafo ativa. Fazer o rollout gradual na candidata isolada e na exposição de tráfego do backend já compatível, com probes após cada passo. O corte inclui a redução de grants e a remoção da policy antiga da 013.

## Monitoramento e interrupção

- Validar login comum/admin, login de conta pendente, cadastro, refresh, revogação, listagens, totais e exclusão em dados sintéticos autorizados. Executar `node backend/scripts/check-security-readonly.js` com as duas credenciais reais para conferir memberships, flags, ausência de acesso sem contexto e grants sensíveis. Uma resposta vazia ou contagem zerada em dado existente é falha de compatibilidade.
- Monitorar `42501`, `23503`, `23514`, `57014`, `40001`, `40P01`, latência de aquisição e duração de transação, além de 401/403 e 5xx por endpoint. Registrar código, operação e request ID sem token, chave, senha, hash ou valores de bind.
- Interromper expansão diante de acesso cruzado, falha no caminho de login/cadastro/refresh, erros de integridade, divergência de totais, lock timeout ou fila acima da linha de base acordada. Suspender o caminho afetado antes de ampliar permissões diante de suspeita de acesso indevido.

## Rollback

Em indisponibilidade, drenar o backend candidato, aplicar `backend/database/rollback/019_rls_rollback_dev.sql` com autorização e restaurar o binário anterior compatível com a 013 original na mesma janela. Esse script reabre os grants legados de forma explícita. O script mantém a 013, funções, índices, dados e sessões revogadas. A promoção anterior à adoção da verificação de e-mail requer validar o binário e o estado das contas à parte. Restaurar um backup inteiro somente sob plano de recuperação de dados e com tratamento das escritas posteriores.

Após a reversão, testar login, verificação, refresh, CRUD e isolamento do Express com o runtime legado. Revisar chave, segundo login e exceções temporárias quando o plano estiver estável. Para retomar RLS, executar novamente os checks de prontidão e a 019 sob o backend novo.

## Checklist final

- [ ] Backup e restauração ensaiados com ACLs e roles.
- [ ] Supavisor, versão PostgreSQL e TLS verificados em homologação.
- [ ] 013 e migração das contas aprovadas operacionalmente.
- [ ] Logins distintos, grants mínimos, chave pareada, Data API sem exposição.
- [ ] Fluxos funcionais e concorrência validados com RLS e rollback real.
- [ ] SHA candidato, sequência de corte, responsável, métricas e janela acordados.
- [ ] Autorização explícita para aplicar a migration de ativação em produção.
