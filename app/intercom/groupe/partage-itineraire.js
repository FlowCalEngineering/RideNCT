// Partage d'itinéraire dans un canal vocal : les motards du même canal reçoivent le tracé (liaison directe chiffrée, comme la musique)
// et peuvent l'ouvrir sur la carte ou l'enregistrer dans leur bibliothèque.
const ModuleRouteShare = {
    MAX_POINTS: 400,
    $(id) { return document.getElementById(id); },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    // ---- Polyligne compacte (format Google, précision 5) ----
    encode(coords) {
        let out = '', pl = 0, pn = 0;
        const enc = (v) => { v = v < 0 ? ~(v << 1) : (v << 1); let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
        coords.forEach(c => { const la = Math.round(c[1] * 1e5), ln = Math.round(c[0] * 1e5); out += enc(la - pl) + enc(ln - pn); pl = la; pn = ln; });
        return out;
    },
    decode(str) {
        const out = []; let i = 0, la = 0, ln = 0;
        const next = () => { let r = 0, sh = 0, b; do { b = str.charCodeAt(i++) - 63; r |= (b & 0x1f) << sh; sh += 5; } while (b >= 0x20 && i <= str.length); return (r & 1) ? ~(r >> 1) : (r >> 1); };
        while (i < str.length) { la += next(); ln += next(); out.push([ln / 1e5, la / 1e5]); if (out.length > 5000) break; }
        return out;
    },
    // ---- Simplification (Douglas-Peucker en mètres) pour tenir en quelques Ko ----
    simplify(coords, tol) {
        if (coords.length < 3) return coords.slice();
        const mx = 111320 * Math.cos(coords[0][1] * Math.PI / 180), my = 110540, P = c => [c[0] * mx, c[1] * my];
        const keep = new Uint8Array(coords.length); keep[0] = keep[coords.length - 1] = 1;
        const st = [[0, coords.length - 1]];
        while (st.length) {
            const [a, b] = st.pop(); const A = P(coords[a]), B = P(coords[b]); let dmax = 0, idx = -1;
            const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
            for (let i = a + 1; i < b; i++) {
                const p = P(coords[i]); let t = l2 ? ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
                const d = Math.hypot(p[0] - (A[0] + t * dx), p[1] - (A[1] + t * dy)); if (d > dmax) { dmax = d; idx = i; }
            }
            if (idx > 0 && dmax > tol) { keep[idx] = 1; st.push([a, idx], [idx, b]); }
        }
        return coords.filter((c, i) => keep[i]);
    },
    compact(coords) { let tol = 8, out = coords; for (let k = 0; k < 8 && out.length > this.MAX_POINTS; k++) { out = this.simplify(coords, tol); tol *= 1.8; } return out; },
    distKm(coords) { let d = 0; for (let i = 1; i < coords.length; i++) d += ModuleGPS.calculateDistance(coords[i - 1], coords[i]); return d / 1000; },

    // ---- Envoi ----
    room() { return (typeof ModuleMusicShare !== 'undefined') ? ModuleMusicShare.roomPeers() : []; },
    sources() {
        const list = [], cur = ModuleGPS.state.currentGeoJSON;
        if (cur && cur.coordinates && cur.coordinates.length > 1) list.push({ title: ModuleGPS.state.currentRouteTitle || 'Itinéraire en cours', coords: cur.coordinates, tag: 'En cours sur la carte' });
        try { AppStore.get('moto_saved_routes', []).forEach(r => { if (r.geojson && r.geojson.coordinates && r.geojson.coordinates.length > 1) list.push({ title: r.title, coords: r.geojson.coordinates, tag: 'Bibliothèque' }); }); } catch (e) {}
        return list;
    },
    toast(m) { if (typeof AppDialog !== 'undefined') AppDialog.toast(m); },
    openPicker() {
        if (typeof AppSub !== 'undefined' && !AppSub.gate()) return;
        if (!this.room().length) return this.toast(typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state.isConnected ? 'Personne d\'autre dans le canal pour le moment' : 'Rejoins d\'abord un canal vocal');
        const old = this.$('rs-overlay'); if (old) old.remove();
        const src = this.sources(), ov = document.createElement('div'); ov.id = 'rs-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s;';
        ov.innerHTML = `<div style="background:var(--surface-color);border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:78vh;display:flex;flex-direction:column;padding:18px 16px calc(16px + env(safe-area-inset-bottom));">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;"><h3 style="margin:0;font-size:1.15rem;font-weight:900;color:var(--text-main);">Partager un itinéraire</h3><button type="button" data-x style="background:none;border:none;color:var(--text-muted);font-size:1.3rem;padding:4px 8px;cursor:pointer;">✕</button></div>
            <div style="font-size:.78rem;color:var(--text-muted);font-weight:600;margin-bottom:12px;">Envoyé aux ${this.room().length} motard(s) de ton canal.</div>
            <div style="overflow-y:auto;display:flex;flex-direction:column;gap:8px;">${src.length ? src.map((s, i) => `<button type="button" data-i="${i}" style="display:flex;align-items:center;gap:12px;text-align:left;padding:12px 14px;border-radius:16px;border:1px solid rgba(128,128,128,.18);background:var(--bg-color);color:var(--text-main);font-family:inherit;cursor:pointer;"><span style="width:38px;height:38px;border-radius:12px;background:rgba(128,128,128,.14);color:var(--accent-color);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h8"/></svg></span><span style="min-width:0;flex:1;"><b style="display:block;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.esc(s.title)}</b><span style="font-size:.72rem;color:var(--text-muted);font-weight:700;">${s.tag} · ${this.distKm(s.coords).toFixed(1)} km</span></span></button>`).join('') : '<div style="text-align:center;color:var(--text-muted);font-size:.85rem;padding:24px 8px;">Aucun itinéraire. Crée-en un dans l\'onglet Carte ou importe un GPX dans la Bibliothèque.</div>'}</div></div>`;
        document.body.appendChild(ov); requestAnimationFrame(() => ov.style.opacity = '1');
        const close = () => { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 200); };
        ov.addEventListener('click', e => { if (e.target === ov) close(); }); ov.querySelector('[data-x]').addEventListener('click', close);
        ov.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { const s = src[+b.dataset.i]; close(); this.send(s.title, s.coords); if (s.tag !== 'En cours sur la carte') this.openOnMap({ title: s.title, coords: s.coords }); }));
    },
    // peers : liste de motards précise (partage « à un motard proche ») ; sinon tout le canal vocal
    send(title, coords, peers, near) {
        if (typeof AppSub !== 'undefined' && !AppSub.gate()) return;
        peers = peers || this.room(); if (!peers.length) return this.toast('Personne dans le canal');
        const pts = this.compact(coords), obj = { type: 'route', rid: ModuleCommunity.state.myId, name: (ModuleProfile.state.name || 'Un motard').slice(0, 30), title: String(title).slice(0, 80), km: +this.distKm(coords).toFixed(1), poly: this.encode(pts) };
        if (near) obj.near = 1;
        peers.forEach(p => ModuleCommunity.sendTo(p, obj));
        this.toast(`Itinéraire envoyé à ${peers.length} motard${peers.length > 1 ? 's' : ''} ✓`);
    },

    // ---- Réception ----
    onData(peer, m) {
        try {
            if (typeof m.poly !== 'string' || m.poly.length > 40000) return;
            const coords = this.decode(m.poly); if (coords.length < 2 || coords.some(c => !isFinite(c[0]) || !isFinite(c[1]) || Math.abs(c[1]) > 90 || Math.abs(c[0]) > 180)) return;
            const title = String(m.title || 'Itinéraire partagé').slice(0, 80), name = String(m.name || 'Un motard').slice(0, 30);
            const it = { title, name, km: +m.km || +this.distKm(coords).toFixed(1), coords };
            // Une navigation est en cours : on ne la remplace pas sans demander (bannière Ouvrir / Enregistrer). Sinon, lancement automatique.
            // Ouverture automatique seulement pour un membre de mon canal ou un ami ; un inconnu doit toujours être confirmé (Ouvrir / Enregistrer)
            let trusted = false; try { trusted = (typeof ModuleIntercom !== 'undefined' && ModuleIntercom.sameRoom(peer)) || ModuleCommunity.isFriend(peer.rid); } catch (e) {}
            if (ModuleGPS.state.isTracking || m.near || !trusted) return this.banner(it);   // envoi direct d'un motard proche ou inconnu : on demande toujours avant d'ouvrir
            it.auto = this.openOnMap(it); this.banner(it);
        } catch (e) {}
    },
    // Affiche l'itinéraire sur la carte (sans l'ajouter à la bibliothèque)
    openOnMap(it) {
        try {
            if (typeof AppManager !== 'undefined') AppManager.switchView('view-gps');
            ModuleGPS.openSavedRoute({ id: Date.now(), title: it.title, mode: 'Partagé', geojson: { type: 'LineString', coordinates: it.coords } });
            ModuleGPS.state.routeSaved = false;
            return true;
        } catch (e) { return false; }
    },
    save(it) {
        const geojson = { type: 'LineString', coordinates: it.coords };
        const route = { id: Date.now(), title: it.title, mode: 'Partagé', dist: String(it.km), time: '--', preview: ModuleGPS.generateRoutePreviewSVG ? ModuleGPS.generateRoutePreviewSVG(geojson) : '', geojson };
        let list = []; try { list = AppStore.get('moto_saved_routes', []); } catch (e) {}
        list.unshift(route); try { AppStore.set('moto_saved_routes', list); } catch (e) {}
        if (ModuleGPS.loadLibrary) ModuleGPS.loadLibrary();
        return route;
    },
    banner(it) {
        const old = this.$('rs-banner'); if (old) old.remove();
        const el = document.createElement('div'); el.id = 'rs-banner';
        el.style.cssText = 'position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translate(-50%,-30px);opacity:0;transition:.25s;z-index:10045;width:min(92vw,420px);background:var(--surface-color);color:var(--text-main);border:1px solid rgba(128,128,128,.25);border-radius:20px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);';
        el.innerHTML = `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;"><span style="width:40px;height:40px;border-radius:13px;background:rgba(128,128,128,.14);color:var(--accent-color);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h8"/></svg></span><div style="min-width:0;flex:1;"><div data-who style="font-size:.74rem;font-weight:800;color:var(--text-muted);"></div><div data-ttl style="font-size:.98rem;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div><div data-km style="font-size:.74rem;font-weight:700;color:var(--text-muted);"></div></div></div>
            <div style="display:flex;gap:8px;"><button type="button" data-a="open" style="flex:1.4;border:none;border-radius:14px;padding:11px;font-weight:900;font-size:.85rem;background:var(--accent-color);color:var(--on-accent);cursor:pointer;font-family:inherit;">Ouvrir</button><button type="button" data-a="save" style="flex:1;border:none;border-radius:14px;padding:11px;font-weight:800;font-size:.85rem;background:rgba(128,128,128,.16);color:var(--text-main);cursor:pointer;font-family:inherit;">Enregistrer</button><button type="button" data-a="no" style="border:none;border-radius:14px;padding:11px 14px;font-weight:800;font-size:.85rem;background:transparent;color:var(--text-muted);cursor:pointer;font-family:inherit;">✕</button></div>`;
        el.querySelector('[data-who]').textContent = it.auto ? `${it.name} a partagé un itinéraire · ouvert sur ta carte` : `${it.name} partage un itinéraire`; if (it.auto) el.querySelector('[data-a="open"]').style.display = 'none'; el.querySelector('[data-ttl]').textContent = it.title; el.querySelector('[data-km]').textContent = `${it.km} km`;
        document.body.appendChild(el); requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translate(-50%,0)'; });
        const close = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 250); };
        el.querySelector('[data-a="no"]').addEventListener('click', close);
        el.querySelector('[data-a="save"]').addEventListener('click', () => { this.save(it); this.toast('Itinéraire enregistré ✓'); close(); });
        el.querySelector('[data-a="open"]').addEventListener('click', () => { this.save(it); close(); if (!this.openOnMap(it)) this.toast('Itinéraire enregistré — ouvre-le depuis la Bibliothèque'); });
        clearTimeout(this._bt); this._bt = setTimeout(close, 45000);
    },
    init() { const b = this.$('ic-route-share-btn'); if (b) b.addEventListener('click', () => this.openPicker()); }
};
document.addEventListener('DOMContentLoaded', () => ModuleRouteShare.init());
