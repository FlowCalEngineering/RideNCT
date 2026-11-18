// Carte : GPS, suivi de position, thème de carte, onglets
// Étend ModuleGPS (défini dans carte/carte.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleGPS, {
                async manageWakeLock(turnOn) {
                    if (!('wakeLock' in navigator)) return; 
                    if (turnOn && AppPrefs.get('wake') === 'never') return;   // réglage : ne pas garder l'écran allumé
                    try { if (turnOn) this.state.wakeLockSentinel = await navigator.wakeLock.request('screen'); else if (this.state.wakeLockSentinel) { await this.state.wakeLockSentinel.release(); this.state.wakeLockSentinel = null; } } catch (err) {}
                },
                /* Change le fond de carte (sombre / clair) en direct, sans recharger l'app :
                   on remet ensuite le tracé et les points d'intérêt par-dessus le nouveau fond. */
                applyMapTheme() {
                    const s = this.state, m = s.map;
                    if (!m) return;   // carte pas encore ouverte : elle prendra le bon thème à sa création
                    const rs = m.getSource('route');
                    const routeData = (rs && rs._data) ? rs._data : (s.routeGeo || null);
                    const hadPOI = !!s.showPOIs;
                    // Fondu : la carte s'estompe pendant le changement de fond puis revient
                    const box = m.getContainer();
                    box.style.transition = 'opacity .35s ease'; box.style.opacity = '0.15';
                    let done = false, guard = null;
                    const reveal = () => { box.style.opacity = '1'; };
                    const restore = async () => {
                        if (done) return; done = true; clearTimeout(guard);
                        try {
                            // Le nouveau fond a effacé nos sources / couches : on remet le tracé et les points d'intérêt
                            this.rpTracePush && this.rpTracePush();
                            if (routeData) this.ensureRouteLayers(routeData);
                            s.poiReady = false;
                            if (hadPOI) {
                                const ok = await this.poiEnsureLayers();
                                if (ok) { this.poiSetWideData(); this.poiSetVisible(true); this.poiApplyFilter(); }
                            }
                        } catch (e) { console.warn('Thème de la carte :', e); }
                        m.once('idle', reveal); setTimeout(reveal, 2500);
                    };
                    // diff:false → remplacement complet du style (avec un diff, 'style.load' ne se déclenche pas et le tracé disparaît)
                    m.once('style.load', restore);
                    guard = setTimeout(() => { if (!done) { if (m.isStyleLoaded && m.isStyleLoaded()) restore(); else reveal(); } }, 9000);
                    m.setStyle(AppTheme.getMapStyleUrl(), { diff: false });
                },
                initMap() {
                    if (typeof maplibregl === 'undefined' || this.state.isMapInitialized) return;
                    this.state.map = new maplibregl.Map({
                        container: 'map-container', style: AppTheme.getMapStyleUrl(), center: [2.2137, 46.2276], zoom: 5, attributionControl: false,
                        transformRequest: (url, type) => (typeof OfflineMaps !== 'undefined' ? OfflineMaps.transform(url, type) : undefined)
                    });
                    this.state.isMapInitialized = true;

                    this.state.map.on('moveend', () => {
                        if (!this.state.showPOIs) return;
                        clearTimeout(this.state.poiTimeout);
                        this.state.poiTimeout = setTimeout(() => { this.fetchPOIs(); }, 500); 
                    });

                    this.state.map.on('load', () => {
                        if (navigator.geolocation) {
                            this.state.watchId = navigator.geolocation.watchPosition((pos) => this.updateUserLocation(pos), (err) => { if (err.code === 1) AppDialog.alert("⚠️ GPS refusé."); }, { enableHighAccuracy: true, maximumAge: 1000 });
                        }
                    });

                    const unlockCam = () => {
                        if (this.state.isTracking && this.state.isCameraLocked) {
                            this.state.isCameraLocked = false;
                            document.getElementById('btn-recenter').style.display = 'flex';
                        }
                    };
                    this.state.map.on('touchstart', unlockCam); this.state.map.on('dragstart', unlockCam);
                    // En navigation la barre Carte/Roadbook/Bibliothèque est masquée : un tap sur la carte l'affiche 5 s
                    this.state.map.on('click', () => {
                        const v = document.getElementById('view-gps'); if (!v || !this.state.isTracking) return;
                        v.classList.add('nav-show'); clearTimeout(this._navShowT);
                        this._navShowT = setTimeout(() => v.classList.remove('nav-show'), 5000);
                    });
                },
                calculateDistance(c1, c2) {
                    const R = 6371e3; const lat1 = c1[1] * Math.PI/180; const lat2 = c2[1] * Math.PI/180;
                    const deltaLat = (c2[1]-c1[1]) * Math.PI/180; const deltaLon = (c2[0]-c1[0]) * Math.PI/180;
                    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
                    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
                },
                calculateHeading(c1, c2) {
                    const lat1 = c1[1] * Math.PI/180; const lon1 = c1[0] * Math.PI/180;
                    const lat2 = c2[1] * Math.PI/180; const lon2 = c2[0] * Math.PI/180;
                    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
                    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
                    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
                },
                // 📍 Projette un point sur un segment [a, b] (coordonnées lon/lat) pour trouver
                // le point exact le plus proche sur le tracé, pas seulement le sommet le plus proche.
                // Permet un effacement fluide et continu du tracé derrière l'utilisateur.
                projectPointOnSegment(p, a, b) {
                    const kx = Math.cos(a[1] * Math.PI / 180) || 1; // compense la distorsion longitude/latitude
                    const ax = a[0] * kx, ay = a[1], bx = b[0] * kx, by = b[1], px = p[0] * kx, py = p[1];
                    const dx = bx - ax, dy = by - ay; const lengthSq = dx * dx + dy * dy;
                    let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
                    t = Math.max(0, Math.min(1, t));
                    return [(ax + t * dx) / kx, ay + t * dy];
                },
                handleOrientation(event) {
                    let heading = null;
                    if (event.webkitCompassHeading) heading = event.webkitCompassHeading;
                    else if (event.absolute && event.alpha !== null) heading = 360 - event.alpha;
                    if (heading !== null) this.state.compassHeading = heading;
                },
                toggleTracking() {
                    const btn = document.getElementById('btn-start-nav');
                    if (!this.state.compassActive) {
                        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                            DeviceOrientationEvent.requestPermission().then(res => { if (res === 'granted') { window.addEventListener('deviceorientation', (e) => this.handleOrientation(e)); this.state.compassActive = true; } }).catch(console.error);
                        } else { window.addEventListener('deviceorientationabsolute', (e) => this.handleOrientation(e)); window.addEventListener('deviceorientation', (e) => this.handleOrientation(e)); this.state.compassActive = true; }
                    }

                    if (this.state.isTracking) {
                        this.state.isTracking = false; this.voiceStop(); this.manageWakeLock(false); try { AppOrient.unlock(); } catch (e) { } document.getElementById('sub-gps-carte').classList.remove('navigating'); { const v = document.getElementById('view-gps'); if (v) v.classList.remove('nav-show'); }
                        btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg><span>Démarrer</span>`; btn.style.background = "var(--accent-color)"; btn.style.color = "var(--on-accent)";
                        document.getElementById('btn-recenter').style.display = 'none';
                        if (this.state.map) { this.state.isAnimatingInitialLock = false; this.state.map.easeTo({ pitch: 0, bearing: 0, zoom: 13, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1500 }); }
                        
                        const hud = document.getElementById('nav-instruction-hud');
                        if (hud) hud.style.display = 'none';
                        
                        if (this.state.recordedPath && this.state.recordedPath.length >= 2) {
                            this.saveRecordedRide();
                        }
                        try { ModuleSensors.halt(); } catch (e) {}
                        this.state.recordedPath = [];

                    } else {
                        if (!this.state.lastKnownCoords) { AppDialog.alert("En attente du signal GPS..."); return; }
                        if (!AppWarn.done('guidage')) { AppWarn.ask('guidage').then(ok => { if (ok) this.toggleTracking(); }); return; }
                        this.state.isTracking = true; this.voiceStart(); this.manageWakeLock(true); try { AppOrient.lock(); } catch (e) { } document.getElementById('sub-gps-carte').classList.add('navigating');
                        
                        this.state.recordedPath = [this.state.lastKnownCoords]; 
                        this.rideStatsReset();
                        try { ModuleSensors.start(); } catch (e) {}
                        this.state.rideStartTime = Date.now();

                        this.state.isCameraLocked = true; this.state.isFirstTrackingLock = true; this.state.isAnimatingInitialLock = false; this.hideAlts && this.hideAlts();
                        document.getElementById('btn-recenter').style.display = 'none';
                        btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"></rect></svg><span>Arrêter</span>`; btn.style.background = "var(--danger-color)"; btn.style.color = "white";
                        
                        const startInput = document.getElementById('input-wp-start');
                        let hasDestination = this.state.coords['input-wp-dest'] || (this.state.currentGeoJSON && this.state.currentGeoJSON.coordinates);
                        if (hasDestination && !this.state.routeExpert) {      // un itinéraire Expert garde son tracé : pas de recalcul au démarrage
                            if (startInput) startInput.value = "📍 Ma position actuelle";
                            this.state.coords['input-wp-start'] = this.state.lastKnownCoords;
                            if (!this.state.coords['input-wp-dest'] && this.state.currentGeoJSON) { const routeCoords = this.state.currentGeoJSON.coordinates; this.state.coords['input-wp-dest'] = routeCoords[routeCoords.length - 1]; }
                            this.checkAndCalculate();
                        }
                        this.updateUserLocation({ coords: { longitude: this.state.lastKnownCoords[0], latitude: this.state.lastKnownCoords[1], heading: this.state.lastKnownHeading, speed: (this.state.lastKnownSpeed/3.6) } });
                    }
                },
                updateUserLocation(position) {
                    if (!this.state.map) return;
                    const currentCoords = [position.coords.longitude, position.coords.latitude]; const now = Date.now();
                    { const c = position.coords; if (!(c.accuracy > 40)) this.state.gpsSpeedKmh = (c.speed === null || isNaN(c.speed) || c.speed < 0.6) ? 0 : c.speed * 3.6; }
                    let rawSpeed = (position.coords.speed !== null && !isNaN(position.coords.speed)) ? (position.coords.speed * 3.6) : 0;
                    if (rawSpeed === 0 && this.state.lastKnownCoords && this.state.lastTime) {
                        let dist = this.calculateDistance(this.state.lastKnownCoords, currentCoords); let timeDiff = (now - this.state.lastTime) / 1000;
                        if (timeDiff > 0 && dist > 1.5) rawSpeed = (dist / timeDiff) * 3.6;
                    }
                    if (typeof OfflineMaps !== 'undefined' && OfflineMaps.auto) { try { OfflineMaps.auto.tick(currentCoords, rawSpeed, position.coords.heading); } catch (e) {} }   // téléchargement progressif de la carte
                    if (this.state.smoothedSpeed === null) this.state.smoothedSpeed = rawSpeed; else this.state.smoothedSpeed += 0.2 * (rawSpeed - this.state.smoothedSpeed);
                    let currentSpeed = this.state.smoothedSpeed;
                    let currentHeading = 0;
                    if (currentSpeed < 5 && this.state.compassHeading !== null) { currentHeading = this.state.compassHeading; this.state.smoothedHeading = currentHeading; } else {
                        let rawHeading = (position.coords.heading !== null && !isNaN(position.coords.heading)) ? position.coords.heading : null;
                        if (rawHeading === null && this.state.lastKnownCoords) {
                            let dist = this.calculateDistance(this.state.lastKnownCoords, currentCoords);
                            if (dist > 1.5) rawHeading = this.calculateHeading(this.state.lastKnownCoords, currentCoords); else rawHeading = this.state.lastKnownHeading;
                        }
                        if (this.state.smoothedHeading === null) this.state.smoothedHeading = rawHeading || 0;
                        else if (rawHeading !== null) {
                            let diff = rawHeading - this.state.smoothedHeading; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
                            this.state.smoothedHeading = (this.state.smoothedHeading + 0.6 * diff) % 360; if (this.state.smoothedHeading < 0) this.state.smoothedHeading += 360;
                        }
                        currentHeading = this.state.smoothedHeading || 0;
                    }
                    try { AppTheme.rememberPos(currentCoords[1], currentCoords[0]); } catch (e) {} this.state.lastKnownCoords = currentCoords; this.state.lastKnownHeading = currentHeading; this.state.lastKnownSpeed = rawSpeed; this.state.lastTime = now;
                    this.autoStart();
                    
                    // 🟢 NOUVEAU : Zoom dynamique plus reculé pour une meilleure vision globale de l'itinéraire
                    // À l'arrêt, on démarre à 17.5 (au lieu de 19.5). Plus la vitesse augmente, plus on dézoome (jusqu'à 13.5).
                    let dynamicZoom = 17.5 - (currentSpeed / 40); 
                    dynamicZoom = Math.max(13.5, Math.min(17.5, dynamicZoom));

                    // 🟢 NOUVEAU : Calcul de la position d'affichage (Aimantation / Snap to route)
                    let displayCoords = currentCoords;

                    if (this.state.isTracking && this.state.currentGeoJSON && this.state.currentGeoJSON.coordinates) {
                        let coords = this.state.currentGeoJSON.coordinates;
                        let searchStart = this.state.passedRouteIndex || 0;
                        // Fenêtre de recherche en distance (≈ 700 m devant, au moins 50 sommets) : un trou GPS (tunnel) à grande vitesse ne fait plus sortir du tracé
                        let searchEnd = searchStart, wAcc = 0; while (searchEnd < coords.length - 1 && ((searchEnd - searchStart) < 50 || wAcc < 700) && wAcc < 1200) { wAcc += this.calculateDistance(coords[searchEnd], coords[searchEnd + 1]); searchEnd++; }
                        searchEnd = Math.min(searchEnd + 1, coords.length - 1);
                        const movingFast = (this.state.lastKnownSpeed || 0) > 15 && !(position.coords.accuracy > 40);
                        let bestDist = Infinity, bestRaw = Infinity, bestSegIdx = searchStart, bestPoint = coords[searchStart];
                        
                        for (let i = searchStart; i < searchEnd; i++) {
                            const projected = this.projectPointOnSegment(currentCoords, coords[i], coords[i + 1]);
                            const raw = this.calculateDistance(currentCoords, projected);
                            let d = raw;
                            // 4 voies / chaussées séparées : un segment orienté à l'opposé du cap (l'autre chaussée) est pénalisé
                            if (movingFast && raw > 8) { let df = Math.abs(this.calculateHeading(coords[i], coords[i + 1]) - currentHeading) % 360; if (df > 180) df = 360 - df; if (df > 110) d += 40; }
                            if (d < bestDist) { bestDist = d; bestRaw = raw; bestSegIdx = i; bestPoint = projected; }
                        }
                        bestDist = bestRaw;
                        const offTol = Math.max(50, Math.min(120, (position.coords.accuracy || 0) * 1.5));   // tolérance adaptée à la précision du GPS

                        // 🧲 Aimantation si à moins de 10m du tracé
                        if (bestDist < 10) {
                            displayCoords = bestPoint;
                        }

                        // ✂️ Effacement fluide et recalcul (tolérance 50m)
                        if (bestDist < offTol) { 
                            this.state.passedRouteIndex = bestSegIdx;
                            this.state.offRouteCount = 0; 
                            
                            // La route restante démarre EXACTEMENT sous le curseur affiché
                            let remainingCoords = [displayCoords, ...coords.slice(bestSegIdx + 1)];
                            if (remainingCoords.length >= 2) this.state.routeGeo = { type: 'LineString', coordinates: remainingCoords };
                            if (remainingCoords.length >= 2 && this.state.map.getSource('route')) { 
                                this.state.map.getSource('route').setData({ type: 'LineString', coordinates: remainingCoords }); 
                            }
                        } else {
                            this.offRoute(currentCoords);
                        }
                    }

                    // 🟢 Mise à jour du marqueur visuel avec la position ajustée (displayCoords)
                    if (this.state.userMarker) { 
                        this.glideUserMarker(displayCoords, currentHeading);
                    } else {
                        const el = document.createElement('div'); el.className = 'gps-marker-container';
                        el.innerHTML = `<svg width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg"><defs><filter id="glow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.8"/><feDropShadow class="gm-glow" dx="0" dy="0" stdDeviation="3" flood-color="#ff6a1a" flood-opacity="0.5"/></filter></defs><g filter="url(#glow)"><polygon points="28 6 10 46 28 36 46 46" fill="rgba(28, 28, 30, 0.75)" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/><polygon points="28 6 10 46 28 36 46 46" fill="none" class="gm-acc" stroke="#ff6a1a" stroke-width="1.5" stroke-linejoin="round"/></g></svg>`;
                        this.state.userMarker = new maplibregl.Marker({ element: el, pitchAlignment: 'map', rotationAlignment: 'map' }).setLngLat(displayCoords).setRotation(currentHeading).addTo(this.state.map);
                        this.state.markerPos = displayCoords; this.state.markerHeading = currentHeading;
                    }

                    if (!this.state.hasInitialCentered && !this.state.isTracking) { this.state.map.easeTo({ center: currentCoords, zoom: 13, duration: 2000 }); this.state.hasInitialCentered = true; }

                    if (this.state.isTracking) {
                        // L'enregistrement de la trace libre utilise les vraies coordonnées GPS (currentCoords)
                        if (!this.state.recordedPath) this.state.recordedPath = [];
                        const lastPt = this.state.recordedPath[this.state.recordedPath.length - 1];
                        if (!lastPt || this.calculateDistance(lastPt, currentCoords) > 5) {
                            this.state.recordedPath.push(currentCoords);
                        }
                        this.rideStatsTick(position);

                        // La caméra suit displayCoords (point GPS dans le bas de l'écran, route devant)
                        if (this.state.isCameraLocked) this.navCamera(displayCoords, currentHeading, currentSpeed);

                        this.updateNavHud(currentCoords);
                        this.updateTripBar(displayCoords, currentSpeed);
                        this.updateRoadInfo(displayCoords, currentHeading);
                    }
                },
                drawRouteOnMap(routeGeoJSON) {
                    this.updateRouteControls();
                    if (!this.state.map) return;
                    this.state.passedRouteIndex = 0; 
                    this.ensureRouteLayers(routeGeoJSON);
                    if (!this.state.isTracking) { const coords = routeGeoJSON.coordinates; const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0])); this.state.map.fitBounds(bounds, { padding: 50, duration: 1500 }); }
                },
                // Déplace le point GPS en douceur (1 s) d'un relevé au suivant.
                // ⚠️ Ne pas faire ça en CSS (transition sur le marqueur) : MapLibre positionne le marqueur avec ce même « transform »,
                // le point traînait alors derrière la carte quand on la déplaçait ou zoomait.
                glideUserMarker(to, heading) {
                    const s = this.state, mk = s.userMarker; if (!mk) return;
                    cancelAnimationFrame(s.markerAnim);
                    const hdg = isFinite(heading) ? heading : (s.markerHeading || 0);
                    const from = s.markerPos || to, h0 = isFinite(s.markerHeading) ? s.markerHeading : hdg;
                    if (this.calculateDistance(from, to) > 300) { mk.setLngLat(to); mk.setRotation(hdg); s.markerPos = to; s.markerHeading = hdg; return; }
                    const dh = ((hdg - h0 + 540) % 360) - 180;          // plus court chemin pour tourner
                    const t0 = performance.now(), D = 1000;
                    const step = (t) => {
                        const k = Math.min(1, (t - t0) / D);
                        const pos = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k], h = h0 + dh * k;
                        mk.setLngLat(pos); mk.setRotation(h); s.markerPos = pos; s.markerHeading = h;
                        if (k < 1) s.markerAnim = requestAnimationFrame(step);
                    };
                    s.markerAnim = requestAnimationFrame(step);
                },
                initTabs() { 
                    const tabs = document.querySelectorAll('.gps-tab-btn');
                    tabs.forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            const targetId = e.currentTarget.getAttribute('data-sub'); tabs.forEach(t => t.classList.remove('active')); e.currentTarget.classList.add('active');
                            document.querySelectorAll('.gps-sub-view').forEach(v => v.classList.remove('active')); const targetView = document.getElementById(targetId); if (targetView) targetView.classList.add('active');
                            if (targetId === 'sub-gps-carte' && this.state.map) { setTimeout(() => this.state.map.resize(), 50); }
                        });
                    });
                },
                // Départ = position de l'utilisateur, tant qu'aucun départ n'a été choisi ni aucun tracé chargé
                autoStart() {
                    const s = this.state, inp = document.getElementById('input-wp-start');
                    if (!inp || !s.lastKnownCoords || s.coords['input-wp-start']) return;
                    if (inp.value && inp.value.trim()) return;
                    if (s.currentGeoJSON || s.routeExpert) return;
                    inp.value = '📍 Ma position actuelle'; s.coords['input-wp-start'] = s.lastKnownCoords;
                },
                initBottomSheet() {
                    const sheet = document.getElementById('route-bottom-sheet'); const toggleBtn = document.getElementById('btn-toggle-sheet'); const contentArea = document.getElementById('sheet-content-area');
                    if (!sheet || !toggleBtn || !contentArea) return;
                    let isExpanded = false;
                    const toggleSheet = () => { isExpanded = !isExpanded; if (isExpanded) { sheet.classList.add('open'); this.autoStart(); } else { sheet.classList.remove('open'); } };
                    toggleBtn.addEventListener('click', toggleSheet); contentArea.addEventListener('click', () => { if (!isExpanded) toggleSheet(); });
                },
});

// --- Navigation : caméra, tracé lisible, instructions de virage, barre de trajet ---
Object.assign(ModuleGPS, {
                // Tracé : contour sombre + ligne épaisse qui grossit avec le zoom (lisible de loin comme de près)
                ensureRouteLayers(data) {
                    const m = this.state.map; if (!m) return;
                    if (data) this.state.routeGeo = data;
                    if (m.getSource('route')) { if (data) m.getSource('route').setData(data); }
                    else m.addSource('route', { type: 'geojson', data: data || { type: 'FeatureCollection', features: [] } });
                    const layout = { 'line-join': 'round', 'line-cap': 'round' };
                    if (!m.getLayer('route-casing')) m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout, paint: { 'line-color': '#0b0b0d', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 13, 18, 22] } });
                    if (!m.getLayer('route-line')) m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout, paint: { 'line-color': AppTheme.getRouteColor(), 'line-opacity': 1, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 14, 8, 18, 14] } });
                },
                // Caméra de navigation : vue inclinée, le point GPS dans le bas de l'écran (on voit loin devant),
                // zoom qui s'adapte à la vitesse et se rapproche à l'approche d'un virage
                navCamera(center, heading, speed) {
                    const s = this.state, m = s.map; if (!m) return;
                    const h = m.getContainer().clientHeight || 600;
                    const padding = { top: Math.round(h * 0.4), bottom: 0, left: 0, right: 0 };
                    let zoom = 17 - (speed / 35);
                    const step = s.routeSteps && s.routeSteps[s.currentStepIndex];
                    if (step && step.maneuver && this.calculateDistance(center, step.maneuver.location) < 150) zoom += 0.7;
                    zoom = Math.max(14, Math.min(17.5, zoom));
                    if (s.isFirstTrackingLock) {
                        s.isFirstTrackingLock = false; s.isAnimatingInitialLock = true;
                        m.flyTo({ center, zoom, pitch: 60, bearing: heading, padding, duration: 2500 });
                        setTimeout(() => { s.isAnimatingInitialLock = false; }, 2600);
                    } else if (!s.isAnimatingInitialLock) {
                        m.easeTo({ center, zoom, pitch: 60, bearing: heading, padding, duration: 1000, easing: t => t });
                    }
                },
                // Angle de sortie d'un rond-point par rapport au sens d'entrée (0° = tout droit, 90° = droite, 180° = demi-tour…)
                roundaboutAngle(step, next) {
                    const m = step.maneuver, n = next && next.maneuver;
                    if (n && isFinite(n.bearing_after) && isFinite(m.bearing_before)) return ((n.bearing_after - m.bearing_before) % 360 + 360) % 360;
                    const mod = m.modifier || '';
                    const map = { 'straight': 0, 'slight right': 45, 'right': 90, 'sharp right': 135, 'uturn': 180, 'sharp left': 225, 'left': 270, 'slight left': 315 };
                    return mod in map ? map[mod] : null;
                },
                navStepIcon(step, next) {
                    const t = step.maneuver.type, mod = step.maneuver.modifier || '';
                    if (t === 'roundabout' || t === 'rotary') {
                        const a = this.roundaboutAngle(step, next);
                        const ring = '<circle cx="12" cy="12" r="4.5"></circle><line x1="12" y1="22" x2="12" y2="16.5"></line>';
                        if (a === null) return ring;
                        const r = a * Math.PI / 180, dx = Math.sin(r), dy = -Math.cos(r), nx = Math.cos(r), ny = Math.sin(r), f = v => v.toFixed(2);
                        const P = [12 + 4.5 * dx, 12 + 4.5 * dy], Q = [12 + 10.5 * dx, 12 + 10.5 * dy];
                        const H1 = [Q[0] - 3.2 * dx + 2.8 * nx, Q[1] - 3.2 * dy + 2.8 * ny], H2 = [Q[0] - 3.2 * dx - 2.8 * nx, Q[1] - 3.2 * dy - 2.8 * ny];
                        return ring + `<line x1="${f(P[0])}" y1="${f(P[1])}" x2="${f(Q[0])}" y2="${f(Q[1])}"></line><polyline points="${f(H1[0])} ${f(H1[1])} ${f(Q[0])} ${f(Q[1])} ${f(H2[0])} ${f(H2[1])}"></polyline>`;
                    }
                    if (t === 'arrive') return '<path d="M4 22V4"></path><path d="M4 4h13l-2 4 2 4H4"></path>';
                    if (mod === 'uturn') return '<path d="M8 20V9a4 4 0 0 1 8 0v3"></path><polyline points="12 9 16 13 20 9"></polyline>';
                    if (mod.includes('right')) return mod.includes('slight') ? '<polyline points="10 5 19 5 19 14"></polyline><line x1="5" y1="19" x2="19" y2="5"></line>' : '<polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>';
                    if (mod.includes('left')) return mod.includes('slight') ? '<polyline points="14 5 5 5 5 14"></polyline><line x1="19" y1="19" x2="5" y2="5"></line>' : '<polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>';
                    return '<line x1="12" y1="20" x2="12" y2="4"></line><polyline points="5 11 12 4 19 11"></polyline>';
                },
                navStepLabel(step, next) {
                    const t = step.maneuver.type, mod = step.maneuver.modifier || '';
                    if (t === 'arrive') return 'Arrivée';
                    if (t === 'depart') return 'Départ';
                    if (t === 'roundabout' || t === 'rotary') {
                        const x = step.maneuver.exit, a = this.roundaboutAngle(step, next);
                        const dir = a === null ? '' : (a < 25 || a > 335 ? 'tout droit' : (a < 160 ? 'à droite' : (a <= 200 ? 'demi-tour' : 'à gauche')));
                        return (x ? `Rond-point · ${x}${x === 1 ? 're' : 'e'} sortie` : 'Rond-point') + (dir ? ` (${dir})` : '');
                    }
                    if (mod === 'uturn') return 'Faire demi-tour';
                    const side = mod.includes('left') ? 'gauche' : (mod.includes('right') ? 'droite' : '');
                    if (t === 'fork') return side ? `Garder la ${side}` : 'Bifurquer';
                    if (t === 'off ramp') return 'Prendre la sortie' + (side ? ` à ${side}` : '');
                    if (t === 'merge') return 'S\'insérer';
                    if (side) return mod.includes('sharp') ? `Tourner franchement à ${side}` : (mod.includes('slight') ? `Légèrement à ${side}` : `Tourner à ${side}`);
                    return 'Continuer tout droit';
                },
                // Distance cumulée le long du tracé (m) de chaque sommet ; recalculée si le tracé change
                routeCumOf(g) {
                    const s = this.state;
                    if (s.routeCumFor !== g) { const cum = [0]; for (let i = 1; i < g.length; i++) cum.push(cum[i - 1] + this.calculateDistance(g[i - 1], g[i])); s.routeCum = cum; s.routeCumFor = g; }
                    return s.routeCum;
                },
                // Position (m depuis le départ) de chaque manœuvre sur le tracé ; null si elle n'est pas sur le tracé (alors on garde la distance à vol d'oiseau)
                stepCums(g, steps) {
                    const s = this.state; if (s._scFor === steps && s._scG === g) return s._sc;
                    const cum = this.routeCumOf(g), out = []; let from = 0;
                    for (const st of steps) {
                        const loc = st && st.maneuver && st.maneuver.location; let bi = -1, bd = Infinity, bp = null;
                        if (loc) for (let i = from; i < g.length - 1; i++) {
                            const p = this.projectPointOnSegment(loc, g[i], g[i + 1]), d = this.calculateDistance(loc, p);
                            if (d < bd - 1) { bd = d; bi = i; bp = p; } else if (bd < 25 && i - bi > 12) break;   // premier passage proche trouvé : on ne saute pas à un second passage plus loin
                        }
                        if (bi >= 0 && bd < 60) { out.push(cum[bi] + this.calculateDistance(g[bi], bp)); from = bi; } else out.push(null);
                    }
                    s._scFor = steps; s._scG = g; s._sc = out; return out;
                },
                alongDist(here, step, straight) {
                    try {
                        const s = this.state, g = s.currentGeoJSON && s.currentGeoJSON.coordinates, steps = s.routeSteps;
                        if (!g || g.length < 2 || !steps) return straight;
                        const k = steps.indexOf(step); if (k < 0) return straight;
                        const sc = this.stepCums(g, steps)[k]; if (sc == null) return straight;
                        const cum = this.routeCumOf(g), idx = Math.min(Math.max(s.passedRouteIndex || 0, 0), g.length - 2);
                        const me = cum[idx] + this.calculateDistance(g[idx], this.projectPointOnSegment(here, g[idx], g[idx + 1]));
                        const d = sc - me;
                        if (!isFinite(d) || d < 0 || d < straight - 40 || d > straight * 6 + 800) return straight;   // incohérent (GPS en retard, tracé en boucle) : repli sûr
                        return d;
                    } catch (e) { return straight; }
                },
                // Bandeau d'instruction : icône + distance + type de manœuvre + nom de la rue, et un aperçu du virage suivant s'il est proche
                updateNavHud(here) {
                    const s = this.state; const steps = s.routeSteps;
                    const hud = document.getElementById('nav-instruction-hud'); if (!hud) return;
                    if (!steps || !steps.length) { hud.style.display = 'none'; return; }
                    let step = steps[s.currentStepIndex]; if (!step) return;
                    let dist = this.calculateDistance(here, step.maneuver.location);
                    // On passe à la manœuvre suivante quand on a DÉPASSÉ le point (et non quand on s'en approche) :
                    // sinon l'instruction disparaît 25 m avant le virage / l'entrée du rond-point.
                    if (s._stepIdx !== s.currentStepIndex) { s._stepIdx = s.currentStepIndex; s._stepMin = Infinity; }
                    s._stepMin = Math.min(s._stepMin, dist);
                    const isRb = step.maneuver.type === 'roundabout' || step.maneuver.type === 'rotary';
                    const nextStep = steps[s.currentStepIndex + 1];
                    const passed = isRb
                        ? (s._stepMin < 40 && (dist > s._stepMin + 45 || (nextStep && this.calculateDistance(here, nextStep.maneuver.location) < 20)))
                        : (s._stepMin < 40 && dist > s._stepMin + 10) || dist < 8;
                    if (passed && nextStep) { s.currentStepIndex++; step = nextStep; dist = this.calculateDistance(here, step.maneuver.location); s._stepIdx = s.currentStepIndex; s._stepMin = dist; }
                    hud.style.display = 'flex';
                    dist = this.alongDist(here, step, dist);   // distance SUR la route (et non à vol d'oiseau : faux dans les virolos)
                    this.voiceAnnounce(step, dist, steps[s.currentStepIndex + 1]);
                    document.getElementById('nav-distance').textContent = AppUnits.short(dist);
                    const iconEl = document.getElementById('nav-turn-icon'); iconEl.innerHTML = this.navStepIcon(step, steps[s.currentStepIndex + 1]); iconEl.style.color = AppTheme.getRouteColor();
                    const lab = document.getElementById('nav-label'); if (lab) lab.textContent = this.navStepLabel(step, steps[s.currentStepIndex + 1]);
                    const st = document.getElementById('nav-street'); if (st) { const n = step.maneuver.type === 'arrive' ? (s.currentRouteTitle.split(' ➔ ')[1] || '') : [step.ref, step.name].filter(Boolean).join(' · '); st.textContent = n; st.style.display = n ? 'block' : 'none'; }
                    const exitBadge = document.getElementById('nav-exit-badge');
                    if (exitBadge) { const ex = (step.maneuver.type === 'roundabout' || step.maneuver.type === 'rotary') ? (step.maneuver.exit || 1) : null; exitBadge.textContent = ex || ''; exitBadge.style.display = ex ? 'flex' : 'none'; }
                    // Virage suivant (si moins de 300 m après celui-ci)
                    const nx = steps[s.currentStepIndex + 1], nxEl = document.getElementById('nav-next');
                    if (nxEl) {
                        if (nx && nx.maneuver && this.calculateDistance(step.maneuver.location, nx.maneuver.location) < 300) {
                            document.getElementById('nav-next-icon').innerHTML = this.navStepIcon(nx, steps[s.currentStepIndex + 2]); nxEl.style.display = 'flex';
                        } else nxEl.style.display = 'none';
                    }
                },
                // Barre de trajet : heure d'arrivée, temps et distance restants, vitesse
                // Widget compteur : même source que le menu Compteur (vitesse GPS brute, filtre précision, seuil 0,6 m/s)
                // et même courbe d'amortissement ; si le Compteur tourne, on lit directement sa valeur.
                updateSpeedWidget() {
                    const s = this.state, D = (typeof ModuleDashboard !== 'undefined') ? ModuleDashboard.state : null;
                    if (!s._spLoop) {
                        s._spLoop = true; s._spUi = 0;
                        const tick = () => {
                            const bar = document.getElementById('nav-trip-bar');
                            if (!s.isTracking || !bar) { s._spLoop = false; return; }
                            let v;
                            if (D && D.isRiding && !D.isAnimating) v = D.currentSpeedUi;
                            else { s._spUi += ((s.gpsSpeedKmh || 0) - s._spUi) * 0.15; v = s._spUi; }
                            const nk = Math.round(v) < 1 ? 0 : Math.round(v), n = AppUnits.spd(nk);
                            const el = document.getElementById('nt-speed'); if (el && el.textContent !== String(n)) el.textContent = n;
                            bar.classList.toggle('over', !!(s.speedLimit && nk > s.speedLimit));
                            const ring = document.getElementById('nt-ring'); if (ring) ring.style.strokeDashoffset = 377 - 377 * Math.min(v / 200, 1);
                            requestAnimationFrame(tick);
                        };
                        requestAnimationFrame(tick);
                    }
                },
                updateTripBar(here, speed) {
                    const s = this.state; const bar = document.getElementById('nav-trip-bar'); if (!bar) return;
                    const g = s.currentGeoJSON && s.currentGeoJSON.coordinates;
                    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
                    this.updateSpeedWidget();
                    const route = bar.querySelectorAll('.nt-route');
                    bar.classList.toggle('no-route', !(g && g.length >= 2));
                    if (!g || g.length < 2) { route.forEach(e => e.style.display = 'none'); return; }
                    this.routeCumOf(g);
                    const idx = Math.min(s.passedRouteIndex || 0, g.length - 2);
                    const total = s.routeCum[g.length - 1];
                    const rem = Math.max(0, total - s.routeCum[idx + 1] + this.calculateDistance(here, g[idx + 1]));
                    const avg = (s.routeDistM > 0 && s.routeDurSec > 0) ? s.routeDistM / s.routeDurSec : 50 / 3.6;   // m/s
                    const sec = rem / avg;
                    route.forEach(e => e.style.display = '');
                    set('nt-dist', AppUnits.trip(rem));
                    set('nt-time', sec >= 3600 ? `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}` : `${Math.max(1, Math.round(sec / 60))} min`);
                    set('nt-eta', new Date(Date.now() + sec * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
                },
});

// ============================================================
//  GUIDAGE VOCAL · LIMITATION DE VITESSE · ZONES DE DANGER
//  Données OpenStreetMap via l'API publique Overpass (aucun serveur à toi).
// ============================================================
Object.assign(ModuleGPS, {
    voiceOn() { try { return localStorage.getItem('moto_voice') !== '0'; } catch (e) { return true; } },
    setVoice(on) {
        try { localStorage.setItem('moto_voice', on ? '1' : '0'); } catch (e) {}
        this.renderVoiceBtn();
        if (!on && 'speechSynthesis' in window) speechSynthesis.cancel(); else if (on) this.speak('Guidage vocal activé', true);
    },
    renderVoiceBtn() { const b = document.getElementById('btn-voice'); if (b) b.classList.toggle('off', !this.voiceOn()); },
    // Voix française (préférence : voix installée sur le téléphone, qui marche aussi hors ligne)
    frVoice() {
        try {
            const vs = speechSynthesis.getVoices() || [], fr = vs.filter(x => x.lang && x.lang.toLowerCase().replace('_', '-').startsWith('fr'));
            return fr.find(x => /fr-fr/i.test(x.lang.replace('_', '-')) && x.localService) || fr.find(x => x.localService) || fr[0] || null;
        } catch (e) { return null; }
    },
    // urgent = l'instruction « maintenant » : coupe ce qui est en cours. Sinon le message attend la fin de la phrase (le plus récent remplace l'ancien, périmé après 6 s).
    speak(txt, urgent) {
        // La voix ne parle que pendant le suivi d'un itinéraire
        const st = this.state; if (!st.isTracking || !st.currentGeoJSON || !st.routeSteps || !st.routeSteps.length) return;
        if (!this.voiceOn() || !('speechSynthesis' in window)) return;
        try {
            const synth = speechSynthesis, me = this;
            if (!this._vInit) { this._vInit = true; try { synth.addEventListener('voiceschanged', () => {}); synth.getVoices(); } catch (e) {} }
            const say = () => {
                const u = new SpeechSynthesisUtterance(txt); u.lang = 'fr-FR'; u.rate = 1.05;
                const v = me.frVoice(); if (v) u.voice = v;
                const done = () => { if (me._u !== u) return; me._u = null; const q = me._q; me._q = null; if (q && Date.now() - q.t < 6000) me.speak(q.txt, q.urgent); };
                u.onend = done; u.onerror = done;
                me._u = u; me._uAt = Date.now();   // référence gardée : sinon Android peut ramasser l'objet avant la fin de la phrase
                try { synth.resume(); } catch (e) {}
                synth.speak(u);
            };
            const busy = (synth.speaking || synth.pending) && this._u && Date.now() - (this._uAt || 0) < 15000;   // > 15 s = synthèse bloquée : on la relance
            if (busy) {
                if (urgent) { this._u = null; this._q = null; synth.cancel(); setTimeout(say, 120); }   // cancel() puis speak() immédiat est ignoré sur Android
                else this._q = { txt, urgent, t: Date.now() };
            } else if (synth.speaking || synth.pending) { this._u = null; synth.cancel(); setTimeout(say, 120); }
            else say();
        } catch (e) {}
    },
    voiceStart() {
        const s = this.state; s._vk = -1; s._vStep = null; s._radSaid = {}; s._limT = 0; s._limPos = null; s._radT = 0; s._radPos = null; s.speedLimit = null; s.radars = [];
        const b = document.getElementById('btn-voice');
        if (b && !b._bound) { b._bound = true; b.addEventListener('click', (e) => { e.stopPropagation(); this.setVoice(!this.voiceOn()); }); }
        this.renderVoiceBtn();
        this.speak('Guidage démarré', true);
    },
    voiceStop() {
        if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
        this._u = null; this._q = null;
        this.state.speedLimit = null;
        const l = document.getElementById('nt-limit'); if (l) l.style.display = 'none';
        const r = document.getElementById('nav-radar'); if (r) r.style.display = 'none';
        const bar = document.getElementById('nav-trip-bar'); if (bar) bar.classList.remove('over');
    },
    spokenDist(d) {
        if (d >= 1000) { const k = Math.round(d / 100) / 10; return `${String(k).replace('.', ',')} kilomètre${k >= 2 ? 's' : ''}`; }
        return `${d >= 100 ? Math.round(d / 50) * 50 : Math.round(d / 10) * 10} mètres`;
    },
    // « D775 » → « D 775 » (sinon la synthèse lit « d sept cent soixante-quinze »)
    spokenRoad(step) {
        const nm = String(step.name || '').trim(), ref = String(step.ref || '').trim().split(';')[0].replace(/^([A-Za-z]{1,2})\s?(\d+)/, '$1 $2');
        return nm || ref;
    },
    voiceText(step, next, withRoad) {
        const m = step.maneuver, t = m.type, mod = m.modifier || '';
        if (t === 'arrive') return 'vous êtes arrivé à destination';
        const road = this.spokenRoad(step), on = (withRoad && road) ? ` sur ${road}` : '';
        if (t === 'roundabout' || t === 'rotary') {
            const ord = ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième'];
            const x = m.exit, a = this.roundaboutAngle(step, next);
            const dir = a === null ? '' : (a < 25 || a > 335 ? ', tout droit' : (a < 160 ? ', à droite' : (a <= 200 ? ', demi-tour' : ', à gauche')));
            return x ? `au rond-point, prenez la ${ord[x] || x + 'e'} sortie${dir}${on}` : 'prenez le rond-point';
        }
        if (mod === 'uturn') return 'faites demi-tour';
        const side = mod.includes('left') ? 'gauche' : (mod.includes('right') ? 'droite' : '');
        if (t === 'fork') return (side ? `serrez à ${side} à la bifurcation` : 'bifurquez') + on;
        if (t === 'off ramp') return 'prenez la sortie' + (side ? ` à ${side}` : '') + on;
        if (t === 'on ramp') return 'prenez la bretelle' + (side ? ` à ${side}` : '') + on;
        if (t === 'merge') return 'insérez-vous sur la voie' + on;
        if (side) return (mod.includes('sharp') ? `tournez franchement à ${side}` : (mod.includes('slight') ? `tournez légèrement à ${side}` : `tournez à ${side}`)) + on;
        return 'continuez tout droit' + on;
    },
    voiceAnnounce(step, dist, next) {
        const s = this.state; if (!step || !step.maneuver) return;
        // Suivi par manœuvre (et non par numéro) : après un recalcul d'itinéraire le numéro peut rester identique et la voix restait muette
        if (s._vStep !== step) { s._vStep = step; s._vFar = step.maneuver.type === 'depart'; s._vNear = step.maneuver.type === 'depart'; }
        const v = (s.gpsSpeedKmh || 0) / 3.6, far = Math.max(250, v * 30), near = Math.max(60, v * 7);
        const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
        // Enchaînement : si la manœuvre d'après est tout de suite derrière, on la prévient (« puis tournez à droite »)
        let then = '';
        if (next && next.maneuver && next.maneuver.type !== 'arrive' && step.maneuver.location && next.maneuver.location && this.calculateDistance(step.maneuver.location, next.maneuver.location) < 200) {
            then = `, puis ${this.voiceText(next, null, false)}`;
        }
        if (!s._vNear && dist <= near) { s._vNear = true; s._vFar = true; this.speak(cap(this.voiceText(step, next, true)) + then, true); }
        else if (!s._vFar && dist <= far && dist > near + 15) { s._vFar = true; this.speak(`Dans ${this.spokenDist(dist)}, ${this.voiceText(step, next, true)}${then}`, false); }
    },
    async overpass(q) {
        const r = await fetchT('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), {}, 20000);
        if (!r.ok) throw new Error('overpass'); return r.json();
    },
    parseMaxSpeed(v) {
        if (!v) return null; v = String(v).toLowerCase();
        if (/^\d+/.test(v)) { const n = parseInt(v, 10); return /mph/.test(v) ? Math.round(n * 1.609) : n; }
        if (v.includes('urban')) return 50; if (v.includes('rural')) return 80; if (v.includes('motorway')) return 130; if (v.includes('walk')) return 7;
        return null;
    },
    bearingTo(a, b) {
        const r = Math.PI / 180, y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
        const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
        return (Math.atan2(y, x) / r + 360) % 360;
    },
    // Limitation de vitesse de la route (requête espacée : > 100 m ou 30 s, jamais plus d'une toutes les 8 s) + zones de danger devant
    updateRoadInfo(pos, heading) {
        const s = this.state, now = Date.now(); if (!pos || !s.isTracking) return;
        if (!s._limBusy && now - (s._limT || 0) > 8000 && (!s._limPos || this.calculateDistance(s._limPos, pos) > 100 || now - s._limT > 30000)) {
            s._limBusy = true; s._limT = now; s._limPos = pos;
            this.overpass(`[out:json][timeout:8];way(around:20,${pos[1]},${pos[0]})[highway][maxspeed];out tags;`).then(d => {
                let lim = null; const els = (d.elements || []);
                const st = s.routeSteps && s.routeSteps[s.currentStepIndex], nm = st && (st.name || '');
                const pick = els.find(e => nm && e.tags && (e.tags.name === nm || e.tags.ref === st.ref)) || els[0];
                if (pick) lim = this.parseMaxSpeed(pick.tags.maxspeed);
                s.speedLimit = lim;
                const l = document.getElementById('nt-limit'); if (l) { l.textContent = lim ? AppUnits.spd(lim) : '--'; l.style.display = lim ? 'flex' : 'none'; }
            }).catch(() => {}).finally(() => { s._limBusy = false; });
        }
        if (!s._radBusy && now - (s._radT || 0) > 20000 && (!s._radPos || this.calculateDistance(s._radPos, pos) > 800 || now - s._radT > 120000)) {
            s._radBusy = true; s._radT = now; s._radPos = pos;
            this.overpass(`[out:json][timeout:8];node(around:2500,${pos[1]},${pos[0]})[highway=speed_camera];out;`).then(d => {
                s.radars = (d.elements || []).map(e => ({ id: e.id, pos: [e.lon, e.lat] }));
            }).catch(() => {}).finally(() => { s._radBusy = false; });
        }
        // Alerte : zone de danger devant (dans un cône de ±50° du cap), annoncée une seule fois
        const pill = document.getElementById('nav-radar'); let shown = null;
        const alerts = (s.radars || []).concat(s.reportsDanger || []);
        if (alerts.length && isFinite(heading)) {
            const v = (s.gpsSpeedKmh || 0) / 3.6, reach = Math.max(400, v * 20);
            for (const r of alerts) {
                const d = this.calculateDistance(pos, r.pos); if (d > reach) continue;
                const diff = Math.abs(((this.bearingTo(pos, r.pos) - heading + 540) % 360) - 180);
                if (diff > 50) continue;
                if (!shown || d < shown.d) shown = { d, id: r.id, label: r.label || 'Zone de danger', say: r.say || 'Zone de danger' };
            }
        }
        if (shown) {
            if (!s._radSaid[shown.id]) { s._radSaid[shown.id] = true; this.speak(`${shown.say} dans ${this.spokenDist(shown.d)}`); }
            if (pill) { pill.style.display = 'flex'; const tx = document.getElementById('nav-radar-txt'); if (tx) tx.textContent = `${shown.label} · ${Math.round(shown.d / 10) * 10} m`; }
        } else if (pill) pill.style.display = 'none';
    }
});
