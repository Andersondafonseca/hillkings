import {cleanString as s,requireField as check,emailIsValid} from './security.mjs';
const statuses=['available','reserved','sold','archived'];
export function localAsset(v,extensions=null){
 if(!v)return '';
 check(typeof v==='string'&&/^\/(media|uploads|models|brand)\/[a-zA-Z0-9_.-]+$/.test(v),'O arquivo deve ser uma mídia enviada ao site.');
 if(extensions)check(extensions.some(ext=>v.toLowerCase().endsWith(ext)),'Formato de arquivo não suportado neste campo.');
 return v;
}
export function validateProduct(input){
 const p={};
 for(const k of ['name','namePt','stone','carats','secondary','metal','cut','origin','dimensions','treatment','reportLab','reportNumber','reportDate'])p[k]=s(input[k],k==='treatment'?700:200);
 for(const k of ['description','descriptionEn','reportNotes','modelNotes','internalNotes'])p[k]=s(input[k],6000);
 p.id=s(input.id,40);p.slug=s(input.slug,100);
 check(/^[a-zA-Z0-9_-]{3,40}$/.test(p.id),'Referência inválida. Use letras, números e hífens.');
 check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug),'Endereço inválido. Use letras minúsculas, números e hífens.');
 check(p.name.length>=2&&p.namePt.length>=2,'Informe os nomes da peça.');
 check(['jewellery','gemstones'].includes(input.category),'Categoria inválida.');p.category=input.category;
 check(statuses.includes(input.status),'Disponibilidade inválida.');p.status=input.status;
 p.published=input.published===true;p.featured=input.featured===true;p.priceOnRequest=input.priceOnRequest===true;
 p.priceCents=Number(input.priceCents);p.currency='USD';p.sortOrder=Number(input.sortOrder)||0;
 check(Number.isSafeInteger(p.priceCents)&&p.priceCents>=0&&p.priceCents<=100000000000,'Preço inválido. Informe um valor em dólares, com no máximo dois decimais.');
 check(p.priceOnRequest||p.priceCents>0,'Informe o preço ou ative preço sob consulta.');
 check(p.sortOrder>=0&&p.sortOrder<=100000,'Ordem inválida.');
 check(['owner-reported','document-provided','checked','not-provided'].includes(input.reportState),'Situação do relatório inválida.');p.reportState=input.reportState;
 p.reportUrl=localAsset(input.reportUrl,['.jpg','.jpeg','.png','.webp','.pdf']);
 check(p.reportState!=='checked'||(p.reportNumber&&p.reportUrl),'Para marcar conferido, anexe o relatório e informe o número.');
 p.heroImage=localAsset(input.heroImage,['.jpg','.jpeg','.png','.webp']);
 p.modelUrl=localAsset(input.modelUrl,['.glb']);
 p.modelKind=p.modelUrl?(['approximation','cad'].includes(input.modelKind)?input.modelKind:'approximation'):'none';
 check(!p.modelUrl||p.modelNotes.length>10,'Descreva a natureza e as limitações do modelo 3D.');
 check(Array.isArray(input.media)&&input.media.length<=30,'Envie até 30 mídias por produto.');
 p.media=input.media.map(m=>{check(['image','video'].includes(m.type),'Mídia inválida.');return {url:localAsset(m.url,m.type==='video'?['.mp4']:['.jpg','.jpeg','.png','.webp']),type:m.type,kind:m.kind==='editorial'?'editorial':'original',alt:s(m.alt,300),...(m.poster?{poster:localAsset(m.poster,['.jpg','.jpeg','.png','.webp'])}:{})};});
 check(!p.published||p.media.some(m=>m.type==='image'),'Uma peça publicada precisa de ao menos uma fotografia.');
 return p;
}
export function validateSettings(input,current){
 const next={...current};
 for(const k of ['brand','tagline','headline','headlineEn','intro','introEn','conciergeText','legalName','taxId','address','siteTitle','description'])next[k]=s(input[k],k==='address'?1000:600);
 next.whatsapp=s(input.whatsapp,20).replace(/\D/g,'');check(/^\d{10,15}$/.test(next.whatsapp),'WhatsApp inválido. Inclua código do país e DDD.');
 next.contactEmail=s(input.contactEmail,254);check(emailIsValid(next.contactEmail),'E-mail de destino inválido.');
 next.instagram=s(input.instagram,300);check(!next.instagram||/^https:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9_.]+\/?$/.test(next.instagram),'Use um endereço HTTPS de perfil do Instagram.');
 next.showPrices=input.showPrices===true;next.showSold=input.showSold===true;
 next.featuredProductId=s(input.featuredProductId,40);
 next.inquiryRetentionDays=Number(input.inquiryRetentionDays);check(Number.isInteger(next.inquiryRetentionDays)&&next.inquiryRetentionDays>=7&&next.inquiryRetentionDays<=730,'Retenção deve ser de 7 a 730 dias.');
 return next;
}
