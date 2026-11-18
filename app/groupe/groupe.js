            // ================================================================== //
            // 👥 MODULE COMMUNAUTÉ : radar motards en P2P (WebRTC)               //
            // ------------------------------------------------------------------ //
            // • Le serveur MQTT ne sert QUE de point de rendez-vous : il voit     //
            //   passer un identifiant anonyme (changé à chaque activation) et la //
            //   zone de ~11 km. Les messages de connexion sont chiffrés (ECDH).  //
            // • Position précise + profil circulent en direct de téléphone à     //
            //   téléphone (canal WebRTC chiffré DTLS), uniquement avec les       //
            //   motards à moins de 300 m (liaison gardée jusqu'à 600 m seulement //
            //   si on se rapproche, pour être connecté à temps). Sinon : coupé.  //
            // ================================================================== //
            const ModuleCommunity = {
                config: {
                    // Courtier MQTT : principal (EMQX Cloud, avec identifiant), puis courtier public de secours (bêta). Pour ne garder que le principal, supprimer la 2e ligne.
                    brokers: [
                        { url: 'wss://m12e6219.ala.eu-central-1.emqxsl.com:8084/mqtt', user: 'ridenct-app', pass: 'GTXRF360p*22360*22*2002*' },
                        { url: 'wss://broker.emqx.io:8084/mqtt' }
                    ],
                    topicRoot: 'ridenct/fr-moto/v4',   // v4 : liaisons authentifiées par clé signée (incompatible avec v3)
                    cellSize: 0.005,        // zone ~550 m x ~370 m : couvre toujours les voisins à 300 m (grille 3x3)
                    linkRadius: 300,        // portée radar / intercom (m)
                    approachKeep: 600,      // liaison gardée jusqu'à 600 m si on se rapproche ou si on est dans le même canal intercom
                    crossRadius: 300,       
                    peerStale: 18000,       // une liaison silencieuse plus de 18 s est coupée (un « ping » part toutes les 5 s)
                    staleAfter: 45000,      
                    beaconEvery: 20000,     
                    maxPeers: 20,           
                    newCrossingAfter: 30 * 60 * 1000,
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' },
                        // Relais TURN : indispensable quand les téléphones sont sur des réseaux 4G/5G différents (sinon la liaison
                        // directe échoue et seuls les téléphones sur le même Wi-Fi se voient). Remplace par TES identifiants
                        // (compte gratuit sur metered.ca ou Cloudflare Calls) pour une fiabilité réelle.
                        { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }
                    ]
                },
                state: {
                    radarMode: 'off', enabled: false, client: null, status: 'off', myId: null, sid: null, keys: null, pubB64: '',
                    myPos: null, mySpeed: 0, myHeading: 0, lastFix: null, lastPosSent: 0, lastBeacon: 0, watchId: null,
                    cells: new Set(), peers: new Map(), riders: new Map(), profiles: new Map(), ignored: new Map(), aesCache: new Map(),
                    crossed: {}, friends: [], friendReqs: [], profilePayload: null, sweepTimer: null, localStream: null // NOUVEAU
                },
                init() {
                    this.state.radarMode = 'off'; 
                    this.state.enabled = false;   
                    
                    // Ancien identifiant aléatoire (avant l'identité signée) : gardé seulement pour retrouver les amis déjà enregistrés
                    this.state.legacyId = localStorage.getItem('motoapp_rider_id');
                    if (!this.state.legacyId) { this.state.legacyId = this.randHex(6); localStorage.setItem('motoapp_rider_id', this.state.legacyId); }
                    // Identifiant actuel = empreinte de la clé publique (voir p2p/identite.js)
                    this.state.myId = localStorage.getItem('motoapp_rider_id2') || null;
                    this.state.idReady = this.initIdentity().catch(e => { console.error('[Identité]', e); });
                    
                    const okId = x => x && typeof x.id === 'string';
                    this.state.crossed = AppStore.obj('motoapp_crossed_riders');
                    Object.keys(this.state.crossed).forEach(k => { const c = this.state.crossed[k]; if (!c || typeof c !== 'object' || typeof c.id !== 'string') delete this.state.crossed[k]; });
                    this.state.friends = AppStore.arr('motoapp_friends', true).filter(okId);
                    this.state.friendReqs = AppStore.arr('motoapp_friend_reqs', true).filter(okId);
                    this.state.pendingRemovals = AppStore.arr('motoapp_pending_removals').filter(x => typeof x === 'string');
                    this.state.pendingRequests = AppStore.arr('motoapp_pending_requests').filter(x => typeof x === 'string');
                    this.state.pendingAccepts = AppStore.arr('motoapp_pending_accepts').filter(x => typeof x === 'string');
                    this.state.sentRequests = AppStore.arr('motoapp_sent_requests').filter(x => typeof x === 'string');
                    
                    Object.values(this.state.crossed).forEach(c => { if (c.profile) this.state.profiles.set(c.id, c.profile); });
                    this.state.friends.forEach(f => { if (f.profile) this.state.profiles.set(f.id, f.profile); });
                    this.state.friendReqs.forEach(r => { if (r.profile) this.state.profiles.set(r.id, r.profile); });

                    const btnAll = document.getElementById('radar-toggle-all');
                    const btnFri = document.getElementById('radar-toggle-friends');
                    if (btnAll) btnAll.addEventListener('click', () => this.setRadarMode(this.state.radarMode === 'all' ? 'off' : 'all'));
                    if (btnFri) btnFri.addEventListener('click', () => this.setRadarMode(this.state.radarMode === 'friends' ? 'off' : 'friends'));

                    const tabs = document.querySelectorAll('#comm-nav-bar .comm-tab-btn');
                    tabs.forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            const targetId = e.currentTarget.getAttribute('data-sub'); 
                            tabs.forEach(t => t.classList.remove('active')); 
                            e.currentTarget.classList.add('active');
                            document.querySelectorAll('.comm-sub-view').forEach(v => v.classList.remove('active')); 
                            const targetView = document.getElementById(targetId); 
                            if (targetView) targetView.classList.add('active');
                            e.currentTarget.style.color = '';
                            if (targetId === 'sub-comm-events') this.eventsRefresh();
                        });
                    });

                    if (typeof ModuleProfile !== 'undefined') {
                        const originalSave = ModuleProfile.saveData.bind(ModuleProfile);
                        ModuleProfile.saveData = () => { originalSave(); this.publishProfile(true); };
                    }
                    try { this.eventsInit(); } catch (e) { console.warn('Événements :', e); }
                    window.addEventListener('pagehide', () => this.broadcast({ type: 'bye' }));
                    this.renderLists();
                    
                    let savedMode = localStorage.getItem('motoapp_radar_mode');
                    if (!savedMode && localStorage.getItem('motoapp_radar_enabled') === '1') savedMode = 'all'; 
                    
                    if (savedMode && savedMode !== 'off') setTimeout(() => this.setRadarMode(savedMode, { restore: true }), 800);
                    else this.updateStatus();
                },
                randHex(n) { return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join(''); },
                b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); },
                unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },

            };


// ====================================================================
//  ÉVÉNEMENTS : liste des balades / rendez-vous de la communauté + création
//  (même base Supabase que les signalements de la carte : table map_reports, kind = 'ride')
// ====================================================================
Object.assign(ModuleCommunity, {
    eventsInit() {
        const b = document.getElementById('ev-create-btn'); if (b) b.addEventListener('click', () => this.evOpenForm());
        this._evList = []; this._evFilter = 'all'; this._evQ = ''; this._evLv = ''; this._evReg = '';
        this.evBuildChips();
        const rg = document.getElementById('ev-rg'); if (rg) rg.addEventListener('click', (e) => { if (this._evReg && e.target.closest('.cm-x')) { this.evSetRegion(''); return; } this.evRegionSheet(); });
        const q = document.getElementById('ev-q'); if (q) q.addEventListener('input', () => { this._evQ = q.value; this.evRender(); });
        document.querySelectorAll('.ev-chip').forEach(c => c.addEventListener('click', () => {
            this._evFilter = c.dataset.f;
            document.querySelectorAll('.ev-chip').forEach(x => x.classList.toggle('active', x === c));
            this.evRender();
        }));
    },

    evBuildChips() {
        const box = document.getElementById('ev-lv'); if (!box || typeof ModuleRoutes === 'undefined') return; const R = ModuleRoutes;
        box.innerHTML = `<button type="button" class="on" data-l="" aria-label="Tous" style="--lc:var(--accent-color)">${R.svg('<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>')}Tous</button>` + Object.keys(R.LV).map(k => `<button type="button" data-l="${k}" aria-label="${R.LV[k].n}" style="--lc:${R.LV[k].c}"><span class="cm-ic">${R.svg(R.LV[k].i)}</span>${R.LV[k].n}</button>`).join('');
        box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); this._evLv = b.dataset.l; this.evRender(); }));
    },
    evRegionOf(e) { try { return ModuleRoutes.region([[e.lng, e.lat]]); } catch (x) { return ''; } },
    evSetRegion(r) { this._evReg = r; const b = document.getElementById('ev-rg'); if (b) { b.classList.toggle('on', !!r); b.querySelector('span').textContent = r || 'Région'; const x = b.querySelector('.cm-x'); if (x) x.remove(); if (r) b.insertAdjacentHTML('beforeend', '<i class="cm-x" aria-label="Effacer">✕</i>'); } this.evRender(); },
    evRegionSheet() {
        const old = document.getElementById('cm-rgs'); if (old) old.remove(); const cur = this._evReg, cnt = {};
        (this._evList || []).forEach(e => { const r = this.evRegionOf(e); if (r) cnt[r] = (cnt[r] || 0) + 1; });
        const ov = document.createElement('div'); ov.id = 'cm-rgs'; ov.className = 'cm-ov';
        const row = (n, c, lab) => `<button type="button" class="cm-ri ${n === cur ? 'on' : ''}" data-r="${this.esc(n)}"><span class="cm-ck">${n === cur ? ModuleRoutes.svg('<path d="M5 13l4 4L19 7"/>') : ''}</span>${this.esc(lab || n)}${c != null ? `<em>${c}</em>` : ''}</button>`;
        const items = ModuleRoutes.REG.filter(n => cnt[n] > 0 || n === cur).sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0));
        ov.innerHTML = `<div class="cm-sheet"><div class="cm-hd"><b>Région</b><button type="button" class="aide-x" id="rg-x" aria-label="Fermer">✕</button></div><div class="cm-rl">${row('', null, 'Toutes les régions') + items.map(n => row(n, cnt[n] || 0)).join('')}</div></div>`;
        document.body.appendChild(ov); const close = () => ov.remove(); ov.querySelector('#rg-x').onclick = close; ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        ov.querySelectorAll('.cm-ri').forEach(b => b.onclick = () => { close(); this.evSetRegion(b.dataset.r); });
    },

    async eventsRefresh() {
        const box = document.getElementById('ev-list'); if (!box || typeof ModuleGPS === 'undefined') return;
        if (!this._evList.length) box.innerHTML = '<div class="comm-empty">Chargement…</div>';
        try {
            const _l = await ModuleGPS.rpApi('map_reports?select=id,title,description,lat,lng,starts_at,confirms,created_at,place_name,organizer_name,level&kind=eq.ride&order=starts_at.asc&limit=100') || [];
            this._evList = _l.filter(e => !e.starts_at || Date.now() < new Date(e.starts_at).getTime() + 7 * 864e5);
            this.evRender();
        } catch (e) {
            box.innerHTML = '<div class="comm-empty">Impossible de charger les événements.<br>Vérifie ta connexion puis réessaie.</div>';
        }
    },

    evRender() {
        const box = document.getElementById('ev-list'), G = ModuleGPS, me = G.state.lastKnownCoords, mine = G.rpMine(), voted = G.rpVoted();
        const f = this._evFilter, onlyMine = f === 'mine', joined = f === 'joined';
        const sr = document.getElementById('ev-sr'); if (sr) sr.style.display = f === 'all' ? '' : 'none';
        const qq = (f === 'all' ? (this._evQ || '') : '').trim().toLowerCase();
        const list = (this._evList || []).filter(e => onlyMine ? mine.includes(e.id) : joined ? (voted.includes(e.id) && !mine.includes(e.id)) : true)
            .filter(e => f !== 'all' || ((!this._evLv || e.level === this._evLv) && (!this._evReg || this.evRegionOf(e) === this._evReg)))
            .filter(e => !qq || [e.title, e.place_name, e.organizer_name, e.description].some(x => x && String(x).toLowerCase().includes(qq)));
        const cnt = document.getElementById('ev-count'); if (cnt) cnt.textContent = list.length;
        const lb = document.getElementById('ev-label'); if (lb) lb.textContent = onlyMine ? 'Mes événements' : joined ? 'Je participe' : 'À venir';
        const t0 = Date.now() - 30 * 60000, past = e => new Date(e.starts_at).getTime() < t0;
        list.sort((a, b) => (past(a) - past(b)) || (past(a) ? new Date(b.starts_at) - new Date(a.starts_at) : new Date(a.starts_at) - new Date(b.starts_at)));
        box.innerHTML = '';
        if (!list.length) { box.innerHTML = (qq || this._evLv || this._evReg) && f === 'all' ? '<div class="comm-empty">Aucune balade ne correspond<br>à ta recherche.</div>' : onlyMine ? '<div class="comm-empty">Tu n\'as créé aucune balade<br>pour le moment.</div>' : joined ? '<div class="comm-empty">Tu ne participes à aucune balade<br>pour le moment.</div>' : '<div class="comm-empty">Aucun événement à venir.<br>Crée le premier !</div>'; return; }
        list.forEach(ev => {
            const d = new Date(ev.starts_at), isMine = mine.includes(ev.id), hasVoted = voted.includes(ev.id) || isMine;
            const dist = me ? G.calculateDistance(me, [ev.lng, ev.lat]) : null;
            const card = document.createElement('div'); card.className = 'ev-card' + (past(ev) ? ' past' : '');
            const hh = d.getHours(), mm = d.getMinutes(), hm = hh + ' h' + (mm ? String(mm).padStart(2, '0') : '');
            const sub = [past(ev) ? 'Terminée' : 'Rendez-vous ' + hm, ev.place_name].filter(Boolean).join(' · ');
            const lv = G.RP_LEVELS[ev.level]; const meta = [`${ev.confirms} inscrit${ev.confirms > 1 ? 's' : ''}`, ev.organizer_name ? 'Par ' + ev.organizer_name : null].filter(Boolean).join(' · ');
            card.innerHTML = `<div class="ev-date"><b>${d.getDate()}</b><span>${this.esc(d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''))}</span></div>
                <div class="ev-main"><div class="ev-title">${this.esc(ev.title)}${isMine ? ' <span class="ev-tag">Créé par moi</span>' : (hasVoted ? ' <span class="ev-tag">Inscrit</span>' : '')}</div><div class="ev-sub">${this.esc(sub)}</div><div class="ev-sub">${this.esc(meta)}</div>${lv ? `<div class="ev-sub ev-lv">Niveau ${this.esc(lv.label)}</div>` : ''}${ev.description ? `<div class="ev-desc">${this.esc(ev.description)}</div>` : ''}
                <div class="ev-actions"></div></div>`;
            card.addEventListener('click', (e) => { if (!e.target.closest('.ev-actions')) card.classList.toggle('open'); });
            const acts = card.querySelector('.ev-actions');
            const btn = (txt, cls, fn, dis) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ev-btn ' + (cls || ''); b.textContent = txt; if (dis) b.disabled = true; b.addEventListener('click', fn); acts.appendChild(b); };
            btn(hasVoted ? (isMine ? '✓ Organisateur' : '✓ Inscrit') : 'Je participe', 'main', () => this.evJoin(ev.id), hasVoted || past(ev));
            btn('Voir sur la carte', '', () => this.evShowOnMap(ev));
            btn('Y aller', '', () => this.evGo(ev));
            if (isMine) btn('Supprimer', 'danger', () => this.showConfirm('Supprimer l\'événement ?', 'Il sera supprimé pour tout le monde.', () => this.evDelete(ev.id)));
            box.appendChild(card);
        });
    },

    async evJoin(id) {
        try {
            await ModuleGPS.rpApi('rpc/vote_report', { method: 'POST', body: JSON.stringify({ p_id: id, p_device: ModuleGPS.rpDevice(), p_vote: 'confirm' }) });
            const l = ModuleGPS.rpVoted(); l.push(id); try { localStorage.setItem('moto_report_votes', JSON.stringify(l.slice(-300))); } catch (e) {}
            this.showNotification('Inscrit ✓', 'Tu participes à cet événement.');
            this.eventsRefresh();
        } catch (e) { this.showNotification('Erreur', 'Impossible de s\'inscrire (connexion ?).'); }
    },

    async evDelete(id) {
        try {
            const ok = await ModuleGPS.rpApi('rpc/delete_my_report', { method: 'POST', body: JSON.stringify({ p_id: id, p_device: ModuleGPS.rpDevice() }) });
            this.showNotification(ok ? 'Événement supprimé' : 'Suppression impossible', ok ? 'Il a été supprimé.' : 'Seul l\'organisateur peut le faire.');
            this.eventsRefresh(); if (ModuleGPS.reportsFetch) ModuleGPS.reportsFetch(true);
        } catch (e) { this.showNotification('Erreur', 'Connexion impossible.'); }
    },

    evShowOnMap(ev) {
        AppManager.switchView('view-gps');
        const tab = document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]'); if (tab) tab.click();
        const m = ModuleGPS.state.map; if (!m) return;
        setTimeout(() => { try { m.resize(); m.flyTo({ center: [ev.lng, ev.lat], zoom: 14, duration: 1200 }); } catch (e) {} }, 100);
        setTimeout(async () => { await ModuleGPS.reportsFetch(true); ModuleGPS.rpPopup(ev.id); }, 1500);
    },

    evGo(ev) {
        AppManager.switchView('view-gps');
        const tab = document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]'); if (tab) tab.click();
        setTimeout(() => ModuleGPS.navigateToPOI(ev.title || 'Événement', ev.lat, ev.lng), 150);
    },

    // « Choisir sur la carte » pour le lieu de rendez-vous : on passe sur la carte (repère au centre), puis on revient sur la page de l'événement
    evPickOnMap(ov, place) {
        const G = ModuleGPS, back = () => { ov.style.display = ''; const b = document.querySelector('.nav-btn[data-target="view-community"]'); if (b) b.click(); };
        const go = document.querySelector('.nav-btn[data-target="view-gps"]'); if (go) go.click();
        const tab = document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]'); if (tab && !tab.classList.contains('active')) tab.click();
        setTimeout(() => {
            if (!G.state.map) { back(); return; }
            G.startMapPick(null, { title: 'Lieu de rendez-vous', cb: (c) => { G.state.coords['ev-place'] = c; place.value = '📍 ' + ((G.state.pick && G.state.pick.label) || (c[1].toFixed(5) + ', ' + c[0].toFixed(5))); } });
            const host = document.getElementById('sub-gps-carte'), mo = new MutationObserver(() => { if (!host.classList.contains('picking')) { mo.disconnect(); back(); } });
            mo.observe(host, { attributes: true, attributeFilter: ['class'] });
        }, 350);
    },

    evOpenForm() {
        const old = document.getElementById('ev-overlay'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'ev-overlay'; ov.className = 'ev-page';
        const now = new Date(Date.now() + 3600000), pad = n => String(n).padStart(2, '0');
        // Page complète (plus de fenêtre qui monte du bas) : retour en haut, champs qui défilent, bouton « Publier » fixe en bas
        ov.innerHTML = `<div class="ev-pg-head"><button type="button" class="ev-pg-back" aria-label="Retour"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg></button><div class="ev-pg-title">Nouvelle balade</div></div>
            <div class="ev-pg-body"><div class="rp-form">
                <div><label>Titre</label><input id="ev-title" maxlength="60" placeholder="Ex : Balade des crêtes"></div>
                ${ModuleGPS.rpLevelPicker()}
                <div class="rp-row"><div><label>Date</label><input id="ev-date" type="date" value="${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}"></div><div><label>Heure</label><input id="ev-time" type="time" value="${pad(now.getHours())}:00"></div></div>
                <div><label>Lieu de rendez-vous</label><input id="ev-place" readonly placeholder="Choisir un lieu ou une adresse…" style="cursor:pointer;"></div>
                <div><label>Détails (facultatif)</label><textarea id="ev-desc" maxlength="200" placeholder="Rythme, parcours, pause déjeuner…"></textarea></div>
                <div class="rp-msg" id="ev-msg"></div>
            </div></div>
            <div class="ev-pg-foot"><button type="button" class="rp-pub" id="ev-pub">Publier la balade</button></div>`;
        document.body.appendChild(ov);
        const msg = ov.querySelector('#ev-msg'), place = ov.querySelector('#ev-place'), G = ModuleGPS;
        delete G.state.coords['ev-place']; G.rpLevelBind(ov);
        const close = () => ov.remove();
        ov.querySelector('.ev-pg-back').addEventListener('click', close);
        // Choix du lieu : même recherche plein écran que l'itinéraire (adresses précises, lieux, ma position)
        place.addEventListener('click', () => {
            G.openPlaceSearch('ev-place');
            const ps = G.state.ps; if (!ps) return;
            ov.style.display = 'none';
            const mo = new MutationObserver(() => { if (!ps.root.classList.contains('open')) { mo.disconnect(); if (G._evMap) { G._evMap = false; this.evPickOnMap(ov, place); } else ov.style.display = ''; } });
            mo.observe(ps.root, { attributes: true, attributeFilter: ['class'] });
        });
        ov.querySelector('#ev-pub').addEventListener('click', async (ev) => {
            const btn = ev.currentTarget, c = G.state.coords['ev-place'], title = ov.querySelector('#ev-title').value.trim();
            const err = (t) => { msg.textContent = t; msg.className = 'rp-msg err'; };
            if (title.length < 3) return err('Donne un titre à la balade (3 lettres minimum).');
            if (!c) return err('Choisis le lieu de rendez-vous.');
            const d = ov.querySelector('#ev-date').value, tm = ov.querySelector('#ev-time').value; if (!d || !tm) return err('Choisis la date et l\'heure.');
            btn.disabled = true;
            const ok = await G.rpSend({ kind: 'ride', subtype: 'meetup', level: G.rpLevelValue(ov), title, description: ov.querySelector('#ev-desc').value.trim() || null, starts_at: new Date(`${d}T${tm}`).toISOString(), lat: c[1], lng: c[0],
                place_name: (place.value || '').replace('📍 ', '').slice(0, 120) || null, organizer_name: ((typeof ModuleProfile !== 'undefined' && ModuleProfile.state && ModuleProfile.state.name) || '').slice(0, 40) || null }, msg);
            if (ok) { setTimeout(() => { close(); this.eventsRefresh(); }, 700); } else btn.disabled = false;
        });
    }
});

