/* Intercom sans serveur : messages rapides, qualité de liaison par motard, alerte d'arrêt prolongé.
   Tout passe par les liaisons directes entre téléphones (WebRTC) déjà utilisées pour la voix : rien de plus à héberger.
   Un message rapide n'envoie qu'un code ; le texte vient de la table locale (aucun texte libre reçu, donc rien à filtrer). */
const ModuleQuick = {
    KEY: 'moto_qm_cfg',
    cfg: { voice: true, stop: 5, lost: true },
    track: new Map(),
    last: new Map(),
    ic: {
        pause: '<path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
        fuel: '<path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M3 22h12M15 10h2a2 2 0 0 1 2 2v5a2 2 0 0 0 4 0V9l-3-3"/><path d="M6 8h6"/>',
        warn: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
        slip: '<path d="M3 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 11c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
        slow: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
        go: '<polygon points="6 4 20 12 6 20 6 4"/>',
        ask: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
        ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
        uturn: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
        puncture: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
        nofuel: '<path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M3 22h12M15 10h2a2 2 0 0 1 2 2v5a2 2 0 0 0 4 0V9l-3-3"/><path d="M6 8h6M4 4l16 16"/>',
        crash: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
        bars: '<path d="M4 20v-4M10 20v-8M16 20V8M22 20V4"/>'
    },
    MSG: [
        { k: 'puncture', t: 'Crevaison', ic: 'puncture', al: 1 }, { k: 'nofuel', t: "Panne d'essence", ic: 'nofuel', al: 1 },
        { k: 'danger', t: 'Danger devant !', ic: 'warn', al: 1 }, { k: 'crash', t: 'Accident', ic: 'crash', al: 1 },
        { k: 'help', t: "J'ai besoin d'aide", ic: 'help', al: 1 },
        { k: 'pause', t: 'On fait une pause ?', ic: 'pause' }, { k: 'fuel', t: 'Je dois faire le plein', ic: 'fuel' },
        { k: 'slip', t: 'Route glissante', ic: 'slip' }, { k: 'slow', t: 'Je ralentis', ic: 'slow' },
        { k: 'go', t: 'On repart', ic: 'go' }, { k: 'uturn', t: 'Demi-tour', ic: 'uturn' },
        { k: 'askok', t: 'Tout va bien ?', ic: 'ask' }, { k: 'ok', t: 'Tout va bien', ic: 'ok' }
    ],
    $(id) { return document.getElementById(id); },
    svg(k, c) { return `<svg viewBox="0 0 24 24" fill="none" stroke="${c || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${this.ic[k] || ''}</svg>`; },
    loadCfg() { try { const c = JSON.parse(localStorage.getItem(this.KEY) || '{}'); if (typeof c.voice === 'boolean') this.cfg.voice = c.voice; if ([0, 3, 5, 10].includes(c.stop)) this.cfg.stop = c.stop; if (typeof c.lost === 'boolean') this.cfg.lost = c.lost; } catch (e) {} },
    saveCfg() { try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch (e) {} },

    /* Motards à qui je parle : même canal, ou Mode Rencontre actif des deux côtés (même règle que la voix) */
    targets() {
        const C = typeof ModuleCommunity !== 'undefined' ? ModuleCommunity : null, I = typeof ModuleIntercom !== 'undefined' ? ModuleIntercom.state : null;
        if (!C || !I) return [];
        const inRoom = !!(I.isConnected && I.currentCode != null), myAuto = !!I.autoModeActive;
        return Array.from(C.state.peers.values()).filter(p => p.rid && p.dc && p.dc.readyState === 'open' &&
            ((inRoom && ModuleIntercom.sameRoom(p)) || (myAuto && p.autoIntercom)));
    },
    myName() { try { return (ModuleProfile.state.name || 'Un motard').slice(0, 40); } catch (e) { return 'Un motard'; } },
    nameOf(peer, m) {
        try { const r = ModuleCommunity.state.riders.get(peer.rid); if (r && r.name) return r.name; } catch (e) {}
        return String((m && m.n) || 'Un motard').slice(0, 40);
    },
    notify(title, text, icon, color, strong) {
        try { ModuleCommunity.showNotification(title, text, `<svg style="width:26px;height:26px;color:${color || '#ff9f0a'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${this.ic[icon] || this.ic.warn}</svg>`, 6000); } catch (e) {}
        try { if (navigator.vibrate) navigator.vibrate(strong ? [400, 150, 400, 150, 400] : [120, 80, 120]); } catch (e) {}
    },
    /* Bip d'alerte fort, indépendant de la lecture à voix haute */
    beep() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            const c = this._ac || (this._ac = new AC()); if (c.resume) c.resume();
            [0, 0.28, 0.56].forEach(d => { const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 1040; g.gain.value = 0.35; o.connect(g); g.connect(c.destination); const t = c.currentTime + d; o.start(t); o.stop(t + 0.18); });
            this.beeps = (this.beeps || 0) + 1;
        } catch (e) {}
    },
    speak(text) {
        if (!this.cfg.voice) return;
        try { if (!window.speechSynthesis) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {}
    },

    /* ---------- Messages rapides ---------- */
    send(k) {
        const msg = this.MSG.find(x => x.k === k); if (!msg) return false;
        const to = this.targets();
        if (!to.length) { AppDialog.alert("Personne n'est connecté avec toi pour le moment.\nRejoins un canal ou active le Mode Rencontre."); return false; }
        const now = Date.now(); if (now - (this._sentAt || 0) < 1500) return false; this._sentAt = now;
        const m = { type: 'qmsg', rid: ModuleCommunity.state.myId, k, n: this.myName() };
        to.forEach(p => ModuleCommunity.sendTo(p, m));
        return true;
    },
    onData(peer, m) {
        const msg = this.MSG.find(x => x.k === m.k); if (!msg) return;
        if (!this.targets().some(p => p.sid === peer.sid)) return;
        const now = Date.now(); if (now - (this.last.get(peer.rid) || 0) < 1500) return; this.last.set(peer.rid, now);
        const name = this.nameOf(peer, m), urgent = !!msg.al || msg.k === 'slip';
        if (msg.al) this.beep();
        this.notify(name, msg.t, msg.ic, urgent ? '#ff453a' : '#0a84ff', !!msg.al);
        this.speak(`${name} : ${msg.t}`);
    },
    openSheet() {
        const old = this.$('qm-overlay'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'qm-overlay'; ov.className = 'qm-ov';
        const seg = (id, vals, cur) => `<div class="qm-seg" id="${id}">${vals.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
        ov.innerHTML = `<div class="qm-sheet"><div class="qm-head"><h3>Messages rapides</h3><button type="button" class="qm-x" aria-label="Fermer">✕</button></div>
            <div class="qm-sec">Alertes <small>son fort dans les casques</small></div>
            <div class="qm-grid al" data-no-swipe>${this.MSG.filter(m => m.al).map(m => `<button type="button" class="qm-b al${m.k === 'help' ? ' wide' : ''}" data-k="${m.k}"><span class="qm-i">${this.svg(m.ic)}</span><span>${m.t}</span></button>`).join('')}</div>
            <div class="qm-sec">Messages</div>
            <div class="qm-grid" data-no-swipe>${this.MSG.filter(m => !m.al).map(m => `<button type="button" class="qm-b" data-k="${m.k}"><span class="qm-i">${this.svg(m.ic)}</span><span>${m.t}</span></button>`).join('')}</div>
            <button type="button" class="qm-cfg" id="qm-cfg">⚙ Réglages des alertes</button>
            <div class="qm-set" id="qm-set">
                <div class="qm-row"><div><b>Lire à voix haute</b><small>Les messages reçus sont dits dans ton casque.</small></div><button type="button" class="radar-switch ${this.cfg.voice ? 'on' : ''}" id="qm-voice" aria-label="Lire à voix haute"></button></div>
                <div class="qm-row col"><div><b>Alerte si un motard s'arrête</b><small>Quand quelqu'un du groupe reste à l'arrêt et que tu t'éloignes.</small></div>${seg('qm-stop', [[0, 'Non'], [3, '3 min'], [5, '5 min'], [10, '10 min']], this.cfg.stop)}</div>
                <div class="qm-row"><div><b>Alerte si un motard ne répond plus</b><small>Perte de signal avec quelqu'un du groupe.</small></div><button type="button" class="radar-switch ${this.cfg.lost ? 'on' : ''}" id="qm-lost" aria-label="Alerte perte de signal"></button></div>
            </div></div>`;
        document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('show'));
        const close = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 200); };
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        ov.querySelector('.qm-x').addEventListener('click', close);
        ov.querySelectorAll('.qm-b').forEach(b => b.addEventListener('click', () => { if (this.send(b.dataset.k)) { b.classList.add('sent'); setTimeout(close, 450); } }));
        const $o = (id) => ov.querySelector('#' + id);
        $o('qm-cfg').addEventListener('click', (e) => { const st = $o('qm-set'); st.classList.toggle('open'); e.currentTarget.style.display = 'none'; st.scrollIntoView({ block: 'nearest' }); });
        $o('qm-voice').addEventListener('click', (e) => { this.cfg.voice = !this.cfg.voice; e.currentTarget.classList.toggle('on', this.cfg.voice); this.saveCfg(); });
        $o('qm-lost').addEventListener('click', (e) => { this.cfg.lost = !this.cfg.lost; e.currentTarget.classList.toggle('on', this.cfg.lost); this.saveCfg(); });
        $o('qm-stop').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; this.cfg.stop = +b.dataset.v; this.saveCfg(); $o('qm-stop').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
    },

    /* ---------- Qualité de liaison ---------- */
    async measure(peer) {
        let lvl = 0, rtt = null;
        try {
            if (!peer.dc || peer.dc.readyState !== 'open') { peer.q = { lvl: 0, rtt: null }; return; }
            let lost = 0, recv = 0;
            (await peer.pc.getStats()).forEach(s => {
                if (s.type === 'candidate-pair' && (s.nominated || s.state === 'succeeded') && typeof s.currentRoundTripTime === 'number') rtt = s.currentRoundTripTime;
                if (s.type === 'inbound-rtp' && s.kind === 'audio') { lost += s.packetsLost || 0; recv += s.packetsReceived || 0; }
            });
            const prev = peer._qs || { lost, recv }; peer._qs = { lost, recv };
            const dl = Math.max(0, lost - prev.lost), dr = Math.max(0, recv - prev.recv), loss = (dl + dr) > 0 ? dl / (dl + dr) : 0;
            const quiet = Date.now() - (peer.lastMsg || 0);
            lvl = 3;
            if ((rtt != null && rtt > 0.15) || loss > 0.03 || quiet > 15000) lvl = 2;
            if ((rtt != null && rtt > 0.4) || loss > 0.1 || quiet > 40000) lvl = 1;
        } catch (e) { lvl = peer.q ? peer.q.lvl : 0; }
        peer.q = { lvl, rtt };
    },
    bars(l) { const c = l >= 3 ? '#30d158' : l === 2 ? '#ff9f0a' : l === 1 ? '#ff453a' : '#8e8e93'; return `<span class="qm-q" style="--c:${c}" data-l="${l}" title="${['Pas de signal', 'Signal faible', 'Signal moyen', 'Bon signal'][l]}"><i class="${l >= 1 ? 'a' : ''}"></i><i class="${l >= 2 ? 'a' : ''}"></i><i class="${l >= 3 ? 'a' : ''}"></i></span>`; },
    paintBars() {
        const put = (avatar, peer) => {
            if (!avatar) return; const old = avatar.querySelector('.qm-q'); if (old) old.remove();
            avatar.style.position = 'relative'; avatar.insertAdjacentHTML('beforeend', this.bars(peer && peer.q ? peer.q.lvl : 0));
        };
        try {
            const peers = ModuleCommunity.state.peers; const byRid = new Map(); peers.forEach(p => { if (p.rid) byRid.set(p.rid, p); });
            byRid.forEach((p, rid) => put(this.$('audio-avatar-' + rid), p));
            const auto = this.$('intercom-auto-participants');
            if (auto) { const list = Array.from(peers.values()).filter(p => p.autoIntercom && p.rid); auto.querySelectorAll('.participant-card').forEach((card, i) => put(card.firstElementChild, list[i])); }
        } catch (e) {}
    },
    async poll() {
        const to = this.targets();
        if (to.length) { await Promise.all(to.map(p => this.measure(p))); }
        this.paintBars();
        this.watch(to);
    },

    /* ---------- Alerte : motard à l'arrêt trop longtemps / signal perdu ---------- */
    watch(to) {
        const now = Date.now();
        const live = new Set((to || []).map(p => p.rid));
        this.track.forEach((_, rid) => { if (!live.has(rid)) this.track.delete(rid); });
        (to || []).forEach(p => {
            const r = ModuleCommunity.state.riders.get(p.rid); if (!r || !r.seen) return;
            const t = this.track.get(p.rid) || {}; this.track.set(p.rid, t);
            const name = this.nameOf(p), age = now - r.seen;
            // Signal perdu
            if (age > 90000) {
                if (this.cfg.lost && !t.lost) { t.lost = true; this.notify(name, 'ne répond plus (signal perdu)', 'warn', '#ff453a'); this.speak(`${name} ne répond plus`); }
                return;
            }
            t.lost = false;
            // Arrêt prolongé
            if ((Number(r.sp) || 0) < 3) {
                if (!t.stopAt) t.stopAt = r.seen;
                const mins = (now - t.stopAt) / 60000;
                const far = r.dist == null || r.dist > 250;
                if (this.cfg.stop > 0 && mins >= this.cfg.stop && far && !t.stopped) {
                    t.stopped = true;
                    const where = r.dist != null ? ` à ${AppUnits.short(r.dist)}` : '';
                    const txt = `est à l'arrêt depuis ${Math.round(mins)} min${where}`;
                    this.notify(name, txt, 'help', '#ff9f0a'); this.speak(`${name} ${txt}`);
                }
            } else { t.stopAt = 0; t.stopped = false; }
        });
    },
    init() {
        this.loadCfg();
        const b = this.$('ic-qm-btn'); if (b) b.addEventListener('click', () => this.openSheet());
        // Les listes d'avatars sont reconstruites : on remet les indicateurs de signal
        if (typeof ModuleIntercom !== 'undefined') {
            ['renderParticipants', 'renderAutoParticipants'].forEach(fn => {
                const o = ModuleIntercom[fn]; if (typeof o !== 'function' || o._qm) return;
                ModuleIntercom[fn] = function () { const r = o.apply(this, arguments); try { ModuleQuick.paintBars(); } catch (e) {} return r; }; ModuleIntercom[fn]._qm = true;
            });
        }
        setInterval(() => { try { this.poll(); } catch (e) {} }, 4000);
    }
};
ModuleQuick.init();
