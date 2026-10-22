#!/usr/bin/env python3
"""Optional real-browser smoke test (Playwright + Chromium).

Build with pnpm build, then serve dist on 127.0.0.1:8000 before running:
    python3 tests/browser-textures.py
ATELIER_TEST_URL can target another URL, including a GitHub Pages subdirectory.
Uses disposable browser contexts and writes screenshots/PNG to /tmp/atelier-*.
WebGL runs through SwiftShader; this is not a physical-phone benchmark.
"""
from playwright.sync_api import sync_playwright
import json, pathlib, os
from urllib.parse import urlparse
app_url = os.environ.get('ATELIER_TEST_URL', 'http://127.0.0.1:8000/')
app_origin = urlparse(app_url)[:2]
project={
 'name':'Essai des textures réalistes','version':5,'mode':'free','foundation':'concrete',
 'freeParts':[
 {'id':'W','kind':'wall','material':'wall','label':'Mur en blocs','a':[-2200,0,1000],'b':[2200,0,1000],'width':200,'height':2200,'wallSupport':'concrete'},
 {'id':'A','kind':'post','material':'wood','label':'Poteau gauche','a':[-1600,0,-600],'b':[-1600,2100,-600],'width':145,'height':145,'foundation':'concrete'},
 {'id':'B','kind':'post','material':'wood','label':'Poteau droit','a':[1600,0,-600],'b':[1600,2100,-600],'width':145,'height':145,'foundation':'concrete'},
 {'id':'C','kind':'beam','material':'wood','label':'Traverse','a':[-1600,2020,-600],'b':[1600,2020,-600],'width':145,'height':180},
 {'id':'P','kind':'panel','material':'wood','label':'Panneau bois','corners':[[-1300,250,-600],[1300,250,-600],[1300,1550,-600],[-1300,1550,-600]],'width':18}
 ],
 'appearance':{'parts':{'W':{'finish':'block'},'P':{'finish':'wood-weathered'}},'ground':{'finish':'grass'}}
}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
 page=ctx.new_page();errors=[];external=[]
 page.on('pageerror',lambda e: errors.append(str(e)))
 page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and urlparse(r.url)[:2] != app_origin else None)
 page.goto(app_url,wait_until='networkidle')
 page.evaluate('(p)=>localStorage.setItem("atelier.project.v4",JSON.stringify(p))',project)
 page.reload(wait_until='networkidle');page.wait_for_function('!!window.Atelier');page.wait_for_timeout(1200)
 assert page.locator('.fallback').count()==0
 before=page.evaluate('JSON.stringify(Atelier.getBOM())')
 page.screenshot(path='/tmp/atelier-realistic-scene.png')
 page.evaluate('Atelier.selectParts(["A","B","C"])')
 page.locator('[data-drawer-toggle="properties"]').click()
 page.locator('[data-surface-finish="wood-stained"]').click()
 assert page.evaluate('Atelier.getProject().appearance.parts.C.finish')=='wood-stained'
 page.locator('[data-surface-target="parts"][data-surface-setting="rotation"]').fill('90')
 page.locator('[data-surface-target="parts"][data-surface-setting="rotation"]').press('Tab')
 assert page.evaluate('Atelier.getProject().appearance.parts.C.rotation')==90
 page.locator('#undo').click();assert page.evaluate('Atelier.getProject().appearance.parts.C.rotation')==0
 page.evaluate('Atelier.selectParts(["W"])')
 if page.locator('[data-drawer-toggle="properties"]').get_attribute('aria-expanded')!='true':page.locator('[data-drawer-toggle="properties"]').click()
 page.locator('[data-surface-finish="stone"]').click()
 print('part selections ok',flush=True)
 assert page.evaluate('Atelier.getProject().freeParts[0].wallSupport')=='concrete'
 page.locator('details.display-menu > summary').click()
 page.locator('[data-surface-quality]').select_option('light')
 page.locator('#surface-display-settings details > summary').click()
 page.locator('[data-surface-target="ground"][data-surface-finish="pavers"]').click()
 assert page.evaluate('Atelier.getProject().appearance.ground.finish')=='pavers'
 page.locator('[data-layer="textures"]').click();assert page.evaluate('Atelier.getProject().appearance.mode')=='schematic'
 page.locator('[data-layer="textures"]').click()
 page.locator('[data-surface-quality]').select_option('standard')
 page.locator('details.display-menu > summary').click()
 assert page.evaluate('JSON.stringify(Atelier.getBOM())')==before
 page.evaluate('Atelier.selectParts([])')
 # Export via the application action; it must wait for every active image map.
 page.locator('#export-open').click()
 with page.expect_download() as result:
  page.locator('[data-action="png"]').click()
 download=result.value;download.save_as('/tmp/atelier-realistic-export.png')
 assert pathlib.Path('/tmp/atelier-realistic-export.png').stat().st_size>20000
 page.reload(wait_until='networkidle');assert page.evaluate('Atelier.getProject().appearance.parts.W.finish')=='stone'
 assert page.evaluate('Atelier.getProject().appearance.quality')=='standard'
 page.evaluate('Atelier.selectParts(["W"])')
 if page.locator('[data-drawer-toggle="properties"]').get_attribute('aria-expanded')!='true':page.locator('[data-drawer-toggle="properties"]').click()
 page.screenshot(path='/tmp/atelier-finish-inspector.png')
 # Real cached app reload with the browser network disabled.
 page.wait_for_function('Atelier.getOfflineState().offlineReady')
 assert page.evaluate('async () => (await navigator.serviceWorker.ready).scope === new URL("./", location.href).href')
 assert page.evaluate('document.querySelector("link[rel=manifest]").href === new URL("./manifest.webmanifest", location.href).href')
 assert page.evaluate('document.querySelector("link[rel=apple-touch-icon]").href === new URL("./icon-192.png", location.href).href')
 ctx.set_offline(True)
 page.reload(wait_until='load');page.wait_for_function('!!window.Atelier');page.wait_for_timeout(1200)
 assert page.locator('.fallback').count()==0
 assert page.evaluate('Atelier.getProject().appearance.parts.W.finish')=='stone'
 page.evaluate('Atelier.selectParts(["W"])')
 if page.locator('[data-drawer-toggle="properties"]').get_attribute('aria-expanded')!='true':page.locator('[data-drawer-toggle="properties"]').click()
 page.locator('[data-surface-finish="plaster"]').click()
 page.screenshot(path='/tmp/atelier-offline.png')
 ctx.set_offline(False)
 # Mobile drawer uses the same controls without horizontal overflow.
 mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
 m=mobile.new_page();m.on('pageerror',lambda e:errors.append(str(e)))
 m.goto(app_url,wait_until='networkidle');m.evaluate('(p)=>localStorage.setItem("atelier.project.v4",JSON.stringify(p))',project);m.reload(wait_until='networkidle')
 m.evaluate('Atelier.selectParts(["W"])');m.locator('[data-mobile-sheet="properties"]').click();m.locator('[data-surface-finish="plaster"]').click();m.screenshot(path='/tmp/atelier-mobile.png')
 assert m.evaluate('document.documentElement.scrollWidth <= innerWidth')
 assert not errors, errors
 assert not external,external
 print(json.dumps({'webgl':True,'png_export_bytes':pathlib.Path('/tmp/atelier-realistic-export.png').stat().st_size,'offline_PWA':True,'mobile_390px':True,'BOM_unchanged':True,'external_requests':external,'page_errors':errors}))
 browser.close()
