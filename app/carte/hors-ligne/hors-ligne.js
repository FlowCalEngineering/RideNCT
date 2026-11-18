// Carte hors ligne : téléchargement de zones (rayon) ou de corridors autour d'un itinéraire, stockés dans IndexedDB.
// Principe : dès qu'au moins une zone existe (ou que le téléphone est hors ligne), les requêtes de la carte (style, tuiles,
// sprites, polices) passent par un protocole « offline:// » qui sert d'abord le cache local, puis le réseau.
// Sans aucune zone téléchargée, la carte fonctionne exactement comme avant (aucun changement sur le chemin réseau).
const OfflineMaps = (() => {
    const DB_NAME = 'moto_offline_maps', FLAG = 'moto_offline_n';
    const MAX_TILES = 20000;         // plafond par zone (≈ 400 Mo) : le zoom maximal baisse automatiquement au-delà
    // Précision choisie par l'utilisateur = zoom maximal téléchargé (14 = chaque rue, 11 = routes principales seulement)
    const QUAL = { max: 14, std: 13, lite: 11 };
    const getQ = () => { try { const q = localStorage.getItem('moto_offline_q'); return QUAL[q] ? q : 'max'; } catch (e) { return 'max'; } };
    const setQ = (q) => { if (QUAL[q]) try { localStorage.setItem('moto_offline_q', q); } catch (e) {} };
    const EST_KB = 20;               // poids moyen estimé d'une tuile vectorielle
    const ABS_MAXZ = 14;

    // ---------- IndexedDB ----------
    let dbp = null;
    const openDb = () => dbp || (dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('res'); d.createObjectStore('zones', { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const tx = async (store, mode, fn) => {
        const d = await openDb();
        return new Promise((res, rej) => {
            const t = d.transaction(store, mode); let req;
            try { req = fn(t.objectStore(store)); } catch (e) { rej(e); return; }
            t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
            t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
        });
    };
    const dbGet = (k) => tx('res', 'readonly', s => s.get(k));
    const dbPut = (k, v) => tx('res', 'readwrite', s => s.put(v, k));
    const zonesAll = () => tx('zones', 'readonly', s => s.getAll());
    const keyOf = (url) => { try { const u = new URL(url); return u.pathname + u.search; } catch (e) { return url; } };
    const syncFlag = async () => { try { const z = await zonesAll(); localStorage.setItem(FLAG, String(z.length)); } catch (e) {} };
    // ---------- État du réseau : détecte la perte de connexion même quand le téléphone « croit » être en ligne ----------
    // navigator.onLine ne voit que le mode avion / Wi-Fi coupé. En 4G sans signal il reste vrai : on surveille donc aussi les échecs
    // de chargement de la carte et on interroge un point de test léger. Après 3 échecs de suite → bascule automatique sur les cartes téléchargées.
    let probeDown = false, fails = 0, probing = false, lastProbe = 0; const listeners = [];
    const isDown = () => navigator.onLine === false || probeDown;
    const fire = () => { const d = isDown(); listeners.forEach(f => { try { f(d); } catch (e) {} }); };
    const setProbe = (v) => { const before = isDown(); probeDown = v; if (isDown() !== before) fire(); };
    async function probe() {
        if (probing) return; probing = true; lastProbe = Date.now();
        try {
            let up = false;
            for (const u of ['https://www.gstatic.com/generate_204', 'https://cp.cloudflare.com/generate_204']) {
                const ac = new AbortController(), to = setTimeout(() => ac.abort(), 4000);
                try { await fetch(u, { mode: 'no-cors', cache: 'no-store', signal: ac.signal }); up = true; } catch (e) {} finally { clearTimeout(to); }
                if (up) break;
            }
            if (up) fails = 0; setProbe(!up);
        } finally { probing = false; }
    }
    const noteFail = () => { if (++fails >= 3 && !probeDown) probe(); };
    const noteOk = () => { fails = 0; if (probeDown) setProbe(false); };
    window.addEventListener('offline', fire);
    window.addEventListener('online', () => { fails = 0; probeDown = false; fire(); setTimeout(probe, 1500); });
    // surveillance légère : seulement si des cartes sont téléchargées (sinon il n'y a rien vers quoi basculer) ou si on est déjà hors connexion
    setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine !== false && (probeDown || Number(localStorage.getItem(FLAG)) > 0) && Date.now() - lastProbe > (probeDown ? 7000 : 25000)) probe(); }, 5000);
    const active = () => { try { return Number(localStorage.getItem(FLAG)) > 0 || isDown(); } catch (e) { return false; } };

    // ---------- Protocole offline:// (utilisé par MapLibre via transformRequest) ----------
    const fetchBuf = async (url, ms) => {
        if (navigator.onLine === false) throw new Error('hors ligne');
        const ac = new AbortController(), to = setTimeout(() => ac.abort(), probeDown ? Math.min(ms || 10000, 3000) : (ms || 10000));
        try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.arrayBuffer(); noteOk(); return b; }
        catch (e) { if (!/^HTTP /.test(String(e && e.message))) noteFail(); throw e; }
        finally { clearTimeout(to); }
    };
    const cached = async (key) => { try { const r = await dbGet(key); return r ? r.buf : null; } catch (e) { return null; } };
    async function handle(params) {
        const m = /^offline:\/\/([A-Za-z]+)\/(.*)$/.exec(params.url); if (!m) throw new Error('url invalide');
        const type = m[1], real = decodeURIComponent(m[2]), key = keyOf(real);
        let buf = null;
        if (type === 'Style' || type === 'Source') {                       // copie locale tout de suite (démarrage rapide même avec un réseau lent), mise à jour en arrière-plan
            buf = await cached(key);
            if (buf) { if (!isDown()) fetchBuf(real, 8000).then(b => dbPut(key, { buf: b, kind: 'static' })).catch(() => {}); }
            else { try { buf = await fetchBuf(real, 8000); dbPut(key, { buf, kind: 'static' }).catch(() => {}); } catch (e) { buf = null; } }
        } else {                                                            // tuiles / polices / sprites : local d'abord
            buf = await cached(key);
            if (!buf) { buf = await fetchBuf(real, 10000); if (type !== 'Tile') dbPut(key, { buf, kind: 'static' }).catch(() => {}); }
        }
        if (!buf) throw new Error('indisponible hors ligne');
        return params.type === 'json' ? JSON.parse(new TextDecoder().decode(buf)) : buf;
    }
    const loadFn = (params, callback) => {
        let off = false;
        handle(params).then(d => { if (!off) callback(null, d); }).catch(e => { if (!off) callback(new Error(String((e && e.message) || e))); });
        return { cancel() { off = true; } };
    };
    try { if (typeof maplibregl !== 'undefined' && maplibregl.addProtocol) maplibregl.addProtocol('offline', loadFn); } catch (e) { console.warn('offline protocol', e); }
    const transform = (url, type) => {
        if (!active() || !/^https?:/.test(url) || typeof maplibregl === 'undefined' || !maplibregl.addProtocol) return undefined;
        return { url: `offline://${type || 'Unknown'}/${encodeURIComponent(url)}` };
    };

    // ---------- Calcul des tuiles ----------
    const lon2x = (lon, z) => (lon + 180) / 360 * (1 << z);
    const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z); };
    const clampT = (v, z) => Math.max(0, Math.min((1 << z) - 1, v));
    const kmPerDegLng = (lat) => 111.32 * Math.cos(lat * Math.PI / 180);
    // Ensemble de tuiles d'une forme : { type:'circle', center:[lng,lat], km } ou { type:'line', coords, km }
    function tileSet(shape, z) {
        const set = new Set(), n = 1 << z;
        if (shape.type === 'circle') {
            const [lng, lat] = shape.center, dLat = shape.km / 111.32, dLng = shape.km / Math.max(0.01, kmPerDegLng(lat));
            const x0 = clampT(Math.floor(lon2x(lng - dLng, z)), z), x1 = clampT(Math.floor(lon2x(lng + dLng, z)), z);
            const y0 = clampT(Math.floor(lat2y(Math.min(85, lat + dLat), z)), z), y1 = clampT(Math.floor(lat2y(Math.max(-85, lat - dLat), z)), z);
            for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
                // distance du centre au rectangle de la tuile (approx. équirectangulaire)
                const west = x / n * 360 - 180, east = (x + 1) / n * 360 - 180;
                const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
                const cx = Math.max(west, Math.min(lng, east)), cy = Math.max(south, Math.min(lat, north));
                const dx = (cx - lng) * kmPerDegLng(lat), dy = (cy - lat) * 111.32;
                if (dx * dx + dy * dy <= shape.km * shape.km) set.add(z + '/' + x + '/' + y);
            }
            return set;
        }
        const pts = shape.coords; if (!pts || !pts.length) return set;
        const tileKm = 40075 * Math.cos((pts[0][1]) * Math.PI / 180) / n, step = Math.max(0.2, Math.min(tileKm / 2, shape.km));
        const addAround = (lng, lat) => {
            const dLat = shape.km / 111.32, dLng = shape.km / Math.max(0.01, kmPerDegLng(lat));
            const x0 = clampT(Math.floor(lon2x(lng - dLng, z)), z), x1 = clampT(Math.floor(lon2x(lng + dLng, z)), z);
            const y0 = clampT(Math.floor(lat2y(Math.min(85, lat + dLat), z)), z), y1 = clampT(Math.floor(lat2y(Math.max(-85, lat - dLat), z)), z);
            for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set.add(z + '/' + x + '/' + y);
        };
        addAround(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i], lat = (a[1] + b[1]) / 2;
            const dist = Math.hypot((b[0] - a[0]) * kmPerDegLng(lat), (b[1] - a[1]) * 111.32), k = Math.max(1, Math.ceil(dist / step));
            for (let j = 1; j <= k; j++) addAround(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k);
        }
        return set;
    }
    // Plan : zoom max retenu (≤ 14, réduit si trop de tuiles) + liste des tuiles de z0 à zmax
    function plan(shape, maxz, q) {
        const qz = QUAL[q] || QUAL[getQ()], want = Math.min(maxz || qz, qz, ABS_MAXZ); let zmax = want, sets;
        for (; zmax >= 6; zmax--) {
            sets = []; let total = 0;
            for (let z = 0; z <= zmax; z++) { const s = tileSet(shape, z); sets.push(s); total += s.size; }
            if (total <= MAX_TILES) break;
        }
        const tiles = []; sets.forEach(s => s.forEach(k => { const [z, x, y] = k.split('/').map(Number); tiles.push({ z, x, y }); }));
        return { zmax, want, reduced: zmax < want, tiles, count: tiles.length, mb: tiles.length * EST_KB / 1024 };
    }
    const bboxOf = (shape) => {
        if (shape.type === 'circle') { const [lng, lat] = shape.center, dLat = shape.km / 111.32, dLng = shape.km / Math.max(0.01, kmPerDegLng(lat)); return [lng - dLng, lat - dLat, lng + dLng, lat + dLat]; }
        let w = 180, s = 90, e = -180, n = -90; shape.coords.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }); return [w, s, e, n];
    };

    // ---------- Téléchargement ----------
    const decode = (buf) => new TextDecoder().decode(buf);
    const collectFonts = (v, out) => {
        if (Array.isArray(v)) {
            if (v.length && v.every(x => typeof x === 'string') && !['literal', 'get', 'step', 'case', 'match', 'coalesce', 'interpolate', 'let', 'var', 'format', 'to-string', 'concat'].includes(v[0])) out.add(v.join(','));
            else v.forEach(x => collectFonts(x, out));
        } else if (v && typeof v === 'object') Object.values(v).forEach(x => collectFonts(x, out));
    };
    // Style, sprites, polices, TileJSON des thèmes sombre et clair → renvoie les gabarits d'URL de tuiles
    async function ensureBase(onStep) {
        const tilesets = new Map();
        const styles = (typeof AppTheme !== 'undefined' && AppTheme.mapStyles) ? Object.values(AppTheme.mapStyles) : [];
        for (const su of styles) {
            onStep('Style de la carte…');
            const sb = await fetchBuf(su, 15000); await dbPut(keyOf(su), { buf: sb, kind: 'static' });
            const style = JSON.parse(decode(sb));
            if (typeof style.sprite === 'string') for (const suf of ['.json', '.png', '@2x.json', '@2x.png']) { try { const u = style.sprite + suf; await dbPut(keyOf(u), { buf: await fetchBuf(u, 15000), kind: 'static' }); } catch (e) {} }
            for (const src of Object.values(style.sources || {})) {
                let tj = src;
                if (src.url) { try { const tb = await fetchBuf(src.url, 15000); await dbPut(keyOf(src.url), { buf: tb, kind: 'static' }); tj = JSON.parse(decode(tb)); } catch (e) { continue; } }
                if (tj.tiles && tj.tiles.length && (src.type === 'vector' || src.type === 'raster')) tilesets.set(keyOf(tj.tiles[0]), { tpl: tj.tiles[0], maxzoom: tj.maxzoom || src.maxzoom || ABS_MAXZ, tms: tj.scheme === 'tms' || src.scheme === 'tms' });
            }
            if (style.glyphs) {
                onStep('Polices…');
                const fonts = new Set(); (style.layers || []).forEach(l => l.layout && l.layout['text-font'] && collectFonts(l.layout['text-font'], fonts));
                const jobs = []; fonts.forEach(f => ['0-255', '256-511', '8192-8447'].forEach(r => jobs.push(style.glyphs.replace('{fontstack}', f).replace('{range}', r))));
                for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(async u => { try { if (!(await cached(keyOf(u)))) await dbPut(keyOf(u), { buf: await fetchBuf(u, 15000), kind: 'static' }); } catch (e) {} }));
            }
        }
        return [...tilesets.values()];
    }

    // ---------- Réglages réseau / mises à jour / reprise ----------
    const UPD_KEY = 'moto_offline_upd', PEND_KEY = 'moto_offline_pending', RATE_KEY = 'moto_offline_rate', UPD_DAYS = 30;
    const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const updOn = () => lsGet(UPD_KEY) !== '0';                     // activé par défaut
    const spaceLow = async () => { try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); return !!(e.quota && e.usage / e.quota > 0.9); } } catch (e) {} return false; };
    async function storage() { try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e.quota) return { usage: e.usage || 0, quota: e.quota }; } } catch (e) {} return null; }
    const eta = (count) => count / (Number(lsGet(RATE_KEY)) || 10);   // secondes (débit mesuré aux téléchargements précédents, 10 tuiles/s par défaut)
    const getPend = () => { try { const p = JSON.parse(lsGet(PEND_KEY) || 'null'); return p && p.id && p.spec ? p : null; } catch (e) { return null; } };
    const putPend = (p) => { try { if (p) localStorage.setItem(PEND_KEY, JSON.stringify(p)); else localStorage.removeItem(PEND_KEY); } catch (e) {} };
    const slimShape = (sh) => { if (!sh || sh.type !== 'line' || !sh.coords || sh.coords.length <= 300) return sh; const k = Math.ceil(sh.coords.length / 300), c = sh.coords.filter((_, i) => i % k === 0 || i === sh.coords.length - 1); return Object.assign({}, sh, { coords: c }); };
    const circleOfBbox = (b) => ({ type: 'circle', center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], km: Math.max(1, (b[3] - b[1]) / 2 * 111.32) });
    const qualityOfZoom = (zmax) => ['lite', 'std', 'max'].find(k => QUAL[k] >= zmax) || 'max';

    let job = null;                                 // téléchargement en cours { cancel }
    let baseMemo = null;
    async function download(spec, onProgress) {
        // Un téléchargement manuel a priorité sur celui qui tourne en roulant : on l'arrête avant de commencer
        if (job && job.auto && spec.kind !== 'auto' && !spec.refresh) { job.cancel(); for (let i = 0; i < 100 && job; i++) await new Promise(r => setTimeout(r, 100)); }
        if (job) return { ok: false, reason: 'Un téléchargement est déjà en cours.' };
        const bg = spec.kind === 'auto' || !!spec.refresh, manual = !bg;      // tâche de fond : arrêtée si l'utilisateur lance un téléchargement
        const id = spec.resumeId || ('z' + Date.now()); let cancelled = false; job = { auto: bg, cancel() { cancelled = true; } };
        if (manual && !spec.resumeId) { const old = getPend(); if (old) { putPend(null); try { await removeRefs(old.id); } catch (e) {} } }   // un nouveau téléchargement abandonne l'ancien resté en plan
        const quality = spec.quality || getQ();
        const zone = { id, name: spec.name, kind: spec.kind, bbox: bboxOf(spec.shape), zmax: 0, tiles: 0, bytes: 0, date: Date.now(), quality, shape: slimShape(spec.shape) };
        const pend = { id, date: Date.now(), done: 0, total: 0, spec: { name: spec.name, kind: spec.kind, quality, shape: slimShape(spec.shape) } };
        const setPend = (x) => { if (manual) { Object.assign(pend, x); putPend(pend); } };
        const op0 = onProgress || (() => {}); let t0 = 0, lastSave = 0, netTiles = 0;
        onProgress = (pr) => {
            if (pr.total && pr.done >= 24 && t0) pr.eta = (Date.now() - t0) / 1000 / pr.done * (pr.total - pr.done);
            try { op0(pr); } catch (e) {}
            if (manual && pr.total && Date.now() - lastSave > 2500) { lastSave = Date.now(); setPend({ done: pr.done, total: pr.total }); }
        };
        setPend({});
        const cleanup = async () => { try { await removeRefs(id); } catch (e) {} };
        try {
            try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
            const fresh = spec.kind === 'auto' && baseMemo && Date.now() - baseMemo.t < 6 * 3600e3;      // téléchargement auto : style/polices déjà à jour
            const sets = fresh ? baseMemo.sets : await ensureBase(t => onProgress({ phase: t, done: 0, total: 0 }));
            if (!fresh) baseMemo = { t: Date.now(), sets };
            if (!sets.length) throw new Error('Style de carte inattendu : aucune source de tuiles.');
            const todo = [], geoTiles = [];
            sets.forEach(ts => {
                const p = plan(spec.shape, ts.maxzoom, quality); zone.zmax = Math.max(zone.zmax, p.zmax); p.tiles.forEach(t => todo.push({ ts, t }));
                if (/\.(mvt|pbf)(\?|$)/.test(ts.tpl)) {              // tuiles vectorielles : sert au calcul d'itinéraire et à la recherche hors ligne
                    tileMem = { tpl: ts.tpl, tms: !!ts.tms };
                    try { localStorage.setItem('moto_offline_tiles', JSON.stringify(tileMem)); } catch (e) {}
                    dbPut('/__tileinfo__', { kind: 'meta', v: tileMem }).catch(() => {});
                    p.tiles.forEach(t => { if (t.z === p.zmax) geoTiles.push({ z: t.z, x: t.x, y: t.y }); });
                    zone.geoZ = p.zmax;
                }
            });
            const total = todo.length; let done = 0, fail = 0, idx = 0; t0 = Date.now();
            const worker = async () => {
                while (!cancelled) {
                    const i = idx++; if (i >= todo.length) return;
                    const { ts, t } = todo[i], y = ts.tms ? (1 << t.z) - 1 - t.y : t.y;
                    const url = ts.tpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', y), key = keyOf(url);
                    try {
                        let rec = await dbGet(key);
                        if (rec && rec.kind === 'tile' && (!spec.force || rec.zones.includes(id))) { if (!rec.zones.includes(id)) { rec.zones.push(id); await dbPut(key, rec); } }
                        else {
                            let buf; try { buf = await fetchBuf(url, 15000); } catch (e) { buf = await fetchBuf(url, 20000); }
                            netTiles++;
                            rec = { buf, kind: 'tile', zones: rec && rec.kind === 'tile' ? [...new Set([...rec.zones, id])] : [id] }; await dbPut(key, rec);   // mise à jour : on garde les autres zones qui utilisent la tuile
                        }
                        zone.bytes += rec.buf.byteLength; zone.tiles++;
                    } catch (e) {
                        if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)))) { cancelled = 'quota'; return; }
                        fail++;
                    }
                    done++; if (done % 8 === 0 || done === total) onProgress({ phase: 'Téléchargement', done, total, bytes: zone.bytes });
                }
            };
            await Promise.all(Array.from({ length: 6 }, worker));
            const secs = (Date.now() - t0) / 1000;
            if (netTiles >= 30 && secs > 1) { const r = netTiles / secs, o = Number(lsGet(RATE_KEY)) || 0; lsSet(RATE_KEY, String(Math.round((o ? (o + r) / 2 : r) * 10) / 10)); }   // débit réel : sert à estimer la durée
            if (cancelled === true) { await cleanup(); if (manual) putPend(null); await syncFlag(); return { ok: false, reason: 'Annulé.' }; }
            // Espace plein ou connexion coupée : les tuiles déjà reçues sont gardées pour pouvoir reprendre
            if (cancelled === 'quota' || fail > total * 0.05) {
                const why = cancelled === 'quota' ? 'Espace de stockage insuffisant. Libère de la place puis reprends le téléchargement.' : 'Connexion interrompue ou instable. Les tuiles déjà reçues sont gardées : reprends le téléchargement.';
                if (manual) { setPend({ done: Math.min(done, total), total }); await syncFlag(); return { ok: false, reason: why, pending: true }; }
                await cleanup(); await syncFlag(); return { ok: false, reason: cancelled === 'quota' ? 'Espace de stockage insuffisant.' : 'Connexion trop instable : téléchargement incomplet, réessaie.' };
            }
            await tx('zones', 'readwrite', s => s.put(zone)); await syncFlag(); if (manual) putPend(null);
            if (typeof OfflineGeo !== 'undefined' && geoTiles.length) { onProgress({ phase: 'Index des rues et lieux…', done: 0, total: 0 }); try { await OfflineGeo.indexZone(id, geoTiles); } catch (e) { console.warn('index hors ligne', e); } }
            if (spec.replace) { try { await removeZone(spec.replace); } catch (e) {} }           // mise à jour terminée : l'ancienne version disparaît
            return { ok: true, zone, fail };
        } catch (e) {
            if (manual && spec.resumeId) { await syncFlag(); return { ok: false, reason: 'Réseau indisponible : ' + String((e && e.message) || e), pending: true }; }   // reprise impossible pour l'instant : on garde ce qui est déjà là
            await cleanup(); if (manual) putPend(null); await syncFlag(); return { ok: false, reason: String((e && e.message) || e) };
        }
        finally { job = null; }
    }
    // Retire l'identifiant de zone des tuiles ; supprime celles qui ne servent plus
    async function removeRefs(id) {
        const d = await openDb();
        await new Promise((res, rej) => {
            const t = d.transaction('res', 'readwrite'), s = t.objectStore('res'), c = s.openCursor();
            c.onsuccess = () => { const cur = c.result; if (!cur) return; const v = cur.value;
                if (v && v.kind === 'tile' && v.zones && v.zones.includes(id)) { v.zones = v.zones.filter(z => z !== id); if (v.zones.length) cur.update(v); else cur.delete(); }
                cur.continue(); };
            t.oncomplete = () => res(); t.onerror = () => rej(t.error);
        });
    }
    async function removeZone(id) { await removeRefs(id); await tx('zones', 'readwrite', s => s.delete(id)); await syncFlag(); if (typeof OfflineGeo !== 'undefined') { try { await OfflineGeo.dropZone(id); } catch (e) {} } }
    async function clearAll() { await tx('res', 'readwrite', s => s.clear()); await tx('zones', 'readwrite', s => s.clear()); await syncFlag(); if (typeof OfflineGeo !== 'undefined') OfflineGeo.reset(); }
    // Accès aux tuiles vectorielles téléchargées (octets MVT bruts) pour l'itinéraire / la recherche hors ligne
    let tileMem = null;
    const tileInfo = () => { try { return JSON.parse(localStorage.getItem('moto_offline_tiles') || 'null') || tileMem; } catch (e) { return tileMem; } };
    // Au démarrage : la base locale fait foi (le drapeau localStorage peut manquer après un nettoyage du navigateur)
    (async () => { try { await syncFlag(); const r = await dbGet('/__tileinfo__'); if (r && r.v) { tileMem = r.v; if (!localStorage.getItem('moto_offline_tiles')) localStorage.setItem('moto_offline_tiles', JSON.stringify(r.v)); } } catch (e) {} })();
    async function rawTile(z, x, y) {
        const ti = tileInfo(); if (!ti) return null;
        const yy = ti.tms ? (1 << z) - 1 - y : y, url = ti.tpl.replace('{z}', z).replace('{x}', x).replace('{y}', yy);
        try { const r = await dbGet(keyOf(url)); return r && r.kind === 'tile' ? r.buf : null; } catch (e) { return null; }
    }


    // ---------- Téléchargement progressif (en roulant, avec du réseau) : qualité maximale uniquement ----------
    const AUTO_KEY = 'moto_auto_dl', CELLS_KEY = 'moto_auto_cells', CELL = 0.04, CELL_KM = 3.4, MAX_CELLS = 800;
    const auto = (() => {
        let cells = null, last = 0, wait = 15000, prev = null, full = false, listeners = [], dl = 0;
        const isOn = () => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch (e) { return false; } };
        const getCells = () => { if (!cells) { try { cells = new Set(JSON.parse(localStorage.getItem(CELLS_KEY) || '[]')); } catch (e) { cells = new Set(); } } return cells; };
        const saveCells = () => { try { localStorage.setItem(CELLS_KEY, JSON.stringify([...getCells()])); } catch (e) {} };
        const emit = (ev) => listeners.forEach(f => { try { f(ev); } catch (e) {} });
        const cellOf = (lng, lat) => Math.floor(lat / CELL) + ',' + Math.floor(lng / CELL);
        const centerOf = (k) => { const [a, b] = k.split(',').map(Number); return [(b + 0.5) * CELL, (a + 0.5) * CELL]; };
        const ahead = (c, hdg, km) => { const r = hdg * Math.PI / 180; return [c[0] + Math.sin(r) * km / Math.max(0.01, kmPerDegLng(c[1])), c[1] + Math.cos(r) * km / 111.32]; };
        function set(v) { try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch (e) {} full = false; wait = 15000; emit({ type: 'toggle', on: !!v }); }
        const lowSpace = spaceLow;
        // À appeler à chaque position GPS : télécharge la case où l'on se trouve puis celles situées devant
        async function tick(c, speedKmh, heading) {
            let hdg = (typeof heading === 'number' && isFinite(heading)) ? heading : null;
            if (hdg === null && prev && Math.hypot(c[0] - prev[0], c[1] - prev[1]) > 0.0003) hdg = (Math.atan2((c[0] - prev[0]) * kmPerDegLng(c[1]), (c[1] - prev[1]) * 111.32) * 180 / Math.PI + 360) % 360;
            if (!prev || Math.hypot(c[0] - prev[0], c[1] - prev[1]) > 0.0003) prev = c.slice();
            if (!isOn() || full || job || isDown() || navigator.onLine === false) return;
            const now = Date.now(); if (now - last < wait) return;
            const have = getCells(); if (have.size >= MAX_CELLS) return;
            const cand = [cellOf(c[0], c[1])];
            if (hdg !== null && (speedKmh || 0) > 8) [4.5, 9].forEach(km => { const a = ahead(c, hdg, km); cand.push(cellOf(a[0], a[1])); });
            const k = cand.find(x => !have.has(x)); if (!k) return;
            last = now;
            if (await lowSpace()) { full = true; emit({ type: 'full' }); return; }
            const r = await download({ name: 'Carte auto', kind: 'auto', quality: 'max', shape: { type: 'circle', center: centerOf(k), km: CELL_KM } }, () => {});
            if (r.ok) { have.add(k); saveCells(); wait = 15000; dl++; emit({ type: 'done', zone: r.zone, count: have.size, first: dl === 1 }); }
            else { if (/stockage/i.test(r.reason || '')) { full = true; emit({ type: 'full' }); } wait = Math.min(wait * 2, 600000); emit({ type: 'fail', reason: r.reason }); }
        }
        return { isOn, set, tick, cells: () => getCells().size, forget() { cells = new Set(); saveCells(); }, onEvent(f) { listeners.push(f); return () => { listeners = listeners.filter(x => x !== f); }; } };
    })();

    // Cartes téléchargées par une ancienne version : on retrouve le gabarit des tuiles vectorielles dans le style / TileJSON déjà en cache,
    // puis on indexe ces zones pour l'itinéraire et la recherche hors ligne (sans rien retélécharger)
    let upgrading = null, indexing = null;
    // full = false : retrouve seulement le gabarit des tuiles (instantané) et lance l'indexation en arrière-plan ; full = true : attend aussi l'indexation (recherche)
    async function upgradeLegacy(full) {
        const r = await (upgrading || (upgrading = stepTiles().finally(() => { upgrading = null; })));
        if (!r) return false;
        if (!indexing) indexing = stepIndex().finally(() => { indexing = null; });
        if (full) await indexing;
        return true;
    }
    async function stepTiles() {
        try {
            const zs = await zonesAll(); try { localStorage.setItem(FLAG, String(zs.length)); } catch (e) {}
            if (!zs.length) return false;
                if (!tileInfo()) {
                    const styles = (typeof AppTheme !== 'undefined' && AppTheme.mapStyles) ? Object.values(AppTheme.mapStyles) : [];
                    for (const su of styles) {
                        const r = await dbGet(keyOf(su)); if (!r || !r.buf) continue;
                        let style; try { style = JSON.parse(decode(r.buf)); } catch (e) { continue; }
                        for (const src of Object.values(style.sources || {})) {
                            let tj = src;
                            if (src.url) { const t = await dbGet(keyOf(src.url)); if (!t || !t.buf) continue; try { tj = JSON.parse(decode(t.buf)); } catch (e) { continue; } }
                            if (src.type === 'vector' && tj.tiles && tj.tiles[0] && /\.(mvt|pbf)(\?|$)/.test(tj.tiles[0]) && !tileMem) {
                                tileMem = { tpl: tj.tiles[0], tms: tj.scheme === 'tms' || src.scheme === 'tms' };
                                try { localStorage.setItem('moto_offline_tiles', JSON.stringify(tileMem)); } catch (e) {}
                                dbPut('/__tileinfo__', { kind: 'meta', v: tileMem }).catch(() => {});
                            }
                        }
                    }
                }
                return !!tileInfo();
            } catch (e) { console.warn('mise à niveau cartes', e); return false; }
    }
    async function stepIndex() {
            try {
                const zs = await zonesAll();
                if (!tileInfo() || typeof OfflineGeo === 'undefined') return false;
                let changed = false;
                for (const z of zs) {
                    if (z.geoZ || !(z.zmax >= 12)) continue;
                    const gz = Math.min(z.zmax, ABS_MAXZ), n = 1 << gz, b = z.bbox, tiles = [];
                    const x0 = clampT(Math.floor(lon2x(b[0], gz)), gz), x1 = clampT(Math.floor(lon2x(b[2], gz)), gz), y0 = clampT(Math.floor(lat2y(Math.min(85, b[3]), gz)), gz), y1 = clampT(Math.floor(lat2y(Math.max(-85, b[1]), gz)), gz);
                    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push({ z: gz, x, y });
                    if (tiles.length > 20000) continue;
                    try { await OfflineGeo.indexZone(z.id, tiles); } catch (e) { continue; }
                    z.geoZ = gz; await tx('zones', 'readwrite', st => st.put(z)); changed = true;
                }
                return changed;
            } catch (e) { console.warn('indexation anciennes cartes', e); return false; }
    }

    const hasZones = () => { try { return Number(localStorage.getItem(FLAG)) > 0; } catch (e) { return false; } };
    // ---------- Reprise d'un téléchargement interrompu ----------
    const resume = (onProgress) => { const p = getPend(); if (!p) return Promise.resolve({ ok: false, reason: 'Rien à reprendre.' }); return download(Object.assign({}, p.spec, { resumeId: p.id }), onProgress); };
    const discard = async () => { if (job && !job.auto) return; const p = getPend(); if (!p) return; putPend(null); try { await removeRefs(p.id); } catch (e) {} await syncFlag(); };

    // ---------- Mise à jour automatique : une carte de plus de 30 jours est retéléchargée en arrière-plan (une à la fois) ----------
    let maintBusy = false;
    async function maintain() {
        if (maintBusy || job || !updOn() || isDown() || navigator.onLine === false) return false;
        try { if (typeof ModuleGPS !== 'undefined' && ModuleGPS.state && ModuleGPS.state.isTracking) return false; } catch (e) {}   // jamais pendant un trajet
        maintBusy = true;
        try {
            if (await spaceLow()) return false;
            const now = Date.now(), zs = (await zonesAll()).filter(z => z.kind !== 'auto' && now - z.date > UPD_DAYS * 864e5).sort((a, b) => a.date - b.date);
            for (const z of zs) {
                if (z.updTry && now - z.updTry < 864e5) continue;                         // échec récent : nouvel essai demain
                const shape = z.shape || (z.kind === 'area' ? circleOfBbox(z.bbox) : null); if (!shape) continue;   // anciennes cartes d'itinéraire : mises à jour après un retéléchargement
                z.updTry = now; await tx('zones', 'readwrite', st => st.put(z));
                const r = await download({ name: z.name, kind: z.kind, quality: z.quality || qualityOfZoom(z.zmax), shape, refresh: true, force: true, replace: z.id }, () => {});
                return !!r.ok;
            }
        } catch (e) { console.warn('mise à jour des cartes', e); }
        finally { maintBusy = false; }
        return false;
    }
    setTimeout(maintain, 45000); setInterval(maintain, 6 * 3600e3); window.addEventListener('online', () => setTimeout(maintain, 5000));

    return { auto, upgradeLegacy, transform, plan, download, removeZone, clearAll, zones: zonesAll, cancel() { if (job) job.cancel(); }, busy: () => !!job && !job.auto, EST_KB, _load: handle, _keyOf: keyOf, rawTile, tileInfo, hasZones, getQ, setQ, QUAL, _dbGet: dbGet, _dbPut: dbPut, _tx: tx, isDown, onChange(f) { listeners.push(f); }, probe,
        pending: getPend, resume, discard, eta, storage, maintain, UPD_DAYS,
        updOn, setUpd(v) { lsSet(UPD_KEY, v ? '1' : '0'); } };
})();

// ====================================================================
//  Interface : panneau « Cartes hors ligne »
// ====================================================================
Object.assign(ModuleGPS, {
    offlineDur(sec) { sec = Math.max(0, Math.round(sec)); if (sec < 60) return '< 1 min'; if (sec < 3600) return '~' + Math.round(sec / 60) + ' min'; const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return '~' + h + ' h ' + String(m).padStart(2, '0'); },
    // Ajoute au texte d'estimation un avertissement si la zone ne tiendra pas dans l'espace libre de l'appareil
    async offlineFit(mb, el) {
        const st = await OfflineMaps.storage(); if (!st || !el || !el.isConnected) return;
        const free = (st.quota - st.usage) / 1048576;
        if (mb > free * 0.9) { el.textContent += ` · ⚠ espace libre insuffisant (${this.offlineFmt(Math.max(0, free))})`; el.style.color = 'var(--danger-color)'; } else el.style.color = '';
    },
    async offlinePaintGauge(el, mapBytes) {
        const st = await OfflineMaps.storage(); if (!el) return;
        if (!st) { el.style.display = 'none'; return; }
        const used = Math.min(st.usage, st.quota), maps = Math.min(mapBytes, used), free = Math.max(0, st.quota - st.usage);
        el.style.display = '';
        el.innerHTML = `<div class="om-gbar"><i class="om-gmap" style="width:${(maps / st.quota * 100).toFixed(2)}%"></i><i class="om-gother" style="width:${((used - maps) / st.quota * 100).toFixed(2)}%"></i></div><div class="om-gtxt"><span><b class="om-dot om-gmap"></b>Cartes ${this.offlineFmt(maps / 1048576)}</span><span><b class="om-dot om-gother"></b>Autres ${this.offlineFmt((used - maps) / 1048576)}</span><span>Libre ${this.offlineFmt(free / 1048576)}</span></div>`;
        el.classList.toggle('low', free / st.quota < 0.1);
    },
    offlineFmt(mb) { return mb >= 1000 ? (mb / 1024).toFixed(1) + ' Go' : (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + ' Mo'; },

    // Sélecteur de précision : zoom maximal téléchargé (plus haut = plus précis mais plus lourd)
    offlineQualityHtml() {
        const q = OfflineMaps.getQ(), b = (k, t, sub) => `<button type="button" class="om-q${q === k ? ' on' : ''}" data-q="${k}">${t}<small>${sub}</small></button>`;
        return `<div class="om-qrow">${b('lite', 'Léger', 'routes principales')}${b('std', 'Standard', 'rues')}${b('max', 'Détaillé', 'tout, précis')}</div>`;
    },
    offlineQualityBind(root, onChange) {
        root.querySelectorAll('.om-q').forEach(b => b.addEventListener('click', () => { OfflineMaps.setQ(b.dataset.q); root.querySelectorAll('.om-q').forEach(x => x.classList.toggle('on', x === b)); onChange(); }));
    },

    // host : conteneur d'une page (Réglages › Cartes hors ligne) ; sans host, feuille flottante comme avant
    async offlineOpen(host) {
        if (typeof AppSub !== 'undefined' && !AppSub.gate()) return;
        const old = document.getElementById('om-overlay'); if (old) old.remove();
        const O = OfflineMaps, G = this, s = this.state, esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const ov = document.createElement('div'); ov.id = 'om-overlay'; ov.className = 'rp-overlay' + (host ? ' rp-inline' : '');
        ov.innerHTML = `<div class="rp-sheet om-sheet">
            <div class="rp-top"><div style="flex:1;font-weight:900;font-size:1.05rem;padding-left:10px;">Cartes hors ligne</div><button type="button" class="rp-x" aria-label="Fermer">✕</button></div>
            <div class="om-tabs rp-mode">
                <button type="button" class="rp-mb" data-tab="dl">Télécharger</button>
                <button type="button" class="rp-mb" data-tab="mine">Mes cartes <span class="om-badge" id="om-badge"></span></button>
                <button type="button" class="rp-mb" data-tab="set">Réglages</button>
            </div>
            <div class="om-gauge" id="om-gauge" style="display:none"></div>
            <section class="om-pane" data-pane="dl">
                <div id="om-pend"></div>
                <button type="button" class="om-chip" id="om-qchip"></button>
                <div class="om-card">
                    <div class="om-h">Une zone autour d'un point</div>
                    <div class="rp-mode"><button type="button" class="rp-mb on" data-c="map">Centre de la carte</button><button type="button" class="rp-mb" data-c="gps">Ma position</button></div>
                    <div class="om-rng"><label>Rayon</label><input type="range" id="om-r" min="5" max="150" step="5" value="25"><b id="om-rv">25 km</b></div>
                    <div class="om-est" id="om-est"></div>
                    <button type="button" class="rp-pub" id="om-go-area">Télécharger la zone</button>
                </div>
                <div class="om-card">
                    <div class="om-h">Autour d'un itinéraire</div>
                    <div class="om-rng"><label>Largeur</label><input type="range" id="om-w" min="2" max="25" step="1" value="6"><b id="om-wv">± 6 km</b></div>
                    <div id="om-routes"></div>
                </div>
            </section>
            <section class="om-pane" data-pane="mine">
                <div class="om-info" id="om-info"></div>
                <div class="om-card">
                    <div class="om-h">Cartes téléchargées</div>
                    <div id="om-zones"></div>
                </div>
            </section>
            <section class="om-pane" data-pane="set">
                <div class="om-card">
                    <div class="om-h">Précision de la carte</div>
                    ${this.offlineQualityHtml()}
                    <div class="om-est" style="color:var(--text-muted);font-weight:600;">Plus c'est précis, plus la carte pèse. « Détaillé » est nécessaire pour calculer un itinéraire hors ligne.</div>
                </div>
                <div class="om-card">
                    <div class="om-h">Mises à jour</div>
                    <button type="button" class="btn setting-btn" data-auto-upd></button>
                    <div class="om-est" id="om-net-info" style="color:var(--text-muted);font-weight:600;"></div>
                </div>
                <div class="om-card">
                    <div class="om-h">Télécharger la carte en roulant</div>
                    <button type="button" class="btn setting-btn" data-auto-dl>Désactivé</button>
                    <div class="om-est" id="auto-dl-info" style="color:var(--text-muted);font-weight:600;"></div>
                </div>
            </section>
            <div class="om-prog" id="om-prog" style="display:none;"><div class="om-pl" id="om-pl"></div><div class="om-pb"><i id="om-pbi"></i></div><button type="button" class="om-cancel" id="om-cancel">Annuler</button></div>
            <div class="rp-msg" id="om-msg"></div></div>`;
        (host || document.body).appendChild(ov);
        const $ = (i) => ov.querySelector('#' + i), msg = $('om-msg');
        const close = () => { if (O.busy()) return; ov.remove(); };
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        ov.querySelector('.rp-x').addEventListener('click', close);
        const setMsg = (t, c) => { msg.textContent = t; msg.className = 'rp-msg' + (c ? ' ' + c : ''); };
        let centerMode = 'map';
        const hasGps = () => !!s.lastKnownCoords;
        const center = () => centerMode === 'gps' && hasGps() ? s.lastKnownCoords : (s.map ? [s.map.getCenter().lng, s.map.getCenter().lat] : null);
        const routeList = () => {
            const out = [];
            if (s.currentGeoJSON && s.currentGeoJSON.coordinates) out.push({ title: 'Itinéraire affiché', coords: s.currentGeoJSON.coordinates });
            try { AppStore.get('moto_saved_routes', []).forEach(r => { if (r.geojson && r.geojson.coordinates) out.push({ title: r.title || 'Itinéraire', coords: r.geojson.coordinates, dist: r.dist }); }); } catch (e) {}
            return out;
        };
        const refreshEst = () => {
            const km = Number($('om-r').value); $('om-rv').textContent = km + ' km';
            const c = center(); if (!c) { $('om-est').textContent = 'Carte indisponible.'; return; }
            const p = O.plan({ type: 'circle', center: c, km }); $('om-est').textContent = `≈ ${p.count} tuiles · ~${G.offlineFmt(p.mb)} · ${G.offlineDur(O.eta(p.count))} · jusqu'au zoom ${p.zmax}` + (p.reduced ? ' ⚠ zone très grande : précision réduite' : ''); G.offlineFit(p.mb, $('om-est'));
        };
        const renderRoutes = () => {
            const w = Number($('om-w').value); $('om-wv').textContent = '± ' + w + ' km';
            const box = $('om-routes'), list = routeList(); box.innerHTML = '';
            if (!list.length) { box.innerHTML = '<div class="comm-empty" style="padding:6px 0">Aucun itinéraire. Crée ou enregistre un trajet pour télécharger sa carte.</div>'; return; }
            list.forEach((r, i) => {
                const p = O.plan({ type: 'line', coords: r.coords, km: w }), row = document.createElement('div'); row.className = 'om-row';
                row.innerHTML = `<div class="om-rm"><b>${esc(r.title)}</b><span>${r.dist ? esc(r.dist) + ' km · ' : ''}≈ ${p.count} tuiles · ~${G.offlineFmt(p.mb)} · ${G.offlineDur(O.eta(p.count))}${p.reduced ? ' · ⚠ précision réduite' : ''}</span></div><button type="button" class="om-dl" aria-label="Télécharger">⬇</button>`;
                row.querySelector('.om-dl').addEventListener('click', () => run({ name: r.title, kind: 'route', shape: { type: 'line', coords: r.coords, km: w } }));
                box.appendChild(row);
            });
        };
        const renderZones = async () => {
            let zs = []; try { zs = await O.zones(); } catch (e) { setMsg('Stockage local indisponible sur cet appareil.', 'err'); }
            zs.sort((a, b) => b.date - a.date);
            const tot = zs.reduce((a, z) => a + z.bytes, 0) / 1048576; G.offlinePaintGauge($('om-gauge'), tot * 1048576);
            const nMan = zs.filter(z => z.kind !== 'auto').length + (zs.some(z => z.kind === 'auto') ? 1 : 0); $('om-badge').textContent = nMan ? nMan : '';
            $('om-info').textContent = zs.length ? `${nMan} carte${nMan > 1 ? 's' : ''} · ${G.offlineFmt(tot)} utilisés. Elles servent automatiquement dès que le réseau manque : carte, recherche de rues et de villes, calcul d\'itinéraire.` : 'Télécharge une zone ou un trajet : la carte, la recherche de rues et villes et le calcul d\'itinéraire fonctionneront sans réseau.';
            const box = $('om-zones'); box.innerHTML = '';
            if (!zs.length && !box.children.length) { box.innerHTML = '<div class="comm-empty" style="padding:6px 0">Rien de téléchargé pour le moment.</div>'; return; }
            const autoZ = zs.filter(z => z.kind === 'auto'); zs = zs.filter(z => z.kind !== 'auto');
            if (autoZ.length) {
                const row = document.createElement('div'); row.className = 'om-row';
                row.innerHTML = `<div class="om-rm"><b>🛰️ Carte auto (en roulant)</b><span>${autoZ.length} zone${autoZ.length > 1 ? 's' : ''} · ${G.offlineFmt(autoZ.reduce((a, z) => a + z.bytes, 0) / 1048576)} · zoom 14</span></div><button type="button" class="om-del" aria-label="Supprimer">🗑</button>`;
                row.querySelector('.om-del').addEventListener('click', () => G.showConfirmSafe('Supprimer la carte auto ?', 'Les zones téléchargées en roulant seront effacées.', async () => { for (const z of autoZ) await O.removeZone(z.id); O.auto.forget(); renderZones(); }));
                box.appendChild(row);
            }
            zs.forEach(z => {
                const row = document.createElement('div'); row.className = 'om-row';
                row.innerHTML = `<div class="om-rm"><b>${z.kind === 'route' ? '🛣️' : '📍'} ${esc(z.name)}</b><span>${G.offlineFmt(z.bytes / 1048576)} · zoom ${z.zmax} · ${new Date(z.date).toLocaleDateString('fr-FR')}</span></div><button type="button" class="om-del" aria-label="Supprimer">🗑</button>`;
                row.querySelector('.om-del').addEventListener('click', () => G.showConfirmSafe('Supprimer cette carte ?', z.name, async () => { await O.removeZone(z.id); renderZones(); }));
                box.appendChild(row);
            });
            if (zs.length + (autoZ.length ? 1 : 0) > 1) { const b = document.createElement('button'); b.type = 'button'; b.className = 'om-all'; b.textContent = 'Tout supprimer'; b.addEventListener('click', () => G.showConfirmSafe('Tout supprimer ?', 'Toutes les cartes hors ligne seront effacées.', async () => { await O.clearAll(); O.auto.forget(); renderZones(); })); box.appendChild(b); }
        };
        const busyUi = (on) => { ov.querySelectorAll('button.rp-pub, .om-dl, .om-del, .om-all, .rp-mb, .rp-x').forEach(b => b.disabled = on); $('om-prog').style.display = on ? '' : 'none'; };
        const run = (spec) => runWith((cb) => O.download(spec, cb));
        const runWith = async (start) => {
            setMsg(''); busyUi(true); $('om-pbi').style.width = '0%'; $('om-pl').textContent = 'Préparation…';
            const r = await start((p) => { $('om-pl').textContent = p.total ? `${p.phase} ${p.done}/${p.total} · ${G.offlineFmt((p.bytes || 0) / 1048576)}${p.eta ? ' · ' + G.offlineDur(p.eta) + ' restantes' : ''}` : p.phase; $('om-pbi').style.width = p.total ? Math.round(p.done / p.total * 100) + '%' : '5%'; });
            busyUi(false);
            if (r.ok) setMsg(`Carte téléchargée ✓ (${G.offlineFmt(r.zone.bytes / 1048576)})`, 'ok');
            else if (r.reason !== 'Annulé.') AppDialog.alert(r.reason);
            await renderZones(); renderPend(); if (r.ok) G._omShowTab('mine'); else if (r.pending) G._omShowTab('dl');
        };
        // Téléchargement interrompu (réseau coupé, espace plein, application fermée) : les tuiles reçues sont gardées
        const renderPend = () => {
            const box = $('om-pend'); if (!box) return; const pd = O.pending(); box.innerHTML = '';
            if (!pd) return;
            const pct = pd.total ? Math.round(pd.done / pd.total * 100) : 0;
            const c = document.createElement('div'); c.className = 'om-card om-pend';
            c.innerHTML = `<div class="om-h">⏸ Téléchargement interrompu</div><div class="om-est" style="color:var(--text-main)">${esc(pd.spec.name)}${pct ? ' · ' + pct + ' %' : ''}</div><div class="om-pbtn"><button type="button" class="rp-pub" data-pa="resume">Reprendre</button><button type="button" class="om-all" data-pa="drop">Abandonner</button></div>`;
            c.querySelector('[data-pa="resume"]').addEventListener('click', () => runWith((cb) => O.resume(cb)));
            c.querySelector('[data-pa="drop"]').addEventListener('click', () => G.showConfirmSafe('Abandonner ce téléchargement ?', 'Les tuiles déjà reçues seront supprimées.', async () => { await O.discard(); renderPend(); renderZones(); }));
            box.appendChild(c);
        };
        ov.querySelectorAll('.rp-mb[data-c]').forEach(b => b.addEventListener('click', () => { if (b.dataset.c === 'gps' && !hasGps()) { setMsg('Position GPS indisponible.', 'err'); return; } setMsg(''); centerMode = b.dataset.c; ov.querySelectorAll('.rp-mb').forEach(x => x.classList.toggle('on', x === b)); refreshEst(); }));
        $('om-r').addEventListener('input', refreshEst); $('om-w').addEventListener('input', renderRoutes);
        const QN = { lite: 'Léger', std: 'Standard', max: 'Détaillé' };
        const paintChip = () => { $('om-qchip').textContent = 'Précision : ' + QN[O.getQ()] + '  ›  modifier'; };
        const showTab = (t) => { ov.querySelectorAll('.om-pane').forEach(x => x.classList.toggle('on', x.dataset.pane === t)); ov.querySelectorAll('.om-tabs .rp-mb').forEach(x => x.classList.toggle('on', x.dataset.tab === t)); ov.querySelector('.om-sheet').scrollTop = 0; };
        ov.querySelectorAll('.om-tabs .rp-mb').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
        $('om-qchip').addEventListener('click', () => showTab('set'));
        G.offlineQualityBind(ov, () => { paintChip(); refreshEst(); renderRoutes(); });
        paintChip(); G._omShowTab = showTab;
        G.autoDlBind(ov);
        $('om-cancel').addEventListener('click', () => O.cancel());
        $('om-go-area').addEventListener('click', async () => {
            const c = center(); if (!c) { setMsg('Carte indisponible.', 'err'); return; }
            const km = Number($('om-r').value); let name = `${c[1].toFixed(2)}, ${c[0].toFixed(2)}`;
            try { const r = await this.poiFetchJSON(`https://api-adresse.data.gouv.fr/reverse/?lon=${c[0].toFixed(5)}&lat=${c[1].toFixed(5)}`, 3000); const p = r && r.features && r.features[0] && r.features[0].properties; if (p && p.city) name = p.city; } catch (e) {}
            run({ name: `${name} · ${km} km`, kind: 'area', shape: { type: 'circle', center: c, km } });
        });
        G.offlineNetBind(ov);
        refreshEst(); renderRoutes(); renderPend();
        renderZones().then(() => showTab(O.pending() ? 'dl' : (ov.querySelector('#om-zones .om-row') ? 'mine' : 'dl')));
    },


    // Fenêtre rapide « Télécharger la carte de ce trajet » (depuis le trajet affiché ou la bibliothèque)
    async offlineRoute(title, coords) {
        if (!coords || coords.length < 2) return;
        if (typeof AppSub !== 'undefined' && !AppSub.gate()) return;
        const old = document.getElementById('omr-overlay'); if (old) old.remove();
        const O = OfflineMaps, G = this, esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        title = String(title || 'Itinéraire').replace('📍 Ma position actuelle', 'Ma position');
        let have = null; try { have = (await O.zones()).find(z => z.kind === 'route' && z.name === title); } catch (e) {}
        const ov = document.createElement('div'); ov.id = 'omr-overlay'; ov.className = 'rp-overlay';
        ov.innerHTML = `<div class="rp-sheet om-sheet">
            <div class="rp-top"><div style="flex:1;font-weight:900;font-size:1.05rem;padding-left:10px;">Carte hors ligne du trajet</div><button type="button" class="rp-x" aria-label="Fermer">✕</button></div>
            <div class="om-card">
                <div class="om-h">${esc(title)}</div>
                ${this.offlineQualityHtml()}
                ${have ? `<div class="om-est" style="color:#30d158">✓ Déjà téléchargée (${G.offlineFmt(have.bytes / 1048576)})</div>` : ''}
                <div class="om-rng"><label>Largeur</label><input type="range" id="omr-w" min="2" max="25" step="1" value="${have && have.width ? have.width : 6}"><b id="omr-wv"></b></div>
                <div class="om-est" id="omr-est"></div>
                <button type="button" class="rp-pub" id="omr-go">${have ? 'Mettre à jour la carte' : 'Télécharger la carte'}</button>
            </div>
            <div class="om-prog" id="omr-prog" style="display:none;"><div class="om-pl" id="omr-pl"></div><div class="om-pb"><i id="omr-pbi"></i></div><button type="button" class="om-cancel" id="omr-cancel">Annuler</button></div>
            <div class="rp-msg" id="omr-msg"></div></div>`;
        document.body.appendChild(ov);
        const $ = (i) => ov.querySelector('#' + i), msg = $('omr-msg');
        const close = () => { if (!O.busy()) ov.remove(); };
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); }); ov.querySelector('.rp-x').addEventListener('click', close);
        const est = () => { const w = Number($('omr-w').value); $('omr-wv').textContent = '± ' + w + ' km'; const p = O.plan({ type: 'line', coords, km: w }); $('omr-est').textContent = (have ? '' : '') + `≈ ${p.count} tuiles · ~${G.offlineFmt(p.mb)} · ${G.offlineDur(O.eta(p.count))} · jusqu'au zoom ${p.zmax}` + (p.reduced ? ' ⚠ trajet très long : précision réduite' : ''); G.offlineFit(p.mb, $('omr-est')); };
        $('omr-w').addEventListener('input', est); G.offlineQualityBind(ov, est); est();
        $('omr-cancel').addEventListener('click', () => O.cancel());
        $('omr-go').addEventListener('click', async () => {
            const w = Number($('omr-w').value); msg.textContent = ''; msg.className = 'rp-msg';
            ov.querySelectorAll('button.rp-pub, .rp-x').forEach(b => b.disabled = true); $('omr-prog').style.display = ''; $('omr-pl').textContent = 'Préparation…'; $('omr-pbi').style.width = '0%';
            const r = await O.download({ name: title, kind: 'route', shape: { type: 'line', coords, km: w } }, (p) => { $('omr-pl').textContent = p.total ? `${p.phase} ${p.done}/${p.total} · ${G.offlineFmt((p.bytes || 0) / 1048576)}${p.eta ? ' · ' + G.offlineDur(p.eta) + ' restantes' : ''}` : p.phase; $('omr-pbi').style.width = p.total ? Math.round(p.done / p.total * 100) + '%' : '5%'; });
            $('omr-prog').style.display = 'none'; ov.querySelectorAll('button.rp-pub, .rp-x').forEach(b => b.disabled = false);
            if (r.ok) { if (have) { try { await O.removeZone(have.id); } catch (e) {} } msg.textContent = `Carte téléchargée ✓ (${G.offlineFmt(r.zone.bytes / 1048576)}). Elle servira sans réseau.`; msg.className = 'rp-msg ok'; setTimeout(() => { if (document.body.contains(ov)) ov.remove(); }, 1800); }
            else if (r.reason !== 'Annulé.') { AppDialog.alert(r.reason + (r.pending ? '\n\nTu retrouveras ce téléchargement dans Réglages → Cartes hors ligne.' : '')); }
        });
    },

    showConfirmSafe(title, text, fn) { if (typeof ModuleCommunity !== 'undefined' && ModuleCommunity.showConfirm) ModuleCommunity.showConfirm(title, text, fn); else if (confirm(title + '\n' + text)) fn(); },

    // Réglage : mise à jour automatique des cartes de plus de 30 jours
    offlineNetBind(root) {
        const O = OfflineMaps, u = root.querySelector('[data-auto-upd]'), info = root.querySelector('#om-net-info');
        if (!u) return;
        const paint = () => {
            const uo = O.updOn();
            u.textContent = uo ? `Mise à jour automatique ✓ · tous les ${O.UPD_DAYS} jours` : 'Mise à jour automatique désactivée'; u.classList.toggle('active', uo);
            if (info) info.textContent = uo ? 'Une carte plus vieille que ' + O.UPD_DAYS + ' jours est retéléchargée en arrière-plan quand il y a du réseau, jamais pendant un trajet.' : 'Tes cartes restent telles quelles ; tu peux les retélécharger à la main.';
        };
        u.addEventListener('click', () => { O.setUpd(!O.updOn()); paint(); });
        paint();
    },

    // Carte : téléchargement progressif en roulant (qualité maximale uniquement), carte à l'intérieur du panneau « Cartes hors ligne »
    autoDlBind(root) {
        const O = OfflineMaps, btn = root.querySelector('[data-auto-dl]'), info = root.querySelector('#auto-dl-info');
        if (!btn) return;
        const paint = () => {
            const on = O.auto.isOn(), n = O.auto.cells();
            btn.textContent = on ? 'Activé ✓ · carte téléchargée en roulant' : 'Désactivé'; btn.classList.toggle('active', on);
            if (info) info.textContent = on ? `Qualité maximale (zoom 14 « Détaillé ») uniquement, dès qu'il y a du réseau.${n ? ' ' + n + ' zone' + (n > 1 ? 's' : '') + ' récupérée' + (n > 1 ? 's' : '') + ' jusqu\'ici.' : ''}` : 'Quand tu roules avec du réseau, la carte se télécharge autour de toi et devant toi, en qualité maximale uniquement.';
        };
        btn.addEventListener('click', () => {
            const on = !O.auto.isOn(); O.auto.set(on);
            const s = this.state; if (on && s.lastKnownCoords) { try { O.auto.tick(s.lastKnownCoords, 0, null); } catch (e) {} }
            paint();
        });
        const off = O.auto.onEvent(() => { if (!root.isConnected) { off(); return; } paint(); });
        paint();
    },
    offlineInit() {
        const bo = document.getElementById('btn-offline-route'); if (bo) bo.addEventListener('click', () => { const s = this.state; if (s.currentGeoJSON) this.offlineRoute(s.currentRouteTitle || 'Itinéraire', s.currentGeoJSON.coordinates); });
        document.querySelectorAll('[data-offline-open]').forEach(b => b.addEventListener('click', () => this.offlineOpen()));
        // Bascule automatique : plus de réseau → cartes téléchargées (carte, recherche, itinéraire) ; réseau de retour → retour normal
        OfflineMaps.onChange((down) => {
            const has = OfflineMaps.hasZones(), m = this.state.map;
            if (this.poiSetBadge) this.poiSetBadge(down ? 'Hors ligne 📴' : 'Prêt 🛰️');
            if (!m) return;
            try {
                if (down) { if (has && !m.isStyleLoaded()) this.applyMapTheme(); }                              // style jamais chargé : on le recharge depuis la copie locale
                else { const sc = m.style && m.style.sourceCaches; if (sc) Object.keys(sc).forEach(k => { try { sc[k].reload(); } catch (e) {} }); }   // tuiles manquantes hors zone : on les redemande
            } catch (e) {}
        });
    },
    // Hors connexion (réellement ou détecté) ? Sert à la recherche et au calcul d'itinéraire.
    isOffline() { return typeof OfflineMaps !== 'undefined' ? OfflineMaps.isDown() : navigator.onLine === false; }
});
setTimeout(() => { try { OfflineMaps.upgradeLegacy(); } catch (e) {} }, 3500);
if (typeof ModuleGPS !== 'undefined') { try { ModuleGPS.offlineInit(); } catch (e) { console.warn('offline UI', e); } }
