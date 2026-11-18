// B4 · Chronos : un circuit = une ligne de départ/arrivée posée sur une trace ; les secteurs sont découpés automatiquement (ModuleSensors.zones).
// Les circuits enregistrés sont reconnus tout seuls pendant la balade (chrono en direct) et à l'arrivée (tableau des tours).
const ModuleChrono = {
    KEY: 'moto_circuits', HALF: 40, MINLAP: 20000, cs: null, st: {}, hud: null, iv: null,
    list() { try { const l = AppStore.get(this.KEY, []); return Array.isArray(l) ? l.filter(c => c && isFinite(c.lat) && isFinite(c.lon) && isFinite(c.hd)) : []; } catch (e) { return []; } },
    put(l) { try { AppStore.set(this.KEY, l, true); } catch (e) {} },
    loc(c, lat, lon) { return [(lon - c.lon) * Math.cos(c.lat * Math.PI / 180) * 111320, (lat - c.lat) * 110540]; },
    fmt(sec, dec) { if (sec == null || !isFinite(sec)) return '—'; const m = Math.floor(sec / 60), r = sec - m * 60; return m > 0 ? m + ':' + (r < 10 ? '0' : '') + r.toFixed(dec == null ? 1 : dec) : r.toFixed(dec == null ? 1 : dec); },
    // instants (ms depuis le départ du trajet) où la trace g traverse la ligne dans le bon sens, interpolés entre deux points GPS
    cross(g, c) {
        const k = Math.PI / 180, dx = Math.sin(c.hd * k), dy = Math.cos(c.hd * k), px = dy, py = -dx, out = [];
        for (let i = 1; i < g.length; i++) {
            const p = this.loc(c, g[i - 1][2] / 1e5, g[i - 1][3] / 1e5), q = this.loc(c, g[i][2] / 1e5, g[i][3] / 1e5), sp = p[0] * dx + p[1] * dy, sq = q[0] * dx + q[1] * dy;
            if (sp < 0 && sq >= 0) { const f = sp === sq ? 0 : -sp / (sq - sp), x = p[0] + (q[0] - p[0]) * f, y = p[1] + (q[1] - p[1]) * f;
                if (Math.abs(x * px + y * py) <= this.HALF) { const t = g[i - 1][0] + f * (g[i][0] - g[i - 1][0]); if (!out.length || t - out[out.length - 1] >= this.MINLAP) out.push(t); } }
        }
        return out;
    },
    // point de la trace le plus proche d'un appui (≤ 80 m) + sens de marche
    pick(g, lat, lon) {
        let bi = -1, bd = 1e12; const ref = { lat, lon };
        g.forEach((q, i) => { const m = this.loc(ref, q[2] / 1e5, q[3] / 1e5), d = Math.sqrt(m[0] * m[0] + m[1] * m[1]); if (d < bd) { bd = d; bi = i; } });
        if (bi < 0 || bd > 80) return null;
        const a = g[Math.max(0, bi - 2)], b = g[Math.min(g.length - 1, bi + 2)], m = this.loc({ lat: a[2] / 1e5, lon: a[3] / 1e5 }, b[2] / 1e5, b[3] / 1e5);
        return { lat: g[bi][2] / 1e5, lon: g[bi][3] / 1e5, hd: (Math.atan2(m[0], m[1]) * 180 / Math.PI + 360) % 360 };
    },
    // instant où la trace g[a..b] passe au plus près du point pos
    passTime(g, a, b, pos) {
        let bt = null, bd = 1e12;
        for (let i = a; i < b; i++) {
            const p = this.loc(pos, g[i][2] / 1e5, g[i][3] / 1e5), q = this.loc(pos, g[i + 1][2] / 1e5, g[i + 1][3] / 1e5), vx = q[0] - p[0], vy = q[1] - p[1], L = vx * vx + vy * vy;
            const f = L ? Math.max(0, Math.min(1, -(p[0] * vx + p[1] * vy) / L)) : 0, x = p[0] + vx * f, y = p[1] + vy * f, d = x * x + y * y;
            if (d < bd) { bd = d; bt = g[i][0] + f * (g[i + 1][0] - g[i][0]); }
        }
        return bt;
    },
    idxAt(g, t, last) { let r = last ? 0 : g.length - 1; if (last) { for (let i = 0; i < g.length; i++) if (g[i][0] <= t) r = i; } else { for (let i = 0; i < g.length; i++) if (g[i][0] >= t) { r = i; break; } } return r; },
    // tours et secteurs d'un trajet pour un circuit
    build(g, ser, c, times) {
        if (times.length < 2) return null;
        const laps = []; for (let i = 0; i + 1 < times.length && laps.length < 30; i++) laps.push({ t0: times[i], t1: times[i + 1], s: +((times[i + 1] - times[i]) / 1000).toFixed(2) });
        let bi = 0; laps.forEach((l, i) => { if (l.s < laps[bi].s) bi = i; });
        const ref = laps[bi], ra = this.idxAt(g, ref.t0, false), rb = this.idxAt(g, ref.t1, true);
        let zones = null; if (rb - ra >= 20 && ser) zones = ModuleSensors.zones(g.slice(ra, rb + 1), ser, 5);
        const bounds = zones ? zones.slice(1).map(z => ({ lat: g[ra + z.i0][2] / 1e5, lon: g[ra + z.i0][3] / 1e5 })) : [];
        laps.forEach(l => {
            const a = this.idxAt(g, l.t0, false), b = this.idxAt(g, l.t1, true); l.sec = [];
            if (!zones || b - a < 10) return;
            const ts = [l.t0]; bounds.forEach(p => ts.push(this.passTime(g, a, b, p))); ts.push(l.t1);
            for (let j = 0; j + 1 < ts.length; j++) { const w0 = ts[j], w1 = ts[j + 1]; if (w0 == null || w1 == null || w1 <= w0) { l.sec.push({ s: null }); continue; }
                const i0 = this.idxAt(g, w0, false), i1 = this.idxAt(g, w1, true), z = i1 > i0 ? ModuleSensors.zstat(g, ser, i0, i1) : null;
                l.sec.push({ s: +((w1 - w0) / 1000).toFixed(2), vx: z ? z.vx : 0, vn: z ? z.vn : 0, la: z ? z.la : 0, bg: z ? z.bg : 0, ag: z ? z.ag : 0 }); }
        });
        const mean = laps.reduce((q, l) => q + l.s, 0) / laps.length, reg = laps.length > 1 ? Math.sqrt(laps.reduce((q, l) => q + Math.pow(l.s - mean, 2), 0) / laps.length) : 0;
        const nsec = zones ? zones.length : 0, bestSec = []; for (let j = 0; j < nsec; j++) { let b = -1; laps.forEach((l, i) => { if (l.sec[j] && l.sec[j].s != null && (b < 0 || l.sec[j].s < laps[b].sec[j].s)) b = i; }); bestSec.push(b); }
        return { cid: c.id, name: c.name, laps: laps.map(l => ({ s: l.s, sec: l.sec })), best: bi, bestSec, kinds: zones ? zones.map(z => z.k) : [], reg: +reg.toFixed(1) };
    },
    // À l'arrivée : le circuit enregistré le plus traversé (≥ 2 passages) ; met à jour le meilleur tour du circuit
    run(g, ser, persist) {
        const cs = this.list(); let best = null, bt = null;
        cs.forEach(c => { const t = this.cross(g, c); if (t.length >= 2 && (!best || t.length > bt.length)) { best = c; bt = t; } });
        if (!best) return null;
        const r = this.build(g, ser, best, bt);
        if (r && persist) { const m = Math.min.apply(null, r.laps.map(l => l.s)); if (!best.best || m < best.best) { best.best = m; this.put(cs); } }
        return r;
    },
    create(name, pt, rec) {
        const cs = this.list(), c = { id: String(Date.now()), name: String(name).slice(0, 40), lat: pt.lat, lon: pt.lon, hd: Math.round(pt.hd), best: null }; cs.push(c); this.put(cs);
        const d = ModuleSensors.load(rec.id); let chrono = null;
        if (d) { const ser = ModuleSensors.series(d.v, d.dt, d.g, ModuleSensors.ios()); chrono = this.build(d.g, ser, c, this.cross(d.g, c)); if (chrono) { c.best = Math.min.apply(null, chrono.laps.map(l => l.s)); this.put(cs); } }
        if (chrono) { const rides = AppStore.get('moto_recorded_rides', []), r = rides.find(x => x.id === rec.id); if (r) { r.stats = r.stats || {}; r.stats.sens = r.stats.sens || {}; r.stats.sens.chrono = chrono; AppStore.set('moto_recorded_rides', rides, true); rec = r; } }
        return { laps: chrono ? chrono.laps.length : 0, rec };
    },
    // ----- chrono en direct -----
    begin() { this.stopLive(); this.cs = this.list(); this.st = {}; },
    live(s) {
        const cs = this.cs; if (!cs || !cs.length || s.g.length < 2) return; const n = s.g.length, seg = [s.g[n - 2], s.g[n - 1]];
        cs.forEach(c => { const t = this.cross(seg, c)[0]; if (t == null) return; const st = this.st[c.id] || (this.st[c.id] = { start: null, n: 0, last: null, best: null, delta: null }), wall = s.t0 + t;
            if (st.start != null) { const lap = (wall - st.start) / 1000; if (lap < this.MINLAP / 1000) return; const ref = Math.min(c.best || 1e9, st.best || 1e9); st.delta = ref < 1e8 ? lap - ref : null; st.last = lap; st.best = Math.min(st.best || 1e9, lap); st.n++; }
            st.start = wall; this.active = c.id; this.showHud(); });
    },
    showHud() {
        if (!this.hud) { const h = document.createElement('div'); h.id = 'chrono-hud'; h.className = 'chrono-hud'; document.body.appendChild(h); this.hud = h; }
        if (!this.iv) this.iv = setInterval(() => this.tickHud(), 200); this.tickHud();
    },
    tickHud() {
        const st = this.st[this.active], c = (this.cs || []).find(x => x.id === this.active); if (!st || !this.hud || st.start == null) return;
        const cur = (Date.now() - st.start) / 1000, d = st.delta, dh = d == null ? '' : `<em class="${d <= 0 ? 'ok' : 'ko'}">${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}</em>`;
        this.hud.innerHTML = `<span>${(c && c.name) || 'Circuit'} · tour ${st.n + 1}</span><b>${this.fmt(cur)}</b>${st.last != null ? `<span>Dernier ${this.fmt(st.last)} ${dh}</span>` : ''}`;
    },
    stopLive() { if (this.iv) { clearInterval(this.iv); this.iv = null; } if (this.hud) { this.hud.remove(); this.hud = null; } this.cs = null; this.st = {}; this.active = null; },
    // ----- affichage -----
    html(sn, ic) {
        const ch = sn && sn.chrono; if (!ch || !ch.laps || !ch.laps.length) return '';
        const ns = ch.laps[0].sec ? ch.laps[0].sec.length : 0, bl = ch.laps[ch.best];
        const hd = Array.from({ length: ns }, (_, j) => `<th>S${j + 1}</th>`).join('');
        const rows = ch.laps.map((l, i) => `<button type="button" class="rs-lap" data-i="${i}"><i>${i + 1}</i>${l.sec.map((x, j) => `<span class="${ch.bestSec[j] === i ? 'pu' : ''}">${this.fmt(x.s)}</span>`).join('')}<b class="${i === ch.best ? 'pu' : ''}">${this.fmt(l.s)}</b></button>`).join('');
        return `<div class="rs-sec">${ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')}Chronos · ${String(ch.name).replace(/[<>&"]/g, '')}</div>
            <div class="rs-grid" style="grid-template-columns:repeat(3,1fr)">
                <div class="rs-tile" style="--ic:#ff9f0a">${ic('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>')}<b>${ch.laps.length}</b><span>Tours</span></div>
                <div class="rs-tile" style="--ic:#bf5af2">${ic('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>')}<b class="pu">${this.fmt(bl.s)}</b><span>Meilleur</span></div>
                <div class="rs-tile" style="--ic:#32ade6">${ic('<path d="M3 12h4l3-8 4 16 3-8h4"/>')}<b>±${String(ch.reg).replace('.', ',')}<small>s</small></b><span>Régularité</span></div></div>
            <div class="rs-tile rs-tbl" style="--n:${ns}"><div class="rs-lap-h"><i></i>${Array.from({ length: ns }, (_, j) => `<span>S${j + 1}</span>`).join('')}<b>Total</b></div>${rows}</div>
            <div class="rs-note"><span class="pu">■</span> meilleur secteur ou tour · touche un tour pour la télémétrie. Précision ≈ ±0,1 s (GPS 1 Hz, passages interpolés).</div>`;
    },
    lapDetail(rec, i) {
        const ch = rec && rec.stats && rec.stats.sens && rec.stats.sens.chrono, l = ch && ch.laps[i]; if (!l) return;
        const old = document.getElementById('lp-ov'); if (old) old.remove();
        const ic = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`, f2 = (x) => String(Number(x).toFixed(2)).replace('.', ',');
        const TY = { lent: 'Lent', rapide: 'Rapide', sinueux: 'Sinueux', mixte: 'Mixte' };
        const ov = document.createElement('div'); ov.id = 'lp-ov'; ov.className = 'lp-ov';
        ov.innerHTML = `<div class="bl-sh lp-sh"><div class="bl-hd"><b>Tour ${i + 1} · ${this.fmt(l.s)}</b><button type="button" class="aide-x" aria-label="Fermer">✕</button></div>
            ${i === ch.best ? '<p class="bl-foot" style="margin:0 0 10px"><span class="pu">Meilleur tour</span></p>' : ''}
            ${l.sec.map((x, j) => { const b = ch.laps[ch.bestSec[j]], dl = b && b.sec[j] && x.s != null ? x.s - b.sec[j].s : null, col = ModuleSensors.ZC[j % ModuleSensors.ZC.length];
                return `<div class="lp-card"><div class="lp-top"><i style="background:${col}">${j + 1}</i><span><b>${this.fmt(x.s)}</b><small>${TY[ch.kinds[j]] || ''}</small></span>${dl != null ? `<em class="${dl <= 0.005 ? 'ok' : 'ko'}">${dl <= 0.005 ? (dl < -0.005 ? '−' : '') + Math.abs(dl).toFixed(2) : '+' + dl.toFixed(2)}</em>` : ''}</div>
                <div class="lp-g"><div style="--ic:#ff375f">${ic('<path d="M12 14l4-8"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>')}<b>${x.vx || 0}</b><small>V max</small></div><div style="--ic:#bf5af2">${ic('<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>')}<b>${x.vn || 0}</b><small>V min</small></div><div style="--ic:#ff453a">${ic('<path d="M4 20h16M4 20L15 5"/><path d="M11 20a7 7 0 0 0-2-5"/>')}<b>${x.la || 0}°</b><small>Inclin.</small></div><div style="--ic:#ff9f0a">${ic('<path d="M12 5v10M7 11l5 5 5-5M5 20h14"/>')}<b>${f2(x.bg || 0)}g</b><small>Frein</small></div><div style="--ic:#30d158">${ic('<path d="M12 19V9M7 13l5-5 5 5M5 4h14"/>')}<b>${f2(x.ag || 0)}g</b><small>Accél.</small></div></div></div>`; }).join('')}
            ${l.sec.length ? '<p class="bl-foot">Écart par secteur avec ton meilleur secteur du trajet.</p>' : '<p class="bl-foot">Pas assez de mesures pour détailler les secteurs de ce tour.</p>'}</div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.aide-x')) ov.remove(); });
    }
};
