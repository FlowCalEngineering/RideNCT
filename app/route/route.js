/* MODE ROUTE — deux espaces redimensionnables, chacun affiche un widget (compteur, carte, météo, musique, intercom).
   Glisser vers le haut / le bas dans un espace = changer de widget ; glisser la poignée centrale = redimensionner.
   Les widgets sont ceux du compteur (mêmes fonctions), simplement déplacés puis remis en place à la sortie.
   Réglages (AppPrefs) : route = 'auto' | 'manual' ; rvoice = 'on' | 'off' */
const ModuleRoute = {
    WIDGETS: ['speed', 'map', 'weather', 'music', 'intercom'],
    ICON: {
        speed: '<path d="M3.4 17A10 10 0 1 1 20.6 17"/><path d="M12 14l3-3"/>',
        map: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
        weather: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
        music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        intercom: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4zM3 19a2 2 0 0 0 2 2h1v-6H3v4z"/>'
    },
    LABEL: { speed: 'Compteur', map: 'Carte', weather: 'Météo', music: 'Musique', intercom: 'Intercom' },
        active: false, autoEntered: false, dismissed: false,
    tickT: null, rec: null, recWant: false,
    cfg: { a: 'speed', b: 'map', r: 0.48 }, origin: [], savedWidget: null,
    $(id) { return document.getElementById(id); },
    mode() { return AppPrefs.get('route') === 'manual' ? 'manual' : 'auto'; },
    voiceOn() { return AppPrefs.get('rvoice') === 'on'; },
    land() { return window.matchMedia('(orientation: landscape)').matches; },
    loadCfg() { try { const c = JSON.parse(localStorage.getItem('moto_rm_cfg') || '{}'); if (this.WIDGETS.includes(c.a)) this.cfg.a = c.a; if (this.WIDGETS.includes(c.b) && c.b !== this.cfg.a) this.cfg.b = c.b; if (c.r === 0 || c.r === 1 || (c.r >= .25 && c.r <= .75)) this.cfg.r = c.r; } catch (e) {} },
    saveCfg() { try { localStorage.setItem('moto_rm_cfg', JSON.stringify(this.cfg)); } catch (e) {} },

    init() {
        if (!this.$('rm')) return;
        this.loadCfg(); this.initSettings();
        const view = this.$('view-dashboard'); if (view) view.appendChild(this.$('rm')); // l'onglet Compteur EST le mode route
        const on = (id, fn) => { const e = this.$(id); if (e) e.addEventListener('click', fn); };
        on('rm-go', () => this.goStop());
        on('rm-eco', () => { const b = this.$('btn-eco'); if (b) b.click(); });
        on('rm-imm', () => this.setImmersive(!document.body.classList.contains('rm-imm')));
        // Poignée de redimensionnement
        const g = this.$('rm-grip'), rm = this.$('rm');
        g.addEventListener('pointerdown', (e) => {
            e.preventDefault(); g.setPointerCapture(e.pointerId);
            const mv = (ev) => {
                const r = rm.getBoundingClientRect(), L = this.land(), d = this.$('rm-div');
                const total = (L ? r.width : r.height) - (L ? d.offsetWidth : d.offsetHeight) - 20;
                const pos = (L ? ev.clientX - r.left : ev.clientY - r.top) - 10 - (L ? d.offsetWidth : d.offsetHeight) / 2;
                const mn = Math.max(.25, (L ? 250 : 170) / total), q = pos / total;
                // Tiré au maximum : l'espace se replie complètement ; on re-tire la poignée, il réapparaît
                this.cfg.r = q < mn * .6 ? 0 : q > 1 - mn * .6 ? 1 : Math.max(mn, Math.min(1 - mn, q)); this.applyRatio();
            };
            const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); this.saveCfg(); this.resizeMap(); };
            g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
        });
        // Glisser haut / bas dans un espace = autre widget
        ['rm-a', 'rm-b'].forEach(id => {
            const pane = this.$(id); let sx = 0, sy = 0, st = 0, ok = false;
            pane.addEventListener('touchstart', (e) => {
                const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
                const sc = e.target.closest('.dw-scroll'); ok = !e.target.closest('input[type=range]') && !(e.target.closest('.rm-people') && e.target.closest('.rm-people').scrollHeight > e.target.closest('.rm-people').clientHeight + 4) && (!e.target.closest('#map-container') || !!e.target.closest('.rm-edge')) // carte : le doigt déplace la carte (changer de widget = flèches ou bord droit) && !(sc && sc.scrollHeight > sc.clientHeight + 4 && !e.target.closest('.rm-edge'));
            }, { passive: true });
            pane.addEventListener('touchend', (e) => {
                if (!ok || !st) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; st = 0;
                if (Date.now() - st > 800 && false) return;
                if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4) this.cycle(id === 'rm-a' ? 0 : 1, dy < 0 ? 1 : -1);
                else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4 && this.cfg[id === 'rm-a' ? 'a' : 'b'] === 'music') { // musique : glisser = changer de titre
                    try { if (dx > 0) ModuleMusic.nextTrack(false); else ModuleMusic.prevTrack(); } catch (e) {}
                    setTimeout(() => { try { ModuleDashboard.wMusic(); } catch (e) {} }, 250);
                }
            }, { passive: true });
            // Le widget météo ouvrirait l'onglet complet au toucher : on l'en empêche ici
            pane.addEventListener('click', (e) => { if (e.target.closest('#dw-weather')) e.stopPropagation(); }, true);
        });
        ['rm-a', 'rm-b'].forEach((id, i) => { const pane = this.$(id); pane.querySelector('.rm-up').addEventListener('click', () => this.cycle(i, -1)); pane.querySelector('.rm-dn').addEventListener('click', () => this.cycle(i, 1)); });
        // Boutons de zoom de la carte
        const map = () => { try { return ModuleGPS.state.map; } catch (e) { return null; } };
        this.buildExtras();
        on('rm-zin', () => { const m = map(); if (m) m.zoomIn(); }); on('rm-zout', () => { const m = map(); if (m) m.zoomOut(); });
        on('rm-center', () => this.recenter());
        on('rm-join', () => this.joinGroup());
        on('rm-meet', () => { const b = this.$('intercom-toggle-auto'); if (b) b.click(); setTimeout(() => this.paintIc(), 150); });
        on('rm-danger', () => { this.$('rm-dsheet').hidden = false; });
        on('rm-dx', () => { this.$('rm-dsheet').hidden = true; });
        const ds = this.$('rm-dsheet'); if (ds) ds.querySelectorAll('.rm-dgrid button').forEach(bt => bt.addEventListener('click', () => this.reportDanger(bt)));
        document.addEventListener('prefchange', (e) => { if (e.detail.key === 'rvoice') this.syncVoice(); if (/^(route|rvoice|rwake|rword|rfb)$/.test(e.detail.key)) this.paintSettings(); });
        window.addEventListener('resize', () => { if (this.active) { this.applyRatio(); this.resizeMap(); } });
        setInterval(() => this.watch(), 300);
        // L'écran suit l'onglet Compteur : affiché = widgets en place, quitté = widgets et carte rendus
        const sync = () => { const on = view.classList.contains('active'); if (on && !this.active) this.enter(); else if (!on && this.active) this.exit(); };
        new MutationObserver(sync).observe(view, { attributes: true, attributeFilter: ['class'] });
        sync();
    },

    recenter() {
        let G = null; try { G = ModuleGPS; } catch (e) { return; }
        const st = G.state, m = st.map; if (!m) return;
        const c = st.lastKnownCoords;
        if (st.isTracking) { // balade en cours : la caméra suit de nouveau la moto
            const b = this.$('btn-recenter'); if (b) b.click(); else { st.isCameraLocked = true; st.isFirstTrackingLock = true; }
        } else if (c) m.easeTo({ center: c, zoom: Math.max(m.getZoom(), 14), pitch: 0, bearing: 0, duration: 700 });
        else try { navigator.geolocation.getCurrentPosition(p => m.easeTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 14, duration: 700 }), () => {}); } catch (e) {}
    },
    ensureMap() {
        if (this.cfg.a !== 'map' && this.cfg.b !== 'map') this.cfg.b = 'map';
        const i = this.cfg.a === 'map' ? 0 : 1;
        if ((i === 0 && this.cfg.r <= 0) || (i === 1 && this.cfg.r >= 1)) this.cfg.r = .5;
        if (this.active) { this.applyRatio(); this.show(i); } else this.saveCfg();
    },
    setImmersive(on) {
        document.body.classList.toggle('rm-imm', !!on);
        const b = this.$('rm-imm'); if (b) b.setAttribute('aria-label', on ? 'Afficher la barre de navigation' : 'Plein écran');
        window.dispatchEvent(new Event('resize'));
        try { ModuleDashboard.ecoApply(); } catch (e) {}
    },
    async goStop() {
        let D = null; try { D = ModuleDashboard; } catch (e) { return; }
        if (!D.state.isRiding) { const b = this.$('btn-go-ride'); if (b) b.click(); return; }
        let ok = true; try { ok = await AppDialog.confirm('Terminer la balade ?', { title: 'Arrêter', okText: 'Arrêter', cancelText: 'Continuer', danger: true }); } catch (e) {}
        if (ok) { const b = this.$('btn-stop-ride'); if (b) b.click(); }
    },

    /* ---------- widgets : le compteur et les ajouts propres au mode route ---------- */
    buildExtras() {
        // Compteur
        const sp = document.createElement('div'); sp.className = 'dw-panel rm-spdw'; sp.dataset.w = 'speed';
        sp.innerHTML = '<div class="rm-limit" id="rm-limit" hidden>--</div><b id="rm-s">0</b><span id="rm-su">km/h</span><div class="rm-rev" id="rm-rev" aria-hidden="true"><i></i></div><svg class="rm-arc" id="rm-arc" viewBox="0 0 200 200" aria-hidden="true"></svg>'
            + '<div class="rm-sguide" id="rm-sguide" hidden><svg id="rm-sgi" viewBox="0 0 24 24"></svg><div><div id="rm-sgd">--</div><div id="rm-sgs"></div></div><div class="rm-sgt" id="rm-sgt"></div></div>'
            + '<div class="rm-sstats"><div id="rm-sd" data-l="DISTANCE">0.00 km</div><div id="rm-sh" data-l="MOTEUR">0.0 h</div><div id="rm-sb" class="rm-sbat" data-l="BATTERIE">--%</div></div>';
        this.speedPanel = sp;
        { const arc = sp.querySelector('#rm-arc'); let h = ''; for (let i = 0; i < 40; i++) { const a = (135 + i * 270 / 39) * Math.PI / 180, c = Math.cos(a), n = Math.sin(a); h += '<line data-i="' + i + '" x1="' + (100 + 76 * c).toFixed(2) + '" y1="' + (100 + 76 * n).toFixed(2) + '" x2="' + (100 + 94 * c).toFixed(2) + '" y2="' + (100 + 94 * n).toFixed(2) + '"/>'; } arc.innerHTML = h; this.arcLines = [...arc.querySelectorAll('line')]; this.arcOn = -1; }
        // Carte : guidage + zoom, dans la fenêtre de la carte
        const slot = this.$('dw-map-slot');
        if (slot && !this.$('rm-navstrip')) {
            const ns = document.createElement('div'); ns.id = 'rm-navstrip'; ns.className = 'rm-navstrip';
            ns.innerHTML = '<svg id="rm-ni" viewBox="0 0 24 24"></svg><div><div id="rm-nd">--</div><div id="rm-ns"></div><div id="rm-nt"></div></div>';
            const mb = document.createElement('div'); mb.className = 'rm-mapbtns';
            mb.innerHTML = '<button type="button" id="rm-zout" aria-label="Zoom arrière"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button><button type="button" id="rm-center" aria-label="Centrer"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button><button type="button" id="rm-zin" aria-label="Zoom avant"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>';
            slot.append(ns, mb);
        }
        // Intercom : deux gros boutons seulement
        const ic = document.querySelector('.dw-panel[data-w="intercom"] .dw-ic2');
        if (ic && !this.$('rm-join')) {
            const w = document.createElement('div'); w.className = 'rm-icbtns';
            w.innerHTML = '<button type="button" id="rm-join" class="rm-icb"><svg viewBox="0 0 24 24"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 15a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z"/></svg><span><b id="rm-join-t">Rejoindre un groupe</b><small id="rm-join-s"></small></span></button>'
                + '<button type="button" id="rm-meet" class="rm-icb"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span><b>Mode rencontre</b><small id="rm-meet-s">Désactivé</small></span></button>';
            const pe = document.createElement('div'); pe.id = 'rm-people'; pe.className = 'rm-people'; w.insertBefore(pe, w.lastElementChild);
            ic.insertBefore(w, ic.firstChild);
        }
        const pn = document.querySelector('.dw-panel[data-w="intercom"]');
        if (pn && !this.$('rm-roomsheet')) { const sh = document.createElement('div'); sh.id = 'rm-roomsheet'; sh.className = 'rm-sheet'; sh.hidden = true; pn.appendChild(sh); }
        // Musique : indication du geste
        const mu = document.querySelector('.dw-panel[data-w="music"]');
        if (mu && !this.$('rm-mhint')) { const h = document.createElement('div'); h.id = 'rm-mhint'; h.className = 'rm-mhint'; h.textContent = '‹  glisse pour changer de titre  ›'; mu.appendChild(h); }
        // Carte : signalement de danger simplifié
        if (slot && !this.$('rm-danger')) {
            const d = document.createElement('button'); d.type = 'button'; d.id = 'rm-danger'; d.className = 'rm-danger'; d.setAttribute('aria-label', 'Signaler un danger');
            d.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
            const sh = document.createElement('div'); sh.id = 'rm-dsheet'; sh.className = 'rm-sheet'; sh.hidden = true;
            const T = [['accident', 'Accident'], ['gravel', 'Gravillons'], ['animal', 'Animal'], ['other', 'Autre danger']];
            sh.innerHTML = '<div class="rm-dgrid">' + T.map(([k, l]) => '<button type="button" data-k="' + k + '"><svg viewBox="0 0 24 24">' + ((ModuleGPS.RP_TYPES[k] || {}).icon || '') + '</svg><span>' + l + '</span></button>').join('') + '</div><button type="button" class="rm-sheet-x" id="rm-dx">Annuler</button>';
            slot.append(d, sh);
        }
    },
    panel(w) { return w === 'speed' ? this.speedPanel : document.querySelector('.dw-panel[data-w="' + w + '"]'); },

    /* ---------- entrée / sortie ---------- */
    enter(auto) {
        if (this.active) return;
        this.active = true; this.autoEntered = !!auto;
        const D = (typeof ModuleDashboard !== 'undefined') ? ModuleDashboard : null;
        // On note où est chaque panneau pour le remettre à sa place ensuite
        this.origin = ['map', 'weather', 'music', 'intercom'].map(w => { const p = this.panel(w); return p ? { p, parent: p.parentNode, next: p.nextSibling } : null; }).filter(Boolean);
        this.savedWidget = D ? D.state.widget : null; if (D) D.state.widget = 'nav'; // empêche le compteur de reprendre la carte
        if (this.cfg.a === this.cfg.b) this.cfg.b = this.WIDGETS.find(w => w !== this.cfg.a);
        document.body.classList.add('rm-on'); this.$('rm').hidden = false;
        if (D && D.state.isRiding && this.mode() === 'auto') this.setImmersive(true);
        this.applyRatio(); this.show(0); this.show(1);
        clearInterval(this.tickT); this.tickT = setInterval(() => this.paint(), 350); this.paint();
        this.syncVoice();
    },
    exit(byUser) {
        if (!this.active) return;
        this.active = false;
        clearInterval(this.tickT);
        this.$('rm').hidden = true; document.body.classList.remove('rm-on', 'rm-imm'); try { ModuleDashboard.ecoApply(); } catch (e) {}
        // Carte rendue à l'onglet Carte, panneaux remis dans le widget du compteur
        const mc = this.$('map-container'), wrap = document.querySelector('#view-gps .map-wrapper'), slot = this.$('dw-map-slot');
        if (mc && wrap && mc.parentNode === slot) wrap.insertBefore(mc, wrap.firstChild);
        this.origin.forEach(o => { o.p.classList.remove('active'); if (o.next && o.next.parentNode === o.parent) o.parent.insertBefore(o.p, o.next); else o.parent.appendChild(o.p); });
        if (this.speedPanel.parentNode) this.speedPanel.parentNode.removeChild(this.speedPanel);
        try { if (typeof ModuleDashboard !== 'undefined' && this.savedWidget) { ModuleDashboard.state.widget = this.savedWidget; ModuleDashboard.widgetSelect(this.savedWidget); } } catch (e) {}
        this.syncVoice(); this.resizeMap();
    },

    /* ---------- espaces et widgets ---------- */
    applyRatio() {
        const r = this.cfg.r; this.$('rm-a').style.setProperty('--rm-a', (r * 100).toFixed(1) + '%');
        this.$('rm-a').classList.toggle('rm-folded', r <= 0); this.$('rm-b').classList.toggle('rm-folded', r >= 1);
    },
    resizeMap() { const rs = () => { try { ModuleGPS.state.map && ModuleGPS.state.map.resize(); } catch (e) {} }; setTimeout(rs, 30); setTimeout(rs, 300); },
    show(i, w) {
        const key = i === 0 ? 'a' : 'b'; if (w) this.cfg[key] = w; const cur = this.cfg[key];
        const pane = this.$(i === 0 ? 'rm-a' : 'rm-b'), p = this.panel(cur); if (!p) return;
        // L'ancien panneau de cet espace est retiré (remis à l'abri, sans toucher à la carte qui reste dans son cadre)
        [...pane.children].forEach(c => { if (c.classList.contains('dw-panel') && c !== p) { c.classList.remove('active'); this.park(c); } });
        pane.insertBefore(p, pane.firstChild); p.classList.add('active');
        if (cur === 'map') { const mc = this.$('map-container'), slot = this.$('dw-map-slot'); if (mc && slot && mc.parentNode !== slot) slot.appendChild(mc); this.resizeMap(); }
        ['rm-roomsheet', 'rm-dsheet'].forEach(id => { const e = this.$(id); if (e) e.hidden = true; });
        pane.querySelector('.rm-chip').innerHTML = '<svg viewBox="0 0 24 24">' + this.ICON[cur] + '</svg><span>' + this.LABEL[cur] + '</span>';
        this.saveCfg();
    },
    park(p) { const o = this.origin.find(x => x.p === p); if (o) o.parent.appendChild(p); else if (p.parentNode) p.parentNode.removeChild(p); },
    cycle(i, dir) {
        const other = i === 0 ? this.cfg.b : this.cfg.a, mine = i === 0 ? this.cfg.a : this.cfg.b;
        const n = this.WIDGETS.length; let k = this.WIDGETS.indexOf(mine);
        for (let s = 0; s < n; s++) { k = (k + dir + n) % n; if (this.WIDGETS[k] !== other) break; }
        this.show(i, this.WIDGETS[k]);
    },
    goto(name) {
        if (!this.WIDGETS.includes(name) || this.cfg.a === name || this.cfg.b === name) return;
        this.show(0, name);
    },

    /* ---------- rafraîchissement des widgets affichés ---------- */
    paint() {
        if (!this.active) return;
        const D = (typeof ModuleDashboard !== 'undefined') ? ModuleDashboard : null; if (!D) return;
        const set = (id, t) => { const e = this.$(id); if (e && e.textContent !== t) e.textContent = t; };
        const kmh = D.state.currentSpeedUi || 0, s = String(AppUnits.spd(kmh));
        const shown = [this.cfg.a, this.cfg.b];
        if (shown.includes('speed')) {
            set('rm-s', s); set('rm-su', AppUnits.speedLabel()); { const pc = Math.max(0, Math.min(100, kmh / 200 * 100)); this.speedPanel.style.setProperty('--p', pc.toFixed(1) + '%'); const on = Math.round(pc / 100 * 40); if (on !== this.arcOn && this.arcLines) { this.arcOn = on; this.arcLines.forEach((l, i) => { l.classList.toggle('on', i < on); l.classList.toggle('hot', i >= 30); }); } }
            // Limite de vitesse et alerte de dépassement
            const lim = this.$('nt-limit'), L = this.$('rm-limit'), lv = lim && lim.style.display !== 'none' ? parseInt(lim.textContent, 10) : NaN;
            L.hidden = !isFinite(lv); if (isFinite(lv)) { set('rm-limit', String(lv)); this.$('rm-s').classList.toggle('over', AppUnits.spd(kmh) > lv); } else this.$('rm-s').classList.remove('over');
            // Guidage (virage, rue, arrivée)
            const hud = this.$('nav-instruction-hud'), nav = !!(hud && hud.style.display !== 'none'), G = this.$('rm-sguide'); G.hidden = !nav;
            if (nav) {
                const g = id => ((this.$(id) || {}).textContent || '').trim(), ic = this.$('nav-turn-icon'), dst = this.$('rm-sgi'); if (ic && dst && dst.innerHTML !== ic.innerHTML) dst.innerHTML = ic.innerHTML;
                set('rm-sgd', g('nav-distance') || '--'); set('rm-sgs', g('nav-street') || g('nav-label'));
                set('rm-sgt', [g('nt-eta') && g('nt-eta') !== '--:--' ? 'Arrivée ' + g('nt-eta') : '', g('nt-time') && !/^-+$/.test(g('nt-time')) ? g('nt-time') : ''].filter(Boolean).join('\n'));
            }
            const bl = this.$('battery-level'), sb = this.$('rm-sb'); if (bl && sb) { const ic = (this.$('battery-icon') || {}).textContent || ''; set('rm-sb', ic + ' ' + bl.textContent); sb.classList.toggle('low', parseInt(bl.textContent, 10) <= 20); }
            set('rm-sd', (this.$('ui-distance') ? this.$('ui-distance').textContent : '0.00 km')); set('rm-sh', (this.$('ui-engine-hours') ? this.$('ui-engine-hours').textContent : '0.0 h'));
        }
        this.paintCtl(D);
        // Économie d'énergie : écran noir, seul le compteur reste
        const eco = document.body.classList.contains('eco');
        if (eco && this.ecoBack == null) { this.ecoBack = this.cfg.a; if (this.cfg.a !== 'speed') this.show(0, this.cfg.b === 'speed' ? this.cfg.a : 'speed'); }
        else if (!eco && this.ecoBack != null) { const w = this.ecoBack; this.ecoBack = null; if (w !== this.cfg.a && w !== this.cfg.b) this.show(0, w); }
        try {
            if (shown.includes('music')) D.wMusic();
            if (shown.includes('weather')) D.wWeather();
            if (shown.includes('intercom')) this.paintIc();
        } catch (e) {}
        if (shown.includes('map')) {
            this.paintNav();
            try { const st = ModuleGPS.state, rc = this.$('rm-center'); if (rc) rc.classList.toggle('free', !!st.isTracking && !st.isCameraLocked); } catch (e) {}
        }
    },
    paintCtl(D) {
        const riding = !!D.state.isRiding, go = this.$('rm-go'), eco = this.$('rm-eco');
        if (go) { go.classList.toggle('stop', riding); const t = riding ? 'Stop' : 'Démarrer'; const sp = go.querySelector('span'); if (sp.textContent !== t) { sp.textContent = t; go.setAttribute('aria-label', riding ? 'Arrêter la balade' : 'Démarrer la balade'); go.querySelector('svg').innerHTML = riding ? '<path d="M6 6l12 12M18 6L6 18"/>' : '<path d="M7 4l13 8-13 8z"/>'; } }
        if (eco) { eco.hidden = !riding || !document.body.classList.contains('rm-imm'); eco.classList.toggle('on', document.body.classList.contains('eco')); }
    },
    paintIc() {
        let I = null; try { I = ModuleIntercom; } catch (e) { return; }
        const st = I.state, room = !!st.isConnected, set = (id, t) => { const e = this.$(id); if (e && e.textContent !== t) e.textContent = t; };
        set('rm-join-t', room ? 'Quitter le groupe' : 'Rejoindre un groupe');
        const n = (st.participants || []).length;
        set('rm-join-s', room ? ((st.currentRoomName || 'Groupe vocal') + (n ? ' · ' + n + ' participant' + (n > 1 ? 's' : '') : '')) : (st.nearbyRooms && st.nearbyRooms.size ? st.nearbyRooms.size + ' groupe' + (st.nearbyRooms.size > 1 ? 's' : '') + ' à proximité' : 'Aucun groupe à proximité'));
        const j = this.$('rm-join'); if (j) j.classList.toggle('on', room);
        // Dans un groupe : les personnes, rien d'autre (initiale + prénom)
        const box = this.$('rm-people'), wrap = box && box.parentNode; if (wrap) wrap.classList.toggle('in-group', room);
        if (box) {
            const me = (() => { try { return ModuleProfile.state.name || 'Moi'; } catch (e) { return 'Moi'; } })();
            const list = room ? [{ n: me, me: true }].concat((st.participants || []).map(p => ({ n: p.senderName || '?', img: p.avatarSrc }))) : [];
            const key = list.map(x => x.n + '|' + (x.img ? 1 : 0)).join('§');
            if (box._k !== key) {
                box._k = key; box.innerHTML = '';
                list.forEach(x => {
                    const d = document.createElement('div'); d.className = 'rm-per' + (x.me ? ' me' : '');
                    const a = document.createElement('i'); if (x.img) { const im = document.createElement('img'); im.src = x.img; im.alt = ''; a.appendChild(im); } else a.textContent = (x.n || '?').charAt(0).toUpperCase();
                    const nm = document.createElement('span'); nm.textContent = x.me ? 'Moi' : x.n; d.append(a, nm); box.appendChild(d);
                });
            }
        }
        const auto = !!st.autoModeActive; set('rm-meet-s', auto ? 'Activé' : 'Désactivé');
        const m = this.$('rm-meet'); if (m) m.classList.toggle('on', auto);
    },
    joinGroup() {
        let I = null; try { I = ModuleIntercom; } catch (e) { return; }
        if (I.state.isConnected) { const b = this.$('btn-leave-room'); if (b) b.click(); setTimeout(() => this.paintIc(), 300); return; }
        const rooms = Array.from(I.state.nearbyRooms ? I.state.nearbyRooms.values() : []);
        const go = (r) => I.showJoinPrompt(r.roomName, r.isPrivate, r.roomCode); // demande le code si le groupe est privé
        const sh = this.$('rm-roomsheet'); sh.innerHTML = '';
        const h = document.createElement('div'); h.className = 'rm-sheet-h'; h.textContent = rooms.length ? 'Groupes à proximité' : 'Aucun groupe à proximité'; sh.appendChild(h);
        rooms.forEach(r => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'rm-room';
            const nm = document.createElement('b'); nm.textContent = r.roomName; const tg = document.createElement('em'); tg.textContent = r.isPrivate ? 'PRIVÉ · code' : 'PUBLIC';
            b.append(nm, tg); b.addEventListener('click', () => { sh.hidden = true; go(r); }); sh.appendChild(b);
        });
        const x = document.createElement('button'); x.type = 'button'; x.className = 'rm-sheet-x'; x.textContent = rooms.length ? 'Annuler' : 'Fermer'; x.addEventListener('click', () => { sh.hidden = true; }); sh.appendChild(x);
        sh.hidden = false;
    },
    async reportDanger(btn) {
        const G = ModuleGPS, p = G.rpPos(); const sh = this.$('rm-dsheet');
        if (!p) { try { AppDialog.alert('Position indisponible : impossible de signaler le danger.', { title: 'Signalement' }); } catch (e) {} return; }
        if (btn._busy) return; btn._busy = true; btn.classList.add('busy');
        const msg = document.createElement('div');
        const ok = await G.rpSend({ kind: 'danger', subtype: btn.dataset.k, lat: p.pos[1], lng: p.pos[0] }, msg);
        btn._busy = false; btn.classList.remove('busy');
        if (ok) { btn.classList.add('done'); setTimeout(() => { btn.classList.remove('done'); sh.hidden = true; }, 900); }
        else { try { AppDialog.alert(msg.textContent || 'Envoi impossible.', { title: 'Signalement' }); } catch (e) {} }
    },
    paintNav() {
        const hud = this.$('nav-instruction-hud'), on = !!(hud && hud.style.display !== 'none'), box = this.$('rm-navstrip'); if (!box) return;
        box.classList.toggle('on', on); if (!on) return;
        const g = id => ((this.$(id) || {}).textContent || '').trim();
        const ic = this.$('nav-turn-icon'), dst = this.$('rm-ni'); if (ic && dst && dst.innerHTML !== ic.innerHTML) dst.innerHTML = ic.innerHTML;
        const set = (id, t) => { const e = this.$(id); if (e && e.textContent !== t) e.textContent = t; };
        set('rm-nd', g('nav-distance') || '--'); set('rm-ns', g('nav-street') || g('nav-label'));
        set('rm-nt', [g('nt-eta') && 'Arrivée ' + g('nt-eta'), g('nt-time'), g('nt-dist')].filter(x => x && !/^[-: ]+$/.test(x.replace(/^Arrivée /, ''))).join(' · '));
    },

    /* ---------- déclenchement automatique : appui sur « Démarrer » ---------- */
    wasRiding: false,
    watch() {
        let riding = false;
        try { riding = !!ModuleDashboard.state.isRiding; } catch (e) { return; }
        const was = this.wasRiding; this.wasRiding = riding;
        if (riding && !was && this.$('view-gps').classList.contains('active')) this.ensureMap(); // départ depuis l'onglet Carte : le widget carte est mis en place
        if (riding && !was && this.mode() === 'auto') {
            // Auto : « Démarrer » ramène sur cet écran, en plein écran (barre de navigation masquée)
            try { if (!this.active) AppManager.switchView('view-dashboard'); } catch (e) {}
            this.setImmersive(true);
        } else if (!riding && was) this.setImmersive(false); // la balade est terminée
    },

    /* ---------- commandes vocales (en option) ---------- */
    voiceSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
    syncVoice() {
        const want = this.active && this.voiceOn();
        if (want && !this.rec) this.startVoice(); else if (!want && this.rec) this.stopVoice();
    },
    startVoice() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
        const r = new SR(); r.lang = 'fr-FR'; r.continuous = true; r.interimResults = false; this.rec = r; this.recWant = true;
        r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) this.heard(e.results[i][0].transcript); };
        r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.recWant = false; this.pill(null); this.micDenied(); } };
        r.onend = () => { if (this.recWant && this.active && this.voiceOn()) setTimeout(() => { try { r.start(); } catch (e) {} }, 400); else { this.rec = null; this.pill(null); } };
        try { r.start(); } catch (e) {}
        this.pill('listen');
    },
    // Micro refusé : message d'erreur en pop-up (une seule fois), pas une pastille par-dessus les boutons
    micDenied() {
        if (this._micWarned) return; this._micWarned = true;
        try { AppDialog.alert('Le micro est refusé : les commandes vocales sont désactivées.\n\nAutorise-le dans les réglages du téléphone (Réglages > MotoApp > Microphone), puis relance la balade.', { title: 'Micro refusé' }); } catch (e) {}
    },
    stopVoice() { this.recWant = false; try { this.rec && this.rec.stop(); } catch (e) {} this.rec = null; this.pill(null); },

    /* Mot d'activation : « Ride, suivant ». Dit seul (« Ride »), il ouvre 7 s pour la commande suivante. */
    wakeOn() { return AppPrefs.get('rwake') !== 'off'; },
    word() { return (AppPrefs.get('rword') || 'ride').toString(); },
    // Mots reconnus avec tolérance (la reconnaissance vocale déforme « ride » et l'ancien « vroom »)
    wakeRe(w) { return w === 'ride' ? /\b(ride|rayed|raid|raide|rid|rhyde)\b/ : w === 'vroom' ? /\b(vr|br|gr)(o|ou|u)+m\b/ : null; },
    fbMode() { const m = AppPrefs.get('rfb'); return m === 'voice' || m === 'none' ? m : 'beep'; },
    norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); },
    afterWake(t) {
        const w = this.norm(this.word());
        const re = this.wakeRe(w) || new RegExp('\\b' + w.replace(/[^a-z0-9 ]/g, '') + '\\b');
        const m = re.exec(t); return m ? t.slice(m.index + m[0].length).trim() : null;
    },
    rawAfterWake(raw) {
        const w = this.norm(this.word()), f = VoiceNLU.flat(raw);
        const re = this.wakeRe(w) || new RegExp('\\b' + w.replace(/[^a-z0-9 ]/g, '') + '\\b');
        const m = re.exec(f); return m ? raw.slice(m.index + m[0].length).replace(/^[\s,.:;!-]+/, '').trim() : raw;
    },
    armedUntil: 0, quiet: 0, sug: null,
    heard(txt) {
        if (Date.now() < this.quiet) return;             // pas d'écoute pendant nos propres bips / réponses vocales
        const raw = String(txt || '').trim(), t = this.norm(raw); if (!t) return;
        let rest = t, rawRest = raw, explicit = false;
        if (this.wakeOn()) {
            const r = this.afterWake(t);
            if (r === null) { if (Date.now() > this.armedUntil) return; explicit = true; }   // pas de mot d'activation : on ignore
            else { rest = r; explicit = true; rawRest = this.rawAfterWake(raw); }
            if (r === '') { this.armedUntil = Date.now() + 7000; this.pill('armed', 'Je t\'écoute'); this.fb('wake'); return; }
        }
        if (!this.pendingOk()) this.armedUntil = 0;
        let res = null; try { res = this.understand(rawRest); } catch (e) { console.warn('Voix :', e); }
        if (res === null || res === undefined) res = this.command(rest);
        if (res && typeof res === 'object') { this.pill('ok', res.label, res.ms || 3000); if (res.say && this.fbMode() !== 'none') this.speak(res.say); else this.fb('ok', res.label); }
        else if (res && res[0] !== '!') { this.pill('ok', res); this.fb('ok', res); }
        else if (res) this.pill('ko', res.slice(1), 3500);
        else if (explicit) {   // pas compris : on propose la commande la plus proche (« oui » pour l'exécuter)
            let sg = null; try { sg = VoiceNLU.suggest(rawRest); } catch (e) {}
            if (sg) { this.sug = { text: sg, until: Date.now() + 8000 }; this.armedUntil = this.sug.until; this.pill('ko', 'Tu voulais dire « ' + sg + ' » ?', 4500); }
            else this.pill('ko', 'Pas compris');
        }   // visuel seulement : jamais de bip pour un échec
        // sans mot d'activation, une phrase sans rapport (conversation, vent) est ignorée en silence
    },
    /* Pastille micro (retour visuel) */
    pill(state, text, ms) {
        let el = this.$('rm-voice');
        if (!el) { el = document.createElement('div'); el.id = 'rm-voice'; el.className = 'rm-voice'; el.hidden = true; el.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg><span></span>'; (this.$('rm-div') || this.$('rm')).appendChild(el); }
        clearTimeout(this._pt);
        if (!state) { el.hidden = true; return; }
        el.hidden = false; el.className = 'rm-voice ' + state; el.querySelector('span').textContent = text || '';
        if (state === 'ok' || state === 'ko') this._pt = setTimeout(() => this.pill(this.rec ? 'listen' : null), ms || 1800);
        else if (state === 'armed') this._pt = setTimeout(() => { if (this.rec) this.pill('listen'); }, ms || 7000);
    },
    /* Retour sonore : bip ou voix (le micro est coupé le temps du retour pour ne pas s'entendre) */
    fb(kind, text) {
        const mode = this.fbMode(); if (mode === 'none') return;
        if (mode === 'voice' && 'speechSynthesis' in window && kind !== 'wake') {
            try { const u = new SpeechSynthesisUtterance(kind === 'ko' ? (text || 'Pas compris') : 'OK, ' + text); u.lang = 'fr-FR'; this.quiet = Date.now() + 5000; u.onend = () => { this.quiet = Date.now() + 500; }; speechSynthesis.cancel(); speechSynthesis.speak(u); return; } catch (e) {}
        }
        this.beep(kind);
    },
    beep(kind) {
        try {
            const C = window.AudioContext || window.webkitAudioContext; if (!C) return; this._ac = this._ac || new C(); const ac = this._ac; if (ac.state === 'suspended') ac.resume();
            const seq = kind === 'ok' ? [[660, 0, .09], [880, .1, .09]] : kind === 'ko' ? [[220, 0, .18]] : [[880, 0, .1]];
            this.quiet = Date.now() + 700;
            seq.forEach(([f, t0, d]) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.value = .12; o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + d); });
        } catch (e) {}
    },

    /* Commandes : renvoie le texte confirmé (« Suivant »), « !message » si impossible, null si non comprise */
    command(txt) {
        const t = this.norm(txt);
        const has = (...w) => w.some(x => t.includes(x));
        const btn = id => { const b = this.$(id); if (b) b.click(); };
        const mic = () => { const b = this.$('btn-toggle-mic'); if (b) b.click(); };
        const play = () => { try { ModuleMusic.togglePlay(); } catch (e) {} };
        const vol = d => { try { const a = ModuleMusic.state.audioObj; a.volume = Math.max(0, Math.min(1, a.volume + d)); const s = this.$('local-volume'); if (s) s.value = Math.round(a.volume * 100); } catch (e) {} };
        const riding = () => { try { return !!ModuleDashboard.state.isRiding; } catch (e) { return false; } };
        const map = () => { this.goto('map'); return (() => { try { return ModuleGPS.state.map; } catch (e) { return null; } })(); };
        // Balade
        if (has('arrete la balade', 'termine la balade', 'stop la balade', 'fin de la balade', 'arrete la route')) { if (!riding()) return '!Aucune balade en cours'; this.goStop(); return 'Arrêt de la balade'; }
        if (has('demarre la balade', 'lance la balade', 'commence la balade', 'demarre la route', 'demarrer la balade')) { if (riding()) return '!Balade déjà en cours'; this.goStop(); return 'Démarrage'; }
        // Carte
        if (has('recentre', 'centre la carte', 'ma position')) { map(); this.recenter(); return 'Carte recentrée'; }
        if (has('zoom avant', 'zoome', 'plus de zoom', 'rapproche')) { const m = map(); if (m) m.zoomIn(); return 'Zoom avant'; }
        if (has('zoom arriere', 'dezoome', 'moins de zoom', 'eloigne')) { const m = map(); if (m) m.zoomOut(); return 'Zoom arrière'; }
        // Danger : « signale un accident », « danger gravillons »…
        if (has('danger', 'signale', 'signalement', 'accident', 'gravillon', 'animal')) {
            map(); const sh = this.$('rm-dsheet'); if (!sh) return null;
            const k = has('accident') ? 'accident' : has('gravillon') ? 'gravel' : has('animal') ? 'animal' : has('autre') ? 'other' : null;
            if (!k) { sh.hidden = false; return 'Quel danger ?'; }
            const b = sh.querySelector('.rm-dgrid button[data-k="' + k + '"]'); if (!b) return null; sh.hidden = false; this.reportDanger(b);
            return 'Danger signalé : ' + ({ accident: 'accident', gravel: 'gravillons', animal: 'animal', other: 'autre' })[k];
        }
        // Économie d'énergie (plein écran seulement)
        if (has('economie', 'mode eco', 'eco d energie')) {
            if (!riding() || !document.body.classList.contains('rm-imm')) return '!Économie : plein écran requis';
            btn('rm-eco'); return document.body.classList.contains('eco') ? 'Économie d\'énergie activée' : 'Économie d\'énergie coupée';
        }
        // Groupe / intercom
        if (has('mode rencontre', 'rencontre')) { this.goto('intercom'); btn('rm-meet'); return 'Mode rencontre'; }
        if (has('rejoins le groupe', 'rejoindre le groupe', 'rejoins un groupe', 'quitte le groupe', 'quitter le groupe')) { this.goto('intercom'); this.joinGroup(); return has('quitt') ? 'Quitter le groupe' : 'Rejoindre un groupe'; }
        // Musique, micro, volume
        if (has('musique suivante', 'morceau suivant', 'suivant', 'next')) { try { ModuleMusic.nextTrack(false); } catch (e) {} return 'Suivant'; }
        if (has('precedent', 'morceau precedent')) { try { ModuleMusic.prevTrack(); } catch (e) {} return 'Précédent'; }
        if (has('pause', 'lecture', 'play', 'mets la musique', 'coupe la musique', 'arrete la musique')) { play(); return 'Lecture / pause'; }
        if (has('coupe le micro', 'micro off', 'muet', 'coupe mon micro')) { try { if (!ModuleIntercom.state.isMicMuted) mic(); } catch (e) {} return 'Micro coupé'; }
        if (has('active le micro', 'micro on', 'reactive le micro', 'allume le micro')) { try { if (ModuleIntercom.state.isMicMuted) mic(); } catch (e) {} return 'Micro actif'; }
        if (has('volume plus', 'plus fort', 'monte le son')) { vol(0.1); return 'Volume +'; }
        if (has('volume moins', 'moins fort', 'baisse le son')) { vol(-0.1); return 'Volume −'; }
        // Widgets
        if (has('compteur', 'vitesse')) { this.goto('speed'); return 'Compteur'; }
        if (has('carte', 'navigation', 'guidage')) { this.goto('map'); return 'Carte'; }
        if (has('meteo')) { this.goto('weather'); return 'Météo'; }
        if (has('intercom', 'interphone')) { this.goto('intercom'); return 'Intercom'; }
        if (has('musique')) { this.goto('music'); return 'Musique'; }
        if (has('plein ecran', 'barre de navigation')) { this.setImmersive(!document.body.classList.contains('rm-imm')); return 'Plein écran'; }
        return null;
    },

    /* ---------- réglages ---------- */
    initSettings() {
        const $ = id => this.$(id);
        const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
        on('btn-route-mode-set', () => AppPrefs.set('route', this.mode() === 'auto' ? 'manual' : 'auto'));
        on('btn-route-wake-set', () => AppPrefs.set('rwake', this.wakeOn() ? 'off' : 'on'));
        on('btn-route-word-set', async () => {
            let v = null; try { v = await AppDialog.prompt('Mot d\'activation', this.word(), { placeholder: 'ride', okText: 'Enregistrer', message: 'Un mot court et facile à reconnaître (3 à 12 lettres), sans accent. « Ride » est reconnu même s\'il est mal compris.', maxLength: 12 }); } catch (e) {}
            if (v === null || v === undefined) return;
            const w = this.norm(v).replace(/[^a-z]/g, '');
            if (w.length < 3) { try { AppDialog.alert('Le mot d\'activation doit contenir au moins 3 lettres.', { title: 'Mot d\'activation' }); } catch (e) {} return; }
            AppPrefs.set('rword', w);
        });
        on('btn-route-fb-set', () => AppPrefs.set('rfb', { beep: 'voice', voice: 'none', none: 'beep' }[this.fbMode()]));
        on('btn-route-voice-set', () => {
            if (this.voiceOn()) return AppPrefs.set('rvoice', 'off');
            if (!this.voiceSupported()) { try { AppDialog.alert('La reconnaissance vocale n\'est pas disponible sur cet appareil ou dans ce navigateur. Les commandes vocales ne peuvent pas être activées.', { title: 'Commandes vocales' }); } catch (e) {} return; }
            AppPrefs.set('rvoice', 'on');
        });
                this.paintSettings();
    },
    paintSettings() {
        const set = (id, t) => { const e = this.$(id); if (e && e.textContent !== t) e.textContent = t; };
        set('btn-route-mode-set', this.mode() === 'auto' ? 'Automatique (plein écran au démarrage)' : 'Manuel (barre de navigation conservée)');
        set('btn-route-wake-set', this.wakeOn() ? 'Activé' : 'Désactivé (la voix écoute tout)');
        set('btn-route-word-set', '« ' + this.word().charAt(0).toUpperCase() + this.word().slice(1) + ' »');
        set('btn-route-fb-set', { beep: 'Bip de confirmation', voice: 'Voix de confirmation', none: 'Visuel seulement' }[this.fbMode()]);
        set('btn-route-voice-set', this.voiceOn() ? 'Activées' : 'Désactivées');
        set('set-s-route', (this.mode() === 'auto' ? 'Plein écran auto' : 'Manuel') + (this.voiceOn() ? ' · voix' : ''));
    }
};
document.addEventListener('DOMContentLoaded', () => ModuleRoute.init());
