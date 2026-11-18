// Données : stockage, migration, compteurs km/h, fin de trajet
// Étend ModuleMaintenance (défini dans atelier/atelier.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleMaintenance, {
                // Lecture / écriture clé-valeur dans IndexedDB (repli localStorage si indisponible)
                async kvGet(key) {
                    const db = await this.Photos.open(); if (!db) return undefined;
                    try { return await new Promise((ok) => { const rq = db.transaction('kv').objectStore('kv').get(key); rq.onsuccess = () => ok(rq.result); rq.onerror = () => ok(undefined); }); } catch (e) { return undefined; }
                },
                async kvSet(key, value) {
                    const db = await this.Photos.open();
                    if (db) {
                        try { await new Promise((ok, ko) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); tx.oncomplete = ok; tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error); }); return true; } catch (e) {}
                    }
                    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
                },
                async loadData() {
                    const db = await this.Photos.open();
                    const load = async (key, fb) => {
                        let v = await this.kvGet(key);
                        if (v === undefined || v === null) {
                            // Ancienne version : données dans localStorage → migration vers IndexedDB
                            const old = this.readJSON(key, undefined);
                            if (old !== undefined) { v = old; if (db && await this.kvSet(key, old)) { try { localStorage.removeItem(key); } catch (e) {} } }
                        }
                        return (v === undefined || v === null) ? fb : v;
                    };
                    const logs = await load(this.KEYS.logs, []), tasks = await load(this.KEYS.tasks, []);
                    const ex = await load(this.KEYS.extra, {}), prefs = await load(this.KEYS.prefs, {});
                    this.state.logs = Array.isArray(logs) ? logs : [];
                    this.state.tasks = Array.isArray(tasks) ? tasks : [];
                    ['specs', 'parts', 'docs', 'meterHist', 'rides'].forEach(k => { this.state.extra[k] = Array.isArray(ex[k]) ? ex[k] : []; });
                    this.state.extra.notified = (ex.notified && typeof ex.notified === 'object') ? ex.notified : {};
                    Object.assign(this.state.prefs, prefs && typeof prefs === 'object' ? prefs : {});
                    this.state.tasks.forEach(t => { if (!t.unit) t.unit = t.type || 'km'; if (t.last === undefined) t.last = t.lastDone || 0; });
                    this.state.logs.forEach(l => { if (!l.category) l.category = 'entretien'; if (!Array.isArray(l.photos)) l.photos = []; });
                    try { this.state.activeMotoId = localStorage.getItem(this.KEYS.active) || this.state.activeMotoId; } catch (e) {}
                },
                _warned: false,
                // Écriture asynchrone en base (pas de quota de 5 Mo) — ne bloque jamais l'interface
                save(what) {
                    if (!this._loaded) { this._pendingSave = true; return true; }
                    const jobs = [];
                    if (what === 'logs' || what === 'all') jobs.push(this.kvSet(this.KEYS.logs, this.state.logs));
                    if (what === 'tasks' || what === 'all') jobs.push(this.kvSet(this.KEYS.tasks, this.state.tasks));
                    if (what === 'extra' || what === 'all') jobs.push(this.kvSet(this.KEYS.extra, this.state.extra));
                    if (what === 'prefs' || what === 'all') jobs.push(this.kvSet(this.KEYS.prefs, this.state.prefs));
                    Promise.all(jobs).then(r => { if (r.some(x => !x) && !this._warned) { this._warned = true; AppDialog.alert("Impossible d'enregistrer les données de l'Atelier (stockage du navigateur indisponible)."); setTimeout(() => { this._warned = false; }, 8000); } });
                    return true;
                },
                saveExtra() { return this.save('extra'); },
                // Anciennes factures (base64 dans le journal) → IndexedDB
                async migratePhotos() {
                    let changed = false;
                    for (const l of this.state.logs) {
                        if (l.invoiceBase64) {
                            const id = await this.Photos.put(l.invoiceBase64);
                            l.photos = (l.photos || []).concat(id);
                            delete l.invoiceBase64; changed = true;
                        }
                    }
                    if (changed) { this.save('logs'); this.renderLogs(); }
                },
                ensureMotoIds() {
                    const motos = this.motos();
                    let changed = false;
                    motos.forEach(m => { if (!m.id) { m.id = 'm' + this.uid(); changed = true; } });
                    let migrated = false;
                    [this.state.logs, this.state.tasks].forEach(arr => arr.forEach(x => {
                        if (x.motoId === undefined && x.motoIndex !== undefined) {
                            const m = motos[x.motoIndex];
                            x.motoId = m ? m.id : null;
                            delete x.motoIndex; migrated = true;
                        }
                    }));
                    // Point de départ de l'historique des compteurs
                    let baseline = false;
                    motos.forEach(m => { if (!this.state.extra.meterHist.some(h => h.motoId === m.id)) { this.state.extra.meterHist.push({ motoId: m.id, t: Date.now(), km: this.kmOf(m), hr: this.hrOf(m), src: 'init' }); baseline = true; } });
                    if (changed && typeof ModuleProfile !== 'undefined') { try { ModuleProfile.saveData(); } catch (e) {} }
                    if (migrated) this.save('all'); else if (baseline) this.save('extra');
                },
                onGarageChanged() {
                    this.ensureMotoIds(); this.renderAll();
                    if (!this._notifiedOnce) { this._notifiedOnce = true; setTimeout(() => this.maybeNotify(), 3500); }
                },
                onMotoDeleted(moto) {
                    if (!moto || !moto.id) return;
                    const ex = this.state.extra;
                    this.state.logs.filter(l => l.motoId === moto.id).forEach(l => (l.photos || []).forEach(p => this.Photos.del(p)));
                    ex.docs.filter(d => d.motoId === moto.id && d.photoId).forEach(d => this.Photos.del(d.photoId));
                    this.state.logs = this.state.logs.filter(l => l.motoId !== moto.id);
                    this.state.tasks = this.state.tasks.filter(t => t.motoId !== moto.id);
                    ['specs', 'parts', 'docs', 'meterHist', 'rides'].forEach(k => { ex[k] = ex[k].filter(x => x.motoId !== moto.id); });
                    try { localStorage.removeItem('motoapp_maintenance_seeded_' + moto.id); } catch (e) {}
                    this.save('all');
                    if (this.state.activeMotoId === moto.id) this.state.activeMotoId = null;
                },
                selectMotoByIndex(index) {
                    this.ensureMotoIds();
                    const m = this.motos()[index];
                    if (m) this.setActiveMoto(m.id);
                },
                setActiveMoto(id) {
                    this.state.activeMotoId = id;
                    try { localStorage.setItem(this.KEYS.active, id); } catch (e) {}
                    this.cancelEdit(true);
                    this.state.search = ''; this.state.catFilter = 'all';
                    const s = this.$('atelier-search'); if (s) s.value = '';
                    this.renderAll();
                },
                // ---------- Compteurs ----------
                recordMeters(moto, src) {
                    const h = this.state.extra.meterHist;
                    const km = this.kmOf(moto), hr = this.hrOf(moto);
                    let last = null;
                    for (let i = h.length - 1; i >= 0; i--) { if (h[i].motoId === moto.id) { last = h[i]; break; } }
                    if (last && last.km === km && last.hr === hr) return;
                    h.push({ motoId: moto.id, t: Date.now(), km, hr, src });
                    if (h.length > 1500) h.splice(0, h.length - 1500);
                    this.saveExtra();
                },
                setMeters(moto, km, hr, src) {
                    if (km != null && isFinite(km)) { moto.kmTotal = Math.round(km * 10) / 10; moto.km = String(Math.round(km)); }
                    if (hr != null && isFinite(hr)) moto.hrTotal = Math.round(hr * 100) / 100;
                    this.recordMeters(moto, src || 'manual');
                    this.persistProfile();
                },
                persistProfile() {
                    if (typeof ModuleProfile === 'undefined') return;
                    try { ModuleProfile.saveData(); } catch (e) { AppDialog.alert("Impossible de sauvegarder les compteurs (stockage plein ?)."); }
                },
                // Rythme de roulage (par jour) sur les 90 derniers jours
                pace(moto, field) {
                    if (!moto) return null;
                    const h = this.state.extra.meterHist.filter(x => x.motoId === moto.id).sort((a, b) => a.t - b.t);
                    if (h.length < 2) return null;
                    const now = Date.now(), win = 90 * 86400000;
                    let sum = 0;
                    for (let i = 1; i < h.length; i++) {
                        if (h[i].t < now - win) continue;
                        const d = (h[i][field] || 0) - (h[i - 1][field] || 0);
                        if (d > 0 && !(h[i].src === 'manual' && d > 500)) sum += d;
                    }
                    const days = Math.min(90, Math.max(14, (now - h[0].t) / 86400000));
                    const p = sum / days;
                    return p > 0.01 ? p : null;
                },
                // ---------- Trajets GPS ----------
                onRideEnded(info) {
                    try {
                        this.ensureMotoIds();
                        const moto = this.motos().find(m => m.id === (info && info.motoId));
                        const km = info ? +info.km : 0, sec = info ? +info.seconds : 0;
                        if (!moto || !isFinite(km) || km < 0.2) return;
                        const hrs = Math.round((sec / 3600) * 100) / 100;
                        const kmR = Math.round(km * 10) / 10;
                        this.applyRide(moto, kmR, hrs, info.prof, km);
                        this.predictNotify(moto);
                        this.toast(`+${this.fmt(kmR, 1)} km ajoutés à ${this.motoName(moto)}`);
                    } catch (e) { console.error('onRideEnded', e); }
                },
                applyRide(moto, km, hr, prof, rawKm) {
                    if (km <= 0 && hr <= 0) return;
                    const ride = { id: this.uid(), motoId: moto.id, t: Date.now(), km, hr };
                    if (prof && rawKm >= 1 && hr > 0) {   // profil de roulage : sinuosité (°/km), part rapide / lente, pluie
                        const sec = hr * 3600;
                        ride.sin = Math.round(prof.turn / rawKm); ride.hi = Math.round(Math.min(1, prof.hi / sec) * 100) / 100; ride.lo = Math.round(Math.min(1, prof.lo / sec) * 100) / 100;
                        if (prof.rain != null) ride.rain = Math.round(prof.rain * 100) / 100;
                    }
                    this.state.extra.rides.push(ride);
                    if (this.state.extra.rides.length > 800) this.state.extra.rides.splice(0, this.state.extra.rides.length - 800);
                    this.setMeters(moto, this.kmOf(moto) + km, this.hrOf(moto) + hr, 'ride');
                    this.saveExtra();
                    this.renderAll();
                },
                rideStartCheck(motoId) {
                    try {
                        const moto = this.motos().find(m => m.id === motoId); if (!moto) return;
                        const a = this.alertsFor(moto);
                        const names = a.over.map(x => x.task.title).concat(a.docsExpired.map(d => d.label || 'Document'));
                        if (names.length) this.notify('Avant de partir', `${this.motoName(moto)} : ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''} à traiter`);
                    } catch (e) {}
                },
});
