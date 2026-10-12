#!/usr/bin/env bash
# يجهّز مجلد www لنسخة الويب (يُستخدم في النشر على Firebase Hosting، ويمكن تشغيله محلياً بعد npm install)
set -e
rm -rf www && mkdir -p www/web-icons
cp index.html catalog.js firebase-config.js manifest.webmanifest sw.js privacy.html www/
cp web-icons/*.png www/web-icons/
cp node_modules/firebase/firebase-app-compat.js node_modules/firebase/firebase-auth-compat.js node_modules/firebase/firebase-firestore-compat.js node_modules/firebase/firebase-messaging-compat.js www/
echo "www جاهز"
