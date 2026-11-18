// Roadbook › Communauté : publier / prendre un trajet sur le serveur (trace simplifiée, description, durée, km, difficulté)
const ModuleRoutes = {
    LV: {
        balade: { n: 'Balade', c: '#30d158', i: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.7-7"/>' },
        dynamique: { n: 'Dynamique', c: '#ff9f0a', i: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>' },
        fifou: { n: 'Fifou', c: '#ff453a', i: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.4 1-3 0 1.4 1 2.5 2.5 2.5z"/>' }
    },
    IC: { km: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>', t: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>', dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', ko: '<path d="M4 4h16v16H4zM4 12h16"/>' },
    st: { level: '', q: '', region: '', off: 0, rows: [], more: false, busy: false },
    svg(d, c) { return `<svg viewBox="0 0 24 24"${c ? ` style="color:${c}"` : ''}>${d}</svg>`; },
    // ---- Régions : détectées depuis le point de départ (préfecture la plus proche, sans réseau ni position) ----
    REG: ['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', "Provence-Alpes-Côte d'Azur", 'Hors de France'],
    PREF: [[46.205,5.226,0],[46.566,3.334,0],[44.735,4.599,0],[44.926,2.444,0],[44.933,4.892,0],[45.188,5.725,0],[45.439,4.387,0],[45.043,3.885,0],[45.777,3.087,0],[45.764,4.836,0],[45.565,5.921,0],[45.899,6.129,0],
        [47.322,5.041,1],[47.238,6.024,1],[46.675,5.555,1],[46.990,3.159,1],[47.620,6.155,1],[46.307,4.829,1],[47.798,3.567,1],[47.640,6.863,1],
        [48.514,-2.760,2],[47.996,-4.102,2],[48.117,-1.678,2],[47.658,-2.760,2],
        [47.081,2.399,3],[48.447,1.489,3],[46.811,1.694,3],[47.394,0.684,3],[47.586,1.335,3],[47.903,1.909,3],
        [41.919,8.739,4],[42.697,9.451,4],
        [49.762,4.719,5],[48.297,4.074,5],[48.957,4.363,5],[48.113,5.139,5],[48.692,6.184,5],[48.773,5.161,5],[49.119,6.176,5],[48.573,7.752,5],[48.079,7.358,5],[48.173,6.449,5],
        [49.564,3.620,6],[50.629,3.057,6],[49.430,2.082,6],[50.292,2.781,6],[49.895,2.302,6],
        [48.857,2.352,7],[48.540,2.660,7],[48.801,2.130,7],[48.629,2.441,7],[48.892,2.207,7],[48.909,2.439,7],[48.790,2.455,7],[49.036,2.063,7],
        [49.182,-0.371,8],[49.027,1.151,8],[49.116,-1.090,8],[48.432,0.091,8],[49.443,1.100,8],
        [45.649,0.156,9],[46.160,-1.152,9],[45.267,1.768,9],[46.171,1.871,9],[45.184,0.722,9],[44.838,-0.579,9],[43.890,-0.500,9],[44.203,0.617,9],[43.295,-0.371,9],[46.324,-0.460,9],[46.580,0.340,9],[45.833,1.262,9],
        [42.965,1.605,10],[43.213,2.349,10],[44.350,2.575,10],[43.837,4.360,10],[43.605,1.444,10],[43.646,0.586,10],[43.611,3.877,10],[44.448,1.441,10],[44.518,3.500,10],[43.233,0.078,10],[42.699,2.895,10],[43.929,2.148,10],[44.018,1.355,10],
        [47.218,-1.554,11],[47.478,-0.563,11],[48.070,-0.770,11],[48.006,0.200,11],[46.670,-1.426,11],
        [44.092,6.236,12],[44.559,6.079,12],[43.710,7.262,12],[43.296,5.370,12],[43.124,5.928,12],[43.949,4.806,12]],
    region(co) {
        const a = co && co[0]; if (!a || !isFinite(a[0]) || !isFinite(a[1])) return 'Hors de France';
        let best = 1e9, bi = 13; this.PREF.forEach(p => { const d = this.dist([a[0], a[1]], [p[1], p[0]]); if (d < best) { best = d; bi = p[2]; } });
        return best > 75000 ? 'Hors de France' : this.REG[bi];
    },
    // ---- Trace : simplification (Douglas-Peucker) + polyline encodée (précision 5) ----
    dist(a, b) { const R = 6371000, r = Math.PI / 180, dLa = (b[1] - a[1]) * r, dLo = (b[0] - a[0]) * r, h = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); },
    simplify(co, max) {
        const k = Math.cos(co[0][1] * Math.PI / 180), P = co.map(c => [c[0] * 111320 * k, c[1] * 110540]);
        const dp = (tol) => { const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
            while (st.length) { const [s, e] = st.pop(); let md = 0, mi = -1; const ax = P[s][0], ay = P[s][1], bx = P[e][0], by = P[e][1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
                for (let i = s + 1; i < e; i++) { let d; if (!L) d = Math.hypot(P[i][0] - ax, P[i][1] - ay); else { const t = Math.max(0, Math.min(1, ((P[i][0] - ax) * dx + (P[i][1] - ay) * dy) / L)); d = Math.hypot(P[i][0] - ax - t * dx, P[i][1] - ay - t * dy); } if (d > md) { md = d; mi = i; } }
                if (mi > 0 && md > tol) { keep[mi] = 1; st.push([s, mi], [mi, e]); } }
            return co.filter((_, i) => keep[i]); };
        let tol = 8, out = dp(tol); while (out.length > max && tol < 5000) { tol *= 1.4; out = dp(tol); } return out;
    },
    enc(co) { let la = 0, lo = 0, s = ''; const w = (v) => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 32) { s += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } s += String.fromCharCode(v + 63); };
        co.forEach(c => { const a = Math.round(c[1] * 1e5), o = Math.round(c[0] * 1e5); w(a - la); w(o - lo); la = a; lo = o; }); return s; },
    dec(s) { const out = []; let i = 0, la = 0, lo = 0; const r = () => { let b, sh = 0, v = 0; do { b = s.charCodeAt(i++) - 63; v |= (b & 31) << sh; sh += 5; } while (b >= 32 && i <= s.length); return v & 1 ? ~(v >> 1) : v >> 1; };
        while (i < s.length) { la += r(); lo += r(); out.push([lo / 1e5, la / 1e5]); } return out; },
    meters(co) { let d = 0; for (let i = 1; i < co.length; i++) d += this.dist(co[i - 1], co[i]); return d; },
    // ---- Affichage ----
    fmtDur(m) { return m >= 60 ? Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') : m + ' min'; },
    fmtKm(m) { return AppUnits.km(m / 1000).toFixed(m >= 100000 ? 0 : 1).replace('.', ','); },
    ago(t) { const s = (Date.now() - new Date(t).getTime()) / 1000; if (!isFinite(s)) return ''; if (s < 3600) return 'à l\'instant'; if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; if (s < 2592000) return 'il y a ' + Math.floor(s / 86400) + ' j'; return 'il y a ' + Math.floor(s / 2592000) + ' mois'; },
    trace(co, c, big, opt) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const k = Math.cos(co[0][1] * Math.PI / 180);
        co.forEach(p => { const x = p[0] * k, y = -p[1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
        const dots = big || (opt && opt.dots), W = 340, H = (opt && opt.h) || (big ? 200 : 118), m = 30, s = Math.min((W - 2 * m) / Math.max(x1 - x0, 1e-9), (H - 2 * m) / Math.max(y1 - y0, 1e-9)), ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
        const q = (p) => [(ox + (p[0] * k - x0) * s).toFixed(1), (oy + (-p[1] - y0) * s).toFixed(1)], d = 'M' + co.map(p => q(p).join(' ')).join('L'), a = q(co[0]), b = q(co[co.length - 1]);
        return `<svg class="cm-t" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><path d="${d}" style="stroke:${c};color:${c}" fill="none"/>${dots ? `<circle cx="${a[0]}" cy="${a[1]}" r="7" fill="#30d158" stroke="#161618" stroke-width="2"/><circle cx="${b[0]}" cy="${b[1]}" r="7" fill="#ff453a" stroke="#161618" stroke-width="2"/>` : ''}</svg>`;
    },
    lvTag(l) { const v = this.LV[l] || this.LV.balade; return `<span class="cm-lv" style="background:${v.c}">${this.svg(v.i)}${v.n}</span>`; },
    kpi(r, x) { return `<div class="cm-k"><div>${this.svg(this.IC.km, '#0a84ff')}<b>${this.fmtKm(r.dist_m)}<small>${AppUnits.distLabel()}</small></b></div><div>${this.svg(this.IC.t, '#ff9f0a')}<b>${this.fmtDur(r.dur_min)}</b></div>${x || ''}</div>`; },
    // ---- Carte d'un trajet enregistré (Roadbook) ou sauvegardé (Bibliothèque) ----
    card(item, route, o) {
        item.className = 'cm-card rb-card'; const co = (route.geojson && route.geojson.coordinates) || [], st = route.stats || {};
        const km = parseFloat(route.dist), tm = String(route.time || '').replace(/\s+/g, '').replace('m', ''), tk = [];
        if (isFinite(km)) tk.push(`<div>${this.svg(this.IC.km, '#0a84ff')}<b>${this.fmtKm(km * 1000)}<small>${AppUnits.distLabel()}</small></b></div>`);
        if (tm && tm !== '--') tk.push(`<div>${this.svg(this.IC.t, '#ff9f0a')}<b>${escHtml(tm.replace(/(\d)$/, '$1').replace(/^(\d+)h(\d+)$/, '$1h$2'))}${/^\d+$/.test(tm) ? '<small>min</small>' : ''}</b></div>`);
        if (st.avg) tk.push(`<div>${this.svg('<path d="M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0"/>', '#bf5af2')}<b>${AppUnits.spd(st.avg)}<small>${AppUnits.speedLabel()}</small></b></div>`);
        const chips = (typeof ModuleGPS.rideChips === 'function' && route.stats) ? ModuleGPS.rideChips(route) : [];
        const mode = String(route.mode || '').replace(/^Mode\s+/i, ''), pub = route.geojson && co.length > 1 && route.mode !== 'Communauté';
        const done = pub && this.published(route, o.src), pr = o.primary;
        const btns = (pr ? `<button type="button" class="cm-ab ${pr.cls || ''}">${this.svg(pr.icon)}${pr.label}</button>` : '') + (pub ? (done ? `<button type="button" class="cm-ab s2 rb-pub done" disabled>${this.svg('<path d="M5 13l4 4L19 7"/>')}Publié</button>` : `<button type="button" class="cm-ab s2 rb-pub">${this.svg('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M19 8v6M16 11h6"/>')}Publier</button>`) : '');
        item.innerHTML = `<div class="cm-map">${co.length > 1 ? this.trace(co, '#ff6a1a', false, { dots: true, h: 130 }) : ''}</div><span class="cm-pill">${escHtml(mode)}</span>
            <div class="cm-bd"><div class="cm-tt">${escHtml(String(route.title == null ? 'Itinéraire' : route.title).replace('📍 Ma position actuelle', 'Ma Position'))}</div>
            ${tk.length ? `<div class="cm-k">${tk.join('')}</div>` : ''}${chips.length ? `<div class="cm-chp">${chips.map(c => `<span style="background:${c[0]}26;color:${c[0]}">${c[1]}</span>`).join('')}</div>` : ''}
            ${btns ? `<div class="cm-act">${btns}</div>` : ''}</div>`;
        const stop = (b) => { ['mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove'].forEach(ev => b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true })); };
        item.querySelectorAll('.cm-ab').forEach(stop);
        const pb = item.querySelector('button.rb-pub:not(.done)'); if (pb) pb.addEventListener('click', (e) => { e.stopPropagation(); this.openPublish(route, o.src); });
        const mb = item.querySelector('.cm-ab:not(.rb-pub)'); if (mb && pr) mb.addEventListener('click', (e) => { e.stopPropagation(); pr.fn(); });
    },
    // ---- Réseau ----
    api(fn, body) { return (typeof AppAuth !== 'undefined' && AppAuth.has()) ? AppAuth.rpc(fn, body) : AppAuth.pub(fn, body); },
    errText(r) { const m = JSON.stringify((r && r.json) || '') + ''; return !r || r.status === 0 ? 'Pas de connexion Internet. Vérifie ton réseau et réessaie.' : r.status === 429 || /rate_limit|54000/.test(m) ? 'Trop de publications aujourd\'hui. Réessaie demain.' : /terme_interdit/.test(m) ? 'Ce titre ou cette description n\'est pas autorisé.' : /pseudo_requis/.test(m) ? 'Choisis d\'abord un pseudo dans Réglages › Compte.' : /banni/.test(m) ? 'Ton compte ne peut pas publier.' : r.status === 404 ? 'Le service n\'est pas encore disponible.' : 'Une erreur est survenue. Réessaie dans un instant.'; },
    async load(reset) {
        const s = this.st, box = document.getElementById('cm-list'); if (!box || s.busy) return; if (reset) { s.off = 0; s.rows = []; s.more = false; }
        s.busy = true; this.paintList('load');
        const r = await this.api('list_routes', { p_level: s.level || null, p_q: s.q || null, p_off: s.off, p_region: s.region || null });
        s.busy = false;
        if (!r.ok || !Array.isArray(r.json)) { this.paintList('err', r); return; }
        s.rows = s.rows.concat(r.json); s.off += r.json.length; s.more = r.json.length >= 20; this.paintList();
    },
    paintList(mode, r) {
        const box = document.getElementById('cm-list'), s = this.st; if (!box) return;
        if (mode === 'load' && !s.rows.length) { box.innerHTML = '<div class="cm-empty">Chargement…</div>'; return; }
        if (mode === 'err') { box.innerHTML = `<div class="cm-empty">${escHtml(this.errText(r))}<button type="button" class="cm-retry">Réessayer</button></div>`; box.querySelector('.cm-retry').onclick = () => this.load(true); return; }
        if (!s.rows.length) { box.innerHTML = '<div class="cm-empty">Aucun trajet pour le moment. Sois le premier à en publier un.</div>'; return; }
        box.innerHTML = s.rows.map((r, i) => { let co = []; try { co = this.dec(r.pts); } catch (e) {} const lv = this.LV[r.level] || this.LV.balade;
            return `<button type="button" class="cm-card" data-i="${i}"><div class="cm-map">${co.length > 1 ? this.trace(co, '#ff6a1a') : ''}${this.lvTag(r.level)}<span class="cm-dl">${this.svg(this.IC.dl)}${r.downloads | 0}</span></div>
                <div class="cm-bd"><div class="cm-tt">${escHtml(r.title)}</div>${r.description ? `<div class="cm-desc">${escHtml(r.description)}</div>` : ''}${this.kpi(r)}</div>
                <div class="cm-au"><span class="cm-av">${escHtml((r.author || '?').charAt(0).toUpperCase())}</span>${r.region ? escHtml(r.region) + ' · ' : ''}${escHtml(r.author)} · ${this.ago(r.created_at)}</div></button>`; }).join('') + (s.more ? '<button type="button" class="cm-more">Voir plus</button>' : '');
        box.querySelectorAll('.cm-card').forEach(b => b.onclick = () => this.detail(s.rows[+b.dataset.i]));
        const mb = box.querySelector('.cm-more'); if (mb) mb.onclick = () => this.load(false);
    },
    // ---- Détail ----
    gpx(r, co) { const x = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RideNCT" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${x(r.title)}</name>${r.description ? `<desc>${x(r.description)}</desc>` : ''}<trkseg>${co.map(c => `<trkpt lat="${c[1].toFixed(5)}" lon="${c[0].toFixed(5)}"/>`).join('')}</trkseg></trk></gpx>`; },
    counted() { try { return JSON.parse(localStorage.getItem('rn_rt_dl') || '[]'); } catch (e) { return []; } },
    count(r) { const c = this.counted(); if (c.includes(r.id)) return; c.push(r.id); try { localStorage.setItem('rn_rt_dl', JSON.stringify(c.slice(-200))); } catch (e) {} r.downloads = (r.downloads | 0) + 1; this.api('route_downloaded', { p_id: r.id }); },
    detail(r) {
        const old = document.getElementById('cm-ov'); if (old) old.remove(); let co = []; try { co = this.dec(r.pts); } catch (e) {} if (co.length < 2) return;
        const lv = this.LV[r.level] || this.LV.balade, ov = document.createElement('div'); ov.id = 'cm-ov'; ov.className = 'cm-ov';
        ov.innerHTML = `<div class="cm-sheet"><div class="cm-hd"><b class="cm-h1">${escHtml(r.title)}</b><button type="button" class="aide-x" id="cm-x" aria-label="Fermer">✕</button></div>
            <div class="cm-map cm-big">${this.trace(co, lv.c, true)}${this.lvTag(r.level)}</div>
            ${r.description ? `<div class="cm-desc" style="font-size:.85rem">${escHtml(r.description)}</div>` : ''}
            ${this.kpi(r, `<div>${this.svg(this.IC.dl, '#30d158')}<b>${r.downloads | 0}</b></div>`)}
            <div class="cm-au" style="margin-top:12px"><span class="cm-av">${escHtml((r.author || '?').charAt(0).toUpperCase())}</span>${r.region ? escHtml(r.region) + ' · ' : ''}${escHtml(r.author)} · ${this.ago(r.created_at)}</div>
            <button type="button" class="cm-btn" id="cm-add">${this.svg('<path d="M12 5v14M5 12h14"/>')}Ajouter à mes trajets</button>
            <button type="button" class="cm-btn s2" id="cm-gpx">${this.svg(this.IC.dl)}Télécharger le GPX</button>
            ${r.mine ? `<button type="button" class="cm-btn s2 red" id="cm-del">${this.svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}Supprimer mon trajet</button>` : `<button type="button" class="cm-btn s2 red" id="cm-rep">${this.svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')}Signaler</button>`}</div>`;
        document.body.appendChild(ov);
        const close = () => ov.remove(); ov.querySelector('#cm-x').onclick = close; ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        const route = () => ({ title: r.title, geojson: { type: 'LineString', coordinates: co } });
        ov.querySelector('#cm-add').onclick = (e) => { const b = e.currentTarget; if (b.disabled) return; const km = (r.dist_m / 1000).toFixed(1), g = route().geojson, list = AppStore.get('moto_saved_routes', []);
            list.unshift({ id: Date.now(), title: r.title, mode: 'Communauté', dist: km, time: this.fmtDur(r.dur_min), preview: ModuleGPS.generateRoutePreviewSVG(g), geojson: g });
            if (!AppStore.set('moto_saved_routes', list)) return; try { ModuleGPS.loadLibrary(); } catch (er) {} this.count(r); b.disabled = true; b.innerHTML = this.svg('<path d="M5 13l4 4L19 7"/>') + 'Ajouté à ta bibliothèque'; };
        ov.querySelector('#cm-gpx').onclick = () => { this.count(r); try { ModuleGPS.exportToGPXFile(route()); } catch (e) {} };
        const rb = ov.querySelector('#cm-rep'); if (rb) rb.onclick = async () => { if (!(await AppDialog.confirm('Signaler ce trajet à la modération ?', { okText: 'Signaler' }))) return; if (!AppAuth.has()) { AppDialog.alert('Connecte-toi pour signaler un trajet.'); return; } const x = await AppAuth.rpc('report_route', { p_id: r.id }); if (!x.ok) AppDialog.alert(this.errText(x), { title: 'Signalement' }); else { rb.disabled = true; rb.textContent = 'Signalé'; } };
        const db = ov.querySelector('#cm-del'); if (db) db.onclick = async () => { if (!(await AppDialog.confirm('Supprimer ce trajet de la communauté ?', { okText: 'Supprimer' }))) return; const x = await AppAuth.rpc('delete_my_route', { p_id: r.id }); if (!x.ok) { AppDialog.alert(this.errText(x), { title: 'Suppression' }); return; } this.st.rows = this.st.rows.filter(z => z.id !== r.id); this.paintList(); close(); };
    },
    // ---- Publication ----
    pubMap() { try { return JSON.parse(localStorage.getItem('rn_rt_pub') || '{}'); } catch (e) { return {}; } },
    published(rec, src) { return !!this.pubMap()[(src || 'r') + rec.id]; },
    openPublish(rec, src) {
        const co0 = rec && rec.geojson && rec.geojson.coordinates; if (!co0 || co0.length < 2) return;
        if (typeof AppAuth === 'undefined' || !AppAuth.has()) { AppDialog.alert('Connecte-toi pour publier un trajet.', { title: 'Publier' }); return; }
        if (!AppWarn.done('roadbook-public')) { AppWarn.ask('roadbook-public').then(ok => { if (ok) this.openPublish(rec, src); }); return; }
        const old = document.getElementById('cm-pub'); if (old) old.remove();
        const co = this.simplify(co0, 300), pts = this.enc(co), dm = Math.round(this.meters(co0));
        const sec = rec.stats && rec.stats.dur ? rec.stats.dur : 0, tm = String(rec.time || ''), mh = tm.match(/(\d+)\s*h\s*(\d+)?/), hh = mh ? +mh[1] : 0, mm = mh && mh[2] ? +mh[2] : (parseInt((tm.match(/(\d+)\s*m/) || [0, 0])[1]) || 0);
        let dur = sec > 0 ? Math.max(1, Math.round(sec / 60)) : hh * 60 + mm; const known = dur > 0;
        let level = 'balade'; const ov = document.createElement('div'); ov.id = 'cm-pub'; ov.className = 'cm-ov';
        const region = this.region(co0), row = { dist_m: dm, dur_min: dur };
        const durIn = known ? '' : `<div class="cm-dur"><span>${this.svg(this.IC.t, '#ff9f0a')}Durée de la balade</span><input id="cp-h" type="number" min="0" max="49" inputmode="numeric" placeholder="0"><em>h</em><input id="cp-m" type="number" min="0" max="59" inputmode="numeric" placeholder="0"><em>min</em></div>`;
        ov.innerHTML = `<div class="cm-sheet"><div class="cm-hd"><b>Publier le trajet</b><button type="button" class="aide-x" id="cp-x" aria-label="Fermer">✕</button></div>
            <div class="cm-map cm-prev">${this.trace(co, '#4da3ff', true)}</div>
            <input id="cp-t" class="cm-in" maxlength="60" placeholder="Titre" value="${escHtml(String(rec.title || '').slice(0, 60))}">
            <textarea id="cp-d" class="cm-in" maxlength="300" rows="2" placeholder="Description (300 caractères max)"></textarea>
            ${durIn}<div class="cm-lvs">${Object.keys(this.LV).map(k => `<button type="button" data-l="${k}" class="${k === level ? 'on' : ''}" style="--lc:${this.LV[k].c}"><span class="cm-ic">${this.svg(this.LV[k].i)}</span>${this.LV[k].n}</button>`).join('')}</div>
            ${known ? this.kpi(row, `<div>${this.svg(this.IC.ko, '#32ade6')}<b>${Math.max(1, Math.round(pts.length / 1024))}<small>Ko</small></b></div>`) : ''}
            <div class="cm-rgn">${this.svg('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>', '#64d2ff')}<span>Région</span><b>${escHtml(region)}</b></div>
            <div class="cm-hint">Seule la trace simplifiée est publiée : pas de photo, pas de mesures du téléphone. Ton pseudo est affiché.</div>
            <button type="button" class="cm-btn" id="cp-go">Publier</button></div>`;
        document.body.appendChild(ov); const close = () => ov.remove(); ov.querySelector('#cp-x').onclick = close;
        ov.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { level = b.dataset.l; ov.querySelectorAll('[data-l]').forEach(x => x.classList.toggle('on', x === b)); });
        ov.querySelector('#cp-go').onclick = async (e) => { const b = e.currentTarget, t = ov.querySelector('#cp-t').value.trim().slice(0, 60), d = ov.querySelector('#cp-d').value.trim();
            if (t.length < 3) { AppDialog.alert('Donne un titre d\'au moins 3 caractères.', { title: 'Publier' }); return; }
            if (!known) dur = (parseInt(ov.querySelector('#cp-h').value) || 0) * 60 + (parseInt(ov.querySelector('#cp-m').value) || 0);
            if (dur < 1 || dur > 3000) { AppDialog.alert('Indique la durée de la balade.', { title: 'Publier' }); return; }
            if (dm < 500) { AppDialog.alert('Le trajet est trop court pour être publié (500 m minimum).', { title: 'Publier' }); return; }
            b.disabled = true; const r = await AppAuth.rpc('publish_route', { p_title: t, p_desc: d, p_level: level, p_dist: dm, p_dur: dur, p_pts: pts, p_region: region }); b.disabled = false;
            if (!r.ok) { AppDialog.alert(this.errText(r), { title: 'Publier' }); return; }
            const m = this.pubMap(); m[(src || 'r') + rec.id] = typeof r.json === 'string' ? r.json : 1; try { localStorage.setItem('rn_rt_pub', JSON.stringify(m)); } catch (er) {}
            close(); try { ModuleGPS.loadRecordedRides(); ModuleGPS.loadLibrary(); if (typeof ModuleExpert !== 'undefined') ModuleExpert.renderHome(); } catch (er) {} this.load(true); };
    },
    setRegion(r) { this.st.region = r; const b = document.getElementById('cm-rg'); if (b) { b.classList.toggle('on', !!r); b.querySelector('span').textContent = r || 'Région'; const x = b.querySelector('.cm-x'); if (x) x.remove(); if (r) b.insertAdjacentHTML('beforeend', '<i class="cm-x" aria-label="Effacer">✕</i>'); } this.load(true); },
    async regionSheet() {
        const old = document.getElementById('cm-rgs'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'cm-rgs'; ov.className = 'cm-ov'; const cur = this.st.region;
        ov.innerHTML = `<div class="cm-sheet"><div class="cm-hd"><b>Région</b><button type="button" class="aide-x" id="rg-x" aria-label="Fermer">✕</button></div><div class="cm-rl"><div class="cm-empty" style="padding:20px 0">Chargement…</div></div></div>`;
        document.body.appendChild(ov); const close = () => ov.remove(); ov.querySelector('#rg-x').onclick = close; ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        const r = await this.api('route_regions', {}), box = ov.querySelector('.cm-rl'); if (!document.getElementById('cm-rgs')) return;
        const cnt = {}; if (r.ok && Array.isArray(r.json)) r.json.forEach(x => { cnt[x.region] = x.n | 0; });
        if (!r.ok) { box.innerHTML = `<div class="cm-empty">${escHtml(this.errText(r))}</div>`; return; }
        const items = this.REG.filter(n => cnt[n] > 0 || n === cur).sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0));
        const row = (n, c, lab) => `<button type="button" class="cm-ri ${n === cur ? 'on' : ''}" data-r="${escHtml(n)}"><span class="cm-ck">${n === cur ? this.svg('<path d="M5 13l4 4L19 7"/>') : ''}</span>${escHtml(lab || n)}${c != null ? `<em>${c}</em>` : ''}</button>`;
        box.innerHTML = row('', null, 'Toutes les régions') + items.map(n => row(n, cnt[n] || 0)).join('');
        box.querySelectorAll('.cm-ri').forEach(b => b.onclick = () => { close(); this.setRegion(b.dataset.r); });
    },
    // ---- Onglet Roadbook : bascule « Mes trajets | Communauté » ----
    init() {
        const root = document.getElementById('sub-gps-myroadbook'); if (!root || document.getElementById('cm-seg')) return;
        const mine = [...root.children], seg = document.createElement('div'); seg.id = 'cm-seg'; seg.className = 'cm-seg';
        seg.innerHTML = `<button type="button" class="on" data-t="mine">${this.svg(this.IC.km)}Mes trajets</button><button type="button" data-t="comm">${this.svg('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M18 14c1.8.8 3 2.6 3 6"/>')}Communauté</button>`;
        const comm = document.createElement('div'); comm.id = 'cm-comm'; comm.style.display = 'none';
        comm.innerHTML = `<div class="cm-sr"><label class="cm-search">${this.svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>')}<input id="cm-q" type="search" placeholder="Rechercher" maxlength="40"></label><button type="button" class="cm-rg" id="cm-rg">${this.svg('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>')}<span>Région</span></button></div>
            <div class="cm-chips"><button type="button" class="on" data-l="" aria-label="Tous" style="--lc:var(--accent-color)">${this.svg('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>')}Tous</button>${Object.keys(this.LV).map(k => `<button type="button" data-l="${k}" aria-label="${this.LV[k].n}" style="--lc:${this.LV[k].c}"><span class="cm-ic">${this.svg(this.LV[k].i)}</span>${this.LV[k].n}</button>`).join('')}</div><div id="cm-list"></div>`;
        root.insertBefore(seg, root.firstChild); root.appendChild(comm);
        seg.querySelectorAll('button').forEach(b => b.onclick = () => { const c = b.dataset.t === 'comm'; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); mine.forEach(e => { e.style.display = c ? 'none' : ''; }); comm.style.display = c ? '' : 'none'; if (c && !this.st.rows.length) this.load(true); });
        comm.querySelector('#cm-rg').onclick = (e) => { if (this.st.region && e.target.closest('.cm-x')) { this.setRegion(''); return; } this.regionSheet(); };
        let tm; comm.querySelector('#cm-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { this.st.q = e.target.value.trim(); this.load(true); }, 400); };
        comm.querySelectorAll('.cm-chips button').forEach(b => b.onclick = () => { comm.querySelectorAll('.cm-chips button').forEach(x => x.classList.toggle('on', x === b)); this.st.level = b.dataset.l; this.load(true); });
    }
};
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => ModuleRoutes.init()) : ModuleRoutes.init();
