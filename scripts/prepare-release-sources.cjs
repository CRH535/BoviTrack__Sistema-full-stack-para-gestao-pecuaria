// Materializa somente arquivos versionados do SHA/tag aprovado, sem publicar.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {root,output}=require('./stage3-helpers.cjs');
const ref=process.argv[2];
assert.equal(process.argv.length,3);
assert.match(ref||'',/^(?:[a-f0-9]{40}|bovitrack-rls-rc-\d{8})$/);
const git=args=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0);return r.stdout.trim();};
const sha=git(['rev-parse',ref+'^{commit}']);
const unsafe=git(['ls-tree','-r','--name-only',sha,'backend','frontend','release/maintenance']).split('\n').filter(p=>/(^|\/)\.env(?:$|\.(?!example$))/.test(p));
assert.deepEqual(unsafe,[]);
const directory=path.join(output,'release-'+sha.slice(0,12));
assert.ok(!fs.existsSync(directory),'Diretorio de release ja existe; nao sobrescrever');
fs.mkdirSync(directory,{recursive:true});
const archive=path.join(output,'release-'+sha.slice(0,12)+'.tar');
git(['archive','--format=tar','--output='+archive,sha,'backend','frontend','release/maintenance','.vercelignore']);
const extracted=spawnSync('tar',['-xf',archive,'-C',directory],{encoding:'utf8'});assert.equal(extracted.status,0);
const manifest={sha,ref,directory,archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
  backendTree:git(['rev-parse',sha+':backend']),frontendTree:git(['rev-parse',sha+':frontend']),
  remote:'https://github.com/CRH535/BoviTrack__Sistema-full-stack-para-gestao-pecuaria',published:false};
fs.writeFileSync(path.join(directory,'release-manifest.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(output,'release-candidate.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({sha,directory,published:false,archiveSha256:manifest.archiveSha256}));
