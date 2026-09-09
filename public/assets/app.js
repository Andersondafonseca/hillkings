/** Progressive enhancements for the server-rendered storefront. */
const state=JSON.parse(document.getElementById('bootstrap').textContent);
const en=state.lang==='en';
const text=(pt,english)=>en?english:pt;
let viewerModule;
const loadViewer=()=>viewerModule??=import('./viewer.js');
const contactDialog=document.getElementById('contactDialog');
const modelDialog=document.getElementById('modelDialog');
const imageDialog=document.getElementById('imageDialog');
let activeModel=null,lastFocused=null;
const toggleScroll=()=>{document.body.style.overflow=document.querySelector('dialog[open]')?'hidden':'';};
function openDialog(dialog){lastFocused=document.activeElement;if(!dialog.open)dialog.showModal();toggleScroll();}
for(const dialog of document.querySelectorAll('dialog')){
 dialog.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{toggleScroll();if(dialog===modelDialog){activeModel?.destroy();activeModel=null;document.getElementById('modelDialogContent').replaceChildren();}if(lastFocused instanceof HTMLElement)lastFocused.focus({preventScroll:true});});
}
// Mobile navigation.
const menuButton=document.querySelector('.mobile-menu-toggle'),mobileMenu=document.getElementById('mobileMenu');
function closeMenu(){if(!menuButton)return;mobileMenu.hidden=true;menuButton.setAttribute('aria-expanded','false');}
menuButton?.addEventListener('click',()=>{mobileMenu.hidden=!mobileMenu.hidden;menuButton.setAttribute('aria-expanded',String(!mobileMenu.hidden));});
mobileMenu?.querySelectorAll('a,button').forEach(el=>el.addEventListener('click',closeMenu));
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeMenu();});
// Language choice is encoded in the URL so all public routes are shareable.
document.querySelector('[data-language]')?.addEventListener('click',ev=>{const lang=ev.currentTarget.dataset.language;const url=new URL(location.href);if(lang==='en')url.searchParams.set('lang','en');else url.searchParams.delete('lang');location.assign(url.href);});
async function prepareToken(form,{force=false}={}){if(!force&&form._contactToken&&Date.now()-(form._tokenAt||0)<2700000)return;try{const response=await fetch('/api/contact-token',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error();form._contactToken=result.token;form._tokenAt=Date.now();}catch{form._contactToken=null;}}
function syncInquiryFields(form){
 const field=form.querySelector('[data-company-field]');
 if(field){const show=form.elements.requestType?.value==='wholesale';field.hidden=!show;field.querySelector('input').disabled=!show;}
}
for(const form of document.querySelectorAll('[data-contact-form]')){
 form.elements.requestType?.addEventListener('change',()=>syncInquiryFields(form));
 form.addEventListener('focusin',()=>prepareToken(form));
 syncInquiryFields(form);
 prepareToken(form);
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();const button=form.querySelector('button[type="submit"]'),message=form.querySelector('.form-message'),before=button.innerHTML;
  if(!form.reportValidity())return;
  if(!form._contactToken){await prepareToken(form);message.className='form-message error';message.textContent=text('Aguarde um instante e tente novamente.','Please wait a moment and try again.');return;}
  const values=Object.fromEntries(new FormData(form));values.consent=form.elements.consent.checked;values.token=form._contactToken;
  button.disabled=true;button.textContent=text('Registrando solicitação…','Recording your enquiry…');message.className='form-message';message.textContent='';
  try{
   const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');
   message.className='form-message success';message.textContent=text('Sua solicitação foi registrada no atendimento privado da Hillkings. Obrigado pelo contato. Protocolo: ','Your enquiry has been recorded for the Hillkings private concierge. Thank you. Reference: ')+result.id.slice(0,8).toUpperCase();
   form.reset();syncInquiryFields(form);await prepareToken(form,{force:true});
  }catch(error){message.className='form-message error';message.textContent=error.message;}
  finally{button.disabled=false;button.innerHTML=before;}
 });
}
function openContact(id='',requestType='general'){
 const form=contactDialog.querySelector('form');form.elements.productId.value=id;
 const p=state.products.find(p=>p.id===id);
 form.elements.requestType.value=p?'presentation':requestType;syncInquiryFields(form);
 if(!p&&form.elements.message.dataset.auto==='true'){form.elements.message.value='';form.elements.message.dataset.auto='false';}
 if(p&&(!form.elements.message.value||form.elements.message.dataset.auto==='true')){
  form.elements.message.value=text(p.status==='sold'?`Gostaria de conhecer uma peça semelhante a ${p.namePt} (${p.id}).`:`Gostaria de receber mais informações sobre ${p.namePt} (${p.id}) e agendar uma apresentação.`,p.status==='sold'?`I would like to explore a piece similar to ${p.name} (${p.id}).`:`I would like more information about ${p.name} (${p.id}) and a private presentation.`);form.elements.message.dataset.auto='true';
 }
 const whatsapp=contactDialog.querySelector('.contact-whatsapp');whatsapp.href=`https://wa.me/${state.settings.whatsapp}?text=${encodeURIComponent(p?text(`Olá! Gostaria de informações sobre ${p.namePt} (${p.id}).`,`Hello. I would like information about ${p.name} (${p.id}).`):text('Olá! Gostaria de conhecer a coleção Hillkings.','Hello. I would like to discover the Hillkings collection.'))}`;
 form.querySelector('.form-message').textContent='';prepareToken(form);openDialog(contactDialog);
}
for(const button of document.querySelectorAll('[data-contact]'))button.addEventListener('click',()=>openContact(button.dataset.contact,button.dataset.inquiryType||'general'));
contactDialog?.querySelector('textarea')?.addEventListener('input',ev=>ev.currentTarget.dataset.auto='false');
// Interactive 3D modal always uses a live geometry model, never a rotating image.
for(const button of document.querySelectorAll('[data-model-open]'))button.addEventListener('click',async()=>{
 const id=button.dataset.modelOpen,template=document.getElementById(`viewerTemplate-${id}`),target=document.getElementById('modelDialogContent');if(!template)return;
 activeModel?.destroy();target.replaceChildren(template.content.cloneNode(true));openDialog(modelDialog);
 const {mountViewer}=await loadViewer();if(!modelDialog.open)return;activeModel=await mountViewer(target.querySelector('[data-viewer]'),{lang:state.lang});activeModel.refresh();
});
if(document.querySelector('[data-viewer]'))loadViewer().then(({mountViewer})=>document.querySelectorAll('[data-viewer]').forEach(el=>mountViewer(el,{lang:state.lang})));
// Product photo/video/model tabs.
const tabs=[...document.querySelectorAll('[data-product-tab]')];
function selectProductTab(name,{focus=false}={}){
 for(const tab of tabs){const active=tab.dataset.productTab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;const panel=document.getElementById(`panel-${tab.dataset.productTab}`);panel.hidden=!active;panel.classList.toggle('active',active);if(active&&focus)tab.focus();if(!active)panel.querySelectorAll('video').forEach(v=>v.pause());}
 if(name==='model'){const el=document.querySelector('#panel-model [data-viewer]');if(el)loadViewer().then(async({mountViewer})=>(await mountViewer(el,{lang:state.lang})).refresh());}
}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectProductTab(tab.dataset.productTab));tab.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const n=(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;selectProductTab(tabs[n].dataset.productTab,{focus:true});}});});
if(new URL(location.href).searchParams.get('view')==='3d'&&tabs.some(t=>t.dataset.productTab==='model'))selectProductTab('model');
for(const thumbnail of document.querySelectorAll('[data-thumbnail]'))thumbnail.addEventListener('click',()=>{const img=document.getElementById('productMainImage');img.src=thumbnail.dataset.thumbnail;img.alt=thumbnail.getAttribute('aria-label');const editorial=thumbnail.dataset.mediaKind==='editorial';const caption=document.querySelector('[data-photo-caption]');if(caption)caption.textContent=editorial?text('Apresentação editorial · imagem gerada por IA','Editorial presentation · AI-generated image'):text('Fotografia da peça real','Photograph of the actual piece');const disclosure=document.querySelector('[data-editorial-disclosure]');if(disclosure)disclosure.hidden=!editorial;document.querySelector('.primary-photo').dataset.zoomImage=thumbnail.dataset.thumbnail;document.querySelectorAll('[data-thumbnail]').forEach(t=>t.classList.toggle('active',t===thumbnail));});
for(const button of document.querySelectorAll('[data-zoom-image]'))button.addEventListener('click',()=>{const img=imageDialog.querySelector('img');img.src=button.dataset.zoomImage;img.alt=button.querySelector('img')?.alt||text('Fotografia real da peça','Photograph of the actual piece');imageDialog.querySelector('.image-caption').textContent=img.alt;openDialog(imageDialog);});
// Collection filters operate on real server-supplied products.
let activeFilter='all';const search=document.querySelector('.catalog-search');
function filterProducts(){let count=0;const term=(search?.value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');for(const card of document.querySelectorAll('.catalog-body .product-card')){const matchCategory=activeFilter==='all'||(activeFilter==='sold'?card.dataset.status==='sold':card.dataset.category===activeFilter&&card.dataset.status!=='sold');const matchSearch=card.dataset.search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(term);card.hidden=!(matchCategory&&matchSearch);if(!card.hidden)count++;}const empty=document.querySelector('.empty-filter');if(empty)empty.hidden=count>0;}
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{activeFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===button));filterProducts();});
search?.addEventListener('input',filterProducts);

// Documentation badges open the actual report section, including deep links from cards.
function openReportDetails({scroll=true}={}){const panel=document.getElementById('reportDetails');if(!panel)return;panel.open=true;if(scroll)panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
for(const button of document.querySelectorAll('[data-report-open]'))button.addEventListener('click',ev=>{ev.preventDefault();openReportDetails();});
if(location.hash==='#reportDetails')openReportDetails();
window.addEventListener('hashchange',()=>{if(location.hash==='#reportDetails')openReportDetails();});
