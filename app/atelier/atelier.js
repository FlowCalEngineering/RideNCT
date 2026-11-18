            const ModuleMaintenance = {
                KEYS: { logs: 'motoapp_maintenance_logs', tasks: 'motoapp_maintenance_tasks', active: 'motoapp_maintenance_active_moto', extra: 'motoapp_atelier_extra', prefs: 'motoapp_atelier_prefs' },
                CATS: [
                    { id: 'entretien', label: 'Entretien', icon: VI.droplet, color: 'var(--at-s1)' },
                    { id: 'reparation', label: 'Réparation', icon: VI.tool, color: 'var(--at-s2)' },
                    { id: 'modification', label: 'Modification', icon: VI.settings, color: 'var(--at-s3)' },
                    { id: 'controle', label: 'Contrôle', icon: VI.clipboard, color: 'var(--at-s4)' },
                    { id: 'pieces', label: 'Pièces', icon: VI.package, color: 'var(--at-s5)' },
                    { id: 'autre', label: 'Autre', icon: VI.edit, color: 'var(--at-s7)' }
                ],
                DOC_TYPES: [
                    { id: 'carte-grise', label: 'Carte grise', icon: VI.file },
                    { id: 'assurance', label: 'Assurance', icon: VI.shield },
                    { id: 'controle', label: 'Contrôle technique', icon: VI.checkc },
                    { id: 'permis', label: 'Permis', icon: VI.card },
                    { id: 'autre', label: 'Autre document', icon: VI.fileText }
                ],
                SPEC_PRESETS: ['Huile moteur', 'Huile de boîte', 'Huile de fourche', 'Liquide de frein', 'Liquide de refroidissement', 'Pneu avant', 'Pneu arrière', 'Pression avant', 'Pression arrière', 'Bougie', 'Filtre à air', 'Filtre à huile', 'Chaîne / pignons', 'Gicleur principal', 'Gicleur de ralenti', 'Réglage fourche', 'Réglage amortisseur', 'Plaque', 'N° de série (VIN)'],
                TASK_PRESETS: [
                    { title: 'Graissage chaîne', unit: 'km', interval: 500 }, { title: 'Tension chaîne', unit: 'km', interval: 1000 },
                    { title: 'Kit chaîne', unit: 'km', interval: 20000 }, { title: 'Vidange moteur', unit: 'km', interval: 6000, months: 12 },
                    { title: 'Vidange boîte', unit: 'km', interval: 3000 }, { title: 'Filtre à huile', unit: 'km', interval: 6000 },
                    { title: 'Nettoyage filtre à air', unit: 'hr', interval: 15 }, { title: 'Bougie', unit: 'km', interval: 5000 },
                    { title: 'Plaquettes avant', unit: 'km', interval: 8000 }, { title: 'Plaquettes arrière', unit: 'km', interval: 10000 },
                    { title: 'Liquide de frein', unit: 'mo', interval: 24 }, { title: 'Liquide de refroidissement', unit: 'mo', interval: 24 },
                    { title: 'Huile de fourche', unit: 'km', interval: 20000 }, { title: 'Joints spi de fourche', unit: 'km', interval: 25000 },
                    { title: 'Contrôle pneus', unit: 'mo', interval: 6 }, { title: 'Pression des pneus', unit: 'wk', interval: 2 }, { title: 'Piston / Segments', unit: 'hr', interval: 50 },
                    { title: 'Haut moteur', unit: 'hr', interval: 100 }, { title: 'Jeu aux soupapes', unit: 'km', interval: 24000 },
                    { title: 'Filtre à essence', unit: 'km', interval: 15000 }, { title: 'Roulements de direction', unit: 'km', interval: 30000 },
                    { title: 'Batterie', unit: 'mo', interval: 48 }, { title: 'Révision générale', unit: 'mo', interval: 12 },
                    { title: 'Contrôle technique', unit: 'mo', interval: 24 }
                ],
                state: {
                    activeMotoId: null,
                    logs: [],   // { id, motoId, date, title, category, km, hr, cost, shop, notes, photos[], partsUsed[], taskId }
                    tasks: [],  // { id, motoId, title, unit: 'km'|'hr'|'wk'|'mo', interval, last, months?, lastDate? }
                    extra: { specs: [], parts: [], docs: [], meterHist: [], rides: [], notified: {} },
                    prefs: {},
                    pendingPhotos: [],   // { id?, dataUrl, isNew }
                    removedPhotoIds: [],
                    formCat: 'entretien',
                    editingLogId: null,
                    search: '', catFilter: 'all',
                    carnetPane: 'fiche'
                },
                // ---------- Utilitaires ----------
                esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
                num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; },
                fmt(n, dec = 0) { return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: dec }); },
                eur(n) { n = Number(n) || 0; return this.fmt(n, Math.abs(n % 1) > 0.004 ? 2 : 0) + ' €'; },
                uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
                $(id) { return document.getElementById(id); },
                todayStr() { return this.strFromDate(Date.now()); },
                dateFromStr(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : Date.now(); },
                strFromDate(ts) { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
                dayFmt(ts) { return new Date(ts).toLocaleDateString('fr-FR'); },
                motos() { return (typeof ModuleProfile !== 'undefined' && Array.isArray(ModuleProfile.state.motos)) ? ModuleProfile.state.motos : []; },
                activeMoto() { return this.motos().find(m => m.id === this.state.activeMotoId) || null; },
                motoName(m) { return m ? `${m.marque || ''} ${m.modele || ''}`.trim() : ''; },
                kmOf(moto) { return moto ? (moto.kmTotal != null && moto.kmTotal !== '' ? this.num(moto.kmTotal) : this.num(moto.km)) : 0; },
                hrOf(moto) { return moto ? this.num(moto.hrTotal) : 0; },
                catOf(id) { return this.CATS.find(c => c.id === id) || this.CATS[0]; },
                readJSON(key, fb) { try { const v = JSON.parse(localStorage.getItem(key)); return (v && typeof v === 'object') ? v : fb; } catch (e) { return fb; } },
                toast(msg) {
                    const t = this.$('at-toast'); if (!t) return;
                    t.textContent = msg; t.classList.add('show');
                    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), 2600);
                },
                // Notification de l'app (si dispo) sinon toast local
                notify(title, text) {
                    if (typeof ModuleCommunity !== 'undefined' && ModuleCommunity.showNotification) {
                        try { ModuleCommunity.showNotification(title, text, `<svg style="width:26px;height:26px;color:#ff9f0a" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`); return; } catch (e) {}
                    }
                    this.toast(`${title} — ${text}`);
                },
                // ---------- Photos (IndexedDB, repli en ligne) ----------
                Photos: {
                    _p: null,
                    open() {
                        if (this._p) return this._p;
                        this._p = new Promise(res => {
                            try {
                                const r = indexedDB.open(AppData.db('vroom_atelier'), 2);
                                r.onupgradeneeded = () => { try { ['photos', 'kv'].forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); }); } catch (e) {} };
                                r.onsuccess = () => res(r.result);
                                r.onerror = () => res(null); r.onblocked = () => res(null);
                            } catch (e) { res(null); }
                        });
                        return this._p;
                    },
                    async put(dataUrl) {
                        const id = 'p' + ModuleMaintenance.uid();
                        const db = await this.open();
                        if (!db) return 'inline:' + dataUrl;
                        try {
                            await new Promise((ok, ko) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(dataUrl, id); tx.oncomplete = ok; tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error); });
                            return id;
                        } catch (e) { return 'inline:' + dataUrl; }
                    },
                    async get(id) {
                        if (!id) return null;
                        if (String(id).startsWith('inline:')) return String(id).slice(7);
                        const db = await this.open(); if (!db) return null;
                        try { return await new Promise((ok) => { const rq = db.transaction('photos').objectStore('photos').get(id); rq.onsuccess = () => ok(rq.result || null); rq.onerror = () => ok(null); }); } catch (e) { return null; }
                    },
                    async del(id) {
                        if (!id || String(id).startsWith('inline:')) return;
                        const db = await this.open(); if (!db) return;
                        try { db.transaction('photos', 'readwrite').objectStore('photos').delete(id); } catch (e) {}
                    }
                },
                compress(file) {
                    return new Promise(res => {
                        if (typeof ModuleProfile === 'undefined' || !ModuleProfile.compressImage) return res(null);
                        try { ModuleProfile.compressImage(file, 1100, (b64) => res(b64)); } catch (e) { res(null); }
                    });
                },
                // ---------- Données ----------
                init() {
                    this.initTabs();
                    this.initListeners();
                    this.renderAll();
                    // Stockage sans limite pratique : IndexedDB + demande de stockage persistant
                    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
                    this.loadData().then(() => { this._loaded = true; this.ensureMotoIds(); this.renderAll(); this.migratePhotos(); if (this._pendingSave) { this._pendingSave = false; this.save('all'); } });
                },
                // ---------- Écouteurs ----------
                initTabs() {
                    const tabs = document.querySelectorAll('.atelier-tab-btn');
                    tabs.forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            const targetId = e.currentTarget.getAttribute('data-sub');
                            tabs.forEach(t => t.classList.remove('active'));
                            e.currentTarget.classList.add('active');
                            document.querySelectorAll('.atelier-sub-view').forEach(v => v.classList.remove('active'));
                            const targetView = document.getElementById(targetId);
                            if (targetView) targetView.classList.add('active');
                            this.setPage(targetId);
                            const scroller = document.getElementById('view-maintenance');
                            if (scroller) scroller.scrollTo({ top: 0 });
                            try { e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (er) {}
                        });
                    });
                    document.querySelectorAll('.at-home-tile').forEach(b => b.addEventListener('click', () => this.showTab(b.dataset.go)));
                    this.$('at-back').addEventListener('click', () => { if (this.state.editingLogId) this.cancelEdit(); this.showTab('sub-atelier-home'); });
                    this.$('at-page-add').addEventListener('click', () => this.showTab('sub-atelier-nouveau'));
                    this.$('log-more-toggle').addEventListener('click', () => this.toggleMore());
                    this.setPage('sub-atelier-home');
                    this.$('carnet-seg').addEventListener('click', (e) => { const b = e.target.closest('button[data-pane]'); if (b) this.setCarnetPane(b.dataset.pane); });
                },
                PAGES: { 'sub-atelier-historique': 'Historique', 'sub-atelier-tableau': 'À prévoir', 'sub-atelier-carnet': 'Carnet', 'sub-atelier-nouveau': 'Nouvelle intervention' },
                setPage(id) {
                    const v = this.$('view-maintenance'), home = id === 'sub-atelier-home';
                    v.classList.toggle('at-home', home); v.classList.toggle('at-page', !home);
                    v.dataset.page = id;
                    if (!home) {
                        const editing = id === 'sub-atelier-nouveau' && this.state.editingLogId;
                        this.$('at-pagetitle-t').textContent = editing ? "Modifier l'intervention" : (this.PAGES[id] || '');
                        this.$('at-pagetitle-s').textContent = this.motoName(this.activeMoto());
                        this.$('at-page-add').style.display = id === 'sub-atelier-nouveau' ? 'none' : '';
                    }
                },
                renderHome() {
                    const moto = this.activeMoto(), set = (id, html) => { const e = this.$(id); if (e) e.innerHTML = html; };
                    if (!moto) { set('home-s-forecast', 'Choisis une moto'); set('home-s-history', ''); set('home-s-carnet', ''); return; }
                    const a = this.alertsFor(moto), nTasks = this.state.tasks.filter(t => t.motoId === moto.id).length;
                    const pl = (n, s, p) => n + ' ' + (n > 1 ? p : s);
                    set('home-s-forecast', a.over.length ? `<b class="bad">${pl(a.over.length, 'en retard', 'en retard')}</b>` : a.soon.length ? `<b class="warn">${pl(a.soon.length, 'bientôt dû', 'bientôt dus')}</b>` : nTasks ? '<b class="ok">Tout est à jour</b>' : 'Aucun suivi');
                    const logs = this.state.logs.filter(l => l.motoId === moto.id).sort((x, y) => y.date - x.date);
                    set('home-s-history', logs.length ? `${pl(logs.length, 'intervention', 'interventions')}<br>Dernière : ${this.esc(logs[0].title)}` : 'Aucune intervention');
                    const dEx = a.docsExpired.length, dSoon = a.docsSoon.length;
                    set('home-s-carnet', dEx ? `<b class="bad">${pl(dEx, 'document expiré', 'documents expirés')}</b>` : dSoon ? `<b class="warn">${pl(dSoon, 'document expire', 'documents expirent')} bientôt</b>` : 'Fiche technique, documents, outils');
                },
                toggleMore(force) {
                    const box = this.$('log-more'), btn = this.$('log-more-toggle');
                    const open = force !== undefined ? force : !box.classList.contains('open');
                    box.classList.toggle('open', open); btn.classList.toggle('open', open);
                },
                showTab(subId) { const b = document.querySelector(`.atelier-tab-btn[data-sub="${subId}"]`); if (b) b.click(); },
                setCarnetPane(p) {
                    this.state.carnetPane = p;
                    document.querySelectorAll('#carnet-seg button').forEach(b => b.classList.toggle('active', b.dataset.pane === p));
                    document.querySelectorAll('#sub-atelier-carnet .at-pane').forEach(el => el.classList.toggle('active', el.id === 'carnet-' + p));
                },
                initListeners() {
                    this.$('btn-edit-meters').addEventListener('click', () => this.openMetersSheet());
                    this.$('btn-add-task').addEventListener('click', () => this.openTaskSheet(null));

                    const fileInput = this.$('log-invoice');
                    this.$('btn-upload-invoice').addEventListener('click', () => fileInput.click());
                    fileInput.addEventListener('change', async (e) => {
                        const files = [...(e.target.files || [])];
                        for (const f of files) {
                            if (this.state.pendingPhotos.length >= 4) { this.toast('4 photos maximum'); break; }
                            const b64 = await this.compress(f);
                            if (b64) this.state.pendingPhotos.push({ dataUrl: b64, isNew: true });
                        }
                        fileInput.value = ''; this.renderPendingPhotos();
                    });

                    this.$('btn-save-log').addEventListener('click', () => this.saveLog());
                    this.$('btn-cancel-edit').addEventListener('click', () => this.cancelEdit());
                    this.$('log-title').addEventListener('input', () => this.updateTaskCheck());
                    this.$('log-km').addEventListener('input', () => { this._kmDirty = true; });
                    this.$('log-hr').addEventListener('input', () => { this._hrDirty = true; });
                    this.$('atelier-search').addEventListener('input', (e) => { this.state.search = e.target.value; this.renderLogs(); });
                },
                // ---------- Fenêtres génériques ----------
                sheetHead(title, sub) {
                    return `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:${sub ? 0 : 14}px;"><div><h3>${title}</h3>${sub ? `<div class="at-sheet-sub">${sub}</div>` : ''}</div><button class="at-close" data-close style="display:flex;align-items:center;justify-content:center;padding:0;">${VI.x}</button></div>`;
                },
                openSheet(html) {
                    const overlay = document.createElement('div');
                    overlay.className = 'at-overlay';
                    overlay.innerHTML = `<div class="at-sheet">${html}</div>`;
                    document.body.appendChild(overlay);
                    requestAnimationFrame(() => overlay.classList.add('show'));
                    const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 200); };
                    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
                    overlay.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
                    return { overlay, close, q: (s) => overlay.querySelector(s), qa: (s) => overlay.querySelectorAll(s) };
                },
                confirmSheet(title, text, okLabel, onOk, danger) {
                    const s = this.openSheet(`${this.sheetHead(title, '')}<div class="at-sheet-body" style="color:var(--text-muted); font-size:0.9rem; font-weight:700; line-height:1.5;">${text}</div>
                        <div class="at-sheet-actions"><button class="btn at-ghost" data-close>Annuler</button><button class="btn ${danger ? 'at-del' : 'btn-primary'}" id="c-ok">${okLabel}</button></div>`);
                    s.q('#c-ok').addEventListener('click', () => { s.close(); onOk(); });
                },
                viewPhoto(id) {
                    this.Photos.get(id).then(src => {
                        if (!src) return this.toast('Photo introuvable');
                        const old = document.getElementById('atelier-invoice-overlay'); if (old) old.remove();
                        const overlay = document.createElement('div');
                        overlay.id = 'atelier-invoice-overlay';
                        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:10005; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.25s; padding:20px;';
                        overlay.innerHTML = `<button style="position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.25); color:#fff; width:45px; height:45px; border-radius:50%; font-size:1.2rem; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">${VI.x}</button><img alt="" style="max-width:100%; max-height:88vh; border-radius:12px; object-fit:contain;">`;
                        overlay.querySelector('img').src = src;
                        document.body.appendChild(overlay);
                        requestAnimationFrame(() => overlay.style.opacity = '1');
                        const close = () => { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 250); };
                        overlay.addEventListener('click', close);
                    });
                },
                // Remplit les miniatures (async) d'un conteneur : éléments [data-pid]
                hydratePhotos(root) {
                    root.querySelectorAll('[data-pid]').forEach(el => {
                        this.Photos.get(el.dataset.pid).then(src => { if (src) el.style.backgroundImage = `url("${src}")`; });
                    });
                },
                openMetersSheet() {
                    const moto = this.activeMoto();
                    if (!moto) return AppDialog.alert("Sélectionnez une moto d'abord.");
                    const s = this.openSheet(`
                        ${this.sheetHead('Compteurs', this.esc(this.motoName(moto)))}
                        <div class="at-sheet-body">
                            <div class="input-group"><label>Kilométrage total</label><input type="number" inputmode="decimal" id="m-km" class="atelier-input" value="${this.kmOf(moto)}"></div>
                            <div class="input-group"><label>Heures moteur</label><input type="number" inputmode="decimal" id="m-hr" class="atelier-input" step="0.1" value="${this.hrOf(moto)}"></div>
                            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:700; line-height:1.4;">Les trajets faits avec le GPS s'ajoutent automatiquement ici.</div>
                        </div>
                        <div class="at-sheet-actions"><button class="btn at-ghost" data-close>Annuler</button><button class="btn btn-primary" id="m-save">Enregistrer</button></div>`);
                    s.q('#m-save').addEventListener('click', () => {
                        const km = parseFloat(s.q('#m-km').value), hr = parseFloat(s.q('#m-hr').value);
                        this.setMeters(moto, isFinite(km) && km >= 0 ? km : null, isFinite(hr) && hr >= 0 ? hr : null, 'manual');
                        this.renderAll(); s.close();
                    });
                },
                // ---------- Rendu global ----------
                renderAll() {
                    this.renderCarousel();
                    this.renderMeters();
                    this.renderAlerts();
                    this.renderLogs();
                    this.renderForecasts();
                    this.renderCarnet();
                    this.renderHome();
                    this.renderSuggestions();
                    this.renderFormExtras();
                    this.resetFormDefaults();
                },
                refresh() { this.ensureMotoIds(); this.renderAll(); },
                renderCarousel() {
                    const box = this.$('atelier-moto-carousel');
                    const motos = this.motos();
                    if (!motos.length) {
                        this.state.activeMotoId = null;
                        box.innerHTML = `<div class="at-empty" style="width:100%;">Aucune moto dans votre profil.<br>Allez dans l'onglet « Mon Profil » pour en ajouter une.</div>`;
                        return;
                    }
                    if (!motos.some(m => m.id === this.state.activeMotoId)) this.state.activeMotoId = motos[0].id;

                    box.innerHTML = '';
                    motos.forEach(m => {
                        const a = this.alertsFor(m);
                        const red = a.over.length + a.docsExpired.length, orange = a.soon.length + a.docsSoon.length;
                        const card = document.createElement('div');
                        card.className = 'moto-card' + (m.id === this.state.activeMotoId ? ' active' : '');
                        const img = m.photo ? `<div class="moto-card-img" style="background-image:url('${m.photo}')"></div>` : `<div class="moto-card-img">${VI.bike24}</div>`;
                        const badge = red ? `<span class="at-dot">${red}</span>` : (orange ? `<span class="at-dot warn">${orange}</span>` : '');
                        card.innerHTML = `${img}<div class="moto-card-text"><div class="moto-card-title">${this.esc(this.motoName(m))}</div><div class="moto-card-sub">${m.cylindree ? this.esc(m.cylindree) + ' cc' : (m.annee ? this.esc(m.annee) : '-')}${badge}</div></div>`;
                        card.addEventListener('click', () => this.setActiveMoto(m.id));
                        box.appendChild(card);
                    });
                    const act = box.querySelector('.moto-card.active');
                    if (act && act.scrollIntoView) { try { act.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) {} }
                },
                renderMeters() {
                    const m = this.activeMoto();
                    this.$('atelier-km-total').textContent = m ? this.fmt(this.kmOf(m), 1) : '0';
                    this.$('atelier-hr-total').textContent = m ? this.fmt(this.hrOf(m), 1) : '0';
                },

            };
