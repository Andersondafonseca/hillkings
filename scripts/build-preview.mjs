/** Build an entirely offline, self-contained test copy. No real login/email/persistence. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialSettings,initialProducts} from '../lib/seed.mjs';
import {escapeHtml,jsonForHtml} from '../lib/security.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const types={'.glb':'model/gltf-binary','.webp':'image/webp','.mp4':'video/mp4','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon'};
const files=new Set(['/brand/monogram.png','/favicon.png','/favicon.ico','/icons/favicon-32.png','/icons/favicon-64.png','/icons/apple-touch-icon.png']);
for(const p of initialProducts){for(const key of ['heroImage','modelUrl','reportUrl'])if(p[key])files.add(p[key]);for(const m of p.media){files.add(m.url);if(m.poster)files.add(m.poster);}}
const assets={};for(const p of files){const name=path.join(root,'public',p);if(!existsSync(name))throw Error(`Missing preview media ${p}`);assets[p]={type:types[path.extname(p)]||'application/octet-stream',base64:readFileSync(name).toString('base64')};}
const data={catalog:{settings:{...initialSettings,version:1},products:initialProducts.map(p=>({...p,version:1}))},assets,css:read('public/assets/main.css'),adminCss:read('public/assets/admin.css'),appJs:read('public/assets/app.js'),adminJs:read('public/assets/admin.js'),viewerJs:read('public/assets/viewer.js'),previewCss:'.page-admin .admin-demo-note{padding:10px 20px;background:#e9dfc5;color:#574b36;font:11px/1.6 Arial}.demo-privacy-note{padding:12px;background:#eee3c9;color:#664426;font:12px/1.6 Arial}'};
const renderer=`window.HKRender=(()=>{const e=${escapeHtml.toString()}; const jsonForHtml=${jsonForHtml.toString()};
${read('lib/templates.mjs').replace(/^import .*;\n/m,'').replace(/\bexport /g,'')}\nreturn {renderPage};})();`;
const js=renderer+'\n'+read('preview/host.js');
const payload=JSON.stringify(data).replace(/</g,'\\u003c');
const html=read('preview/shell.html').replace('__HK_FAVICON__','data:image/png;base64,'+assets['/icons/favicon-64.png'].base64)+`<script type="application/json" id="preview-data">${payload}</script>\n<script>${js.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
const out=path.join(root,'preview-dist');mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'index.html'),html);console.log(`Built self-contained preview: ${html.length.toLocaleString()} bytes.`);
