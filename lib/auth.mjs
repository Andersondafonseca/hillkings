import {store} from './cloud.mjs';
import {sha256,randomToken,safeEqual,HttpError} from './security.mjs';
export function setSessionCookie(res,token,maxAge=28800){res.setHeader('Set-Cookie',`hk_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.VERCEL||process.env.NODE_ENV==='production'?'; Secure':''}`);}
export async function newSession(res,user){const token=randomToken(),csrf=randomToken();await store.insert('sessions',{hash:sha256(token),user_id:user.id,csrf,expires_at:Date.now()+28800000});setSessionCookie(res,token);return {ok:true,username:user.username,mustChange:!!user.must_change,csrf};}
export async function session(req,{write=false,allowInitial=false}={}){
 const token=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('hk_session='))?.slice(11)||'';
 if(!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'Entre para continuar.');
 const row=await store.one('sessions',{hash:`eq.${sha256(token)}`,expires_at:`gt.${Date.now()}`});if(!row)throw new HttpError(401,'A sessão expirou. Entre novamente.');
 const user=await store.one('users',{id:`eq.${row.user_id}`});if(!user)throw new HttpError(401,'Conta não encontrada.');
 if(user.must_change&&!allowInitial)throw new HttpError(428,'Altere a senha inicial antes de utilizar o painel.');
 if(write&&!safeEqual(row.csrf,String(req.headers['x-csrf-token']||'')))throw new HttpError(403,'Token de segurança inválido. Atualize a página.');
 return {...row,username:user.username,must_change:user.must_change,password_hash:user.password_hash};
}
