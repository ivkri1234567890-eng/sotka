"""Run: python -m pip install playwright; python -m playwright install chromium.
Then run python zamer/tests/media_roundtrip.py from any directory.
Set ZAMER_CHROMIUM to use an existing Chromium-compatible executable.
"""
import binascii
import functools
import hashlib
import http.server
import io
import json
import os
import re
import struct
import threading
import zipfile
import zlib
from pathlib import Path

from playwright.sync_api import sync_playwright


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/sotka/gate.js':
            # Give only the isolated test site its own known password.
            source = (Path(self.directory) / 'gate.js').read_bytes()
            digest = hashlib.sha256(b'123456').hexdigest().encode()
            body, changed = re.subn(rb"H='[a-f0-9]{64}'", b"H='" + digest + b"'", source)
            assert changed == 1
            self.send_response(200)
            self.send_header('Content-Type', 'text/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *_args):
        pass

    def translate_path(self, path):
        return super().translate_path(path.removeprefix('/sotka') if path.startswith('/sotka/') else path)


def image_bytes():
    def chunk(kind, value):
        return (struct.pack('>I', len(value)) + kind + value
                + struct.pack('>I', binascii.crc32(kind + value)))

    width = 1700
    header = struct.pack('>IIBBBBB', width, 1, 8, 2, 0, 0, 0)
    row = b'\x00' + b'\xff\x00\x00' * width
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
            + chunk(b'IDAT', zlib.compress(row)) + chunk(b'IEND', b''))


def project(version):
    room = {
        'id': 'room', 'name': 'Кухня', 'h': 2.7,
        'walls': [{'len': length, 't': 90} for length in (4, 3, 4, 3)],
        'ops': [{'type': 'door', 'wall': 1, 'w': 0.8, 'h': 2, 'offset': 1}],
        'points': [{'id': 'socket', 'type': 'socket', 'label': '', 'wall': 2, 'offset': 1.2, 'height': 0.3}],
        'fin': {'floor': 'laminate', 'walls': 'paint', 'ceiling': 'stretch'},
    }
    result = {'id': 'v' + version.replace('.', ''), 'name': version, 'ts': 1, 'rooms': [room],
              'layout': {'room': {'x': 1, 'y': 2, 'rot': 90}}}
    if version != '2.6':
        room['photos'] = [{'id': 'legacy', 'wall': 1, 'ts': 1}]
        result['sched'] = {'start': '2026-11-22', 'rate': 13000, 'days': {'floor': 3}}
    if version == '2.8':
        room['ops'][0].update(hinge='a', swing='in')
        room['hpts'] = {'0': 2.73}
    return result


def upload(page, archive):
    page.locator('#projectZipInput').set_input_files({
        'name': 'project.zip', 'mimeType': 'application/zip', 'buffer': archive
    })


def enter_app(page):
    gate = page.locator('#sotkaGate')
    if gate.count():
        gate.get_by_label('Пароль').fill('123456')
        gate.get_by_role('button', name='Войти').click()
        gate.wait_for(state='detached')


def run(page, url):
    original = image_bytes()
    projects = [project(version) for version in ('2.6', '2.7', '2.8')]
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(url)
    page.evaluate("""data => {
      DB.projects = data.projects;
      DB.settings = data.settings;
      writeDB();
    }""", {'projects': projects, 'settings': {'company': 'Тест', 'variant': 's', 'prices': {}}})
    page.reload()
    enter_app(page)
    for item in projects:
        page.evaluate('p => validateBackup({projects: [p], settings: {}})', item)
    page.evaluate("""async () => {
      const canvas = document.createElement('canvas');
      await PHDB.putAll([{id: 'legacy', data: canvas.toDataURL('image/jpeg')}]);
      if (!(await phData27('legacy')).startsWith('data:image/jpeg')) throw Error('Legacy photo');
      for (const project of DB.projects) {
        const bytes = await ZamerZip.encode(project, DB.settings, id => PHDB.get(id));
        const {backup, records} = await ZamerZip.decode(new Blob([bytes]));
        validateBackup(backup);
        if (JSON.stringify(project) !== JSON.stringify(backup.projects[0])) throw Error('Legacy round-trip');
        if (records.size !== (project.rooms[0].photos || []).length) throw Error('Legacy references');
      }
    }""")
    page.locator('[data-a="open"][data-id="v28"]').click()
    page.locator('[data-a="room"][data-id="room"]').click()
    page.locator('.steps28 [data-k="photo"]').click()
    page.locator('[data-a="phwall"][data-i="2"]').click()
    with page.expect_file_chooser() as picker:
        page.locator('[data-a="phgal"]').click()
    picker.value.set_files({'name': 'original.png', 'mimeType': 'image/png', 'buffer': original})
    page.wait_for_function("RM().photos.length === 2")
    recorded = page.evaluate('RM().photos[1]')
    assert recorded['wall'] == 2
    page.reload()
    enter_app(page)
    assert page.evaluate('DB.projects[2].rooms[0].photos[1]') == recorded
    assert page.evaluate("""async id => {
      const record = await PHDB.get(id);
      const image = new Image();
      image.src = record.data;
      await image.decode();
      return image.naturalWidth;
    }""", recorded['id']) == 1600
    page.locator('[data-a="open"][data-id="v28"]').click()
    page.locator('[data-a="moretabs"]').click()
    page.locator('[data-a="tab"][data-t="info"]').click()
    with page.expect_download() as download:
        page.get_by_role('button', name='Экспорт проекта ZIP').click()
    archive = Path(download.value.path()).read_bytes()
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        manifest = json.loads(zipped.read('manifest.json'))
        snapshot = json.loads(zipped.read('project.json'))
        new_photo = next(photo for photo in manifest['media'] if photo['photo'] == recorded['id'])
        assert zipped.read(new_photo['original']) == original
        assert len(manifest['files']['project.json']['sha256']) == 64
        entries = {name: zipped.read(name) for name in zipped.namelist()}
        for name, info in manifest['files'].items():
            assert hashlib.sha256(entries[name]).hexdigest() == info['sha256']
    field = b'"name": "original.png"'
    assert archive.count(field) == 1
    upload(page, archive.replace(field, b'"name": "original.pNg"'))
    page.wait_for_function("document.getElementById('storage-error')?.textContent.includes('manifest.json')")
    assert page.evaluate('DB.projects.length') == 3
    assert page.evaluate("""async () => {
      const onlyOriginal = {rooms:[{id:'r', photos:[{id:'one'}]}]};
      const blob = new Blob([new Uint8Array([0, 1, 127, 128, 255])], {type:'image/heic'});
      const bytes = await ZamerZip.encode(onlyOriginal, {}, () => ({original:blob, name:'camera.heic'}));
      const {records} = await ZamerZip.decode(new Blob([bytes]));
      const restored = records.values().next().value;
      if(restored.data || restored.name !== 'camera.heic' || restored.original.type !== blob.type ||
          String(new Uint8Array(await restored.original.arrayBuffer())) !== '0,1,127,128,255')return false;
      try { await PHDB.putAll([{id:'transaction-test'}, {id:'legacy'}]); return false; }
      catch { return !(await PHDB.get('transaction-test')) && !!(await PHDB.get('legacy')); }
    }""")
    upload(page, archive)
    page.wait_for_function("DB.projects.length === 4")
    imported = page.evaluate('DB.projects[3]')
    assert imported['id'] != 'v28'
    assert imported['rooms'][0]['photos'][1]['wall'] == 2
    assert imported['rooms'][0]['photos'][1]['id'] != recorded['id']
    assert imported['sched'] == snapshot['projects'][0]['sched']
    assert imported['layout'] == snapshot['projects'][0]['layout']
    for key in ('walls', 'ops', 'points', 'hpts'):
        assert imported['rooms'][0][key] == snapshot['projects'][0]['rooms'][0][key]
    assert page.evaluate("""async ([oldId, newId]) => {
      const [oldPhoto, newPhoto] = await Promise.all([PHDB.get(oldId), PHDB.get(newId)]);
      const oldBytes = new Uint8Array(await oldPhoto.original.arrayBuffer());
      const newBytes = new Uint8Array(await newPhoto.original.arrayBuffer());
      return oldPhoto.data === newPhoto.data && oldBytes.length === newBytes.length
        && oldBytes.every((byte, index) => byte === newBytes[index]);
    }""", [recorded['id'], imported['rooms'][0]['photos'][1]['id']])
    entries['project.json'] = entries['project.json'].replace(b'13000', b'14000')
    damaged = io.BytesIO()
    with zipfile.ZipFile(damaged, 'w') as zipped:
        for name, value in entries.items():
            zipped.writestr(name, value)
    upload(page, damaged.getvalue())
    page.wait_for_function("document.getElementById('storage-error')?.textContent.includes('целостность')")
    assert page.evaluate('DB.projects.length') == 4

    page.evaluate("""async () => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(Error('Service worker not ready')), 8000))
      ]);
    }""")
    context = page.context
    page.close()
    page = context.new_page()
    page.set_default_timeout(15000)
    page.set_default_navigation_timeout(30000)
    page.on('dialog', lambda dialog: dialog.accept())
    page.context.set_offline(True)
    page.goto(url + '?sw=offline')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    enter_app(page)
    assert page.evaluate("typeof ZamerZip.encode") == 'function'
    assert page.evaluate('DB.projects.length') == 4
    assert page.evaluate("async id => (await PHDB.get(id)).original.size", recorded['id']) == len(original)
    assert page.evaluate("""async () => {
      const T = await loadThree27(), group = new T.Group();
      build3d27(T, DB.projects[3], group);
      const plan = plan5d27(DB.projects[3]);
      if (!plan.list.length || plan.rate !== 13000 || plan.total <= 0) return false;
      const until = performance.now() + 4000;
      while (!group.children.some(mesh => mesh.material?.map?.image?.naturalWidth === 1600)) {
        if(performance.now() > until) return false;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return group.children.some(mesh => mesh.geometry.type === 'ShapeGeometry'
        && mesh.geometry.index.count >= 6 && mesh.rotation.x === -Math.PI / 2);
    }""")
    page.locator('[data-a="open"][data-id="v28"]').click()
    page.locator('[data-a="moretabs"]').click()
    page.locator('[data-a="tab"][data-t="info"]').click()
    with page.expect_download() as offline_file:
        page.get_by_role('button', name='Экспорт проекта ZIP').click()
    offline_archive = Path(offline_file.value.path()).read_bytes()
    upload(page, offline_archive)
    page.wait_for_function('DB.projects.length === 5')
    assert page.evaluate("""async () => {
      const p = DB.projects.at(-1), r = p.rooms[0], id = r.photos[1].id;
      removeWall23(r, 0);
      return r.photos[0].wall === null && r.photos[1].wall === 1 && !!(await PHDB.get(id)).original;
    }""")
    page.reload()
    enter_app(page)
    page.evaluate("""() => {
      Storage.prototype.setItem = () => { throw new DOMException('Quota test', 'QuotaExceededError'); };
    }""")
    duplicate = page.locator(f'[data-a="open"][data-id="{imported["id"]}"]')
    assert duplicate.is_visible(), page.evaluate("""() => ({
      gate: !!document.querySelector('#sotkaGate'), locked:document.documentElement.className,
      buttons:[...document.querySelectorAll('[data-a="open"]')].map(b=>[b.dataset.id,b.offsetWidth,b.offsetHeight]),
      view:R.view, text:document.body.innerText.slice(0,240)
    })""")
    duplicate.click()
    page.locator('[data-a="room"][data-id="room"]').click()
    page.locator('.steps28 [data-k="photo"]').click()
    count_photos = """async () => {
      const db = await PHDB.open(), request = db.transaction('ph').objectStore('ph').count();
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }"""
    before = page.evaluate(count_photos)
    with page.expect_file_chooser() as picker:
        page.locator('[data-a="phgal"]').click()
    picker.value.set_files({'name': 'failed.png', 'mimeType': 'image/png', 'buffer': original})
    page.wait_for_function("document.getElementById('storage-error')?.textContent.includes('Quota test')")
    assert page.evaluate('RM().photos.length') == 2
    page.wait_for_function('pendingPhotoWrites.size === 0')
    assert page.evaluate(count_photos) == before


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2]
    handler = functools.partial(QuietHandler, directory=root)
    with http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler) as server, sync_playwright() as playwright:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        browser = playwright.chromium.launch(executable_path=os.environ.get('ZAMER_CHROMIUM'))
        context = browser.new_context(accept_downloads=True)
        context.set_default_timeout(15000)
        context.set_default_navigation_timeout(30000)
        errors = []
        context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
        page = context.new_page()
        try:
            run(page, f'http://127.0.0.1:{server.server_port}/sotka/zamer/')
            assert not errors, errors
        finally:
            browser.close()
            server.shutdown()
    print('Media round-trip, legacy data, checksum, transaction rollback, offline ZIP, texture and 5D passed')
