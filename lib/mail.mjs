/** Transactional notifications. Credentials stay in server environment variables. */
import {store} from './cloud.mjs';
import {settings} from './catalog.mjs';
import {HttpError,sha256,escapeHtml as e} from './security.mjs';

function failureMessage(status){
 if(status===401)return 'O Resend recusou a chave de acesso. Confira RESEND_API_KEY na Vercel.';
 if(status===403)return 'O Resend recusou o envio. Confira o domínio verificado, EMAIL_FROM e as permissões da chave.';
 if(status===429)return 'O provedor atingiu o limite de envio. Aguarde antes de reenviar pelo painel.';
 if(status===400||status===422)return 'O provedor recusou os dados do envio. Confira o remetente verificado e o destinatário nas configurações.';
 return 'Notificação não confirmada pelo provedor. A solicitação está salva; tente reenviar pelo painel.';
}

function content(row,origin){
 const d=row.data;
 const names={general:'Consulta geral',presentation:'Apresentação privada',sourcing:'Gema sob encomenda',wholesale:'Atacado',international:'Entrega internacional'};
 const fields=[['Protocolo',row.id],['Nome',d.name],['E-mail',d.email],['WhatsApp',d.phone||'—'],['Atendimento',names[d.requestType]||'Consulta geral'],['Destino',d.destination||'—'],['Empresa',d.company||'—'],['Peça',d.productName||'Consulta geral']];
 const panel=new URL('/admin',origin).href;
 const text=`NOVA SOLICITAÇÃO HILLKINGS\n\n${fields.map(([k,v])=>`${k}: ${v}`).join('\n')}\n\n${d.message}\n\nConsentimento registrado: ${row.created_at}\nPainel: ${panel}`;
 const html=`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f0ede5;font:15px/1.7 Arial,Helvetica,sans-serif;color:#193129"><div style="max-width:640px;margin:32px auto;background:#fff;padding:32px"><div style="background:#08231d;color:#d7c6a2;padding:28px;text-align:center"><strong style="font:26px Georgia,serif;letter-spacing:5px">HILLKINGS</strong><br><span style="font-size:10px;letter-spacing:3px">FINE GEMSTONES</span></div><h1 style="font:28px Georgia,serif;margin-top:32px">Nova solicitação ao concierge</h1><table role="presentation" style="width:100%;border-collapse:collapse">${fields.map(([k,v])=>`<tr><th align="left" valign="top" style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;font-size:12px;width:115px">${e(k)}</th><td style="padding:8px 0;border-bottom:1px solid #eee;word-break:break-word">${e(String(v))}</td></tr>`).join('')}</table><h2 style="font:22px Georgia,serif">Mensagem</h2><p style="white-space:pre-wrap;word-break:break-word">${e(d.message)}</p><p style="margin:28px 0"><a href="${e(panel)}" style="display:inline-block;padding:14px 22px;background:#08231d;color:#fff;text-decoration:none">Abrir atendimento privado</a></p><p style="font-size:12px;color:#63736c">Responda a este e-mail para falar diretamente com o cliente.<br>Consentimento registrado em ${e(row.created_at)}.</p></div></body></html>`;
 return {text,html};
}

export async function deliverEmail(id,origin){
 const row=await store.one('inquiries',{id:`eq.${id}`});if(!row)throw new HttpError(404,'Solicitação não encontrada.');
 if(row.email_status==='sent')return {status:'sent'};
 if(row.email_status==='sending'&&row.email_attempt_at&&Date.now()-new Date(row.email_attempt_at).getTime()>120000){await store.update('inquiries',{id:`eq.${id}`,email_status:'eq.sending',email_attempt_at:`eq.${row.email_attempt_at}`},{email_status:'queued'});}
 const apiKey=String(process.env.RESEND_API_KEY||'').trim(),from=String(process.env.EMAIL_FROM||'').trim();
 if(!apiKey||!from){
  const missing=[!apiKey?'RESEND_API_KEY':'',!from?'EMAIL_FROM':''].filter(Boolean);
  await store.update('inquiries',{id:`eq.${id}`,email_status:'in.(queued,failed)'},{last_error:`Envio não ativado: configure ${missing.join(' e ')} nas variáveis de produção da Vercel. A solicitação permanece salva.`}).catch(()=>{});
  return {status:'queued'};
 }
 const claimed=await store.update('inquiries',{id:`eq.${id}`,email_status:'in.(queued,failed)'},{email_status:'sending',email_attempt_at:new Date().toISOString()});
 if(!claimed.length)return {status:row.email_status};
 let to='';
 try{to=(await settings()).contactEmail;}catch{await store.update('inquiries',{id:`eq.${id}`},{email_status:'failed',last_error:'Não foi possível consultar o destinatário. Reenvie pelo painel.'}).catch(()=>{});return {status:'failed'};}
 let httpStatus=0;
 try{
  const d=row.data,payload={from,to:[to],reply_to:d.email,subject:`Hillkings | ${d.productName||'Atendimento privado'} | ${d.name}`,...content(row,origin)};
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`hk-${id}-${sha256(to).slice(0,12)}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  httpStatus=r.status;const result=await r.json();if(!r.ok||!result.id)throw Error('provider-rejected');
  await store.update('inquiries',{id:`eq.${id}`},{email_status:'sent',email_id:result.id,email_to:to,last_error:null});return {status:'sent'};
 }catch{
  await store.update('inquiries',{id:`eq.${id}`},{email_status:'failed',email_to:to,last_error:failureMessage(httpStatus)}).catch(()=>{});
  return {status:'failed'};
 }
}
