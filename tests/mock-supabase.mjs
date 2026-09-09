/** Protocol fixture only. This is NOT a hosted Supabase/PostgreSQL verification. */
import http from 'node:http';
import {initialProducts,initialSettings} from '../lib/seed.mjs';
export async function startFixture(){
 const state={tables:{settings:[{id:1,data:structuredClone(initialSettings),version:1}],products:initialProducts.map(p=>({id:p.id,slug:p.slug,data:structuredClone(p),version:1,updated_at:new Date().toISOString()})),users:[],sessions:[],inquiries:[],audit:[],limits:[],meta:[{key:'contact-secret',value:'0'.repeat(64)}],uploads:[]},objects:new Map(),calls:[],failure:false};
 const json=(res,status,v)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
 const matches=(row,params)=>[...params].every(([k,v])=>{if(['select','limit','order'].includes(k))return true;const [op,...rest]=v.split('.'),value=rest.join('.');if(op==='eq')return String(row[k])===value;if(op==='gt')return Number(row[k])>Number(value);if(op==='lt')return String(row[k])<value;if(op==='in')return value.slice(1,-1).split(',').includes(String(row[k]));return false;});
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://fixture');const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);let b={};if(raw.length&&req.headers['content-type']?.startsWith('application/json'))b=JSON.parse(raw.toString());
  state.calls.push({path:u.pathname,method:req.method,headers:req.headers});
  if(state.failure)return json(res,503,{code:'fixture-down'});
  if(u.pathname.startsWith('/storage/v1/object/upload/sign/')&&req.method==='PUT'){
   if(!u.searchParams.get('token'))return json(res,403,{});state.objects.set(u.pathname.split('/').pop(),{bytes:raw,type:req.headers['content-type']});return json(res,200,{Key:u.pathname});
  }
  if(req.headers.apikey!=='sb_secret_test_only_fixture')return json(res,401,{code:'invalid-api-key'});
  if(u.pathname.startsWith('/storage/v1/')){
   const name=u.pathname.split('/').pop();
   if(u.pathname.startsWith('/storage/v1/object/upload/sign/'))return json(res,200,{url:`/object/upload/sign/hillkings-media/${name}?token=fixture-token`});
   if(u.pathname.startsWith('/storage/v1/object/sign/'))return json(res,200,{signedURL:`/object/sign/hillkings-media/${name}?token=fixture-read`});
   if(u.pathname.startsWith('/storage/v1/object/authenticated/')){const file=state.objects.get(name);if(!file)return json(res,404,{});res.writeHead(200,{'Content-Type':file.type,'Content-Length':file.bytes.length});return res.end(file.bytes);}
  }
  const rpc=u.pathname.match(/^\/rest\/v1\/rpc\/(hk_[a-z_]+)$/);
  if(rpc){
   if(rpc[1]==='hk_try_limit'){let row=state.tables.limits.find(x=>x.key===b.p_key);if(!row){row={key:b.p_key,count:0,resets_at:Date.now()+b.p_window_ms};state.tables.limits.push(row);}if(row.resets_at<=Date.now()){row.count=0;row.resets_at=Date.now()+b.p_window_ms;}row.count++;return json(res,200,row.count<=b.p_max);}
   if(rpc[1]==='hk_change_account'){const row=state.tables.users.find(x=>x.id===b.p_id&&x.password_hash===b.p_expected_hash);if(!row)return json(res,200,false);row.username=b.p_username;row.password_hash=b.p_password_hash;row.must_change=false;state.tables.sessions=state.tables.sessions.filter(x=>x.user_id!==b.p_id);state.tables.sessions.push({hash:b.p_session_hash,user_id:b.p_id,csrf:b.p_csrf,expires_at:b.p_expires_at});return json(res,200,true);}
   if(rpc[1]==='hk_cleanup')return json(res,200,null);
  }
  const table=u.pathname.match(/^\/rest\/v1\/hk_([a-z]+)$/)?.[1];if(!table||!state.tables[table])return json(res,404,{code:'PGRST205'});
  const rows=state.tables[table];
  if(req.method==='GET'){let found=rows.filter(row=>matches(row,u.searchParams));if(u.searchParams.get('order')){const [key,dir]=u.searchParams.get('order').split('.');found.sort((a,b)=>(a[key]>b[key]?1:-1)*(dir==='desc'?-1:1));}return json(res,200,found.slice(0,Number(u.searchParams.get('limit'))||1000));}
  if(req.method==='POST'){
   const key={meta:'key',limits:'key',sessions:'hash',uploads:'name'}[table]||'id';
   if(b[key]!==undefined&&rows.some(x=>x[key]===b[key]))return req.headers.prefer?.includes('ignore-duplicates')?json(res,201,[]):json(res,409,{code:'23505'});
   const row={...(table==='audit'?{id:rows.length+1}:{}),...(table==='inquiries'?{status:'new',email_status:'queued'}:{}),...b};rows.push(row);return json(res,201,[row]);
  }
  if(req.method==='PATCH'){const found=rows.filter(row=>matches(row,u.searchParams));found.forEach(row=>Object.assign(row,b));return json(res,200,found);}
  if(req.method==='DELETE'){state.tables[table]=rows.filter(row=>!matches(row,u.searchParams));res.writeHead(204);return res.end();}
  return json(res,404,{});
 }catch(e){json(res,500,{code:'fixture-error',message:e.message});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {state,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};
}
