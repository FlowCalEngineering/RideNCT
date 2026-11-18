// Écart d'itinéraire : au lieu de tout recalculer depuis zéro (ce qui renvoyait vers les étapes déjà passées),
// on calcule seulement un raccord entre la position actuelle et un point du tracé situé devant (avant la prochaine étape),
// puis on garde le reste du tracé d'origine : les étapes restantes sont donc toujours desservies, dans l'ordre.
(() => {
    const AHEAD_M = 150;      // le raccord rejoint le tracé un peu devant le point le plus proche (pas de demi-tour)
    const S = () => ModuleGPS.state;

    Object.assign(ModuleGPS, {
        // Appelé à chaque relevé GPS quand on est à plus de 50 m du tracé
        offRoute(cur) {
            const s = S(); const C = s.currentGeoJSON && s.currentGeoJSON.coordinates; if (!C || C.length < 2) return;
            // 1. Retour spontané sur le tracé plus loin que la fenêtre de suivi (raccourci) : on reprend simplement le suivi.
            //    Limité à 1,5 km devant, sans dépasser la prochaine étape, dans le sens de la marche : sinon une route qui revient
            //    près d'elle-même (aller-retour, deux chaussées d'une 4 voies) ferait « couper » tout le trajet entre les deux.
            const from = s.passedRouteIndex || 0; let best = Infinity, bi = -1, acc = 0;
            const nextStage = this.nextStageIndex(C, from), hd = s.lastKnownHeading, mov = (s.lastKnownSpeed || 0) > 10;
            for (let i = from; i < C.length - 1 && i < nextStage; i++) {
                acc += this.calculateDistance(C[i], C[i + 1]); if (acc > 1500) break;
                const d = this.calculateDistance(cur, this.projectPointOnSegment(cur, C[i], C[i + 1]));
                if (d >= best) continue;
                if (mov && hd != null) { let df = Math.abs(this.calculateHeading(C[i], C[i + 1]) - hd) % 360; if (df > 180) df = 360 - df; if (df > 80) continue; }
                best = d; bi = i;
            }
            if (best < 30 && bi > from) { s.passedRouteIndex = bi; s.offRouteCount = 0; return; }
            // 2. Écart confirmé (plus de 3 relevés) : raccord
            s.offRouteCount = (s.offRouteCount || 0) + 1;
            if (s.offRouteCount <= 3 || s.isRecalculating || Date.now() < (s._rerouteWait || 0)) return;
            this.reroute(cur, C, from);
        },
        // Cherche où rejoindre : le point du tracé le plus proche, limité à la prochaine étape non desservie
        // Indice du sommet du tracé le plus proche de la prochaine étape non desservie (Infinity s'il n'y en a pas)
        nextStageIndex(C, from) {
            const s = S(); let next = Infinity;
            Object.keys(s.coords || {}).filter(k => /^input-wp-step-/.test(k)).map(k => s.coords[k]).filter(Boolean).forEach(c => { let bv = 0, bd = Infinity; for (let i = 0; i < C.length; i++) { const d = this.calculateDistance(c, C[i]); if (d < bd) { bd = d; bv = i; } } if (bv > from + 1 && bv < next) next = bv; });
            return next;
        },
        rejoinPoint(cur, C, from) {
            const s = S(); let limit = C.length - 2;
            const stages = Object.keys(s.coords || {}).filter(k => /^input-wp-step-/.test(k)).map(k => s.coords[k]).filter(Boolean);
            let next = Infinity;
            stages.forEach(c => { let bv = 0, bd = Infinity; for (let i = 0; i < C.length; i++) { const d = this.calculateDistance(c, C[i]); if (d < bd) { bd = d; bv = i; } } if (bv > from + 1 && bv < next) next = bv; });
            if (next !== Infinity) limit = Math.min(limit, next - 1);
            limit = Math.max(limit, from);
            let best = Infinity, bi = from, bp = C[from];
            for (let i = from; i <= limit; i++) { const p = this.projectPointOnSegment(cur, C[i], C[i + 1]); const d = this.calculateDistance(cur, p); if (d < best) { best = d; bi = i; bp = p; } }
            // On avance de AHEAD_M le long du tracé, sans dépasser la prochaine étape
            let idx = bi, pt = bp, left = AHEAD_M;
            while (idx <= limit) { const e = C[idx + 1], d = this.calculateDistance(pt, e); if (d >= left) { const k = left / (d || 1); pt = [pt[0] + k * (e[0] - pt[0]), pt[1] + k * (e[1] - pt[1])]; left = 0; break; } left -= d; pt = e; idx++; }
            if (idx > limit + 0) { idx = Math.min(limit + 1, C.length - 2); pt = C[Math.min(idx, C.length - 1)]; if (idx >= C.length - 1) idx = C.length - 2; }
            return { idx, pt };
        },
        // Raccord entre deux points avec le mode d'itinéraire courant
        async connector(a, b) {
            const s = S(), mode = s.routeMode || 'rapide';
            if (this.isOffline() && typeof OfflineGeo !== 'undefined') {
                try { const hd = s.lastKnownHeading, mov = (s.lastKnownSpeed || 0) > 10 && hd != null && isFinite(hd); const r = await OfflineGeo.route([a, b], mode, null, mov ? { heading: hd } : null); return { coords: r.geometry.coordinates, dist: r.distance, dur: r.duration }; } catch (e) { return null; }
            }
            const oc = `${a[0]},${a[1]};${b[0]},${b[1]}`;
            if (mode !== 'rapide') {
                try {
                    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 15000);
                    let r; try { r = await ModuleGPS.brouterFetch(`${a[0]},${a[1]}|${b[0]},${b[1]}`, mode === 'sans-axe' ? 'moped' : 'fastbike', ac.signal, { fluid: mode === 'sinueux' }); } finally { clearTimeout(to); }
                    if (r.ok) { const d = await r.json(); const f = d.features && d.features[0]; if (f) { const dist = parseFloat(f.properties['track-length']) || 0, avg = (s.routeDurSec > 0 && s.routeDistM > 0) ? s.routeDistM / s.routeDurSec : 16; return { coords: f.geometry.coordinates, dist, dur: dist / avg }; } }
                } catch (e) { }
            }
            // Cap de départ : sans lui, le serveur peut imposer un demi-tour (ou une rue dans le mauvais sens) pour rejoindre le tracé
            const hd = s.lastKnownHeading, mov = (s.lastKnownSpeed || 0) > 10 && hd != null && isFinite(hd);
            let od = mov ? await this.osrmJson(oc + `?overview=full&geometries=geojson&bearings=${Math.round(hd)},50;&radiuses=40;60`, 10000) : null;
            if (!od) od = await this.osrmJson(oc + '?overview=full&geometries=geojson', 10000);
            return od ? { coords: od.routes[0].geometry.coordinates, dist: od.routes[0].distance, dur: od.routes[0].duration } : null;
        },
        async reroute(cur, C, from) {
            const s = S(); s.isRecalculating = true;
            const badge = document.getElementById('main-map-badge'); if (badge) badge.innerHTML = 'Recalcul... 🔄';
            try {
                const { idx, pt } = this.rejoinPoint(cur, C, from);
                const conn = await this.connector(cur, pt);
                if (!s.isTracking || s.currentGeoJSON === null || s.currentGeoJSON.coordinates !== C) return;     // trajet arrêté / remplacé pendant l'attente
                if (!conn || conn.coords.length < 2) { s._rerouteWait = Date.now() + 8000; if (badge) badge.innerHTML = 'Raccord impossible'; return; }
                const rest = C.slice(idx + 1);
                const nc = [...conn.coords, ...rest];
                let rem = 0; for (let i = 1; i < rest.length; i++) rem += this.calculateDistance(rest[i - 1], rest[i]); rem += this.calculateDistance(pt, rest[0] || pt);
                const avg = (s.routeDurSec > 0 && s.routeDistM > 0) ? s.routeDistM / s.routeDurSec : 16;
                const wasExpert = s.routeExpert;
                s.routeSteps = []; s._stepIdx = -1; s.currentStepIndex = 0;
                this.finishRoute({ type: 'LineString', coordinates: nc }, conn.dist + rem, conn.dur + rem / avg, true);
                s.routeExpert = wasExpert; s.alts = {}; s._altKey = null; s.passedRouteIndex = 0; s.offRouteCount = 0;
                this.matchSteps(nc);
            } catch (e) { console.warn('Raccord', e); s._rerouteWait = Date.now() + 8000; }
            finally { s.isRecalculating = false; s.offRouteCount = 0; if (badge && badge.innerHTML.startsWith('Recalcul')) badge.innerHTML = 'Prêt 🛰️'; }
        }
    });
})();
