/* Profil : Records et Bornes (récompenses), calculés sur l'appareil à partir des trajets enregistrés. */
const ProfileStats = {
    KEY: 'moto_stats',
    ic: {
        speed: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>',
        road: '<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>',
        clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
        up: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
        alt: '<path d="M3 20l5-9 3 5 4-8 6 12z"/><path d="M15 8l1.5-2.5L18 8"/>',
        avg: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
        cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
        flame: '<path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z"/>',
        post: '<path d="M7 21V9a5 5 0 0 1 10 0v12z"/><path d="M5 21h14M10 12h4"/>',
        compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
        globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
        rocket: '<path d="M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9z"/><circle cx="12" cy="10" r="1.5"/><path d="M9 15l-2 4 3-1M15 15l2 4-3-1"/>',
        crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
        flag: '<path d="M5 22V3M5 4h13l-3 4 3 4H5"/>',
        helmet: '<path d="M4 16a8 8 0 0 1 16 0v3H4z"/><path d="M12 8v5h8M4 19h16"/>',
        medal: '<circle cx="12" cy="15" r="6"/><path d="M8.5 3l3.5 7 3.5-7M12 12.5l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2-1.5-1.4 2-.3z"/>',
        trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
        gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M9 3l3 6 3-6"/>',
        peak: '<path d="M2 21L10 5l4 7 2-3 6 12z"/><path d="M8 9l2 2 2-2"/>',
        hill: '<path d="M2 20c3-8 6-10 9-10s6 2 11 10z"/>',
        cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7 1.5A3.8 3.8 0 0 0 6.5 19z"/>',
        check: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/>',
        bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
        loop: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
        moto: '<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17l3-7h5l3 7M13 10l2-4h3"/>',
        route: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>',
        pin: '<path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
        arrow: '<path d="M3 12h15M13 6l6 6-6 6"/>',
        sun: '<path d="M12 3v3M4.2 8.2l2.1 2.1M19.8 8.2l-2.1 2.1M3 18h18M7 18a5 5 0 0 1 10 0"/>',
        glass: '<path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4"/>',
        star: '<polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/>',
        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
        heart: '<path d="M12 21s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.6-9.5 9-9.5 9z"/><path d="M12 9v6M9 12h6"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        save: '<path d="M5 3h11l4 4v14H5z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/>'
    },
    blank() { return { seen: [], tot: { km: 0, n: 0, sec: 0, up: 0 }, rec: {}, months: {}, days: [], bornes: {}, vu: [] }; },
    load() {
        const s = AppStore.get(this.KEY, null), b = this.blank();
        if (!s || typeof s !== 'object') return b;
        return Object.assign(b, s, { tot: Object.assign(b.tot, s.tot || {}) });
    },
    save(s) { s.seen = s.seen.slice(-3000); AppStore.set(this.KEY, s, true); },
    ymd(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
    weekOf(day) { const [y, m, d] = day.split('-').map(Number); return Math.floor((Date.UTC(y, m - 1, d) / 86400000 + 3) / 7); },
    // Prend en compte les trajets pas encore comptés (idempotent : sûr à rappeler)
    ingest(rides, s) {
        let ch = false;
        (rides || []).forEach(r => {
            if (!r || r.id == null || s.seen.includes(r.id)) return;
            ch = true; s.seen.push(r.id);
            const st = r.stats || {}, km = parseFloat(r.dist) || 0, dur = st.dur || 0, day = this.ymd(r.id);
            s.tot.km += km; s.tot.n += 1; s.tot.sec += dur; s.tot.up += st.up || 0;
            if (!s.days.includes(day)) s.days.push(day);
            const ym = day.slice(0, 7); s.months[ym] = (s.months[ym] || 0) + km;
            const best = (k, v) => { if (v > 0 && (!s.rec[k] || v > s.rec[k].v)) s.rec[k] = { v, id: r.id }; };
            best('max', st.max || 0); best('dist', km); best('dur', dur); best('up', st.up || 0);
            if (st.hasAlt) best('alt', st.altMax || 0);
            if (dur >= 600) best('avg', st.avg || 0);
        });
        return ch;
    },
    streaks(s) {
        const wk = [...new Set(s.days.map(d => this.weekOf(d)))].sort((a, b) => a - b);
        let best = 0, run = 0, prev = null;
        wk.forEach(w => { run = (prev !== null && w === prev + 1) ? run + 1 : 1; prev = w; if (run > best) best = run; });
        const cur = this.weekOf(this.ymd(Date.now())), has = new Set(wk);
        let c = 0, w = has.has(cur) ? cur : cur - 1;
        while (has.has(w)) { c++; w--; }
        return { best, cur: c };
    },
    bestMonth(s) { let m = null; Object.keys(s.months).forEach(k => { if (!m || s.months[k] > s.months[m]) m = k; }); return m ? { ym: m, km: s.months[m] } : null; },
    // Valeurs courantes pour les bornes
    metrics(s) {
        const a = (k, d) => { try { return AppStore.get(k, d); } catch (e) { return d; } };
        const sec = a('moto_security_cfg', {}) || {};
        let med = false; try { med = typeof ModuleSecurity !== 'undefined' && ModuleSecurity.hasMed ? !!ModuleSecurity.hasMed() : false; } catch (e) {}
        return {
            km: s.tot.km, n: s.tot.n, up: s.tot.up, wk: this.streaks(s).best, hrs: s.tot.sec / 3600,
            alt: (s.rec.alt || {}).v || 0, far: (s.rec.dist || {}).v || 0, prof: (ModuleProfile.state.name && ModuleProfile.state.name !== 'Pilote Inconnu') ? 1 : 0, bak: s.exported ? 1 : 0,
            circ: (a('moto_playlists', []) || []).length, routes: (a('moto_saved_routes', []) || []).length,
            motos: (ModuleProfile.state.motos || []).length, med: med ? 1 : 0, contacts: (sec.contacts || []).length
        };
    },
    defs() {
        const nk = (t) => AppUnits.km(t).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
        const L = () => AppUnits.distLabel();
        const ct = (g, ic, k, t, n, d) => ({ g, ic, k, t, n, d });
        const kms = [[100, 'post'], [500, 'road'], [1000, 'compass'], [5000, 'globe'], [10000, 'rocket'], [25000, 'crown']].map(([t, ic]) => ct('Distance', ic, 'km', t, nk(t) + ' ' + L(), 'Rouler ' + nk(t) + ' ' + L() + ' au total'));
        return [
            ...kms,
            ct('Balades', 'flag', 'n', 1, 'Première balade', 'Enregistrer un premier trajet'),
            ct('Balades', 'helmet', 'n', 10, '10 balades', 'Enregistrer 10 trajets'),
            ct('Balades', 'medal', 'n', 50, '50 balades', 'Enregistrer 50 trajets'),
            ct('Balades', 'trophy', 'n', 100, '100 balades', 'Enregistrer 100 trajets'),
            ct('Balades', 'gem', 'n', 250, '250 balades', 'Enregistrer 250 trajets'),
            ct('Longue route', 'arrow', 'far', 100, 'Une balade de ' + nk(100) + ' ' + L(), 'Rouler ' + nk(100) + ' ' + L() + ' d\u2019une traite'),
            ct('Longue route', 'sun', 'far', 300, 'Une balade de ' + nk(300) + ' ' + L(), 'Rouler ' + nk(300) + ' ' + L() + ' d\u2019une traite'),
            ct('Temps', 'glass', 'hrs', 10, '10 heures', 'Cumuler 10 h de route'),
            ct('Temps', 'clock', 'hrs', 50, '50 heures', 'Cumuler 50 h de route'),
            ct('Temps', 'star', 'hrs', 100, '100 heures', 'Cumuler 100 h de route'),
            ct('Dénivelé', 'hill', 'up', 1000, '1 000 m D+', 'Cumuler 1 000 m de dénivelé'),
            ct('Dénivelé', 'up', 'up', 10000, '10 000 m D+', 'Cumuler 10 000 m de dénivelé'),
            ct('Dénivelé', 'peak', 'up', 50000, '50 000 m D+', 'Cumuler 50 000 m de dénivelé'),
            ct('Altitude', 'alt', 'alt', 1000, 'Cap des 1 000 m', 'Atteindre 1 000 m d\u2019altitude'),
            ct('Altitude', 'cloud', 'alt', 2000, 'Cap des 2 000 m', 'Atteindre 2 000 m d\u2019altitude'),
            ct('Régularité', 'check', 'wk', 2, '2 semaines', 'Rouler 2 semaines de suite'),
            ct('Régularité', 'flame', 'wk', 4, '4 semaines', 'Rouler 4 semaines de suite'),
            ct('Régularité', 'bolt', 'wk', 8, '8 semaines', 'Rouler 8 semaines de suite'),
            ct('Régularité', 'loop', 'wk', 12, '12 semaines', 'Rouler 12 semaines de suite'),
            ct('Découverte', 'moto', 'motos', 1, 'Au garage', 'Ajouter une moto'),
            ct('Découverte', 'user', 'prof', 1, 'À mon nom', 'Choisir un nom de pilote'),
            ct('Découverte', 'pin', 'circ', 1, 'Circuit créé', 'Créer un circuit'),
            ct('Découverte', 'route', 'routes', 5, '5 itinéraires', 'Enregistrer 5 itinéraires'),
            ct('Découverte', 'save', 'bak', 1, 'Sauvegardé', 'Exporter une sauvegarde'),
            ct('Sécurité', 'phone', 'contacts', 1, 'Contact d\u2019urgence', 'Ajouter un contact d\u2019urgence'),
            ct('Sécurité', 'heart', 'med', 1, 'Fiche médicale', 'Remplir la fiche médicale')
        ];
    },
    // Débloque ce qui doit l'être (les nouveautés restent marquées jusqu'à l'ouverture de l'onglet)
    evaluate(s) {
        const m = this.metrics(s); let ch = false;
        this.defs().forEach(d => { const id = d.k + d.t; if (m[d.k] >= d.t && !s.bornes[id]) { s.bornes[id] = Date.now(); ch = true; } });
        return ch;
    },
    // Met à jour les stats et annonce tout ce qui est nouveau (record ou borne), d'où qu'il vienne
    refresh() {
        const before = this.load(), s = this.load();
        let ch = this.ingest(AppStore.get('moto_recorded_rides', []), s);
        if (this.evaluate(s)) ch = true;
        if (ch) { this.save(s); try { this.announce(before, s); } catch (e) { console.warn('records', e); } }
        return s;
    },
    fmtDur(sec) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h > 0 ? h + ' h ' + String(m).padStart(2, '0') : m + ' min'; },
    fmtDate(t) { return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); },
    svg(k) { return `<svg viewBox="0 0 24 24">${this.ic[k] || ''}</svg>`; },
    renderRecords(s) {
        const el = document.getElementById('pf-records'); if (!el) return;
        const num = (v, d) => v.toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 0 : d });
        const dt = (k) => s.rec[k] ? this.fmtDate(s.rec[k].id) : '';
        const bm = this.bestMonth(s), st = this.streaks(s);
        const rows = [];
        if (s.rec.max) rows.push(['speed', 'Vitesse max', dt('max'), num(AppUnits.spd(s.rec.max.v)), AppUnits.speedLabel()]);
        if (s.rec.dist) rows.push(['road', 'Plus longue balade', dt('dist'), num(AppUnits.km(s.rec.dist.v), 1), AppUnits.distLabel()]);
        if (s.rec.dur) rows.push(['clock', 'Plus longue durée', dt('dur'), this.fmtDur(s.rec.dur.v), '']);
        if (s.rec.avg) rows.push(['avg', 'Meilleure moyenne', dt('avg'), num(AppUnits.spd(s.rec.avg.v)), AppUnits.speedLabel()]);
        if (s.rec.up) rows.push(['up', 'Plus gros dénivelé', dt('up'), num(s.rec.up.v), 'm D+']);
        if (s.rec.alt) rows.push(['alt', 'Altitude max', dt('alt'), num(s.rec.alt.v), 'm']);
        if (bm) rows.push(['cal', 'Meilleur mois', new Date(bm.ym + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), num(AppUnits.km(bm.km), 0), AppUnits.distLabel()]);
        if (st.best > 0) rows.push(['flame', 'Plus longue série', 'semaines de suite', String(st.best), 'sem.']);
        el.innerHTML = `<div class="pf-tot">
            <div><b>${num(AppUnits.km(s.tot.km), 0)}</b><span>${AppUnits.distLabel()}</span></div>
            <div><b>${s.tot.n}</b><span>Balades</span></div>
            <div><b>${Math.round(s.tot.sec / 3600)}</b><span>Heures</span></div></div>` +
            (rows.length ? `<div class="pf-list">${rows.map(r => `<div class="pf-rec"><div class="ic">${this.svg(r[0])}</div><div class="tx"><b>${r[1]}</b><span>${r[2]}</span></div><div class="v">${r[3]}<small>${r[4]}</small></div></div>`).join('')}</div>`
                : `<div class="pf-empty">Pas encore de record.<br>Enregistre une balade depuis la carte et tes meilleurs chiffres apparaîtront ici.</div>`);
    },
    renderBornes(s) {
        const el = document.getElementById('pf-bornes'); if (!el) return;
        const m = this.metrics(s), defs = this.defs(), vu = new Set(s.vu || []);
        const next = defs.filter(d => m[d.k] < d.t && ['km', 'n', 'up', 'wk', 'hrs'].includes(d.k)).sort((a, b) => (m[b.k] / b.t) - (m[a.k] / a.t))[0];
        let html = '';
        if (next) {
            const p = Math.max(0, Math.min(100, Math.round(m[next.k] / next.t * 100)));
            html += `<div class="pf-next"><div class="t">Prochaine borne</div><div class="n">${next.n}</div><div class="pf-bar"><i style="width:${p}%"></i></div></div>`;
        }
        const groups = []; defs.forEach(d => { if (!groups.includes(d.g)) groups.push(d.g); });
        groups.forEach(g => {
            html += `<div class="pf-grg pf-grp">${g}</div><div class="pf-grid">` + defs.filter(d => d.g === g).map(d => {
                const id = d.k + d.t, got = !!s.bornes[id], nw = got && !vu.has(id);
                return `<div class="pf-b ${got ? '' : 'lock'}" data-b="${id}">${nw ? '<em class="nw">Nouveau</em>' : ''}<div class="post">${this.svg(d.ic)}</div><b>${d.n}</b><span>${got ? this.fmtDate(s.bornes[id]) : d.d}</span></div>`;
            }).join('') + '</div>';
        });
        el.innerHTML = html;
    },
    // Notification après un trajet : nouveaux records et nouvelles bornes
    announce(before, after) {
        const num = (v, d) => v.toLocaleString('fr-FR', { maximumFractionDigits: d || 0 });
        const names = { max: 'Vitesse max', dist: 'Plus longue balade', dur: 'Plus longue durée', avg: 'Meilleure moyenne', up: 'Plus gros dénivelé', alt: 'Altitude max' };
        const fmt = { max: v => num(AppUnits.spd(v)) + ' ' + AppUnits.speedLabel(), dist: v => num(AppUnits.km(v), 1) + ' ' + AppUnits.distLabel(), dur: v => this.fmtDur(v), avg: v => num(AppUnits.spd(v)) + ' ' + AppUnits.speedLabel(), up: v => num(v) + ' m D+', alt: v => num(v) + ' m' };
        const recs = before.seen.length ? Object.keys(after.rec).filter(k => names[k] && (!before.rec[k] || after.rec[k].v > before.rec[k].v)) : [];
        const bor = Object.keys(after.bornes).filter(id => !before.bornes[id]);
        const defs = this.defs(), icon = (c) => `<svg style="width:26px;height:26px;color:#ff9f0a" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${c}</svg>`;
        const show = (t, x, ic) => { try { ModuleCommunity.showNotification(t, x, icon(ic)); } catch (e) {} };
        const q = [];
        if (recs.length) q.push(recs.length === 1 ? ['Nouveau record !', names[recs[0]] + ' : ' + fmt[recs[0]](after.rec[recs[0]].v), this.ic.trophy] : ['Nouveaux records !', recs.map(k => names[k]).join(', '), this.ic.trophy]);
        // Les nouvelles bornes ne passent plus par un message : pastille « Nouveau » sur l'onglet Profil et sur la borne (voir badge)
        if (!q.length || !this._ready) return;   // et rien au démarrage : seulement pour un trajet qui vient de se terminer
        q.forEach((n, i) => setTimeout(() => show(n[0], n[1], n[2]), 400 + i * 4200));
    },
    newCount(s) { const vu = new Set(s.vu || []); return Object.keys(s.bornes).filter(id => !vu.has(id)).length; },
    markSeen() { const s = this.load(); s.vu = Object.keys(s.bornes); this.save(s); this.badge(s); },
    badge(s) { const h = this.newCount(s || this.load()) === 0; ['pf-new', 'nav-pf-new'].forEach(id => { const d = document.getElementById(id); if (d) d.hidden = h; }); },
    tab(id) {
        document.querySelectorAll('#pf-tabs button').forEach(b => b.classList.toggle('active', b.dataset.pf === id));
        document.querySelectorAll('#view-profile .pf-pane').forEach(p => p.classList.toggle('active', p.id === id));
        const s = this.refresh();
        if (id === 'pf-records') this.renderRecords(s);
        if (id === 'pf-bornes') { this.renderBornes(s); this._pend = true; }
        else if (this._pend) { this._pend = false; this.markSeen(); }
        this.badge();
        const v = document.getElementById('view-profile'); if (v) v.scrollTo({ top: 0 });
    },
    init() {
        const bar = document.getElementById('pf-tabs'); if (!bar) return;
        bar.addEventListener('click', (e) => { const b = e.target.closest('button[data-pf]'); if (b) this.tab(b.dataset.pf); });
        // Compte chaque nouveau trajet dès qu'il est enregistré
        if (typeof ModuleGPS !== 'undefined' && !ModuleGPS._pfWrapped) {
            const orig = ModuleGPS.saveRecordedRide; ModuleGPS._pfWrapped = true;
            ModuleGPS.saveRecordedRide = function () { const r = orig.apply(this, arguments); try { ProfileStats.refresh(); ProfileStats.badge(); } catch (e) { console.warn('records', e); } return r; };
        }
        // Annonce un déblocage dès que la donnée concernée est enregistrée, quel que soit l'onglet
        if (!Storage.prototype._pfWrapped) {
            const set = Storage.prototype.setItem; Storage.prototype._pfWrapped = true;
            const watch = /^(moto_(security_cfg|medical|playlists|saved_routes|recorded_rides)|motoapp_profile_)/;
            let t = null;
            Storage.prototype.setItem = function (k, v) {
                const r = set.apply(this, arguments);
                if (this === window.localStorage && watch.test(String(k))) { clearTimeout(t); t = setTimeout(() => { try { ProfileStats.badge(ProfileStats.refresh()); } catch (e) {} }, 700); }
                return r;
            };
        }
        const nav = document.querySelector('.nav-btn[data-target="view-profile"]');
        if (nav) nav.addEventListener('click', () => { const on = document.querySelector('#pf-tabs button.active'); this.tab(on ? on.dataset.pf : 'pf-garage'); });
        // Marque les bornes vues quand on quitte l'onglet Bornes via la navigation
        document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => { if (b.dataset.target !== 'view-profile' && this._pend) { this._pend = false; this.markSeen(); } }));
        this.badge(this.refresh());
        setTimeout(() => { try { this.badge(this.refresh()); } catch (e) {} this._ready = true; }, 4000);
        // Un déblocage venu d'ailleurs (fiche médicale, circuit, contact…) est annoncé au changement d'onglet
        document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => setTimeout(() => { try { this.badge(this.refresh()); } catch (e) {} }, 300)));
    }
};
ProfileStats.init();
