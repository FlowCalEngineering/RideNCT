// Radar : listes, options motard, profil affiché
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                nearRiders() { return [...this.state.riders.values()].filter(r => r.near); },
                scheduleRender() { if (this._rt) return; this._rt = setTimeout(() => { this._rt = null; this.renderLists(); }, 400); },
                renderLists() {
                    const nearEl = document.getElementById('nearby-list'), crossEl = document.getElementById('crossed-list');
                    const friendsEl = document.getElementById('friends-list'), reqsEl = document.getElementById('requests-list');
                    if (!nearEl) return;
                    
                    const bindLongPress = (element, id, name, source) => {
                        let pressTimer;
                        let isLongPress = false;
                        const startPress = (e) => {
                            if (e.target.closest('button')) return; 
                            if (e.type === 'touchstart' && e.touches && e.touches.length > 1) return;
                            isLongPress = false;
                            element.style.transform = "scale(0.98)";
                            element.style.transition = "transform 0.2s";
                            pressTimer = setTimeout(() => {
                                isLongPress = true;
                                element.style.transform = "scale(1)";
                                this.showRiderOptionsHud(id, name, source);
                            }, 500);
                        };
                        const cancelPress = () => { clearTimeout(pressTimer); element.style.transform = "scale(1)"; };
                        const handleAction = (e) => {
                            if (e.target.closest('button')) return; 
                            cancelPress();
                            if (isLongPress) { e.preventDefault(); return; }
                            this.showRiderOptionsHud(id, name, source);
                        };
                        element.addEventListener('mousedown', startPress);
                        element.addEventListener('touchstart', startPress, {passive: true});
                        element.addEventListener('mouseup', cancelPress);
                        element.addEventListener('mouseleave', cancelPress);
                        element.addEventListener('touchmove', cancelPress, {passive: true});
                        element.addEventListener('touchend', cancelPress);
                        element.addEventListener('click', handleAction);
                    };

                    const getFriendBadge = (id) => {
                        return this.isFriend(id) ? `<span style="background: var(--accent-color); color: var(--on-accent); font-size: 0.55rem; padding: 3px 6px; border-radius: 6px; margin-left: 8px; vertical-align: middle; font-weight: 900; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 3px;">AMI <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></span>` : '';
                    };

                    const riders = this.nearRiders().sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
                    document.getElementById('nearby-count').textContent = riders.length;
                    
                    const emptyText = this.state.radarMode === 'friends' ? 
                                      `Aucun ami connecté à moins de ${this.config.linkRadius} m.` : 
                                      (this.state.radarMode === 'all' ? `Aucun motard avec l'app à moins de ${this.config.linkRadius} m.` : 'Active le radar pour voir les motards autour de toi.');
                    
                    nearEl.innerHTML = riders.length ? '' : `<div class="comm-empty">${emptyText}</div>`;
                    
                    riders.forEach(r => {
                        const prof = this.state.profiles.get(r.id), name = (prof && prof.name) || r.name;
                        const sub = [prof && prof.style, this.motoLine(prof)].filter(Boolean).join(' • ') || 'Profil en chargement…';
                        const row = document.createElement('div'); row.className = 'rider-row';
                        row.innerHTML = `${this.avatarHtml(prof, name, 'rr-avatar')}
                            <div style="flex:1;min-width:0;"><div class="rr-name">${this.esc(name)}${getFriendBadge(r.id)}</div><div class="rr-sub">${this.esc(sub)}</div>
                            ${r.sp > 5 ? `<div class="rr-meta">En route · ${r.sp} km/h</div>` : `<div class="rr-meta">À l'arrêt</div>`}</div>
                            <div class="rr-dist">${this.fmtDist(r.dist)}</div>`;
                        bindLongPress(row, r.id, name, 'radar');
                        nearEl.appendChild(row);
                    });

                    const crossed = Object.values(this.state.crossed).sort((a, b) => b.last - a.last);
                    document.getElementById('crossed-count').textContent = crossed.length;
                    crossEl.innerHTML = crossed.length ? '' : `<div class="comm-empty">Les motards que tu croises sur la route (à moins de ${this.config.crossRadius} m) apparaîtront ici.</div>`;
                    crossed.forEach(c => {
                        const prof = c.profile || this.state.profiles.get(c.id), name = (prof && prof.name) || c.name || 'Motard';
                        const sub = [prof && prof.style, this.motoLine(prof)].filter(Boolean).join(' • ');
                        const meta = [c.count > 1 ? `Croisé ${c.count} fois` : 'Croisé 1 fois', this.fmtAgo(c.last), c.place].filter(Boolean).join(' · ');
                        const row = document.createElement('div'); row.className = 'rider-row';
                        row.innerHTML = `${this.avatarHtml(prof, name, 'rr-avatar')}
                            <div style="flex:1;min-width:0;"><div class="rr-name">${this.esc(name)}${getFriendBadge(c.id)}</div>${sub ? `<div class="rr-sub">${this.esc(sub)}</div>` : ''}<div class="rr-meta">${this.esc(meta)}</div></div>
                            ${this.state.riders.get(c.id) && this.state.riders.get(c.id).near ? `<div class="rr-dist">● proche</div>` : ''}`;
                        bindLongPress(row, c.id, name, 'croise');
                        crossEl.appendChild(row);
                    });
                    
                    document.getElementById('friends-count').textContent = this.state.friends.length;
                    friendsEl.innerHTML = this.state.friends.length ? '' : `<div class="comm-empty">Vous n'avez pas encore d'amis ajoutés. Croisez d'autres motards pour leur envoyer une demande !</div>`;
                    this.state.friends.forEach(f => {
                        const prof = f.profile || this.state.profiles.get(f.id), name = (prof && prof.name) || 'Motard';
                        const sub = [prof && prof.style, this.motoLine(prof)].filter(Boolean).join(' • ');
                        const isOnline = this.state.riders.has(f.id) && this.state.riders.get(f.id).near;
                        
                        const row = document.createElement('div'); row.className = 'rider-row';
                        row.innerHTML = `${this.avatarHtml(prof, name, 'rr-avatar')}
                            <div style="flex:1;min-width:0;"><div class="rr-name">${this.esc(name)}</div>${sub ? `<div class="rr-sub">${this.esc(sub)}</div>` : ''}<div class="rr-meta">Ajouté le ${new Date(f.addedAt).toLocaleDateString('fr-FR')}</div></div>
                            ${isOnline ? `<div class="rr-dist">● en ligne</div>` : ''}`;
                        bindLongPress(row, f.id, name, 'amis');
                        friendsEl.appendChild(row);
                    });
                    
                    reqsEl.innerHTML = '';
                    const IC = { ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>', no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>', add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M19 8v6M22 11h-6"></path></svg>', mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4zM3 19a2 2 0 0 0 2 2h1v-6H3v4z"></path></svg>' };
                    const head = (t, n) => { const h = document.createElement('div'); h.className = 'rq-h'; h.innerHTML = `<span>${t}</span><b>${n}</b>`; reqsEl.appendChild(h); };
                    // 1. Demandes d'amis reçues : « X veut te suivre » + Accepter / Refuser
                    if (this.state.friendReqs.length) head('Demandes d\'amis', this.state.friendReqs.length);
                    this.state.friendReqs.forEach((r, idx) => {
                        const prof = r.profile || this.state.profiles.get(r.id), name = (prof && prof.name) || 'Motard';
                        const sub = [prof && prof.style, this.motoLine(prof)].filter(Boolean).join(' • ');
                        const row = document.createElement('div'); row.className = 'rq-card';
                        row.innerHTML = `<div class="rq-t">${this.esc(name)} veut te suivre</div>${sub ? `<div class="rq-s">${this.esc(sub)}</div>` : ''}
                            <div class="rq-b"><button type="button" class="rq-btn main btn-req-accept" data-idx="${idx}"><span>${IC.ok}Accepter</span></button><button type="button" class="rq-btn btn-req-decline" data-idx="${idx}"><span>${IC.no}Refuser</span></button></div>`;
                        row.addEventListener('click', (e) => {
                            if (e.target.closest('button')) return;
                            this.openProfile(r.id);
                        });
                        reqsEl.appendChild(row);
                    });
                    // 2. Demandes envoyées, en attente de réponse
                    const sent = (Array.isArray(this.state.sentRequests) ? this.state.sentRequests : []).filter(id => !(this.state.friends || []).some(f => f.id === id));
                    if (sent.length) head('Demandes envoyées', sent.length);
                    sent.forEach(id => {
                        const prof = this.state.profiles.get(id), name = (prof && prof.name) || 'Motard';
                        const row = document.createElement('div'); row.className = 'rq-card rq-row';
                        row.innerHTML = `<div class="rq-ic">${IC.add}</div><div class="rq-x"><div class="rq-t">${this.esc(name)}</div><div class="rq-s">Demande envoyée</div></div>`;
                        row.addEventListener('click', () => { try { this.openProfile(id); } catch (e) { } });
                        reqsEl.appendChild(row);
                    });
                    const invs = [];      // les invitations de canal vocal sont dans Intercom › Invitations
                    if (!reqsEl.children.length) reqsEl.innerHTML = `<div class="comm-empty">Aucune invitation ni demande en attente.</div>`;
                    document.getElementById('requests-count').textContent = this.state.friendReqs.length + sent.length + invs.length;
                    reqsEl.querySelectorAll('.btn-req-accept').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const idx = e.currentTarget.getAttribute('data-idx');
                            const req = this.state.friendReqs[idx];
                            this.state.friends.push({ id: req.id, addedAt: Date.now(), profile: req.profile });
                            this.state.friendReqs.splice(idx, 1);
                            
                            // 🟢 File d'attente pour l'acceptation
                            if (!this.state.pendingAccepts) this.state.pendingAccepts = [];
                            if (!this.state.pendingAccepts.includes(req.id)) this.state.pendingAccepts.push(req.id);
                            
                            this.saveFriendsData();
                            
                            const rider = this.state.riders.get(req.id);
                            if (rider && rider.marker) { this.syncMarker(rider, true); }

                            if (!this.state.profilePayload) await this.publishProfile(true, null);
                            
                            // 🟢 Vérification Radar : on notifie l'autre motard si à côté, sinon ça attendra
                            if (rider && rider.near) {
                                const peer = this.state.peers.get(rider.sid);
                                if (peer) {
                                    this.sendTo(peer, { type: 'friend_accept', profile: this.state.profilePayload });
                                    this.state.pendingAccepts = this.state.pendingAccepts.filter(id => id !== req.id);
                                    this.saveFriendsData();
                                    this.showNotification("Ami ajouté", "Demande acceptée avec succès.", `<svg style="width:26px;height:26px;color:#30d158" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`);
                                    return;
                                }
                            }
                            
                            this.showNotification("Mise en attente", "Ami ajouté en local. Il recevra la confirmation dès qu'il sera à proximité !", `<svg style="width:26px;height:26px;color:#ff9f0a" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`);
                        });
                    });
                    
                    reqsEl.querySelectorAll('.btn-req-decline').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const idx = e.currentTarget.getAttribute('data-idx');
                            this.state.friendReqs.splice(idx, 1);
                            this.saveFriendsData();
                        });
                    });
                },
                showRiderOptionsHud(id, name, source) {
                    const existing = document.getElementById('rider-hud-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'rider-hud-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; padding: 20px;";

                    const isFriend = this.state.friends && this.state.friends.some(f => f.id === id);

                    // Icônes SVG pour les boutons du menu
                    const icUser = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
                    const icAdd = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;
                    const icMinus = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>`;
                    const icBlock = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`;
                    const icTrash = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                    const icFlag = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`;
                    const icX = `<svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

                    const btnStyle = "display: flex; align-items: center; justify-content: center; gap: 8px; padding: 18px; border-radius: 16px; font-weight: 800;";

                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 25px; text-align: center; transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                            <h3 style="color: var(--text-main); font-size: 1.1rem; margin-bottom: 5px;">${this.esc(name)}</h3>
                            <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 25px;">Que souhaitez-vous faire ?</p>
                            
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <button id="hud-btn-profile" class="btn" style="background: var(--accent-color); color: var(--on-accent); ${btnStyle}">${icUser} Voir le profil</button>
                                ${!isFriend ? `<button id="hud-btn-add" class="btn" style="background: rgba(48,209,88,0.1); color: #30d158; ${btnStyle}">${icAdd} Ajouter comme ami</button>` : `<button id="hud-btn-remove-friend" class="btn" style="background: rgba(255,159,10,0.1); color: #ff9f0a; ${btnStyle}">${icMinus} Retirer des amis</button>`}
                                <button id="hud-btn-block" class="btn" style="background: rgba(255,159,10,0.1); color: #ff9f0a; ${btnStyle}">${icBlock} Bloquer</button>
                                <button id="hud-btn-report" class="btn" style="background: rgba(255,69,58,0.1); color: var(--danger-color); ${btnStyle}">${icFlag} Signaler</button>
                                ${source !== 'amis' ? `<button id="hud-btn-delete" class="btn" style="background: rgba(255,69,58,0.1); color: var(--danger-color); ${btnStyle}">${icTrash} Supprimer</button>` : ''}
                                <button id="hud-btn-cancel" class="btn" style="background: transparent; color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1); ${btnStyle}">${icX} Annuler</button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; }, 10);

                    const closeHud = () => {
                        overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 200);
                    };

                    document.getElementById('hud-btn-profile').addEventListener('click', () => { closeHud(); this.openProfile(id); });
                    
                    const iconWarn = `<svg style="width:26px;height:26px;color:#ff9f0a" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
                    const iconDelete = `<svg style="width:26px;height:26px;color:var(--danger-color)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                    const iconEyeOff = `<svg style="width:26px;height:26px;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

                    if (!isFriend) {
                        document.getElementById('hud-btn-add').addEventListener('click', () => { closeHud(); this.sendFriendRequest(id); });
                    } else {
                        document.getElementById('hud-btn-remove-friend').addEventListener('click', () => { 
                            closeHud(); 
                            this.showConfirm("Retirer un ami", `Es-tu sûr de vouloir retirer ${name} de tes amis ?`, () => {
                                this.state.friends = this.state.friends.filter(f => f.id !== id);
                                
                                // 🟢 Ajout à la mémoire tampon (sera mis à jour sur l'autre tel quand le radar le recroisera)
                                if (!this.state.pendingRemovals) this.state.pendingRemovals = [];
                                if (!this.state.pendingRemovals.includes(id)) this.state.pendingRemovals.push(id);
                                
                                this.saveFriendsData();
                                
                                // Si le motard est là MAINTENANT, on met son téléphone à jour direct
                                const rider = this.state.riders.get(id);
                                if (rider && rider.near) {
                                    const peer = this.state.peers.get(rider.sid);
                                    if (peer) {
                                        this.sendTo(peer, { type: 'friend_remove', from: this.state.myId });
                                        this.state.pendingRemovals = this.state.pendingRemovals.filter(rid => rid !== id);
                                        this.saveFriendsData();
                                    }
                                }
                                
                                this.showNotification("Ami retiré", `${name} ne fait plus partie de tes amis.`, iconDelete);
                            });
                        });
                    }
                    
                    document.getElementById('hud-btn-block').addEventListener('click', () => { 
                        closeHud(); 
                        this.showConfirm("Bloquer", `Es-tu sûr de vouloir bloquer ${name} ? Il ne pourra plus te voir ni te parler (tu peux le débloquer dans Réglages › Compte).`, () => this.blockRider(id, name));
                    });
                    document.getElementById('hud-btn-report').addEventListener('click', () => { closeHud(); this.openReport(id, name); });
                    
                    const delBtn = document.getElementById('hud-btn-delete');
                    if (delBtn) {
                        delBtn.addEventListener('click', () => {
                            closeHud();
                            if (source === 'croise' && this.state.crossed[id]) {
                                delete this.state.crossed[id];
                                this.saveCrossed();
                                this.renderLists();
                                this.showNotification("Supprimé", "Motard retiré de l'historique.", iconDelete);
                            } else if (source === 'radar') {
                                const r = this.state.riders.get(id);
                                if (r) this.state.ignored.set(r.sid, Date.now() + 3600000);
                                this.removeRider(id);
                                this.showNotification("Masqué", "Ce motard a été masqué du radar.", iconEyeOff);
                            }
                        });
                    }

                    document.getElementById('hud-btn-cancel').addEventListener('click', closeHud);
                    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHud(); });
                },
                socialUrl(s) {
                    const h = String(s.handle || '').replace(/^@/, '');
                    if (!/^[A-Za-z0-9._-]{1,40}$/.test(h)) return null;
                    const u = { Instagram: `https://instagram.com/${h}`, TikTok: `https://www.tiktok.com/@${h}`, Facebook: `https://facebook.com/${h}`, YouTube: `https://youtube.com/@${h}`, X: `https://x.com/${h}`, Snapchat: `https://snapchat.com/add/${h}` };
                    return u[s.platform] || null;
                },
                openProfile(id) {
                    const prof = this.state.profiles.get(id) || (this.state.crossed[id] && this.state.crossed[id].profile);
                    const r = this.state.riders.get(id), c = this.state.crossed[id];
                    const name = (prof && prof.name) || (r && r.name) || (c && c.name) || 'Motard';

                    let ov = document.getElementById('rider-profile-overlay');
                    const fresh = !ov;
                    if (!ov) { ov = document.createElement('div'); ov.id = 'rider-profile-overlay'; document.body.appendChild(ov); }
                    ov.dataset.rider = id;
                    ov.style.cssText = `position: fixed; inset: 0; background: var(--bg-color); z-index: 9999; display: flex; flex-direction: column; overflow-y: auto; transition: opacity 0.2s; opacity: ${fresh ? 0 : 1};`;

                    const badge = (inner) => `<div style="background: rgba(255,255,255,0.05); color: var(--text-main); padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.1);">${inner}</div>`;
                    const socials = (prof && prof.social || []).map(s => {
                        const url = this.socialUrl(s), h = this.esc(String(s.handle || '').startsWith('@') ? s.handle : '@' + s.handle);
                        const inner = `<span style="color: var(--accent-color);">${this.esc(s.platform)}</span> ${h}`;
                        return url ? `<a href="${this.esc(url)}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">${badge(inner)}</a>` : badge(inner);
                    }).join('');
                    const motos = (prof && prof.motos || []).map(m => `
                        <div style="background: var(--active-bg); padding: 12px; border-radius: 16px; display: flex; align-items: center; gap: 12px;">
                            ${m.photo ? `<div style="width: 60px; height: 60px; border-radius: 12px; background: url('${m.photo}') center/cover; flex-shrink: 0;"></div>` : `<div style="width: 60px; height: 60px; border-radius: 12px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0;">${VI.bike30}</div>`}
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 900; font-size: 1rem;">${this.esc(`${m.marque}${m.modele}`)}</div>
                                <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 2px; font-weight: 600;">${this.esc([m.annee, m.cylindree ? m.cylindree + ' cm³' : '', m.type].filter(Boolean).join(' • '))}</div>
                            </div>
                        </div>`).join('');

                    const infos = [];
                    if (r) infos.push(`<span style="color: #30d158;">● À ${this.fmtDist(r.dist)}</span>${r.sp > 5 ? ` · ${r.sp} km/h` : ''}`);
                    if (c) infos.push(this.esc([`Croisé ${c.count} fois`, 'dernière fois ' + this.fmtAgo(c.last), c.place].filter(Boolean).join(' · ')));

                    ov.innerHTML = `
                        <div style="padding: 20px; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); position: sticky; top: 0; z-index: 10; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                            <h3 style="font-size: 1.4rem; font-weight: 900; margin: 0;">Profil motard</h3>
                            <button id="rider-profile-close" style="background: none; border: none; color: var(--text-muted); font-size: 2rem; cursor: pointer; padding: 0 10px; display: flex; align-items: center;">${VI.x}</button>
                        </div>
                        <div style="padding: 25px 20px 60px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center;">
                            <div style="width: 110px; height: 110px; border-radius: 50%; background: ${prof && prof.avatar ? `url('${prof.avatar}') center/cover` : 'var(--accent-color)'}; color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-size: 2.8rem; font-weight: 900;">${prof && prof.avatar ? '' : this.esc(name.charAt(0).toUpperCase())}</div>
                            <h2 style="font-size: 1.6rem; font-weight: 900;">${this.esc(name)}</h2>
                            ${infos.length ? `<div style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700; line-height: 1.5;">${infos.join('<br>')}</div>` : ''}
                            ${prof && prof.style ? badge(`${VI.bike} ${this.esc(prof.style)}`) : ''}
                            ${prof && prof.bio ? `<div style="font-size: 0.95rem; line-height: 1.4; opacity: 0.9; max-width: 420px;">"${this.esc(prof.bio)}"</div>` : ''}
                            ${socials ? `<div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">${socials}</div>` : ''}
                            ${prof && prof.troph && prof.troph.length && typeof ModuleBadges !== 'undefined' ? ModuleBadges.otherHtml(prof.troph) : ''}
                            ${!prof ? `<div class="comm-empty">Chargement du profil…</div>` : ''}
                            ${motos ? `<div style="width: 100%; max-width: 480px; text-align: left; margin-top: 10px;"><div class="comm-label"><span>Son garage</span></div><div style="display: flex; flex-direction: column; gap: 10px;">${motos}</div></div>` : ''}
                            ${r && typeof ModuleGPS !== 'undefined' ? `<button id="rider-show-map" class="btn btn-primary" style="max-width: 480px; margin-top: 10px;">Voir sur la carte</button>` : ''}
                        </div>`;

                    const close = () => { ov.style.opacity = 0; setTimeout(() => ov.remove(), 200); };
                    ov.querySelector('#rider-profile-close').addEventListener('click', close);
                    const btnMap = ov.querySelector('#rider-show-map');
                    if (btnMap) btnMap.addEventListener('click', () => {
                        close();
                        if (typeof AppManager !== 'undefined') AppManager.switchView('view-gps');
                        setTimeout(() => {
                            const map = ModuleGPS.state.map; const rr = this.state.riders.get(id);
                            if (!map || !rr) return;
                            if (ModuleGPS.state.isTracking) { ModuleGPS.state.isCameraLocked = false; const b = document.getElementById('btn-recenter'); if (b) b.style.display = 'flex'; }
                            this.syncMarker(rr);
                            map.flyTo({ center: [rr.lon, rr.lat], zoom: 15, duration: 1200 });
                        }, 150);
                    });
                    if (fresh) requestAnimationFrame(() => ov.style.opacity = 1);
                },
});
