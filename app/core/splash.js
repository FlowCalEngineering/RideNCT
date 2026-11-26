/* Écran de démarrage : couvre le chargement, cherche une mise à jour et, s'il y en a une, l'installe sous les yeux de l'utilisateur. */
(function () {
    'use strict';
    const el = document.getElementById('splash'); if (!el) return;
    let cold = true; try { cold = !sessionStorage.getItem('ridenct_cold'); sessionStorage.setItem('ridenct_cold', '1'); } catch (_) {}
    const sw = 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost');
    if (!cold || !sw || window.Capacitor) { el.remove(); return; }       // reprise, application native ou pas de service worker : pas d'écran
    const $ = (id) => document.getElementById(id), T0 = Date.now(), MIN = 900;
    let loaded = document.readyState === 'complete', decided = false, updating = false, closed = false, last = '', cur = '';
    const ver = (v) => 'v' + v;
    try { last = localStorage.getItem('ridenct_ver') || ''; } catch (_) {}
    const set = (o) => { for (const k in o) { const n = $('sp-' + k); if (n && n.textContent !== o[k]) n.textContent = o[k]; } };
    const mode = (m) => el.setAttribute('data-m', m);
    const bar = (p) => { const i = $('sp-bar'); if (i) { i.style.width = p == null ? '' : p + '%'; } el.classList.toggle('ind', p == null); };
    function close() { if (closed) return; closed = true; try { if (!updating && cur) localStorage.setItem('ridenct_ver', cur); } catch (_) {} el.classList.add('out'); setTimeout(() => el.remove(), 380); }
    function tryClose() { if (updating || closed) return; if (loaded && decided && Date.now() - T0 >= MIN) close(); else setTimeout(tryClose, 120); }
    addEventListener('load', () => { loaded = true; });
    bar(null); set({ lbl: 'Chargement', det: 'Recherche de mise à jour' }); mode('check');
    if (last) set({ ver: ver(last) });

    // version courante (le fichier est lu sans cache : tel que le serveur le publie)
    fetch('version.json', { cache: 'no-store' }).then((r) => r.json()).then((m) => { if (!updating && m && m.v) { cur = m.v; set({ ver: ver(m.v) }); } }).catch(() => {});

    let bc = null; try { bc = new BroadcastChannel('ridenct-sw'); } catch (_) {}
    let total = 0, to = '';
    function startUpdate(v, notes, tot) {
        const lab = () => (last && to ? ver(last) + ' → ' + ver(to) : 'Mise à jour' + (to ? ' ' + ver(to) : ''));
        if (updating) { if (v) to = v; if (tot) total = tot; set({ lbl: lab(), notes: notes ? 'Nouveau : ' + notes : '' }); return; }
        updating = true; to = v || ''; total = tot || 0; mode('update');
        set({ lbl: lab(), pct: '', det: 'Téléchargement…', cnt: '', notes: notes ? 'Nouveau : ' + notes : '', ver: 'NE FERME PAS L\'APP' });
        bar(0);
        setTimeout(() => { if (!closed && updating) { updating = false; tryClose(); } }, 60000);      // garde-fou : si ça traîne, on démarre quand même
    }
    function finish(v) {
        if (closed) return; mode('done');
        try { if (v || to) localStorage.setItem('ridenct_ver', v || to); } catch (_) {}
        set({ lbl: ver(v || to) + ' installée', pct: '✓', det: 'Relance automatique…', cnt: '', notes: '', ver: ver(v || to) }); bar(100);
        setTimeout(() => location.reload(), 1100);
    }
    if (bc) bc.onmessage = (e) => {
        const m = e.data || {};
        if (m.t === 'start') startUpdate(m.v, m.notes, m.total);
        else if (m.t === 'prog' && updating && m.total) { const p = Math.min(99, Math.round(m.done * 100 / m.total)); bar(p); set({ pct: p + ' %', cnt: m.done + ' / ' + m.total + ' fichiers' }); }
        else if (m.t === 'ready' && updating) finish(m.v);
    };
    // sécurité : si le nouveau worker prend le contrôle sans message (ex. canal indisponible), on relance
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating && !closed) finish(to); });

    navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) { decided = true; return; }
        reg.addEventListener('updatefound', () => startUpdate('', '', 0));
        const t = setTimeout(() => { if (!updating) { decided = true; } }, 3000);
        const done = () => { clearTimeout(t); if (reg.installing || reg.waiting) startUpdate(to, '', total); else decided = true; };
        reg.update().then(done).catch(() => { clearTimeout(t); if (navigator.onLine === false) { mode('offline'); set({ lbl: 'Pas de réseau', det: 'Démarrage avec la version installée' }); bar(100); } decided = true; });
    }).catch(() => { decided = true; });
    if (navigator.onLine === false) { mode('offline'); set({ lbl: 'Pas de réseau', det: 'Démarrage avec la version installée' }); bar(100); decided = true; }
    tryClose();
})();
