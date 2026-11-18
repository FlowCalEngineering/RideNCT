// Service worker RideNCT : l'appli web s'ouvre sans réseau. Réseau d'abord (toujours à jour), cache en secours.
// À chaque mise en ligne d'une nouvelle version de l'appli : changer VERSION (les anciens fichiers en cache sont supprimés).
const VERSION = 'ridenct-2026-11-18.11';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', (e) => {
    const r = e.request, u = new URL(r.url);
    if (r.method !== 'GET' || u.origin !== location.origin) return;   // Supabase, cartes, serveurs temps réel : jamais interceptés
    e.respondWith((async () => {
        const c = await caches.open(VERSION);
        try {
            const net = await Promise.race([fetch(r.mode === 'navigate' ? r.url : r, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), 6000))]);
            if (net && net.ok) c.put(r, net.clone());
            return net;
        } catch (err) {
            const hit = await c.match(r, { ignoreSearch: r.mode === 'navigate' });
            if (hit) return hit;
            if (r.mode === 'navigate') { const idx = await c.match('index.html') || await c.match('./'); if (idx) return idx; }
            throw err;
        }
    })());
});
