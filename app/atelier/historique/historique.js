// Historique des interventions
// Étend ModuleMaintenance (défini dans atelier/atelier.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleMaintenance, {
                // =====================================================
                // HISTORIQUE
                // =====================================================
                renderLogs() {
                    const container = this.$('atelier-logs-list'), tiles = this.$('atelier-log-stats'), chips = this.$('atelier-log-filters');
                    const moto = this.activeMoto();
                    if (!moto) { container.innerHTML = `<div class="at-empty">Sélectionnez une moto.</div>`; tiles.innerHTML = ''; chips.innerHTML = ''; return; }

                    const all = this.state.logs.filter(l => l.motoId === moto.id).sort((a, b) => b.date - a.date);
                    const total = all.reduce((s, l) => s + this.num(l.cost), 0);
                    tiles.innerHTML = all.length ? `
                        <div class="at-tile"><b>${all.length}</b><span>Interventions</span></div>
                        <div class="at-tile"><b>${total ? this.eur(total) : '--'}</b><span>Dépensé</span></div>
                        <div class="at-tile"><b>${new Date(all[0].date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}</b><span>Dernière</span></div>` : '';

                    // Filtres de catégories
                    chips.innerHTML = '';
                    if (all.length) {
                        const counts = {}; all.forEach(l => counts[l.category || 'entretien'] = (counts[l.category || 'entretien'] || 0) + 1);
                        const mk = (id, label, n, color) => {
                            const b = document.createElement('button'); b.className = 'at-chip' + (this.state.catFilter === id ? ' active' : '');
                            b.innerHTML = `${color ? `<span class="cdot" style="background:${color}"></span>` : ''}${label} · ${n}`;
                            b.addEventListener('click', () => { this.state.catFilter = id; this.renderLogs(); });
                            chips.appendChild(b);
                        };
                        if (Object.keys(counts).length > 1) { mk('all', 'Tout', all.length); this.CATS.forEach(c => { if (counts[c.id]) mk(c.id, c.label, counts[c.id], c.color); }); }
                        else this.state.catFilter = 'all';
                    }

                    const q = this.state.search.trim().toLowerCase();
                    const logs = all.filter(l => (this.state.catFilter === 'all' || (l.category || 'entretien') === this.state.catFilter) && (!q || (l.title + ' ' + (l.notes || '') + ' ' + (l.shop || '')).toLowerCase().includes(q)));

                    if (!all.length) { container.innerHTML = `<div class="at-empty">Aucun entretien enregistré pour cette moto.<br>Utilise « + Ajouter » ou valide un entretien dans Prévisions.</div>`; return; }
                    if (!logs.length) { container.innerHTML = `<div class="at-empty">Aucun résultat.</div>`; return; }

                    container.innerHTML = '';
                    logs.forEach(log => {
                        const cat = this.catOf(log.category);
                        const notes = log.notes ? (log.notes.length > 60 ? log.notes.slice(0, 60) + '…' : log.notes) : '';
                        const card = document.createElement('div');
                        card.className = 'log-card'; card.style.setProperty('--cat', cat.color);
                        card.innerHTML = `
                            <div class="log-header">
                                <div class="log-title">${this.esc(log.title)}${(log.photos && log.photos.length) ? `<span class="at-badge">${VI.clip} ${log.photos.length}</span>` : ''}</div>
                                <div class="log-date">${this.dayFmt(log.date)}</div>
                            </div>
                            <div class="log-metrics">
                                <span>${VI.pin} ${log.km != null ? this.fmt(log.km) + ' km' : '--'}</span>
                                <span>${VI.clock} ${log.hr != null ? this.fmt(log.hr, 1) + ' h' : '--'}</span>
                                ${log.cost != null && log.cost !== '' ? `<span>${VI.euro} ${this.eur(log.cost)}</span>` : ''}
                            </div>
                            ${log.shop ? `<div class="log-notes" style="font-style:normal;">${VI.user} ${this.esc(log.shop)}</div>` : ''}
                            ${notes ? `<div class="log-notes">${this.esc(notes)}</div>` : ''}`;
                        const down = () => card.style.transform = 'scale(0.97)', up = () => card.style.transform = 'scale(1)';
                        card.addEventListener('touchstart', down, { passive: true }); card.addEventListener('touchend', up); card.addEventListener('touchcancel', up);
                        card.addEventListener('mousedown', down); card.addEventListener('mouseup', up); card.addEventListener('mouseleave', up);
                        card.addEventListener('click', () => this.showLogDetails(log));
                        container.appendChild(card);
                    });
                },
                showLogDetails(log) {
                    const cat = this.catOf(log.category), hasCost = log.cost != null && log.cost !== '';
                    const photos = log.photos || [];
                    const tile = (v, l) => `<div style="background:var(--at-tint); padding:12px; border-radius:14px; flex:1; text-align:center; min-width:0;"><div style="font-size:1.05rem; font-weight:900; color:var(--text-main);">${v}</div><div style="font-size:0.66rem; color:var(--text-muted); text-transform:uppercase; font-weight:800;">${l}</div></div>`;
                    const s = this.openSheet(`
                        ${this.sheetHead(this.esc(log.title), `${cat.icon} ${cat.label} · ${this.dayFmt(log.date)}${log.shop ? ' · ' + this.esc(log.shop) : ''}`)}
                        <div class="at-sheet-body">
                            <div style="display:flex; gap:10px; margin-bottom:16px;">
                                ${tile(log.km != null ? this.fmt(log.km) : '--', 'Km')}${tile(log.hr != null ? this.fmt(log.hr, 1) : '--', 'Heures')}${hasCost ? tile(this.eur(log.cost), 'Coût') : ''}
                            </div>
                            ${log.notes ? `<div class="at-label">Notes & Pièces</div><div style="background:var(--at-tint); padding:14px; border-radius:14px; font-size:0.9rem; line-height:1.5; color:var(--text-main); white-space:pre-wrap; margin-bottom:14px; user-select:text;">${this.esc(log.notes)}</div>` : ''}
                            ${photos.length ? `<div class="at-label">Photos / Factures</div><div class="at-photos">${photos.map(id => `<div class="at-photo" data-pid="${this.esc(id)}" data-view="${this.esc(id)}"></div>`).join('')}</div>` : ''}
                        </div>
                        <div class="at-sheet-actions"><button class="btn at-del" id="d-del">Supprimer</button><button class="btn btn-primary" id="d-edit">Modifier</button></div>`);
                    this.hydratePhotos(s.overlay);
                    s.qa('[data-view]').forEach(el => el.addEventListener('click', () => this.viewPhoto(el.dataset.view)));
                    s.q('#d-edit').addEventListener('click', () => { s.close(); this.startEdit(log); });
                    s.q('#d-del').addEventListener('click', () => {
                        s.close();
                        this.confirmSheet('Supprimer cette intervention ?', 'Elle sera retirée de l\'historique (photos incluses).', 'Supprimer', () => {
                            (log.photos || []).forEach(p => this.Photos.del(p));
                            this.state.logs = this.state.logs.filter(l => l.id !== log.id);
                            this.save('logs'); this.renderAll();
                        }, true);
                    });
                },
});
