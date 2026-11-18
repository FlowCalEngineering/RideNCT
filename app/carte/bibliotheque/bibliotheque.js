// Bibliothèque : itinéraires sauvegardés, import/export GPX
// Étend ModuleGPS (défini dans carte/carte.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleGPS, {
                // --- NOUVEAU : Dessinateur de miniature vectorielle ultra-légère ---
                generateRoutePreviewSVG(geojson) {
                    if (!geojson || !geojson.coordinates || geojson.coordinates.length < 2) return '';
                    const coords = geojson.coordinates;
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    
                    // Trouver les limites du trajet
                    coords.forEach(c => {
                        if (c[0] < minX) minX = c[0]; if (c[0] > maxX) maxX = c[0];
                        if (c[1] < minY) minY = c[1]; if (c[1] > maxY) maxY = c[1];
                    });
                    
                    const dx = (maxX - minX) || 1; const dy = (maxY - minY) || 1;
                    const scale = 70 / Math.max(dx, dy); // Laisse 15% de marge autour du tracé
                    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;

                    // Créer la ligne du tracé
                    let pathD = "M " + coords.map(c => {
                        const x = 50 + (c[0] - cx) * scale;
                        const y = 50 - (c[1] - cy) * scale; // Inverser l'axe Y car en SVG le 0 est en haut
                        return `${x.toFixed(1)} ${y.toFixed(1)}`;
                    }).join(" L ");

                    // Points de départ (bleu) et d'arrivée (rouge)
                    const start = coords[0], end = coords[coords.length - 1];
                    const sx = 50 + (start[0] - cx) * scale, sy = 50 - (start[1] - cy) * scale;
                    const ex = 50 + (end[0] - cx) * scale, ey = 50 - (end[1] - cy) * scale;

                    return `
                    <svg viewBox="0 0 100 100" width="100%" height="100%" style="background: rgba(0,0,0,0.3);">
                        <path d="${pathD}" fill="none" stroke="#0a84ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="${sx}" cy="${sy}" r="6" fill="#32ade6" stroke="#fff" stroke-width="2" />
                        <circle cx="${ex}" cy="${ey}" r="6" fill="#ff453a" stroke="#fff" stroke-width="2" />
                    </svg>`;
                },
                loadLibrary() {
                    const container = document.getElementById('library-container'); 
                    const savedRoutes = AppStore.get('moto_saved_routes', []); 
                    if (!container) return; 
                    container.innerHTML = '';
                    
                    if (savedRoutes.length === 0) { 
                        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 40px; text-align: center;">Aucun roadbook sauvegardé.</div>'; 
                        return; 
                    }
                    
                    savedRoutes.forEach(route => {
                        const item = document.createElement('div'); 
                        ModuleRoutes.card(item, route, { src: 'l', primary: { label: 'Ouvrir', icon: '<path d="M5 12h14M13 6l6 6-6 6"/>', fn: () => this.openSavedRoute(route) } });

                        // Bouton visible « carte hors ligne » : n'ouvre pas le trajet (les événements ne remontent pas à la carte)
                        const dl = document.createElement('button'); dl.type = 'button'; dl.title = 'Télécharger la carte (hors ligne)'; dl.setAttribute('aria-label', 'Télécharger la carte hors ligne');
                        dl.style.cssText = 'position: absolute; top: 10px; right: 10px; width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid var(--accent-color); background: rgba(28,28,30,0.85); color: var(--accent-color); display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2; padding: 0;';
                        dl.innerHTML = '<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none;"><path d="M12 3v12"></path><polyline points="7 11 12 16 17 11"></polyline><path d="M5 20h14"></path></svg>';
                        ['mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove'].forEach(ev => dl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
                        dl.addEventListener('click', (e) => { e.stopPropagation(); this.offlineRoute(route.title, route.geojson && route.geojson.coordinates); });
                        item.appendChild(dl);
                        container.appendChild(item);

                        // --- LOGIQUE DU CLIC ET DE L'APPUI LONG ---
                        let pressTimer;
                        let isLongPress = false;

                        const startPress = (e) => {
                            if (e.type === 'touchstart' && e.touches.length > 1) return;
                            isLongPress = false;
                            item.style.transform = "scale(0.98)"; // Petit effet visuel d'enfoncement
                            item.style.transition = "transform 0.2s";
                            
                            pressTimer = setTimeout(() => {
                                isLongPress = true;
                                item.style.transform = "scale(1)";
                                this.showRouteOptions(route); // Ouvre le HUD
                            }, 500); // 500 millisecondes = Appui long
                        };

                        const cancelPress = () => {
                            clearTimeout(pressTimer);
                            item.style.transform = "scale(1)";
                        };

                        const handleAction = (e) => {
                            cancelPress();
                            if (isLongPress) { e.preventDefault(); return; }
                            // Si ce n'est PAS un appui long, on ouvre simplement le trajet !
                            this.openSavedRoute(route);
                        };

                        // Écouteurs pour le tactile (téléphone) et la souris (PC)
                        item.addEventListener('mousedown', startPress);
                        item.addEventListener('touchstart', startPress, {passive: true});
                        item.addEventListener('mouseup', cancelPress);
                        item.addEventListener('mouseleave', cancelPress);
                        item.addEventListener('touchmove', cancelPress, {passive: true});
                        item.addEventListener('touchend', cancelPress);
                        item.addEventListener('click', handleAction);
                    });
                },
                // --- NOUVELLE FONCTION : Ouvre un trajet sur la carte ---
                openSavedRoute(route) {
                    this.state.currentGeoJSON = route.geojson; this.state.routeSaved = true; this.state.routeExpert = !!route.expert; this.state.routeDistM = 0; this.state.routeDurSec = 0; 
                    this.state.currentRouteTitle = route.title; 
                    this.state.routeMode = route.mode;
                    
                    const activeName = document.getElementById('active-route-name'); 
                    if (activeName) activeName.textContent = route.title.replace('📍 Ma position actuelle', 'Ma Position');
                    
                    if (route.geojson && route.geojson.coordinates) {
                        const coords = route.geojson.coordinates; 
                        this.state.coords['input-wp-start'] = coords[0]; 
                        this.state.coords['input-wp-dest'] = coords[coords.length - 1];
                        
                        const startInput = document.getElementById('input-wp-start'); 
                        const destInput = document.getElementById('input-wp-dest'); 
                        let titleParts = route.title.split(' ➔ ');
                        if (startInput) startInput.value = titleParts[0] || "Départ"; 
                        if (destInput) destInput.value = titleParts[1] || "Arrivée";
                    }
                    
                    this.drawRouteOnMap(route.geojson); 
                    this.state.routeSteps = []; this.state.currentStepIndex = 0; if (route.geojson && route.geojson.coordinates) this.matchSteps(route.geojson.coordinates);
                    document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]').click(); 
                    
                    // Itinéraire Expert : le tracé calculé (étapes, routes choisies) est suivi tel quel, jamais recalculé départ → arrivée
                    if (this.state.isTracking && this.state.lastKnownCoords && !route.expert) {
                        const startInput = document.getElementById('input-wp-start'); 
                        if (startInput) startInput.value = "📍 Ma position actuelle"; 
                        this.state.coords['input-wp-start'] = this.state.lastKnownCoords; 
                        this.checkAndCalculate();
                    }
                },
                // 🟢 NOUVELLE FONCTION : Exportation au format GPX et partage natif
                exportToGPX(route) {
                    if (!route || !route.geojson || !route.geojson.coordinates) return;
                    
                    // Construction du fichier XML/GPX
                    let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
                    gpx += '<gpx version="1.1" creator="RideNCT" xmlns="http://www.topografix.com/GPX/1/1">\n';
                    gpx += `  <trk>\n    <name>${String(route.title).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</name>\n    <trkseg>\n`;
                    
                    // Ajout des points (MapLibre utilise [longitude, latitude], le GPX veut lat puis lon)
                    route.geojson.coordinates.forEach(c => {
                        gpx += `      <trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>\n`;
                    });
                    
                    gpx += '    </trkseg>\n  </trk>\n</gpx>';
                    
                    // Nettoyage du nom pour le fichier
                    const fileName = (String(route.title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'itineraire') + '.gpx';
                    const file = new File([gpx], fileName, { type: 'application/gpx+xml' });
                    
                    // Déclenche le menu de partage natif du téléphone (si supporté)
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        navigator.share({
                            title: route.title,
                            files: [file]
                        }).catch(err => console.warn("Partage annulé ou échoué", err));
                    } else {
                        // Fallback (ex: sur PC) : lance un téléchargement direct
                        const url = URL.createObjectURL(file);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }
                },
                // 🟢 NOUVELLE FONCTION : Importation et lecture d'un fichier GPX
                importFromGPX(file) {
                    const reader = new FileReader();
                    
                    reader.onload = (e) => {
                        try {
                            // On lit le fichier XML
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
                            
                            // 1. Récupérer le titre (Nom de la trace ou nom du fichier par défaut)
                            let title = "Balade importée";
                            const nameNode = xmlDoc.querySelector('trk > name, rte > name, gpx > name');
                            if (nameNode && nameNode.textContent) {
                                title = nameNode.textContent;
                            } else {
                                title = file.name.replace(/\.[^/.]+$/, ""); // Retire l'extension .gpx
                            }
                            
                            // 2. Extraire les coordonnées (Supporte les TrackPoints <trkpt> et RoutePoints <rtept>)
                            const points = Array.from(xmlDoc.querySelectorAll('trkpt, rtept'));
                            if (points.length < 2) {
                                AppDialog.alert("Le fichier GPX ne contient pas assez de points valides.");
                                return;
                            }
                            
                            // En GeoJSON, c'est [longitude, latitude]
                            const coords = points.map(pt => [
                                parseFloat(pt.getAttribute('lon')), 
                                parseFloat(pt.getAttribute('lat'))
                            ]).filter(c => isFinite(c[0]) && isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90);
                            if (coords.length < 2) { AppDialog.alert("Le fichier GPX ne contient pas assez de points valides."); return; }
                            
                            // 3. Calculer la distance totale
                            let distMeters = 0;
                            for (let i = 1; i < coords.length; i++) {
                                distMeters += this.calculateDistance(coords[i-1], coords[i]);
                            }
                            const distKm = (distMeters / 1000).toFixed(1);
                            
                            // 4. Générer l'objet de sauvegarde
                            const geojson = { type: 'LineString', coordinates: coords };
                            const previewSVG = this.generateRoutePreviewSVG(geojson);
                            
                            const savedRoutes = AppStore.get('moto_saved_routes', []);
                            
                            // Ajoute tout en haut de la bibliothèque
                            savedRoutes.unshift({ 
                                id: Date.now(), 
                                title: title, 
                                mode: 'Importé', 
                                dist: distKm,       
                                time: '--', // Difficile à estimer avec précision juste via GPX
                                preview: previewSVG,                          
                                geojson: geojson 
                            });
                            
                            if (!AppStore.set('moto_saved_routes', savedRoutes)) return;
                            this.loadLibrary(); // Recharge la vue
                            
                            AppDialog.toast(`Itinéraire « ${title} » importé ✓`);
                            
                        } catch (error) {
                            console.error("Erreur lors de la lecture du GPX :", error);
                            AppDialog.alert("Impossible de lire ce fichier GPX. Il est peut-être corrompu.");
                        }
                    };
                    
                    // Lance la lecture du fichier
                    reader.readAsText(file);
                },
               // 🟢 MENU BIBLIOTHÈQUE : Ajout du bouton Partager
                // 🟢 MENU BIBLIOTHÈQUE : Ajout du bouton Renommer
                showRouteOptions(route) {
                    const existing = document.getElementById('route-hud-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'route-hud-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; padding: 20px;";
                    
                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 25px; text-align: center; transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                            <h3 style="color: var(--text-main); font-size: 1.1rem; margin-bottom: 5px;">${escHtml(String(route.title == null ? 'Itinéraire' : route.title).replace('📍 Ma position actuelle', 'Ma Position'))}</h3>
                            <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 25px;">Que souhaitez-vous faire ?</p>
                            
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <button id="hud-btn-open" class="btn" style="background: var(--accent-color); color: var(--on-accent); padding: 18px; border-radius: 16px; font-weight: 800;">Ouvrir l'itinéraire</button>
                                
                                <button id="hud-btn-offline" class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-main); padding: 18px; border-radius: 16px; font-weight: 800;">Télécharger la carte (hors ligne)</button>
                                
                                <!-- NOUVEAU BOUTON : Renommer -->
                                <button id="hud-btn-rename" class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-main); padding: 18px; border-radius: 16px; font-weight: 800;">Renommer</button>
                                
                                <button id="hud-btn-share" class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-main); padding: 18px; border-radius: 16px; font-weight: 800;">Partager…</button>
                                <button id="hud-btn-delete" class="btn" style="background: rgba(255,69,58,0.1); color: var(--danger-color); padding: 18px; border-radius: 16px; font-weight: 800;">Supprimer</button>
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
                    document.getElementById('hud-btn-offline').addEventListener('click', () => { closeHud(); this.offlineRoute(route.title, route.geojson && route.geojson.coordinates); });
                    
                    // 🟢 NOUVELLE ACTION : Renommer l'itinéraire
                    document.getElementById('hud-btn-rename').addEventListener('click', () => {
                        this.hudRename(overlay, closeHud, route.title, 'Renommer l\'itinéraire', (newTitle) => {
                            const savedRoutes = AppStore.get('moto_saved_routes', []);
                            const routeIndex = savedRoutes.findIndex(r => r.id === route.id);
                            if (routeIndex !== -1) { savedRoutes[routeIndex].title = newTitle; AppStore.set('moto_saved_routes', savedRoutes); this.loadLibrary(); }
                        });
                    });

                    document.getElementById('hud-btn-share').addEventListener('click', () => { closeHud(); this.exportToGPX(route); });
                    document.getElementById('hud-btn-cancel').addEventListener('click', closeHud);
                    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHud(); });

                    document.getElementById('hud-btn-delete').addEventListener('click', () => {
                        this.hudConfirmDelete(overlay, closeHud, route.title.replace('📍 Ma position actuelle', 'Ma Position'), 'Supprimer l\'itinéraire ?', () => {
                            const savedRoutes = AppStore.get('moto_saved_routes', []);
                            AppStore.set('moto_saved_routes', savedRoutes.filter(r => r.id !== route.id));
                            this.loadLibrary();
                        });
                    });
                },
});

// --- HUD des trajets (Bibliothèque ET Roadbook) : renommer / supprimer directement dans la fenêtre de l'app, sans boîte du téléphone ---
Object.assign(ModuleGPS, {
                // Remplace le contenu du HUD par un panneau (le menu d'origine est seulement masqué : « Retour » le réaffiche)
                hudShowPanel(overlay, buildPanel) {
                    const card = overlay.firstElementChild; if (!card) return;
                    const hidden = [...card.children];
                    hidden.forEach(el => { el.dataset.hudDisplay = el.style.display; el.style.display = 'none'; });
                    const panel = document.createElement('div'); panel.className = 'hud-panel';
                    panel.style.cssText = 'display: flex; flex-direction: column; gap: 12px; text-align: center;';
                    const back = () => { panel.remove(); hidden.forEach(el => { el.style.display = el.dataset.hudDisplay || ''; }); };
                    buildPanel(panel, back);
                    card.appendChild(panel);
                    const f = panel.querySelector('input'); if (f) { f.focus(); f.select(); }
                },
                hudBtn(text, bg, color, onClick) {
                    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = text;
                    b.style.cssText = `background: ${bg}; color: ${color}; padding: 16px; border-radius: 16px; font-weight: 800;`;
                    b.addEventListener('click', onClick); return b;
                },
                hudTitle(text, sub) {
                    const w = document.createElement('div');
                    const h = document.createElement('h3'); h.textContent = text; h.style.cssText = 'color: var(--text-main); font-size: 1.1rem; margin: 0 0 6px; overflow-wrap: anywhere;'; w.appendChild(h);
                    if (sub) { const p = document.createElement('p'); p.textContent = sub; p.style.cssText = 'color: var(--text-muted); font-size: 0.8rem; margin: 0; overflow-wrap: anywhere;'; w.appendChild(p); }
                    return w;
                },
                // « Renommer » : champ de saisie dans le HUD. onSave(nouveauNom) n'est appelé que si le nom a changé.
                hudRename(overlay, closeHud, current, heading, onSave) {
                    this.hudShowPanel(overlay, (panel, back) => {
                        panel.appendChild(this.hudTitle(heading));
                        const input = document.createElement('input'); input.type = 'text'; input.value = current; input.maxLength = 80; input.autocomplete = 'off'; input.spellcheck = false;
                        input.placeholder = 'Nouveau nom';
                        input.style.cssText = 'width: 100%; box-sizing: border-box; padding: 16px; border: none; outline: none; border-radius: 14px; background: rgba(255,255,255,0.1); color: var(--text-main); font-size: 1rem; font-weight: 600; font-family: inherit;';
                        const save = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } closeHud(); if (v !== current) onSave(v); };
                        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } else if (e.key === 'Escape') { e.stopPropagation(); back(); } });
                        panel.appendChild(input);
                        panel.appendChild(this.hudBtn('Enregistrer', 'var(--accent-color)', 'var(--on-accent)', save));
                        panel.appendChild(this.hudBtn('Retour', 'transparent', 'var(--text-muted)', back)).style.border = '1px solid rgba(255,255,255,0.1)';
                    });
                },
                // « Supprimer » : confirmation dans le HUD
                hudConfirmDelete(overlay, closeHud, name, heading, onYes) {
                    this.hudShowPanel(overlay, (panel, back) => {
                        panel.appendChild(this.hudTitle(heading, `« ${name} » sera supprimé définitivement.`));
                        panel.appendChild(this.hudBtn('Supprimer', 'var(--danger-color)', '#fff', () => { closeHud(); onYes(); }));
                        panel.appendChild(this.hudBtn('Retour', 'transparent', 'var(--text-muted)', back)).style.border = '1px solid rgba(255,255,255,0.1)';
                    });
                },
});
