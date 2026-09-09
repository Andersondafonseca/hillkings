/** Shared public-page chrome. No client data or credentials are added to the page. */
import {renderPage as renderTemplate,icon} from './templates.mjs';
import {escapeHtml} from './security.mjs';

export const availabilityNotice={
 pt:'Catálogo de apresentação. Chame pelo whatsapp para confirmar a disponibilidade do dia com o concierge.',
 en:'Presentation catalogue. Contact us on WhatsApp to confirm today’s availability with our concierge.'
};

export function renderPage(pathname,catalog,lang,appUrl){
 const result=renderTemplate(pathname,catalog,lang,appUrl);
 if(pathname==='/admin')return result;
 const locale=lang==='en'?'en':'pt';
 const phone=String(catalog.settings.whatsapp||'').replace(/\D/g,'');
 const message=locale==='pt'?'Olá! Gostaria de confirmar a disponibilidade do dia com o concierge Hillkings.':'Hello. I would like to confirm today’s availability with the Hillkings concierge.';
 const href=phone?`https://wa.me/${phone}?text=${encodeURIComponent(message)}`:`/contact${locale==='en'?'?lang=en':''}`;
 const notice=`<aside class="concierge-notice" aria-label="${locale==='pt'?'Disponibilidade da coleção':'Collection availability'}"><a href="${escapeHtml(href)}"${phone?' target="_blank" rel="noopener noreferrer"':''}>${icon('whatsapp',17)}<span>${availabilityNotice[locale]}</span></a></aside>`;
 let html=result.html
  .replace('</head>','<link rel="stylesheet" href="/assets/concierge.css?v=20260909"></head>')
  .replace('<header class="site-header">',`${notice}<header class="site-header">`);
 // The availability banner remains visible in live mode. A disconnected form
 // gets its own honest warning instead of repeating the marketing banner.
 if(catalog.mode==='catalog-only'){
  const message=locale==='pt'?'O formulário ainda não está conectado. Nenhuma solicitação será enviada por aqui; fale com o concierge pelo WhatsApp.':'The form is not connected yet. No enquiry will be sent here; please contact the concierge on WhatsApp.';
  html=html.replace(/(<form[^>]*\bdata-contact-form>)/g,`$1<p class="contact-offline-note" role="status">${message}</p>`)
   .replace(/(<button class="button button-dark" type="submit")/g,'$1 disabled');
 }
 return {...result,html};
}
