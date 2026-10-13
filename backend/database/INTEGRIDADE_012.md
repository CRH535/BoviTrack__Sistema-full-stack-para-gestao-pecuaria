# Migration 012: parentesco e indices

Execute manualmente depois das migrations 007, 008 e 009, com a conexao
administrativa separada do runtime. A aplicacao nao executa migrations ao iniciar.

```powershell
node scripts/migrate-integrity.js
```

O script usa `SUPABASE_MIGRATION_URL` e a configuracao TLS `DB_SSL`/CA do
backend. Para validacao local, defina explicitamente a URL de um cluster
descartavel, `NODE_ENV=test` e `DB_SSL=disable` no processo. Nunca reutilize a
URL de producao em testes que criam ou excluem registros.

A migration e transacional e pode ser reaplicada. Nao atualiza ou remove linhas
de negocio: historicos antigos permanecem intactos, inclusive inconsistencias
que precisem de revisao. Execute `node scripts/check-database.js` antes e depois
para detectar referencias invalidas sem corrigi-las automaticamente.

O trigger de animais passa a validar alteracoes de sexo, incluindo NULL, e
verifica maes citadas em filhos e em desmamas. A mae referenciada e bloqueada
durante novas escritas para impedir alteracao concorrente de sexo/propriedade.
Funcoes existentes sao substituidas com `CREATE OR REPLACE`, preservando grants.
O trigger de desmama permite a atualizacao interna de `ON DELETE SET NULL`
quando o animal ja esta sendo removido por `ON DELETE CASCADE`. A foreign key
continua rejeitando criacao ou alteracao normal com animal inexistente.

Os indices atendem consultas existentes:

| Indice | Consulta ou operacao atendida |
| --- | --- |
| animais_propriedade_id_idx | Listagem/autorizacao de animais e exclusao por propriedade; o indice de brinco existente e parcial |
| lotes_propriedade_id_idx | Filtro de lotes por propriedade e exclusao de dependencias |
| despesas_propriedade_data_idx | Filtro e ordenacao de despesas por propriedade/data/id |
| vacinacoes_animal_data_idx | Historico de vacinacoes e exclusao por animal |
| vacinacoes_vacina_id_idx | Verificacao/exclusao de referencias a uma vacina |
| animais_lotes_lote_id_idx | Animais associados ao lote; a chave primaria comeca por animal_id |
| desmamas_mae_id_idx | Protecao de maes referenciadas em desmamas |

`CREATE INDEX` comum pode bloquear escritas enquanto trabalha. Aplique em janela
de manutencao adequada ao tamanho do banco; nenhuma alteracao foi aplicada a
producao como parte do desenvolvimento.

Para desfazer a protecao de parentesco, restaure as definicoes anteriores das
duas funcoes e do trigger a partir de `008_criar_pesagens_desmamas.sql`, usando
credencial administrativa. Reaplicar 008 integralmente tambem restaura essas
definicoes sem reescrever historicos, mas retorna as limitacoes antigas. Remova
somente os indices acima que foram criados pela 012, apos confirmar que nao
existiam antes da aplicacao; nao remova tabelas, colunas ou historicos.

O script legado `migrate-to-supabase.js` copia somente o schema inicial e agora
recusa origens com sessoes, leite, manejo ou `animais.mae_id` antes de criar
backup ou conectar ao destino. Para uma origem atual, planeje copia/restauracao
completa de todas as tabelas e dependencias. Nao apague historicos para usar o
script legado.
