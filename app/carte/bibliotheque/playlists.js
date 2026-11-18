// Bibliothèque : circuits (groupes de trajets, reconnus par une icône ; un trajet peut être dans plusieurs)
// Étend ModuleGPS : ce fichier doit être chargé APRÈS bibliotheque.js.
(function () {
    const RK = 'moto_saved_routes', PK = 'moto_playlists', MIG = 'moto_playlists_mig';
    const ICONS = ['🏔️', '🌊', '🌲', '🏁', '🌅', '☀️', '🌧️', '🍂', '❄️', '🏖️', '🏰', '🍷', '🍽️', '☕', '⛽', '🛣️', '🧭', '⭐', '❤️', '🔥', '👥', '🏍️', '🚩', '🎯'];
    const _load = ModuleGPS.loadLibrary;
    const _opts = ModuleGPS.showRouteOptions;
    const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pls = () => AppStore.get(PK, []);
    const savePls = (a) => AppStore.set(PK, a);
    const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
    const svg = (d) => `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none">${d}</svg>`;
    const S_ALL = svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>');
    const S_DL = svg('<path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 20h14"/>');
    const S_EDIT = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
    const S_DEL = svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>');
    const freeIcon = (list) => { const used = new Set(list.map(p => p.icon)); return ICONS.find(i => !used.has(i)) || ICONS[list.length % ICONS.length]; };

    Object.assign(ModuleGPS, {
        libFilter: { pl: '', tag: '' },

        // Anciennes versions : le « dossier » d'un trajet devient un circuit
        migrateFolders() {
            if (ls.get(MIG)) return;
            const routes = AppStore.get(RK, []), list = pls(); let changed = false;
            routes.forEach(r => {
                if (!r.folder) return;
                let p = list.find(x => x.name === r.folder);
                if (!p) { p = { id: newId(), name: r.folder, icon: freeIcon(list), ids: [] }; list.push(p); }
                if (!p.ids.includes(r.id)) p.ids.push(r.id);
                delete r.folder; changed = true;
            });
            if (changed) { savePls(list); AppStore.set(RK, routes, true); }
            ls.set(MIG, '1');
        },

        loadLibrary() {
            _load.apply(this, arguments);
            try { this.migrateFolders(); this.decorateLibrary(); } catch (e) { console.warn('circuits', e); }
        },

        // Barre d'icônes + filtre des cartes déjà dessinées (elles sont dans l'ordre de la liste enregistrée)
        decorateLibrary() {
            const container = document.getElementById('library-container'); if (!container) return;
            const routes = AppStore.get(RK, []);
            let bar = document.getElementById('lib-filter');
            if (!routes.length) { if (bar) bar.remove(); return; }
            const list = pls(); let fix = false;
            const alive = new Set(routes.map(r => r.id));
            list.forEach(p => {
                const n = p.ids.filter(i => alive.has(i)); if (n.length !== p.ids.length) { p.ids = n; fix = true; }   // un trajet supprimé quitte les circuits
                if (!p.icon) { p.icon = freeIcon(list.filter(q => q.icon)); fix = true; }                          // circuit créé avec un nom : on lui donne une icône
            });
            if (fix) savePls(list);
            if (!bar) { bar = document.createElement('div'); bar.id = 'lib-filter'; bar.className = 'lib-filter'; container.parentNode.insertBefore(bar, container); }
            const f = this.libFilter;
            if (f.pl && !list.some(p => p.id === f.pl)) f.pl = '';
            const cur = list.find(p => p.id === f.pl);
            const tags = [...new Set(routes.flatMap(r => r.tags || []))].sort();
            if (f.tag && !tags.includes(f.tag)) f.tag = '';
            const ib = (k, v, inner, on, label, cls) => `<button type="button" class="lib-ic${on ? ' on' : ''}${cls ? ' ' + cls : ''}" data-k="${k}"${v ? ` data-v="${esc(v)}"` : ''} title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`;
            bar.innerHTML = `<div class="lib-row lib-icons">${ib('all', '', S_ALL, !f.pl, 'Tous les trajets')}${list.map(p => ib('pl', p.id, `<span class="lib-emo">${p.icon}</span><i class="lib-n">${p.ids.length}</i>`, f.pl === p.id, 'Circuit ' + p.icon)).join('')}${ib('new', '', '＋', false, 'Nouveau circuit', 'lib-new')}${cur ? `<span class="lib-sep"></span>${ib('dl', '', S_DL, false, 'Télécharger les cartes du circuit', 'lib-act')}${ib('ico', '', S_EDIT, false, 'Changer l\'icône', 'lib-act')}${ib('del', '', S_DEL, false, 'Supprimer le circuit', 'lib-act lib-danger')}` : ''}</div>${tags.length ? `<div class="lib-row">${tags.map(t => `<button type="button" class="lib-chip${f.tag === t ? ' on' : ''}" data-k="tag" data-v="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}`;
            bar.querySelectorAll('.lib-chip').forEach(b => b.addEventListener('click', () => { f.tag = f.tag === b.dataset.v ? '' : b.dataset.v; this.decorateLibrary(); }));
            bar.querySelectorAll('.lib-ic').forEach(b => b.addEventListener('click', () => {
                const k = b.dataset.k, v = b.dataset.v;
                if (k === 'all') { f.pl = ''; f.tag = ''; }
                else if (k === 'pl') f.pl = f.pl === v ? '' : v;
                else if (k === 'new') return this.createPlaylist();
                else if (k === 'ico') return this.changeCircuitIcon(f.pl);
                else if (k === 'del') return this.deletePlaylist(f.pl);
                else if (k === 'dl') return this.downloadPlaylist(f.pl);
                this.decorateLibrary();
            }));

            const cards = [...container.children];
            if (cards.length !== routes.length) return;
            routes.forEach((r, i) => {
                const el = cards[i];
                const old = el.querySelector('.lib-meta'); if (old) old.remove();
                const mine = list.filter(p => p.ids.includes(r.id));
                if (mine.length || (r.tags || []).length) { const m = document.createElement('div'); m.className = 'lib-meta'; m.innerHTML = mine.map(p => `<span class="lib-badge">${p.icon}</span>`).join('') + (r.tags || []).map(t => `<span class="lib-badge">#${esc(t)}</span>`).join(''); (el.children[1] || el).appendChild(m); }
                el.style.display = ((!f.pl || (cur && cur.ids.includes(r.id))) && (!f.tag || (r.tags || []).includes(f.tag))) ? '' : 'none';
            });
            let hint = document.getElementById('lib-empty-hint');
            if (cur && !cur.ids.length) {
                if (!hint) { hint = document.createElement('div'); hint.id = 'lib-empty-hint'; hint.className = 'lib-hint'; container.parentNode.insertBefore(hint, container.nextSibling); }
                hint.textContent = 'Circuit vide : appuie longuement sur un trajet puis sur l\'icône « Circuits » pour l\'ajouter.';
            } else if (hint) hint.remove();
        },

        // Choix d'une icône (les icônes déjà prises par un autre circuit sont grisées) → emoji ou null
        pickCircuitIcon(current) {
            return new Promise((resolve) => {
                const used = new Set(pls().map(p => p.icon).filter(i => i && i !== current));
                const ov = document.createElement('div'); ov.className = 'rp-overlay'; ov.style.zIndex = 10050;
                ov.innerHTML = `<div class="rp-sheet om-sheet"><div class="rp-top"><div style="flex:1;font-weight:900;font-size:1.05rem;padding-left:10px;">Choisis une icône</div><button type="button" class="rp-x" aria-label="Fermer">✕</button></div><div class="cir-grid">${ICONS.map(i => `<button type="button" class="cir-pick${i === current ? ' on' : ''}" data-i="${i}" ${used.has(i) ? 'disabled' : ''} aria-label="${i}">${i}</button>`).join('')}</div></div>`;
                document.body.appendChild(ov);
                const done = (v) => { ov.remove(); resolve(v); };
                ov.addEventListener('click', (e) => { if (e.target === ov) done(null); }); ov.querySelector('.rp-x').addEventListener('click', () => done(null));
                ov.querySelectorAll('.cir-pick').forEach(b => b.addEventListener('click', () => done(b.dataset.i)));
            });
        },

        async createPlaylist(thenAdd) {
            const icon = await this.pickCircuitIcon(); if (!icon) return null;
            const list = pls(); const p = { id: newId(), icon, ids: thenAdd ? [thenAdd] : [] };
            list.push(p); if (!savePls(list)) return null;
            if (!thenAdd) this.libFilter.pl = p.id;
            this.loadLibrary(); return p;
        },
        async changeCircuitIcon(id) {
            const list = pls(), p = list.find(x => x.id === id); if (!p) return;
            const icon = await this.pickCircuitIcon(p.icon); if (!icon || icon === p.icon) return;
            p.icon = icon; if (savePls(list)) this.loadLibrary();
        },
        async deletePlaylist(id) {
            const list = pls(), p = list.find(x => x.id === id); if (!p) return;
            if (!(await AppDialog.confirm('Supprimer ce circuit ' + p.icon + ' ?\nLes trajets restent dans la bibliothèque.', { danger: true, okText: 'Supprimer' }))) return;
            if (savePls(list.filter(x => x.id !== id))) { this.libFilter.pl = ''; this.loadLibrary(); }
        },

        // Appui long sur un trajet → icônes des circuits : un appui ajoute / retire le trajet
        editRoutePlaylists(route) {
            const old = document.getElementById('pl-overlay'); if (old) old.remove();
            const ov = document.createElement('div'); ov.id = 'pl-overlay'; ov.className = 'rp-overlay';
            ov.innerHTML = `<div class="rp-sheet om-sheet"><div class="rp-top"><div style="flex:1;font-weight:900;font-size:1.05rem;padding-left:10px;">Ajouter à un circuit</div><button type="button" class="rp-x" aria-label="Fermer">✕</button></div>
                <div class="om-info">${esc(String(route.title).replace('📍 Ma position actuelle', 'Ma Position'))}</div><div class="cir-grid" id="pl-list"></div></div>`;
            document.body.appendChild(ov);
            const close = () => { ov.remove(); this.loadLibrary(); };
            ov.addEventListener('click', (e) => { if (e.target === ov) close(); }); ov.querySelector('.rp-x').addEventListener('click', close);
            const paint = () => {
                const box = ov.querySelector('#pl-list'), list = pls(); box.innerHTML = '';
                list.forEach(p => {
                    const b = document.createElement('button'); b.type = 'button'; b.className = 'cir-pick cir-tog' + (p.ids.includes(route.id) ? ' on' : ''); b.setAttribute('aria-label', 'Circuit ' + p.icon); b.setAttribute('aria-pressed', p.ids.includes(route.id));
                    b.innerHTML = `${p.icon}<i class="cir-ok">✓</i>`;
                    b.addEventListener('click', () => {
                        const l = pls(), q = l.find(x => x.id === p.id); if (!q) return;
                        q.ids = q.ids.filter(i => i !== route.id); if (!b.classList.contains('on')) q.ids.push(route.id);
                        savePls(l); paint();
                    });
                    box.appendChild(b);
                });
                const n = document.createElement('button'); n.type = 'button'; n.className = 'cir-pick cir-new'; n.setAttribute('aria-label', 'Nouveau circuit'); n.textContent = '＋';
                n.addEventListener('click', async () => { await this.createPlaylist(route.id); paint(); });
                box.appendChild(n);
            };
            paint();
        },

        // Étiquettes libres (#col, #mer…) : saisie séparée par des espaces
        async editRouteTags(route) {
            const routes = AppStore.get(RK, []), r = routes.find(x => x.id === route.id); if (!r) return;
            const v = await AppDialog.prompt('Étiquettes', (r.tags || []).join(' '), { message: 'Sépare-les par des espaces (ex. col mer week-end).', placeholder: 'col mer', okText: 'OK', maxLength: 80 });
            if (v === null) return;
            r.tags = [...new Set(v.split(/[\s,#]+/).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
            if (AppStore.set(RK, routes)) this.loadLibrary();
        },

        // Télécharge d'un coup les cartes de tous les trajets d'un circuit (ceux déjà téléchargés sont ignorés)
        async downloadPlaylist(id) {
            const O = OfflineMaps, p = pls().find(x => x.id === id); if (!p) return;
            if (O.busy()) return AppDialog.alert('Un téléchargement est déjà en cours.');
            const routes = AppStore.get(RK, []).filter(r => p.ids.includes(r.id) && r.geojson && r.geojson.coordinates && r.geojson.coordinates.length > 1);
            const zones = await O.zones(), todo = [];
            for (const r of routes) if (!this.routeCovered(r.geojson.coordinates, zones)) todo.push(r);
            if (!routes.length) return AppDialog.alert('Ce circuit est vide.');
            if (!todo.length) return AppDialog.alert('Les cartes de tous les trajets de ce circuit sont déjà téléchargées ✓');
            const W = 6, plans = todo.map(r => O.plan({ type: 'line', coords: r.geojson.coordinates, km: W }));
            const mb = plans.reduce((a, x) => a + x.mb, 0), cnt = plans.reduce((a, x) => a + x.count, 0);
            const free = await O.storage();
            if (free && mb * 1048576 > (free.quota - free.usage) * 0.9) return AppDialog.alert(`Il faut environ ${this.offlineFmt(mb)} mais il reste ${this.offlineFmt(Math.max(0, free.quota - free.usage) / 1048576)} sur l'appareil.`);
            if (!(await AppDialog.confirm(`Télécharger les cartes de ${todo.length} trajet${todo.length > 1 ? 's' : ''} ?\n≈ ${this.offlineFmt(mb)} · ${this.offlineDur(O.eta(cnt))}`, { okText: 'Télécharger' }))) return;
            const ov = document.createElement('div'); ov.className = 'rp-overlay';
            ov.innerHTML = `<div class="rp-sheet om-sheet"><div class="om-prog" style="display:flex"><div class="om-pl" id="pd-l">Préparation…</div><div class="om-pb"><i id="pd-b"></i></div><button type="button" class="om-cancel" id="pd-c">Annuler</button></div></div>`;
            document.body.appendChild(ov);
            let stop = false; ov.querySelector('#pd-c').addEventListener('click', () => { stop = true; O.cancel(); });
            let okN = 0, fail = null;
            for (let i = 0; i < todo.length && !stop; i++) {
                const r = todo[i], title = String(r.title).replace('📍 Ma position actuelle', 'Ma position');
                const res = await O.download({ name: title, kind: 'route', shape: { type: 'line', coords: r.geojson.coordinates, km: W } }, (pr) => {
                    ov.querySelector('#pd-l').textContent = `Trajet ${i + 1}/${todo.length} · ${pr.total ? pr.done + '/' + pr.total + (pr.eta ? ' · ' + this.offlineDur(pr.eta) + ' restantes' : '') : pr.phase}`;
                    ov.querySelector('#pd-b').style.width = pr.total ? Math.round(pr.done / pr.total * 100) + '%' : '5%';
                });
                if (res.ok) okN++; else { if (res.reason !== 'Annulé.') fail = res.reason; break; }
            }
            ov.remove(); this.loadLibrary();
            if (fail) AppDialog.alert(fail + (okN ? `\n\n${okN} trajet${okN > 1 ? 's' : ''} déjà téléchargé${okN > 1 ? 's' : ''}.` : ''));
        },

        // Menu d'appui long : un seul bouton « Circuits »
        showRouteOptions(route) {
            _opts.apply(this, arguments);
            const overlay = document.getElementById('route-hud-overlay'); const share = document.getElementById('hud-btn-share');
            if (!overlay || !share) return;
            const b = document.createElement('button'); b.id = 'hud-btn-pl'; b.className = share.className; b.style.cssText = share.style.cssText; b.textContent = 'Circuits';
            share.parentNode.insertBefore(b, share);
            b.addEventListener('click', () => { overlay.remove(); this.editRoutePlaylists(route); });
            const t = document.createElement('button'); t.id = 'hud-btn-tags'; t.className = share.className; t.style.cssText = share.style.cssText; t.textContent = 'Étiquettes';
            share.parentNode.insertBefore(t, share);
            t.addEventListener('click', () => { overlay.remove(); this.editRouteTags(route); });
        }
    });
})();
