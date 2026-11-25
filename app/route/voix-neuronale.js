// ====================================================================
//  VOIX NATURELLE (Piper, hors ligne) pour le guidage de la PWA.
//  Pourquoi : la voix du navigateur (speechSynthesis) coupe la musique des autres applis sur iPhone et ne la relance pas.
//  Ici la voix est un fichier audio joué par la page avec navigator.audioSession = 'transient' : la musique baisse puis reprend.
//  - la synthèse se fait dans un Web Worker (voix-worker.js), à l'avance : les prochaines manœuvres sont préparées pendant la balade
//  - une annonce non prête (ou une erreur) retombe sur la voix du navigateur : le guidage ne reste jamais muet
//  - le modèle (~60 Mo) est téléchargé une fois depuis Réglages ; jamais en arrière-plan sur le réseau mobile
// ====================================================================
const ModuleTTS = {
    VOICE: 'fr_FR-siwis-medium', MAX: 80,
    w: null, seq: 0, pend: new Map(), cache: new Map(), q: [], run: false, state: 'idle', err: '', have: null, au: null, _stop: null,
    on() { try { return AppPrefs.get('voiceNeural') === 'on'; } catch (e) { return false; } },
    usable() { return this.on() && this.state !== 'dead' && typeof Worker !== 'undefined'; },
    key(t) { return String(t).toLowerCase().replace(/[\s,;.!?]+/g, ' ').trim(); },
    log(m) { try { ModuleGPS.vlog('voix-n', m); } catch (e) { } },

    // nombres en toutes lettres (la synthèse lit « trois cents mètres » sans hésiter)
    fr(n) {
        const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'], T = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
        if (n < 20) return U[n];
        if (n < 100) { const t = Math.floor(n / 10), u = n % 10; if (t <= 6) return T[t] + (u === 1 ? ' et un' : u ? '-' + U[u] : ''); if (t === 7) return 'soixante' + (u === 1 ? ' et onze' : '-' + U[10 + u]); if (t === 8) return 'quatre-vingt' + (u ? '-' + U[u] : 's'); return 'quatre-vingt-' + U[10 + u]; }
        if (n < 1000) { const h = Math.floor(n / 100), r = n % 100; return (h === 1 ? 'cent' : U[h] + ' cent' + (r === 0 ? 's' : '')) + (r ? ' ' + this.fr(r) : ''); }
        return String(n);
    },
    // « Dans 300 mètres, tournez… » → [« Dans 300 mètres », « tournez… »] ; « Radar dans 300 mètres » → [« Radar », « dans 300 mètres »] : les distances sont des petits clips réutilisés
    parts(t) {
        t = String(t).trim();
        const D = '(?:\\d+(?:,\\d)? (?:mètres|kilomètres?))';
        let m = new RegExp('^(Dans ' + D + '),\\s*([\\s\\S]+)$').exec(t); if (m) return [m[1], m[2]];
        m = new RegExp('^([\\s\\S]+?)\\s+(dans ' + D + ')$').exec(t); if (m) return [m[1], m[2]];
        return [t];
    },
    said(p) { return /^dans \d/i.test(p) ? p.replace(/\d+/g, (x) => this.fr(Number(x))).replace(',', ' virgule ') : p; },
    has(text) { if (!this.usable() || this.have === false) return false; const ps = this.parts(text); let all = true; ps.forEach(p => { if (!this.cache.has(this.key(p))) { all = false; this.want(p, 2); } }); return all; },

    // ----- worker -----
    worker() {
        if (this.w) return this.w;
        try {
            const w = this.w = new Worker('route/voix-worker.js', { type: 'module' });
            w.onmessage = (e) => { const d = e.data || {}, p = this.pend.get(d.id); if (!p) return; if (d.prog != null && p.prog) { p.prog(d.prog); return; } this.pend.delete(d.id); d.ok ? p.res(d) : p.rej(new Error(d.err || 'erreur')); };
            w.onerror = (e) => { this.dead('worker : ' + ((e && e.message) || 'chargement impossible')); };
        } catch (e) { this.dead('worker : ' + e.message); }
        return this.w;
    },
    dead(msg) { this.state = 'dead'; this.err = msg; this.log('HS ' + msg); this.pend.forEach(p => p.rej(new Error(msg))); this.pend.clear(); this.q = []; try { if (this.w) this.w.terminate(); } catch (e) { } this.w = null; },
    call(op, extra, prog) { return new Promise((res, rej) => { const w = this.worker(); if (!w) return rej(new Error(this.err || 'worker')); const id = ++this.seq; this.pend.set(id, { res, rej, prog }); w.postMessage(Object.assign({ id, op, voice: this.VOICE }, extra || {})); }); },

    // ----- installation (Réglages) -----
    async install(prog) {
        if (typeof Worker === 'undefined') throw new Error('non pris en charge');
        this.state = 'idle'; this.err = '';
        await this.call('download', {}, prog);
        this.have = true; try { AppPrefs.set('voiceNeural', 'on'); } catch (e) { }
        this.log('modèle installé'); this.warm();
    },
    // le modèle est-il bien là ? (jamais de téléchargement implicite sur le réseau mobile)
    async ensure() {
        if (!this.usable()) return false;
        if (this.have != null) return this.have;
        try { const r = await this.call('stored'); this.have = (r.list || []).indexOf(this.VOICE) >= 0; } catch (e) { this.have = false; }
        if (!this.have) { this.log('modèle absent'); try { AppPrefs.set('voiceNeural', 'off'); } catch (e) { } }
        return this.have;
    },
    // clips fréquents préparés une fois pour toutes (distances, phrases fixes)
    warm() {
        if (this._warm) return; this._warm = true;
        const sd = (d) => ModuleGPS.spokenDist(d);
        [300, 500, 200, 400, 800, 250, 350, 450, 600, 700, 900, 1000, 150, 100, 1100, 1200, 1500].forEach(d => this.want('Dans ' + sd(d), 1));
        ['Guidage démarré', 'Guidage vocal activé', 'Itinéraire modifié', 'Vous êtes arrivé à destination'].forEach(t => this.want(t, 1));
    },
    // prochaines manœuvres : on prépare les 6 suivantes
    plan(G) {
        if (!this.usable()) return;
        const s = G.state, st = s.routeSteps || [], i = s.currentStepIndex || 0;
        this.ensure().then(ok => {
            if (!ok) return; this.warm();
            for (let k = i; k < Math.min(st.length, i + 6); k++) { const a = st[k]; if (!a || !a.maneuver) continue; try { this.want(G.voiceBody(a, st[k + 1]), 2); } catch (e) { } }
        });
    },

    // ----- synthèse (file d'attente, un clip à la fois) -----
    want(text, prio) {
        const k = this.key(text); if (!k || this.cache.has(k) || this.q.some(x => x.k === k)) return;
        this.q.push({ k, text: this.said(text), prio: prio || 1 }); this.pump();
    },
    async pump() {
        if (this.run || !this.usable()) return; this.run = true;
        try {
            while (this.q.length && this.usable()) {
                if (!(await this.ensure())) break;
                this.q.sort((a, b) => b.prio - a.prio); const it = this.q.shift(); if (this.cache.has(it.k)) continue;
                const t0 = Date.now();
                try { const r = await this.call('predict', { text: it.text }); this.put(it.k, new Blob([r.buf], { type: 'audio/wav' })); this.log('prêt ' + (Date.now() - t0) + ' ms : ' + it.text.slice(0, 40)); }
                catch (e) { this.log('échec : ' + e.message); if (this.state === 'dead') break; }
            }
        } finally { this.run = false; }
    },
    put(k, blob) {
        this.cache.set(k, URL.createObjectURL(blob));
        while (this.cache.size > this.MAX) { const old = this.cache.keys().next().value; try { URL.revokeObjectURL(this.cache.get(old)); } catch (e) { } this.cache.delete(old); }
    },

    // ----- lecture : un fichier audio, session « transient » (la musique des autres applis baisse puis reprend) -----
    audio() {
        if (this.au) return this.au;
        const a = this.au = new Audio(); a.setAttribute('playsinline', ''); a.preload = 'auto';
        // iPhone : un lecteur audio doit avoir été lancé une fois par un geste de l'utilisateur
        const sil = (() => { const n = 800, u = new Uint8Array(44 + n), dv = new DataView(u.buffer), w = (o, t) => { for (let i = 0; i < t.length; i++) u[o + i] = t.charCodeAt(i); }; w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); u.fill(128, 44); return URL.createObjectURL(new Blob([u], { type: 'audio/wav' })); })();
        const unlock = () => { document.removeEventListener('touchend', unlock, true); document.removeEventListener('click', unlock, true); try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; a.src = sil; a.volume = 0.01; const p = a.play(); if (p && p.then) p.then(() => { a.pause(); a.volume = 1; }).catch(() => { }); } catch (e) { } };
        document.addEventListener('touchend', unlock, true); document.addEventListener('click', unlock, true);
        return a;
    },
    // résout true si la voix a été jouée, false si elle n'a pas pu (l'appelant prend alors la voix du navigateur)
    speak(o) {
        const ps = this.parts(o.text), urls = ps.map(p => this.cache.get(this.key(p)));
        if (urls.some(u => !u)) return Promise.resolve(false);
        const a = this.audio();
        return new Promise((res) => {
            let i = 0, played = false, done = false;
            const set = (t) => { try { if (navigator.audioSession) navigator.audioSession.type = t; } catch (e) { } };
            const end = (ok) => { if (done) return; done = true; this._stop = null; set('ambient'); a.onended = a.onerror = null; res(ok); };
            this._stop = () => { try { a.pause(); } catch (e) { } end(true); };
            const next = () => {
                if (i >= ps.length) return end(true);
                a.onended = next; a.onerror = () => end(played);
                a.src = urls[i++]; a.volume = 1;
                const p = a.play(); if (p && p.then) p.then(() => { played = true; }).catch((e) => { this.log('lecture refusée : ' + (e && e.name)); end(played); });
            };
            set('transient'); next();
        });
    },
    stop() { try { if (this._stop) this._stop(); } catch (e) { } }
};
