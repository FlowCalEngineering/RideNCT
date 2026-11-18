// P2P radar : courtier MQTT, balises, mode radar, profils et données reçues
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                async setRadarMode(mode, opts) {
                    // Radar amis : abonnés seulement (au rétablissement d'un réglage ancien : retour silencieux au radar global)
                    if (mode === 'friends' && typeof AppSub !== 'undefined' && !AppSub.premium()) { if (opts && opts.restore) mode = 'all'; else { AppSub.gate(); return; } }
                    const wasOff = (this.state.radarMode === 'off' || !this.state.radarMode);
                    const isOff = (mode === 'off');
                    if (!isOff && wasOff) {   // avertissement d'usage avant de partager sa position (Annuler = radar non activé + retour à l'accueil)
                        const wk = mode === 'friends' ? 'radar-amis' : 'radar';
                        if (opts && opts.restore) { if (!AppWarn.done(wk)) { localStorage.setItem('motoapp_radar_mode', 'off'); localStorage.setItem('motoapp_radar_enabled', '0'); return; } }
                        else if (!AppWarn.done(wk) && !(await AppWarn.ask(wk))) return;   // déjà accepté : aucune attente (sinon un « off » juste après un « all » serait doublé)
                    }
                    
                    if (!isOff && wasOff) this.turnRefresh();   // relais TURN : identifiants à jour avant les premières liaisons
                    this.state.radarMode = mode;
                    this.state.enabled = !isOff; 
                    
                    localStorage.setItem('motoapp_radar_mode', mode);
                    localStorage.setItem('motoapp_radar_enabled', isOff ? '0' : '1');
                    
                    const btnAll = document.getElementById('radar-toggle-all');
                    const btnFri = document.getElementById('radar-toggle-friends');
                    if (btnAll) btnAll.classList.toggle('on', mode === 'all');
                    if (btnFri) btnFri.classList.toggle('on', mode === 'friends');

                    if (!isOff) {
                        if (typeof RTCPeerConnection === 'undefined' || !window.crypto || !crypto.subtle) {
                            this.state.status = 'unsupported'; this.updateStatus(); return;
                        }
                        
                        if (wasOff) {
                            if (this.state.idReady) await this.state.idReady;
                            if (!this.state.idPriv) { this.state.status = 'unsupported'; this.updateStatus(); return; }
                            if (this.state.radarMode === 'off') return;
                            this.state.ignored.clear();   // nouvelle session : les motards écartés avant (mode Amis, éloignement) sont de nouveau acceptés
                            this.state.sid = this.randHex(8);
                            this.state.keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
                            this.state.pubB64 = this.b64(await crypto.subtle.exportKey('raw', this.state.keys.publicKey));
                            this.state.aesCache.clear();
                            
                            if (this.state.radarMode === 'off') return; 

                            const clientId = ('ridenct' + this.state.sid).slice(0, 23);
                            this.state.client = new MiniMQTT(this.config.brokers, clientId, {
                                status: (s) => { this.state.status = s; this.updateStatus(); },
                                connect: () => this.onBrokerConnect(),
                                message: (t, p) => this.onBrokerMessage(t, p)
                            });
                            this.state.client.start();
                            
                            if (navigator.geolocation) {
                                this.state.watchId = navigator.geolocation.watchPosition(
                                    (pos) => this.onPosition(pos),
                                    (err) => { if (err.code === 1) { this.state.status = 'nogps'; this.updateStatus(); } },
                                    { enableHighAccuracy: true, maximumAge: 2000 }
                                );
                            }
                            this.state.sweepTimer = setInterval(() => this.sweep(), 5000);
                        } else {
                            if (mode === 'friends') {
                                [...this.state.peers.keys()].forEach(sid => {
                                    const peer = this.state.peers.get(sid);
                                    if (peer && peer.rid && !this.isFriend(peer.rid) && !this.inVoice()) {
                                        this.closePeer(sid, 3600000); 
                                        this.removeRider(peer.rid);
                                    }
                                });
                            } else if (mode === 'all') {
                                // On vide les ignorés pour re-découvrir les inconnus bloqués par le mode Amis, et on prévient les autres (balise « f »)
                                this.state.ignored.clear();
                                this.state.freshBeacon = true;
                                this.beacon(true);
                            }
                            this.updateStatus();
                        }
                    } else {
                        this.broadcast({ type: 'bye' });
                        [...this.state.peers.keys()].forEach(sid => this.closePeer(sid));
                        this.state.ignored.clear();
                        if (this.state.client) this.state.client.stop();
                        this.state.client = null;
                        if (this.state.watchId !== null) navigator.geolocation.clearWatch(this.state.watchId);
                        this.state.watchId = null; 
                        this.state.cells = new Set(); 
                        this.state.lastBeacon = 0;
                        clearInterval(this.state.sweepTimer);
                        this.state.riders.forEach(r => { if (r.marker) r.marker.remove(); });
                        this.state.riders.clear();
                        this.state.status = 'off';
                        this.renderLists();
                    }
                    this.updateStatus();
                },
                updateStatus() {
                    const elAll = document.getElementById('radar-status-all'); 
                    const elFri = document.getElementById('radar-status-friends'); 
                    if (!elAll || !elFri) return;
                    
                    const n = this.nearRiders().length;
                    const mode = this.state.radarMode;
                    
                    const getMsg = () => {
                        if (this.state.status === 'connecting') return ['Connexion…', '#ff9f0a'];
                        if (this.state.status === 'offline') return ['Hors ligne · reconnexion…', 'var(--danger-color)'];
                        if (this.state.status === 'nogps') return ['GPS refusé : autorise', 'var(--danger-color)'];
                        if (this.state.status === 'unsupported') return ['WebRTC non compatible', 'var(--danger-color)'];
                        if (this.state.status === 'online') {
                            if (!this.state.myPos) return ['Connecté · recherche GPS…', '#30d158'];
                            return [n ? `Actif · ${n} ${mode === 'friends' ? 'ami' : 'motard'}${n > 1 ? 's' : ''}` : `Actif · personne autour`, '#30d158'];
                        }
                        return ['Désactivé', 'var(--text-muted)'];
                    };
                    const [txt, col] = getMsg();

                    if (mode === 'all') {
                        elAll.textContent = txt; elAll.style.color = col;
                        elFri.textContent = 'Désactivé'; elFri.style.color = 'var(--text-muted)';
                    } else if (mode === 'friends') {
                        elFri.textContent = txt; elFri.style.color = col;
                        elAll.textContent = 'Désactivé'; elAll.style.color = 'var(--text-muted)';
                    } else {
                        elAll.textContent = 'Désactivé'; elAll.style.color = 'var(--text-muted)';
                        elFri.textContent = 'Désactivé'; elFri.style.color = 'var(--text-muted)';
                    }
                },
                onBrokerConnect() {
                    this.state.client.subscribe(`${this.config.topicRoot}/sig/${this.state.sid}`);
                    this.state.client.subscribe(`${this.config.topicRoot}/user/${this.state.myId}`);
                    
                    if (!localStorage.getItem('motoapp_v1_profile_cleared')) {
                        this.state.client.publish(`vroomapp/fr-moto/v1/profile/${this.state.legacyId}`, '', true);
                        localStorage.setItem('motoapp_v1_profile_cleared', '1');
                    }
                    this.beacon(true);
                },
                beacon(force) {
                    const c = this.state.client; if (!c || !c.connected || !this.state.myPos) return;
                    const now = Date.now();
                    const wait = (force ? 1000 : this.config.beaconEvery) - (now - this.state.lastBeacon);
                    if (wait > 0) {
                        if (force && !this._beaconT) this._beaconT = setTimeout(() => { this._beaconT = null; this.beacon(true); }, wait);
                        return;
                    }
                    this.state.lastBeacon = now;
                    const fresh = !!this.state.freshBeacon; this.state.freshBeacon = false;
                    c.publish(`${this.config.topicRoot}/cell/${this.cellOf(this.state.myPos.lat, this.state.myPos.lon)}`,
                        JSON.stringify(fresh ? { sid: this.state.sid, pk: this.state.pubB64, f: 1 } : { sid: this.state.sid, pk: this.state.pubB64 }), false);
                },
                onBrokerMessage(topic, payload) {
                    let m; try { m = JSON.parse(payload); } catch (e) { return; }
                    if (!m || typeof m !== 'object') return;
                    if (topic === `${this.config.topicRoot}/sig/${this.state.sid}`) this.onSignal(m);
                    else if (topic.startsWith(`${this.config.topicRoot}/cell/`)) this.onBeacon(m);
                    else if (topic === `${this.config.topicRoot}/user/${this.state.myId}`) this.onDirectMessage(m);
                },
                onDirectMessage(m) {
                    // 🟢 DÉSACTIVÉ : Les demandes d'amis et suppressions passent désormais UNIQUEMENT par le radar P2P (quand on est à proximité).
                },
                onBeacon(m) {
                    if (!this.validSid(m.sid) || !this.validPk(m.pk) || m.sid === this.state.sid) return;
                    // « Je suis de nouveau joignable » (l'autre vient de repasser en Global) : on lève l'écart, au plus une fois par 30 s et par motard
                    if (m.f === 1) {
                        if (!this.state.freshAt) this.state.freshAt = new Map();
                        const nowF = Date.now();
                        if (nowF - (this.state.freshAt.get(m.sid) || 0) > 30000) { this.state.freshAt.set(m.sid, nowF); this.state.ignored.delete(m.sid); if (this.state.freshAt.size > 100) this.state.freshAt.delete(this.state.freshAt.keys().next().value); }
                    }
                    if (this.state.peers.has(m.sid) || (this.state.ignored.get(m.sid) || 0) > Date.now()) return;
                    if (this.state.peers.size >= this.config.maxPeers) return;
                    if (this.state.sid < m.sid) this.startPeer(m.sid, m.pk, true);
                    else this.beacon(true);
                },
                async publishProfile(bump, onlyPeer) {
                    if (typeof ModuleProfile === 'undefined') return;
                    const s = ModuleProfile.state;
                    if (bump || !this.state.profilePayload) {
                        const motos = await Promise.all((s.motos || []).slice(0, 5).map(async (m, i) => ({
                            marque: m.marque || '', modele: m.modele || '', annee: m.annee || '', cylindree: m.cylindree || '', type: m.type || '',
                            photo: i === 0 ? await this.shrinkImage(m.photo, 220) : null 
                        })));
                        this.state.profilePayload = {
                            type: 'profile', rid: this.state.myId, v: Date.now(),
                            name: s.name || 'Motard', bio: s.bio || '', style: s.ridingStyle || '',
                            avatar: await this.shrinkImage(s.avatar, 120),
                            troph: (typeof ModuleBadges !== 'undefined') ? ModuleBadges.earned() : [],
                            social: (s.social || []).slice(0, 6).map(x => ({ platform: x.platform, handle: x.handle })),
                            motos
                        };
                    }
                    if (onlyPeer) { 
                        if (this.state.radarMode === 'friends' && onlyPeer.rid && !this.isFriend(onlyPeer.rid)) return;
                        onlyPeer.profileSent = true; this.sendTo(onlyPeer, this.state.profilePayload); 
                    }
                    else {
                        this.state.peers.forEach(p => { 
                            if (this.state.radarMode === 'friends' && p.rid && !this.isFriend(p.rid)) return;
                            if (p.profileSent) this.sendTo(p, this.state.profilePayload); 
                        });
                    }
                },
                onPeerData(peer, raw) {
                    if (typeof raw !== 'string' || raw.length > 250000) return;
                    if (this.state.peers.get(peer.sid) !== peer) return;   // liaison déjà fermée (message en retard ou file d'attente rejouée) : on n'en tient plus compte
                    let m; try { m = JSON.parse(raw); } catch (e) { return; }
                    if (!m || typeof m !== 'object' || Array.isArray(m)) return;
                    // Anti-inondation : au-delà de 40 messages/s un motard est écarté
                    const nowT = Date.now(); if (!peer.rl || nowT - peer.rl.t > 1000) peer.rl = { t: nowT, n: 0 };
                    if (++peer.rl.n > 40) { if (peer.rl.n === 41) console.warn('[P2P] inondation, liaison coupée'); if (peer.rl.n > 120) this.closePeer(peer.sid, 120000); return; }
                    // Tout texte reçu est nettoyé ici, une fois pour toutes (affichage, notifications, voix)
                    if (typeof m.type !== 'string' || m.type.length > 24) return;
                    if ('senderName' in m) m.senderName = this.cleanText(m.senderName, 40) || 'Un motard';
                    if ('roomName' in m) m.roomName = this.cleanText(m.roomName, 40);
                    if ('roomCode' in m && m.roomCode != null) m.roomCode = this.cleanCode(m.roomCode);
                    if ('avatarSrc' in m) m.avatarSrc = this.sanitizeImg(m.avatarSrc);
                    if ('rid' in m && typeof m.rid !== 'string') delete m.rid;
                    if ('from' in m && typeof m.from !== 'string') delete m.from;
                    peer.lastMsg = Date.now();
                    if (m.type === 'ping') return;   // simple signe de vie (détection rapide d'une liaison coupée)
                    if (m.type === 'bye') { this.closePeer(peer.sid, 5000); return; }
                    
                    // Poignée de main : tant que l'autre n'a pas prouvé son identité (clé signée), rien d'autre n'est traité
                    if (m.type === 'hello') { this.onHello(peer, m); return; }
                    if (!peer.auth) {
                        if (!peer.pendingQ) peer.pendingQ = [];
                        if (peer.pendingQ.length < 40) peer.pendingQ.push(raw);
                        return;
                    }
                    // L'identité d'un message est celle de la liaison, jamais celle que le message prétend avoir
                    if ('rid' in m && m.rid !== peer.rid) return;
                    if ('from' in m && m.from !== peer.rid) return;
                    m.rid = peer.rid;

                    // Mode Amis : les inconnus sont coupés... sauf s'ils sont avec moi dans un canal vocal / Mode Rencontre.
                    // Ils restent alors connectés comme « invités » : voix, musique et itinéraire passent, mais ni position ni profil.
                    peer.guest = false;
                    if (this.state.radarMode === 'friends' && !this.isFriend(m.rid)) {
                        if (!this.inVoice()) { this.closePeer(peer.sid, 3600000); return; }
                        peer.guest = true;
                        if (!/^(intercom_|route$|music$|qmsg$)/.test(String(m.type))) return;
                    }

                    // ==========================================
                    // 🎧 NOUVEAU : INTERCEPTION DES MESSAGES INTERCOM
                    // ==========================================
                    if (m.type === 'route') {
                        if (typeof ModuleRouteShare !== 'undefined') ModuleRouteShare.onData(peer, m);
                        return;
                    }
                    if (m.type === 'qmsg') {
                        if (typeof ModuleQuick !== 'undefined') ModuleQuick.onData(peer, m);
                        return;
                    }
                    if (m.type === 'music') {
                        if (typeof ModuleMusicShare !== 'undefined') ModuleMusicShare.onData(peer, m);
                        return;
                    }

                    if (m.type === 'intercom_invite') {
                        if (typeof ModuleIntercom !== 'undefined') {
                            ModuleIntercom.receiveInvite(m.senderName || 'Un motard', m.roomName, m.roomCode, m.avatarSrc, { pin: m.pin, from: peer.rid, isPrivate: m.isPrivate });
                        }
                        return; // On arrête l'exécution ici, le message a été traité
                    }

                    if (m.type === 'intercom_join') {
                        if (typeof ModuleIntercom !== 'undefined' && !ModuleIntercom.mayJoin(peer, m.roomCode)) return;   // canal privé : motard non admis
                        peer.roomCode = m.roomCode; this.refreshAudioRouting();
                        if (typeof ModuleIntercom !== 'undefined') {
                            ModuleIntercom.handlePeerJoin(m);
                            if (!m.isSyncReply) ModuleIntercom.shareMembers(peer);
                        }
                        return;
                    }

                    // Accès aux canaux privés (voir intercom/groupe/acces.js)
                    if (m.type === 'intercom_knock') { if (typeof ModuleIntercom !== 'undefined') ModuleIntercom.onKnock(peer, m); return; }
                    if (m.type === 'intercom_admit') { if (typeof ModuleIntercom !== 'undefined') ModuleIntercom.onAdmit(peer, m); return; }
                    if (m.type === 'intercom_deny') { if (typeof ModuleIntercom !== 'undefined') ModuleIntercom.onDeny(peer, m); return; }
                    if (m.type === 'intercom_allow') { if (typeof ModuleIntercom !== 'undefined') ModuleIntercom.onAllow(peer, m); return; }

                    if (m.type === 'intercom_leave') {
                        peer.roomCode = null; this.refreshAudioRouting();
                        if (typeof ModuleIntercom !== 'undefined') {
                            ModuleIntercom.handlePeerLeave(m);
                        }
                        return;
                    }
                    
                    // (Dans ModuleCommunity -> onPeerData, juste après l'interception de 'intercom_leave')
                    if (m.type === 'intercom_room_ad') {
                        if (peer.roomCode !== m.roomCode) { peer.roomCode = m.roomCode; this.refreshAudioRouting(); }
                        
                        if (typeof ModuleIntercom !== 'undefined') {
                            // --- NOUVEAU : Auto-réparation (Self-healing) ---
                            // Si on est censé être dans le MÊME canal, on force la réintégration dans les participants
                            if (ModuleIntercom.state.isConnected && String(ModuleIntercom.state.currentCode) === String(m.roomCode)) {
                                if (ModuleIntercom.mayJoin(peer, m.roomCode)) ModuleIntercom.handlePeerJoin(m);
                            } else {
                                ModuleIntercom.handleRoomAd(m);
                            }
                        }
                        return;
                    }
                    
                    // 🟢 Interception du statut Mode Rencontre de l'autre motard
                    if (m.type === 'intercom_auto') {
                        peer.autoIntercom = m.active;
                        this.refreshAudioRouting();
                        
                        if (typeof ModuleIntercom !== 'undefined') {
                            ModuleIntercom.renderAutoParticipants(); // Met à jour la liste des avatars
                            
                            // Si l'autre l'a activé ET que je l'ai activé aussi, on fait pop une notif !
                            if (m.active && ModuleIntercom.state.autoModeActive) {
                                const rider = this.state.riders.get(m.rid);
                                const name = rider ? rider.name : "Un motard";
                                const icPhone = `<svg style="width:26px;height:26px;color:#30d158" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
                                this.showNotification("Mode Rencontre", `${name} est à portée, communication ouverte !`, icPhone);
                            }
                        }
                        return;
                    }
                    // ==========================================

                    // Le reste du code existant...
                    if (m.type === 'profile') return this.onProfile(m);
                    
                    if (m.type === 'friend_req') {
                        if (!m.profile || typeof m.profile !== 'object' || m.profile.rid !== peer.rid) return;   // la demande doit venir de la personne qu'elle prétend être
                        if (this.state.friends.some(f => f.id === m.profile.rid) || this.state.friendReqs.some(r => r.id === m.profile.rid)) return;
                        if (this.state.friendReqs.length >= 30) return;                                          // pas de pluie de demandes
                        this.onProfile(m.profile); 
                        this.state.friendReqs.push({ id: m.profile.rid, timestamp: Date.now(), profile: this.state.profiles.get(m.profile.rid) });
                        this.saveFriendsData();
                        const tab = document.querySelector('.comm-tab-btn[data-sub="sub-comm-demandes"]');
                        if (tab && !tab.classList.contains('active')) tab.style.color = "var(--danger-color)";
                        this.showNotification("Nouvelle demande", `${m.profile.name || 'Un motard'} souhaite t'ajouter.`, `<svg style="width:26px;height:26px;color:#0a84ff" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`);
                        return;
                    }
                    
                    if (m.type === 'friend_accept') {
                        if (!m.profile || typeof m.profile !== 'object' || m.profile.rid !== peer.rid) return;
                        if (this.state.friends.some(f => f.id === m.profile.rid)) return;
                        // On n'accepte une confirmation que si on avait bien envoyé une demande à ce motard
                        if (!this.friendWasAsked(m.profile.rid)) return;
                        this.onProfile(m.profile);
                        this.state.friends.push({ id: m.profile.rid, addedAt: Date.now(), profile: this.state.profiles.get(m.profile.rid) });
                        this.saveFriendsData();
                        this.showNotification("Demande acceptée", `${m.profile.name || 'Un motard'} est maintenant ton ami !`, `<svg style="width:26px;height:26px;color:#30d158" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`);
                        return;
                    }
                    
                    if (m.type === 'friend_remove') {
                        this.state.friends = this.state.friends.filter(f => f.id !== peer.rid);
                        this.saveFriendsData();
                        return;
                    }

                    if (m.type === 'pos' && this.state.pendingRemovals && this.state.pendingRemovals.includes(m.rid)) {
                        this.sendTo(peer, { type: 'friend_remove', from: this.state.myId }); 
                        this.state.pendingRemovals = this.state.pendingRemovals.filter(id => id !== m.rid); 
                        this.saveFriendsData();
                    }

                    if (m.type === 'pos' && this.state.pendingRequests && this.state.pendingRequests.includes(m.rid)) {
                        const sendReq = async () => {
                            if (!this.state.profilePayload) await this.publishProfile(true, null);
                            this.sendTo(peer, { type: 'friend_req', profile: this.state.profilePayload });
                            this.markAsked(m.rid);
                            this.state.pendingRequests = this.state.pendingRequests.filter(id => id !== m.rid);
                            this.saveFriendsData();
                            this.showNotification("Demande expédiée", "Le motard est à proximité, ta demande en attente a été envoyée !", `<svg style="width:26px;height:26px;color:#30d158" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`);
                        };
                        sendReq();
                    }

                    if (m.type === 'pos' && this.state.pendingAccepts && this.state.pendingAccepts.includes(m.rid)) {
                        const sendAcc = async () => {
                            if (!this.state.profilePayload) await this.publishProfile(true, null);
                            this.sendTo(peer, { type: 'friend_accept', profile: this.state.profilePayload });
                            this.state.pendingAccepts = this.state.pendingAccepts.filter(id => id !== m.rid);
                            this.saveFriendsData();
                            this.showNotification("Contact établi", "L'ami ajouté a reçu ta confirmation de connexion via le radar.", `<svg style="width:26px;height:26px;color:#30d158" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`);
                        };
                        sendAcc();
                    }

                    if (m.type !== 'pos') return;
                    const lat = Number(m.lat), lon = Number(m.lon);
                    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;

                    let r = this.state.riders.get(m.rid);
                    if (r && r.sid !== peer.sid) { 
                        const old = r.sid; r.sid = peer.sid; this.closePeer(old);
                        r = this.state.riders.get(m.rid);
                    }
                    if (!r) { r = { id: m.rid, sid: peer.sid }; this.state.riders.set(m.rid, r); }
                    Object.assign(r, { lat, lon, hd: Number(m.hd) || 0, sp: Number(m.sp) || 0, name: String(m.n || 'Motard').slice(0, 40), seen: Date.now() });
                    this.refreshRider(r);
                    this.updateStatus();
                },
                onProfile(m) {
                    const str = (x, n) => String(x == null ? '' : x).slice(0, n);
                    const id = m.rid;
                    const prof = {
                        id, v: Number(m.v) || 0, name: str(m.name || 'Motard', 40), bio: str(m.bio, 300), style: str(m.style, 30),
                        avatar: this.sanitizeImg(m.avatar),
                        troph: Array.isArray(m.troph) ? m.troph.filter(k => typeof k === 'string' && /^[a-z]{3,8}$/.test(k)).slice(0, 12) : [],
                        social: Array.isArray(m.social) ? m.social.slice(0, 6).map(s => ({ platform: str(s && s.platform, 20), handle: str(s && s.handle, 40) })) : [],
                        motos: Array.isArray(m.motos) ? m.motos.slice(0, 5).map(x => ({
                            marque: str(x && x.marque, 30), modele: str(x && x.modele, 40), annee: str(x && x.annee, 6),
                            cylindree: str(x && x.cylindree, 6), type: str(x && x.type, 30), photo: this.sanitizeImg(x && x.photo)
                        })) : []
                    };
                    this.state.profiles.set(id, prof);
                    if (this.state.crossed[id]) { this.state.crossed[id].profile = prof; this.saveCrossed(); }
                    const r = this.state.riders.get(id); if (r) this.refreshRider(r, true);
                    this.renderLists();
                    const ov = document.getElementById('rider-profile-overlay');
                    if (ov && ov.dataset.rider === id) this.openProfile(id);
                },
});
