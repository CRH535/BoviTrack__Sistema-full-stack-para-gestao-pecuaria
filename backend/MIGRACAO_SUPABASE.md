# Migração do BoviTrack para o Supabase

> Revisão de 12/10/2026: este documento descreve o **copiador legado**, limitado
> às nove tabelas do schema inicial (incluindo receitas). O script agora recusa
> origens com tabelas adicionais ou `animais.mae_id`, antes de criar backup ou
> acessar o destino. Uma base atual com sessões, leite, pesagens e desmamas exige
> backup/restauração completos, ensaiados em destino isolado. Não elimine
> históricos para usar o copiador. Veja [INTEGRIDADE_012.md](database/INTEGRIDADE_012.md).

O Supabase será usado apenas como PostgreSQL hospedado. O backend continua usando
`pg`, JWT e as mesmas queries. Supabase Auth, Data API e RLS não participam deste
fluxo.

## Estado inventariado

O banco local possui as tabelas `usuarios`, `propriedades`, `animais`, `lotes`,
`animais_lotes`, `vacinas`, `vacinacoes` e `despesas`. IDs e foreign keys são
`INTEGER`; eles não devem ser convertidos para UUID.

A autenticação também utiliza a tabela `sessoes_refresh` para renovar sessões
com segurança. Depois da migração principal, crie ou valide essa tabela com:

```powershell
npm run migrate:sessions
```

Essa migration é incremental e não altera dados das tabelas de negócio.

O módulo de Controle Leiteiro utiliza outra migration incremental:

```powershell
npm run migrate:milk
```

Ela cria `producoes_leiteiras` usando o mesmo tipo `INTEGER` de `animais.id`.

A origem usa PostgreSQL 18.4. O processo deste projeto cria um schema SQL
compatível e copia as linhas por `pg`, em vez de restaurar o schema de um dump em
uma eventual versão anterior do PostgreSQL no Supabase. Antes da cópia, também é
gerado um backup completo em `backend/backups/`.

## 1. Preparar o projeto no Supabase

1. Crie um projeto vazio no Supabase.
2. No painel, clique em **Connect**.
3. Para executar a migração, copie a **Direct connection** se sua rede tiver
   IPv6. Em uma rede IPv4, copie o **Session pooler**, porta 5432.
4. Não use o Transaction pooler da porta 6543 para `pg_dump`, restore ou esta
   migração.
5. Não crie manualmente as tabelas pelo Table Editor.

O schema não habilita RLS. As permissões continuam sendo verificadas pelo backend
com o usuário autenticado no JWT. Não exponha `DATABASE_URL` no frontend.

## 2. Configurar a migração

Com o backend ainda apontando para o banco local, adicione ao `.env`:

```env
SUPABASE_MIGRATION_URL=postgresql://USUARIO:SENHA@HOST:5432/postgres
```

Use a URI exata fornecida pelo painel. Se montar a URI manualmente, caracteres
especiais da senha precisam estar codificados para URL.

A origem pode continuar nas variáveis atuais `DB_USER`, `DB_HOST`, `DB_NAME`,
`DB_PASSWORD` e `DB_PORT`. Como alternativa, informe:

```env
LOCAL_DATABASE_URL=postgresql://postgres:SENHA@localhost:5432/bovitrack
```

## 3. Parar escritas e migrar

Pare temporariamente o backend para que não sejam criados registros durante a
cópia. Depois, dentro de `backend`, execute:

```powershell
npm run migrate:supabase
```

O checker atual `db:check` exige as tabelas dos módulos posteriores; execute-o
no destino depois de completar as migrations. Ele não é uma pré-condição
compatível com a origem legada limitada às nove tabelas.

O script:

1. cria um dump de segurança do banco local;
2. conecta na origem e no Supabase;
3. recusa destinos com tabelas parciais ou dados existentes;
4. cria o schema definido em `database/supabase/001_schema_bovitrack.sql`;
5. valida tipos e constraints;
6. copia os dados em ordem de foreign keys e dentro de transação;
7. preserva os IDs;
8. reajusta todas as sequences;
9. compara as contagens antes do commit;
10. atualiza as estatísticas das tabelas.

O script nunca apaga tabelas ou registros que já estejam no Supabase. Se o
destino não estiver vazio, ele para e solicita revisão manual.

## 4. Apontar o backend para o Supabase

Após a migração, substitua a configuração local por:

```env
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/postgres
DB_SSL=require
DB_POOL_MAX=10
DB_CONNECTION_TIMEOUT_MS=10000
```

Para desenvolvimento local em uma rede apenas IPv4, use a URI do Session pooler.
Um backend persistente com IPv6 pode usar a Direct connection. Em deploy
serverless, avalie o Transaction pooler, respeitando as limitações de prepared
statements.

`DB_SSL=require` cifra a conexão, mas não valida a autoridade e o hostname do
certificado. Para a verificação mais forte, baixe o certificado em **Database
Settings > SSL Configuration** e use:

```env
DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/postgres
DB_SSL=verify-full
DB_SSL_CA_PATH=./certificates/prod-ca-2021.crt
```

Não misture `sslmode` na URL com `DB_SSL`; escolha apenas uma configuração.

## 5. Verificar e iniciar

```powershell
npm run db:check
npm test
npm start
```

O arquivo `database/supabase/002_verificar_e_corrigir_sequences.sql` também pode
ser executado no SQL Editor do Supabase. Ele reposiciona sequences, mostra as
contagens e verifica relacionamentos órfãos.

Depois dos testes, mantenha o PostgreSQL local e o dump de segurança intactos até
confirmar login, permissões, CRUDs, lotes, vacinações, despesas e Dashboard no
Supabase.

## Retorno temporário ao banco local

Se a validação falhar, pare o backend, remova temporariamente `DATABASE_URL` do
`.env` e restaure as variáveis `DB_*` locais. Nenhum dado local é removido pela
migração.
