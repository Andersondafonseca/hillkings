// Completely isolated demonstration. No server, email provider or real account is used.
const bootPreview=()=>{
 const seed=JSON.parse(document.getElementById('preview-data').textContent);
 const original=structuredClone(seed.catalog);
 const blobs=new Map();
 for(const [name,asset] of Object.entries(seed.assets)){
  const decoded=atob(asset.base64),bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  blobs.set(name,URL.createObjectURL(new Blob([bytes],{type:asset.type})));
 }
 const mapAssets=v=>typeof v==='string'?(blobs.get(v)||v):Array.isArray(v)?v.map(mapAssets):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,mapAssets(x)])):v;
 let data=mapAssets(structuredClone(original));
 let logged=false,leads=[],audit=[];
 const frame=document.getElementById('preview-frame');
 let current='/';
 const response=(body,status=200)=>({body,status});
 const clone=v=>structuredClone(v);
 const log=text=>audit.unshift({id:audit.length+1,created_at:new Date().toISOString(),action:'demo',detail:text,details:text});
 const uid=()=>typeof crypto.randomUUID==='function'?crypto.randomUUID():('demo-'+Date.now()+'-'+Math.random().toString(16).slice(2));
 function publicCatalog(){return {settings:Object.fromEntries(Object.entries(clone(data.settings)).filter(([k])=>!['contactEmail','inquiryRetentionDays'].includes(k))),products:data.products.filter(p=>p.published&&p.status!=='archived'&&(data.settings.showSold||p.status!=='sold')).map(p=>{const {internalNotes,...publicData}=p;return clone(publicData);})};}
 async function request(route,options={}){
  const method=options.method||'GET';
  let body=options.body?typeof options.body==='string'?JSON.parse(options.body):options.body:{};
  if(route==='/api/contact-token')return response({token:'demo-only'});
  if(route==='/api/inquiries'){
   const id=uid(),product=data.products.find(p=>p.id===body.productId);
   leads.unshift({id,data:{...body,productName:product?.namePt||''},created_at:new Date().toISOString(),status:'new',email_status:'queued',last_error:'Demonstração local: nenhum e-mail foi enviado.'});
   log('Solicitação de demonstração registrada apenas nesta aba.');return response({ok:true,id,emailStatus:'demo'},201);
  }
  if(route==='/api/admin/login'){
   if(body.username!=='admin'||body.password!=='admin')return response({error:'Na demonstração, use admin / admin. Não use credenciais reais.'},401);
   logged=true;return response({username:'admin',csrf:'demo-not-a-real-session',mustChange:false});
  }
  if(route==='/api/admin/session')return logged?response({username:'admin',csrf:'demo-not-a-real-session',mustChange:false}):response({error:'Entre com admin / admin para testar.'},401);
  if(!logged)return response({error:'Acesso de demonstração não iniciado.'},401);
  if(route==='/api/admin/logout'){logged=false;return response({ok:true});}
  if(route==='/api/admin/dashboard')return response({products:clone(data.products),settings:clone(data.settings),inquiries:clone(leads),inquiryTotal:leads.length,audit:clone(audit),emailConfigured:false,production:false});
  if(route==='/api/admin/settings'){
   if(!/^\d{10,15}$/.test(String(body.whatsapp)))return response({error:'Informe WhatsApp com país e DDD, usando apenas números.'},400);
   data.settings={...data.settings,...body,version:(data.settings.version||1)+1};log('Contatos e configurações alterados apenas na prévia.');return response({ok:true,settings:clone(data.settings)});
  }
  if(route==='/api/admin/products'&&method==='POST'){
   if(data.products.some(p=>p.id===body.id||p.slug===body.slug))return response({error:'Referência ou endereço já cadastrados nesta prévia.'},409);
   const product={...body,version:1,updatedAt:new Date().toISOString()};data.products.push(product);log('Peça adicionada à demonstração.');return response({ok:true,product:clone(product)},201);
  }
  const match=route.match(/^\/api\/admin\/products\/([^/]+)$/);
  if(match){
   const index=data.products.findIndex(p=>p.id===decodeURIComponent(match[1]));
   if(index<0)return response({error:'Peça não encontrada.'},404);
   const old=data.products[index];
   data.products[index]=method==='DELETE'?{...old,published:false,status:'archived',version:old.version+1}:{...old,...body,version:(old.version||1)+1,updatedAt:new Date().toISOString()};
   log('Peça atualizada apenas nesta demonstração.');return response({ok:true,product:clone(data.products[index])});
  }
  if(route==='/api/admin/uploads'){
   if(!body||typeof body.arrayBuffer!=='function')return response({error:'Selecione um arquivo.'},400);
   if(body.size>60*1024*1024)return response({error:'Limite de 60 MB por arquivo na demonstração.'},413);
   const name=String(body.name||'').toLowerCase(),kind=/\.glb$/.test(name)?'model':body.type?.startsWith('video/')?'video':body.type==='application/pdf'?'document':'image';
   const b=new Blob([await body.arrayBuffer()],{type:body.type||'application/octet-stream'});
   return response({url:URL.createObjectURL(b),type:kind,size:body.size},201);
  }
  const im=route.match(/^\/api\/admin\/inquiries\/([^/]+)(\/retry)?$/);
  if(im){
   const found=leads.find(i=>i.id===im[1]);if(!found)return response({error:'Solicitação não encontrada.'},404);
   if(im[2])return response({status:'queued'});
   if(method==='DELETE')leads=leads.filter(i=>i.id!==im[1]);else found.status=body.status;
   return response({ok:true});
  }
  if(route==='/api/admin/export')return response({demonstration:true,exportedAt:new Date().toISOString(),...clone(data),inquiries:clone(leads)});
  if(route==='/api/admin/account')return response({error:'A troca de senha é desativada nesta prévia. O login admin / admin aqui é apenas uma simulação.'},400);
  return response({error:'Esta operação não faz parte da prévia local.'},404);
 }
 function insideBoot(){
  const realFetch=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
   const raw=typeof input==='string'?input:input.url;
   if(raw.startsWith('/api/')){const result=await parent.HKPreview.request(raw,options);return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json'}});}
   if(raw.startsWith('blob:')||raw.startsWith('data:'))return realFetch(input,options);
   throw new Error('Conexão de rede desativada nesta demonstração.');
  };
  document.addEventListener('click',event=>{
   const language=event.target.closest('[data-language]');
   if(language){event.preventDefault();event.stopImmediatePropagation();const u=new URL(parent.HKPreview.current(),'https://preview.invalid');if(language.dataset.language==='en')u.searchParams.set('lang','en');else u.searchParams.delete('lang');parent.HKPreview.navigate(u.pathname+u.search);return;}
   const a=event.target.closest('a[href]');if(!a)return;const href=a.getAttribute('href');
   if(href.startsWith('/')&&!href.startsWith('//')){event.preventDefault();event.stopImmediatePropagation();parent.HKPreview.navigate(href);return;}
   if(/^(https?:|mailto:|tel:)/i.test(href)){
    if(!confirm('Este link abre um serviço externo real. Continuar?')){event.preventDefault();event.stopImmediatePropagation();}
    else{a.target='_blank';a.rel='noopener noreferrer';}
   }
  },true);
  const correctAssets=()=>{
   for(const element of document.querySelectorAll('[src^="/"],[href^="/brand/"],[poster^="/"]'))for(const attribute of ['src','poster','href']){const value=element.getAttribute(attribute);const mapped=parent.HKPreview.asset(value);if(mapped&&mapped!==value)element.setAttribute(attribute,mapped);}
   if(parent.HKPreview.current().startsWith('/admin')){
    for(const form of document.querySelectorAll('#passwordForm')){if(!form.dataset.demoBlocked){form.dataset.demoBlocked='true';form.insertAdjacentHTML('afterbegin','<p class="demo-privacy-note">Troca de senha desativada na prévia. Não informe senhas reais.</p>');for(const el of form.querySelectorAll('input,button'))el.disabled=true;}}
   }
  };
  const mo=new MutationObserver(correctAssets);mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','poster']});correctAssets();
  window.addEventListener('error',event=>parent.HKPreview.reportError(event.message));
  window.addEventListener('unhandledrejection',event=>parent.HKPreview.reportError(String(event.reason)));
 }
 const safeScript=s=>s.replace(/<\/script/gi,'<\\/script');
 function render(route){
  const parsed=new URL(route,'https://preview.invalid');current=parsed.pathname+parsed.search+parsed.hash;
  const lang=parsed.searchParams.get('lang')==='en'?'en':'pt',isAdmin=parsed.pathname==='/admin';
  let {html}=window.HKRender.renderPage(parsed.pathname,publicCatalog(),lang,'https://preview.invalid');
  html=html.replace(/<link rel="stylesheet" href="\/assets\/[^\"]+">/g,'').replace(/<link rel="canonical"[^>]+>/g,'').replace(/<link rel="manifest"[^>]+>/g,'');
  html=html.replace('</head>',`<meta name="robots" content="noindex,nofollow"><style>${seed.css}\n${isAdmin?seed.adminCss:''}\n${seed.previewCss}</style></head>`);
  for(const [path,blob] of blobs)html=html.split('"'+path+'"').join('"'+blob+'"');
  let script=isAdmin?seed.adminJs:seed.appJs.replace("import('./viewer.js')","Promise.resolve(window.HKViewer)").replaceAll('new URL(location.href)',"new URL(parent.HKPreview.current(),'https://preview.invalid')");
  if(!isAdmin){
   script=script.replace("'Sua solicitação foi registrada no atendimento privado da Hillkings. Obrigado pelo contato. Protocolo: '","'TESTE: solicitação simulada nesta aba. Nenhum e-mail foi enviado. Protocolo: '")
    .replace("'Your enquiry has been recorded for the Hillkings private concierge. Thank you. Reference: '","'DEMO: enquiry saved in this tab only. No email was sent. Reference: '");
   html=html.replaceAll('Sua solicitação é registrada no atendimento privado da Hillkings.','PRÉVIA: use dados fictícios. Nenhuma mensagem será enviada.').replaceAll('Your enquiry is recorded for the Hillkings private concierge.','DEMO: use fictitious details. No email will be sent.');
  }
  if(isAdmin)html=html.replace('<main id="main">','<div class="admin-demo-note"><strong>DEMONSTRAÇÃO</strong> · Login: admin / admin. Alterações valem apenas nesta aba. Não use dados ou senhas reais.</div><main id="main">');
  const viewer=seed.viewerJs.replace(/\bexport /g,'');
  const injected=`(${insideBoot.toString()})();\nwindow.HKViewer=(()=>{${viewer}\nreturn {mountViewer};})();\n(async()=>{${script}\n})().catch(e=>parent.HKPreview.reportError(String(e)));`;
  html=html.replace(/<script type="module" src="[^\"]+"><\/script>/,`<script>${safeScript(injected)}<`+'/script>');
  frame.onload=()=>{document.getElementById('preview-location').textContent=parsed.pathname;document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===parsed.pathname+parsed.search));if(parsed.hash&&parsed.pathname!=='/admin')setTimeout(()=>{const target=frame.contentDocument?.getElementById(parsed.hash.slice(1));if(target?.tagName==='DETAILS')target.open=true;target?.scrollIntoView();},100);};
  frame.srcdoc=html;
 }
 function navigate(route){if(location.hash.slice(1)===route)render(route);else location.hash=route;}
 window.HKPreview={request,navigate,current:()=>current,asset:path=>blobs.get(path),reportError:message=>{console.error('Hillkings preview:',message);document.getElementById('preview-error').textContent='Ocorreu uma falha na prévia. Reabra a página ou redefina o teste.';}};
 document.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.route)));
 document.getElementById('preview-reset').addEventListener('click',()=>{if(confirm('Descartar as alterações de teste e restaurar a coleção original?')){data=mapAssets(structuredClone(original));leads=[];audit=[];logged=false;document.getElementById('preview-error').textContent='';render(current);}});
 document.getElementById('preview-mobile').addEventListener('click',()=>{document.getElementById('preview-stage').classList.toggle('mobile');document.getElementById('preview-mobile').classList.toggle('active');});
 window.addEventListener('hashchange',()=>render(location.hash.slice(1)||'/'));
 render(location.hash.slice(1)||'/');
};
bootPreview();
