/* Réglages : résumés des nouvelles catégories + recherche d'un réglage */
(function () {
    'use strict';
    const $ = (id) => document.getElementById(id);
    const P = (k) => { try { return AppPrefs.get(k); } catch (e) { return ''; } };
    function infos() {
        const g = $('set-s-guidage'), r = $('set-s-ride');
        if (g) { const t = 'Style ' + ({ a: 'Bandeau', c: 'Liste', d: 'Moto' }[P('guideStyle') || 'a'] || 'Bandeau') + ' · voix de Thomas'; if (g.textContent !== t) g.textContent = t; }
        if (r) { const a = P('pocketAuto'), t = 'Poche ' + (P('pocketAsk') === 'on' ? 'proposé au départ' : 'non proposé') + (a && a !== 'off' ? ' · auto' : '') + (P('eco') !== 'off' ? ' · économie' : ''); if (r.textContent !== t) r.textContent = t; }
    }
    let idx = null;
    function build() {
        idx = [];
        document.querySelectorAll('#view-settings .set-sub-view[data-title]').forEach((v) => {
            const sub = v.dataset.title, seen = new Set();
            v.querySelectorAll('.set-row .x b, .setting-title, .set-sec').forEach((e) => {
                const t = (e.textContent || '').trim(); if (!t || seen.has(t)) return; seen.add(t);
                idx.push({ t, sub, id: v.id });
            });
        });
        document.querySelectorAll('#set-grid .at-home-tile').forEach((b) => {
            const t = ((b.querySelector('.t') || {}).textContent || '').trim(), s = ((b.querySelector('.s') || {}).textContent || '').trim();
            idx.push({ t, sub: s, btn: b });
        });
    }
    const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    function search(q) {
        const res = $('set-q-res'), grid = $('set-grid'); if (!res || !grid) return;
        q = norm(q.trim());
        if (!q) { res.classList.remove('on'); res.innerHTML = ''; grid.classList.remove('off'); return; }
        if (!idx) build();
        const hit = idx.filter((x) => norm(x.t).includes(q) || (x.btn && norm(x.sub).includes(q))).slice(0, 12);
        grid.classList.add('off'); res.classList.add('on'); res.innerHTML = '';
        if (!hit.length) { const p = document.createElement('p'); p.textContent = 'Aucun réglage trouvé.'; res.appendChild(p); return; }
        hit.forEach((x) => {
            const b = document.createElement('button'); b.type = 'button';
            b.innerHTML = '<b></b><small></small>'; b.firstChild.textContent = x.t; b.lastChild.textContent = x.btn ? 'Catégorie' : 'dans ' + x.sub;
            b.addEventListener('click', () => {
                const q = $('set-q'); if (q) q.value = ''; search('');
                const btn = x.btn || document.querySelector('#set-grid [data-sgo="' + x.id + '"]'); if (btn) btn.click();
            });
            res.appendChild(b);
        });
    }
    function init() {
        const q = $('set-q'); if (!q) return;
        q.addEventListener('input', () => search(q.value));
        infos(); document.addEventListener('prefchange', infos);
        const home = $('set-sub-home'); if (home) new MutationObserver(() => { if (home.classList.contains('active')) infos(); }).observe(home, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
