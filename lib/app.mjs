/** Hillkings Vercel request handler. All writes use Supabase, never /var/task or /tmp. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {store,configured,cloudOrigin} from './cloud.mjs';
import {publicCatalog,settings,products,productById,contactSecret,ensureAdmin,hitLimit,audit} from './catalog.mjs';
import {session,newSession,setSessionCookie} from './auth.mjs';
import {beginUpload,completeUpload,downloadUrl,assertUploadedAssets} from './media.mjs';
import {deliverEmail} from './mail.mjs';
import {response,appOrigin,originCheck,jsonBody} from './http.mjs';
import {serveFile} from './static.mjs';
import {renderPage} from './templates.mjs';
import {validateProduct,validateSettings} from './validation.mjs';
import {randomToken,sha256,digest,hashPassword,checkPassword,validPassword,safeEqual,emailIsValid,HttpError,requireField,cleanString,escapeHtml} from './security.mjs';
const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
export const RELEASE='4.0.0-vercel-supabase';
const now=()=>new Date().toISOString();
const isProduction=()=>!!process.env.VERCEL||process.env.NODE_ENV==='production';
function securityHeaders(res){
 let cloud='';try{if(configured())cloud=' '+cloudOrigin();}catch{}
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:${cloud}; font-src 'self'; connect-src 'self'${cloud}; media-src 'self' blob:${cloud}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
 if(isProduction())res.setHeader('Strict-Transport-Security','max-age=31536000');
 res.setHeader('X-Hillkings-Release',RELEASE);
}
async function limit(req,name,max,ms){const ip=process.env.VERCEL?String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim():String(req.socket?.remoteAddress||'unknown');const secret=await contactSecret();if(!await hitLimit(`${name}:${digest(ip,secret)}`,max,ms))throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');return secret;}
function record(p){const {version,updatedAt,...data}=p;return data;}
let lastCleanup=0;
async function dashboard(){
 if(Date.now()-lastCleanup>3600000){await store.rpc('hk_cleanup',{});lastCleanup=Date.now();}
 const [ps,s,is,events]=await Promise.all([products(),settings(),store.rows('inquiries',{order:'created_at.desc',limit:'500'}),store.rows('audit',{order:'id.desc',limit:'50'})]);
 return {products:ps,settings:s,inquiries:is,inquiryTotal:is.length,audit:events,emailConfigured:!!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM),production:isProduction(),storageConfigured:configured()};
}
export async function handler(req,res){
 securityHeaders(res);
 try{
  const url=new URL(req.url,'http://localhost');
  // __hk_path is reserved only for explicit rewrites, not supplied by clients.
  if(['/api/index','/api/index.mjs'].includes(url.pathname)&&url.searchParams.has('__hk_path')){url.pathname='/'+url.searchParams.get('__hk_path').replace(/^\/+/, '');url.searchParams.delete('__hk_path');}
  const p=url.pathname,method=req.method||'GET';
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))throw new HttpError(405,'Método não permitido.');
  if(['POST','PUT','PATCH','DELETE'].includes(method))originCheck(req);
  if(p==='/release.json')return response(res,200,{release:RELEASE,backend:'supabase',configured:configured(),localDatabase:false});
  if(p==='/api/health'){
   if(!configured())return response(res,200,{ok:true,release:RELEASE,mode:'catalog-only',databaseReady:false,adminReady:false,emailConfigured:false});
   await settings();return response(res,200,{ok:true,release:RELEASE,mode:'live',databaseReady:true,adminReady:!!await store.one('users',{id:'eq.1',select:'id'}),emailConfigured:!!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)});
  }
  if(/^\/(assets|media|brand|models|icons)\/[a-zA-Z0-9_.-]+$/.test(p)||['/favicon.png','/favicon.ico','/site.webmanifest'].includes(p)){
   if(!['GET','HEAD'].includes(method))throw new HttpError(405,'Método não permitido.');return serveFile(req,res,path.join(PUBLIC,p.slice(1)));
  }
  const upload=/^\/uploads\/([a-f0-9-]{36}\.(jpg|png|webp|pdf|mp4|glb))$/.exec(p);
  if(upload&&['GET','HEAD'].includes(method)){const target=await downloadUrl(upload[1]);res.writeHead(302,{Location:target,'Cache-Control':'private, no-store'});res.end();return;}
  if(p==='/api/catalog'&&method==='GET')return response(res,200,await publicCatalog());
  if(p.startsWith('/api/')&&!configured())throw new HttpError(503,'O formulário e a administração ainda não foram ativados. Utilize o WhatsApp. Sua mensagem não foi enviada nem armazenada.');
  if(p==='/api/contact-token'&&method==='GET'){
   const payload=`${Date.now()}.${randomToken().slice(0,16)}`,secret=await contactSecret();return response(res,200,{token:`${payload}.${digest(payload,secret)}`});
  }
  if(p==='/api/inquiries'&&method==='POST'){
   const secret=await limit(req,'contact',5,600000),b=await jsonBody(req);
   if(b.website)return response(res,200,{ok:true,id:'received',emailStatus:'queued'});
   const parts=String(b.token||'').split('.'),payload=parts.slice(0,2).join('.'),age=Date.now()-Number(parts[0]);
   requireField(parts.length===3&&safeEqual(digest(payload,secret),parts[2])&&age>=1000&&age<3600000,'Reabra o formulário e tente novamente.');
   const data={name:cleanString(b.name,120),email:cleanString(b.email,254),phone:cleanString(b.phone,40),message:cleanString(b.message,4000),productId:cleanString(b.productId,40),requestType:cleanString(b.requestType||'general',30),destination:cleanString(b.destination,160),company:cleanString(b.company,160),consent:true};
   requireField(data.name.length>=2&&emailIsValid(data.email)&&data.message.length>=10&&b.consent===true,'Preencha nome, e-mail, mensagem e autorize o contato.');requireField(!/[\r\n]/.test(data.name),'Nome inválido.');
   requireField(['general','presentation','sourcing','wholesale','international'].includes(data.requestType),'Tipo de atendimento inválido.');
   if(data.productId){const product=await productById(data.productId);requireField(product&&product.published&&product.status!=='archived','Peça não encontrada.');data.productName=product.name;}
   const id=randomUUID();await store.insert('inquiries',{id,data,created_at:now()});
   let delivery={status:'queued'};try{delivery=await deliverEmail(id,appOrigin(req));}catch{console.warn('[Hillkings] inquiry-saved-email-pending');}
   return response(res,201,{ok:true,id,emailStatus:delivery.status});
  }
  if(p==='/api/admin/login'&&method==='POST'){
   await limit(req,'login',8,900000);const b=await jsonBody(req),username=cleanString(b.username,40),password=typeof b.password==='string'?b.password:'';
   const initial=await ensureAdmin(),user=await store.one('users',{username:`eq.${username}`});
   const good=await checkPassword(password.slice(0,128),user?.password_hash||initial.password_hash);
   if(!user||!good)throw new HttpError(401,'Usuário ou senha incorretos.');
   const result=await newSession(res,user);await audit('login',username);return response(res,200,result);
  }
  if(p==='/api/admin/session'&&method==='GET'){const u=await session(req,{allowInitial:true});return response(res,200,{username:u.username,mustChange:!!u.must_change,csrf:u.csrf});}
  if(p==='/api/admin/logout'&&method==='POST'){const u=await session(req,{allowInitial:true,write:true});await store.remove('sessions',{hash:`eq.${u.hash}`});setSessionCookie(res,'',0);return response(res,200,{ok:true});}
  if(p==='/api/admin/account'&&method==='POST'){
   const u=await session(req,{allowInitial:true,write:true}),b=await jsonBody(req),username=cleanString(b.username||u.username,40);
   requireField(/^[a-zA-Z0-9_.-]{3,40}$/.test(username),'Usuário inválido.');requireField(validPassword(b.newPassword),'Use uma senha exclusiva de 12 a 128 caracteres.');requireField(await checkPassword(String(b.currentPassword||'').slice(0,128),u.password_hash),'A senha atual não confere.');
   const token=randomToken(),csrf=randomToken(),hash=await hashPassword(b.newPassword);
   const changed=await store.rpc('hk_change_account',{p_id:u.user_id,p_expected_hash:u.password_hash,p_username:username,p_password_hash:hash,p_session_hash:sha256(token),p_csrf:csrf,p_expires_at:Date.now()+28800000});
   if(changed!==true)throw new HttpError(409,'A conta mudou em outra sessão. Entre novamente.');setSessionCookie(res,token);await audit('account.changed',username);return response(res,200,{ok:true,username,mustChange:false,csrf});
  }
  if(p.startsWith('/api/admin/')){
   const u=await session(req,{write:method!=='GET'});
   if(p==='/api/admin/dashboard'&&method==='GET')return response(res,200,await dashboard());
   if(p==='/api/admin/products'&&method==='POST'){
    const product=validateProduct(await jsonBody(req));await assertUploadedAssets(product);
    await store.insert('products',{id:product.id,slug:product.slug,data:record(product),version:1,updated_at:now()});await audit('product.created',`${u.username}: ${product.id}`);return response(res,201,{ok:true,product:await productById(product.id)});
   }
   const pm=/^\/api\/admin\/products\/([a-zA-Z0-9_-]+)$/.exec(p);
   if(pm&&['PUT','DELETE'].includes(method)){
    const previous=await productById(pm[1]);if(!previous)throw new HttpError(404,'Peça não encontrada.');const b=await jsonBody(req);if(Number(b.version)!==previous.version)throw new HttpError(409,'A peça mudou em outra sessão. Atualize.');
    const product=method==='DELETE'?{...previous,status:'archived',published:false}:validateProduct({...b,id:previous.id});await assertUploadedAssets(product);
    const saved=await store.update('products',{id:`eq.${previous.id}`,version:`eq.${previous.version}`},{slug:product.slug,data:record(product),version:previous.version+1,updated_at:now()});
    if(!saved.length)throw new HttpError(409,'A peça mudou em outra sessão. Atualize.');await audit('product.updated',`${u.username}: ${previous.id} → ${product.status}`);return response(res,200,{ok:true,product:await productById(previous.id)});
   }
   if(p==='/api/admin/settings'&&method==='PUT'){
    const b=await jsonBody(req),current=await settings();if(Number(b.version)!==current.version)throw new HttpError(409,'Configurações alteradas em outra sessão. Atualize.');const next=validateSettings(b,current);delete next.version;
    const rows=await store.update('settings',{id:'eq.1',version:`eq.${current.version}`},{data:next,version:current.version+1});if(!rows.length)throw new HttpError(409,'Configurações alteradas. Atualize.');await audit('settings.updated',u.username);return response(res,200,{ok:true,settings:await settings()});
   }
   if(p==='/api/admin/uploads/start'&&method==='POST'){await limit(req,'upload',30,60000);return response(res,201,await beginUpload(await jsonBody(req),u.user_id));}
   if(p==='/api/admin/uploads/complete'&&method==='POST'){const b=await jsonBody(req),result=await completeUpload(String(b.name||''),u.user_id);await audit('media.uploaded',`${u.username}: ${b.name}`);return response(res,201,result);}
   if(p==='/api/admin/uploads'&&method==='POST')throw new HttpError(400,'Atualize o painel: esta versão envia arquivos diretamente ao armazenamento, sem o limite de corpo das Functions.');
   const im=/^\/api\/admin\/inquiries\/([a-f0-9-]+)(\/retry)?$/.exec(p);
   if(im&&method==='POST'&&im[2]){await limit(req,'retry',20,60000);return response(res,200,await deliverEmail(im[1],appOrigin(req)));}
   if(im&&method==='PATCH'){
    const b=await jsonBody(req);requireField(['new','read','closed'].includes(b.status),'Situação inválida.');const r=await store.update('inquiries',{id:`eq.${im[1]}`},{status:b.status});if(!r.length)throw new HttpError(404,'Solicitação não encontrada.');await audit('inquiry.updated',im[1]);return response(res,200,{ok:true});
   }
   if(im&&method==='DELETE'){await store.remove('inquiries',{id:`eq.${im[1]}`});await audit('inquiry.deleted',im[1]);return response(res,200,{ok:true});}
   if(p==='/api/admin/export'&&method==='GET'){
    const d=await dashboard();await audit('export.created',u.username);return response(res,200,{exportedAt:now(),settings:d.settings,products:d.products,inquiries:d.inquiries},{'Content-Disposition':'attachment; filename="hillkings-export.json"'});
   }
   throw new HttpError(404,'Recurso administrativo não encontrado.');
  }
  if(p.startsWith('/api/'))throw new HttpError(404,'Rota não encontrada.');
  if(!['GET','HEAD'].includes(method))throw new HttpError(405,'Método não permitido.');
  const origin=appOrigin(req),catalog=await publicCatalog(),lang=url.searchParams.get('lang')==='en'?'en':'pt';
  if(p==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});res.end(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`);return;}
  if(p==='/sitemap.xml'){const paths=['/','/collection','/private','/contact',...catalog.products.map(x=>`/piece/${x.slug}`)];res.writeHead(200,{'Content-Type':'application/xml; charset=utf-8'});res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(x=>`<url><loc>${escapeHtml(origin+x)}</loc></url>`).join('')}</urlset>`);return;}
  const rendered=renderPage(p,catalog,lang,origin);let html=rendered.html;
  if(catalog.mode==='catalog-only'){
   const text=p==='/admin'?'Painel ainda não conectado ao Supabase. Configure o banco para ativar o acesso e salvar alterações.':(lang==='en'?'Presentation catalogue. Confirm availability with our concierge. The contact form is not active yet.':'Catálogo de apresentação. Confirme disponibilidade com o concierge. O formulário ainda não está ativo.');
   html=html.replace('<body',`<body data-catalog-mode="catalog-only"`).replace(/(<body[^>]*>)/,`$1<div class="deployment-notice" role="status">${text}</div>`);
  }
  res.writeHead(rendered.status||200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',...(p==='/admin'?{'X-Robots-Tag':'noindex, nofollow'}:{})});res.end(method==='HEAD'?'':html);
 }catch(error){
  if(res.headersSent){res.destroy();return;}
  const status=error instanceof HttpError?error.status:500;console.error('[Hillkings request]',status,error instanceof HttpError?error.message:'unexpected-error');
  if(!String(req.url).startsWith('/api/')&&String(req.headers.accept||'').includes('text/html')){
   const msg=status===503?'O atendimento está temporariamente indisponível. Nossa equipe pode ajudar pelo WhatsApp.':'Não foi possível abrir esta página.';
   res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Hillkings</title><body style="background:#081d17;color:#e9dfc9;font:18px Georgia;padding:10vw"><h1>HILLKINGS</h1><p>${msg}</p><p><a style="color:#d2b97e" href="https://wa.me/5511910815777">Atendimento privado pelo WhatsApp</a></p><small>Referência: ${RELEASE}</small></body></html>`);return;
  }
  response(res,status,{error:status===500?'Não foi possível concluir. Tente novamente.':error.message,release:RELEASE});
 }
}
