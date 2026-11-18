// Signalement + blocage des motards
// - Blocage 100 % local (liste « moto_blocked » sur le téléphone) : le motard bloqué est rejeté dès la poignée de main P2P (voix, musique,
//   position, invitations), retiré des amis / demandes / croisés, et reste invisible tant qu'il n'est pas débloqué (Réglages › Compte).
// - Signalement : motif (musique / propos / autre + texte) envoyé à Supabase (fonction report_user, compte obligatoire) puis blocage local.
//   Hors réseau, le signalement est mis en file (« moto_reports_queue ») et renvoyé plus tard. Le blocage du compte se décide côté serveur
//   (admin, ou plus de 3 signalements de comptes différents) : le téléphone du signalé retombe alors sur l'écran d'accès.
// Étend ModuleCommunity : à charger après groupe/radar/radar.js.
Object.assign(ModuleCommunity, {
    REPORT_REASONS: [
        { k: 'musique', t: 'Partage de musique non conforme', s: 'Contraire aux CGU' },
        { k: 'propos', t: 'Propos non convenables', s: 'Contraire aux CGU' },
        { k: 'autre', t: 'Autre', s: '' }
    ],
    blockedList() { try { const o = JSON.parse(localStorage.getItem('moto_blocked') || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } },
    isBlocked(rid) { return !!rid && Object.prototype.hasOwnProperty.call(this.blockedList(), rid); },
    blockRider(rid, name) {
        if (!rid) return;
        const b = this.blockedList(); b[rid] = { n: String(name || 'Motard').slice(0, 40), t: Date.now() };
        try { localStorage.setItem('moto_blocked', JSON.stringify(b)); } catch (e) {}
        const s = this.state;
        s.friends = (s.friends || []).filter(f => f.id !== rid); s.friendReqs = (s.friendReqs || []).filter(f => f.id !== rid);
        ['pendingRequests', 'pendingAccepts', 'pendingRemovals', 'sentRequests'].forEach(k => { if (Array.isArray(s[k])) s[k] = s[k].filter(x => x !== rid && !(x && x.id === rid)); });
        if (s.crossed && s.crossed[rid]) { delete s.crossed[rid]; this.saveCrossed(); }
        s.peers.forEach((p, sid) => { if (p.rid === rid) this.closePeer(sid, 3600000); });
        this.removeRider(rid);
        this.saveFriendsData();
    },
    unblockRider(rid) { const b = this.blockedList(); delete b[rid]; try { localStorage.setItem('moto_blocked', JSON.stringify(b)); } catch (e) {} },

    // ---- Fenêtre de signalement (motif → texte si « Autre ») ----
    openReport(id, name) {
        const old = document.getElementById('rider-report-overlay'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'rider-report-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:10001;display:flex;align-items:center;justify-content:center;padding:18px;';
        let reason = null;
        const bs = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:15px;border-radius:16px;font-weight:800;font-size:.9rem;width:100%;border:0;margin-top:10px;font-family:inherit;cursor:pointer;';
        const close = () => ov.remove();
        const draw = () => {
            const other = reason === 'autre';
            ov.innerHTML = `<div style="background:var(--surface-color);border-radius:24px;width:100%;max-width:340px;padding:22px;max-height:92vh;overflow-y:auto;">
                <h3 style="color:var(--text-main);font-size:1.1rem;text-align:center;">Signaler ${this.esc(name)}</h3>
                <p style="color:var(--text-muted);font-size:.8rem;margin:4px 0 12px;text-align:center;">Choisis le motif</p>
                ${this.REPORT_REASONS.map(r => `<button type="button" data-k="${r.k}" style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;font-family:inherit;color:var(--text-main);cursor:pointer;margin-top:8px;padding:13px;border-radius:14px;font-weight:700;font-size:.85rem;background:${reason === r.k ? 'rgba(255,69,58,.14)' : 'rgba(255,255,255,.05)'};outline:${reason === r.k ? '1.5px solid var(--danger-color)' : 'none'};">
                    <span style="width:20px;height:20px;border-radius:50%;flex:none;border:2px solid ${reason === r.k ? 'var(--danger-color)' : '#555'};background:${reason === r.k ? 'radial-gradient(var(--danger-color) 45%,transparent 50%)' : 'transparent'};"></span>
                    <span>${this.esc(r.t)}${r.s ? `<small style="display:block;color:var(--text-muted);font-weight:600;font-size:.7rem;margin-top:2px;">${this.esc(r.s)}</small>` : ''}</span></button>`).join('')}
                ${other ? `<textarea id="rp-txt" maxlength="300" placeholder="Décris le problème" style="width:100%;height:76px;margin-top:10px;border-radius:14px;border:0;background:rgba(255,255,255,.07);color:var(--text-main);padding:10px;font:inherit;font-size:.82rem;resize:none;"></textarea><div id="rp-cnt" style="text-align:right;color:var(--text-muted);font-size:.65rem;margin-top:3px;">0 / 300</div>` : ''}
                <p style="color:var(--text-muted);font-size:.7rem;margin-top:10px;line-height:1.4;">${this.esc(name)} sera aussi bloqué(e) pour toi.</p>
                <button type="button" id="rp-go" ${reason ? '' : 'disabled'} style="${bs}background:rgba(255,69,58,.14);color:var(--danger-color);${reason ? '' : 'opacity:.45;'}">Signaler et bloquer</button>
                <button type="button" id="rp-no" style="${bs}background:transparent;color:var(--text-muted);border:1px solid rgba(255,255,255,.1);margin-top:6px;">Annuler</button></div>`;
            ov.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const keep = (ov.querySelector('#rp-txt') || {}).value; reason = b.dataset.k; draw(); const t = ov.querySelector('#rp-txt'); if (t) { t.value = keep || ''; t.oninput(); t.focus(); } });
            const t = ov.querySelector('#rp-txt'); if (t) t.oninput = () => { ov.querySelector('#rp-cnt').textContent = t.value.length + ' / 300'; };
            ov.querySelector('#rp-no').onclick = close;
            ov.querySelector('#rp-go').onclick = () => {
                if (!reason) return;
                const txt = reason === 'autre' ? ((ov.querySelector('#rp-txt') || {}).value || '').trim().slice(0, 300) : '';
                if (reason === 'autre' && txt.length < 3) { try { AppDialog.alert('Décris brièvement le problème (3 caractères minimum).', { title: 'Signalement' }); } catch (e) {} return; }
                this.queueReport({ rid: id, name, reason, details: txt });
                this.blockRider(id, name); close();
            };
        };
        ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
        document.body.appendChild(ov); draw();
    },

    // ---- Envoi (file d'attente locale, renvoyée dès que possible) ----
    queueReport(rp) {
        let q = []; try { q = JSON.parse(localStorage.getItem('moto_reports_queue') || '[]'); if (!Array.isArray(q)) q = []; } catch (e) { q = []; }
        q.push({ rid: String(rp.rid).slice(0, 80), name: String(rp.name || '').slice(0, 40), reason: rp.reason, details: rp.details || '', at: Date.now() });
        try { localStorage.setItem('moto_reports_queue', JSON.stringify(q.slice(-30))); } catch (e) {}
        this.flushReports();
    },
    async flushReports() {
        if (this._flushing || typeof AppAuth === 'undefined' || !AppAuth.has()) return;
        this._flushing = true;
        try {
            let q = []; try { q = JSON.parse(localStorage.getItem('moto_reports_queue') || '[]'); } catch (e) {}
            while (Array.isArray(q) && q.length) {
                const rp = q[0], tk = await AppAuth.token(); if (!tk) break;
                const r = await AppAuth.rpc('report_user', { p_rid: rp.rid, p_name: rp.name, p_reason: rp.reason, p_details: rp.details });
                // 0 = hors réseau, 404/5xx = fonction pas encore installée ou serveur indisponible : on garde en file ; le reste est définitif
                if (!r.ok && (r.status === 0 || r.status === 404 || r.status >= 500 || r.status === 401 || r.status === 429)) break;
                q.shift(); try { localStorage.setItem('moto_reports_queue', JSON.stringify(q)); } catch (e) {}
            }
        } catch (e) {} finally { this._flushing = false; }
    },
    // Lie l'identifiant radar de ce téléphone au compte (pour que l'admin puisse retrouver le compte d'un motard signalé)
    async linkRider() {
        try {
            const u = AppAuth.user(), rid = this.state.myId; if (!u || !rid) return;
            const tag = u.id + '|' + rid; if (localStorage.getItem('moto_rider_linked') === tag) return;
            const r = await AppAuth.rpc('link_rider', { p_rid: rid });
            if (r.ok) localStorage.setItem('moto_rider_linked', tag);
        } catch (e) {}
    },
    syncReports() { this.flushReports(); this.linkRider(); },

    // ---- Réglages › Compte : liste des motards bloqués ----
    renderBlocked(root) {
        if (!root) return;
        const b = this.blockedList(), ids = Object.keys(b).sort((x, y) => b[y].t - b[x].t);
        root.innerHTML = `<div class="card au-card" style="margin-top:12px;"><div class="setting-title">Motards bloqués${ids.length ? ' (' + ids.length + ')' : ''}</div>
            ${ids.length ? ids.map(id => `<div style="display:flex;align-items:center;gap:10px;margin-top:10px;"><span style="flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(b[id].n)}</span><button type="button" class="btn setting-btn" data-un="${this.esc(id)}" style="width:auto;padding:8px 14px;margin:0;">Débloquer</button></div>`).join('') : ''}
            <div class="setting-hint">${ids.length ? 'Un motard bloqué ne peut ni te voir, ni te parler, ni partager de musique avec toi.' : 'Aucun motard bloqué.'}</div></div>`;
        root.querySelectorAll('[data-un]').forEach(btn => btn.onclick = () => { this.unblockRider(btn.dataset.un); this.renderBlocked(root); });
    }
});
(function () {
    const go = () => { try { ModuleCommunity.syncReports(); } catch (e) {} };
    window.addEventListener('online', go); document.addEventListener('auth:update', go);
    setTimeout(go, 6000); setInterval(go, 600000);
})();
