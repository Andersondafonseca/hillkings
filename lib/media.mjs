import {randomUUID} from 'node:crypto';
import {cloudRequest,cloudOrigin,store} from './cloud.mjs';
import {HttpError,requireField} from './security.mjs';
import {uploadExtension,validateGlb} from './media-validation.mjs';
import {mime} from './http.mjs';
const BUCKET=()=>process.env.SUPABASE_STORAGE_BUCKET||'hillkings-media';
const allowed=new Set(['.jpg','.png','.webp','.pdf','.mp4','.glb']);
const filename=/^[a-f0-9-]{36}\.(jpg|png|webp|pdf|mp4|glb)$/;
function pathFor(name){if(!filename.test(name)||!/^[a-z0-9-]+$/.test(BUCKET()))throw new HttpError(400,'Arquivo inválido.');return `${BUCKET()}/${name}`;}
function assetType(ext){return ext==='.mp4'?'video':ext==='.glb'?'model':ext==='.pdf'?'document':'image';}
function safeSignedUrl(relative){const origin=cloudOrigin(),url=new URL(relative.startsWith('http')?relative:`${origin}/storage/v1${relative}`);if(url.origin!==origin)throw new HttpError(503,'URL de armazenamento inválida.');return url.href;}
export async function beginUpload(input,userId){
 let ext=String(input.name||'').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];if(ext==='.jpeg')ext='.jpg';
 requireField(allowed.has(ext),'Envie JPEG, PNG, WebP, PDF, MP4 ou GLB.');
 const size=Number(input.size),max=['.mp4','.glb'].includes(ext)?60*1024*1024:12*1024*1024;
 requireField(Number.isSafeInteger(size)&&size>0&&size<=max,`O arquivo deve ter até ${max/1024/1024} MB.`);
 const name=randomUUID()+ext;
 // Private bucket. Only an authenticated admin obtains a short-lived per-object upload URL.
 const data=await cloudRequest(`/storage/v1/object/upload/sign/${pathFor(name)}`,{method:'POST',body:{},headers:{'x-upsert':'false'}});
 await store.insert('uploads',{name,ext,mime:mime[ext],size,status:'pending',created_by:userId,created_at:new Date().toISOString()});
 return {name,signedUrl:safeSignedUrl(data.url),contentType:mime[ext],method:'PUT'};
}
export async function completeUpload(name,userId){
 requireField(filename.test(String(name)),'Arquivo inválido.');
 const row=await store.one('uploads',{name:`eq.${name}`,created_by:`eq.${userId}`});if(!row)throw new HttpError(404,'Envio não encontrado.');
 if(row.status==='approved')return {url:`/uploads/${name}`,type:assetType(row.ext),size:row.size};
 requireField(row.status==='pending'&&Date.now()-new Date(row.created_at).getTime()<2*3600000,'Envio expirado ou rejeitado. Envie novamente.');
 const response=await cloudRequest(`/storage/v1/object/authenticated/${pathFor(name)}`,{raw:true,timeout:40000});
 const chunks=[];let size=0;const max=['.mp4','.glb'].includes(row.ext)?60*1024*1024:12*1024*1024;
 try{
  if(Number(response.headers.get('content-length'))>max)throw new HttpError(413,'Arquivo acima do limite.');
  for await(const chunk of response.body){size+=chunk.length;if(size>max)throw new HttpError(413,'Arquivo acima do limite.');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);requireField(size===Number(row.size),'Tamanho do arquivo enviado não corresponde ao declarado.');
  requireField(uploadExtension(bytes)===row.ext,'O conteúdo do arquivo não corresponde à extensão.');if(row.ext==='.glb')validateGlb(bytes);
  await store.update('uploads',{name:`eq.${name}`,status:'eq.pending'},{status:'approved'});
  return {url:`/uploads/${name}`,type:assetType(row.ext),size};
 }catch(error){await store.update('uploads',{name:`eq.${name}`},{status:'rejected'}).catch(()=>{});response.body?.cancel().catch(()=>{});throw error;}
}
export async function downloadUrl(name){
 const row=await store.one('uploads',{name:`eq.${name}`,status:'eq.approved'});if(!row)throw new HttpError(404,'Arquivo não disponível.');
 const signed=await cloudRequest(`/storage/v1/object/sign/${pathFor(name)}`,{method:'POST',body:{expiresIn:600}});
 return safeSignedUrl(signed.signedURL||signed.signedUrl);
}
export async function assertUploadedAssets(product){
 const refs=[product.heroImage,product.modelUrl,product.reportUrl,...product.media.flatMap(m=>[m.url,m.poster])].filter(x=>x?.startsWith('/uploads/'));
 for(const ref of new Set(refs)){const name=ref.slice(9);requireField(filename.test(name),'Mídia inválida.');requireField(!!await store.one('uploads',{name:`eq.${name}`,status:'eq.approved'}),'Conclua o envio da mídia antes de salvar a peça.');}
}
