import {store} from './cloud.mjs';
import {settings} from './catalog.mjs';
import {HttpError,sha256} from './security.mjs';
export async function deliverEmail(id,origin){
 const row=await store.one('inquiries',{id:`eq.${id}`});if(!row)throw new HttpError(404,'Solicitação não encontrada.');
 if(row.email_status==='sent')return {status:'sent'};
 if(row.email_status==='sending'&&row.email_attempt_at&&Date.now()-new Date(row.email_attempt_at).getTime()>120000){await store.update('inquiries',{id:`eq.${id}`,email_status:'eq.sending',email_attempt_at:`eq.${row.email_attempt_at}`},{email_status:'queued'});}
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return {status:'queued'};
 const claimed=await store.update('inquiries',{id:`eq.${id}`,email_status:'in.(queued,failed)'},{email_status:'sending',email_attempt_at:new Date().toISOString()});
 if(!claimed.length)return {status:row.email_status};
 let to='';
 try{to=(await settings()).contactEmail;}catch{await store.update('inquiries',{id:`eq.${id}`},{email_status:'failed',last_error:'Não foi possível consultar o destinatário. Reenvie pelo painel.'}).catch(()=>{});return {status:'failed'};}
 const d=row.data;
 const text=`NOVA SOLICITAÇÃO HILLKINGS\n\nReferência: ${id}\nNome: ${d.name}\nE-mail: ${d.email}\nTelefone: ${d.phone||'—'}\nAtendimento: ${d.requestType}\nDestino: ${d.destination||'—'}\nEmpresa: ${d.company||'—'}\nPeça: ${d.productName||'Consulta geral'}\n\n${d.message}\n\nConsentimento registrado: ${row.created_at}\nPainel: ${origin}/admin`;
 try{
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`hk-${id}-${sha256(to).slice(0,12)}`},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],reply_to:d.email,subject:`Hillkings | ${d.productName||'Atendimento privado'} | ${d.name}`,text}),signal:AbortSignal.timeout(12000)});
  const result=await r.json();if(!r.ok||!result.id)throw Error('provider-rejected');
  await store.update('inquiries',{id:`eq.${id}`},{email_status:'sent',email_id:result.id,email_to:to,last_error:null});return {status:'sent'};
 }catch{
  await store.update('inquiries',{id:`eq.${id}`},{email_status:'failed',email_to:to,last_error:'Notificação não confirmada pelo provedor. A solicitação está salva; tente reenviar pelo painel.'}).catch(()=>{});
  return {status:'failed'};
 }
}
