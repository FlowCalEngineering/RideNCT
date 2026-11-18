// Mode Groupe : canaux privés/publics (création, connexion, participants, volumes)
// Étend ModuleIntercom (défini dans intercom/intercom.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleIntercom, {
                // ----------------------------------------------------
                // HUD : CRÉER UN GROUPE
                // ----------------------------------------------------
                showCreateHud() {
                    const existing = document.getElementById('intercom-create-overlay');
                    if (existing) existing.remove();

                    // Régénère un code pour le nouveau canal
                    this.generateNewCode();
                    this.state.isPrivateRoom = (typeof AppSub === 'undefined') || AppSub.premium(); // Privé par défaut (abonnés) ; gratuit : canal public seulement

                    const overlay = document.createElement('div');
                    overlay.id = 'intercom-create-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; padding: 20px;";

                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 340px; padding: 25px; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                            <h3 style="color: var(--text-main); font-size: 1.2rem; margin-bottom: 20px; font-weight: 900;">Nouveau Canal</h3>
                            
                            <input type="text" id="hud-group-name" placeholder="Nom du groupe (ex: Balade 44)" style="width: 100%; padding: 18px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; color: var(--text-main); font-size: 1rem; margin-bottom: 15px; outline: none; transition: 0.2s;">
                            
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 14px 15px; background: rgba(255,255,255,0.05); border-radius: 14px; border: 1px solid rgba(255,255,255,0.1);">
                                <div style="text-align: left;">
                                    <div style="font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                                        Canal Privé <span id="hud-privacy-icon"><svg class="vi" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
                                    </div>
                                    <div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 2px;" id="hud-privacy-desc">Un code sera requis</div>
                                </div>
                                <button id="hud-toggle-privacy" class="radar-switch on"></button>
                            </div>

                            <div id="hud-code-container" style="background: var(--active-bg); padding: 15px; border-radius: 16px; margin-bottom: 25px; border: 1px dashed rgba(255,255,255,0.2); transition: 0.3s;">
                                <span style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; font-weight: 800;">Code de connexion</span><br>
                                <span style="font-size: 2.8rem; font-weight: 900; letter-spacing: 5px; color: var(--accent-color);">${this.state.roomPin}</span>
                            </div>
                            
                            <div style="display: flex; gap: 10px;">
                                <button id="btn-create-cancel" class="btn" style="flex: 1; background: transparent; color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 16px; font-weight: 800;">Annuler</button>
                                <button id="btn-create-confirm" class="btn" style="flex: 1.5; background: var(--accent-color); color: var(--on-accent); padding: 15px; border-radius: 16px; font-weight: 800;">Ouvrir le canal</button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; }, 10);

                    const closeOverlay = () => {
                        overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 300);
                    };

                    document.getElementById('btn-create-cancel').addEventListener('click', closeOverlay);

                    // Logique Toggle Public/Privé
                    const toggleBtn = document.getElementById('hud-toggle-privacy');
                    const codeCont = document.getElementById('hud-code-container');
                    const iconPriv = document.getElementById('hud-privacy-icon');
                    const descPriv = document.getElementById('hud-privacy-desc');

                    // Affichage selon l'état réel : abonné = privé par défaut ; gratuit = public (le privé est réservé aux abonnés)
                    const paintPrivacy = () => {
                        toggleBtn.classList.toggle('on', this.state.isPrivateRoom);
                        if (this.state.isPrivateRoom) {
                            codeCont.style.opacity = '1';
                            codeCont.style.height = 'auto';
                            codeCont.style.marginBottom = '25px';
                            codeCont.style.padding = '15px';
                            iconPriv.innerHTML = VI.lock;
                            descPriv.textContent = 'Un code sera requis';
                        } else {
                            codeCont.style.opacity = '0';
                            codeCont.style.height = '0';
                            codeCont.style.marginBottom = '0';
                            codeCont.style.overflow = 'hidden';
                            codeCont.style.padding = '0';
                            iconPriv.innerHTML = VI.globe;
                            descPriv.textContent = 'Accès libre sans code';
                        }
                    };
                    paintPrivacy();
                    toggleBtn.addEventListener('click', () => {
                        if (!this.state.isPrivateRoom && typeof AppSub !== 'undefined' && !AppSub.gate()) return;   // passer en privé : abonnés
                        this.state.isPrivateRoom = !this.state.isPrivateRoom;
                        paintPrivacy();
                    });

                    // Validation de la création
                    document.getElementById('btn-create-confirm').addEventListener('click', () => {
                        const name = document.getElementById('hud-group-name').value || `Groupe ${100 + Math.floor(Math.random() * 900)}`;
                        closeOverlay();
                        this.connectToRoom(name, 'Créateur', this.state.currentCode, this.state.isPrivateRoom);
                    });
                },
                // ----------------------------------------------------
                // GESTION DES ROOMS A PROXIMITÉ 
                // ----------------------------------------------------
                handleRoomAd(m) {
                    if (!m.roomName) return;
                    if (this.state.isConnected && this.state.currentRoomName === m.roomName) return; 
                    if (this.state.nearbyRooms.size >= 30 && !this.state.nearbyRooms.has(m.roomName)) return;   // pas de liste infinie de faux canaux
                    
                    this.state.nearbyRooms.set(m.roomName, {
                        roomName: m.roomName,
                        roomCode: m.roomCode,
                        isPrivate: m.isPrivate,
                        creatorId: m.rid,
                        creatorName: m.senderName || 'Un motard',
                        creatorAvatar: m.avatarSrc || null,
                        lastSeen: Date.now()
                    });
                    
                    const activeTab = document.querySelector('.intercom-tab-btn.active');
                    if (activeTab && activeTab.getAttribute('data-sub') === 'sub-intercom-radar') {
                        this.renderNearbyRooms();
                    }
                },
                cleanStaleRooms() {
                    const now = Date.now();
                    let changed = false;
                    this.state.nearbyRooms.forEach((val, key) => {
                        if (now - val.lastSeen > 20000) { 
                            this.state.nearbyRooms.delete(key);
                            changed = true;
                        }
                    });
                    if (changed) {
                        const activeTab = document.querySelector('.intercom-tab-btn.active');
                        if (activeTab && activeTab.getAttribute('data-sub') === 'sub-intercom-radar') this.renderNearbyRooms();
                    }
                },
                renderNearbyRooms() {
                    const listEl = document.getElementById('intercom-active-rooms-list');
                    if (this.state.nearbyRooms.size === 0) {
                        listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 10px;">Aucun canal détecté à proximité.</div>`;
                        return;
                    }

                    listEl.innerHTML = '';
                    this.state.nearbyRooms.forEach((room) => {
                        const initial = ModuleCommunity.esc(room.creatorName.charAt(0).toUpperCase());
                        
                        // Badges modernisés et plus lisibles
                        const badge = room.isPrivate ? 
                            `<span style="background: rgba(255,69,58,0.1); color: var(--danger-color); padding: 4px 8px; border-radius: 8px; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.5px;">PRIVÉ ${VI.lock}</span>` : 
                            `<span style="background: rgba(48,209,88,0.1); color: #30d158; padding: 4px 8px; border-radius: 8px; font-size: 0.65rem; font-weight: 900; letter-spacing: 0.5px;">PUBLIC ${VI.globe}</span>`;

                        const row = document.createElement('div');
                        row.className = 'invite-row';
                        
                        // On rend toute la ligne cliquable et interactive au toucher
                        row.style.cursor = 'pointer';
                        row.style.transition = 'transform 0.15s ease';
                        
                        // Nouveau design sans le bouton "Rejoindre"
                        row.innerHTML = `
                            <div class="ir-info" style="pointer-events: none;">
                                <div class="ir-avatar" style="${room.creatorAvatar ? `background-image:url('${room.creatorAvatar}'); background-size:cover;` : ''}">${room.creatorAvatar ? '' : initial}</div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-weight: 900; color: var(--text-main); font-size: 1.15rem; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${ModuleCommunity.esc(room.roomName)}
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        ${badge}
                                        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">créé par ${ModuleCommunity.esc(room.creatorName)}</span>
                                    </div>
                                </div>
                            </div>
                            <!-- Chevron indiquant que c'est cliquable -->
                            <div style="color: var(--text-muted); padding-right: 5px; pointer-events: none;">
                                <svg viewBox="0 0 24 24" style="width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </div>
                        `;
                        
                        // Effet d'enfoncement quand on appuie dessus
                        const startPress = () => row.style.transform = "scale(0.96)";
                        const endPress = () => row.style.transform = "scale(1)";
                        
                        row.addEventListener('mousedown', startPress);
                        row.addEventListener('touchstart', startPress, {passive: true});
                        row.addEventListener('mouseup', endPress);
                        row.addEventListener('mouseleave', endPress);
                        row.addEventListener('touchend', endPress);

                        // Action pour rejoindre le canal quand on clique sur la carte
                        row.addEventListener('click', () => {
                            this.showJoinPrompt(room.roomName, room.isPrivate, room.roomCode);
                        });
                        
                        listEl.appendChild(row);
                    });
                },
                showJoinPrompt(roomName, isPrivate, roomCode) {
                    if (!isPrivate) {
                        this.connectToRoom(roomName, 'Invité', roomCode, false);
                        return;
                    }

                    const existing = document.getElementById('intercom-pin-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'intercom-pin-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; padding: 20px;";

                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 25px; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                            <h3 style="color: var(--text-main); font-size: 1.2rem; margin-bottom: 5px;">Canal Privé <svg class="vi" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">Saisis le code pour rejoindre <b>${ModuleCommunity.esc(roomName)}</b></p>
                            
                            <input type="text" id="prompt-pin-input" placeholder="----" maxlength="4" inputmode="numeric" style="width: 100%; text-align: center; font-size: 2.5rem; letter-spacing: 15px; font-weight: 900; padding: 15px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; color: var(--text-main); outline: none; margin-bottom: 20px;">
                            
                            <div style="display: flex; gap: 10px;">
                                <button id="btn-pin-cancel" class="btn" style="flex: 1; background: transparent; color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 16px; font-weight: 800;">Annuler</button>
                                <button id="btn-pin-confirm" class="btn" style="flex: 1; background: var(--accent-color); color: var(--on-accent); padding: 15px; border-radius: 16px; font-weight: 800;">Valider</button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { 
                        overlay.style.opacity = '1'; 
                        overlay.querySelector('div').style.transform = 'scale(1)'; 
                        document.getElementById('prompt-pin-input').focus();
                    }, 10);

                    const closeOverlay = () => {
                        overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 300);
                    };

                    document.getElementById('btn-pin-cancel').addEventListener('click', closeOverlay);
                    document.getElementById('btn-pin-confirm').addEventListener('click', () => {
                        const code = document.getElementById('prompt-pin-input').value;
                        if(code.length === 4) {
                            const btn = document.getElementById('btn-pin-confirm'); btn.disabled = true;
                            this.requestJoin(roomName, roomCode, code).then(r => {
                                btn.disabled = false;
                                if (r.ok) closeOverlay(); else AppDialog.alert(r.msg);
                            });
                        } else {
                            AppDialog.alert("Code à 4 chiffres requis.");
                        }
                    });
                },
                // ----------------------------------------------------
                // LOGIQUE DE CONNEXION / DECONNEXION AU CANAL
                // ----------------------------------------------------
                connectToRoom(roomName, role, roomCode = null, isPrivate = true, opts = null) {
                    if (!AppWarn.done('intercom')) { AppWarn.ask('intercom').then(ok => { if (ok) this.connectToRoom(roomName, role, roomCode, isPrivate, opts); }); return; }
                    // Gratuit : canaux publics seulement (aucun canal privé, qu'on le crée ou qu'on le rejoigne)
                    if (isPrivate && typeof AppSub !== 'undefined' && !AppSub.gate()) return;
                    this.state.limit2 = (role === 'Créateur') && typeof AppSub !== 'undefined' && !AppSub.premium();   // groupe créé par un compte gratuit : 3 personnes (lui + 2 motards)
                
                // --- 1. DÉSACTIVER LE MODE RENCONTRE AUTOMATIQUEMENT ---
                    if (this.state.autoModeActive) {
                        this.state.autoModeActive = false;
                        const toggleBtn = document.getElementById('intercom-toggle-auto');
                        if (toggleBtn) toggleBtn.classList.remove('on');
                        
                        const status = document.getElementById('intercom-auto-status');
                        if (status) {
                            status.textContent = "Désactivé";
                            status.style.color = "var(--text-muted)";
                        }
                        
                        const partContainer = document.getElementById('intercom-auto-participants');
                        if (partContainer) partContainer.style.display = 'none';

                        if (typeof ModuleCommunity !== 'undefined') {
                            ModuleCommunity.broadcast({ type: 'intercom_auto', active: false, rid: ModuleCommunity.state.myId });
                        }
                    }
                
                    this.state.isConnected = true;
                    this.state.currentRoomName = roomName;
                    this.state.currentCode = roomCode || this.state.currentCode;
                    this.state.isPrivateRoom = isPrivate;
                    // Accès : le créateur garde le code qu'il a généré ; un invité/admis reçoit le code d'un membre et la liste des membres admis
                    if (role !== 'Créateur') this.state.roomPin = (opts && /^\d{4}$/.test(String(opts.pin || ''))) ? String(opts.pin) : null;
                    this.resetAccess();
                    if (opts && Array.isArray(opts.allowed)) this.cleanRids(opts.allowed).forEach(r => this.state.roomAllowed.add(r));
                    this.state.participants = []; 
                    
                    this.state.isMicMuted = false;
                    const btnMic = document.getElementById('btn-toggle-mic');
                    btnMic.classList.remove('mic-off'); btnMic.classList.add('mic-on');
                    document.getElementById('icon-mic-off').style.display = 'none';
                    document.getElementById('icon-mic-on').style.display = 'block';
                    document.getElementById('text-mic-status').textContent = "Micro actif";
                    
                    document.getElementById('intercom-nav-bar').style.display = 'none';
                    document.querySelectorAll('.intercom-sub-view').forEach(v => v.classList.remove('active'));
                    
                    const activeCallUi = document.getElementById('intercom-active-call');
                    activeCallUi.style.display = 'flex';
                    
                    document.getElementById('active-call-name').textContent = roomName;
                    document.getElementById('active-call-privacy-badge').innerHTML = isPrivate ? VI.lock : VI.globe;
                    
                    this.renderParticipants();
                    this.api.startAudioStream();

                    // L'intercom passe par les liaisons P2P du radar : on l'active s'il est coupé
                    if (typeof ModuleCommunity !== 'undefined') {
                        const rm = ModuleCommunity.state.radarMode;
                        if (!rm || rm === 'off') { try { ModuleCommunity.setRadarMode('all'); } catch (e) {} }
                        // Les motards écartés avant (mode Amis, liaison échouée) sont de nouveau joignables pour ce canal
                        else { try { ModuleCommunity.state.ignored.clear(); ModuleCommunity.beacon(true); } catch (e) {} }
                        ModuleCommunity.refreshAudioRouting();
                    }

                    if (typeof ModuleCommunity !== 'undefined') {
                        const myName = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.name : "Un motard";
                        const myAvatar = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.avatar : null;
                        
                        ModuleCommunity.broadcast({ 
                            type: 'intercom_join', 
                            roomName: this.state.currentRoomName,
                            roomCode: this.state.currentCode,
                            isPrivate: this.state.isPrivateRoom,
                            senderName: myName,
                            avatarSrc: myAvatar,
                            rid: ModuleCommunity.state.myId
                        });

                        this.state.broadcastInterval = setInterval(() => {
                            ModuleCommunity.broadcast({
                                type: 'intercom_room_ad',
                                roomName: this.state.currentRoomName,
                                roomCode: this.state.currentCode,
                                isPrivate: this.state.isPrivateRoom,
                                senderName: myName,
                                avatarSrc: myAvatar,
                                rid: ModuleCommunity.state.myId
                            });
                        }, 5000);
                        
                        ModuleCommunity.broadcast({
                            type: 'intercom_room_ad',
                            roomName: this.state.currentRoomName,
                            roomCode: this.state.currentCode,
                            isPrivate: this.state.isPrivateRoom,
                            senderName: myName,
                            avatarSrc: myAvatar,
                            rid: ModuleCommunity.state.myId
                        });
                    }
                },
                disconnectRoom() {
                    if (typeof ModuleMusicShare !== 'undefined') ModuleMusicShare.onLeave();
                    if (typeof ModuleCommunity !== 'undefined' && this.state.currentCode) {
                        ModuleCommunity.broadcast({ 
                            type: 'intercom_leave', 
                            roomCode: this.state.currentCode,
                            roomName: this.state.currentRoomName,
                            rid: ModuleCommunity.state.myId
                        });
                    }

                    if (this.state.broadcastInterval) {
                        clearInterval(this.state.broadcastInterval);
                        this.state.broadcastInterval = null;
                    }

                    this.state.isConnected = false;
                    this.state.currentRoomName = null;
                    this.state.participants = [];
                    this.api.stopAudioStream();
                    
                    document.getElementById('intercom-active-call').style.display = 'none';
                    document.getElementById('intercom-nav-bar').style.display = 'flex';
                    
                    // On retourne sur l'onglet Radar
                    document.querySelector('.intercom-tab-btn[data-sub="sub-intercom-radar"]').click();
                    this.generateNewCode();
                },
                renderParticipants() {
                    const parts = document.getElementById('active-call-participants');
                    const myName = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.name : "Moi";
                    const initial = myName.charAt(0).toUpperCase();
                    
                    parts.innerHTML = ''; // Nettoyage de la liste

                    // 1. Ajouter "Moi" (Non cliquable)
                    const meDiv = document.createElement('div');
                    meDiv.className = 'participant-card';
                    meDiv.style.cursor = 'default';
                    meDiv.innerHTML = `
                        <div id="my-audio-avatar" style="width: 56px; height: 56px; border-radius: 50%; background: var(--accent-color); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.5rem; border: 2px solid transparent; transition: all 0.2s;">${initial}</div>
                        <span style="font-size: 0.75rem; color: var(--text-main); font-weight: 700; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Moi</span>
                    `;
                    parts.appendChild(meDiv);

                    // 2. Ajouter les autres participants (Cliquables pour le volume)
                    this.state.participants.forEach(p => {
                        const pInitial = ModuleCommunity.esc(p.senderName.charAt(0).toUpperCase());
                        
                        const pDiv = document.createElement('div');
                        pDiv.className = 'participant-card';
                        pDiv.innerHTML = `
                            <div id="audio-avatar-${p.rid}" style="width: 56px; height: 56px; border-radius: 50%; background: var(--surface-color); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.5rem; border: 2px solid transparent; transition: all 0.2s; ${p.avatarSrc ? `background-image:url('${p.avatarSrc}'); background-size:cover;` : ''}">${p.avatarSrc ? '' : pInitial}</div>
                            <span style="font-size: 0.75rem; color: var(--text-main); font-weight: 700; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ModuleCommunity.esc(p.senderName)}</span>
                        `;
                        
                        // Événement clic pour ouvrir le gestionnaire de volume
                        pDiv.addEventListener('click', () => {
                            this.showVolumeHud(p.rid, p.senderName, p.avatarSrc);
                        });
                        
                        parts.appendChild(pDiv);
                    });

                    document.getElementById('active-call-desc').textContent = `Connecté avec ${this.state.participants.length} motard(s)`;
                },
                // NOUVEAU : Popup pour ajuster le volume d'un utilisateur précis
                showVolumeHud(rid, name, avatarSrc) {
                    const existing = document.getElementById('intercom-volume-overlay');
                    if (existing) existing.remove();

                    // Récupérer le volume actuel (100% par défaut)
                    const currentVol = this.state.userVolumes.has(rid) ? this.state.userVolumes.get(rid) : 100;
                    const initial = ModuleCommunity.esc(name.charAt(0).toUpperCase());

                    const overlay = document.createElement('div');
                    overlay.id = 'intercom-volume-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; padding: 20px;";

                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 30px 20px; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                            
                            <div style="width: 70px; height: 70px; border-radius: 50%; background: var(--active-bg); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 2rem; margin: 0 auto 15px; ${avatarSrc ? `background-image:url('${avatarSrc}'); background-size:cover;` : ''}">${avatarSrc ? '' : initial}</div>
                            
                            <h3 style="color: var(--text-main); font-size: 1.2rem; margin-bottom: 5px; font-weight: 900;">${ModuleCommunity.esc(name)}</h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 25px;">Ajuster le volume du motard</p>
                            
                            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 30px;">
                                <svg style="width:24px; height:24px; color:var(--text-muted); flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                                
                                <input type="range" id="volume-slider-${rid}" class="vol-slider" min="0" max="100" value="${currentVol}">
                                
                                <svg style="width:24px; height:24px; color:var(--accent-color); flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                            </div>
                            
                            <button id="btn-vol-close" class="btn" style="width: 100%; background: rgba(255,255,255,0.1); color: var(--text-main); padding: 15px; border-radius: 16px; font-weight: 800;">Fermer</button>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; }, 10);

                    // Logique pour l'Audio HTML5
                    const slider = document.getElementById(`volume-slider-${rid}`);
                    slider.addEventListener('input', (e) => {
                        const val = parseInt(e.target.value);
                        this.state.userVolumes.set(rid, val);
                        
                        // Trouve le flux audio WebRTC du motard et modifie le volume en direct
                        if (typeof ModuleCommunity !== 'undefined') {
                            ModuleCommunity.state.peers.forEach(peer => {
                                if (peer.rid === rid && peer.audioEl) {
                                    if (typeof ModuleMusicShare !== 'undefined') ModuleMusicShare.applyVoice(); else peer.audioEl.volume = val / 100;
                                }
                            });
                        }
                    });

                    const closeOverlay = () => {
                        overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 300);
                    };

                    document.getElementById('btn-vol-close').addEventListener('click', closeOverlay);
                    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
                },
                handlePeerJoin(data) {
                    if (!this.state.isConnected) return;
                    
                    // --- 2. SÉCURITÉ DE TYPE POUR LE CODE DU CANAL ---
                    if (String(this.state.currentCode) !== String(data.roomCode)) return;
                    if (this.state.isPrivateRoom && !this.state.roomAllowed.has(data.rid)) return;   // canal privé : seulement les motards admis
                    if (this.state.limit2 && this.state.participants.length >= 2 && !this.state.participants.some(p => p.rid === data.rid)) return;   // créateur gratuit : lui + 2 motards
                    
                    if (!this.state.participants.some(p => p.rid === data.rid) && this.state.participants.length < 24) {
                        this.state.participants.push(data);
                        this.renderParticipants();
                        try { AppCue.join(); } catch (e) {}
                        // ...
                        
                        if (typeof ModuleCommunity !== 'undefined' && !data.isSyncReply) {
                            const myName = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.name : "Un motard";
                            const myAvatar = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.avatar : null;
                            
                            ModuleCommunity.broadcast({ 
                                type: 'intercom_join', 
                                roomName: this.state.currentRoomName,
                                roomCode: this.state.currentCode,
                                isPrivate: this.state.isPrivateRoom,
                                senderName: myName,
                                avatarSrc: myAvatar,
                                rid: ModuleCommunity.state.myId,
                                isSyncReply: true 
                            });
                        }
                    }
                },
                handlePeerLeave(data) {
                    if (!this.state.isConnected || this.state.currentCode != data.roomCode) return;
                    const was = this.state.participants.length;
                    this.state.participants = this.state.participants.filter(p => p.rid !== data.rid);
                    this.renderParticipants();
                    if (this.state.participants.length < was) { try { AppCue.leave(); } catch (e) {} }
                },
});
