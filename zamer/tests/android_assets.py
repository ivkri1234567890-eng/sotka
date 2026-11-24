"""Run the acceptance suite against the assets actually packaged in a signed APK."""
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile
from playwright.sync_api import sync_playwright
from review_3 import run


if __name__ == '__main__':
    with TemporaryDirectory() as tmp, ZipFile(sys.argv[1]) as apk, sync_playwright() as pw:
        for name in apk.namelist():
            if name.startswith('assets/'):
                (Path(tmp)/name).resolve().relative_to(Path(tmp).resolve())
                apk.extract(name, tmp)
        browser = pw.chromium.launch(executable_path=os.environ.get('ZAMER_CHROMIUM'))
        try:
            context = browser.new_context(viewport={'width':393, 'height':830}, is_mobile=True,
                                          has_touch=True, accept_downloads=True, offline=True)
            # Model native storage and the binary save bridge. The phone owns the final file picker.
            context.add_init_script("""window.Native={
              load:()=>localStorage.getItem('zs:db'),
              save:s=>{localStorage.setItem('zs:db',s);return true}
            };
            window.Photo={pick(){throw Error('Expected the Android file chooser')}};
            window.Files={saveFile:(name,mime,b64)=>{
              const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
              const a=document.createElement('a');
              a.href=URL.createObjectURL(new Blob([bytes],{type:mime}));a.download=name;a.click();
            }};""")
            page = context.new_page()
            page.set_default_timeout(16000)
            run(page, (Path(tmp)/'assets/index.html').as_uri())
        finally:
            browser.close()
    print('Packaged Android assets passed the offline acceptance suite.')
