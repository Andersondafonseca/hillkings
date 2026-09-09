/** Optional, idempotent upgrade for an existing Hillkings v1 database.
 * Dry-run by default. Never changes prices, availability, contacts or credentials.
 * Copies original product rows to a private JSON rollback journal before applying.
 */
import {DatabaseSync} from 'node:sqlite';
import {existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {initialProducts} from '../lib/seed.mjs';
const directory=path.resolve(process.env.DATA_DIR||'data');
const databaseFile=path.join(directory,'hillkings.sqlite');
if(!existsSync(databaseFile)){
 console.log('Sem banco existente: uma instalação nova já recebe as imagens e os três modelos v2.');
 process.exit(0);
}
const apply=process.argv.includes('--apply');
const db=new DatabaseSync(databaseFile);db.exec('PRAGMA busy_timeout=5000');
const replacements=[];
for(const seed of initialProducts){
 const row=db.prepare('SELECT * FROM products WHERE id=?').get(seed.id);if(!row)continue;
 const current=JSON.parse(row.data),next=structuredClone(current);
 // Imported CAD or custom uploads are deliberately not overwritten.
 const oldModel=current.modelUrl||'';
 if(current.modelKind!=='cad'&&(!oldModel||/^\/models\/(ruby-ring|paraiba-loose|paraiba-necklace)\.glb$/.test(oldModel))){
  next.modelUrl=seed.modelUrl;next.modelKind=seed.modelKind;next.modelNotes=seed.modelNotes;
 }
 const editorial=seed.media.find(m=>m.kind==='editorial');
 const originalHeroes=seed.id==='HK-G001'?['/media/paraiba-video-frame.webp','/media/paraiba-cutout.webp']:['/media/necklace-video-frame.webp','/media/necklace-cutout.webp'];
 if(editorial){
  const list=current.media||[],known=list.find(m=>m.url===editorial.url);
  const canSetHero=!current.heroImage||current.heroImage===editorial.url||originalHeroes.includes(current.heroImage);
  next.media=list.map(m=>({...m,kind:m.url===editorial.url?'editorial':m.kind||'original'}));
  if(!known){if(canSetHero)next.media.unshift({...editorial});else next.media.push({...editorial});}
  if(canSetHero){next.heroImage=editorial.url;next.media.sort((a,b)=>(b.url===editorial.url?1:0)-(a.url===editorial.url?1:0));}
 }else next.media=(current.media||[]).map(m=>({...m,kind:m.kind||'original'}));
 if(JSON.stringify(current)!==JSON.stringify(next))replacements.push({row,next});
}
console.log(`${apply?'Aplicação':'Simulação'}: ${replacements.length} cadastro(s) com atualização visual.`);
for(const {row} of replacements)console.log(`  ${row.id}: apenas imagens, origem da mídia e modelo ilustrativo.`);
if(!apply){console.log('Para aplicar, execute npm run upgrade:visuals -- --apply. Faça backup completo antes.');db.close();process.exit(0);}
if(replacements.length){
 const journal=path.join(directory,'visual-upgrade-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 // The journal may contain confidential product notes; keep it outside public directories.
 writeFileSync(journal,JSON.stringify({createdAt:new Date().toISOString(),rows:replacements.map(x=>x.row)},null,2),{mode:0o600,flag:'wx'});
 db.exec('BEGIN IMMEDIATE');
 try{
  const stmt=db.prepare('UPDATE products SET data=?, version=version+1, updated_at=? WHERE id=? AND version=?');
  for(const {row,next} of replacements){const r=stmt.run(JSON.stringify(next),new Date().toISOString(),row.id,row.version);if(r.changes!==1)throw Error('Cadastro alterado em outra sessão. Atualização cancelada.');}
  db.exec('COMMIT');console.log('Atualização concluída. Cópia dos cadastros anteriores: '+journal);
 }catch(e){db.exec('ROLLBACK');throw e;}
}
db.close();
