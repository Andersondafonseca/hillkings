import {initialProducts,initialSettings} from './seed.mjs';
import {store,configured} from './cloud.mjs';
import {HttpError,validPassword,hashPassword} from './security.mjs';
const decode=row=>row?{...row.data,version:row.version,updatedAt:row.updated_at}:null;
export function publicProduct(p){const {internalNotes,version,updatedAt,...rest}=p;return rest;}
export function publicSettings(s){const {contactEmail,inquiryRetentionDays,version,...rest}=s;return rest;}
export async function settings(){const row=await store.one('settings',{id:'eq.1'});if(!row)throw new HttpError(503,'Inicialize as tabelas da Hillkings com o arquivo SQL incluído.');return {...row.data,version:row.version};}
export async function products({publicOnly=false}={}){let list=(await store.rows('products',{order:'updated_at.desc',limit:'1000'})).map(decode);if(publicOnly)list=list.filter(p=>p.published&&p.status!=='archived');return list.sort((a,b)=>a.sortOrder-b.sortOrder);}
export async function productById(id){return decode(await store.one('products',{id:`eq.${id}`}));}
export async function publicCatalog(){
 // Only use the supplied initial catalogue when NO service has been configured.
 // A configured database outage must never replace current prices/stock with seed data.
 const live=configured(),s=live?await settings():structuredClone(initialSettings);
 const list=live?await products({publicOnly:true}):structuredClone(initialProducts);
 return {settings:publicSettings(s),products:list.filter(p=>p.published&&p.status!=='archived'&&(s.showSold||p.status!=='sold')).map(publicProduct),mode:live?'live':'catalog-only'};
}
export async function contactSecret(){const row=await store.one('meta',{key:'eq.contact-secret'});if(!row?.value)throw new HttpError(503,'Execute a configuração SQL do banco de dados.');return row.value;}
export async function audit(action,detail){try{await store.insert('audit',{action,detail,created_at:new Date().toISOString()});}catch{console.warn('[Hillkings] audit-unavailable');}}
export async function hitLimit(key,max,windowMs){return await store.rpc('hk_try_limit',{p_key:key,p_max:max,p_window_ms:windowMs})===true;}
export async function ensureAdmin(){
 let user=await store.one('users',{id:'eq.1'});if(user)return user;
 const password=process.env.ADMIN_INITIAL_PASSWORD,username=process.env.ADMIN_INITIAL_USERNAME||'admin';
 if(!validPassword(password)||!/^[a-zA-Z0-9_.-]{3,40}$/.test(username))throw new HttpError(503,'Configure ADMIN_INITIAL_PASSWORD com uma senha exclusiva de pelo menos 12 caracteres. admin/admin não é permitido online.');
 await store.insert('users',{id:1,username,password_hash:await hashPassword(password),must_change:true},{ignore:true});
 return store.one('users',{id:'eq.1'});
}
