// P2P identité : clé de signature propre à chaque téléphone + poignée de main signée à l'ouverture de chaque liaison.
// Le « rid » d'un motard est l'empreinte de sa clé publique : on ne peut pas le revendiquer sans détenir la clé.
// La signature porte sur les empreintes DTLS des deux côtés de la liaison : un intermédiaire ne peut ni rejouer ni relayer un « hello ».
// Étend ModuleCommunity : ce fichier doit être chargé APRÈS p2p/securite.js.
Object.assign(ModuleCommunity, {
    ID_VERSION: 2,
    hex(buf) { return Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2, '0')).join(''); },
    b64uBytes(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },
    async ridOfPub(rawBytes) { return this.hex(await crypto.subtle.digest('SHA-256', rawBytes)).slice(0, 16); },
    // Charge (ou crée une fois pour toutes) la paire de clés ECDSA du téléphone. Le jeton est conservé dans le stockage local,
    // donc inclus dans la sauvegarde : restaurer sur un nouveau téléphone garde la même identité.
    async initIdentity() {
        const algo = { name: 'ECDSA', namedCurve: 'P-256' };
        let jwk = null;
        try { const j = JSON.parse(localStorage.getItem('motoapp_id_key') || 'null'); if (j && j.kty === 'EC' && j.crv === 'P-256' && j.d && j.x && j.y) jwk = { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d }; } catch (e) {}
        let priv = null;
        if (jwk) { try { priv = await crypto.subtle.importKey('jwk', jwk, algo, false, ['sign']); } catch (e) { jwk = null; } }
        if (!priv) {
            const kp = await crypto.subtle.generateKey(algo, true, ['sign', 'verify']);
            const j = await crypto.subtle.exportKey('jwk', kp.privateKey);
            jwk = { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d };
            try { localStorage.setItem('motoapp_id_key', JSON.stringify(jwk)); } catch (e) { console.warn('[Identité] stockage plein : identité valable pour cette session seulement'); }
            priv = await crypto.subtle.importKey('jwk', jwk, algo, false, ['sign']);
        }
        const raw = new Uint8Array(65); raw[0] = 4; raw.set(this.b64uBytes(jwk.x), 1); raw.set(this.b64uBytes(jwk.y), 33);
        this.state.idPriv = priv; this.state.idPub = this.b64(raw);
        this.state.myId = await this.ridOfPub(raw);
        try { localStorage.setItem('motoapp_rider_id2', this.state.myId); } catch (e) {}
        return this.state.myId;
    },
    // Signature d'un texte avec la clé d'identité (alertes SOS, etc.)
    async signText(str) {
        if (this.state.idReady) await this.state.idReady;
        if (!this.state.idPriv) throw new Error('pas d\'identité');
        return this.b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.state.idPriv, new TextEncoder().encode(str)));
    },
    // Vérifie une signature ; renvoie l'identifiant (rid) du signataire ou null
    async verifyText(pubB64, sigB64, str) {
        try {
            if (typeof pubB64 !== 'string' || typeof sigB64 !== 'string' || pubB64.length > 120 || sigB64.length > 120) return null;
            const raw = this.unb64(pubB64); if (raw.length !== 65 || raw[0] !== 4) return null;
            const key = await crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, this.unb64(sigB64), new TextEncoder().encode(str))) return null;
            return await this.ridOfPub(raw);
        } catch (e) { return null; }
    },
    fpOf(sdp) { const m = /a=fingerprint:\s*sha-256\s+([0-9A-Fa-f:]+)/i.exec(sdp || ''); return m ? m[1].toUpperCase() : null; },
    // Texte signé : les empreintes DTLS des deux extrémités, triées (identique des deux côtés, différent à chaque liaison)
    transcript(peer) {
        const l = this.fpOf(peer.pc.localDescription && peer.pc.localDescription.sdp), r = this.fpOf(peer.pc.remoteDescription && peer.pc.remoteDescription.sdp);
        if (!l || !r) return null;
        return new TextEncoder().encode('vroom-hello-v' + this.ID_VERSION + '|' + [l, r].sort().join('|'));
    },
    // Les descriptions SDP sont posées juste avant l'ouverture du canal : quelques essais rapprochés évitent un faux échec
    async getTranscript(peer) {
        for (let i = 0; i < 6; i++) {
            const t = this.transcript(peer); if (t) return t;
            await new Promise(r => setTimeout(r, 250));
            if (this.state.peers.get(peer.sid) !== peer) return null;
        }
        return null;
    },
    async sendHello(peer, noRetry) {
        // Le « hello » peut se perdre au tout début de la liaison : on le renvoie quelques fois tant que l'autre ne s'est pas présenté
        if (!noRetry) { peer.helloTries = (peer.helloTries || 0) + 1; if (peer.helloTries < 5) peer.helloRetryT = setTimeout(() => { if (!peer.auth && this.state.peers.get(peer.sid) === peer) this.sendHello(peer); }, 2000); }
        try {
            const t = await this.getTranscript(peer); if (!t || !this.state.idPriv) throw new Error('pas de transcription');
            const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.state.idPriv, t);
            if (this.state.peers.get(peer.sid) !== peer) return;
            this.sendTo(peer, { type: 'hello', v: this.ID_VERSION, pub: this.state.idPub, sig: this.b64(sig), legacy: this.state.legacyId || null });
        } catch (e) { this.closePeer(peer.sid, this.keepOut()); }
    },
    async onHello(peer, m) {
        if (peer.auth) {   // il se représente : sa première présentation ne m'est peut-être pas parvenue
            if ((peer.helloReplies || 0) < 3 && peer.dc && peer.dc.readyState === 'open') { peer.helloReplies = (peer.helloReplies || 0) + 1; this.sendHello(peer, true); }
            return;
        }
        if (peer.helloBusy) return;
        peer.helloBusy = true;
        try {
            if (m.v !== this.ID_VERSION || typeof m.pub !== 'string' || typeof m.sig !== 'string' || m.pub.length > 120 || m.sig.length > 120) throw new Error('hello invalide');
            const raw = this.unb64(m.pub); if (raw.length !== 65 || raw[0] !== 4) throw new Error('clé invalide');
            const t = await this.getTranscript(peer); if (!t) throw new Error('pas de transcription');
            const key = await crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, this.unb64(m.sig), t)) throw new Error('signature fausse');
            const rid = await this.ridOfPub(raw);
            if (rid === this.state.myId) throw new Error('soi-même');
            if (this.state.peers.get(peer.sid) !== peer) return;
            peer.rid = rid; peer.pubId = m.pub; peer.auth = true; clearTimeout(peer.helloT); clearTimeout(peer.helloRetryT);
            this.migrateLegacyFriend(rid, m);
        } catch (e) {
            console.warn('[Identité] liaison refusée :', e && e.message);
            peer.helloBusy = false;
            if (this.state.peers.get(peer.sid) === peer) this.closePeer(peer.sid, 60000);
            return;
        }
        // Motard bloqué (ou signalé) par l'utilisateur : liaison coupée avant tout échange, il ne reçoit même pas notre présentation
        if (this.isBlocked && this.isBlocked(peer.rid)) { this.closePeer(peer.sid, 3600000); return; }
        // Mode Amis : un inconnu n'est gardé que pour la voix (canal / Mode Rencontre), sans position ni profil
        if (this.state.radarMode === 'friends' && !this.isFriend(peer.rid) && !this.inVoice()) { this.closePeer(peer.sid, 3600000); return; }
        peer.helloReplies = 1; this.sendHello(peer, true);   // je réponds une fois par ma propre présentation (au cas où la mienne ne serait pas arrivée)
        this.afterAuth(peer);
        const q = peer.pendingQ || []; peer.pendingQ = null;
        q.forEach(raw => { peer.rl = null; this.onPeerData(peer, raw); });
    },
    // Ouverture de liaison faite et identité prouvée : on peut maintenant échanger position, canal vocal, etc.
    afterAuth(peer) {
        peer.lastMsg = Date.now();
        this.sendPos(true, peer);
        if (typeof ModuleIntercom !== 'undefined') {
            const myName = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.name : 'Un motard';
            const myAvatar = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.avatar : null;
            if (ModuleIntercom.state.isConnected) {
                this.sendTo(peer, {
                    type: 'intercom_join', roomName: ModuleIntercom.state.currentRoomName, roomCode: ModuleIntercom.state.currentCode,
                    isPrivate: ModuleIntercom.state.isPrivateRoom, senderName: myName, avatarSrc: myAvatar, rid: this.state.myId, isSyncReply: true
                });
            }
            if (ModuleIntercom.state.autoModeActive) this.sendTo(peer, { type: 'intercom_auto', active: true, rid: this.state.myId });
        }
    },
    // Confiance au premier contact : un ami déjà enregistré sous son ancien identifiant (aléatoire, non signé) est rattaché à sa nouvelle clé
    migrateLegacyFriend(rid, m) {
        const lg = (typeof m.legacy === 'string' && /^[a-f0-9]{6,24}$/.test(m.legacy)) ? m.legacy : null;
        if (!lg || lg === rid) return;
        let changed = false;
        const f = this.state.friends.find(x => x.id === lg && !x.pub);
        if (f && !this.state.friends.some(x => x.id === rid)) {
            f.id = rid; f.pub = m.pub; changed = true;
            const p = this.state.profiles.get(lg); if (p) { this.state.profiles.delete(lg); p.id = rid; this.state.profiles.set(rid, p); }
            if (f.profile) f.profile.id = rid;
        }
        const rq = this.state.friendReqs.find(x => x.id === lg);
        if (rq && !this.state.friendReqs.some(x => x.id === rid)) { rq.id = rid; if (rq.profile) rq.profile.id = rid; changed = true; }
        ['sentRequests', 'pendingRequests', 'pendingAccepts', 'pendingRemovals'].forEach(k => {
            const a = this.state[k]; if (Array.isArray(a) && a.includes(lg)) { this.state[k] = a.map(x => x === lg ? rid : x); changed = true; }
        });
        if (changed) { this.saveFriendsData(); this.showNotification('Ami retrouvé', 'Un ami a mis à jour son application : identité sécurisée.', ''); }
    },
});
