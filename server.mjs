import http from 'node:http';
import {createReadStream,statSync,existsSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {db,init,DATA_DIR,settings,products,productById,publicProduct,publicSettings,audit,secret,hitLimit,housekeeping} from './lib/database.mjs';
import {randomToken,sha256,digest,hashPassword,checkPassword,validPassword,safeEqual,emailIsValid,HttpError,requireField,cleanString} from './lib/security.mjs';
import {validateProduct,validateSettings} from './lib/validation.mjs';
import {renderPage} from './lib/templates.mjs';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(ROOT,'public');
const PROD=process.env.NODE_ENV==='production';
const PORT=Number(process.env.PORT)||3000;
const HOST=process.env.HOST||(PROD?'0.0.0.0':'127.0.0.1');
const APP_URL=process.env.APP_URL||`http://localhost:${PORT}`;
if(PROD&&(!process.env.APP_URL||!APP_URL.startsWith('https://')))throw new Error('Configure APP_URL com o domínio HTTPS de produção.');
await init();housekeeping();
const housekeepingTimer=setInterval(housekeeping,3600000);housekeepingTimer.unref();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf','.glb':'model/gltf-binary','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8'};
const methods=new Set(['GET','HEAD','POST','PUT','PATCH','DELETE']);
function headers(res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 if(PROD)res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}
function respond(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));}
function clientIP(req){return process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():String(req.socket.remoteAddress);}
function originCheck(req){
 const origin=req.headers.origin;
 const expected=PROD?new URL(APP_URL).origin:`http://${req.headers.host}`;
 if(!origin||origin!==expected)throw new HttpError(403,'Origem da solicitação não autorizada. Reabra esta página.');
}
async function bytes(req,max=65536){
 if(Number(req.headers['content-length']||0)>max)throw new HttpError(413,'Arquivo ou solicitação acima do limite permitido.');
 const chunks=[];let len=0;
 for await(const chunk of req){len+=chunk.length;if(len>max)throw new HttpError(413,'Arquivo ou solicitação acima do limite permitido.');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
async function jsonBody(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Envie a solicitação como JSON.');
 try{return JSON.parse((await bytes(req)).toString('utf8'));}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Solicitação inválida.');}
}
function cookie(req){return String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('hk_session='))?.slice(11)||'';}
function session(req,{allowInitial=false,write=false}={}){
 const token=cookie(req);if(!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'Entre para continuar.');
 const row=db.prepare('SELECT s.*,u.username,u.must_change FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?').get(sha256(token),Date.now());
 if(!row)throw new HttpError(401,'Sua sessão expirou. Entre novamente.');
 if(row.must_change&&!allowInitial)throw new HttpError(428,'Altere a senha inicial antes de usar a administração.');
 if(write&&!safeEqual(row.csrf,String(req.headers['x-csrf-token']||'')))throw new HttpError(403,'Token de segurança inválido. Atualize a página.');
 return row;
}
function setSessionCookie(res,token,maxAge=28800){res.setHeader('Set-Cookie',`hk_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${PROD?'; Secure':''}`);}
function publicCatalog(){const s=publicSettings();return {settings:s,products:products({publicOnly:true}).filter(p=>s.showSold||p.status!=='sold').map(publicProduct)};}
function deliverable(id){const row=db.prepare('SELECT * FROM inquiries WHERE id=?').get(id);return row?{...row,data:JSON.parse(row.data)}:null;}
async function deliverEmail(id){
 const item=deliverable(id);if(!item)throw new HttpError(404,'Solicitação não encontrada.');
 if(item.email_status==='sent')return {status:'sent',id:item.email_id};
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM){db.prepare("UPDATE inquiries SET email_status='queued',last_error=? WHERE id=?").run('Configure RESEND_API_KEY e EMAIL_FROM no servidor para ativar o envio.',id);return {status:'queued'};}
 const to=settings().contactEmail;const d=item.data;
 const text=`NOVA SOLICITAÇÃO HILLKINGS\n\nReferência: ${id}\nNome: ${d.name}\nE-mail: ${d.email}\nWhatsApp: ${d.phone||'Não informado'}\nTipo de atendimento: ${{general:'Consulta geral',presentation:'Apresentação de peça',sourcing:'Gema sob encomenda',wholesale:'Atacado',international:'Entrega internacional'}[d.requestType]||'Consulta geral'}\nDestino: ${d.destination||'Não informado'}\nEmpresa: ${d.company||'Não informada'}\nPeça: ${d.productName||'Consulta geral'} (${d.productId||'—'})\n\n${d.message}\n\nConsentimento para contato: confirmado em ${item.created_at}\n\nGerencie a conversa em ${APP_URL}/admin`;
 try{
  const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`hk-${id}-${sha256(to).slice(0,12)}`},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],reply_to:d.email,subject:`Hillkings | ${d.productName||'Atendimento privado'} | ${d.name}`,text})});
  const result=await response.json();
  if(!response.ok||!result.id)throw new Error(result.message||`Provedor retornou ${response.status}`);
  db.prepare("UPDATE inquiries SET email_status='sent',email_id=?,email_to=?,last_error=NULL WHERE id=?").run(result.id,to,id);
  return {status:'sent',id:result.id};
 }catch(error){db.prepare("UPDATE inquiries SET email_status='failed',email_to=?,last_error=? WHERE id=?").run(to,cleanString(error.message,800),id);return {status:'failed'};}
}
function serveFile(req,res,file){
 if(!existsSync(file)||!statSync(file).isFile())throw new HttpError(404,'Arquivo não encontrado.');
 const st=statSync(file),ext=path.extname(file).toLowerCase();
 res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');
 res.setHeader('Cache-Control',file.includes(`${path.sep}uploads${path.sep}`)?'public, max-age=31536000, immutable':'public, max-age=3600');
 if(ext==='.pdf')res.setHeader('Content-Disposition','inline');
 const range=req.headers.range;
 if(range){
  const m=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});res.end();return;}
  let start=m[1]?Number(m[1]):Math.max(0,st.size-Number(m[2]));let end=m[1]?(m[2]?Number(m[2]):st.size-1):st.size-1;
  end=Math.min(end,st.size-1);
  if(start>end||start>=st.size){res.writeHead(416,{'Content-Range':`bytes */${st.size}`});res.end();return;}
  res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':end-start+1});
  if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);return;
 }
 res.writeHead(200,{'Content-Length':st.size});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
}
function uploadExtension(buf){
 if(buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return '.png';
 if(buf.length>=3&&buf[0]===255&&buf[1]===216&&buf[2]===255)return '.jpg';
 if(buf.length>=12&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')return '.webp';
 if(buf.toString('ascii',0,5)==='%PDF-')return '.pdf';
 if(buf.length>=12&&buf.toString('ascii',4,8)==='ftyp')return '.mp4';
 if(buf.length>=12&&buf.toString('ascii',0,4)==='glTF'&&buf.readUInt32LE(4)===2&&buf.readUInt32LE(8)===buf.length)return '.glb';
 throw new HttpError(415,'Formato não permitido. Use JPEG, PNG, WebP, MP4, PDF ou GLB 2.0.');
}
function validateGlb(buf){
 try{
  const n=buf.readUInt32LE(12);if(n>8*1024*1024||20+n>buf.length||buf.toString('ascii',16,20)!=='JSON')throw Error();
  const d=JSON.parse(buf.toString('utf8',20,20+n).trim());
  requireField(!d.buffers?.some(b=>b.uri)&&!d.images?.some(i=>i.uri),'O GLB precisa ser autocontido, sem arquivos externos.');
  requireField(!(d.extensionsRequired||[]).some(x=>/draco|meshopt/i.test(x)),'Exporte o GLB sem compressão Draco ou Meshopt.');
  requireField(!d.materials?.some(m=>m.pbrMetallicRoughness?.baseColorTexture),'Este visualizador usa materiais sólidos. Exporte o CAD sem texturas de cor.');
  requireField((d.accessors||[]).reduce((sum,a)=>sum+(a.count||0),0)<5000000,'Modelo 3D muito complexo. Otimize a malha antes do envio.');
 }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'GLB inválido ou não suportado.');}
}
const server=http.createServer(async(req,res)=>{
 headers(res);
 try{
  if(!methods.has(req.method))throw new HttpError(405,'Método não permitido.');
  const url=new URL(req.url,'http://localhost');const p=url.pathname;
  if(['POST','PUT','PATCH','DELETE'].includes(req.method))originCheck(req);
  if(p==='/api/health')return respond(res,200,{ok:true});
  if(p==='/api/catalog'&&req.method==='GET')return respond(res,200,publicCatalog());
  if(p==='/api/contact-token'&&req.method==='GET'){
   const payload=`${Date.now()}.${randomToken().slice(0,16)}`;
   return respond(res,200,{token:`${payload}.${digest(payload,secret)}`});
  }
  if(p==='/api/inquiries'&&req.method==='POST'){
   if(!hitLimit(`contact:${digest(clientIP(req),secret)}`,5,600000))throw new HttpError(429,'Aguarde alguns minutos antes de enviar outra mensagem.');
   const b=await jsonBody(req);if(b.website)return respond(res,200,{ok:true,id:'received',emailStatus:'queued'});
   const parts=String(b.token||'').split('.');const payload=parts.slice(0,2).join('.');
   requireField(parts.length===3&&safeEqual(digest(payload,secret),parts[2])&&Date.now()-Number(parts[0])>=1000&&Date.now()-Number(parts[0])<3600000,'Reabra o formulário e tente novamente.');
   const requestType=cleanString(b.requestType||'general',30);
   requireField(['general','presentation','sourcing','wholesale','international'].includes(requestType),'Tipo de atendimento inválido.');
   const data={name:cleanString(b.name,120),email:cleanString(b.email,254),phone:cleanString(b.phone,40),message:cleanString(b.message,4000),productId:cleanString(b.productId,40),requestType,destination:cleanString(b.destination,160),company:requestType==='wholesale'?cleanString(b.company,160):'',consent:true};
   requireField(data.name.length>=2&&emailIsValid(data.email)&&data.message.length>=10&&b.consent===true,'Preencha nome, e-mail, mensagem e autorize o contato.');
   requireField(!/[\r\n]/.test(data.name),'Nome inválido.');
   if(data.productId){const product=productById(data.productId);requireField(product&&product.published&&product.status!=='archived','Peça não encontrada.');data.productName=product.name;}
   const id=randomUUID();db.prepare('INSERT INTO inquiries(id,data,created_at)VALUES(?,?,?)').run(id,JSON.stringify(data),new Date().toISOString());
   const delivery=await deliverEmail(id);return respond(res,201,{ok:true,id,emailStatus:delivery.status});
  }
  if(p==='/api/admin/login'&&req.method==='POST'){
   const b=await jsonBody(req);const username=cleanString(b.username,40);const password=typeof b.password==='string'?b.password:'';
   if(!hitLimit(`login:${digest(clientIP(req),secret)}`,8,900000))throw new HttpError(429,'Muitas tentativas. Aguarde 15 minutos.');
   const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
   const fallback=db.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash;
   const good=await checkPassword(password.slice(0,128),user?.password_hash||fallback);
   if(!user||!good)throw new HttpError(401,'Usuário ou senha incorretos.');
   if(user.insecure_bootstrap&&(PROD||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(String(req.socket.remoteAddress).replace(/^\[|\]$/g,''))))throw new HttpError(403,'A senha inicial só pode ser usada localmente. Configure uma senha segura antes da publicação.');
   const token=randomToken(),csrf=randomToken();db.prepare('INSERT INTO sessions(hash,user_id,csrf,expires_at)VALUES(?,?,?,?)').run(sha256(token),user.id,csrf,Date.now()+28800000);
   setSessionCookie(res,token);audit('login',username);
   return respond(res,200,{ok:true,username:user.username,mustChange:!!user.must_change,csrf});
  }
  if(p==='/api/admin/session'&&req.method==='GET'){
   const u=session(req,{allowInitial:true});return respond(res,200,{username:u.username,mustChange:!!u.must_change,csrf:u.csrf});
  }
  if(p==='/api/admin/logout'&&req.method==='POST'){
   const u=session(req,{allowInitial:true,write:true});db.prepare('DELETE FROM sessions WHERE hash=?').run(u.hash);setSessionCookie(res,'',0);return respond(res,200,{ok:true});
  }
  if(p==='/api/admin/account'&&req.method==='POST'){
   const u=session(req,{allowInitial:true,write:true});const b=await jsonBody(req);const username=cleanString(b.username||u.username,40);
   requireField(/^[a-zA-Z0-9_.-]{3,40}$/.test(username),'Use de 3 a 40 letras, números, pontos, hífens ou sublinhados no usuário.');
   requireField(validPassword(b.newPassword),'Use uma senha exclusiva de 12 a 128 caracteres, sem iniciar com admin, password, 123456 ou hillkings.');
   const user=db.prepare('SELECT * FROM users WHERE id=?').get(u.user_id);
   requireField(await checkPassword(String(b.currentPassword||'').slice(0,128),user.password_hash),'A senha atual não confere.');
   db.prepare('UPDATE users SET username=?,password_hash=?,must_change=0,insecure_bootstrap=0 WHERE id=?').run(username,await hashPassword(b.newPassword),u.user_id);
   db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.user_id);
   const token=randomToken(),csrf=randomToken();db.prepare('INSERT INTO sessions(hash,user_id,csrf,expires_at)VALUES(?,?,?,?)').run(sha256(token),u.user_id,csrf,Date.now()+28800000);setSessionCookie(res,token);
   audit('account.changed','Credenciais alteradas; sessões anteriores encerradas.');return respond(res,200,{ok:true,username,mustChange:false,csrf});
  }
  if(p.startsWith('/api/admin/')){
   const u=session(req,{write:req.method!=='GET'});
   if(p==='/api/admin/dashboard'&&req.method==='GET'){
    const leads=db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 500').all().map(r=>({...r,data:JSON.parse(r.data)}));
    return respond(res,200,{products:products(),settings:settings(),inquiries:leads,inquiryTotal:db.prepare('SELECT COUNT(*) AS n FROM inquiries').get().n,audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 50').all(),emailConfigured:!!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM),production:PROD});
   }
   if(p==='/api/admin/products'&&req.method==='POST'){
    const b=await jsonBody(req),product=validateProduct(b);
    if(db.prepare('SELECT id FROM products WHERE id=? OR slug=?').get(product.id,product.slug))throw new HttpError(409,'Essa referência ou endereço já existe.');
    db.prepare('INSERT INTO products(id,slug,data,updated_at)VALUES(?,?,?,?)').run(product.id,product.slug,JSON.stringify(product),new Date().toISOString());
    audit('product.created',`${u.username}: ${product.id}`);return respond(res,201,{ok:true,product:productById(product.id)});
   }
   const pm=/^\/api\/admin\/products\/([a-zA-Z0-9_-]+)$/.exec(p);
   if(pm&&(req.method==='PUT'||req.method==='DELETE')){
    const existing=productById(pm[1]);if(!existing)throw new HttpError(404,'Peça não encontrada.');
    const b=await jsonBody(req);if(Number(b.version)!==existing.version)throw new HttpError(409,'A peça mudou em outra sessão. Atualize antes de salvar.');
    const product=req.method==='DELETE'?{...existing,status:'archived',published:false}:validateProduct({...b,id:existing.id});
    const duplicate=db.prepare('SELECT id FROM products WHERE slug=? AND id<>?').get(product.slug,existing.id);if(duplicate)throw new HttpError(409,'Este endereço já pertence a outra peça.');
    const {version,updatedAt,...data}=product;db.prepare('UPDATE products SET slug=?,data=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(data.slug,JSON.stringify(data),new Date().toISOString(),existing.id,existing.version);
    audit(req.method==='DELETE'?'product.archived':'product.updated',`${u.username}: ${existing.id} · ${existing.status} → ${data.status}`);return respond(res,200,{ok:true,product:productById(existing.id)});
   }
   if(p==='/api/admin/settings'&&req.method==='PUT'){
    const b=await jsonBody(req),current=settings();if(Number(b.version)!==current.version)throw new HttpError(409,'As configurações mudaram em outra sessão. Atualize a página.');
    const next=validateSettings(b,current);delete next.version;
    db.prepare('UPDATE settings SET data=?,version=version+1 WHERE id=1').run(JSON.stringify(next));audit('settings.updated',`${u.username}: contatos e configurações atualizados.`);return respond(res,200,{ok:true,settings:settings()});
   }
   if(p==='/api/admin/uploads'&&req.method==='POST'){
    const buf=await bytes(req,60*1024*1024);const ext=uploadExtension(buf);
    if(!['.mp4','.glb'].includes(ext)&&buf.length>12*1024*1024)throw new HttpError(413,'Imagens e relatórios têm limite de 12 MB.');
    if(ext==='.glb')validateGlb(buf);
    const name=`${randomUUID()}${ext}`;writeFileSync(path.join(DATA_DIR,'uploads',name),buf,{flag:'wx',mode:0o600});
    audit('media.uploaded',`${u.username}: ${name}`);return respond(res,201,{url:`/uploads/${name}`,type:ext==='.mp4'?'video':ext==='.glb'?'model':ext==='.pdf'?'document':'image',size:buf.length});
   }
   const im=/^\/api\/admin\/inquiries\/([a-f0-9-]+)(\/retry)?$/.exec(p);
   if(im&&req.method==='POST'&&im[2]){if(!hitLimit(`retry:${u.user_id}`,20,60000))throw new HttpError(429,'Aguarde um minuto.');const result=await deliverEmail(im[1]);return respond(res,200,result);}
   if(im&&req.method==='PATCH'){
    const b=await jsonBody(req);requireField(['new','read','closed'].includes(b.status),'Situação inválida.');
    const r=db.prepare('UPDATE inquiries SET status=? WHERE id=?').run(b.status,im[1]);if(!r.changes)throw new HttpError(404,'Mensagem não encontrada.');audit('inquiry.updated',`${u.username}: ${im[1]} → ${b.status}`);return respond(res,200,{ok:true});
   }
   if(im&&req.method==='DELETE'){
    db.prepare('DELETE FROM inquiries WHERE id=?').run(im[1]);audit('inquiry.deleted',`${u.username}: ${im[1]}`);return respond(res,200,{ok:true});
   }
   if(p==='/api/admin/export'&&req.method==='GET'){
    audit('export.created',`${u.username}: exportação administrativa.`);
    return respond(res,200,{exportedAt:new Date().toISOString(),settings:settings(),products:products(),inquiries:db.prepare('SELECT * FROM inquiries').all().map(r=>({...r,data:JSON.parse(r.data)}))},{'Content-Disposition':'attachment; filename="hillkings-export.json"'});
   }
   throw new HttpError(404,'Recurso administrativo não encontrado.');
  }
  if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpError(405,'Método não permitido.');
  if(p==='/robots.txt'){
   res.writeHead(200,{'Content-Type':'text/plain'});res.end(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${APP_URL}/sitemap.xml\n`);return;
  }
  if(p==='/sitemap.xml'){
   const paths=['/','/collection','/private',...products({publicOnly:true}).map(p=>`/piece/${p.slug}`)];
   res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'});res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(p=>`<url><loc>${APP_URL}${p}</loc></url>`).join('')}</urlset>`);return;
  }
  if(/^\/(assets|media|brand|models|uploads|icons)\/[a-zA-Z0-9_.-]+$/.test(p)||['/favicon.png','/favicon.ico','/site.webmanifest'].includes(p)){
   const file=p.startsWith('/uploads/')?path.join(DATA_DIR,p.slice(1)):path.join(PUBLIC,p.slice(1));return serveFile(req,res,file);
  }
  const catalog=publicCatalog();const lang=url.searchParams.get('lang')==='en'?'en':'pt';
  const rendered=renderPage(p,catalog,lang,APP_URL);
  res.writeHead(rendered.status||200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(p==='/admin'?{'X-Robots-Tag':'noindex, nofollow'}:{})});res.end(rendered.html);
 }catch(error){
  if(res.headersSent){res.destroy();return;}
  const status=error instanceof HttpError?error.status:500;
  if(status===500)console.error('[Hillkings]',error);
  respond(res,status,{error:status===500?'Não foi possível concluir agora. Tente novamente.':error.message});
 }
});
server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
server.listen(PORT,HOST,()=>console.log(`Hillkings pronta em http://${HOST}:${PORT}\nAdministração: /admin\n${PROD?'Produção: HTTPS no proxy reverso.':'Primeiro acesso local: admin / admin; troca obrigatória.'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();});
