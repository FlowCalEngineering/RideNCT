// Autorisations au premier démarrage + intégration native Capacitor (barre d'état, écran de lancement, bouton retour Android)
//   AppPermissions.open()  -> rouvre l'écran (Réglages > Autorisations)
const AppPermissions = {
    KEY: 'moto_onboarded',
    cap() { try { return window.Capacitor || null; } catch (e) { return null; } },
    plug(n) { try { const c = this.cap(); return (c && c.Plugins && c.Plugins[n]) || null; } catch (e) { return null; } },
    isNative() { try { const c = this.cap(); return !!(c && c.isNativePlatform && c.isNativePlatform()); } catch (e) { return false; } },
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    ST: () => AppStore.obj('moto_perm_state'),
    mark(id, v) { const s = this.ST(); s[id] = v; this.set('moto_perm_state', JSON.stringify(s)); },

    // ---- Les autorisations demandées (chacune expliquée pour que l'utilisateur sache pourquoi) ----
    ITEMS() {
        const list = [
            { id: 'geo', title: 'Position GPS', why: 'Navigation, compteur de vitesse, signalements et radar autour de toi.', ico: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>', main: true },
            { id: 'motion', title: 'Capteurs de mouvement', why: 'Détecter une chute ou un choc violent (mode Sécurité).', ico: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/>' },
            { id: 'mic', title: 'Micro', why: 'Parler avec ton groupe dans l\'Intercom.', ico: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>' },
            { id: 'camera', title: 'Caméra', why: 'Scanner le QR code d\'un canal privé pour le rejoindre.', ico: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>' },
            { id: 'notif', title: 'Notifications', why: 'Alertes d\'entretien, danger sur ta route, SOS d\'un motard proche.', ico: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>' }
        ];
        if (this.plug('Emergency')) list.push({ id: 'phone', title: 'Appel d\'urgence', why: 'Appeler ton contact d\'urgence en cas d\'accident.', ico: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>' });
        return list;
    },

    // ---- Demande réelle de chaque autorisation (natif si dispo, sinon web) ----
    async request(id) {
        try {
            if (id === 'geo') {
                const G = this.plug('Geolocation');
                if (G && G.requestPermissions) { const r = await G.requestPermissions(); return r && (r.location === 'granted' || r.coarseLocation === 'granted'); }
                if (!navigator.geolocation) return false;
                return await new Promise(res => navigator.geolocation.getCurrentPosition(() => res(true), (e) => res(false), { timeout: 15000, maximumAge: 60000 }));
            }
            if (id === 'motion') {
                if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') return (await DeviceMotionEvent.requestPermission()) === 'granted';
                return true;   // Android / navigateur : pas de demande nécessaire
            }
            if (id === 'mic') {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
                const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); return true;
            }
            if (id === 'camera') {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
                const st = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); st.getTracks().forEach(t => t.stop()); return true;
            }
            if (id === 'notif') {
                const L = this.plug('LocalNotifications');
                if (L && L.requestPermissions) { const r = await L.requestPermissions(); return r && r.display === 'granted'; }
                if (typeof Notification === 'undefined') return false;
                return (await Notification.requestPermission()) === 'granted';
            }
            if (id === 'phone') { const N = this.plug('Emergency'); if (N && N.requestPermissions) { await N.requestPermissions({ permissions: ['call'] }); return true; } return false; }
        } catch (e) { return false; }
        return false;
    },
    // État courant quand le navigateur sait le dire
    async status(id) {
        const saved = this.ST()[id]; if (saved === 'ok') return 'ok';
        try {
            const map = { geo: 'geolocation', mic: 'microphone', camera: 'camera', notif: 'notifications' };
            if (map[id] && navigator.permissions && navigator.permissions.query) { const r = await navigator.permissions.query({ name: map[id] }); if (r.state === 'granted') return 'ok'; if (r.state === 'denied') return 'denied'; }
        } catch (e) {}
        return saved === 'denied' ? 'denied' : 'todo';
    },

    async open(first) {
        const old = document.getElementById('perm-overlay'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'perm-overlay'; ov.className = 'perm-overlay';
        const items = this.ITEMS();
        ov.innerHTML = `<style>
            .perm-overlay { position: fixed; inset: 0; z-index: 10050; background: var(--bg-color); display: flex; flex-direction: column; opacity: 0; transition: opacity .25s; }
            .perm-overlay.show { opacity: 1; }
            .perm-body { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: calc(24px + env(safe-area-inset-top)) 18px 12px; }
            .perm-hero { text-align: center; margin-bottom: 18px; }
            .perm-hero svg { width: 64px; height: 64px; color: var(--accent-color); fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
            .perm-hero h1 { font-size: 1.5rem; font-weight: 900; color: var(--text-main); margin: 6px 0 4px; }
            .perm-hero p { font-size: .85rem; color: var(--text-muted); font-weight: 600; line-height: 1.4; }
            .perm-row { display: flex; align-items: center; gap: 12px; background: var(--surface-color); border-radius: 18px; padding: 14px; margin-bottom: 10px; border: 1px solid rgba(128,128,128,.15); }
            .perm-ic { width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0; background: rgba(128,128,128,.14); color: var(--accent-color); display: flex; align-items: center; justify-content: center; }
            .perm-ic svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
            .perm-t { flex: 1; min-width: 0; }
            .perm-t b { display: block; font-size: .95rem; color: var(--text-main); font-weight: 800; }
            .perm-t span { display: block; font-size: .74rem; color: var(--text-muted); font-weight: 600; line-height: 1.35; margin-top: 2px; }
            .perm-btn { flex-shrink: 0; border: none; border-radius: 20px; padding: 9px 14px; font-weight: 800; font-size: .78rem; cursor: pointer; background: var(--accent-color); color: var(--on-accent); font-family: inherit; }
            .perm-btn.ok { background: rgba(48,209,88,.16); color: #30d158; cursor: default; }
            .perm-btn.denied { background: rgba(255,69,58,.14); color: var(--danger-color); }
            .perm-foot { flex-shrink: 0; padding: 10px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(128,128,128,.15); display: flex; flex-direction: column; gap: 8px; }
            .perm-go { border: none; border-radius: 16px; padding: 15px; font-weight: 900; font-size: 1rem; cursor: pointer; background: var(--accent-color); color: var(--on-accent); font-family: inherit; }
            .perm-note { font-size: .7rem; color: var(--text-muted); text-align: center; font-weight: 600; }
        </style>
        <div class="perm-body">
            <div class="perm-hero">
                <svg viewBox="0 0 24 24"><circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5L9 9.5h5.5l2 4"/><path d="M14.5 9.5L16 6h3"/><path d="M9 9.5L7.5 6.5H5"/><path d="M12.5 16.5l2-3.5"/></svg>
                <h1>${first ? 'Bienvenue !' : 'Autorisations'}</h1>
                <p>${first ? 'Pour fonctionner au mieux, l\'app a besoin de quelques autorisations. Tu peux tout refuser et les accorder plus tard dans Réglages.' : 'Voici l\'état des autorisations. Si l\'une est refusée, il faut la réactiver dans les réglages de ton téléphone.'}</p>
            </div>
            ${items.map(it => `<div class="perm-row" data-id="${it.id}"><div class="perm-ic"><svg viewBox="0 0 24 24">${it.ico}</svg></div><div class="perm-t"><b>${it.title}</b><span>${it.why}</span></div><button type="button" class="perm-btn">Autoriser</button></div>`).join('')}
        </div>
        <div class="perm-foot"><button type="button" class="perm-go" id="perm-go">${first ? 'Continuer' : 'Fermer'}</button><div class="perm-note">${first ? 'Tu pourras revenir ici dans Réglages › Autorisations.' : ''}</div></div>`;
        document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('show'));
        const paint = (row, st) => { const b = row.querySelector('.perm-btn'); b.className = 'perm-btn ' + (st === 'ok' ? 'ok' : (st === 'denied' ? 'denied' : '')); b.textContent = st === 'ok' ? '✓ Autorisé' : (st === 'denied' ? 'Refusé · réessayer' : 'Autoriser'); };
        for (const it of items) { const row = ov.querySelector(`[data-id="${it.id}"]`); paint(row, await this.status(it.id)); row.querySelector('.perm-btn').addEventListener('click', async () => {
            if (row.querySelector('.perm-btn').classList.contains('ok')) return;
            const ok = await this.request(it.id); this.mark(it.id, ok ? 'ok' : 'denied'); paint(row, ok ? 'ok' : 'denied');
        }); }
        ov.querySelector('#perm-go').addEventListener('click', () => { this.set(this.KEY, '1'); ov.classList.remove('show'); setTimeout(() => ov.remove(), 250); });
    },

    // ---- Intégration native : barre d'état, écran de lancement, bouton retour ----
    syncStatusBar() {
        const light = document.documentElement.getAttribute('data-mode') === 'light';
        // Couleur de la barre du navigateur / de la PWA : toujours suivre le thème (même sans plugin natif)
        try { let m = document.querySelector('meta[name="theme-color"]'); if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); } m.content = light ? '#f2f2f7' : '#1c1c1e'; } catch (e) {}
        const S = this.plug('StatusBar'); if (!S) return;
        try { S.setStyle({ style: light ? 'LIGHT' : 'DARK' }); } catch (e) {}
        try { S.setBackgroundColor({ color: light ? '#f2f2f7' : '#1c1c1e' }); } catch (e) {}
    },
    nativeInit() {
        if (this.isNative()) { try { const S = this.plug('SplashScreen'); if (S && S.hide) setTimeout(() => S.hide(), 300); } catch (e) {} }
        this.syncStatusBar();
        new MutationObserver(() => this.syncStatusBar()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
        const A = this.plug('App');
        if (A && A.addListener) A.addListener('backButton', () => this.onBack());
    },
    // Bouton retour Android : ferme la fenêtre ouverte, sinon revient en arrière dans l'écran, sinon réduit l'app
    onBack() {
        const sel = ['#perm-overlay', '.ad-overlay', '#rp-overlay', '.at-overlay', '#profile-hud-overlay', '#moto-select-overlay', '.om-overlay'];
        for (const s of sel) { const el = document.querySelector(s); if (el) { const x = el.querySelector('[data-close],.rp-x,#hud-btn-cancel,.perm-go'); if (x) x.click(); else el.remove(); return; } }
        // Mode Expert : recherche / points d'intérêt → panneau déroulé → fermeture de l'éditeur (avec confirmation s'il y a des modifications)
        const xe = document.getElementById('xp-editor');
        if (xe && !xe.hidden && typeof ModuleExpert !== 'undefined') {
            const sb = xe.querySelector('.xp-search .xp-sbk');
            if (sb) sb.click(); else if (ModuleExpert.state() === 'full') ModuleExpert.snap('mid'); else ModuleExpert.close();
            return;
        }
        // Accueil Expert : retour à l'onglet Carte
        const xh = document.getElementById('sub-gps-expert'), gv = document.getElementById('view-gps');
        if (xh && xh.classList.contains('active') && gv && gv.classList.contains('active')) { const cb = document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]'); if (cb) { cb.click(); return; } }
        if (window.AppNav && AppNav.isOpen()) { AppNav.close(); return; }
        const mt = document.getElementById('view-maintenance');
        if (mt && mt.classList.contains('active') && mt.classList.contains('at-page')) { const b = document.getElementById('at-back'); if (b) b.click(); return; }
        const A = this.plug('App'); if (A && A.minimizeApp) A.minimizeApp();
    },
    init() {
        document.addEventListener('click', (e) => { if (e.target.closest('[data-open-perms]')) this.open(false); });
        this.nativeInit();
        if ((typeof AppAuth !== 'undefined') && !AppAuth.has()) return;   // derrière l'écran d'accès : les autorisations sont demandées après la connexion
        if (!this.get(this.KEY)) setTimeout(() => this.open(true), 900);
    }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => AppPermissions.init()); else AppPermissions.init();
