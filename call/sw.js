// Calls app service worker — scope /task-board/call/ only. Bump C to drop old caches.
const C='calls-2';
const SHELL=['./','index.html','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(C).then(c=>Promise.all(SHELL.map(u=>fetch(u,{cache:'no-store'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{}))))); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin) return;   // Airtable goes straight to network
  const fresh=e.request.mode==='navigate'||u.pathname.endsWith('.html')||u.pathname.endsWith('/');
  e.respondWith(fetch(e.request,fresh?{cache:'no-store'}:{}).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(C).then(c=>c.put(fresh?'index.html':e.request,cp)); } return r; })
    .catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
