import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { initialProducts, initialSettings } from './seed.mjs';
import { hashPassword, randomToken, validPassword } from './security.mjs';
export const DATA_DIR=path.resolve(process.env.DATA_DIR||'data');
mkdirSync(DATA_DIR,{recursive:true,mode:0o700}); mkdirSync(path.join(DATA_DIR,'uploads'),{recursive:true,mode:0o700});
export const db=new DatabaseSync(path.join(DATA_DIR,'hillkings.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, insecure_bootstrap INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', email_status TEXT NOT NULL DEFAULT 'queued', email_id TEXT, email_to TEXT, last_error TEXT, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL);
`);
const now=()=>new Date().toISOString();
export async function init(){
 if(!db.prepare('SELECT id FROM settings WHERE id=1').get())db.prepare('INSERT INTO settings(id,data)VALUES(1,?)').run(JSON.stringify(initialSettings));
 if(!db.prepare('SELECT 1 FROM products LIMIT 1').get()){
  const stmt=db.prepare('INSERT INTO products(id,slug,data,updated_at) VALUES(?,?,?,?)');
  for(const p of initialProducts)stmt.run(p.id,p.slug,JSON.stringify(p),now());
 }
 if(!db.prepare('SELECT id FROM users LIMIT 1').get()){
  const prod=process.env.NODE_ENV==='production';
  const password=process.env.ADMIN_INITIAL_PASSWORD||'admin';
  if(prod&&!validPassword(password))throw new Error('Produção bloqueada: configure ADMIN_INITIAL_PASSWORD com uma senha exclusiva de pelo menos 12 caracteres.');
  const username=process.env.ADMIN_INITIAL_USERNAME||'admin';
  if(!/^[a-zA-Z0-9_.-]{3,40}$/.test(username))throw new Error('ADMIN_INITIAL_USERNAME inválido.');
  db.prepare('INSERT INTO users(id,username,password_hash,must_change,insecure_bootstrap)VALUES(1,?,?,1,?)').run(username,await hashPassword(password),password==='admin'?1:0);
 }
 if(process.env.NODE_ENV==='production'&&db.prepare('SELECT 1 FROM users WHERE insecure_bootstrap=1 LIMIT 1').get())throw new Error('Produção bloqueada: altere a senha inicial admin no ambiente local ou execute npm run admin:reset antes de publicar.');
}
const secretFile=path.join(DATA_DIR,'.contact-secret');
if(!existsSync(secretFile))writeFileSync(secretFile,randomToken(),{mode:0o600,flag:'wx'});
export const secret=readFileSync(secretFile,'utf8').trim();
export function settings(){const row=db.prepare('SELECT * FROM settings WHERE id=1').get();return {...JSON.parse(row.data),version:row.version};}
export function products({publicOnly=false}={}){
 return db.prepare('SELECT * FROM products').all().map(row=>({...JSON.parse(row.data),version:row.version,updatedAt:row.updated_at})).filter(p=>!publicOnly||(p.published&&p.status!=='archived')).sort((a,b)=>a.sortOrder-b.sortOrder);
}
export function productById(id){return products().find(p=>p.id===id);}
export function publicProduct(p){const {internalNotes,version,updatedAt,...rest}=p;return rest;}
export function publicSettings(){const {brand,tagline,whatsapp,headline,headlineEn,intro,introEn,conciergeText,legalName,taxId,address,instagram,showPrices,showSold,featuredProductId,siteTitle,description}=settings();return {brand,tagline,whatsapp,headline,headlineEn,intro,introEn,conciergeText,legalName,taxId,address,instagram,showPrices,showSold,featuredProductId,siteTitle,description};}
export function audit(action,detail){db.prepare('INSERT INTO audit(action,detail,created_at)VALUES(?,?,?)').run(action,detail,now());}
export function hitLimit(key,max,windowMs){
 const time=Date.now(); const item=db.prepare('SELECT * FROM limits WHERE key=?').get(key);
 if(!item||item.resets_at<time){db.prepare('INSERT INTO limits(key,count,resets_at)VALUES(?,1,?)ON CONFLICT(key)DO UPDATE SET count=1,resets_at=excluded.resets_at').run(key,time+windowMs);return true;}
 if(item.count>=max)return false;
 db.prepare('UPDATE limits SET count=count+1 WHERE key=?').run(key);return true;
}
export function housekeeping(){
 db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
 db.prepare('DELETE FROM limits WHERE resets_at < ?').run(Date.now());
 const retention=Number(settings().inquiryRetentionDays)||180;
 const cutoff=new Date(Date.now()-retention*86400000).toISOString();
 db.prepare('DELETE FROM inquiries WHERE created_at < ?').run(cutoff);
 // Keep a bounded operational history, without storing message bodies in audit records.
 db.prepare('DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 10000)').run();
}
