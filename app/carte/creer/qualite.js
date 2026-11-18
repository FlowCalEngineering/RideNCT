// Qualité de la route : récap de l'itinéraire = distance · durée · dénivelé · % d'asphalte.
// BRouter (Sinueux / Sans axes) fournit l'altitude et le revêtement ; pour Rapide (OSRM) seul le dénivelé est estimé (Open-Meteo).
// Une info absente est simplement masquée ; sous 85 % d'asphalte (piste, gravier…) la colonne passe en orange.
const RouteQuality = {
    PISTE_SEUIL: 85,
    cache: new WeakMap(),   // géométrie → { asphalt (0..1 | null) }
    asc: new WeakMap(),     // géométrie → dénivelé positif (m) | null
    PAVED: /^(asphalt|paved|concrete|concrete:plates|concrete:lanes|paving_stones|metal)$/,
    UNPAVED: /^(unpaved|gravel|fine_gravel|compacted|dirt|ground|earth|grass|sand|mud|pebblestone|cobblestone|sett|wood|rock|clay)$/,
    ROADS: /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|road)$/,
    // Tronçons d'un itinéraire BRouter d'après ses « messages » (une ligne par tronçon : distance + étiquettes OSM) : { paved, unpaved } en mètres
    splitOf(feature) {
        try {
            const m = feature.properties && feature.properties.messages; if (!Array.isArray(m) || m.length < 2) return null;
            const h = m[0], iD = h.indexOf('Distance'), iT = h.indexOf('WayTags'); if (iD < 0 || iT < 0) return null;
            let paved = 0, unpaved = 0;
            for (let i = 1; i < m.length; i++) {
                const d = parseFloat(m[i][iD]) || 0, tags = String(m[i][iT] || '');
                const sf = (/(?:^|\s)surface=(\S+)/.exec(tags) || [])[1], hw = (/(?:^|\s)highway=(\S+)/.exec(tags) || [])[1] || '';
                if (sf) { if (this.PAVED.test(sf)) paved += d; else if (this.UNPAVED.test(sf)) unpaved += d; }
                else if (this.ROADS.test(hw)) paved += d;
                else if (/^(track|path|bridleway)$/.test(hw)) unpaved += d;
            }
            return paved + unpaved > 0 ? { paved, unpaved } : null;
        } catch (e) { return null; }
    },
    asphaltOf(feature) { const x = this.splitOf(feature); return x ? x.paved / (x.paved + x.unpaved) : null; },
    remember(feature) { try { if (feature && feature.geometry) this.cache.set(feature.geometry, { asphalt: this.asphaltOf(feature), legal: (feature.properties && feature.properties._legal) || 0 }); } catch (e) {} },
    // Dénivelé positif d'une suite d'altitudes (seuil de 3 m contre le bruit)
    ascentOf(elevs) {
        let up = 0, ref = null;
        for (const e of elevs) { if (typeof e !== 'number' || !isFinite(e)) continue; if (ref === null) { ref = e; continue; } if (e - ref >= 3) { up += e - ref; ref = e; } else if (e < ref) ref = e; }
        return up;
    },
    ascent(geo) {
        if (!geo || !geo.coordinates) return null;
        if (this.asc.has(geo)) return this.asc.get(geo);
        const c = geo.coordinates;
        if (c.length && c[0].length >= 3 && typeof c[0][2] === 'number') { const v = Math.round(this.ascentOf(c.map(p => p[2]))); this.asc.set(geo, v); return v; }
        return undefined;   // pas d'altitude dans le tracé : à demander
    },
    // Itinéraires sans altitude (Rapide) : jusqu'à 100 points échantillonnés, altitudes Open-Meteo
    async fetchAscent(geo) {
        try {
            const c = geo.coordinates, n = Math.min(100, c.length), pts = [];
            for (let i = 0; i < n; i++) pts.push(c[Math.round(i * (c.length - 1) / Math.max(1, n - 1))]);
            const ac = new AbortController(), to = setTimeout(() => ac.abort(), 7000);
            let r; try { r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p[1].toFixed(4)).join(',')}&longitude=${pts.map(p => p[0].toFixed(4)).join(',')}`, { signal: ac.signal }); } finally { clearTimeout(to); }
            if (!r.ok) throw new Error();
            const d = await r.json(); if (!d || !Array.isArray(d.elevation)) throw new Error();
            const v = Math.round(this.ascentOf(d.elevation)); this.asc.set(geo, v); return v;
        } catch (e) { this.asc.set(geo, null); return null; }
    },
    cols(geo, distKm, timeStr) {
        const q = this.cache.get(geo) || {}, a = this.ascent(geo), cols = [[`${distKm} km`, 'DISTANCE'], [timeStr, 'DURÉE']];
        if (typeof a === 'number') cols.push([`+${Math.round(a).toLocaleString('fr-FR')} m`, 'DÉNIVELÉ']);
        if (typeof q.asphalt === 'number') { const p = Math.round(q.asphalt * 100); cols.push([(p < this.PISTE_SEUIL ? '⚠ ' : '') + p + ' %', 'ASPHALTE', p < this.PISTE_SEUIL]); }
        if (q.legal > 0) cols.push([`⚠ ${q.legal}`, 'À VÉRIFIER', true]);   // tronçons de piste / sens interdit possibles que BRouter n'a pas pu éviter
        return cols;
    }
};
Object.assign(ModuleGPS, {
    // Récap de l'itinéraire (zone « #route-info-display ») ; le dénivelé des tracés sans altitude arrive juste après
    paintInfo(geo, distKm, timeStr) {
        const box = document.getElementById('route-info-display'); if (!box) return;
        box.style.display = 'flex'; box.classList.add('ri-box');
        box.innerHTML = RouteQuality.cols(geo, distKm, timeStr).map(c => `<div class="ri-col${c[2] ? ' warn' : ''}"><b>${c[0]}</b><small>${c[1]}</small></div>`).join('');
        if (geo && RouteQuality.ascent(geo) === undefined && !RouteQuality.asc.has(geo) && !(this.isOffline && this.isOffline())) {
            RouteQuality.asc.set(geo, null);
            RouteQuality.fetchAscent(geo).then(v => { if (typeof v === 'number' && this.state.currentGeoJSON === geo) this.paintInfo(geo, distKm, timeStr); });
        }
    }
});
