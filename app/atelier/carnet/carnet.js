// Carnet : fiche technique, documents, import/export, impression
// Étend ModuleMaintenance (défini dans atelier/atelier.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleMaintenance, {
                // =====================================================
                // CARNET (fiche, pièces, documents, outils, données)
                // =====================================================
                renderCarnet() {
                    const moto = this.activeMoto();
                    const tab = this.$('atelier-tab-carnet');
                    if (moto) {
                        const a = this.alertsFor(moto);
                        const red = a.docsExpired.length, orange = a.docsSoon.length;
                        this.setTabDot(tab, red ? `<span class="at-dot">${red}</span>` : (orange ? `<span class="at-dot warn">${orange}</span>` : ''));
                    } else this.setTabDot(tab, '');
                    this.renderFiche(); this.renderDocs(); this.renderData();
                    this.setCarnetPane(this.state.carnetPane);
                },
                emptyMoto(box) { box.innerHTML = `<div class="at-empty">Sélectionnez une moto.</div>`; },
                // ---------- Fiche technique ----------
                renderFiche() {
                    const box = this.$('carnet-fiche'), moto = this.activeMoto();
                    if (!moto) return this.emptyMoto(box);
                    const specs = this.state.extra.specs.filter(s => s.motoId === moto.id);
                    const sub = [moto.annee, moto.type, moto.cylindree ? moto.cylindree + ' cm³' : '', moto.moteur, moto.cylindres ? moto.cylindres + ' cyl.' : ''].filter(Boolean).map(x => this.esc(x)).join(' · ');
                    box.innerHTML = `
                        <div class="at-moto-head">
                            <div class="ph" ${moto.photo ? `style="background-image:url('${moto.photo}')"` : ''}>${moto.photo ? '' : VI.bike30}</div>
                            <div style="min-width:0;"><div style="font-weight:900; font-size:1.05rem; color:var(--text-main);">${this.esc(this.motoName(moto))}</div><div style="font-size:0.78rem; color:var(--text-muted); font-weight:700; margin-top:3px;">${sub}</div></div>
                        </div>`;
                    if (!specs.length) {
                        const e = document.createElement('div'); e.className = 'at-empty';
                        e.innerHTML = `Aucune info technique.<br>Note ici tes huiles, pneus, réglages carbu, références de pièces…`; box.appendChild(e);
                    }
                    specs.forEach(sp => {
                        const row = document.createElement('div'); row.className = 'at-row';
                        row.innerHTML = `<div style="min-width:0;"><div class="k">${this.esc(sp.label)}</div><div class="v">${this.esc(sp.value) || '—'}</div></div><span style="color:var(--text-muted);">›</span>`;
                        row.addEventListener('click', () => this.openSpecSheet(sp)); box.appendChild(row);
                    });
                    const add = document.createElement('button'); add.className = 'at-add-task'; add.textContent = '+ Ajouter une information'; add.addEventListener('click', () => this.openSpecSheet(null)); box.appendChild(add);
                },
                openSpecSheet(spec) {
                    const moto = this.activeMoto(); if (!moto) return;
                    const isEdit = !!spec;
                    const used = new Set(this.state.extra.specs.filter(x => x.motoId === moto.id).map(x => x.label.toLowerCase()));
                    const s = this.openSheet(`
                        ${this.sheetHead(isEdit ? "Modifier l'information" : 'Nouvelle information', this.esc(this.motoName(moto)))}
                        <div class="at-sheet-body">
                            ${isEdit ? '' : `<div class="input-group"><label>Suggestions</label><div class="at-chips" style="flex-wrap:wrap; margin-bottom:0;">${this.SPEC_PRESETS.filter(p => !used.has(p.toLowerCase())).map((p, i) => `<button class="at-chip sm" data-sp="${this.esc(p)}">${this.esc(p)}</button>`).join('')}</div></div>`}
                            <div class="input-group"><label>Intitulé</label><input type="text" id="s-label" class="atelier-input" maxlength="50" value="${isEdit ? this.esc(spec.label) : ''}" placeholder="Ex: Huile moteur"></div>
                            <div class="input-group"><label>Valeur</label><textarea id="s-value" class="atelier-input" rows="2" maxlength="300" placeholder="Ex: Motul 300V 10W40 — 1,2 L">${isEdit ? this.esc(spec.value) : ''}</textarea></div>
                        </div>
                        <div class="at-sheet-actions">${isEdit ? '<button class="btn at-del" id="s-del">Supprimer</button>' : '<button class="btn at-ghost" data-close>Annuler</button>'}<button class="btn btn-primary" id="s-save">Enregistrer</button></div>`);
                    s.qa('[data-sp]').forEach(b => b.addEventListener('click', () => { s.q('#s-label').value = b.dataset.sp; s.q('#s-value').focus(); }));
                    s.q('#s-save').addEventListener('click', () => {
                        const label = s.q('#s-label').value.trim(), value = s.q('#s-value').value.trim();
                        if (!label) return AppDialog.alert('Indique un intitulé.');
                        if (isEdit) { spec.label = label; spec.value = value; } else this.state.extra.specs.push({ id: this.uid(), motoId: moto.id, label, value });
                        if (!this.saveExtra()) return; this.renderCarnet(); s.close();
                    });
                    const del = s.q('#s-del');
                    if (del) del.addEventListener('click', () => { this.state.extra.specs = this.state.extra.specs.filter(x => x.id !== spec.id); this.saveExtra(); this.renderCarnet(); s.close(); });
                },
                // ---------- Documents ----------
                docStatus(d) {
                    if (!d.expires) return { cls: 'none', txt: 'Sans échéance' };
                    const dl = this.daysLeft(d.expires);
                    if (dl < 0) return { cls: 'bad', txt: `Expiré (${-dl} j)` };
                    if (dl <= 30) return { cls: 'warn', txt: dl === 0 ? "Expire aujourd'hui" : `Dans ${dl} j` };
                    return { cls: 'ok', txt: `Valide · ${this.dayFmt(d.expires)}` };
                },
                renderDocs() {
                    const box = this.$('carnet-docs'), moto = this.activeMoto();
                    if (!moto) return this.emptyMoto(box);
                    const docs = this.state.extra.docs.filter(d => d.motoId === moto.id).sort((a, b) => (a.expires || 9e15) - (b.expires || 9e15));
                    box.innerHTML = docs.length ? '' : `<div class="at-empty">Aucun document.<br>Ajoute ta carte grise, ton assurance, ton contrôle technique avec leur date d'échéance : l'app te prévient avant l'expiration.</div>`;
                    docs.forEach(d => {
                        const t = this.DOC_TYPES.find(x => x.id === d.type) || this.DOC_TYPES[4], st = this.docStatus(d);
                        const row = document.createElement('div'); row.className = 'at-row';
                        row.innerHTML = `<div style="min-width:0;"><div class="k">${t.icon} ${this.esc(t.label)}${d.photoId ? ' · ' + VI.clip : ''}</div><div class="v">${this.esc(d.label || t.label)}</div>${d.number ? `<div class="s">N° ${this.esc(d.number)}</div>` : ''}</div><span class="at-status ${st.cls}">${this.esc(st.txt)}</span>`;
                        row.addEventListener('click', () => this.openDocSheet(d)); box.appendChild(row);
                    });
                    const add = document.createElement('button'); add.className = 'at-add-task'; add.textContent = '+ Ajouter un document'; add.addEventListener('click', () => this.openDocSheet(null)); box.appendChild(add);
                },
                openDocSheet(doc) {
                    const moto = this.activeMoto(); if (!moto) return;
                    const isEdit = !!doc; let photoId = isEdit ? (doc.photoId || null) : null, newPhoto = null, removed = false;
                    const s = this.openSheet(`
                        ${this.sheetHead(isEdit ? 'Modifier le document' : 'Nouveau document', this.esc(this.motoName(moto)))}
                        <div class="at-sheet-body">
                            <div class="input-group"><label>Type</label><select id="x-type" class="atelier-input">${this.DOC_TYPES.map(t => `<option value="${t.id}" ${isEdit && doc.type === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
                            <div class="input-group"><label>Nom / compagnie</label><input type="text" id="x-label" class="atelier-input" maxlength="60" value="${isEdit ? this.esc(doc.label || '') : ''}" placeholder="Ex: Assurance Moto Axa"></div>
                            <div class="input-group"><label>Numéro — optionnel</label><input type="text" id="x-num" class="atelier-input" maxlength="60" value="${isEdit ? this.esc(doc.number || '') : ''}"></div>
                            <div class="input-group"><label>Date d'échéance — optionnel</label><input type="date" id="x-exp" class="atelier-input" value="${isEdit && doc.expires ? this.strFromDate(doc.expires) : ''}"></div>
                            <div class="input-group"><label>Photo / scan</label>
                                <input type="file" id="x-file" accept="image/*" style="display:none;">
                                <button class="btn at-ghost" id="x-pick" style="padding:14px;">Joindre une image</button>
                                <div id="x-photos" class="at-photos"></div>
                            </div>
                        </div>
                        <div class="at-sheet-actions">${isEdit ? '<button class="btn at-del" id="x-del">Supprimer</button>' : '<button class="btn at-ghost" data-close>Annuler</button>'}<button class="btn btn-primary" id="x-save">Enregistrer</button></div>`);
                    const drawPhoto = () => {
                        const box = s.q('#x-photos'); box.innerHTML = '';
                        if (newPhoto || (photoId && !removed)) {
                            const d = document.createElement('div'); d.className = 'at-photo';
                            if (newPhoto) d.style.backgroundImage = `url("${newPhoto}")`; else { d.dataset.pid = photoId; }
                            const x = document.createElement('button'); x.innerHTML = VI.x; x.addEventListener('click', (e) => { e.stopPropagation(); newPhoto = null; removed = true; drawPhoto(); });
                            d.appendChild(x); d.addEventListener('click', () => { if (!newPhoto && photoId) this.viewPhoto(photoId); }); box.appendChild(d);
                            if (d.dataset.pid) this.Photos.get(d.dataset.pid).then(src => { if (src) d.style.backgroundImage = `url("${src}")`; });
                        }
                    };
                    drawPhoto();
                    s.q('#x-pick').addEventListener('click', () => s.q('#x-file').click());
                    s.q('#x-file').addEventListener('change', async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; const b = await this.compress(f); if (b) { newPhoto = b; removed = false; drawPhoto(); } });
                    s.q('#x-save').addEventListener('click', async () => {
                        const type = s.q('#x-type').value, t = this.DOC_TYPES.find(x => x.id === type);
                        const d = { type, label: s.q('#x-label').value.trim() || t.label, number: s.q('#x-num').value.trim(), expires: s.q('#x-exp').value ? this.dateFromStr(s.q('#x-exp').value) : null };
                        let pid = removed ? null : photoId;
                        if (newPhoto) { pid = await this.Photos.put(newPhoto); }
                        if ((removed || newPhoto) && photoId) this.Photos.del(photoId);
                        d.photoId = pid;
                        if (isEdit) { Object.assign(doc, d); delete this.state.extra.notified[doc.id + ':exp']; delete this.state.extra.notified[doc.id + ':soon']; }
                        else this.state.extra.docs.push(Object.assign({ id: this.uid(), motoId: moto.id }, d));
                        if (!this.saveExtra()) return; this.renderAll(); s.close();
                    });
                    const del = s.q('#x-del');
                    if (del) del.addEventListener('click', () => { if (doc.photoId) this.Photos.del(doc.photoId); this.state.extra.docs = this.state.extra.docs.filter(x => x.id !== doc.id); this.saveExtra(); this.renderAll(); s.close(); });
                },
                // ---------- Données : export / import / impression ----------
                renderData() {
                    const box = this.$('carnet-data'), moto = this.activeMoto();
                    box.innerHTML = `
                        <div class="at-card">
                            <h4>Sauvegarde</h4>
                            <p>Exporte tout l'Atelier (interventions, prévisions, fiche, documents, photos) dans un fichier, et restaure-le en cas de besoin. Le stockage n'a pas de limite de taille.</p>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <button class="btn btn-primary" id="dt-export" style="padding:14px; font-size:0.85rem;">Exporter une sauvegarde (.json)</button>
                                <button class="btn at-ghost" id="dt-import" style="padding:14px; font-size:0.85rem;">Restaurer une sauvegarde</button>
                                <input type="file" id="dt-file" accept=".json,application/json" style="display:none;">
                            </div>
                        </div>
                        <div class="at-card">
                            <h4>Carnet d'entretien</h4>
                            <p>${moto ? `Pour ${this.esc(this.motoName(moto))} — utile pour la revente ou le garage.` : 'Sélectionne une moto.'}</p>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <button class="btn at-ghost" id="dt-print" style="padding:14px; font-size:0.85rem;" ${moto ? '' : 'disabled'}>Imprimer / enregistrer en PDF</button>
                                <button class="btn at-ghost" id="dt-csv" style="padding:14px; font-size:0.85rem;" ${moto ? '' : 'disabled'}>Exporter l'historique (CSV / Excel)</button>
                            </div>
                        </div>`;
                    this.$('dt-export').addEventListener('click', () => this.exportJSON());
                    this.$('dt-import').addEventListener('click', () => this.$('dt-file').click());
                    this.$('dt-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) this.importFile(f); });
                    this.$('dt-print').addEventListener('click', () => this.printCarnet());
                    this.$('dt-csv').addEventListener('click', () => this.exportCSV());
                },
                download(text, filename, mime) {
                    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
                    const url = URL.createObjectURL(blob), a = document.createElement('a');
                    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
                    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
                },
                async exportJSON() {
                    this.toast('Préparation de la sauvegarde…');
                    const ex = this.state.extra, ids = new Set();
                    this.state.logs.forEach(l => (l.photos || []).forEach(p => ids.add(p)));
                    ex.docs.forEach(d => d.photoId && ids.add(d.photoId));
                    const photos = {}; for (const id of ids) { const src = await this.Photos.get(id); if (src) photos[id] = src; }
                    const payload = {
                        app: 'ridenct-atelier', version: 2, exportedAt: new Date().toISOString(),
                        motos: this.motos().map(m => ({ id: m.id, marque: m.marque, modele: m.modele, annee: m.annee, kmTotal: m.kmTotal, hrTotal: m.hrTotal })),
                        logs: this.state.logs, tasks: this.state.tasks,
                        extra: { specs: ex.specs, docs: ex.docs, meterHist: ex.meterHist, rides: ex.rides },
                        photos
                    };
                    this.download(JSON.stringify(payload), `ridenct-atelier-${this.todayStr()}.json`, 'application/json');
                    this.toast('Sauvegarde exportée');
                },
                async importFile(file) {
                    let data;
                    try { data = JSON.parse(await file.text()); } catch (e) { return AppDialog.alert("Ce fichier n'est pas une sauvegarde valide."); }
                    if (!data || (data.app !== 'ridenct-atelier' && data.app !== 'vroom-atelier') || !Array.isArray(data.logs)) return AppDialog.alert("Ce fichier n'est pas une sauvegarde de l'Atelier.");
                    this.ensureMotoIds();
                    const motos = this.motos(), map = {};
                    const key = (m) => `${m.marque}|${m.modele}|${m.annee}`.toLowerCase();
                    (data.motos || []).forEach(sm => { const t = motos.find(m => m.id === sm.id) || motos.find(m => key(m) === key(sm)); if (t) map[sm.id] = t; });
                    const mine = (x) => map[x.motoId];
                    const logs = data.logs.filter(mine), tasks = (data.tasks || []).filter(mine);
                    const ex = data.extra || {};
                    const skipped = (data.logs.length - logs.length) + ((data.tasks || []).length - tasks.length);
                    const s = this.openSheet(`
                        ${this.sheetHead('Restaurer une sauvegarde', `Du ${this.esc(String(data.exportedAt || '').slice(0, 10))}`)}
                        <div class="at-sheet-body">
                            <div class="at-tiles"><div class="at-tile"><b>${logs.length}</b><span>Interventions</span></div><div class="at-tile"><b>${tasks.length}</b><span>Entretiens</span></div><div class="at-tile"><b>${Object.keys(data.photos || {}).length}</b><span>Photos</span></div></div>
                            <div style="font-size:0.82rem; color:var(--text-muted); font-weight:700; line-height:1.5;">Les éléments sont <b style="color:var(--text-main)">fusionnés</b> avec l'existant (rien n'est supprimé).${skipped ? ` <span style="color:var(--at-warn)">${skipped} élément(s) ignoré(s) : la moto correspondante n'est pas dans ton garage.</span>` : ''}</div>
                        </div>
                        <div class="at-sheet-actions"><button class="btn at-ghost" data-close>Annuler</button><button class="btn btn-primary" id="i-ok" ${logs.length + tasks.length ? '' : 'disabled'}>Restaurer</button></div>`);
                    s.q('#i-ok').addEventListener('click', async () => {
                        const merge = (arr, incoming, remap) => { incoming.forEach(it => { const c = Object.assign({}, it); remap(c); const i = arr.findIndex(x => x.id === c.id); if (i >= 0) arr[i] = c; else arr.push(c); }); };
                        const remap = (c) => { c.motoId = map[c.motoId].id; };
                        merge(this.state.logs, logs, remap); merge(this.state.tasks, tasks, remap);
                        ['specs', 'docs', 'meterHist', 'rides'].forEach(k => { merge(this.state.extra[k], (ex[k] || []).filter(mine), remap); });
                        const db = await this.Photos.open();
                        for (const [id, src] of Object.entries(data.photos || {})) {
                            if (db) { try { await new Promise((ok, ko) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(src, id); tx.oncomplete = ok; tx.onerror = () => ko(); }); } catch (e) {} }
                        }
                        (data.motos || []).forEach(sm => { const t = map[sm.id]; if (!t) return; if (sm.kmTotal != null && +sm.kmTotal > this.kmOf(t)) { t.kmTotal = +sm.kmTotal; t.km = String(Math.round(+sm.kmTotal)); } if (sm.hrTotal != null && +sm.hrTotal > this.hrOf(t)) t.hrTotal = +sm.hrTotal; });
                        this.state.logs.forEach(l => { if (!l.category) l.category = 'entretien'; if (!Array.isArray(l.photos)) l.photos = []; });
                        this.state.tasks.forEach(t => { if (!t.unit) t.unit = t.type || 'km'; });
                        this.save('all'); this.persistProfile(); this.renderAll(); s.close(); this.toast('Sauvegarde restaurée');
                    });
                },
                exportCSV() {
                    const moto = this.activeMoto(); if (!moto) return;
                    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
                    const rows = this.state.logs.filter(l => l.motoId === moto.id).sort((a, b) => a.date - b.date);
                    const lines = [['Date', 'Catégorie', 'Intervention', 'Km', 'Heures', 'Coût (€)', 'Fait par', 'Notes'].map(q).join(';')];
                    rows.forEach(l => lines.push([this.dayFmt(l.date), this.catOf(l.category).label, l.title, l.km != null ? String(l.km).replace('.', ',') : '', l.hr != null ? String(l.hr).replace('.', ',') : '', l.cost != null ? String(l.cost).replace('.', ',') : '', l.shop || '', (l.notes || '').replace(/\n/g, ' ')].map(q).join(';')));
                    this.download('﻿' + lines.join('\r\n'), `historique-${(this.motoName(moto) || 'moto').replace(/\W+/g, '-').toLowerCase()}-${this.todayStr()}.csv`, 'text/csv');
                    this.toast('Historique exporté');
                },
                printCarnet() {
                    const moto = this.activeMoto(); if (!moto) return;
                    const e = (v) => this.esc(v), logs = this.state.logs.filter(l => l.motoId === moto.id).sort((a, b) => b.date - a.date);
                    const tasks = this.state.tasks.filter(t => t.motoId === moto.id), specs = this.state.extra.specs.filter(s => s.motoId === moto.id), docs = this.state.extra.docs.filter(d => d.motoId === moto.id);
                    const total = logs.reduce((s, l) => s + this.num(l.cost), 0);
                    const taskRows = tasks.map(t => { const st = this.taskStatus(t, moto); return `<tr><td>${e(t.title)}</td><td>${this.fmt(t.interval, 1)} ${this.unitLabel(t.unit)}</td><td>${t.unit === 'mo' ? this.dayFmt(t.last) : this.fmt(t.last, 1) + ' ' + this.unitLabel(t.unit)}</td><td>${e(this.remainingText(t, st).replace(' ⚠️', ''))}</td></tr>`; }).join('');
                    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Carnet d'entretien — ${e(this.motoName(moto))}</title><style>
                        body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;margin:28px;font-size:13px} h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:26px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
                        .sub{color:#555;margin-bottom:6px} table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top} th{background:#f2f2f2;font-size:11px;text-transform:uppercase}
                        .r{text-align:right;white-space:nowrap} .foot{margin-top:24px;color:#777;font-size:11px}</style></head><body>
                        <h1>Carnet d'entretien — ${e(this.motoName(moto))}</h1>
                        <div class="sub">${[moto.annee, moto.type, moto.cylindree ? moto.cylindree + ' cm³' : '', moto.moteur].filter(Boolean).map(e).join(' · ')}</div>
                        <div class="sub">Compteurs : <b>${this.fmt(this.kmOf(moto), 1)} km</b> · <b>${this.fmt(this.hrOf(moto), 1)} h</b> — édité le ${this.dayFmt(Date.now())}</div>
                        ${specs.length ? `<h2>Fiche technique</h2><table>${specs.map(s => `<tr><td style="width:38%"><b>${e(s.label)}</b></td><td>${e(s.value)}</td></tr>`).join('')}</table>` : ''}
                        ${tasks.length ? `<h2>Plan d'entretien</h2><table><tr><th>Entretien</th><th>Intervalle</th><th>Dernier</th><th>État</th></tr>${taskRows}</table>` : ''}
                        <h2>Historique des interventions (${logs.length})</h2>
                        ${logs.length ? `<table><tr><th>Date</th><th>Intervention</th><th>Catégorie</th><th class="r">Km</th><th class="r">Coût</th><th>Notes</th></tr>${logs.map(l => `<tr><td>${this.dayFmt(l.date)}</td><td><b>${e(l.title)}</b>${l.shop ? `<br><span style="color:#666">${e(l.shop)}</span>` : ''}</td><td>${e(this.catOf(l.category).label)}</td><td class="r">${l.km != null ? this.fmt(l.km) : ''}</td><td class="r">${l.cost != null && l.cost !== '' ? this.eur(l.cost) : ''}</td><td>${e(l.notes || '')}</td></tr>`).join('')}<tr><td colspan="4" class="r"><b>Total</b></td><td class="r"><b>${this.eur(total)}</b></td><td></td></tr></table>` : '<p>Aucune intervention enregistrée.</p>'}
                        ${docs.length ? `<h2>Documents</h2><table><tr><th>Document</th><th>Numéro</th><th>Échéance</th></tr>${docs.map(d => `<tr><td>${e(d.label)}</td><td>${e(d.number || '')}</td><td>${d.expires ? this.dayFmt(d.expires) : '—'}</td></tr>`).join('')}</table>` : ''}
                        <div class="foot">Généré par RideNCT — Atelier</div></body></html>`;
                    const w = window.open('', '_blank');
                    if (!w) { this.download(html, `carnet-${this.todayStr()}.html`, 'text/html'); this.toast('Fichier téléchargé : ouvre-le puis imprime / PDF'); return; }
                    w.document.open(); w.document.write(html); w.document.close();
                    setTimeout(() => { try { w.focus(); w.print(); } catch (er) {} }, 500);
                },
});
