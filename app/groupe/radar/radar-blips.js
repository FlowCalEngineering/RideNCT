/* Radar animé : un point pulsé par motard détecté (angle = direction réelle si on connaît les positions, rayon = distance / portée). */
(function () {
    if (typeof ModuleCommunity === 'undefined') return;
    const NS = 'http://www.w3.org/2000/svg';
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    function draw() {
        const svg = document.querySelector('.cm-radar-svg'); if (!svg) return;
        let g = svg.querySelector('.cm-blips');
        if (!g) { g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'cm-blips'); svg.appendChild(g); }
        const C = ModuleCommunity, range = (C.config && C.config.linkRadius) || 300;
        const me = (typeof ModuleGPS !== 'undefined' && ModuleGPS.state) ? ModuleGPS.state.lastKnownCoords : null;
        const riders = C.nearRiders ? C.nearRiders() : [];
        const keep = new Set();
        riders.forEach((r) => {
            keep.add(r.id);
            let ang;
            if (me && typeof r.lat === 'number' && typeof r.lon === 'number') ang = Math.atan2((r.lon - me[0]) * Math.cos(me[1] * Math.PI / 180), r.lat - me[1]);
            else ang = ((hash(String(r.id)) * 137.5) % 360) * Math.PI / 180;
            const rad = Math.max(12, Math.min(1, (r.dist == null ? range / 2 : r.dist) / range) * 84);
            const x = 100 + Math.sin(ang) * rad, y = 100 - Math.cos(ang) * rad;
            let b = g.querySelector('[data-id="' + CSS.escape(String(r.id)) + '"]');
            if (!b) {
                b = document.createElementNS(NS, 'g'); b.setAttribute('data-id', String(r.id)); b.setAttribute('class', 'cm-blip' + (C.isFriend && C.isFriend(r.id) ? ' fr' : ''));
                b.innerHTML = '<circle class="cm-ping" r="4"/><circle class="cm-dot" r="4.5"/>'; g.appendChild(b);
            }
            b.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
        });
        [...g.children].forEach((b) => { if (!keep.has(b.getAttribute('data-id'))) b.remove(); });
    }
    const orig = ModuleCommunity.renderLists;
    ModuleCommunity.renderLists = function () { const o = orig.apply(this, arguments); try { draw(); } catch (e) {} return o; };
    setInterval(() => { if (document.getElementById('sub-comm-radar') && document.getElementById('sub-comm-radar').classList.contains('active')) { try { draw(); } catch (e) {} } }, 2000);
})();
