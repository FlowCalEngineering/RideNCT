// P2P carte : positions, cellules, marqueurs des motards sur la carte
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                cellOf(lat, lon) { const s = this.config.cellSize; return `${Math.floor(lat / s)}_${Math.floor(lon / s)}`; },
                distance(a, b) {
                    const R = 6371e3, r = Math.PI / 180;
                    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
                    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
                    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
                },
                bearing(a, b) {
                    const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
                    const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
                    return ((Math.atan2(y, x) / r) + 360) % 360;
                },
                updateCells() {
                    if (!this.state.myPos || !this.state.client) return;
                    const s = this.config.cellSize, cy = Math.floor(this.state.myPos.lat / s), cx = Math.floor(this.state.myPos.lon / s);
                    const wanted = new Set();
                    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) wanted.add(`${this.config.topicRoot}/cell/${cy + dy}_${cx + dx}`);
                    let changed = false;
                    this.state.cells.forEach(t => { if (!wanted.has(t)) { this.state.client.unsubscribe(t); changed = true; } });
                    wanted.forEach(t => { if (!this.state.cells.has(t)) { this.state.client.subscribe(t); changed = true; } });
                    this.state.cells = wanted;
                    if (changed) this.beacon(true); 
                },
                onPosition(pos) {
                    const prev = this.state.myPos;
                    const now = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                    let speed = (pos.coords.speed !== null && !isNaN(pos.coords.speed)) ? pos.coords.speed : 0;
                    if (prev) {
                        const d = this.distance(prev, now);
                        if (!speed && this.state.lastFix) { const dt = (pos.timestamp - this.state.lastFix) / 1000; if (dt > 0) speed = d / dt; }
                        if (d > 3) this.state.myHeading = (pos.coords.heading !== null && !isNaN(pos.coords.heading)) ? pos.coords.heading : this.bearing(prev, now);
                    }
                    this.state.lastFix = pos.timestamp; this.state.myPos = now; this.state.mySpeed = speed;
                    if (this.state.status === 'nogps') this.state.status = this.state.client && this.state.client.connected ? 'online' : 'connecting';

                    this.updateCells();
                    this.state.riders.forEach(r => this.refreshRider(r));
                    this.sendPos(false);
                    this.updateStatus();
                },
                sendPos(force, onlyPeer) {
                    if (!this.state.myPos) return;
                    const now = Date.now(), interval = this.state.mySpeed > 2 ? 3000 : 10000; 
                    if (!force && !onlyPeer && now - this.state.lastPosSent < interval) return;
                    if (!onlyPeer) this.state.lastPosSent = now;
                    const p = this.state.myPos, prof = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state : {};
                    const msg = {
                        type: 'pos', rid: this.state.myId, lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5),
                        hd: Math.round(this.state.myHeading || 0), sp: Math.round((this.state.mySpeed || 0) * 3.6),
                        n: (prof.name || 'Motard').slice(0, 40)
                    };
                    if (onlyPeer) {
                        if (this.state.radarMode === 'friends' && onlyPeer.rid && !this.isFriend(onlyPeer.rid)) return;
                        this.sendTo(onlyPeer, msg);
                    } else {
                        this.state.peers.forEach(peer => {
                            if (this.state.radarMode === 'friends' && peer.rid && !this.isFriend(peer.rid)) return;
                            this.sendTo(peer, msg);
                        });
                    }
                },
                refreshRider(r, forceMarker) {
                    r.dist = this.state.myPos ? this.distance(this.state.myPos, r) : null;
                    if (r.dist === null) return;
                    const now = Date.now();
                    r.hist = (r.hist || []).filter(h => now - h.t < 10000); r.hist.push({ t: now, d: r.dist });
                    if (!r.linkedAt) r.linkedAt = now;
                    const cutIgnore = 20000;   // après un éloignement, on ne rappelle pas le motard pendant 20 s (évite de refaire la liaison en boucle à la limite de portée)

                    // Dans le même canal vocal (pas le Mode Rencontre) : aucune limite de distance, la liaison est gardée où que soit le motard
                    const rp = this.state.peers.get(r.sid);
                    // Liaison toute neuve venue de la rubrique du canal : 60 s pour être reconnue comme membre (ou admise par le code) avant d'être jugée sur la distance
                    const fresh = !!(rp && this.state.roomTopics && this.state.roomTopics.size && Date.now() - (rp.born || 0) < 60000);
                    const inCall = fresh || !!(rp && typeof ModuleIntercom !== 'undefined' && ModuleIntercom.sameRoom(rp));
                    if (!inCall && r.dist > this.config.approachKeep) { this.closePeer(r.sid, cutIgnore); this.removeRider(r.id); return; }
                    if (r.dist > this.config.linkRadius && !inCall) {
                        r.near = false;
                        const oldest = r.hist[0];
                        const approaching = oldest && now - oldest.t >= 2500 && r.dist < oldest.d - 5;
                        const grace = now - r.linkedAt < 8000; 
                        if (!approaching && !grace) { this.closePeer(r.sid, cutIgnore); this.removeRider(r.id); return; }
                        if (r.marker) { r.marker.remove(); r.marker = null; }
                        this.scheduleRender();
                        return;
                    }
                    r.near = true;
                    const peer = this.state.peers.get(r.sid);
                    if (peer && !peer.profileSent) this.publishProfile(false, peer);
                    if (r.dist <= this.config.crossRadius) this.registerCrossing(r);
                    this.syncMarker(r, forceMarker);
                    this.scheduleRender();
                },
                removeRider(id) {
                    const r = this.state.riders.get(id); if (!r) return;
                    if (r.marker) r.marker.remove();
                    this.state.riders.delete(id);
                    
                    // --- NOUVEAU : Retirer visuellement de l'intercom en cas de perte de signal 4G/GPS ---
                    if (typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state.isConnected) {
                        ModuleIntercom.handlePeerLeave({ rid: id, roomCode: ModuleIntercom.state.currentCode });
                    }
                    
                    this.scheduleRender(); this.updateStatus();
                },
                // Suis-je dans un canal vocal ou en Mode Rencontre ?
                inVoice() {
                    const IC = (typeof ModuleIntercom !== 'undefined') ? ModuleIntercom.state : null;
                    return !!(IC && (IC.isConnected || IC.autoModeActive));
                },
                sweep() {
                    const now = Date.now();
                    // Plus de canal vocal : on coupe les invités (inconnus gardés uniquement pour la voix en mode Amis)
                    if (this.state.radarMode === 'friends' && !this.inVoice()) this.state.peers.forEach(p => { if (p.guest) { this.closePeer(p.sid, 3600000); if (p.rid) this.removeRider(p.rid); } });
                    this.state.peers.forEach(p => { if (now - p.lastMsg > (this.config.peerStale || this.config.staleAfter)) this.closePeer(p.sid); });
                    this.state.riders.forEach(r => { if (now - r.seen > this.config.staleAfter) this.removeRider(r.id); else this.syncMarker(r); });
                    let freed = false; this.state.ignored.forEach((until, sid) => { if (until < now) { this.state.ignored.delete(sid); freed = true; } });
                    if (freed) this.beacon(true);   // un motard écarté peut être revenu : on se signale tout de suite au lieu d'attendre la prochaine balise
                    this.sendPos(false);  
                    this.beacon(false);   
                    this.renderLists();
                },
                syncMarker(r, force) {
                    const map = (typeof ModuleGPS !== 'undefined') ? ModuleGPS.state.map : null;
                    if (!map || typeof maplibregl === 'undefined') return;
                    const visible = r.near === true;
                    if (!visible) { if (r.marker) { r.marker.remove(); r.marker = null; } return; }
                    const prof = this.state.profiles.get(r.id);
                    const name = (prof && prof.name) || r.name;
                    if (r.marker && force) { r.marker.remove(); r.marker = null; }
                    
                    const isFriend = this.isFriend(r.id);
                    
                    if (!r.marker) {
                        const el = document.createElement('div'); el.className = 'rider-marker';
                        const av = document.createElement('div'); av.className = 'rm-avatar';
                        if (prof && prof.avatar) av.style.backgroundImage = `url("${prof.avatar}")`; else av.textContent = name.charAt(0).toUpperCase();
                        
                        const ring = document.createElement('div'); ring.className = 'rm-ring'; 
                        
                        // Badge SVG stylisé pour les amis sur la carte
                        if (isFriend) {
                            ring.style.background = "var(--accent-color)"; 
                            ring.style.boxShadow = "0 3px 15px var(--accent-color)";
                            const friendBadge = document.createElement('div');
                            friendBadge.style.cssText = "position: absolute; top: -6px; right: -6px; background: var(--bg-color); color: var(--accent-color); width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid var(--accent-color); z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.5);";
                            friendBadge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
                            ring.appendChild(friendBadge);
                        }
                        
                        ring.appendChild(av);
                        const lab = document.createElement('div'); lab.className = 'rm-label'; lab.textContent = name;
                        
                        if (isFriend) {
                            lab.style.color = "var(--on-accent)";
                            lab.style.background = "var(--accent-color)";
                        }
                        
                        el.appendChild(ring); el.appendChild(lab);
                        const open = (e) => { e.stopPropagation(); this.showRiderOptionsHud(r.id, name, 'radar'); };
                        el.addEventListener('click', open);
                        r.marker = new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -23] }).setLngLat([r.lon, r.lat]).addTo(map);
                    } else {
                        r.marker.setLngLat([r.lon, r.lat]);
                    }
                },
});
