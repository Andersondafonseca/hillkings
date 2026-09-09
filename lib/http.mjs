import {HttpError} from './security.mjs';
export const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.pdf':'application/pdf','.glb':'model/gltf-binary','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8'};
export function response(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));}
export function appOrigin(req){
 const fallback=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:`http://${req.headers.host||'127.0.0.1:3000'}`;
 const origin=new URL(process.env.APP_URL||fallback).origin;
 if((process.env.VERCEL||process.env.NODE_ENV==='production')&&!origin.startsWith('https://'))throw new HttpError(503,'Configure APP_URL com HTTPS.');
 return origin;
}
export function originCheck(req){
 const allowed=[appOrigin(req),...(process.env.VERCEL_URL?[`https://${process.env.VERCEL_URL}`]:[]),...(process.env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)];
 if(!req.headers.origin||!allowed.includes(req.headers.origin))throw new HttpError(403,'Origem não autorizada. Reabra o site no endereço configurado.');
}
export async function jsonBody(req){
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Envie a solicitação como JSON.');
 // Vercel may have parsed the request before invoking this handler.
 if(req.body!==undefined&&req.body!==null){const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw)>65536)throw new HttpError(413,'Solicitação acima do limite.');try{return JSON.parse(raw);}catch{throw new HttpError(400,'JSON inválido.');}}
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw new HttpError(413,'Solicitação acima do limite.');chunks.push(chunk);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'JSON inválido.');}
}
