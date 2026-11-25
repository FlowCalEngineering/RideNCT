// ====================================================================
//  ICÔNES DU GUIDAGE (DA Racing) : pictogrammes 24×24 à angles vifs. Couleurs : celles du thème (currentColor / var(--accent-color)).
//  Choix de l'icône selon la manœuvre (et les voies si le serveur d'itinéraire les fournit) ; numéro de sortie dans les ronds-points.
// ====================================================================
const GuideIcons = {
    P: {
 "straight": "<path d=\"M12 21V5\"/><path d=\"M5.5 11.5 12 5l6.5 6.5\"/>",
 "right": "<path d=\"M6 21V13a4 4 0 0 1 4-4h9\"/><path d=\"M14.5 4.5 19 9l-4.5 4.5\"/>",
 "left": "<path d=\"M18 21V13a4 4 0 0 0-4-4H5\"/><path d=\"M9.5 4.5 5 9l4.5 4.5\"/>",
 "slight-right": "<path d=\"M6 21 17 7\"/><path d=\"M10.5 6.5H17.5V13.5\"/>",
 "slight-left": "<path d=\"M18 21 7 7\"/><path d=\"M13.5 6.5H6.5V13.5\"/>",
 "sharp-right": "<path d=\"M4 5h9a5 5 0 0 1 5 5v10\"/><path d=\"m13.5 15.5 4.5 4.5 4.5-4.5\"/>",
 "sharp-left": "<path d=\"M20 5h-9a5 5 0 0 0-5 5v10\"/><path d=\"m1.5 15.5 4.5 4.5 4.5-4.5\"/>",
 "uturn": "<path d=\"M8 21V9a4 4 0 0 1 8 0v4\"/><path d=\"m12.5 10 3.5 4 3.5-4\"/>",
 "fork-right": "<path d=\"M12 21V12\"/><path d=\"M12 12 6.5 6.5\"/><path d=\"M12 12l6-6\"/><path d=\"M13 6h5v5\"/>",
 "fork-left": "<path d=\"M12 21V12\"/><path d=\"M12 12l6-6\"/><path d=\"M12 12 6.5 6.5\"/><path d=\"M11 6H6v5\"/>",
 "merge": "<path d=\"M6 21c0-5 6-6 6-12\"/><path d=\"M18 21c0-5-6-6-6-12\"/><path d=\"M12 9V4\"/><path d=\"m8.5 7.5 3.5-3.5 3.5 3.5\"/>",
 "depart": "<circle cx=\"12\" cy=\"12\" r=\"3.2\"/><path d=\"M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21\"/>",
 "arrive": "<path d=\"M6 21V4\"/><path d=\"M6 4h12l-2.5 4.5L18 13H6\"/>",
 "split-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M5 21V17L3.5 3M19 21V17l1.5-14M10 21V17L9 3M14 21V17l1-14\"/></g><path d=\"M16.5 21 17.6 6\"/><path d=\"m14.4 9 3.2-3.4 3.2 3.4\"/>",
 "split-left": "<g transform=\"translate(24 0) scale(-1 1)\"><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M5 21V17L3.5 3M19 21V17l1.5-14M10 21V17L9 3M14 21V17l1-14\"/></g><path d=\"M16.5 21 17.6 6\"/><path d=\"m14.4 9 3.2-3.4 3.2 3.4\"/></g>",
 "lane3-left": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 21V3\"/></g><path d=\"M7.3 21V6\"/><path d=\"m4.1 9.4 3.2-3.4 3.2 3.4\"/>",
 "lane3-mid": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 21V3\"/></g><path d=\"M12 21V6\"/><path d=\"m8.8 9.4 3.2-3.4 3.2 3.4\"/>",
 "lane3-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 21V3\"/></g><path d=\"M16.7 21V6\"/><path d=\"m13.5 9.4 3.2-3.4 3.2 3.4\"/>",
 "shift-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 21V3\"/></g><path d=\"M8.5 21C8.5 15 15.5 14 15.5 7\"/><path d=\"m12.3 10 3.2-3.4 3.2 3.4\" transform=\"translate(0 0)\"/>",
 "shift-left": "<g transform=\"translate(24 0) scale(-1 1)\"><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 21V3\"/></g><path d=\"M8.5 21C8.5 15 15.5 14 15.5 7\"/><path d=\"m12.3 10 3.2-3.4 3.2 3.4\"/></g>",
 "lane-end": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 21V15L12.5 9V3\"/></g><path d=\"M8.5 21V6\"/><path d=\"m5.3 9.4 3.2-3.4 3.2 3.4\"/>",
 "lane-add": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 3V9L12.5 15V21\"/></g><path d=\"M8.5 21V6\"/><path d=\"m5.3 9.4 3.2-3.4 3.2 3.4\"/>",
 "lane-keep": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M4 21V3M20 21V3\"/></g><path d=\"M8.5 21V6\"/><path d=\"m5.3 9.4 3.2-3.4 3.2 3.4\"/>",
 "x-straight": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V14H3M15 21V14h6M9 3v7H3M15 3v7h6\"/></g><path d=\"M12 21V6\"/><path d=\"m8.8 9.4 3.2-3.4 3.2 3.4\"/>",
 "x-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V14H3M15 21V14h6M9 3v7H3M15 3v7h6\"/></g><path d=\"M12 21V14a4 4 0 0 1 4-4h5\"/><path d=\"m17.5 6.5 3.5 3.5-3.5 3.5\"/>",
 "x-left": "<g transform=\"translate(24 0) scale(-1 1)\"><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V14H3M15 21V14h6M9 3v7H3M15 3v7h6\"/></g><path d=\"M12 21V14a4 4 0 0 1 4-4h5\"/><path d=\"m17.5 6.5 3.5 3.5-3.5 3.5\"/></g>",
 "t-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V3M15 21V13h6M15 3v6\"/></g><path d=\"M12 21V16a4 4 0 0 0 4-4h5\"/><path d=\"m17.5 8.5 3.5 3.5-3.5 3.5\"/>",
 "t-left": "<g transform=\"translate(24 0) scale(-1 1)\"><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V3M15 21V13h6M15 3v6\"/></g><path d=\"M12 21V16a4 4 0 0 0 4-4h5\"/><path d=\"m17.5 8.5 3.5 3.5-3.5 3.5\"/></g>",
 "side-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V3M15 21V13h6M15 3v6\"/></g><path d=\"M12 21V6\"/><path d=\"m8.8 9.4 3.2-3.4 3.2 3.4\"/>",
 "side-left": "<g transform=\"translate(24 0) scale(-1 1)\"><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V3M15 21V13h6M15 3v6\"/></g><path d=\"M12 21V6\"/><path d=\"m8.8 9.4 3.2-3.4 3.2 3.4\"/></g>",
 "fork-straight": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M12 21v-5L5 3M12 16 19 3\"/></g><path d=\"M12 21V9\"/><path d=\"m8.8 12.4 3.2-3.4 3.2 3.4\"/>",
 "onramp-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M13 21V3M20 21V3\"/></g><path d=\"M5 21C5 15 12 14 14.5 6\"/><path d=\"m11.3 9 3.2-3.4 3.2 3.4\"/>",
 "onramp-left": "<g transform=\"translate(24 0) scale(-1 1)\"><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M13 21V3M20 21V3\"/></g><path d=\"M5 21C5 15 12 14 14.5 6\"/><path d=\"m11.3 9 3.2-3.4 3.2 3.4\"/></g>",
 "exit-right": "<g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M7 21V3M13 21V5\"/></g><path d=\"M8 14c0-3 2-5 5-5h5\"/><path d=\"m15 6 3 3-3 3\"/>",
 "exit-left": "<g transform=\"translate(24 0) scale(-1 1)\"><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M7 21V3M13 21V5\"/></g><path d=\"M8 14c0-3 2-5 5-5h5\"/><path d=\"m15 6 3 3-3 3\"/></g>",
 "toll": "<path d=\"M4 18h16\"/><path d=\"M7 18V9M17 18V9\"/><path d=\"M7 11h8\"/><path d=\"M12 21v-3\" />",
 "tunnel": "<path d=\"M4 21V12a8 8 0 0 1 16 0v9\"/><g stroke-width=\"1.5\" opacity=\".4\"><path d=\"M9 21V13M15 21V13\"/></g>",
 "ferry": "<path d=\"M3 15h18l-3 5H6z\"/><path d=\"M8 15V9h8v6M12 9V4\"/>",
 "bridge": "<path d=\"M3 18h18M3 18c3-8 15-8 18 0M8 18v-5M12 18v-6M16 18v-5\"/>",
 "lights": "<rect x=\"8\" y=\"2.5\" width=\"8\" height=\"19\" rx=\"0\"/><circle cx=\"12\" cy=\"7\" r=\"1.2\"/><circle cx=\"12\" cy=\"12\" r=\"1.2\"/><circle cx=\"12\" cy=\"17\" r=\"1.2\"/>",
 "stop": "<path d=\"M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z\"/><path d=\"M8 12h8\"/>",
 "yield": "<path d=\"M3 4h18L12 20z\"/>",
 "bump": "<path d=\"M3 17h18\"/><path d=\"M6 17a6 6 0 0 1 12 0\"/>",
 "rail": "<path d=\"M5 5l14 14M19 5 5 19\"/>",
 "radar": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z\"/>",
 "curve": "<path d=\"M9 21c0-6 6-5 6-11 0-3-2-5-5-5\"/><path d=\"m9 2.5 2.5 2.5L9 7.5\" transform=\"translate(-0.5 0.5)\"/>",
 "danger": "<path d=\"M12 3 2 20h20z\"/><path d=\"M12 10v4M12 17v.5\"/>"
},

    // rond-point : ang = direction de sortie (0 tout droit, 90 droite, 180 demi-tour, 270 gauche), num = numéro de sortie
    rb(ang, num) {
        const r = 6.2, f = v => v.toFixed(1), rad = Math.PI / 180; let dim = '';
        [0, 90, 270].forEach(a => { if (a !== Math.round(ang) % 360) dim += `M${f(12 + r * Math.sin(a * rad))} ${f(12 - r * Math.cos(a * rad))}L${f(12 + 9.5 * Math.sin(a * rad))} ${f(12 - 9.5 * Math.cos(a * rad))}`; });
        const dx = Math.sin(ang * rad), dy = -Math.cos(ang * rad), nx = -dy, ny = dx;
        const P = [12 + r * dx, 12 + r * dy], Q = [12 + 11 * dx, 12 + 11 * dy], H1 = [Q[0] - 3.2 * dx + 3 * nx, Q[1] - 3.2 * dy + 3 * ny], H2 = [Q[0] - 3.2 * dx - 3 * nx, Q[1] - 3.2 * dy - 3 * ny];
        return `<g stroke-width="1.5" opacity=".4"><circle cx="12" cy="12" r="6.2"/><path d="${dim}"/></g><path d="M12 18.2v3.8"/><path d="M${f(P[0])} ${f(P[1])}L${f(Q[0])} ${f(Q[1])}"/><path d="M${f(H1[0])} ${f(H1[1])}L${f(Q[0])} ${f(Q[1])}L${f(H2[0])} ${f(H2[1])}"/>`
            + (num ? `<text x="12" y="15.3" text-anchor="middle" font-size="9.5" font-weight="900" font-style="italic" fill="currentColor" stroke="none">${num}</text>` : '');
    },
    // voies fournies par le serveur d'itinéraire (intersections[0].lanes) : null si absentes ou sans intérêt
    lanes(step) {
        try {
            const it = step.intersections && step.intersections[0], L = it && it.lanes; if (!L || L.length < 3) return null;
            const v = L.map((l, i) => l.valid ? i : -1).filter(i => i >= 0); if (!v.length || v.length === L.length) return null;
            const n = L.length, a = v[0], b = v[v.length - 1], contiguous = (b - a + 1) === v.length;
            if (!contiguous) return null;
            if (n === 3 && v.length === 1) return a === 0 ? 'lane3-left' : (a === 1 ? 'lane3-mid' : 'lane3-right');
            if (n >= 4 && v.length >= 2 && v.length <= n / 2 + 0.5) { if (a === n - v.length) return 'split-right'; if (a === 0) return 'split-left'; }
            return null;
        } catch (e) { return null; }
    },
    // manœuvre → { g : contenu SVG, k : nom du pictogramme }
    pick(step, next, ang) {
        const m = (step && step.maneuver) || {}, t = m.type || '', mod = m.modifier || '', P = this.P;
        const side = mod.includes('left') ? 'left' : (mod.includes('right') ? 'right' : '');
        const ret = k => ({ k, g: P[k] }), none = { k: 'straight', g: P.straight };
        if (t === 'arrive') return ret('arrive');
        if (t === 'depart') return ret('depart');
        if (t === 'roundabout' || t === 'rotary') {
            const a = (ang === null || ang === undefined) ? 0 : ang;
            return { k: 'roundabout', g: this.rb(a, m.exit || 0) };
        }
        if (step && step.mode === 'ferry') return ret('ferry');
        const ln = this.lanes(step); if (ln) return ret(ln);
        if (mod === 'uturn') return ret('uturn');
        if (t === 'fork') return side ? ret('fork-' + side) : ret('fork-straight');
        if (t === 'off ramp') return ret(side === 'left' ? 'exit-left' : 'exit-right');
        if (t === 'on ramp') return ret(side === 'left' ? 'onramp-left' : 'onramp-right');
        if (t === 'merge') return ret('merge');
        const bear = step && step.intersections && step.intersections[0] && step.intersections[0].bearings;
        if (t === 'end of road' && side) return ret(side === 'left' ? 't-left' : 't-right');
        if (bear && bear.length >= 4 && t === 'turn') return ret(side === 'left' ? 'x-left' : (side === 'right' ? 'x-right' : 'x-straight'));
        if (side) return ret(mod.includes('sharp') ? 'sharp-' + side : (mod.includes('slight') ? 'slight-' + side : side));
        return none;
    },
    svg(g) { return g; }
};
