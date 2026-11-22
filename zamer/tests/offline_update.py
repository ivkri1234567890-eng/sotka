"""Run alongside media_roundtrip.py. Pass the e90742f distribution ZIP as the only argument."""
import functools
import http.server
import os
import shutil
import sys
import tempfile
import threading
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

from media_roundtrip import QuietHandler, enter_app, project


class UpdateHandler(QuietHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # Chromium cancels outstanding requests when an install fails.
            pass

    def do_GET(self):
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        if self.server.interrupt_install and self.path.split('?')[0].endswith('/media-zip.js'):
            self.send_error(503)
            return
        super().do_GET()


def run(pw, server, root, profile):
    url = f'http://127.0.0.1:{server.server_port}/sotka/zamer/'
    options = dict(executable_path=os.environ.get('ZAMER_CHROMIUM'), service_workers='allow')
    context = pw.chromium.launch_persistent_context(profile, **options)
    try:
        page = context.pages[0]
        page.goto(url)
        enter_app(page)
        page.evaluate("""async p => {
          DB.projects = [p];
          writeDB();
          await PHDB.putAll([{id:'legacy', data:document.createElement('canvas').toDataURL('image/jpeg')}]);
          await caches.open('unrelated-app');
          await navigator.serviceWorker.register('sw.js');
          await navigator.serviceWorker.ready;
        }""", project('2.7'))
        page.reload()
        page.wait_for_function('navigator.serviceWorker.controller')
        old_project = page.evaluate('localStorage.getItem("zs:db")')
        old_photo = page.evaluate('phData27("legacy")')
        assert old_photo.startswith('data:image/jpeg;')
        source = Path(__file__).resolve().parents[1]
        for name in ('index.html', 'sw.js', 'media-zip.js'):
            shutil.copyfile(source / name, root / 'zamer' / name)
        server.interrupt_install = True
        page.evaluate("""async () => {
          const reg = await navigator.serviceWorker.ready;
          const failed = new Promise(resolve => reg.addEventListener('updatefound', () => {
            const worker = reg.installing;
            worker.onstatechange = () => { if(worker.state === 'redundant') resolve(); };
          }, {once:true}));
          await reg.update();
          await Promise.race([failed, new Promise((_, reject) =>
            setTimeout(() => reject(Error('No failed install observed')), 12000))]);
        }""")
        assert page.evaluate('caches.has("zamer-media-export-v1")')
        assert page.evaluate('localStorage.getItem("zs:db")') == old_project
        server.interrupt_install = False
        page.evaluate("""async () => {
          const reg = await navigator.serviceWorker.ready;
          const installed = new Promise((resolve, reject) => reg.addEventListener('updatefound', () => {
            const next = reg.installing;
            next.addEventListener('statechange', () => {
              if(next.state === 'installed') resolve();
              if(next.state === 'redundant') reject(Error('Second install failed'));
            });
          }, {once:true}));
          await reg.update();
          await Promise.race([installed, new Promise((_, reject) =>
            setTimeout(() => reject(Error('No installed update observed')), 12000))]);
          if(!reg.waiting) throw Error('New release did not wait for old client');
        }""")
        assert page.evaluate('caches.has("zamer-media-export-v1")')
        # Observe the specific waiting worker from a page outside its scope.
        # Opening another in-scope page immediately can keep the previous worker alive.
        (root / 'observer.html').write_text('<title>Update observer</title>', encoding='utf-8')
        observer = context.new_page()
        observer.goto(f'http://127.0.0.1:{server.server_port}/sotka/observer.html')
        observer.evaluate("""async url => {
          const reg = await navigator.serviceWorker.getRegistration(url);
          const next = reg.waiting;
          if(!next) throw Error('Missing waiting update');
          window.activated = new Promise((resolve, reject) => next.addEventListener('statechange', () => {
            if(next.state === 'activated') resolve(true);
            if(next.state === 'redundant') reject(Error('Update discarded'));
          }));
        }""", url)
        page.close()
        observer.evaluate("""() => Promise.race([window.activated, new Promise((_, reject) =>
          setTimeout(() => reject(Error('Update did not activate')), 15000))])""")
        page = context.new_page()
        page.goto(url)
        enter_app(page)
        assert page.evaluate("typeof pendingPhotoWrites === 'object'")
        assert not page.evaluate('caches.has("zamer-media-export-v1")')
        context.set_offline(True)
        page.reload()
        enter_app(page)
        assert page.evaluate('phData27("legacy")') == old_photo
        page.close()
    finally:
        context.close()

    # Restart the browser process on the same profile with the network disabled before navigation.
    with pw.chromium.launch_persistent_context(profile, offline=True, **options) as offline:
        page = offline.pages[0]
        page.goto(url)
        enter_app(page)
        assert page.evaluate('localStorage.getItem("zs:db")') == old_project
        assert page.evaluate('phData27("legacy")') == old_photo
        assert page.evaluate('caches.has("unrelated-app")')
        assert page.evaluate('async () => !!(await loadThree27()).Scene')
        assert page.evaluate("""async () => {
          const b = await ZamerZip.encode(DB.projects[0], DB.settings, id=>PHDB.get(id));
          return (await ZamerZip.decode(new Blob([b]))).records.size === 1;
        }""")


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / 'sotka'
        with zipfile.ZipFile(sys.argv[1]) as previous:
            # Copy only the fixed application paths used by this fixture.
            for name in ('gate.js', 'hub.js', *(f'zamer/{n}' for n in (
                    'index.html', 'sw.js', 'media-zip.js', 'jszip.min.js', 'three.min.js',
                    'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'))):
                out = root / name
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(previous.read('sotka/' + name))
        handler = functools.partial(UpdateHandler, directory=root)
        with http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler) as server, sync_playwright() as pw:
            server.interrupt_install = False
            threading.Thread(target=server.serve_forever, daemon=True).start()
            try:
                run(pw, server, root, Path(tmp) / 'profile')
            finally:
                server.shutdown()
    print('Failed install, waiting update, offline restart, legacy JPEG and isolated caches passed')
