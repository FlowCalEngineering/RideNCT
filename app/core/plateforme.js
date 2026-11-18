// Plateforme : natif (Capacitor), PWA installée (écran d'accueil) ou simple navigateur. Une seule appli pour les trois.
//  - AppPlatform.native    : appli Android/iOS (achats, publicité AdMob, plugins natifs)
//  - AppPlatform.pwa       : web installée sur l'écran d'accueil (display-mode standalone)
//  - AppPlatform.web       : navigateur (non installée)
//  - AppPlatform.store     : true si l'achat se fait par le store (natif seulement) ; sinon l'abonnement passe par le site
// Enregistre aussi le service worker (hors connexion) et propose l'installation sur iPhone / Android.
const AppPlatform = (() => {
    const ua = navigator.userAgent || '';
    const cap = (() => { try { return window.Capacitor || null; } catch (e) { return null; } })();
    const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
    const standalone = !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const P = { native, standalone, ios, android, pwa: !native && standalone, web: !native && !standalone, store: native, tarifs: 'https://ridenct.fr/tarifs.html' };
    P.kind = native ? 'native' : standalone ? 'pwa' : 'web';
    try { document.documentElement.setAttribute('data-platform', P.kind); } catch (e) {}

    // ---- Service worker (appli web seulement, en HTTPS) ----
    if (!native && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        window.addEventListener('load', () => { try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {} });
    }

    // ---- Invitation à installer (navigateur mobile uniquement) ----
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
    const KEY = 'moto_install';
    const seen = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
    const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
    const canAsk = () => {
        if (!P.web || !(P.ios || P.android)) return false;
        if (P.android && !deferred) return false;           // Android : seulement si le navigateur propose l'installation
        const s = seen(); if (s.never) return false;
        if (s.later && Date.now() - s.later < 14 * 864e5) return false;
        try { if (localStorage.getItem('moto_onboarded') !== '1') return false; } catch (e) { return false; }   // pas pendant la présentation
        return !document.getElementById('sub-ov');
    };
    function close(el) { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }
    function askInstall(force) {
        if (document.getElementById('pf-inst') || (!force && !canAsk())) return false;
        const el = document.createElement('div'); el.id = 'pf-inst'; el.className = 'pf-inst';
        const steps = P.ios
            ? '<div class="pf-st"><i>1</i><span>Touche <b>Partager</b> <svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg> dans Safari</span></div>' +
              '<div class="pf-st"><i>2</i><span>Choisis <b>Sur l\'écran d\'accueil</b></span></div><div class="pf-st"><i>3</i><span>Touche <b>Ajouter</b></span></div>'
            : '<p class="pf-p">Un raccourci sur ton écran d\'accueil, en plein écran.</p>';
        el.innerHTML = '<div class="pf-sh"><h2>Installe <b>RideNCT</b> sur ton ' + (P.ios ? 'iPhone' : 'téléphone') + '</h2>' +
            '<p class="pf-p">Pour l\'utiliser comme une vraie appli, en plein écran :</p>' + steps +
            '<button type="button" class="pf-go" id="pf-ok"><span>' + (P.ios ? 'Compris' : 'Installer') + '</span></button><button type="button" class="pf-lk" id="pf-later">Plus tard</button></div>';
        document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
        el.querySelector('#pf-ok').onclick = async () => {
            if (!P.ios && deferred) { try { deferred.prompt(); await deferred.userChoice; } catch (e) {} deferred = null; }
            save({ never: 1 }); close(el);
        };
        el.querySelector('#pf-later').onclick = () => { save({ later: Date.now() }); close(el); };
        return true;
    }
    P.askInstall = askInstall;
    window.addEventListener('load', () => setTimeout(() => { try { askInstall(false); } catch (e) {} }, 4000));
    return P;
})();
