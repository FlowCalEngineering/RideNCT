            const ModuleDashboard = {
                state: { 
                    isRiding: false, 
                    isAnimating: false, 
                    watchId: null, 
                    lastPosition: null, 
                    totalDistanceKm: 0, 
                    rideMotoId: null,
                    totalSeconds: 0, 
                    timerInterval: null, 
                    targetSpeedGps: 0, 
                    currentSpeedUi: 0, 
                    renderLoopId: null,
                    wakeLockSentinel: null // 🔆 Gère l'anti-veille de l'écran
                },
                
                init() {
                    try { this.widgetInit(); } catch (e) { console.warn('Widget compteur :', e); }
                    this.api.initBattery();
                    this.ecoInit();
                    
                    document.getElementById('btn-go-ride').addEventListener('click', () => {
                        if (this.state.isRiding) return; // Sécurité anti-double clic
                        
                        ModuleProfile.promptMotoSelection((selectedMoto) => {
                            if (selectedMoto === false) return; 
                            this.state.rideMotoId = selectedMoto ? selectedMoto.id : null; // Atelier : moto du trajet
                            
                            // Transmission de la moto au GPS
                            if (typeof ModuleGPS !== 'undefined') {
                                ModuleGPS.state.activeMotoStr = selectedMoto ? `${selectedMoto.marque} ${selectedMoto.modele}` : "Moto inconnue";
                                // Démarrage synchronisé direct (sans simuler de clic)
                                if (!ModuleGPS.state.isTracking) ModuleGPS.toggleTracking();
                            }
                            this.startRide();
                        });
                    });
                    
                    document.getElementById('btn-stop-ride').addEventListener('click', () => {
                        this.stopRide();
                        // Arrêt synchronisé direct
                        if (typeof ModuleGPS !== 'undefined' && ModuleGPS.state.isTracking) ModuleGPS.toggleTracking();
                    });

                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible' && this.state.isRiding) {
                            this.manageWakeLock(true);
                        }
                    });
                },

                // 🟢 NOUVEAU : Séparation claire de l'action de démarrage
                startRide() {
                    this.state.totalDistanceKm = 0; // distance du trajet en cours
                    this.state.prof = { turn: 0, anchor: null, brg: null, hi: 0, lo: 0, lastT: null, rain0: this.rainNow() };
                    if (typeof ModuleMaintenance !== 'undefined' && this.state.rideMotoId) ModuleMaintenance.rideStartCheck(this.state.rideMotoId);
                    this.state.isRiding = true; 
                    this.state.isAnimating = true;
                    this.manageWakeLock(true); 
                    this.render.setRidingState(true); this.ecoApply();
                    
                    this.render.playStartupAnimation(() => {
                        this.state.isAnimating = false;
                        if (this.state.isRiding) {
                            this.api.startGPS((pos) => this.compute.updateMetrics(pos), (err) => this.api.handleError(err));
                            this.compute.startEngineTimer();
                            this.render.startLiveRendering();
                        }
                    });
                },

                // 🟢 NOUVEAU : Séparation claire de l'action d'arrêt
                stopRide() {
                    const wasRiding = this.state.isRiding;
                    this.state.isRiding = false; 
                    this.api.stopGPS(); 
                    this.compute.stopEngineTimer();
                    this.manageWakeLock(false); 
                    cancelAnimationFrame(this.state.renderLoopId); clearTimeout(this.state.ecoT); 
                    this.render.setRidingState(false); this.state.ecoManual = null; this.ecoApply();
                    // 🔧 Atelier : propose d'ajouter le trajet aux compteurs de la moto
                    if (wasRiding && typeof ModuleMaintenance !== 'undefined' && this.state.rideMotoId) {
                        const p = this.state.prof || {}, r1 = this.rainNow(), rs = [p.rain0, r1].filter(x => x != null);
                        const info = { motoId: this.state.rideMotoId, km: this.state.totalDistanceKm, seconds: this.state.totalSeconds, prof: { turn: p.turn || 0, hi: p.hi || 0, lo: p.lo || 0, rain: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null } };
                        this.state.rideMotoId = null;
                        setTimeout(() => ModuleMaintenance.onRideEnded(info), 400);
                    }
                },

                // Pluie en ce moment (0 ou 1) d'après la dernière météo récupérée, null si inconnue
                rainNow() {
                    try { const w = ModuleWeather.state; if (w.code == null || Date.now() - (w.codeAt || 0) > 3 * 3600000) return null; return (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82) || w.code >= 95 ? 1 : 0; } catch (e) { return null; }
                },
                // Profil de roulage du trajet : virages cumulés, temps rapide / lent (sert à l'usure réelle des pièces, Atelier)
                profTrack(position, speedMs) {
                    const p = this.state.prof; if (!p) return;
                    const t = position.timestamp, kmh = speedMs * 3.6;
                    if (p.lastT != null) { const dt = (t - p.lastT) / 1000; if (dt > 0 && dt < 5) { if (kmh > 110) p.hi += dt; else if (kmh > 0 && kmh < 30) p.lo += dt; } }
                    p.lastT = t;
                    if (speedMs <= 0) return;
                    const la = position.coords.latitude, lo = position.coords.longitude, a = p.anchor;
                    if (!a) { p.anchor = { la, lo }; return; }
                    const R = 6371000, rad = Math.PI / 180, dy = (la - a.la) * rad * R, dx = (lo - a.lo) * rad * R * Math.cos(la * rad);
                    if (Math.hypot(dx, dy) < 25) return;   // un point tous les 25 m : insensible au bruit GPS
                    const brg = Math.atan2(dx, dy) / rad;
                    if (p.brg != null) { let d = Math.abs(brg - p.brg) % 360; if (d > 180) d = 360 - d; p.turn += d; }
                    p.brg = brg; p.anchor = { la, lo };
                },

                // 🔆 NOUVEAU : Fonction gérant l'allumage permanent de l'écran
                async manageWakeLock(turnOn) {
                    if (!('wakeLock' in navigator)) return;
                    if (turnOn && AppPrefs.get('wake') === 'never') return;   // réglage : ne pas garder l'écran allumé // Si non supporté, on ignore silencieusement
                    try {
                        if (turnOn) {
                            this.state.wakeLockSentinel = await navigator.wakeLock.request('screen');
                            console.log('Anti-veille activé (Compteur) 🟢');
                        } else if (this.state.wakeLockSentinel) {
                            await this.state.wakeLockSentinel.release();
                            this.state.wakeLockSentinel = null;
                            console.log('Anti-veille désactivé (Compteur) 🔴');
                        }
                    } catch (err) {
                        console.warn("Impossible de bloquer la mise en veille :", err);
                    }
                },

                render: {
                    setRidingState(isRiding) {
                        const overlay = document.getElementById('ride-overlay'); 
                        const content = document.getElementById('dashboard-content'); 
                        const btnStop = document.getElementById('btn-stop-ride'); 
                        const ring = document.getElementById('ui-speed-ring');
                        
                        document.body.classList.toggle('riding-now', !!isRiding);
                        if (isRiding) { 
                            overlay.style.display = 'none'; 
                            content.classList.remove('hidden'); 
                            btnStop.style.display = 'flex'; 
                        } else { 
                            overlay.style.display = 'flex'; 
                            content.classList.add('hidden'); 
                            btnStop.style.display = 'none'; 
                            document.getElementById('ui-speed').textContent = "0"; 
                            if(ring) ring.style.strokeDashoffset = 377; 
                        }
                    },
                    updateBatteryUI(level, isCharging) {
                        document.getElementById('battery-level').textContent = `${level}%`;
                        document.getElementById('battery-icon').textContent = isCharging ? '⚡' : (level <= 20 ? '🪫' : '🔋');
                    },
                    startLiveRendering() {
                        const st = ModuleDashboard.state; cancelAnimationFrame(st.renderLoopId); clearTimeout(st.ecoT);
                        const loop = () => {
                            if (ModuleDashboard.state.isRiding && !ModuleDashboard.state.isAnimating) {
                                ModuleDashboard.state.currentSpeedUi += (ModuleDashboard.state.targetSpeedGps - ModuleDashboard.state.currentSpeedUi) * 0.15;
                                let displaySpeed = AppUnits.spd(ModuleDashboard.state.currentSpeedUi);
                                if (displaySpeed < 1) displaySpeed = 0;
                                document.getElementById('ui-speed').textContent = displaySpeed;
                                const ring = document.getElementById('ui-speed-ring');
                                if (ring) ring.style.strokeDashoffset = 377 - (377 * Math.min(ModuleDashboard.state.currentSpeedUi / 200, 1));
                            }
                            if (!ModuleDashboard.state.isRiding) return;
                            if (ModuleDashboard.state.eco) ModuleDashboard.state.ecoT = setTimeout(loop, 150);   // économie d'énergie : ≈ 6 images / s
                            else ModuleDashboard.state.renderLoopId = requestAnimationFrame(loop);
                        }; loop();
                    },
                    updateStaticDisplays(distanceKm, totalSeconds) {
                        document.getElementById('ui-distance').innerHTML = `${AppUnits.km(distanceKm).toFixed(2)}<span class="mini-unit" data-u="dist">${AppUnits.distLabel()}</span>`;
                        document.getElementById('ui-engine-hours').innerHTML = `${(totalSeconds / 3600).toFixed(1)}<span class="mini-unit">h</span>`;
                        const indicator = document.getElementById('gps-indicator');
                        indicator.style.opacity = '1'; 
                        setTimeout(() => indicator.style.opacity = '0', 200);
                    },
                    playStartupAnimation(callback) {
                        const speedText = document.getElementById('ui-speed'); 
                        const ring = document.getElementById('ui-speed-ring');
                        let start = null;
                        const animate = (timestamp) => {
                            if (!ModuleDashboard.state.isRiding) return; 
                            if (!start) start = timestamp;
                            const progress = timestamp - start; 
                            let currentSpeed = 0;
                            
                            if (progress < 700) { 
                                currentSpeed = Math.round(199 * Math.sin((progress / 700) * Math.PI / 2)); 
                            } else if (progress < 1400) { 
                                currentSpeed = Math.round(199 * Math.cos(((progress - 700) / 700) * Math.PI / 2)); 
                            } else { 
                                speedText.textContent = "0"; 
                                if (ring) ring.style.strokeDashoffset = 377; 
                                ModuleDashboard.state.currentSpeedUi = 0; 
                                ModuleDashboard.state.targetSpeedGps = 0; 
                                if (callback) callback(); 
                                return; 
                            }
                            speedText.textContent = AppUnits.spd(currentSpeed); 
                            if (ring) ring.style.strokeDashoffset = 377 - (377 * Math.min(currentSpeed / 200, 1));
                            requestAnimationFrame(animate);
                        }; requestAnimationFrame(animate);
                    }
                },

                api: {
                    initBattery() {
                        if ('getBattery' in navigator) {
                            navigator.getBattery().then(b => { 
                                ModuleDashboard.compute.updateBattery(b); 
                                b.addEventListener('levelchange', () => ModuleDashboard.compute.updateBattery(b)); 
                                b.addEventListener('chargingchange', () => ModuleDashboard.compute.updateBattery(b)); 
                            });
                        } else { 
                            document.getElementById('battery-icon').textContent = '🔋'; 
                            document.getElementById('battery-level').textContent = '?'; 
                        }
                    },
                    handleError(err) { console.warn('GPS compteur :', err && err.message); },
                    startGPS(onSuccess, onError) {
                        if (!navigator.geolocation) return AppDialog.alert("GPS non supporté par le navigateur.");
                        ModuleDashboard.state.lastPosition = null;
                        
                        // Le navigateur gère la popup d'autorisation ici
                        ModuleDashboard.state.watchId = navigator.geolocation.watchPosition(
                            onSuccess, 
                            (err) => {
                                // Une seule alerte toutes les 30 s (en tunnel le GPS échoue en boucle)
                                const now = Date.now(), st = ModuleDashboard.state;
                                if ((err.code === 1 || err.code === 2) && now - (st._gpsAlertT || 0) > 30000) {
                                    st._gpsAlertT = now;
                                    AppDialog.alert(err.code === 1 ? "⚠️ Accès GPS refusé. Veuillez l'autoriser dans les réglages de votre navigateur." : "⚠️ Signal GPS introuvable. Mettez-vous à découvert.");
                                }
                                if (onError) onError(err);
                            }, 
                            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                        );
                    },
                    stopGPS() { 
                        if (ModuleDashboard.state.watchId !== null) { 
                            navigator.geolocation.clearWatch(ModuleDashboard.state.watchId); 
                            ModuleDashboard.state.watchId = null; 
                        } 
                    }
                },

                compute: {
                    updateBattery(battery) { 
                        ModuleDashboard.render.updateBatteryUI(Math.round(battery.level * 100), battery.charging); 
                        ModuleDashboard.state.battLow = battery.level <= 0.2 && !battery.charging; ModuleDashboard.ecoApply();
                    },
                    startEngineTimer() { 
                        ModuleDashboard.state.totalSeconds = 0; 
                        ModuleDashboard.state.timerInterval = setInterval(() => { 
                            ModuleDashboard.state.totalSeconds++; 
                            ModuleDashboard.render.updateStaticDisplays(ModuleDashboard.state.totalDistanceKm, ModuleDashboard.state.totalSeconds); 
                        }, 1000); 
                    },
                    stopEngineTimer() { 
                        clearInterval(ModuleDashboard.state.timerInterval); 
                    },
                    updateMetrics(position) {
                        if (position.coords.accuracy > 40) return;
                        let speedMs = position.coords.speed; 
                        if (speedMs === null || speedMs < 0.6) speedMs = 0;
                        ModuleDashboard.state.targetSpeedGps = speedMs * 3.6;
                        try { ModuleDashboard.profTrack(position, speedMs); } catch (e) {}
                        
                        if (ModuleDashboard.state.lastPosition && speedMs > 0) {
                            const timeDiffSec = (position.timestamp - ModuleDashboard.state.lastPosition.timestamp) / 1000;
                            if (timeDiffSec > 0 && timeDiffSec < 5) {
                                const R = 6371; 
                                const lat1 = ModuleDashboard.state.lastPosition.coords.latitude * (Math.PI / 180); 
                                const lat2 = position.coords.latitude * (Math.PI / 180); 
                                const dLon = (position.coords.longitude - ModuleDashboard.state.lastPosition.coords.longitude) * (Math.PI / 180);
                                const a = Math.sin((lat2 - lat1) / 2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2)**2;
                                let distanceHaversine = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
                                
                                if (Math.abs((distanceHaversine / (timeDiffSec / 3600)) - (speedMs * 3.6)) > 15) { 
                                    distanceHaversine = (speedMs * timeDiffSec) / 1000; 
                                }
                                ModuleDashboard.state.totalDistanceKm += distanceHaversine;
                            }
                        }
                        ModuleDashboard.state.lastPosition = position;
                        ModuleDashboard.render.updateStaticDisplays(ModuleDashboard.state.totalDistanceKm, ModuleDashboard.state.totalSeconds);
                    }
                }
            };


// ====================================================================
//  ESPACE WIDGET du Compteur : Carte · Navigation · Musique · Météo · Intercom · Groupe
//  Un seul widget affiché à la fois, choix mémorisé. Aucun doublon de logique : on lit / pilote les modules existants.
// ====================================================================
Object.assign(ModuleDashboard, {
    // ---------- Économie d'énergie : écran noir et épuré, widgets en pause, affichage ralenti ----------
    ecoInit() {
        const b = this.$('btn-eco'); if (b) b.addEventListener('click', () => { this.state.ecoManual = !this.ecoWanted(); this.ecoApply(); });
        document.addEventListener('prefchange', (e) => { if (e.detail.key === 'eco') { this.state.ecoManual = null; this.ecoApply(); } });
    },
    // Veut-on l'économie d'énergie maintenant ? (choix manuel du trajet > réglage : jamais / batterie faible / toujours)
    ecoWanted() {
        if (this.state.ecoManual !== null && this.state.ecoManual !== undefined) return this.state.ecoManual;
        const m = AppPrefs.get('eco'); if (m === 'always') return true;
        return m === 'auto' && this.state.battLow === true;
    },
    // L'économie d'énergie (écran noir) ne s'applique que sur l'écran Route en plein écran
    ecoContext() { const d = this.$('view-dashboard'); return document.body.classList.contains('rm-imm') && !!d && d.classList.contains('active'); },
    ecoApply() {
        const on = this.state.isRiding && this.ecoWanted() && this.ecoContext();
        if (on === !!this.state.eco) { const b = this.$('btn-eco'); if (b) b.classList.toggle('on', on); return; }
        this.state.eco = on; document.body.classList.toggle('eco', on);
        const b = this.$('btn-eco'); if (b) b.classList.toggle('on', on);
        this.widgetSync();
        if (this.state.isRiding && !this.state.isAnimating) this.render.startLiveRendering();   // relance la boucle au bon rythme
    },

    W_KEYS: ['map', 'nav', 'music', 'weather', 'intercom', 'group'],
    $(id) { return document.getElementById(id); },
    setTxt(id, v) { const e = document.getElementById(id); if (e && e.textContent !== v) e.textContent = v; },

    widgetInit() {
        const root = this.$('dash-widget'); if (!root) return;
        let cur = 'nav'; try { cur = localStorage.getItem('motoapp_dash_widget') || 'nav'; } catch (e) {}
        if (!this.W_KEYS.includes(cur)) cur = 'nav';
        this.state.widget = cur;
        root.querySelectorAll('.dw-btn').forEach(b => b.addEventListener('click', () => this.widgetSelect(b.dataset.w)));

        // Musique
        const on = (id, fn) => { const e = this.$(id); if (e) e.addEventListener('click', fn); };
        on('dw-m-prev', () => { if (typeof ModuleMusic !== 'undefined') ModuleMusic.prevTrack(); });
        on('dw-m-play', () => { if (typeof ModuleMusic !== 'undefined') ModuleMusic.togglePlay(); });
        on('dw-m-next', () => { if (typeof ModuleMusic !== 'undefined') ModuleMusic.nextTrack(); });
        // Météo : un tap ouvre l'onglet complet
        on('dw-weather', () => { const b = document.querySelector('.nav-btn[data-target="view-weather"]'); if (b) b.click(); });
        // Intercom : mode rencontre, micro, quitter, créer, volumes (tout passe par les commandes existantes de l'onglet Intercom)
        on('dw-ic-auto', () => { const b = this.$('intercom-toggle-auto'); if (b) b.click(); });
        on('dw-ic-mic', () => { const m = this.$('btn-toggle-mic'); if (m) m.click(); });
        on('dw-ic-leave', () => { const b = this.$('btn-leave-room'); if (b) b.click(); });
        on('dw-ic-create', () => { AppManager.switchView('view-intercom'); const b = this.$('btn-show-create-hud'); if (b) setTimeout(() => b.click(), 50); });
        this.bindRange('dw-m-vol', 'dw-m-vol-val', (v) => { if (typeof ModuleMusic !== 'undefined') ModuleMusic.setVolume(v / 100, true); });
        this.bindRange('dw-ic-mvol', 'dw-ic-mvol-val', (v) => { if (typeof ModuleMusic !== 'undefined') ModuleMusic.setVolume(v / 100, true); });
        this.bindRange('dw-ic-vol', 'dw-ic-vol-val', (v) => { const s = this.$('ic-voice-vol-auto'); if (s) { s.value = v; s.dispatchEvent(new Event('input')); } });
        // Groupe : radar
        const setMode = (m) => { if (typeof ModuleCommunity !== 'undefined') ModuleCommunity.setRadarMode(ModuleCommunity.state.radarMode === m ? 'off' : m); };
        on('dw-g-all', () => setMode('all'));
        on('dw-g-friends', () => setMode('friends'));

        // La carte vit dans l'onglet Carte : on la « prête » au widget tant que le Compteur est affiché
        const mo = new MutationObserver(() => this.widgetSync());
        ['view-dashboard', 'view-gps'].forEach(id => { const e = this.$(id); if (e) mo.observe(e, { attributes: true, attributeFilter: ['class'] }); });
        this.widgetSelect(cur);
        setInterval(() => { this.widgetUpdate(); this.ecoTbt(); }, 400);
    },
    // Économie d'énergie : seul le guidage tourne-par-tourne reste à jour (flèche, distance, rue, arrivée)
    ecoTbt() {
        const bar = this.$('eco-tbt'); if (!bar) return;
        const G = (typeof ModuleGPS !== 'undefined') ? ModuleGPS : null;
        const on = !!(this.state.eco && G && G.state.isTracking && G.state.currentGeoJSON && G.state.routeSteps && G.state.routeSteps.length);
        if (bar.classList.contains('on') !== on) bar.classList.toggle('on', on);
        if (!on) return;
        const src = this.$('nav-turn-icon'), dst = this.$('eco-tbt-icon');
        if (src && dst) { if (dst.innerHTML !== src.innerHTML) dst.innerHTML = src.innerHTML; dst.style.color = src.style.color || '#fff'; }
        const cp = (to, from) => { const e = this.$(from); if (e) this.setTxt(to, e.textContent); };
        cp('eco-tbt-dist', 'nav-distance'); cp('eco-tbt-street', 'nav-street'); cp('eco-tbt-eta', 'nt-eta'); cp('eco-tbt-km', 'nt-dist');
    },

    // Curseur de volume : on n'écrase pas la valeur pendant que le doigt est dessus ; sinon elle est relue des modules (synchro permanente)
    bindRange(id, valId, onInput) {
        const el = this.$(id); if (!el) return;
        const paint = () => { el.style.setProperty('--p', el.value + '%'); this.setTxt(valId, el.value + '%'); };
        el.addEventListener('pointerdown', () => { el._drag = true; });
        ['pointerup', 'pointercancel', 'change', 'blur'].forEach(ev => el.addEventListener(ev, () => { el._drag = false; }));
        el.addEventListener('input', () => { paint(); onInput(parseInt(el.value, 10)); });
        el._paint = paint;
    },
    setRange(id, v) { const el = this.$(id); if (!el || el._drag || v === null || v === undefined || isNaN(v)) return; v = Math.round(v); if (parseInt(el.value, 10) !== v) el.value = v; el._paint && el._paint(); },

    widgetSelect(w) {
        this.state.widget = w;
        try { localStorage.setItem('motoapp_dash_widget', w); } catch (e) {}
        document.querySelectorAll('#dash-widget .dw-btn').forEach(b => b.classList.toggle('active', b.dataset.w === w));
        document.querySelectorAll('#dash-widget .dw-panel').forEach(p => p.classList.toggle('active', p.dataset.w === w));
        this._wKey = null;
        this.widgetSync(); this.widgetUpdate();
    },

    // Déplace #map-container entre l'onglet Carte et le widget (et redimensionne la carte)
    widgetSync() {
        if (typeof ModuleRoute !== 'undefined' && ModuleRoute.active) return; // l'écran Route gère lui-même la carte
        const mc = this.$('map-container'), slot = this.$('dw-map-slot'), dash = this.$('view-dashboard'); if (!mc || !slot || !dash) return;
        const map = (typeof ModuleGPS !== 'undefined') ? ModuleGPS.state.map : null;
        const want = dash.classList.contains('active') && this.state.widget === 'map' && !!map && !this.state.eco;
        const inSlot = mc.parentNode === slot;
        const empty = this.$('dw-map-empty'); if (empty) empty.style.display = want ? 'none' : '';
        if (want === inSlot) return;
        if (want) slot.appendChild(mc);
        else { const wrap = document.querySelector('#view-gps .map-wrapper'); if (wrap) wrap.insertBefore(mc, wrap.firstChild); }
        const rs = () => { try { map.resize(); } catch (e) {} };
        setTimeout(rs, 30); setTimeout(rs, 300);
    },

    widgetUpdate() {
        const dash = this.$('view-dashboard'); if (!dash || !dash.classList.contains('active') || this.state.eco) return;
        try {
            switch (this.state.widget) {
                case 'map': this.widgetSync(); break;
                case 'nav': this.wNav(); break;
                case 'music': this.wMusic(); break;
                case 'weather': this.wWeather(); break;
                case 'intercom': this.wIntercom(); break;
                case 'group': this.wGroup(); break;
            }
        } catch (e) { /* un widget ne doit jamais casser le compteur */ }
    },

    wNav() {
        const G = (typeof ModuleGPS !== 'undefined') ? ModuleGPS : null;
        const on = !!(G && G.state.isTracking && G.state.currentGeoJSON && G.state.routeSteps && G.state.routeSteps.length);
        this.$('dw-nav-on').style.display = on ? 'flex' : 'none';
        this.$('dw-nav-off').style.display = on ? 'none' : 'flex';
        if (!on) return;
        const src = this.$('nav-turn-icon'), dst = this.$('dw-nav-icon');
        if (src && dst) { if (dst.innerHTML !== src.innerHTML) dst.innerHTML = src.innerHTML; dst.style.color = src.style.color; }
        const cp = (to, from) => { const e = this.$(from); if (e) this.setTxt(to, e.textContent); };
        cp('dw-nav-dist', 'nav-distance'); cp('dw-nav-label', 'nav-label'); cp('dw-nav-street', 'nav-street');
        cp('dw-nav-eta', 'nt-eta'); cp('dw-nav-time', 'nt-time'); cp('dw-nav-km', 'nt-dist');
    },

    wMusic() {
        const cp = (to, from) => { const e = this.$(from); this.setTxt(to, e && e.textContent ? e.textContent : (to === 'dw-m-title' ? 'Aucun titre' : '')); };
        cp('dw-m-title', 'local-title'); cp('dw-m-artist', 'local-artist');
        const a = this.$('vroom-audio-player');
        const fill = this.$('dw-m-fill');
        if (a && fill) fill.style.width = (isFinite(a.duration) && a.duration > 0 ? Math.min(100, a.currentTime / a.duration * 100) : 0) + '%';
        if (typeof ModuleMusic !== 'undefined' && ModuleMusic.state) {
            this.setRange('dw-m-vol', ModuleMusic.state.volume * 100);
            const row = document.querySelector('#dw-m-vol') && document.querySelector('#dw-m-vol').parentNode; if (row) row.style.display = ModuleMusic.state.volSupported === false ? 'none' : '';
        }
        const ic = this.$('dw-m-playicon'), playing = !!(a && !a.paused);
        if (ic && ic._p !== playing) { ic._p = playing; ic.innerHTML = playing ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="6 3 20 12 6 21 6 3"/>'; }
    },

    wWeather() {
        const W = (typeof ModuleMapWeather !== 'undefined') ? ModuleMapWeather : null, d = W && W.state.data;
        const ok = !!(d && d.current && d.hourly);
        this.$('dw-w-on').style.display = ok ? 'flex' : 'none';
        this.$('dw-w-off').style.display = ok ? 'none' : 'flex';
        if (!ok) return;
        const cur = d.current, key = cur.time + '|' + cur.temperature_2m;
        if (this._wKey === key) return; this._wKey = key;
        this.$('dw-w-ic').innerHTML = W.info(cur.weather_code, cur.is_day === 1).icon;
        this.setTxt('dw-w-temp', Math.round(cur.temperature_2m) + '°');
        this.setTxt('dw-w-wind', 'Vent ' + AppUnits.spd(cur.wind_speed_10m) + ' ' + AppUnits.speedLabel());
        const H = d.hourly, times = H.time, t0 = new Date(cur.time).getTime(); let html = '';
        for (const k of [1, 2, 3]) {
            let idx = 0, best = Infinity; for (let i = 0; i < times.length; i++) { const df = Math.abs(new Date(times[i]).getTime() - (t0 + k * 3600000)); if (df < best) { best = df; idx = i; } }
            const inf = W.info(H.weather_code[idx], H.is_day ? H.is_day[idx] === 1 : true), pop = Math.round(H.precipitation_probability[idx] || 0);
            html += `<div><span>${times[idx].slice(11, 13)}h</span><span class="wi">${inf.icon}</span><b>${Math.round(H.temperature_2m[idx])}°</b><span class="${pop >= 30 ? 'rain' : ''}">${pop}%</span></div>`;
        }
        this.$('dw-w-next').innerHTML = html;
    },

    wIntercom() {
        const I = (typeof ModuleIntercom !== 'undefined') ? ModuleIntercom : null; if (!I) return;
        const s = I.state, auto = !!s.autoModeActive, room = !!s.isConnected, share = (typeof ModuleMusicShare !== 'undefined') ? ModuleMusicShare : null;
        this.$('dw-ic-auto').classList.toggle('on', auto);
        this.setTxt('dw-ic-auto-sub', auto ? ((s.participants || []).length ? `${s.participants.length} motard(s) connecté(s)` : 'Actif · en recherche de motards') : 'Désactivé');
        // Groupe rejoint
        this.$('dw-ic-group-on').style.display = room ? 'flex' : 'none';
        if (room) {
            this.setTxt('dw-ic-room', s.currentRoomName || 'Groupe vocal');
            const n = (s.participants || []).length; this.setTxt('dw-ic-room-sub', `${n} participant${n > 1 ? 's' : ''}${s.isMicMuted ? ' · micro coupé' : ''}`);
        }
        const micOn = room || auto;
        this.$('dw-ic-mic').classList.toggle('muted', !!s.isMicMuted);
        // Volumes : dès qu'on est en groupe (voix + musique) ou en mode rencontre (voix)
        this.$('dw-ic-vols').style.display = micOn ? '' : 'none';
        this.$('dw-ic-mvol-row').style.display = room ? '' : 'none';
        if (micOn) {
            if (share) this.setRange('dw-ic-vol', share.st.voice);
            if (typeof ModuleMusic !== 'undefined' && ModuleMusic.state) this.setRange('dw-ic-mvol', ModuleMusic.state.volume * 100);
        }
        // Groupes vocaux à proximité (masqués quand on est déjà dans un groupe)
        this.$('dw-ic-rooms-head').style.display = room ? 'none' : 'flex';
        const box = this.$('dw-ic-rooms'); box.style.display = room ? 'none' : 'flex';
        if (room) return;
        const rooms = Array.from(s.nearbyRooms ? s.nearbyRooms.values() : []);
        const key = rooms.map(r => r.roomName + (r.isPrivate ? 'p' : '')).join('|');
        if (this._roomsKey === key) return; this._roomsKey = key;
        box.innerHTML = '';
        if (!rooms.length) { box.innerHTML = '<div class="dw-rooms-empty">Aucun groupe détecté à proximité</div>'; return; }
        rooms.forEach(r => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'dw-room';
            const nm = document.createElement('b'); nm.textContent = r.roomName;
            const tag = document.createElement('em'); tag.className = r.isPrivate ? 'priv' : 'pub'; tag.textContent = r.isPrivate ? 'PRIVÉ' : 'PUBLIC';
            b.append(nm, tag);
            b.addEventListener('click', () => I.showJoinPrompt(r.roomName, r.isPrivate, r.roomCode));
            box.appendChild(b);
        });
    },

    wGroup() {
        const C = (typeof ModuleCommunity !== 'undefined') ? ModuleCommunity.state : null; if (!C) return;
        const m = C.radarMode || 'off';
        this.$('dw-g-dot').classList.toggle('on', m !== 'off');
        this.setTxt('dw-g-title', m === 'off' ? 'Radar désactivé' : (m === 'all' ? 'Radar : tous les motards' : 'Radar : amis'));
        const n = C.riders ? C.riders.size : 0; this.setTxt('dw-g-sub', m === 'off' ? 'Active-le pour voir les motards autour' : `${n} motard${n > 1 ? 's' : ''} à proximité`);
        this.$('dw-g-all').classList.toggle('on', m === 'all'); this.$('dw-g-friends').classList.toggle('on', m === 'friends');
    }
});
