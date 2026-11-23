"""Offline 3.0 acceptance cases. Uses the same isolated HTTP server as the legacy suite."""
import functools
import http.server
import io
import os
from pathlib import Path
import threading
import tempfile
import zipfile
import zlib

from playwright.sync_api import sync_playwright
from media_roundtrip import QuietHandler, enter_app, image_bytes, upload


def pdf_fixture():
    """Two pages. A vector pentagon with a dimension label, then an embedded raster scan."""
    rows = bytes(0 if ((x in range(14, 18) or x in range(139, 143)) and 15 <= y <= 80)
                 or ((y in range(15, 19) or y in range(77, 81)) and 14 <= x <= 142)
                 else 255 for y in range(96) for x in range(160))
    def stream(data, spec=b''):
        return b'<< /Length ' + str(len(data)).encode() + b' ' + spec + b' >>\nstream\n' + data + b'\nendstream'
    objs = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] /Resources << /XObject << /Img 8 0 R >> >> /Contents 6 0 R >>',
        stream(b'2 w 20 20 m 145 20 l 160 50 l 145 94 l 20 94 l h S BT /F1 9 Tf 50 4 Td (4000) Tj ET'),
        stream(b'q 200 0 0 120 0 0 cm /Img Do Q'),
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        stream(zlib.compress(rows), b'/Type /XObject /Subtype /Image /Width 160 /Height 96 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode')]
    out = bytearray(b'%PDF-1.4\n')
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out.extend(str(i).encode() + b' 0 obj\n' + body + b'\nendobj\n')
    pos = len(out)
    out.extend(f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode())
    for offset in offsets:
        out.extend(f'{offset:010} 00000 n \n'.encode())
    out.extend(f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{pos}\n%%EOF'.encode())
    return bytes(out)


def check_room_step(page):
    page.click('[data-t=rooms]')
    def open_room(name):
        page.locator('[data-a=room]').filter(has_text=name).click()
    def step(key):
        return page.locator(f'.steps28 [data-k="{key}"]')
    def back():
        page.locator('.bar [data-a=back]').click()

    open_room('Мансарда')
    step('photo').click()
    page.locator('.foot [data-k=engineering]').click()
    assert '12. Инж. коммуникации' in step('engineering').inner_text()
    assert '13. Готово' in step('done').inner_text()
    page.locator('svg.pe28 circle[data-wall28="2"]').click()
    page.get_by_role('button',name='Добавить элемент',exact=True).click()
    dlg=page.locator('.eng-dialog')
    assert dlg.locator('[name=room] option:checked').text_content()=='Мансарда'
    assert dlg.locator('[name=wallIndex]').input_value()=='1'
    dlg.locator('[name=name]').fill('Стояк мансарды')
    dlg.locator('[name=offset]').fill('250')
    dlg.locator('[name=height]').fill('800')
    dlg.get_by_role('button',name='Сохранить').click()
    assert step('engineering').locator('i').inner_text()=='1'
    assert step('engineering').evaluate("""el=>{
        const a=el.getBoundingClientRect(), b=el.parentElement.getBoundingClientRect();
        return a.left>=b.left-1 && a.right<=b.right+1;
    }""")
    assert page.evaluate('Eng.anchor(P(),P().engineering[0]).r.id===RM().id && Eng.anchor(P(),P().engineering[0]).i===1')
    page.locator('.foot [data-k=done]').click()
    assert page.get_by_text('инженерных элементов 1',exact=False).is_visible()
    back()
    page.click('[data-a=moretabs]')
    page.click('[data-t=engineering]')
    assert page.get_by_text('Стояк мансарды',exact=True).is_visible()
    page.click('[data-t=rooms]')
    page.click('[data-a=moretabs]')
    open_room('Кухня')
    step('engineering').click()
    assert page.locator('[data-eng=edit]').count()==0
    back()
    open_room('Мансарда')
    step('engineering').click()
    page.click('[data-eng=edit]')
    assert dlg.locator('[name=offset]').input_value()=='250'
    dlg.locator('[data-close]').click()
    page.click('[data-eng=delete]')
    assert page.locator('[data-eng=edit]').count()==0
    back()


def run(page, url):
    errors = []
    page.on('pageerror', lambda e: errors.append(e.stack or str(e)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(url)
    enter_app(page)
    page.evaluate('async()=>{await navigator.serviceWorker.ready}')
    page.reload()
    enter_app(page)
    page.wait_for_function('navigator.serviceWorker.controller')
    page.context.set_offline(True)
    page.click('[data-a=settings]')
    original_viewport=page.viewport_size
    for width in (320,390,768):
        page.set_viewport_size({'width':width,'height':800})
        assert page.locator('.data-actions').evaluate("""group=>{
            const card=group.closest('.card').getBoundingClientRect();
            const boxes=[...group.querySelectorAll('button')].map(b=>{
                const box=b.getBoundingClientRect(), text=document.createRange();
                text.selectNodeContents(b);
                const label=text.getBoundingClientRect();
                if(label.left<box.left-1 || label.right>box.right+1) throw Error('Clipped button label');
                return box;
            });
            return boxes.every((b,i)=>b.left>=card.left && b.right<=card.right && b.height>=44 &&
                boxes.slice(i+1).every(c=>b.right<=c.left || c.right<=b.left || b.bottom<=c.top || c.bottom<=b.top));
        }""")
    page.set_viewport_size(original_viewport)
    with page.expect_file_chooser() as picker:
        page.get_by_role('button',name='Импорт PDF и других чертежей').click()
    def field(k):
        return page.locator(f'[data-el="{k}"]')
    def act(k):
        page.click(f'[data-do="{k}"]')
    picker.value.set_files({'name':'house.pdf', 'mimeType':'application/pdf','buffer':pdf_fixture()})
    page.wait_for_function("document.querySelector('[data-el=status]').textContent.includes('готова')",timeout=15000)
    assert 'Векторные' in field('note').text_content()
    assert '4000' in field('texts').text_content()
    assert field('candidate').locator('option').count() >= 2
    assert field('guesses').is_visible()
    assert page.evaluate("document.querySelector('.drawing-dialog').scrollWidth<=document.querySelector('.drawing-dialog').clientWidth+1")
    field('kind').select_option('house')
    field('candidate').select_option('0')
    act('select')
    field('length').fill('4000')
    act('calibrate')
    def point(x,y):
        field('preview').evaluate('(c,p)=>{c.scrollIntoView();const b=c.getBoundingClientRect();c.dispatchEvent(new MouseEvent("click",{clientX:b.left+b.width*p[0],clientY:b.top+b.height*p[1],bubbles:true}))}', [x,y])
    point(.1,1-20/120)
    point(.725,1-20/120)
    field('height').fill('2750')
    field('room').fill('Кухня')
    field('floor').fill('1 этаж')
    page.locator('summary').filter(has_text='Стены и проёмы').click()
    field('wall').select_option('1')
    for key,value in [('offset','500'),('width','800'),('opheight','2000')]:
        field(key).fill(value)
    act('addOp')
    act('confirmRoom')
    assert 'Кухня' in field('rooms').text_content(),field('status').text_content()
    field('page').select_option('2')
    page.wait_for_function("document.querySelector('[data-el=status]').textContent.includes('Страница 2 готова')")
    assert 'Растровая' in field('note').text_content()
    assert field('candidate').locator('option').count() >= 2
    field('candidate').select_option('0')
    act('select')
    field('length').fill('3200')
    act('calibrate')
    point(.1,.2)
    point(.9,.2)
    field('height').fill('2500')
    field('room').fill('Мансарда')
    field('floor').fill('2 этаж')
    field('level').fill('3250')
    act('confirmRoom')
    field('keep').check()
    act('create')
    try:
        page.wait_for_selector('dialog.drawing-dialog',state='detached')
    except Exception as exc:
        raise AssertionError([field('status').text_content(),field('summary').text_content(),errors]) from exc
    assert page.evaluate('P().rooms.length===2 && P().floors.length===2 && P().rooms[0].walls.length===5 && Math.abs(P().rooms[0].walls[0].len-4)<0.03 && geo(P().rooms[0]).closed')
    assert page.evaluate("P().rooms[0].ops[0].w===.8 && sceneFloors3(P()).length===2 && allSheets27(P()).filter(s=>s.title.startsWith('План ·')).length===2")
    for size in (360,390):
        page.set_viewport_size({'width':size,'height':800})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    check_room_step(page)
    page.click('[data-a=moretabs]')
    page.click('[data-t=engineering]')
    page.click('[data-eng=new]')
    dlg=page.locator('.eng-dialog')
    dlg.locator('[name=wallIndex]').select_option('0')
    dlg.locator('[name=offset]').fill('450')
    dlg.locator('[name=height]').focus()
    page.evaluate('measure24(1.25)')
    assert dlg.locator('[name=height]').input_value()=='1250'
    dlg.locator('[name=name]').fill('Ввод воды')
    dlg.locator('[name=diameter]').fill('25')
    dlg.locator('button[type=submit]').click()
    orig=image_bytes()
    with page.expect_file_chooser() as picker:
        page.click('[data-eng=photo]')
    picker.value.set_files({'name':'sample.png','mimeType':'image/png','buffer':orig})
    page.wait_for_function('P().engMedia?.photos.length===1')
    page.locator('[data-eng-photo]').click()
    assert page.locator('.eng-dialog a[download]').get_attribute('download')=='sample.png'
    page.click('.eng-dialog [data-close]')
    page.click('[data-eng=copy]')
    assert page.evaluate('P().engineering.length===2&&P().engMedia.photos[0].elements.length===2')
    page.locator('[data-eng=delete]').last.click()
    assert page.evaluate('P().engineering.length===1&&P().engMedia.photos[0].elements.length===1')
    page.click('[data-eng=edit]')
    assert dlg.locator('[name=wallIndex]').input_value()=='0'
    dlg.locator('[name=offset]').fill('650')
    dlg.locator('button[type=submit]').click()
    assert page.evaluate('Math.abs(Eng.anchor(P(),P().engineering[0]).offset-.65)<1e-6')
    assert page.evaluate("""() => {
      const p=P(),r=p.rooms[0],e=p.engineering[0],svg=allSheets27(p);
      return svg.some(s=>s.svg.includes('data-eng-marker')) && svg.some(s=>s.title.includes('ведомость')) &&
         peSVG28(r).includes('data-eng-marker') && new TextDecoder().decode(planDXF(p)).includes('ENG_WATER');
    }""")
    assert page.evaluate("""async()=>{const T=await loadThree27(),box=new T.Group();eng3d(T,P(),box);return box.children.length===1}""")
    if page.evaluate("!!document.createElement('canvas').getContext('webgl2')"):
        page.click('[data-t="3d"]')
        try:
            page.wait_for_function('Boolean(V3?.kick)')
        except Exception as exc:
            raise AssertionError([errors,page.locator('#v3d27').inner_text()]) from exc
        page.select_option('#scene-floor3',index=1)
        page.wait_for_function('Boolean(V3?.kick)')
        if not page.locator('[data-t=info]').is_visible():
            page.click('[data-a=moretabs]')
    page.click('[data-t=info]')
    with page.expect_download() as download:
        page.click('[data-a=projectZip]')
    archive=download.value.path().read_bytes()
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        assert z.read('source/drawing.pdf')==pdf_fixture()
        assert z.read('media/0-original.png')==orig
        assert z.read('documents/drawings.pdf').startswith(b'%PDF')
        if os.environ.get('ZAMER_VERIFY_CAD'):
            import ezdxf
            import ifcopenshell
            import ifcopenshell.geom
            import ifcopenshell.validate
            with tempfile.TemporaryDirectory() as tmp:
                dxf=Path(tmp)/'plan.dxf'
                dxf.write_bytes(z.read('documents/designer/plan.dxf'))
                drawing=ezdxf.readfile(dxf)
                assert not drawing.audit().errors and 'ENG_WATER' in drawing.layers
            model=ifcopenshell.file.from_string(z.read('documents/designer/model.ifc').decode())
            log=ifcopenshell.validate.json_logger()
            ifcopenshell.validate.validate(model,log)
            assert not log.statements,log.statements
            assert sorted(s.Elevation or 0 for s in model.by_type('IfcBuildingStorey'))==[0,3250]
            assert len(model.by_type('IfcSpace'))==2 and len(model.by_type('IfcWall'))>=9 and model.by_type('IfcDoor')
            for entity in model.by_type('IfcSpace')+model.by_type('IfcWall'):
                shape=ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(),entity)
                assert len(shape.geometry.verts)>=9
        assert any(b'data:image/jpeg;base64' in z.read(x) for x in z.namelist() if x.endswith('.svg'))
    upload(page, archive)
    page.wait_for_function('DB.projects.length===2')
    page.reload()
    enter_app(page)
    assert page.evaluate("""async()=>{const [a,b]=DB.projects; const f=b.engMedia.photos[0],r=await PHDB.get(f.id),s=await PHDB.get(b.drawingSource.id);
     return r.original.size>0&&s.source.size===b.drawingSource.size&&a.drawingSource.id!==b.drawingSource.id&&a.engMedia.photos[0].id!==f.id&&Eng.anchor(b,b.engineering[0])?.i===0}""")
    assert page.evaluate("""async()=>{
      const c=document.createElement('canvas');c.width=240;c.height=160;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,240,160);g.lineWidth=5;g.strokeRect(20,20,180,100);
      for(const [ext,type] of [['jpg','image/jpeg'],['png','image/png']]){
       const blob=await new Promise(r=>c.toBlob(r,type)),reader=await DrawingReader.open(new File([blob],'scan.'+ext)),p=await reader.page(1);
       if(!p.shapes.length||p.scale)return false;
       const scale=DrawingProject.calibration([{a:[20,20],b:[200,20],mm:3600}]);
       const {room}=DrawingProject.roomFrom({points:p.shapes[0].pts,h:2.7,name:'Скан',scale});
       if(!(geo(room).floor>6&&geo(room).floor<8))return false;
      }
      try{DrawingProject.calibration([{a:[0,0],b:[200,0],mm:4000},{a:[0,0],b:[100,0],mm:3000}]);return false}catch{}
      try{DrawingProject.checkShape([[0,0],[2,2],[0,2],[2,0]]);return false}catch{}
      return true;
    }""")
    assert page.evaluate(r"""()=>{
      const text='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nWalls\n70\n1\n10\n0\n20\n0\n10\n3000\n20\n0\n10\n3000\n20\n4000\n10\n0\n20\n4000\n0\nENDSEC\n0\nEOF\n';
      const d=DrawingReader.dxf(text),{room}=DrawingProject.roomFrom({name:'DXF',h:2.7,points:d.shapes[0].pts,scale:d.scale});
      return Math.abs(geo(room).floor-12)<1e-5&&Math.abs(room.walls[0].len-3)<1e-5;
    }""")
    page.click('[data-a=settings]')
    page.click('[data-drawing-start]')
    data='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nWALLS\n70\n1\n10\n0\n20\n0\n10\n3000\n20\n0\n10\n3000\n20\n4000\n10\n0\n20\n4000\n0\nLINE\n8\nDOORS\n10\n400\n20\n0\n11\n1200\n21\n0\n0\nENDSEC\n0\nEOF'
    field('file').set_input_files({'name':'unit-mm.dxf','mimeType':'application/dxf','buffer':data.encode()})
    page.wait_for_function("document.querySelector('[data-el=status]').textContent.includes('готова')")
    field('candidate').select_option('0')
    act('select')
    field('room').fill('Проверка единиц')
    field('height').fill('2800')
    page.locator('summary').filter(has_text='Стены и проёмы').click()
    field('opHint').select_option('0')
    field('wall').select_option('1')
    act('pickOp')
    assert field('offset').input_value()=='400' and field('width').input_value()=='800'
    field('opheight').fill('2000')
    act('addOp')
    act('confirmRoom')
    act('create')
    page.wait_for_selector('.drawing-dialog',state='detached')
    assert page.evaluate('Math.abs(geo(P().rooms[0]).floor-12)<1e-5 && P().rooms[0].ops[0].w===.8')
    ocr=page.evaluate("""async()=>{
      const c=document.createElement('canvas');c.width=480;c.height=160;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,480,160);g.fillStyle='black';g.font='bold 76px Arial';g.fillText('4000',40,104);
      return (await DrawingReader.digits(c,new AbortController().signal,()=>{})).map(l=>l.value);
    }""")
    assert '4000' in ocr,ocr
    assert not errors,errors


if __name__=='__main__':
    root=Path(__file__).resolve().parents[2]
    with http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=root)) as server,sync_playwright() as pw:
        threading.Thread(target=server.serve_forever,daemon=True).start()
        browser=(pw.webkit.launch() if os.environ.get('ZAMER_ENGINE')=='webkit' else pw.chromium.launch(executable_path=os.environ.get('ZAMER_CHROMIUM')))
        try:
            page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True)
            page.set_default_timeout(9000)
            run(page,f'http://127.0.0.1:{server.server_port}/sotka/zamer/')
        finally:
            browser.close()
            server.shutdown()
    print('3.0: vector + scanned PDF, JPG/PNG, DXF units, editable floors, engineering CRUD, BLE dispatch, originals, PDF/ZIP round-trip and offline mobile viewport passed.')
