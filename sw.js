/* Service worker: يجعل التطبيق يعمل كصفحة ويب قابلة للتثبيت، ويفتح هيكله بدون إنترنت.
   البيانات (Firestore) لا تُخزَّن هنا. غيّر VER عند كل نشر لتحديث الملفات المخزّنة. */
const VER = 'shahn-v2.0.0';
const SHELL = ['./', 'index.html', 'catalog.js', 'firebase-config.js', 'manifest.webmanifest',
  'firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js',
  'web-icons/icon-192.png', 'web-icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VER).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; /* Firebase وغيره: مباشرة من الشبكة */
  /* الشبكة أولاً (لتصل التحديثات) ثم النسخة المخزّنة عند انقطاع الإنترنت */
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(VER).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
