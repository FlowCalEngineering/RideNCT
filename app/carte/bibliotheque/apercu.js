// Bibliothèque et Roadbook : vraie carte derrière le tracé + icône « carte téléchargée »
// Étend ModuleGPS : ce fichier doit être chargé APRÈS bibliotheque.js, roadbook.js et playlists.js.
(function () {
    const W = 360, H = 180;
    const _lib = ModuleGPS.loadLibrary, _rides = ModuleGPS.loadRecordedRides;
    const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
    const sample = (coords, n) => { if (coords.length <= n) return coords; const out = []; for (let i = 0; i < n; i++) out.push(coords[Math.round(i * (coords.length - 1) / (n - 1))]); return out; };

    // ---------- Carte téléchargée ? ----------
    const km = (a, b) => { const r = Math.PI / 180, dy = (b[1] - a[1]) * 111.32, dx = (b[0] - a[0]) * 111.32 * Math.cos((a[1] + b[1]) / 2 * r); return Math.hypot(dx, dy); };
    const distSeg = (p, a, b) => {
        const kx = 111.32 * Math.cos(p[1] * Math.PI / 180), ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * 111.32, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * 111.32;
        const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? -(ax * dx + ay * dy) / l : 0; t = Math.max(0, Math.min(1, t));
        return Math.hypot(ax + t * dx, ay + t * dy);
    };
    const inZone = (p, z) => {
        const s = z.shape;
        if (s && s.type === 'circle') return km(p, s.center) <= s.km + 0.2;
        if (s && s.type === 'line' && s.coords && s.coords.length > 1) { for (let i = 1; i < s.coords.length; i++) if (distSeg(p, s.coords[i - 1], s.coords[i]) <= s.km + 0.3) return true; return false; }
        const b = z.bbox; return !!b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];   // anciennes cartes : rectangle englobant
    };
    ModuleGPS.routeCovered = function (coords, zones) {
        if (!coords || coords.length < 2 || !zones || !zones.length) return false;
        return sample(coords, 24).every(p => zones.some(z => inZone(p, z)));
    };

    // ---------- Aperçu : miniature de la vraie carte, mise en cache ----------
    const getThumb = async (key) => { try { const r = await OfflineMaps._dbGet(key); return r && r.url ? r.url : null; } catch (e) { return null; } };
    const putThumb = async (key, url) => { try { await OfflineMaps._dbPut(key, { kind: 'thumb', url }); } catch (e) {} };
    const keyFor = (r) => { const c = r.geojson && r.geojson.coordinates; if (!c || c.length < 2) return null; return '/__thumb__/' + hash(AppTheme.getMapStyleUrl() + '|' + AppTheme.getRouteColor()) + '/' + r.id + '/' + c.length + '/' + hash(c[0].join(',') + c[c.length - 1].join(',')); };

    const queue = []; let running = false;
    const idle = (map, ms) => new Promise(res => {
        let done = false; const fin = (v) => { if (done) return; done = true; clearTimeout(t); map.off('idle', h); res(v); };
        const h = () => { if (map.areTilesLoaded()) fin(true); }, t = setTimeout(() => fin(false), ms);
        map.on('idle', h); map.triggerRepaint();
    });
    async function shoot(map, coords) {
        if (map.getLayer('th-line')) { map.removeLayer('th-line'); map.removeLayer('th-case'); map.removeLayer('th-pts'); map.removeSource('th'); }
        const pts = sample(coords, 400), color = AppTheme.getRouteColor();
        map.addSource('th', { type: 'geojson', data: { type: 'FeatureCollection', features: [
            { type: 'Feature', properties: { k: 'l' }, geometry: { type: 'LineString', coordinates: pts } },
            { type: 'Feature', properties: { k: 's' }, geometry: { type: 'Point', coordinates: pts[0] } },
            { type: 'Feature', properties: { k: 'e' }, geometry: { type: 'Point', coordinates: pts[pts.length - 1] } }] } });
        map.addLayer({ id: 'th-case', type: 'line', source: 'th', filter: ['==', 'k', 'l'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 7, 'line-opacity': 0.9 } });
        map.addLayer({ id: 'th-line', type: 'line', source: 'th', filter: ['==', 'k', 'l'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': 4 } });
        map.addLayer({ id: 'th-pts', type: 'circle', source: 'th', filter: ['!=', 'k', 'l'], paint: { 'circle-radius': 6, 'circle-color': ['match', ['get', 'k'], 's', '#30d158', '#ff453a'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        let w = 180, s = 90, e = -180, n = -90; pts.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); });
        map.fitBounds([[w, s], [e, n]], { padding: 26, animate: false, maxZoom: 14 });
        if (!(await idle(map, 8000))) return null;      // tuiles introuvables (hors ligne sans carte) : on garde le tracé simple
        return map.getCanvas().toDataURL('image/jpeg', 0.72);
    }
    async function pump() {
        running = true; let map = null, host = null;
        const drop = () => { try { if (map) map.remove(); } catch (e) {} if (host) host.remove(); map = null; host = null; };
        try {
            while (queue.length) {
                const job = queue.shift();
                try {
                    if (!map) {
                        host = document.createElement('div'); host.style.cssText = `position:fixed;left:-9999px;top:0;width:${W}px;height:${H}px;pointer-events:none`; document.body.appendChild(host);
                        map = new maplibregl.Map({ container: host, style: AppTheme.getMapStyleUrl(), center: [2.2, 46.2], zoom: 4, interactive: false, attributionControl: false, preserveDrawingBuffer: true, fadeDuration: 0, pixelRatio: 1,
                            transformRequest: (url, type) => (typeof OfflineMaps !== 'undefined' ? OfflineMaps.transform(url, type) : undefined) });
                        await new Promise((res, rej) => { map.once('load', res); setTimeout(() => rej(new Error('style')), 12000); });
                    }
                    const url = await shoot(map, job.coords);
                    if (url) { await putThumb(job.key, url); job.done(url); }
                } catch (e) { console.warn('aperçu de carte', e); drop(); }
            }
        } finally { drop(); running = false; }
    }
    const requestThumb = (key, coords, done) => { if (queue.some(j => j.key === key)) return; queue.push({ key, coords, done }); if (!running) pump(); };

    // ---------- Pose les miniatures et les icônes sur les cartes déjà dessinées ----------
    // Une seule icône en haut à droite : « télécharger » (contour) ou « carte téléchargée » (vert, coche). Un appui ouvre le téléchargement / la mise à jour.
    const SVG = (d) => `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;pointer-events:none">${d}</svg>`;
    const ICON_DL = SVG('<path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 20h14"/>'), ICON_OK = SVG('<path d="M5 12.5l4.5 4.5L19 7"/>');
    const BTN_CSS = 'position:absolute;top:10px;right:10px;width:38px;height:38px;border-radius:50%;border:1.5px solid var(--accent-color);background:rgba(28,28,30,0.85);color:var(--accent-color);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;';
    function stateBtn(el, r, done) {
        let b = el.querySelector('.dl-btn') || el.querySelector('button[aria-label="Télécharger la carte hors ligne"]');
        if (!b) {
            b = document.createElement('button'); b.type = 'button'; b.style.cssText = BTN_CSS;
            ['mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove'].forEach(ev => b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));   // pas d'appui long sur la carte
            b.addEventListener('click', (e) => { e.stopPropagation(); ModuleGPS.offlineRoute(r.title, r.geojson.coordinates); });
            el.appendChild(b);
        }
        b.classList.add('dl-btn'); b.classList.toggle('done', done);
        b.innerHTML = done ? ICON_OK : ICON_DL;
        const lab = done ? 'Carte téléchargée : appuyer pour mettre à jour' : 'Télécharger la carte hors ligne';
        b.title = lab; b.setAttribute('aria-label', lab);
    }
    async function decorate(container, items) {
        if (!container || typeof maplibregl === 'undefined') return;
        const cards = [...container.children]; if (cards.length !== items.length) return;
        let zones = []; try { zones = await OfflineMaps.zones(); } catch (e) {}
        if (!container.isConnected || container.children.length !== cards.length) return;
        for (let i = 0; i < items.length; i++) {
            const r = items[i], el = cards[i], coords = r.geojson && r.geojson.coordinates; if (!el || !el.isConnected) continue;
            stateBtn(el, r, ModuleGPS.routeCovered(coords, zones));
            const key = keyFor(r); if (!key) continue;
            const box = el.firstElementChild; if (!box) continue;
            const show = (url) => { if (!box.isConnected) return; box.innerHTML = `<img alt="" src="${url}" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none">`; };
            const cached = await getThumb(key);
            if (cached) show(cached); else requestThumb(key, coords, show);
        }
    }

    // ---------- Servi aux autres écrans (pop-up de fin de trajet, accueil, image de partage) ----------
    // Miniature de la vraie carte avec le tracé (même cache que le Roadbook) ; null si les tuiles sont introuvables
    ModuleGPS.mapThumb = async function (rec) {
        try {
            if (typeof maplibregl === 'undefined' || !rec || !rec.geojson) return null;
            const coords = rec.geojson.coordinates, key = keyFor(rec); if (!key) return null;
            const c = await getThumb(key); if (c) return c;
            return await new Promise(res => { let ok = false; requestThumb(key, coords, (u) => { ok = true; res(u); }); setTimeout(() => { if (!ok) res(null); }, 20000); });
        } catch (e) { return null; }
    };
    // Fond de carte seul (sans tracé) à la taille demandée + position en pixels de chaque point du tracé : l'image de partage dessine son propre tracé par-dessus
    ModuleGPS.mapShot = async function (coords, w, h, pr) {
        let map = null, host = null;
        try {
            if (typeof maplibregl === 'undefined' || !coords || coords.length < 2) return null;
            host = document.createElement('div'); host.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px;pointer-events:none`; document.body.appendChild(host);
            map = new maplibregl.Map({ container: host, style: AppTheme.getMapStyleUrl(), center: [2.2, 46.2], zoom: 4, interactive: false, attributionControl: false, preserveDrawingBuffer: true, fadeDuration: 0, pixelRatio: pr || 2,
                transformRequest: (url, type) => (typeof OfflineMaps !== 'undefined' ? OfflineMaps.transform(url, type) : undefined) });
            await new Promise((res, rej) => { map.once('load', res); setTimeout(() => rej(new Error('style')), 12000); });
            const pts = sample(coords, 300); let x0 = 180, y0 = 90, x1 = -180, y1 = -90; pts.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
            map.fitBounds([[x0, y0], [x1, y1]], { padding: Math.round(Math.min(w, h) * 0.12), animate: false, maxZoom: 15 });
            if (!(await idle(map, 9000))) return null;
            const pos = coords.length > 400 ? sample(coords, 400) : coords;
            return { url: map.getCanvas().toDataURL('image/jpeg', 0.8), w, h, pts: pos.map(c => { const q = map.project(c); return [q.x, q.y]; }) };
        } catch (e) { return null; }
        finally { try { if (map) map.remove(); } catch (e) {} if (host) host.remove(); }
    };

    Object.assign(ModuleGPS, {
        loadLibrary() { _lib.apply(this, arguments); try { decorate(document.getElementById('library-container'), AppStore.get('moto_saved_routes', [])); } catch (e) { console.warn('aperçu', e); } },
        loadRecordedRides() { _rides.apply(this, arguments); try { AppStore.space().then(sp => { const e = document.getElementById('rides-space'); if (!e) return; const n = AppStore.get('moto_recorded_rides', []).length; const f = sp && sp.quota ? (sp.free > 1e9 ? (sp.free / 1e9).toFixed(1).replace('.', ',') + ' Go' : Math.round(sp.free / 1e6) + ' Mo') : null; e.textContent = n ? (n + ' balade' + (n > 1 ? 's' : '') + ' enregistrée' + (n > 1 ? 's' : '') + ' sur ton téléphone' + (f ? ' · place libre : ' + f : '')) : ''; }); } catch (e) {} try { decorate(document.getElementById('recorded-rides-container'), AppStore.get('moto_recorded_rides', [])); } catch (e) { console.warn('aperçu', e); } }
    });
})();
