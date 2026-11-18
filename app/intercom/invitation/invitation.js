// Invitations : envoi et réception
// Étend ModuleIntercom (défini dans intercom/intercom.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleIntercom, {
                showInviteHud() {
                    const existing = document.getElementById('intercom-invite-hud-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'intercom-invite-hud-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s; padding: 20px;";

                    let riders = [];
                    if (typeof ModuleCommunity !== 'undefined' && ModuleCommunity.nearRiders) riders = ModuleCommunity.nearRiders();

                    let ridersHtml = '';
                    if (riders.length === 0) {
                        ridersHtml = `<div style="text-align: center; color: var(--text-muted); padding: 30px 10px; font-size: 0.9rem;">Radar vide. Aucun motard avec l'app détecté à proximité.</div>`;
                    } else {
                        riders.forEach(r => {
                            const prof = ModuleCommunity.state.profiles.get(r.id);
                            const name = (prof && prof.name) || r.name;
                            const initial = ModuleCommunity.esc(name.charAt(0).toUpperCase());
                            
                            ridersHtml += `
                                <div style="display:flex; align-items:center; justify-content:space-between; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 16px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.05);">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--accent-color); color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1rem; ${prof && prof.avatar ? `background-image:url('${prof.avatar}'); background-size:cover;` : ''}">${prof && prof.avatar ? '' : initial}</div>
                                        <div>
                                            <div style="font-weight: 900; color: var(--text-main); font-size: 0.95rem;">${ModuleCommunity.esc(name)}</div>
                                            <div style="font-size: 0.7rem; color: #30d158; font-weight: 800;">À ${(r.dist / 1000).toFixed(1)} km</div>
                                        </div>
                                    </div>
                                    <button class="btn btn-hud-action-invite" data-id="${ModuleCommunity.esc(r.id)}" style="background: #0a84ff; color: white; border: none; padding: 8px 14px; border-radius: 12px; font-weight: 900; font-size: 0.75rem; cursor: pointer;">Inviter</button>
                                </div>
                            `;
                        });
                    }

                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 340px; padding: 20px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); max-height: 85vh; display: flex; flex-direction: column;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                                <h3 style="color: var(--text-main); font-size: 1.2rem; margin: 0; font-weight: 900;">Radar Intercom <svg class="vi" viewBox="0 0 24 24" style="width:20px;height:20px;color:var(--accent-color);"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/></svg></h3>
                                <button id="btn-close-hud" style="background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; padding: 0; display: flex;"><svg class="vi" viewBox="0 0 24 24" style="width:24px;height:24px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                            </div>
                            <div style="overflow-y: auto; flex: 1; margin-bottom: 20px; padding-right: 5px;">
                                ${ridersHtml}
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; }, 10);

                    const closeOverlay = () => { overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)'; setTimeout(() => overlay.remove(), 300); };
                    document.getElementById('btn-close-hud').addEventListener('click', closeOverlay);

                    document.querySelectorAll('.btn-hud-action-invite').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const targetId = e.currentTarget.getAttribute('data-id');
                            this.api.sendInvite(targetId, this.state.currentRoomName, this.state.currentCode);
                            e.currentTarget.textContent = "Envoyé ✓"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.disabled = true;
                        });
                    });
                },
                receiveInvite(senderName, roomName, roomCode, avatarSrc = null, extra = null) {
                    // Valeurs venues d'un autre téléphone : on ne leur fait jamais confiance
                    const C = (typeof ModuleCommunity !== 'undefined') ? ModuleCommunity : null;
                    senderName = (C ? C.cleanText(senderName, 40) : String(senderName || '').slice(0, 40)) || 'Un motard';
                    roomName = (C ? C.cleanText(roomName, 40) : String(roomName || '').slice(0, 40)) || 'Groupe';
                    roomCode = C ? C.cleanCode(roomCode) : String(roomCode || '').replace(/[^\w-]/g, '').slice(0, 24);
                    avatarSrc = C ? C.sanitizeImg(avatarSrc) : null;
                    if (!roomCode) return;
                    // Une seule invitation par groupe et par motard, 10 au maximum (pas de pluie d'invitations)
                    this.state.receivedInvites = this.state.receivedInvites.filter(i => !(i.roomCode === roomCode && i.senderName === senderName));
                    if (this.state.receivedInvites.length >= 10) this.state.receivedInvites.shift();
                    const id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
                    const pin = (extra && /^\d{4}$/.test(String(extra.pin || ''))) ? String(extra.pin) : null;
                    const from = (extra && typeof extra.from === 'string' && /^[a-f0-9]{16}$/.test(extra.from)) ? extra.from : null;
                    this.state.receivedInvites.push({ id, senderName, roomName, roomCode, avatarSrc, time: Date.now(), pin, from, isPrivate: !(extra && extra.isPrivate === false) });
                    
                    const tabBtn = document.querySelector('.intercom-tab-btn[data-sub="sub-intercom-invites"]');
                    if (tabBtn && !tabBtn.classList.contains('active')) {
                        tabBtn.style.color = "#0a84ff";
                        if (typeof ModuleCommunity !== 'undefined') {
                            ModuleCommunity.showNotification(
                                "Nouvelle invitation", 
                                `${senderName} t'invite dans le canal "${roomName}".`,
                                `<svg style="width:26px;height:26px;color:#0a84ff" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4z"></path><path d="M3 19a2 2 0 0 0 2 2h1v-6H3v4z"></path></svg>`
                            );
                        }
                    }
                    
                    if (tabBtn && tabBtn.classList.contains('active')) {
                        this.renderReceivedInvites();
                    }
                },
                renderReceivedInvites() {
                    const listEl = document.getElementById('intercom-received-invites-list');
                    if (this.state.receivedInvites.length === 0) {
                        listEl.innerHTML = `<div class="comm-empty" style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:20px 10px;">Aucune invitation en attente.</div>`;
                        return;
                    }

                    listEl.innerHTML = '';
                    const sorted = [...this.state.receivedInvites].sort((a, b) => b.time - a.time);
                    const IC = { mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4zM3 19a2 2 0 0 0 2 2h1v-6H3v4z"></path></svg>', no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' };
                    const h = document.createElement('div'); h.className = 'rq-h'; h.innerHTML = `<span>Canaux intercom</span><b>${sorted.length}</b>`; listEl.appendChild(h);

                    sorted.forEach(inv => {
                        const row = document.createElement('div');
                        row.className = 'rq-card';
                        row.innerHTML = `<div class="rq-t">Invitation de ${ModuleCommunity.esc(inv.senderName || 'un motard')}</div><div class="rq-s">Canal « ${ModuleCommunity.esc(inv.roomName || '')} »</div>
                            <div class="rq-b"><button type="button" class="rq-btn main btn-action-accept" data-id="${ModuleCommunity.esc(inv.id)}"><span>${IC.mic}Rejoindre</span></button><button type="button" class="rq-btn btn-action-decline" data-id="${ModuleCommunity.esc(inv.id)}"><span>${IC.no}Ignorer</span></button></div>`;
                        listEl.appendChild(row);
                    });

                    document.querySelectorAll('.btn-action-accept').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const invId = Number(e.currentTarget.getAttribute('data-id'));
                            const inv = this.state.receivedInvites.find(i => i.id === invId);
                            if (inv) {
                                this.state.receivedInvites = this.state.receivedInvites.filter(i => i.id !== invId);
                                this.renderReceivedInvites();
                                this.connectToRoom(inv.roomName, 'Invité', inv.roomCode, inv.isPrivate !== false, { pin: inv.pin, allowed: inv.from ? [inv.from] : [] });
                            }
                        });
                    });

                    document.querySelectorAll('.btn-action-decline').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const invId = Number(e.currentTarget.getAttribute('data-id'));
                            this.state.receivedInvites = this.state.receivedInvites.filter(i => i.id !== invId);
                            this.renderReceivedInvites();
                        });
                    });
                },
});
