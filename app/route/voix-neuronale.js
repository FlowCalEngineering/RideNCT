// ====================================================================
//  VOIX NATURELLE (Piper, hors ligne) pour le guidage de la PWA.
//  Pourquoi : la voix du navigateur (speechSynthesis) coupe la musique des autres applis sur iPhone et ne la relance pas.
//  Ici la voix est un fichier audio joué par la page avec navigator.audioSession = 'transient' : la musique baisse puis reprend.
//  - la synthèse se fait dans un Web Worker (voix-worker.js), à l'avance : les prochaines manœuvres sont préparées pendant la balade
//  - une annonce non prête (ou une erreur) retombe sur la voix du navigateur : le guidage ne reste jamais muet
//  - le modèle (~60 Mo) est téléchargé une fois depuis Réglages ; jamais en arrière-plan sur le réseau mobile
// ====================================================================
const ModuleTTS = {
    VOICE: 'fr_FR-siwis-medium', MAX: 160,
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
    // vrai si la voix naturelle prend l'annonce en charge : les clips manquants sont demandés en priorité et speak() les attend (3 s au plus), jamais la voix du navigateur d'emblée
    has(text) { if (!this.usable() || this.have !== true) return false; this.parts(text).forEach(p => { if (!this.cache.has(this.key(p))) this.want(p, 3); }); return true; },

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
    call(op, extra, prog) { return new Promise((res, rej) => { const w = this.worker(); if (!w) return rej(new Error(this.err || 'worker')); const id = ++this.seq; this.pend.set(id, { res, rej, prog }); this.idle(); w.postMessage(Object.assign({ id, op, voice: this.VOICE }, extra || {})); }); },

    // ----- installation (Réglages) -----
    install(prog) { if (this._ins) return this._ins; const p = this._ins = this._install(prog); const f = () => { this._ins = null; }; p.then(f, f); return p; },
    async _install(prog) {
        if (typeof Worker === 'undefined') throw new Error('non pris en charge');
        this.state = 'idle'; this.err = '';
        await this.call('download', {}, prog);
        this.have = true; try { AppPrefs.set('voiceNeural', 'on'); } catch (e) { }
        this.log('modèle installé'); this.warm();
    },
    // téléchargement automatique du modèle (une fois), y compris en balade et sur réseau mobile ; réessaie si ça échoue
    ui() {
        try {
            const st = document.getElementById('neural-st'), b = document.getElementById('btn-toggle-neural'), r = b && b.closest('.set-row'), o = this.on(), dl = this.dl != null, miss = o && this.have === false;
            if (st) { st.textContent = dl ? '⬇ Téléchargement de la voix… ' + this.dl + ' %' : miss ? '⬇ Voix à télécharger (~80 Mo, en wifi) : appuie sur l\'interrupteur' : o ? '● Activée · hors ligne, la musique reprend après' : '○ Désactivée · voix de base de l\'iPhone'; st.classList.toggle('ok', o && !miss && !dl); }
            if (r) { r.classList.toggle('is-on', o && !miss); const v = r.querySelector('.v'); if (v && dl) v.textContent = 'Téléchargement… ' + this.dl + ' %'; }
        } catch (e) { }
    },
    auto(n) {
        n = n || 0;
        if (this._auto || !this.usable() || this.have !== false || n > 3) return;
        const later = (ms) => setTimeout(() => this.auto(n + 1), ms);
        this._auto = true; this.dl = 0; this.ui(); this.log('téléchargement automatique');
        this.install((p) => { this.dl = p; this.ui(); }).then(() => { this.dl = null; this._auto = false; this.ui(); }).catch((e) => { this.dl = null; this._auto = false; this.log('téléchargement échoué : ' + (e && e.message)); this.ui(); later(120000 * (n + 1)); });
    },
    // le modèle est-il bien là ? (jamais de téléchargement implicite sur le réseau mobile)
    async ensure() {
        if (!this.usable()) return false;
        if (this.have != null) return this.have;
        try { const r = await this.call('stored'); this.have = (r.list || []).indexOf(this.VOICE) >= 0; } catch (e) { this.have = false; }
        if (!this.have) this.log('modèle absent');
        return this.have;
    },
    // clips fréquents préparés une fois pour toutes (distances, phrases fixes)
    warm() {
        if (this._warm) return; this._warm = true;
        const sd = (d) => ModuleGPS.spokenDist(d);
        [300, 500, 200, 400, 800, 100, 1000].forEach(d => this.want('Dans ' + sd(d), 1));
        ['Guidage démarré', 'Guidage vocal activé', 'Itinéraire modifié', 'Vous êtes arrivé à destination'].forEach(t => this.want(t, 1));
    },
    // prochaines manœuvres : on prépare les 6 suivantes
    plan(G) {
        if (!this.usable()) return;
        const s = G.state, st = s.routeSteps || [], i = s.currentStepIndex || 0;
        this.ensure().then(ok => {
            if (!ok) return; this.warm();
            for (let k = i; k < Math.min(st.length, i + 80); k++) { const a = st[k]; if (!a || !a.maneuver) continue; try { this.want(G.voiceBody(a, st[k + 1]), k < i + 3 ? 2 : 1); } catch (e) { } }
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
        } finally { this.run = false; this.idle(); }
    },
    // le moteur de synthèse pèse lourd en mémoire : on le libère dès qu'il n'a plus rien à faire (iPhone ferme sinon la page pendant la balade)
    idle() {
        clearTimeout(this._it);
        this._it = setTimeout(() => { if (!this.run && !this.q.length && !this.pend.size && this.w) { try { this.w.terminate(); } catch (e) { } this.w = null; this.log('moteur libéré'); } else if (this.w) this.idle(); }, 6000);
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
        const unlock = () => { if (!this.on()) return; document.removeEventListener('touchend', unlock, true); document.removeEventListener('click', unlock, true); try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; a.src = sil; a.volume = 0.01; const p = a.play(); if (p && p.then) p.then(() => { a.pause(); a.volume = 1; }).catch(() => { }); } catch (e) { } };
        document.addEventListener('touchend', unlock, true); document.addEventListener('click', unlock, true);
        return a;
    },
    // résout true si la voix a été jouée, false si elle n'a pas pu (l'appelant prend alors la voix du navigateur)
    speak(o) {
        const ps = this.parts(o.text), urls = ps.map(p => this.cache.get(this.key(p)));
        const a = this.audio();
        return new Promise((res) => {
            if (urls.some(u => !u)) {
                const t0 = Date.now(); this._stop = () => { clearInterval(iv); this._stop = null; res(true); };
                const iv = setInterval(() => {
                    const u = ps.map(p => this.cache.get(this.key(p)));
                    if (u.every(Boolean)) { clearInterval(iv); this._stop = null; this.speak(o).then(res); }
                    else if (Date.now() - t0 > 3000 || !this.usable()) { clearInterval(iv); this._stop = null; res(false); }
                }, 150);
                return;
            }
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
    stop() { try { if (this._stop) this._stop(); } catch (e) { } },

    // ----- diagnostic (Réglages › Tester la voix) -----
    diag() {
        let at = 'absente'; try { if (navigator.audioSession) at = navigator.audioSession.type; } catch (e) { }
        const l = ((typeof ModuleGPS !== 'undefined' && ModuleGPS._vlog) || []).filter(x => / (voix-n|dit|fin|erreur|attente) /.test(x)).slice(-10);
        return ['état : ' + this.state + (this.err ? ' (' + this.err + ')' : '') + ' · réglage : ' + (this.on() ? 'activée' : 'désactivée'), 'modèle : ' + this.have + ' · worker : ' + (this.w ? 'oui' : 'non') + ' · session audio : ' + at, (this.boot ? this.boot + '\n' : '') + 'clips prêts : ' + this.cache.size + ' · en attente : ' + this.q.length].concat(l).join('\n') + this.traceTxt();
    },
    traceTxt() { const p = (this.prevTrace || []).slice(-16); return p.length ? '\n— juste avant le dernier démarrage —\n' + p.join('\n') : ''; },
    async test(out) {
        const t0 = Date.now(), say = (m) => out(((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + m), T = 'Test de la voix naturelle', k = this.key(T);
        if (!this.on()) return out('Active d\'abord la voix naturelle.');
        this.state = 'idle'; this.err = ''; this.have = null; this.cache.delete(k); this.audio();
        say('modèle…'); if (!(await this.ensure())) return out(this.diag() + '\nMODÈLE ABSENT OU MOTEUR EN PANNE');
        say('synthèse…'); this.want(T, 3);
        for (let i = 0; i < 120 && !this.cache.has(k) && this.state !== 'dead'; i++) await new Promise(r => setTimeout(r, 500));
        if (!this.cache.has(k)) return out(this.diag() + '\nSYNTHÈSE IMPOSSIBLE');
        say('lecture…'); const ok = await this.speak({ text: T });
        out(this.diag() + '\nlecture : ' + (ok ? 'ok' : 'REFUSÉE (geste requis)'));
    }
};
// le lecteur audio est créé dès le chargement : son « déverrouillage » attend le premier appui de l'utilisateur (sinon iPhone refuse de jouer une annonce sans geste)
document.addEventListener('DOMContentLoaded', () => { try { ModuleTTS.audio(); } catch (e) { } });

// préparation dès le lancement : moteur démarré, distances et phrases fixes prêtes avant le départ ; manœuvres de l'itinéraire préparées dès qu'il est calculé
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { try { if (ModuleTTS.usable()) ModuleTTS.ensure().then(ok => { if (ok) ModuleTTS.warm(); else ModuleTTS.auto(); }); } catch (e) { } }, 2500);
    let last = null;
    setInterval(() => { try { const S = ModuleGPS.state; if (!ModuleTTS.usable() || !S.routeSteps || !S.routeSteps.length) return; const k = S.routeSteps.length + ':' + (S.currentStepIndex || 0); if (k !== last) { last = k; ModuleTTS.plan(ModuleGPS); } } catch (e) { } }, 2000);
});
// ENREGISTREUR DE VOL : les derniers événements avant une fermeture inattendue sont gardés et affichés dans « Tester la voix »
(() => {
    const K = 'moto_trace', P = 'moto_trace_prev', T0 = Date.now(); let buf = [];
    const hh = () => { const d = new Date(); return d.toTimeString().slice(0, 8); };
    const save = () => { try { localStorage.setItem(K, JSON.stringify(buf)); } catch (e) { } };
    const tr = (m) => { buf.push(hh() + ' ' + m); if (buf.length > 70) buf.shift(); save(); };
    ModuleTTS.trace = tr;
    try {
        const nav = (performance.getEntriesByType('navigation')[0] || {}).type || '?', prev = JSON.parse(localStorage.getItem(K) || '[]');
        localStorage.setItem(P, JSON.stringify(prev)); ModuleTTS.prevTrace = prev;
        ModuleTTS.boot = 'démarrage : ' + nav + (document.wasDiscarded ? ' · page éliminée par iOS' : '');
        tr('DÉMARRAGE ' + nav + (document.wasDiscarded ? ' (éliminée par iOS)' : '') + ' · ' + document.visibilityState);
    } catch (e) { }
    ['pagehide', 'pageshow', 'freeze', 'resume', 'online', 'offline', 'beforeunload'].forEach(n => window.addEventListener(n, (e) => tr(n + (e && e.persisted ? ' (persisted)' : '')), true));
    document.addEventListener('visibilitychange', () => tr('visibilité : ' + document.visibilityState));
    window.addEventListener('error', (e) => tr('ERREUR ' + String(e.message).slice(0, 90) + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
    window.addEventListener('unhandledrejection', (e) => tr('PROMESSE REJETÉE ' + String((e.reason && e.reason.message) || e.reason).slice(0, 90)));
    try { navigator.serviceWorker && navigator.serviceWorker.addEventListener('controllerchange', () => tr('SW : nouveau contrôleur')); } catch (e) { }
    // moteur de voix
    const lg = ModuleTTS.log.bind(ModuleTTS); ModuleTTS.log = (m) => { tr('voix-n ' + String(m).slice(0, 60)); lg(m); };
    const wk = ModuleTTS.worker.bind(ModuleTTS); ModuleTTS.worker = function () { const had = !!this.w, w = wk(); if (!had && w) tr('worker créé'); return w; };
    // état toutes les 4 s + changements d'état de la balade
    let rid = null, step = null;
    setInterval(() => {
        try {
            const S = (typeof ModuleGPS !== 'undefined' && ModuleGPS.state) || {}, r = !!S.isTracking;
            if (r !== rid) { rid = r; tr(r ? 'BALADE démarrée' : 'balade arrêtée'); }
            if (r && S.currentStepIndex !== step) { step = S.currentStepIndex; tr('étape ' + step + '/' + ((S.routeSteps || []).length)); }
            tr('· ' + (r ? 'balade' : 'repos') + ' ' + document.visibilityState + ' clips ' + ModuleTTS.cache.size + ' attente ' + ModuleTTS.q.length + ' worker ' + (ModuleTTS.w ? 'oui' : 'non') + ' noeuds ' + document.getElementsByTagName('*').length + (performance.memory ? ' tas ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + 'Mo' : ''));
        } catch (e) { }
    }, 4000);
})();
