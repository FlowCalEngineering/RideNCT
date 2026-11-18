// Les 3 types d'itinéraire (Sinueux / Sans axes / Rapide) affichés ensemble sur la carte,
// chacun avec une bulle : icône du mode + durée + distance. Toucher une bulle sélectionne le mode.
(() => {
    const COL = { 'sinueux': '#ff9f0a', 'sans-axe': '#30d158', 'rapide': '#0a84ff' };
    const FRAC = { 'sinueux': 0.22, 'sans-axe': 0.5, 'rapide': 0.78 };    // position de la bulle le long du tracé (évite qu'elles se chevauchent)
    const MODES = ['sinueux', 'sans-axe', 'rapide'];
    const S = () => ModuleGPS.state;
    const keyOf = c => c.map(p => p[0].toFixed(5) + ',' + p[1].toFixed(5)).join('|');
    const fmtT = s => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`; };
    const icon = mode => { const b = document.querySelector('.route-mode-btn[data-mode="' + mode + '"] svg'); return b ? b.innerHTML : ''; };
    const pointAt = (coords, f) => {
        let tot = 0; for (let i = 1; i < coords.length; i++) tot += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
        let t = tot * f, acc = 0;
        for (let i = 1; i < coords.length; i++) { const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]); if (acc + d >= t && d > 0) { const k = (t - acc) / d; return [coords[i - 1][0] + k * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + k * (coords[i][1] - coords[i - 1][1])]; } acc += d; }
        return coords[coords.length - 1];
    };

    const _calc = ModuleGPS.calculateRoute, _fin = ModuleGPS.finishRoute, _draw = ModuleGPS.drawRouteOnMap,
          _check = ModuleGPS.checkAndCalculate, _clear = ModuleGPS.clearRoute, _layers = ModuleGPS.ensureRouteLayers;

    Object.assign(ModuleGPS, {
        async calculateRoute(coords) {
            const s = S(); s._altKey = keyOf(coords); s.alts = {}; this.hideAlts();
            const r = await _calc.apply(this, arguments);
            if (!s.isTracking && !s.routeExpert && s._altKey === keyOf(coords)) this.computeAlts(coords, s._altKey);
            return r;
        },
        finishRoute(geo, dist, dur, offline) {
            const s = S(); s._fin = true;
            try { _fin.apply(this, arguments); } finally { s._fin = false; }
            if (s.alts && s._altKey && geo && geo.coordinates) { s.alts[s.routeMode] = { geo, dist, dur, steps: s.routeSteps }; if (!s.isTracking) this.renderAlts(); }
        },
        drawRouteOnMap(g) { if (!S()._fin) this.hideAlts(); return _draw.apply(this, arguments); },
        clearRoute() { const s = S(); s.alts = {}; s._altKey = null; this.hideAlts(); return _clear.apply(this, arguments); },
        ensureRouteLayers(d) { const r = _layers.apply(this, arguments); if (S()._altShown) this.altLayers(); return r; },
        checkAndCalculate() {
            const s = S(), inputs = [...document.querySelectorAll('#waypoints-container .floating-input')];
            const coords = inputs.filter(i => s.coords[i.id]).map(i => s.coords[i.id]);
            if (coords.length >= 2 && !s.isTracking && s.alts && s._altKey === keyOf(coords) && s.alts[s.routeMode]) {
                const a = s.alts[s.routeMode];
                if (s.currentGeoJSON !== a.geo) { s.routeSteps = a.steps || []; s._stepIdx = -1; s.currentStepIndex = 0; this.finishRoute(a.geo, a.dist, a.dur); this.renderRouteMarkers && this.renderRouteMarkers(); }
                return;
            }
            return _check.apply(this, arguments);
        },

        // Calcule en tâche de fond les modes qui ne sont pas (encore) affichés
        async computeAlts(coords, key) {
            const s = S(); const todo = MODES.filter(m => !s.alts[m]);
            if (!todo.length) return this.renderAlts();
            const live = () => !s.isTracking && !s.routeExpert && s._altKey === key;
            const put = (m, v) => { if (live() && v && v.geo) { s.alts[m] = v; this.renderAlts(); } };
            if (this.isOffline() && typeof OfflineGeo !== 'undefined') {
                for (const m of todo) { try { const r = await OfflineGeo.route(coords, m); put(m, { geo: r.geometry, dist: r.distance, dur: r.duration, steps: this.cleanSteps(r.steps) }); } catch (e) { } }
                return;
            }
            const oc = coords.map(c => c[0] + ',' + c[1]).join(';'), bc = coords.map(c => c[0] + ',' + c[1]).join('|');
            const od = await this.osrmJson(oc + '?overview=full&geometries=geojson&steps=true');
            if (!live()) return;
            let avg = 16.66, fast = null;
            if (od) { const rt = od.routes[0]; if (rt.duration > 0) avg = rt.distance / rt.duration; let st = []; (rt.legs || []).forEach(l => st = st.concat(l.steps || [])); fast = { geo: rt.geometry, dist: rt.distance, dur: rt.duration, steps: this.cleanSteps(st) }; }
            if (todo.includes('rapide')) put('rapide', fast);
            await Promise.all(todo.filter(m => m !== 'rapide').map(async m => {
                try {
                    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 25000);
                    let r; try { r = await ModuleGPS.brouterFetch(bc, m === 'sans-axe' ? 'moped' : 'fastbike', ac.signal, { fluid: m === 'sinueux' }); } finally { clearTimeout(to); }
                    if (!r.ok) return; const d = await r.json(); const f = d.features && d.features[0]; if (!f) return;
                    RouteQuality.remember(f); const dist = parseFloat(f.properties['track-length']) || 0;
                    put(m, { geo: f.geometry, dist, dur: dist / (avg * (m === 'sinueux' ? 0.90 : 0.95)), steps: null });
                } catch (e) { }
            }));
        },

        altLayers() {
            const m = S().map; if (!m) return false;
            try {
                if (!m.getSource('route-alts')) m.addSource('route-alts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                const layout = { 'line-join': 'round', 'line-cap': 'round' }, before = m.getLayer('route-casing') ? 'route-casing' : undefined;
                const col = ['match', ['get', 'mode'], 'sinueux', COL['sinueux'], 'sans-axe', COL['sans-axe'], COL['rapide']];
                if (!m.getLayer('route-alt-casing')) m.addLayer({ id: 'route-alt-casing', type: 'line', source: 'route-alts', layout, paint: { 'line-color': '#0b0b0d', 'line-opacity': 0.6, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 10, 18, 16] } }, before);
                if (!m.getLayer('route-alt-line')) m.addLayer({ id: 'route-alt-line', type: 'line', source: 'route-alts', layout, paint: { 'line-color': col, 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5, 18, 9] } }, before);
                if (!m._altClick) { m._altClick = true; m.on('click', 'route-alt-line', e => { const f = e.features && e.features[0]; if (f) this.pickVariant(f.properties.mode); }); }
                return true;
            } catch (e) { return false; }
        },
        renderAlts() {
            const s = S(), m = s.map; if (!m || s.isTracking || !s.alts) return;
            const have = MODES.filter(k => s.alts[k]); if (have.length < 2) return;
            if (!this.altLayers()) return;
            s._altShown = true;
            try { m.setPaintProperty('route-line', 'line-color', COL[s.routeMode]); } catch (e) { }
            m.getSource('route-alts').setData({ type: 'FeatureCollection', features: have.filter(k => k !== s.routeMode).map(k => ({ type: 'Feature', properties: { mode: k }, geometry: s.alts[k].geo })) });
            s._altMk = s._altMk || {};
            if (!m._altZoom) { m._altZoom = true; m.on('zoomend', () => { if (S()._altShown) this.renderAlts(); }); }
            // Placement : on cherche, pour chaque bulle, une position le long de son tracé qui ne recouvre pas les autres
            const placed = [], pos = {};
            [s.routeMode, ...MODES.filter(k => k !== s.routeMode)].filter(k => s.alts[k]).forEach(k => {
                const c = s.alts[k].geo.coordinates; let best = null;
                for (const d of [0, .07, -.07, .14, -.14, .21, -.21, .28, -.28, .35, -.35, .42, -.42]) {
                    const f = Math.min(.84, Math.max(.14, FRAC[k] + d)), ll = pointAt(c, f), px = m.project(ll);
                    if (!placed.some(q => Math.abs(q.x - px.x) < 112 && Math.abs(q.y - px.y) < 44)) { best = { ll, px }; break; }
                }
                if (!best) { const ll = pointAt(c, FRAC[k]); best = { ll, px: m.project(ll) }; }
                placed.push(best.px); pos[k] = best.ll;
            });
            have.forEach(k => {
                const a = s.alts[k]; let mk = s._altMk[k];
                const html = `<span class="alt-ic"><svg viewBox="0 0 24 24">${icon(k)}</svg></span><span class="alt-tx"><b>${fmtT(a.dur)}</b><small>${(a.dist / 1000).toFixed(a.dist >= 100000 ? 0 : 1)} km</small></span>`;
                if (!mk) {
                    const el = document.createElement('button'); el.type = 'button'; el.className = 'alt-bubble'; el.style.setProperty('--c', COL[k]);
                    el.addEventListener('click', ev => { ev.stopPropagation(); this.pickVariant(k); });
                    mk = s._altMk[k] = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] }).setLngLat(pos[k]).addTo(m);
                } else mk.setLngLat(pos[k]);
                const el = mk.getElement(); el.innerHTML = html; el.classList.toggle('on', k === s.routeMode); el.dataset.mode = k;
            });
            if (!s._altFit && have.length === 3) {
                s._altFit = true;
                try { const b = new maplibregl.LngLatBounds(); have.forEach(k => s.alts[k].geo.coordinates.forEach(c => b.extend(c))); m.fitBounds(b, { padding: 60, duration: 500 }); } catch (e) { }
            }
        },
        hideAlts() {
            const s = S(); s._altShown = false; s._altFit = false;
            try { if (s.map && s.map.getLayer('route-line')) s.map.setPaintProperty('route-line', 'line-color', AppTheme.getRouteColor()); } catch (e) { }
            if (s._altMk) { Object.values(s._altMk).forEach(mk => { try { mk.remove(); } catch (e) { } }); s._altMk = {}; }
            try { if (s.map && s.map.getSource('route-alts')) s.map.getSource('route-alts').setData({ type: 'FeatureCollection', features: [] }); } catch (e) { }
        },
        pickVariant(mode) {
            const b = document.querySelector('.route-mode-btn[data-mode="' + mode + '"]'); if (b) b.click();
        }
    });
})();
