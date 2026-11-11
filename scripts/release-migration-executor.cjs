const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const files=['012_integridade_parentesco_indices.sql','013_verificacao_email.sql','014_rls_contexto.sql','015_rls_autenticacao.sql','016_rls_verificacao_email.sql','017_rls_integridade.sql','018_rls_politicas.sql','019_rls_ativacao.sql'];
const optionalEmailFiles=[files[0],'020_estrutura_email_sem_revogar_sessoes.sql',...files.slice(2,-1),'021_email_verificacao_configuravel.sql',files.at(-1)];
async function applyMigration(client,name,guard,{reactivate=false}={}){
  assert.ok([...files,...optionalEmailFiles].includes(name));assert.ok(!reactivate||name===files.at(-1));
  const raw=fs.readFileSync(path.join(__dirname,'../backend/database/migrations',name),'utf8');
  const sha256=crypto.createHash('sha256').update(raw).digest('hex');
  const old=(await client.query('SELECT sha256 FROM bovitrack_release.migrations WHERE name=$1',[name])).rows[0];
  if(old){assert.equal(old.sha256,sha256,'Migration registrada com conteudo diferente');if(!reactivate)return{name,sha256,skipped:true};}
  const first=raw.indexOf('BEGIN;'),last=raw.lastIndexOf('COMMIT;');assert.ok(first>=0&&last>first);
  const body=raw.slice(0,first)+raw.slice(first+6,last)+raw.slice(last+7);
  await client.query('BEGIN');
  try{
    await guard(client);await client.query(body);
    if(!old)await client.query('INSERT INTO bovitrack_release.migrations VALUES ($1,$2)',[name,sha256]);
    await client.query('COMMIT');return{name,sha256,reactivated:reactivate};
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={files,optionalEmailFiles,applyMigration};
