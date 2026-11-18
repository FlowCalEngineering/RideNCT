// BRouter pour moto : les profils « fastbike » / « moped » sont des profils vélo/cyclo. Ils peuvent donc
// emprunter un sens interdit (contresens autorisé aux vélos), une piste cyclable, un chemin ou un escalier.
// On lit les « messages » de la réponse (une ligne par tronçon : étiquettes OSM) pour repérer ces tronçons,
// puis on redemande l'itinéraire en interdisant (« nogos ») uniquement ces tronçons. Sans information, rien ne change.
(() => {
    const FWD = /(?:^|\s)oneway=(?:yes|true|1)(?:\s|$)/, REV = /(?:^|\s)oneway=(?:-1|reverse)(?:\s|$)/, RVS = /(?:^|\s)reversedirection=yes(?:\s|$)/;
    const NOMOTO = /(?:^|\s)highway=(?:cycleway|footway|path|pedestrian|steps|bridleway|corridor)(?:\s|$)/;
    const MAX_NOGOS = 12, PASSES = 2, FLUID_PASSES = 2, MAX_FLUID = 18;

    const BR = {
        // Tronçons interdits à une moto : [{ lon, lat, r, why }] (r = rayon d'interdiction en mètres)
        scan(feature) {
            const out = [];
            try {
                const m = feature && feature.properties && feature.properties.messages; if (!Array.isArray(m) || m.length < 2) return out;
                const h = m[0], iLo = h.indexOf('Longitude'), iLa = h.indexOf('Latitude'), iD = h.indexOf('Distance'), iT = h.indexOf('WayTags');
                if (iLo < 0 || iLa < 0 || iT < 0) return out;
                const g0 = feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0];
                for (let i = 1; i < m.length; i++) {
                    const tags = String(m[i][iT] || ''); if (!tags) continue;
                    const wrong = (FWD.test(tags) && RVS.test(tags)) || (REV.test(tags) && !RVS.test(tags));
                    const bad = NOMOTO.test(tags);
                    if (!wrong && !bad) continue;
                    // une ligne = tronçon qui se termine au point indiqué ; il commence au point de la ligne précédente
                    const pv = i > 1 ? [+m[i - 1][iLo] / 1e6, +m[i - 1][iLa] / 1e6] : g0; if (!pv) continue;
                    const x1 = pv[0], y1 = pv[1], x2 = +m[i][iLo] / 1e6, y2 = +m[i][iLa] / 1e6;
                    if (![x1, y1, x2, y2].every(isFinite)) continue;
                    const len = iD >= 0 ? (parseFloat(m[i][iD]) || 0) : 0;
                    out.push({ lon: (x1 + x2) / 2, lat: (y1 + y2) / 2, r: Math.round(Math.max(12, Math.min(30, len * 0.4 || 20))), why: wrong ? 'sens interdit' : 'piste / chemin' });
                }
            } catch (e) { }
            return out;
        },
        // Sinueux fluide : villages / zones à 50 km/h, feux, stops et passages à niveau repérés dans les « messages »
        // → [{ lon, lat, r, kind: 'urb' | 'stop', m }] (m = longueur concernée en mètres). Les 1,2 premiers / derniers km (départ, arrivée) sont épargnés.
        scanFluid(feature) {
            const out = [], st = { stops: 0, urbM: 0 };
            try {
                const m = feature && feature.properties && feature.properties.messages; if (!Array.isArray(m) || m.length < 2) return { out, ...st };
                const h = m[0], iLo = h.indexOf('Longitude'), iLa = h.indexOf('Latitude'), iD = h.indexOf('Distance'), iT = h.indexOf('WayTags'), iN = h.indexOf('NodeTags');
                if (iLo < 0 || iLa < 0 || iD < 0) return { out, ...st };
                let tot = 0; for (let i = 1; i < m.length; i++) tot += parseFloat(m[i][iD]) || 0;
                const SAFE = Math.min(1200, tot * 0.15), STOP = /(?:^|\s)(?:highway=(?:traffic_signals|stop|crossing)|railway=level_crossing)(?:\s|$)/;
                const URB = /(?:^|\s)(?:highway=(?:residential|living_street)|maxspeed=(?:[1-4]0|50)|zone:maxspeed=\S+:(?:30|50))(?:\s|$)/;
                let cum = 0, run = null;
                const flush = () => { if (run && run.m >= 250) { st.urbM += run.m; out.push({ lon: (run.x1 + run.x2) / 2, lat: (run.y1 + run.y2) / 2, r: Math.round(Math.max(25, Math.min(70, run.m * 0.25))), kind: 'urb', m: run.m }); } run = null; };
                for (let i = 1; i < m.length; i++) {
                    const d = parseFloat(m[i][iD]) || 0, x = +m[i][iLo] / 1e6, y = +m[i][iLa] / 1e6, a = cum, b = cum + d; cum = b;
                    if (!isFinite(x) || !isFinite(y)) continue;
                    const inside = a >= SAFE && b <= tot - SAFE;
                    if (inside && iN >= 0 && STOP.test(String(m[i][iN] || ''))) { st.stops++; out.push({ lon: x, lat: y, r: 18, kind: 'stop', m: 0 }); }
                    const urb = inside && iT >= 0 && URB.test(String(m[i][iT] || ''));
                    if (urb) { if (!run) run = { m: 0, x1: x, y1: y }; run.m += d; run.x2 = x; run.y2 = y; } else flush();
                }
                flush();
            } catch (e) { }
            return { out, ...st };
        },
        // Requête BRouter ; renvoie un objet de type Response ({ ok, json() }). `lonlats` : « lon,lat|lon,lat ».
        async fetch(lonlats, profile, signal, opts) {
            const base = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&format=geojson`;
            const base0 = base; let r = await fetch(base, signal ? { signal } : undefined);
            if (!r.ok) return r;
            let data; try { data = await r.json(); } catch (e) { return r; }
            let f = data && data.features && data.features[0], bad = BR.scan(f), nogos = [];
            for (let p = 0; p < PASSES && bad.length && nogos.length < MAX_NOGOS; p++) {
                nogos = nogos.concat(bad.slice(0, MAX_NOGOS - nogos.length));
                let r2; try { r2 = await fetch(base + '&nogos=' + nogos.map(n => `${n.lon.toFixed(6)},${n.lat.toFixed(6)},${n.r}`).join('|'), signal ? { signal } : undefined); } catch (e) { break; }
                if (!r2.ok) break;                                  // pas d'alternative : on garde l'itinéraire d'origine
                let d2; try { d2 = await r2.json(); } catch (e) { break; }
                const f2 = d2 && d2.features && d2.features[0]; if (!f2) break;
                data = d2; f = f2; bad = BR.scan(f2);
            }
            if (opts && opts.fluid && f) {
                // Passes « fluides » : on interdit les traversées de villages et les feux / stops, on garde le résultat s'il est vraiment meilleur et pas trop long
                const lenOf = (g) => parseFloat(g.properties && g.properties['track-length']) || 0, cost = (g, sc) => lenOf(g) + 250 * sc.stops + 0.6 * sc.urbM;
                const baseLen = lenOf(f); let best = { data, f, nogos: nogos.slice(), sc: BR.scanFluid(f) }; best.cost = cost(f, best.sc);
                for (let p = 0; p < FLUID_PASSES && best.sc.out.length; p++) {
                    const extra = best.sc.out.sort((a, b) => (b.m + (b.kind === 'stop' ? 400 : 0)) - (a.m + (a.kind === 'stop' ? 400 : 0))).slice(0, MAX_FLUID - best.nogos.length + 0);
                    const all = best.nogos.concat(extra).slice(0, MAX_FLUID); if (all.length === best.nogos.length) break;
                    let r2; try { r2 = await fetch(base0 + '&nogos=' + all.map(n => `${n.lon.toFixed(6)},${n.lat.toFixed(6)},${n.r}`).join('|'), signal ? { signal } : undefined); } catch (e) { break; }
                    if (!r2.ok) break;
                    let d2; try { d2 = await r2.json(); } catch (e) { break; }
                    const f2 = d2 && d2.features && d2.features[0]; if (!f2 || !f2.geometry) break;
                    const sc2 = BR.scanFluid(f2), c2 = cost(f2, sc2);
                    if (BR.scan(f2).length > BR.scan(best.f).length || lenOf(f2) > baseLen * 1.3 + 500 || c2 > best.cost * 0.97) break;
                    best = { data: d2, f: f2, nogos: all, sc: sc2, cost: c2 };
                }
                data = best.data; f = best.f;
                try { f.properties._fluid = { stops: best.sc.stops, urbanM: Math.round(best.sc.urbM) }; } catch (e) { }
            }
            try { if (f && f.properties) f.properties._legal = BR.scan(f).length; } catch (e) { }   // tronçons douteux restants (affichés dans le récap)
            return { ok: true, status: 200, json: async () => data };
        }
    };
    window.BRouterMoto = BR;
    if (typeof ModuleGPS !== 'undefined') ModuleGPS.brouterFetch = (lonlats, profile, signal, opts) => BR.fetch(lonlats, profile, signal, opts);
})();
