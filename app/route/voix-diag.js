/* Diagnostic de la voix du guidage (Réglages > Guidage) : état, essai sonore, journal à copier. */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    function state() {
        const T = window.ModuleTTS || (typeof ModuleTTS !== 'undefined' ? ModuleTTS : null); if (!T) return 'Moteur de voix absent';
        const as = (() => { try { return navigator.audioSession ? navigator.audioSession.type : 'indisponible'; } catch (e) { return '?'; } })();
        let on = '?'; try { on = ModuleGPS.voiceOn() ? 'oui' : 'non'; } catch (e) {}
        const l = ['Voix du guidage activée : ' + on, 'Session audio : ' + as, 'Lecteur débloqué : ' + (T._unlocked ? 'oui' : 'non (touche l\'écran une fois)'), 'Clips connus : ' + Object.keys(T.man || {}).length, 'Lecture en cours : ' + (T._playing ? 'oui' : 'non'), 'Service worker : ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'actif' : 'absent')];
        let h = (T.hist || []).slice(); try { h = h.concat((ModuleGPS._vlog || []).filter((x) => !/voix-c/.test(x))); } catch (e) {}
        h.sort();
        return l.join('\n') + '\n— Journal —\n' + (h.length ? h.slice(-30).join('\n') : '(vide)');
    }
    function paint() { const el = $('vx-log'); if (el && el.offsetParent !== null) el.textContent = state(); }
    // erreurs micro de l'intercom : nom, message et pile dans le journal
    try {
        const ce = console.error.bind(console), cw = console.warn.bind(console);
        const grab = (args) => { try { const t = args.map((x) => (x && x.name ? x.name + ': ' + (x.message || '') + ' @ ' + String(x.stack || '').split('\n').slice(0, 3).map((l) => l.trim().slice(0, 90)).join(' < ') : String(x))).join(' ').slice(0, 420); if (/micro|mic\b|Micro/i.test(t)) ModuleTTS.log('console : ' + t); } catch (e) { } };
        console.error = function () { grab([].slice.call(arguments)); return ce.apply(null, arguments); };
        console.warn = function () { grab([].slice.call(arguments)); return cw.apply(null, arguments); };
    } catch (e) { }
    function init() {
        const el = $('vx-log'); if (!el) return;
        const t = $('vx-test'), c = $('vx-copy');
        if (t) t.addEventListener('click', async () => {
            const T = window.ModuleTTS || (typeof ModuleTTS !== 'undefined' ? ModuleTTS : null); const st = $('vx-state'); if (!T) return;
            if (st) st.textContent = 'Essai…';
            try { await T.load(); const ok = await T.speak({ text: 'dans 300 mètres, tournez à droite' }); if (st) st.textContent = ok ? 'Joué avec la voix de Thomas' : 'Échec : voir le journal'; } catch (e) { if (st) st.textContent = 'Erreur : ' + (e && e.message); }
            paint();
        });
        if (c) c.addEventListener('click', async () => { const st = $('vx-state'); try { await navigator.clipboard.writeText(state()); if (st) st.textContent = 'Journal copié'; } catch (e) { if (st) st.textContent = 'Copie impossible'; } });
        setInterval(paint, 1500); paint();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
