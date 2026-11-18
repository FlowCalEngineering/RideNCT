// B5 · Image récapitulative partageable d'une balade (canvas 1080×1350, trace sans fond de carte)
const ModuleRecap = {
    W: 1080, H: 1350,
    P: { dist: 'M5 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6', dur: 'M12 5a8 8 0 1 0 .01 0M12 9v4l3 2', avg: 'M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0', max: 'M12 14l4-8M3.3 17a9 9 0 1 1 17.4 0',
         lean: 'M4 20h16M4 20L15 5', brake: 'M12 5v10M7 11l5 5 5-5M5 20h14', lap: 'M5 21V4M5 4h11l-2 4 2 4H5', up: 'M3 20l6-11 4 7 3-5 5 9z' },
    // Contenu disponible pour ce trajet
    avail(rec) {
        const st = rec.stats || {}, sn = st.sens || {};
        return { lean: !!(sn.lean && sn.lean.n), brake: !!(sn.brake && (sn.brake.nb || sn.brake.na)), chrono: !!(sn.chrono && sn.chrono.laps && sn.chrono.laps.length), alt: !!st.hasAlt };
    },
    fmtDur(s) { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h > 0 ? h + 'h' + String(m).padStart(2, '0') : m + ' min'; },
    tiles(rec, o) {
        const st = rec.stats || {}, sn = st.sens || {}, f = (x) => String(x.toFixed(2)).replace('.', ',');
        const t1 = [
            [this.P.dist, '#0a84ff', AppUnits.km(parseFloat(rec.dist)).toFixed(1), AppUnits.distLabel(), 'Distance'],
            [this.P.dur, '#ff9f0a', this.fmtDur(st.dur), '', 'Durée'],
            [this.P.avg, '#bf5af2', String(AppUnits.spd(st.avg || 0)), AppUnits.speedLabel(), 'Moyenne'],
            [this.P.max, '#ff375f', String(AppUnits.spd(st.max || 0)), AppUnits.speedLabel(), 'Vitesse max']];
        const t2 = [], a = this.avail(rec);
        if (o.lean && a.lean) t2.push([this.P.lean, '#ff453a', String(sn.lean.max), '°', 'Inclinaison']);
        if (o.brake && a.brake) t2.push([this.P.brake, '#30d158', f(sn.brake.bmax), 'g', 'Freinage max']);
        if (o.chrono && a.chrono) t2.push([this.P.lap, '#ffd60a', ModuleChrono.fmt(sn.chrono.laps[sn.chrono.best].s), '', 'Meilleur tour']);
        if (a.alt) t2.push([this.P.up, '#64d2ff', '+' + (st.up || 0), 'm', 'Dénivelé']);
        return [t1, t2.slice(0, 4)];
    },
    // Tracé Racing en SVG (repli quand la carte n'est pas disponible) : liseré sombre, dégradé orange, départ vert, arrivée blanche
    routeSvg(coords, w, h) {
        try {
            let c = coords; if (!c || c.length < 2) return ''; const st = Math.max(1, Math.floor(c.length / 160)); c = c.filter((_, i) => i % st === 0 || i === c.length - 1);
            const k = Math.cos(c[0][1] * Math.PI / 180), xs = c.map(p => p[0] * k), ys = c.map(p => -p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 16;
            const s = Math.min((w - 2 * pad) / Math.max(x1 - x0, 1e-9), (h - 2 * pad) / Math.max(y1 - y0, 1e-9)), ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
            const P = c.map((p, i) => [ox + (xs[i] - x0) * s, oy + (ys[i] - y0) * s]), d = P.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
            const id = 'rg' + Math.random().toString(36).slice(2, 7), a = P[0], z = P[P.length - 1];
            return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#ffb340"/><stop offset=".5" stop-color="#ff6a1a"/><stop offset="1" stop-color="#ff2d55"/></linearGradient></defs>`
                + `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="url(#${id})" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`
                + `<circle cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="6.5" fill="#30d158" stroke="#111" stroke-width="2"/><circle cx="${z[0].toFixed(1)}" cy="${z[1].toFixed(1)}" r="6.5" fill="#fff" stroke="#111" stroke-width="2"/></svg>`;
        } catch (e) { return ''; }
    },
    // Fond de carte pour l'image de partage (mis en mémoire par trajet)
    _shots: {},
    async shot(rec) {
        const id = String(rec.id), S = this._shots; if (S[id] !== undefined) return S[id];
        S[id] = null; const co = rec.geojson && rec.geojson.coordinates; if (!co || co.length < 2 || typeof ModuleGPS === 'undefined' || !ModuleGPS.mapShot) return null;
        const r = await ModuleGPS.mapShot(co, 480, 280, 2); if (!r) { delete S[id]; return null; }
        const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = r.url; }); if (!img) { delete S[id]; return null; }
        return (S[id] = { img, pts: r.pts, w: r.w, h: r.h });
    },
    rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); },
    // Dessine l'image et retourne le canvas
    draw(rec, o) {
        const W = this.W, H = this.H, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
        const acc = (getComputedStyle(document.documentElement).getPropertyValue('--rc') || '').trim() || '#ff6a1a';
        const FONT = '-apple-system,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif';
        const cut = (x, y, w, h, k) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w - k, y); c.lineTo(x + w, y + k); c.lineTo(x + w, y + h); c.lineTo(x + k, y + h); c.lineTo(x, y + h - k); c.closePath(); };
        c.fillStyle = '#0c0c0e'; c.fillRect(0, 0, W, H);
        c.save(); c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 26; for (let i = -H; i < W + H; i += 110) { c.beginPath(); c.moveTo(i, H); c.lineTo(i + H * .6, 0); c.stroke(); } c.restore();
        c.fillStyle = acc; c.fillRect(0, 0, 14, H);
        
        // en-tête
        c.save(); c.translate(60, 56); c.scale(2, 2); c.strokeStyle = acc; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(new Path2D('M3 17h3l3-8h6l3 8h3M6 17a2 2 0 1 0 .01 0M18 17a2 2 0 1 0 .01 0')); c.restore();
        c.fillStyle = '#fff'; c.font = 'italic 900 40px ' + FONT; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('RideNCT', 124, 82);
        c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '700 30px ' + FONT; c.textAlign = 'right';
        const d = new Date(+rec.id || Date.now()); c.fillText(isFinite(d) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '', W - 60, 82);
        c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = 'italic 900 64px ' + FONT;
        const sn = (rec.stats && rec.stats.sens) || {}, nm = o.name && sn.chrono && sn.chrono.name ? String(sn.chrono.name) : '';
        let title = String(rec.title || 'Balade'); while (c.measureText(title).width > W - 120 && title.length > 4) title = title.slice(0, -2);
        c.fillText(title, 60, 190); if (nm) { c.fillStyle = 'rgba(255,255,255,.6)'; c.font = '700 34px ' + FONT; c.fillText(nm, 60, 245); }
        // trace
        const co = (rec.geojson && rec.geojson.coordinates) || [], bx = 60, by = 285, bw = W - 120, ch0 = o.chrono && sn.chrono && sn.chrono.laps && sn.chrono.laps.length ? sn.chrono : null, bh = ch0 ? 470 : 560;
        const SH = this._shots[String(rec.id)] || null;
        cut(bx, by, bw, bh, 34); c.fillStyle = 'rgba(255,255,255,.045)'; c.fill();
        if (SH && SH.img) {       // vraie carte derrière le tracé, assombrie pour garder la lisibilité
            c.save(); cut(bx, by, bw, bh, 34); c.clip(); const sc = Math.max(bw / SH.w, bh / SH.h), dw = SH.w * sc, dh = SH.h * sc, dx = bx + (bw - dw) / 2, dy = by + (bh - dh) / 2;
            c.drawImage(SH.img, dx, dy, dw, dh); c.fillStyle = 'rgba(12,12,14,.38)'; c.fillRect(bx, by, bw, bh); c.restore();
        }
        c.fillStyle = acc; c.fillRect(bx, by, 6, bh - 34);
        if (co.length > 1) {
            const k = Math.cos(co[0][1] * Math.PI / 180); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
            co.forEach(p => { const x = p[0] * k, y = -p[1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
            const s = Math.min((bw - 80) / Math.max(x1 - x0, 1e-9), (bh - 80) / Math.max(y1 - y0, 1e-9)), ox = bx + (bw - (x1 - x0) * s) / 2, oy = by + (bh - (y1 - y0) * s) / 2;
            let pt = (p, j) => [ox + (p[0] * k - x0) * s, oy + (-p[1] - y0) * s];
            if (SH && SH.pts && SH.pts.length) { const sc = Math.max(bw / SH.w, bh / SH.h), dx = bx + (bw - SH.w * sc) / 2, dy = by + (bh - SH.h * sc) / 2, n = SH.pts.length; pt = (p, j) => { const i = Math.round(j * (n - 1) / Math.max(1, co.length - 1)), q = SH.pts[Math.max(0, Math.min(n - 1, i))]; return [dx + q[0] * sc, dy + q[1] * sc]; }; }
            const path = () => { c.beginPath(); co.forEach((p, i) => { const q = pt(p, i); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); };
            c.lineJoin = 'round'; c.lineCap = 'round';
            path(); c.strokeStyle = 'rgba(255,106,26,.25)'; c.lineWidth = 22; c.stroke();
            path(); c.strokeStyle = 'rgba(255,106,26,.5)'; c.lineWidth = 12; c.stroke();
            path(); c.strokeStyle = '#ff6a1a'; c.lineWidth = 7; c.stroke();
            [[co[0], '#30d158', 0], [co[co.length - 1], '#ff453a', co.length - 1]].forEach(a => { const q = pt(a[0], a[2]); c.beginPath(); c.arc(q[0], q[1], 17, 0, 7); c.fillStyle = '#0c0c0e'; c.fill(); c.beginPath(); c.arc(q[0], q[1], 12, 0, 7); c.fillStyle = a[1]; c.fill(); });
        }
        // bande des tours (mode chrono) : jusqu'à 5 tours, le meilleur toujours présent
        if (ch0) {
            const L = ch0.laps, idx = L.map((_, i) => i); let pick = idx.length <= 5 ? idx : [ch0.best, ...idx.filter(i => i !== ch0.best).slice(-4)].sort((a, b) => a - b);
            const n = pick.length, gap = 14, w = (bw - gap * (n - 1)) / n, y = by + bh + 16, h = 84;
            pick.forEach((li, i) => { const X = bx + i * (w + gap), best = li === ch0.best; cut(X, y, w, h, 16); c.fillStyle = best ? 'rgba(191,90,242,.22)' : 'rgba(255,255,255,.07)'; c.fill(); c.fillStyle = best ? '#bf5af2' : acc; c.fillRect(X, y, 5, h - 16);
                c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = 'rgba(255,255,255,.6)'; c.font = 'italic 800 20px ' + FONT; c.fillText('TOUR ' + (li + 1) + (best ? ' ★' : ''), X + 18, y + 30);
                c.fillStyle = best ? '#d9a3ff' : '#fff'; c.font = 'italic 900 34px ' + FONT; c.fillText(ModuleChrono.fmt(L[li].s), X + 18, y + 68); });
        }
        // tuiles
        const t = this.tiles(rec, o), row = (list, y) => {
            if (!list.length) return; const n = list.length, gap = 18, w = (W - 120 - gap * (n - 1)) / n, h = 190;
            list.forEach((x, i) => {
                const X = 60 + i * (w + gap); cut(X, y, w, h, 22); c.fillStyle = 'rgba(255,255,255,.07)'; c.fill(); c.fillStyle = acc; c.fillRect(X, y, 6, h - 22);
                c.save(); c.translate(X + 20, y + 16); c.scale(2, 2); c.strokeStyle = x[1]; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(new Path2D(x[0])); c.restore();
                c.fillStyle = '#fff'; c.font = 'italic 900 ' + (n > 3 ? 46 : 54) + 'px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
                const vw = c.measureText(x[2]).width; c.fillText(x[2], X + 22, y + 124);
                if (x[3]) { c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '800 26px ' + FONT; c.fillText(x[3], X + 26 + vw, y + 124); }
                c.fillStyle = 'rgba(255,255,255,.55)'; c.font = 'italic 800 24px ' + FONT; c.fillText(String(x[4]).toUpperCase(), X + 22, y + 164);
            });
        };
        row(t[0], 880); row(t[1], 1090);
        c.textBaseline = 'alphabetic'; c.textAlign = 'center'; c.fillStyle = acc; c.font = 'italic 900 24px ' + FONT; c.fillText('ROULÉ AVEC RIDENCT', W / 2, t[1].length ? 1315 : 1200);
        return cv;
    },
    blob(cv) { return new Promise(r => cv.toBlob(r, 'image/png')); },
    fileName(rec) { return 'ridenct_' + (String(rec.title || 'balade').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'balade') + '.png'; },
    async save(rec, o) {
        try { await this.shot(rec); } catch (e) {}
        const b = await this.blob(this.draw(rec, o)), name = this.fileName(rec), url = URL.createObjectURL(b), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); return name;
    },
    async share(rec, o) {
        try { await this.shot(rec); } catch (e) {}
        const b = await this.blob(this.draw(rec, o)), file = new File([b], this.fileName(rec), { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: rec.title }); } catch (e) { if (e && e.name !== 'AbortError') throw e; } return 'share'; }
        await this.save(rec, o); return 'save';
    },
    // Feuille d'aperçu
    open(rec) {
        const old = document.getElementById('rc-ov'); if (old) old.remove();
        const a = this.avail(rec), o = { lean: a.lean, brake: a.brake, chrono: a.chrono, name: false };
        const ic = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
        const opts = [['lean', 'Inclinaison et virages', a.lean], ['brake', 'Freinages', a.brake], ['chrono', 'Chronos', a.chrono], ['name', 'Nom du circuit', a.chrono && !!(rec.stats.sens.chrono.name)]].filter(x => x[2]);
        const ov = document.createElement('div'); ov.id = 'rc-ov'; ov.className = 'rc-ov';
        ov.innerHTML = `<div class="rc-card"><div class="bl-hd"><b>Partager la balade</b><button type="button" class="aide-x" id="rc-x" aria-label="Fermer">✕</button></div>
            <div class="rc-prev"><canvas id="rc-cv"></canvas></div>
            ${opts.length ? `<div class="rc-opts">${opts.map(x => `<button type="button" class="rc-o ${o[x[0]] ? 'on' : ''}" data-k="${x[0]}"><span>${x[1]}</span><i></i></button>`).join('')}</div>` : ''}
            <div class="rs-actions"><button type="button" class="rs-btn" id="rc-save">${ic('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>')}Enregistrer l'image</button><button type="button" class="rs-btn rs-main" id="rc-share">${ic('<path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>')}Partager</button></div></div>`;
        document.body.appendChild(ov);
        const paint = () => { const cv = ov.querySelector('#rc-cv'), src = this.draw(rec, o); cv.width = 540; cv.height = 675; cv.getContext('2d').drawImage(src, 0, 0, 540, 675); };
        paint();
        this.shot(rec).then(() => { if (ov.isConnected) paint(); }).catch(() => {});
        ov.querySelector('#rc-x').onclick = () => ov.remove();
        ov.querySelectorAll('.rc-o').forEach(b => b.onclick = () => { o[b.dataset.k] = !o[b.dataset.k]; b.classList.toggle('on', o[b.dataset.k]); paint(); });
        const run = async (fn, btn) => { btn.disabled = true; try { await fn.call(this, rec, o); } catch (e) { AppDialog.alert('Impossible de créer l\'image.', { title: 'Partage' }); } btn.disabled = false; };
        ov.querySelector('#rc-share').onclick = (e) => run(this.share, e.currentTarget);
        ov.querySelector('#rc-save').onclick = (e) => run(this.save, e.currentTarget);
    }
};
