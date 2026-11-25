/* Déplacer les éléments de la carte en navigation : appui long → mode déplacement.
   Éléments : météo, bandeau trajet, bouton signaler, bouton calques. La bannière de guidage reste fixe.
   Position mémorisée en fraction de l'écran, séparément en portrait (p) et en paysage (l). */
(function () {
    'use strict';
    const KEY = 'ridenct_mv_v1', IDS = ['map-weather', 'nav-trip-bar', 'btn-report', 'btn-toggle-poi'];
    const MARGIN = 8, SNAP = 28;
    let sub, editing = false, drag = null, swallow = 0, bar = null, saved = null, was = false;

    const orient = () => (innerWidth > innerHeight ? 'l' : 'p');
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
    const navigating = () => !!sub && sub.classList.contains('navigating');
    const box = () => sub.getBoundingClientRect();
    const mvEl = (t) => { const e = t && t.closest && t.closest('.mv-item'); return e && IDS.indexOf(e.id) >= 0 ? e : null; };

    function setOff(el, x, y) { el.style.setProperty('--mv-x', Math.round(x) + 'px'); el.style.setProperty('--mv-y', Math.round(y) + 'px'); }
    function getOff(el) { return [parseFloat(el.style.getPropertyValue('--mv-x')) || 0, parseFloat(el.style.getPropertyValue('--mv-y')) || 0]; }

    function apply() {
        if (!sub) return;
        const st = (load()[orient()]) || {}, b = box();
        IDS.forEach((id) => {
            const el = document.getElementById(id); if (!el) return;
            el.classList.add('mv-item');
            const v = st[id];
            if (v && b.width > 0) setOff(el, v[0] * b.width, v[1] * b.height); else setOff(el, 0, 0);
        });
    }

    /* Garde l'élément dans l'écran, sous le bandeau de guidage, et l'aimante aux bords gauche/droite */
    function settle(el) {
        const b = box(), hud = document.getElementById('nav-instruction-hud');
        let [ox, oy] = getOff(el), r = el.getBoundingClientRect();
        let dx = 0, dy = 0;
        if (r.left < b.left + MARGIN + SNAP) dx = b.left + MARGIN - r.left;
        else if (r.right > b.right - MARGIN - SNAP) dx = b.right - MARGIN - r.right;
        if (r.left + dx < b.left + MARGIN) dx = b.left + MARGIN - r.left;
        if (r.right + dx > b.right - MARGIN) dx = b.right - MARGIN - r.right;
        if (r.top < b.top + MARGIN) dy = b.top + MARGIN - r.top;
        if (r.bottom > b.bottom - MARGIN) dy = b.bottom - MARGIN - r.bottom;
        // zone haute réservée : badge GPS / réglages (≈52 px), et le bandeau de guidage s'il est au-dessus
        let minTop = b.top + 52;
        if (hud && hud.offsetParent !== null) {
            const h = hud.getBoundingClientRect(), nx = r.left + dx, nr = r.right + dx;
            if (nr > h.left && nx < h.right) minTop = Math.max(minTop, h.bottom + 6);
        }
        if (r.top + dy < minTop) dy = minTop - r.top;
        setOff(el, ox + dx, oy + dy);
    }

    function persist(el) {
        const o = load(), k = orient(), b = box(); o[k] = o[k] || {};
        const [x, y] = getOff(el); o[k][el.id] = [x / b.width, y / b.height]; save(o);
    }

    function enter() {
        if (editing || !navigating()) return; editing = true; apply();
        sub.classList.add('mv-edit');
        bar = document.createElement('div'); bar.id = 'mv-bar';
        bar.innerHTML = '<span>Glisse les éléments</span><button type="button" data-a="reset">Réinitialiser</button><button type="button" data-a="done" class="ok">Terminé</button>';
        bar.addEventListener('click', (e) => { const a = e.target.closest('button'); if (!a) return; if (a.dataset.a === 'done') exit(); else reset(); });
        sub.appendChild(bar);
        // la barre se place au-dessus du tiroir d'itinéraire (sinon il la recouvre)
        let bt = box().bottom;
        ['route-bottom-sheet', 'btn-toggle-sheet'].forEach((id) => { const e = document.getElementById(id); if (!e || e.offsetParent === null) return; const r = e.getBoundingClientRect(), b = box(); if (r.width > b.width * 0.6 && r.top > b.top + b.height * 0.4) bt = Math.min(bt, r.top); });
        bar.style.bottom = Math.max(12, Math.round(box().bottom - bt + 10)) + 'px';
    }
    function exit() { editing = false; drag = null; if (saved) endPreview(); if (sub && sub.classList.contains('mv-edit')) sub.classList.remove('mv-edit'); if (bar) { bar.remove(); bar = null; } }
    function reset() { const o = load(); delete o[orient()]; save(o); apply(); }


    /* Aperçu « comme en balade » (données fictives) pour régler la disposition avant le départ */
    const $ = (id) => document.getElementById(id);
    function preview() {
        if (!sub || navigating() || saved) return;
        const hud = $('nav-instruction-hud'), nx = $('nav-next'), trip = $('nav-trip-bar'); if (!hud || !trip) return;
        saved = { hud: hud.style.display, nx: nx && nx.style.display, noRoute: trip.classList.contains('no-route'), w: ['mw-temp', 'mw-wind', 'mw-ntemp'].map((id) => $(id) && $(id).textContent), t: ['nt-eta', 'nt-time', 'nt-dist'].map((id) => $(id) && $(id).textContent),
            dist: $('nav-distance').textContent, label: $('nav-label').textContent, street: $('nav-street').textContent, ic: $('nav-turn-icon').innerHTML, nic: $('nav-next-icon') && $('nav-next-icon').innerHTML, nd: $('nav-next-dist') && $('nav-next-dist').textContent, gs: hud.getAttribute('data-gs') };
        const G = (typeof GuideIcons !== 'undefined') ? GuideIcons : null, mk = (m) => ({ maneuver: { type: 'turn', modifier: m } }), g = (m) => (G ? G.pick(mk(m), null, null).g : '');
        try { hud.setAttribute('data-gs', (typeof AppPrefs !== 'undefined' && AppPrefs.get('guideStyle')) || 'a'); } catch (_) {}
        $('nav-distance').textContent = '400 M'; $('nav-label').textContent = 'Tournez à droite'; $('nav-street').textContent = 'D 774 · Rue des Tests';
        $('nav-turn-icon').innerHTML = g('right');
        if (nx) { nx.style.display = 'flex'; if ($('nav-next-icon')) $('nav-next-icon').innerHTML = g('left'); if ($('nav-next-dist')) $('nav-next-dist').textContent = '75 M'; }
        hud.style.display = 'flex'; trip.classList.remove('no-route');
        [['nt-eta', '14:32'], ['nt-time', '42 min'], ['nt-dist', '38']].forEach(([id, v]) => { if ($(id)) $(id).textContent = v; });
        [['mw-temp', '18°'], ['mw-wind', '12 km/h'], ['mw-ntemp', '16°']].forEach(([id, v]) => { if ($(id)) $(id).textContent = v; });
        sub.classList.add('navigating', 'mv-preview');
        was = true; enter();
        const sp = bar && bar.querySelector('span'); if (sp) sp.textContent = 'Aperçu · glisse les éléments';
    }
    function endPreview() {
        const v = saved; saved = null; if (!v) return;
        const hud = $('nav-instruction-hud'), nx = $('nav-next'), trip = $('nav-trip-bar');
        sub.classList.remove('mv-preview', 'navigating');
        hud.style.display = v.hud; if (nx) nx.style.display = v.nx; if (v.noRoute) trip.classList.add('no-route');
        ['nt-eta', 'nt-time', 'nt-dist'].forEach((id, i) => { if ($(id) && v.t[i] != null) $(id).textContent = v.t[i]; });
        ['mw-temp', 'mw-wind', 'mw-ntemp'].forEach((id, i) => { if ($(id) && v.w[i] != null) $(id).textContent = v.w[i]; });
        $('nav-distance').textContent = v.dist; $('nav-label').textContent = v.label; $('nav-street').textContent = v.street; $('nav-turn-icon').innerHTML = v.ic;
        if ($('nav-next-icon') && v.nic != null) $('nav-next-icon').innerHTML = v.nic; if ($('nav-next-dist') && v.nd != null) $('nav-next-dist').textContent = v.nd;
        if (v.gs == null) hud.removeAttribute('data-gs'); else hud.setAttribute('data-gs', v.gs);
        was = false;
    }

    function startDrag(el, e) {
        const [ox, oy] = getOff(el);
        drag = { el, pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox, oy };
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        el.classList.add('mv-drag');
    }

    function init() {
        sub = document.getElementById('sub-gps-carte'); if (!sub) return;
        apply();
        was = navigating();
        new MutationObserver(() => { const n = navigating(); if (n === was) return; was = n; if (!n) exit(); else apply(); }).observe(sub, { attributes: true, attributeFilter: ['class'] });
        addEventListener('resize', () => { apply(); });

        document.addEventListener('pointerdown', (e) => {
            const el = mvEl(e.target); if (!el || !editing) return;
            e.preventDefault(); startDrag(el, e);
        }, true);

        document.addEventListener('pointermove', (e) => {
            if (drag && e.pointerId === drag.pid) { setOff(drag.el, drag.ox + e.clientX - drag.sx, drag.oy + e.clientY - drag.sy); e.preventDefault(); }
        }, { capture: true, passive: false });

        const up = (e) => {
            if (drag && (!e.pointerId || e.pointerId === drag.pid)) {
                const el = drag.el; drag = null; el.classList.remove('mv-drag'); settle(el); persist(el); swallow = Date.now() + 350;
            }
        };
        document.addEventListener('pointerup', up, true);
        document.addEventListener('pointercancel', up, true);

        document.addEventListener('click', (e) => {
            if (!mvEl(e.target)) return;
            if (editing || Date.now() < swallow) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
        document.addEventListener('contextmenu', (e) => { if (mvEl(e.target) && editing) e.preventDefault(); }, true);
        const kb = document.getElementById('btn-layout'); if (kb) kb.addEventListener('click', preview);
    }

    window.CarteDeplacer = { enter, exit, reset, apply, preview, get editing() { return editing; } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
