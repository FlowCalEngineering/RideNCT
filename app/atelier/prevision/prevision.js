// Prévisions : tâches d'entretien, alertes, échéances
// Étend ModuleMaintenance (défini dans atelier/atelier.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleMaintenance, {
                maybeNotify() {
                    if (!this._loaded) return;
                    try {
                        const now = Date.now(), nt = this.state.extra.notified; const lines = [];
                        this.motos().forEach(m => {
                            const a = this.alertsFor(m);
                            a.over.forEach(x => { const k = x.task.id + ':over'; if (!nt[k] || now - nt[k] > 86400000) { nt[k] = now; lines.push(`${this.motoName(m)} : ${x.task.title} dépassé`); } });
                            a.docsExpired.forEach(d => { const k = d.id + ':exp'; if (!nt[k] || now - nt[k] > 86400000) { nt[k] = now; lines.push(`${d.label || 'Document'} expiré`); } });
                            a.docsSoon.forEach(d => { const k = d.id + ':soon'; if (!nt[k] || now - nt[k] > 3 * 86400000) { nt[k] = now; lines.push(`${d.label || 'Document'} expire bientôt`); } });
                        });
                        if (lines.length) { this.saveExtra(); this.notify('Atelier', lines.slice(0, 2).join(' • ') + (lines.length > 2 ? ` (+${lines.length - 2})` : '')); }
                    } catch (e) {}
                },
                // ---------- Alertes ----------
                daysLeft(ts) { return Math.ceil((ts - Date.now()) / 86400000); },
                alertsFor(moto) {
                    const out = { over: [], soon: [], docsExpired: [], docsSoon: [] };
                    if (!moto) return out;
                    this.state.tasks.filter(t => t.motoId === moto.id).forEach(t => {
                        const st = this.taskStatus(t, moto);
                        if (st.level === 'over') out.over.push({ task: t, st }); else if (st.level === 'soon') out.soon.push({ task: t, st });
                    });
                    this.state.extra.docs.filter(d => d.motoId === moto.id && d.expires).forEach(d => {
                        const dl = this.daysLeft(d.expires);
                        if (dl < 0) out.docsExpired.push(d); else if (dl <= 30) out.docsSoon.push(d);
                    });
                    return out;
                },
                renderAlerts() {
                    const box = this.$('atelier-alerts'); const moto = this.activeMoto();
                    if (!moto) { box.style.display = 'none'; return; }
                    const a = this.alertsFor(moto); const items = [];
                    const plural = (n, s, p) => `${n} ${n > 1 ? p : s}`;
                    if (a.over.length) items.push({ cls: 'red', icon: VI.alert, text: `${plural(a.over.length, 'entretien dépassé', 'entretiens dépassés')}`, tab: 'sub-atelier-tableau' });
                    if (a.docsExpired.length) items.push({ cls: 'red', icon: VI.file, text: `${plural(a.docsExpired.length, 'document expiré', 'documents expirés')}`, tab: 'sub-atelier-carnet', pane: 'docs' });
                    if (a.soon.length) items.push({ cls: 'orange', icon: VI.clock, text: `${plural(a.soon.length, 'entretien bientôt dû', 'entretiens bientôt dus')}`, tab: 'sub-atelier-tableau' });
                    if (a.docsSoon.length) items.push({ cls: 'orange', icon: VI.calendar, text: `${plural(a.docsSoon.length, 'document expire', 'documents expirent')} < 30 j`, tab: 'sub-atelier-carnet', pane: 'docs' });
                    box.innerHTML = '';
                    if (!items.length) { box.style.display = 'none'; return; }
                    box.style.display = 'flex';
                    items.forEach(it => {
                        const d = document.createElement('div'); d.className = 'at-alert ' + it.cls;
                        d.innerHTML = `<span>${it.icon}</span><span>${it.text}</span><span class="go">›</span>`;
                        d.addEventListener('click', () => { if (it.pane) this.setCarnetPane(it.pane); this.showTab(it.tab); });
                        box.appendChild(d);
                    });
                },
                renderSuggestions() {
                    const m = this.activeMoto();
                    const titles = new Set();
                    this.state.tasks.filter(t => m && t.motoId === m.id).forEach(t => titles.add(t.title));
                    this.state.logs.filter(l => m && l.motoId === m.id).forEach(l => titles.add(l.title));
                    this.$('atelier-title-suggestions').innerHTML = [...titles].map(t => `<option value="${this.esc(t)}"></option>`).join('');
                    // Raccourcis : entretiens urgents d'abord, puis les dernières interventions
                    const q = this.$('log-quick'); if (!q) return;
                    const order = [];
                    if (m) {
                        this.state.tasks.filter(t => t.motoId === m.id).map(t => ({ t, st: this.taskStatus(t, m) })).sort((x, y) => y.st.ratio - x.st.ratio).forEach(x => order.push(x.t.title));
                        this.state.logs.filter(l => l.motoId === m.id).sort((x, y) => y.date - x.date).forEach(l => order.push(l.title));
                    }
                    const seen = new Set(), list = order.filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 8);
                    q.innerHTML = '';
                    list.forEach(t => {
                        const b = document.createElement('button'); b.type = 'button'; b.className = 'at-chip sm'; b.textContent = t;
                        b.addEventListener('click', () => { const i = this.$('log-title'); i.value = t; i.dispatchEvent(new Event('input')); });
                        q.appendChild(b);
                    });
                },
                // =====================================================
                // PRÉVISIONS
                // =====================================================
                defaultTasksFor(moto) {
                    const is2T = moto && moto.moteur === '2T';
                    const list = [
                        { title: 'Graissage chaîne', unit: 'km', interval: 500 },
                        { title: 'Tension chaîne', unit: 'km', interval: 1000 },
                        { title: 'Nettoyage filtre à air', unit: 'hr', interval: 15 },
                        { title: 'Contrôle plaquettes de frein', unit: 'km', interval: 5000 },
                        { title: 'Remplacement bougie', unit: 'km', interval: 5000 },
                        { title: 'Liquide de frein', unit: 'mo', interval: 24 },
                        { title: 'Pression des pneus', unit: 'wk', interval: 2 },
                        { title: 'Révision générale', unit: 'mo', interval: 12 }
                    ];
                    if (is2T) list.splice(3, 0, { title: 'Vidange boîte', unit: 'km', interval: 3000 }, { title: 'Piston / Segments', unit: 'hr', interval: 50 });
                    else list.splice(3, 0, { title: 'Vidange moteur', unit: 'km', interval: 6000 });
                    return list;
                },
                ensureDefaultTasks(moto) {
                    if (!moto) return;
                    const flagKey = 'motoapp_maintenance_seeded_' + moto.id;
                    let seeded = false; try { seeded = !!localStorage.getItem(flagKey); } catch (e) {}
                    if (seeded) return;
                    if (!this.state.tasks.some(t => t.motoId === moto.id)) {
                        this.defaultTasksFor(moto).forEach(d => {
                            const last = d.unit === 'km' ? this.kmOf(moto) : d.unit === 'hr' ? this.hrOf(moto) : Date.now();
                            this.state.tasks.push({ id: this.uid(), motoId: moto.id, title: d.title, unit: d.unit, interval: d.interval, last, lastDate: Date.now() });
                        });
                        this.save('tasks');
                    }
                    try { localStorage.setItem(flagKey, '1'); } catch (e) {}
                },
                isDateUnit(u) { return u === 'mo' || u === 'wk'; },
                periodDays(u) { return u === 'wk' ? 7 : 30.4375; },
                // Un entretien peut avoir deux déclencheurs (km ou heures, ET une durée en mois) : le plus avancé l'emporte
                taskStatus(task, moto) {
                    const one = (unit, interval, used) => { const iv = Math.max(0.0001, this.num(interval)), ratio = used / iv; return { unit, used, remaining: iv - used, interval: iv, pct: Math.min(100, ratio * 100), ratio, level: ratio >= 1 ? 'over' : (ratio >= 0.8 ? 'soon' : 'ok') }; };
                    let st;
                    if (this.isDateUnit(task.unit)) st = one(task.unit, task.interval, Math.max(0, (Date.now() - this.num(task.last)) / (this.periodDays(task.unit) * 86400000)));
                    else {
                        const used = Math.max(0, (task.unit === 'km' ? this.kmOf(moto) : this.hrOf(moto)) - this.num(task.last));
                        const w = this.wearOf(task, moto, used);   // usure réelle : km × coefficients de roulage
                        st = one(task.unit, task.interval, used + (w ? w.extra : 0));
                        if (w) { st.wear = w; w.base = Math.min(100, used / Math.max(0.0001, this.num(task.interval)) * 100); }
                    }
                    if (!this.isDateUnit(task.unit) && this.num(task.months) > 0 && this.num(task.lastDate) > 0) {
                        const d = one('mo', task.months, Math.max(0, (Date.now() - this.num(task.lastDate)) / (30.4375 * 86400000)));
                        if (d.ratio > st.ratio) st = d;
                    }
                    return st;
                },
                unitLabel(u) { return u === 'km' ? 'km' : u === 'hr' ? 'h' : u === 'wk' ? 'sem.' : 'mois'; },
                // Date estimée d'échéance selon le rythme de roulage
                etaOf(task, moto, st) {
                    if (st.remaining <= 0) return null;
                    let days;
                    const su = st.unit || task.unit;
                    if (this.isDateUnit(su)) days = st.remaining * this.periodDays(su);
                    else { let p = this.pace(moto, su === 'km' ? 'km' : 'hr'); if (!p) return null; if (st.wear) p *= st.wear.coef; days = st.remaining / p; }
                    if (!isFinite(days) || days > 365 * 4) return null;
                    return Date.now() + days * 86400000;
                },
                remainingText(task, st) {
                    const u = st.unit || task.unit, abs = Math.abs(st.remaining); let txt;
                    if (u === 'wk') txt = abs < 1 ? `${Math.max(1, Math.round(abs * 7))} j` : `${this.fmt(abs, 1)} sem.`;
                    else if (u === 'mo') txt = abs < 1 ? `${Math.max(1, Math.round(abs * 30.4375))} j` : `${this.fmt(abs, 1)} mois`;
                    else txt = `${this.fmt(abs, u === 'hr' ? 1 : 0)} ${this.unitLabel(u)}`;
                    return st.remaining >= 0 ? `Reste ${txt}` : `Dépassé de ${txt}`;
                },
                // Pastille d'alerte sur l'icône d'un onglet (l'icône est conservée)
                setTabDot(tab, html) { if (!tab) return; tab.querySelectorAll('.at-dot').forEach(d => d.remove()); if (html) tab.insertAdjacentHTML('beforeend', html); },
                renderForecasts() {
                    const container = this.$('atelier-forecast-list');
                    const moto = this.activeMoto();
                    const tab = this.$('atelier-tab-forecast');
                    const paceBox = this.$('atelier-pace');
                    if (!moto) { container.innerHTML = `<div class="at-empty">Sélectionnez une moto.</div>`; this.setTabDot(tab, ''); paceBox.textContent = ''; return; }

                    this.ensureDefaultTasks(moto);
                    const rows = this.state.tasks.filter(t => t.motoId === moto.id)
                        .map(t => ({ t, st: this.taskStatus(t, moto) }))
                        .sort((a, b) => b.st.ratio - a.st.ratio);

                    const al = this.alertsFor(moto);
                    this.setTabDot(tab, al.over.length ? `<span class="at-dot">${al.over.length}</span>` : (al.soon.length ? `<span class="at-dot warn">${al.soon.length}</span>` : ''));

                    const pk = this.pace(moto, 'km'), ph = this.pace(moto, 'hr');
                    const parts = [];
                    if (pk) parts.push(`${this.fmt(pk * 7, 0)} km / semaine`);
                    if (ph) parts.push(`${this.fmt(ph * 7, 1)} h / semaine`);
                    paceBox.textContent = parts.length ? `Rythme de roulage estimé : ${parts.join(' · ')}` : "Roule avec le GPS : l'app estimera la date de chaque entretien.";

                    this.renderRiding(moto); this.renderWatch(moto);
                    container.innerHTML = '';
                    if (!rows.length) { container.innerHTML = `<div class="at-empty">Aucun entretien récurrent.<br>Ajoutez-en un ci-dessous.</div>`; return; }

                    const urgent = rows.filter(r => r.st.level !== 'ok'), calm = rows.filter(r => r.st.level === 'ok');
                    if (!urgent.length && calm.length) container.insertAdjacentHTML('beforeend', `<div class="at-allok">✓ Tout est à jour</div>`);
                    urgent.forEach(({ t: task, st }) => {
                        const color = st.level === 'over' ? 'var(--danger-color)' : st.level === 'soon' ? 'var(--at-warn)' : 'var(--at-ok)';
                        const textColor = st.level === 'ok' ? 'var(--text-main)' : color;
                        const lastTxt = this.isDateUnit(task.unit) ? this.dayFmt(task.last) : `${this.fmt(task.last, task.unit === 'hr' ? 1 : 0)} ${this.unitLabel(task.unit)}`;
                        const eta = this.etaOf(task, moto, st);
                        const etaTxt = eta ? `≈ ${new Date(eta).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
                        const card = document.createElement('div');
                        card.className = 'forecast-card';
                        card.innerHTML = `
                            <div class="forecast-header">
                                <div>
                                    <div class="forecast-title">${this.esc(task.title)}</div>
                                    <div class="forecast-interval">Tous les ${this.fmt(task.interval, task.unit === 'km' ? 0 : 1)} ${this.unitLabel(task.unit)}${this.num(task.months) > 0 && !this.isDateUnit(task.unit) ? ` ou ${this.fmt(task.months, 1)} mois` : ''} · Dernier : ${lastTxt}</div>
                                </div>
                                <div class="forecast-edit">Modifier</div>
                            </div>
                            <div class="progress-bg"><div class="progress-fill" style="width:${st.pct}%; background-color:${color};"></div>${st.wear ? `<u class="wear-mark" style="left:${st.wear.base}%"></u>` : ''}</div>
                            <div class="forecast-footer">
                                <div><div class="forecast-remaining" style="color:${textColor};">${this.remainingText(task, st)}</div>${st.wear ? `<span class="wear-pill">× ${this.fmt(st.wear.coef, 1)} ${st.wear.why}</span>` : ''}${etaTxt ? `<div class="forecast-eta">${etaTxt}</div>` : ''}</div>
                                <button class="btn-done"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;"><polyline points="20 6 9 17 4 12"></polyline></svg>Fait</button>
                            </div>`;
                        card.querySelector('.forecast-header').addEventListener('click', () => this.openTaskSheet(task));
                        card.querySelector('.btn-done').addEventListener('click', () => this.openDoneSheet(task));
                        container.appendChild(card);
                    });
                    if (calm.length) {
                        const open = !!this._fcOpen;
                        const tog = document.createElement('button'); tog.type = 'button'; tog.className = 'at-more-toggle' + (open ? ' open' : '');
                        tog.innerHTML = `<span>${urgent.length ? 'Autres entretiens' : 'Tous les entretiens'}</span><small>${calm.length} à jour</small><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
                        const box = document.createElement('div'); box.className = 'at-more' + (open ? ' open' : '');
                        calm.forEach(({ t: task, st }) => {
                            const r = document.createElement('div'); r.className = 'fc-row';
                            r.innerHTML = `<div class="fc-t"><b>${this.esc(task.title)}</b><span>${this.remainingText(task, st)}${st.wear ? ` · × ${this.fmt(st.wear.coef, 1)} ${st.wear.why}` : ''}</span></div><button class="btn-done sm" aria-label="Fait"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;"><polyline points="20 6 9 17 4 12"></polyline></svg></button>`;
                            r.querySelector('.fc-t').addEventListener('click', () => this.openTaskSheet(task));
                            r.querySelector('.btn-done').addEventListener('click', () => this.openDoneSheet(task));
                            box.appendChild(r);
                        });
                        tog.addEventListener('click', () => { this._fcOpen = !this._fcOpen; tog.classList.toggle('open', this._fcOpen); box.classList.toggle('open', this._fcOpen); });
                        container.appendChild(tog); container.appendChild(box);
                    }
                },
                taskHistory(task, moto) {
                    const t = task.title.trim().toLowerCase();
                    return this.state.logs.filter(l => l.motoId === moto.id && (l.taskId === task.id || l.title.trim().toLowerCase() === t)).sort((a, b) => b.date - a.date);
                },
                openTaskSheet(task) {
                    const moto = this.activeMoto();
                    if (!moto) return AppDialog.alert("Sélectionnez une moto d'abord.");
                    const isEdit = !!task, unit = task ? task.unit : 'km';
                    const existing = new Set(this.state.tasks.filter(t => t.motoId === moto.id).map(t => t.title.toLowerCase()));
                    const presets = isEdit ? '' : `<div class="input-group"><label>Modèles</label><div class="at-chips" style="flex-wrap:wrap; margin-bottom:0;">${this.TASK_PRESETS.filter(p => !existing.has(p.title.toLowerCase())).map((p, i) => `<button class="at-chip sm" data-preset="${this.TASK_PRESETS.indexOf(p)}">${this.esc(p.title)}</button>`).join('')}</div></div>`;
                    const hist = isEdit ? this.taskHistory(task, moto).slice(0, 5) : [];
                    const histHtml = hist.length ? `<div class="input-group"><label>Dernières fois</label>${hist.map(l => `<div class="at-part-use"><span>${this.dayFmt(l.date)}</span><span style="color:var(--text-muted);">${l.km != null ? this.fmt(l.km) + ' km' : ''}${l.cost != null && l.cost !== '' ? ' · ' + this.eur(l.cost) : ''}</span></div>`).join('')}</div>` : '';
                    const s = this.openSheet(`
                        ${this.sheetHead(isEdit ? "Modifier l'entretien" : 'Nouvel entretien', this.esc(this.motoName(moto)))}
                        <div class="at-sheet-body">
                            ${presets}
                            <div class="input-group"><label>Nom</label><input type="text" id="t-title" class="atelier-input" placeholder="Ex: Liquide de refroidissement" value="${isEdit ? this.esc(task.title) : ''}"></div>
                            <div style="display:flex; gap:12px;">
                                <div class="input-group" style="flex:1; min-width:0;"><label>Tous les</label><input type="number" inputmode="decimal" id="t-interval" class="atelier-input" min="0.1" step="any" value="${isEdit ? task.interval : ''}"></div>
                                <div class="input-group" style="flex:1; min-width:0;"><label>Unité</label>
                                    <select id="t-unit" class="atelier-input"><option value="km" ${unit === 'km' ? 'selected' : ''}>km</option><option value="hr" ${unit === 'hr' ? 'selected' : ''}>heures</option><option value="wk" ${unit === 'wk' ? 'selected' : ''}>semaines</option><option value="mo" ${unit === 'mo' ? 'selected' : ''}>mois</option></select>
                                </div>
                            </div>
                            <div class="input-group" id="t-months-box"><label>Ou au plus tard tous les (mois)</label><input type="number" inputmode="decimal" id="t-months" class="atelier-input" min="0" step="any" placeholder="facultatif, ex : 12" value="${isEdit && task.months ? task.months : ''}"></div>
                            <div class="input-group"><label id="t-last-label">Dernier fait à</label><input type="number" inputmode="decimal" id="t-last" class="atelier-input" step="any"><input type="date" id="t-last-date" class="atelier-input" style="display:none;"></div>
                            ${histHtml}
                        </div>
                        <div class="at-sheet-actions">
                            ${isEdit ? '<button class="btn at-del" id="t-del">Supprimer</button>' : '<button class="btn at-ghost" data-close>Annuler</button>'}
                            <button class="btn btn-primary" id="t-save">Enregistrer</button>
                        </div>`);

                    const unitSel = s.q('#t-unit'), lastNum = s.q('#t-last'), lastDate = s.q('#t-last-date'), lastLbl = s.q('#t-last-label');
                    const applyUnit = (initial) => {
                        const u = unitSel.value;
                        s.q('#t-months-box').style.display = this.isDateUnit(u) ? 'none' : 'block';
                        if (this.isDateUnit(u)) {
                            lastNum.style.display = 'none'; lastDate.style.display = 'block'; lastLbl.textContent = 'Dernière fois le';
                            if (initial && isEdit && this.isDateUnit(task.unit)) lastDate.value = this.strFromDate(task.last); else if (!lastDate.value) lastDate.value = this.todayStr();
                        } else {
                            lastNum.style.display = 'block'; lastDate.style.display = 'none';
                            lastLbl.textContent = u === 'km' ? 'Dernier fait à (km)' : 'Dernier fait à (heures)';
                            if (initial && isEdit && task.unit === u) lastNum.value = task.last; else lastNum.value = u === 'km' ? this.kmOf(moto) : this.hrOf(moto);
                        }
                    };
                    applyUnit(true);
                    unitSel.addEventListener('change', () => applyUnit(false));
                    s.qa('[data-preset]').forEach(b => b.addEventListener('click', () => {
                        const p = this.TASK_PRESETS[+b.dataset.preset];
                        s.q('#t-title').value = p.title; s.q('#t-interval').value = p.interval; unitSel.value = p.unit; applyUnit(false); s.q('#t-months').value = p.months || '';
                    }));

                    s.q('#t-save').addEventListener('click', () => {
                        const title = s.q('#t-title').value.trim(), interval = parseFloat(s.q('#t-interval').value), u = unitSel.value;
                        if (!title) return AppDialog.alert("Donnez un nom à l'entretien.");
                        if (!isFinite(interval) || interval <= 0) return AppDialog.alert("L'intervalle doit être supérieur à 0.");
                        const last = this.isDateUnit(u) ? this.dateFromStr(lastDate.value) : (isFinite(parseFloat(lastNum.value)) ? parseFloat(lastNum.value) : 0);
                        const mo = parseFloat(s.q('#t-months').value), months = (!this.isDateUnit(u) && isFinite(mo) && mo > 0) ? mo : 0;
                        if (isEdit) { Object.assign(task, { title, interval, unit: u, last, months }); if (months && !task.lastDate) task.lastDate = Date.now(); }
                        else this.state.tasks.push({ id: this.uid(), motoId: moto.id, title, unit: u, interval, last, months, lastDate: Date.now() });
                        if (!this.save('tasks')) return;
                        this.renderAll(); s.close();
                    });
                    const del = s.q('#t-del');
                    if (del) del.addEventListener('click', () => {
                        s.close();
                        this.confirmSheet('Supprimer le suivi ?', `« ${this.esc(task.title)} » ne sera plus suivi. L'historique des interventions est conservé.`, 'Supprimer', () => {
                            this.state.tasks = this.state.tasks.filter(t => t.id !== task.id); this.save('tasks'); this.renderAll();
                        }, true);
                    });
                },
                openDoneSheet(task) {
                    const moto = this.activeMoto(); if (!moto) return;
                    const s = this.openSheet(`
                        ${this.sheetHead(this.esc(task.title), `Marquer comme fait (${this.fmt(this.kmOf(moto), 1)} km · ${this.fmt(this.hrOf(moto), 1)} h)`)}
                        <div class="at-sheet-body">
                            <div class="input-group"><label>Date</label><input type="date" id="d-date" class="atelier-input" value="${this.todayStr()}"></div>
                            <div style="display:flex; gap:12px;">
                                <div class="input-group" style="flex:1; min-width:0;"><label>Coût (€)</label><input type="number" inputmode="decimal" id="d-cost" class="atelier-input" step="0.01" min="0" placeholder="0"></div>
                                <div class="input-group" style="flex:1.2; min-width:0;"><label>Fait par</label><input type="text" id="d-shop" class="atelier-input" placeholder="Moi, garage…" maxlength="60"></div>
                            </div>
                            <div class="input-group"><label>Notes</label><textarea id="d-notes" class="atelier-input" rows="2" placeholder="Pièces, remarques..."></textarea></div>
                        </div>
                        <div class="at-sheet-actions"><button class="btn at-ghost" data-close>Annuler</button><button class="btn btn-primary" id="d-ok">Valider</button></div>`);
                    s.q('#d-ok').addEventListener('click', () => {
                        const cost = parseFloat(s.q('#d-cost').value), date = this.dateFromStr(s.q('#d-date').value);
                        const log = { id: this.uid(), motoId: moto.id, date, title: task.title, category: 'entretien', km: this.kmOf(moto) || null, hr: this.hrOf(moto) || null, cost: isFinite(cost) ? cost : null, shop: s.q('#d-shop').value.trim(), notes: s.q('#d-notes').value.trim(), photos: [], taskId: task.id };
                        this.state.logs.push(log);
                        const prev = task.last;
                        this.resetTask(task, moto, date);
                        if (!this.save('logs') || !this.save('tasks')) { this.state.logs.pop(); task.last = prev; return; }
                        this.renderAll(); s.close();
                        this.toast(`${task.title} ajouté à l'historique`);
                    });
                },
                resetTask(task, moto, dateTs, km, hr) {
                    task.lastDate = dateTs || Date.now();
                    if (this.isDateUnit(task.unit)) task.last = dateTs || Date.now();
                    else if (task.unit === 'km') task.last = (km != null && isFinite(km)) ? km : this.kmOf(moto);
                    else task.last = (hr != null && isFinite(hr)) ? hr : this.hrOf(moto);
                },
});
