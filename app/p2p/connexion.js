// P2P : signalisation et liaisons WebRTC entre motards
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                async sendSignal(peer, data) {
                    const c = this.state.client; if (!c || !c.connected) return;
                    const iv = crypto.getRandomValues(new Uint8Array(12));
                    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.aesKey(peer.pk), new TextEncoder().encode(JSON.stringify(data)));
                    c.publish(`${this.config.topicRoot}/sig/${peer.sid}`, JSON.stringify({ from: this.state.sid, pk: this.state.pubB64, iv: this.b64(iv), ct: this.b64(ct) }), false);
                },
                async onSignal(m) {
                    if (!this.validSid(m.from) || !this.validPk(m.pk) || typeof m.iv !== 'string' || typeof m.ct !== 'string') return;
                    let data;
                    try {
                        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(m.iv) }, await this.aesKey(m.pk), this.unb64(m.ct));
                        data = JSON.parse(new TextDecoder().decode(pt));
                    } catch (e) { return; }
                    if (!data || typeof data.sdp !== 'string' || data.sdp.length > 20000) return;
                    try {
                        if (data.type === 'offer') {
                            if ((this.state.ignored.get(m.from) || 0) > Date.now() && !this.inVoice()) return; // en canal vocal on accepte de nouveau les motards écartés avant
                            if (this.state.peers.has(m.from)) this.closePeer(m.from);
                            if (this.state.peers.size >= this.config.maxPeers) return;
                            
                            const peer = this.startPeer(m.from, m.pk, false);
                            await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
                            
                            // --- 3. FIX RÉCEPTION AUDIO ---
                            let localTrack = (this.state.localStream && this.state.localStream.getAudioTracks()[0]) || null;
                            
                            peer.pc.getTransceivers().forEach(t => {
                                if (t.receiver && t.receiver.track && t.receiver.track.kind === 'audio') {
                                    try { t.direction = 'sendrecv'; } catch (e) {}
                                    if (!peer.audioSender) {
                                        peer.audioSender = t.sender;
                                        // On attache la piste et on la mute direct
                                        if (localTrack) peer.audioSender.replaceTrack(null).catch(()=>{}); 
                                    } else if (!peer.musicSender) {
                                        peer.musicSender = t.sender;
                                    }
                                }
                            });
                            
                            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
                            this.refreshAudioRouting();
                            await this.iceComplete(peer.pc);
                            this.sendSignal(peer, { type: 'answer', sdp: peer.pc.localDescription.sdp });
                        } else if (data.type === 'answer') {
                            const peer = this.state.peers.get(m.from);
                            if (peer && peer.pc.signalingState === 'have-local-offer') await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
                        }
                    } catch (e) { this.closePeer(m.from, this.keepOut()); }
                },
                iceComplete(pc) {
                    return new Promise(resolve => {
                        if (pc.iceGatheringState === 'complete') return resolve();
                        let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
                        setTimeout(finish, 2000);
                        pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') finish(); });
                        pc.addEventListener('icecandidate', (e) => { if (e.candidate && / typ srflx /.test(e.candidate.candidate)) setTimeout(finish, 300); });
                    });
                },
                startPeer(sid, pk, initiator) {
                    const pc = new RTCPeerConnection({ iceServers: this.iceList() });
                    const peer = { sid, pk, pc, dc: null, rid: null, lastMsg: Date.now(), audioEl: null };
                    this.state.peers.set(sid, peer);
                    
                    pc.onconnectionstatechange = () => {
                        if (['failed', 'closed'].includes(pc.connectionState)) this.closePeer(sid, this.keepOut());
                        else if (pc.connectionState === 'disconnected') { // coupure réseau : on laisse 8 s pour revenir seule, sinon on refait la liaison
                            clearTimeout(peer.discT); peer.discT = setTimeout(() => { if (this.state.peers.get(sid) === peer && pc.connectionState !== 'connected') { this.closePeer(sid); if (this.beacon) this.beacon(true); } }, 8000);
                        } else if (pc.connectionState === 'connected') clearTimeout(peer.discT);
                    };
                    // Liaison jamais ouverte (l'autre est en mode Amis, hors portée…) : on réessaie assez vite, 15 s (3 s en vocal), pour ne pas rater le retour de l'autre
                    peer.timeout = setTimeout(() => { if (!peer.dc || peer.dc.readyState !== 'open') this.closePeer(sid, this.inVoice() ? 3000 : 15000); }, 20000);

                    // --- 2. INITIALISATION ROBUSTE DE L'AUDIO ---
                    peer.roomCode = null;
                    peer.audioSender = null;
                    
                    // On récupère le micro s'il existe déjà
                    let localTrack = (this.state.localStream && this.state.localStream.getAudioTracks()[0]) || null;

                    if (initiator) {
                        // On attache la piste DÈS LA CRÉATION pour forcer WebRTC à l'accepter
                        const tr = pc.addTransceiver(localTrack || 'audio', { direction: 'sendrecv' });
                        peer.audioSender = tr.sender;
                        // On la coupe immédiatement en attendant que l'intercom l'autorise
                        if (localTrack) peer.audioSender.replaceTrack(null).catch(()=>{}); 
                        // Piste n°2 : musique partagée dans le canal
                        try { peer.musicSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender; } catch (e) {}
                    }

                    pc.ontrack = (event) => {
                        if (event.track.kind !== 'audio') return;
                        if (typeof ModuleMusicShare !== 'undefined' && ModuleMusicShare.isMusicTrack(peer, event)) { ModuleMusicShare.onMusicTrack(peer, event.track); return; }
                        if (!peer.audioEl) {
                            const audio = document.createElement('audio');
                            audio.autoplay = true;
                            audio.playsInline = true;
                            audio.style.display = 'none';
                            document.body.appendChild(audio);
                            peer.audioEl = audio;
                        }
                        
                        // On applique le volume choisi par l'utilisateur (ou 100% par défaut)
                        let vol = 1;
                        if (typeof ModuleIntercom !== 'undefined' && peer.rid && ModuleIntercom.state.userVolumes.has(peer.rid)) {
                            vol = ModuleIntercom.state.userVolumes.get(peer.rid) / 100;
                        }
                        if (typeof ModuleMusicShare !== 'undefined') vol = ModuleMusicShare.voiceVol(peer.rid);
                        peer.audioEl.volume = vol;
                        
                        peer.audioEl.srcObject = new MediaStream([event.track]);
                        if (typeof ModuleMusicShare !== 'undefined') ModuleMusicShare.wire(peer, 'voice', peer.audioEl.srcObject);
                        this.refreshAudioRouting();
                    };

                    if (initiator) {
                        this.setupChannel(peer, pc.createDataChannel('vroom'));
                        // ... suite inchangée ...
        (async () => {
            try {
                await pc.setLocalDescription(await pc.createOffer());
                await this.iceComplete(pc);
                if (this.state.peers.get(sid) === peer) this.sendSignal(peer, { type: 'offer', sdp: pc.localDescription.sdp });
            } catch (e) { this.closePeer(sid, this.keepOut()); }
        })();
    } else {
        pc.ondatachannel = (e) => this.setupChannel(peer, e.channel);
    }
    return peer;
},
                setupChannel(peer, dc) {
                    peer.dc = dc;
                    
                    // À l'ouverture on se présente seulement (hello signé) : position, canal vocal, etc. ne partent qu'une fois l'autre identifié
                    const handleChannelOpen = () => {
                        clearTimeout(peer.timeout);
                        peer.lastMsg = Date.now();
                        peer.helloT = setTimeout(() => { if (!peer.auth && this.state.peers.get(peer.sid) === peer) this.closePeer(peer.sid, this.keepOut()); }, 12000);
                        this.sendHello(peer);
                    };

                    // 🟢 CORRECTION CRUCIALE ICI : 
                    // Si le canal est DÉJÀ ouvert, on exécute tout de suite. Sinon, on attend l'événement.
                    if (dc.readyState === 'open') {
                        handleChannelOpen();
                    } else {
                        dc.onopen = handleChannelOpen;
                    }
                    
                    dc.onmessage = (e) => this.onPeerData(peer, e.data);
                    dc.onclose = () => this.closePeer(peer.sid);
                },
                // Délai avant de réessayer un motard dont la liaison a échoué : court quand on est en vocal (on veut revenir vite)
                keepOut() { return this.inVoice && this.inVoice() ? 3000 : 60000; },
                closePeer(sid, ignoreMs) {
    const peer = this.state.peers.get(sid);
    if (ignoreMs) this.state.ignored.set(sid, Date.now() + ignoreMs);
    if (!peer) return;
    this.state.peers.delete(sid);
    clearTimeout(peer.timeout); clearTimeout(peer.discT); clearTimeout(peer.helloT); clearTimeout(peer.helloRetryT);
    
    // 🔴 NOUVEAU : Supprimer l'élément audio du DOM
    if (peer.audioEl) {
        peer.audioEl.pause();
        peer.audioEl.remove();
        peer.audioEl = null;
    }
    
    if (peer.musicEl) { peer.musicEl.pause(); peer.musicEl.remove(); peer.musicEl = null; }
    if (typeof ModuleMusicShare !== 'undefined') ModuleMusicShare.onPeerClosed(sid);
    try { if (peer.dc) peer.dc.close(); } catch (e) {}
    try { peer.pc.close(); } catch (e) {}
    if (peer.rid) { const r = this.state.riders.get(peer.rid); if (r && r.sid === sid) this.removeRider(peer.rid); }
    // Un motard sans position (invité en mode Amis, GPS pas encore fixé) n'a pas de fiche « rider » : on le retire quand même du canal vocal, sinon il y reste fantôme
    if (peer.rid && typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state.isConnected) { try { ModuleIntercom.handlePeerLeave({ rid: peer.rid, roomCode: ModuleIntercom.state.currentCode }); } catch (e) {} }
    
    if (typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state.autoModeActive) {
                        ModuleIntercom.renderAutoParticipants(); // Retire l'avatar si le motard perd le réseau
                    }
},
                sendTo(peer, obj) {
                    if (!peer.auth && obj.type !== 'hello' && obj.type !== 'bye') return;   // rien ne part avant que l'autre ait prouvé son identité
                    if (peer.dc && peer.dc.readyState === 'open') { try { peer.dc.send(JSON.stringify(obj)); } catch (e) {} }
                },
                broadcast(obj) { 
               	 this.state.peers.forEach(p => this.sendTo(p, obj)); 
                },
});
