const CACHE = "bis-cache-v2";
const ASSETS = ["./", "./index.html", "./app.js", "./questions.json", "./manifest.json"];

self.addEventListener("install", (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener("fetch", (e)=>{
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
