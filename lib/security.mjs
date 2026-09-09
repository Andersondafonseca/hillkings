import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const randomToken=()=>randomBytes(32).toString('hex');
export const sha256=v=>createHash('sha256').update(v).digest('hex');
export const digest=(v,key)=>createHmac('sha256',key).update(v).digest('hex');
export async function hashPassword(password){
 const salt=randomBytes(16).toString('hex');
 const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return `scrypt$32768$${salt}$${key.toString('hex')}`;
}
export async function checkPassword(password,encoded){
 try { const [algo,n,salt,hex]=encoded.split('$'); if(algo!=='scrypt') return false;
 const actual=await scrypt(password,salt,64,{N:Number(n),r:8,p:1,maxmem:64*1024*1024});
 const expected=Buffer.from(hex,'hex'); return expected.length===actual.length&&timingSafeEqual(expected,actual);
 } catch { return false; }
}
export function validPassword(v){return typeof v==='string'&&v.length>=12&&v.length<=128&&!/^(admin|password|123456|hillkings)$/i.test(v);}
export function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function jsonForHtml(v){return JSON.stringify(v).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');}
export const emailIsValid=v=>typeof v==='string'&&v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)&&!/[\r\n]/.test(v);
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export const requireField=(condition,message)=>{if(!condition)throw new HttpError(400,message);};
export const cleanString=(value,max=4000)=>String(value??'').trim().slice(0,max);
