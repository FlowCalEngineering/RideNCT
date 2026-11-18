// Roadbook : trajets enregistrés (Mon roadbook)
// Étend ModuleGPS (défini dans carte/carte.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleGPS, {
                // ===== Statistiques du trajet (calculées pendant la trace, affichées à l'arrêt) =====
                rideStatsReset() { this.state.rs = { move: 0, stop: 0, max: 0, up: 0, down: 0, altLast: null, altMax: null, hasAlt: false, lastTs: null }; },
                rideStatsTick(pos) {
                    const rs = this.state.rs; if (!rs || !pos || !pos.coords) return;
                    const ts = pos.timestamp || Date.now(), v = this.state.gpsSpeedKmh || 0;
                    if (rs.lastTs !== null) { const dt = Math.min(10, (ts - rs.lastTs) / 1000); if (dt > 0) { if (v >= 3) rs.move += dt; else rs.stop += dt; } }
                    rs.lastTs = ts; try { ModuleSensors.gps(pos); } catch (e) {}
                    if (v > rs.max && !(pos.coords.accuracy > 40)) rs.max = v;
                    const a = pos.coords.altitude, aa = pos.coords.altitudeAccuracy;
                    if (a !== null && a !== undefined && isFinite(a) && (aa === null || aa === undefined || aa <= 15)) {
                        rs.hasAlt = true; rs.altMax = rs.altMax === null ? a : Math.max(rs.altMax, a);
                        if (rs.altLast === null) rs.altLast = a;
                        else { const d = a - rs.altLast; if (Math.abs(d) >= 4) { if (d > 0) rs.up += d; else rs.down -= d; rs.altLast = a; } }   // seuil 4 m : le bruit GPS ne gonfle pas le dénivelé
                    }
                },
                fmtDur(sec) { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; },
                rideStatsFinal(distMeters, durationSec) {
                    const rs = this.state.rs || { move: 0, stop: 0, max: 0, up: 0, down: 0, hasAlt: false, altMax: null };
                    const moveSec = rs.move > 0 ? rs.move : durationSec;
                    return { dur: Math.round(durationSec), move: Math.round(rs.move), stop: Math.round(rs.stop), avg: moveSec > 0 ? Math.round((distMeters / 1000) / (moveSec / 3600)) : 0,
                             max: Math.round(rs.max), up: Math.round(rs.up), down: Math.round(rs.down), altMax: rs.altMax === null ? null : Math.round(rs.altMax), hasAlt: !!rs.hasAlt };
                },
                // Fenêtre « Trajet terminé » (HUD dans l'app)
                showRideSummary(rec) {
                    const st = rec.stats || {}, old = document.getElementById('ride-summary'); if (old) old.remove();
                    const ic = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
                    const tiles = [
                        [ic('<circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>'), AppUnits.km(parseFloat(rec.dist)).toFixed(1), AppUnits.distLabel(), 'Distance', '#0a84ff'],
                        [ic('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'), this.fmtDur(st.dur || 0), '', 'Durée', '#ff9f0a'],
                        [ic('<path d="M13 4a1.5 1.5 0 1 0 0 .01M6 21l3-6 3 2 2-5 3 3 2-2M9 15l-1-5 4-2 3 3"/>'), this.fmtDur(st.move || 0), '', 'En mouvement', '#30d158'],
                        [ic('<rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/>'), this.fmtDur(st.stop || 0), '', 'Arrêts', '#ff453a'],
                        [ic('<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/>'), AppUnits.spd(st.avg || 0), AppUnits.speedLabel(), 'Vitesse moy.', '#bf5af2'],
                        [ic('<path d="M12 14l4-8"/><path d="M3.3 17a9 9 0 1 1 17.4 0"/><circle cx="12" cy="14" r="1.2"/>'), AppUnits.spd(st.max || 0), AppUnits.speedLabel(), 'Vitesse max', '#ff375f']
                    ];
                    if (st.hasAlt) { tiles.push([ic('<path d="M3 20l6-11 4 7 3-5 5 9z"/>'), '+' + (st.up || 0), 'm', 'Dénivelé +', '#64d2ff'], [ic('<path d="M3 4l6 11 4-7 3 5 5-9z"/>'), (st.down ? '−' : '') + (st.down || 0), 'm', 'Dénivelé −', '#ffd60a']); }
                    const sn = st.sens || {}, lean = sn.lean && sn.lean.n ? sn.lean : null, ch = sn.chrono && sn.chrono.laps && sn.chrono.laps.length ? sn.chrono : null, f2 = (x) => String(Number(x).toFixed(2)).replace('.', ',');
                    // tuiles clés en tête : freinage max et meilleur tour juste après la vitesse max
                    const extra = [];
                    if (sn.brake && (sn.brake.nb || sn.brake.na)) extra.push([ic('<path d="M12 5v10M7 11l5 5 5-5M5 20h14"/>'), f2(sn.brake.bmax), 'g', 'Freinage max', '#30d158']);
                    if (ch) extra.push([ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'), ModuleChrono.fmt(ch.laps[ch.best].s), '', 'Meilleur tour', '#bf5af2']);
                    tiles.splice(4, 0, ...extra);
                    const hero = lean ? `<div class="rs-hero"><b>${lean.max}<small>°</small></b><div><span>Inclinaison max · ${lean.side === 'd' ? 'droite' : 'gauche'}</span><em>${lean.n} virage${lean.n > 1 ? 's' : ''} · pic moyen ${lean.avg}°${lean.top && lean.top[0] ? ' · ' + lean.top[0].v + ' km/h' : ''}${lean.src === 'gps' ? ' · estimée par le GPS' : ''}</em></div></div>` : '';
                    const co = rec.geojson && rec.geojson.coordinates, prev = (typeof ModuleRecap !== 'undefined' && co ? ModuleRecap.routeSvg(co, 340, 178) : '') || rec.preview || '';
                    const el = document.createElement('div'); el.id = 'ride-summary'; el.className = 'rs-overlay';
                    el.innerHTML = `<div class="rs-card">
                        <div class="rs-head"><div class="rs-flag">${ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>')}</div><div style="flex:1;min-width:0"><div class="rs-title">Trajet terminé</div><div class="rs-sub"></div></div><button type="button" class="rs-x rs-close" aria-label="Fermer">✕</button></div>
                        <div class="rs-body">
                        ${prev ? `<div class="rs-prev">${prev}</div>` : ''}
                        ${hero}
                        <div class="rs-grid rs-g3">${tiles.map(x => `<div class="rs-tile"${x[4] ? ` style="--ic:${x[4]}"` : ''}>${x[0]}<b>${x[1]}${x[2] ? `<small>${x[2]}</small>` : ''}</b><span>${x[3]}</span></div>`).join('')}</div>
                        ${ch && typeof ModuleChrono !== 'undefined' ? ModuleChrono.html(sn, ic) : ''}
                        ${typeof ModuleSensors !== 'undefined' ? ModuleSensors.summaryHtml(st.sens, ic, { skipChrono: true, skipMax: true }) : ''}
                        </div>
                        <div class="rs-bar"><button type="button" class="rs-btn rs-share"><svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>Partager</button><button type="button" class="rs-btn rs-main">Voir dans le Roadbook</button></div></div>`;
                    el.querySelector('.rs-sub').textContent = rec.title;
                    document.body.appendChild(el);
                    // vraie carte sous le tracé dès qu'elle est prête (repli : le tracé dessiné ci-dessus)
                    try { const pv = el.querySelector('.rs-prev'); if (pv && typeof ModuleGPS.mapThumb === 'function') ModuleGPS.mapThumb(rec).then(u => { if (u && pv.isConnected) pv.innerHTML = `<img alt="" src="${u}">`; }); } catch (e) {}
                    el.querySelector('.rs-close').addEventListener('click', () => el.remove());
                    el.querySelector('.rs-share').addEventListener('click', () => { try { ModuleRecap.open(rec); } catch (e) {} });
                    el.querySelectorAll('.rs-lap').forEach(b => b.addEventListener('click', () => { try { ModuleChrono.lapDetail(rec, +b.dataset.i); } catch (e) {} }));
                    const zb = el.querySelector('.rs-zones'); if (zb) zb.addEventListener('click', () => { try { ModuleSensors.openMap(rec); } catch (e) {} });
                    el.querySelector('.rs-main').addEventListener('click', () => { el.remove(); const tab = document.querySelector('.gps-tab-btn[data-sub="sub-gps-myroadbook"]'); if (tab) tab.click(); });
                },
                // 🟢 NOUVELLE FONCTION : Enregistrement de la trace libre
                // 🟢 1. Enregistre la trace dans la mémoire "Historique"
                saveRecordedRide() {
                    const coords = this.state.recordedPath;
                    if (!coords || coords.length < 2) return;

                    let distMeters = 0;
                    for (let i = 1; i < coords.length; i++) {
                        distMeters += this.calculateDistance(coords[i-1], coords[i]);
                    }
                    if (distMeters < 100) return; 

                    const geojson = { type: 'LineString', coordinates: coords };
                    const distKm = (distMeters / 1000).toFixed(1);
                    
                    const durationSec = (Date.now() - (this.state.rideStartTime || Date.now())) / 1000;
                    const hours = Math.floor(durationSec / 3600);
                    const minutes = Math.floor((durationSec % 3600) / 60);
                    const timeStr = hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes} min`;

                    const date = new Date();
                    const title = `Balade du ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}`;

                    const recordedRides = AppStore.get('moto_recorded_rides', []);
                    const previewSVG = this.generateRoutePreviewSVG(geojson);
                    
                    const rec = { 
                        id: Date.now(), 
                        title: title, 
                        mode: 'Trace Libre', 
                        dist: distKm,       
                        time: timeStr,      
                        preview: previewSVG,                          
                        geojson: geojson,
                        stats: this.rideStatsFinal(distMeters, durationSec)
                    };
                    try { const sn = ModuleSensors.finish(); if (sn) { rec.stats.sens = Object.assign({ t0: sn.data.t0 }, sn.stats); ModuleSensors.store(rec.id, sn.data); } else { const w = ModuleSensors.whyNone(); if (w) rec.stats.sens = { n: 0, why: w }; } } catch (e) {}
                    recordedRides.unshift(rec);
                    
                    // Stockage presque plein : on réessaie avec un tracé allégé et sans miniature pour ne jamais perdre le trajet qui vient d'être roulé
                    if (!AppStore.set('moto_recorded_rides', recordedRides, true)) {
                        try { const c = rec.geojson && rec.geojson.coordinates; if (c && c.length > 400) rec.geojson = Object.assign({}, rec.geojson, { coordinates: c.filter((_, i) => i % 2 === 0 || i === c.length - 1) }); } catch (e) {}
                        rec.preview = '';
                        if (!AppStore.set('moto_recorded_rides', recordedRides)) { this.showRideSummary(rec); return; }
                    }
                    this.loadRecordedRides(); 
                    // Récapitulatif du trajet (le bouton mène ensuite au Roadbook)
                    this.showRideSummary(rec);
                },
                // 🟢 2. Charge les cartes d'historique dans l'onglet Roadbook
                loadRecordedRides() {
                    const container = document.getElementById('recorded-rides-container'); 
                    const recordedRides = AppStore.get('moto_recorded_rides', []); 
                    if (!container) return; 
                    container.innerHTML = '';
                    
                    if (recordedRides.length === 0) { 
                        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 20px; text-align: center;">Aucune balade enregistrée.</div>'; 
                        return; 
                    }
                    
                    recordedRides.forEach(route => {
                        const item = document.createElement('div');
                        ModuleRoutes.card(item, route, { src: 'r', primary: route.stats ? { label: 'Bilan', cls: 'rb-bilan', icon: '<path d="M4 20V10M10 20V4M16 20v-8M22 20V8"/>', fn: () => this.showRideSummary(route) } : null });
                                                container.appendChild(item);

                        let pressTimer;
                        let isLongPress = false;

                        const startPress = (e) => {
                            if (e.type === 'touchstart' && e.touches.length > 1) return;
                            isLongPress = false;
                            item.style.transform = "scale(0.98)"; 
                            item.style.transition = "transform 0.2s";
                            
                            pressTimer = setTimeout(() => {
                                isLongPress = true;
                                item.style.transform = "scale(1)";
                                this.showRecordedRouteOptions(route); 
                            }, 500); 
                        };

                        const cancelPress = () => { clearTimeout(pressTimer); item.style.transform = "scale(1)"; };
                        const handleAction = (e) => {
                            cancelPress();
                            if (isLongPress) { e.preventDefault(); return; }
                            this.openSavedRoute(route); 
                        };

                        item.addEventListener('mousedown', startPress);
                        item.addEventListener('touchstart', startPress, {passive: true});
                        item.addEventListener('mouseup', cancelPress);
                        item.addEventListener('mouseleave', cancelPress);
                        item.addEventListener('touchmove', cancelPress, {passive: true});
                        item.addEventListener('touchend', cancelPress);
                        item.addEventListener('click', handleAction);
                    });
                },
                // Pastilles de mesures + bouton « Voir le bilan » sur la carte d'un trajet du Roadbook
                rideChips(route) {
                    const sn = route.stats && route.stats.sens, ch = [];
                    if (sn && sn.lean && sn.lean.n) ch.push(['#ff453a', sn.lean.max + '° max']);
                    if (sn && sn.brake && sn.brake.nb) ch.push(['#30d158', String(sn.brake.bmax).replace('.', ',') + ' g frein']);
                    if (sn && sn.zones && sn.zones.length) ch.push(['#0a84ff', sn.zones.length + ' secteurs']);
                    return ch;
                },
                // 🟢 3. Le menu d'appui long dédié à l'historique
                // 🟢 MENU ROADBOOK/HISTORIQUE : Ajout du bouton Partager
                // 🟢 MENU ROADBOOK/HISTORIQUE : Ajout du bouton Sauvegarder
                showRecordedRouteOptions(route) {
                    const existing = document.getElementById('route-hud-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'route-hud-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; padding: 20px;";
                    
                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 25px; text-align: center; transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                            <h3 style="color: var(--text-main); font-size: 1.1rem; margin-bottom: 5px;">${escHtml(route.title)}</h3>
                            <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 25px;">Que souhaitez-vous faire ?</p>
                            
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <button id="hud-btn-open" class="btn" style="background: var(--accent-color); color: var(--on-accent); padding: 18px; border-radius: 16px; font-weight: 800;">Afficher sur la carte</button>
                                
                                <!-- NOUVEAU BOUTON : Sauvegarder -->
                                <button id="hud-btn-rename" class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-main); padding: 18px; border-radius: 16px; font-weight: 800;">Renommer</button>
                                <button id="hud-btn-save" class="btn" style="background: rgba(48,209,88,0.1); color: #30d158; padding: 18px; border-radius: 16px; font-weight: 800;">Sauvegarder (Bibliothèque)</button>
                                
                                <button id="hud-btn-share" class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-main); padding: 18px; border-radius: 16px; font-weight: 800;">Partager…</button>
                                <button id="hud-btn-delete" class="btn" style="background: rgba(255,69,58,0.1); color: var(--danger-color); padding: 18px; border-radius: 16px; font-weight: 800;">Supprimer l'historique</button>
                                <button id="hud-btn-cancel" class="btn" style="background: transparent; color: var(--text-muted); padding: 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); font-weight: 800;">Annuler</button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);

                    setTimeout(() => {
                        overlay.style.opacity = '1';
                        overlay.querySelector('div').style.transform = 'scale(1)';
                    }, 10);

                    const closeHud = () => {
                        overlay.style.opacity = '0';
                        overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 200);
                    };

                    document.getElementById('hud-btn-open').addEventListener('click', () => { closeHud(); this.openSavedRoute(route); });
                    document.getElementById('hud-btn-share').addEventListener('click', () => { closeHud(); this.exportToGPX(route); });
                    
                    // 🟢 NOUVELLE ACTION : Sauvegarder dans la Bibliothèque
                    document.getElementById('hud-btn-save').addEventListener('click', () => {
                        closeHud();
                        const savedRoutes = AppStore.get('moto_saved_routes', []);
                        
                        // Ajoute une copie exacte du trajet en haut de la bibliothèque
                        savedRoutes.unshift({
                            id: Date.now(), // On génère un nouvel ID unique
                            title: route.title,
                            mode: route.mode,
                            dist: route.dist,
                            time: route.time,
                            preview: route.preview,
                            geojson: route.geojson
                        });
                        
                        AppStore.set('moto_saved_routes', savedRoutes);
                        this.loadLibrary(); // Met à jour le contenu de l'onglet bibliothèque
                        AppDialog.toast(`« ${route.title} » ajouté à la Bibliothèque ✓`);
                    });

                    document.getElementById('hud-btn-cancel').addEventListener('click', closeHud);
                    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHud(); });

                    document.getElementById('hud-btn-rename').addEventListener('click', () => {
                        this.hudRename(overlay, closeHud, route.title, 'Renommer la balade', (newTitle) => {
                            const rides = AppStore.get('moto_recorded_rides', []);
                            const k = rides.findIndex(r => r.id === route.id);
                            if (k !== -1) { rides[k].title = newTitle; AppStore.set('moto_recorded_rides', rides); this.loadRecordedRides(); }
                        });
                    });

                    document.getElementById('hud-btn-delete').addEventListener('click', () => {
                        this.hudConfirmDelete(overlay, closeHud, route.title, 'Supprimer la balade ?', () => {
                            const recordedRides = AppStore.get('moto_recorded_rides', []);
                            AppStore.set('moto_recorded_rides', recordedRides.filter(r => r.id !== route.id)); try { ModuleSensors.drop(route.id); } catch (e) {}
                            this.loadRecordedRides();
                        });
                    });
                },
});
