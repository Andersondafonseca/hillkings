import json,re,os,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(os.environ.get('HK_PROJECT', Path(__file__).resolve().parents[1]))
out=root/'qa';out.mkdir(exist_ok=True); checks=[]; errors=[]
def check(n,v):
 checks.append({'name':n,'passed':bool(v)});print(('OK ' if v else 'FAIL ')+n,flush=True)
html=(root/'preview-dist/index.html').read_text()
m=re.search(r'(<script type="application/json" id="preview-data">)(.*?)(</script>)',html,re.S)
data=json.loads(m[2])
# Video file bytes are checked by HTTP/API tests. Avoid decoding all MP4s in the GUI harness.
for a in data['assets'].values():
 if a['type']=='video/mp4':a['base64']=''
html=html[:m.start(2)]+json.dumps(data).replace('<','\\u003c')+html[m.end(2):]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
 pg=b.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce');pg.set_default_timeout(6000)
 pg.on('pageerror',lambda e:errors.append(str(e)))
 pg.set_content(html,wait_until='domcontentloaded')
 f=pg.frame_locator('#preview-frame')
 check('Home includes the expanded contact form',f.locator('#homeInquiryForm').count()==1)
 check('No personal names in institutional copy',not re.search(r'\b(?:Anderson|Arley)\b',f.locator('body').inner_text(),re.I))
 check('All three collection items have report markers',f.locator('.collection-section .gia-badge').count()==3)
 check('Favicon is embedded in the outer window',pg.locator('head link[rel=icon]').get_attribute('href').startswith('data:image/png;base64,'))
 f.locator('#trade [data-inquiry-type=wholesale]').click()
 check('Wholesale preselection',f.locator('#inquiryForm [name=requestType]').input_value()=='wholesale')
 check('Wholesale reveals company field',f.locator('#inquiryForm [name=company]').is_enabled())
 frm=f.locator('#inquiryForm')
 for name,val in {'name':'Demo Concierge','email':'demo@example.com','company':'Atelier Exemplo','destination':'Paris, França','message':'Teste de condições especiais de atacado e entrega internacional.'}.items():frm.locator(f'[name={name}]').fill(val)
 frm.locator('[name=consent]').check();frm.locator('[type=submit]').click();frm.locator('.form-message.success').wait_for()
 check('Preview honestly says no email was sent','Nenhum e-mail' in frm.locator('.form-message.success').inner_text())
 f.locator('#contactDialog [data-close-dialog]').click()
 f.locator('#concierge [data-inquiry-type=sourcing]').click()
 check('Sourcing preselection',f.locator('#inquiryForm [name=requestType]').input_value()=='sourcing')
 check('Company field disabled when not relevant',not f.locator('#inquiryForm [name=company]').is_enabled())
 f.locator('#contactDialog [data-close-dialog]').click()
 # Capture complete form details in the admin demo.
 pg.locator('button[data-route="/admin"]').click()
 f.locator('#loginForm [name=password]').fill('admin');f.locator('#loginForm [type=submit]').click()
 f.locator('[data-nav=inquiries]').first.click();f.locator('[data-inquiry]').first.click()
 txt=f.locator('#adminEditor').inner_text()
 check('Admin shows company and destination','Atelier Exemplo' in txt and 'Paris, França' in txt)
 check('Admin shows enquiry type','Atacado' in txt)
 check('No founders signature in admin',not re.search(r'\b(?:Anderson|Arley)\b',f.locator('.admin-sidebar').inner_text(),re.I))
 pg.locator('button[data-route="/collection"]').click();f.locator('.gia-badge').nth(1).click();f.locator('#reportDetails').wait_for();pg.wait_for_timeout(180)
 check('Badge deep-link opens report details',f.locator('#reportDetails').evaluate('(el)=>el.open'))
 check('Correct GIA report assigned to loose Paraiba','5141608096' in f.locator('#reportDetails').inner_text())
 # Mobile layout and English remain navigable.
 pg.set_viewport_size({'width':390,'height':844});pg.locator('button[data-route="/"]').click()
 check('Mobile page has no horizontal overflow',f.locator('html').evaluate('(e)=>e.scrollWidth<=window.innerWidth+1'))
 f.locator('.mobile-menu-toggle').click();check('Contact in the mobile menu',f.locator('#mobileMenu a').filter(has_text='Contato').is_visible())
 pg.evaluate("HKPreview.navigate('/?lang=en')");f.locator('#concierge').wait_for(state='attached')
 check('English sourcing section present','source gemstones' in f.locator('#concierge').inner_text())
 check('English wholesale section present','wholesale purchases' in f.locator('#trade').inner_text())
 check('English has no founders names',not re.search(r'\b(?:Anderson|Arley)\b',f.locator('body').inner_text(),re.I))
 check('No script error banner',not pg.locator('#preview-error').inner_text())
 # Exercise one actual GLB in this harness; all three files and renderer are unmodified.
 pg.set_viewport_size({'width':1440,'height':1000});pg.locator('button[data-route="/piece/paraiba-2-09?view=3d"]').click()
 f.locator('[data-viewer][data-state=ready]').wait_for(timeout=12000)
 check('3D still initialises',f.locator('[data-viewer]').get_attribute('data-state')=='ready')
 check('No JavaScript exceptions',not errors)
 b.close()
(out/'browser-tests-v3.json').write_text(json.dumps({'checks':checks,'passed':sum(x['passed'] for x in checks),'total':len(checks),'errors':errors,'fixture_note':'Self-contained preview rendered in memory. MP4 bytes omitted only in the test fixture; delivered preview retains the original files. Browser URL navigation is restricted in this environment.'},ensure_ascii=False,indent=2))
print('RESULT',sum(x['passed'] for x in checks),len(checks),flush=True)

if not all(x['passed'] for x in checks):
 raise SystemExit('Uma ou mais verificações falharam. Consulte qa/browser-tests-v3.json.')
