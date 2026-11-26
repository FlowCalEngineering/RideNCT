// Service worker RideNCT : l'appli web s'ouvre sans réseau. Réseau d'abord (toujours à jour), cache en secours.
// À chaque mise en ligne d'une nouvelle version de l'appli : changer VERSION (les anciens fichiers en cache sont supprimés).
const VERSION = 'ridenct-2026-11-26.95';
const VOIX = 'ridenct-voix-1';   // clips de voix du guidage : gardés d'une version à l'autre (changer le numéro si les clips changent)
const CDN = 'ridenct-cdn';   // moteur de la voix naturelle (code et WASM) : gardé pour fonctionner sans réseau
// Installation : pré-télécharge tous les fichiers de la version (liste dans version.json) en annonçant la progression à l'écran de démarrage, puis s'active
let bc = null; try { bc = new BroadcastChannel('ridenct-sw'); } catch (_) {}
const say = (m) => { try { bc && bc.postMessage(m); } catch (_) {} };
self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        try {
            const m = await (await fetch('version.json', { cache: 'no-store' })).json(), list = m.files || [], c = await caches.open(VERSION);
            let done = 0; say({ t: 'start', v: m.v, notes: m.notes || '', total: list.length });
            const q = list.slice(), work = async () => { while (q.length) { const f = q.shift(); try { const r = await fetch(f, { cache: 'reload' }); if (r && r.ok) await c.put(f, r); } catch (_) {} say({ t: 'prog', done: ++done, total: list.length }); } };
            await Promise.race([Promise.all([work(), work(), work(), work(), work(), work()]), new Promise((res) => setTimeout(res, 40000))]);
            say({ t: 'ready', v: m.v });
        } catch (_) { say({ t: 'ready', v: '' }); }
        self.skipWaiting();
    })());
});
self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) if (k !== VERSION && k !== CDN && k !== VOIX) await caches.delete(k);
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', (e) => {
    const r = e.request, u = new URL(r.url);
    // code / WASM du moteur de voix (jamais le modèle de voix : il est gardé à part par le navigateur)
    if (r.method === 'GET' && u.origin !== location.origin && (/(^|\.)(jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)$/.test(u.hostname) || (u.hostname === 'huggingface.co' && /\.(wasm|js|mjs|data)$/.test(u.pathname)))) {
        e.respondWith((async () => { const c = await caches.open(CDN), hit = await c.match(r); if (hit) return hit; const net = await fetch(r); if (net && net.ok) c.put(r, net.clone()); return net; })());
        return;
    }
    if (r.method !== 'GET' || u.origin !== location.origin) return;   // Supabase, cartes, serveurs temps réel : jamais interceptés
    if (/\/voix\/\d+\.m4a$/.test(u.pathname)) {   // clips : cache d'abord (jamais de réseau en roulant une fois chargés)
        e.respondWith((async () => { const c = await caches.open(VOIX), hit = await c.match(r); if (hit) return hit; const net = await fetch(r); if (net && net.ok) c.put(r, net.clone()); return net; })());
        return;
    }
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
