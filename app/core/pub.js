// Publicités (AdMob) : uniquement sur la version gratuite, uniquement en natif (plugin Capacitor « AdMob »).
//  - Bannière : en bas, sur les écrans calmes (Accueil, Atelier, Profil, Réglages, Communauté), en portrait, jamais en roulant,
//    jamais avec l'Intercom connecté, jamais par-dessus une fenêtre / l'écran d'abonnement. Placée juste au-dessus de la barre de navigation si elle est en bas.
//  - Plein écran : une fois par lancement (après connexion, compte gratuit) et à la fin d'une sortie d'au moins 5 min ; 3 min minimum entre deux.
//  - Consentement (UMP / RGPD) et suivi iOS (ATT) demandés avant la première pub.
//  - Compte abonné (AppSub.premium) : aucune pub, la bannière disparaît dès que le statut passe à « Actif ».
const AppAds = (() => {
    const CALM = ['view-home', 'view-maintenance', 'view-profile', 'view-settings', 'view-community'];
    const cap = () => { try { return window.Capacitor || null; } catch (e) { return null; } };
    const plug = () => { try { const P = cap() && cap().Plugins; return (P && P.AdMob) || null; } catch (e) { return null; } };
    const platform = () => { try { return cap().getPlatform(); } catch (e) { return 'web'; } };
    const cfg = () => { try { const c = ADS_CONFIG[platform()]; return c && c.banner && c.interstitial ? c : null; } catch (e) { return null; } };
    const opt = (k, d) => { try { return ADS_CONFIG[k] != null ? ADS_CONFIG[k] : d; } catch (e) { return d; } };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const logged = () => { try { return !!AppAuth.has(); } catch (e) { return false; } };
    const premium = () => { try { return AppSub.premium(); } catch (e) { return false; } };
    const riding = () => { try { return !!ModuleDashboard.state.isRiding; } catch (e) { return false; } };
    const talking = () => { try { return !!ModuleIntercom.state.isConnected; } catch (e) { return false; } };
    const busyUI = () => !!document.querySelector('.ad-overlay, #sub-ov');
    const portrait = () => !window.matchMedia('(orientation: landscape)').matches;
    let statusSeen = false, ready = false, initP = null, bannerOn = false, bannerMargin = -1, inter = false, lastInter = 0, startDone = false, timer = 0;
    const knownStatus = () => { try { return statusSeen || AppAuth.cached() != null; } catch (e) { return false; } };
    // Compte gratuit, connecté, statut connu, plugin et identifiants présents
    const eligible = () => !!(plug() && cfg() && logged() && knownStatus() && !premium());
    const slot = () => document.getElementById('ad-slot');

    function init() {
        if (initP) return initP;
        initP = (async () => {
            const A = plug(); if (!A) return false;
            try {
                let ok = true;
                try {
                    let info = await A.requestConsentInfo({});
                    if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') { await A.showConsentForm(); info = await A.requestConsentInfo({}); }
                    if (info && info.status === 'REQUIRED') ok = false;
                } catch (e) {}
                try {
                    if (platform() === 'ios' && A.trackingAuthorizationStatus) {
                        const t = await A.trackingAuthorizationStatus();
                        if (t && t.status === 'notDetermined') await A.requestTrackingAuthorization();
                    }
                } catch (e) {}
                if (!ok) return false;
                await A.initialize({ initializeForTesting: !!opt('testing', true) });
                ready = true; return true;
            } catch (e) { initP = null; return false; }
        })();
        return initP;
    }

    async function hideBanner() {
        const s = slot(); document.body.classList.remove('has-ad');
        if (!bannerOn) return;
        bannerOn = false; bannerMargin = -1;
        try { await plug().removeBanner(); } catch (e) {}
        void s;
    }
    // Place la bannière native à la hauteur exacte de l'emplacement (au-dessus de la barre si elle est en bas)
    async function showBanner() {
        const A = plug(), c = cfg(); if (!A || !c) return;
        document.body.classList.add('has-ad');
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const s = slot(); if (!s) return;
        const margin = Math.max(0, Math.round(window.innerHeight - s.getBoundingClientRect().bottom));
        if (bannerOn && margin === bannerMargin) return;
        if (bannerOn) { try { await A.removeBanner(); } catch (e) {} }
        bannerOn = true; bannerMargin = margin;
        try { await A.showBanner({ adId: c.banner, adSize: 'BANNER', position: 'BOTTOM_CENTER', margin, isTesting: !!opt('testing', true) }); }
        catch (e) { bannerOn = false; bannerMargin = -1; document.body.classList.remove('has-ad'); }
    }
    function wantBanner() {
        if (!eligible() || inter || riding() || talking() || busyUI() || !portrait()) return false;
        const v = document.querySelector('#app-content > .module-view.active');
        return !!(v && CALM.indexOf(v.id) >= 0);
    }
    async function sync() {
        if (!eligible()) { await hideBanner(); return; }
        if (!ready && !(await init())) { await hideBanner(); return; }
        if (wantBanner()) await showBanner(); else await hideBanner();
    }
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => { sync().catch(() => {}); }, 150); };

    // Plein écran : attend qu'aucune fenêtre ne soit ouverte (max 20 s) et que l'utilisateur ne roule pas
    async function interstitial(why) {
        if (!eligible() || inter) return false;
        if (Date.now() - lastInter < opt('minGapMs', 180000) && lastInter) return false;
        for (let i = 0; i < 40 && (busyUI() || riding() || talking()); i++) await sleep(500);
        if (busyUI() || riding() || talking() || !eligible()) return false;
        if (!ready && !(await init())) return false;
        const A = plug(), c = cfg(); inter = true; lastInter = Date.now();
        try {
            await hideBanner();
            await A.prepareInterstitial({ adId: c.interstitial, isTesting: !!opt('testing', true) });
            await A.showInterstitial();
        } catch (e) {} finally { inter = false; soon(); }
        return why || true;
    }

    // Pub de démarrage : une fois par lancement, après connexion d'un compte gratuit
    async function startAd() {
        if (startDone || !eligible()) return;
        startDone = true;
        await sleep(opt('startDelayMs', 3000));
        interstitial('start');
    }
    // Fin de sortie : on surveille le compteur sans toucher à son code
    let rideT0 = 0;
    function watchRide() {
        const r = riding();
        if (r && !rideT0) rideT0 = Date.now();
        else if (!r && rideT0) {
            const dur = Date.now() - rideT0; rideT0 = 0;
            if (dur >= opt('minRideMs', 300000)) setTimeout(() => interstitial('ride'), 1500);
        }
    }

    function boot() {
        document.addEventListener('auth:status', () => { statusSeen = true; soon(); startAd(); });
        document.addEventListener('prefchange', soon);
        window.addEventListener('resize', soon); window.addEventListener('orientationchange', soon);
        try {
            // On ne réagit qu'aux changements utiles (changement d'écran, mode de la barre, fenêtre ouverte/fermée) : le reste (animations du compteur…) est ignoré
            const main = document.getElementById('app-content');
            const mo = new MutationObserver((ms) => { if (ms.some(m => m.type === 'childList' || m.target === document.body || m.target.parentNode === main)) soon(); });
            if (main) mo.observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
            mo.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
        } catch (e) {}
        setInterval(() => { watchRide(); sync().catch(() => {}); startAd(); }, 2000);
        setTimeout(() => { soon(); startAd(); }, 1500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    return { eligible, sync, interstitial, init };
})();
