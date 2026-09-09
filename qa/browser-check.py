from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess,time,json,urllib.request
root=Path(__file__).resolve().parents[1]
server=subprocess.Popen(['node','tests/serve-fixture.mjs'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
try:
 for _ in range(50):
  try:
   urllib.request.urlopen('http://127.0.0.1:31391/api/health');break
  except Exception:time.sleep(.1)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':1440,'height':1050})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  base='http://127.0.0.1:31391'
  for route,name in [('/','home'),('/collection','collection'),('/contact','contact')]:
   r=page.goto(base+route,wait_until='networkidle');assert r.status==200
   page.screenshot(path=str(root/'qa'/f'{name}.png'),full_page=False)
   results.append({'check':route,'status':r.status,'title':page.title()})
  assert page.locator('form').count()>0
  page.goto(base+'/admin',wait_until='networkidle')
  page.locator('[name="username"]').fill('admin');page.locator('[name="password"]').fill('FixtureOnly_NotForDeployment_73')
  page.locator('#loginForm button').click();page.wait_for_selector('#passwordForm')
  page.locator('[name="currentPassword"]').fill('FixtureOnly_NotForDeployment_73');page.locator('[name="newPassword"]').fill('Browser_QA_Only_Passphrase_71');page.locator('[name="confirmation"]').fill('Browser_QA_Only_Passphrase_71')
  page.locator('#passwordForm button').click();page.wait_for_timeout(1500)
  assert page.locator('#passwordForm').count()==0
  page.screenshot(path=str(root/'qa'/'admin.png'))
  results.append({'check':'Admin browser login and compulsory password change','ok':True})
  page.set_viewport_size({'width':390,'height':844});page.goto(base+'/collection',wait_until='networkidle')
  overflow=page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
  assert not overflow
  results.append({'check':'390px collection horizontal overflow','overflow':overflow})
  page.screenshot(path=str(root/'qa'/'mobile.png'))
  assert not errors, errors
  results.append({'check':'Uncaught browser exceptions','errors':errors})
  browser.close()
finally:
 server.terminate();server.wait(timeout=5)
(root/'qa'/'browser.json').write_text(json.dumps(results,indent=2,ensure_ascii=False))
print(json.dumps(results,indent=2,ensure_ascii=False))
