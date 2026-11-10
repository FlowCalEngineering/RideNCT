// Mode Expert : moteur de calcul « routes d'amusement ».
// Les routeurs classiques (OSRM, BRouter) cherchent le chemin le plus court ou le plus rapide. Ici on cherche LE PLUS AMUSANT :
//  1. un trajet de référence donne l'axe général (OSRM, ou la ligne droite) ;
//  2. on télécharge les routes (OpenStreetMap, via Overpass) dans un couloir autour de cet axe : primaires, secondaires, tertiaires, petites routes ;
//  3. on mesure chaque portion de route : combien elle tourne par kilomètre (virages, épingles) ;
//  4. on cherche le chemin au « coût » minimal où une route sinueuse coûte moins cher qu'une route droite (A*), le curseur de style réglant l'écart.
// Aucune route non goudronnée, ni autoroute / voie rapide. Le couloir s'élargit avec le curseur : plus on veut tordu, plus on accepte le détour.
const ExpertMoteur = {
    HOSTS: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],
    CLASS: { primary: 1.35, primary_link: 1.35, secondary: 1.0, secondary_link: 1.05, tertiary: 0.9, tertiary_link: 0.95, unclassified: 0.9 },
    UNPAVED: /^(unpaved|gravel|fine_gravel|dirt|earth|ground|sand|grass|mud|compacted|pebblestone|woodchips|clay)$/,
    cache: new Map(),

    rad(d) { return d * Math.PI / 180; },
    dist(a, b) { const R = 6371000, la = this.rad((a[1] + b[1]) / 2), x = this.rad(b[0] - a[0]) * Math.cos(la), y = this.rad(b[1] - a[1]); return Math.hypot(x, y) * R; },
    bearing(a, b) { return Math.atan2((b[0] - a[0]) * Math.cos(this.rad(a[1])), b[1] - a[1]) * 180 / Math.PI; },
    turn(a, b, c) { let d = this.bearing(b, c) - this.bearing(a, b); while (d > 180) d -= 360; while (d < -180) d += 360; return Math.abs(d); },

    // ligne de référence : ≤ 60 points, densifiée en ligne droite si aucun routeur ne répond
    densify(a, b) { const n = Math.max(2, Math.min(40, Math.ceil(this.dist(a, b) / 4000))), out = []; for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]); return out; },
    thin(line, max) { if (line.length <= max) return line; const out = []; for (let i = 0; i < max; i++) out.push(line[Math.round(i * (line.length - 1) / (max - 1))]); return out; },

    async overpass(line, R, o) {
        o = o || {};
        const poly = this.thin(line, 40).map(c => c[1].toFixed(5) + ',' + c[0].toFixed(5)).join(',');
        const q = `[out:json][timeout:25];way["highway"~"^(primary|secondary|tertiary|unclassified|primary_link|secondary_link|tertiary_link)$"]["access"!~"^(no|private)$"](around:${Math.round(R)},${poly});out geom qt;`;
        if (this.cache.has(q)) return this.cache.get(q);
        let last = null;
        for (const h of this.HOSTS) {
            if (o.cancelled && o.cancelled()) throw new Error('annulé');
            const left = (o.deadline || Infinity) - Date.now(); if (left < 2000) break;
            const ac = new AbortController(), to = setTimeout(() => ac.abort(), Math.min(22000, left));
            const watch = setInterval(() => { if (o.cancelled && o.cancelled()) ac.abort(); }, 300);
            try {
                if (o.status) o.status('Téléchargement des routes…');
                const r = await fetch(h, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal });
                if (!r.ok) throw new Error('serveur de routes occupé (' + r.status + ')');
                const d = await r.json(); if (!d || !Array.isArray(d.elements)) throw new Error('réponse vide');
                if (this.cache.size > 5) this.cache.delete(this.cache.keys().next().value);
                this.cache.set(q, d); return d;
            } catch (e) {
                if (o.cancelled && o.cancelled()) throw new Error('annulé');
                last = e && e.name === 'AbortError' ? new Error('le serveur de routes ne répond pas') : e;
            } finally { clearTimeout(to); clearInterval(watch); }
        }
        throw last || new Error('serveur de routes injoignable');
    },

    // Graphe : un sommet par point OSM ; chaque tronçon garde sa longueur, son « amusement » (0 = ligne droite, 1 = très sinueux) et son type de route.
    build(data, opt) {
        const idx = new Map(), lon = [], lat = [], adj = [];
        const node = (id, c) => { let i = idx.get(id); if (i === undefined) { i = lon.length; idx.set(id, i); lon.push(c[0]); lat.push(c[1]); adj.push([]); } return i; };
        let ways = 0;
        for (const w of data.elements) {
            if (w.type !== 'way' || !w.geometry || !w.nodes || w.geometry.length !== w.nodes.length || w.geometry.length < 2) continue;
            const t = w.tags || {}, cf = this.CLASS[t.highway]; if (!cf) continue;
            if (t.surface && this.UNPAVED.test(t.surface)) continue;
            if (t.tracktype && /^grade[3-5]$/.test(t.tracktype)) continue;
            const P = w.geometry.map(g => [g.lon, g.lat]), n = P.length;
            let fac = cf; if (t.highway.indexOf('primary') === 0 && opt.avoidNat) fac = 3.2;
            const ms = parseInt(t.maxspeed, 10); if (ms && ms <= 30) fac *= 1.6;   // villages, zones lentes
            if (t.junction === 'roundabout') fac = Math.max(fac, 1.1);
            // amusement local : variation de cap cumulée sur ±150 m autour de chaque point, en degrés par kilomètre
            const seg = [], ang = new Array(n).fill(0);
            for (let i = 0; i < n - 1; i++) seg.push(this.dist(P[i], P[i + 1]));
            for (let i = 1; i < n - 1; i++) ang[i] = this.turn(P[i - 1], P[i], P[i + 1]);
            const fun = new Array(n - 1).fill(0);
            for (let i = 0; i < n - 1; i++) {
                let a = 0, l = 0, j = i, d = 0;
                while (j >= 0 && d < 150) { if (j < n - 1) { d += seg[j]; l += seg[j]; } if (j > 0) a += ang[j]; j--; }
                j = i + 1; d = 0;
                while (j < n - 1 && d < 150) { d += seg[j]; l += seg[j]; a += ang[j]; j++; }
                const dens = l > 20 ? a / (l / 1000) : 0;
                fun[i] = Math.max(0, Math.min(1, dens / 250));   // 250 °/km ≈ route de montagne bien tordue = 1
            }
            const ow = t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true' || t.junction === 'roundabout', rev = t.oneway === '-1';
            for (let i = 0; i < n - 1; i++) {
                const A = node(w.nodes[i], P[i]), B = node(w.nodes[i + 1], P[i + 1]), len = seg[i]; if (A === B) continue;
                if (!rev) adj[A].push([B, len, fun[i], fac]);
                if (!ow) adj[B].push([A, len, fun[i], fac]); else if (rev) adj[B].push([A, len, fun[i], fac]);
            }
            ways++;
        }
        return { lon, lat, adj, ways };
    },
    nearest(g, c, maxM) {
        let best = -1, bd = maxM; const k = Math.cos(this.rad(c[1]));
        for (let i = 0; i < g.lon.length; i++) {
            if (!g.adj[i].length) continue;
            const dx = (g.lon[i] - c[0]) * k * 111320, dy = (g.lat[i] - c[1]) * 111320, d = Math.hypot(dx, dy);
            if (d < bd) { bd = d; best = i; }
        }
        return best < 0 ? null : { i: best, d: bd };
    },
    // A* : coût d'un tronçon = longueur × (1 + alpha × (1 − amusement)) × type de route. alpha = 0 : plus court ; alpha fort : on cherche le sinueux.
    search(g, s, t, alpha) {
        const N = g.lon.length, cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
        const goal = [g.lon[t], g.lat[t]], h = i => this.dist([g.lon[i], g.lat[i]], goal) * 0.85;
        const heap = []; const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break;[heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
        const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break;[heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
        cost[s] = 0; push(h(s), s);
        while (heap.length) {
            const [, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === t) break;
            for (const [v, len, fun, fac] of g.adj[u]) {
                if (done[v]) continue;
                const c = cost[u] + len * (1 + alpha * (1 - fun)) * fac;
                if (c < cost[v]) { cost[v] = c; prev[v] = u; push(c + h(v), v); }
            }
        }
        if (!isFinite(cost[t])) return null;
        const path = []; for (let v = t; v !== -1; v = prev[v]) path.push(v); path.reverse(); return path;
    },

    pause() { return new Promise(r => setTimeout(r, 0)); },   // laisse l'écran respirer entre deux gros calculs
    // Un morceau (≤ ~40 km) : télécharge les routes du couloir, construit le graphe, cherche le chemin le plus amusant.
    async chunk(a, b, line, opt, firstChunk, lastChunk) {
        const direct = this.dist(a, b), R = 1800 + opt.style * 28 + Math.min(2500, direct * 0.04);   // couloir : plus on veut tordu, plus il est large
        // 1) routes lues sur l'appareil (carte hors ligne téléchargée) ; 2) à défaut, serveur Overpass
        let data = null, g, s, t, path, usedOffline = false, offErr = null;
        if (typeof OfflineGeo !== 'undefined' && !opt.noOffline) {
            try {
                if (opt.status) opt.status('Lecture des routes sur le téléphone…');
                data = await OfflineGeo.roads(this.thin(line, 40), R);
                if (data) {
                    await this.pause(); g = this.build(data, opt);
                    s = g.ways ? this.nearest(g, a, firstChunk ? 2500 : 6000) : null; t = g.ways ? this.nearest(g, b, lastChunk ? 2500 : 6000) : null;
                    if (s && t) { if (opt.status) opt.status('Recherche des routes amusantes (sur le téléphone)…'); await this.pause(); path = this.search(g, s.i, t.i, Math.max(0, opt.style / 100 * 1.6)); }
                    usedOffline = !!path;
                }
            } catch (e) { offErr = e; }
            if (opt.cancelled && opt.cancelled()) throw new Error('annulé');
        }
        if (!path) {
            data = await this.overpass(line, R, opt);
            if (opt.cancelled && opt.cancelled()) throw new Error('annulé');
            if (opt.status) opt.status('Analyse des virages…'); await this.pause();
            g = this.build(data, opt);
            if (g.ways < 1) throw new Error('aucune route trouvée dans le couloir');
            await this.pause();
            s = this.nearest(g, a, firstChunk ? 2500 : 6000); t = this.nearest(g, b, lastChunk ? 2500 : 6000);
            if (!s || !t) throw new Error('un point est trop loin d\'une route (' + (!s ? 'départ' : 'arrivée') + ')');
            if (opt.status) opt.status('Recherche des routes amusantes…'); await this.pause();
            path = this.search(g, s.i, t.i, Math.max(0, opt.style / 100 * 1.6));
            if (!path) throw new Error('aucun chemin continu entre les deux points dans le couloir');
        }
        const coords = firstChunk ? [a] : []; let dist = firstChunk ? s.d : 0, funSum = 0, funLen = 0, prev = coords.length ? coords[coords.length - 1] : null;
        path.forEach(v => { const c = [g.lon[v], g.lat[v]]; if (prev) dist += this.dist(prev, c); coords.push(c); prev = c; });
        for (let k = 1; k < path.length; k++) { const e = g.adj[path[k - 1]].find(x => x[0] === path[k]); if (e) { funSum += e[2] * e[1]; funLen += e[1]; } }
        return { coords, dist, funSum, funLen, end: [g.lon[path[path.length - 1]], g.lat[path[path.length - 1]]], tail: t.d, ways: g.ways, offline: usedOffline };
    },

    // Point d'entrée : tronçon a → b. opt = { ref, style, avoidNat, status(msg), cancelled(), deadline }.
    async leg(a, b, opt) {
        const direct = this.dist(a, b);
        if (direct > 220000) throw new Error('tronçon trop long pour la recherche de routes amusantes (' + Math.round(direct / 1000) + ' km) : ajoute une étape');
        opt.deadline = opt.deadline || (Date.now() + 70000);
        const line = (opt.ref && opt.ref.length > 1) ? opt.ref : this.densify(a, b);
        // trajet de référence découpé tous les ~35 km : chaque morceau ne télécharge que sa part de routes
        const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + this.dist(line[i - 1], line[i]));
        const total = cum[cum.length - 1], parts = Math.max(1, Math.round(total / 35000)), cuts = [0];
        for (let k = 1; k < parts; k++) { const want = total * k / parts; let i = 1; while (i < cum.length - 1 && cum[i] < want) i++; cuts.push(i); }
        cuts.push(line.length - 1);
        let allOff = true, cur = a, coords = [], dist = 0, fs = 0, fl = 0, ways = 0, tail = 0;
        for (let k = 0; k < parts; k++) {
            if (opt.cancelled && opt.cancelled()) throw new Error('annulé');
            const last = k === parts - 1, target = last ? b : line[cuts[k + 1]];
            const sub = line.slice(cuts[k], cuts[k + 1] + 1);
            const sub2 = sub.length > 1 ? sub : [cur, target];
            const so = Object.assign({}, opt, { status: (m) => opt.status && opt.status(parts > 1 ? `${m} (${k + 1}/${parts})` : m) });
            const r = await this.chunk(cur, target, sub2, so, k === 0, last);
            coords = coords.concat(r.coords); dist += r.dist; allOff = allOff && r.offline; fs += r.funSum; fl += r.funLen; ways += r.ways; tail = r.tail; cur = r.end;
        }
        coords.push(b); dist += tail;
        return { coords, dist, fun: fl ? fs / fl : 0, ways, offline: allOff };
    }
};
