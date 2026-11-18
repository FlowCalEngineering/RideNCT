// Partage du code d'un canal privé, utilisable en roulant : SMS prérempli, annonce vocale, gros affichage.
// Le code ne passe jamais par un serveur : il part par SMS (ouvert dans l'appli de messages) ou se dit à voix haute.
// Étend ModuleIntercom : à charger après intercom/groupe/canaux.js.
Object.assign(ModuleIntercom, {
    CODE_WORDS: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'],
    canShareCode() { const s = this.state; return !!(s.isConnected && s.isPrivateRoom && /^\d{4}$/.test(String(s.roomPin || ''))); },
    codeSpeech() { return String(this.state.roomPin).split('').map(d => this.CODE_WORDS[+d]).join(', '); },
    codeSmsBody() {
        const name = String(this.state.currentRoomName || 'Groupe').replace(/[\r\n]+/g, ' ').slice(0, 40);
        return 'Rejoins mon canal RideNCT « ' + name + ' » ! Code : ' + this.state.roomPin + '. Ouvre l\'app, onglet Groupe, et entre le code quand tu es à côté de moi.';
    },
    // Met à jour le bouton « Code » de l'écran du canal (visible seulement pour un canal privé)
    syncCodeButton() { const b = document.getElementById('btn-hud-code'); if (b) b.style.display = this.canShareCode() ? 'flex' : 'none'; },
    speakCode() {
        if (!this.canShareCode()) return false;
        try {
            if (!window.speechSynthesis) return false;
            speechSynthesis.cancel();
            const say = () => { const u = new SpeechSynthesisUtterance('Le code du canal est : ' + this.codeSpeech()); u.lang = 'fr-FR'; u.rate = 0.9; speechSynthesis.speak(u); };
            say(); say();
            return true;
        } catch (e) { return false; }
    },
    showBigCode() {
        if (!this.canShareCode()) return;
        const o = document.createElement('div'); o.id = 'code-big'; o.setAttribute('role', 'dialog');
        o.style.cssText = 'position:fixed;inset:0;z-index:10050;background:var(--bg-color,#000);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;text-align:center';
        const n = document.createElement('div'); n.textContent = String(this.state.currentRoomName || 'Groupe'); n.style.cssText = 'color:var(--text-muted);font-weight:800;letter-spacing:2px;text-transform:uppercase;font-size:.85rem';
        const c = document.createElement('div'); c.textContent = this.state.roomPin; c.style.cssText = 'font-size:clamp(72px,26vw,150px);font-weight:900;letter-spacing:.12em;color:var(--accent-color,#ff9f0a);line-height:1';
        const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Fermer'; x.style.cssText = 'margin-top:24px;min-height:56px;padding:0 48px;border:0;border-radius:18px;background:var(--accent-color,#ff9f0a);color:var(--on-accent,#000);font-weight:800;font-size:1rem';
        x.addEventListener('click', () => o.remove());
        o.append(n, c, x); document.body.appendChild(o);
    },
    async shareCode() {
        if (!this.canShareCode()) return;
        const pick = await new Promise(res => {
            const o = document.createElement('div'); o.id = 'code-share';
            o.style.cssText = 'position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center';
            const sh = document.createElement('div'); sh.style.cssText = 'width:100%;max-width:460px;box-sizing:border-box;background:var(--surface-color,#2c2c2e);border-radius:26px 26px 0 0;padding:20px 16px calc(24px + env(safe-area-inset-bottom,0px));color:var(--text-main,#fff)';
            const sub = document.createElement('div'); sub.textContent = 'Code de connexion'; sub.style.cssText = 'text-align:center;font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;font-weight:800';
            const pin = document.createElement('div'); pin.textContent = this.state.roomPin.split('').join(' '); pin.style.cssText = 'text-align:center;font-size:2.8rem;font-weight:900;letter-spacing:6px;color:var(--accent-color,#ff9f0a);margin:4px 0 10px';
            sh.append(sub, pin);
            const mk = (key, title, hint) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.k = key; b.style.cssText = 'display:block;width:100%;text-align:left;margin-top:10px;min-height:56px;padding:12px 16px;border:0;border-radius:16px;background:rgba(255,255,255,.08);color:inherit;font-weight:800;font-size:.95rem'; const t = document.createElement('div'); t.textContent = title; const h = document.createElement('div'); h.textContent = hint; h.style.cssText = 'font-weight:500;font-size:.75rem;color:var(--text-muted);margin-top:2px'; b.append(t, h); b.addEventListener('click', () => { o.remove(); res(key); }); return b; };
            sh.append(mk('sms', 'Envoyer par SMS', 'Message prêt, tu choisis le contact'), mk('voice', 'Annoncer à voix haute', 'Le code est dit deux fois, chiffre par chiffre'), mk('big', 'Afficher en grand', 'Lisible d\'un coup d\'œil, à l\'arrêt'));
            if (typeof ModuleQR !== 'undefined') sh.append(mk('qr', 'QR code à scanner', 'Entrée directe, sans taper de code'));
            const cn = document.createElement('button'); cn.type = 'button'; cn.textContent = 'Annuler'; cn.style.cssText = 'display:block;width:100%;margin-top:14px;min-height:48px;border:0;background:transparent;color:var(--text-muted);font-weight:800'; cn.addEventListener('click', () => { o.remove(); res(null); });
            sh.append(cn); o.appendChild(sh); o.addEventListener('click', (e) => { if (e.target === o) { o.remove(); res(null); } });
            document.body.appendChild(o);
        });
        if (!pick || !this.canShareCode()) return;
        if (pick === 'big') return this.showBigCode();
        if (pick === 'qr') return this.showQr();
        if (pick === 'voice') { if (!this.speakCode()) AppDialog.alert('La lecture à voix haute n\'est pas disponible sur cet appareil.\n\nUtilise plutôt le SMS ou le gros affichage.'); return; }
        // SMS : un SMS circule en clair chez l'opérateur
        const ok = await AppDialog.confirm('Un SMS circule en clair chez l\'opérateur.\n\nEnvoie ce code seulement à des personnes de confiance.', { okText: 'Ouvrir mes messages' });
        if (!ok || !this.canShareCode()) return;
        try { location.href = 'sms:?&body=' + encodeURIComponent(this.codeSmsBody()); } catch (e) { AppDialog.alert('Impossible d\'ouvrir les messages sur cet appareil.'); }
    },
    initCodeShare() {
        document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#btn-hud-code')) this.shareCode(); });
        const r = this.renderParticipants;
        if (typeof r === 'function' && !r._codeWrapped) { const w = function () { const x = r.apply(this, arguments); try { this.syncCodeButton(); } catch (e) {} return x; }; w._codeWrapped = true; this.renderParticipants = w; }
    },
});
ModuleIntercom.initCodeShare();
