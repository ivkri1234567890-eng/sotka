"""Build the Android update from the checked-in native shell and current web app.

Pass --platform android.jar --tools <Android build-tools directory> --jdk <JDK>
--keystore <release keystore> --output <directory>. apksigner reads the keystore
password from ZAMER_STORE_PASSWORD. Only the APK and its ZIP go into output.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile


HERE = Path(__file__).resolve().parent
WEB = HERE.parent
BASE = HERE / 'ZamerSmeta-2.8.apk'
NAME = 'ZamerSmeta-3.0'


def run(*args):
    subprocess.run([str(a) for a in args], check=True)


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Unexpected web entry point: '+old)
    return text.replace(old, new)


def add_web(apk):
    html = (WEB/'index.html').read_text(encoding='utf-8')
    html = replace_once(html, '<script src="/sotka/gate.js"></script>',
                        '<script>window.zamerFileChooser=true;</script>')
    html = replace_once(html, '<script src="/sotka/hub.js" defer></script>', '')
    apk.writestr('assets/index.html', html.encode('utf-8'))
    # Use the web app's offline inventory. Native access and navigation belong to the shell.
    shell = (WEB/'sw.js').read_text(encoding='utf-8').split('const shell = [', 1)[1].split('];', 1)[0]
    entries = re.findall(r"'([^']+)'", shell)
    ocr = ('worker.min.js', 'tesseract-core-lstm.wasm.js', 'eng.traineddata.gz')
    skip = {'./','index.html','../gate.js','../hub.js',*('ocr/'+n for n in ocr)}
    for name in entries:
        if name not in skip:
            path = WEB / name
            path.resolve().relative_to(WEB)
            apk.write(path, 'assets/'+name)
    for path in [WEB/'PDFjs-LICENSE.txt', WEB/'JSZip-LICENSE.txt', *(WEB/'ocr').glob('*LICENSE*'), WEB/'ocr/NOTICE.txt']:
        apk.write(path, 'assets/'+path.relative_to(WEB).as_posix())
    # A file-origin WebView cannot fetch sibling files from an OCR worker. Load these
    # three exact upstream resources lazily through a script, without file access grants.
    encoded = [json.dumps(base64.b64encode((WEB/'ocr'/n).read_bytes()).decode('ascii')) for n in ocr]
    bundle = """(()=>{
const bytes=s=>Uint8Array.from(atob(s),ch=>ch.charCodeAt(0));
const worker=bytes(%s),core=bytes(%s);
window.zamerOcrAssets={workerPath:URL.createObjectURL(new Blob([core,'\\n;',worker],{type:'application/javascript'})),
// Tesseract appends "/eng.traineddata.gz". A fragment keeps that suffix outside the data payload.
langPath:'data:application/octet-stream;base64,'+%s+'#'};
})();""" % tuple(encoded)
    apk.writestr('assets/ocr/android-bundle.js', bundle)


def build(args, tmp):
    suffix = '.exe' if os.name=='nt' else ''
    java = args.jdk/'bin'/('java'+suffix)
    aapt = args.tools/('aapt2'+suffix)
    classes = tmp/'classes'
    classes.mkdir()
    with ZipFile(BASE) as base:
        for name in base.namelist():
            if name.startswith('res/mipmap-') and name.endswith('/ic_launcher.png'):
                path = tmp / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(base.read(name))
        run(aapt, 'compile', '--dir', tmp/'res', '-o', tmp/'icons.zip')
        run(aapt, 'link', '-I', args.platform, '--manifest', HERE/'AndroidManifest.xml',
            '-o', tmp/'resources.apk', tmp/'icons.zip')
        # Compile-only declaration of the inherited WebView in the shipped native DEX.
        stub = tmp/'UpdatedActivity.java'
        stub.write_text('package ru.zamer.smeta; public class UpdatedActivity extends android.app.Activity'
                        ' { android.webkit.WebView web; }', encoding='utf-8')
        run(args.jdk/'bin'/('javac'+suffix), '--release', '8', '-encoding', 'UTF-8', '-cp', args.platform,
            '-d', classes, stub, HERE/'SurveyActivity.java', HERE/'CaptureProvider.java')
        package = classes/'ru/zamer/smeta'
        new_classes = [p for p in package.glob('*.class') if p.stem!='UpdatedActivity']
        run(java, '-cp', args.tools/'lib/d8.jar', 'com.android.tools.r8.D8', '--min-api', '24',
            '--lib', args.platform, '--classpath', classes, '--output', tmp, *new_classes)
        with ZipFile(tmp/'resources.apk') as res, ZipFile(tmp/'unsigned.apk','w',ZIP_DEFLATED) as out:
            for item in res.infolist():
                out.writestr(item, res.read(item))
            for name in ['classes.dex','classes2.dex','assets/public.key']:
                out.writestr(name, base.read(name))
            out.write(tmp/'classes.dex', 'classes3.dex')
            add_web(out)
    run(args.tools/('zipalign'+suffix), '-P', '16', '4', tmp/'unsigned.apk', tmp/'aligned.apk')
    signer = [java, '-jar', args.tools/'lib/apksigner.jar']
    signed = tmp/(NAME+'.apk')
    run(*signer, 'sign', '--ks', args.keystore, '--ks-pass', 'env:ZAMER_STORE_PASSWORD',
        '--v4-signing-enabled','false', '--out', signed, tmp/'aligned.apk')
    run(*signer, 'verify', '--verbose', signed)
    run(args.tools/('zipalign'+suffix), '-c', '-P', '16', '4', signed)
    args.output.mkdir(exist_ok=True, parents=True)
    archive = tmp/(NAME+'-Android.zip')
    with ZipFile(archive,'w',ZIP_DEFLATED) as out:
        out.write(signed, signed.name)
    for artifact in (signed,archive):
        (args.output/artifact.name).write_bytes(artifact.read_bytes())


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ('platform','tools','jdk','keystore','output'):
        parser.add_argument('--'+arg, type=Path, required=True)
    with tempfile.TemporaryDirectory() as tmp:
        build(parser.parse_args(), Path(tmp))
