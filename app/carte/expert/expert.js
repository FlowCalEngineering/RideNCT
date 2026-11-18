// Carte > Expert : éditeur d'itinéraire « motard » en plein écran.
// Points GPS sur la carte, mode de conduite par étape, style de route, éviter, objectif, profil de moto,
// altitude, compteur de virages / épingles, météo prévue à chaque étape selon l'heure de départ.
// Indépendant du reste de la carte : sa propre carte MapLibre, ses propres données ('moto_expert_routes').
// Sauvegarde = une entrée de la Bibliothèque (moto_saved_routes) + les réglages experts pour pouvoir le rouvrir.
const ModuleExpert = {
    KEY: 'moto_expert_routes',
    MODES: {
        autoroute: { label: 'Autoroute OK', color: '#8e8e93', kmh: 100, svg: '<path d="M7 3 4 21M17 3l3 18M12 4v3M12 10v4M12 17v3"/>' },
        rapide:    { label: 'Rapide',       color: '#ffffff', kmh: 62,  svg: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>' },
        sinueux:   { label: 'Sinueux',      color: null,      kmh: 48,  svg: '<path d="M3 17c3-8 6-8 9 0s6 8 9 0M3 8c3-5 6-5 9 0"/>' }
    },
    MOTOS: { routiere: ['Routière', 1], trail: ['Trail', 0.88], sportive: ['Sportive', 1.1], scooter: ['Scooter', 0.78] },
    st: null, map: null, markers: [], ready: false, dirty: false, busy: false, loaded: null,

    // ---------- état ----------
    fresh() {
        const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
        return {
            id: null, libId: null, title: '', pts: [],
            style: 66, pauseEvery: 0, avoid: { autoroutes: true, peages: true, nationales: false },
            goal: { type: 'free', val: 3 }, moto: 'routiere', range: 250, depart: this.isoLocal(d),
            res: null
        };
    },
    isoLocal(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
    IC: {
        steps: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H14a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h5.5"/>',
        sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
        chart: '<path d="M4 20v-9M10 20V5M16 20v-7M21 20H3"/>',
        tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
        undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
        redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
        compare: '<path d="M7 4v16M17 4v16"/><path d="m3 8 4-4 4 4M13 16l4 4 4-4"/>',
        dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/>',
        pin: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
        sms: '<path d="M4 5h16v11H9l-5 4z"/>',
        note: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>',
        lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
        rev: '<path d="M7 4v14M3 14l4 4 4-4M17 20V6M13 10l4-4 4 4"/>',
        dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
        imp: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
        exp: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
        fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12"/><path d="M8 8h4M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
        cup: '<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h2a2.5 2.5 0 0 1 0 5h-2M8 3v2M12 3v2"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        me: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
        food: '<path d="M6 3v7a2 2 0 0 0 2 2v9M10 3v7M6 3v7M18 3c-2 1-3 4-3 7h3v11"/>',
        eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
        mount: '<path d="m3 20 6-11 4 6 3-4 5 9z"/>'
    },
    // Préréglages : un appui règle le style, les évitements et l'objectif
    PRESETS: [
        { id: 'dim', label: 'Balade du dimanche', style: 66, avoid: { autoroutes: true, peages: true, nationales: false }, goal: 'free' },
        { id: 'col', label: 'Cols et montagne', style: 92, avoid: { autoroutes: true, peages: true, nationales: true }, goal: 'free' },
        { id: 'eff', label: 'Trajet efficace', style: 12, avoid: { autoroutes: false, peages: false, nationales: false }, goal: 'free' },
        { id: 'dec', label: 'Découverte', style: 80, avoid: { autoroutes: true, peages: true, nationales: true }, goal: 'loop' }
    ],
    ico(p, cls) { return `<svg class="xp-i ${cls || ''}" viewBox="0 0 24 24">${p}</svg>`; },
    list() { return AppStore.arr(this.KEY, true); },

    // ---------- démarrage : onglet + accueil + éditeur ----------
    init() {
        const nav = document.getElementById('gps-nav-bar'), gps = document.getElementById('view-gps');
        if (!nav || !gps || document.getElementById('sub-gps-expert')) return;
        const b = document.createElement('button');
        b.className = 'gps-tab-btn'; b.dataset.sub = 'sub-gps-expert'; b.title = 'Expert'; b.setAttribute('aria-label', 'Expert');
        b.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>';
        b.addEventListener('click', (e) => { if (typeof AppSub !== 'undefined' && !AppSub.gate()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
        nav.appendChild(b);
        const home = document.createElement('div');
        home.id = 'sub-gps-expert'; home.className = 'gps-sub-view view-solid xp-home';
        const host = (document.getElementById('sub-gps-roadbooks') || document.getElementById('sub-gps-carte') || {}).parentNode || gps;   // même conteneur que les autres sous-vues
        host.appendChild(home);
        // les onglets existants sont déjà branchés : on branche seulement celui-ci (même logique)
        b.addEventListener('click', () => {
            document.querySelectorAll('.gps-tab-btn').forEach(t => t.classList.remove('active')); b.classList.add('active');
            document.querySelectorAll('.gps-sub-view').forEach(v => v.classList.remove('active')); home.classList.add('active');
            this.renderHome();
        });
        const ed = document.createElement('div'); ed.id = 'xp-editor'; ed.className = 'xp'; ed.hidden = true;
        document.body.appendChild(ed);
        this.renderHome();
    },

    // ---------- accueil Expert ----------
    renderHome() {
        const h = document.getElementById('sub-gps-expert'); if (!h) return;
        const L = this.list().slice().reverse();
        h.innerHTML = `
            <div class="xp-hw">
                <h2 class="xp-h2">Mode expert</h2>
                <div class="xp-hero">
                    <div class="xp-hero-ic">${this.ico('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>')}</div>
                    <b>Itinéraires de motard</b>
                    <span>Cols, sinueux, épingles, altitude et météo à chaque étape</span>
                </div>
                <button type="button" class="btn btn-primary xp-create" id="xp-new">${this.ico('<path d="M12 5v14M5 12h14"/>')}Créer un itinéraire expert</button>
                <div class="xp-lab">Mes itinéraires experts</div>
                <div id="xp-list">${L.length ? '' : '<div class="xp-empty">Aucun itinéraire expert pour l\'instant.</div>'}</div>
            </div>`;
        const box = h.querySelector('#xp-list');
        const lib = AppStore.get('moto_saved_routes', []), R = (typeof ModuleRoutes !== 'undefined') ? ModuleRoutes : null;
        L.forEach(r => {
            const s = r.stats || {}, le = lib.find(x => x.id === r.libId) || {}, ic = (d, c) => R ? R.svg(d, c) : '';
            let co = (le.geojson && le.geojson.coordinates) || []; if (co.length < 2) co = (r.pts || []).map(p => p.ll).filter(l => Array.isArray(l) && isFinite(l[0]) && isFinite(l[1]));
            const tk = [];
            if (s.km) tk.push(`<div>${ic('<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>', '#0a84ff')}<b>${R ? R.fmtKm(s.km * 1000) : s.km}<small>${AppUnits.distLabel()}</small></b></div>`);
            if (s.bends != null) tk.push(`<div>${ic('<path d="M4 20c0-8 4-12 16-12M16 4l4 4-4 4"/>', '#ff453a')}<b>${s.bends}<small>virages</small></b></div>`, `<div>${ic('<path d="M7 4v9a5 5 0 0 0 10 0V4M13 8l4-4 4 4"/>', '#bf5af2')}<b>${s.hairpins || 0}<small>épingles</small></b></div>`);
            const ch = [], tm = String(le.time || '').replace(/\s+/g, '').replace('m', '');
            if (tm && tm !== '--') ch.push(['#ff9f0a', /^\d+$/.test(tm) ? tm + ' min' : tm]);
            if (s.gain) ch.push(['#64d2ff', '+' + s.gain + ' m']);
            if (typeof s.asphalt === 'number') ch.push(['#30d158', s.asphalt + ' % asphalte']);
            const pubOk = !!(R && le.geojson && le.geojson.coordinates && le.geojson.coordinates.length > 1), done = pubOk && R.published(le, 'l');
            const row = document.createElement('div'); row.className = 'cm-card rb-card';
            row.innerHTML = `<div class="cm-map">${R && co.length > 1 ? R.trace(co, '#4da3ff', false, { dots: true, h: 130 }) : ''}</div><span class="cm-pill">Expert</span>
                <div class="cm-bd"><div class="cm-tt">${this.esc(r.title || 'Itinéraire expert')}</div>
                    ${tk.length ? `<div class="cm-k">${tk.join('')}</div>` : `<div class="cm-desc">${(r.pts || []).length} points</div>`}
                    ${ch.length ? `<div class="cm-chp">${ch.map(c => `<span style="background:${c[0]}26;color:${c[0]}">${c[1]}</span>`).join('')}</div>` : ''}
                    <div class="cm-act"><button type="button" class="cm-ab xp-open">${this.ico('<path d="M5 12h14M13 6l6 6-6 6"/>')}Ouvrir</button>${pubOk ? (done ? `<button type="button" class="cm-ab s2 rb-pub done" disabled>${this.ico('<path d="M5 13l4 4L19 7"/>')}Publié</button>` : `<button type="button" class="cm-ab s2 rb-pub">${this.ico('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M19 8v6M16 11h6"/>')}Publier</button>`) : ''}<button type="button" class="cm-ab s2 xp-row-x red cm-sq" aria-label="Supprimer" title="Supprimer">${this.ico('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')}</button></div></div>`;
            row.addEventListener('click', () => this.open(r));
            row.querySelector('.xp-row-x').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!(await AppDialog.confirm('Supprimer cet itinéraire expert ?', { okText: 'Supprimer', danger: true }))) return;
                AppStore.set(this.KEY, this.list().filter(x => x.id !== r.id)); this.renderHome();
            });
            row.querySelector('.xp-open').addEventListener('click', (e) => { e.stopPropagation(); this.open(r); });
            const pb = row.querySelector('button.rb-pub:not(.done)'); if (pb) pb.addEventListener('click', (e) => { e.stopPropagation(); R.openPublish(le, 'l'); });
            row.querySelectorAll('.cm-ab').forEach(b => ['mousedown', 'touchstart'].forEach(ev => b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true })));
            box.appendChild(row);
        });
        h.querySelector('#xp-new').addEventListener('click', () => this.open(null));
    },

    // ---------- éditeur plein écran ----------
    open(saved) {
        if (typeof AppSub !== 'undefined' && !AppSub.gate()) return;
        this.st = this.fresh();
        if (saved) { try { Object.assign(this.st, JSON.parse(JSON.stringify(saved))); } catch (e) {} this.st.res = null; }
        this.loaded = saved ? saved.id : null; this.dirty = false;
        const ed = document.getElementById('xp-editor'); if (!ed) return;
        ed.hidden = false; document.body.classList.add('xp-open');
        ed.innerHTML = `
            <div id="xp-map"></div>
            <div class="xp-top xp-glass"><button type="button" class="xp-x" id="xp-close" aria-label="Fermer">${this.ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
                <span class="xp-ttl">${saved ? this.esc(saved.title || 'Itinéraire expert') : 'Nouvel itinéraire expert'}</span>
                <button type="button" class="xp-bm" id="xp-bm" hidden aria-label="Enregistrer dans la bibliothèque" title="Enregistrer dans la bibliothèque">${this.ico('<path d="M6 4h12v17l-6-4-6 4z"/>')}</button>
                <button type="button" class="xp-calc" id="xp-calc">Calculer</button></div>
            <div class="xp-status xp-glass" id="xp-status" hidden></div>
            <div class="xp-tools">
                <button type="button" class="xp-glass" id="xp-search" aria-label="Chercher une adresse ou un lieu">${this.ico('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>')}</button>
                <button type="button" class="xp-glass" id="xp-me" aria-label="Ajouter ma position">${this.ico('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>')}</button>
                <button type="button" class="xp-glass" id="xp-undo" aria-label="Annuler la dernière modification">${this.ico(this.IC.undo)}</button>
                <button type="button" class="xp-glass" id="xp-redo" hidden aria-label="Rétablir">${this.ico(this.IC.redo)}</button>
                <button type="button" class="xp-glass" id="xp-fit" aria-label="Cadrer le tracé">${this.ico('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>
            </div>
            <div class="xp-sheet" id="xp-sheet"><button type="button" class="xp-grab" id="xp-grab" aria-label="Dérouler ou enrouler le menu"></button><div class="xp-hd" id="xp-hd"></div><div class="xp-sc" id="xp-sc"></div></div>`;
        ed.querySelector('#xp-close').onclick = () => this.close();
        ed.querySelector('#xp-calc').onclick = () => this.calculate();
        ed.querySelector('#xp-me').onclick = () => this.addMe();
        ed.querySelector('#xp-search').onclick = () => this.openSearch();
        ed.querySelector('#xp-undo').onclick = () => this.undo();
        ed.querySelector('#xp-redo').onclick = () => this.redo();
        ed.querySelector('#xp-fit').onclick = () => this.fit();
        this.initSheet(ed);
        this.initMap();
        this._tab = 'etapes'; this.histReset();
        this.renderSheet(); this.syncMap();
        if (this.st.pts.length) setTimeout(() => this.fit(), 400);
    },
    // ---------- panneau déroulant : enroulé / mi-hauteur / déroulé, au doigt ou d'un appui sur la poignée ----------
    land() { return window.matchMedia('(orientation: landscape)').matches; },
    state() { const c = document.getElementById('xp-sheet').classList; return c.contains('xp-min') ? 'min' : c.contains('xp-full') ? 'full' : 'mid'; },
    snap(st) {
        const sh = document.getElementById('xp-sheet'), ed = document.getElementById('xp-editor'); if (!sh) return;
        sh.style.height = ''; sh.classList.remove('xp-drag', 'xp-min', 'xp-full');
        if (st === 'min') sh.classList.add('xp-min'); else if (st === 'full') sh.classList.add('xp-full');
        if (ed) ed.classList.toggle('xp-pmin', st === 'min');
        setTimeout(() => { if (this.map) this.map.resize(); }, 280);
    },
    initSheet(ed) {
        const sh = ed.querySelector('#xp-sheet'), hit = [ed.querySelector('#xp-grab'), ed.querySelector('#xp-hd')];
        const ORDER = ['min', 'mid', 'full'];
        let y0 = 0, h0 = 0, t0 = 0, last = 0, lt = 0, v = 0, moved = false, on = false;
        const H = () => ed.clientHeight, hmin = () => 96 + 0, hfull = () => H() - 84, hmid = () => Math.max(250, H() * 0.4);
        const px = { min: hmin, mid: hmid, full: hfull };
        hit.forEach(el => {
            el.addEventListener('pointerdown', (e) => {
                if (this.land()) return;
                on = true; moved = false; y0 = last = e.clientY; t0 = lt = Date.now(); v = 0; h0 = sh.getBoundingClientRect().height;
                try { el.setPointerCapture(e.pointerId); } catch (_) {}
            });
            el.addEventListener('pointermove', (e) => {
                if (!on) return;
                const dy = y0 - e.clientY; if (Math.abs(dy) > 6) moved = true;
                if (!moved) return;
                const now = Date.now(); v = (last - e.clientY) / Math.max(1, now - lt); last = e.clientY; lt = now;   // px/ms, vers le haut > 0
                sh.classList.add('xp-drag'); sh.style.height = Math.max(hmin(), Math.min(hfull(), h0 + dy)) + 'px';
            });
            const end = (e) => {
                if (!on) return; on = false;
                if (!moved) return;
                const h = sh.getBoundingClientRect().height + v * 160;   // l'élan compte : un coup de doigt rapide va jusqu'au cran suivant
                let best = 'mid', bd = 1e9; ORDER.forEach(k => { const d = Math.abs(px[k]() - h); if (d < bd) { bd = d; best = k; } });
                this.snap(best); this._dragged = Date.now();
            };
            el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
        });
        // simple appui sur la poignée : enroulé → mi-hauteur → déroulé → enroulé (en paysage : masque / affiche le panneau)
        ed.querySelector('#xp-grab').addEventListener('click', () => {
            if (this._dragged && Date.now() - this._dragged < 350) return;
            if (this.land()) { this.snap(this.state() === 'min' ? 'full' : 'min'); return; }
            this.snap(ORDER[(ORDER.indexOf(this.state()) + 1) % 3]);
        });
    },
    async close(force) {
        if (!force && this.dirty && this.st.pts.length > 1 && !(await AppDialog.confirm('Quitter sans enregistrer cet itinéraire ?', { okText: 'Quitter', danger: true }))) return;
        const ed = document.getElementById('xp-editor'); if (ed) ed.hidden = true;
        document.body.classList.remove('xp-open');
        try { if (typeof ModuleGPS.poiRelease === 'function') ModuleGPS.poiRelease(); } catch (e) {}
        try { if (this.map) { this.map.remove(); } } catch (e) {}
        this.map = null; this.markers = []; this.ready = false;
        this.renderHome();
    },
    initMap() {
        if (typeof maplibregl === 'undefined') return;
        const g = (typeof ModuleGPS !== 'undefined' && ModuleGPS.state) || {};
        const c = (g.lastKnownCoords) || (g.map && g.map.getCenter && (() => { const k = g.map.getCenter(); return [k.lng, k.lat]; })()) || [2.2137, 46.2276];
        const z = g.lastKnownCoords ? 10 : ((g.map && g.map.getZoom && g.map.getZoom()) || 5);
        this.ready = false;
        this.map = new maplibregl.Map({
            container: 'xp-map', style: AppTheme.getMapStyleUrl(), center: c, zoom: z, attributionControl: false,
            minZoom: 2, maxZoom: 20, scrollZoom: true, touchZoomRotate: true, doubleClickZoom: true, dragPan: true,
            transformRequest: (url, type) => (typeof OfflineMaps !== 'undefined' ? OfflineMaps.transform(url, type) : undefined)
        });
        this.map.on('load', () => {
            this.map.addSource('xp-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            this.map.addLayer({ id: 'xp-route-case', type: 'line', source: 'xp-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000', 'line-opacity': 0.35, 'line-width': 9 } });
            this.map.addLayer({ id: 'xp-route-line', type: 'line', source: 'xp-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 5.5 } });
            this.map.addSource('xp-pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            this.map.addLayer({ id: 'xp-pins', type: 'circle', source: 'xp-pins', paint: { 'circle-radius': 5, 'circle-color': '#ff9f0a', 'circle-stroke-color': '#1c1c1e', 'circle-stroke-width': 2 } });
            this.ready = true; this.syncMap();
            // radar des lieux : exactement celui de l'onglet Carte (mêmes API, mêmes tuiles, mêmes bulles et fiches)
            try { if (typeof ModuleGPS.poiBorrow === 'function') ModuleGPS.poiBorrow(this.map, (it) => this.addStopNear(it.ll, it.name)); } catch (e) { console.warn('Expert : radar', e); }
        });
        this.map.on('moveend', () => { try { if (typeof ModuleGPS.fetchPOIs === 'function') ModuleGPS.fetchPOIs(); } catch (e) {} });
        this.map.on('click', (e) => {
            const ll = [+e.lngLat.lng.toFixed(5), +e.lngLat.lat.toFixed(5)];
            const hit = this.st.res ? this.nearLeg(e.point) : null;
            if (hit) this.insertAt(hit.leg + 1, ll); else this.addPoint(ll);
        });
        this.map.on('mousemove', (e) => { if (this.st.res) this.map.getCanvas().style.cursor = this.nearLeg(e.point) ? 'copy' : ''; });
    },

    // ---------- stations, cafés, restos sur la carte (dès qu'il y a du réseau, zoom assez proche) ----------
    // Lieux autour d'un point (outil « Points d'intérêt ») : mêmes chargeurs et mêmes données que le radar de la Carte
    async fetchPoi(c) {
        const G = ModuleGPS, S = G.state; if (!S || !S.poiWide || typeof G.loadFuelStations !== 'function') return null;
        const far = (a, b) => !a || G.poiDistKm(a, b) > 6;
        const jobs = [];
        if (far(S.fuelCenter, c) || S.fuelOk === false) jobs.push(G.loadFuelStations(c).catch(() => {}));
        if (far(S.foodCenter, c) || S.foodOk === false) jobs.push(G.loadFoodDrink(c).catch(() => {}));
        await Promise.all(jobs);
        if (S.fuelOk === false && S.foodOk === false) return null;
        const K = { fuel: 'fuel', drink: 'cafe', food: 'restaurant' }, out = [];
        S.poiWide.forEach(f => {
            const p = f.properties || {}, kind = K[p.cat]; if (!kind || G.poiDistKm(c, f.geometry.coordinates) > 14) return;
            const pr = [['Gazole', p.p_gazole], ['E10', p.p_e10], ['SP98', p.p_sp98]].filter(x => Number(x[1]) > 0).map(x => x[0] + ' ' + G.poiFmtPrice(x[1])).join(' · ');
            out.push({ id: p.id, kind, name: p.name || (kind === 'fuel' ? 'Station' + (p.ville ? ' · ' + p.ville : '') : (G.POI_SUBTYPE[p.sub] || 'Lieu')), ll: f.geometry.coordinates.slice(), info: [p.adresse, pr].filter(Boolean).join(' — ') });
        });
        return out;
    },

    // ---------- points ----------
    addPoint(ll, name) {
        this.st.pts.push({ ll, name: name || ('Point ' + (this.st.pts.length + 1)), kind: 'pass', pause: 0, mode: 'auto' });
        const p = this.st.pts[this.st.pts.length - 1];
        if (!name) this.reverseName(p);
        this.touch();
    },
    addMe() {
        const g = typeof ModuleGPS !== 'undefined' ? ModuleGPS.state : null;
        if (g && g.lastKnownCoords) { this.addPoint(g.lastKnownCoords.slice(0, 2), 'Ma position'); this.map && this.map.easeTo({ center: g.lastKnownCoords, zoom: Math.max(this.map.getZoom(), 11) }); return; }
        if (!navigator.geolocation) { AppDialog.alert('Position GPS indisponible.'); return; }
        navigator.geolocation.getCurrentPosition(
            (p) => { const ll = [+p.coords.longitude.toFixed(5), +p.coords.latitude.toFixed(5)]; this.addPoint(ll, 'Ma position'); this.map && this.map.easeTo({ center: ll, zoom: 11 }); },
            () => AppDialog.alert('Position GPS refusée ou indisponible.'), { enableHighAccuracy: true, timeout: 8000 });
    },
    async reverseName(p, force) {
        try {
            const ac = new AbortController(), to = setTimeout(() => ac.abort(), 5000);
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=fr&lat=${p.ll[1]}&lon=${p.ll[0]}`, { signal: ac.signal }); clearTimeout(to);
            const d = await r.json(), a = d.address || {};
            const n = a.village || a.town || a.city || a.hamlet || a.municipality || (d.name || '');
            if (n && (force || /^(Point|Étape) ?\d*$/.test(p.name))) { p.name = n; this.renderSheet(); this.syncMarkers(); }
        } catch (e) {}
    },
    // un changement de points invalide le calcul
    touch() {
        this.dirty = true; this.st.res = null; this.histPush(); this.syncMap(); this.renderSheet(); this.scheduleDl();
    },
    // Historique des points (annuler / rétablir) : un instantané à chaque modification des étapes
    histSnap() { return JSON.stringify(this.st.pts); },
    histReset() { this._h = { u: [], r: [], last: this.histSnap() }; this.paintHist(); },
    histPush() {
        const h = this._h; if (!h) return; const now = this.histSnap(); if (now === h.last) return;
        h.u.push(h.last); if (h.u.length > 60) h.u.shift(); h.r = []; h.last = now; this.paintHist();
    },
    undo() { const h = this._h; if (!h || !h.u.length) return; h.r.push(h.last); const v = h.u.pop(); h.last = v; this.st.pts = JSON.parse(v); this.touch(); },
    redo() { const h = this._h; if (!h || !h.r.length) return; h.u.push(h.last); const v = h.r.pop(); h.last = v; this.st.pts = JSON.parse(v); this.touch(); },
    paintHist() {
        const h = this._h || { u: [], r: [] };
        const u = document.getElementById('xp-undo'), r = document.getElementById('xp-redo');
        if (u) u.classList.toggle('xp-off', !h.u.length);
        if (r) r.hidden = !h.r.length;
        ['xp-t-undo', 'xp-t-redo'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !(id === 'xp-t-undo' ? h.u.length : h.r.length); });
    },
    // Carte détaillée du trajet : dès que 2 points sont posés, les tuiles du couloir (zoom max) sont téléchargées sur le téléphone ;
    // le calcul des routes se fait ensuite sans serveur.
    scheduleDl() { clearTimeout(this._dlT); if (this.st.pts.length < 2) return; this._dlT = setTimeout(() => this.prefetch(), 1500); },
    prefetch() {
        clearTimeout(this._dlT);
        const pts = this.st.pts.map(p => p.ll);
        if (pts.length < 2 || typeof OfflineMaps === 'undefined' || this._dlP) return this._dlP || Promise.resolve();
        const key = pts.map(c => c[0].toFixed(3) + ',' + c[1].toFixed(3)).join('|'); if (key === this._dlKey) return Promise.resolve();
        let len = 0; for (let i = 1; i < pts.length; i++) len += this.metres(pts[i - 1], pts[i]) / 1000;
        const km = Math.max(4, Math.min(10, len * 0.08));     // couloir de part et d'autre du tracé : plus le trajet est long, plus il est large
        this._dl = { done: 0, total: 0 }; this.paintStatus();
        const spec = { name: 'Expert · ' + (this.st.title || 'trajet'), kind: 'route', quality: 'max', shape: { type: 'line', coords: pts, km }, replace: this._zoneId };
        this._dlP = Promise.resolve().then(() => OfflineMaps.download(spec, (pr) => { this._dl = pr; if (this.busy) this._msg = pr.total ? `Carte détaillée : ${pr.done}/${pr.total} tuiles` : (pr.phase || 'Carte détaillée…'); this.paintStatus(); }))
            .then(r => { if (r && r.ok) { this._zoneId = r.zone.id; this._dlKey = key; } else console.warn('Expert : carte détaillée', r && r.reason); })
            .catch(e => console.warn('Expert : carte détaillée', e))
            .finally(() => { this._dlP = null; this._dl = null; this.paintStatus(); });
        return this._dlP;
    },
    effMode(i) {
        const p = this.st.pts[i], s = this.st;
        let m = p && p.mode !== 'auto' ? p.mode : (s.style >= 50 ? 'sinueux' : s.style >= 20 ? 'rapide' : 'autoroute');
        if (m === 'autoroute' && (s.avoid.autoroutes || s.avoid.peages)) m = 'rapide';
        if (m === 'rapide' && s.avoid.nationales) m = 'sinueux';
        return m;
    },
    label(i, n) { return i === 0 ? 'D' : (i === n - 1 && n > 1 && this.st.goal.type !== 'loop') ? 'A' : String(i); },

    // ---------- carte : marqueurs + tracé ----------
    syncMap() { this.syncMarkers(); this.syncRoute(); },
    syncMarkers() {
        if (!this.map) return;
        this.markers.forEach(m => m.remove()); this.markers = [];
        const n = this.st.pts.length;
        this.st.pts.forEach((p, i) => {
            const el = document.createElement('div');
            el.className = 'xp-mk' + (i === 0 ? ' xp-mk-d' : '') + (p.kind === 'stop' ? ' xp-mk-s' : '');
            el.textContent = this.label(i, n);
            el.addEventListener('click', (e) => e.stopPropagation());
            const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(p.ll).addTo(this.map);
            mk.on('dragend', () => { const l = mk.getLngLat(); p.ll = [+l.lng.toFixed(5), +l.lat.toFixed(5)]; this.touch(); });
            this.markers.push(mk);
        });
    },
    syncRoute() {
        if (!this.map || !this.ready) return;
        const r = this.st.res, col = AppTheme.getRouteColor ? AppTheme.getRouteColor() : '#0a84ff';
        const feats = r ? r.legs.map(l => ({ type: 'Feature', properties: { c: this.MODES[l.mode].color || col }, geometry: { type: 'LineString', coordinates: l.coords.map(c => [c[0], c[1]]) } })) : [];
        this.map.getSource('xp-route').setData({ type: 'FeatureCollection', features: feats });
        const pins = r ? r.pinPts.map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) : [];
        this.map.getSource('xp-pins').setData({ type: 'FeatureCollection', features: pins });
    },
    fit() {
        if (!this.map) return;
        const all = this.st.res ? [].concat(...this.st.res.legs.map(l => l.coords)) : this.st.pts.map(p => p.ll);
        if (!all.length) return;
        const b = new maplibregl.LngLatBounds(all[0], all[0]); all.forEach(c => b.extend([c[0], c[1]]));
        const land = window.matchMedia('(orientation: landscape)').matches;
        this.map.fitBounds(b, { padding: land ? { top: 70, left: 70, bottom: 40, right: 360 } : { top: 80, left: 40, right: 70, bottom: 260 }, maxZoom: 14, duration: 600 });
    },


    // ---------- insertion d'une étape en touchant le tracé ----------
    nearLeg(pt) {
        const r = this.st.res; if (!r || !this.map) return null;
        let best = null;
        r.legs.forEach((l, k) => {
            const P = l.coords.map(c => this.map.project([c[0], c[1]]));
            for (let i = 1; i < P.length; i++) {
                const a = P[i - 1], b = P[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
                const t = L ? Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L)) : 0;
                const d = Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
                if (d < 16 && (!best || d < best.d)) best = { d, leg: k };
            }
        });
        return best;
    },
    // insère un point à la position i (le tronçon qui y mène garde son mode)
    insertAt(i, ll, name, extra) {
        const prev = this.st.pts[i] ? this.st.pts[i].mode : 'auto';
        const p = Object.assign({ ll, name: name || 'Étape', kind: 'pass', pause: 0, mode: prev }, extra || {});
        this.st.pts.splice(i, 0, p);
        if (!name) this.reverseName(p);
        this.touch();
    },
    // Glisser une étape : on la tient par sa poignée, les autres s'écartent, on relâche à la nouvelle place
    dragStep(grip, sc) {
        const i0 = +grip.dataset.i, row = grip.closest('.xp-step'), rows = [...sc.querySelectorAll('.xp-step')];
        let y0 = 0, on = false, sc0 = 0, timer = 0, curY = 0, idx = i0, h = 0;
        const centers = () => rows.map(r => { const b = r.getBoundingClientRect(); return b.top - (+r.dataset.dy || 0) + b.height / 2; });
        let base = null;
        const place = () => {
            const dy = curY - y0 + (sc.scrollTop - sc0);
            row.style.transform = `translateY(${dy}px)`;
            const me = base[i0] + dy; idx = 0; base.forEach((c, k) => { if (k !== i0 && c < me) idx++; });
            rows.forEach((r, k) => {
                if (k === i0) return; let sh = 0;
                if (i0 < idx && k > i0 && k <= idx) sh = -h; else if (i0 > idx && k < i0 && k >= idx) sh = h;
                r.style.transform = sh ? `translateY(${sh}px)` : '';
            });
        };
        const stop = (apply) => {
            if (!on) return; on = false; clearInterval(timer);
            rows.forEach(r => { r.classList.remove('xp-moving', 'xp-shift'); r.style.transform = ''; r.style.zIndex = ''; });
            if (apply && idx !== i0) { const [p] = this.st.pts.splice(i0, 1); this.st.pts.splice(idx, 0, p); this.touch(); }
        };
        grip.addEventListener('pointerdown', (e) => {
            e.preventDefault(); on = true; y0 = curY = e.clientY; sc0 = sc.scrollTop; idx = i0; h = row.getBoundingClientRect().height;
            base = rows.map(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
            try { grip.setPointerCapture(e.pointerId); } catch (_) {}
            row.classList.add('xp-moving'); rows.forEach(r => { if (r !== row) r.classList.add('xp-shift'); }); row.style.zIndex = 5;
            // défilement automatique près des bords du panneau
            timer = setInterval(() => { const b = sc.getBoundingClientRect(); if (curY < b.top + 50) sc.scrollTop -= 8; else if (curY > b.bottom - 50) sc.scrollTop += 8; else return; place(); }, 16);
        });
        grip.addEventListener('pointermove', (e) => { if (!on) return; curY = e.clientY; place(); });
        grip.addEventListener('pointerup', () => stop(true));
        grip.addEventListener('pointercancel', () => stop(false));
    },
    move(i, d) { const a = this.st.pts, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; this.touch(); },
    reverse() {
        const a = this.st.pts.slice().reverse();
        // le mode de chaque tronçon suit le tronçon : on décale les modes d'un cran
        const modes = this.st.pts.map(p => p.mode); a.forEach((p, i) => { p.mode = i === 0 ? 'auto' : modes[a.length - i] || 'auto'; });
        this.st.pts = a; this.touch();
    },
    duplicate() { this.st.id = null; this.st.libId = null; this.st.title = ''; this.loaded = null; this.dirty = true; const t = document.querySelector('#xp-editor .xp-ttl'); if (t) t.textContent = 'Nouvel itinéraire expert (copie)'; this.renderSheet(); },

    // ---------- recherche d'adresse / lieu ----------
    openSearch() {
        const ed = document.getElementById('xp-editor'); if (!ed || ed.querySelector('.xp-search')) return;
        const fav = (typeof ModuleGPS.getFavPlaces === 'function') ? ModuleGPS.getFavPlaces() : {};
        const d = document.createElement('div'); d.className = 'xp-search';
        d.innerHTML = `<div class="xp-sb"><button type="button" class="xp-sbk" aria-label="Retour">${this.ico('<path d="m15 5-7 7 7 7"/>')}</button>
            <input type="text" id="xp-q" placeholder="Adresse, ville, col, lieu…" autocomplete="off" enterkeyhint="search"></div>
            <div class="xp-sf">${fav.home ? '<button type="button" class="xp-c" data-fav="home">Maison</button>' : ''}${fav.work ? '<button type="button" class="xp-c" data-fav="work">Travail</button>' : ''}<button type="button" class="xp-c" data-me="1">Ma position</button></div>
            <div class="xp-sl" id="xp-sl"><div class="xp-hint">Tape au moins 3 lettres.</div></div>`;
        ed.appendChild(d);
        const q = d.querySelector('#xp-q'), list = d.querySelector('#xp-sl'); let timer = 0, seq = 0;
        const done = () => d.remove();
        const pick = (r) => { done(); this.addPoint(r.coords, r.main); if (this.map) this.map.easeTo({ center: r.coords, zoom: Math.max(this.map.getZoom(), 10) }); };
        d.querySelector('.xp-sbk').onclick = done;
        d.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => { const f = fav[b.dataset.fav]; if (f) pick({ main: b.textContent, coords: f.coords }); });
        d.querySelectorAll('[data-me]').forEach(b => b.onclick = () => { done(); this.addMe(); });
        const show = (items, msg) => {
            list.innerHTML = '';
            if (msg) { list.innerHTML = `<div class="xp-hint">${this.esc(msg)}</div>`; return; }
            items.forEach(r => { const b = document.createElement('button'); b.type = 'button'; b.className = 'xp-res'; b.innerHTML = `<span class="xp-ri">${this.ico('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>')}</span><span class="xp-rt"><b>${this.esc(r.main)}</b><small>${this.esc(r.ctx)}</small></span>`; b.onclick = () => pick(r); list.appendChild(b); });
        };
        const run = async (text) => {
            const my = ++seq; show([], 'Recherche…');
            const g = ModuleGPS.state, c = g.lastKnownCoords || (this.map ? (() => { const k = this.map.getCenter(); return [k.lng, k.lat]; })() : null), bias = c ? `&lat=${c[1].toFixed(4)}&lon=${c[0].toFixed(4)}` : '';
            const [ban, pho] = await Promise.allSettled([
                ModuleGPS.poiFetchJSON(`${ModuleGPS.BAN_API}?q=${encodeURIComponent(text)}&limit=5&autocomplete=1${bias}`, 8000),
                ModuleGPS.poiFetchJSON(`${ModuleGPS.PHOTON_API}?q=${encodeURIComponent(text)}&limit=6&lang=fr${bias}`, 8000)]);
            if (my !== seq) return;
            const out = [];
            if (pho.status === 'fulfilled' && pho.value && pho.value.features) pho.value.features.forEach(f => { const p = f.properties || {}; let main = p.name || (p.housenumber && p.street ? p.housenumber + ' ' + p.street : p.street) || ''; const sub = [p.postcode, p.city && p.city !== main ? p.city : '', p.country].filter(Boolean); if (!main && sub.length) main = sub.shift(); if (main) out.push({ main, ctx: sub.join(' · '), coords: f.geometry.coordinates }); });
            if (ban.status === 'fulfilled' && ban.value && ban.value.features) ban.value.features.forEach(f => { const p = f.properties || {}; out.push({ main: p.name || p.label, ctx: [p.postcode, p.city].filter(Boolean).join(' '), coords: f.geometry.coordinates }); });
            const seen = new Set(), uniq = out.filter(r => { const k = r.main.toLowerCase() + '|' + r.coords.map(v => v.toFixed(3)).join(','); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);
            if (!uniq.length) show([], ban.status === 'rejected' && pho.status === 'rejected' ? 'Réseau indisponible : pose le point directement sur la carte.' : 'Aucun résultat');
            else show(uniq);
        };
        q.addEventListener('input', () => { clearTimeout(timer); const t = q.value.trim(); if (t.length < 3) { seq++; show([], 'Tape au moins 3 lettres.'); return; } timer = setTimeout(() => run(t), 280); });
        q.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = list.querySelector('.xp-res'); if (f) f.click(); } else if (e.key === 'Escape') done(); });
        setTimeout(() => q.focus(), 80);
    },

    // ---------- GPX : export / import ----------
    exportGpx() {
        const r = this.st.res; if (!r) return;
        const coords = [].concat(...r.legs.map((l, i) => i ? l.coords.slice(1) : l.coords)).map(c => [+c[0].toFixed(5), +c[1].toFixed(5)]);
        ModuleGPS.exportToGPX({ title: this.st.title || `${this.st.pts[0].name} - ${this.st.pts[this.st.pts.length - 1].name}`, geojson: { coordinates: coords } });
    },
    importGpx() {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.gpx,application/gpx+xml,text/xml';
        inp.onchange = () => {
            const f = inp.files && inp.files[0]; if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                try {
                    const x = new DOMParser().parseFromString(rd.result, 'text/xml');
                    const pts = [...x.querySelectorAll('trkpt, rtept')].map(e => [parseFloat(e.getAttribute('lon')), parseFloat(e.getAttribute('lat'))]).filter(c => isFinite(c[0]) && isFinite(c[1]));
                    if (pts.length < 2) { AppDialog.alert('Ce fichier GPX ne contient pas assez de points.'); return; }
                    // on garde le départ, l'arrivée et au plus 6 étapes réparties : le tracé est recalculé ensuite
                    const n = Math.min(8, pts.length), pick = []; for (let i = 0; i < n; i++) pick.push(pts[Math.round(i * (pts.length - 1) / (n - 1))]);
                    const nm = x.querySelector('trk > name, rte > name, gpx > name');
                    this.st.pts = pick.map((c, i) => ({ ll: [+c[0].toFixed(5), +c[1].toFixed(5)], name: i === 0 ? 'Départ' : i === n - 1 ? 'Arrivée' : 'Étape ' + i, kind: 'pass', pause: 0, mode: 'auto' }));
                    this.st.pts.forEach(p => { if (/^(Départ|Arrivée|Étape \d+)$/.test(p.name)) this.reverseName(p, true); });
                    this.st.title = nm && nm.textContent ? nm.textContent.trim() : f.name.replace(/\.[^.]+$/, '');
                    this.touch(); this.fit();
                } catch (e) { AppDialog.alert('Fichier GPX illisible.'); }
            };
            rd.readAsText(f);
        };
        inp.click();
    },

    // ---------- carburant : où faire le plein ----------
    fuelPoint() {
        const r = this.st.res; if (!r || !this.st.range) return null;
        const lim = this.st.range * 1000 * 0.9;   // on garde 10 % de marge
        if (r.dist <= lim) return null;
        let acc = 0;
        for (let k = 0; k < r.legs.length; k++) {
            const L = r.legs[k], len = L.dist;
            if (acc + len >= lim) {
                const target = lim - acc, cs = L.coords; let run = 0;
                for (let i = 1; i < cs.length; i++) { const d = this.metres(cs[i - 1], cs[i]) * (len / Math.max(1, this.legGeo(L))); if (run + d >= target) { const t = d ? (target - run) / d : 0; return { ll: [+(cs[i - 1][0] + (cs[i][0] - cs[i - 1][0]) * t).toFixed(5), +(cs[i - 1][1] + (cs[i][1] - cs[i - 1][1]) * t).toFixed(5)], km: Math.round(lim / 1000), leg: k }; } run += d; }
                return { ll: [cs[cs.length - 1][0], cs[cs.length - 1][1]], km: Math.round(lim / 1000), leg: k };
            }
            acc += len;
        }
        return null;
    },
    // Point du tracé à une distance donnée (m) depuis le départ → { ll, leg }
    pointAt(dm) {
        const r = this.st.res; if (!r) return null; let acc = 0;
        for (let k = 0; k < r.legs.length; k++) {
            const L = r.legs[k], len = L.dist;
            if (acc + len >= dm) {
                const target = dm - acc, cs = L.coords, sc = len / Math.max(1, this.legGeo(L)); let run = 0;
                for (let i = 1; i < cs.length; i++) { const d = this.metres(cs[i - 1], cs[i]) * sc; if (run + d >= target) { const t = d ? (target - run) / d : 0; return { ll: [+(cs[i - 1][0] + (cs[i][0] - cs[i - 1][0]) * t).toFixed(5), +(cs[i - 1][1] + (cs[i][1] - cs[i - 1][1]) * t).toFixed(5)], leg: k }; } run += d; }
                return { ll: [cs[cs.length - 1][0], cs[cs.length - 1][1]], leg: k };
            }
            acc += len;
        }
        return null;
    },
    // Pauses régulières : un arrêt de 15 min tous les X minutes de route
    placePauses() {
        const s = this.st, r = s.res; if (!r || !s.pauseEvery) return;
        const step = s.pauseEvery * 60, list = [];
        for (let t = step; t < r.dur - step * 0.35; t += step) { const pt = this.pointAt(r.dist * t / r.dur); if (pt) list.push(pt); }
        if (!list.length) { AppDialog.alert('Le trajet est plus court que l\'intervalle choisi : aucune pause à placer.'); return; }
        list.sort((a, b) => b.leg - a.leg || 0);
        for (let i = list.length - 1; i >= 0; i--) { const L = list[i]; s.pts.splice(L.leg + 1, 0, { ll: L.ll, name: 'Pause', kind: 'stop', pause: 15, mode: s.pts[Math.min(L.leg + 1, s.pts.length - 1)].mode || 'auto' }); }
        this.touch();
    },
    // Comparaison avec le trajet direct (routage standard, tronçon par tronçon)
    async compare() {
        const r = this.st.res; if (!r || this._cmpBusy) return;
        this._cmpBusy = true; this._tab = 'analyse'; this.renderSheet();
        try {
            const f = this.MOTOS[this.st.moto][1]; let dist = 0, dur = 0, b = 0, h = 0;
            for (const L of r.legs) {
                const a = L.coords[0], z = L.coords[L.coords.length - 1];
                const d = await ModuleGPS.osrmJson(`${a[0]},${a[1]};${z[0]},${z[1]}?overview=full&geometries=geojson`, 10000);
                if (!d || !d.routes || !d.routes[0]) throw new Error('serveur d\'itinéraire injoignable');
                const rt = d.routes[0], bo = this.bendsOf(rt.geometry.coordinates);
                dist += rt.distance; dur += rt.duration / f; b += bo.light + bo.tight + bo.hair; h += bo.hair;
            }
            if (this.st.res === r) r.cmp = { dist, dur, bends: b, hair: h };
        } catch (e) { AppDialog.alert('Comparaison impossible : ' + String((e && e.message) || e)); }
        finally { this._cmpBusy = false; this.renderSheet(); }
    },
    // Boucle surprise : 2 étapes tirées au sort autour du départ, pour une durée donnée
    async loopSurprise() {
        const s = this.st; if (!s.pts.length) { AppDialog.alert('Pose d\'abord ton point de départ sur la carte.'); return; }
        const v = await AppDialog.prompt('Durée de la boucle (en heures)', '2', { maxLength: 4 }); if (v === null) return;
        const h = Math.max(0.5, Math.min(8, parseFloat(String(v).replace(',', '.')) || 2));
        const km = h * 48, d = km / (3.15 * 1.3), a0 = Math.random() * 360, st0 = s.pts[0].ll;
        const go = (ang) => { const rad = ang * Math.PI / 180; return [+(st0[0] + d * Math.sin(rad) / (111.32 * Math.cos(st0[1] * Math.PI / 180))).toFixed(5), +(st0[1] + d * Math.cos(rad) / 111.32).toFixed(5)]; };
        const mk = (ll, i) => ({ ll, name: 'Étape ' + i, kind: 'pass', pause: 0, mode: 'auto' });
        s.pts = [s.pts[0], mk(go(a0), 1), mk(go(a0 + 70), 2)]; s.goal = { type: 'loop', val: 3 };
        s.pts.slice(1).forEach(p => this.reverseName(p));
        this.touch(); this.fit(); this._tab = 'etapes'; this.renderSheet();
        await this.calculate();
    },
    // Points d'intérêt le long du tracé (carburant, restos, points de vue, cols) via Overpass : nécessite du réseau
    openPoi() {
        const r = this.st.res, ed = document.getElementById('xp-editor'); if (!r || !ed || ed.querySelector('.xp-search')) return;
        const CAT = { fuel: ['Carburant', this.IC.fuel], cafe: ['Cafés et bars', this.IC.cup], restaurant: ['Restos', this.IC.food] };
        const d = document.createElement('div'); d.className = 'xp-search';
        d.innerHTML = `<div class="xp-sb"><button type="button" class="xp-sbk" aria-label="Retour">${this.ico('<path d="m15 5-7 7 7 7"/>')}</button><b class="xp-pt">Points d'intérêt sur le tracé</b></div>
            <div class="xp-sf">${Object.keys(CAT).map(k => `<button type="button" class="xp-c" data-pcat="${k}">${CAT[k][0]}</button>`).join('')}</div>
            <div class="xp-sl" id="xp-pl"><div class="xp-hint">Choisis une catégorie.</div></div>`;
        ed.appendChild(d);
        const list = d.querySelector('#xp-pl'), done = () => d.remove(); d.querySelector('.xp-sbk').onclick = done;
        const all = [].concat(...r.legs.map((l, i) => i ? l.coords.slice(1) : l.coords));
        const acc = [0]; for (let i = 1; i < all.length; i++) acc.push(acc[i - 1] + this.metres(all[i - 1], all[i]));
        let seq = 0, cache = null;
        d.querySelectorAll('[data-pcat]').forEach(b => b.onclick = async () => {
            const k = b.dataset.pcat, my = ++seq; d.querySelectorAll('[data-pcat]').forEach(x => x.classList.toggle('on', x === b));
            list.innerHTML = '<div class="xp-hint">Recherche le long du tracé…</div>';
            if (!cache) {
                // quelques points d'échantillonnage le long du tracé (un appel par point, rayon 12 km)
                const n = Math.max(1, Math.min(5, Math.ceil(acc[acc.length - 1] / 25000))), got = [];
                for (let j = 0; j < n; j++) { const c = all[Math.min(all.length - 1, Math.round((j + 0.5) / n * (all.length - 1)))]; const it = await this.fetchPoi(c); if (it) got.push(...it); }
                if (my !== seq) return;
                if (!got.length) { list.innerHTML = '<div class="xp-hint">Réseau indisponible : impossible de chercher pour le moment.</div>'; return; }
                const seen = new Set(), step = Math.max(1, Math.floor(all.length / 500));
                cache = got.filter(i => !seen.has(i.id) && seen.add(i.id)).map(i => {
                    let bi = 0, bd = 1e12; for (let q = 0; q < all.length; q += step) { const dd = this.metres(all[q], i.ll); if (dd < bd) { bd = dd; bi = q; } }
                    return Object.assign({}, i, { km: Math.round(acc[bi] / Math.max(1, acc[acc.length - 1]) * r.dist / 1000), off: Math.round(bd) });
                }).filter(i => i.off <= 2000).sort((x, y) => x.km - y.km);
            }
            const items = cache.filter(i => i.kind === k);
            if (!items.length) { list.innerHTML = '<div class="xp-hint">Rien trouvé à moins de 2 km du tracé.</div>'; return; }
            list.innerHTML = '';
            items.forEach(it => {
                const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'xp-res';
                bt.innerHTML = `<span class="xp-ri">${this.ico(CAT[k][1])}</span><span class="xp-rt"><b>${this.esc(it.name)}</b><small>km ${it.km} · à ${it.off} m du tracé</small></span>`;
                bt.onclick = () => { done(); this.addStopNear(it.ll, it.name); };
                list.appendChild(bt);
            });
        });
    },
    // Ajoute un arrêt de 15 min à la bonne place du tracé (tronçon le plus proche)
    addStopNear(ll, name) {
        const r = this.st.res; let leg = this.st.pts.length - 1, bd = 1e12;
        if (r) r.legs.forEach((L, k) => L.coords.forEach((c, i) => { if (i % 4) return; const dd = this.metres(c, ll); if (dd < bd) { bd = dd; leg = k; } }));
        this.insertAt(Math.min(this.st.pts.length, leg + 1), ll, name, { kind: 'stop', pause: 15 });
    },
    smsText() {
        const s = this.st, r = s.res; if (!r) return '';
        const eta = this.etas(), tot = r.dur + r.pauseTot, dt = new Date(s.depart || Date.now());
        return `${s.title || 'Balade moto'}\n${Math.round(r.dist / 1000)} km · ${this.fmtDur(tot)} · ${r.bends} virages\nDépart ${dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${this.fmtT(eta[0] || dt)}\n` + s.pts.map((p, i) => `${this.label(i, s.pts.length)} ${p.name}${eta[i] ? ' (' + this.fmtT(eta[i]) + ')' : ''}${p.note ? ' : ' + p.note : ''}`).join('\n');
    },
    sms() { const t = this.smsText(); if (!t) return; window.location.href = 'sms:&body=' + encodeURIComponent(t); },
    legGeo(L) { if (L._g == null) { let d = 0; for (let i = 1; i < L.coords.length; i++) d += this.metres(L.coords[i - 1], L.coords[i]); L._g = d; } return L._g; },

    // ---------- calcul ----------
    // Pastille d'état pendant le calcul (avec le temps écoulé) ; un appui sur « Annuler » arrête tout
    status(msg) { this._msg = msg; this.paintStatus(); },
    paintStatus() {
        const el = document.getElementById('xp-status'); if (!el) return;
        if (!this.busy) {
            const d = this._dl; el.hidden = !d;
            if (d) el.textContent = d.total ? `Carte détaillée du trajet… ${Math.round(d.done / d.total * 100)} %` : (d.phase || 'Carte détaillée du trajet…');
            return;
        }
        el.hidden = false; el.textContent = `${this._msg || 'Calcul…'} · ${Math.round((Date.now() - this._t0) / 1000)} s`;
    },
    cancel() { this.cancelled = true; if (this._dlP && typeof OfflineMaps !== 'undefined') { try { OfflineMaps.cancel(); } catch (e) {} } this._msg = 'Annulation…'; this.paintStatus(); },
    async calculate() {
        if (this.busy) { this.cancel(); return; }
        const s = this.st;
        if (s.pts.length < 2) { AppDialog.alert('Place au moins 2 points sur la carte : un départ et une arrivée.'); return; }
        const btn = document.getElementById('xp-calc'); this.busy = true; this.cancelled = false; this._t0 = Date.now(); this._engDeadline = Date.now() + 45000; this._msg = 'Calcul…';
        if (btn) { btn.textContent = 'Annuler'; btn.classList.add('xp-cancel'); }
        const tick = setInterval(() => this.paintStatus(), 1000); this.paintStatus();
        try {
            // la carte détaillée du couloir doit être là avant de calculer (calcul sur le téléphone)
            this._msg = 'Carte détaillée du trajet…'; this.paintStatus(); await this.prefetch(); if (this.cancelled) throw new Error('annulé');
            const seq = s.pts.map((p, i) => ({ p, i }));
            if (s.goal.type === 'loop') seq.push({ p: { ll: s.pts[0].ll, name: s.pts[0].name, kind: 'pass', pause: 0, mode: s.pts[s.pts.length - 1].mode }, i: s.pts.length, loop: true });
            const legs = [];
            for (let k = 1; k < seq.length; k++) {
                if (this.cancelled) throw new Error('annulé');
                const a = seq[k - 1].p, b = seq[k].p;
                const m = this.effMode(Math.min(seq[k].i, s.pts.length - 1));
                this._msg = seq.length > 2 ? `Tronçon ${k}/${seq.length - 1}` : 'Calcul…'; this.paintStatus();
                legs.push(await this.routeLeg(a.ll, b.ll, m, k));
            }
            this._msg = 'Altitude et météo…'; this.paintStatus();
            await this.analyse(legs);
            this.snap('mid');   // on voit le tracé sur la carte
            this.dirty = true; this.syncRoute(); this.renderSheet(); this.fit();
            this.weather();
        } catch (e) {
            if (!(this.cancelled || (e && e.message === 'annulé'))) {
                console.warn('Expert : calcul', e);
                AppDialog.alert('Impossible de calculer l\'itinéraire : ' + String((e && e.message) || e) + '\n\nVérifie ta connexion et réessaie.');
            }
        } finally { clearInterval(tick); this.busy = false; this.cancelled = false; const b2 = document.getElementById('xp-calc'); if (b2) { b2.textContent = 'Calculer'; b2.classList.remove('xp-cancel'); b2.disabled = false; } this.paintStatus(); }
    },
    async routeLeg(a, b, mode, k) {
        const f = this.MOTOS[this.st.moto][1], co = `${a[0]},${a[1]};${b[0]},${b[1]}`;
        const osrm = async () => {
            const d = await ModuleGPS.osrmJson(`${co}?overview=full&geometries=geojson`);
            if (!d) throw new Error('serveur d\'itinéraire injoignable (étape ' + k + ')');
            const r = d.routes[0]; return { coords: r.geometry.coordinates, dist: r.distance, dur: r.duration / f };
        };
        let out;
        if (mode === 'autoroute') out = await osrm();
        else if (mode === 'sinueux') {
            // moteur « routes d'amusement » : cherche les routes qui tournent, pas le plus court
            try {
                if (Date.now() > this._engDeadline - 4000) throw new Error('serveur de routes trop lent');
                let ref = null; try { this.status('Trajet de référence…'); const d = await ModuleGPS.osrmJson(`${co}?overview=full&geometries=geojson`, 7000); if (d) ref = d.routes[0].geometry.coordinates; } catch (e) {}
                const o = await ExpertMoteur.leg(a, b, { ref, style: Math.max(this.st.style, 55), avoidNat: !!this.st.avoid.nationales, status: (m) => this.status(m), cancelled: () => this.cancelled, deadline: this._engDeadline });
                const kmh = Math.max(34, 60 - 24 * o.fun);
                out = { coords: o.coords, dist: o.dist, dur: o.dist / (kmh / 3.6) / f, fun: o.fun, engine: 'curvy', offline: !!o.offline };
            } catch (e) {
                if (this.cancelled || (e && e.message === 'annulé')) throw new Error('annulé');
                console.warn('Expert : moteur d\'amusement indisponible →', e && e.message);
                const why = String((e && e.message) || e); this.status('Moteur indisponible → calcul standard…');
                try {
                    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 12000);
                    let r; try { r = await ModuleGPS.brouterFetch(`${a[0]},${a[1]}|${b[0]},${b[1]}`, 'moped', ac.signal); } finally { clearTimeout(to); }
                    if (!r.ok) throw new Error('brouter');
                    const d = await r.json(), ft = d.features && d.features[0]; if (!ft) throw new Error('brouter');
                    const dist = parseFloat(ft.properties['track-length']) || 0;
                    out = { coords: ft.geometry.coordinates, dist, dur: dist / (this.MODES[mode].kmh / 3.6) / f, fallback: true, why, surf: RouteQuality.splitOf(ft) };
                } catch (e2) { out = await osrm(); out.fallback = true; out.why = why; }
            }
        } else {
            try {
                const profile = mode === 'sinueux' ? 'moped' : 'fastbike';
                const ac = new AbortController(), to = setTimeout(() => ac.abort(), 12000);
                this.status('Calcul du tronçon…');
                let r; try { r = await ModuleGPS.brouterFetch(`${a[0]},${a[1]}|${b[0]},${b[1]}`, profile, ac.signal); } finally { clearTimeout(to); }
                if (!r.ok) throw new Error('brouter');
                const d = await r.json(), ft = d.features && d.features[0]; if (!ft) throw new Error('brouter');
                const dist = parseFloat(ft.properties['track-length']) || 0;
                out = { coords: ft.geometry.coordinates, dist, dur: dist / (this.MODES[mode].kmh / 3.6) / f, surf: RouteQuality.splitOf(ft) };
            } catch (e) { out = await osrm(); out.fallback = true; }
        }
        out.mode = mode; return out;
    },

    // ---------- analyse : virages, épingles, altitude ----------
    metres(c0, c1) { const R = 6371000, k = Math.PI / 180, x = (c1[0] - c0[0]) * k * Math.cos((c0[1] + c1[1]) / 2 * k), y = (c1[1] - c0[1]) * k; return Math.hypot(x, y) * R; },
    resample(coords, step) {
        const out = [coords[0]]; let acc = 0, last = coords[0];
        for (let i = 1; i < coords.length; i++) {
            let c = coords[i], d = this.metres(last, c);
            while (acc + d >= step) {
                const t = (step - acc) / d, p = [last[0] + (c[0] - last[0]) * t, last[1] + (c[1] - last[1]) * t];
                out.push(p); last = p; d = this.metres(last, c); acc = 0;
            }
            acc += d; last = c;
        }
        return out;
    },
    // Détecte les virages : suite de variations de cap de même sens. Léger ≥ 25°, serré ≥ 60°, épingle ≥ 120° sur ≤ 200 m.
    bendsOf(coords) {
        const P = this.resample(coords.map(c => [c[0], c[1]]), 20), res = { light: 0, tight: 0, hair: 0, pins: [] };
        if (P.length < 5) return res;
        const brg = (a, b) => Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI;
        const H = []; for (let i = 0; i + 2 < P.length; i++) H.push(brg(P[i], P[i + 2]));
        const wrap = d => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
        let sum = 0, len = 0, sign = 0, quiet = 0, startIdx = 0;
        const close = (end) => {
            const T = Math.abs(sum);
            if (T >= 25) {
                if (T >= 120 && len <= 200) { res.hair++; res.pins.push(P[Math.min(P.length - 1, Math.round((startIdx + end) / 2) + 1)]); } else if (T >= 60) res.tight++; else res.light++;
            }
            sum = 0; len = 0; sign = 0; quiet = 0;
        };
        for (let i = 1; i < H.length; i++) {
            const d = wrap(H[i] - H[i - 1]);
            if (Math.abs(d) >= 1.5) {
                const sg = d > 0 ? 1 : -1;
                if (sign && sg !== sign) close(i);
                if (!sign) startIdx = i;
                sign = sg; sum += d; len += 20; quiet = 0;
            } else if (sign && ++quiet >= 3) close(i);
        }
        if (sign) close(H.length);
        return res;
    },
    async elevations(coords) {
        if (coords.every(c => c.length > 2 && isFinite(c[2]))) return coords.map(c => c[2]);
        const N = 80, idx = []; for (let i = 0; i < N; i++) idx.push(Math.round(i * (coords.length - 1) / (N - 1)));
        const la = idx.map(i => coords[i][1].toFixed(4)).join(','), lo = idx.map(i => coords[i][0].toFixed(4)).join(',');
        const ac = new AbortController(), to = setTimeout(() => ac.abort(), 9000);
        try {
            const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${la}&longitude=${lo}`, { signal: ac.signal });
            const d = await r.json(); if (!d.elevation || d.elevation.length !== N) return null;
            const out = new Array(coords.length);
            for (let i = 0; i < N - 1; i++) for (let j = idx[i]; j <= idx[i + 1]; j++) { const t = idx[i + 1] === idx[i] ? 0 : (j - idx[i]) / (idx[i + 1] - idx[i]); out[j] = d.elevation[i] + (d.elevation[i + 1] - d.elevation[i]) * t; }
            return out;
        } catch (e) { return null; } finally { clearTimeout(to); }
    },
    async analyse(legs) {
        const s = this.st, all = []; let dist = 0, dur = 0; const cum = []; let pauseTot = 0;
        const legStart = [0], legEnd = [];
        legs.forEach(l => { legStart.push(all.length + l.coords.length); all.push(...(all.length ? l.coords.slice(1) : l.coords)); dist += l.dist; dur += l.dur; });
        // pauses : les « Arrêt » ajoutent leur durée à la fin du tronçon qui y mène
        s.pts.forEach(p => { if (p.kind === 'stop') pauseTot += (p.pause || 0) * 60; });
        const b = { light: 0, tight: 0, hair: 0, pins: [] };
        legs.forEach(l => { const r = this.bendsOf(l.coords); b.light += r.light; b.tight += r.tight; b.hair += r.hair; b.pins.push(...r.pins); });
        // distance cumulée en fin de chaque tronçon (pour l'altitude et les ETA)
        let c = 0; const legDist = legs.map(l => (c += l.dist)); let t = 0; const legTime = legs.map(l => (t += l.dur));
        const z = await this.elevations(all);
        let elev = null, gain = 0, max = null;
        if (z) {
            const N = 120, ev = [];
            for (let i = 0; i < N; i++) ev.push(z[Math.round(i * (z.length - 1) / (N - 1))]);
            const sm = ev.map((v, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - 1); j <= Math.min(N - 1, i + 1); j++) { a += ev[j]; n++; } return a / n; });
            for (let i = 1; i < N; i++) if (sm[i] > sm[i - 1]) gain += sm[i] - sm[i - 1];
            max = Math.max(...sm); elev = sm;
        }
        // Revêtement : seulement si les tronçons BRouter (revêtement connu) couvrent au moins la moitié du trajet
        let pv = 0, up = 0; legs.forEach(l => { if (l.surf) { pv += l.surf.paved; up += l.surf.unpaved; } });
        const asphalt = (pv + up) > 0 && (pv + up) >= dist * 0.5 ? pv / (pv + up) : null;
        s.res = {
            asphalt, legs, dist, dur, pauseTot, legDist, legTime, elev, gain: Math.round(gain), max: max == null ? null : Math.round(max),
            bends: b.light + b.tight + b.hair, light: b.light, tight: b.tight, hair: b.hair, pinPts: b.pins, wx: null
        };
    },

    // ---------- météo à chaque étape ----------
    etas() {
        const s = this.st, r = s.res; if (!r) return [];
        const t0 = new Date(s.depart).getTime(); if (isNaN(t0)) return [];
        const out = []; let pause = 0;
        s.pts.forEach((p, i) => {
            const driven = i === 0 ? 0 : (r.legTime[i - 1] || 0);
            out.push(new Date(t0 + (driven + pause) * 1000));
            if (p.kind === 'stop') pause += (p.pause || 0) * 60;
        });
        return out;
    },
    async weather() {
        const s = this.st, r = s.res; if (!r) return;
        const eta = this.etas(); if (!eta.length) return;
        const key = JSON.stringify([s.depart, s.pts.map(p => p.ll), s.pts.map(p => p.pause)]); r.wxKey = key;
        const out = await Promise.all(s.pts.map(async (p, i) => {
            try {
                const ac = new AbortController(), to = setTimeout(() => ac.abort(), 9000);
                const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.ll[1]}&longitude=${p.ll[0]}&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=7`;
                const d = await (await fetch(u, { signal: ac.signal })).json(); clearTimeout(to);
                const e = eta[i], pad = n => String(n).padStart(2, '0');
                const h = Math.round(e.getTime() / 3600000) * 3600000, hh = new Date(h), tag = `${hh.getFullYear()}-${pad(hh.getMonth() + 1)}-${pad(hh.getDate())}T${pad(hh.getHours())}:00`;
                const k = d.hourly.time.indexOf(tag); if (k < 0) return null;
                return { code: d.hourly.weather_code[k], t: Math.round(d.hourly.temperature_2m[k]), pop: d.hourly.precipitation_probability[k] || 0 };
            } catch (er) { return null; }
        }));
        if (this.st.res !== r || r.wxKey !== key) return;
        r.wx = out; this.renderSheet();
    },
    wxIcon(code) {
        const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>';
        const cloud = '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z"/>';
        if (code === 0) return sun;
        if (code <= 2) return '<path d="M8 6.5 7 5M4 11H2.5M12.5 5.5 13.5 4"/><circle cx="8.5" cy="10" r="2.5"/><path d="M9 20a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.5-.5A3.5 3.5 0 0 1 17 20z"/>';
        if (code === 3 || code === 45 || code === 48) return cloud;
        if (code >= 95) return cloud + '<path d="m12 12-2 4h3l-2 4"/>';
        if (code >= 71 && code <= 77 || code === 85 || code === 86) return cloud + '<path d="M9 21v.01M12 21v.01M15 21v.01"/>';
        return cloud + '<path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2"/>';
    },
    wxBad(w) { return !!w && (w.code >= 95 || w.pop >= 70 || (w.code >= 61 && w.code <= 67) || (w.code >= 80 && w.code <= 82)); },

    // ---------- panneau ----------
    fmtDur(s) { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; },
    fmtT(d) { return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); },
    renderSheet() {
        const sc = document.getElementById('xp-sc'); if (!sc) return;
        const keepScroll = sc.scrollTop, s = this.st, r = s.res, n = s.pts.length, eta = this.etas();
        const km = r ? (r.dist / 1000) : 0, tot = r ? r.dur + r.pauseTot : 0;
        const stats = `<div class="xp-stats">
            <div><b>${r ? Math.round(km) + ' km' : '–'}</b><small>Distance</small></div>
            <div><b>${r ? this.fmtDur(tot) : '–'}</b><small>Durée</small></div>
            <div><b>${r ? r.bends : '–'}</b><small>Virages</small></div>
            <div><b class="xp-hot">${r ? r.hair : '–'}</b><small>Épingles</small></div></div>`;
        let goalNote = '';
        if (r && s.goal.type === 'time') { const d = Math.round((tot / 3600 - s.goal.val) * 60); goalNote = `Objectif ${s.goal.val} h : ${d === 0 ? 'atteint' : (d > 0 ? '+' : '−') + this.fmtDur(Math.abs(d) * 60)}`; }
        if (r && s.goal.type === 'dist') { const d = Math.round(km - s.goal.val); goalNote = `Objectif ${s.goal.val} km : ${d === 0 ? 'atteint' : (d > 0 ? '+' : '−') + Math.abs(d) + ' km'}`; }
        const mini = r && r.elev ? `<div class="xp-mini">${this.altSvg(r, 60)}</div>` : '';
        const chips = n ? `<div class="xp-chips">${s.pts.map((p, i) => {
            const w = r && r.wx && r.wx[i];
            return `<span class="xp-chip${i === 0 ? ' on' : ''}">${this.label(i, n)} · ${eta[i] && r ? this.fmtT(eta[i]) : '--:--'}${w ? ' <svg class="xp-i xp-w' + (this.wxBad(w) ? ' bad' : '') + '" viewBox="0 0 24 24">' + this.wxIcon(w.code) + '</svg>' : ''}</span>`;
        }).join('')}</div>` : '<div class="xp-hint">Touche la carte pour placer ton départ, puis tes étapes.</div>';

        const steps = s.pts.map((p, i) => {
            const m = i === 0 ? '' : `<div class="xp-modes">${Object.keys(this.MODES).map(k => `<button type="button" data-mode="${k}" data-i="${i}" class="${p.mode === k ? 'on' : ''}" aria-label="${this.MODES[k].label}" title="${this.MODES[k].label}">${this.ico(this.MODES[k].svg)}</button>`).join('')}</div>`;
            const tag = i === 0 ? `<span class="xp-tag">Départ</span>` : `<button type="button" class="xp-tag xp-kind" data-i="${i}">${p.kind === 'stop' ? 'Arrêt ' + p.pause + ' min' : 'Passage'}</button>`;
            const lg = r && i > 0 && r.legs[i - 1] ? r.legs[i - 1] : null;
            const info = lg ? `<span class="xp-leg">${this.MODES[lg.mode].label} · ${Math.round(lg.dist / 1000)} km · ${this.fmtDur(lg.dur)}</span>` : '';
            const arr = n > 1 ? `<button type="button" class="xp-grip" data-i="${i}"${p.lock ? ' data-lock-on="1"' : ''} aria-label="Glisser pour changer l'ordre" title="Glisser pour changer l'ordre">${this.ico('<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>')}</button>` : '';
            return `<div class="xp-step"><span class="xp-dot ${i === 0 ? 's' : p.kind === 'stop' ? 'a' : 'v'}">${this.label(i, n)}</span>
                <button type="button" class="xp-nm" data-i="${i}">${this.esc(p.name)}</button>${tag}
                ${arr}<button type="button" class="xp-del" data-i="${i}" aria-label="Supprimer ce point"${p.lock ? ' disabled' : ''}>${this.ico('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
                <div class="xp-r2">${m}${info}<span class="xp-ex"><button type="button" class="xp-ib${p.note ? ' on' : ''}" data-note="${i}" aria-label="Note de l'étape" title="Note">${this.ico(this.IC.note)}</button><button type="button" class="xp-ib${p.lock ? ' on' : ''}" data-lock="${i}" aria-label="${p.lock ? 'Déverrouiller' : 'Verrouiller'} l'étape" title="Verrouiller">${this.ico(this.IC.lock)}</button></span></div>
                ${p.note ? `<div class="xp-nt">${this.esc(p.note)}</div>` : ''}</div>`;
        }).join('');

        const styleName = s.style >= 67 ? 'Le plus tordu' : s.style >= 34 ? 'Sinueux' : s.style >= 15 ? 'Rapide' : 'Direct';
        const goalChips = [['free', 'Libre'], ['loop', 'Boucle'], ['time', 'Durée'], ['dist', 'Distance']].map(([k, l]) => `<button type="button" class="xp-c${s.goal.type === k ? ' on' : ''}" data-goal="${k}">${l}</button>`).join('');
        const goalVal = (s.goal.type === 'time' || s.goal.type === 'dist') ? `<div class="xp-step2"><button type="button" class="xp-c" data-gv="-1">−</button><b>${s.goal.val} ${s.goal.type === 'time' ? 'h' : 'km'}</b><button type="button" class="xp-c" data-gv="1">+</button></div>` : '';
        const avoid = [['autoroutes', 'Autoroutes'], ['peages', 'Péages'], ['nationales', 'Nationales']].map(([k, l]) => `<button type="button" class="xp-c${s.avoid[k] ? ' on' : ''}" data-avoid="${k}">${l}</button>`).join('');
        const motos = Object.keys(this.MOTOS).map(k => `<button type="button" class="xp-c${s.moto === k ? ' on' : ''}" data-moto="${k}">${this.MOTOS[k][0]}</button>`).join('');

        let analyse = '';
        if (r) {
            const alt = r.elev ? `<div class="xp-card"><div class="xp-lab"><span>Altitude</span><span class="xp-w1">max ${r.max} m · +${r.gain} m</span></div>${this.altSvg(r, 90, true)}<div class="xp-lg"><span>Départ</span><span>Arrivée</span></div></div>` : '<div class="xp-card"><div class="xp-lab"><span>Altitude</span></div><div class="xp-hint">Profil d\'altitude indisponible (pas de réseau).</div></div>';
            const mx = Math.max(1, r.light, r.tight, r.hair), perKm = km ? (r.bends / km) : 0;
            const bar = (l, v, c) => `<span>${l}</span><div class="xp-bar"><i style="width:${Math.round(v / mx * 100)}%;background:${c}"></i></div><span>${v}</span>`;
            const rate = perKm >= 1.2 ? 'Route excellente' : perKm >= 0.7 ? 'Très amusante' : perKm >= 0.35 ? 'Sympa' : 'Plutôt calme';
            const vir = `<div class="xp-card"><div class="xp-lab"><span>Compteur de virages</span><span class="xp-w1">${rate} · ${perKm.toFixed(2).replace('.', ',')} par km</span></div><div class="xp-bars">${bar('Légers', r.light, '#fff')}${bar('Serrés', r.tight, '#c7c7cc')}${bar('Épingles', r.hair, '#ff9f0a')}</div></div>`;
            let wxHtml = '', warn = '';
            if (r.wx) {
                wxHtml = `<div class="xp-wx">${s.pts.map((p, i) => { const w = r.wx[i]; return `<div class="${this.wxBad(w) ? 'bad' : ''}"><small>${this.label(i, n)}</small>${w ? `<svg class="xp-i" viewBox="0 0 24 24">${this.wxIcon(w.code)}</svg><b>${w.t}°</b>` : '<b>–</b>'}<small>${eta[i] ? this.fmtT(eta[i]) : ''}</small></div>`; }).join('')}</div>`;
                const bi = r.wx.findIndex(w => this.wxBad(w));
                if (bi >= 0) warn = `<div class="xp-warn">Pluie ou orage prévu vers ${this.fmtT(eta[bi])} à ${this.esc(s.pts[bi].name)}. Pense à partir plus tôt ou à décaler.</div>`;
            } else wxHtml = '<div class="xp-hint">Prévisions en cours de chargement (jusqu\'à 7 jours)…</div>';
            const fu = this.fuelPoint();
            const fuel = fu ? `<div class="xp-warn">Plein conseillé vers le km ${fu.km} (autonomie ${s.range} km, marge de 10 %).<button type="button" class="xp-c on" id="xp-fuel" style="margin-top:8px">Ajouter un arrêt carburant ici</button></div>` : '';
            let rev = '';
            if (typeof r.asphalt === 'number') { const pc = Math.round(r.asphalt * 100), bad = pc < RouteQuality.PISTE_SEUIL; rev = `<div class="xp-card"><div class="xp-lab"><span>Revêtement</span><span class="xp-w1${bad ? ' xp-hot' : ''}">${bad ? '⚠ ' : ''}${pc} % asphalte</span></div><div class="xp-rev"><i style="width:${pc}%"></i></div></div>`; }
            analyse = alt + rev + vir + `<div class="xp-card"><div class="xp-lab"><span>Météo à chaque étape</span></div>${wxHtml}${warn}</div>` + (fuel ? `<div class="xp-card"><div class="xp-lab"><span>Carburant</span></div>${fuel}</div>` : '');
            if (r.cmp) {
                const c = r.cmp, dk = Math.round((r.dist - c.dist) / 1000), dm = Math.round((r.dur - c.dur) / 60), db = r.bends - c.bends, sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
                analyse += `<div class="xp-card"><div class="xp-lab"><span>Comparaison · trajet direct</span></div>
                    <div class="xp-cmp"><span></span><b>Direct</b><b>Ton tracé</b>
                    <span>Distance</span><span>${Math.round(c.dist / 1000)} km</span><span>${Math.round(r.dist / 1000)} km</span>
                    <span>Durée</span><span>${this.fmtDur(c.dur)}</span><span>${this.fmtDur(r.dur)}</span>
                    <span>Virages</span><span>${c.bends}</span><span>${r.bends}</span>
                    <span>Épingles</span><span>${c.hair}</span><span>${r.hair}</span></div>
                    <div class="xp-hint">${sg(dk)} km · ${sg(dm)} min · ${sg(db)} virages par rapport au trajet direct.</div></div>`;
            } else analyse += `<div class="xp-card"><div class="xp-lab"><span>Comparaison</span></div><button type="button" class="xp-c on" id="xp-cmp2" ${this._cmpBusy ? 'disabled' : ''}>${this._cmpBusy ? 'Calcul du trajet direct…' : 'Comparer avec le trajet direct'}</button></div>`;
            const fb = r.legs.filter(l => l.fallback);
            if (fb.length) analyse += `<div class="xp-hint">${fb.length > 1 ? fb.length + ' tronçons ont' : 'Un tronçon a'} été calculé${fb.length > 1 ? 's' : ''} avec le routage standard : ${this.esc(fb[0].why || 'service indisponible')}.</div>`;
            const cv = r.legs.filter(l => l.engine === 'curvy'); if (cv.length) analyse += `<div class="xp-hint">${cv.length} tronçon${cv.length > 1 ? 's' : ''} calculé${cv.length > 1 ? 's' : ''} par la recherche de routes d'amusement.</div>`;
        }

        const hd = document.getElementById('xp-hd'); if (hd) hd.innerHTML = stats + (goalNote ? '<div class="xp-goal">' + goalNote + '</div>' : '');
        const tab = this._tab || 'etapes', H = this._h || { u: [], r: [] };
        const T = [['etapes', 'Étapes', this.IC.steps], ['reglages', 'Réglages', this.IC.sliders], ['analyse', 'Analyse', this.IC.chart], ['outils', 'Outils', this.IC.tools]];
        const tabs = `<div class="xp-tabs" role="tablist">${T.map(([k, l, ic]) => `<button type="button" role="tab" class="xp-tab${tab === k ? ' on' : ''}" data-tab="${k}" aria-selected="${tab === k}">${this.ico(ic)}<span>${l}</span></button>`).join('')}</div>`;
        const fuP = r ? this.fuelPoint() : null;
        const quick = `<div class="xp-card"><div class="xp-lab"><span>Ajout rapide</span></div><div class="xp-cs">
            <button type="button" class="xp-c xp-ico" id="xp-qs">${this.ico(this.IC.search)}Recherche</button>
            <button type="button" class="xp-c xp-ico" id="xp-qm">${this.ico(this.IC.me)}Ma position</button>
            <button type="button" class="xp-c xp-ico" id="xp-qf" ${fuP ? '' : 'disabled'}>${this.ico(this.IC.fuel)}Plein</button>
            <button type="button" class="xp-c xp-ico" id="xp-qp" ${r ? '' : 'disabled'}>${this.ico(this.IC.cup)}Pause</button></div></div>`;
        const presets = `<div class="xp-card"><div class="xp-lab"><span>Préréglages</span></div><div class="xp-cs">${this.PRESETS.map(P => {
            const on = s.style === P.style && ['autoroutes', 'peages', 'nationales'].every(k => !!s.avoid[k] === P.avoid[k]) && (P.goal === 'loop') === (s.goal.type === 'loop');
            return `<button type="button" class="xp-c${on ? ' on' : ''}" data-preset="${P.id}">${P.label}</button>`; }).join('')}</div></div>`;
        const pauses = `<div class="xp-card"><div class="xp-lab"><span>Pauses automatiques</span></div><div class="xp-cs">${[[0, 'Aucune'], [60, 'Toutes les 1 h'], [90, 'Toutes les 1 h 30'], [120, 'Toutes les 2 h']].map(([v, l]) => `<button type="button" class="xp-c${s.pauseEvery === v ? ' on' : ''}" data-pe="${v}">${l}</button>`).join('')}</div>
            <button type="button" class="xp-c xp-ico xp-wide" id="xp-pauses" ${r && s.pauseEvery ? '' : 'disabled'}>${this.ico(this.IC.cup)}Placer les pauses sur le tracé</button>
            ${r ? '' : '<div class="xp-hint">Disponible une fois l\'itinéraire calculé.</div>'}</div>`;
        const tile = (id, ic, l, sub, dis) => `<button type="button" class="xp-tl" id="${id}" ${dis ? 'disabled' : ''}>${this.ico(ic)}<b>${l}</b><small>${sub}</small></button>`;
        const tools = `<div class="xp-tg">
            ${tile('xp-t-undo', this.IC.undo, 'Annuler', 'dernière modification', !H.u.length)}${tile('xp-t-redo', this.IC.redo, 'Rétablir', 'modification annulée', !H.r.length)}
            ${tile('xp-rev', this.IC.rev, 'Inverser', 'le sens du trajet', n < 2)}${tile('xp-dup', this.IC.dup, 'Dupliquer', 'en faire une variante', !n)}
            ${tile('xp-cmp', this.IC.compare, 'Comparer', 'avec le trajet direct', !r)}${tile('xp-loop', this.IC.dice, 'Boucle surprise', 'selon une durée', !n)}
            ${tile('xp-poi', this.IC.pin, 'Points d\'intérêt', 'carburant, restos, vues', !r)}${tile('xp-sms', this.IC.sms, 'Envoyer par SMS', 'message prérempli', !r)}
            ${tile('xp-imp', this.IC.imp, 'Importer GPX', 'depuis un fichier', false)}${tile('xp-exp', this.IC.exp, 'Exporter GPX', 'partager le tracé', !r)}</div>`;
        sc.innerHTML = `${tabs}
            <div class="xp-more">
            <div class="xp-pane" data-p="etapes" ${tab === 'etapes' ? '' : 'hidden'}>${mini}${chips}
                <div class="xp-card"><div class="xp-lab"><span>Étapes · mode de conduite</span></div>${steps || '<div class="xp-hint">Aucun point pour l\'instant.</div>'}
                    <div class="xp-lg2">${Object.keys(this.MODES).map(k => `<span>${this.ico(this.MODES[k].svg)} ${this.MODES[k].label}</span>`).join('')}</div>
                    <div class="xp-hint">Sans choix, le mode suit le style de route (onglet Réglages).</div></div>
                ${quick}</div>
            <div class="xp-pane" data-p="reglages" ${tab === 'reglages' ? '' : 'hidden'}>
                ${presets}
                <div class="xp-card"><div class="xp-lab"><span>Style de route</span><span class="xp-w1">${styleName} ${s.style} %</span></div>
                    <input type="range" id="xp-style" min="0" max="100" value="${s.style}"><div class="xp-rl"><span>Rapide</span><span>Équilibré</span><span>Le plus tordu</span></div></div>
                <div class="xp-card"><div class="xp-lab"><span>Éviter</span></div><div class="xp-cs">${avoid}</div></div>
                <div class="xp-card"><div class="xp-lab"><span>Objectif</span></div><div class="xp-cs">${goalChips}</div>${goalVal}</div>
                <div class="xp-card"><div class="xp-lab"><span>Profil moto</span></div><div class="xp-cs">${motos}</div></div>
                <div class="xp-card"><div class="xp-lab"><span>Départ</span></div><input type="datetime-local" id="xp-dep" value="${this.esc(s.depart)}"></div>
                ${pauses}</div>
            <div class="xp-pane" data-p="analyse" ${tab === 'analyse' ? '' : 'hidden'}>${r ? analyse : '<div class="xp-card"><div class="xp-hint">Calcule l\'itinéraire pour voir l\'altitude, les virages, la météo à chaque étape et le carburant.</div></div>'}</div>
            <div class="xp-pane" data-p="outils" ${tab === 'outils' ? '' : 'hidden'}>${tools}</div>
            <div class="xp-acts"><button type="button" class="btn" id="xp-save" ${r ? '' : 'disabled'}>${r && !this.dirty && this.st.libId ? 'Enregistré ✓' : 'Enregistrer'}</button><button type="button" class="btn btn-primary" id="xp-go" ${r ? '' : 'disabled'}>Démarrer</button></div>
            </div>`;
        sc.scrollTop = keepScroll;
        this.bind(sc);
    },
    altSvg(r, h, withMarks) {
        const e = r.elev, W = 320, lo = Math.min(...e), hi = Math.max(...e), span = Math.max(30, hi - lo), N = e.length;
        const X = i => (i / (N - 1) * W).toFixed(1), Y = v => (h - 6 - (v - lo) / span * (h - 14)).toFixed(1);
        const line = e.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ');
        let marks = '';
        if (withMarks) {
            const tot = r.dist;
            this.st.pts.forEach((p, i) => { if (i === 0 || i >= r.legDist.length + 1) return; const d = r.legDist[i - 1] / tot * W; marks += `<line x1="${d.toFixed(1)}" x2="${d.toFixed(1)}" y1="0" y2="${h}" stroke="currentColor" stroke-dasharray="2 3" opacity=".45"/><text x="${Math.min(W - 6, d + 3).toFixed(1)}" y="11" font-size="9" fill="currentColor" font-weight="800">${this.label(i, this.st.pts.length)}</text>`; });
        }
        return `<svg class="xp-alt" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="height:${h}px"><path d="${line} L${W} ${h} L0 ${h}Z" fill="currentColor" opacity=".16"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>${marks}</svg>`;
    },
    bind(sc) {
        const q = (sel, fn) => sc.querySelectorAll(sel).forEach(fn);
        q('.xp-modes button', b => b.onclick = () => { const p = this.st.pts[+b.dataset.i]; p.mode = p.mode === b.dataset.mode ? 'auto' : b.dataset.mode; this.touch(); });
        q('.xp-kind', b => b.onclick = () => { const p = this.st.pts[+b.dataset.i], seq = [0, 15, 30, 45, 60], k = seq.indexOf(p.kind === 'stop' ? p.pause : 0); const nx = seq[(k + 1) % seq.length]; p.kind = nx ? 'stop' : 'pass'; p.pause = nx; this.touch(); });
        q('.xp-nm', b => b.onclick = async () => { const p = this.st.pts[+b.dataset.i]; const v = await AppDialog.prompt('Nom de l\'étape', p.name, { maxLength: 40 }); if (v && v.trim()) { p.name = v.trim(); this.dirty = true; this.renderSheet(); this.syncMarkers(); } });
        q('.xp-grip', g => { if (!g.dataset.lockOn) this.dragStep(g, sc); });
        q('[data-tab]', b => b.onclick = () => { this._tab = b.dataset.tab; sc.scrollTop = 0; this.renderSheet(); });
        q('[data-note]', b => b.onclick = async () => { const p = this.st.pts[+b.dataset.note]; const v = await AppDialog.prompt('Note pour cette étape (carburant, resto, souvenir…)', p.note || '', { maxLength: 120 }); if (v === null) return; if (v.trim()) p.note = v.trim(); else delete p.note; this.dirty = true; this.renderSheet(); });
        q('[data-lock]', b => b.onclick = () => { const p = this.st.pts[+b.dataset.lock]; if (p.lock) delete p.lock; else p.lock = true; this.dirty = true; this.renderSheet(); });
        q('[data-preset]', b => b.onclick = () => { const P = this.PRESETS.find(x => x.id === b.dataset.preset); if (!P) return; this.st.style = P.style; this.st.avoid = Object.assign({}, P.avoid); this.st.goal.type = P.goal; this.touch(); });
        q('[data-pe]', b => b.onclick = () => { this.st.pauseEvery = +b.dataset.pe; this.dirty = true; this.renderSheet(); });
        q('[data-rg]', b => b.onclick = () => { this.st.range = Math.max(60, Math.min(600, this.st.range + 10 * +b.dataset.rg / 10)); this.dirty = true; this.renderSheet(); });
        const bi = (id, fn) => { const e = sc.querySelector(id); if (e) e.onclick = fn; };
        bi('#xp-qs', () => this.openSearch()); bi('#xp-qm', () => this.addMe());
        bi('#xp-qf', () => { const f = this.fuelPoint(); if (f) this.insertAt(f.leg + 1, f.ll, 'Plein carburant', { kind: 'stop', pause: 15 }); });
        bi('#xp-qp', () => { const r = this.st.res; if (!r) return; const pt = this.pointAt(r.dist / 2); if (pt) this.insertAt(pt.leg + 1, pt.ll, 'Pause', { kind: 'stop', pause: 15 }); });
        bi('#xp-pauses', () => this.placePauses());
        bi('#xp-t-undo', () => this.undo()); bi('#xp-t-redo', () => this.redo());
        bi('#xp-cmp', () => this.compare()); bi('#xp-cmp2', () => this.compare()); bi('#xp-loop', () => this.loopSurprise()); bi('#xp-poi', () => this.openPoi()); bi('#xp-sms', () => this.sms());
        bi('#xp-rev', () => this.reverse()); bi('#xp-dup', () => this.duplicate()); bi('#xp-imp', () => this.importGpx()); bi('#xp-exp', () => this.exportGpx());
        bi('#xp-fuel', () => { const f = this.fuelPoint(); if (f) this.insertAt(f.leg + 1, f.ll, 'Plein carburant', { kind: 'stop', pause: 15 }); });
        q('.xp-del', b => b.onclick = () => { this.st.pts.splice(+b.dataset.i, 1); this.touch(); });
        q('[data-avoid]', b => b.onclick = () => { this.st.avoid[b.dataset.avoid] = !this.st.avoid[b.dataset.avoid]; this.touch(); });
        q('[data-goal]', b => b.onclick = () => { this.st.goal.type = b.dataset.goal; if (b.dataset.goal === 'dist' && this.st.goal.val < 20) this.st.goal.val = 200; if (b.dataset.goal === 'time' && this.st.goal.val > 12) this.st.goal.val = 3; this.touch(); });
        q('[data-gv]', b => b.onclick = () => { const t = this.st.goal.type === 'time', stp = t ? 0.5 : 10; this.st.goal.val = Math.max(t ? 0.5 : 10, +(this.st.goal.val + stp * +b.dataset.gv).toFixed(1)); this.dirty = true; this.renderSheet(); });
        q('[data-moto]', b => b.onclick = () => { this.st.moto = b.dataset.moto; this.touch(); });
        const sl = sc.querySelector('#xp-style');
        if (sl) {
            sl.oninput = () => { this.st.style = +sl.value; const l = sc.querySelector('.xp-lab .xp-w1'); };
            sl.onchange = () => { this.st.style = +sl.value; this.touch(); };
            sl.addEventListener('input', () => { const lab = sl.closest('.xp-card').querySelector('.xp-w1'); const v = +sl.value; lab.textContent = `${v >= 67 ? 'Le plus tordu' : v >= 34 ? 'Sinueux' : v >= 15 ? 'Rapide' : 'Direct'} ${v} %`; });
        }
        const dep = sc.querySelector('#xp-dep');
        if (dep) dep.onchange = () => { if (!dep.value) return; this.st.depart = dep.value; this.dirty = true; if (this.st.res) { this.st.res.wx = null; this.renderSheet(); this.weather(); } else this.renderSheet(); };
        const sv = sc.querySelector('#xp-save'), go = sc.querySelector('#xp-go');
        if (sv) sv.onclick = () => this.save();
        this.paintBm(); this.paintHist();
        if (go) go.onclick = async () => { const lib = await this.save(true); if (lib) { await this.close(true); ModuleGPS.openSavedRoute(lib); } };
    },

    // Pastille « marque-page » dans la barre du haut : toujours visible dès qu'un tracé est calculé (plein = déjà dans la bibliothèque)
    paintBm() {
        const b = document.getElementById('xp-bm'); if (!b) return;
        const r = !!this.st.res, saved = r && !this.dirty && !!this.st.libId;
        b.hidden = !r; b.classList.toggle('xp-saved', saved);
        b.onclick = () => this.save();
        const sv = document.getElementById('xp-save'); if (sv && r) sv.textContent = saved ? 'Enregistré ✓' : 'Enregistrer';
    },
    // ---------- enregistrement ----------
    async save(quiet) {
        const s = this.st, r = s.res; if (!r) return null;
        let title = s.title;
        if (!title) {
            const def = `${s.pts[0].name} ➔ ${s.pts[s.pts.length - 1].name}`;
            const v = await AppDialog.prompt('Nom de l\'itinéraire', def, { maxLength: 60 }); if (v === null) return null; title = (v.trim() || def);
        }
        s.title = title;
        const coords = [].concat(...r.legs.map((l, i) => i ? l.coords.slice(1) : l.coords)).map(c => [+c[0].toFixed(5), +c[1].toFixed(5)]);
        const geojson = { type: 'LineString', coordinates: coords };
        const km = Math.round(r.dist / 1000), mins = Math.round((r.dur + r.pauseTot) / 60);
        const lib = AppStore.arr('moto_saved_routes', true);
        let entry = s.libId ? lib.find(x => x.id === s.libId) : null;
        const prev = ModuleGPS.generateRoutePreviewSVG ? ModuleGPS.generateRoutePreviewSVG(geojson) : '';
        const fields = { title, mode: 'sinueux', dist: km + ' km', time: mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}` : mins + ' min', preview: prev, geojson, expert: true };
        if (entry) Object.assign(entry, fields); else { entry = Object.assign({ id: Date.now() }, fields); lib.push(entry); s.libId = entry.id; }
        if (!AppStore.set('moto_saved_routes', lib)) return null;
        const L = this.list();
        const rec = { id: s.id || Date.now(), libId: s.libId, title, pts: s.pts, style: s.style, avoid: s.avoid, goal: s.goal, moto: s.moto, range: s.range, depart: s.depart, stats: { km, bends: r.bends, hairpins: r.hair, gain: r.gain, asphalt: typeof r.asphalt === 'number' ? Math.round(r.asphalt * 100) : null } };
        s.id = rec.id; const k = L.findIndex(x => x.id === rec.id); if (k >= 0) L[k] = rec; else L.push(rec);
        AppStore.set(this.KEY, L);
        this.dirty = false;
        try { if (typeof ModuleGPS.loadLibrary === 'function') ModuleGPS.loadLibrary(); } catch (e) {}
        const t = document.querySelector('#xp-editor .xp-ttl'); if (t) t.textContent = title;
        this.paintBm();
        return entry;
    }
};
(function () { const go = () => ModuleExpert.init(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); })();
