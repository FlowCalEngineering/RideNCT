// Demande d'aide entre motards (crevaison, panne…) : un appui prévient les motards à moins de 5 km.
// Réseau : même courtier MQTT que le radar, rubrique /aide/. Tout message est signé (clé d'identité du téléphone).
// Vie privée : les voisins ne voient qu'une zone (≈ 2 km). La position exacte et celle de celui qui vient circulent
// chiffrées (ECDH éphémère + AES-GCM) : seul le motard qui répond (et celui qui demande) peut les lire.
const ModuleAide = {
    CELL: 0.1, KM: 5, APPROX: 0.02, TTL: 20 * 60000, MAX_IN: 3,
    KINDS: {
        flat: { t: 'Crevaison', need: 'Kit mèche' },
        fuel: { t: 'Panne d\'essence', need: 'Bidon d\'essence' },
        mech: { t: 'Panne mécanique', need: 'Outils' },
        batt: { t: 'Batterie', need: 'Câbles' }
    },
    FIELDS: { thx: ['id', 'to', 'ts'], req: ['id', 'rt', 'kd', 'lat', 'lon', 'n', 'ts', 'rk'], yes: ['id', 'n', 'ts', 'ek', 'iv', 'ct'], acc: ['id', 'to', 'ts', 'iv', 'ct'], pos: ['id', 'w', 'ts', 'to', 'iv', 'ct'], end: ['id', 'ts'] },
    incoming: new Map(), pend: new Map(), declined: new Set(), req: null, net: null, netCell: null, subs: new Set(), help: null,

    C() { return ModuleCommunity; }, S() { return ModuleSecurity; },
    root() { return ModuleCommunity.config.topicRoot + '/aide/'; },
    esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
    hex(n) { const a = crypto.getRandomValues(new Uint8Array(n)); return Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); },
    myName() { return String(this.S().myName() || 'Un motard').replace(/\|/g, ' ').slice(0, 40); },
    dist(a, b) { return ModuleCommunity.distance(a, b); },
    fmtKm(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km' : Math.round(m) + ' m'; },
    eta(m) { return Math.max(1, Math.round(m * 1.3 / 1000 / 50 * 60)); },   // à vol d'oiseau × 1,3 à 50 km/h : indicatif
    approx(p) { const g = this.APPROX, r = (v) => +((Math.floor(v / g) + 0.5) * g).toFixed(4); return { lat: r(p.lat), lon: r(p.lon) }; },
    cellKey(lat, lon) { return Math.floor(lat / this.CELL) + '_' + Math.floor(lon / this.CELL); },
    cellsAround(lat, lon) {
        const s = this.CELL, dLat = this.KM / 111.32, dLon = this.KM / (111.32 * Math.max(0.1, Math.cos(lat * Math.PI / 180))), out = [];
        for (let y = Math.floor((lat - dLat) / s); y <= Math.floor((lat + dLat) / s); y++) for (let x = Math.floor((lon - dLon) / s); x <= Math.floor((lon + dLon) / s); x++) out.push(y + '_' + x);
        return out;
    },

    // ---------- chiffrement ----------
    async ecKey() { return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']); },
    async pubB64(kp) { return ModuleCommunity.b64(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))); },
    async shared(priv, pubB64) {
        const raw = ModuleCommunity.unb64(pubB64); if (raw.length !== 65 || raw[0] !== 4) throw new Error('clé invalide');
        const pub = await crypto.subtle.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    async enc(key, obj) {
        const iv = crypto.getRandomValues(new Uint8Array(12)), ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
        return { iv: ModuleCommunity.b64(iv), ct: ModuleCommunity.b64(new Uint8Array(ct)) };
    },
    async dec(key, iv, ct) {
        try { const o = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ModuleCommunity.unb64(iv) }, key, ModuleCommunity.unb64(ct)))); return (o && isFinite(o.lat) && isFinite(o.lon) && Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180) ? { lat: +o.lat, lon: +o.lon } : null; } catch (e) { return null; }
    },

    // ---------- messages signés ----------
    textOf(m) { return ['vroom-aide-v1', m.t].concat((this.FIELDS[m.t] || []).map(f => m[f])).join('|'); },
    async pack(m) { m.k = ModuleCommunity.state.idPub; m.s = await ModuleCommunity.signText(this.textOf(m)); return JSON.stringify(m); },
    async check(m) { return ModuleCommunity.verifyText(m.k, m.s, this.textOf(m)); },   // rid du signataire ou null
    okId(v) { return typeof v === 'string' && /^[a-f0-9]{16}$/.test(v); },
    okB64(v, max) { return typeof v === 'string' && v.length > 0 && v.length <= (max || 200) && /^[A-Za-z0-9+/=_-]+$/.test(v); },
    freshTs(ts) { ts = Number(ts); return isFinite(ts) && Date.now() - ts <= this.TTL && ts - Date.now() <= 5 * 60000; },

    // ---------- réseau ----------
    init() {
        this.renderPage(); setTimeout(() => this.renderPage(), 1500);
        const tb = document.getElementById('sec-aide'); if (tb) tb.addEventListener('click', () => this.renderPage());
        setInterval(() => this.tick(), 10000);
        setTimeout(() => this.tick(), 1500);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { this.freshNet(); this.tick(); } });
        setInterval(() => this.sendPos(), 10000);
        setInterval(() => this.retry(), 4000);
        setInterval(() => this.watch(), 6000);
        window.addEventListener('online', () => { if (this.net) this.net.reconnectNow(); });
    },
    wanted() {
        const S = this.S(); if (this.req || this.help || this.pend.size || [...this.incoming.values()].some(r => r.st !== 'new')) return true;
        return !!S.cfg.share && (document.visibilityState !== 'hidden' || S.state.isArmed || !!(ModuleCommunity.state && ModuleCommunity.state.enabled) || !!(ModuleGPS.state && ModuleGPS.state.isTracking));
    },
    sub(t) { this.subs.add(t); if (this.net && this.net.connected) try { this.net.subscribe(t); } catch (e) {} },
    unsub(t) { this.subs.delete(t); if (this.net && this.net.connected) try { this.net.unsubscribe(t); } catch (e) {} },
    ensureNet() {
        if (this.net || typeof MiniMQTT === 'undefined') return;
        this.net = new MiniMQTT(ModuleCommunity.config.brokers, ('vaid' + this.hex(8)).slice(0, 23), {
            connect: () => { this.netCell = null; this.subs.forEach(t => { try { this.net.subscribe(t); } catch (e) {} }); this.tick(); if (this.req) this.publishReq(); },
            message: (t, p) => this.onNet(t, p), status: () => {}
        });
        this.net.start();
    },
    stopNet() { if (this.net) { try { this.net.stop(); } catch (e) {} } this.net = null; this.netCell = null; },
    tick() {
        try {
            const now = Date.now();
            this.incoming.forEach((r, id) => { if (now - r.seen > (r.st === 'new' ? 4 * 60000 : r.st === 'yes' ? 3 * 60000 : this.TTL)) this.dropIncoming(id); });
            this.pend.forEach((p, id) => { if (now - p.t > this.TTL) { this.pend.delete(id); if (!this.incoming.has(id)) this.unsub(this.root() + 'r/' + p.rt); } });
            if (this.req && now - this.req.t0 > this.TTL) this.endReq(true);
            if (!this.wanted()) { if (this.net) this.stopNet(); return; }
            this.ensureNet(); const p = this.S().myPos(); if (!this.net) return;
            // Pas de position (surveillance et radar éteints) : on la demande au GPS, sinon on ne sait ni dans quelle zone écouter ni à quelle distance on est
            const S = this.S(), old = !S.pos || now - S.pos.t > 120000;
            if ((!p || old) && !this.locBusy && now - (this.locAt || 0) > 20000) { this.locBusy = true; this.locAt = now; S.freshPos().then(() => { this.locBusy = false; this.tick(); }).catch(() => { this.locBusy = false; }); }
            if (!p) return;
            const cell = this.root() + 'c/' + this.cellKey(p.lat, p.lon);
            if (cell !== this.netCell) { if (this.netCell) this.unsub(this.netCell); this.sub(cell); this.netCell = cell; }
        } catch (e) {}
    },
    // Veille de la connexion : sur mobile, la liaison avec le courtier peut mourir sans prévenir (changement de réseau, veille) et on n'entend plus rien pendant des minutes.
    // On l'interroge toutes les 6 s ; sans réponse en 18 s on la refait.
    watch() {
        const n = this.net; if (!n) return; const now = Date.now();
        if (n.connected) { try { n.packet(0xC0, new Uint8Array(0)); } catch (e) {} if (now - n.lastRx > 18000) n.reconnectNow(); }
        else if (navigator.onLine !== false && now - (this._force || 0) > 8000) { this._force = now; n.reconnectNow(); }
    },
    freshNet() { const n = this.net; if (n && (!n.connected || Date.now() - n.lastRx > 12000)) n.reconnectNow(); },
    pub(topic, msg) { try { if (this.net && this.net.connected) this.net.publish(topic, msg, false); } catch (e) {} },

    // ---------- celui qui demande ----------
    // Choix du problème : onglet « Aide » de la feuille ⚠ de la carte ; demande en cours : feuille de suivi
    open() {
        if (!this.req) { try { ModuleGPS.rpOpenSheet('aide'); } catch (e) { console.warn('[Aide] feuille indisponible', e); } return; }
        if (this.pageVisible()) { this.renderReq(); return; }
        const old = document.getElementById('aide-ov'); if (old) { this.renderReq(); return; }
        const o = document.createElement('div'); o.id = 'aide-ov'; o.className = 'rp-overlay aide-ov'; document.body.appendChild(o);
        o.addEventListener('click', (e) => { if (e.target === o) this.close(); });
        this.renderReq();
    },
    close() { const o = document.getElementById('aide-ov'); if (o) o.remove(); },
    reqBody(R) {
        const K = this.KINDS[R.kd], H = R.helper;
        if (!H && R.offers.size) {
            const list = [...R.offers.values()].map(o => ({ o, d: this.dist(o.pos, R.pos) })).sort((a, b) => a.d - b.d);
            return `<div class="aide-wait"><i></i>${list.length} motard${list.length > 1 ? 's ont répondu' : ' a répondu'}</div>` + list.map((x, i) => `<div class="aide-of"><div class="aide-oh"><span class="aide-ic">🏍</span><div><b>${this.esc(x.o.name)}</b><small>${K.need}</small></div><div class="aide-od">≈ ${this.eta(x.d)} min<small>à ${this.fmtKm(x.d)}</small></div></div><button type="button" class="aide-btn${i ? ' sec' : ''}" data-acc="${x.o.krid}">Accepter ${this.esc(x.o.name)}</button></div>`).join('') + '<p class="aide-note">Ta position exacte n\'est envoyée qu\'au motard que tu acceptes.</p>';
        }
        if (!H) return `<div class="aide-wait"><i></i>Recherche de motards…</div><p class="aide-note">${R.err ? this.esc(R.err) : 'Ta demande est envoyée aux motards à moins de ' + this.KM + ' km.'}</p>`;
        const d = H.pos ? this.dist(H.pos, R.pos) : null;
        return `<div class="aide-big"><small>${this.esc(H.name)} arrive</small><b>${d != null ? '≈ ' + this.eta(d) + ' min' : '…'}</b><span>${d != null ? 'à ' + this.fmtKm(d) : 'position en cours'} · ${K.need}</span></div>
            <p class="aide-note">Ta position exacte lui est envoyée. Reste en lieu sûr, visible de la route.</p>
            <button type="button" class="aide-btn aide-thx">Oui, merci ${this.esc(H.name)} 🙏</button>`;
    },
    bindReq(root) {
        root.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => this.accept(b.dataset.acc));
        const e = root.querySelector('.aide-end'); if (e) e.onclick = () => { this.endReq(); this.close(); };
        const t = root.querySelector('.aide-thx'); if (t) t.onclick = () => this.thank();
    },
    // Page plein écran de Sécurité (sous-page « Demander de l'aide ») : toujours le miroir de la demande en cours
    pageVisible() { const p = document.getElementById('sec-sub-aide'); return !!(p && p.classList.contains('active') && p.offsetParent); },
    // Page plein écran de Sécurité : mêmes cartes, tuiles et boutons que le reste de l'onglet
    pageBody(R) {
        const K = this.KINDS[R.kd], H = R.helper;
        if (H) {
            const d = H.pos ? this.dist(H.pos, R.pos) : null;
            return `<div class="card security-card aide-st on"><div class="sensor-title">${K.t} · demande en cours</div><h2 class="sensor-status">${d != null ? '≈ ' + this.eta(d) + ' min' : '…'}</h2>
                <div class="sec-sub"><b>${this.esc(H.name)}</b> arrive · ${d != null ? 'à ' + this.fmtKm(d) : 'position en cours'} · ${K.need}</div></div>
                <div class="card sec-card"><div class="sec-hint" style="margin-top:0">Ta position exacte lui est envoyée. Reste en lieu sûr, visible de la route.</div></div>
                <button type="button" class="btn btn-primary aide-thx" style="width:100%">Oui, merci ${this.esc(H.name)} 🙏</button>`;
        }
        if (R.offers.size) {
            const list = [...R.offers.values()].map(o => ({ o, d: this.dist(o.pos, R.pos) })).sort((a, b) => a.d - b.d);
            return `<div class="card security-card aide-st"><div class="sensor-title">${K.t} · demande en cours</div><h2 class="sensor-status">${list.length} RÉPONSE${list.length > 1 ? 'S' : ''}</h2><div class="sec-sub">Choisis le motard qui vient. Ta position exacte ne lui est envoyée qu'à ce moment.</div></div>`
                + list.map((x, i) => `<div class="card sec-card aide-of2"><div class="sec-row"><div><div class="sec-h" style="margin:0 0 4px">${K.need}</div><b class="aide-nm">${this.esc(x.o.name)}</b></div><div class="aide-eta2"><b>≈ ${this.eta(x.d)} min</b><span>à ${this.fmtKm(x.d)}</span></div></div><button type="button" class="btn ${i ? '' : 'btn-primary'}" data-acc="${x.o.krid}" style="width:100%;margin-top:12px">Accepter ${this.esc(x.o.name)}</button></div>`).join('');
        }
        return `<div class="card security-card aide-st"><div class="sensor-title">${K.t} · demande en cours</div><h2 class="sensor-status">RECHERCHE…</h2><div class="sec-sub">${R.err ? this.esc(R.err) : 'Ta demande est envoyée aux motards à moins de ' + this.KM + ' km. Garde l\'appli ouverte.'}</div></div>`;
    },
    renderPage() {
        document.body.classList.toggle('aide-active', !!this.req);   // pastille sur le bouton ⚠ de la carte tant qu'une demande est en cours
        const pg = document.getElementById('aide-page'), R = this.req; if (!pg) return;
        const ic = (k) => { const a = (typeof ModuleGPS !== 'undefined' && ModuleGPS.RP_AIDE || []).find(x => x.k === k); return a ? `<svg viewBox="0 0 24 24">${a.i}</svg>` : ''; };
        const col = { flat: '#ff453a', fuel: '#ff9f0a', mech: '#32ade6', batt: '#30d158' };
        if (!R) {
            pg.innerHTML = (typeof ModuleBadges !== 'undefined' ? ModuleBadges.summary() : '') + `<div class="at-home-grid">${Object.keys(this.KINDS).map(k => `<button type="button" class="at-home-tile aide-k" data-k="${k}"><span class="ic" style="color:${col[k]}">${ic(k)}</span><span class="t">${this.KINDS[k].t}</span><span class="s">${this.KINDS[k].need}</span></button>`).join('')}</div>
                <div class="card sec-card"><div class="sec-h">Comment ça marche</div><div class="sec-hint" style="margin-top:0">Un appui prévient les motards à moins de <b>${this.KM} km</b>. Ils voient seulement ta zone (≈ 2 km). Ta position exacte n'est donnée qu'à celui que tu acceptes.</div></div>
                <div class="card sec-card aide-urg"><div class="sec-hint" style="margin-top:0"><b>Urgence vitale ?</b> Utilise le bouton SOS ou le 112.</div></div>`;
            pg.querySelectorAll('.aide-k').forEach(b => b.onclick = () => this.startReq(b.dataset.k, 'page'));
            const bd = pg.querySelector('#aide-bdg'); if (bd) bd.onclick = () => { try { ModuleBadges.render(); this.S().go('sec-sub-badges'); } catch (e) {} };
            return;
        }
        pg.innerHTML = this.pageBody(R) + `<button type="button" class="btn btn-danger aide-end" style="width:100%">Annuler la demande</button>`;
        this.bindReq(pg);
    },
    renderReq() {
        this.renderPage();
        const o = document.getElementById('aide-ov'), R = this.req; if (!o) return; if (!R) { this.close(); return; }
        const K = this.KINDS[R.kd];
        o.innerHTML = `<div class="rp-sheet aide-sh"><div class="aide-hd"><b>${K.t}</b><button type="button" class="aide-x" id="aide-x" aria-label="Réduire">✕</button></div>${this.reqBody(R)}
            <button type="button" class="aide-btn sec aide-end">Annuler la demande</button></div>`;
        this.bindReq(o);
        o.querySelector('#aide-x').onclick = () => this.close();
    },
    async startReq(kd, host) {
        if (!this.KINDS[kd] || this.req) return;
        const S = this.S(), R = { id: this.hex(8), rt: this.hex(8), kd, pos: null, kp: null, rk: null, t0: Date.now(), helper: null, offers: new Map(), gone: new Set(), ready: false };
        this.req = R; if (host === 'page') this.renderReq(); else this.open();   // retour immédiat à l'écran : le GPS et le réseau se préparent pendant ce temps
        const pos = await S.freshPos();
        if (!pos) { if (this.req === R) { this.req = null; this.close(); } try { AppDialog.alert('Active la localisation pour demander de l\'aide.', { title: 'Position introuvable' }); } catch (e) {} return; }
        if (this.req !== R) return;
        if (!S.cfg.share) S.cfg.share = true;   // demander de l'aide suppose d'être joignable sur le réseau des motards
        R.pos = { lat: pos.lat, lon: pos.lon }; R.kp = await this.ecKey(); R.rk = await this.pubB64(R.kp); R.ready = true;
        if (this.req !== R) return;
        this.sub(this.root() + 'r/' + R.rt);
        this.ensureNet(); this.freshNet(); this.tick();
        if (this.net && this.net.connected) this.publishReq();
    },
    async publishReq() {
        const R = this.req; if (!R || R.helper || !R.ready) return; R.last = Date.now();
        try {
            const a = this.approx(R.pos), m = { t: 'req', id: R.id, rt: R.rt, kd: R.kd, lat: a.lat, lon: a.lon, n: this.myName(), ts: Date.now(), rk: R.rk };
            const msg = await this.pack(m); if (this.req !== R) return;
            this.cellsAround(a.lat, a.lon).forEach(c => this.pub(this.root() + 'c/' + c, msg));
        } catch (e) { console.warn('[Aide] envoi impossible', e); }
    },
    // Relances : le réseau peut ne pas être prêt au moment de l'appui, et les messages ne sont pas conservés par le courtier
    retry() {
        const now = Date.now(), R = this.req;
        if (R && !R.helper && R.offers.size) { let ch = false; R.offers.forEach((o, k) => { if (now - o.seen > 15000) { R.offers.delete(k); ch = true; } }); if (ch) this.renderReq(); }   // un motard qui n'est plus joignable disparaît de la liste
        if (R && R.ready && !R.helper && now - (R.last || 0) > (now - R.t0 < 90000 ? 3500 : 30000)) this.publishReq();
        this.incoming.forEach(r => { if (r.st === 'yes' && r.yesMsg && now - (r.yesAt || 0) > 3500) { r.yesAt = now; this.pub(this.root() + 'r/' + r.rt, r.yesMsg); } });
        if (R && R.helper && !R.helper.ack && now - (R.helper.accAt || 0) > 3500) this.sendAcc();
    },
    async sendAcc() {
        const R = this.req; if (!R || !R.helper) return; R.helper.accAt = Date.now();
        try { const e = await this.enc(R.helper.key, R.pos), msg = await this.pack({ t: 'acc', id: R.id, to: R.helper.krid, ts: Date.now(), iv: e.iv, ct: e.ct }); this.pub(this.root() + 'r/' + R.rt, msg); } catch (e) {}
    },
    // « Hugo t'a dépanné ? » : le demandeur confirme, le dépanneur reçoit son aide (message signé), puis la demande se termine
    async thank() {
        const R = this.req, H = R && R.helper; if (!H || R.thanking) return; R.thanking = true;
        try { this.pub(this.root() + 'r/' + R.rt, await this.pack({ t: 'thx', id: R.id, to: H.krid, ts: Date.now() })); } catch (e) {}
        await new Promise(r => setTimeout(r, 700));
        if (this.req === R) { this.endReq(); this.close(); }
    },
    async endReq(expired) {
        const R = this.req; if (!R) return; this.req = null;
        if (R.ready) { try { const msg = await this.pack({ t: 'end', id: R.id, ts: Date.now() }); this.pub(this.root() + 'r/' + R.rt, msg); } catch (e) {} }
        this.unsub(this.root() + 'r/' + R.rt);
        this.renderPage(); if (expired) this.renderReq();
    },
    async onYes(m, krid) {
        const R = this.req; if (!R || R.helper || m.id !== R.id || R.gone.has(krid)) return;
        if (!this.okB64(m.ek, 120) || !this.okB64(m.iv, 40) || !this.okB64(m.ct, 200)) return;
        let key; try { key = await this.shared(R.kp.privateKey, m.ek); } catch (e) { return; }
        const pos = await this.dec(key, m.iv, m.ct); if (!pos || this.req !== R || R.helper) return;
        const fresh = !R.offers.has(krid);
        R.offers.set(krid, { krid, name: String(m.n || 'Un motard').slice(0, 40), key, pos, seen: Date.now() });
        if (fresh) { if (!this.pageVisible()) this.open(); this.alertUser(); }   // la fenêtre se rouvre d'elle-même, même si elle avait été réduite
        this.renderReq();
    },
    // Le demandeur choisit : seul ce motard reçoit la position exacte
    accept(krid) {
        const R = this.req, o = R && R.offers.get(krid); if (!o || R.helper) return;
        R.helper = Object.assign({ ts: Date.now() }, o); R.offers.clear();
        this.sendAcc(); this.renderReq(); this.sendPos();
    },

    // ---------- celui qui reçoit ----------
    async onNet(topic, payload) {
        if (!this.S().cfg.share && !this.req && !this.help) return;
        let m; try { m = JSON.parse(payload); } catch (e) { return; }
        if (!m || typeof m !== 'object' || !this.FIELDS[m.t] || !this.okId(m.id) || !this.freshTs(m.ts)) return;
        if (m.t === 'req' ? !topic.startsWith(this.root() + 'c/') : !topic.startsWith(this.root() + 'r/')) return;
        const krid = await this.check(m); if (!krid || krid === ModuleCommunity.state.myId) return;
        if (m.t === 'req') return this.onReq(m, krid);
        if (m.t === 'yes') return this.onYes(m, krid);
        const r = this.incoming.get(m.id), R = this.req;
        if (m.t === 'acc') {   // chez les motards qui ont répondu : le demandeur a choisi
            if (!r || r.krid !== krid || r.st !== 'yes') return;
            if (m.to !== ModuleCommunity.state.myId) { r.st = 'lost'; this.showCard(r); setTimeout(() => this.dropIncoming(r.id), 6000); return; }
            if (!this.okB64(m.iv, 40) || !this.okB64(m.ct, 200)) return;
            const pos = await this.dec(r.key, m.iv, m.ct); if (!pos) return;
            r.st = 'go'; r.target = pos; r.seen = Date.now(); this.pend.set(r.id, { rt: r.rt, krid: r.krid, kd: r.kd, t: Date.now() }); this.beginHelp(r); return;
        }
        if (m.t === 'thx') {   // le demandeur confirme mon aide : seul un motard accepté (pend) le reçoit, une seule fois par demande
            const p = this.pend.get(m.id); if (!p || p.krid !== krid || m.to !== ModuleCommunity.state.myId) return;
            this.pend.delete(m.id); if (!this.incoming.has(m.id)) this.unsub(this.root() + 'r/' + p.rt); if (r) r.thanked = true;
            const o = document.getElementById('aide-map'); if (o && this.help && this.help.id === m.id) this.helpEnded('Aide confirmée, merci !');
            try { ModuleBadges.add({ id: m.id, kd: p.kd, ts: Date.now(), who: krid }); } catch (e) {}
            return;
        }
        if (m.t === 'pos') {
            if (!this.okB64(m.iv, 40) || !this.okB64(m.ct, 200)) return;
            if (R && R.helper && R.helper.krid === krid && m.id === R.id && m.w === 'h') { const p = await this.dec(R.helper.key, m.iv, m.ct); if (p) { R.helper.pos = p; R.helper.ack = true; R.helper.ts = Date.now(); this.renderReq(); } }
            else if (r && r.krid === krid && m.w === 'r') {
                if (m.to !== ModuleCommunity.state.myId) { if (r.st === 'yes') { r.st = 'lost'; this.showCard(r); setTimeout(() => this.dropIncoming(r.id), 6000); } }   // le demandeur travaille avec un autre
                else if (r.st === 'go') { const p = await this.dec(r.key, m.iv, m.ct); if (p) { r.target = p; this.updateHelp(); } }
            }
            return;
        }
        if (m.t === 'end') {
            if (r && r.krid === krid) { const was = r.st, th = r.thanked; this.dropIncoming(r.id); if (was === 'go' && !th) this.helpEnded('La demande est annulée.'); }
            else if (R && R.helper && R.helper.krid === krid && m.id === R.id) { R.helper = null; R.gone.add(krid); this.renderReq(); this.publishReq(); }   // le motard accepté se désiste : on relance
            else if (R && m.id === R.id && R.offers.has(krid)) { R.offers.delete(krid); R.gone.add(krid); this.renderReq(); }                              // un motard qui avait répondu se retire de la liste
        }
    },
    async onReq(m, krid) {
        if (!this.KINDS[m.kd] || !this.okId(m.rt) || !this.okB64(m.rk, 120) || this.incoming.has(m.id) || this.declined.has(m.id)) return;
        const lat = Number(m.lat), lon = Number(m.lon); if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
        const me = this.S().myPos(); if (!me) return;
        const d = this.dist(me, { lat, lon }); if (d > (this.KM + 3) * 1000) return;
        const friend = ModuleCommunity.isFriend(krid);
        if (this.incoming.size >= this.MAX_IN) {
            const old = friend ? [...this.incoming.values()].filter(x => !x.friend && x.st === 'new').sort((a, b) => a.seen - b.seen)[0] : null;
            if (!old) return; this.dropIncoming(old.id);
        }
        const r = { id: m.id, rt: m.rt, kd: m.kd, rk: m.rk, lat, lon, d, name: String(m.n || 'Un motard').slice(0, 40), krid, friend, seen: Date.now(), st: 'new' };
        this.incoming.set(r.id, r); this.showCard(r); this.alertUser();
    },
    alertUser() {
        try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {}
        try { if (typeof ModuleQuick !== 'undefined' && ModuleQuick.beep) ModuleQuick.beep(); } catch (e) {}
    },
    zone(r) {   // carré d'incertitude (≈ 2 km) en polygone
        const g = this.APPROX / 2, y = r.lat, x = r.lon;
        return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[x - g, y - g], [x + g, y - g], [x + g, y + g], [x - g, y + g], [x - g, y - g]]] } };
    },
    showCard(r) {
        let box = document.getElementById('aide-in'); if (!box) { box = document.createElement('div'); box.id = 'aide-in'; box.className = 'aide-in'; document.body.appendChild(box); }
        const K = this.KINDS[r.kd]; let c = box.querySelector(`[data-id="${r.id}"]`);
        if (!c) { box.querySelectorAll('.aide-card').forEach(x => x.style.display = 'none'); c = document.createElement('div'); c.className = 'aide-card'; c.dataset.id = r.id; box.appendChild(c); }
        const dist = (r.friend ? 'Ami · ' : '') + 'à ≈ ' + this.fmtKm(Math.round(r.d / 1000) * 1000 || r.d);
        const state = r.st === 'yes' ? '<div class="aide-sub">En attente de confirmation…</div>' : r.st === 'lost' ? '<div class="aide-sub">Un autre motard s\'en occupe. Merci !</div>' : '';
        c.innerHTML = `<div class="aide-al"><span>${dist}</span><b>${K.t}</b><em>${K.need}</em></div>
            <div class="aide-mini" id="aide-mini-${r.id}"></div>
            ${r.st === 'new' ? '<button type="button" class="aide-btn" data-a="yes">J\'arrive</button><button type="button" class="aide-btn sec" data-a="no">Ignorer</button>' : state + (r.st === 'yes' ? '<button type="button" class="aide-btn sec" data-a="wd">Annuler ma réponse</button>' : '')}`;
        this.miniMap(r, c.querySelector('.aide-mini'));
        const y = c.querySelector('[data-a="yes"]'), n = c.querySelector('[data-a="no"]');
        if (y) y.onclick = () => this.respond(r);
        if (n) n.onclick = () => { this.declined.add(r.id); this.dropIncoming(r.id); };   // « Ignorer » tient : la demande, renvoyée plusieurs fois, ne ré-apparaît pas
        const w = c.querySelector('[data-a="wd"]'); if (w) w.onclick = () => this.withdraw(r);
    },
    miniMap(r, el) {
        try {
            if (typeof maplibregl === 'undefined') { el.style.display = 'none'; return; }
            const m = new maplibregl.Map({ container: el, style: AppTheme.getMapStyleUrl(), center: [r.lon, r.lat], zoom: 10.5, interactive: false, attributionControl: false });
            r.mini = m;
            m.on('load', () => {
                m.addSource('z', { type: 'geojson', data: this.zone(r) });
                m.addLayer({ id: 'z-f', type: 'fill', source: 'z', paint: { 'fill-color': '#ff453a', 'fill-opacity': 0.22 } });
                m.addLayer({ id: 'z-l', type: 'line', source: 'z', paint: { 'line-color': '#ff453a', 'line-width': 2, 'line-dasharray': [2, 2] } });
            });
        } catch (e) { el.style.display = 'none'; }
    },
    dropIncoming(id) {
        const r = this.incoming.get(id); if (!r) return;
        if (r.mini) { try { r.mini.remove(); } catch (e) {} }
        this.incoming.delete(id); if (r.st !== 'new' && !this.pend.has(id)) this.unsub(this.root() + 'r/' + r.rt);
        const box = document.getElementById('aide-in'); if (box) { const c = box.querySelector(`[data-id="${id}"]`); if (c) c.remove(); const left = box.querySelector('.aide-card'); if (left) left.style.display = ''; else box.remove(); }
    },
    async respond(r) {
        if (r.st !== 'new') return;
        r.st = 'yes'; r.seen = Date.now(); this.showCard(r);   // retour immédiat : « en attente de confirmation »
        const back = (txt) => { r.st = 'new'; this.showCard(r); if (txt) { try { AppDialog.alert(txt, { title: 'Réponse impossible' }); } catch (e) {} } };
        const pos = await this.S().freshPos();
        if (!pos) return back('Active la localisation pour répondre.');
        try {
            const kp = await this.ecKey(), key = await this.shared(kp.privateKey, r.rk), e = await this.enc(key, { lat: pos.lat, lon: pos.lon });
            const msg = await this.pack({ t: 'yes', id: r.id, n: this.myName(), ts: Date.now(), ek: await this.pubB64(kp), iv: e.iv, ct: e.ct });
            if (this.incoming.get(r.id) !== r || r.st !== 'yes') return;
            r.key = key; r.yesMsg = msg; r.yesAt = Date.now(); this.sub(this.root() + 'r/' + r.rt); this.ensureNet(); this.freshNet();
            this.pub(this.root() + 'r/' + r.rt, msg);
        } catch (e) { console.warn('[Aide] réponse impossible', e); back('La réponse n\'a pas pu être envoyée. Réessaie.'); }
    },

    // ---------- carte du motard qui vient ----------
    beginHelp(r) {
        const box = document.getElementById('aide-in'); if (box) box.remove(); if (r.mini) { try { r.mini.remove(); } catch (e) {} r.mini = null; }
        this.help = r; this.helpMe = this.S().myPos();
        const o = document.createElement('div'); o.id = 'aide-map'; o.className = 'aide-map'; o.innerHTML = `<div id="aide-mp"></div>
            <div class="aide-top"><b>${this.KINDS[r.kd].t}</b><span>${this.esc(r.name)} · position exacte</span></div>
            <div class="aide-bot"><div class="aide-eta"><b id="aide-eta">…</b><span id="aide-km"></span></div>
            <div class="aide-row"><button type="button" class="aide-btn" id="aide-go">Y aller</button><button type="button" class="aide-btn sec" id="aide-no">Annuler</button></div></div>`;
        document.body.appendChild(o);
        o.querySelector('#aide-go').onclick = () => { const t = this.help && this.help.target; this.closeHelp(true); if (t) { AppManager.switchView('view-gps'); const b = document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]'); if (b) b.click(); setTimeout(() => ModuleGPS.navigateToPOI('Motard en panne', t.lat, t.lon), 200); } };
        o.querySelector('#aide-no').onclick = () => this.cancelHelp();
        try {
            if (typeof maplibregl !== 'undefined') {
                const tg = r.target, mp = new maplibregl.Map({ container: 'aide-mp', style: AppTheme.getMapStyleUrl(), center: [tg.lon, tg.lat], zoom: 13, attributionControl: false });
                r.map = mp;
                const dot = (c, s) => { const e = document.createElement('div'); e.style.cssText = `width:${s}px;height:${s}px;border-radius:50%;background:${c};border:3px solid #1c1c1e`; return e; };
                r.mkT = new maplibregl.Marker({ element: dot('#ff453a', 24) }).setLngLat([tg.lon, tg.lat]).addTo(mp);
                if (this.helpMe) r.mkM = new maplibregl.Marker({ element: dot('#0a84ff', 20) }).setLngLat([this.helpMe.lon, this.helpMe.lat]).addTo(mp);
                mp.on('load', () => { mp.addSource('ln', { type: 'geojson', data: this.lineData() }); mp.addLayer({ id: 'ln', type: 'line', source: 'ln', paint: { 'line-color': '#0a84ff', 'line-width': 5, 'line-dasharray': [1, 1.5] } }); this.fitHelp(); });
            }
        } catch (e) {}
        this.updateHelp();
    },
    lineData() { const r = this.help, me = this.helpMe; return { type: 'Feature', geometry: { type: 'LineString', coordinates: (r && r.target && me) ? [[me.lon, me.lat], [r.target.lon, r.target.lat]] : [] } }; },
    fitHelp() { const r = this.help; if (!r || !r.map || !r.target) return; try { const b = new maplibregl.LngLatBounds(); b.extend([r.target.lon, r.target.lat]); if (this.helpMe) b.extend([this.helpMe.lon, this.helpMe.lat]); r.map.fitBounds(b, { padding: { top: 110, bottom: 200, left: 50, right: 50 }, maxZoom: 15, duration: 400 }); } catch (e) {} },
    updateHelp() {
        const r = this.help; if (!r) return; this.helpMe = this.S().myPos() || this.helpMe;
        const d = (this.helpMe && r.target) ? this.dist(this.helpMe, r.target) : null;
        const e = document.getElementById('aide-eta'), k = document.getElementById('aide-km');
        if (e) e.textContent = d != null ? (d < 60 ? 'Sur place' : this.eta(d) + ' min') : '…'; if (k) k.textContent = d != null ? '≈ ' + this.fmtKm(d) : '';
        if (r.map) { try { if (r.mkT && r.target) r.mkT.setLngLat([r.target.lon, r.target.lat]); if (r.mkM && this.helpMe) r.mkM.setLngLat([this.helpMe.lon, this.helpMe.lat]); const s = r.map.getSource('ln'); if (s) { s.setData(this.lineData()); } } catch (e2) {} }
    },
    // Le motard qui avait dit « J'arrive » se retire (avant ou après le choix du demandeur)
    async withdraw(r) {
        this.declined.add(r.id);
        try { this.pub(this.root() + 'r/' + r.rt, await this.pack({ t: 'end', id: r.id, ts: Date.now() })); } catch (e) {}
        if (this.help === r) this.closeHelp(); else this.dropIncoming(r.id);
    },
    async cancelHelp() {
        const r = this.help; if (!r) return; this.declined.add(r.id);
        try { this.pub(this.root() + 'r/' + r.rt, await this.pack({ t: 'end', id: r.id, ts: Date.now() })); } catch (e) {}
        this.closeHelp();
    },
    closeHelp(keep) {
        const r = this.help; this.help = null;
        if (r) { if (r.map) { try { r.map.remove(); } catch (e) {} } if (!keep) this.dropIncoming(r.id); else { this.incoming.delete(r.id); if (!this.pend.has(r.id)) this.unsub(this.root() + 'r/' + r.rt); } }
        const o = document.getElementById('aide-map'); if (o) o.remove();
    },
    helpEnded(txt) {
        const o = document.getElementById('aide-map'); if (!o) return;
        const bot = o.querySelector('.aide-bot'); if (bot) bot.innerHTML = `<div class="aide-eta"><b style="font-size:20px">${this.esc(txt)}</b></div><button type="button" class="aide-btn" id="aide-ok">Fermer</button>`;
        const b = o.querySelector('#aide-ok'); if (b) b.onclick = () => this.closeHelp();
    },
    // position de chacun toutes les 10 s, chiffrée, une fois la mise en relation faite
    async sendPos() {
        try {
            const R = this.req, H = this.help, S = this.S();
            if (R && R.helper) {
                R.pos = (await S.freshPos()) || R.pos; const e = await this.enc(R.helper.key, R.pos);
                this.pub(this.root() + 'r/' + R.rt, await this.pack({ t: 'pos', id: R.id, w: 'r', ts: Date.now(), to: R.helper.krid, iv: e.iv, ct: e.ct }));
            }
            if (H && H.st === 'go' && H.key) { const p = (await S.freshPos()) || this.helpMe; if (p) { const e = await this.enc(H.key, { lat: p.lat, lon: p.lon }); this.pub(this.root() + 'r/' + H.rt, await this.pack({ t: 'pos', id: H.id, w: 'h', ts: Date.now(), to: H.krid, iv: e.iv, ct: e.ct })); } this.updateHelp(); }
        } catch (e) {}
    }
};
ModuleAide.init();
