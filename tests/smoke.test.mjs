import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const base='http://127.0.0.1:31337';let child,dir,cookie='',csrf='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function req(route,{method='GET',body,headers={}}={}){
 const h={...headers};if(method!=='GET'){h.Origin=base;if(!(body instanceof Uint8Array))h['Content-Type']='application/json';}
 if(cookie)h.Cookie=cookie;if(csrf)h['X-CSRF-Token']=csrf;
 const r=await fetch(base+route,{method,headers:h,...(body!==undefined?{body:body instanceof Uint8Array?body:JSON.stringify(body)}:{})});
 const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
 return r;
}
test.before(async()=>{dir=await mkdtemp(path.join(tmpdir(),'hillkings-v2-'));child=spawn(process.execPath,['server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:'31337',HOST:'127.0.0.1',TRUST_PROXY:'0',DATA_DIR:dir,NODE_ENV:'development',RESEND_API_KEY:'',EMAIL_FROM:''},stdio:'ignore'});for(let i=0;i<50;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await delay(100);}throw Error('Test server did not start');});
test.after(async()=>{child?.kill();await delay(100);await rm(dir,{recursive:true,force:true});});
test('Public pages and complete admin stylesheet render',async()=>{for(const url of ['/','/collection','/admin','/assets/admin.css','/piece/paraiba-2-09','/piece/colar-paraiba-2-61']){const r=await req(url);assert.equal(r.status,200);assert.ok((await r.text()).length>100);}const html=await(await req('/admin')).text();assert.match(html,/admin.css/);});
test('All three pieces have 3D and corrected commercial prices',async()=>{const j=await(await req('/api/catalog')).json();assert.equal(j.products.length,3);assert.deepEqual(j.products.map(p=>p.priceCents),[50000000,20000000,21000000]);assert.ok(j.products.every(p=>p.modelUrl.endsWith('.glb')&&p.modelKind==='approximation'));assert.equal(j.products.filter(p=>p.media[0].kind==='editorial').length,2);assert.ok(j.products.every(p=>p.media.some(m=>m.kind==='original'&&m.type==='video')));assert.ok(j.products.every(p=>!('internalNotes'in p)));});
test('Three self-contained GLBs and two editorial covers are served',async()=>{for(const name of ['ruby-ring','paraiba-loose','paraiba-necklace']){const r=await req('/models/'+name+'.glb');assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(8),b.length);}for(const n of ['paraiba','necklace'])assert.equal((await req(`/media/${n}-editorial.webp`)).status,200);const r=await req('/models/paraiba-loose.glb',{headers:{Range:'bytes=0-19'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,20);});
test('Administrative writes reject untrusted origins',async()=>{const r=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:JSON.stringify({username:'admin',password:'admin'})});assert.equal(r.status,403);assert.equal((await req('/api/admin/dashboard')).status,401);});
test('Local admin/admin forces password change before write access',async()=>{let r=await req('/api/admin/login',{method:'POST',body:{username:'admin',password:'admin'}});assert.equal(r.status,200);let j=await r.json();assert.equal(j.mustChange,true);csrf=j.csrf;assert.equal((await req('/api/admin/dashboard')).status,428);r=await req('/api/admin/account',{method:'POST',body:{username:'admin',currentPassword:'admin',newPassword:'OnlyForThisTest_92_Studio'}});assert.equal(r.status,200);j=await r.json();csrf=j.csrf;assert.equal(j.mustChange,false);assert.equal((await req('/api/admin/dashboard')).status,200);});
test('A sold-status edit preserves editorial provenance and 3D',async()=>{const d=await(await req('/api/admin/dashboard')).json(),p=d.products.find(p=>p.id==='HK-G001');const r=await req('/api/admin/products/'+p.id,{method:'PUT',body:{...p,status:'sold'}});assert.equal(r.status,200);const saved=(await r.json()).product;assert.equal(saved.status,'sold');assert.equal(saved.media[0].kind,'editorial');assert.equal(saved.modelUrl,'/models/paraiba-loose.glb');assert.equal((await req('/api/admin/products/'+p.id,{method:'PUT',body:p})).status,409);const pub=await(await req('/api/catalog')).json();assert.equal(pub.products.find(p=>p.id==='HK-G001').status,'sold');});
test('New product creation and archival work',async()=>{const d=await(await req('/api/admin/dashboard')).json();const p={...d.products[0],id:'HK-TEST',slug:'test-piece',namePt:'Peça de teste',name:'Test piece',published:false,modelUrl:'',modelKind:'none',modelNotes:''};let r=await req('/api/admin/products',{method:'POST',body:p});assert.equal(r.status,201);const saved=(await r.json()).product;r=await req('/api/admin/products/'+p.id,{method:'DELETE',body:{version:saved.version}});assert.equal(r.status,200);assert.equal((await r.json()).product.status,'archived');});
test('Contacts can be changed without modifying code',async()=>{const d=await(await req('/api/admin/dashboard')).json();const r=await req('/api/admin/settings',{method:'PUT',body:{...d.settings,contactEmail:'test@example.invalid',whatsapp:'5521999999999'}});assert.equal(r.status,200);const j=await r.json();assert.equal(j.settings.contactEmail,'test@example.invalid');assert.equal(j.settings.whatsapp,'5521999999999');});
test('Authenticated self-contained GLB upload is accepted',async()=>{const body=await readFile('public/models/paraiba-loose.glb');const r=await req('/api/admin/uploads',{method:'POST',body,headers:{'Content-Type':'model/gltf-binary'}});assert.equal(r.status,201);const j=await r.json();assert.equal(j.type,'model');assert.match(j.url,/^\/uploads\/[a-f0-9-]+\.glb$/);});
test('Inquiries persist without pretending to send an email',async()=>{const {token}=await(await req('/api/contact-token')).json();await delay(1100);const r=await req('/api/inquiries',{method:'POST',body:{token,name:'Cliente de teste',email:'qa@example.invalid',message:'Esta é somente uma mensagem automatizada de teste.',phone:'',productId:'HK-J002',consent:true,website:''}});assert.equal(r.status,201);const j=await r.json();assert.equal(j.emailStatus,'queued');const d=await(await req('/api/admin/dashboard')).json();assert.equal(d.emailConfigured,false);assert.equal(d.inquiries.length,1);});
test('Logo favicon routes and manifest are served with correct MIME types',async()=>{
 for(const [p,type] of [['/favicon.ico','image/x-icon'],['/icons/favicon-32.png','image/png'],['/icons/apple-touch-icon.png','image/png'],['/site.webmanifest','application/manifest+json']]){const r=await req(p);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),type);}
 const data=await(await req('/api/catalog')).json();assert.ok(!('contactEmail' in data.settings));
});
test('Structured concierge enquiry persists for administrators',async()=>{
 const {token}=await(await req('/api/contact-token')).json();await delay(1050);
 const r=await req('/api/inquiries',{method:'POST',body:{name:'Cliente Exemplo',email:'example@example.com',phone:'+5511900000000',requestType:'wholesale',destination:'Lisboa, Portugal',company:'Atelier Exemplo',message:'Gostaria de condições para compra de gemas no atacado.',consent:true,token}});
 assert.equal(r.status,201);const result=await r.json();assert.equal(result.emailStatus,'queued');
 const dashboard=await(await req('/api/admin/dashboard')).json();const item=dashboard.inquiries.find(i=>i.id===result.id);
 assert.equal(item.data.requestType,'wholesale');assert.equal(item.data.destination,'Lisboa, Portugal');assert.equal(item.data.company,'Atelier Exemplo');
 assert.equal(item.data.productId,'');
});
test('Unrecognised enquiry type is rejected rather than persisted',async()=>{
 const {token}=await(await req('/api/contact-token')).json();await delay(1050);
 const r=await req('/api/inquiries',{method:'POST',body:{name:'Cliente Exemplo',email:'example@example.com',requestType:'<script>',message:'Pedido inválido de teste.',consent:true,token}});
 assert.equal(r.status,400);
});
