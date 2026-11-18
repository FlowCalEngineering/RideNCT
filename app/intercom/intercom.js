            const ModuleIntercom = {
                state: { 
                    isConnected: false, 
                    currentRoomName: null,
                    currentCode: null,   // identifiant PUBLIC du canal
                    roomPin: null,       // code secret à 4 chiffres (jamais diffusé)
                    roomAllowed: new Set(),   // motards admis dans le canal
                    knock: null,
                    isPrivateRoom: true, 
                    autoModeActive: false,
                    isMicMuted: false,
                    receivedInvites: [], 
                    participants: [],
                    nearbyRooms: new Map(), 
                    userVolumes: new Map(), // Mémorise les volumes modifiés
                    broadcastInterval: null 
                },
                init() { 
                    this.initTabs();
                    this.initListeners(); 
                    this.generateNewCode();
                    setInterval(() => this.cleanStaleRooms(), 10000);
                    // Rendu initial de la liste (qui sera vide)
                    this.renderNearbyRooms();
                },
                initTabs() {
                    const tabs = document.querySelectorAll('.intercom-tab-btn');
                    tabs.forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            const targetId = e.currentTarget.getAttribute('data-sub'); 
                            tabs.forEach(t => t.classList.remove('active')); 
                            e.currentTarget.classList.add('active');
                            
                            document.querySelectorAll('.intercom-sub-view').forEach(v => v.classList.remove('active')); 
                            const targetView = document.getElementById(targetId); 
                            if (targetView) targetView.classList.add('active');

                            // --- DÉBUT DE LA CORRECTION ---
                            if (targetId === 'sub-intercom-invites') {
                                e.currentTarget.style.color = "var(--text-muted)";
                                this.renderReceivedInvites(); // <-- Il manquait cet appel pour rafraîchir la vue !
                            }
                            if (targetId === 'sub-intercom-radar') {
                                this.renderNearbyRooms();
                            }
                            // --- FIN DE LA CORRECTION ---
                        });
                    });
                },
                // generateNewCode() : voir intercom/groupe/acces.js
                initListeners() {
                    // Ouverture du HUD Création
                    document.getElementById('btn-show-create-hud').addEventListener('click', () => this.showCreateHud());

                    // Mode Rencontre
                    const toggleAuto = document.getElementById('intercom-toggle-auto');
                    toggleAuto.addEventListener('click', async () => {
                        if (!this.state.autoModeActive && !AppWarn.done('rencontre') && !(await AppWarn.ask('rencontre'))) return;
                        this.state.autoModeActive = !this.state.autoModeActive;
                        toggleAuto.classList.toggle('on', this.state.autoModeActive);
                        
                        const status = document.getElementById('intercom-auto-status');
                        const partContainer = document.getElementById('intercom-auto-participants');
                        
                        if(this.state.autoModeActive) {
                            status.textContent = "Initialisation du micro...";
                            status.style.color = "#ff9f0a";
                            partContainer.style.display = 'flex';
                            
                            // --- 1. DÉBLOCAGE AUDIO SAFARI/MOBILE ---
                            // On profite du clic de l'utilisateur pour forcer l'autorisation de lecture
                            if (typeof ModuleCommunity !== 'undefined') {
                                ModuleCommunity.state.peers.forEach(p => {
                                    if (p.audioEl) p.audioEl.play().catch(()=>{});
                                });
                            }
                            
                            // On ATTEND que le micro soit bien allumé
                            if (!this.api.localStream) {
                                await this.api.startAudioStream();
                            }
                            
                            // Le Mode Rencontre passe par les liaisons P2P du radar : on l'active s'il est coupé
                            if (typeof ModuleCommunity !== 'undefined') {
                                const rm = ModuleCommunity.state.radarMode;
                                if (!rm || rm === 'off') { try { await ModuleCommunity.setRadarMode('all'); } catch (e) {} }
                            }

                            status.textContent = "Scanner actif (mains libres)...";
                            status.style.color = "#30d158";
                        } else {
                            status.textContent = "Désactivé";
                            status.style.color = "var(--text-muted)";
                            partContainer.style.display = 'none';
                            
                            if (!this.state.isConnected) this.api.stopAudioStream();
                        }

                        // 🟢 On prévient les autres APRÈS avoir le micro
                        if (typeof ModuleCommunity !== 'undefined') {
                            ModuleCommunity.broadcast({ type: 'intercom_auto', active: this.state.autoModeActive, rid: ModuleCommunity.state.myId });
                            ModuleCommunity.refreshAudioRouting();
                            this.renderAutoParticipants(); // Génère les avatars
                        }
                    });

                    // Quitter l'appel
                    document.getElementById('btn-leave-room').addEventListener('click', async () => {
                        // Seul dans le canal : on quitte tout de suite ; sinon on demande confirmation (un doigt qui glisse en roulant)
                        let n = 0; try { ModuleCommunity.state.peers.forEach(p => { if (this.sameRoom(p) && p.dc && p.dc.readyState === 'open') n++; }); } catch (e) {}
                        if (n > 0) {
                            const ok = await AppDialog.confirm(`Quitter le canal ?\n\n${n} motard${n > 1 ? 's sont' : ' est'} encore dedans.`, { okText: 'Quitter', danger: true });
                            if (!ok || !this.state.isConnected) return;
                        }
                        this.disconnectRoom();
                    });

                    // Micro On/Off
                    const btnMic = document.getElementById('btn-toggle-mic');
                    btnMic.addEventListener('click', () => {
                        this.state.isMicMuted = !this.state.isMicMuted;
                        if(this.state.isMicMuted) {
                            btnMic.classList.remove('mic-on'); btnMic.classList.add('mic-off');
                            document.getElementById('icon-mic-on').style.display = 'none'; 
                            document.getElementById('icon-mic-off').style.display = 'block';
                            document.getElementById('text-mic-status').textContent = "Micro coupé";
                            this.api.muteMic();
                        } else {
                            btnMic.classList.remove('mic-off'); btnMic.classList.add('mic-on');
                            document.getElementById('icon-mic-off').style.display = 'none'; 
                            document.getElementById('icon-mic-on').style.display = 'block';
                            document.getElementById('text-mic-status').textContent = "Micro actif";
                            this.api.unmuteMic();
                        }
                    });

                    document.getElementById('btn-hud-invite').addEventListener('click', () => this.showInviteHud());
                },
                api: { 
                    localStream: null,
                    
                    async startAudioStream() { 
                        console.log("🎙️ Initialisation du flux WebRTC (Open Mic)..."); 
                        try {
                            // --- 3. CORRECTION DU MICRO : ON LE RÉUTILISE S'IL EST DÉJÀ ACTIF ---
                            if (this.localStream && this.localStream.getAudioTracks().length > 0 && this.localStream.getAudioTracks()[0].readyState === 'live') {
                                console.log("Microphone déjà actif, on le garde en mémoire !");
                                // On s'assure juste que le statut mute/unmute est respecté
                                this.localStream.getAudioTracks().forEach(t => t.enabled = !ModuleIntercom.state.isMicMuted);
                                
                                if (typeof ModuleCommunity !== 'undefined') {
                                    ModuleCommunity.setLocalStream(this.localStream);
                                }
                                return; // On arrête ici, on n'a pas besoin de redemander l'autorisation
                            }

                            // Si on n'avait pas de micro, on nettoie au cas où et on demande l'accès
                            if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; if (typeof ModuleMic !== 'undefined') ModuleMic.release(); }
                            
                            // Contraintes "idéales" (non bloquantes) ...
            // Contraintes "idéales" (non bloquantes), avec repli sur un micro simple si l'appareil les refuse
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(
                    (typeof ModuleMic !== 'undefined') ? ModuleMic.constraints()
                    : { audio: { echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true } } }
                );
            } catch (e1) {
                if (e1 && (e1.name === 'OverconstrainedError' || e1.name === 'TypeError' || e1.name === 'NotReadableError')) {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                } else { throw e1; }
            }
            // L'utilisateur a pu quitter le canal / désactiver le Mode Rencontre pendant la demande d'autorisation
            // (le micro doit rester ouvert si on est dans un canal OU en Mode Rencontre)
            if (typeof ModuleIntercom !== 'undefined' && !ModuleIntercom.state.isConnected && !ModuleIntercom.state.autoModeActive) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            // Réglages micro (filtre vent/moteur, anti-bruit, volume) : le flux envoyé est le flux traité
            if (typeof ModuleMic !== 'undefined') stream = await ModuleMic.wrap(stream);
            this.localStream = stream;
            if (typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state.isMicMuted) {
                stream.getAudioTracks().forEach(t => t.enabled = false);
            }
            if (typeof ModuleCommunity !== 'undefined') {
                ModuleCommunity.setLocalStream(this.localStream);
            }
        } catch (error) {
            console.error("⚠️ Impossible d'accéder au microphone :", error);
            let why;
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) {
                why = "Le micro n'est autorisé que sur une page en HTTPS (ou localhost). Ouvre l'app depuis une adresse https:// (ex. GitHub Pages, Netlify) et non depuis un fichier local ou une adresse http://.";
            } else if (window.self !== window.top) {
                why = "L'app est ouverte dans un cadre intégré (aperçu) qui bloque le micro. Ouvre-la directement dans Safari/Chrome, en plein onglet.";
            } else if (error && error.name === 'NotAllowedError') {
                why = "Le micro est bloqué pour ce site. Réglages du navigateur > ce site > Microphone > Autoriser (sur iPhone : Réglages > Safari > Microphone, ou le « aA » dans la barre d'adresse > Réglages du site web). Puis recharge la page et rejoins le canal.";
            } else if (error && error.name === 'NotFoundError') {
                why = "Aucun micro détecté sur cet appareil.";
            } else if (error && error.name === 'NotReadableError') {
                why = "Le micro est utilisé par une autre application. Ferme-la puis réessaie.";
            } else {
                why = "Erreur micro : " + (error && error.name ? error.name : 'inconnue');
            }
            AppDialog.alert("Micro indisponible. Tu entendras les autres mais pas leur parler.\n\n" + why);
        }
    },
    
    stopAudioStream() { 
        console.log("🛑 Fermeture du flux WebRTC..."); 
        if (this.localStream) {
            // Coupe proprement toutes les pistes audio
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        if (typeof ModuleMic !== 'undefined') ModuleMic.release();
        if (typeof ModuleCommunity !== 'undefined') {
            ModuleCommunity.setLocalStream(null);
        }
    },
    
    muteMic() { 
        const av = document.getElementById('my-audio-avatar'); if (av) av.classList.remove('speaking-avatar');
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => track.enabled = false);
        }
    },
    
    unmuteMic() { 
        const av = document.getElementById('my-audio-avatar'); if (av) av.classList.add('speaking-avatar');
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => track.enabled = true);
        }
    },
    
    sendInvite(targetId, roomName, roomCode) {
        // [Garder le code existant de sendInvite ici]
        if (typeof ModuleCommunity !== 'undefined') {
            const rider = ModuleCommunity.state.riders.get(targetId);
            if (rider && rider.near) {
                const peer = ModuleCommunity.state.peers.get(rider.sid);
                if (peer) {
                    const myName = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.name : "Un motard";
                    const myAvatar = (typeof ModuleProfile !== 'undefined') ? ModuleProfile.state.avatar : null;
                    try { if (ModuleIntercom.state.isConnected) ModuleIntercom.grant(peer.rid); } catch (e) {}
                    ModuleCommunity.sendTo(peer, { 
                        type: 'intercom_invite', 
                        roomName: roomName, 
                        roomCode: roomCode,
                        pin: ModuleIntercom.state.isPrivateRoom ? ModuleIntercom.state.roomPin : null,
                        isPrivate: ModuleIntercom.state.isPrivateRoom,
                        senderName: myName,
                        avatarSrc: myAvatar,
                        rid: ModuleCommunity.state.myId 
                    });
                }
            }
        }
    }
},

            };
