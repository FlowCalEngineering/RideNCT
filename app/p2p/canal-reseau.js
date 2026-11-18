// Canal vocal sans limite de distance + liaison qui se rétablit toute seule.
// Les motards d'un même canal se retrouvent par une rubrique propre au canal sur le courtier (rendez-vous seulement :
// la voix passe toujours en direct entre téléphones). Le radar et le Mode Rencontre gardent leur portée (300 m).
// Rubrique d'un canal privé = empreinte de (identifiant public + code secret) : seuls ceux qui connaissent le code la trouvent.
// Étend ModuleCommunity : à charger APRÈS p2p/reconnexion.js.
Object.assign(ModuleCommunity, {
    ROOM_BEACON_EVERY: 20000,
    PING_EVERY: 5000,
    inChannel() { try { const s = ModuleIntercom.state; return !!(s.isConnected && s.currentCode != null); } catch (e) { return false; } },
    async roomTopicOf(code, pin) {
        const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vroom-room|' + String(code) + '|' + String(pin || '')));
        return this.config.topicRoot + '/room/' + this.hex(d).slice(0, 24);
    },
    // Rubriques à suivre : mon canal, et celui que je viens de scanner (QR) pour retrouver ses membres même loin
    async wantedRooms() {
        const out = new Set(); if (this.state.radarMode === 'off') return out;
        try {
            const s = ModuleIntercom.state;
            if (this.inChannel()) out.add(await this.roomTopicOf(s.currentCode, s.isPrivateRoom ? s.roomPin : ''));
            const jp = this.state.joinProbe;
            if (jp && Date.now() < jp.until) out.add(await this.roomTopicOf(jp.id, jp.pin));
            else if (jp) this.state.joinProbe = null;
        } catch (e) {}
        return out;
    },
    async syncRooms(force) {
        const c = this.state.client; if (!c) return;
        const tk = this._syncTk = (this._syncTk || 0) + 1;
        const want = await this.wantedRooms();
        if (tk !== this._syncTk || this.state.client !== c) return;
        const have = this.state.roomTopics || (this.state.roomTopics = new Set());
        [...have].forEach(t => { if (!want.has(t)) { try { c.unsubscribe(t); } catch (e) {} have.delete(t); } });
        let fresh = false; want.forEach(t => { if (!have.has(t)) { try { c.subscribe(t); } catch (e) {} have.add(t); fresh = true; } });
        if (have.size && (force || fresh || Date.now() - (this.state.lastRoomBeacon || 0) >= this.ROOM_BEACON_EVERY)) this.roomBeacon(!!(force || fresh));
    },
    roomBeacon(force, onlyTopic) {
        const c = this.state.client; if (!c || !c.connected || !this.state.roomTopics || !this.state.roomTopics.size) return;
        const now = Date.now();
        if (!onlyTopic && !force && now - (this.state.lastRoomBeacon || 0) < 1000) return;
        if (!onlyTopic) this.state.lastRoomBeacon = now;
        const msg = JSON.stringify({ sid: this.state.sid, pk: this.state.pubB64 });
        this.state.roomTopics.forEach(t => { if (!onlyTopic || t === onlyTopic) { try { c.publish(t, msg, false); } catch (e) {} } });
    },
    // Un membre du canal (n'importe où) se signale : on établit la liaison directe, comme pour une balise de zone
    onRoomBeacon(topic, m) {
        if (!this.state.roomTopics || !this.state.roomTopics.has(topic)) return;
        if (!this.validSid(m.sid) || !this.validPk(m.pk) || m.sid === this.state.sid) return;
        this.state.ignored.delete(m.sid);   // dans un canal on accepte de nouveau un motard écarté avant
        const p = this.state.peers.get(m.sid);
        if (p) { if (!this.peerHealthy(p) && Date.now() - (p.born || 0) > 8000) this.closePeer(m.sid, 0); else return; }
        if (this.state.peers.size >= this.config.maxPeers) return;
        if (this.state.sid < m.sid) this.startPeer(m.sid, m.pk, true);
        else { clearTimeout(this._rbT); this._rbT = setTimeout(() => this.roomBeacon(false, topic), 300); }
    },
    pingPeers() {
        this.state.peers.forEach(p => { if (p.auth && p.dc && p.dc.readyState === 'open') { try { p.dc.send('{"type":"ping"}'); } catch (e) {} } });
    },
});
(function () {
    const C = ModuleCommunity;
    const bm = C.onBrokerMessage;
    C.onBrokerMessage = function (topic, payload) {
        if (typeof topic === 'string' && topic.startsWith(this.config.topicRoot + '/room/')) { let m; try { m = JSON.parse(payload); } catch (e) { return; } if (m && typeof m === 'object') this.onRoomBeacon(topic, m); return; }
        return bm.apply(this, arguments);
    };
    const bc = C.onBrokerConnect;
    C.onBrokerConnect = function () { const r = bc.apply(this, arguments); this.state.roomTopics = new Set(); try { this.syncRooms(true); } catch (e) {} return r; };
    const sw = C.sweep;
    C.sweep = function () {
        const r = sw.apply(this, arguments);
        try { this.syncRooms(false); } catch (e) {}
        this.pingPeers();
        return r;
    };
    const rn = C.recoverNetwork;
    C.recoverNetwork = function () { const r = rn.apply(this, arguments); setTimeout(() => { try { this.syncRooms(true); } catch (e) {} }, 1500); return r; };
    // Une liaison de canal qui tombe : on se re-signale aussitôt (sans attendre la balise suivante)
    const cp = C.closePeer;
    C.closePeer = function (sid) {
        let was = false; try { const p = this.state.peers.get(sid); was = !!(p && typeof ModuleIntercom !== 'undefined' && ModuleIntercom.sameRoom(p)); } catch (e) {}
        const r = cp.apply(this, arguments);
        if (was && this.inChannel()) { clearTimeout(this._rcT); this._rcT = setTimeout(() => { try { this.roomBeacon(true); } catch (e) {} }, 2500); }
        return r;
    };
})();
