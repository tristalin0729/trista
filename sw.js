const CACHE = 'zhinangtuan-v2';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.json'];
// firebase-config.js 故意不放進離線快取：它必須永遠拿到最新內容，
// 不然改了設定、換了金鑰，使用者還會一直用到舊的快取版本。

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
  );
});

// 資料一律走網路（要即時同步），只有 app 本身的檔案（HTML/CSS/JS/manifest）離線也能打開。
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Firebase 等外部請求不攔截

  if (url.pathname.endsWith('/firebase-config.js')) {
    // 一律先試網路拿最新設定，只有離線時才退回快取。
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
