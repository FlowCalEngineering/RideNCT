// Itinéraire et recherche SANS RÉSEAU, à partir des tuiles vectorielles déjà téléchargées (carte hors ligne).
//   OfflineGeo.route(points, mode)          → { geometry, distance, duration, steps }  (calcul A* sur le réseau routier des tuiles)
//   OfflineGeo.stepsFromGeometry(coords)    → manœuvres (« tourner à droite »…) pour un tracé déjà existant
//   OfflineGeo.search(texte, [lng,lat])     → rues, villes, lieux trouvés dans les zones téléchargées
// Les tuiles (format MVT) sont lues par un petit décodeur intégré : aucune librairie externe.
const OfflineGeo = (() => {
    const WE = 4096;                         // unités par tuile (coordonnées « monde » normalisées)
    const ROAD_MAIN = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
    // code de classe : 0 autoroute … 7 chemin. Les autres classes (piéton, rail, eau…) ne sont pas routables.
    const CLS = { motorway: 0, trunk: 1, primary: 2, secondary: 3, tertiary: 4, minor: 5, service: 6, track: 7, residential: 5, unclassified: 5, living_street: 6 };
    const clsOf = (c) => {
        c = String(c || '').toLowerCase().replace(/_link$/, ''); if (c in CLS) return CLS[c];
        if (!c || /(path|foot|cycle|pedestrian|steps|rail|ferry|bus_|construction|proposed|pier|subway|tram|bridleway|platform)/.test(c)) return -1;
        if (/motorway/.test(c) || c === 'highway') return c === 'highway' ? 1 : 0;
        if (/trunk/.test(c)) return 1; if (/primary/.test(c)) return 2; if (/secondary|major_road/.test(c)) return 3; if (/tertiary/.test(c)) return 4;
        if (/service|parking|driveway|alley/.test(c)) return 6; if (/track/.test(c)) return 7;
        if (/minor|street|residential|unclassified|local|road|living/.test(c)) return 5;
        return -1;
    };
    let seen = { layers: new Set(), classes: new Map() };
    // vitesses « de coût » (m/s) par mode ; vitesses réelles pour estimer la durée
    const COST = {
        rapide:     [33, 28, 22, 18, 15, 11, 6, 4],
        sinueux:    [8, 10, 13, 17, 18, 15, 6, 4],
        'sans-axe': [2, 3, 14, 18, 16, 12, 6, 4]
    };
    const REAL = [28, 22, 17, 14, 12, 9, 5, 4];
    const td = new TextDecoder();

    // ====================================================================
    //  Décodeur MVT (protobuf) minimal
    // ====================================================================
    const rv = (st) => { let r = 0, m = 1, c; do { c = st.b[st.p++]; r += (c & 127) * m; m *= 128; } while (c & 128); return r; };
    const skip = (st, w) => { if (w === 0) rv(st); else if (w === 1) st.p += 8; else if (w === 2) st.p += rv(st); else if (w === 5) st.p += 4; else throw new Error('mvt'); };
    function readValue(st, end) {
        let v = null;
        while (st.p < end) {
            const t = rv(st), f = t >>> 3, w = t & 7;
            if (f === 1) { const l = rv(st); v = td.decode(st.b.subarray(st.p, st.p + l)); st.p += l; }
            else if (f === 2) { v = new DataView(st.b.buffer, st.b.byteOffset + st.p, 4).getFloat32(0, true); st.p += 4; }
            else if (f === 3) { v = new DataView(st.b.buffer, st.b.byteOffset + st.p, 8).getFloat64(0, true); st.p += 8; }
            else if (f === 4) { v = rv(st); if (v >= 9.223372036854776e18) v = v - 18446744073709551616; }
            else if (f === 5) v = rv(st);
            else if (f === 6) { const z = rv(st); v = z % 2 ? -(z + 1) / 2 : z / 2; }
            else if (f === 7) v = !!rv(st);
            else skip(st, w);
        }
        return v;
    }
    function readFeature(st, end, L) {
        const F = { type: 0, props: null, paths: null }; let tagsAt = null, geomAt = null;
        while (st.p < end) {
            const t = rv(st), f = t >>> 3, w = t & 7;
            if (f === 2 && w === 2) { const l = rv(st); tagsAt = [st.p, st.p + l]; st.p += l; }
            else if (f === 3 && w === 0) F.type = rv(st);
            else if (f === 4 && w === 2) { const l = rv(st); geomAt = [st.p, st.p + l]; st.p += l; }
            else skip(st, w);
        }
        if (tagsAt) { st.p = tagsAt[0]; F.props = {}; while (st.p < tagsAt[1]) { const k = rv(st), v = rv(st); F.props[L.keys[k]] = L.vals[v]; } }
        if (geomAt) {
            st.p = geomAt[0]; const paths = []; let x = 0, y = 0, path = null; const sc = WE / L.ext;
            while (st.p < geomAt[1]) {
                const ci = rv(st), cmd = ci & 7, cnt = Math.floor(ci / 8);
                if (cmd === 1) { for (let i = 0; i < cnt; i++) { let a = rv(st), b = rv(st); x += (a >>> 1) ^ -(a & 1); y += (b >>> 1) ^ -(b & 1); path = [x * sc, y * sc]; paths.push(path); } }
                else if (cmd === 2) { for (let i = 0; i < cnt; i++) { let a = rv(st), b = rv(st); x += (a >>> 1) ^ -(a & 1); y += (b >>> 1) ^ -(b & 1); path.push(x * sc, y * sc); } }
                else if (cmd === 7 && path && path.length >= 2) path.push(path[0], path[1]);
            }
            F.paths = paths;
        }
        return F;
    }
    function readLayer(st, end, want) {
        const L = { name: '', keys: [], vals: [], feats: [], ext: 4096 }, ranges = [];
        while (st.p < end) {
            const t = rv(st), f = t >>> 3, w = t & 7;
            if (f === 1 && w === 2) { const l = rv(st); L.name = td.decode(st.b.subarray(st.p, st.p + l)); st.p += l; }
            else if (f === 2 && w === 2) { const l = rv(st); ranges.push([st.p, st.p + l]); st.p += l; }
            else if (f === 3 && w === 2) { const l = rv(st); L.keys.push(td.decode(st.b.subarray(st.p, st.p + l))); st.p += l; }
            else if (f === 4 && w === 2) { const l = rv(st), e = st.p + l; L.vals.push(readValue(st, e)); st.p = e; }
            else if (f === 5 && w === 0) L.ext = rv(st);
            else skip(st, w);
        }
        seen.layers.add(L.name);
        if (!want.has(L.name)) return null;
        ranges.forEach(([s, e]) => { st.p = s; L.feats.push(readFeature(st, e, L)); });
        return L;
    }
    // Renvoie { nomDeCouche: [ {type, props, paths:[[x0,y0,x1,y1…]…]} ] } en unités monde normalisées de la tuile (0…4096)
    function decodeTile(buf, want) {
        const st = { b: new Uint8Array(buf), p: 0 }, out = {};
        while (st.p < st.b.length) {
            const t = rv(st), f = t >>> 3, w = t & 7;
            if (f === 3 && w === 2) { const l = rv(st), end = st.p + l, L = readLayer(st, end, want); st.p = end; if (L) (out[L.name] = out[L.name] || []).push(...L.feats); }
            else skip(st, w);
        }
        return out;
    }
    async function rawOf(z, x, y) {
        let buf = await OfflineMaps.rawTile(z, x, y); if (!buf) return null;
        const b = new Uint8Array(buf);
        if (b[0] === 0x1f && b[1] === 0x8b && typeof DecompressionStream !== 'undefined') { try { return await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); } catch (e) { return null; } }
        return buf;
    }
    const tick = () => new Promise(r => setTimeout(r, 0));

    // ====================================================================
    //  Géométrie
    // ====================================================================
    const NW = (Z) => WE * Math.pow(2, Z);
    const xToLon = (x, Z) => x / NW(Z) * 360 - 180;
    const yToLat = (y, Z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / NW(Z)))) * 180 / Math.PI;
    const lonToX = (lon, Z) => (lon + 180) / 360 * NW(Z);
    const latToY = (lat, Z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * NW(Z); };
    const mpu = (y, Z) => 40075016.686 / Math.cosh(Math.PI * (1 - 2 * y / NW(Z))) / NW(Z);   // mètres par unité à l'ordonnée y
    const hav = (a, b) => { const R = 6371e3, p1 = a[1] * Math.PI / 180, p2 = b[1] * Math.PI / 180, dp = p2 - p1, dl = (b[0] - a[0]) * Math.PI / 180, h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const bearingXY = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const angDiff = (a, b) => { let d = (b - a + 540) % 360 - 180; return d; };       // b − a dans ]−180 ; 180]  (positif = vers la droite)

    // Tuiles z/x/y couvrant un couloir autour de la ligne droite entre des points
    function corridorTiles(pts, Z, widthKm) {
        const set = new Map(), n = Math.pow(2, Z), add = (lon, lat) => {
            const dLat = widthKm / 111.32, dLng = widthKm / Math.max(0.01, 111.32 * Math.cos(lat * Math.PI / 180));
            const x0 = Math.floor((lonToX(lon - dLng, Z)) / WE), x1 = Math.floor((lonToX(lon + dLng, Z)) / WE);
            const y0 = Math.floor(latToY(Math.min(85, lat + dLat), Z) / WE), y1 = Math.floor(latToY(Math.max(-85, lat - dLat), Z) / WE);
            for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) set.set(x + '/' + y, { z: Z, x, y });
        };
        const tileKm = 40075 / n;
        add(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i], d = hav(a, b) / 1000, k = Math.max(1, Math.ceil(d / Math.max(0.5, Math.min(tileKm / 2, widthKm))));
            for (let j = 1; j <= k; j++) add(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k);
        }
        return [...set.values()];
    }

    // ====================================================================
    //  Graphe routier
    // ====================================================================
    const CELL = 256, vkey = (x, y) => x * 67108864 + y, ckey = (cx, cy) => cx * 262144 + cy;
    // segs : { ax[], ay[], bx[], by[], c[], o[], br[] }  → graphe { vx, vy, adj }
    function buildGraph(S, Z, tol) {
        const n = S.ax.length, cells = new Map();
        const minX = (i) => Math.min(S.ax[i], S.bx[i]), maxX = (i) => Math.max(S.ax[i], S.bx[i]), minY = (i) => Math.min(S.ay[i], S.by[i]), maxY = (i) => Math.max(S.ay[i], S.by[i]);
        for (let i = 0; i < n; i++) {
            const x0 = Math.floor(minX(i) / CELL), x1 = Math.floor(maxX(i) / CELL), y0 = Math.floor(minY(i) / CELL), y1 = Math.floor(maxY(i) / CELL);
            for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = ckey(cx, cy); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(i); }
        }
        const deg = new Map(), inc = (k) => deg.set(k, (deg.get(k) || 0) + 1);
        for (let i = 0; i < n; i++) { inc(vkey(S.ax[i], S.ay[i])); inc(vkey(S.bx[i], S.by[i])); }
        const splits = new Array(n), alias = [];
        const addSplit = (i, t, x, y) => { (splits[i] || (splits[i] = [])).push([t, x, y]); };
        // 1) croisements à plat (deux routes qui se traversent sans partager de sommet)
        cells.forEach((list, k) => {
            const cx = Math.floor(k / 262144), cy = k - cx * 262144;
            for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
                const i = list[a], j = list[b];
                if (S.br[i] || S.br[j] || S.c[i] === 0 || S.c[j] === 0) continue;       // une autoroute ne se croise pas à plat : l'accès se fait par les bretelles
                if (Math.max(minX(i), minX(j)) > Math.min(maxX(i), maxX(j)) || Math.max(minY(i), minY(j)) > Math.min(maxY(i), maxY(j))) continue;
                if (Math.floor(Math.max(minX(i), minX(j)) / CELL) !== cx || Math.floor(Math.max(minY(i), minY(j)) / CELL) !== cy) continue;   // traité une seule fois
                const ax = S.ax[i], ay = S.ay[i], bx = S.bx[i], by = S.by[i], cx2 = S.ax[j], cy2 = S.ay[j], dx = S.bx[j], dy = S.by[j];
                const d = (bx - ax) * (dy - cy2) - (by - ay) * (dx - cx2); if (d === 0) continue;
                const t = ((cx2 - ax) * (dy - cy2) - (cy2 - ay) * (dx - cx2)) / d, u = ((cx2 - ax) * (by - ay) - (cy2 - ay) * (bx - ax)) / d;
                if (t > 0.0005 && t < 0.9995 && u > 0.0005 && u < 0.9995) { const X = Math.round(ax + t * (bx - ax)), Y = Math.round(ay + t * (by - ay)); addSplit(i, t, X, Y); addSplit(j, u, X, Y); }
            }
        });
        // 2) extrémités libres posées sur le milieu d'une autre route (T, ou sommet supprimé à la simplification)
        const TOL = tol || 6;
        for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) {
            const px = e ? S.bx[i] : S.ax[i], py = e ? S.by[i] : S.ay[i];
            if (deg.get(vkey(px, py)) !== 1) continue;
            let best = null, bd = TOL + 1;
            for (let cx = Math.floor((px - TOL) / CELL); cx <= Math.floor((px + TOL) / CELL); cx++) for (let cy = Math.floor((py - TOL) / CELL); cy <= Math.floor((py + TOL) / CELL); cy++) {
                const l = cells.get(ckey(cx, cy)); if (!l) continue;
                for (const o of l) {
                    if (o === i) continue;
                    const ox = S.ax[o], oy = S.ay[o], vx = S.bx[o] - ox, vy = S.by[o] - oy, L2 = vx * vx + vy * vy; if (!L2) continue;
                    let t = ((px - ox) * vx + (py - oy) * vy) / L2; t = Math.max(0, Math.min(1, t));
                    const qx = ox + t * vx, qy = oy + t * vy, dd = Math.hypot(px - qx, py - qy);
                    if (dd < bd) { bd = dd; best = { o, t, qx: Math.round(qx), qy: Math.round(qy) }; }
                }
            }
            if (best) { if (best.t > 0 && best.t < 1) addSplit(best.o, best.t, best.qx, best.qy); alias.push([px, py, best.qx, best.qy]); }
        }
        // 3) sommets et arêtes
        const ids = new Map(), vx = [], vy = [], adj = [];
        const vid = (x, y) => { const k = vkey(x, y); let id = ids.get(k); if (id === undefined) { id = vx.length; ids.set(k, id); vx.push(x); vy.push(y); adj.push([]); } return id; };
        const link = (u, v, c, oneway) => {
            if (u === v) return;
            const w = Math.hypot(vx[u] - vx[v], vy[u] - vy[v]) * mpu((vy[u] + vy[v]) / 2, Z);
            if (oneway !== -1) adj[u].push(v, w, c);
            if (oneway !== 1) adj[v].push(u, w, c);
        };
        for (let i = 0; i < n; i++) {
            const sp = splits[i]; let pts = [[0, S.ax[i], S.ay[i]]];
            if (sp) { sp.sort((p, q) => p[0] - q[0]); sp.forEach(p => pts.push(p)); }
            pts.push([1, S.bx[i], S.by[i]]);
            for (let k = 1; k < pts.length; k++) link(vid(pts[k - 1][1], pts[k - 1][2]), vid(pts[k][1], pts[k][2]), S.c[i], S.o[i]);
        }
        alias.forEach(([x1, y1, x2, y2]) => { const u = vid(x1, y1), v = vid(x2, y2); if (u !== v) { adj[u].push(v, 0, 6); adj[v].push(u, 0, 6); } });
        return { vx, vy, adj, Z, ids };
    }

    // Lecture des tuiles → segments routables + lignes nommées
    let diag = {};
    async function loadData(tiles, Z, onProgress) {
        const S = { ax: [], ay: [], bx: [], by: [], c: [], o: [], br: [] }, N = { ax: [], ay: [], bx: [], by: [], n: [], r: [], c: [] }, names = [], nameIdx = new Map();
        const nid = (s) => { let i = nameIdx.get(s); if (i === undefined) { i = names.length; names.push(s); nameIdx.set(s, i); } return i; };
        const want = new Set(['transportation', 'transportation_name', 'road', 'roads', 'road_label', 'place']);
        const PL = [];      // localités (centre + rayon d'emprise en mètres) : le mode sinueux les contourne
        const present = []; for (let i = 0; i < tiles.length; i++) { const t = tiles[i]; const buf = await rawOf(t.z, t.x, t.y); if (buf) present.push({ t, buf }); }
        seen = { layers: new Set(), classes: new Map() };
        diag.asked = tiles.length; diag.present = present.length;
        if (!present.length) return null;
        const heavy = present.length > 2500;                       // très grand couloir : on ne garde que les routes de liaison
        for (let i = 0; i < present.length; i++) {
            const { t, buf } = present[i]; let L; try { L = decodeTile(buf, want); } catch (e) { continue; }
            const ox = t.x * WE, oy = t.y * WE;
            (L.transportation || L.road || L.roads || []).forEach(f => {
                if (f.type !== 2 || !f.props) return;
                const rc = f.props.class !== undefined ? f.props.class : (f.props.kind_detail !== undefined ? f.props.kind_detail : (f.props.highway !== undefined ? f.props.highway : f.props.kind));
                seen.classes.set(String(rc), (seen.classes.get(String(rc)) || 0) + 1);
                const c = clsOf(rc); if (c < 0 || (heavy && c > 4)) return;
                if (f.props.access === 'no' || f.props.access === 'private') return;
                const ow0 = f.props.oneway === 1 || f.props.oneway === '1' || f.props.oneway === 'yes' || f.props.oneway === true ? 1 : (f.props.oneway === -1 || f.props.oneway === '-1' ? -1 : 0);
                // Sens unique implicite : une autoroute / voie express à chaussées séparées n'est jamais à double sens, et un rond-point (boucle fermée courte) non plus
                const explicitTwo = f.props.oneway === 0 || f.props.oneway === '0' || f.props.oneway === 'no';
                const implicit = !ow0 && !explicitTwo && (c === 0 || (String(f.props.class || '').toLowerCase() === 'trunk' && /_link|motorway/.test(String(f.props.subclass || ''))));
                const br = f.props.brunnel === 'bridge' || f.props.brunnel === 'tunnel' ? 1 : 0;
                f.paths.forEach(p => { let ow = ow0 || (implicit ? 1 : 0);
                    if (!ow && !explicitTwo && c >= 2 && p.length >= 8 && p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) { let per = 0; for (let k = 2; k < p.length; k += 2) per += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]); if (per * mpu(p[1] + oy, Z) < 260) ow = 1; }
                    for (let k = 2; k < p.length; k += 2) { const ax = Math.round(p[k - 2] + ox), ay = Math.round(p[k - 1] + oy), bx = Math.round(p[k] + ox), by = Math.round(p[k + 1] + oy); if (ax === bx && ay === by) continue; S.ax.push(ax); S.ay.push(ay); S.bx.push(bx); S.by.push(by); S.c.push(c); S.o.push(ow); S.br.push(br); } });
            });
            (L.place || []).forEach(f => {
                if (f.type !== 1 || !f.props || !f.paths || !f.paths[0]) return;
                const cl = String(f.props.class || f.props.kind || '').toLowerCase(), R = { city: 1600, town: 1000, village: 550, suburb: 450, quarter: 350, hamlet: 220 }[cl]; if (!R) return;
                PL.push([f.paths[0][0] + ox, f.paths[0][1] + oy, R]);
            });
            (L.transportation_name || L.road_label || []).forEach(f => {
                if (f.type !== 2 || !f.props || !(f.props.name || f.props.ref)) return;
                const nm = nid(String(f.props.name || '')), rf = nid(String(f.props.ref || ''));
                f.paths.forEach(p => { for (let k = 2; k < p.length; k += 2) { N.ax.push(Math.round(p[k - 2] + ox)); N.ay.push(Math.round(p[k - 1] + oy)); N.bx.push(Math.round(p[k] + ox)); N.by.push(Math.round(p[k + 1] + oy)); N.n.push(nm); N.r.push(rf); N.c.push(clsOf(f.props.class)); } });
            });
            if (i % 25 === 24) { if (onProgress) onProgress(Math.round((i + 1) / present.length * 70)); await tick(); }
        }
        diag.segs = S.ax.length; diag.named = N.ax.length; diag.layers = [...seen.layers].join(','); diag.classes = [...seen.classes].map(([k, v]) => k + ':' + v).join(',');
        if (!S.ax.length) return null;
        if (onProgress) onProgress(75); await tick();
        const fin = (tol) => {
        const G = buildGraph(S, Z, tol); G.names = names; G.N = N; G.tiles = present.length; G.S = S;
        // intensité « zone habitée » (0…1) de chaque sommet : plus on s'approche du centre d'une localité, plus elle monte
        G.urb = null;
        if (PL.length) {
            const urb = new Float32Array(G.vx.length), pg = new Map(), PC = 2048; let any = false;
            PL.forEach((q, i) => { const m = mpu(q[1], Z), r = q[2] / m; for (let cx = Math.floor((q[0] - r) / PC); cx <= Math.floor((q[0] + r) / PC); cx++) for (let cy = Math.floor((q[1] - r) / PC); cy <= Math.floor((q[1] + r) / PC); cy++) { const k = ckey(cx, cy); let l = pg.get(k); if (!l) pg.set(k, l = []); l.push(i); } });
            for (let v = 0; v < G.vx.length; v++) {
                const l = pg.get(ckey(Math.floor(G.vx[v] / PC), Math.floor(G.vy[v] / PC))); if (!l) continue;
                for (const i of l) { const q = PL[i], m = mpu(q[1], Z), d = Math.hypot(G.vx[v] - q[0], G.vy[v] - q[1]) * m; if (d < q[2]) { const u = 1 - d / q[2]; if (u > urb[v]) { urb[v] = u; any = true; } } }
            }
            if (any) G.urb = urb;
        }
        // grille des lignes nommées
        const ng = new Map(); for (let i = 0; i < N.ax.length; i++) { const x0 = Math.floor(Math.min(N.ax[i], N.bx[i]) / CELL), x1 = Math.floor(Math.max(N.ax[i], N.bx[i]) / CELL), y0 = Math.floor(Math.min(N.ay[i], N.by[i]) / CELL), y1 = Math.floor(Math.max(N.ay[i], N.by[i]) / CELL); for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const k = ckey(cx, cy); let l = ng.get(k); if (!l) ng.set(k, l = []); l.push(i); } }
        G.ng = ng;
        // arêtes pour l'accrochage des points de départ / d'arrivée
        const eg = new Map(), eu = [], ev = [], ec = [], ef = [], EC = 512;
        for (let u = 0; u < G.adj.length; u++) { const a = G.adj[u]; for (let k = 0; k < a.length; k += 3) { const v = a[k]; if (v < u && G.adj[v].some((_, q) => q % 3 === 0 && G.adj[v][q] === u)) continue; const idx = eu.length; eu.push(u); ev.push(v); ec.push(a[k + 2]); ef.push(1 | (G.adj[v].some((_, q) => q % 3 === 0 && G.adj[v][q] === u) ? 2 : 0)); const x0 = Math.floor(Math.min(G.vx[u], G.vx[v]) / EC), x1 = Math.floor(Math.max(G.vx[u], G.vx[v]) / EC), y0 = Math.floor(Math.min(G.vy[u], G.vy[v]) / EC), y1 = Math.floor(Math.max(G.vy[u], G.vy[v]) / EC); for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) { const kk = ckey(cx, cy); let l = eg.get(kk); if (!l) eg.set(kk, l = []); l.push(idx); } } }
        G.eg = eg; G.eu = eu; G.ev = ev; G.ec = ec; G.ef = ef; G.EC = EC;
            G.rebuild = (t) => fin(t);
            return G;
        };
        return fin();
    }

    // Point de la route le plus proche (≤ maxM mètres)
    function snap(G, lon, lat, maxM, hd) {
        const px = lonToX(lon, G.Z), py = latToY(lat, G.Z), m = mpu(py, G.Z), maxU = maxM / m, EC = G.EC, cx0 = Math.floor(px / EC), cy0 = Math.floor(py / EC), R = Math.ceil(maxU / EC);
        let best = null;
        for (let r = 0; r <= R; r++) {
            for (let cx = cx0 - r; cx <= cx0 + r; cx++) for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
                if (Math.max(Math.abs(cx - cx0), Math.abs(cy - cy0)) !== r) continue;
                const l = G.eg.get(ckey(cx, cy)); if (!l) continue;
                for (const e of l) {
                    const u = G.eu[e], v = G.ev[e], ax = G.vx[u], ay = G.vy[u], dx = G.vx[v] - ax, dy = G.vy[v] - ay, L2 = dx * dx + dy * dy;
                    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
                    const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(px - qx, py - qy);
                    let sc = d;
                    if (hd != null && isFinite(hd) && L2) {          // cap connu : une rue qu'on ne peut prendre que dans l'autre sens (ou l'autre chaussée) est pénalisée
                        const fw = (G.ef[e] & 1) !== 0, bw = (G.ef[e] & 2) !== 0;
                        if (!(fw && bw)) { const eb = bearingXY(dx, dy), diff = Math.abs(angDiff(hd, fw ? eb : (eb + 180) % 360)); if (diff > 100) sc += 60 / m; }
                    }
                    if (!best || sc < best.sc) best = { e, u, v, t, qx, qy, d, sc };
                }
            }
            if (best && best.sc <= (r + 1) * EC) break;      // aucun plus proche possible dans les anneaux suivants
        }
        if (!best || best.d * m > maxM) return null;
        best.dM = best.d * m; return best;
    }

    // A* (tas binaire)
    function astar(G, src, dst, mode, tmpAdj) {
        const fluid = mode === 'sinueux', URB_K = 2.2, JCT = 7;      // sinueux : zones habitées ×(1 à 3,2) et ~7 s par carrefour (moins d'arrêts)
        const nV = G.vx.length, table = COST[mode] || COST.rapide, vmax = Math.max(...table);
        const g = new Float64Array(nV).fill(Infinity), prev = new Int32Array(nV).fill(-1), pc = new Int8Array(nV), closed = new Uint8Array(nV);
        const dxT = G.vx[dst], dyT = G.vy[dst];
        const h = (v) => Math.hypot(G.vx[v] - dxT, G.vy[v] - dyT) * mpu(G.vy[v], G.Z) / vmax;
        const heap = [], push = (v, f) => { heap.push([f, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
        const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
        g[src] = 0; push(src, h(src));
        let guard = 0;
        while (heap.length) {
            const [, u] = pop(); if (closed[u]) continue; closed[u] = 1;
            if (u === dst) break;
            const a = G.adj[u];
            for (let k = 0; k < a.length; k += 3) {
                const v = a[k], w = a[k + 1], c = a[k + 2]; if (closed[v]) continue;
                let cost = w === 0 ? 0 : w / table[c];
                if (fluid && w > 0) { const U = G.urb; if (U && (u < U.length || v < U.length)) { const k = Math.max(u < U.length ? U[u] : 0, v < U.length ? U[v] : 0); if (k > 0) cost *= 1 + URB_K * k; } if (u !== src && a.length >= 9) cost += JCT; }
                const ng = g[u] + cost;
                if (ng < g[v]) { g[v] = ng; prev[v] = u; pc[v] = c; push(v, ng + h(v)); }
            }
            if (++guard > 6e6) break;
        }
        if (g[dst] === Infinity) return null;
        const path = [], cls = []; for (let v = dst; v !== -1; v = prev[v]) { path.push(v); if (prev[v] !== -1) cls.push(pc[v]); }
        path.reverse(); cls.reverse(); return { path, cls };
    }

    function nameAt(G, x, y) {
        const N = G.N, cx0 = Math.floor(x / CELL), cy0 = Math.floor(y / CELL); let best = -1, bd = 30;
        for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) {
            const l = G.ng.get(ckey(cx, cy)); if (!l) continue;
            for (const i of l) {
                const ax = N.ax[i], ay = N.ay[i], dx = N.bx[i] - ax, dy = N.by[i] - ay, L2 = dx * dx + dy * dy;
                let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
                const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy)); if (d < bd) { bd = d; best = i; }
            }
        }
        return best < 0 ? { name: '', ref: '' } : { name: G.names[N.n[best]], ref: G.names[N.r[best]] };
    }

    // ====================================================================
    //  Manœuvres
    // ====================================================================
    // pts : [{x,y}] en unités monde ; hop[i] = {len (m), cls, name, ref} entre pts[i] et pts[i+1] ; deg(i) = nombre de voies au sommet i (0 = inconnu)
    function makeSteps(pts, hops, Z, deg, minAngle) {
        const n = pts.length, steps = [], cum = [0];
        for (let i = 0; i < n - 1; i++) cum.push(cum[i] + hops[i].len);
        const ll = (i) => [xToLon(pts[i].x, Z), yToLat(pts[i].y, Z)];
        const dirAt = (i, fwd) => {                                      // direction moyenne sur ~25 m avant ou après le sommet i
            let j = i, d = 0; const lim = 25;
            while (d < lim && (fwd ? j < n - 1 : j > 0)) { d += hops[fwd ? j : j - 1].len; j += fwd ? 1 : -1; }
            const dx = fwd ? pts[j].x - pts[i].x : pts[i].x - pts[j].x, dy = fwd ? pts[j].y - pts[i].y : pts[i].y - pts[j].y; return (dx || dy) ? bearingXY(dx, dy) : null;
        };
        const modOf = (a) => { const s = Math.abs(a); const side = a > 0 ? 'right' : 'left'; return s < 20 ? 'straight' : (s < 60 ? 'slight ' + side : (s < 125 ? side : (s < 165 ? 'sharp ' + side : 'uturn'))); };
        const mk = (type, i, mod, b0, b1) => ({ maneuver: { type, modifier: mod, location: ll(i), bearing_before: b0, bearing_after: b1 }, name: '', ref: '', distance: 0, duration: 0, _i: i });
        const first = mk('depart', 0, undefined, 0, dirAt(0, true) || 0); steps.push(first);
        let lastI = 0;
        for (let i = 1; i < n - 1; i++) {
            if (cum[i] - cum[lastI] < 12) continue;
            const b0 = dirAt(i, false), b1 = dirAt(i, true); if (b0 === null || b1 === null) continue;
            const ang = angDiff(b0, b1), a = Math.abs(ang);
            const nameChanged = hops[i - 1].name !== hops[i].name || hops[i - 1].ref !== hops[i].ref;
            const junction = deg ? deg(i) >= 3 : true;
            const ok = deg ? ((a >= minAngle && (junction || nameChanged)) || (nameChanged && a >= 18 && !!hops[i].name && !!hops[i - 1].name)) : a >= minAngle;
            if (!ok) continue;
            steps.push(mk('turn', i, modOf(ang), b0, b1)); lastI = i;
        }
        steps.push(mk('arrive', n - 1, undefined, dirAt(n - 1, false) || 0, 0));
        for (let s = 0; s < steps.length; s++) {
            const a = steps[s]._i, b = s + 1 < steps.length ? steps[s + 1]._i : a; steps[s].distance = cum[b] - cum[a];
            let dur = 0; for (let k = a; k < b; k++) dur += hops[k].len / REAL[Math.max(0, Math.min(7, hops[k].cls))];
            steps[s].duration = dur;
            const h = hops[Math.min(a, n - 2)]; if (s < steps.length - 1) { steps[s].name = h.name; steps[s].ref = h.ref; }
            delete steps[s]._i;
        }
        return steps;
    }

    // ====================================================================
    //  API : itinéraire
    // ====================================================================
    function geoZooms() { return OfflineMaps.zones().then(zs => [...new Set(zs.map(z => z.geoZ).filter(Boolean))].sort((a, b) => b - a)); }
    function available() { return typeof OfflineMaps !== 'undefined' && OfflineMaps.hasZones() && !!OfflineMaps.tileInfo(); }
    const ready = async (full) => { if (typeof OfflineMaps !== 'undefined' && OfflineMaps.upgradeLegacy) { try { await OfflineMaps.upgradeLegacy(full); } catch (e) {} } return available(); };

    // Graphe routier gardé en mémoire : un recalcul (écart d'itinéraire, nouvelle étape) dans la même zone ne relit ni ne décode plus les tuiles
    let gmemo = null;
    async function route(points, mode, onProgress, opts) {
        try { return await routeInner(points, mode, onProgress, opts); } catch (e) { gmemo = null; throw e; }
    }
    async function routeInner(points, mode, onProgress, opts) {
        if (!(await ready())) throw new Error('Aucune carte hors ligne téléchargée');
        if (!points || points.length < 2) throw new Error('Il faut un départ et une arrivée');
        diag = { points: points.map(p => p.map(v => +v.toFixed(4)).join(',')).join(' > '), mode };
        const zs = await geoZooms(); let G = null, Zused = 14; diag.geoZ = zs.join('/'); diag.tpl = (OfflineMaps.tileInfo() || {}).tpl;
        for (const Z of (zs.length ? zs : [14])) {
            let widthKm = 3; for (let i = 1; i < points.length; i++) widthKm = Math.max(widthKm, Math.min(25, hav(points[i - 1], points[i]) / 1000 * 0.3));
            const tiles = corridorTiles(points, Z, widthKm), tk = (t) => t.x + ',' + t.y;
            if (gmemo && gmemo.Z === Z && Date.now() - gmemo.t < 15 * 60e3 && tiles.every(t => gmemo.set.has(tk(t)))) { G = gmemo.G; gmemo.t = Date.now(); diag.memo = 1; }
            else {
                gmemo = null; const wide = corridorTiles(points, Z, widthKm + 1.5);      // marge : les recalculs proches retombent dans le graphe déjà construit
                G = await loadData(wide, Z, onProgress);
                if (G && G.tiles <= 2500) gmemo = { Z, set: new Set(wide.map(tk)), G, t: Date.now() };
            }
            Zused = Z; if (G) break;
        }
        if (!G) throw new Error((diag.present > 0 ? 'Cartes lues mais aucune route reconnue (couches : ' + (diag.layers || '?') + ' ; classes : ' + (diag.classes || '?') + '). ' : (diag.asked ? 'Tuiles introuvables (' + diag.asked + ' demandées, 0 en mémoire) ; zoom ' + (zs.join('/') || '14') + '. ' : '')) + (zs.length ? 'Pas de carte téléchargée ici : télécharge d\'abord la zone ou l\'itinéraire' : 'Tes cartes sont en qualité « Économe » (sans petites routes) : retélécharge-les en « Détaillé » pour calculer un itinéraire'));
        const coords = [], hopsAll = [], ptsAll = [], degs = [];
        let dist = 0, dur = 0;
        const distinctDeg = (v) => { const a = G.adj[v], s = new Set(); for (let k = 0; k < a.length; k += 3) if (a[k + 1] > 0) s.add(a[k]); return s.size; };
        for (let leg = 1; leg < points.length; leg++) {
            const hd0 = leg === 1 && opts && opts.heading != null && isFinite(opts.heading) ? +opts.heading : null;
            const A = snap(G, points[leg - 1][0], points[leg - 1][1], 2500, hd0), B = snap(G, points[leg][0], points[leg][1], 2500);
            diag.snapA = A ? Math.round(A.dM) : null; diag.snapB = B ? Math.round(B.dM) : null; diag.verts = G.vx.length;
            if (!A) throw new Error(leg === 1 ? 'Le départ est hors de la zone téléchargée' : 'Une étape est hors de la zone téléchargée');
            if (!B) throw new Error(leg === points.length - 1 ? 'L\'arrivée est hors de la zone téléchargée' : 'Une étape est hors de la zone téléchargée');
            // sommets temporaires (départ / arrivée posés sur la route)
            const nV0 = G.vx.length, S = nV0, T = nV0 + 1, added = [];
            const addV = (q) => { G.vx.push(q.qx); G.vy.push(q.qy); G.adj.push([]); };
            addV(A); addV(B);
            const edge = (a, b, c) => { const w = Math.hypot(G.vx[a] - G.vx[b], G.vy[a] - G.vy[b]) * mpu(G.vy[a], G.Z); G.adj[a].push(b, w, c); added.push(a); };
            const cA = G.ec[A.e], cB = G.ec[B.e];
            // Le départ et l'arrivée respectent le sens de la rue où ils sont posés (sens unique, chaussée de la 4 voies)
            const fA = G.ef[A.e], fB = G.ef[B.e];
            const wayOut = (q, f, strict) => { const o = []; if (!strict || (f & 1)) o.push(q.v); if (!strict || (f & 2)) o.push(q.u); return o; };
            const wayIn = (q, f) => { const o = []; if (f & 1) o.push(q.u); if (f & 2) o.push(q.v); return o; };
            // cap connu et vitesse réelle : on ne repart pas en arrière sur une rue à double sens (sauf si rien d'autre n'est possible)
            const ahead = (q, x) => { if (hd0 === null) return true; const dx = G.vx[x] - q.qx, dy = G.vy[x] - q.qy; if (!dx && !dy) return true; return Math.abs(angDiff(hd0, bearingXY(dx, dy))) <= 100; };
            const mk = (relax) => {
                wayOut(A, fA, true).filter(x => relax || ahead(A, x)).forEach(x => edge(S, x, cA));
                wayIn(B, fB).forEach(x => edge(x, T, cB));
                if (A.e === B.e) { if ((fA & 1) && A.t <= B.t) edge(S, T, cA); if ((fA & 2) && A.t >= B.t) edge(S, T, cA); }
            };
            let res = null;
            mk(false); res = astar(G, S, T, mode);
            if (!res && hd0 !== null) { added.slice().reverse().forEach(a => G.adj[a].length -= 3); added.length = 0; mk(true); res = astar(G, S, T, mode); }
            if (!res) {      // dernier recours (données de sens douteuses) : on rétablit le double sens autour du départ / de l'arrivée plutôt que d'échouer
                added.slice().reverse().forEach(a => G.adj[a].length -= 3); added.length = 0;
                [[S, A, cA], [T, B, cB]].forEach(([tv, q, c]) => { [q.u, q.v].forEach(x => { edge(tv, x, c); edge(x, tv, c); }); });
                if (A.e === B.e) { edge(S, T, cA); edge(T, S, cA); }
                res = astar(G, S, T, mode); diag.relaxedEnds = 1;
            }
            // nettoyage des arêtes temporaires
            added.slice().reverse().forEach(a => G.adj[a].length -= 3); G.vx.length = nV0 + 2; // les sommets temporaires restent jusqu'à la fin du tracé (coordonnées lues ci-dessous)
            if (!res) {
                G.vx.length = nV0; G.vy.length = nV0; G.adj.length = nV0;
                // Raccords de tuiles imparfaits : on relance une fois avec une tolérance de raccord plus large
                if (!G.relaxed && G.rebuild) { const G2 = G.rebuild(60); G2.relaxed = true; if (gmemo && gmemo.G === G) gmemo.G = G2; G = G2; leg--; continue; }
                throw new Error('Aucun passage trouvé entre ces points dans les cartes téléchargées (zone incomplète ? télécharge l\'itinéraire entier)');
            }
            const P = res.path.map(v => ({ x: G.vx[v], y: G.vy[v], v })), hops = [];
            for (let i = 0; i < P.length - 1; i++) {
                const len = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y) * mpu((P[i].y + P[i + 1].y) / 2, G.Z), nm = nameAt(G, (P[i].x + P[i + 1].x) / 2, (P[i].y + P[i + 1].y) / 2);
                hops.push({ len, cls: res.cls[i] === undefined ? 5 : res.cls[i], name: nm.name, ref: nm.ref });
            }
            // fusion des tronçons de longueur nulle (raccords)
            const P2 = [P[0]], H2 = [];
            for (let i = 0; i < hops.length; i++) { if (hops[i].len < 0.05 && i < hops.length - 1) continue; H2.push(hops[i]); P2.push(P[i + 1]); }
            const dg = P2.map(p => (p.v >= nV0 ? 0 : distinctDeg(p.v)));
            if (leg > 1) { P2.shift(); }
            P2.forEach(p => coords.push([xToLon(p.x, G.Z), yToLat(p.y, G.Z)]));
            H2.forEach(h => { dist += h.len; dur += h.len / REAL[Math.max(0, Math.min(7, h.cls))]; });
            // trajets « hors route » départ / arrivée (point cliqué → route)
            const off = (wp, q) => q.dM;
            dist += off(points[leg - 1], A) * (leg === 1 ? 1 : 0) + off(points[leg], B) * (leg === points.length - 1 ? 1 : 0);
            if (leg === 1) { ptsAll.push(...P2.map((p, i) => ({ x: p.x, y: p.y }))); degs.push(...dg); } else { ptsAll.push(...P2.map(p => ({ x: p.x, y: p.y }))); degs.push(...dg.slice(1)); }
            hopsAll.push(...H2);
            G.vx.length = nV0; G.vy.length = nV0; G.adj.length = nV0;
        }
        const startLL = points[0], endLL = points[points.length - 1];
        if (hav(startLL, coords[0]) > 8) coords.unshift([startLL[0], startLL[1]]);
        if (hav(endLL, coords[coords.length - 1]) > 8) coords.push([endLL[0], endLL[1]]);
        const steps = makeSteps(ptsAll, hopsAll, G.Z, (i) => degs[i] || 0, 28);
        return { geometry: { type: 'LineString', coordinates: coords }, distance: dist, duration: dur, steps, tiles: G.tiles, Z: Zused };
    }

    // Manœuvres d'un tracé existant (importé, enregistré…), sans réseau
    async function stepsFromGeometry(coords) {
        if (!coords || coords.length < 2) return [];
        const Z = 14, pts = [], hops = [];
        // sur-échantillonnage léger pour que les virages soient mesurés sur des distances réelles
        coords.forEach(c => pts.push({ x: lonToX(c[0], Z), y: latToY(c[1], Z) }));
        for (let i = 0; i < pts.length - 1; i++) hops.push({ len: hav(coords[i], coords[i + 1]), cls: 4, name: '', ref: '' });
        let G = null;
        try {
            if (available()) {
                const zs = await geoZooms(), tiles = corridorTiles(coords.filter((_, i) => i % Math.max(1, Math.floor(coords.length / 200)) === 0), zs[0] || 14, 0.1);
                if (tiles.length < 3000) G = await loadData(tiles, zs[0] || 14);
            }
        } catch (e) {}
        if (G) { const Zg = G.Z; for (let i = 0; i < pts.length; i++) { pts[i] = { x: lonToX(coords[i][0], Zg), y: latToY(coords[i][1], Zg) }; } for (let i = 0; i < hops.length; i++) { const nm = nameAt(G, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2); hops[i].name = nm.name; hops[i].ref = nm.ref; } return makeSteps(pts, hops, Zg, null, 35).map(s => s); }
        return makeSteps(pts, hops, Z, null, 35);
    }

    // ====================================================================
    //  Recherche hors ligne (index construit au téléchargement)
    // ====================================================================
    const GEO_PREFIX = '/__geo__/';
    const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const PLACE_FR = { city: 'Ville', town: 'Ville', village: 'Village', hamlet: 'Hameau', suburb: 'Quartier', neighbourhood: 'Quartier', quarter: 'Quartier', isolated_dwelling: 'Lieu-dit' };
    let cache = null;
    function reset() { cache = null; gmemo = null; }
    async function indexZone(zoneId, tiles) {
        gmemo = null;
        const want = new Set(['place', 'poi', 'transportation_name']), rows = [], seen = new Set();
        for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i], buf = await rawOf(t.z, t.x, t.y); if (!buf) continue;
            let L; try { L = decodeTile(buf, want); } catch (e) { continue; }
            const ox = t.x * WE, oy = t.y * WE, ll = (px, py) => [+xToLon(px + ox, t.z).toFixed(5), +yToLat(py + oy, t.z).toFixed(5)];
            const add = (k, name, cl, c, cellDeg) => { name = String(name || '').trim(); if (!name) return; const key = k + '|' + norm(name) + '|' + Math.round(c[0] / cellDeg) + ',' + Math.round(c[1] / cellDeg); if (seen.has(key)) return; seen.add(key); rows.push([name, k, cl || '', c[0], c[1]]); };
            (L.place || []).forEach(f => { if (f.type === 1 && f.props && f.props.name && f.paths[0]) add('p', f.props.name, f.props.class, ll(f.paths[0][0], f.paths[0][1]), 0.01); });
            (L.poi || []).forEach(f => { if (f.type === 1 && f.props && f.props.name && f.paths[0]) add('i', f.props.name, f.props.class, ll(f.paths[0][0], f.paths[0][1]), 0.005); });
            (L.transportation_name || []).forEach(f => { if (f.type === 2 && f.props && f.props.name && f.paths[0]) { const p = f.paths[0], m = Math.max(0, (Math.floor(p.length / 4) * 2)); add('s', f.props.name, f.props.class, ll(p[m], p[m + 1]), 0.02); } });
            if (i % 40 === 39) await tick();
        }
        await OfflineMaps._dbPut(GEO_PREFIX + zoneId, { kind: 'geo', rows });
        reset();
    }
    async function dropZone(zoneId) { const d = await OfflineMaps._tx('res', 'readwrite', s => s.delete(GEO_PREFIX + zoneId)); reset(); return d; }
    async function load() {
        if (cache) return cache;
        let recs = []; try { recs = await OfflineMaps._tx('res', 'readonly', s => s.getAll(IDBKeyRange.bound(GEO_PREFIX, GEO_PREFIX + '￿'))) || []; } catch (e) {}
        const all = [], seen = new Set();
        recs.forEach(r => (r.rows || []).forEach(x => { const k = x[1] + '|' + x[0] + '|' + x[3] + '|' + x[4]; if (seen.has(k)) return; seen.add(k); all.push({ t: x[0], k: x[1], cl: x[2], c: [x[3], x[4]], n: norm(x[0]) }); }));
        return (cache = { all, places: all.filter(e => e.k === 'p') });
    }
    async function search(q, ref, limit = 10) {
        const idx = await load(); if (!idx.all.length) return [];
        const toks = norm(q).split(' ').filter(t => t && !/^\d+$/.test(t)); if (!toks.length) return [];
        const full = toks.join(' '), out = [];
        for (const e of idx.all) {
            let sc = 0;
            if (e.n === full) sc = 100; else if (e.n.startsWith(full)) sc = 85;
            else if (toks.every(t => e.n.split(' ').some(w => w.startsWith(t)))) sc = 65;
            else if (toks.every(t => t.length >= 3 && e.n.includes(t))) sc = 40;
            if (!sc) continue;
            if (e.k === 'p') sc += (e.cl === 'city' || e.cl === 'town') ? 8 : 4;
            const d = ref ? hav(ref, e.c) / 1000 : 0; out.push({ e, sc, d });
        }
        out.sort((a, b) => b.sc - a.sc || a.d - b.d);
        const top = [], seen = new Set();
        for (const o of out) { const k = o.e.k + o.e.n + Math.round(o.e.c[0] * 20) + Math.round(o.e.c[1] * 20); if (seen.has(k)) continue; seen.add(k); top.push(o); if (top.length >= limit * 3) break; }
        // à score égal, le plus proche d'abord ; on garde un mélange rues / lieux
        top.sort((a, b) => (b.sc - a.sc) || (a.d - b.d));
        const shown = new Set();
        return top.map(({ e }) => {
            let near = null, bd = 25; if (e.k !== 'p') idx.places.forEach(p => { if (p === e) return; const d = hav(p.c, e.c) / 1000; if (d < bd) { bd = d; near = p; } });
            const kind = e.k === 'p' ? 'pin' : (e.k === 'i' ? 'place' : 'pin');
            const lab = e.k === 'p' ? (PLACE_FR[e.cl] || 'Lieu') : (e.k === 's' ? 'Rue' : (e.cl ? String(e.cl).replace(/_/g, ' ') : 'Lieu'));
            return { kind, main: e.t, ctx: [lab, near ? near.t : '', 'hors ligne'].filter(Boolean).join(' · '), value: e.t + (near && e.k !== 'p' ? ', ' + near.t : ''), coords: e.c, src: 'offline' };
        }).filter(r => { const k = r.main + '|' + r.ctx; if (shown.has(k)) return false; shown.add(k); return true; }).slice(0, limit);
    }

    // Routes lisibles par le mode Expert : lignes continues (tags « highway ») extraites des tuiles hors ligne, sans aucun réseau.
    //   OfflineGeo.roads(ligne[[lng,lat]…], rayonM) → { elements:[{type:'way',nodes,geometry,tags}] } | null (zone non téléchargée)
    async function roads(line, radiusM) {
        if (!(await ready())) return null;
        const zs = await geoZooms(), widthKm = Math.max(1.5, Math.min(12, (radiusM || 3000) / 1000));
        let G = null;
        for (const Z of (zs.length ? zs : [14])) {
            const tiles = corridorTiles(line, Z, widthKm); if (tiles.length > 2500) continue;
            G = await loadData(tiles, Z); if (G) break;
        }
        if (!G) return null;
        const n = G.adj.length, nb = new Array(n), HW = { 2: 'primary', 3: 'secondary', 4: 'tertiary', 5: 'unclassified' };
        for (let u = 0; u < n; u++) { const m = new Map(), a = G.adj[u]; for (let k = 0; k < a.length; k += 3) if (a[k] !== u) m.set(a[k], a[k + 2] + (a[k + 1] === 0 ? 100 : 0)); nb[u] = m; }
        const tag = (c) => c >= 100 ? 'unclassified' : HW[c];
        const done = new Set(), key = (u, v) => (u < v ? u * n + v : v * n + u), out = [];
        const emit = (nodes, c, oneway) => {
            const tags = { highway: tag(c) }; if (oneway) tags.oneway = 'yes';
            out.push({ type: 'way', nodes, tags, geometry: nodes.map(v => ({ lon: xToLon(G.vx[v], G.Z), lat: yToLat(G.vy[v], G.Z) })) });
        };
        const walk = (u0) => nb[u0].forEach((c, v0) => {
            if (!tag(c) || done.has(key(u0, v0))) return;
            const two = nb[v0].has(u0); done.add(key(u0, v0));
            const nodes = [u0, v0];
            if (two) { let prev = u0, cur = v0; while (nb[cur].size === 2) { let nx = -1; nb[cur].forEach((cc, w) => { if (w !== prev) nx = w; }); if (nx < 0 || nb[cur].get(nx) !== c || !nb[nx].has(cur) || done.has(key(cur, nx))) break; done.add(key(cur, nx)); nodes.push(nx); prev = cur; cur = nx; } }
            emit(nodes, c, !two);
        });
        for (let u = 0; u < n; u++) if (nb[u].size !== 2) walk(u);
        for (let u = 0; u < n; u++) walk(u);
        return { elements: out, offline: true };
    }

    return { roads, available, ready, diagnostic: () => JSON.stringify(diag), route, stepsFromGeometry, search, indexZone, dropZone, reset, _decodeTile: decodeTile, _buildGraph: buildGraph, _norm: norm };
})();
