/** Optional, idempotent update of the earlier default marketing text.
 * Dry-run first. Never changes credentials, email recipient, prices or inventory.
 * Existing customised content is kept; all structural concierge sections ship in templates.
 */
import {DatabaseSync} from 'node:sqlite';
import {existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {initialSettings} from '../lib/seed.mjs';
const dir=path.resolve(process.env.DATA_DIR||'data'),file=path.join(dir,'hillkings.sqlite');
if(!existsSync(file)){console.log('Sem banco existente. Uma instalação nova já utiliza o conteúdo v3.');process.exit(0);}
const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=5000');
const row=db.prepare('SELECT * FROM settings WHERE id=1').get();
if(!row){console.log('Sem configurações existentes.');db.close();process.exit(0);}
const before=JSON.parse(row.data),next={...before};
const old={intro:'Gemas singulares. Joias de presença. Uma seleção apresentada pessoalmente, no seu tempo.',introEn:'Singular gemstones. Remarkable jewels. A collection presented personally, at your pace.',conciergeText:'Uma conversa, uma peça, uma escolha muito sua.',description:'Uma seleção privada de gemas e joias. Conheça a coleção Hillkings e solicite uma apresentação individual.'};
const keys=[];
for(const [k,v] of Object.entries(old)){if(next[k]===v||!next[k]){if(next[k]!==initialSettings[k]){next[k]=initialSettings[k];keys.push(k);}}}
const apply=process.argv.includes('--apply');
console.log(`${apply?'Aplicação':'Simulação'}: ${keys.length} campo(s) de texto padrão. ${keys.join(', ')}`);
if(keys.length&&apply){
 const backup=path.join(dir,`content-v3-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
 writeFileSync(backup,JSON.stringify({createdAt:new Date().toISOString(),settings:row},null,2),{mode:0o600,flag:'wx'});
 const result=db.prepare('UPDATE settings SET data=?,version=version+1 WHERE id=1 AND version=?').run(JSON.stringify(next),row.version);
 if(result.changes!==1)throw new Error('Configurações alteradas por outra sessão. Tente novamente.');
 console.log('Conteúdo atualizado. Backup privado: '+backup);
}else if(!apply)console.log('Para aplicar aos textos padrão, execute npm run upgrade:content -- --apply. Faça backup antes.');
db.close();
