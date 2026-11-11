# Verificação obrigatória de e-mail — BoviTrack

> Registro da implementação original com obrigatoriedade ativa. A produção conferida em 11/11/2026 utiliza `EMAIL_VERIFICATION_REQUIRED=false` e configuração SQL correspondente. Para o estado publicado e a ativação futura, consulte [Deploy com e-mail opcional](../DEPLOY_PRODUCAO_RLS_SEM_VERIFICACAO_EMAIL.md) e [Ativação futura](../ATIVACAO_FUTURA_VERIFICACAO_EMAIL.md).

Implementação na branch `DEV`, sem Supabase Auth, sem push e sem mudanças de produção executadas automaticamente.

## 1. Arquitetura

A autenticação própria permanece em Express/CommonJS, `pg`, JWT de acesso em memória e refresh em cookie HttpOnly. PostgreSQL é a autoridade para o status de verificação. O middleware de todas as APIs protegidas exige `email_verificado = true`, inclusive para administradores.

Desafios de seis dígitos têm validade de dez minutos, cinco tentativas e cooldown de sessenta segundos. Parâmetros ficam em `backend/config/email.js`. Um ticket restrito de trinta minutos permite apenas verificar/reenviar: audience distinta do access token, finalidade explícita, nonce e fingerprint HMAC do e-mail. Ele não contém endereço, ID de usuário, role ou session ID, e não pode acessar recursos protegidos.

O frontend mantém ticket e endereço informado somente em memória. F5 durante a verificação exige novo login; nenhum e-mail, código ou ticket é colocado na URL ou no storage. Depois da confirmação é necessário fazer login novamente: conhecer um código de e-mail não substitui conhecer a senha.

## 2. Banco

Migration `013_verificacao_email.sql`, após a `012` existente:

- `usuarios.email_verificado BOOLEAN NOT NULL DEFAULT FALSE`;
- `usuarios.email_verificado_em TIMESTAMPTZ NULL`;
- constraint `usuarios_email_verificado_check` vincula boolean e timestamp;
- índice único `usuarios_email_normalizado_uidx` em `lower(btrim(email))`;
- tabela `verificacoes_email`: UUID, FK INTEGER para `usuarios` com `ON DELETE CASCADE`, `codigo_hash`, `expira_em`, `tentativas`, `usado_em`, `invalidado_em`, `motivo`, `enviado_em`, `criado_em`;
- checks: hash hexadecimal de 64 caracteres, tentativas entre zero e cinco, validade positiva, consumo implica invalidação;
- índice único parcial `verificacoes_email_ativo_uidx` impede dois desafios não invalidados por usuário;
- índices `verificacoes_email_usuario_criado_idx` e `verificacoes_email_expira_idx`;
- trigger `usuarios_email_alterado` e função `invalidar_verificacao_ao_alterar_email`, `SECURITY INVOKER`, search path controlado;
- RLS na nova tabela, sem políticas/grants para `anon` ou `authenticated`; acesso exclusivo à role SQL `bovitrack_runtime` quando existente;
- revogação controlada de sessões pendentes, sem apagar contas, dados pecuários ou históricos financeiros.

O índice parcial não usa `NOW()`: desafios vencidos são rejeitados em runtime e invalidados na validação/reemissão. A FK remove desafios ao excluir a conta, preservando o fluxo existente de exclusão.

## 3. Backend

Novos arquivos:

- `config/email.js`: parâmetros e validação de remetente/secrets;
- `services/emailService.js`: único ponto de acesso ao SDK oficial Resend, envio HTML/texto, idempotência por desafio e timeout de três segundos;
- `services/verificacaoEmail.js`: geração CSPRNG, HMAC, tickets, reserva, cooldown, validação e invalidação;
- `controllers/verificacaoEmailController.js`: contrato externo e erros seguros;
- `routes/verificacaoEmailRoutes.js`: `POST /auth/email/reenviar` e `POST /auth/email/verificar`;
- `emails/verificacaoEmail.js`: template profissional HTML de tabelas/CSS inline e plain text;
- `scripts/migrate-email-verification.js`: auditoria agregada e aplicação administrativa.

Alterações em cadastro/login, criação/renovação de sessões, middleware de autenticação e edição de usuários integram o requisito. Rotas de verificação são registradas antes do middleware global. Logout permanece acessível sem conta verificada. Não existe endpoint público para consultar existência/status de uma conta arbitrária.

Chamadas de verificação usam `X-Email-Verification` com o ticket e body `{ email, codigo }`; reenvio usa `{ email }`. Não se usa esse ticket como Bearer access token. `validarCamposPermitidos` rejeita campos extras, incluindo flags de verificação.

## 4. Frontend

Nova página `/verificar-email`, com `Marca`, `Button`, layout de login existente, tokens de tema, campo numérico com `one-time-code`, contador, reenvio e retorno ao login. Estados: solicitação/preparação, envio, verificação, inválido, expirado, utilizado, tentativas esgotadas, cooldown, falha temporária e conclusão.

Cadastro direciona à página; login pendente faz o mesmo somente após senha correta. `ProtectedRoute` mantém a aplicação bloqueada. Axios não tenta refresh em endpoints de código e encerra sessão completa rejeitada por `EMAIL_NOT_VERIFIED`. `MinhaConta` encerra a sessão ao trocar o e-mail e orienta novo login/verificação.

## 5. Fluxo de nova conta

1. CSRF, rate limits, campos e senha validados.
2. Conta única criada com verificação falsa.
3. Usuário bloqueado com `FOR UPDATE`; cooldown e orçamento por e-mail aplicados.
4. Desafio anterior invalidado; UUID e código gerados com `crypto`.
5. Apenas HMAC contextual é persistido; transação encerrada.
6. Resend chamado fora da transação, com HTML/texto e idempotência.
7. Frontend recebe envelope genérico e contexto restrito, sem sessão completa.
8. Código correto consome o desafio, marca boolean/timestamp e revoga sessões anteriores na mesma transação.
9. Novo login permite acesso normal.

Se o envio falhar, a conta permanece única e pendente; o desafio fica inválido e cooldown continua persistido. Após aguardar, login ou reenvio podem recuperar o fluxo. Cadastro duplicado não reseta senha nem reenvia automaticamente; o usuário pode voltar ao login ou solicitar reenvio restrito.

## 6. Fluxo de conta antiga

Nenhuma conta antiga é automaticamente verificada. Após a migration, sessão anterior é revogada. O usuário faz login; credenciais erradas continuam genéricas. Com senha correta, `EMAIL_NOT_VERIFIED` inclui ticket limitado, endereço mascarado e estado de envio. A mesma confirmação por código e novo login se aplica ao administrador.

Auditoria somente leitura realizada no Supabase em 14/10/2026: seis usuários, um administrador, zero e-mails ausentes, sintaticamente inválidos, duplicados ou não normalizados; nenhuma role especial. Auditoria de domínio encontrou uma conta com domínio não público, justamente o administrador. Não foi alterado nenhum dado remoto.

**Antes da ativação:** corrigir o e-mail administrativo para um endereço real, preservando ID, role e dados. O comando de migration recusa domínios reservados/não públicos e exige resolver as inconsistências. Endereços pessoais fornecidos para operação manual não são hardcoded no código.

## 7. Sessões existentes

Migration revoga sessões de usuários pendentes. `autenticar` consulta verificação no banco a cada chamada; não confia em claims antigas. `criarSessaoRefresh` exige usuário ativo/verificado sob lock. Refresh verifica novamente e revoga sessões pendentes sem emitir novos tokens. Verificação também revoga sessões preexistentes, evitando que voltem a funcionar após confirmar o e-mail.

Refresh adquire lock do usuário antes da sessão, mesma ordem das alterações de e-mail. Logout e rotação existentes continuam funcionando. Sessões revogadas não são apagadas pela ativação. Trocar e-mail, pela própria conta ou painel admin, retira a verificação e revoga as sessões por trigger na mesma transação.

## 8. Segurança

- Código: `crypto.randomInt`, seis dígitos incluindo zeros iniciais; HMAC-SHA-256 com pepper mínimo de 32 bytes e contexto versão/usuário/e-mail/desafio/código; `timingSafeEqual`.
- Brute force: cinco tentativas por desafio, limites persistentes por conta e IP; consumo/incremento sob lock. Dados nunca autorizados pelo frontend.
- Concorrência: lock do usuário serializa geração, reenvio, consumo e troca de endereço; índice único adicional; um código só pode ser consumido uma vez.
- Reenvio: sessenta segundos entre reservas, inclusive envio falho; cinco solicitações por e-mail/hora e doze/dia; vinte por IP/hora, compartilhadas com cadastro e login pendente.
- Validação: trinta por e-mail/hora e sessenta por IP/minuto. Cadastro mantém cinco por IP/hora e acrescenta cinco por e-mail/hora. Limites usam `limites_requisicao`, sem limiter paralelo em memória.
- Enumeração: cadastro/reenvio público retornam mesmo envelope, sem existência/status; tickets têm formato idêntico e nonce; piso de 3,5 segundos nos envios públicos, transporte limitado a três segundos. Erros públicos de código são uniformes com piso de 250 ms. Detalhes somente com senha comprovada. Isto reduz diferenças triviais; não promete tempo idêntico sob indisponibilidade de rede/banco.
- Limite extra administrativo é avaliado após comprovação da senha, evitando expor a role pelo comportamento de um login errado.
- CSRF: proteção existente de origem exata também aplicada a cadastro/login/código; permissões e cookies HttpOnly existentes preservados.
- SQL injection: todos os dados em parâmetros SQL. Mass assignment: allowlists; status verificado não é aceito do cliente.
- XSS: React escapa mensagens/endereços; nenhum `dangerouslySetInnerHTML`; template contém apenas código validado e configuração interna, sem JavaScript.
- Logs: sem código/hash/pepper/chave/senha/JWT/refresh/cookie. SDK tem logging automático de erro suprimido e testado com resposta maliciosa; eventos próprios registram IDs e resultados controlados. Strings de e-mail são mascaradas no logger.
- Privacidade: nenhuma lista de marketing ou consentimento promocional foi criada.

## 9. Resend

SDK oficial `resend` centralizado; configuração de desenvolvimento `BoviTrack <onboarding@resend.dev>`. `EMAIL_FROM` pode substituir esse default sem alterar lógica.

**Limitação operacional real:** o domínio `resend.dev` permite testar somente enviando para o endereço associado à conta Resend. Portanto não é possível oferecer verificação a todos os usuários externos com esse remetente. Não ativar indiscriminadamente a obrigatoriedade em produção enquanto os destinatários necessários, inclusive admin, não puderem receber. [Resend: restrição de domínio de testes](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

Resend aceitar a chamada não comprova entrega na caixa de entrada; spam/bounce continuam sujeitos ao provedor. Falhas/timeout tornam o desafio inválido e exigem novo envio após cooldown, inclusive se uma entrega atrasada aparecer. Nenhum envio real foi executado por esta tarefa.

React Email não foi instalado: um único template estático cabe em CommonJS sem React no backend ou pipeline JSX. HTML responsivo de tabelas/CSS inline e plain text visam Gmail, Outlook, Apple Mail e mobile. Não foi realizado teste de renderização em clientes de e-mail reais. [Resend: contrato do envio](https://resend.com/docs/api-reference/emails/send-email).

## 10. Novas dependências

| Pacote | Versão | Projeto | Tipo | Motivo |
| --- | --- | --- | --- | --- |
| resend | 6.33.0 | backend | Produção, direta, versão exata | SDK oficial de envio |
| postal-mime | 2.7.6 | backend | Produção, transitiva | Dependência do SDK |
| standardwebhooks | 1.1.1 | backend | Produção, transitiva | Dependência do SDK |
| @stablelib/base64 | 1.0.1 | backend | Produção, transitiva | Dependência de standardwebhooks |
| fast-sha256 | 1.3.0 | backend | Produção, transitiva | Dependência de standardwebhooks |

Comando executado: `npm install --save-exact resend@6.33.0` em `backend`. Mudaram `backend/package.json` e `backend/package-lock.json`, preservando npm e lockfile v3. Frontend não recebeu dependências, nem alterações em seu package/lockfile. Vercel instala automaticamente pelo package/lockfile do backend. SDK requer Node >=20; a validação local usou Node 24.15.0.

## 11. Dependências removidas

Nenhuma.

## 12. Variáveis de ambiente

| Variável | Projeto | Ambiente | Secreta? | Estado |
| --- | --- | --- | --- | --- |
| RESEND_API_KEY | API bovitrack | Production e Preview em que testar; Development somente se enviar localmente | Sim | Já configurada pelo usuário; consumida no servidor; valores remotos não recuperados |
| EMAIL_VERIFICATION_PEPPER | API bovitrack | Mesmos ambientes do backend | Sim | Já configurada pelo usuário; não alterada; mínimo 32 bytes validado no runtime |
| EMAIL_FROM | API bovitrack | Production/Preview em que ativar; opcional Development | Não | Nova configuração; criar é recomendado; ausência usa default central resend.dev; presença remota não consultada |
| FRONTEND_URL | API bovitrack | Production; origem de Preview ao testar previews | Não | Já existente; preservada; produção usa https://bovitrack-xi.vercel.app |
| COOKIE_SECURE | API bovitrack | Production/Preview HTTPS | Não | Já existente; manter true |
| COOKIE_SAME_SITE | API bovitrack | Production/Preview em domínios separados | Não | Já existente; manter none para a arquitetura atual |
| VITE_API_URL | bovitrack | Production; backend correspondente em Preview | Não | Já existente; https://bovitrack-api.vercel.app; nenhuma variável nova no frontend |
| SUPABASE_MIGRATION_URL | Processo administrativo local | Execução manual da migration | Sim | Já prevista pelo projeto; não criar no frontend/runtime Vercel |

Exemplo backend adiciona somente `RESEND_API_KEY=` e `EMAIL_VERIFICATION_PEPPER=` vazios e `EMAIL_FROM` de desenvolvimento. Nunca puxar/exportar secrets de produção para validar presença. Não há `VITE_RESEND_API_KEY` nem equivalente. Mudanças de variáveis na Vercel exigem novo deploy para surtir efeito. Não foi criado flag de bypass/desativação de verificação.

## 13. Vercel

1. Corrigir manualmente o endereço do admin e assegurar capacidade de entrega aos destinatários necessários. Com resend.dev, a limitação de um endereço impede uma implantação geral coerente.
2. Backend **API bovitrack**: manter os dois secrets configurados e seus escopos; adicionar, se ausente, `EMAIL_FROM=BoviTrack <onboarding@resend.dev>` nos ambientes escolhidos. Não recriar nem imprimir secrets.
3. Manter `FRONTEND_URL`, cookies e banco/TLS existentes. Preview precisa de origem permitida no backend correspondente e banco de homologação; não expor dados de produção nos testes.
4. Rodar auditoria/migration com conexão administrativa fora da função Vercel. Não adicionar a migration a install/build/start.
5. Coordenar uma janela de ativação: suspender acesso ao backend antigo durante aplicação da migration e troca de deploy, para não haver um intervalo em que o código antigo emita novas sessões sem a exigência. Implantar backend novo após a migration e frontend compatível na mesma janela.
6. Fazer deploy/redeploy de **API bovitrack** e **bovitrack** manualmente. Não há necessidade de instalar pacote no painel: o Vercel usa os manifests versionados.
7. Testar entrega, verificação, sessão nova e tentativa com sessão antiga antes de reabrir o acesso geral.

Nenhum deploy, push, merge, DNS ou registro de domínio foi executado.

## 14. Migration

Na raiz do projeto, com `SUPABASE_MIGRATION_URL` e TLS administrativos configurados no processo/arquivo local privado:

```powershell
npm --prefix backend run migrate:email-verification -- --check
npm --prefix backend run migrate:email-verification
```

O primeiro comando é somente leitura e imprime contagens; o segundo refaz a auditoria e aplica a SQL transacional. A SQL possui `lock_timeout=5s`, constraints, grants restritos e pode ser reaplicada sem apagar dados. Se ocorrer erro, a transação não é aplicada. Todos os desafios e sessões pendentes ficam coerentes.

Recomendação para produção é **condicional**, após regularizar admin/destinatários e coordenar a janela de ativação. A migration foi executada/reaplicada no PostgreSQL 18.4 local descartável; no Supabase PostgreSQL 17 foram feitas somente consultas de auditoria. Não foi aplicada a produção. Usuários antigos precisarão verificar e fazer login novamente.

Correção administrativa manual, antes da ativação, preservando a conta (substituir o placeholder pelo endereço real aprovado):

```sql
BEGIN;
UPDATE public.usuarios
   SET email = lower(btrim('EMAIL_REAL_ADMIN'))
 WHERE perfil = 'admin';
COMMIT;
```

Se a nova migration já estiver aplicada, o trigger retirará a verificação e revogará sessões automaticamente. Não marcar o admin como verificado manualmente; ele confirma o código como qualquer usuário. Se o endereço já pertencer a outra conta, a constraint única interromperá a troca; não excluir/mesclar contas para resolver isso automaticamente.

## 15. Testes

Testes sempre com transporte mock e banco local descartável criado pelo runner; URL externa/parâmetros que substituem o host são recusados. Nenhuma flag de mock é adicionada ao runtime da aplicação.

Verificação automatizada cobre os 25 cenários solicitados: cadastro/estado/envio/CSPRNG, acerto/erro/expiração/reuso/tentativas, reenvio/código anterior/cooldown/rate limit, login antes/depois, antigo/admin/API direta/access/refresh antigos, falha/recuperação/concorrência, inexistente e envelope genérico. Acrescenta troca de e-mail própria/admin, CSRF, tickets expirados/manipulados, logging do SDK, RLS/constraints, idempotência de migration e cascade da conta.

Comandos e resultados finais constam no [relatório histórico de validação](archive/RELATORIO_VERIFICACAO_EMAIL.md). Falhas intermediárias corrigidas foram de cast SQL e fixtures de cronologia/body JSON; nenhuma falha conhecida foi omitida.

## 16. Build

Frontend usa Vite e continua sem dependência nova. Backend não possui build ou lint configurado: verificação com `node --check`, import do app, health check e suites reais, sem inventar scripts. Template de e-mail não requer compilação.

## 17. Arquivos alterados

Lista completa no relatório de validação e no histórico dos commits. Inclui código, fixtures/testes, documentação e saídas atualizadas do Graphify. Capturas de QA em `outputs/email-verification/` são locais e ignoradas pelo Git.

## 18. Git

Somente `DEV`; working tree inicialmente limpo. Commits lógicos locais; sem push ou merge para main. Estado final e hashes no relatório entregue. Grafo atualizado por `graphify update .` (AST, zero API cost). O parser SQL opcional do Graphify não está instalado: SQL foi validada diretamente pelo PostgreSQL, não pelo grafo.

## 19. Teste manual

- Confirmar que o endereço de teste é o endereço autorizado pela conta Resend para o remetente resend.dev.
- Criar conta ou usar a conta existente; senha errada deve continuar genérica.
- Login correto pendente deve abrir verificação e não emitir sessão completa.
- Confirmar endereço mascarado, ausência de dados na URL e entrega/spam.
- Conferir seis dígitos, validade e versão texto do e-mail.
- Testar um erro, cooldown, reenvio e rejeição do código anterior.
- Confirmar código correto e fazer novo login; conferir módulos existentes.
- Reabrir sessão antiga: exigir novo login, sem acesso por fetch/Postman.
- Testar mobile, dark mode, F5, logout e alteração de endereço.
- Verificar conta administrativa com endereço real e a mesma política, quando a entrega estiver disponível.

Nunca copiar JWT, cookie ou código para logs; Postman/fetch de teste devem usar origem permitida onde a proteção CSRF é exigida.

## 20. Produção futura

Depois de adquirir o domínio, cadastrar/verificar no Resend o domínio/subdomínio de envio conforme a documentação atual do provedor. Somente nessa etapa configurar DNS. Ao concluir verificação, substituir `EMAIL_FROM` por `BoviTrack <no-reply@mail.bovitrack.com.br>` nos ambientes necessários e redeployar o backend. Nenhuma alteração de service, controller, template ou frontend é necessária.

Realizar testes de entrega para os usuários e administrador antes de ativar obrigatoriedade geral. Monitorar quotas, falhas e bounces; a camada permite novos e-mails transacionais futuros, que não foram implementados nesta tarefa.
