#!/bin/bash
# Сборка APK без Gradle: aapt2 + javac + d8 + apksigner. Нужен Android SDK (platforms;android-34, build-tools;34.0.0).
# D8 берётся из свежего r8.jar (maven.google.com, com.android.tools:r8): d8 из build-tools 34 падает на анонимных классах.
set -e
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/opt/android/sdk}; BT=$SDK/build-tools/34.0.0; JAR=$SDK/platforms/android-34/android.jar
KS=${KEYSTORE:-$HOME/.dpga/otchety.jks}; VER=${VER:-1.0}; CODE=${CODE:-1}
rm -rf build && mkdir -p build/assets/www build/obj build/dex build/gen
python3 ../tools/build_offline.py build/assets/www >/dev/null
$BT/aapt2 compile --dir res -o build/res.zip
$BT/aapt2 link -o build/base.apk -I $JAR --manifest AndroidManifest.xml -A build/assets build/res.zip \
  --min-sdk-version 24 --target-sdk-version 34 --version-code $CODE --version-name $VER --java build/gen
javac -nowarn -Xlint:-options -source 1.8 -target 1.8 -bootclasspath $JAR:$BT/core-lambda-stubs.jar -cp $JAR -d build/obj $(find src build/gen -name "*.java")
(cd build/obj && jar cf ../classes.jar .)
java -cp ${R8:-/opt/android/r8.jar} com.android.tools.r8.D8 --min-api 24 --lib $JAR --output build/dex build/classes.jar
(cd build/dex && zip -q ../base.apk classes.dex)
$BT/zipalign -p -f 4 build/base.apk build/aligned.apk
$BT/apksigner sign --ks "$KS" --ks-pass env:KS_PASS --key-pass env:KS_PASS --out "build/Otchety-$VER.apk" build/aligned.apk
$BT/apksigner verify --print-certs "build/Otchety-$VER.apk" | head -3
