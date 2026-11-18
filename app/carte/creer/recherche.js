// Créer : recherche plein écran (adresses précises + lieux), façon Google Maps
// Étend ModuleGPS (défini dans carte/carte.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleGPS, {
                BAN_API: 'https://api-adresse.data.gouv.fr/search/',
                RECENT_KEY: 'moto_recent_places',
                // Ouvre la fenêtre plein écran pour renseigner le champ « inputId » (départ, étape ou destination)
                openPlaceSearch(inputId) {
                    const field = document.getElementById(inputId); if (!field) return;
                    const s = this.state;
                    if (!s.ps) this.buildPlaceSearch();
                    const ps = s.ps; ps.inputId = inputId; ps.seq = 0;
                    ps.label.textContent = inputId === 'input-wp-start' ? 'Départ' : (inputId === 'input-wp-dest' ? 'Destination' : (inputId === 'ev-place' ? 'Lieu' : 'Étape'));
                    const cur = field.value.includes('Ma position') ? '' : field.value;
                    ps.input.value = cur;
                    ps.root.classList.add('open'); document.body.classList.add('ps-lock');
                    this.renderPlaceSuggestions(null);
                    ps.input.focus();
                    if (cur) { ps.input.select(); this.runPlaceSearch(cur); }
                },
                closePlaceSearch() {
                    const ps = this.state.ps; if (!ps) return;
                    ps.seq++; clearTimeout(ps.timer);
                    ps.root.classList.remove('open'); document.body.classList.remove('ps-lock');
                    ps.input.blur();
                },
                buildPlaceSearch() {
                    const root = document.createElement('div');
                    root.className = 'ps-overlay'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
                    root.innerHTML = `
                        <div class="ps-head">
                            <button type="button" class="ps-back" aria-label="Retour"><svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button>
                            <div class="ps-field">
                                <span class="ps-label"></span>
                                <input class="ps-input" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" placeholder="Adresse précise, ville, lieu…">
                            </div>
                            <button type="button" class="ps-clear" aria-label="Effacer"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                        </div>
                        <div class="ps-list"></div>`;
                    document.body.appendChild(root);
                    const ps = this.state.ps = { root, input: root.querySelector('.ps-input'), label: root.querySelector('.ps-label'), list: root.querySelector('.ps-list'), inputId: null, seq: 0, timer: null, items: [] };
                    root.querySelector('.ps-back').addEventListener('click', () => this.closePlaceSearch());
                    root.querySelector('.ps-clear').addEventListener('click', () => { ps.input.value = ''; ps.seq++; this.renderPlaceSuggestions(null); ps.input.focus(); });
                    ps.input.addEventListener('input', () => {
                        clearTimeout(ps.timer); const q = ps.input.value.trim();
                        if (q.length < 3) { ps.seq++; this.renderPlaceSuggestions(null); return; }
                        ps.timer = setTimeout(() => this.runPlaceSearch(q), 280);
                    });
                    ps.input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); const first = ps.list.querySelector('.ps-item'); if (first) first.click(); }
                        else if (e.key === 'Escape') this.closePlaceSearch();
                    });
                },
                // --- Recherche : adresses françaises (BAN, numéro de rue précis) + lieux du monde entier (Photon) ---
                async runPlaceSearch(q) {
                    const ps = this.state.ps; const seq = ++ps.seq;
                    this.renderPlaceSuggestions(undefined, 'Recherche…');
                    const ref = this.state.lastKnownCoords || (this.state.map ? (() => { const c = this.state.map.getCenter(); return [c.lng, c.lat]; })() : null);
                    const bias = ref ? `&lat=${ref[1].toFixed(4)}&lon=${ref[0].toFixed(4)}` : '';
                    // Sans réseau : on cherche dans les rues / villes / lieux des cartes téléchargées
                    const offlineHits = async () => { try { if (typeof OfflineGeo === 'undefined') return []; await OfflineGeo.ready(true); return await OfflineGeo.search(q, ref); } catch (e) { return []; } };
                    if (this.isOffline() && (typeof OfflineGeo === 'undefined' || OfflineGeo.available() || navigator.onLine === false)) {
                        const hits = await offlineHits(); if (seq !== ps.seq) return;
                        return this.renderPlaceSuggestions(hits, hits.length ? 'Hors ligne : résultats des cartes téléchargées 📴' : ((typeof OfflineGeo !== 'undefined' && OfflineGeo.available()) ? 'Aucun résultat dans les cartes téléchargées' : 'Hors ligne 📴 : télécharge une carte pour chercher sans réseau'));
                    }
                    const [ban, pho] = await Promise.allSettled([
                        this.poiFetchJSON(`${this.BAN_API}?q=${encodeURIComponent(q)}&limit=6&autocomplete=1${bias}`, 8000),
                        this.poiFetchJSON(`${this.PHOTON_API}?q=${encodeURIComponent(q)}&limit=6&lang=fr${bias}`, 8000)
                    ]);
                    if (seq !== ps.seq) return;   // une recherche plus récente a pris le relais
                    const out = [];
                    if (ban.status === 'fulfilled' && ban.value && ban.value.features) ban.value.features.forEach(f => {
                        const p = f.properties || {};
                        const main = p.name || p.label; const ctx = [p.postcode, p.city].filter(Boolean).join(' ');
                        out.push({ kind: p.type === 'housenumber' ? 'house' : 'pin', main, ctx, value: p.label || main, coords: f.geometry.coordinates, src: 'ban' });
                    });
                    if (pho.status === 'fulfilled' && pho.value && pho.value.features) pho.value.features.forEach(f => {
                        const p = f.properties || {}; let main = p.name || '';
                        if (p.housenumber && p.street) main = `${p.housenumber} ${p.street}`; else if (!main && p.street) main = p.street;
                        const sub = []; if (p.postcode) sub.push(p.postcode); if (p.city && p.city !== main) sub.push(p.city); if (p.country) sub.push(p.country);
                        if (!main && sub.length) main = sub.shift();
                        if (!main) return;
                        out.push({ kind: p.osm_key === 'amenity' || p.osm_key === 'shop' || p.osm_key === 'tourism' ? 'place' : 'pin', main, ctx: sub.join(' · '), value: main + (p.city && p.city !== main ? `, ${p.city}` : ''), coords: f.geometry.coordinates, src: 'photon' });
                    });
                    // Numéro de rue dans la requête : les adresses précises d'abord ; sinon lieux et villes d'abord
                    const hasNumber = /\d/.test(q);
                    out.sort((a, b) => (hasNumber ? (a.src === 'ban' ? 0 : 1) - (b.src === 'ban' ? 0 : 1) : (a.src === 'photon' ? 0 : 1) - (b.src === 'photon' ? 0 : 1)));
                    const seen = new Set(), uniq = [];
                    out.forEach(r => { const k = r.main.toLowerCase() + '|' + r.coords.map(v => v.toFixed(3)).join(','); if (!seen.has(k)) { seen.add(k); uniq.push(r); } });
                    if (!uniq.length && ban.status === 'rejected' && pho.status === 'rejected') {   // réseau en panne : repli sur les cartes téléchargées
                        const hits = await offlineHits(); if (seq !== ps.seq) return;
                        return this.renderPlaceSuggestions(hits, hits.length ? 'Réseau indisponible : résultats des cartes téléchargées 📴' : 'Réseau indisponible 📡');
                    }
                    this.renderPlaceSuggestions(uniq.slice(0, 10), uniq.length ? '' : 'Aucun résultat');
                },
                // items : null = écran d'accueil (Ma position + récents) · undefined = on garde les items · tableau = résultats
                renderPlaceSuggestions(items, message) {
                    const ps = this.state.ps; const list = ps.list; list.innerHTML = '';
                    const ic = {
                        pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle>',
                        house: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
                        place: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="3"></circle>',
                        clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
                        gps: '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path><circle cx="12" cy="12" r="8"></circle>',
                        map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line>'
                    };
                    const row = (kind, main, ctx, onPick, extraCls) => {
                        const b = document.createElement('button'); b.type = 'button'; b.className = 'ps-item' + (extraCls ? ' ' + extraCls : '');
                        const i = document.createElement('span'); i.className = 'ps-ico'; i.innerHTML = `<svg viewBox="0 0 24 24">${ic[kind]}</svg>`;
                        const t = document.createElement('span'); t.className = 'ps-txt';
                        const m = document.createElement('span'); m.className = 'ps-main'; m.textContent = main; t.appendChild(m);
                        if (ctx) { const c = document.createElement('span'); c.className = 'ps-ctx'; c.textContent = ctx; t.appendChild(c); }
                        b.appendChild(i); b.appendChild(t); b.addEventListener('click', onPick); list.appendChild(b);
                    };
                    const head = (txt) => { const h = document.createElement('div'); h.className = 'ps-head2'; h.textContent = txt; list.appendChild(h); };
                    if (items === null) {
                        row('gps', 'Ma position actuelle', 'Utiliser le GPS', () => this.pickMyPosition(), 'ps-gps');
                        row('map', 'Choisir sur la carte', 'Placer un repère à la main', () => { if (ps.inputId === 'ev-place') { this._evMap = true; this.closePlaceSearch(); } else this.startMapPick(ps.inputId); }, 'ps-map');
                        const rec = this.getRecentPlaces();
                        if (rec.length) head('Récents');
                        rec.forEach(r => row('clock', r.main, r.ctx, () => this.pickPlace(r)));
                        return;
                    }
                    if (items === undefined) { items = ps.items; } else { ps.items = items; }
                    if (message) { const d = document.createElement('div'); d.className = 'ps-msg'; d.textContent = message; list.appendChild(d); }
                    items.forEach(r => row(r.kind, r.main, r.ctx, () => this.pickPlace(r)));
                    row('map', 'Choisir sur la carte', 'Placer un repère à la main', () => { if (ps.inputId === 'ev-place') { this._evMap = true; this.closePlaceSearch(); } else this.startMapPick(ps.inputId); }, 'ps-map');
                },
                // Après un choix de lieu : recalcul d'itinéraire, sauf pour le lieu d'un événement (champ « ev-place »)
                psAfterPick(id) { if (id === 'ev-place') { const i = document.getElementById(id); if (i) i.dispatchEvent(new Event('change')); return; } this.checkAndCalculate(); },
                getRecentPlaces() { return AppStore.arr(this.RECENT_KEY, true); },
                saveRecentPlace(r) {
                    try {
                        const rec = this.getRecentPlaces().filter(x => !(x.main === r.main && x.ctx === r.ctx));
                        rec.unshift({ main: r.main, ctx: r.ctx, value: r.value, coords: r.coords });
                        localStorage.setItem(this.RECENT_KEY, JSON.stringify(rec.slice(0, 8)));
                    } catch (e) {}
                },
                pickPlace(r) {
                    const ps = this.state.ps; const input = document.getElementById(ps.inputId);
                    if (input) { input.value = r.value || r.main; this.state.coords[ps.inputId] = r.coords; }
                    this.saveRecentPlace(r); this.closePlaceSearch(); this.psAfterPick(ps.inputId);
                },
                pickMyPosition() {
                    const ps = this.state.ps; const id = ps.inputId; const input = document.getElementById(id); const s = this.state;
                    const apply = (c) => { if (input) input.value = '📍 Ma position actuelle'; s.coords[id] = c; this.closePlaceSearch(); this.psAfterPick(id); };
                    if (s.lastKnownCoords) return apply(s.lastKnownCoords);
                    if (!navigator.geolocation) return AppDialog.alert('Localisation indisponible sur cet appareil.');
                    navigator.geolocation.getCurrentPosition((pos) => apply([pos.coords.longitude, pos.coords.latitude]), (err) => { if (err.code === 1) AppDialog.alert('⚠️ GPS refusé.'); else AppDialog.alert('Position GPS introuvable.'); }, { enableHighAccuracy: true, timeout: 10000 });
                },
});
