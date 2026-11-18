// Mode Rencontre : motards proches connectés automatiquement
// Étend ModuleIntercom (défini dans intercom/intercom.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleIntercom, {
                // NOUVEAU : Affiche les motards connectés en Mode Rencontre
                renderAutoParticipants() {
                    const container = document.getElementById('intercom-auto-participants');
                    if (!container || !this.state.autoModeActive) return;
                    
                    container.innerHTML = '';
                    if (typeof ModuleCommunity === 'undefined') return;
                    
                    let count = 0;
                    ModuleCommunity.state.peers.forEach(peer => {
                        // Si le motard a aussi activé le Mode Rencontre
                        if (peer.autoIntercom && peer.rid) {
                            count++;
                            const rider = ModuleCommunity.state.riders.get(peer.rid);
                            const name = rider ? rider.name : "Motard";
                            const prof = ModuleCommunity.state.profiles.get(peer.rid);
                            const avatar = prof ? prof.avatar : null;
                            const initial = ModuleCommunity.esc(name.charAt(0).toUpperCase());
                            
                            const div = document.createElement('div');
                            div.className = 'participant-card';
                            div.innerHTML = `
                                <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--surface-color); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.2rem; border: 2px solid #30d158; ${avatar ? `background-image:url('${avatar}'); background-size:cover;` : ''}">${avatar ? '' : initial}</div>
                                <span style="font-size: 0.65rem; color: var(--text-main); font-weight: 700; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ModuleCommunity.esc(name)}</span>
                            `;
                            
                            // On réutilise ton popup de volume !
                            div.addEventListener('click', () => {
                                if (typeof this.showVolumeHud === 'function') {
                                    this.showVolumeHud(peer.rid, name, avatar);
                                }
                            });
                            container.appendChild(div);
                        }
                    });
                    
                    if (count === 0) {
                        container.innerHTML = `<div style="width: 100%; text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 10px 0;">Recherche de motards à proximité...</div>`;
                    }
                },
});
