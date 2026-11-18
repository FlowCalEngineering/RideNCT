// Abonnement RideNCT (RevenueCat) : écran plein écran, achat, restauration, gestion.
// - Achat natif uniquement (plugin Capacitor « Purchases ») ; en PWA / navigateur, l'écran renvoie vers la page Tarifs du site.
// - app_user_id RevenueCat = id Supabase du compte (le webhook « revenuecat-webhook » met à jour public.subscriptions).
// - Le serveur reste la source de vérité : après un achat on relit l'état du compte (AppAuth.status) jusqu'à « Actif ».
const AppSub = (() => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const cap = () => { try { return window.Capacitor || null; } catch (e) { return null; } };
    const plug = () => { try { const P = cap() && cap().Plugins; return (P && P.Purchases) || null; } catch (e) { return null; } };
    const platform = () => { try { return cap().getPlatform(); } catch (e) { return 'web'; } };
    const key = () => { const p = platform(); return typeof RC_CONFIG === 'undefined' ? '' : (p === 'ios' ? RC_CONFIG.iosKey : p === 'android' ? RC_CONFIG.androidKey : ''); };
    const uid = () => { try { const u = AppAuth.user(); return u && u.id; } catch (e) { return null; } };
    const available = () => !!(plug() && key() && uid());
    const err = (m) => { try { return AppDialog.alert(m, { title: 'Abonnement' }); } catch (e) { return Promise.resolve(); } };

    // Configuration au lancement (une fois) avec l'identifiant du compte
    let ready = null;
    function init() {
        if (ready) return ready;
        if (!available()) return Promise.resolve(false);
        ready = (async () => { try { await plug().configure({ apiKey: key(), appUserID: uid() }); return true; } catch (e) { ready = null; return false; } })();
        return ready;
    }
    async function logOut() { try { if (plug() && (await init())) await plug().logOut(); } catch (e) {} }

    // Forfaits de l'offre courante : { pkg, price (mensuel, compatibilité), m: mensuel, y: annuel } — chacun { pkg, price, num, cur, trial }
    const DAYS = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
    function trialOf(prod) {   // essai gratuit proposé par le store (prix d'introduction à 0) → nombre de jours, sinon 0
        try { const i = prod && prod.introPrice; if (!i || Number(i.price) !== 0) return 0; const n = Number(i.periodNumberOfUnits) || 0, u = DAYS[String(i.periodUnit || '').toUpperCase()] || 0; return n * u; } catch (e) { return 0; }
    }
    const planOf = (pkg) => { const pr = pkg.product || {}; return { pkg, price: pr.priceString || '', num: Number(pr.price) || 0, cur: pr.currencyCode || '', trial: trialOf(pr) }; };
    async function offer() {
        if (!(await init())) return null;
        try {
            const o = await plug().getOfferings(), cur = o && o.current, list = (cur && cur.availablePackages) || [];
            const mp = list.find(p => p.packageType === 'MONTHLY'), yp = list.find(p => p.packageType === 'ANNUAL');
            const m = mp ? planOf(mp) : null, y = yp ? planOf(yp) : null, first = m || y || (list[0] ? planOf(list[0]) : null);
            if (!first) return null;
            if (m && m.price) try { localStorage.setItem('moto_sub_price', m.price); } catch (e) {}
            return { pkg: (m || first).pkg, price: (m || first).price, m: m || (y ? null : first), y };
        } catch (e) { return null; }
    }

    // Après un achat / une restauration : le webhook met quelques secondes à écrire en base
    async function refresh() {
        for (let i = 0; i < 10; i++) {
            let st = null; try { st = await AppAuth.status(true); } catch (e) {}
            if (st && st.k === 'active') return true;
            await sleep(1500);
        }
        return false;
    }

    function close(ov) { ov.classList.remove('show'); setTimeout(() => ov.remove(), 250); }
    async function open() {
        if (document.getElementById('sub-ov')) return;
        const can = available();   // achat possible (appli mobile + clés RevenueCat) ; sinon l'écran s'affiche quand même
        const ov = document.createElement('div'); ov.id = 'sub-ov'; ov.className = 'sub-ov';
        ov.innerHTML = '<div class="sub-art"></div>' +
            '<button type="button" class="sub-x" aria-label="Fermer"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
            '<div class="sub-in"><h1 class="sub-t">Roule sans <b>limites</b></h1><div class="sub-s">Tout RideNCT, sans publicité.</div>' +
            '<div class="sub-ls">' + ['Radar des amis', 'Groupes privés et illimités', 'Partage de musique et d\'itinéraire', 'Cartes hors ligne et GPS expert', 'Plusieurs motos et 11 thèmes', 'Aucune publicité'].map(t => '<div class="sub-li"><i></i>' + t + '</div>').join('') + '</div></div>' +
            '<div class="sub-bt"><div class="sub-plans" id="sub-pl"></div>' +
            '<button type="button" class="sub-go" id="sub-go" disabled><span id="sub-gt">S\'abonner</span></button>' +
            '<div class="sub-sb" id="sub-sb">Sans engagement · résiliable à tout moment</div>' +
            '<button type="button" class="sub-lk" id="sub-rs">Restaurer mes achats</button>' +
            '<div class="sub-lg">Paiement débité sur ton compte ' + (platform() === 'ios' ? 'Apple' : 'Google Play') + '. Renouvellement automatique sauf résiliation au moins 24 h avant la fin de la période.</div></div>';
        document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('show'));
        // PWA / navigateur : pas d'achat par un store ; l'abonnement se prend sur le site (même compte), le statut est lu sur le serveur
        if (typeof AppPlatform !== 'undefined' && !AppPlatform.native) {
            ov.querySelector('.sub-bt').innerHTML = '<div class="sub-na2"><b>Abonnement sur le site</b><span>Souscris sur ridenct.fr avec ton compte RideNCT : tout se débloque ici dès que ton abonnement est actif.</span></div>' +
                '<button type="button" class="sub-go" id="sub-go"><span>S\'abonner sur le site</span></button><div class="sub-sb">Sans engagement · résiliable à tout moment</div>';
            ov.querySelector('.sub-x').onclick = () => close(ov);
            ov.querySelector('#sub-go').onclick = () => { try { window.open(AppPlatform.tarifs, '_blank', 'noopener'); } catch (e) { location.href = AppPlatform.tarifs; } };
            return;
        }
        const $ = (s) => ov.querySelector(s); let off = null, busy = false, sel = 'y', plans = {};
        const esc = (t) => String(t == null ? '' : t).replace(/[&<>]/g, '');
        $('.sub-x').onclick = () => close(ov);
        const lock = (b) => { busy = b; $('#sub-go').disabled = b || !plans[sel] || !off; $('#sub-rs').disabled = b; $('#sub-go').classList.toggle('busy', b); };
        const noBuy = () => err('L\'abonnement se souscrit depuis l\'application mobile RideNCT (Android ou iOS).');
        const per = (k) => (k === 'y' ? ' / an' : ' / mois');
        // Affiche les cartes Annuel / Mensuel (seulement celles proposées) puis le bouton selon le forfait choisi
        function render() {
            const keys = ['y', 'm'].filter(k => plans[k]); if (!keys.includes(sel)) sel = keys[0] || 'm';
            const y = plans.y, m = plans.m; let tag = '', eq = '';
            if (y && m && y.num && m.num && m.num * 12 > y.num) { const pc = Math.round((1 - y.num / (m.num * 12)) * 100); if (pc > 0) tag = '<span class="sub-tag">-' + pc + ' %</span>'; }
            if (y && y.num && y.cur) { try { eq = 'soit ' + new Intl.NumberFormat('fr-FR', { style: 'currency', currency: y.cur }).format(y.num / 12) + ' / mois'; } catch (e) {} }
            $('#sub-pl').innerHTML = keys.map(k => { const q = plans[k]; return '<button type="button" class="sub-pl' + (k === sel ? ' on' : '') + '" data-k="' + k + '">' + (k === 'y' ? tag : '') + '<b>' + (k === 'y' ? 'Annuel' : 'Mensuel') + '</b><strong>' + (esc(q.price) || '&nbsp;') + '</strong><small>' + (k === 'y' ? esc(eq) || 'par an' : 'par mois') + '</small></button>'; }).join('');
            $('#sub-pl').querySelectorAll('.sub-pl').forEach(bt => { bt.onclick = () => { if (busy) return; sel = bt.dataset.k; render(); }; });
            const q = plans[sel], t = q && q.trial;
            $('#sub-gt').textContent = t ? 'Essayer ' + t + ' jour' + (t > 1 ? 's' : '') + ' gratuit' + (t > 1 ? 's' : '') : 'S\'abonner';
            $('#sub-sb').textContent = t && q.price ? 'Puis ' + q.price + per(sel) + ' · Sans engagement, résiliable à tout moment' : 'Sans engagement · résiliable à tout moment';
            $('#sub-go').disabled = busy || !q || (can && !off);
        }
        if (!can) {   // navigateur ou clés absentes : on montre l'écran avec les derniers prix connus
            const cfg = (typeof RC_CONFIG !== 'undefined' && RC_CONFIG) || {};
            plans = { y: { price: cfg.priceLabelAnnual || '24,99 €' }, m: { price: price() || cfg.priceLabel || '2,99 €' } }; render(); $('#sub-go').disabled = false;
        } else { plans = { m: { price: price() || '' } }; render(); offer().then((o) => {
            off = o;
            if (!o) { $('#sub-pl').innerHTML = '<div class="sub-na">Prix indisponible</div>'; return; }
            plans = {}; if (o.y) plans.y = o.y; if (o.m) plans.m = o.m; sel = o.y ? 'y' : 'm'; render();
        }); }
        $('#sub-go').onclick = async () => {
            if (!can) { await noBuy(); return; }
            if (busy || !off || !plans[sel]) return; lock(true);
            try {
                await plug().purchasePackage({ aPackage: plans[sel].pkg });
                close(ov); refresh();
            } catch (e) {
                lock(false);
                if (!(e && (e.userCancelled || /cancel/i.test(String(e.code || e.message || ''))))) await err('L\'achat n\'a pas abouti. Aucun paiement n\'a été effectué si le message du store l\'indique. Réessaie dans un instant.');
            }
        };
        $('#sub-rs').onclick = async () => {
            if (!can) { await noBuy(); return; }
            if (busy) return; lock(true);
            try {
                const r = await plug().restorePurchases(), ci = r && (r.customerInfo || r), act = ci && ci.entitlements && ci.entitlements.active;
                lock(false);
                if (act && Object.keys(act).length) { close(ov); refresh(); } else await err('Aucun abonnement à restaurer sur ce compte store.');
            } catch (e) { lock(false); await err('Impossible de restaurer les achats pour le moment. Réessaie dans un instant.'); }
        };
    }

    // ---- Fonctions réservées aux abonnés ----
    // premium() : compte « Actif » (état lu sur le serveur, gardé en cache hors ligne). Banni ou inactif = gratuit.
    const premium = () => { try { const st = AppAuth.cached(); return !!(st && st.k === 'active'); } catch (e) { return false; } };
    // gate() : true si l'accès est permis ; sinon ouvre l'écran d'abonnement et renvoie false
    const gate = () => { if (premium()) return true; try { open(); } catch (e) {} return false; };

    // Pastilles « 🔒 Abonnement » sur les fonctions bloquées (réaffichées à chaque changement de l'écran)
    const LK = '<span class="lk" data-lk><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Abonnement</span>';
    // [sélecteur, où poser la pastille (null = pas de pastille, icône seulement), condition de blocage]
    const MARKS = [
        ['#radar-toggle-friends', (e) => { const l = e.parentElement && e.parentElement.querySelectorAll('div'); return (l && l.length) ? l[l.length - 1] : e.parentElement; }, () => true],
        ['[data-sgo="set-sub-offline"] .t', (e) => e, () => true],
        ['#ic-music-share-btn', (e) => e, () => true],
        ['#ic-route-share-btn', (e) => e, () => true],
        ['#btn-add-moto', (e) => e, () => { try { return ModuleProfile.state.motos.length >= 1; } catch (e) { return false; } }],
        ['#hud-privacy-desc', (e) => e, () => true],
        ['#style-grid .style-tile:not([data-style="standard"])', (e) => e, () => true],
        ['.gps-tab-btn[data-sub="sub-gps-expert"]', null, () => true]
    ];
    function marks() {
        const free = !premium();
        MARKS.forEach(([sel, host, cond]) => document.querySelectorAll(sel).forEach((el) => {
            const on = free && cond(), h = host ? host(el) : el, has = host ? (h && h.querySelector(':scope > [data-lk]')) : el.classList.contains('lk-ico');
            if (on && !has) { if (host) { if (h) h.insertAdjacentHTML('beforeend', LK); } else el.classList.add('lk-ico'); }
            else if (!on && has) { if (host) h.querySelector(':scope > [data-lk]').remove(); else el.classList.remove('lk-ico'); }
            el.classList.toggle('lkd', on);
        }));
    }
    let mt = 0; const soon = () => { clearTimeout(mt); mt = setTimeout(() => { try { marks(); } catch (e) {} }, 150); };
    try { new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    // Changement d'état du compte : on réapplique ce qui dépend de l'abonnement (style visuel, radar)
    document.addEventListener('auth:status', () => {
        soon();
        try { if (!premium() && typeof AppStyles !== 'undefined') AppStyles.apply(); } catch (e) {}
        try { if (!premium() && typeof ModuleCommunity !== 'undefined' && ModuleCommunity.state.radarMode === 'friends') ModuleCommunity.setRadarMode('all', { restore: true }); } catch (e) {}
    });

    // Gérer un abonnement actif (page du store)
    async function manage() {
        let url = '';
        try { if (plug() && (await init())) { const r = await plug().getCustomerInfo(); url = (r && (r.customerInfo || r).managementURL) || ''; } } catch (e) {}
        if (!url) url = platform() === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions';
        try { window.open(url, '_blank'); } catch (e) {}
    }

    // Lancement : configuration silencieuse pour que le compte soit déjà identifié chez RevenueCat
    const price = () => { try { return localStorage.getItem('moto_sub_price') || ''; } catch (e) { return ''; } };
    const boot = () => setTimeout(() => { try { init().then(ok => ok && offer()); } catch (e) {} }, 2000);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    return { available, open, manage, logOut, offer, init, price, premium, gate, marks };
})();
