// Tasks (mobile) service worker — scope is /task-board/m/ only; never touches the desktop dashboard.
// Cache name is re-stamped by deploy.sh on every deploy → old caches are dropped automatically.
// HTML / version.json / sw: always straight from the network (no HTTP cache); cached copy only when offline.
const C='tasks-m-1791393288';
const SHELL=['./','index.html','manifest.webmanifest','manifest-am.webmanifest','manifest-pm.webmanifest','icon-180.png','icon-192.png','icon-512.png','icon-am-180.png','icon-pm-180.png'];
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(C).then(c=>Promise.all(SHELL.map(u=>fetch(u,{cache:'no-store'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{}))))); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET' || u.origin!==location.origin) return;   // Airtable etc. go straight to network
  const fresh=e.request.mode==='navigate'||/\/(index\.html|version\.json|sw\.js)?$/.test(u.pathname)||u.pathname.endsWith('.html');
  e.respondWith(fetch(e.request,fresh?{cache:'no-store'}:{}).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(C).then(c=>c.put(fresh?'index.html':e.request,cp)); } return r; })
    .catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))));
});
