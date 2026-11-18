// Points d'intérêt : essence, restos, cafés/bars
// Étend ModuleGPS (défini dans carte/carte.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleGPS, {
                // -----------------------------------------------------------
                // RADAR DE POINTS D'INTÉRÊTS (STATIONS, RESTOS, CAFÉS / BARS)
                //  • Stations 0-50 km : API officielle "Prix des carburants" (toutes les stations + prix)
                //  • Restos / cafés / bars 0-20 km : Photon (même moteur que la recherche d'adresse)
                //  • Zoom rapproché (≥14) : tuiles OpenStreetMap, détail complet
                //  • Vue large : bulles de regroupement avec le nombre de lieux par type
                // -----------------------------------------------------------
                POI_SRC: 'poi-osm',
                POI_LAYER: 'poi-osm-layer',
                POI_TILES: 'https://tiles.openfreemap.org/planet',
                POI_TILE_ZOOM: 14,
                WIDE_SRC: 'poi-wide',
                WIDE_FUEL: 'poi-wide-fuel',
                WIDE_OTHER: 'poi-wide-other',
                FUEL_RADIUS_KM: 50,
                FOOD_RADIUS_KM: 20,
                CLUSTER_MAX_ZOOM: 9,
     // zoom ≤ 9 (vue ~50 km) : bulles ; zoom ≥ 10 (vue ~20 km) : icônes
                POI_MIN_ZOOM: 7,
                FUEL_API: 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records',
                PHOTON_API: 'https://photon.komoot.io/api/',
                POI_TYPES: {
                    fuel:  ['fuel'],
                    food:  ['restaurant', 'fast_food', 'food_court'],
                    drink: ['cafe', 'bar', 'pub', 'biergarten']
                },
                POI_STYLE: {
                    fuel:  { color: '#ff9f0a', label: 'Station-service', paths: ['M3 22v-8h12v8', 'M3 14V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10', 'M14 6h7a1 1 0 0 1 1 1v6a2 2 0 0 1-2 2h-1v5a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-5'] },
                    food:  { color: '#32ade6', label: 'Restaurant', paths: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7'] },
                    drink: { color: '#bf5af2', label: 'Café / Bar', paths: ['M18 8h1a4 4 0 0 1 0 8h-1', 'M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z', 'M6 1v3', 'M10 1v3', 'M14 1v3'] }
                },
                POI_SUBTYPE: { fuel: 'Station-service', restaurant: 'Restaurant', fast_food: 'Restauration rapide', food_court: 'Aire de restauration', cafe: 'Café', bar: 'Bar', pub: 'Pub', biergarten: 'Brasserie' },
                // Carte sur laquelle le radar travaille : la carte de l'onglet Carte, ou celle du mode Expert pendant qu'elle est ouverte
                poiMap() { return this.state.poiMapOverride || this.state.map; },
                // Mode Expert : même radar (mêmes API, mêmes tuiles, mêmes bulles et fiches) affiché sur la carte Expert, les 3 catégories actives
                poiBorrow(map, onPick) {
                    const s = this.state; if (s.poiLoan) this.poiRelease();
                    s.poiLoan = { show: s.showPOIs, filters: Object.assign({}, s.poiFilters) };
                    s.poiMapOverride = map; s.poiHook = onPick; s.showPOIs = true;
                    Object.assign(s.poiFilters, { fuel: true, food: true, drink: true });
                    if (s.poiPopup) { s.poiPopup.remove(); s.poiPopup = null; }
                    s.poiClusterMarkers.forEach(mk => mk.remove()); s.poiClusterMarkers.clear();
                    return this.poiEnsureLayers().then(ok => { if (!ok || s.poiMapOverride !== map) return false; this.poiSetVisible(true); this.poiApplyFilter(); this.fetchPOIs(); return true; });
                },
                poiRelease() {
                    const s = this.state, L = s.poiLoan; if (!L) return;
                    if (s.poiPopup) { s.poiPopup.remove(); s.poiPopup = null; }
                    s.poiClusterMarkers.forEach(mk => mk.remove()); s.poiClusterMarkers.clear();
                    s.poiMapOverride = null; s.poiHook = null; s.showPOIs = L.show; Object.assign(s.poiFilters, L.filters); s.poiLoan = null;
                    try { this.poiApplyFilter(); this.poiRefreshUI(); } catch (e) {}
                },
                poiKeyExpr() { return ['coalesce', ['get', 'subclass'], ['get', 'class']]; },
                poiCatOfValue(v) {
                    for (const c in this.POI_TYPES) if (this.POI_TYPES[c].includes(v)) return c;
                    return null;
                },
                poiDistKm(a, b) {
                    const R = 6371, toR = Math.PI / 180;
                    const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
                    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
                    return 2 * R * Math.asin(Math.sqrt(h));
                },
                poiInit() {
                    const s = this.state;
                    s.poiFilters = { fuel: false, food: false, drink: false, event: false };
                    try { Object.assign(s.poiFilters, JSON.parse(localStorage.getItem('moto_poi_filters') || '{}')); } catch (e) {}
                    document.querySelectorAll('.poi-chip').forEach(chip => chip.classList.toggle('on', !!s.poiFilters[chip.dataset.cat]));
                    s.poiReady = false; s.poiPopup = null; s.poiError = false;
                    s.poiWide = new Map();                 // id -> Feature GeoJSON
                    s.poiClusterMarkers = new Map();       // cluster_id -> Marker
                    s.fuelCenter = null; s.fuelLoading = false; s.fuelOk = null; s.fuelRetryAt = 0; s.fuelWhere = 'within_distance';
                    s.foodCenter = null; s.foodLoading = false; s.foodOk = null; s.foodRetryAt = 0;
                    document.querySelectorAll('.poi-chip').forEach(chip => {
                        chip.addEventListener('click', () => {
                            const c = chip.dataset.cat;
                            s.poiFilters[c] = !s.poiFilters[c];
                            chip.classList.toggle('on', s.poiFilters[c]);
                            try { localStorage.setItem('moto_poi_filters', JSON.stringify(s.poiFilters)); } catch (e) {}
                            if (c === 'event') { if (s.reports) s.reports.forEach(v => { if (v.data.kind === 'ride') v.marker.getElement().style.display = s.poiFilters.event ? '' : 'none'; }); this.poiMenuMark(); return; }
                            this.poiSyncActive();
                            this.poiApplyFilter();
                            setTimeout(() => this.poiRefreshUI(), 300);
                        });
                    });
                    this.poiMenuMark();
                    // Restaure l'affichage choisi à la dernière utilisation (sans déplacer la caméra)
                    let tries = 0; const wait = setInterval(() => { if (s.map) { clearInterval(wait); this.poiSyncActive({ quiet: true }); } else if (++tries > 60) clearInterval(wait); }, 600);
                },
                // Le bouton de la carte est un simple menu : il ouvre / referme la liste des catégories (le choix reste affiché)
                poiMenuToggle(force) {
                    const chips = document.getElementById('poi-filters'), btn = document.getElementById('btn-toggle-poi'); if (!chips) return;
                    const open = force !== undefined ? force : !chips.classList.contains('show');
                    chips.classList.toggle('show', open); if (btn) btn.classList.toggle('active', open);
                },
                poiMenuMark() { const f = this.state.poiFilters, btn = document.getElementById('btn-toggle-poi'); if (btn) btn.classList.toggle('has', !!(f.fuel || f.food || f.drink || f.event)); },
                // Charge / décharge les points (café, resto, essence) selon les catégories cochées
                poiSyncActive(opts) {
                    const s = this.state, f = s.poiFilters, any = f.fuel || f.food || f.drink;
                    if (any && !s.showPOIs) this.setPOIActive(true, opts); else if (!any && s.showPOIs) this.setPOIActive(false);
                    this.poiMenuMark();
                },
                poiSetBadge(html) { const b = document.getElementById('main-map-badge'); if (b) b.innerHTML = html; },
                // Icône ronde (fond sombre + contour coloré + pictogramme) dessinée dans un canvas
                poiMakeIcon(cat) {
                    const st = this.POI_STYLE[cat], pr = 2, size = 36;
                    const cv = document.createElement('canvas'); cv.width = size * pr; cv.height = size * pr;
                    const ctx = cv.getContext('2d'); ctx.scale(pr, pr);
                    ctx.beginPath(); ctx.arc(18, 18, 16, 0, Math.PI * 2);
                    ctx.fillStyle = '#1c1c1e'; ctx.fill();
                    ctx.lineWidth = 2; ctx.strokeStyle = st.color; ctx.stroke();
                    ctx.save(); ctx.translate(9, 9); ctx.scale(0.75, 0.75);
                    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.color;
                    st.paths.forEach(d => ctx.stroke(new Path2D(d)));
                    ctx.restore();
                    return { img: ctx.getImageData(0, 0, size * pr, size * pr), pr };
                },
                async poiWaitStyle() {
                    const m = this.poiMap();
                    for (let i = 0; i < 100 && !(m.isStyleLoaded && m.isStyleLoaded()); i++) await new Promise(r => setTimeout(r, 150));
                },
                async poiEnsureLayers() {
                    const s = this.state, m = this.poiMap();
                    if (!m) return false;
                    if (s.poiReady && m.getLayer(this.POI_LAYER)) return true;
                    await this.poiWaitStyle();
                    try {
                        ['fuel', 'food', 'drink'].forEach(c => {
                            if (!m.hasImage('poi-' + c)) { const ic = this.poiMakeIcon(c); m.addImage('poi-' + c, ic.img, { pixelRatio: ic.pr }); }
                        });

                        // 1) Tuiles OSM : détail complet quand on est très zoomé
                        if (!m.getSource(this.POI_SRC)) m.addSource(this.POI_SRC, { type: 'vector', url: this.POI_TILES });
                        if (!m.getLayer(this.POI_LAYER)) {
                            const key = this.poiKeyExpr();
                            m.addLayer({
                                id: this.POI_LAYER, type: 'symbol', source: this.POI_SRC, 'source-layer': 'poi', minzoom: this.POI_TILE_ZOOM,
                                layout: {
                                    'visibility': 'none',
                                    'icon-image': ['match', key, this.POI_TYPES.fuel, 'poi-fuel', this.POI_TYPES.food, 'poi-food', this.POI_TYPES.drink, 'poi-drink', ''],
                                    'icon-allow-overlap': ['step', ['zoom'], false, 16, true],
                                    'icon-padding': 1
                                }
                            });
                        }

                        // 2) Source "zone" (stations 50 km + restos/cafés 20 km), regroupée en bulles en vue large
                        if (!m.getSource(this.WIDE_SRC)) {
                            m.addSource(this.WIDE_SRC, {
                                type: 'geojson', data: { type: 'FeatureCollection', features: [] },
                                cluster: true, clusterMaxZoom: this.CLUSTER_MAX_ZOOM, clusterRadius: 45,
                                clusterProperties: {
                                    fuel:  ['+', ['case', ['==', ['get', 'cat'], 'fuel'], 1, 0]],
                                    food:  ['+', ['case', ['==', ['get', 'cat'], 'food'], 1, 0]],
                                    drink: ['+', ['case', ['==', ['get', 'cat'], 'drink'], 1, 0]]
                                }
                            });
                        }
                        const iconSize = ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.85, 14, 1];
                        if (!m.getLayer(this.WIDE_OTHER)) {
                            m.addLayer({
                                id: this.WIDE_OTHER, type: 'symbol', source: this.WIDE_SRC, maxzoom: this.POI_TILE_ZOOM,
                                filter: ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'cat'], 'fuel']],
                                layout: { 'visibility': 'none', 'icon-image': ['match', ['get', 'cat'], 'food', 'poi-food', 'poi-drink'], 'icon-size': iconSize, 'icon-allow-overlap': ['step', ['zoom'], false, 12, true], 'icon-padding': 0 }
                            });
                        }
                        if (!m.getLayer(this.WIDE_FUEL)) {
                            m.addLayer({
                                id: this.WIDE_FUEL, type: 'symbol', source: this.WIDE_SRC,
                                filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'cat'], 'fuel']],
                                layout: { 'visibility': 'none', 'icon-image': 'poi-fuel', 'icon-size': iconSize, 'icon-allow-overlap': ['step', ['zoom'], false, 11, true], 'icon-padding': 0 }
                            });
                        }

                        if (!m._poiEv) {
                            m._poiEv = true;
                            [this.POI_LAYER, this.WIDE_OTHER, this.WIDE_FUEL].forEach(layer => {
                                m.on('click', layer, (e) => { if (e.features && e.features[0]) this.showPOIPopup(e.features[0], layer); });
                                m.on('mouseenter', layer, () => { m.getCanvas().style.cursor = 'pointer'; });
                                m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; });
                            });
                            m.on('error', (e) => {
                                if (e && e.sourceId === this.POI_SRC) { s.poiError = true; console.error('[Radar POI] tuiles', e.error); }
                            });
                            m.on('idle', () => { if (s.showPOIs) this.poiRefreshUI(); });
                            m.on('sourcedata', (e) => {
                                if (e.sourceId !== this.WIDE_SRC || !e.isSourceLoaded || !s.showPOIs || s.poiRefreshQueued) return;
                                s.poiRefreshQueued = true;
                                requestAnimationFrame(() => { s.poiRefreshQueued = false; if (s.showPOIs) this.poiRefreshUI(); });
                            });
                            m.on('zoomend', () => { if (s.showPOIs) this.poiRefreshUI(); });
                        }
                        s.poiReady = true;
                        this.poiApplyFilter();
                        return true;
                    } catch (err) {
                        console.error('[Radar POI] init', err);
                        this.poiSetBadge('Radar indisponible ⚠️');
                        return false;
                    }
                },
                poiSetVisible(on) {
                    const m = this.poiMap(); if (!m) return;
                    [this.POI_LAYER, this.WIDE_OTHER, this.WIDE_FUEL].forEach(l => { if (m.getLayer(l)) m.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'); });
                },
                // Applique les filtres (pastilles) aux tuiles et à la source "zone"
                poiApplyFilter() {
                    const s = this.state, m = this.poiMap();
                    if (!m || !m.getLayer(this.POI_LAYER)) return;
                    const on = [];
                    Object.keys(this.POI_TYPES).forEach(c => {
                        if (!s.poiFilters[c]) return;
                        if (c === 'fuel' && s.fuelOk) return;   // les stations viennent déjà de l'API officielle (avec les prix)
                        on.push(...this.POI_TYPES[c]);
                    });
                    const never = ['==', ['get', '__aucun__'], '__jamais__'];   // filtre « rien » valide en expression
                    m.setFilter(this.POI_LAYER, on.length ? ['match', this.poiKeyExpr(), on, true, false] : never);
                    // Couches « zone » : filtrées tout de suite par catégorie active (sans attendre le rechargement de la source)
                    const cats = Object.keys(this.POI_TYPES).filter(c => s.poiFilters[c]);
                    const catOn = ['in', ['get', 'cat'], ['literal', cats]];
                    if (m.getLayer(this.WIDE_OTHER)) m.setFilter(this.WIDE_OTHER, ['all', ['!', ['has', 'point_count']], ['!=', ['get', 'cat'], 'fuel'], catOn]);
                    if (m.getLayer(this.WIDE_FUEL)) m.setFilter(this.WIDE_FUEL, ['all', ['!', ['has', 'point_count']], ['==', ['get', 'cat'], 'fuel'], catOn]);
                    // Bulles de regroupement : on les retire, elles sont recréées avec les bons compteurs dès que la source est rechargée
                    if (s.poiClusterMarkers) { s.poiClusterMarkers.forEach(mk => mk.remove()); s.poiClusterMarkers.clear(); }
                    this.poiSetWideData();
                },
                poiSetWideData() {
                    const s = this.state, m = this.poiMap();
                    const src = m && m.getSource(this.WIDE_SRC);
                    if (!src) return;
                    const feats = [];
                    s.poiWide.forEach(f => { if (s.poiFilters[f.properties.cat]) feats.push(f); });
                    src.setData({ type: 'FeatureCollection', features: feats });
                },
                // Appelé au déplacement de la carte : charge les zones manquantes et met à jour l'affichage
                fetchPOIs() {
                    const s = this.state, m = this.poiMap();
                    if (!m || !s.showPOIs || !s.poiReady) return;
                    if (m.getZoom() >= this.POI_MIN_ZOOM) {
                        const c = m.getCenter(); const center = [c.lng, c.lat];
                        const now = Date.now();
                        if (!s.fuelLoading && now > s.fuelRetryAt && (!s.fuelCenter || this.poiDistKm(center, s.fuelCenter) > 15)) this.loadFuelStations(center);
                        if (!s.foodLoading && now > s.foodRetryAt && (!s.foodCenter || this.poiDistKm(center, s.foodCenter) > 6)) this.loadFoodDrink(center);
                    }
                    this.poiRefreshUI();
                },
                renderPOIs() { this.poiRefreshUI(); },
                async poiFetchJSON(url, ms) {
                    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms || 12000);
                    try {
                        const r = await fetch(url, { signal: ctrl.signal });
                        if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
                        return await r.json();
                    } finally { clearTimeout(t); }
                },
                poiPruneFar(center) {
                    const s = this.state;
                    if (s.poiWide.size < 3000) return;
                    s.poiWide.forEach((f, id) => { if (this.poiDistKm(center, f.geometry.coordinates) > 90) s.poiWide.delete(id); });
                },
                // Stations-service dans un rayon de 50 km (données officielles, avec prix)
                async loadFuelStations(center) {
                    const s = this.state;
                    s.fuelLoading = true; this.poiRefreshUI();
                    const [lon, lat] = center;
                    let added = 0;
                    try {
                        let offset = 0, page = [];
                        for (let guard = 0; guard < 12; guard++) {
                            const fn = s.fuelWhere;   // 'within_distance' (récent) ou 'distance' (ancienne syntaxe)
                            const where = `${fn}(geom, geom'POINT(${lon.toFixed(5)} ${lat.toFixed(5)})', ${this.FUEL_RADIUS_KM}km)`;
                            const url = `${this.FUEL_API}?where=${encodeURIComponent(where)}&limit=100&offset=${offset}`;
                            let data;
                            try { data = await this.poiFetchJSON(url, 15000); }
                            catch (e) {
                                if (e.status === 400 && fn === 'within_distance' && offset === 0) { s.fuelWhere = 'distance'; continue; }
                                throw e;
                            }
                            page = data.results || [];
                            page.forEach(r => {
                                let glat = r.geom && r.geom.lat, glon = r.geom && r.geom.lon;
                                if (glat === undefined && r.latitude) { glat = Number(r.latitude) / 100000; glon = Number(r.longitude) / 100000; }
                                if (!isFinite(glat) || !isFinite(glon)) return;
                                const id = 'gov/' + r.id;
                                s.poiWide.set(id, { type: 'Feature', geometry: { type: 'Point', coordinates: [glon, glat] }, properties: {
                                    id, cat: 'fuel', sub: 'fuel', src: 'gov',
                                    adresse: r.adresse || '', ville: r.ville || '', cp: r.cp || '',
                                    h24: r.horaires_automate_24_24 || '',
                                    p_gazole: r.gazole_prix || 0, p_e10: r.e10_prix || 0, p_sp95: r.sp95_prix || 0, p_sp98: r.sp98_prix || 0, p_e85: r.e85_prix || 0, p_gpl: r.gplc_prix || 0
                                } });
                                added++;
                            });
                            offset += 100;
                            if (page.length < 100 || offset >= 1000) break;
                        }
                        s.fuelOk = true; s.fuelCenter = center;
                    } catch (err) {
                        console.warn('[Radar POI] stations (API carburants) :', err && err.message);
                        if (!added) { s.fuelOk = s.fuelOk || false; s.fuelRetryAt = Date.now() + 60000; }
                        else { s.fuelOk = true; s.fuelCenter = center; }
                    }
                    s.fuelLoading = false;
                    this.poiPruneFar(center);
                    this.poiApplyFilter();
                    this.poiRefreshUI();
                },
                // Restaurants / cafés / bars dans un rayon de 20 km (Photon)
                async loadFoodDrink(center) {
                    const s = this.state;
                    s.foodLoading = true; this.poiRefreshUI();
                    const [lon, lat] = center, R = this.FOOD_RADIUS_KM;
                    const dLat = R / 111, dLon = R / (111 * Math.cos(lat * Math.PI / 180));
                    const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map(v => v.toFixed(5)).join(',');
                    const food = ['amenity:restaurant', 'amenity:fast_food'];
                    const drink = ['amenity:cafe', 'amenity:bar', 'amenity:pub', 'amenity:biergarten'];
                    const queries = [
                        { q: 'restaurant', tags: food }, { q: 'pizzeria', tags: food }, { q: 'brasserie', tags: [...food, ...drink] },
                        { q: 'café', tags: drink }, { q: 'bar', tags: drink }, { q: 'pub', tags: drink }
                    ];
                    let ok = 0;
                    const results = await Promise.allSettled(queries.map(qq => {
                        const url = `${this.PHOTON_API}?q=${encodeURIComponent(qq.q)}&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&bbox=${bbox}&limit=50` + qq.tags.map(t => '&osm_tag=' + encodeURIComponent(t)).join('');
                        return this.poiFetchJSON(url, 12000);
                    }));
                    results.forEach(res => {
                        if (res.status !== 'fulfilled' || !res.value || !Array.isArray(res.value.features)) return;
                        ok++;
                        res.value.features.forEach(f => {
                            const p = f.properties || {};
                            if (p.osm_key !== 'amenity') return;
                            const cat = this.poiCatOfValue(p.osm_value);
                            if (!cat || cat === 'fuel' || !f.geometry) return;
                            const id = 'osm/' + (p.osm_type || '') + (p.osm_id || f.geometry.coordinates.join(','));
                            s.poiWide.set(id, { type: 'Feature', geometry: { type: 'Point', coordinates: f.geometry.coordinates }, properties: {
                                id, cat, sub: p.osm_value, src: 'photon', name: p.name || '',
                                adresse: [p.housenumber, p.street].filter(Boolean).join(' '), ville: p.city || p.town || p.village || p.locality || '', cp: p.postcode || ''
                            } });
                        });
                    });
                    if (ok) { s.foodOk = true; s.foodCenter = center; }
                    else { s.foodOk = s.foodOk || false; s.foodRetryAt = Date.now() + 60000; console.warn('[Radar POI] restos/cafés (Photon) : aucune réponse'); }
                    s.foodLoading = false;
                    this.poiPruneFar(center);
                    this.poiSetWideData();
                    this.poiRefreshUI();
                },
                // Bulles de regroupement (vue large) + compteur
                poiRefreshUI() {
                    const s = this.state, m = this.poiMap();
                    if (!m || !s.poiClusterMarkers) return;
                    if (!s.showPOIs) { s.poiClusterMarkers.forEach(mk => mk.remove()); s.poiClusterMarkers.clear(); return; }

                    const seen = new Set();
                    let feats = [];
                    try { feats = m.getSource(this.WIDE_SRC) ? m.querySourceFeatures(this.WIDE_SRC) : []; } catch (e) {}
                    feats.forEach(f => {
                        const p = f.properties; if (!p || !p.cluster) return;
                        const cid = p.cluster_id + '@' + f.geometry.coordinates.map(v => v.toFixed(4)).join(','); if (seen.has(cid)) return; seen.add(cid);
                        let mk = s.poiClusterMarkers.get(cid);
                        const sig = `${p.fuel}|${p.food}|${p.drink}`;
                        if (!mk) {
                            const el = document.createElement('div'); el.className = 'poi-cluster';
                            const coords = f.geometry.coordinates.slice();
                            el.addEventListener('click', (ev) => { ev.stopPropagation(); m.easeTo({ center: coords, zoom: Math.max(m.getZoom() + 2, this.CLUSTER_MAX_ZOOM + 1) }); });
                            mk = new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(m);
                            s.poiClusterMarkers.set(cid, mk);
                        }
                        if (mk._poiSig !== sig) {
                            mk._poiSig = sig;
                            const el = mk.getElement(); el.innerHTML = '';
                            ['fuel', 'food', 'drink'].forEach(c => {
                                const n = p[c] || 0; if (!n) return;
                                const seg = document.createElement('span');
                                const dot = document.createElement('i'); dot.style.background = this.POI_STYLE[c].color;
                                seg.appendChild(dot); seg.appendChild(document.createTextNode(n > 99 ? '99+' : String(n)));
                                el.appendChild(seg);
                            });
                        }
                    });
                    s.poiClusterMarkers.forEach((mk, cid) => { if (!seen.has(cid)) { mk.remove(); s.poiClusterMarkers.delete(cid); } });

                    // Compteur
                    const z = m.getZoom();
                    if (z < this.POI_MIN_ZOOM) { this.poiSetBadge('Zoomez plus 🔍'); return; }
                    const b = m.getBounds(); let n = 0;
                    s.poiWide.forEach(f => { if (!s.poiFilters[f.properties.cat]) return; const [x, y] = f.geometry.coordinates; if (b.contains([x, y])) n++; });
                    if (z >= this.POI_TILE_ZOOM) { try { n += m.queryRenderedFeatures({ layers: [this.POI_LAYER] }).length; } catch (e) {} }
                    const loading = s.fuelLoading || s.foodLoading;
                    const failed = s.fuelOk === false && s.foodOk === false;
                    if (loading) this.poiSetBadge(`Recherche... ⏳ ${n ? '(' + n + ')' : ''}`);
                    else if (failed && !n) this.poiSetBadge('Réseau indisponible 📡');
                    else this.poiSetBadge(`Radar 📍 ${n} lieu${n > 1 ? 'x' : ''}`);
                },
                poiFmtPrice(v) { return (v && Number(v) > 0) ? Number(v).toFixed(3).replace('.', ',') + ' €' : ''; },
                showPOIPopup(f, layer) {
                    const s = this.state, p = f.properties || {};
                    const [lon, lat] = f.geometry.coordinates;
                    if (s.poiPopup) s.poiPopup.remove();
                    const fromTiles = layer === this.POI_LAYER;
                    const sub = fromTiles ? (p.subclass || p.class) : p.sub;
                    const cat = fromTiles ? (this.poiCatOfValue(sub) || 'food') : p.cat;
                    const st = this.POI_STYLE[cat];
                    const box = document.createElement('div');
                    const add = (cls, text) => { if (!text) return null; const d = document.createElement('div'); d.className = cls; d.textContent = text; box.appendChild(d); return d; };

                    let name = fromTiles ? (p['name:fr'] || p.name || p['name_int']) : p.name;
                    if (!name && cat === 'fuel') {
                        // Les données officielles n'ont pas le nom : on cherche la marque dans les tuiles si elles sont chargées
                        try {
                            const near = this.poiMap().querySourceFeatures(this.POI_SRC, { sourceLayer: 'poi', filter: ['match', this.poiKeyExpr(), ['fuel'], true, false] })
                                .find(t => t.properties.name && this.poiDistKm([lon, lat], t.geometry.coordinates) < 0.12);
                            if (near) name = near.properties.name;
                        } catch (e) {}
                    }
                    const typeLabel = this.POI_SUBTYPE[sub] || st.label;
                    add('pp-name', name || (cat === 'fuel' && p.ville ? 'Station · ' + p.ville : typeLabel));
                    const tp = add('pp-type', typeLabel); if (tp) tp.style.color = st.color;

                    if (cat === 'fuel' && p.src === 'gov') {
                        const prices = [['Gazole', p.p_gazole], ['SP95-E10', p.p_e10], ['SP95', p.p_sp95], ['SP98', p.p_sp98], ['E85', p.p_e85], ['GPL', p.p_gpl]]
                            .filter(x => Number(x[1]) > 0).map(x => `${x[0]} ${this.poiFmtPrice(x[1])}`);
                        prices.forEach(t => add('pp-line', '⛽ ' + t));
                        if (!prices.length) add('pp-line', 'Prix non communiqués');
                        if (String(p.h24).toLowerCase() === 'oui') add('pp-line', '🕒 Automate 24h/24');
                    }
                    add('pp-line', [p.adresse, [p.cp, p.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '));
                    const here = s.lastKnownCoords;
                    if (here) add('pp-line', `📍 à ${this.poiDistKm(here, [lon, lat]).toFixed(1).replace('.', ',')} km à vol d'oiseau`);

                    const destName = name || typeLabel;
                    if (s.poiHook) {   // mode Expert : un seul bouton, le lieu devient un arrêt du tracé
                        const hb = document.createElement('button'); hb.className = 'pp-add'; hb.type = 'button'; hb.textContent = 'Ajouter comme arrêt (15 min)';
                        hb.addEventListener('click', (ev) => { ev.stopPropagation(); if (s.poiPopup) { s.poiPopup.remove(); s.poiPopup = null; } s.poiHook({ name: destName, ll: [lon, lat], cat }); });
                        box.appendChild(hb);
                        s.poiPopup = new maplibregl.Popup({ className: 'poi-pop', offset: 18, closeButton: true, maxWidth: '240px' }).setLngLat([lon, lat]).setDOMContent(box).addTo(this.poiMap());
                        return;
                    }
                    const a = document.createElement('button');
                    a.className = 'pp-go'; a.type = 'button'; a.textContent = 'Y aller';
                    a.addEventListener('click', (ev) => { ev.stopPropagation(); this.navigateToPOI(destName, lat, lon); });
                    box.appendChild(a);
                    // « + Itinéraire » : ajoute ce lieu au trajet en cours de création (étape, ou destination si elle est vide)
                    const inRoute = this.poiInRoute([lon, lat]);
                    const add2 = document.createElement('button');
                    add2.className = 'pp-add'; add2.type = 'button';
                    add2.textContent = inRoute ? '✓ Dans l\'itinéraire' : '+ Ajouter à l\'itinéraire';
                    if (inRoute) add2.disabled = true;
                    add2.addEventListener('click', (ev) => { ev.stopPropagation(); this.addPOIToRoute(destName, lat, lon); });
                    box.appendChild(add2);
                    s.poiPopup = new maplibregl.Popup({ className: 'poi-pop', offset: 18, closeButton: true, maxWidth: '240px' })
                        .setLngLat([lon, lat]).setDOMContent(box).addTo(this.poiMap());
                },
                // Ce lieu fait-il déjà partie de l'itinéraire en préparation ?
                poiInRoute(c) {
                    return Object.values(this.state.coords).some(v => v && Math.abs(v[0] - c[0]) < 0.00005 && Math.abs(v[1] - c[1]) < 0.00005);
                },
                // « Ajouter à l'itinéraire » : le lieu devient une étape (ou la destination si elle est encore vide) et l'itinéraire est recalculé
                async addPOIToRoute(name, lat, lon) {
                    const s = this.state;
                    if (s.poiPopup) { s.poiPopup.remove(); s.poiPopup = null; }
                    const c = [lon, lat];
                    const flash = (msg) => { this.poiSetBadge(msg); setTimeout(() => { if (s.showPOIs) this.fetchPOIs(); else this.poiSetBadge('Prêt 🛰️'); }, 3500); };
                    if (this.poiInRoute(c)) { flash('Déjà dans l\'itinéraire ✓'); return; }
                    const startInput = document.getElementById('input-wp-start');
                    const destInput = document.getElementById('input-wp-dest');
                    if (!startInput || !destInput) return;

                    // Départ : « Ma position » par défaut si rien n'est saisi ; en navigation, on repart de la position actuelle
                    const startIsGps = startInput.value.includes('Ma position');
                    if (!s.coords['input-wp-start'] || (s.isTracking && startIsGps)) {
                        if (!s.lastKnownCoords && navigator.geolocation) {
                            this.poiSetBadge('Attente GPS... 🛰️');
                            try {
                                const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000 }));
                                s.lastKnownCoords = [pos.coords.longitude, pos.coords.latitude];
                            } catch (e) {}
                        }
                        if (s.lastKnownCoords && (!s.coords['input-wp-start'] || startIsGps)) {
                            startInput.value = '📍 Ma position actuelle';
                            s.coords['input-wp-start'] = s.lastKnownCoords;
                        }
                    }

                    const nextStepInput = () => {
                        // on réutilise une étape vide si elle existe, sinon on en crée une (toujours juste avant la destination)
                        let st = [...document.querySelectorAll('#waypoints-container .floating-input[id^="input-wp-step-"]')].find(i => !s.coords[i.id]);
                        if (!st) { this.addWaypointField(); const all = document.querySelectorAll('#waypoints-container .floating-input[id^="input-wp-step-"]'); st = all[all.length - 1]; }
                        return st;
                    };
                    const dc = s.coords['input-wp-dest'];
                    if (!dc) {
                        // Pas encore de destination : le lieu en devient une
                        destInput.value = name; s.coords['input-wp-dest'] = c; s.poiAutoDest = c;
                    } else if (s.poiAutoDest && Math.abs(dc[0] - s.poiAutoDest[0]) < 1e-9 && Math.abs(dc[1] - s.poiAutoDest[1]) < 1e-9) {
                        // La destination est un lieu ajouté juste avant : il devient une étape, le nouveau lieu prend la fin du trajet (ordre d'ajout respecté)
                        const st = nextStepInput(); st.value = destInput.value; s.coords[st.id] = dc;
                        destInput.value = name; s.coords['input-wp-dest'] = c; s.poiAutoDest = c;
                    } else {
                        // Destination choisie par l'utilisateur : le lieu est ajouté en étape, avant l'arrivée
                        const st = nextStepInput(); st.value = name; s.coords[st.id] = c;
                    }
                    const nbPoints = Object.keys(s.coords).filter(k => s.coords[k]).length;
                    this.checkAndCalculate();
                    flash(nbPoints >= 2 ? `✅ ${name} ajouté · calcul... 🧭` : `✅ ${name} ajouté · choisis ton départ`);
                },
                // "Y aller" : itinéraire calculé et guidé par le GPS de l'app (position actuelle -> lieu)
                async navigateToPOI(name, lat, lon) {
                    const s = this.state;
                    if (s.poiPopup) { s.poiPopup.remove(); s.poiPopup = null; }

                    // Position actuelle (si le GPS n'a pas encore répondu, on la demande une fois)
                    if (!s.lastKnownCoords && navigator.geolocation) {
                        this.poiSetBadge('Attente GPS... 🛰️');
                        try {
                            const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }));
                            s.lastKnownCoords = [pos.coords.longitude, pos.coords.latitude];
                        } catch (e) {}
                    }
                    if (!s.lastKnownCoords) { AppDialog.alert("Position GPS introuvable. Vérifiez que la localisation est autorisée."); this.fetchPOIs(); return; }

                    // On repart d'un trajet simple : Ma position -> lieu (les étapes intermédiaires sont retirées)
                    document.querySelectorAll('[id^="wrap-wp-step-"]').forEach(w => w.remove());
                    Object.keys(s.coords).forEach(k => { if (k !== 'input-wp-start' && k !== 'input-wp-dest') delete s.coords[k]; });
                    const startInput = document.getElementById('input-wp-start');
                    const destInput = document.getElementById('input-wp-dest');
                    if (startInput) startInput.value = '📍 Ma position actuelle';
                    if (destInput) destInput.value = name;
                    s.coords['input-wp-start'] = s.lastKnownCoords;
                    s.coords['input-wp-dest'] = [lon, lat];

                    this.poiSetBadge('Calcul itinéraire... 🧭');
                    if (s.isTracking) {
                        // Déjà en navigation : on remplace simplement la destination
                        this.checkAndCalculate();
                    } else {
                        // Lance la navigation de l'app (comme le bouton Démarrer), qui calcule l'itinéraire
                        this.toggleTracking();
                    }
                    setTimeout(() => { if (s.showPOIs) this.fetchPOIs(); else this.poiSetBadge('Prêt 🛰️'); }, 4000);
                },
                clearPOIs() {
                    const s = this.state;
                    if (s.poiPopup) { s.poiPopup.remove(); s.poiPopup = null; }
                    this.poiSetVisible(false);
                    if (s.poiClusterMarkers) { s.poiClusterMarkers.forEach(mk => mk.remove()); s.poiClusterMarkers.clear(); }
                },
                // Active / désactive le radar (appelé par le bouton)
                async setPOIActive(on, opts) {
                    const s = this.state;
                    s.showPOIs = on;
                    if (!on) { this.clearPOIs(); this.poiSetBadge('Prêt 🛰️'); return; }
                    if (!s.map) { this.poiSetBadge('Carte non chargée ⚠️'); return; }
                    this.poiSetBadge('Recherche... ⏳');
                    const ok = await this.poiEnsureLayers();
                    if (!ok || !s.showPOIs) return;
                    this.poiSetVisible(true);
                    if (s.map.getZoom() < 9 && opts && opts.quiet) { this.poiSetBadge('Zoome pour voir les points'); setTimeout(() => this.poiSetBadge('Prêt 🛰️'), 3000); }
                    else if (s.map.getZoom() < 9) {
                        // Vue d'ensemble ~20 km autour de soi ; le 'moveend' lancera le chargement
                        s.map.flyTo({ center: s.lastKnownCoords || s.map.getCenter(), zoom: 10, duration: 1200 });
                    } else this.fetchPOIs();
                },
});


// ====================================================================
//  SIGNALEMENTS COMMUNAUTAIRES : dangers sur la route + balades (rendez-vous)
//  Serveur : Supabase (table map_reports, règles de sécurité côté base : lecture des signalements actifs,
//  ajout limité et validé par le serveur, jamais de modification / suppression par les clients).
//  La clé ci-dessous est la clé PUBLIQUE (anon) : elle est faite pour être dans l'appli, la sécurité est dans la base.
// ====================================================================
Object.assign(ModuleGPS, {
    SB_URL: 'https://jpawfdgfggtlqxpbrpnd.supabase.co',
    SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwYXdmZGdmZ2d0bHF4cGJycG5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMDc3NDUsImV4cCI6MjEwODY4Mzc0NX0.z8jJFPBew5OJWnt04yO-RcwP-nwfPA5tcPIzylEykNI',
    RP_MIN_ZOOM: 9,
    // Longueur par défaut de la zone dangereuse tracée sur la route (m) — identique côté serveur
    RP_LEN: { accident: 400, ice: 400, roadwork: 400, pothole: 400, gravel: 400, oil: 400, animal: 400, other: 400 },   // zone tracée : 200 m avant + 200 m après le danger
    RP_TYPES: {
        accident:  { label: 'Accident',        say: 'Accident',               color: '#ff453a', icon: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
        gravel:    { label: 'Gravillons',      say: 'Attention, gravillons',   color: '#ff9f0a', icon: '<circle cx="7" cy="8" r="1.4"/><circle cx="14" cy="6" r="1.4"/><circle cx="17" cy="12" r="1.4"/><circle cx="9" cy="14" r="1.4"/><circle cx="14" cy="18" r="1.4"/><circle cx="5" cy="19" r="1.4"/>' },
        oil:       { label: 'Huile / carburant', say: 'Attention, huile sur la route', color: '#bf5af2', icon: '<path d="M12 2.7s6 6.3 6 10.8a6 6 0 0 1-12 0C6 9 12 2.7 12 2.7z"/>' },
        pothole:   { label: 'Nid-de-poule',    say: 'Attention, nid-de-poule', color: '#8e8e93', icon: '<ellipse cx="12" cy="13" rx="8" ry="4.5"/><path d="M4 13V9.5M20 13V9.5"/>' },
        animal:    { label: 'Animal',          say: 'Attention, animal',       color: '#a2845e', icon: '<circle cx="6" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="19" cy="10" r="1.8"/><path d="M12.5 12c-3 0-5.5 3-5.5 5.2 0 1.6 1.4 2.3 3 2 .9-.2 1.6-.5 2.5-.5s1.6.3 2.5.5c1.6.3 3-.4 3-2 0-2.2-2.5-5.2-5.5-5.2z"/>' },
        ice:       { label: 'Verglas / glissant', say: 'Attention, route glissante', color: '#32ade6', icon: '<line x1="12" y1="2" x2="12" y2="22"/><line x1="3.3" y1="7" x2="20.7" y2="17"/><line x1="3.3" y1="17" x2="20.7" y2="7"/>' },
        roadwork:  { label: 'Travaux',         say: 'Travaux',                 color: '#ff9f0a', icon: '<path d="M4 21h16M6 21l2.5-14h7L18 21M8 12h8M7.2 16.5h9.6"/>' },
        other:     { label: 'Autre danger',    say: 'Danger',                  color: '#98989d', icon: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/>' },
        meetup:    { label: 'Balade',          say: 'Balade',                  color: '#0a84ff', icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>' }
    },
    RP_LEVELS: {
        balade:    { label: 'Balade',    sub: 'Tranquille, on profite', color: '#30d158', icon: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.7-7"/>' },
        dynamique: { label: 'Dynamique', sub: 'Bon rythme', color: '#ff9f0a', icon: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>' },
        fifou:     { label: 'Fifou',     sub: 'Sportif, ça cravache', color: '#ff453a', icon: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.4 1-3 0 1.4 1 2.5 2.5 2.5z"/>' }
    },
    rpLevelIcon(k) { const l = this.RP_LEVELS[k]; return l ? `<svg viewBox="0 0 24 24">${l.icon}</svg>` : ''; },
    // Sélecteur de niveau (3 tuiles à icône) réutilisé par la création d'événement ; la valeur se lit avec rpLevelValue(racine)
    rpLevelPicker() {
        return `<div><label>Niveau</label><div class="rp-lv">${Object.keys(this.RP_LEVELS).map((k, i) => { const l = this.RP_LEVELS[k]; return `<button type="button" class="rp-lvb${i === 0 ? ' on' : ''}" data-lv="${k}" style="--c:${l.color}"><i>${this.rpLevelIcon(k)}</i><b>${l.label}</b><span>${l.sub}</span></button>`; }).join('')}</div></div>`;
    },
    rpLevelBind(root) { root.querySelectorAll('.rp-lvb').forEach(b => b.addEventListener('click', () => root.querySelectorAll('.rp-lvb').forEach(x => x.classList.toggle('on', x === b)))); },
    rpLevelValue(root) { const b = root.querySelector('.rp-lvb.on'); return b ? b.dataset.lv : 'balade'; },
    rpIcon(k) { const t = this.RP_TYPES[k] || this.RP_TYPES.other; return `<svg viewBox="0 0 24 24">${t.icon}</svg>`; },
    rpDevice() {
        try { let d = localStorage.getItem('motoapp_device_id'); if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)); localStorage.setItem('motoapp_device_id', d); } return d; }
        catch (e) { return this._rpDev || (this._rpDev = String(Date.now()) + Math.random().toString(36).slice(2)); }
    },
    async rpApi(path, opts) {
        const r = await fetchT(`${this.SB_URL}/rest/v1/${path}`, Object.assign({ headers: { apikey: this.SB_KEY, Authorization: 'Bearer ' + this.SB_KEY, 'Content-Type': 'application/json' } }, opts || {}), 12000);
        if (!r.ok) { let msg = ''; try { msg = (await r.json()).message || ''; } catch (e) {} throw new Error(msg || ('HTTP ' + r.status)); }
        return r.status === 204 ? null : r.text().then(x => x ? JSON.parse(x) : null);
    },
    rpAge(iso) { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'à l\'instant' : (m < 60 ? `il y a ${m} min` : (m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`)); },
    rpMine() { return AppStore.arr('moto_my_reports'); },
    rpVoted() { return AppStore.arr('moto_report_votes'); },

    reportsInit() {
        const s = this.state; s.reports = new Map(); s.reportsDanger = [];
        const b = document.getElementById('btn-report'); if (b) b.addEventListener('click', () => this.rpOpenSheet());
        // On attend que la carte existe, puis on charge à chaque déplacement (anti-rebond) et chaque minute
        let tries = 0;
        const wait = setInterval(() => {
            if (s.map) {
                clearInterval(wait);
                let deb; s.map.on('moveend', () => { clearTimeout(deb); deb = setTimeout(() => this.reportsFetch(), 700); });
                this.reportsFetch();
            } else if (++tries > 120) clearInterval(wait);
        }, 500);
        setInterval(() => { if (!document.hidden) this.reportsFetch(true); }, 60000);
    },

    async reportsFetch(force) {
        const s = this.state, m = s.map; if (!m || s._rpBusy) return;
        try {
            if (m.getZoom() < this.RP_MIN_ZOOM) { this.rpRender([]); return; }
            const b = m.getBounds(), padLat = (b.getNorth() - b.getSouth()) * 0.15, padLng = (b.getEast() - b.getWest()) * 0.15;
            const q = `map_reports?select=id,kind,subtype,title,description,lat,lng,starts_at,expires_at,confirms,denies,created_at,place_name,organizer_name,level,length_m`
                + `&lat=gte.${(b.getSouth() - padLat).toFixed(5)}&lat=lte.${(b.getNorth() + padLat).toFixed(5)}&lng=gte.${(b.getWest() - padLng).toFixed(5)}&lng=lte.${(b.getEast() + padLng).toFixed(5)}&order=created_at.desc&limit=300`;
            const key = q + Math.floor(Date.now() / 20000);
            if (!force && s._rpKey === key) return; s._rpKey = key; s._rpBusy = true;
            this.rpRender(await this.rpApi(q) || []);
        } catch (e) { /* hors ligne : on garde l'affichage actuel */ }
        finally { s._rpBusy = false; }
    },

    rpRender(list) {
        // les balades restent 7 jours côté serveur (onglet Événements) : sur la carte on ne garde que celles pas encore parties
        list = (list || []).filter(r => r.kind !== 'ride' || !r.starts_at || new Date(r.starts_at).getTime() + 30 * 60000 > Date.now());
        const s = this.state, seen = new Set(list.map(r => r.id));
        s.reports.forEach((v, id) => { if (!seen.has(id)) { v.marker.remove(); s.reports.delete(id); } });
        list.forEach(r => {
            const ex = s.reports.get(r.id);
            if (ex) { ex.data = r; return; }
            const t = this.RP_TYPES[r.subtype] || this.RP_TYPES.other;
            const el = document.createElement('div'); el.className = 'rp-mk' + (r.kind === 'ride' ? ' ride' : ' danger'); const lv = r.kind === 'ride' && this.RP_LEVELS[r.level]; el.style.setProperty('--c', lv ? lv.color : t.color); el.innerHTML = lv ? this.rpLevelIcon(r.level) : this.rpIcon(r.subtype); if (r.kind === 'ride' && !this.state.poiFilters.event) el.style.display = 'none';
            el.addEventListener('click', (ev) => { ev.stopPropagation(); this.rpPopup(r.id); });
            const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lng, r.lat]).addTo(s.map);
            s.reports.set(r.id, { data: r, marker });
        });
        // Dangers à annoncer à la voix / pastille pendant la navigation (voir updateRoadInfo)
        this.rpTraceRefresh(list);
        s.reportsDanger = list.filter(r => r.kind === 'danger').map(r => { const t = this.RP_TYPES[r.subtype] || this.RP_TYPES.other; return { id: r.id, pos: [r.lng, r.lat], label: t.label, say: t.say }; });
    },

    rpPopup(id) {
        const s = this.state, v = s.reports.get(id); if (!v) return; const r = v.data, t = this.RP_TYPES[r.subtype] || this.RP_TYPES.other;
        if (s.poiPopup) { s.poiPopup.remove(); s.poiPopup = null; }
        const box = document.createElement('div');
        const add = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; box.appendChild(d); return d; };
        const lv = r.kind === 'ride' && this.RP_LEVELS[r.level];
        const head = document.createElement('div'); head.className = 'rp-ph'; head.style.setProperty('--c', lv ? lv.color : t.color);
        const ic = document.createElement('i'); ic.className = 'rp-ic'; ic.innerHTML = lv ? this.rpLevelIcon(r.level) : this.rpIcon(r.subtype); head.appendChild(ic);
        const hw = document.createElement('div'); hw.className = 'rp-pt'; head.appendChild(hw); box.appendChild(head);
        const hadd = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; hw.appendChild(d); };
        hadd('pp-name', r.kind === 'ride' ? (r.title || 'Balade') : t.label);
        hadd('pp-type', r.kind === 'ride' ? (lv ? 'Niveau ' + lv.label : 'Balade · rendez-vous') : 'Danger signalé');
        if (r.kind === 'ride') {
            add('pp-line', new Date(r.starts_at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
            if (r.place_name) add('pp-line', r.place_name);
            if (r.description) add('pp-line', r.description);
            add('rp-age', `${r.organizer_name ? 'Par ' + r.organizer_name + ' · ' : ''}${r.confirms} participant${r.confirms > 1 ? 's' : ''}`);
        } else {
            if (r.description) add('pp-line', r.description);
            add('rp-age', `${this.rpAge(r.created_at)} · ${r.confirms} confirmation${r.confirms > 1 ? 's' : ''}`);
            const L = r.length_m || this.RP_LEN[r.subtype] || 300; add('pp-line', `Zone concernée : ${L >= 1000 ? (L / 1000).toFixed(1).replace('.0', '') + ' km' : L + ' m'}`);
        }
        const voted = this.rpVoted().includes(r.id), row = document.createElement('div'); row.className = 'rp-vote';
        const vb = (txt, vote) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = voted ? '✓ Merci' : txt; b.disabled = voted; b.addEventListener('click', (ev) => { ev.stopPropagation(); this.rpVote(r.id, vote); }); return b; };
        row.appendChild(vb(r.kind === 'ride' ? 'Je participe' : 'Toujours là', 'confirm'));
        if (r.kind === 'danger' && !voted) row.appendChild(vb('Disparu', 'deny'));
        box.appendChild(row);
        if (r.kind === 'ride') {
            const go = document.createElement('button'); go.className = 'pp-go'; go.type = 'button'; go.textContent = 'Y aller';
            go.addEventListener('click', (ev) => { ev.stopPropagation(); this.navigateToPOI(r.title || 'Balade', r.lat, r.lng); }); box.appendChild(go);
            const ad = document.createElement('button'); ad.className = 'pp-add'; ad.type = 'button'; ad.textContent = '+ Ajouter à l\'itinéraire';
            ad.addEventListener('click', (ev) => { ev.stopPropagation(); this.addPOIToRoute(r.title || 'Balade', r.lat, r.lng); }); box.appendChild(ad);
        }
        s.poiPopup = new maplibregl.Popup({ className: 'poi-pop', offset: 22, closeButton: true, maxWidth: '240px' }).setLngLat([r.lng, r.lat]).setDOMContent(box).addTo(s.map);
    },

    async rpVote(id, vote) {
        try {
            await this.rpApi('rpc/vote_report', { method: 'POST', body: JSON.stringify({ p_id: id, p_device: this.rpDevice(), p_vote: vote }) });
            const l = this.rpVoted(); l.push(id); try { localStorage.setItem('moto_report_votes', JSON.stringify(l.slice(-300))); } catch (e) {}
            if (this.state.poiPopup) { this.state.poiPopup.remove(); this.state.poiPopup = null; }
            this.poiSetBadge('Merci ✓'); setTimeout(() => this.poiSetBadge('Prêt 🛰️'), 2500);
            this.reportsFetch(true);
        } catch (e) { this.poiSetBadge('Pas de connexion ⚠️'); setTimeout(() => this.poiSetBadge('Prêt 🛰️'), 2500); }
    },

    // Position du signalement : GPS si connu, sinon centre de la carte
    rpPos(prefer) {
        const s = this.state, c = s.map ? s.map.getCenter() : null;
        if (prefer === 'center' && c) return { pos: [c.lng, c.lat], src: 'centre de la carte' };
        if (s.lastKnownCoords) return { pos: s.lastKnownCoords, src: 'ta position GPS' };
        return c ? { pos: [c.lng, c.lat], src: 'centre de la carte' } : null;
    },

    async rpSend(payload, msgEl) {
        const setMsg = (t, c) => { if (msgEl) { msgEl.textContent = t; msgEl.className = 'rp-msg' + (c ? ' ' + c : ''); } };
        try {
            const made = await this.rpApi('map_reports?select=id', { method: 'POST', headers: { apikey: this.SB_KEY, Authorization: 'Bearer ' + this.SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(Object.assign({ device_id: this.rpDevice() }, payload)) });
            try { const id = made && made[0] && made[0].id; if (id) { const l = this.rpMine(); l.push(id); localStorage.setItem('moto_my_reports', JSON.stringify(l.slice(-200))); } } catch (e) {}
            // Le serveur renvoie une liste vide quand le danger était déjà signalé à moins de 300 m : ton signalement vaut confirmation
            const merged = payload.kind === 'danger' && !(made && made.length);
            setMsg(merged ? 'Déjà signalé ici : ta confirmation est comptée ✓' : 'Signalement publié ✓', 'ok'); this.reportsFetch(true); return true;
        } catch (e) {
            const m = String(e.message || '');
            setMsg(/rate_limit/.test(m) ? 'Trop de signalements pour le moment, réessaie plus tard.' : (/invalid_date/.test(m) ? 'Date invalide (dans les 60 prochains jours).' : (/terme_interdit/.test(m) ? 'Un mot de ta balade n\'est pas autorisé : modifie le titre ou les détails.' : /title_required/.test(m) ? 'Donne un titre à la balade (3 lettres minimum).' : 'Impossible d\'envoyer (connexion ?).')), 'err');
            return false;
        }
    },

    RP_AIDE: [
        { k: 'flat', t: 'Crevaison', c: '#ff453a', i: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5"/>' },
        { k: 'fuel', t: 'Panne d\'essence', c: '#ff9f0a', i: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12"/><path d="M8 8h4M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>' },
        { k: 'mech', t: 'Panne mécanique', c: '#32ade6', i: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>' },
        { k: 'batt', t: 'Batterie', c: '#30d158', i: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M10.5 10l-2 4h3l-1.5 3"/>' }
    ],
    rpOpenSheet(tab) {
        if (tab !== 'aide' && !AppWarn.done('danger')) { AppWarn.ask('danger').then(ok => { if (ok) this.rpOpenSheet(tab); }); return; }
        const old = document.getElementById('rp-overlay'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'rp-overlay'; ov.className = 'rp-overlay';
        const types = ['accident', 'gravel', 'oil', 'pothole', 'animal', 'ice', 'roadwork', 'other'];
        const now = new Date(Date.now() + 3600000), pad = n => String(n).padStart(2, '0');
        const dflt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, dt = `${pad(now.getHours())}:00`;
        ov.innerHTML = `<div class="rp-sheet">
            <div class="rp-top"><button type="button" class="rp-tab on" data-t="danger">Danger</button><button type="button" class="rp-tab" data-t="ride">Balade</button><button type="button" class="rp-tab" data-t="aide">Aide</button><button type="button" class="rp-x" aria-label="Fermer">✕</button></div>
            <div id="rp-danger"><div class="rp-where" id="rp-where"></div><div class="rp-grid">${types.map(k => `<button type="button" class="rp-tile" data-k="${k}"><i style="--c:${this.RP_TYPES[k].color}">${this.rpIcon(k)}</i>${this.RP_TYPES[k].label}</button>`).join('')}</div><div class="rp-alt">Pas à ta position ? <button type="button" id="rp-alt">Placer sur la carte</button></div></div>
            <div id="rp-aide" style="display:none;"><div class="rp-where">Besoin d'aide ? Un appui = motards à moins de 5 km prévenus</div><div class="rp-grid">${this.RP_AIDE.map(a => `<button type="button" class="rp-tile rp-atile" data-ak="${a.k}"><i style="--c:${a.c}"><svg viewBox="0 0 24 24">${a.i}</svg></i>${a.t}</button>`).join('')}</div><div class="rp-urg">Urgence vitale ? Utilise le SOS ou le 112</div></div>
            <div id="rp-ride" class="rp-form" style="display:none;">
                <div><label>Titre</label><input id="rp-title" maxlength="60" placeholder="Ex : Balade des crêtes"></div>
                <div><label>Détails (facultatif)</label><textarea id="rp-desc" maxlength="200" placeholder="Point de rendez-vous, niveau, rythme…"></textarea></div>
                ${this.rpLevelPicker()}
                <div class="rp-row"><div><label>Date</label><input id="rp-date" type="date" value="${dflt}"></div><div><label>Heure</label><input id="rp-time" type="time" value="${dt}"></div></div>
                <div><label>Lieu du rendez-vous</label><select id="rp-loc"><option value="gps">Ma position GPS</option><option value="center">Centre de la carte</option></select></div>
                <button type="button" class="rp-pub" id="rp-pub">Publier la balade</button>
            </div>
            <div class="rp-msg" id="rp-msg"></div></div>`;
        document.body.appendChild(ov);
        const msg = ov.querySelector('#rp-msg'), where = ov.querySelector('#rp-where');
        let mode = 'gps', len = 0;
        ov.querySelectorAll('#rp-len button').forEach(b => b.addEventListener('click', () => { len = +b.dataset.l; ov.querySelectorAll('#rp-len button').forEach(x => x.classList.toggle('on', x === b)); }));
        const alt = ov.querySelector('#rp-alt');
        const upd = () => { const p = this.rpPos(); where.textContent = mode === 'map' ? 'Choisis le danger, puis place-le sur la carte' : (p ? 'Quel danger ? Un appui = signalé à ta position' : 'Position indisponible : place le danger sur la carte'); alt.textContent = mode === 'map' ? 'Utiliser ma position' : 'Placer sur la carte'; }; upd();
        alt.addEventListener('click', () => { mode = mode === 'map' ? 'gps' : 'map'; upd(); });
        ov.querySelectorAll('.rp-mb').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; ov.querySelectorAll('.rp-mb').forEach(x => x.classList.toggle('on', x === b)); upd(); }));
        const close = () => ov.remove();
        this.rpLevelBind(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        ov.querySelector('.rp-x').addEventListener('click', close);
        const show = (t) => {
            if (t === 'aide' && typeof ModuleAide !== 'undefined' && ModuleAide.req) { close(); ModuleAide.open(); return; }   // demande en cours : on rouvre son suivi, pas les 4 boutons
            ov.querySelectorAll('.rp-tab').forEach(b => b.classList.toggle('on', b.dataset.t === t)); ov.querySelector('#rp-danger').style.display = t === 'danger' ? '' : 'none'; ov.querySelector('#rp-aide').style.display = t === 'aide' ? '' : 'none'; ov.querySelector('#rp-ride').style.display = t === 'ride' ? 'flex' : 'none'; msg.textContent = ''; };
        ov.querySelectorAll('.rp-tab').forEach(b => b.addEventListener('click', () => show(b.dataset.t)));
        ov.querySelectorAll('.rp-atile').forEach(b => b.addEventListener('click', () => { close(); try { ModuleAide.startReq(b.dataset.ak); } catch (e) { console.warn('[Aide]', e); } }));
        ov.querySelectorAll('#rp-danger .rp-tile').forEach(b => b.addEventListener('click', async () => {
            if (mode === 'map') {
                // Le danger est là où on le place (on peut l'avoir dépassé) : sélection sur la carte puis envoi
                const kind = b.dataset.k, start = this.state.lastKnownCoords || (this.state.map && [this.state.map.getCenter().lng, this.state.map.getCenter().lat]);
                close();
                this.startMapPick(null, { title: 'Placer le danger', center: start, cb: async (c) => {
                    this.poiSetBadge('Envoi…');
                    const ok = await this.rpSend({ kind: 'danger', subtype: kind, lat: c[1], lng: c[0], length_m: len || undefined }, null);
                    this.poiSetBadge(ok ? 'Danger signalé ✓' : 'Envoi impossible'); setTimeout(() => this.poiSetBadge('Prêt 🛰️'), 2500);
                } });
                return;
            }
            const p = this.rpPos(); if (!p) { msg.textContent = 'Position indisponible.'; msg.className = 'rp-msg err'; return; }
            ov.querySelectorAll('#rp-danger .rp-tile').forEach(x => x.disabled = true);
            const ok = await this.rpSend({ kind: 'danger', subtype: b.dataset.k, lat: p.pos[1], lng: p.pos[0], length_m: len || undefined }, msg);
            if (ok) setTimeout(close, 800); else ov.querySelectorAll('#rp-danger .rp-tile').forEach(x => x.disabled = false);
        }));
        ov.querySelector('#rp-pub').addEventListener('click', async (ev) => {
            const btn = ev.currentTarget, p = this.rpPos(ov.querySelector('#rp-loc').value === 'center' ? 'center' : 'gps'); if (!p) { msg.textContent = 'Position indisponible.'; msg.className = 'rp-msg err'; return; }
            const d = ov.querySelector('#rp-date').value, tm = ov.querySelector('#rp-time').value; if (!d || !tm) { msg.textContent = 'Choisis la date et l\'heure.'; msg.className = 'rp-msg err'; return; }
            btn.disabled = true;
            const ok = await this.rpSend({ kind: 'ride', subtype: 'meetup', level: this.rpLevelValue(ov), title: ov.querySelector('#rp-title').value.trim(), description: ov.querySelector('#rp-desc').value.trim() || null, starts_at: new Date(`${d}T${tm}`).toISOString(), lat: p.pos[1], lng: p.pos[0] }, msg);
            if (ok) setTimeout(close, 900); else btn.disabled = false;
        });
        if (tab === 'ride' || tab === 'aide') show(tab);
    }
});

// ====================================================================
//  TRACÉ DES ZONES DANGEREUSES (façon bouchons) : le danger est signalé en un point, on colore la route sur X m autour.
//  Géométrie : d'abord l'itinéraire en cours (précis, même hors écran), sinon les routes de la carte affichée (cache par signalement).
// ====================================================================
Object.assign(ModuleGPS, {
    RP_ROAD_CLASS: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service', 'unclassified', 'residential', 'track', 'busway'],
    rpTraceEnsure() {
        const m = this.state.map; if (!m || !m.getStyle || !m.getStyle()) return false;
        try {
            if (!m.getSource('rp-trace')) m.addSource('rp-trace', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            const layout = { 'line-join': 'round', 'line-cap': 'round' };
            const before = m.getLayer('route-casing') ? 'route-casing' : undefined;
            if (!m.getLayer('rp-trace-casing')) m.addLayer({ id: 'rp-trace-casing', type: 'line', source: 'rp-trace', layout, paint: { 'line-color': '#000000', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 11, 18, 22] } }, before);
            if (!m.getLayer('rp-trace-line')) m.addLayer({ id: 'rp-trace-line', type: 'line', source: 'rp-trace', layout, paint: { 'line-color': ['get', 'c'], 'line-opacity': 0.92, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.8, 14, 7, 18, 16] } }, before);
            return true;
        } catch (e) { return false; }
    },
    // Découpe la polyligne `coords` sur `len` mètres centrés sur le point `pt` (null si le point en est trop loin)
    rpSlice(coords, pt, len) {
        if (!coords || coords.length < 2) return null;
        let best = { d: Infinity, i: 0, pr: null };
        for (let i = 0; i < coords.length - 1; i++) {
            const pr = this.projectPointOnSegment(pt, coords[i], coords[i + 1]), d = this.calculateDistance(pt, pr);
            if (d < best.d) best = { d, i, pr };
        }
        if (best.d > 45) return null;
        const half = len / 2;
        const walk = (dir) => {   // dir = +1 vers l'avant, -1 vers l'arrière
            const out = []; let left = half, cur = best.pr, idx = dir > 0 ? best.i + 1 : best.i;
            while (left > 0 && idx >= 0 && idx < coords.length) {
                const nxt = coords[idx], seg = this.calculateDistance(cur, nxt);
                if (seg >= left) { const f = left / (seg || 1); out.push([cur[0] + (nxt[0] - cur[0]) * f, cur[1] + (nxt[1] - cur[1]) * f]); break; }
                out.push(nxt); left -= seg; cur = nxt; idx += dir;
            }
            return out;
        };
        const back = walk(-1).reverse(), fwd = walk(1);
        const line = [...back, best.pr, ...fwd];
        return line.length >= 2 ? line : null;
    },
    // Couches « routes » du style en cours (schéma OpenMapTiles : source-layer « transportation » ; sinon repérées par leur nom)
    rpRoadLayerIds() {
        const m = this.state.map; if (!m || !m.getStyle) return [];
        const L = (m.getStyle() || {}).layers || [];
        const a = L.filter(l => l.type === 'line' && l['source-layer'] === 'transportation').map(l => l.id);
        if (a.length) return a;
        return L.filter(l => l.type === 'line' && l.source !== 'rp-trace' && l['source-layer'] && /road|street|highway|motorway|trunk|primary|secondary|tertiary|transport/i.test(l.id + ' ' + l['source-layer']) && !/rail|ferry|aerial|path|pedestrian/i.test(l.id)).map(l => l.id);
    },
    // Diagnostic (console) : ModuleGPS.rpTraceDebug()
    rpTraceDebug() {
        const s = this.state, m = s.map, out = { zoom: m && m.getZoom(), routes: this.rpRoadLayerIds().length, dangers: (s.rpDangers || []).map(r => ({ id: r.id, sub: r.subtype, geom: !!(s.rpGeom && s.rpGeom.get(r.id)) })), layer: !!(m && m.getLayer('rp-trace-line')), style: m && m.isStyleLoaded && m.isStyleLoaded() };
        try { const r = (s.rpDangers || [])[0]; if (r) { const px = m.project([r.lng, r.lat]); out.px = [Math.round(px.x), Math.round(px.y)]; out.near = m.queryRenderedFeatures([[px.x - 50, px.y - 50], [px.x + 50, px.y + 50]], { layers: this.rpRoadLayerIds() }).length; } } catch (e) { out.err = String(e); }
        return JSON.stringify(out);
    },
    rpRoadGeometry(r, len) {
        const s = this.state, m = s.map; if (!m) return null;
        const pt = [r.lng, r.lat];
        // 1) l'itinéraire en cours
        const rg = s.routeGeo && s.routeGeo.coordinates;
        if (rg && rg.length > 1) { const g = this.rpSlice(rg, pt, len); if (g) return g; }
        // 2) les routes dessinées sur la carte (nécessite que les tuiles soient chargées autour du point)
        try {
            if (m.getZoom() < 11) return null;
            const px = m.project(pt), W = m.getContainer().clientWidth, H = m.getContainer().clientHeight;
            if (px.x < 0 || px.y < 0 || px.x > W || px.y > H) return null;
            const ids = this.rpRoadLayerIds();
            if (!ids.length) return null;
            let feats = m.queryRenderedFeatures([[px.x - 26, px.y - 26], [px.x + 26, px.y + 26]], { layers: ids });
            if (!feats.length) feats = m.queryRenderedFeatures([[px.x - 50, px.y - 50], [px.x + 50, px.y + 50]], { layers: ids });
            let bestG = null, bestD = Infinity;
            feats.forEach(f => {
                const cls = f.properties && f.properties.class; if (cls && this.RP_ROAD_CLASS.indexOf(cls) < 0) return;
                const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : []);
                lines.forEach(c => {
                    for (let i = 0; i < c.length - 1; i++) { const d = this.calculateDistance(pt, this.projectPointOnSegment(pt, c[i], c[i + 1])); if (d < bestD) { bestD = d; bestG = c; } }
                });
            });
            return bestG ? this.rpSlice(bestG, pt, len) : null;
        } catch (e) { return null; }
    },
    rpTraceData() {
        const s = this.state, feats = [];
        (s.rpDangers || []).forEach(r => {
            const g = s.rpGeom && s.rpGeom.get(r.id); if (!g) return;
            const t = this.RP_TYPES[r.subtype] || this.RP_TYPES.other;
            feats.push({ type: 'Feature', properties: { c: t.color }, geometry: { type: 'LineString', coordinates: g } });
        });
        return { type: 'FeatureCollection', features: feats };
    },
    rpTracePush() { const m = this.state.map; if (!m) return; this.rpTraceEnsure(); const src = m.getSource('rp-trace'); if (src) src.setData(this.rpTraceData()); },
    // Appelé après chaque chargement de signalements ; recalcule les géométries manquantes
    rpTraceRefresh(list) {
        const s = this.state; if (!s.map) return;
        s.rpGeom = s.rpGeom || new Map(); s.rpDangers = (list || s.rpDangers || []).filter(r => r.kind === 'danger');
        const ids = new Set(s.rpDangers.map(r => r.id)); s.rpGeom.forEach((v, k) => { if (!ids.has(k)) s.rpGeom.delete(k); });
        this.rpTraceCompute();
        if (!s._rpTraceHook) {
            s._rpTraceHook = true; let deb;
            s.map.on('style.load', () => { setTimeout(() => { try { this.rpTraceCompute(); this.rpTracePush(); } catch (e) {} }, 400); });
            // quand la carte se stabilise (tuiles chargées), on tente les dangers sans géométrie ; quand l'itinéraire change, on recalcule
            s.map.on('idle', () => { clearTimeout(deb); deb = setTimeout(() => { if (this.rpTraceCompute()) this.rpTracePush(); }, 250); });
            // En suivi GPS la carte bouge sans cesse et « idle » n'arrive presque jamais : on retente aussi à chaque fin de mouvement et toutes les 2,5 s tant qu'un danger n'a pas son tracé
            s.map.on('moveend', () => { clearTimeout(deb); deb = setTimeout(() => { if (this.rpTraceCompute()) this.rpTracePush(); }, 300); });
            setInterval(() => { try { if (s.rpDangers && s.rpDangers.some(r => !s.rpGeom.has(r.id)) && this.rpTraceCompute()) this.rpTracePush(); } catch (e) {} }, 2500);
        }
        this.rpTracePush();
    },
    rpTraceCompute() {
        const s = this.state; let changed = false;
        const hasRoute = !!(s.routeGeo && s.routeGeo.coordinates && s.routeGeo.coordinates.length > 1);
        (s.rpDangers || []).forEach(r => {
            const len = r.length_m || this.RP_LEN[r.subtype] || 300, prev = s.rpGeom.get(r.id);
            if (prev && prev._len === len && (prev._src === 'route' || !hasRoute)) return;   // déjà calculé au mieux
            const viaRoute = hasRoute ? this.rpSlice(s.routeGeo.coordinates, [r.lng, r.lat], len) : null;
            const g = viaRoute || this.rpRoadGeometry(r, len);
            if (g) { g._len = len; g._src = viaRoute ? 'route' : 'map'; s.rpGeom.set(r.id, g); changed = true; }
        });
        return changed;
    }
});

