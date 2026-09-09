import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPage} from '../lib/templates.mjs';
import {initialSettings,initialProducts} from '../lib/seed.mjs';
const catalog={settings:initialSettings,products:initialProducts};
test('Anonymous public identity, heritage narrative and full concierge sections in both languages',()=>{
 for(const lang of ['pt','en']){
  const {html}=renderPage('/',catalog,lang,'https://example.invalid');
  // Recipient address in seed is private server configuration, not public company biography.
  const body=html.split('<script type="application/json"')[0];
  assert.doesNotMatch(body,/\b(?:anderson|arley)\b/i);
  assert.doesNotMatch(body,/EST\. 2026|desde 18\d\d|desde 19\d\d/);
  for(const id of ['house','concierge','trade','contact','faq'])assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('id="homeInquiryForm"'));assert.ok(html.includes('data-inquiry-type="wholesale"'));
 }
});
test('GIA report badges are conditional and do not fabricate verification',()=>{
 const {html}=renderPage('/collection',catalog,'pt','https://example.invalid');
 assert.equal((html.match(/class="gia-badge"/g)||[]).length,3);
 assert.equal((html.match(/Cópia a anexar<\/small>/g)||[]).length,2);
 assert.equal((html.match(/Cópia disponível<\/small>/g)||[]).length,1);
 assert.doesNotMatch(html,/Certificado GIA|GIA Certified/);
 const missing={settings:initialSettings,products:[{...initialProducts[0],reportState:'not-provided'}]};
 assert.doesNotMatch(renderPage('/collection',missing,'pt','https://example.invalid').html,/class="gia-badge"/);
});
test('Contact form fields and all contact aliases render in both languages',()=>{
 for(const lang of ['pt','en'])for(const route of ['/private','/contact','/concierge']){
  const result=renderPage(route,catalog,lang,'https://example.invalid');assert.equal(result.status,200);
  for(const name of ['name','email','phone','requestType','destination','company','productId','message','consent'])assert.ok(result.html.includes(`name="${name}"`));
 }
});
test('Favicon contains four ICO sizes and manifest points to available logo images',()=>{
 const ico=readFileSync('public/favicon.ico');assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),4);
 const manifest=JSON.parse(readFileSync('public/site.webmanifest','utf8'));
 for(const i of manifest.icons){const buf=readFileSync('public'+i.src);assert.equal(buf.readUInt32BE(0),0x89504e47);}
 assert.ok(readFileSync('preview-dist/index.html','utf8').includes('href="data:image/png;base64,'));
});
