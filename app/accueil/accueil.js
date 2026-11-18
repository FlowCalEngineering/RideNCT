/* ACCUEIL — résumé du jour et accès rapides. Lit les données des autres modules (aucun serveur) et se met à jour tant que la page est affichée. */
const ModuleHome = {
    key: '', _t: null, _wasRiding: false,
    $(id) { return document.getElementById(id); },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    get(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    active() { const v = this.$('view-home'); return !!(v && v.classList.contains('active')); },
    go(view) { try { AppManager.switchView(view); } catch (e) {} },

    init() {
        const root = this.$('hm'); if (!root) return;
        root.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) this.act(b.dataset.a, b.dataset.v); });
        this.setupDrag(root);
        this.cfg = this.loadCfg();
        this.paint();
        this._t = setInterval(() => { this.trackGroup(); if (this.active()) this.paint(); }, 1500);
        new MutationObserver(() => { if (this.active()) this.paint(); }).observe(this.$('view-home'), { attributes: true, attributeFilter: ['class'] });
        this.hintInit();
    },
    // Astuce de première ouverture : « maintiens une icône pour la déplacer » (une seule fois, effacée au premier contact)
    HINT_KEY: 'moto_hint_home',
    hintSeen() { try { return localStorage.getItem(this.HINT_KEY) === '1'; } catch (e) { return true; } },
    hintInit() {
        if (this.hintSeen()) return;
        let tries = 0;
        const t = setInterval(() => {
            if (this.hintSeen() || ++tries > 40) return clearInterval(t);
            // on attend que l'accueil soit visible et qu'aucune fenêtre (permissions, etc.) ne soit ouverte
            if (!this.active() || document.querySelector('.ad-overlay.show') || this.editing) return;
            clearInterval(t); this.hintShow();
        }, 1500);
    },
    hintShow() {
        if (document.getElementById('hm-hint')) return;
        const d = document.createElement('div'); d.id = 'hm-hint'; d.setAttribute('role', 'status');
        d.innerHTML = '<b>Astuce</b><span>Maintiens une icône appuyée pour la déplacer ou personnaliser ton accueil.</span><button type="button" aria-label="Fermer">OK</button>';
        document.body.appendChild(d);
        const done = () => { try { localStorage.setItem(this.HINT_KEY, '1'); } catch (e) {} d.classList.remove('show'); setTimeout(() => d.remove(), 300); document.removeEventListener('pointerdown', onDown, true); clearTimeout(tm); };
        const onDown = (e) => { if (!d.contains(e.target) || e.target.tagName === 'BUTTON') done(); };
        d.querySelector('button').addEventListener('click', done);
        document.addEventListener('pointerdown', onDown, true);
        const tm = setTimeout(done, 9000);
        requestAnimationFrame(() => d.classList.add('show'));
        this._hintDone = done;
    },

    /* ---------- données ---------- */
    riding() { try { return !!ModuleDashboard.state.isRiding; } catch (e) { return false; } },
    rides() { try { const r = AppStore.get('moto_recorded_rides', []); return Array.isArray(r) ? r : []; } catch (e) { return []; } },
    firstName() { try { const n = String(ModuleProfile.state.name || '').trim(); return !n || /^pilote inconnu$/i.test(n) ? '' : n.split(/\s+/)[0]; } catch (e) { return ''; } },
    weather() {
        let d = null; try { d = ModuleMapWeather.state.data; } catch (e) {} if (!d || !d.current) return null;
        const c = d.current; let kind = 'clear', day = c.is_day !== 0;
        try { kind = ModuleMapWeather.info(c.weather_code, day).kind; } catch (e) {}
        let pop = 0, at = null;
        try { const H = d.hourly, t0 = new Date(c.time).getTime(); let i0 = H.time.findIndex(x => new Date(x).getTime() >= t0 - 1800000); if (i0 < 0) i0 = 0; for (let i = i0; i < Math.min(i0 + 6, H.time.length); i++) { const p = H.precipitation_probability[i] || 0; if (p > pop) { pop = p; at = H.time[i].slice(11, 13) * 1; } } } catch (e) {}
        return { t: Math.round(c.temperature_2m), wind: AppUnits.spd(c.wind_speed_10m), kind, day, pop: Math.round(pop), at };
    },
    nearby() {
        let n = 0, near = null; try { n = ModuleCommunity.nearRiders().length; } catch (e) {}
        try { const G = ModuleGPS, ref = G.state.lastKnownCoords; if (ref) (G.state.reportsDanger || []).forEach(r => { const km = G.poiDistKm(ref, r.pos); if (km <= 20 && (!near || km < near.km)) near = { km, label: r.label }; }); } catch (e) {}
        return { n, near };
    },
    track() { let t = null; try { t = ModuleMusic.current(); } catch (e) {} let playing = false; try { playing = !!(ModuleMusic.state.audioObj && !ModuleMusic.state.audioObj.paused); } catch (e) {} return { t, playing }; },
    nextTask() {
        try {
            const M = ModuleMaintenance, motos = ModuleProfile.state.motos || []; let best = null;
            (M.state.tasks || []).forEach(t => { const mo = motos.find(m => m.id === t.motoId); if (!mo) return; const st = M.taskStatus(t, mo); if (!best || st.ratio > best.st.ratio) best = { t, st }; });
            return best ? { title: best.t.title || 'Entretien', text: M.remainingText(best.t, best.st), pct: Math.max(4, Math.min(100, best.st.pct)), level: best.st.level } : null;
        } catch (e) { return null; }
    },
    invite() { try { return ModuleRoute.invites()[0] || null; } catch (e) { return null; } },
    sums() {
        const rs = this.rides(), now = new Date(), wk = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime(), mo = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        let w = 0, wn = 0, m = 0; rs.forEach(r => { const km = parseFloat(r.dist) || 0; if (r.id >= wk) { w += km; wn++; } if (r.id >= mo) m += km; });
        return { w, wn, m };
    },
    badge(km) { const L = [1000, 500, 250, 100]; for (const x of L) if (km >= x) return 'Badge ' + x + ' km !'; const nx = km < 100 ? 100 : 250; return 'Encore ' + this.dist(nx - km, 0) + ' pour le badge'; },
    dist(km, d) { try { return AppUnits.km(km).toFixed(d == null ? 0 : d) + ' ' + AppUnits.distLabel(); } catch (e) { return Math.round(km) + ' km'; } },
    fmtDur(s) { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + ' h ' + String(m).padStart(2, '0') : m + ' min'; },
    /* Groupe vocal retrouvé pendant la sortie (pour « Ça roulait avec ») */
    trackGroup() {
        const riding = this.riding(); let st = null; try { st = ModuleIntercom.state; } catch (e) {}
        if (riding && !this._wasRiding) this.set('moto_home_group', null);
        this._wasRiding = riding;
        if (!riding || !st || !st.isConnected) return;
        const g = this.get('moto_home_group', null) || { names: [], room: '' };
        (st.participants || []).forEach(p => { const n = p.senderName; if (n && !g.names.includes(n)) g.names.push(n); });
        g.room = st.currentRoomName || g.room; g.t = Date.now(); this.set('moto_home_group', g);
    },
    path(rec) {
        try { const c = rec.geojson && rec.geojson.coordinates; if (!c || c.length < 2) return ''; return (typeof ModuleRecap !== 'undefined' && ModuleRecap.routeSvg(c, 340, 110)) || ''; } catch (e) { return ''; }
    },

    /* ---------- personnalisation : blocs (tuiles) et raccourcis choisis par l'utilisateur ---------- */
    KEY: 'moto_home_cfg', editing: false, drag: null, _swallow: 0, dragEnd: 0,
    /* ---------- icônes : même style que le reste de l'appli (traits arrondis, couleur du texte) ---------- */
    IC: {
        home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
        work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
        fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M3 21h12"/><path d="M6 8h6"/><path d="M14 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
        cafe: '<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2v3M12 2v3"/>',
        resto: '<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10"/><path d="M17 21V3c-2.5 1.5-3.5 4.5-3.5 8H17"/>',
        parking: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 17V7.5H13a3 3 0 0 1 0 6H9.5"/>',
        map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
        route: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
        meet: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
        medal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
        bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
        cloud: '<path d="M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6 1.3A3.4 3.4 0 0 1 17 18z"/>',
        rain: '<path d="M7 15a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6 1.3A3.4 3.4 0 0 1 17 15"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
        snow: '<path d="M12 2v20M4 7l16 10M20 7L4 17"/>',
        storm: '<path d="M7 15a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6 1.3A3.4 3.4 0 0 1 17 15"/><path d="M12.5 12l-2.5 4h4l-2.5 5"/>',
        fog: '<path d="M4 8h16M6 12h14M4 16h12M8 20h10"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
        size: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        rider: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5l3.5-6.5h5l3.5 6.5"/><path d="M9 10L7.5 7H5M14 10l-1.5-3.5h3"/>'
    },
    VMAP: { start: 'play', radar: 'radio', danger: 'alert', weather: 'cloud', atelier: 'tool', security: 'shield', profile: 'user', settings: 'settings', intercom: 'headphones', group: 'users', music: 'music' },
    ico(k) {
        const raw = this.IC[k] || (typeof VI !== 'undefined' && (VI[this.VMAP[k] || k] || '').replace(/^<svg[^>]*>|<\/svg>$/g, '')) || '';
        return '<svg class="hi" viewBox="0 0 24 24" aria-hidden="true">' + raw + '</svg>';
    },

    BLOCKS: {
        hero: { ico: 'rider', label: 'Bouton Démarrer', desc: 'Le grand bouton pour lancer une balade', wide: true },
        places: { ico: 'bolt', label: 'Raccourcis', desc: 'Une rangée de boutons : carte, intercom, Maison…', wide: true },
        invite: { ico: 'mail', label: 'Invitations', desc: 'Invitations de groupe vocal à accepter ou refuser', wide: true },
        weather: { ico: 'sun', label: 'Météo', desc: 'Température, vent et pluie à venir' },
        near: { ico: 'users', label: 'Autour de moi', desc: 'Motards proches et alertes de route' },
        music: { ico: 'music', label: 'Musique', desc: 'Reprendre ou mettre en pause le dernier titre' },
        atelier: { ico: 'tool', label: 'Atelier', desc: 'Prochain entretien de ta moto' },
        group: { ico: 'headphones', label: 'Groupe vocal', desc: 'Ton groupe en cours et ses participants' },
        radar: { ico: 'radio', label: 'Radar', desc: 'Activer ou couper le radar des motards' },
        meet: { ico: 'meet', label: 'Mode rencontre', desc: 'Activer ou couper le mode rencontre' },
        lastride: { ico: 'flag', label: 'Dernière sortie', desc: 'Distance, durée et date de ta dernière balade' },
        week: { ico: 'calendar', label: 'Cette semaine', desc: 'Kilomètres et sorties de la semaine' },
        month: { ico: 'medal', label: 'Ce mois', desc: 'Kilomètres du mois et badge' }
    },
    SHORTCUTS: {
        start: { ico: 'start', label: 'Démarrer' }, home: { ico: 'home', label: 'Maison' }, work: { ico: 'work', label: 'Travail' },
        fuel: { ico: 'fuel', label: 'Essence' }, cafe: { ico: 'cafe', label: 'Café' }, resto: { ico: 'resto', label: 'Resto' }, parking: { ico: 'parking', label: 'Parking' },
        map: { ico: 'map', label: 'Carte' }, route: { ico: 'route', label: 'Route' }, intercom: { ico: 'headphones', label: 'Intercom' }, group: { ico: 'users', label: 'Groupe' },
        radar: { ico: 'radio', label: 'Radar' }, meet: { ico: 'meet', label: 'Rencontre' }, danger: { ico: 'danger', label: 'Danger' },
        music: { ico: 'music', label: 'Musique' }, weather: { ico: 'weather', label: 'Météo' }, atelier: { ico: 'tool', label: 'Atelier' },
        security: { ico: 'security', label: 'Sécurité' }, aide: { ico: 'tool', label: 'Aide' }, profile: { ico: 'profile', label: 'Profil' }, settings: { ico: 'settings', label: 'Réglages' }
    },
    VIEWS: { map: 'view-gps', route: 'view-dashboard', intercom: 'view-intercom', group: 'view-community', music: 'view-music', weather: 'view-weather', atelier: 'view-maintenance', security: 'view-security', profile: 'view-profile', settings: 'view-settings' },
    NEAREST: { fuel: 'station essence la plus proche', cafe: 'café le plus proche', resto: 'restaurant le plus proche', parking: 'parking le plus proche' },
    defaultCfg() { return { v: 1, aide: 1, blocks: [{ t: 'hero' }, { t: 'places', items: ['home', 'work', 'fuel', 'aide'] }, { t: 'invite' }, { t: 'weather' }, { t: 'near' }, { t: 'music' }, { t: 'atelier' }] }; },
    loadCfg() {
        const c = this.get(this.KEY, null); if (!c || !Array.isArray(c.blocks)) return this.defaultCfg();
        const seen = new Set(), blocks = [];
        c.blocks.forEach(b => { if (b && this.BLOCKS[b.t] && !seen.has(b.t)) { seen.add(b.t); const o = { t: b.t }; if (b.w && !this.BLOCKS[b.t].wide) o.w = true; if (b.t === 'places') o.items = (Array.isArray(b.items) ? b.items : []).filter((k, i, a) => this.SHORTCUTS[k] && a.indexOf(k) === i); blocks.push(o); } });
        // Nouveau raccourci « Aide » : ajouté une seule fois aux accueils déjà personnalisés (on peut le retirer ensuite)
        const pl = blocks.find(b => b.t === 'places'); if (!c.aide && pl && pl.items.length < 4 && !pl.items.includes('aide')) pl.items.push('aide');
        return { v: 1, aide: 1, blocks };
    },
    saveCfg() { this.set(this.KEY, this.cfg); this.key = ''; this.paint(); },

    /* ---------- affichage ---------- */
    context() {
        const rides = this.rides(), last = rides.reduce((a, r) => (!a || r.id > a.id ? r : a), null), riding = this.riding();
        const after = !riding && last && (Date.now() - last.id) < 6 * 3600000 && this.get('moto_home_dismiss', 0) !== last.id;
        let G = { on: false, room: '', n: 0 }, R = { mode: 'off', n: 0 }, M = false;
        try { const st = ModuleIntercom.state; G = { on: !!st.isConnected, room: st.currentRoomName || '', n: (st.participants || []).length + 1 }; M = !!st.autoModeActive; } catch (e) {}
        try { R = { mode: ModuleCommunity.state.radarMode || 'off', n: ModuleCommunity.nearRiders().length }; } catch (e) {}
        let grp = null; if (after) { const g = this.get('moto_home_group', null); if (g && g.names && g.names.length && Math.abs((g.t || 0) - last.id) < 1800000) grp = g; }
        return { riding, last, after, W: this.weather(), N: this.nearby(), T: this.track(), A: this.nextTask(), I: this.invite(), S: this.sums(), name: this.firstName(), G, R, M, grp };
    },
    paint() {
        const root = this.$('hm'); if (!root || this.drag) return;
        if (!this.cfg) this.cfg = this.loadCfg();
        const X = this.context(), { riding, last, after, W, N, T, A, I, S, name, G, R, M, grp } = X; let av = null; try { av = ModuleProfile.state.avatar; } catch (e) {}
        const snap = { cfg: this.cfg, ed: this.editing, riding, after, lastId: last && last.id, W, N: { n: N.n, near: N.near && { l: N.near.label, k: Math.round(N.near.km) } }, T: { id: T.t && T.t.id, ti: T.t && T.t.title, ar: T.t && T.t.artist, p: T.playing }, A, I: I && I.id, name, av: !!av, S: { w: Math.round(S.w), wn: S.wn, m: Math.round(S.m) }, G, R, M, grp: grp && grp.names.join(','), d: new Date().getHours(), u: (() => { try { return AppUnits.distLabel(); } catch (e) { return ''; } })() };
        let chip = ''; try { const st = AppAuth.cached(); if (st && st.k === 'inactive' && AppSub.available()) { const pr = AppSub.price(); chip = '<button type="button" class="hm-sub-chip" data-a="sub">' + (pr ? 'Abonnement · ' + this.esc(pr) + '/mois' : 'Abonnement') + '</button>'; } } catch (e) {}
        snap.chip = chip; try { snap.bdg = AppAuth.statusBadge(AppAuth.cached()); } catch (e) {}
        const key = JSON.stringify(snap); if (key === this.key) return; this.key = key;

        const hello = name ? 'Salut ' + name + ' !' : 'Salut motard !';
        let sub = 'Prêt à rouler ?';
        if (W) sub = ({ clear: W.day ? 'Belle journée pour rouler' : 'Belle soirée, route dégagée', cloud: 'Ciel couvert, mais ça roule', rain: 'Pense à ta tenue de pluie', snow: 'Neige : prudence aujourd\'hui', storm: 'Orage : prudence aujourd\'hui', fog: 'Brouillard : sois visible' })[W.kind] || sub;
        if (this.editing) sub = 'Glisse un bloc pour le déplacer';
        let bdg = ''; try { bdg = AppAuth.statusBadge(AppAuth.cached()); } catch (e) {}
        const avatar = '<span class="hm-mew"><button type="button" class="hm-me" data-a="view" data-v="view-profile" aria-label="Mon profil">' + (av ? '<img alt="" src="' + this.esc(av) + '">' : this.esc((name || 'M').charAt(0).toUpperCase())) + '</button>' + bdg + '</span>';
        const pen = '<button type="button" class="hm-pen' + (this.editing ? ' on' : '') + '" data-a="edit" aria-label="' + (this.editing ? 'Terminer la personnalisation' : 'Personnaliser l\'accueil') + '">' + (this.editing ? this.ico('check') + 'Terminé' : this.ico('pen')) + '</button>';
        const h = [];
        if (after) { const wd = new Date(last.id).toLocaleDateString('fr-FR', { weekday: 'long' }), st = last.stats || {}; h.push('<div class="hm-top">' + avatar + '<div><h1>Belle sortie !</h1><div class="hm-sub">' + this.esc(wd.charAt(0).toUpperCase() + wd.slice(1) + ' · ' + this.fmtDur(st.dur) + (grp ? ' avec ' + grp.names.join(', ') : '')) + '</div></div>' + pen + '</div>'); }
        else h.push('<div class="hm-top">' + avatar + '<div><h1>' + this.esc(hello) + '</h1><div class="hm-sub">' + this.esc(sub) + '</div>' + chip + '</div>' + pen + '</div>');

        const blk = (t, inner, o) => '<div class="hm-blk' + (o.w ? ' w' : '') + (this.editing && o.ed ? ' ed' : '') + '" data-b="' + t + '">' + inner + (this.editing && o.ed ? this.ctlHtml(t, o) : '') + '</div>';
        const items = [];
        // Après une sortie : bilan et totaux en tête (en plus des blocs choisis)
        if (after) {
            items.push(blk('_bilan', this.bilanHtml(last), { w: true }));
            if (!this.cfg.blocks.some(b => b.t === 'week')) items.push(blk('_week', this.weekHtml(S), {}));
            if (!this.cfg.blocks.some(b => b.t === 'month')) items.push(blk('_month', this.monthHtml(S), {}));
            if (grp) items.push(blk('_grp', '<div class="hm-t hm-grn" style="min-height:0"><div class="l">Ça roulait avec</div><div class="ic">' + this.ico('users') + '</div><div class="v s">' + this.esc(grp.names.join(', ')) + '</div><div class="m">' + this.esc(grp.room ? 'Groupe « ' + grp.room + ' » terminé' : 'Groupe vocal terminé') + '</div></div>', { w: true }));
        }
        const n = this.cfg.blocks.length;
        this.cfg.blocks.forEach((b, i) => {
            const def = this.BLOCKS[b.t], w = !!(def.wide || b.w), o = { w, ed: true, i, n, canSize: !def.wide, first: i === 0, last: i === n - 1 };
            const inner = this.blockHtml(b, X, after);
            if (inner === '' && !this.editing) return;
            items.push(blk(b.t, inner || '<div class="hm-t hm-ph"><div class="l">' + def.label + '</div><div class="m">Rien à afficher pour l\'instant</div></div>', o));
        });
        if (!this.cfg.blocks.length && !this.editing) h.push('<div class="hm-empty">Ton accueil est vide.<button type="button" class="hm-big" data-a="edit">Personnaliser</button></div>');
        else h.push('<div class="hm-grid">' + items.join('') + '</div>');
        if (this.editing) h.push('<button type="button" class="hm-add" data-a="add">' + this.ico('plus') + 'Ajouter un bloc</button><div class="hm-ban"><span>Maintiens un bloc ou un raccourci appuyé, puis glisse-le pour le déplacer.</span><button type="button" data-a="reset">Réinitialiser</button></div>');
        if (after && !this.editing) h.push('<button type="button" class="hm-link" data-a="dismiss">Fermer le bilan</button>');
        root.innerHTML = h.join('');
        this.hydrateMap(root);
    },
    ctlHtml(t, o) {
        return '<div class="hm-ctl">' + (o.canSize ? '<button type="button" data-a="sz" data-v="' + t + '" aria-label="Changer la taille">' + this.ico('size') + '</button>' : '') + '<button type="button" class="x" data-a="rm" data-v="' + t + '" aria-label="Retirer">' + this.ico('close') + '</button></div>';
    },
    blockHtml(b, X, after) {
        const { riding, last, W, N, T, A, I, S, G, R, M } = X;
        switch (b.t) {
            case 'hero':
                if (after) return '<button type="button" class="hm-big" data-a="go">' + this.ico('start') + 'Nouvelle balade</button>';
                return riding ? '<div class="hm-hero riding"><div class="q">Balade en cours</div><div class="h">Bonne route !</div><div class="bk">' + this.ico('rider') + '</div><button type="button" class="go" data-a="go">' + this.ico('start') + 'Retour à la route</button></div>'
                    : '<div class="hm-hero"><div class="q">On y va ?</div><div class="h">Prêt pour une balade ?</div><div class="bk">' + this.ico('rider') + '</div><button type="button" class="go" data-a="go">' + this.ico('start') + 'Démarrer</button></div>';
            case 'places': return this.placesHtml(b.items || [], G, R, M);
            case 'invite': return this.inviteHtml(I);
            case 'weather': return this.weatherHtml(W);
            case 'near': return this.nearHtml(N);
            case 'music': return this.musicHtml(T);
            case 'atelier': return this.atelierHtml(A);
            case 'group': return '<button type="button" class="hm-t hm-sky" data-a="view" data-v="view-intercom"><div class="l">Groupe vocal</div><div class="ic">' + this.ico('headphones') + '</div><div class="v s">' + this.esc(G.on ? (G.room || 'Connecté') : 'Non connecté') + '</div><div class="m">' + (G.on ? G.n + ' personne' + (G.n > 1 ? 's' : '') + ' dans le groupe' : 'Touche pour rejoindre') + '</div></button>';
            case 'radar': return '<button type="button" class="hm-t hm-grn' + (R.mode !== 'off' ? ' on' : '') + '" data-a="radar"><div class="l">Radar</div><div class="ic">' + this.ico('radio') + '</div><div class="v s">' + (R.mode === 'off' ? 'Éteint' : R.mode === 'friends' ? 'Amis seulement' : 'Tous les motards') + '</div><div class="m">' + (R.mode === 'off' ? 'Touche pour activer' : R.n + ' motard' + (R.n > 1 ? 's' : '') + ' autour') + '</div></button>';
            case 'meet': return '<button type="button" class="hm-t hm-pur' + (M ? ' on' : '') + '" data-a="meet"><div class="l">Mode rencontre</div><div class="ic">' + this.ico('meet') + '</div><div class="v s">' + (M ? 'Activé' : 'Désactivé') + '</div><div class="m">Touche pour ' + (M ? 'couper' : 'activer') + '</div></button>';
            case 'lastride': {
                if (!last) return '<button type="button" class="hm-t hm-org" data-a="view" data-v="view-gps"><div class="l">Dernière sortie</div><div class="ic">' + this.ico('flag') + '</div><div class="v s">Aucune sortie</div><div class="m">Lance ta première balade</div></button>';
                const wd = new Date(last.id).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
                return '<button type="button" class="hm-t hm-org" data-a="view" data-v="view-gps"><div class="l">Dernière sortie</div><div class="ic">' + this.ico('flag') + '</div><div class="v">' + this.esc(this.dist(parseFloat(last.dist) || 0, 1)) + '</div><div class="m">' + this.esc(wd + ' · ' + this.fmtDur((last.stats || {}).dur)) + '</div></button>';
            }
            case 'week': return this.weekHtml(S);
            case 'month': return this.monthHtml(S);
        }
        return '';
    },
    weekHtml(S) { return '<div class="hm-t hm-sky"><div class="l">Cette semaine</div><div class="ic">' + this.ico('calendar') + '</div><div class="v">' + this.esc(this.dist(S.w)) + '</div><div class="m">' + S.wn + ' sortie' + (S.wn > 1 ? 's' : '') + '</div></div>'; },
    monthHtml(S) { return '<div class="hm-t hm-org"><div class="l">Ce mois</div><div class="ic">' + this.ico('medal') + '</div><div class="v">' + this.esc(this.dist(S.m)) + '</div><div class="m">' + this.esc(this.badge(S.m)) + '</div></div>'; },
    bilanHtml(last) {
        const st = last.stats || {}, u = (() => { try { return AppUnits.speedLabel(); } catch (e) { return 'km/h'; } })(), sp = v => { try { return AppUnits.spd(v); } catch (e) { return v; } };
        const sn = st.sens || {}, lean = sn.lean && sn.lean.n ? sn.lean : null, ch = sn.chrono && sn.chrono.laps && sn.chrono.laps.length ? sn.chrono : null;
        let cols = [['d', this.esc(this.dist(parseFloat(last.dist) || 0, 1)), 'distance'], ['a', String(sp(st.avg || 0)), u + ' moy.'], ['m', String(sp(st.max || 0)), u + ' max']];
        if (lean) cols.push(['l', lean.max + '°', 'incl. max']);
        if (ch) { try { cols.push(['c', ModuleChrono.fmt(ch.laps[ch.best].s), 'meilleur tour']); } catch (e) {} }
        if (cols.length > 4) cols = cols.filter(c => c[0] !== 'm');
        this._last = last;
        return '<div class="hm-t"><div class="l">Ta balade</div><div class="hm-map" data-rid="' + this.esc(String(last.id)) + '">' + this.path(last) + '</div><div class="hm-stats">'
            + cols.map(c => '<div' + (c[0] === 'l' ? ' class="lean"' : '') + '><b>' + c[1] + '</b><span>' + c[2] + '</span></div>').join('') + '</div></div>';
    },
    // Vraie carte sous le tracé (cache partagé avec le Roadbook) : posée dès qu'elle est prête
    hydrateMap(root) {
        try {
            const m = root.querySelector('.hm-map[data-rid]'), r = this._last; if (!m || !r || typeof ModuleGPS === 'undefined' || !ModuleGPS.mapThumb || String(r.id) !== m.dataset.rid) return;
            ModuleGPS.mapThumb(r).then(u => { if (u && m.isConnected) m.innerHTML = '<img alt="" src="' + u + '">'; });
        } catch (e) { }
    },
    placesHtml(list, G, R, M) {
        const on = (k) => (k === 'meet' && M) || (k === 'radar' && R.mode !== 'off') || (k === 'intercom' && G.on);
        const chips = list.map((k) => { const d = this.SHORTCUTS[k]; if (!d) return '';
            return '<div class="hm-sci" data-k="' + k + '"><button type="button" class="' + (on(k) ? 'on' : '') + '" data-a="sc" data-v="' + k + '"><b>' + this.ico(d.ico) + '</b>' + d.label + '</button>'
                + (this.editing ? '<button type="button" class="x" data-a="rmsc" data-v="' + k + '" aria-label="Retirer">' + this.ico('close') + '</button>' : '') + '</div>'; }).join('');
        return '<div class="hm-sc' + (this.editing ? ' edt' : '') + '">' + chips + (this.editing ? '<div class="hm-sci"><button type="button" class="plus" data-a="addsc"><b>' + this.ico('plus') + '</b>Ajouter</button></div>' : '') + '</div>';
    },
    inviteHtml(I) {
        if (!I) return '';
        return '<div class="hm-inv"><div class="hm-av">' + (I.avatarSrc ? '<img alt="" src="' + this.esc(I.avatarSrc) + '">' : this.esc((I.senderName || '?').charAt(0).toUpperCase())) + '</div><div class="x"><b>' + this.esc(I.senderName) + ' t\'invite</b><span>' + this.esc(I.roomName) + '</span></div><button type="button" class="b no" data-a="inv-no" aria-label="Refuser">' + this.ico('close') + '</button><button type="button" class="b ok" data-a="inv-ok">Accepter</button></div>';
    },
    weatherHtml(W) {
        if (!W) return '<button type="button" class="hm-t hm-sky" data-a="view" data-v="view-weather"><div class="l">Météo</div><div class="ic">' + this.ico('cloud') + '</div><div class="v">--°</div><div class="m">En attente de la météo…</div></button>';
        const ic = this.ico(({ clear: W.day ? 'sun' : 'moon', cloud: 'cloud', rain: 'rain', snow: 'snow', storm: 'storm', fog: 'fog' })[W.kind] || 'cloud');
        return '<button type="button" class="hm-t hm-sky" data-a="view" data-v="view-weather"><div class="l">Météo</div><div class="ic">' + ic + '</div><div class="v">' + W.t + '°</div><div class="m">Vent ' + W.wind + ' · ' + (W.pop < 30 ? 'pas de pluie' : W.pop + ' % de pluie' + (W.at != null ? ' à ' + W.at + ' h' : '')) + '</div></button>';
    },
    nearHtml(N) {
        const t = N.n ? N.n + ' motard' + (N.n > 1 ? 's' : '') : 'Aucun motard';
        const m = N.near ? 'Alerte : ' + (N.near.label || 'Alerte').toLowerCase() + ' à ' + this.dist(N.near.km) : 'Aucune alerte près de toi';
        return '<button type="button" class="hm-t hm-grn" data-a="view" data-v="view-community"><div class="l">Autour de moi</div><div class="ic">' + this.ico('users') + '</div><div class="v' + (N.n ? '' : ' s') + '">' + this.esc(t) + '</div><div class="m">' + this.esc(m) + '</div></button>';
    },
    musicHtml(T) {
        const t = T.t;
        return '<button type="button" class="hm-t hm-pur" data-a="music"><div class="l">' + (T.playing ? 'En lecture' : 'Reprendre') + '</div><div class="ic">' + this.ico(T.playing ? 'pause' : 'music') + '</div><div class="v s">' + this.esc(t ? t.title : 'Musique') + '</div><div class="m">' + this.esc(t ? (t.artist || 'RideNCT Player') : 'Choisis un titre') + '</div></button>';
    },
    atelierHtml(A) {
        if (!A) return '<button type="button" class="hm-t hm-org" data-a="view" data-v="view-maintenance"><div class="l">Atelier</div><div class="ic">' + this.ico('tool') + '</div><div class="v s">Rien de prévu</div><div class="m">Ajoute un entretien</div></button>';
        return '<button type="button" class="hm-t hm-org" data-a="view" data-v="view-maintenance"><div class="l">Atelier</div><div class="ic">' + this.ico('tool') + '</div><div class="v s">' + this.esc(A.title) + '</div><div class="m">' + this.esc(A.text) + '</div><div class="hm-bar"><i class="' + (A.level === 'over' ? 'over' : A.level === 'soon' ? 'soon' : '') + '" style="width:' + A.pct + '%"></i></div></button>';
    },

    /* ---------- appui long + glisser (comme l'écran d'accueil d'un téléphone) ---------- */
    setupDrag(root) {
        // le clic qui suit un glisser ne doit rien déclencher
        root.addEventListener('click', (e) => { if (Date.now() < this._swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
        root.addEventListener('contextmenu', (e) => { if (e.target.closest('.hm-blk, .hm-sci')) e.preventDefault(); });
        root.addEventListener('pointerdown', (e) => {
            this._swallow = 0;
            if (this.drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
            if (e.target.closest('.hm-ctl, .hm-sci .x, .hm-add, .hm-ban, .hm-pen, .hm-me, .hm-inv .b, .plus, .hm-link')) return;
            const chip = e.target.closest('.hm-sci[data-k]'), blk = e.target.closest('.hm-blk[data-b]');
            const kind = chip ? 'sc' : (blk && this.cfg.blocks.some(b => b.t === blk.dataset.b) ? 'blk' : null); if (!kind) return;
            const key = chip ? chip.dataset.k : blk.dataset.b, sx = e.clientX, sy = e.clientY, pid = e.pointerId, el = e.target;
            try { el.releasePointerCapture(pid); } catch (x) {}
            const tm = (ev) => { if (this.drag) ev.preventDefault(); };   // empêche la page de défiler pendant le glisser (tactile)
            el.addEventListener('touchmove', tm, { passive: false });
            const free = () => el.removeEventListener('touchmove', tm, { passive: false });
            let timer = null, started = false;
            const stop = () => { clearTimeout(timer); document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true); if (!started) free(); };
            const mv = (ev) => { if (ev.pointerId === pid && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 9) stop(); };
            const up = (ev) => { if (ev.pointerId === pid) stop(); };
            document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
            timer = setTimeout(() => { started = true; stop(); this.beginDrag(kind, key, pid, sx, sy, free); }, this.editing ? 220 : 450);
        });
    },
    scroller() { let n = this.$('hm'); while (n && n !== document.body) { n = n.parentElement; if (!n) break; const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n; } return document.scrollingElement; },
    beginDrag(kind, key, pid, x, y, free) {
        const root = this.$('hm');
        const sel0 = kind === 'sc' ? '.hm-sci[data-k="' + key + '"]' : '.hm-blk[data-b="' + key + '"]', n0 = root.querySelector(sel0), top0 = n0 ? n0.getBoundingClientRect().top : 0;
        if (this._hintDone) { try { this._hintDone(); } catch (e) {} this._hintDone = null; }
        if (!this.editing) { this.editing = true; this.key = ''; this.paint(); }
        const node = root.querySelector(sel0);
        if (!node) { free(); return; }
        // l'entrée en personnalisation décale la page : on garde l'élément saisi sous le doigt
        if (n0) { const sc0 = this.scroller(); if (sc0) sc0.scrollTop += node.getBoundingClientRect().top - top0; }
        const r = node.getBoundingClientRect(), ghost = node.cloneNode(true);
        ghost.classList.add('hm-ghost'); ghost.removeAttribute('data-b'); ghost.removeAttribute('data-k');
        ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px'; ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
        root.appendChild(ghost); node.classList.add('hm-drag'); root.classList.add('hm-dragging');
        try { navigator.vibrate && navigator.vibrate(18); } catch (e) {}
        const D = this.drag = { moved: false, kind, key, node, ghost, ox: x - r.left, oy: y - r.top, x, y, pid, free, sc: this.scroller(), raf: 0 };
        D.mv = (ev) => { if (ev.pointerId !== D.pid) return; D.x = ev.clientX; D.y = ev.clientY; if (Math.hypot(D.x - x, D.y - y) > 14) D.moved = true; this.dragMove(); ev.preventDefault(); };
        D.up = (ev) => { if (ev.pointerId === D.pid) this.endDrag(); };
        document.addEventListener('pointermove', D.mv, true); document.addEventListener('pointerup', D.up, true); document.addEventListener('pointercancel', D.up, true);
        const loop = () => {
            if (this.drag !== D) return;
            const sc = D.sc, top = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top, bot = Math.min(window.innerHeight - 100, sc === document.scrollingElement ? window.innerHeight : sc.getBoundingClientRect().bottom);
            const Z = 60, dy = !D.moved ? 0 : D.y < top + Z ? -Math.ceil((top + Z - D.y) / 8) : D.y > bot - Z ? Math.ceil((D.y - (bot - Z)) / 8) : 0;
            if (dy) { sc.scrollTop += dy; this.dragMove(); }
            D.raf = requestAnimationFrame(loop);
        };
        D.raf = requestAnimationFrame(loop); this.dragMove();
    },
    dragMove() {
        const D = this.drag; if (!D) return;
        D.ghost.style.left = (D.x - D.ox) + 'px'; D.ghost.style.top = (D.y - D.oy) + 'px';
        if (!D.moved) return;
        const sel = D.kind === 'sc' ? '.hm-sci[data-k]' : '.hm-blk[data-b]', under = document.elementFromPoint(D.x, D.y), t = under && under.closest(sel);
        if (!t || t === D.node || t.parentNode !== D.node.parentNode || t.dataset.b && t.dataset.b[0] === '_') return;
        const rt = t.getBoundingClientRect(), rn = D.node.getBoundingClientRect(), sameRow = Math.abs(rt.top - rn.top) < 12;
        const after = !!(D.node.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
        const pastX = after ? D.x > rt.left + rt.width / 2 : D.x < rt.left + rt.width / 2, pastY = after ? D.y > rt.top + rt.height / 2 : D.y < rt.top + rt.height / 2;
        if (!(sameRow ? pastX : pastY)) return;
        const sibs = [...D.node.parentNode.children].filter(n => n !== D.ghost), old = new Map(sibs.map(n => [n, n.getBoundingClientRect()]));
        if (after) t.after(D.node); else t.before(D.node);
        sibs.forEach(n => { const o = old.get(n), c = n.getBoundingClientRect(), dx = o.left - c.left, dy = o.top - c.top; if (n === D.node || (!dx && !dy)) return; n.style.transition = 'none'; n.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transition = 'transform .18s ease'; n.style.transform = ''; })); });
    },
    endDrag() {
        const D = this.drag; if (!D) return;
        cancelAnimationFrame(D.raf);
        document.removeEventListener('pointermove', D.mv, true); document.removeEventListener('pointerup', D.up, true); document.removeEventListener('pointercancel', D.up, true);
        const root = this.$('hm');
        if (D.kind === 'sc') { const pl = this.cfg.blocks.find(b => b.t === 'places'); if (pl) pl.items = [...root.querySelectorAll('.hm-sci[data-k]')].map(n => n.dataset.k).filter(k => this.SHORTCUTS[k]); }
        else { const order = [...root.querySelectorAll('.hm-grid > .hm-blk[data-b]')].map(n => n.dataset.b), cur = this.cfg.blocks; this.cfg.blocks = order.map(k => cur.find(b => b.t === k)).filter(Boolean).concat(cur.filter(b => !order.includes(b.t))); }
        D.ghost.remove(); root.classList.remove('hm-dragging'); D.free();
        this.drag = null; this._swallow = Date.now() + 350; this.dragEnd = Date.now();
        this.saveCfg();
    },

    /* ---------- feuille « Ajouter » ---------- */
    openSheet(kind) {
        const used = kind === 'sc' ? ((this.cfg.blocks.find(b => b.t === 'places') || {}).items || []) : this.cfg.blocks.map(b => b.t);
        const cat = kind === 'sc' ? this.SHORTCUTS : this.BLOCKS, ids = Object.keys(cat).filter(k => !used.includes(k));
        let sh = this.$('hm-sheet'); if (!sh) { sh = document.createElement('div'); sh.id = 'hm-sheet'; sh.className = 'hm-sheet'; document.body.appendChild(sh); sh.addEventListener('click', (e) => { if (e.target === sh) this.closeSheet(); const b = e.target.closest('[data-pick]'); if (b) this.pick(sh.dataset.kind, b.dataset.pick); if (e.target.closest('[data-close]')) this.closeSheet(); }); }
        sh.dataset.kind = kind;
        sh.innerHTML = '<div class="hm-sheet-in"><div class="hm-sheet-h">' + (kind === 'sc' ? 'Ajouter un raccourci' : 'Ajouter un bloc') + '</div><div class="hm-sheet-l">'
            + (ids.length ? ids.map(k => '<button type="button" data-pick="' + k + '"><i>' + this.ico(cat[k].ico) + '</i><span><b>' + this.esc(cat[k].label) + '</b>' + (cat[k].desc ? '<small>' + this.esc(cat[k].desc) + '</small>' : '') + '</span></button>').join('') : '<div class="hm-sheet-e">Tout est déjà sur ton accueil.</div>')
            + '</div><button type="button" class="hm-sheet-x" data-close>Fermer</button></div>';
        sh.hidden = false;
    },
    closeSheet() { const sh = this.$('hm-sheet'); if (sh) sh.hidden = true; },
    pick(kind, k) {
        if (kind === 'sc') {
            let pl = this.cfg.blocks.find(b => b.t === 'places'); if (!pl) { pl = { t: 'places', items: [] }; this.cfg.blocks.push(pl); }
            if (!pl.items.includes(k)) pl.items.push(k);
        } else this.cfg.blocks.push(k === 'places' ? { t: 'places', items: ['map', 'intercom', 'group'] } : { t: k });
        this.closeSheet(); this.saveCfg();
    },

    /* ---------- actions ---------- */
    async act(a, v) {
        const EDIT = ['edit', 'sz', 'rm', 'add', 'addsc', 'rmsc', 'reset'];
        if (this.editing && !EDIT.includes(a)) return;
        if (a === 'edit') { this.editing = !this.editing; this.key = ''; return this.paint(); }
        if (a === 'add') return this.openSheet('block');
        if (a === 'addsc') return this.openSheet('sc');
        if (a === 'sz') { const b = this.cfg.blocks.find(x => x.t === v); if (b) { b.w = !b.w; this.saveCfg(); } return; }
        if (a === 'rm') { this.cfg.blocks = this.cfg.blocks.filter(x => x.t !== v); return this.saveCfg(); }
        if (a === 'rmsc') { const pl = this.cfg.blocks.find(x => x.t === 'places'); if (pl) { pl.items = pl.items.filter(x => x !== v); this.saveCfg(); } return; }
        if (a === 'reset') { let ok = false; try { ok = await AppDialog.confirm('Remettre l\'accueil comme au départ ?\n\nTes blocs et raccourcis personnalisés seront remplacés.', { title: 'Réinitialiser', okText: 'Réinitialiser', cancelText: 'Annuler', danger: true }); } catch (e) {} if (ok) { this.cfg = this.defaultCfg(); this.saveCfg(); } return; }
        if (a === 'sub') { try { AppSub.open(); } catch (e) {} return; }
        if (a === 'view') return this.go(v);
        if (a === 'go') return this.start();
        if (a === 'sc') return this.shortcut(v);
        if (a === 'dismiss') { const r = this.rides().reduce((x, y) => (!x || y.id > x.id ? y : x), null); this.set('moto_home_dismiss', r ? r.id : 0); this.key = ''; return this.paint(); }
        if (a === 'inv-ok') { const i = this.invite(); if (!i) return; const r = ModuleRoute.acceptInvite(i); if (typeof r === 'string') { try { AppDialog.alert(r.replace(/^!/, '')); } catch (e) {} } else this.go('view-intercom'); this.key = ''; return this.paint(); }
        if (a === 'inv-no') { const i = this.invite(); if (i) ModuleRoute.refuseInvite(i); this.key = ''; return this.paint(); }
        if (a === 'music') { let t = null; try { t = ModuleMusic.current(); } catch (e) {} if (!t) return this.go('view-music'); try { ModuleMusic.togglePlay(); } catch (e) {} setTimeout(() => { this.key = ''; this.paint(); }, 250); return; }
        if (a === 'radar') return this.toggleRadar();
        if (a === 'meet') return this.toggleMeet();
        if (a === 'place') return this.place(v);
    },
    shortcut(k) {
        if (this.VIEWS[k]) return this.go(this.VIEWS[k]);
        if (k === 'start') return this.start();
        if (k === 'home' || k === 'work' || this.NEAREST[k]) return this.place(k);
        if (k === 'aide') { try { return ModuleAide.open(); } catch (e) { return; } }
        if (k === 'radar') return this.toggleRadar();
        if (k === 'meet') return this.toggleMeet();
        if (k === 'danger') { this.go('view-dashboard'); setTimeout(() => { try { ModuleRoute.command('signale danger'); } catch (e) {} }, 250); }
    },
    toggleRadar() { try { const C = ModuleCommunity; C.setRadarMode(C.state.radarMode === 'off' ? 'all' : 'off'); } catch (e) { try { AppDialog.alert('Radar indisponible pour le moment.'); } catch (x) {} } setTimeout(() => { this.key = ''; this.paint(); }, 400); },
    toggleMeet() { const b = this.$('intercom-toggle-auto'); if (b) b.click(); setTimeout(() => { this.key = ''; this.paint(); }, 300); },
    start() {
        this.go('view-dashboard');
        if (this.riding()) return;
        const b = this.$('btn-go-ride'); if (b) b.click();
    },
    /* Maison / Travail / lieu le plus proche : on passe sur Route, qui propose l'itinéraire (confirmation à la voix ou au toucher) */
    async place(k) {
        if (k === 'home' || k === 'work') {
            const nm = k === 'home' ? 'Maison' : 'Travail', pl = ModuleRoute.places()[k];
            if (!pl || !pl.coords) {
                const ref = (() => { try { return ModuleGPS.state.lastKnownCoords; } catch (e) { return null; } })();
                if (!ref) { try { await AppDialog.alert(nm + ' n\'est pas encore enregistré.\n\nActive le GPS depuis l\'endroit voulu pour l\'enregistrer ici.', { title: nm }); } catch (e) {} return; }
                let ok = false; try { ok = await AppDialog.confirm('Enregistrer ta position actuelle comme « ' + nm + ' » ?', { title: nm + ' non enregistré', okText: 'Enregistrer', cancelText: 'Annuler' }); } catch (e) {}
                if (!ok) return; ModuleRoute.savePlace(k, { name: nm, coords: ref }); this.key = ''; this.paint(); return;
            }
        }
        this.go('view-dashboard');
        const phrase = k === 'home' ? 'rentre à la maison' : k === 'work' ? 'va au travail' : (this.NEAREST[k] || this.NEAREST.fuel);
        setTimeout(() => { const r = ModuleRoute.understand(phrase); if (typeof r === 'string' && r[0] === '!') ModuleRoute.pill('ko', r.slice(1), 3500); }, 250);
    }
};
document.addEventListener('DOMContentLoaded', () => { try { ModuleHome.init(); } catch (e) { console.warn('Accueil :', e); } });
