// Partager un trajet : à un motard proche (radar), au canal vocal, ou en fichier GPX (messages, e-mail…)
// Remplace l'ancien bouton « Partager (.gpx) » de la bibliothèque et du roadbook.
// Étend ModuleGPS : ce fichier doit être chargé APRÈS bibliotheque.js et roadbook.js.
(function () {
    const _gpxFile = ModuleGPS.exportToGPX;      // partage du fichier .gpx (menu natif du téléphone)
    const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmtDist = (m) => m == null ? '' : (m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km');

    Object.assign(ModuleGPS, {
        exportToGPXFile(route) { return _gpxFile.call(this, route); },
        exportToGPX(route) { this.openShareSheet(route); },

        // Motards du radar joignables en direct (liaison ouverte, vus il y a moins de 30 s), du plus proche au plus loin
        nearbyRiders() {
            const C = (typeof ModuleCommunity !== 'undefined') ? ModuleCommunity : null; if (!C || !C.state || !C.state.riders) return [];
            const now = Date.now();
            return [...C.state.riders.values()]
                .filter(r => r.sid && now - (r.seen || 0) < 30000)
                .map(r => ({ r, peer: C.state.peers.get(r.sid) }))
                .filter(x => x.peer && x.peer.dc && x.peer.dc.readyState === 'open')
                .sort((a, b) => (a.r.dist == null ? 1e9 : a.r.dist) - (b.r.dist == null ? 1e9 : b.r.dist));
        },

        openShareSheet(route) {
            if (!route || !route.geojson || !route.geojson.coordinates || route.geojson.coordinates.length < 2) return;
            if (!AppWarn.done('partage-itineraire')) { AppWarn.ask('partage-itineraire').then(ok => { if (ok) this.openShareSheet(route); }); return; }
            const old = document.getElementById('sh-overlay'); if (old) old.remove();
            const title = String(route.title || 'Trajet').replace('📍 Ma position actuelle', 'Ma Position');
            const ov = document.createElement('div'); ov.id = 'sh-overlay'; ov.className = 'rp-overlay';
            ov.innerHTML = `<div class="rp-sheet om-sheet"><div class="rp-top"><button type="button" class="rp-x sh-back" aria-label="Retour" style="display:none">‹</button><div class="sh-title" style="flex:1;font-weight:900;font-size:1.05rem;padding-left:10px;">Partager</div><button type="button" class="rp-x sh-close" aria-label="Fermer">✕</button></div>
                <div class="om-info">${esc(title)}</div><div id="sh-body"></div></div>`;
            document.body.appendChild(ov);
            const body = ov.querySelector('#sh-body'), back = ov.querySelector('.sh-back'), tt = ov.querySelector('.sh-title');
            const close = () => ov.remove();
            ov.addEventListener('click', (e) => { if (e.target === ov) close(); }); ov.querySelector('.sh-close').addEventListener('click', close);
            const opt = (ico, main, sub, fn, dis) => {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'sh-opt' + (dis ? ' dis' : '');
                b.innerHTML = `<span class="sh-ico">${ico}</span><span class="sh-txt"><b>${main}</b><small>${sub}</small></span><span class="sh-arrow">›</span>`;
                b.addEventListener('click', fn); return b;
            };

            const home = () => {
                back.style.display = 'none'; tt.textContent = 'Partager'; body.innerHTML = '';
                const near = this.nearbyRiders(), room = (typeof ModuleRouteShare !== 'undefined') ? ModuleRouteShare.room() : [];
                const radarOn = typeof ModuleCommunity !== 'undefined' && ModuleCommunity.state && ModuleCommunity.state.radarMode && ModuleCommunity.state.radarMode !== 'off';
                body.appendChild(opt('📡', 'À un motard proche', near.length ? `${near.length} motard${near.length > 1 ? 's' : ''} à portée` : (radarOn ? 'Personne à portée pour le moment' : 'Active le radar pour voir les motards proches'), () => riders(), !near.length));
                if (room.length) body.appendChild(opt('🎧', 'À mon canal vocal', `${room.length} motard${room.length > 1 ? 's' : ''} dans le canal`, () => { close(); ModuleRouteShare.send(title, route.geojson.coordinates, room, false); }));
                body.appendChild(opt('📤', 'Envoyer le fichier GPX', 'Messages, WhatsApp, e-mail, AirDrop…', () => { close(); this.exportToGPXFile(route); }));
            };
            const riders = () => {
                back.style.display = ''; tt.textContent = 'Motards proches'; body.innerHTML = '';
                const near = this.nearbyRiders();
                if (!near.length) { body.innerHTML = '<div class="comm-empty" style="padding:14px 0;text-align:center">Personne à portée pour le moment.</div>'; return; }
                const card = document.createElement('div'); card.className = 'om-card';
                near.forEach(({ r, peer }) => {
                    const row = document.createElement('button'); row.type = 'button'; row.className = 'sh-rider';
                    row.innerHTML = `<span class="sh-ico">🏍️</span><span class="sh-txt"><b>${esc(r.name || 'Motard')}</b><small>${r.dist != null ? 'à ' + fmtDist(r.dist) : 'à proximité'}</small></span><span class="sh-send">Envoyer</span>`;
                    row.addEventListener('click', () => { close(); ModuleRouteShare.send(title, route.geojson.coordinates, [peer], true); });
                    card.appendChild(row);
                });
                body.appendChild(card);
                const h = document.createElement('div'); h.className = 'om-info'; h.textContent = 'Le motard reçoit une demande : il choisit d\'ouvrir ou d\'enregistrer le trajet.'; body.appendChild(h);
            };
            back.addEventListener('click', home);
            home();
        }
    });
})();
