// B1 · Mesures du trajet : accélération (avec gravité) et rotation du téléphone, 10 relevés par seconde, rangés avec le trajet sur le téléphone.
// Colonnes (Int16) : ax, ay, az en cm/s², puis rotation alpha (autour de z), beta (x), gamma (y) en 0,1 °/s ; et dt (Uint16) = ms depuis le relevé précédent. Base pour B2 (inclinaison), B3 (freinages), B4 (chronos).
const ModuleSensors = {
    HZ: 10, MAX: 108000,   // 3 h
    s: null,
    on() { try { return AppPrefs.get('sensors') !== 'off'; } catch (e) { return true; } },
    async start() {
        this.halt(); this.err = ''; if (!this.on()) { this.err = 'off'; return; } if (typeof DeviceMotionEvent === 'undefined') { this.err = 'unsupported'; return; }
        try { if (typeof DeviceMotionEvent.requestPermission === 'function') { const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') { this.err = 'perm'; return; } } } catch (e) { this.err = 'perm'; return; }
        const s = this.s = { t0: Date.now(), last: 0, v: [], dt: [], g: [], gl: 0, h: null }; try { ModuleChrono.begin(); } catch (e) {}
        s.h = (e) => this.onMotion(e); window.addEventListener('devicemotion', s.h);
    },
    onMotion(e) {
        const s = this.s; if (!s) return; const now = Date.now();
        if (s.last && now - s.last < 1000 / this.HZ - 8) return;
        const a = e.accelerationIncludingGravity, r = e.rotationRate; if (!a || a.x == null || s.dt.length >= this.MAX) return;
        const q = (x, k) => Math.max(-32768, Math.min(32767, Math.round((Number(x) || 0) * k)));
        s.v.push(q(a.x, 100), q(a.y, 100), q(a.z, 100), q(r && r.alpha, 10), q(r && r.beta, 10), q(r && r.gamma, 10));
        s.dt.push(s.last ? Math.min(65535, now - s.last) : 0); s.last = now;
    },
    // Un point GPS par seconde (vitesse + position) : sert à l'inclinaison (B2), aux freinages (B3) et aux chronos (B4)
    gps(pos) {
        const s = this.s, c = pos && pos.coords; if (!s || !c || c.latitude == null) return; const now = Date.now();
        if (now - s.gl < 900 || c.accuracy > 40) return; s.gl = now;
        const sp = (c.speed == null || isNaN(c.speed) || c.speed < 0) ? null : c.speed; if (sp === null) return;
        s.g.push([now - s.t0, Math.round(sp * 100), Math.round(c.latitude * 1e5), Math.round(c.longitude * 1e5)]);
        try { ModuleChrono.live(s); } catch (e) {}
    },
    ios() { try { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); } catch (e) { return false; } },
    // B2 · Inclinaison virage par virage. Pas de montage à régler : lean = atan(vitesse × vitesse de lacet / g), le lacet étant la rotation autour de la verticale (gravité mesurée),
    // et le biais du gyroscope est étalonné pendant les arrêts. Données : v (6 colonnes Int16), dt (ms), g ([ms, cm/s, lat×1e5, lon×1e5]).
    analyze(v, dt, g, flip) {
        const n = dt.length; if (n < 50 || !g || g.length < 5) return null;
        const t = new Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += dt[i]; t[i] = acc; }
        let gi = 0; const spd = (ms) => { while (gi < g.length - 2 && g[gi + 1][0] < ms) gi++; const a = g[gi], b = g[Math.min(gi + 1, g.length - 1)]; if (ms <= a[0]) return a[1] / 100; if (ms >= b[0]) return b[1] / 100; return (a[1] + (b[1] - a[1]) * (ms - a[0]) / (b[0] - a[0])) / 100; };
        const sp = new Array(n); for (let i = 0; i < n; i++) sp[i] = spd(t[i]);
        // gravité : filtre passe-bas (≈ 1 s)
        const gx = new Array(n), gy = new Array(n), gz = new Array(n); let x = v[0], y = v[1], z = v[2];
        for (let i = 0; i < n; i++) { const a = Math.min(1, (dt[i] || 100) / 1100); x += a * (v[i * 6] - x); y += a * (v[i * 6 + 1] - y); z += a * (v[i * 6 + 2] - z); gx[i] = x; gy[i] = y; gz[i] = z; }
        // biais du gyroscope : moyenne à l'arrêt
        let bx = 0, by = 0, bz = 0, nb = 0; for (let i = 0; i < n; i++) if (sp[i] < 0.8) { bx += v[i * 6 + 3]; by += v[i * 6 + 4]; bz += v[i * 6 + 5]; nb++; }
        if (nb >= 20) { bx /= nb; by /= nb; bz /= nb; } else { bx = by = bz = 0; }
        const sgn = flip ? -1 : 1, G = 9.81, raw = new Array(n), RD = Math.PI / 180;
        // vitesse de lacet mesurée par le gyroscope (rad/s, > 0 : vers la gauche)
        const yg = new Array(n); let gyroE = 0;
        for (let i = 0; i < n; i++) {
            const m = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i] + gz[i] * gz[i]) || 1;
            yg[i] = ((v[i * 6 + 4] - by) * gx[i] + (v[i * 6 + 5] - bz) * gy[i] + (v[i * 6 + 3] - bx) * gz[i]) / m / 10 * RD * sgn; gyroE += yg[i] * yg[i];
        }
        // vitesse de lacet déduite du GPS (changement de cap, 1 Hz) : sert à vérifier l'unité (°/s ou rad/s) et le sens du gyroscope, ou à le remplacer s'il est absent / muet
        const hdg = (a, b) => Math.atan2((b[3] - a[3]) * Math.cos(a[2] / 1e5 * RD), (b[2] - a[2]));
        const gy2 = new Array(g.length).fill(null);
        for (let k = 1; k < g.length - 1; k++) {
            if (g[k][1] / 100 < 5) continue; const dl = (a, b) => Math.hypot((b[3] - a[3]) * 1.113 * Math.cos(a[2] / 1e5 * RD), (b[2] - a[2]) * 1.113); if (dl(g[k - 1], g[k]) < 5 || dl(g[k], g[k + 1]) < 5) continue;
            let d = hdg(g[k], g[k + 1]) - hdg(g[k - 1], g[k]); d = Math.atan2(Math.sin(d), Math.cos(d)); const T = (g[k + 1][0] - g[k - 1][0]) / 2000; if (T > 0.5 && T < 3) gy2[k] = -d / T;
        }
        let sxy = 0, sxx = 0, np = 0, j0 = 0;
        for (let k = 1; k < g.length - 1; k++) {
            if (gy2[k] === null || Math.abs(gy2[k]) < 0.06) continue;
            while (j0 < n - 1 && t[j0] < g[k][0] - 500) j0++; let q = 0, c = 0; for (let j = j0; j < n && t[j] <= g[k][0] + 500; j++) { q += yg[j]; c++; } if (!c) continue; q /= c;
            sxy += gy2[k] * q; sxx += q * q; np++;
        }
        let src = 'gyro', scale = 1, kcal = null;
        const gpsOk = g.some((q, k) => gy2[k] !== null);
        if (gyroE < 1e-6) src = gpsOk ? 'gps' : 'none';          // gyroscope absent ou muet : le cap GPS remplace
        else if (np < 6 || sxx < 1e-9) { /* pas assez de virages vus par le GPS pour vérifier : on fait confiance au gyroscope tel quel */ }
        else { kcal = sxy / sxx; if (kcal >= 40 && kcal <= 80) scale = 180 / Math.PI; else if (kcal <= -0.5 && kcal >= -1.8) scale = -1; else if (kcal <= -40 && kcal >= -80) scale = -180 / Math.PI; else if (kcal < 0.4 || kcal > 1.9) src = 'gps'; }   // k ≈ 1 : gyroscope juste ; ≈ 57 : il rend des rad/s ; < 0 : sens inversé ; sinon : inutilisable
        const yawAt = (ms, i) => { if (src === 'gyro') return yg[i] * scale; let a = 0, b = g.length - 1; if (ms <= g[0][0]) return gy2[0] || 0; while (b - a > 1) { const m = (a + b) >> 1; if (g[m][0] <= ms) a = m; else b = m; } const ya = gy2[a], yb = gy2[b]; return ya === null || yb === null ? 0 : ya + (yb - ya) * (ms - g[a][0]) / Math.max(1, g[b][0] - g[a][0]); };
        for (let i = 0; i < n; i++) { const r = yawAt(t[i], i); raw[i] = src !== 'none' && sp[i] >= 5 ? Math.max(-70, Math.min(70, Math.atan(sp[i] * r / G) * 180 / Math.PI)) : 0; }
        const L = new Array(n); for (let i = 0; i < n; i++) { let sum = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { sum += raw[k]; c++; } L[i] = sum / c; }
        // virages : |inclinaison| ≥ 10°, d'un seul côté, au moins 0,8 s (les trous de 0,5 s sont recollés)
        const turns = []; let i = 0;
        while (i < n) {
            if (Math.abs(L[i]) < 10) { i++; continue; }
            const side = L[i] > 0 ? 1 : -1; let j = i, last = i;
            while (j < n && j - last <= 5) { if (Math.abs(L[j]) >= 10 && (L[j] > 0 ? 1 : -1) === side) last = j; else if (Math.abs(L[j]) >= 10) break; j++; }
            let pk = i; for (let k = i; k <= last; k++) if (Math.abs(L[k]) > Math.abs(L[pk])) pk = k;
            if (t[last] - t[i] >= 800) turns.push({ a: Math.round(Math.abs(L[pk])), side: side > 0 ? 'g' : 'd', v: Math.round(sp[pk] * 3.6), t: t[pk] });
            i = last + 1;
        }
        if (!turns.length) return { n: 0, src, why: src === 'none' ? 'Aucune rotation mesurée par le téléphone et vitesse GPS insuffisante' : 'Aucun virage assez marqué (≥ 10°) détecté' };
        turns.forEach(tn => { let best = g[0], bd = 1e12; g.forEach(q => { const d = Math.abs(q[0] - tn.t); if (d < bd) { bd = d; best = q; } }); tn.lat = best[2] / 1e5; tn.lon = best[3] / 1e5; });
        const top = turns.slice().sort((a, b) => b.a - a.a).slice(0, 3);
        return { n: turns.length, max: top[0].a, side: top[0].side, avg: Math.round(turns.reduce((q, w) => q + w.a, 0) / turns.length), top, src, _all: turns };
    },
    // B3 · Freinages et accélérations. La verticale de la moto est la gravité apparente filtrée lentement (≈ 20 s) : elle suit l'axe de la moto même en virage, sans absorber un freinage. Accélération horizontale du téléphone (gravité retirée) moins la part due au virage (vitesse × lacet) = accélération dans l'axe de la moto ;
    // le sens (freinage / accélération) vient de la vitesse GPS. Seuils : freinage ≥ 0,25 g, accélération ≥ 0,18 g, 0,6 s au moins et 5 km/h de variation.
    analyzeBrake(v, dt, g) {
        const n = dt.length; if (n < 50 || !g || g.length < 5) return null;
        const t = new Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += dt[i]; t[i] = acc; }
        const spAt = (ms) => { let lo = 0, hi = g.length - 1; if (ms <= g[0][0]) return g[0][1] / 100; if (ms >= g[hi][0]) return g[hi][1] / 100; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[m][0] <= ms) lo = m; else hi = m; } return (g[lo][1] + (g[hi][1] - g[lo][1]) * (ms - g[lo][0]) / (g[hi][0] - g[lo][0])) / 100; };
        const sp = t.map(spAt);
        const gx = new Array(n), gy = new Array(n), gz = new Array(n); let x = v[0], y = v[1], z = v[2];
        for (let i = 0; i < n; i++) { const a = Math.min(1, (dt[i] || 100) / 20100); x += a * (v[i * 6] - x); y += a * (v[i * 6 + 1] - y); z += a * (v[i * 6 + 2] - z); gx[i] = x; gy[i] = y; gz[i] = z; }
        let bx = 0, by = 0, bz = 0, nb = 0; for (let i = 0; i < n; i++) if (sp[i] < 0.8) { bx += v[i * 6 + 3]; by += v[i * 6 + 4]; bz += v[i * 6 + 5]; nb++; }
        if (nb >= 20) { bx /= nb; by /= nb; bz /= nb; } else { bx = by = bz = 0; }
        const raw = new Array(n);
        for (let i = 0; i < n; i++) {
            const m = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i] + gz[i] * gz[i]) || 1, ax = v[i * 6] / 100, ay = v[i * 6 + 1] / 100, az = v[i * 6 + 2] / 100;
            const up = (ax * gx[i] + ay * gy[i] + az * gz[i]) / m, h2 = Math.max(0, ax * ax + ay * ay + az * az - up * up);
            const r = ((v[i * 6 + 4] - by) * gx[i] + (v[i * 6 + 5] - bz) * gy[i] + (v[i * 6 + 3] - bx) * gz[i]) / m / 10 * Math.PI / 180, lat = sp[i] * r;
            const d = (spAt(t[i] + 1000) - spAt(Math.max(0, t[i] - 1000))) / 2;
            raw[i] = sp[i] >= 2 ? Math.sqrt(Math.max(0, h2 - lat * lat)) * (d >= 0 ? 1 : -1) : 0;
        }
        const S = raw.map((_, i) => { let sum = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { sum += raw[k]; c++; } return sum / c; });
        const ev = [], G = 9.81;
        for (const sign of [-1, 1]) {
            const th = sign < 0 ? 2.5 : 1.8; let i = 0;
            while (i < n) {
                if (S[i] * sign < th) { i++; continue; }
                let j = i, last = i; while (j < n && j - last <= 3) { if (S[j] * sign >= th) last = j; j++; }
                let pk = i; for (let k = i; k <= last; k++) if (S[k] * sign > S[pk] * sign) pk = k;
                const v0 = spAt(t[i] - 300) * 3.6, v1 = spAt(t[last] + 300) * 3.6;
                if (t[last] - t[i] >= 600 && Math.abs(v1 - v0) >= 5) ev.push({ k: sign < 0 ? 'b' : 'a', g: +(Math.abs(S[pk]) / G).toFixed(2), v0: Math.round(v0), v1: Math.round(v1), t: t[pk] });
                i = last + 1;
            }
        }
        const B = ev.filter(e => e.k === 'b'), A = ev.filter(e => e.k === 'a');
        if (!B.length && !A.length) return { nb: 0, na: 0 };
        B.forEach(e => { let best = g[0], bd = 1e12; g.forEach(q => { const d = Math.abs(q[0] - e.t); if (d < bd) { bd = d; best = q; } }); e.lat = best[2] / 1e5; e.lon = best[3] / 1e5; });
        const top = B.slice().sort((a, b) => b.g - a.g).slice(0, 3);
        return { nb: B.length, na: A.length, bmax: B.length ? top[0].g : 0, amax: A.length ? Math.max(...A.map(e => e.g)) : 0, top };
    },
    // Séries temporelles communes à B2 et B3 : inclinaison signée L (°, > 0 à gauche) et accélération longitudinale S (m/s², < 0 au freinage)
    series(v, dt, g, flip) {
        const n = dt.length, t = new Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += dt[i]; t[i] = acc; }
        const spAt = (ms) => { let lo = 0, hi = g.length - 1; if (ms <= g[0][0]) return g[0][1] / 100; if (ms >= g[hi][0]) return g[hi][1] / 100; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[m][0] <= ms) lo = m; else hi = m; } return (g[lo][1] + (g[hi][1] - g[lo][1]) * (ms - g[lo][0]) / (g[hi][0] - g[lo][0])) / 100; };
        const sp = t.map(spAt), G = 9.81;
        const lp = (tau) => { const X = new Array(n), Y = new Array(n), Z = new Array(n); let x = v[0], y = v[1], z = v[2]; for (let i = 0; i < n; i++) { const a = Math.min(1, (dt[i] || 100) / (tau + 100)); x += a * (v[i * 6] - x); y += a * (v[i * 6 + 1] - y); z += a * (v[i * 6 + 2] - z); X[i] = x; Y[i] = y; Z[i] = z; } return [X, Y, Z]; };
        let bx = 0, by = 0, bz = 0, nb = 0; for (let i = 0; i < n; i++) if (sp[i] < 0.8) { bx += v[i * 6 + 3]; by += v[i * 6 + 4]; bz += v[i * 6 + 5]; nb++; }
        if (nb >= 20) { bx /= nb; by /= nb; bz /= nb; } else { bx = by = bz = 0; }
        const [fx, fy, fz] = lp(1000), [sx, sy, sz] = lp(20000), L0 = new Array(n), S0 = new Array(n);
        for (let i = 0; i < n; i++) {
            const yaw = (gx, gy, gz) => { const m = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1; return ((v[i * 6 + 4] - by) * gx + (v[i * 6 + 5] - bz) * gy + (v[i * 6 + 3] - bx) * gz) / m / 10 * Math.PI / 180; };
            const r = yaw(fx[i], fy[i], fz[i]) * (flip ? -1 : 1);
            L0[i] = sp[i] >= 5 ? Math.max(-70, Math.min(70, Math.atan(sp[i] * r / G) * 180 / Math.PI)) : 0;
            const m2 = Math.sqrt(sx[i] * sx[i] + sy[i] * sy[i] + sz[i] * sz[i]) || 1, ax = v[i * 6] / 100, ay = v[i * 6 + 1] / 100, az = v[i * 6 + 2] / 100;
            const up = (ax * sx[i] + ay * sy[i] + az * sz[i]) / m2, h2 = Math.max(0, ax * ax + ay * ay + az * az - up * up), lat = sp[i] * yaw(sx[i], sy[i], sz[i]);
            const d = (spAt(t[i] + 1000) - spAt(Math.max(0, t[i] - 1000))) / 2;
            S0[i] = sp[i] >= 2 ? Math.sqrt(Math.max(0, h2 - lat * lat)) * (d >= 0 ? 1 : -1) : 0;
        }
        const sm = (A) => A.map((_, i) => { let q = 0, c = 0; for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { q += A[k]; c++; } return q / c; });
        return { t, L: sm(L0), S: sm(S0) };
    },
    // B4 · Secteurs découpés automatiquement par zones de conduite (lent / rapide / sinueux / mixte), coupés aux arrêts, de 12 au plus. Données : g (1 point/s), séries d'inclinaison et d'accélération.
    ZN: { lent: 'Zone lente', rapide: 'Ligne droite rapide', sinueux: 'Enchaînement de virages', mixte: 'Route mixte' },
    ZC: ['#ff9f0a', '#0a84ff', '#ff453a', '#30d158', '#bf5af2', '#32ade6', '#ffd60a', '#ff375f', '#64d2ff', '#ac8e68', '#34c759', '#ff6482'],
    zones(g, ser, max) {
        const N = g.length; if (N < 20) return null; max = max || 12;
        const hav = (a, b) => { const R = 6371000, r = Math.PI / 180, dl = (b[2] - a[2]) / 1e5 * r, dn = (b[3] - a[3]) / 1e5 * r, la = (a[2] + b[2]) / 2e5 * r; return R * Math.sqrt(dl * dl + Math.pow(dn * Math.cos(la), 2)); };
        const kmh = (k) => g[k][1] / 100 * 3.6;
        // inclinaison par point GPS (fenêtre ± 4 s)
        const Lw = new Array(N).fill(0), ti = ser.t; let j0 = 0;
        for (let k = 0; k < N; k++) { while (j0 < ti.length && ti[j0] < g[k][0] - 4000) j0++; let j = j0, c = 0, hit = 0, mx = 0; while (j < ti.length && ti[j] <= g[k][0] + 4000) { const a = Math.abs(ser.L[j]); if (a >= 15) hit++; if (a > mx) mx = a; c++; j++; } Lw[k] = c ? { sh: hit / c, mx } : { sh: 0, mx: 0 }; }
        const cls = g.map((_, k) => { const v = kmh(k), w = Lw[k]; if (g[k][1] < 100) return 'stop'; if (v < 45) return 'lent'; if (w.sh >= 0.35 || w.mx >= 28) return 'sinueux'; return v >= 85 ? 'rapide' : 'mixte'; });
        const mode = cls.map((_, k) => { const m = {}; let b = cls[k], bc = 0; for (let q = Math.max(0, k - 3); q <= Math.min(N - 1, k + 3); q++) { m[cls[q]] = (m[cls[q]] || 0) + 1; if (m[cls[q]] > bc) { bc = m[cls[q]]; b = cls[q]; } } return b; });
        // arrêts longs (≥ 20 s) : coupures ; le reste en segments de même classe
        let segs = [], k = 0;
        while (k < N) { let e = k; while (e + 1 < N && ((mode[e + 1] === 'stop') === (mode[k] === 'stop')) && (mode[k] === 'stop' || mode[e + 1] === mode[k])) e++;
            if (mode[k] !== 'stop') segs.push({ i0: k, i1: e, k: mode[k] }); else if (g[e][0] - g[k][0] < 20000 && segs.length) segs[segs.length - 1].i1 = e;   // petit arrêt : absorbé
            k = e + 1; }
        const dur = (q) => g[q.i1][0] - g[q.i0][0], dist = (q) => { let d = 0; for (let i = q.i0 + 1; i <= q.i1; i++) d += hav(g[i - 1], g[i]); return d; };
        const merge = (idx) => { const q = segs[idx], a = segs[idx - 1], b = segs[idx + 1], tgt = !a ? b : !b ? a : (dur(a) >= dur(b) ? a : b); if (!tgt) return false; if (tgt === a) { a.i1 = q.i1; } else { b.i0 = q.i0; } segs.splice(idx, 1); return true; };
        const adj = () => { for (let i = segs.length - 1; i > 0; i--) if (segs[i].k === segs[i - 1].k && segs[i].i0 - segs[i - 1].i1 <= 25) { segs[i - 1].i1 = segs[i].i1; segs.splice(i, 1); } };
        for (let guard = 0; guard < 200; guard++) { adj(); let w = -1, wd = 1e12; segs.forEach((q, i) => { const d = dur(q); if ((d < 40000 || dist(q) < 500) && d < wd) { wd = d; w = i; } }); if (w < 0 || segs.length < 2 || !merge(w)) break; }
        for (let guard = 0; segs.length > max && guard < 50; guard++) { let w = 0, wd = 1e12; segs.forEach((q, i) => { const d = dur(q); if (d < wd) { wd = d; w = i; } }); merge(w); adj(); }
        if (segs.length < 2) return null;
        return segs.map((q, n) => this.zstat(g, ser, q.i0, q.i1, q.k, this.ZC[n % this.ZC.length]));
    },
    // Télémétrie d'un tronçon de la trace (indices GPS i0..i1) : vitesses, inclinaison, freinage, accélération, distance
    zstat(g, ser, i0, i1, k, c) {
        const hav = (a, b) => { const R = 6371000, r = Math.PI / 180, dl = (b[2] - a[2]) / 1e5 * r, dn = (b[3] - a[3]) / 1e5 * r, la = (a[2] + b[2]) / 2e5 * r; return R * Math.sqrt(dl * dl + Math.pow(dn * Math.cos(la), 2)); };
        const flat = ser.t, t0 = g[i0][0], t1 = g[i1][0]; let vx = 0, vn = 1e9, vs = 0, vc = 0, d = 0;
        for (let i = i0; i <= i1; i++) { const v = g[i][1] / 100 * 3.6; if (v > vx) vx = v; if (v > 3 && v < vn) vn = v; vs += v; vc++; if (i > i0) d += hav(g[i - 1], g[i]); }
        let la = 0, lai = -1, bg = 0, bgi = -1, ag = 0;
        for (let j = 0; j < flat.length; j++) { if (flat[j] < t0) continue; if (flat[j] > t1) break; const a = Math.abs(ser.L[j]); if (a > la) { la = a; lai = j; } const sv = ser.S[j]; if (-sv > bg) { bg = -sv; bgi = j; } if (sv > ag) ag = sv; }
        const near = (ms) => { let best = i0, bd = 1e12; for (let i = i0; i <= i1; i++) { const dd = Math.abs(g[i][0] - ms); if (dd < bd) { bd = dd; best = i; } } return best; };
        const z = { i0, i1, k, c, d: Math.round(d), s: Math.round((t1 - t0) / 1000), vx: Math.round(vx), vn: vn > 1e8 ? 0 : Math.round(vn), va: Math.round(vs / Math.max(1, vc)), la: Math.round(la), bg: +(bg / 9.81).toFixed(2), ag: +(ag / 9.81).toFixed(2) };
        if (lai >= 0 && la >= 12) { const p = g[near(flat[lai])]; z.ml = { lat: p[2] / 1e5, lon: p[3] / 1e5, a: Math.round(la), sd: ser.L[lai] > 0 ? 'g' : 'd' }; }
        if (bgi >= 0 && bg / 9.81 >= 0.25) { const p = g[near(flat[bgi])]; z.mb = { lat: p[2] / 1e5, lon: p[3] / 1e5, g: +(bg / 9.81).toFixed(2) }; }
        return z;
    },
    halt() { try { ModuleChrono.stopLive(); } catch (e) {} const s = this.s; if (s && s.h) window.removeEventListener('devicemotion', s.h); this.s = null; },
    b64(arr, Type) {
        const u = new Uint8Array(new Type(arr).buffer); let o = ''; for (let i = 0; i < u.length; i += 8192) o += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(o);
    },
    // Relit les mesures rangées avec un trajet (pour recalculer tours et secteurs)
    load(id) {
        try { const d = (AppStore.get('moto_sensors', {}) || {})[id]; if (!d || !d.g || !d.v) return null;
            const dec = (b, T) => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new T(u.buffer); };
            return { g: d.g, v: Array.from(dec(d.v, Int16Array)), dt: Array.from(dec(d.dt, Uint16Array)) }; } catch (e) { return null; }
    },
    // Fin du trajet : résumé + données compactes (null s'il n'y a rien d'exploitable)
    finish() {
        const s = this.s; this.halt(); if (!s || s.dt.length < 50) return null;
        const n = s.dt.length; let accMax = 0, rotMax = 0; const bins = new Array(60).fill(0);
        for (let i = 0; i < n; i++) {
            const ax = s.v[i * 6] / 100, ay = s.v[i * 6 + 1] / 100, az = s.v[i * 6 + 2] / 100;
            const dev = Math.abs(Math.sqrt(ax * ax + ay * ay + az * az) - 9.81) / 9.81, rot = Math.sqrt(Math.pow(s.v[i * 6 + 3], 2) + Math.pow(s.v[i * 6 + 4], 2) + Math.pow(s.v[i * 6 + 5], 2)) / 10;
            if (dev > accMax) accMax = dev; if (rot > rotMax) rotMax = rot;
            const b = Math.min(59, Math.floor(i * 60 / n)); if (dev > bins[b]) bins[b] = dev;
        }
        let lean = null, brake = null; try { lean = this.analyze(s.v, s.dt, s.g, this.ios()); } catch (e) {}
        if (!lean) lean = { n: 0, why: s.g.length < 5 ? 'Vitesse GPS indisponible pendant la balade (inclinaison impossible à calculer)' : 'Trop peu de mesures' }; try { brake = this.analyzeBrake(s.v, s.dt, s.g); } catch (e) {}
        let zones = null, chrono = null; try { if (s.g.length >= 20) { const ser = this.series(s.v, s.dt, s.g, this.ios()); zones = this.zones(s.g, ser); try { chrono = ModuleChrono.run(s.g, ser, true); } catch (e) {} if (zones && lean && lean._all) zones.forEach(z => { z.nt = lean._all.filter(q => q.t >= s.g[z.i0][0] && q.t <= s.g[z.i1][0]).length; }); } } catch (e) {}
        if (lean) delete lean._all;
        return { stats: { n, hz: this.HZ, lean, brake, zones, chrono, acc: +accMax.toFixed(2), rot: Math.round(rotMax), spark: bins.map(x => +x.toFixed(2)) },
                 data: { t0: s.t0, n, hz: this.HZ, g: s.g, v: this.b64(s.v, Int16Array), dt: this.b64(s.dt, Uint16Array) } };
    },
    // Raison pour laquelle aucune mesure n'existe (affichée dans le bilan)
    whyNone() { const e = this.err; return e === 'perm' ? 'Capteurs de mouvement refusés : autorise « Mouvement et orientation » pour l\'appli.' : e === 'unsupported' ? 'Capteurs de mouvement indisponibles sur cet appareil.' : e === 'off' ? '' : 'Aucune mesure reçue du capteur de mouvement (inclinaison non calculée).'; },
    store(id, data) {
        try { const all = AppStore.get('moto_sensors', {}), keep = {}; keep[id] = data; Object.keys(all).sort((a, b) => b - a).slice(0, 29).forEach(k => { keep[k] = all[k]; }); AppStore.set('moto_sensors', keep, true); } catch (e) {}
    },
    drop(id) { try { const all = AppStore.get('moto_sensors', {}); if (all && all[id]) { delete all[id]; AppStore.set('moto_sensors', all, true); } } catch (e) {} },
    // Courbe + tuiles de la fenêtre « Trajet terminé »
    leanHtml(sn, ic, noMax) {
        const l = sn && sn.lean; if (!l || !l.n) return '';
        const arrow = (sd) => sd === 'd' ? '→' : '←', word = (sd) => sd === 'd' ? 'droite' : 'gauche';
        const hm = (ms) => { const d = new Date((sn.t0 || 0) + ms); return isFinite(d) && sn.t0 ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''; };
        return `<div class="rs-sec">${ic('<path d="M4 20c0-8 4-12 16-12M16 4l4 4-4 4"/>')}Virages</div>
            ${noMax ? '' : `<div class="rs-tile" style="--ic:#ff453a;padding:14px 12px">${ic('<path d="M4 20h16M4 20L15 5"/><path d="M11 20a7 7 0 0 0-2-5"/>')}<b style="font-size:2.2rem">${l.max}<small>° à ${word(l.side)}</small></b><span>Inclinaison max</span></div>`}
            <div class="rs-grid" style="margin-top:8px">
                <div class="rs-tile" style="--ic:#0a84ff">${ic('<path d="M4 20c0-8 4-12 16-12M16 4l4 4-4 4"/>')}<b>${l.n}</b><span>Virages</span></div>
                <div class="rs-tile" style="--ic:#ffd60a">${ic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>')}<b>${l.avg}<small>°</small></b><span>Pic moyen</span></div></div>
            <div class="rs-tile rs-top">${l.top.map((q, i) => `<div class="rs-trow"><i>${i + 1}</i><b>${q.a}° ${arrow(q.side)} <small>${word(q.side)}</small></b><span>${q.v} km/h${hm(q.t) ? ' · ' + hm(q.t) : ''}</span></div>`).join('')}</div>`;
    },
    leanNote(sn) { const l = sn && sn.lean; return l && !l.n && l.why ? `<div class="rs-note" style="margin-top:10px"><b>Inclinaison non calculée</b> · ${String(l.why).replace(/[<>&]/g, '')}</div>` : ''; },
    brakeHtml(sn, ic) {
        const b = sn && sn.brake; if (!b || (!b.nb && !b.na)) return '';
        const hm = (ms) => { const d = new Date((sn.t0 || 0) + ms); return isFinite(d) && sn.t0 ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''; };
        const f = (x) => String(x.toFixed(2)).replace('.', ',');
        return `<div class="rs-sec">${ic('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="4"/>')}Freinages et accélérations</div>
            <div class="rs-grid">
                <div class="rs-tile" style="--ic:#ff453a">${ic('<path d="M12 5v10M7 11l5 5 5-5M5 20h14"/>')}<b>${f(b.bmax)}<small>g</small></b><span>Freinage max</span></div>
                <div class="rs-tile" style="--ic:#30d158">${ic('<path d="M12 19V9M7 13l5-5 5 5M5 4h14"/>')}<b>${f(b.amax)}<small>g</small></b><span>Accélération max</span></div>
                <div class="rs-tile" style="--ic:#ff9f0a">${ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}<b>${b.nb}</b><span>Freinages</span></div>
                <div class="rs-tile" style="--ic:#32ade6">${ic('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>')}<b>${b.na}</b><span>Accélérations</span></div></div>
            <div class="rs-tile rs-top">${(b.top || []).map((q, i) => `<div class="rs-trow"><i>${i + 1}</i><b>${f(q.g)} g <small>${q.v0} → ${q.v1} km/h</small></b><span>${hm(q.t)}</span></div>`).join('')}</div>`;
    },
    // ----- Bilan : carte de la trace colorée par secteur + télémétrie de chaque secteur -----
    mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); },
    openMap(rec) {
        const sn = rec && rec.stats && rec.stats.sens, Z = sn && sn.zones; if (!Z || !Z.length) return;
        let data = null; try { data = (AppStore.get('moto_sensors', {}) || {})[rec.id]; } catch (e) {}
        const g = data && data.g; if (!g || g.length < 5) return;
        const old = document.getElementById('bl-ov'); if (old) old.remove();
        const esc = (x) => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const ic = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`, f2 = (x) => String(x.toFixed(2)).replace('.', ',');
        const TY = { lent: 'Lent', rapide: 'Rapide', sinueux: 'Sinueux', mixte: 'Mixte' }, km = (m) => (m / 1000).toFixed(1).replace('.', ',') + ' km';
        const ov = document.createElement('div'); ov.id = 'bl-ov'; ov.className = 'bl-ov';
        ov.innerHTML = `<div id="bl-map" class="bl-map"></div><div class="aide-top"><b>${esc(rec.title || 'Trajet')}</b><span>${Z.length} secteurs · découpés automatiquement</span></div><div class="bl-sh" id="bl-sh"></div>`;
        document.body.appendChild(ov);
        let map = null, sel = -1; const marks = [];
        const lineOf = (z) => g.slice(z.i0, z.i1 + 1).map(q => [q[3] / 1e5, q[2] / 1e5]);
        const sheet = ov.querySelector('#bl-sh');
        const paint = () => { if (!map) return; Z.forEach((z, i) => { try { map.setPaintProperty('bl-z' + i, 'line-opacity', sel < 0 || sel === i ? 1 : 0.25); map.setPaintProperty('bl-z' + i, 'line-width', sel === i ? 9 : 6); } catch (e) {} }); marks.forEach(m => m.remove()); marks.length = 0;
            if (sel >= 0) { const z = Z[sel], pin = (o, col, txt) => { const e = document.createElement('div'); e.className = 'bl-pin'; e.style.background = col; e.textContent = txt; marks.push(new maplibregl.Marker({ element: e }).setLngLat([o.lon, o.lat]).addTo(map)); };
                if (z.ml) pin(z.ml, '#ff453a', z.ml.a + '° ' + (z.ml.sd === 'd' ? 'droite' : 'gauche')); if (z.mb) pin(z.mb, '#ff9f0a', 'frein ' + f2(z.mb.g) + ' g'); } };
        const fit = (zs) => { if (!map) return; try { const b = new maplibregl.LngLatBounds(); zs.forEach(z => lineOf(z).forEach(c => b.extend(c))); map.fitBounds(b, { padding: { top: 100, bottom: 360, left: 40, right: 40 }, duration: 400, maxZoom: 16 }); } catch (e) {} };
        const list = () => { sel = -1; paint(); fit(Z);
            sheet.innerHTML = `<div class="bl-hd"><b>Secteurs</b><span class="bl-hb"><button type="button" class="bl-chr" id="bl-chr">${ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')}Chrono</button><button type="button" class="aide-x" id="bl-x" aria-label="Fermer">✕</button></span></div><div class="bl-list">${Z.map((z, i) => `<button type="button" class="bl-z" data-i="${i}"><i style="background:${z.c}">${i + 1}</i><span><b>${this.ZN[z.k] || 'Secteur'}</b><small>${TY[z.k] || ''} · ${km(z.d)}</small></span><em>${this.mmss(z.s)}</em></button>`).join('')}</div>`;
            sheet.querySelector('#bl-x').onclick = () => { if (map) { try { map.remove(); } catch (e) {} } ov.remove(); };
            sheet.querySelectorAll('.bl-z').forEach(b => b.onclick = () => detail(+b.dataset.i));
            sheet.querySelector('#bl-chr').onclick = () => place(); };
        // Pose de la ligne départ/arrivée : un appui sur la trace
        const place = () => {
            sel = -1; paint(); fit(Z);
            sheet.innerHTML = `<div class="bl-hd"><b>Ligne de départ / arrivée</b><button type="button" class="aide-x" id="bl-x" aria-label="Fermer">✕</button></div><p class="bl-foot" style="margin:0 0 12px">Touche la trace à l'endroit de la ligne. Les secteurs restent découpés automatiquement.</p><button type="button" class="aide-btn sec" id="bl-cancel">Annuler</button>`;
            sheet.querySelector('#bl-x').onclick = () => { if (map) { try { map.remove(); } catch (e) {} } ov.remove(); };
            sheet.querySelector('#bl-cancel').onclick = list;
            if (map) map.once('click', async (e) => {
                const c = ModuleChrono.pick(g, e.lngLat.lat, e.lngLat.lng); if (!c) { try { AppDialog.alert('Touche plus près de la trace.', { title: 'Ligne non posée' }); } catch (x) {} return list(); }
                const name = await AppDialog.prompt('Nom du circuit', 'Mon circuit', { okText: 'Enregistrer', maxLength: 40 }); if (!name) return list();
                const res = ModuleChrono.create(name, c, rec); if (map) { try { map.remove(); } catch (x) {} } ov.remove();
                if (res.laps === 0) { try { AppDialog.alert('Circuit enregistré. Il faut au moins deux passages sur la ligne pour chronométrer un tour : il sera utilisé automatiquement à ta prochaine balade.', { title: 'Circuit créé' }); } catch (x) {} } else ModuleGPS.showRideSummary(res.rec);
            });
        };
        const tile = (col, svg, v, u, l) => `<div class="rs-tile" style="--ic:${col}">${ic(svg)}<b>${v}${u ? `<small>${u}</small>` : ''}</b><span>${l}</span></div>`;
        const detail = (i) => { sel = i; paint(); fit([Z[i]]); const z = Z[i];
            sheet.innerHTML = `<div class="bl-hd"><button type="button" class="bl-back" id="bl-back">‹ Secteurs</button><button type="button" class="aide-x" id="bl-x" aria-label="Fermer">✕</button></div>
                <div class="bl-name"><i style="background:${z.c}">${i + 1}</i><b>${this.ZN[z.k] || 'Secteur'}</b><em>${this.mmss(z.s)}</em></div>
                <div class="rs-grid bl-g">${tile('#ff375f', '<path d="M12 14l4-8"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>', z.vx, '', 'V max km/h')}${tile('#bf5af2', '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>', z.vn, '', 'V min km/h')}${tile('#ff453a', '<path d="M4 20h16M4 20L15 5"/><path d="M11 20a7 7 0 0 0-2-5"/>', z.la, '°', 'Inclinaison')}${tile('#ff9f0a', '<path d="M12 5v10M7 11l5 5 5-5M5 20h14"/>', f2(z.bg), 'g', 'Freinage max')}${tile('#30d158', '<path d="M12 19V9M7 13l5-5 5 5M5 4h14"/>', f2(z.ag), 'g', 'Accél. max')}${tile('#0a84ff', '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>', km(z.d).replace(' km', ''), 'km', 'Distance')}</div>
                <div class="bl-foot">V moy. ${z.va} km/h${z.nt != null ? ' · ' + z.nt + ' virage' + (z.nt > 1 ? 's' : '') : ''}</div>`;
            sheet.querySelector('#bl-back').onclick = list; sheet.querySelector('#bl-x').onclick = () => { if (map) { try { map.remove(); } catch (e) {} } ov.remove(); }; };
        list();
        try {
            map = new maplibregl.Map({ container: 'bl-map', style: AppTheme.getMapStyleUrl(), center: [g[0][3] / 1e5, g[0][2] / 1e5], zoom: 12, attributionControl: false });
            map.on('load', () => { Z.forEach((z, i) => { map.addSource('bl-z' + i, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: lineOf(z) } } }); map.addLayer({ id: 'bl-z' + i, type: 'line', source: 'bl-z' + i, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': z.c, 'line-width': 6 } }); map.on('click', 'bl-z' + i, () => detail(i)); }); fit(Z); });
        } catch (e) {}
    },
    summaryHtml(sn, ic, opt) {
        opt = opt || {};
        if (sn && !sn.n && sn.why) return `<div class="rs-sec">${ic('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>')}Mesures du téléphone</div><div class="rs-note">${String(sn.why).replace(/[<>&]/g, '')}</div>`;
        if (!sn || !sn.n) return '';
        const mx = Math.max(0.05, ...(sn.spark || [0])), W = 336, H = 40, pts = (sn.spark || []).map((v, i, a) => (i * W / Math.max(1, a.length - 1)).toFixed(1) + ',' + (H - 4 - (v / mx) * (H - 8)).toFixed(1)).join(' ');
        const k = sn.n >= 1000 ? Math.round(sn.n / 1000) + ' k' : String(sn.n);
        return `<div class="rs-sec">${ic('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>')}Mesures du téléphone</div>
            <div class="rs-tile rs-spark"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}"/></svg><span>Accélération pendant le trajet</span></div>
            <div class="rs-grid" style="margin-top:8px">
                <div class="rs-tile" style="--ic:#32ade6">${ic('<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>')}<b>${String(sn.acc).replace('.', ',')}<small>g</small></b><span>Accél. max</span></div>
                <div class="rs-tile" style="--ic:#30d158">${ic('<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>')}<b>${sn.rot}<small>°/s</small></b><span>Rotation max</span></div>
                <div class="rs-tile" style="--ic:#0a84ff">${ic('<path d="M4 20V10M10 20V4M16 20v-8M22 20V8"/>')}<b>${k}</b><span>Relevés · ${sn.hz} Hz</span></div></div>` + this.leanNote(sn) + this.leanHtml(sn, ic, opt.skipMax) + this.brakeHtml(sn, ic) + ((!opt.skipChrono && typeof ModuleChrono !== 'undefined') ? ModuleChrono.html(sn, ic) : '') + (sn.zones && sn.zones.length ? `<button type="button" class="rs-btn rs-zones" style="width:100%;margin-top:12px">Carte et secteurs (${sn.zones.length})</button>` : '');
    }
};
