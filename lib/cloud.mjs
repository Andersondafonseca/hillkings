/** Server-only Supabase REST client. No filesystem, no browser keys, no npm dependencies. */
import { HttpError } from './security.mjs';
export function configured(){return Boolean(process.env.SUPABASE_URL&&(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY));}
export function cloudOrigin(){
 const url=new URL(process.env.SUPABASE_URL||'https://not-configured.invalid');
 const local=process.env.NODE_ENV==='test'&&['127.0.0.1','localhost'].includes(url.hostname);
 if(!local&&(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'))throw new HttpError(503,'SUPABASE_URL precisa ser a URL HTTPS do projeto, sem caminho nem credenciais.');
 return url.origin;
}
export function serviceHeaders(){
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!configured())throw new HttpError(503,'Atendimento por formulário e administração ainda não configurados. Utilize o WhatsApp.');
 if(!key.startsWith('sb_secret_')&&!key.startsWith('eyJ'))throw new HttpError(503,'Configure uma chave secreta de servidor do Supabase.');
 return {apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{})};
}
export async function cloudRequest(route,{method='GET',body,headers={},raw=false,timeout=15000}={}){
 const url=new URL(route,cloudOrigin());
 if(url.origin!==cloudOrigin())throw new HttpError(400,'Destino externo inválido.');
 const response=await fetch(url,{method,headers:{...serviceHeaders(),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout),redirect:'error'}).catch(()=>{throw new HttpError(503,'O serviço de dados está indisponível. Nenhuma confirmação de gravação foi emitida. Tente novamente ou use o WhatsApp.');});
 if(!response.ok){
  let code='';try{code=(await response.json()).code||'';}catch{}
  // Never log keys, URLs with tokens, customer data, database messages or response bodies.
  console.error('[Hillkings cloud]',method,route.split('?')[0],response.status,code);
  if(response.status===409||code==='23505')throw new HttpError(409,'Este registro já existe ou foi alterado. Atualize o painel.');
  if(code==='PGRST205'||code==='42P01'||code==='PGRST202')throw new HttpError(503,'Execute supabase/001_hillkings.sql no projeto Supabase antes de ativar o painel.');
  throw new HttpError(503,'Não foi possível acessar o banco ou o armazenamento. Verifique a configuração do Supabase.');
 }
 if(raw)return response;
 if(response.status===204)return null;
 const text=await response.text();return text?JSON.parse(text):null;
}
const tables=new Set(['settings','products','users','sessions','inquiries','audit','limits','meta','uploads']);
function route(table,query={}){if(!tables.has(table))throw Error('Invalid table');return `/rest/v1/hk_${table}?${new URLSearchParams(query)}`;}
export const store={
 async rows(table,query={}){return await cloudRequest(route(table,query))||[];},
 async one(table,query={}){return (await this.rows(table,{...query,limit:'1'}))[0]||null;},
 async insert(table,body,{ignore=false}={}){return await cloudRequest(route(table),{method:'POST',body,headers:{Prefer:`return=representation${ignore?',resolution=ignore-duplicates':''}`}})||[];},
 async update(table,query,body){return await cloudRequest(route(table,query),{method:'PATCH',body,headers:{Prefer:'return=representation'}})||[];},
 async remove(table,query){await cloudRequest(route(table,query),{method:'DELETE'});},
 async rpc(name,body){if(!/^hk_[a-z_]+$/.test(name))throw Error('Invalid procedure');return cloudRequest(`/rest/v1/rpc/${name}`,{method:'POST',body});}
};
