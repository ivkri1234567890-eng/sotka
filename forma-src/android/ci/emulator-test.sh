#!/bin/bash
# Проверка APK в эмуляторе Android: установка, запуск без интернета, PIN, каталог, редактор, «Назад», сохранение после перезапуска, документы, сохранение PDF через системный диалог.
set -x
cd "$(dirname "$0")/.."
OUT=ci-out; mkdir -p $OUT
shot(){ adb exec-out screencap -p > $OUT/$1.png; }
T(){ python3 ci/tap.py "$@" | tee -a $OUT/log.txt; }
echo "== $(date)" > $OUT/log.txt
adb install -r app/build/outputs/apk/debug/app-debug.apk | tee -a $OUT/log.txt
adb shell dumpsys package ru.sotka.forma | grep -E "versionName|versionCode|permission" | tee -a $OUT/log.txt
adb shell svc wifi disable; adb shell svc data disable; adb shell cmd connectivity airplane-mode enable || true
adb shell ping -c1 -W2 8.8.8.8 > /dev/null 2>&1 && echo "NETWORK: online" | tee -a $OUT/log.txt || echo "NETWORK: offline" | tee -a $OUT/log.txt
adb logcat -c
adb shell am start -W -n ru.sotka.forma/.MainActivity | tee -a $OUT/log.txt
sleep 20; shot 01-pin
adb shell input text 000000; adb shell input keyevent 66; sleep 3; shot 01b-wrong-pin
adb shell input text 171291; adb shell input keyevent 66; sleep 15; shot 02-home
T "Парящая" 6; sleep 15; shot 03-editor
T "Модель крупно"; sleep 3; T "Ящики"; sleep 4; shot 04-drawers; T "Размеры" 2; sleep 2
T "Настройки"; sleep 2; T "Стиль" 2 x; sleep 2; T "Скандинавский" 3; sleep 4; shot 05-settings
adb shell input keyevent 4; sleep 3; shot 06-back-dialog
T "Сохранить" 3 x; sleep 4; shot 07-home-saved
adb shell am force-stop ru.sotka.forma; sleep 2; adb shell am start -W -n ru.sotka.forma/.MainActivity; sleep 15
adb shell input text 171291; adb shell input keyevent 66; sleep 12; shot 08-after-restart
for i in 1 2 3 4 5 6 7 8; do adb shell input swipe 540 1900 540 500 250; sleep 1; done; shot 08b-projects
python3 - <<'PY' | tee -a ci-out/log.txt
import sys; sys.path.insert(0,'ci'); import tap
print('PROJECT AFTER RESTART:', 'found' if tap.find('Открыть') else 'MISSING')
PY
T "Открыть" 3 x; sleep 12; T "Документы" 3 x; sleep 12; shot 09-docs
T "PDF" 3; sleep 40; shot 10-saf-dialog
T "SAVE" 3 || T "Сохранить" 3 || T "СОХРАНИТЬ" 3; sleep 6; shot 11-after-save
adb shell ls -la /sdcard/Download/ | tee -a $OUT/log.txt
T "Поделиться PDF" 3; sleep 40; shot 12-share
adb shell input keyevent 4; sleep 2
adb shell input keyevent 4; sleep 3; adb shell input keyevent 4; sleep 3; shot 13-back-home
# новые категории: кровать и трюмо
for i in 1 2 3 4 5 6 7 8; do adb shell input swipe 540 600 540 1900 250; sleep 1; done
T "Кровати" 3; sleep 10; shot 14-beds
T "Норд" 6; sleep 15; shot 15-bed-editor
adb shell input keyevent 4; sleep 3; T "Не сохранять" 3 x; sleep 5
T "Трюмо" 3; sleep 10; shot 16-dressers
T "Бель" 6; sleep 15; shot 17-dresser-editor
adb logcat -d | grep -iE "Capacitor/Console|chromium|AndroidRuntime|FATAL" | tail -200 > $OUT/logcat.txt
echo DONE | tee -a $OUT/log.txt
