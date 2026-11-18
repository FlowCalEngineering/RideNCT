/* Navigation latérale : ouverture au glissé depuis le bord droit, défilement, pastille de sous-onglets */
(function () {
    const wrap = document.getElementById('pill-nav-wrap'), nav = document.getElementById('main-nav-bar'),
        box = document.querySelector('.pill-nav-container'), sub = document.getElementById('nav-sub'),
        grip = document.getElementById('nav-grip'), scrim = document.getElementById('nav-scrim');
    if (!wrap || !nav || !box) return;
    // 5 entrées → sous-entrées {t: titre, v: vue, tab: onglet interne à cliquer, cm: bascule du Roadbook (mine|comm), opt: affiché seulement si l'onglet existe}
    const CMRB = { t: 'Roadbook communautaire', v: 'view-gps', tab: '.gps-tab-btn[data-sub="sub-gps-myroadbook"]', cm: 'comm', shared: 1, ic: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' };
    const GROUPS = {
        route: [{ t: 'Route', v: 'view-dashboard' }, { t: 'Musique', v: 'view-music' }, { t: 'Météo', v: 'view-weather' }, { t: 'Intercom', v: 'view-intercom' }],
        carte: [{ t: 'Carte', v: 'view-gps', tab: '.gps-tab-btn[data-sub="sub-gps-carte"]' }, { t: 'Roadbook', v: 'view-gps', tab: '.gps-tab-btn[data-sub="sub-gps-myroadbook"]', cm: 'mine' },
            { t: 'Bibliothèque', v: 'view-gps', tab: '.gps-tab-btn[data-sub="sub-gps-roadbooks"]' }, { t: 'Expert', v: 'view-gps', tab: '.gps-tab-btn[data-sub="sub-gps-expert"]', opt: 1 }, CMRB],
        comm: [{ t: 'Radar', v: 'view-community', tab: '.comm-tab-btn[data-sub="sub-comm-radar"]' }, { t: 'Croisés', v: 'view-community', tab: '.comm-tab-btn[data-sub="sub-comm-croise"]' },
            { t: 'Invitations', v: 'view-community', tab: '.comm-tab-btn[data-sub="sub-comm-demandes"]' }, { t: 'Amis', v: 'view-community', tab: '.comm-tab-btn[data-sub="sub-comm-amis"]' },
            { t: 'Évènements', v: 'view-community', tab: '.comm-tab-btn[data-sub="sub-comm-events"]' }, CMRB],
        moi: [{ t: 'Profil', v: 'view-profile' }, { t: 'Atelier', v: 'view-maintenance' }, { t: 'Sécurité', v: 'view-security' }]
    };
    const GORDER = ['route', 'carte', 'comm', 'moi'];
    const $ = (q) => document.querySelector(q);
    const legacyIcon = (v) => { const o = $('.nav-legacy .nav-btn[data-target="' + v + '"] svg'); return o ? o.outerHTML : ''; };
    const subIcon = (d) => d.ic ? '<svg viewBox="0 0 24 24"><path d="' + d.ic + '"></path></svg>' : (d.tab && $(d.tab) && $(d.tab).querySelector('svg')) ? $(d.tab).querySelector('svg').outerHTML : legacyIcon(d.v);
    const viewOn = (v) => { const e = document.getElementById(v); return !!(e && e.classList.contains('active')); };
    const cmMode = () => { const b = $('#cm-seg button.on'); return b && b.dataset.t === 'comm' ? 'comm' : 'mine'; };
    const subOn = (d) => viewOn(d.v) && (!d.tab || ($(d.tab) && $(d.tab).classList.contains('active'))) && (!d.cm || cmMode() === d.cm);
    const subShown = (d) => { if (!d.opt) return true; const o = d.tab && $(d.tab); return !!(o && !o.hidden && o.style.display !== 'none'); };
    let lastG = null;
    const groupOf = () => { if (lastG && GROUPS[lastG].some(subOn)) return lastG; for (const g of GORDER) if (GROUPS[g].some(subOn)) return g; for (const g of GORDER) if (GROUPS[g].some(d => viewOn(d.v))) return g; return viewOn('view-home') ? 'home' : null; };
    const MEM = 'nav_sub_mem';
    const mem = () => { try { return JSON.parse(localStorage.getItem(MEM) || '{}'); } catch (e) { return {}; } };
    const remember = (g, i) => { try { const m = mem(); m[g] = i; localStorage.setItem(MEM, JSON.stringify(m)); } catch (e) {} };
    const goSub = (g, d) => {
        if (typeof AppManager !== 'undefined') AppManager.switchView(d.v);
        if (d.tab) { const t = $(d.tab); if (t && !t.classList.contains('active')) t.click(); }
        if (d.cm) { const b = $('#cm-seg button[data-t="' + d.cm + '"]'); if (b && !b.classList.contains('on')) b.click(); }
        lastG = g; if (!d.shared) remember(g, GROUPS[g].indexOf(d));   // « Roadbook communautaire » est commun à Carte et Communauté : on ne le mémorise pas comme entrée par défaut
        syncActive();
    };
    // Titre de l'écran Communauté = nom du sous-onglet affiché
    const CT = { 'sub-comm-radar': 'Radar', 'sub-comm-croise': 'Croisés', 'sub-comm-demandes': 'Invitations', 'sub-comm-amis': 'Amis', 'sub-comm-events': 'Évènements' };
    document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.comm-tab-btn'); if (!b) return;
        const h = $('#view-community .module-header'); if (h && CT[b.dataset.sub]) h.textContent = CT[b.dataset.sub];
    });
    // Titre des écrans Carte (hors carte plein écran) = nom du sous-onglet
    const gpsTitle = () => {
        const h = $('#gps-title'); if (!h) return;
        const t = $('#view-gps .gps-tab-btn.active'), sub = t ? t.dataset.sub : '';
        const on = viewOn('view-gps') && sub && sub !== 'sub-gps-carte';
        h.style.display = on ? '' : 'none';
        h.textContent = sub === 'sub-gps-myroadbook' ? (cmMode() === 'comm' ? 'Roadbook communautaire' : 'Roadbook') : sub === 'sub-gps-roadbooks' ? 'Bibliothèque' : sub === 'sub-gps-expert' ? 'Carte expert' : '';
    };
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.gps-tab-btn, #cm-seg button, .nav-btn, #nav-sub button')) setTimeout(gpsTitle, 80); });
    document.addEventListener('viewchange', () => setTimeout(gpsTitle, 80));
    const FALLBACK = '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>';   // bouton sans icône (ex. Accueil de l\'Atelier)
    const B = document.body;
    let timer = 0;
    const bottom = () => B.classList.contains('nav-bottom');
    const applyMode = () => { let m = 'side', st = 'classic'; try { m = AppPrefs.get('nav'); st = AppPrefs.get('navStyle'); if (m === 'slim') { m = 'side'; st = 'slim'; } } catch (e) {} B.classList.toggle('nav-bottom', m === 'bottom'); B.classList.toggle('nav-slim', st === 'slim'); hideSub(); if (m === 'bottom') B.classList.remove('nav-open'); setTimeout(() => { update(); reveal(); }, 60); };
    const isOpen = () => B.classList.contains('nav-open');
    const vertical = () => !bottom() || window.matchMedia('(orientation: landscape)').matches;
    const update = () => {
        const v = vertical(), pos = v ? nav.scrollTop : nav.scrollLeft, max = v ? nav.scrollHeight - nav.clientHeight : nav.scrollWidth - nav.clientWidth;
        wrap.classList.toggle('can-prev', pos > 4);
        wrap.classList.toggle('can-next', max > 4 && pos < max - 4);
    };
    const reveal = () => { const a = nav.querySelector('.nav-btn.active'); if (a) { try { a.scrollIntoView(vertical() ? { block: 'center', inline: 'nearest' } : { inline: 'center', block: 'nearest' }); } catch (e) {} } setTimeout(update, 60); };
    let closing = false;
    const autoClose = (ms) => { clearTimeout(timer); closing = (ms || 0) < 1000; timer = setTimeout(() => api.close(), ms || 4500); };
    let subFor = null;
    const slim = () => B.classList.contains('nav-slim');
    const hideSub = () => { sub.classList.remove('on'); B.classList.remove('nav-compact'); if (subFor) subFor.classList.remove('sub-src'); subFor = null; };
    const place = (btn) => {
        const r = btn.getBoundingClientRect(), c = box.getBoundingClientRect(), above = bottom() && !window.matchMedia('(orientation: landscape)').matches;
        sub.classList.toggle('above', above);
        const sw = sub.offsetWidth, sh = sub.offsetHeight;
        if (above) {
            let x = r.left + r.width / 2 - sw / 2; x = Math.max(8, Math.min(x, window.innerWidth - sw - 8));
            sub.style.left = (x - c.left) + 'px'; sub.style.top = ''; sub.style.right = '';
            const t = Math.max(18, Math.min(sw - 18, r.left + r.width / 2 - x));
            sub.style.setProperty('--tx', t + 'px'); sub.style.setProperty('--ox', t + 'px'); sub.style.setProperty('--oy', '100%');
        } else {
            let y = r.top + r.height / 2 - sh / 2; y = Math.max(8, Math.min(y, window.innerHeight - sh - 8));
            sub.style.top = (y - c.top) + 'px'; sub.style.left = ''; sub.style.right = '';
            const t = Math.max(18, Math.min(sh - 18, r.top + r.height / 2 - y));
            sub.style.setProperty('--ty', t + 'px'); sub.style.setProperty('--oy', t + 'px'); sub.style.setProperty('--ox', '100%');
        }
    };
    const showSub = (btn) => {
        const g = btn && btn.dataset.group, list = g ? GROUPS[g].filter(subShown) : [];
        hideSub(); sub.innerHTML = '';
        if (list.length < 2) return false;
        list.forEach((d, i) => {
            const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--i', i);
            b.innerHTML = subIcon(d) || FALLBACK; b.title = d.t; b.setAttribute('aria-label', d.t); b.dataset.t = d.t;
            b.classList.toggle('active', subOn(d));
            b.addEventListener('click', () => { goSub(g, d); sub.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); const sl = sub.querySelector('.sl'); if (sl) sl.textContent = d.t; if (bottom()) setTimeout(hideSub, 380); else autoClose(450); });
            sub.appendChild(b);
        });
        const lab = document.createElement('span'); lab.className = 'sl'; const cur = list.find(subOn); lab.textContent = cur ? cur.t : ''; sub.appendChild(lab);
        subFor = btn; btn.classList.remove('sub-src'); void btn.offsetWidth; btn.classList.add('sub-src');
        if (slim()) B.classList.add('nav-compact');
        place(btn);
        requestAnimationFrame(() => { place(btn); sub.classList.add('on'); });
        setTimeout(() => { if (subFor === btn) place(btn); }, 340);
        return true;
    };
    function syncActive() {
        const g = groupOf();
        nav.querySelectorAll('.nav-btn[data-group]').forEach(b => b.classList.toggle('active', b.dataset.group === g));
        if (subFor && sub.classList.contains('on')) { const list = GROUPS[subFor.dataset.group].filter(subShown); sub.querySelectorAll('button').forEach((x, i) => x.classList.toggle('active', !!list[i] && subOn(list[i]))); const sl = sub.querySelector('.sl'), cu = list.find(subOn); if (sl && cu) sl.textContent = cu.t; }
        const d = document.getElementById('nav-moi-dot'), o = document.getElementById('nav-pf-new'); if (d && o) d.hidden = o.hidden;
        const gear = document.getElementById('nav-gear'); if (gear) gear.classList.toggle('on', viewOn('view-settings'));
    }
    const api = window.AppNav = {
        isOpen,
        open() { if (bottom()) return; B.classList.add('nav-open'); reveal(); autoClose(5000); },
        close() { clearTimeout(timer); closing = false; B.classList.remove('nav-open'); hideSub(); },
        toggle() { isOpen() ? api.close() : api.open(); },
        // Glissé d'écran : passe à l'écran voisin dans l'ordre du menu (Accueil → Route, Musique, Météo, Intercom → Carte, Roadbook… → Communauté… → Moi…). dir > 0 = suivant. Renvoie false hors de cet ordre (Réglages…)
        step(dir) {
            const flat = [{ g: 'home' }]; GORDER.forEach(g => GROUPS[g].filter(d => subShown(d) && !(d.shared && g === 'carte')).forEach(d => flat.push({ g, d })));
            let i = flat.findIndex(x => x.d ? subOn(x.d) : viewOn('view-home')); if (i < 0) return false;
            const j = i + (dir > 0 ? 1 : -1); if (j < 0 || j >= flat.length) return true;
            const t = flat[j]; if (!t.d) { AppManager.switchView('view-home'); lastG = null; syncActive(); } else goSub(t.g, t.d);
            return true;
        }
    };
    nav.addEventListener('scroll', () => { update(); if (isOpen() && !closing) autoClose(5000); }, { passive: true });
    window.addEventListener('resize', () => { hideSub(); update(); if (isOpen() || bottom()) reveal(); });
    document.addEventListener('prefchange', (e) => { if (e.detail && (e.detail.key === 'nav' || e.detail.key === 'navStyle')) applyMode(); });
    const buttons = [...document.querySelectorAll('.pill-nav-container .nav-btn')].filter(b => !b.closest('.nav-legacy'));
    buttons.forEach((b, i) => {
        b.style.setProperty('--i', i);
        b.addEventListener('click', () => {
            const g = b.dataset.group;
            if (g && !GROUPS[g].some(d => !d.shared && subOn(d))) {      // entrée d'un autre groupe : on ouvre le dernier sous-onglet utilisé
                const list = GROUPS[g].filter(subShown), i0 = mem()[g], d = list.find(x => GROUPS[g].indexOf(x) === i0) || list[0];
                goSub(g, d);
            }
            if (!isOpen() && !bottom()) return;
            const lat = !bottom();
            if (subFor === b && sub.classList.contains('on')) { hideSub(); if (lat) autoClose(5000); }
            else if (showSub(b)) { if (lat) autoClose(6000); }
            else { hideSub(); if (lat) autoClose(220); }
        });
        new MutationObserver(() => { if (subFor) setTimeout(() => { if (subFor && !subFor.classList.contains('active')) hideSub(); }, 0); if (isOpen() || bottom()) reveal(); }).observe(b, { attributes: true, attributeFilter: ['class'] });
    });
    // Engrenage Réglages (haut droite, sur tous les écrans) : un 2e toucher revient à l'écran précédent
    let prev = 'view-home';
    const gear = document.getElementById('nav-gear');
    if (gear) gear.addEventListener('click', () => {
        if (viewOn('view-settings')) { AppManager.switchView(prev && prev !== 'view-settings' ? prev : 'view-home'); return; }
        const a = document.querySelector('.module-view.active'); prev = a ? a.id : 'view-home';
        api.close(); AppManager.switchView('view-settings');
    });
    let raf = 0; const sched = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(syncActive); };
    const ac = document.getElementById('app-content');
    if (ac) new MutationObserver(sched).observe(ac, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    document.addEventListener('viewchange', () => { if (lastG && !GROUPS[lastG].some(subOn)) lastG = null; syncActive(); });
    const pfn = document.getElementById('nav-pf-new'); if (pfn) new MutationObserver(syncActive).observe(pfn, { attributes: true, attributeFilter: ['hidden'] });
    syncActive();
    grip.addEventListener('click', () => api.open());
    scrim.addEventListener('click', () => api.close());
    // Glissé depuis le bord droit vers l'intérieur : ouvre ; glissé vers la droite sur la capsule : ferme
    let sx = 0, sy = 0, from = null, done = false;
    document.addEventListener('touchstart', (e) => {
        const t = e.touches && e.touches[0]; if (!t) return; sx = t.clientX; sy = t.clientY; done = false;
        from = bottom() ? null : (!isOpen() && sx >= window.innerWidth - 26) ? 'edge' : (isOpen() && e.target && e.target.closest && e.target.closest('.pill-nav-container')) ? 'bar' : null;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!from || done) return; const t = e.touches && e.touches[0]; if (!t) return; const dx = t.clientX - sx, dy = t.clientY - sy;
        if (from === 'edge' && dx < -36 && Math.abs(dx) > Math.abs(dy) * 1.2) { done = true; api.open(); }
        else if (from === 'bar' && dx > 50 && dx > Math.abs(dy) * 1.5) { done = true; api.close(); }
    }, { passive: true });
    applyMode(); update(); setTimeout(update, 300);
})();
