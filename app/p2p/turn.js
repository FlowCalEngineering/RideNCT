// Relais TURN Cloudflare : identifiants temporaires demandés au serveur (fonction Supabase « turn-credentials », comptes connectés seulement).
// Le jeton secret reste côté serveur. Les identifiants durent 6 h ; on les garde en mémoire du téléphone et on les renouvelle avant la fin.
// Liste utilisée par les liaisons : STUN + TURN Cloudflare (si disponible) + ancien relais public en secours.
Object.assign(ModuleCommunity, {
    TURN_KEY: 'moto_turn',
    turnCached() {
        try { const o = JSON.parse(localStorage.getItem(this.TURN_KEY) || 'null'); return o && o.exp > Date.now() + 60000 && Array.isArray(o.ice) ? o : null; } catch (e) { return null; }
    },
    iceList() {
        const c = this.turnCached(), base = this.config.iceServers;
        if (!c) return base;
        const stun = base.filter(s => !s.username);     // STUN seuls
        const pub = base.filter(s => s.username);       // relais public de secours (en dernier)
        return stun.concat(c.ice, pub);
    },
    // Renouvelle les identifiants si besoin (jamais bloquant : sans réseau ou sans compte, l'ancien relais reste en secours)
    async turnRefresh(force) {
        try {
            if (this._turnBusy || typeof AppAuth === 'undefined' || !AppAuth.has()) return;
            const c = this.turnCached(); if (c && !force && c.exp - Date.now() > 90 * 60000) return;   // encore valable plus d'1 h 30
            this._turnBusy = true;
            const r = await AppAuth.fn('turn-credentials');
            if (r.ok && r.json && Array.isArray(r.json.iceServers) && r.json.iceServers.length) {
                const ttl = Math.min(Number(r.json.ttl) || 3600, 6 * 3600);
                try { localStorage.setItem(this.TURN_KEY, JSON.stringify({ exp: Date.now() + ttl * 1000, ice: r.json.iceServers.slice(0, 2) })); } catch (e) {}
            }
        } catch (e) {} finally { this._turnBusy = false; }
    }
});
setInterval(() => { try { if (ModuleCommunity.state.enabled) ModuleCommunity.turnRefresh(); } catch (e) {} }, 600000);   // radar allumé longtemps : on renouvelle avant l'expiration
