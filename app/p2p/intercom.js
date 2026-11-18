// P2P intercom : routage audio des flux
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                setLocalStream(stream) {
                    this.state.localStream = stream;
                    this.refreshAudioRouting();
                },
                // Décide, pour chaque motard connecté, si on lui envoie mon micro et si on joue sa voix.
                // Règle : uniquement s'il est dans le MÊME canal intercom que moi.
                refreshAudioRouting() {
                    const IC = (typeof ModuleIntercom !== 'undefined') ? ModuleIntercom.state : null;
                    const inRoom = !!(IC && IC.isConnected && IC.currentCode != null);
                    
                    // 🟢 On vérifie si mon Mode Rencontre est actif
                    const myAuto = !!(IC && IC.autoModeActive); 
                    
                    const track = (this.state.localStream && this.state.localStream.getAudioTracks()[0]) || null;
                    
                    this.state.peers.forEach(peer => {
                        const sameRoom = inRoom && ModuleIntercom.sameRoom(peer);
                        
                        // 🟢 On vérifie si l'autre a AUSSI son Mode Rencontre actif
                        const bothAuto = myAuto && peer.autoIntercom; 
                        
                        // 🟢 MAGIE : Le son passe si on est dans le même canal OU si on est tous les 2 en Mode Rencontre
                        const shouldRoute = sameRoom || bothAuto;

                        if (peer.audioSender) {
                            const want = shouldRoute ? track : null;
                            if (peer.audioSender.track !== want) {
                                try { peer.audioSender.replaceTrack(want).catch(() => {}); } catch (e) {}
                            }
                        }
                        if (peer.audioEl) {
                            peer.audioEl.muted = !shouldRoute;
                            if (shouldRoute) { const p = peer.audioEl.play(); if (p && p.catch) p.catch(() => {}); }
                        }
                        if (typeof ModuleMusicShare !== 'undefined') { ModuleMusicShare.setGain(peer, 'voice', shouldRoute); ModuleMusicShare.routePeer(peer, sameRoom); }
                    });
                },
});
