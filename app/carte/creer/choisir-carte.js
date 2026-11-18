// Créer : « Choisir sur la carte » — on déplace la carte sous un repère central, l'adresse se met à jour, on confirme
// Étend ModuleGPS (défini dans carte/carte.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleGPS, {
                // Lance le mode « repère » pour le champ inputId (appelé depuis la recherche plein écran)
                startMapPick(inputId, opts) {
                    opts = opts || {};
                    const s = this.state, m = s.map;
                    if (!m) { AppDialog.alert('La carte n\'est pas encore chargée.'); return; }
                    this.closePlaceSearch();
                    const sheet = document.getElementById('route-bottom-sheet');
                    const wasOpen = !!(sheet && sheet.classList.contains('open'));
                    if (wasOpen) document.getElementById('btn-toggle-sheet').click();
                    if (!s.pick) this.buildMapPick();
                    const pk = s.pick; pk.inputId = inputId; pk.seq = 0; pk.label = ''; pk.prevLock = s.isCameraLocked;
                    s.isCameraLocked = false;                       // en navigation, la caméra ne doit pas revenir sur nous pendant le choix
                    pk.cb = opts.cb || null; pk.reopen = wasOpen && !opts.cb;      // le tiroir « Itinéraire » se rouvre après le choix du point
                    pk.title.textContent = opts.title || (inputId === 'input-wp-start' ? 'Placer le départ' : (inputId === 'input-wp-dest' ? 'Placer la destination' : 'Placer l\'étape'));
                    document.getElementById('sub-gps-carte').classList.add('picking');
                    pk.root.classList.add('show');
                    const known = opts.center || s.coords[inputId]; if (known) m.jumpTo({ center: known, zoom: Math.max(m.getZoom(), 14) });
                    pk.onStart = () => { pk.root.classList.add('moving'); pk.addr.textContent = '…'; pk.ok.disabled = true; };
                    pk.onEnd = () => { pk.root.classList.remove('moving'); this.pickReverse(); };
                    m.on('movestart', pk.onStart); m.on('moveend', pk.onEnd);
                    this.pickReverse();
                },
                buildMapPick() {
                    const wrap = document.querySelector('#view-gps .map-wrapper');
                    const root = document.createElement('div'); root.className = 'mp-root';
                    root.innerHTML = `
                        <div class="mp-top"><span class="mp-title"></span><span class="mp-hint">Déplace la carte pour placer le repère</span></div>
                        <div class="mp-pin"><svg viewBox="0 0 24 34"><path d="M12 33s10-9.6 10-19A10 10 0 0 0 2 14c0 9.4 10 19 10 19z"></path><circle cx="12" cy="13" r="4"></circle></svg><i class="mp-shadow"></i></div>
                        <div class="mp-bar">
                            <div class="mp-addr">…</div>
                            <div class="mp-actions"><button type="button" class="mp-cancel">Annuler</button><button type="button" class="mp-ok">Confirmer</button></div>
                        </div>`;
                    wrap.appendChild(root);
                    const pk = this.state.pick = { root, title: root.querySelector('.mp-title'), addr: root.querySelector('.mp-addr'), ok: root.querySelector('.mp-ok'), inputId: null, seq: 0, label: '' };
                    root.querySelector('.mp-cancel').addEventListener('click', () => { if (pk.cb) { pk.cb = null; this.endMapPick(); return; } const id = pk.inputId; this.endMapPick(); this.openPlaceSearch(id); });
                    pk.ok.addEventListener('click', () => this.confirmMapPick());
                },
                endMapPick() {
                    const s = this.state, pk = s.pick; if (!pk || !pk.root.classList.contains('show')) return;
                    pk.seq++;
                    if (s.map) { s.map.off('movestart', pk.onStart); s.map.off('moveend', pk.onEnd); }
                    pk.root.classList.remove('show', 'moving');
                    document.getElementById('sub-gps-carte').classList.remove('picking');
                    s.isCameraLocked = pk.prevLock;
                },
                // Adresse du point sous le repère : BAN (France, précis) puis Photon en secours
                async pickReverse() {
                    const s = this.state, pk = s.pick, m = s.map; if (!pk || !m) return;
                    const seq = ++pk.seq; const c = m.getCenter();
                    pk.ok.disabled = true; pk.addr.textContent = 'Recherche de l\'adresse…';
                    let label = '', ctx = '';
                    try {
                        const r = await this.poiFetchJSON(`https://api-adresse.data.gouv.fr/reverse/?lon=${c.lng.toFixed(6)}&lat=${c.lat.toFixed(6)}`, 6000);
                        const p = r && r.features && r.features[0] && r.features[0].properties;
                        if (p) { label = p.label || p.name; ctx = [p.postcode, p.city].filter(Boolean).join(' '); }
                    } catch (e) {}
                    if (!label) {
                        try {
                            const r = await this.poiFetchJSON(`${this.PHOTON_API.replace(/api\/?$/, '')}reverse?lon=${c.lng.toFixed(6)}&lat=${c.lat.toFixed(6)}&lang=fr`, 6000);
                            const p = r && r.features && r.features[0] && r.features[0].properties;
                            if (p) { const street = [p.housenumber, p.street].filter(Boolean).join(' '); label = [p.name || street, p.city].filter(Boolean).join(', '); ctx = p.postcode || ''; }
                        } catch (e) {}
                    }
                    if (seq !== pk.seq) return;            // la carte a encore bougé
                    pk.label = label || `📌 ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
                    pk.addr.textContent = pk.label;
                    pk.ok.disabled = false;
                },
                confirmMapPick() {
                    const s = this.state, pk = s.pick; if (!pk || !s.map) return;
                    const c = s.map.getCenter();
                    if (pk.cb) { const cb = pk.cb; pk.cb = null; this.endMapPick(); cb([c.lng, c.lat]); return; }
                    const id = pk.inputId; const input = document.getElementById(id);
                    const r = { main: pk.label, ctx: '', value: pk.label, coords: [c.lng, c.lat] };
                    if (input) { input.value = r.value; s.coords[id] = r.coords; }
                    this.saveRecentPlace(r);
                    const reopen = pk.reopen; pk.reopen = false;
                    this.endMapPick(); this.checkAndCalculate();
                    // On revient sur le tiroir : le départ / l'arrivée choisis s'y affichent, avec « + Ajouter étape », « Sauver »…
                    if (reopen) { const sh = document.getElementById('route-bottom-sheet'); if (sh && !sh.classList.contains('open')) setTimeout(() => { if (!sh.classList.contains('open')) document.getElementById('btn-toggle-sheet').click(); }, 150); }
                },
});
