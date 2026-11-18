// QR code de canal privé : le montrer (lien « QR code à scanner » du partage) et le scanner (bouton de l'onglet Groupe).
// Le QR contient l'identifiant public du canal + le code secret : il ne donne pas plus de droits que le code saisi à la main,
// et l'entrée passe par la même vérification (preuve du code auprès d'un membre à portée, limites d'essais).
// Étend ModuleIntercom : à charger après intercom/groupe/partage-code.js et core/qr.js.
Object.assign(ModuleIntercom, {
    QR_TAG: 'ridenct1',
    qrPayload() {
        const s = this.state; if (!this.canShareCode()) return null;
        const name = ModuleCommunity.cleanText(s.currentRoomName || 'Groupe', 24).replace(/\|/g, ' ');
        return [this.QR_TAG, s.currentCode, s.roomPin, name].join('|');
    },
    // Lecture stricte : rien d'autre qu'un identifiant de canal, un code à 4 chiffres et un nom
    parseQr(text) {
        const m = /^(?:ridenct1|vroom1)\|(c[0-9a-f]{10})\|(\d{4})\|([^|]{0,40})$/.exec(String(text || '').trim());
        if (!m) return null;
        return { id: m[1], pin: m[2], name: ModuleCommunity.cleanText(m[3], 24) || 'Groupe' };
    },
    showQr() {
        const payload = this.qrPayload(), svg = payload && ModuleQR.svg(payload, { margin: 2 });
        if (!svg) return;
        const o = document.createElement('div'); o.id = 'qr-show'; o.setAttribute('role', 'dialog');
        o.style.cssText = 'position:fixed;inset:0;z-index:10050;background:var(--bg-color,#000);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;text-align:center;overflow-y:auto';
        const box = document.createElement('div'); box.style.cssText = 'background:#fff;border-radius:20px;padding:14px;width:min(78vw,340px)'; box.innerHTML = svg; box.firstChild.style.cssText = 'display:block;width:100%;height:auto';
        const n = document.createElement('div'); n.textContent = String(this.state.currentRoomName || 'Groupe'); n.style.cssText = 'font-weight:900;font-size:1.3rem;color:var(--text-main,#fff);margin-top:8px';
        const c = document.createElement('div'); c.textContent = this.state.roomPin.split('').join(' '); c.style.cssText = 'font-weight:900;font-size:1.8rem;letter-spacing:6px;color:var(--accent-color,#ff9f0a)';
        const w = document.createElement('div'); w.textContent = 'Un motard qui scanne ce QR rejoint le canal s\'il est à portée d\'un membre. Ne le montre qu\'à des gens de confiance.'; w.style.cssText = 'font-size:.78rem;color:var(--text-muted,#9a9aa0);max-width:300px;line-height:1.4';
        const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Fermer'; x.style.cssText = 'margin-top:10px;min-height:56px;padding:0 48px;border:0;border-radius:18px;background:var(--accent-color,#ff9f0a);color:var(--on-accent,#000);font-weight:800;font-size:1rem';
        x.addEventListener('click', () => o.remove());
        o.append(box, n, c, w, x); document.body.appendChild(o);
    },
    // --- scan ---
    qrSupported() { return typeof BarcodeDetector !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    async openScanner() {
        if (document.getElementById('qr-scan')) return;
        if (this.state.isConnected) return AppDialog.alert('Tu es déjà dans un canal.\n\nRaccroche d\'abord, puis scanne le QR.');
        if (!this.qrSupported()) return AppDialog.alert('Ton téléphone ne sait pas lire les QR codes dans l\'appli.\n\nChoisis le canal dans la liste et saisis son code à 4 chiffres.');
        let stream = null, timer = null, done = false;
        const o = document.createElement('div'); o.id = 'qr-scan'; o.setAttribute('role', 'dialog');
        o.style.cssText = 'position:fixed;inset:0;z-index:10060;background:#000;display:flex;flex-direction:column';
        const v = document.createElement('video'); v.setAttribute('playsinline', ''); v.muted = true; v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
        const vf = document.createElement('div'); vf.style.cssText = 'position:absolute;left:50%;top:38%;width:min(62vw,260px);aspect-ratio:1;transform:translate(-50%,-50%);border:3px solid #ff9f0a;border-radius:24px;box-shadow:0 0 0 999px rgba(0,0,0,.55)';
        const hint = document.createElement('div'); hint.textContent = 'Place le QR du canal dans le cadre'; hint.style.cssText = 'position:absolute;left:0;right:0;top:calc(38% + min(31vw,130px) + 24px);text-align:center;color:#fff;font-weight:700;padding:0 30px';
        const bar = document.createElement('div'); bar.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px));background:rgba(28,28,30,.92)';
        const mk = (t, s) => { const b = document.createElement('button'); b.type = 'button'; b.style.cssText = 'display:block;width:100%;text-align:left;min-height:52px;margin-top:8px;padding:10px 16px;border:0;border-radius:16px;background:rgba(255,255,255,.1);color:#fff;font-weight:700;font-size:.95rem'; b.textContent = t; if (s) { const sm = document.createElement('div'); sm.textContent = s; sm.style.cssText = 'font-weight:500;font-size:.75rem;color:#9a9aa0;margin-top:2px'; b.appendChild(sm); } return b; };
        const manual = mk('Saisir le code à la main', 'Depuis la liste des canaux'), cancel = mk('Annuler'); cancel.style.cssText += ';text-align:center;background:transparent;color:#9a9aa0;font-weight:800';
        bar.append(manual, cancel); o.append(v, vf, hint, bar); document.body.appendChild(o);
        const close = () => { done = true; clearInterval(timer); try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {} o.remove(); };
        manual.addEventListener('click', close); cancel.addEventListener('click', close);
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
        catch (e) { close(); return AppDialog.alert('Impossible d\'utiliser la caméra.\n\nAutorise la caméra dans Réglages › Autorisations (ou dans les réglages du téléphone), ou saisis le code à la main.'); }
        if (done) { try { stream.getTracks().forEach(t => t.stop()); } catch (e) {} return; }
        v.srcObject = stream; try { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
        let det; try { det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { close(); return AppDialog.alert('Ton téléphone ne sait pas lire les QR codes dans l\'appli.\n\nSaisis le code à la main.'); }
        let busy = false;
        timer = setInterval(async () => {
            if (busy || done) return; busy = true;
            try {
                const r = await det.detect(v), hit = r.map(x => this.parseQr(x.rawValue)).find(Boolean);
                if (hit && !done) { close(); this.joinFromQr(hit); }
            } catch (e) {} busy = false;
        }, 250);
    },
    // Rejoindre le canal d'un QR : il faut un membre à portée (liaison directe) ; la confirmation indique qui.
    async joinFromQr(q) {
        const C = ModuleCommunity;
        const members = () => [...C.state.peers.values()].filter(p => p.auth && p.rid && p.dc && p.dc.readyState === 'open' && String(p.roomCode) === q.id);
        const rm = C.state.radarMode; if (!rm || rm === 'off') { try { await C.setRadarMode('all'); } catch (e) {} }
        // On se signale sur la rubrique du canal : ses membres nous retrouvent même s'ils sont loin
        C.state.joinProbe = { id: q.id, pin: q.pin, until: Date.now() + 90000 }; try { C.syncRooms(true); } catch (e) {}
        let list = members();
        for (let i = 0; i < 30 && !list.length; i++) { await new Promise(r => setTimeout(r, 500)); list = members(); }
        if (!list.length) { C.state.joinProbe = null; try { C.syncRooms(true); } catch (e) {} }
        if (!list.length) return AppDialog.alert('Aucun membre de ce canal n\'est à portée.\n\nRapproche-toi d\'un membre du canal et scanne à nouveau.');
        const who = list.map(p => (C.state.profiles.get(p.rid) || {}).name || 'Un motard').slice(0, 3).map(n => C.cleanText(n, 20)).join(', ');
        const yes = await AppDialog.confirm(`Rejoindre « ${q.name} » ?\n\n${list.length} membre${list.length > 1 ? 's' : ''} à portée : ${who}.`, { okText: 'Rejoindre' });
        if (!yes) return;
        const r = await this.requestJoin(q.name, q.id, q.pin);
        if (!r.ok) AppDialog.alert(r.msg || 'Impossible de rejoindre le canal.');
    },
});
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#btn-scan-qr')) ModuleIntercom.openScanner(); });
