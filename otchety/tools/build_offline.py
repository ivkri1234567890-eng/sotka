"""Собирает закрытую офлайн-версию центра отчётов одним файлом (и ассеты для Android).
Запуск: python3 tools/build_offline.py  (из папки otchety)"""
import re, sys, hashlib, pathlib, zipfile, datetime
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'index.html').read_text(encoding='utf-8')
CSP = ("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; "
       "font-src data:; connect-src 'none'; worker-src blob:; frame-src 'none'; form-action 'none'; base-uri 'none'")

def inline(m):
    name = m.group(1).split('?')[0]
    js = (root / name).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return '<script>/* ' + name + ' */\n' + js + '\n</script>'

def build(android=False):
    h = src
    h = re.sub(r'<script src="([^"]+)"></script>', inline, h)
    h = re.sub(r"<script>if\('serviceWorker'[\s\S]*?</script>", '', h)
    h = re.sub(r'<button id="skladMode"[^>]*>.*?</button>', '', h)
    flag = '<script>window.CLOSED=true;' + ('window.ANDROID_APP=true;' if android else '') + '</script>'
    h = h.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP + '">' + flag, 1)
    h = h.replace('<title>Центр отчётов ДПГА</title>', '<title>Центр отчётов ДПГА — закрытый контур</title>')
    assert '<script src=' not in h
    return h

out = root / 'offline'; out.mkdir(exist_ok=True)
html = build()
(out / 'Отчёты.html').write_text(html, encoding='utf-8')
sha = hashlib.sha256(html.encode('utf-8')).hexdigest()
memo = (root / 'tools' / 'Памятка_для_службы_безопасности.txt').read_text(encoding='utf-8').replace('{SHA}', sha).replace('{DATE}', datetime.date.today().strftime('%d.%m.%Y'))
(out / 'Памятка для службы безопасности.txt').write_text(memo, encoding='utf-8')
with zipfile.ZipFile(out / 'Отчёты-офлайн.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('Отчёты.html', html)
    z.writestr('Памятка для службы безопасности.txt', memo)
    z.writestr('SHA256.txt', sha + '  Отчёты.html\n')
if len(sys.argv) > 1:
    pathlib.Path(sys.argv[1]).mkdir(parents=True, exist_ok=True)
    (pathlib.Path(sys.argv[1]) / 'index.html').write_text(build(android=True), encoding='utf-8')
print(len(html), sha)
