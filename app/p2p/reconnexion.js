// P2P : reconnexion automatique après une coupure réseau (wifi / 4G / 5G…)
// Étend ModuleCommunity : ce fichier doit être chargé APRÈS radar.js et carte.js.
Object.assign(ModuleCommunity, {
    // Une liaison est saine si le canal de données est ouvert, la connexion WebRTC établie et que le motard a donné signe de vie récemment
    peerHealthy(p) {
        if (!p || !p.dc || p.dc.readyState !== 'open') return false;
        const st = p.pc && p.pc.connectionState;
        if (st && st !== 'connected') return false;
        return Date.now() - (p.lastMsg || 0) < 20000;
    },
    // Appelé quand le réseau revient : relance le relais de découverte, puis refait les liaisons mortes (le canal vocal se rejoint tout seul à l'ouverture de chaque liaison)
    recoverNetwork(reason) {
        if (this.state.radarMode === 'off' || !this.state.client) return;
        const c = this.state.client, now = Date.now();
        if (now - (this._recAt || 0) < 1500) return; this._recAt = now;
        if (navigator.onLine === false) return;
        c.reconnectNow();
        this.state.ignored.clear();
        clearTimeout(this._healT);
        this._healT = setTimeout(() => this.healPeers(), 6000);
        clearTimeout(this._healT2);
        this._healT2 = setTimeout(() => this.healPeers(), 16000); // 2e passage : le relais peut avoir mis du temps à revenir
    },
    healPeers() {
        if (!this.state.client) return;
        let dropped = 0;
        [...this.state.peers.values()].forEach(p => { if (!this.peerHealthy(p) && Date.now() - (p.born || 0) > 8000) { this.closePeer(p.sid); dropped++; } });
        if (this.state.client.connected) this.beacon(true);
        return dropped;
    },
    // Veille : détecte les coupures silencieuses (la connexion au relais reste « ouverte » sans plus rien recevoir)
    netWatch() {
        const c = this.state.client; const voice = this.inVoice && this.inVoice();
        const down = !c || !c.connected || navigator.onLine === false;
        if (c && this.state.radarMode !== 'off') {
            if (c.connected && Date.now() - c.lastRx > 75000) { c.reconnectNow(); }
            else if (!c.connected && navigator.onLine !== false && Date.now() - (this._lastForce || 0) > 8000) { this._lastForce = Date.now(); c.reconnectNow(); }
        }
        // En appel : on le dit sur l'écran (pas de notification)
        const desc = document.getElementById('active-call-desc');
        if (desc && typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state.isConnected) {
            if (down && voice) { desc.textContent = 'Réseau perdu · reconnexion automatique…'; this._wasDown = true; }
            else if (this._wasDown && !down) { this._wasDown = false; try { ModuleIntercom.renderParticipants(); } catch (e) {} }
        }
    },
    initNetRecovery() {
        if (this._netInit) return; this._netInit = true;
        window.addEventListener('online', () => this.recoverNetwork('online'));
        window.addEventListener('offline', () => { this._wasDown = false; this.netWatch(); });
        try { const nc = navigator.connection; if (nc && nc.addEventListener) nc.addEventListener('change', () => { setTimeout(() => this.recoverNetwork('change'), 1200); }); } catch (e) {}
        // Retour au premier plan (téléphone sorti de veille) : on vérifie tout de suite
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.recoverNetwork('visible'); });
        setInterval(() => { try { this.netWatch(); } catch (e) {} }, 5000);
    }
});
// Date de création d'une liaison (pour ne pas juger une liaison encore en cours d'établissement)
(function () {
    const orig = ModuleCommunity.startPeer;
    ModuleCommunity.startPeer = function () { const p = orig.apply(this, arguments); if (p) p.born = Date.now(); return p; };
    // Une liaison morte ne doit pas bloquer la redécouverte : si un motard nous rappelle alors que la nôtre est en panne, on la refait
    const ob = ModuleCommunity.onBeacon;
    ModuleCommunity.onBeacon = function (m) {
        try { const p = this.state.peers.get(m && m.sid); if (p && !this.peerHealthy(p) && Date.now() - (p.born || 0) > 8000) this.closePeer(m.sid); } catch (e) {}
        return ob.apply(this, arguments);
    };
})();
ModuleCommunity.initNetRecovery();
