// ====================================================================
//  VOIX PAR CLIPS pour le guidage de la PWA.
//  La voix de base de l'iPhone (speechSynthesis) coupe la musique des autres applis et ne la relance pas.
//  Ici le guidage est composé de petits clips audio fournis avec l'app (voix/*.m4a : distances, « tournez à droite »…),
//  joués par un lecteur audio avec navigator.audioSession = 'transient' : la musique baisse puis reprend toute seule.
//  Pas de noms de rues dans les clips : une annonce qui ne peut pas être composée (ou un clip absent) retombe sur la voix de base.
//  Même interface que les hooks de map.js : has(texte), speak({text}), stop(), plan().
// ====================================================================
const ModuleTTS = {
    man: null, bad: new Set(), urls: new Map(), loading: null, au: null, _stop: null, _playing: false, KM: [1, 1.5, 2, 2.5, 3, 4, 5, 7, 10],
    hist: [],
    _streams: [],
    // le micro (intercom, commandes vocales) exige une session « play-and-record » ; sinon « ambient » : la musique d'une autre appli n'est jamais coupée
    micOn() {
        try { if (typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state && ModuleIntercom.state.isConnected) return true; } catch (e) { }
        try { if (typeof ModuleRoute !== 'undefined' && ModuleRoute.recWant) return true; } catch (e) { }
        this._streams = this._streams.filter((x) => { try { return x.getAudioTracks().some((t) => t.readyState === 'live'); } catch (e) { return false; } });
        return this._streams.length > 0;
    },
    rest() { try { if (navigator.audioSession) navigator.audioSession.type = this.micOn() ? 'play-and-record' : 'ambient'; } catch (e) { } },
    log(m) { try { const h = this.hist; h.push(new Date().toISOString().slice(11, 19) + ' ' + m); if (h.length > 40) h.shift(); } catch (e) { } try { ModuleGPS.vlog('voix-c', m); } catch (e) { } },
    norm(t) { return String(t).toLowerCase().replace(/\s+/g, ' ').trim(); },

    // manifeste : { clips: { clé: fichier } }
    load() {
        if (this.loading) return this.loading;
        return this.loading = fetch(new URL('voix/index.json', document.baseURI)).then(r => r.ok ? r.json() : null).then(j => { this.man = (j && j.clips) || {}; return this.man; }).catch(() => { this.man = {}; return this.man; });
    },
    has(text) {
        if (!this.man) { this.load(); return false; }
        const keys = this.parse(text); if (!keys) return false;
        if (keys.some(k => this.bad.has(k))) return false;
        keys.forEach(k => this.fetchClip(k));
        return true;
    },
    // distance « 300 mètres » / « 1,2 kilomètres » → clé de clip
    distKey(s) {
        const m = /^(\d+(?:,\d+)?) (mètres?|kilomètres?)$/.exec(s); if (!m) return null; const n = parseFloat(m[1].replace(',', '.'));
        if (/^m/.test(m[2])) { const v = n < 100 ? Math.max(10, Math.round(n / 10) * 10) : Math.min(950, Math.round(n / 50) * 50); return 'dans ' + v + ' mètres'; }
        const k = this.KM.reduce((b, x) => Math.abs(x - n) < Math.abs(b - n) ? x : b, this.KM[0]); return 'dans km:' + k;
    },
    // texte → liste de clés de clips (null si une partie n'a pas de clip)
    parse(text) {
        const t = this.norm(text), D = '(\\d+(?:,\\d+)? (?:mètres?|kilomètres?))';
        let m, out = [];
        if ((m = new RegExp('^dans ' + D + ',\\s*(.+)$').exec(t))) { const d = this.distKey(m[1]); if (!d) return null; out.push(d); return this.body(m[2], out); }
        if ((m = new RegExp('^(.+?) dans ' + D + '$').exec(t))) { const d = this.distKey(m[2]); if (!d || !this.man[m[1]]) return null; return [m[1], d]; }
        return this.body(t, out);
    },
    // « tournez à droite sur la rue X, puis tournez à gauche » → clips de manœuvres, noms de rues ignorés
    body(b, out) {
        const keys = Object.keys(this.man).filter(k => !/^dans /.test(k) && k !== 'puis').sort((a, c) => c.length - a.length);
        let rest = b, guard = 0;
        while (rest && guard++ < 6) {
            const k = keys.find(x => rest === x || rest.startsWith(x + ' ') || rest.startsWith(x + ','));
            if (!k) return null; out.push(k); rest = rest.slice(k.length);
            if (rest.startsWith(' sur ')) { const i = rest.indexOf(', puis '); rest = i < 0 ? '' : rest.slice(i); }
            if (rest.startsWith(', puis ')) { if (!this.man['puis']) return null; out.push('puis'); rest = rest.slice(7); continue; }
            if (rest) return null;
        }
        return rest ? null : out;
    },
    // clips en mémoire (petits fichiers : le guidage ne dépend pas du réseau en roulant)
    fetchClip(k) {
        if (this.urls.has(k)) return this.urls.get(k);
        const f = this.man[k]; if (!f) { this.bad.add(k); return null; }
        const p = fetch(new URL('voix/' + f, document.baseURI)).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(b => { const u = URL.createObjectURL(b); this.urls.set(k, u); return u; }).catch(() => { this.urls.delete(k); this.bad.add(k); return null; });
        this.urls.set(k, p); return p;
    },
    // à l'arrivée d'un itinéraire : tous les clips sont chargés d'avance (quelques Mo)
    plan() { this.load().then(m => { Object.keys(m).forEach(k => this.fetchClip(k)); }); },

    // ----- lecture -----
    audio() {
        if (this.au) return this.au;
        const a = this.au = new Audio(); a.setAttribute('playsinline', ''); a.preload = 'auto';
        // iPhone : un lecteur audio doit avoir été lancé une fois par un geste de l'utilisateur
        const sil = (() => { const n = 800, u = new Uint8Array(44 + n), dv = new DataView(u.buffer), w = (o, t) => { for (let i = 0; i < t.length; i++) u[o + i] = t.charCodeAt(i); }; w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); u.fill(128, 44); return URL.createObjectURL(new Blob([u], { type: 'audio/wav' })); })();
        const unlock = () => { document.removeEventListener('touchend', unlock, true); document.removeEventListener('click', unlock, true); if (this._playing) return; try { this.rest(); a.src = sil; const p = a.play(); if (p && p.then) p.then(() => { this._unlocked = true; this.log('lecteur débloqué'); if (!this._playing) { a.pause(); this.rest(); } }).catch((e) => { this.log('déblocage refusé : ' + (e && e.name)); }); } catch (e) { } };
        document.addEventListener('touchend', unlock, true); document.addEventListener('click', unlock, true);
        return a;
    },
    // résout true si la voix a été jouée, false sinon (l'appelant prend alors la voix de base)
    async speak(o) {
        const keys = this.parse(o.text); if (!keys) { this.log('non composable : ' + o.text); return false; }
        const urls = await Promise.race([Promise.all(keys.map(k => this.fetchClip(k))), new Promise(r => setTimeout(() => r(null), 3000))]);
        if (!urls || urls.some(u => !u)) { this.log('clips indisponibles : ' + o.text); return false; }
        const a = this.audio();
        return new Promise((res) => {
            let i = 0, played = false, done = false, wd = null;
            const set = (t) => { try { if (navigator.audioSession) navigator.audioSession.type = t; } catch (e) { } };
            const end = (ok) => { if (done) return; done = true; this.log(ok ? 'fin : joué' : 'fin : rien joué → voix de base'); clearTimeout(wd); this._playing = false; this._stop = null; this.rest(); a.onended = a.onerror = a.onplaying = null; res(ok); };
            // chien de garde : une lecture qui ne démarre pas ou ne se termine pas ne bloque jamais le guidage
            const arm = (ms) => { clearTimeout(wd); wd = setTimeout(() => { this.log('lecture bloquée'); try { a.pause(); } catch (e) { } end(played); }, ms); };
            this._playing = true; this._stop = () => { try { a.pause(); } catch (e) { } end(true); };
            const next = () => {
                if (i >= urls.length) return end(true);
                a.onended = next; a.onerror = () => end(played);
                a.onplaying = () => { played = true; arm(((isFinite(a.duration) && a.duration) || 6) * 1000 + 2500); };
                a.src = urls[i++]; a.volume = 1; arm(3500);
                const p = a.play(); if (p && p.then) p.then(() => { }).catch((e) => { this.log('lecture refusée : ' + (e && e.name)); end(played); });
            };
            try{const P=ModulePoche;if(P&&P.au&&!P.au.paused){P._selfPause=true;P.au.pause();P._selfPause=false}}catch(e){} set('transient'); next();
        });
    },
    stop() { try { if (this._stop) this._stop(); } catch (e) { } }
};
// Le micro (intercom, réglages) a besoin d'une session audio libre : jamais « ambient » forcé quand on demande le micro
try { const md = navigator.mediaDevices; if (md && md.getUserMedia && navigator.audioSession) { const g = md.getUserMedia.bind(md); md.getUserMedia = function (c) { try { if (c && c.audio) navigator.audioSession.type = 'play-and-record'; } catch (e) { } const r = g(c); try { if (c && c.audio) r.then((st) => { try { ModuleTTS._streams.push(st); } catch (e) { } }).catch(() => { }); } catch (e) { } return r; }; } } catch (e) { }
// détection du micro (état de l'autorisation, liste des micros) : iPhone la refuse en session « ambient » → session micro le temps de la vérification
try {
    const probe = () => { try { if (navigator.audioSession) { navigator.audioSession.type = 'play-and-record'; clearTimeout(ModuleTTS._pt); ModuleTTS._pt = setTimeout(() => ModuleTTS.rest(), 2500); } } catch (e) { } };
    const pm = navigator.permissions; if (pm && pm.query) { const q = pm.query.bind(pm); pm.query = function (d) { try { if (d && d.name === 'microphone') probe(); } catch (e) { } return q(d); }; }
    const md2 = navigator.mediaDevices; if (md2 && md2.enumerateDevices) { const en = md2.enumerateDevices.bind(md2); md2.enumerateDevices = function () { probe(); return en(); }; }
} catch (e) { }
try { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (SR && navigator.audioSession) { const st = SR.prototype.start; SR.prototype.start = function () { try { navigator.audioSession.type = 'play-and-record'; } catch (e) { } if (!this._vx) { this._vx = 1; try { this.addEventListener('end', () => setTimeout(() => ModuleTTS.rest(), 700)); } catch (e) { } } return st.apply(this, arguments); }; } } catch (e) { }
document.addEventListener('DOMContentLoaded', () => { try { ModuleTTS.audio(); ModuleTTS.load(); } catch (e) { } });
