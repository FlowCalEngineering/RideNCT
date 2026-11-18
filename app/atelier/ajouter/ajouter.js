// Ajouter / modifier une intervention
// Étend ModuleMaintenance (défini dans atelier/atelier.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleMaintenance, {
                // =====================================================
                // FORMULAIRE AJOUT / MODIFICATION
                // =====================================================
                resetFormDefaults() {
                    if (this.state.editingLogId) return;
                    const m = this.activeMoto();
                    if (!this._kmDirty) this.$('log-km').value = m && this.kmOf(m) ? this.kmOf(m) : '';
                    if (!this._hrDirty) this.$('log-hr').value = m && this.hrOf(m) ? this.hrOf(m) : '';
                    if (!this.$('log-date').value) this.$('log-date').value = this.todayStr();
                    this.updateTaskCheck();
                },
                renderFormExtras() {
                    // Catégories
                    const cats = this.$('log-cats');
                    cats.innerHTML = '';
                    this.CATS.forEach(c => {
                        const b = document.createElement('button'); b.type = 'button';
                        b.className = 'at-chip' + (this.state.formCat === c.id ? ' active' : '');
                        b.innerHTML = `<span class="cdot" style="background:${c.color}"></span>${escHtml(c.label)}`;
                        b.addEventListener('click', () => { this.state.formCat = c.id; this.renderFormExtras(); });
                        cats.appendChild(b);
                    });
                },
                renderPendingPhotos() {
                    const box = this.$('log-photos'); box.innerHTML = '';
                    this.state.pendingPhotos.forEach((p, i) => {
                        const d = document.createElement('div'); d.className = 'at-photo'; d.style.backgroundImage = `url("${p.dataUrl}")`;
                        const x = document.createElement('button'); x.type = 'button'; x.innerHTML = VI.x;
                        x.addEventListener('click', (e) => { e.stopPropagation(); const [rm] = this.state.pendingPhotos.splice(i, 1); if (rm && rm.id) this.state.removedPhotoIds.push(rm.id); this.renderPendingPhotos(); });
                        d.appendChild(x); box.appendChild(d);
                    });
                },
                matchTask(title) {
                    const moto = this.activeMoto(), t = (title || '').trim().toLowerCase();
                    if (!moto || !t) return null;
                    return this.state.tasks.find(x => x.motoId === moto.id && x.title.trim().toLowerCase() === t) || null;
                },
                updateTaskCheck() {
                    const task = this.matchTask(this.$('log-title').value), box = this.$('log-task-check');
                    if (task && !this.state.editingLogId) { this.$('log-task-reset-label').textContent = `Remettre à zéro le suivi « ${task.title} »`; box.style.display = 'flex'; }
                    else box.style.display = 'none';
                },
                async startEdit(log) {
                    this.state.editingLogId = log.id;
                    this.state.formCat = log.category || 'entretien';
                    this.$('log-title').value = log.title;
                    this.$('log-date').value = this.strFromDate(log.date);
                    this.$('log-km').value = log.km != null ? log.km : '';
                    this.$('log-hr').value = log.hr != null ? log.hr : '';
                    this.$('log-cost').value = log.cost != null ? log.cost : '';
                    this.$('log-shop').value = log.shop || '';
                    this.$('log-notes').value = log.notes || '';
                    this.state.pendingPhotos = []; this.state.removedPhotoIds = [];
                    this.$('log-form-title').style.display = 'block';
                    this.$('btn-cancel-edit').style.display = 'block';
                    this.$('btn-save-log').textContent = 'Mettre à jour';
                    this.updateTaskCheck(); this.renderFormExtras();
                    this.toggleMore(true);
                    this.showTab('sub-atelier-nouveau');
                    for (const id of (log.photos || [])) {
                        const src = await this.Photos.get(id);
                        if (src && this.state.editingLogId === log.id) this.state.pendingPhotos.push({ id, dataUrl: src, isNew: false });
                    }
                    this.renderPendingPhotos();
                },
                cancelEdit(silent) {
                    const was = this.state.editingLogId;
                    this.state.editingLogId = null;
                    ['log-title', 'log-notes', 'log-cost', 'log-shop'].forEach(id => this.$(id).value = '');
                    this.state.pendingPhotos = []; this.state.removedPhotoIds = []; this.state.formCat = 'entretien';
                    this._kmDirty = false; this._hrDirty = false;
                    this.renderPendingPhotos();
                    this.$('log-form-title').style.display = 'none';
                    this.$('btn-cancel-edit').style.display = 'none';
                    this.$('btn-save-log').textContent = "Enregistrer l'intervention";
                    this.$('log-date').value = this.todayStr();
                    this.renderFormExtras(); this.toggleMore(false);
                    if (!silent && was) { this.resetFormDefaults(); this.showTab('sub-atelier-historique'); }
                },
                async saveLog() {
                    const moto = this.activeMoto();
                    if (!moto) return AppDialog.alert('Sélectionnez une moto.');
                    const title = this.$('log-title').value.trim();
                    if (!title) return AppDialog.alert("Veuillez indiquer le type d'intervention.");
                    const btn = this.$('btn-save-log'); if (btn.disabled) return; btn.disabled = true;
                    try {
                        const date = this.dateFromStr(this.$('log-date').value);
                        const km = parseFloat(this.$('log-km').value), hr = parseFloat(this.$('log-hr').value), cost = parseFloat(this.$('log-cost').value);

                        const photoIds = [];
                        for (const p of this.state.pendingPhotos) photoIds.push(p.isNew ? await this.Photos.put(p.dataUrl) : p.id);

                        const data = { date, title, category: this.state.formCat, km: isFinite(km) ? km : null, hr: isFinite(hr) ? hr : null, cost: isFinite(cost) ? cost : null, shop: this.$('log-shop').value.trim(), notes: this.$('log-notes').value.trim(), photos: photoIds };

                        const editing = this.state.editingLogId;
                        const task = this.matchTask(title);
                        const resetTask = !editing && task && this.$('log-task-reset').checked;
                        const backup = JSON.stringify(this.state.logs);

                        if (editing) {
                            const log = this.state.logs.find(l => l.id === editing);
                            if (log) Object.assign(log, data);
                        } else {
                            this.state.logs.push(Object.assign({ id: this.uid(), motoId: moto.id, taskId: task ? task.id : null }, data));
                        }
                        if (resetTask) this.resetTask(task, moto, date, data.km, data.hr);

                        if (!this.save('logs')) { this.state.logs = JSON.parse(backup); return; }
                        if (resetTask) this.save('tasks');
                        this.state.removedPhotoIds.forEach(id => this.Photos.del(id));

                        let changed = false; let nk = this.kmOf(moto), nh = this.hrOf(moto);
                        if (data.km != null && data.km > nk) { nk = data.km; changed = true; }
                        if (data.hr != null && data.hr > nh) { nh = data.hr; changed = true; }
                        if (changed) this.setMeters(moto, nk, nh, 'log');

                        this.cancelEdit(true);
                        this.renderAll();
                        this.showTab('sub-atelier-historique');
                        this.toast(editing ? 'Intervention mise à jour' : 'Intervention enregistrée');
                    } finally { btn.disabled = false; }
                },
});
