// Créer : recherche d'adresses, étapes, calcul d'itinéraire
// Étend ModuleGPS (défini dans carte/carte.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleGPS, {
                initSearchEngine() {
                    this.setupAutocomplete('input-wp-start', 'list-wp-start'); this.setupAutocomplete('input-wp-dest', 'list-wp-dest');
                    const btnAdd = document.getElementById('btn-add-waypoint'); if (btnAdd) btnAdd.addEventListener('click', () => { this.addWaypointField(); const steps = document.querySelectorAll('#waypoints-container .floating-input[id^="input-wp-step-"]'); if (steps.length) this.openPlaceSearch(steps[steps.length - 1].id); });
                    const modeBtns = document.querySelectorAll('.route-mode-btn');
                    modeBtns.forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            modeBtns.forEach(b => { b.classList.remove('active'); b.style.background = 'rgba(255,255,255,0.1)'; b.style.color = 'var(--text-main)'; });
                            const target = e.currentTarget; target.classList.add('active'); target.style.background = 'var(--accent-color)'; target.style.color = 'var(--on-accent)';
                            this.state.routeMode = target.getAttribute('data-mode'); this.checkAndCalculate();
                        });
                    });
                    ['btn-clear-route', 'btn-clear-route-map'].forEach(id => { const b = document.getElementById(id); if (b) b.addEventListener('click', () => this.clearRoute()); });
                    const btnSave = document.getElementById('btn-save-route'); if (btnSave) btnSave.addEventListener('click', () => { this.saveCurrentRoute(); });
                    const btnStart = document.getElementById('btn-start-create'); if (btnStart) btnStart.addEventListener('click', (ev) => { ev.stopPropagation(); const sheet = document.getElementById('route-bottom-sheet'); if (sheet && sheet.classList.contains('open')) document.getElementById('btn-toggle-sheet').click(); if (!this.state.isTracking) document.getElementById('btn-start-nav').click(); });
                    document.addEventListener('click', (e) => { if (!e.target.closest('.input-wrapper')) { document.querySelectorAll('.autocomplete-list').forEach(list => list.style.display = 'none'); } });
                },
                addWaypointField() {
                    this.state.waypointCounter++; const wpId = `wp-step-${this.state.waypointCounter}`;
                    const html = `<div class="input-wrapper" id="wrap-${wpId}" style="animation: fadeIn 0.2s ease;"><input type="text" id="input-${wpId}" class="floating-input" placeholder="⚪ Étape"><button class="btn btn-danger btn-remove-wp" data-target="wrap-${wpId}" data-input="input-${wpId}" style="width: auto; padding: 10px; border-radius: 10px; font-size: 0.8rem;">✕</button><div id="list-${wpId}" class="autocomplete-list"></div></div>`;
                    document.getElementById('wrap-wp-dest').insertAdjacentHTML('beforebegin', html); this.setupAutocomplete(`input-${wpId}`, `list-${wpId}`);
                    document.querySelector(`button[data-target="wrap-${wpId}"]`).addEventListener('click', (e) => { document.getElementById(e.currentTarget.getAttribute('data-target')).remove(); delete this.state.coords[e.currentTarget.getAttribute('data-input')]; this.checkAndCalculate(); });
                },
                // Les champs du tiroir ouvrent la recherche plein écran (voir recherche.js)
                setupAutocomplete(inputId, listId) {
                    const input = document.getElementById(inputId); if (!input) return;
                    input.readOnly = true;
                    input.addEventListener('click', () => this.openPlaceSearch(inputId));
                },
                checkAndCalculate() {
                    const inputs = document.getElementById('waypoints-container').querySelectorAll('.floating-input'); const validCoords = [];
                    inputs.forEach(input => { if (this.state.coords[input.id]) validCoords.push({ name: input.value, coords: this.state.coords[input.id] }); });
                    if (validCoords.length < 2) {
                        const filled = [...inputs].filter(i => i.value && i.value.trim()).length;
                        if (filled >= 2) { const miss = [...inputs].filter(i => i.value && i.value.trim() && !this.state.coords[i.id]).map(i => i.value.trim().slice(0, 28)); AppDialog.alert('Point sans coordonnées : ' + (miss.join(' / ') || '?') + '\n\nChoisis-le à nouveau.'); }
                        return;
                    }
                    { this.state.currentRouteTitle = `${validCoords[0].name.split(',')[0]} ➔ ${validCoords[validCoords.length - 1].name.split(',')[0]}`; this.calculateRoute(validCoords.map(v => v.coords)); }
                },
                // Retire les manœuvres « bruit » (changement de nom de rue, « continuer »…) qui noient les vraies instructions
                cleanSteps(steps) {
                    return steps.filter((st, i) => {
                        const ty = st.maneuver && st.maneuver.type, md = (st.maneuver && st.maneuver.modifier) || '';
                        if (ty === 'depart' || ty === 'arrive' || ty === 'roundabout' || ty === 'rotary') return true;
                        if (ty === 'new name' || ty === 'notification') return false;
                        if (ty === 'continue' && (!md || md === 'straight')) return false;
                        return true;
                    });
                },
                // Les instructions doivent suivre le tracé RÉELLEMENT affiché (BRouter ≠ OSRM) : on « colle » le tracé sur le réseau routier
                // (OSRM /match) et on récupère les manœuvres de ce parcours-là, ronds-points compris.
                // Sans réseau : manœuvres déduites du tracé (et des noms de rues des cartes téléchargées)
                async matchStepsOffline(coords) {
                    try {
                        if (typeof OfflineGeo === 'undefined' || !coords || coords.length < 2) return false;
                        const st = await OfflineGeo.stepsFromGeometry(coords);
                        if (st.length < 2 || !this.state.currentGeoJSON || this.state.currentGeoJSON.coordinates !== coords) return false;
                        this.state.routeSteps = this.cleanSteps(st); this.state.currentStepIndex = 0; this.state._stepIdx = -1; return true;
                    } catch (e) { return false; }
                },
                async matchSteps(coords) {
                    try {
                        if (this.isOffline() && typeof OfflineGeo !== 'undefined' && OfflineGeo.available()) return await this.matchStepsOffline(coords);
                        if (!coords || coords.length < 2) return false;
                        let total = 0; for (let i = 1; i < coords.length; i++) total += this.calculateDistance(coords[i - 1], coords[i]);
                        const spacing = Math.max(40, total / (8 * 90));
                        const pts = [coords[0]]; let acc = 0;
                        for (let i = 1; i < coords.length; i++) { acc += this.calculateDistance(coords[i - 1], coords[i]); if (acc >= spacing || i === coords.length - 1) { pts.push(coords[i]); acc = 0; } }
                        const chunks = []; for (let i = 0; i < pts.length - 1; i += 89) chunks.push(pts.slice(i, i + 90));
                        let all = [];
                        for (let c = 0; c < chunks.length; c++) {
                            const ch = chunks[c]; if (ch.length < 2) continue;
                            const url = `https://router.project-osrm.org/match/v1/driving/${ch.map(p => p[0] + ',' + p[1]).join(';')}?steps=true&overview=false&radiuses=${ch.map(() => 30).join(';')}`;
                            const res = await fetchT(url, {}, 15000); const d = await res.json();
                            if (d.code !== 'Ok') return false;
                            let st = []; d.matchings.forEach(mt => mt.legs.forEach(l => st = st.concat(l.steps)));
                            if (c > 0 && st.length && st[0].maneuver.type === 'depart') st = st.slice(1);
                            if (c < chunks.length - 1 && st.length && st[st.length - 1].maneuver.type === 'arrive') st = st.slice(0, -1);
                            all = all.concat(st);
                        }
                        if (all.length < 2) return false;
                        // Le tracé a pu être effacé / remplacé pendant l'attente
                        if (!this.state.currentGeoJSON || this.state.currentGeoJSON.coordinates !== coords) return false;
                        this.state.routeSteps = this.cleanSteps(all); this.state.currentStepIndex = 0; this.state._stepIdx = -1;
                        return true;
                    } catch (e) { console.warn('Instructions : repli sur les étapes OSRM', e); return await this.matchStepsOffline(coords); }
                },
                // Affiche un itinéraire calculé (en ligne ou hors ligne) : tracé, durée, distance
                finishRoute(routeGeoJSON, distanceMeters, durationSeconds, offline) {
                            this.state.currentGeoJSON = routeGeoJSON; this.state.routeSaved = false; this.state.routeExpert = false; this.drawRouteOnMap(routeGeoJSON);
                    if (!offline && this.state.routeMode !== 'rapide') this.matchSteps(routeGeoJSON.coordinates);
                    document.getElementById('route-actions').style.display = 'flex'; document.getElementById('active-route-name').textContent = this.state.currentRouteTitle.replace('📍 Ma position actuelle', 'Ma Position');
                    const distKm = (distanceMeters / 1000).toFixed(1); let timeString = "-- min";
                    if (durationSeconds > 0) { const hours = Math.floor(durationSeconds / 3600); const minutes = Math.floor((durationSeconds % 3600) / 60); if (hours > 0) { timeString = `${hours}h ${minutes.toString().padStart(2, '0')}m`; } else { timeString = `${minutes} min`; } }

							// ⚠️ NOUVEAU : On sauvegarde la distance et le temps dans l'état de l'application
                    this.state.currentDistKm = distKm; this.state.routeDistM = distanceMeters; this.state.routeDurSec = durationSeconds;
                    this.state.currentTimeStr = timeString;

                    this.paintInfo(routeGeoJSON, distKm, timeString);
                    const activeDist = document.getElementById('active-route-dist');
                    if (activeDist) {
                        activeDist.innerHTML = `<span style="display:flex; align-items:center; gap:5px;"><svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"><circle cx="5" cy="19" r="2"></circle><path d="M5 17v-4a2 2 0 0 1 2-2h10a2 2 0 0 0 2-2V7"></path><circle cx="19" cy="5" r="2"></circle></svg>${distKm} km</span> &nbsp; | &nbsp; <span style="display:flex; align-items:center; gap:5px;"><svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;"><circle cx="12" cy="13" r="9"></circle><polyline points="12 9 12 13 15 15"></polyline><line x1="10" y1="2" x2="14" y2="2"></line></svg>${timeString}</span>`;
                    }
                },
                // Sans réseau (ou réseau en panne) : calcul sur les cartes téléchargées
                async tryOfflineRoute(coordsArray) {
                    if (typeof OfflineGeo === 'undefined') return false;
                    if (!(await OfflineGeo.ready())) {
                        this.state._offlineFailed = true;
                        AppDialog.alert(OfflineMaps.hasZones() ? 'Tes cartes hors ligne ont été téléchargées avec une ancienne version et ne permettent pas le calcul d\'itinéraire. Retélécharge-les dans Réglages → Carte hors ligne (qualité « Détaillé »).' : 'Aucune carte hors ligne téléchargée : télécharge ta zone ou ton itinéraire avec du réseau (Réglages → Carte hors ligne).');
                        return false;
                    }
                    try {
                        const r = await OfflineGeo.route(coordsArray, this.state.routeMode);
                        this.state.routeSteps = this.cleanSteps(r.steps); this.state.currentStepIndex = 0; this.state._stepIdx = -1;
                        this.finishRoute(r.geometry, r.distance, r.duration, true);
                        return true;
                    } catch (e) { const m = String((e && e.message) || e); console.warn('Itinéraire hors ligne :', m, OfflineGeo.diagnostic && OfflineGeo.diagnostic()); this.state._offlineFailed = true; try { AppDialog.alert('Itinéraire hors ligne impossible : ' + m); } catch (e2) {} return false; }
                },
                // Appel OSRM avec délai max et serveur de secours (le serveur de démo peut être saturé ou injoignable)
                async osrmJson(path, ms = 12000) {
                    for (const host of ['https://router.project-osrm.org/route/v1/driving/', 'https://routing.openstreetmap.de/routed-car/route/v1/driving/']) {
                        const ac = new AbortController(), to = setTimeout(() => ac.abort(), ms);
                        try { const r = await fetch(host + path, { signal: ac.signal }); const d = await r.json(); if (d && d.code === 'Ok' && d.routes && d.routes[0]) return d; } catch (e) { } finally { clearTimeout(to); }
                    }
                    return null;
                },
                async calculateRoute(coordsArray) {
                    try { return await this.calculateRouteInner(coordsArray); }
                    catch (e) { console.error('calculateRoute', e); try { AppDialog.alert('Erreur lors du calcul de l\'itinéraire : ' + String((e && e.message) || e)); } catch (e2) {} }
                },
                async calculateRouteInner(coordsArray) {
                    this.state._offlineFailed = false;
                    if (this.isOffline()) { if (await this.tryOfflineRoute(coordsArray) || this.state._offlineFailed) return; }   // sans réseau, inutile d'attendre les serveurs en ligne
                    try {
                        let routeGeoJSON = null; let distanceMeters = 0; let durationSeconds = 0;
                        const osrmCoords = coordsArray.map(c => `${c[0]},${c[1]}`).join(';'); const brouterCoords = coordsArray.map(c => `${c[0]},${c[1]}`).join('|');
                        let realAverageSpeedMs = 16.66;
                        this.state.routeSteps = []; this.state.currentStepIndex = 0;
                        const rapide = this.state.routeMode === 'rapide';
                        // Une seule requête OSRM : tracé (mode rapide), manœuvres, distance et durée moyenne
                        const od = await this.osrmJson(`${osrmCoords}?overview=${rapide ? 'full&geometries=geojson' : 'false'}&steps=true`);
                        if (od) {
                            const rt = od.routes[0]; let steps = []; (rt.legs || []).forEach(leg => steps = steps.concat(leg.steps || []));
                            this.state.routeSteps = this.cleanSteps(steps); this.state._stepIdx = -1;
                            if (rt.duration > 0) realAverageSpeedMs = rt.distance / rt.duration;
                            if (rapide && rt.geometry) { routeGeoJSON = rt.geometry; distanceMeters = rt.distance; durationSeconds = rt.duration; }
                        }
                        if (!rapide) {
                            const profile = this.state.routeMode === 'sans-axe' ? 'moped' : 'fastbike';
                            try {
                                const ac = new AbortController(), to = setTimeout(() => ac.abort(), 25000);
                                let response; try { response = await ModuleGPS.brouterFetch(brouterCoords, profile, ac.signal, { fluid: this.state.routeMode === 'sinueux' }); } finally { clearTimeout(to); }
                                if (!response.ok) throw new Error(); const data = await response.json();
                                if (data.features && data.features.length > 0) {
                                    routeGeoJSON = data.features[0].geometry; RouteQuality.remember(data.features[0]); distanceMeters = parseFloat(data.features[0].properties['track-length']) || 0;
                                    if (this.state.routeMode === 'sinueux') { durationSeconds = distanceMeters / (realAverageSpeedMs * 0.90); } else if (this.state.routeMode === 'sans-axe') { durationSeconds = distanceMeters / (realAverageSpeedMs * 0.95); } else { durationSeconds = parseFloat(data.features[0].properties['total-time']) || 0; }
                                }
                            } catch (e) {
                                // BRouter indisponible : on se rabat sur un tracé OSRM classique
                                const fb = await this.osrmJson(`${osrmCoords}?overview=full&geometries=geojson`);
                                if (fb) { routeGeoJSON = fb.routes[0].geometry; distanceMeters = fb.routes[0].distance; durationSeconds = fb.routes[0].duration; }
                            }
                        }
                        if (routeGeoJSON) { this.finishRoute(routeGeoJSON, distanceMeters, durationSeconds); return; }
                        if (await this.tryOfflineRoute(coordsArray)) return;
                        if (!this.state._offlineFailed) AppDialog.alert('Impossible de calculer l\'itinéraire : serveur injoignable.\n\nRéessaie dans un instant.');
                    } catch (error) {
                        if (await this.tryOfflineRoute(coordsArray)) return;
                        if (!this.state._offlineFailed) AppDialog.alert('Impossible de calculer l\'itinéraire.\n\nVérifie ta connexion et réessaie.');
                    }
                },
                saveCurrentRoute() {
                    if (!this.state.currentGeoJSON) return;
                    const savedRoutes = AppStore.get('moto_saved_routes', []);
                    
                    // Génère la miniature vectorielle au moment de la sauvegarde
                    const previewSVG = this.generateRoutePreviewSVG(this.state.currentGeoJSON);
                    
                    savedRoutes.push({ 
                        id: Date.now(), 
                        title: this.state.currentRouteTitle, 
                        mode: this.state.routeMode, 
                        dist: this.state.currentDistKm || '--',       // Sauvegarde des KM
                        time: this.state.currentTimeStr || '--',      // Sauvegarde du temps
                        preview: previewSVG,                          // Sauvegarde de l'image
                        geojson: this.state.currentGeoJSON 
                    });
                    
                    if (!AppStore.set('moto_saved_routes', savedRoutes)) return;
                    this.loadLibrary(); 
                    document.querySelector('.gps-tab-btn[data-sub="sub-gps-roadbooks"]').click();
                },
                // Affiche le bouton rapide « supprimer l'itinéraire » seulement s'il y a un itinéraire
                updateRouteControls() {
                    const b = document.getElementById('btn-clear-route-map');
                    const has = !!(this.state.currentGeoJSON && this.state.currentGeoJSON.coordinates);
                    if (b) b.style.display = has ? 'flex' : 'none';
                    // Tiroir « Itinéraire » : boutons Supprimer / Démarrer dès qu'un itinéraire existe (calculé ou ouvert depuis la bibliothèque)
                    const act = document.getElementById('route-actions'); if (act) act.style.display = has ? 'flex' : 'none';
                    const del = document.getElementById('btn-clear-route'); if (del) del.style.display = has ? 'flex' : 'none';
                    const save = document.getElementById('btn-save-route'); if (save) save.style.display = (has && !this.state.routeSaved) ? '' : 'none';
                },
                // Supprime l'itinéraire affiché : tracé, étapes, guidage et champs de saisie (le suivi GPS / le trajet en cours continuent)
                clearRoute() {
                    const s = this.state;
                    s.currentGeoJSON = null; s.routeSaved = false; s.routeExpert = false; s.poiAutoDest = null; s.currentRouteTitle = ''; s.routeSteps = []; s.currentStepIndex = 0; s.passedRouteIndex = 0;
                    s.currentDistKm = null; s.currentTimeStr = null; s.routeDistM = 0; s.routeDurSec = 0; s.coords = {}; s.waypointCounter = 0;
                    clearTimeout(s.searchTimeout);
                    document.querySelectorAll('#waypoints-container .input-wrapper[id^="wrap-wp-step-"]').forEach(w => w.remove());
                    ['input-wp-start', 'input-wp-dest'].forEach(id => { const i = document.getElementById(id); if (i) i.value = ''; });
                    document.querySelectorAll('#waypoints-container .autocomplete-list').forEach(l => { l.innerHTML = ''; l.style.display = 'none'; });
                    const info = document.getElementById('route-info-display'); if (info) { info.style.display = 'none'; info.innerHTML = ''; }
                    const act = document.getElementById('route-actions'); if (act) act.style.display = 'none';
                    const name = document.getElementById('active-route-name'); if (name) name.textContent = 'Aucun trajet actif';
                    const dist = document.getElementById('active-route-dist'); if (dist) dist.innerHTML = '';
                    const hud = document.getElementById('nav-instruction-hud'); if (hud) hud.style.display = 'none';
                    this.updateRouteControls();
                    s.routeGeo = null; try { if (s.map && s.map.getSource('route')) s.map.getSource('route').setData({ type: 'FeatureCollection', features: [] }); } catch (e) { console.warn('clearRoute', e); }
                },
});
