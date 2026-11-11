const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {output,createLocalDatabase,writeLocal,attestLocal}=require('./stage3-helpers.cjs');
async function main(){
  assert.equal(process.argv.length,2);
  const restored=JSON.parse(fs.readFileSync(path.join(output,'backup-restore-results.json'),'utf8'));
  assert.equal(restored.completed,true);
  const database='bovitrack_stage3_restore_'+Date.now()+'_'+crypto.randomBytes(3).toString('hex');
  const c=await createLocalDatabase(database,{template:restored.database});
  const results={database,source:restored.database,syntheticRowsPerRelation:10000,completed:false};
  try{
    const users=[];
    for(const suffix of['a','b'])users.push((await writeLocal(c,database,"INSERT INTO usuarios(nome,email,senha,perfil,email_verificado,email_verificado_em) VALUES ('Indices sinteticos',$1,'synthetic-no-login','usuario',true,now()) RETURNING id",['stage3-index-'+suffix+'@example.com'])).rows[0].id);
    const prop=(await writeLocal(c,database,"INSERT INTO propriedades(nome,cidade,estado,area,usuario_id) VALUES ('Indices','Teste','SP',1,$1) RETURNING id",[users[0]])).rows[0].id;
    const animal=(await writeLocal(c,database,"INSERT INTO animais(nome,especie,propriedade_id) VALUES ('Indices','Bovino',$1) RETURNING id",[prop])).rows[0].id;
    await writeLocal(c,database,"INSERT INTO pesagens(animal_id,data_pesagem,peso_kg,tipo_pesagem,registrado_por) SELECT $1,current_date,100,'ROTINA',CASE WHEN g<=100 THEN $2::integer ELSE $3::integer END FROM generate_series(1,10000) g",[animal,...users]);
    await writeLocal(c,database,"INSERT INTO desmamas(animal_id,data_planejada,tipo_desmama,status,registrado_por) SELECT $1,current_date,'CONVENCIONAL','CANCELADA',CASE WHEN g<=100 THEN $2::integer ELSE $3::integer END FROM generate_series(1,10000) g",[animal,...users]);
    const session=(await writeLocal(c,database,"INSERT INTO sessoes_refresh(usuario_id,token_hash,session_id,family_id,expires_at,last_authenticated_at) VALUES ($1,repeat('1',64),repeat('2',64),repeat('3',64),now()+interval '1 hour',now()) RETURNING id",[users[0]])).rows[0].id;
    const otherSession=(await writeLocal(c,database,"INSERT INTO sessoes_refresh(usuario_id,token_hash,session_id,family_id,expires_at,last_authenticated_at) VALUES ($1,repeat('4',64),repeat('5',64),repeat('6',64),now()+interval '1 hour',now()) RETURNING id",[users[1]])).rows[0].id;
    await writeLocal(c,database,"INSERT INTO sessoes_refresh_usados(token_hash,sessao_id,family_id,expires_at) SELECT md5('used-'||g)||md5('used2-'||g),CASE WHEN g<=100 THEN $1::bigint ELSE $2::bigint END,repeat('3',64),now()+interval '1 hour' FROM generate_series(1,10000) g",[session,otherSession]);
    await writeLocal(c,database,'ANALYZE public.pesagens;ANALYZE public.desmamas;ANALYZE public.sessoes_refresh_usados');
    const statements=[['pesagens','SELECT id FROM public.pesagens WHERE registrado_por=$1',users[0]],['desmamas','SELECT id FROM public.desmamas WHERE registrado_por=$1',users[0]],['sessoes_refresh_usados','SELECT token_hash FROM public.sessoes_refresh_usados WHERE sessao_id=$1',session]];
    const plans=async()=>{const values=[];for(const [table,sql,param]of statements){const p=(await c.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,[param])).rows[0]['QUERY PLAN'][0];values.push({table,plan:p});}return values;};
    results.withoutIndexes=await plans();
    await c.query('BEGIN');
    try{
      await attestLocal(c,database);
      await c.query('CREATE INDEX stage3_pesagens_autor_idx ON public.pesagens(registrado_por);CREATE INDEX stage3_desmamas_autor_idx ON public.desmamas(registrado_por);CREATE INDEX stage3_usados_sessao_idx ON public.sessoes_refresh_usados(sessao_id)');
      results.withIndexes=await plans();
    }finally{await c.query('ROLLBACK');}
    for(let i=0;i<3;i++)assert.equal(results.withoutIndexes[i].plan.Plan['Actual Rows'],results.withIndexes[i].plan.Plan['Actual Rows']);
    results.completed=true;
    console.log(JSON.stringify(results.withoutIndexes.map((p,i)=>({table:p.table,before:p.plan.Plan['Node Type'],beforeMs:p.plan['Execution Time'],after:results.withIndexes[i].plan.Plan['Node Type'],afterMs:results.withIndexes[i].plan['Execution Time']}))));
  }finally{await c.end();fs.writeFileSync(path.join(output,'fk-index-plans.json'),JSON.stringify(results,null,2));}
}
main().catch(e=>{console.error('Ensaio de indices interrompido:',e.code||e.name);process.exitCode=1;});
