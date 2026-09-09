import {cp,mkdir,rm,writeFile,readFile,readdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
for(const p of ['server.mjs','server.js','lib/database.mjs'])if(existsSync(new URL(p,root)))throw new Error(`Pacote antigo misturado: remova ${p}. Extraia a v4 em uma pasta vazia.`);
for(const p of ['api/index.mjs','public/assets/viewer.js','supabase/001_hillkings.sql'])if(!existsSync(new URL(p,root)))throw new Error(`Arquivo ausente: ${p}`);
await rm(new URL('dist/',root),{recursive:true,force:true});await mkdir(new URL('dist/',root),{recursive:true});await cp(new URL('public/',root),new URL('dist/',root),{recursive:true});
await writeFile(new URL('dist/release.json',root),JSON.stringify({release:'4.0.0-vercel-supabase',backend:'supabase',localDatabase:false},null,2));
console.log('Hillkings v4: arquivos estáticos em dist; função única api/index.mjs; nenhuma criação de banco local.');
