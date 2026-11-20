# Форма — дизайнерская мебель

Веб-версия и Android-приложение для проектирования прикроватных тумб и шкафов: каталог, настройка, 3D-модель, чертежи, деталировка, кромление, присадка, раскрой, смета, инструкция, экспорт PDF/CSV/JSON/DXF/ZIP.
Работает без интернета, без ИИ и без сервера.

## Структура
- `src/core` — расчётное ядро без интерфейса (общий код для веба, Android и тестов):
  `schema.ts` (ProductConfig и ManufacturingModel, zod-схемы, версии), `engine.ts` (геометрия, детали, соединения, присадка, проверки, шаги сборки),
  `materials.ts`, `hardware.ts` (HardwareProfile со статусами проверки), `cutting.ts` (раскрой MaxRects), `estimate.ts` (смета), `catalog.ts` (12 моделей), `migrate.ts` (открытие файлов), `request.ts` (разбор описания без ИИ).
- `src/docs` — чертежи SVG, PDF (jsPDF + svg2pdf, шрифт Roboto внутри), CSV, DXF, ZIP.
- `src/ui` — интерфейс React, 3D-сцена three.js.
- `src/platform` — хранение (IndexedDB), файлы (Android: системный выбор папки, «Поделиться»).
- `android/` — проект Capacitor 6; `android/app/src/main/java/ru/sotka/forma/FormaFilesPlugin.java` — сохранение файла в выбранную папку (SAF).
- `tests/` — тесты ядра (vitest) и сценарии браузера (Playwright).

## Сборка
Нужно: Node 20+, JDK 17 или 21, Android SDK (platform 34, build-tools 34).
```
npm ci
npx vitest run                     # тесты ядра
npx vite build --mode web          # веб-версия → dist-web/ (для /sotka/forma/)
npx vite build                     # сборка для Android → dist/
npx cap sync android
cd android && ./gradlew assembleDebug   # → android/app/build/outputs/apk/debug/app-debug.apk
```
Версия: `android/app/build.gradle` (versionCode / versionName) и `APP_VERSION` в `src/ui/App.tsx`.

## Подпись
`assembleDebug` подписывает отладочным ключом сборочной машины — годится только для первого тестирования.
Для распространения обновлений нужен постоянный ключ: создайте его один раз (`keytool -genkeypair -v -keystore forma-release.jks -alias forma -keyalg RSA -keysize 2048 -validity 10000`),
храните вне репозитория и подписывайте `./gradlew assembleRelease` + `apksigner sign --ks forma-release.jks ...`. APK, подписанный другим ключом, не установится поверх предыдущего.
Закрытые ключи в репозиторий не добавлять.
