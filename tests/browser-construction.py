#!/usr/bin/env python3
"""Optional Chromium smoke test. Build and serve dist; set ATELIER_TEST_URL if needed."""
import json, os
from playwright.sync_api import sync_playwright, expect

URL=os.environ.get('ATELIER_TEST_URL','http://127.0.0.1:8001/1plan3D/')
def post(id,x,group):
    return {'id':id,'label':id,'kind':'post','material':'wood','a':[x,0,0],'b':[x,2000,0],'width':100,'height':100,'foundation':'none','groupName':group,'grouped':True}
PROJECT={'version':5,'name':'Construction avec les groupes','mode':'free','freeParts':[post('A',0,'Cadre A'),post('B',1500,'Cadre A'),post('C',4000,'Cadre B'),post('D',5500,'Cadre B')],'freeJoints':[],'appearance':{'mode':'schematic'}}

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    errors=[]
    def launch(mobile=False):
        context=browser.new_context(viewport={'width':390 if mobile else 1366,'height':844 if mobile else 900},is_mobile=mobile,has_touch=mobile)
        context.add_init_script('localStorage.setItem("atelier.project.v4",'+json.dumps(json.dumps(PROJECT))+');')
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL,wait_until='networkidle');page.wait_for_function('!!window.Atelier')
        assert page.locator('.fallback').count()==0
        return context,page
    def select(ids):page.evaluate('(ids)=>Atelier.selectParts(ids)',ids)
    def snapshot():return page.evaluate('JSON.stringify(Atelier.getProject())')
    def count():return page.evaluate('Atelier.getProject().freeParts.length')
    def undo():page.locator('#undo').click()
    def add(type):
        page.locator('.scene-add-menu > summary').click();page.locator('.scene-add-menu [data-plan-add="'+type+'"]').click()
    if not os.environ.get('ATELIER_TEST_MOBILE_ONLY'):
        context,page=launch()
        original=snapshot()
        select(['A','B']);page.locator('#context-actions-open').click()
        expect(page.locator('.context-primary [data-context-action="duplicate"]')).to_have_text('Dupliquer le groupe')
        page.keyboard.press('Escape')
        page.locator('#editor-toolbar [data-context-action="duplicate"]').click();assert count()==6
        assert page.evaluate('Atelier.getProject().freeParts[4].groupName !== "Cadre A"')
        undo();assert snapshot()==original
        select(['A','B','C','D']);page.locator('#editor-toolbar [data-context-action="spacing"]').click()
        page.locator('[data-group-spacing] [name="distance"]').fill('0,75 m')
        expect(page.locator('[data-construction-preview]')).to_contain_text('750')
        assert snapshot()==original
        page.screenshot(path='/tmp/atelier-groups-spacing.png')
        page.locator('[data-group-spacing] [type="submit"]').click()
        assert page.evaluate('Atelier.getProject().freeParts[2].a[0]')==2350
        assert page.evaluate('Atelier.getProject().freeParts[3].a[0]')==3850
        undo();assert snapshot()==original
        select(['A','B']);add('beam');assert count()==5
        beam=page.evaluate('Atelier.getProject().freeParts.at(-1)')
        assert beam['a'][1]-beam['height']/2==2000
        assert beam['groupName']=='Cadre A'
        add('mesh');assert count()==6
        mesh=page.evaluate('Atelier.getProject().freeParts.at(-1)')
        assert mesh['corners']==[[-50,0,50],[1550,0,50],[1550,2000+beam['height'],50],[-50,2000+beam['height'],50]]
        page.screenshot(path='/tmp/atelier-group-beam-mesh.png')
        undo();undo();assert snapshot()==original
        select(['A','B']);add('post');expect(page.locator('[data-selected-post]')).to_be_visible()
        page.locator('[data-selected-post] [name="distance"]').fill('1 m');assert snapshot()==original
        page.locator('[data-selected-post] [data-context-cancel]').click();assert snapshot()==original
        add('post');page.locator('[data-selected-post] [name="distance"]').fill('1 m')
        page.locator('[data-selected-post] [type="submit"]').click();assert count()==5
        assert page.evaluate('Atelier.getProject().freeParts.at(-1).a[0]')==2600
        undo();assert snapshot()==original
        select(['A','B']);page.locator('#editor-toolbar [data-context-action="between"]').click()
        page.locator('[data-between-preset="2"]').click();page.locator('[data-between-form] [name="count"]').fill('3')
        expect(page.locator('[data-between-preview]')).to_contain_text('375')
        assert snapshot()==original;page.locator('[data-between-apply]').click();assert count()==7
        assert page.evaluate('Atelier.getProject().freeParts.slice(4).map(p=>p.a[0])')==[375,750,1125]
        undo();assert snapshot()==original
        select(['A','B']);add('post');page.locator('[data-free-add="post"]').click()
        expect(page.locator('#modal')).not_to_be_visible();assert snapshot()==original
        page.keyboard.press('Escape');assert snapshot()==original
        assert not errors,errors
        print('Desktop: group duplication, exact spacing, automatic beam/mesh/post, intermediate posts and undo passed.',flush=True)
        context.close()
    context,page=launch(True)
    select(['A','B']);page.locator('#mobile-toolbar [data-mobile-action="add"]').click()
    page.locator('#modal [data-plan-add="beam"]').click();expect(page.locator('#modal')).not_to_be_visible();assert count()==5
    page.locator('#context-actions-open').click();expect(page.locator('.context-primary [data-context-action="duplicate"]')).to_be_visible()
    page.locator('.context-primary [data-context-action="duplicate"]').click();assert count()==8
    undo();assert count()==5
    select(['A','B'])
    page.locator('#mobile-toolbar [data-mobile-action="add"]').click();page.locator('#modal [data-plan-add="post"]').click()
    expect(page.locator('[data-selected-post]')).to_be_visible();assert count()==5
    page.locator('[data-selected-post] [data-context-cancel]').click()
    select(['A','B']);page.locator('#context-actions-open').click();page.locator('.context-primary [data-context-action="between"]').click()
    page.locator('[data-between-preset="1"]').click();page.locator('[data-between-apply]').click();assert count()==6
    page.screenshot(path='/tmp/atelier-mobile-intermediate-post.png')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors,errors
    print('Mobile: automatic additions, group duplicate, distance dialog and middle post passed; no JavaScript errors.',flush=True)
    context.close();browser.close()
