            const ModuleGPS = {
                state: { 
                    map: null, isMapInitialized: false, coords: {}, searchTimeout: null, routeMode: 'sinueux', waypointCounter: 0, currentGeoJSON: null, currentRouteTitle: '', isTracking: false, watchId: null, passedRouteIndex: 0, lastKnownCoords: null, lastKnownHeading: 0, lastKnownSpeed: 0, lastTime: null, smoothedHeading: null, smoothedSpeed: null, compassHeading: null, compassActive: false, hasInitialCentered: false, userMarker: null, isCameraLocked: true, isFirstTrackingLock: true, isAnimatingInitialLock: false, wakeLockSentinel: null,
                    showPOIs: false, poiTimeout: null
                },
                init() { 
                    this.initTabs();
                    setTimeout(() => this.initMap(), 200);
                    this.initSearchEngine();
                    this.loadLibrary();
                    this.loadRecordedRides(); 
                    this.initBottomSheet();
                    this.poiInit();
                    this.reportsInit();
                    
                    const btnPoi = document.getElementById('btn-toggle-poi');
                    if (btnPoi) {
                        btnPoi.addEventListener('click', () => { this.poiMenuToggle(); });
                    }

                    // 🟢 Gestion propre du bouton Démarrer du GPS
                    document.getElementById('btn-start-nav').addEventListener('click', () => {
                        if (!this.state.isTracking) { 
                            ModuleProfile.promptMotoSelection((selectedMoto) => {
                                if (selectedMoto === false) return; 
                                this.state.activeMotoStr = selectedMoto ? `${selectedMoto.marque} ${selectedMoto.modele}` : "Moto inconnue";
                                if (typeof ModuleDashboard !== 'undefined') ModuleDashboard.state.rideMotoId = selectedMoto ? selectedMoto.id : null; // Atelier : moto du trajet
                                
                                // Le menu « Itinéraire » se referme tout seul au départ
                                const sheet = document.getElementById('route-bottom-sheet');
                                if (sheet && sheet.classList.contains('open')) document.getElementById('btn-toggle-sheet').click();
                                
                                this.toggleTracking();
                                
                                // Démarrage synchronisé direct du compteur
                                if (typeof ModuleDashboard !== 'undefined' && !ModuleDashboard.state.isRiding) {
                                    ModuleDashboard.startRide();
                                }
                            });
                        } else { 
                            this.toggleTracking();
                            
                            // Arrêt synchronisé direct du compteur
                            if (typeof ModuleDashboard !== 'undefined' && ModuleDashboard.state.isRiding) {
                                ModuleDashboard.stopRide();
                            }
                        }
                    });
                    
                    document.getElementById('btn-recenter').addEventListener('click', () => {
                        this.state.isCameraLocked = true; this.state.isFirstTrackingLock = true; 
                        document.getElementById('btn-recenter').style.display = 'none';
                        if (this.state.lastKnownCoords && this.state.map) {
                            this.updateUserLocation({ coords: { longitude: this.state.lastKnownCoords[0], latitude: this.state.lastKnownCoords[1], heading: this.state.lastKnownHeading, speed: (this.state.lastKnownSpeed / 3.6) }});
                        }
                    });
                    
                    document.addEventListener('visibilitychange', () => { 
                        if (document.visibilityState === 'visible' && this.state.isTracking) this.manageWakeLock(true); 
                    });

                    // 🟢 Importation GPX
                    const btnImport = document.getElementById('btn-import-gpx');
                    const inputImport = document.getElementById('input-import-gpx');
                    if (btnImport && inputImport) {
                        btnImport.addEventListener('click', () => inputImport.click());
                        inputImport.addEventListener('change', (e) => {
                            if (e.target.files.length > 0) {
                                this.importFromGPX(e.target.files[0]);
                                inputImport.value = ''; 
                            }
                        });
                    }
                },

            }; // <-- La fin de ModuleGPS
