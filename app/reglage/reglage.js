            const ModuleSettings = {
                state: { unit: 'kmh', theme: AppTheme.get('mode', 'dark') },
                init() {
                    this.updateThemeButtonLabel();
                    AppTheme.startAuto();
                    this.buildAccentSwatches(); this._styleTab = null; this.buildStyleGrid();
                    this.buildRouteColorSwatches();
                    this.initListeners();
                },
                initListeners() {
                    document.getElementById('btn-toggle-unit').addEventListener('click', () => this.compute.toggleUnit());
                    const nvGroups = [['nv-choice', 'nav', 'nav'], ['nv-style', 'navStyle', 'style']];
                    const nvPaint = () => nvGroups.forEach(([id, k, a]) => document.querySelectorAll('#' + id + ' button').forEach(b => { let v = AppPrefs.get(k); if (k === 'nav' && v === 'slim') v = 'side'; if (k === 'navStyle' && AppPrefs.get('nav') === 'slim') v = 'slim'; b.classList.toggle('on', b.dataset[a] === v); }));
                    nvGroups.forEach(([id, k, a]) => document.querySelectorAll('#' + id + ' button').forEach(b => b.addEventListener('click', () => { if (AppPrefs.get('nav') === 'slim') { AppPrefs.set('nav', 'side'); AppPrefs.set('navStyle', 'slim'); } AppPrefs.set(k, b.dataset[a]); nvPaint(); })));
                    nvPaint();
                    const spPaint = () => document.querySelectorAll('#sp-style button').forEach(b => b.classList.toggle('on', b.dataset.sp === (AppPrefs.get('speedStyle') || 'barre')));
                    document.querySelectorAll('#sp-style button').forEach(b => b.addEventListener('click', () => { AppPrefs.set('speedStyle', b.dataset.sp); spPaint(); }));
                    spPaint();
                    document.getElementById('btn-toggle-wake').addEventListener('click', () => { const n = { ride: 'always', always: 'never', never: 'ride' }[AppPrefs.get('wake')] || 'ride'; AppPrefs.set('wake', n); this.updatePrefLabels(); });
                    document.getElementById('btn-toggle-cue').addEventListener('click', () => { const n = { all: 'vibe', vibe: 'off', off: 'all' }[AppPrefs.get('cue')] || 'all'; AppPrefs.set('cue', n); this.updatePrefLabels(); if (n !== 'off') AppCue.join(); });
                    document.getElementById('btn-toggle-sensors').addEventListener('click', () => { AppPrefs.set('sensors', AppPrefs.get('sensors') === 'off' ? 'on' : 'off'); this.updatePrefLabels(); });
                    document.getElementById('btn-toggle-remind').addEventListener('click', () => { AppPrefs.set('remind', AppPrefs.get('remind') === 'off' ? 'on' : 'off'); this.updatePrefLabels(); });
                    document.getElementById('btn-toggle-eco').addEventListener('click', () => { const n = { off: 'auto', auto: 'always', always: 'off' }[AppPrefs.get('eco')] || 'off'; AppPrefs.set('eco', n); this.updatePrefLabels(); });
                    this.updatePrefLabels();
                    document.getElementById('btn-toggle-theme').addEventListener('click', () => this.compute.toggleMode());
                    document.querySelectorAll('#view-settings [data-sgo]').forEach(b => b.addEventListener('click', () => { if (b.dataset.sgo === 'set-sub-offline' && typeof AppSub !== 'undefined' && !AppSub.gate()) return; this.go(b.dataset.sgo); }));
                    document.getElementById('set-back').addEventListener('click', () => this.go('set-sub-home'));
                    document.addEventListener('prefchange', () => this.updateHomeInfo()); document.addEventListener('auth:update', () => this.updateHomeInfo());
                    this.updateHomeInfo();
                },
                // Navigation accueil ↔ sous-pages (comme l'Atelier et Sécurité)
                go(id) {
                    const root = document.getElementById('view-settings'); if (!root) return;
                    root.querySelectorAll('.set-sub-view').forEach(v => v.classList.toggle('active', v.id === id));
                    const home = id === 'set-sub-home'; root.classList.toggle('set-home', home);
                    const v = document.getElementById(id); document.getElementById('set-pagetitle-t').textContent = (v && v.dataset.title) || 'Réglages';
                    root.scrollTop = 0; if (home) this.updateHomeInfo();
                    // Pages dont le contenu vient d'un autre module : on le (re)construit à l'ouverture et on le retire en quittant
                    const off = document.getElementById('set-offline-host'), mic = document.getElementById('set-mic-host');
                    off.innerHTML = ''; mic.innerHTML = '';
                    if (id === 'set-sub-appearance') { this._styleTab = null; this.buildStyleGrid(); }   // rouvre sur l'onglet du style en cours
                    if (id === 'set-sub-account' && (typeof AppAuth !== 'undefined')) { AppAuth.renderAccount(document.getElementById('set-account-host')); AppAuth.check(); }
                    if (id === 'set-sub-account' && typeof ModuleCommunity !== 'undefined' && ModuleCommunity.renderBlocked) ModuleCommunity.renderBlocked(document.getElementById('set-blocked-host'));
                    if (id === 'set-sub-offline' && typeof ModuleGPS !== 'undefined') ModuleGPS.offlineOpen(off);
                    if (id === 'set-sub-mic' && typeof ModuleMic !== 'undefined') ModuleMic.openPanel(mic);
                },
                // Résumés affichés sous chaque tuile
                updateHomeInfo() {
                    const set = (id, t) => { const e = document.getElementById(id); if (e && e.textContent !== t) e.textContent = t; };
                    if ((typeof AppAuth !== 'undefined')) { const u = AppAuth.user(); set('set-s-account', u ? (u.username || u.email || '') : ''); }
                    const th = this.state.theme, acc = (AppTheme.accentThemes.find(t => t.key === AppTheme.get('accent', 'blanc')) || {}).label || '';
                    set('set-s-appearance', (AppStyles.current() !== 'standard' ? AppStyles.list.find(x => x.key === AppStyles.current()).label + ' · ' : '') + (th === 'auto' ? 'Automatique' : (th === 'dark' ? 'Sombre' : 'Clair')) + (acc ? ' · ' + acc : ''));
                    set('set-s-display', (AppUnits.mph() ? 'mph' : 'km/h') + ' · écran ' + ({ ride: 'allumé en balade', always: 'toujours allumé', never: 'veille normale' }[AppPrefs.get('wake')] || '') + (AppPrefs.get('eco') !== 'off' ? ' · économie' : ''));
                },
                updatePrefLabels() {
                    const L = { unit: { kmh: 'Kilomètres (km/h)', mph: 'Miles (mph)' }, wake: { ride: 'Allumé pendant la balade', always: 'Toujours allumé', never: 'Veille normale (ne pas forcer)' }, eco: { off: 'Désactivée', auto: 'Automatique (batterie ≤ 20 %)', always: 'Toujours pendant la balade' }, cue: { all: 'Son et vibration', vibe: 'Vibration seule', off: 'Désactivés' }, remind: { on: 'Activés', off: 'Désactivés' }, sensors: { on: 'Enregistrées pendant la balade', off: 'Désactivées' } };
                    [['btn-toggle-unit', 'unit'], ['btn-toggle-wake', 'wake'], ['btn-toggle-eco', 'eco'], ['btn-toggle-cue', 'cue'], ['btn-toggle-remind', 'remind'], ['btn-toggle-sensors', 'sensors']].forEach(([id, k]) => { const b = document.getElementById(id); if (b) b.textContent = L[k][AppPrefs.get(k)] || ''; });
                },
                updateThemeButtonLabel() {
                    const btn = document.getElementById('btn-toggle-theme');
                    const th = this.state.theme, fm = AppStyles.forcedMode();
                    btn.disabled = !!fm; btn.style.opacity = fm ? '.5' : '';
                    if (fm) { btn.textContent = 'Imposé par le style (' + (fm === 'dark' ? 'sombre' : 'clair') + ')'; return; }
                    btn.textContent = th === 'auto' ? `Automatique (${AppTheme.effectiveMode() === 'dark' ? 'nuit' : 'jour'} en ce moment)` : (th === 'dark' ? 'Sombre (Carte de nuit)' : 'Clair (Carte routière)');
                },
                buildStyleGrid(tab) {
                    const grid = document.getElementById('style-grid'), tabs = document.getElementById('style-tabs'); if (!grid || !tabs) return;
                    const cur = AppStyles.current(), curDef = AppStyles.list.find(x => x.key === cur);
                    // onglet affiché : celui demandé, sinon le dernier choisi, sinon celui du style en cours
                    if (tab) this._styleTab = tab; else if (!this._styleTab) this._styleTab = (curDef && curDef.cat) || (AppStyles.CATS[0] && AppStyles.CATS[0].key);
                    const shown = this._styleTab;
                    tabs.innerHTML = '';
                    AppStyles.CATS.forEach(c => {
                        const n = AppStyles.list.filter(x => x.cat === c.key).length; if (!n) return;
                        const b = document.createElement('button'); b.type = 'button'; b.className = 'style-tab' + (c.key === shown ? ' active' : ''); b.dataset.cat = c.key; b.setAttribute('role', 'tab');
                        b.innerHTML = `${c.label}<small>${n}</small>${curDef && curDef.cat === c.key ? '<i title="Style en cours"></i>' : ''}`;
                        b.addEventListener('click', () => this.buildStyleGrid(c.key)); tabs.appendChild(b);
                    });
                    grid.innerHTML = '';
                    AppStyles.list.filter(x => x.cat === shown).forEach(st => {
                        const b = document.createElement('button'); b.type = 'button'; b.className = 'style-tile' + (st.key === cur ? ' active' : ''); b.dataset.style = st.key;
                        b.innerHTML = `<i style="background:${st.prev}"></i><b>${st.label}</b>`;
                        b.addEventListener('click', () => {
                            if (st.key !== 'standard' && typeof AppSub !== 'undefined' && !AppSub.gate()) return;
                            AppTheme.set('style', st.key); AppTheme.applyAppTheme();
                            if (typeof ModuleGPS !== 'undefined' && ModuleGPS.applyMapTheme) ModuleGPS.applyMapTheme();
                            this.buildStyleGrid(); this.updateThemeButtonLabel(); this.updateHomeInfo();
                        });
                        grid.appendChild(b);
                    });
                    const hint = document.getElementById('style-hint'); if (hint) hint.textContent = curDef ? curDef.label + ' : ' + curDef.hint + (curDef.mode ? ' · impose le mode ' + (curDef.mode === 'dark' ? 'sombre' : 'clair') : '') : '';
                },
                buildAccentSwatches() {
                    const row = document.getElementById('accent-swatch-row');
                    const current = AppTheme.get('accent', 'blanc');
                    row.innerHTML = '';
                    AppTheme.accentThemes.forEach(t => {
                        const b = document.createElement('button');
                        b.className = 'color-swatch' + (t.key === current ? ' active' : '');
                        b.style.background = t.color;
                        b.title = t.label;
                        b.addEventListener('click', () => {
                            AppTheme.set('accent', t.key);
                            AppTheme.applyAppTheme(); ModuleSettings.updateHomeInfo();
                            row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                            b.classList.add('active');
                        });
                        row.appendChild(b);
                    });
                },
                buildRouteColorSwatches() {
                    const row = document.getElementById('route-color-row');
                    const current = AppTheme.get('routeColor', 'racing');
                    row.innerHTML = '';
                    AppTheme.routeColors.forEach(c => {
                        const b = document.createElement('button');
                        b.className = 'color-swatch' + (c.key === current ? ' active' : '');
                        b.style.background = c.color;
                        b.title = c.label;
                        b.addEventListener('click', () => {
                            AppTheme.set('routeColor', c.key);
                            row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                            b.classList.add('active');
                            if (typeof ModuleGPS !== 'undefined' && ModuleGPS.state.map && ModuleGPS.state.map.getLayer('route-line')) {
                                ModuleGPS.state.map.setPaintProperty('route-line', 'line-color', c.color);
                            }
                        });
                        row.appendChild(b);
                    });
                },
                render: { 
                    updateUiPreferences() { /* Réservé pour bascule kmh/mph */ } 
                },
                compute: { 
                    toggleUnit() { AppPrefs.set('unit', AppUnits.mph() ? 'kmh' : 'mph'); ModuleSettings.updatePrefLabels(); },
                    toggleMode() {
                        ModuleSettings.state.theme = { dark: 'light', light: 'auto', auto: 'dark' }[ModuleSettings.state.theme] || 'dark';
                        AppTheme.set('mode', ModuleSettings.state.theme);
                        AppTheme._cur = AppTheme.effectiveMode();
                        AppTheme.applyAppTheme();
                        ModuleSettings.updateThemeButtonLabel(); ModuleSettings.updateHomeInfo();
                        
 // Plus de rechargement : la carte change de fond en direct
                        if (typeof ModuleGPS !== 'undefined' && ModuleGPS.applyMapTheme) ModuleGPS.applyMapTheme();
                    }
                }
            };
