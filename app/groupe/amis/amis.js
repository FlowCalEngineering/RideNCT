// Amis et demandes d'amis
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                saveFriendsData() {
                    const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('[Amis] stockage plein', k); } };
                    put('motoapp_friends', this.state.friends); put('motoapp_friend_reqs', this.state.friendReqs);
                    put('motoapp_pending_removals', this.state.pendingRemovals || []); put('motoapp_pending_requests', this.state.pendingRequests || []);
                    put('motoapp_pending_accepts', this.state.pendingAccepts || []); put('motoapp_sent_requests', this.state.sentRequests || []);
                    this.renderLists();
                },
                // Mémoire des demandes d'ami envoyées : une confirmation « friend_accept » n'est acceptée que d'un motard à qui on a vraiment écrit
                markAsked(id) {
                    if (!Array.isArray(this.state.sentRequests)) this.state.sentRequests = AppStore.arr('motoapp_sent_requests');
                    this.state.sentRequests = this.state.sentRequests.filter(x => x !== id); this.state.sentRequests.push(id); this.state.sentRequests = this.state.sentRequests.slice(-100);
                },
                friendWasAsked(id) {
                    if (!Array.isArray(this.state.sentRequests)) this.state.sentRequests = AppStore.arr('motoapp_sent_requests');
                    return this.state.sentRequests.includes(id);
                },
                isFriend(id) {
                    return this.state.friends.some(f => f.id === id);
                },
                async sendFriendRequest(targetId) {
                    const iconInfo = `<svg style="width:26px;height:26px;color:var(--text-main)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
                    const iconSuccess = `<svg style="width:26px;height:26px;color:#30d158" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
                    const iconWarn = `<svg style="width:26px;height:26px;color:#ff9f0a" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
                    
                    if (this.state.friends.some(f => f.id === targetId)) { 
                        this.showNotification("Déjà amis", "Tu es déjà ami avec ce motard.", iconInfo);
                        return; 
                    }
                    if (!this.state.profilePayload) await this.publishProfile(true, null);
                    
                    // 🟢 Mise en file d'attente
                    if (!this.state.pendingRequests) this.state.pendingRequests = [];
                    if (!this.state.pendingRequests.includes(targetId)) this.state.pendingRequests.push(targetId);
                    this.markAsked(targetId);
                    this.saveFriendsData();
                    
                    // 🟢 Envoi P2P immédiat si détecté à proximité sur le radar
                    const rider = this.state.riders.get(targetId);
                    if (rider && rider.near) {
                        const peer = this.state.peers.get(rider.sid);
                        if (peer) {
                            this.sendTo(peer, { type: 'friend_req', profile: this.state.profilePayload });
                            this.state.pendingRequests = this.state.pendingRequests.filter(id => id !== targetId);
                            this.saveFriendsData();
                            this.showNotification("Demande envoyée", "Ta demande d'ami a bien été expédiée via le radar.", iconSuccess);
                            return;
                        }
                    }
                    
                    this.showNotification("Mise en attente", "Motard hors de portée. La demande partira automatiquement dès qu'il sera à proximité !", iconWarn);
                },
});
