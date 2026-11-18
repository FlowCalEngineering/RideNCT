// Canaux privés : accès contrôlé.
// - Un canal a un identifiant PUBLIC (annoncé aux motards proches) et un code à 4 chiffres SECRET qui ne circule jamais en clair.
// - Pour entrer : preuve du code (HMAC) envoyée en direct, sur la liaison chiffrée, à un membre qui la vérifie.
// - Un membre n'accepte la voix, la musique et les messages que des motards qu'il a admis (code juste ou invitation d'un membre).
// - Protection contre l'essai de tous les codes : 3 essais par motard et 5 échecs au total pour un canal => canal verrouillé 10 min.
// Étend ModuleIntercom : ce fichier doit être chargé APRÈS intercom/groupe/canaux.js.
Object.assign(ModuleIntercom, {
    KNOCK_MAX_RID: 3, KNOCK_MAX_ALL: 5, KNOCK_WINDOW: 10 * 60 * 1000, ALLOW_MAX: 40,

    // Nouveau canal : identifiant public aléatoire + code secret à 4 chiffres
    generateNewCode() {
        const r = crypto.getRandomValues(new Uint32Array(1))[0];
        this.state.currentCode = 'c' + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, '0')).join('');
        this.state.roomPin = String(1000 + (r % 9000));
        this.resetAccess();
    },
    resetAccess() { this.state.roomAllowed = new Set(); this.state.knock = { tries: new Map(), fails: [], lockUntil: 0 }; },

    // Ce motard fait-il partie de MON canal ? (même canal annoncé, et admis si le canal est privé)
    sameRoom(peer) {
        const s = this.state;
        if (!peer || !s.isConnected || s.currentCode == null || peer.roomCode == null) return false;
        if (String(peer.roomCode) !== String(s.currentCode)) return false;
        return !s.isPrivateRoom || !!(peer.auth && s.roomAllowed && s.roomAllowed.has(peer.rid));
    },
    // Un message « intercom_join » de ce motard doit-il être pris en compte ?
    mayJoin(peer, roomCode) {
        const s = this.state;
        if (!s.isConnected || String(s.currentCode) !== String(roomCode)) return true;   // pas mon canal : simple annonce
        if (!s.isPrivateRoom) return true;
        return !!(peer.auth && s.roomAllowed && s.roomAllowed.has(peer.rid));
    },
    cleanRids(a) { return (Array.isArray(a) ? a : []).filter(x => typeof x === 'string' && /^[a-f0-9]{16}$/.test(x)).slice(0, this.ALLOW_MAX); },
    // Admet un motard dans mon canal et prévient les autres membres
    grant(rid, exceptSid) {
        const s = this.state, C = ModuleCommunity;
        if (!s.isConnected || !s.isPrivateRoom || !/^[a-f0-9]{16}$/.test(rid || '')) return;
        if (s.roomAllowed.has(rid)) return;
        if (s.roomAllowed.size >= this.ALLOW_MAX) return;
        s.roomAllowed.add(rid);
        C.state.peers.forEach(p => { if (p.sid !== exceptSid && p.rid !== rid && this.sameRoom(p)) C.sendTo(p, { type: 'intercom_allow', roomCode: s.currentCode, rids: [rid] }); });
        C.refreshAudioRouting();
    },

    async knockMac(pin, roomCode, myRid, theirRid) {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('vroom-knock|' + roomCode + '|' + myRid + '|' + theirRid));
        return ModuleCommunity.b64(sig);
    },

    // --- côté candidat : demander à entrer dans un canal privé vu à proximité ---
    async requestJoin(roomName, roomCode, pin) {
        const C = ModuleCommunity, id = C.cleanCode(roomCode);
        pin = String(pin == null ? '' : pin);
        if (!/^\d{4}$/.test(pin)) return { ok: false, msg: 'Code à 4 chiffres requis.' };
        if (this._pj) return { ok: false, msg: 'Une demande est déjà en cours.' };
        const targets = [...C.state.peers.values()].filter(p => p.auth && p.rid && p.dc && p.dc.readyState === 'open' && String(p.roomCode) === id);
        if (!id || !targets.length) return { ok: false, msg: 'Aucun membre de ce canal à portée.' };
        return new Promise(resolve => {
            const pj = this._pj = { id, pin, roomName: C.cleanText(roomName, 40) || 'Groupe' };
            const finish = (r) => { if (this._pj !== pj) return; clearTimeout(pj.t); this._pj = null; resolve(r); };
            pj.finish = finish; pj.t = setTimeout(() => finish({ ok: false, msg: 'Aucune réponse du canal. Réessaie.' }), 8000);
            targets.forEach(async p => {
                try { const mac = await this.knockMac(pin, id, C.state.myId, p.rid); C.sendTo(p, { type: 'intercom_knock', roomCode: id, mac }); } catch (e) {}
            });
        });
    },
    onAdmit(peer, m) {
        const pj = this._pj; if (!pj || !peer.auth || m.roomCode !== pj.id || String(peer.roomCode) !== pj.id) return;
        const allowed = [peer.rid].concat(this.cleanRids(m.members).filter(x => x !== ModuleCommunity.state.myId));
        pj.finish({ ok: true });
        this.connectToRoom(pj.roomName, 'Invité', pj.id, true, { pin: pj.pin, allowed });
    },
    onDeny(peer, m) {
        const pj = this._pj; if (!pj || !peer.auth || m.roomCode !== pj.id) return;
        pj.finish({ ok: false, msg: m.why === 'locked' ? 'Ce canal est verrouillé après trop d\'essais. Demande une invitation à un membre.' : 'Code incorrect.' });
    },

    // --- côté membre : vérifier la preuve d'un candidat ---
    async onKnock(peer, m) {
        const s = this.state, C = ModuleCommunity;
        if (!peer.auth || !s.isConnected || !s.isPrivateRoom || !s.roomPin || String(m.roomCode) !== String(s.currentCode) || typeof m.mac !== 'string' || m.mac.length > 100) return;
        const reply = (obj) => C.sendTo(peer, Object.assign({ roomCode: s.currentCode }, obj));
        if (s.roomAllowed.has(peer.rid)) { reply({ type: 'intercom_admit', members: [...s.roomAllowed].filter(x => x !== peer.rid).concat([C.state.myId]).slice(0, this.ALLOW_MAX) }); return; }
        const k = s.knock, now = Date.now();
        k.fails = k.fails.filter(t => now - t < this.KNOCK_WINDOW);
        if (k.lockUntil > now || k.fails.length >= this.KNOCK_MAX_ALL) { if (k.lockUntil <= now) k.lockUntil = now + this.KNOCK_WINDOW; reply({ type: 'intercom_deny', why: 'locked' }); return; }
        const tr = k.tries.get(peer.rid) || { n: 0, t: now };
        if (now - tr.t > this.KNOCK_WINDOW) { tr.n = 0; tr.t = now; }
        if (tr.n >= this.KNOCK_MAX_RID) { reply({ type: 'intercom_deny', why: 'locked' }); return; }
        let good = false;
        try { good = (await this.knockMac(s.roomPin, s.currentCode, peer.rid, C.state.myId)) === m.mac; } catch (e) {}
        if (!s.isConnected || String(m.roomCode) !== String(s.currentCode)) return;
        if (!good) {
            tr.n++; k.tries.set(peer.rid, tr); if (k.tries.size > 60) k.tries.delete(k.tries.keys().next().value);
            k.fails.push(now); if (k.fails.length >= this.KNOCK_MAX_ALL) k.lockUntil = now + this.KNOCK_WINDOW;
            reply({ type: 'intercom_deny', why: 'bad' }); return;
        }
        k.tries.delete(peer.rid);
        const others = [...s.roomAllowed];
        this.grant(peer.rid, peer.sid);
        reply({ type: 'intercom_admit', members: others.concat([C.state.myId]).slice(0, this.ALLOW_MAX) });
    },
    // Un motard admis vient d'entrer : on lui dit qui est déjà admis (il ne connaît que celui qui l'a invité)
    shareMembers(peer) {
        const s = this.state; if (!s.isConnected || !s.isPrivateRoom || !s.roomAllowed.has(peer.rid)) return;
        const rids = [...s.roomAllowed].filter(x => x !== peer.rid).concat([ModuleCommunity.state.myId]).slice(0, this.ALLOW_MAX);
        ModuleCommunity.sendTo(peer, { type: 'intercom_allow', roomCode: s.currentCode, rids });
    },
    // Un membre m'annonce un motard qu'il a admis
    onAllow(peer, m) {
        const s = this.state;
        if (!peer.auth || !s.isConnected || !s.isPrivateRoom || String(m.roomCode) !== String(s.currentCode) || !s.roomAllowed.has(peer.rid)) return;
        this.cleanRids(m.rids).forEach(r => { if (r !== ModuleCommunity.state.myId && s.roomAllowed.size < this.ALLOW_MAX) s.roomAllowed.add(r); });
        ModuleCommunity.refreshAudioRouting();
    },
});
