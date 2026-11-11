# Ativação futura da verificação de e-mail

Preparado em 11/11/2026. A versão de lançamento pretende operar com **RLS ativo e EMAIL_VERIFICATION_REQUIRED=false**. A funcionalidade de e-mail, rotas, serviços, telas, desafios, expiração, limites e testes continuam implementados. Este documento descreve uma alteração futura, sujeita a autorização própria; não autoriza habilitá-la agora.

## Configuração e autoridade

- Backend: `EMAIL_VERIFICATION_REQUIRED` aceita exclusivamente as strings `true` e `false`; valores inválidos interrompem a inicialização. Ausência usa false; produção deve declarar false explicitamente.
- PostgreSQL: `bovitrack_seg.configuracao_email` contém uma única linha `singleton=true` e a coluna booleana `obrigatoria`. Só a credencial administrativa pode alterá-la.
- `bovitrack_seg.email_verificacao_obrigatoria()` consulta essa tabela por função restrita. Valor ausente falha fechado (true). Os logins de domínio/auth não têm CRUD nessa tabela nem podem se tornar seu dono NOLOGIN. Um GUC configurado pelo cliente SQL não altera a política.
- API e SQL precisam concordar. Divergência retorna 503 na autenticação, sem aceitar uma identidade mais permissiva nem revogar sessões por causa dessa divergência.
- Frontend consulta `GET /auth/config`, sem cache. Cadastro segue o formato da resposta da API e login só inicia verificação quando a API a exige. Não há uma segunda flag Vite independente, nem configuração escolhida pela requisição.

## Caminhos de migration

As migrations 013–019 antigas não foram reescritas.

| Estado inicial | Caminho |
|---|---|
| Legado de produção sem e-mail/RLS | 012, **020** (estrutura sem revogar sessões), 014–018, **021**, provisionamento/configuração false, 019 |
| Homologação com 013–019 já aplicadas | Aplicar somente 021 após backup/preflight; conserva true como comportamento inicial, sem reabrir sessões anteriormente revogadas |
| Estrutura 021 já instalada | Não reaplicar migrations para alternar a flag; usar alteração administrativa explícita e deploy coordenado |

A 020 é alternativa estrutural à 013 no legado. **Não executar a 013 original no caminho de e-mail opcional:** ela revoga sessões de contas pendentes. A 021 insere true somente se ainda não houver configuração; reexecução preserva o valor existente. No corte opcional, o provisionamento administrativo grava false antes da abertura.

## Pré-requisitos para TRUE

1. Revalidar o domínio e o remetente na Resend, usando os registros SPF/DKIM fornecidos pelo provedor. Conferir DMARC e evitar SPF duplicado no mesmo nome.
2. Confirmar `RESEND_API_KEY` autorizada para esse domínio, `EMAIL_FROM` próprio e `EMAIL_VERIFICATION_PEPPER` independente, com pelo menos 32 bytes. Manter os valores em cofre/Secrets production; não usar o prefixo VITE_ para segredos.
3. Autorizar um destinatário controlado e provar recepção real, código correto/incorreto, uso único, expiração, cooldown e reenvio. Mock não prova entrega externa. Nenhum usuário real deve receber testes sem autorização.
4. Definir a política para contas antigas: comunicação, prazo de adaptação, suporte a endereço incorreto e recuperação de acesso. Não preencher `email_verificado=true` artificialmente.
5. Medir contas pendentes e sessões ativas por contagens, sem exportar e-mails para relatórios públicos. Identificar dependências de outros serviços que enviem notificações; esta flag controla a verificação de conta, não notificações independentes.
6. Confirmar backup fresco e recuperação, versões frontend/backend compatíveis, SQL 021 aplicado e suites TRUE/FALSE/transições aprovadas em ambiente isolado.

## Sequência FALSE → TRUE

Ambiente: janela de manutenção autorizada, credencial administrativa no projeto correto e acesso Vercel aos dois projetos. Registrar o SHA e deployments anteriores. Fechar os aliases da API e drenar escritores antigos conforme o runbook; não alterar a flag durante tráfego normal.

Pelo canal administrativo vinculado explicitamente ao projeto alvo, conferir identidade/TLS e executar:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE bovitrack_seg.configuracao_email SET obrigatoria=true WHERE singleton;
COMMIT;
```

Atualizar `EMAIL_VERIFICATION_REQUIRED=true` somente no ambiente production do backend, mantendo Resend/remetente/pepper válidos. Construir um novo deployment production sem promover aliases, testar e promover na janela aprovada. Frontend mantém as telas existentes e lê o estado da API; nenhuma variável de frontend concede autorização.

Impacto deliberado sobre pendentes: login responde 403 com contexto restrito de verificação; JWT existente não libera domínio/admin; refresh pendente responde 403 e revoga as sessões dessa conta com motivo EMAIL_NOT_VERIFIED, como no fluxo original. A atualização da tabela de configuração, sozinha, não executa revogação em massa. A tentativa subsequente de refresh pode revogar. Esse impacto precisa ser comunicado e aceito; não prometer continuidade de sessões pendentes com a obrigatoriedade ligada.

Provar no deployment fechado: conta verificada, conta pendente, admin, refresh, CSRF/CORS, isolamento, código e reenvio. Após promover, repetir em conta expressamente autorizada, verificar recebimento e inspecionar logs sanitizados. Se falhar, manter manutenção e executar o retorno coordenado abaixo.

## Sequência TRUE → FALSE

Na janela autorizada, registrar estado e backup; alterar administrativamente `obrigatoria=false` e construir backend com `EMAIL_VERIFICATION_REQUIRED=false`. Manter RLS, assinatura, JWT, expiração, sessões, rate limiting, CSRF, CORS e autorização administrativa intactos.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
UPDATE bovitrack_seg.configuracao_email SET obrigatoria=false WHERE singleton;
COMMIT;
```

Desligar a obrigatoriedade **não recupera sessões já revogadas**. Esses usuários precisam entrar novamente. Não apagar os desafios nem alterar o estado real de verificação das contas. Login/cadastro não enviam códigos automaticamente; endpoints de verificação respondem EMAIL_VERIFICATION_DISABLED. Ao alterar o próprio e-mail, o usuário ainda pode precisar entrar novamente por mudança de credencial, sem exigir código; salvar apenas o nome não encerra uma sessão pendente com a flag false.

Validar cadastro sem desafio/envio, login de conta pendente/admin, F5/refresh, operações próprias, acesso cruzado negado e logout. Não exigir configuração Resend para o backend false iniciar. Não remover variáveis de e-mail existentes desnecessariamente; apenas deixar o fluxo inativo.

## Provas reproduzíveis em PostgreSQL isolado

PowerShell, raiz do projeto, com cluster de teste local disponível:

```powershell
$env:BOVITRACK_TEST_POSTGRES_URL='postgresql://postgres@127.0.0.1:55441/postgres'
node scripts/test-isolated.cjs email-flag
node scripts/test-isolated.cjs email
$env:BOVITRACK_TEST_EMAIL_REQUIRED='false'
node scripts/test-isolated.cjs e2e email-optional.spec.js
Remove-Item Env:BOVITRACK_TEST_EMAIL_REQUIRED
```

O runner recusa URLs externas e utiliza credencial de fixture separada. E-mail é simulado nos testes. O modo email usa a 013 original para provar a transição de ambientes existentes; o modo email-flag utiliza a 020, cobre FALSE/TRUE/transições e 90 transações concorrentes. Nenhum desses comandos deve apontar para produção.
