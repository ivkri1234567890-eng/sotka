"""Найти элемент по тексту в дампе uiautomator и нажать на него (adb)."""
import re, subprocess, sys, time
def dump():
    subprocess.run(['adb', 'shell', 'uiautomator', 'dump', '/sdcard/u.xml'], capture_output=True)
    return subprocess.run(['adb', 'shell', 'cat', '/sdcard/u.xml'], capture_output=True, text=True).stdout
def find(text, exact=False):
    x = dump()
    for m in re.finditer(r'<node [^>]*>', x):
        n = m.group(0)
        t = (re.search(r' text="([^"]*)"', n) or [None, ''])[1] + '|' + (re.search(r'content-desc="([^"]*)"', n) or [None, ''])[1]
        if (text in t.split('|')) if exact else (text in t):
            b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
            if b:
                x1, y1, x2, y2 = map(int, b.groups())
                if x2 > x1 and y2 > y1: return (x1 + x2) // 2, (y1 + y2) // 2
    return None
if __name__ == '__main__':
    text = sys.argv[1]; tries = int(sys.argv[2]) if len(sys.argv) > 2 else 5; ex = len(sys.argv) > 3 and sys.argv[3] == 'x'
    for i in range(tries):
        p = find(text, ex)
        if p:
            subprocess.run(['adb', 'shell', 'input', 'tap', str(p[0]), str(p[1])]); print('tap', text, p); sys.exit(0)
        time.sleep(3)
    print('NOT FOUND', text); sys.exit(1)
