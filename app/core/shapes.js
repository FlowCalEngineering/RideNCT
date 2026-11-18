/* Racing : aucune forme arrondie. Les éléments arrondis (pilules, cercles de boutons, cartes à gros rayon…) sont mis à angles droits,
   quelle que soit la façon dont leur rayon est défini (feuille de style ou style en ligne). Les points (≤ 16 px), images, cartes et SVG sont épargnés. */
(function () {
    const SKIP = 'img,svg,svg *,canvas,video,.maplibregl-map,.maplibregl-map *,#map-container,#map-container *,[data-round],.radar-switch,input[type="range"],input[type="checkbox"],input[type="radio"],.cm-radar-svg *';
    const off = () => document.documentElement.getAttribute('data-shapes') === 'off';
    const flat = (el) => {
        if (el.nodeType !== 1 || el.dataset.sq || el.matches(SKIP)) return;
        const cs = getComputedStyle(el), r = parseFloat(cs.borderTopLeftRadius);
        if (!(r >= 6)) return;
        if (cs.borderTopLeftRadius.indexOf('%') > -1 || r >= 6) { const b = el.getBoundingClientRect(); if (b.width > 0 && b.width <= 16 && b.height <= 16) return; }
        el.dataset.sq = '1'; el.style.setProperty('border-radius', '0', 'important');
    };
    const walk = (root) => { if (off() || !root || root.nodeType !== 1) return; flat(root); root.querySelectorAll('*').forEach(flat); };
    let q = [], t = null;
    const run = () => { t = null; const l = q; q = []; l.forEach(walk); };
    const push = (n) => { q.push(n); if (!t) t = setTimeout(run, 80); };
    const start = () => {
        walk(document.body);
        new MutationObserver((ms) => { ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) push(n); })); }).observe(document.body, { childList: true, subtree: true });
        document.addEventListener('viewchange', () => push(document.body));
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
