
            const ModuleProfile = {
                state: {
                    name: "Pilote Inconnu",
                    avatar: null,
                    bio: "",      
                    social: [],   
                    ridingStyle: "", 
                    motos: []
                },
                init() {
                    document.addEventListener('auth:status', () => this.paintAcct());
                    document.addEventListener('auth:update', () => { const n = this.accountName(); if (n && n !== this.state.name) { this.state.name = n; try { localStorage.setItem('motoapp_profile_name', n); } catch (e) {} this.updateUI(); } });
                    this.loadData();
                    this.bindEvents();
                    this.updateUI();
                    
                    document.querySelector('.nav-btn[data-target="view-profile"]').addEventListener('click', () => {
                        this.updateStats();
                    });
                },
                // Le nom du profil est le pseudo du compte (source unique) ; sans pseudo de compte, on garde le nom saisi localement
                // Pastille d'état du compte (Actif / Banni / Inactif) sous le pseudo
    paintAcct() { const el = document.getElementById('profile-acct'); if (!el || typeof AppAuth === 'undefined' || !AppAuth.cached) return; el.innerHTML = AppAuth.statusPill(AppAuth.cached()); const bd = document.getElementById('profile-av-badge'); if (bd) bd.innerHTML = AppAuth.statusBadge(AppAuth.cached()); },
        accountName() { try { return (typeof AppAuth !== 'undefined' && AppAuth.user() && AppAuth.user().username) || ''; } catch (e) { return ''; } },
                loadData() {
                    const savedName = localStorage.getItem('motoapp_profile_name');
                    if (savedName) this.state.name = savedName;
                    if (this.accountName()) this.state.name = this.accountName();
                    
                    const savedAvatar = localStorage.getItem('motoapp_profile_avatar');
                    if (savedAvatar) this.state.avatar = savedAvatar;

                    const savedBio = localStorage.getItem('motoapp_profile_bio');
                    if (savedBio !== null) this.state.bio = savedBio;

                    const savedStyle = localStorage.getItem('motoapp_profile_riding_style');
                    if (savedStyle !== null) this.state.ridingStyle = savedStyle;

                    const savedSocial = localStorage.getItem('motoapp_profile_social');
                    if (savedSocial) {
                        try {
                            const parsed = JSON.parse(savedSocial);
                            this.state.social = Array.isArray(parsed) ? parsed.filter(x => x && typeof x === 'object').map(x => ({ platform: String(x.platform == null ? 'Lien' : x.platform).slice(0, 20), handle: String(x.handle == null ? '' : x.handle).slice(0, 60) })) : [];
                        } catch (e) {
                            this.state.social = [{ platform: 'Instagram', handle: savedSocial }];
                        }
                    }
                    
                    const savedMotos = localStorage.getItem('motoapp_profile_motos');
                    if (savedMotos) { try { const m = JSON.parse(savedMotos); this.state.motos = Array.isArray(m) ? m.filter(x => x && typeof x === 'object') : []; } catch (e) { this.state.motos = []; } }
                },
                saveData() {
                    // Chaque champ est enregistré séparément : si le stockage est plein, une photo trop lourde ne fait pas perdre le reste
                    const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
                    put('motoapp_profile_name', this.state.name); put('motoapp_profile_bio', this.state.bio); put('motoapp_profile_riding_style', this.state.ridingStyle);
                    put('motoapp_profile_social', JSON.stringify(this.state.social));
                    const a = put('motoapp_profile_avatar', this.state.avatar || ''), m = put('motoapp_profile_motos', JSON.stringify(this.state.motos));
                    if ((!a || !m) && typeof AppDialog !== 'undefined') { try { AppDialog.alert('Stockage de l\'appareil plein : la photo ou la moto n\'a pas pu être enregistrée.\n\nSupprime d\'anciens trajets ou des cartes hors ligne, puis réessaie.', { title: 'Enregistrement impossible' }); } catch (e) {} }
                },

                compressImage(file, maxWidth, callback) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;
                            
                            if (width > maxWidth) {
                                height = Math.round(height * (maxWidth / width));
                                width = maxWidth;
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            callback(canvas.toDataURL('image/jpeg', 0.7));
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                },

                bindEvents() {
                    document.getElementById('btn-edit-profile').addEventListener('click', () => {
                        this.showEditProfileModal();
                    });
                    
                    document.getElementById('btn-add-moto').addEventListener('click', () => {
                        if (this.state.motos.length >= 1 && typeof AppSub !== 'undefined' && !AppSub.gate()) return;   // gratuit : 1 moto
                        this.showAddMotoModal();
                    });
                },
                
                updateUI() {
                    if (typeof ModuleMaintenance !== 'undefined') { try { ModuleMaintenance.onGarageChanged(); } catch (e) { console.error(e); } }
                    document.getElementById('profile-name').textContent = this.state.name;
                    this.paintAcct();
                    
                    let styleEl = document.getElementById('profile-riding-style');
                    if (!styleEl) {
                        styleEl = document.createElement('div');
                        styleEl.id = 'profile-riding-style';
                        styleEl.style.cssText = "background: rgba(255,255,255,0.05); color: var(--text-main); padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.05); margin-bottom: 12px;";
                        
                        const bioNode = document.getElementById('profile-bio');
                        if (bioNode && bioNode.parentNode) {
                            bioNode.parentNode.insertBefore(styleEl, bioNode);
                        }
                    }
                    
                    if (this.state.ridingStyle) {
                        const svgBase = 'style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24"';
                        let styleIcon = `<svg ${svgBase}><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>`; 
                        
                        if (this.state.ridingStyle === 'Ligne droite') styleIcon = `<svg ${svgBase}><line x1="12" y1="22" x2="12" y2="2"></line><polyline points="5 9 12 2 19 9"></polyline></svg>`;
                        else if (this.state.ridingStyle === 'Pif Paf') styleIcon = `<svg ${svgBase}><path d="M8 22c0-8 8-4 8-12S8 4 8 2"></path></svg>`;
                        else if (this.state.ridingStyle === 'Ville') styleIcon = `<svg ${svgBase}><rect x="4" y="2" width="6" height="20"></rect><rect x="14" y="8" width="6" height="14"></rect><path d="M2 22h20"></path></svg>`;
                        else if (this.state.ridingStyle === 'Roadtrip') styleIcon = `<svg ${svgBase}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>`;
                        else if (this.state.ridingStyle === 'Enduro') styleIcon = `<svg ${svgBase}><path d="M8 3l4 8 5-5 5 15H2L8 3z"></path></svg>`;
                        else if (this.state.ridingStyle === 'Cross') styleIcon = `<svg ${svgBase}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`;
                        else if (this.state.ridingStyle === 'Pistard') styleIcon = `<svg ${svgBase}><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

                        styleEl.innerHTML = `<span style="display: flex; align-items: center; color: var(--accent-color);">${styleIcon}</span> <span>${this.state.ridingStyle}</span>`;
                        styleEl.style.display = 'inline-flex';
                    } else {
                        styleEl.style.display = 'none';
                    }

                    const bioEl = document.getElementById('profile-bio');
                    if (this.state.bio) {
                        bioEl.textContent = `"${this.state.bio}"`;
                        bioEl.style.display = 'block';
                    } else {
                        bioEl.style.display = 'none';
                    }

                    const socialEl = document.getElementById('profile-social');
                    if (this.state.social && this.state.social.length > 0) {
                        socialEl.innerHTML = '';
                        socialEl.style.display = 'flex';
                        socialEl.style.flexWrap = 'wrap';
                        socialEl.style.gap = '8px';
                        socialEl.style.marginTop = '6px';
                        
                        const svgBase = 'style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;" viewBox="0 0 24 24"';
                        
                        this.state.social.forEach(soc => {
                            const handle = soc.handle.startsWith('@') ? soc.handle : '@' + soc.handle;
                            let iconSvg = `<svg ${svgBase}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`; 
                            
                            if (soc.platform === 'Instagram') iconSvg = `<svg ${svgBase}><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;
                            else if (soc.platform === 'TikTok') iconSvg = `<svg ${svgBase}><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path></svg>`;
                            else if (soc.platform === 'Facebook') iconSvg = `<svg ${svgBase}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>`;
                            else if (soc.platform === 'YouTube') iconSvg = `<svg ${svgBase}><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg>`;
                            else if (soc.platform === 'X') iconSvg = `<svg ${svgBase}><line x1="4" y1="4" x2="20" y2="20"></line><line x1="20" y1="4" x2="4" y2="20"></line></svg>`;
                            else if (soc.platform === 'Snapchat') iconSvg = `<svg ${svgBase}><path d="M9 10h.01"></path><path d="M15 10h.01"></path><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"></path></svg>`;

                            const badge = document.createElement('div');
                            badge.style.cssText = "background: rgba(255,255,255,0.05); color: var(--text-main); padding: 6px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; border: 1px solid rgba(255,255,255,0.05);";
                            badge.innerHTML = `<span style="display: flex; align-items: center; color: var(--accent-color);">${iconSvg}</span> <span>${handle}</span>`;
                            socialEl.appendChild(badge);
                        });
                    } else {
                        socialEl.style.display = 'none';
                    }

                    const avatarEl = document.getElementById('profile-avatar');
                    if (this.state.avatar) {
                        avatarEl.style.backgroundImage = `url(${this.state.avatar})`;
                        avatarEl.style.backgroundSize = 'cover';
                        avatarEl.style.backgroundPosition = 'center';
                        avatarEl.textContent = '';
                    } else {
                        avatarEl.style.backgroundImage = 'none';
                        avatarEl.textContent = this.state.name.charAt(0).toUpperCase();
                    }
                    
                    const container = document.getElementById('moto-list-container');
                    container.innerHTML = "";
                    
                    this.state.motos.forEach((moto, index) => {
                        const div = document.createElement('div');
                        div.style.cssText = "background: var(--active-bg); padding: 12px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; cursor: pointer; user-select: none; -webkit-user-select: none;";
                        
                        let photoHtml = moto.photo 
                            ? `<div style="width: 60px; height: 60px; border-radius: 12px; background-image: url(${moto.photo}); background-size: cover; background-position: center; flex-shrink: 0;"></div>`
                            : `<div style="width: 60px; height: 60px; border-radius: 12px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0;">${VI.bike30}</div>`;
                        
                        // Infos en pastilles-icônes (type, année, cylindrée, km, moteur)
                        const chip = (ico, txt, title, accent, big) => `<span title="${title}" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 6px;border-radius:12px;background:${accent ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)'};font-size:0.72rem;font-weight:700;color:${accent ? 'var(--accent-color)' : 'var(--text-muted)'};white-space:nowrap;"><svg viewBox="0 0 24 24" style="width:${big ? 22 : 15}px;height:${big ? 22 : 15}px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;">${ico}</svg>${txt}</span>`;
                        const ICO = {
                            cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
                            cc: '<path d="M12 3a9 9 0 0 0-9 9h3"/><path d="M12 3a9 9 0 0 1 9 9"/><path d="M12 13l4-5"/><circle cx="12" cy="13" r="1.5"/>',
                            km: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h8"/>',
                            m2T: '<path d="M4 14l4-9 4 9"/><path d="M14 14h6"/><path d="M5 19h14"/>',
                            m4T: '<rect x="5" y="4" width="14" height="10" rx="2"/><path d="M9 14v5M15 14v5M5 19h14"/>',
                            elec: '<polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2"/>',
                            cyl: '<rect x="4" y="9" width="4" height="9" rx="1"/><rect x="10" y="9" width="4" height="9" rx="1"/><rect x="16" y="9" width="4" height="9" rx="1"/><path d="M6 5v4M12 5v4M18 5v4"/>'
                        };
                        const tile = (inner, bg) => `<div title="${moto.type || ''}" style="width: 72px; height: 72px; border-radius: 14px; background: ${bg}; display: flex; align-items: center; justify-content: center; color: var(--accent-color); flex-shrink: 0; position: relative;">${inner}</div>`;
                        photoHtml = moto.photo
                            ? `<div style="position:relative;flex-shrink:0;"><div style="width: 72px; height: 72px; border-radius: 14px; background-image: url(${moto.photo}); background-size: cover; background-position: center;"></div><div style="position:absolute;right:-4px;bottom:-4px;width:34px;height:26px;border-radius:9px;background:var(--surface-color);color:var(--accent-color);display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.1);">${this.typeIcon(moto.type, 26)}</div></div>`
                            : tile(this.typeIcon(moto.type, 58), 'rgba(255,255,255,0.05)');
                        let chips = chip(ICO.cal, moto.annee, 'Année');
                        if (moto.cylindree) chips += chip(ICO.cc, `${moto.cylindree}<small style="opacity:.7;font-weight:600;"> cm³</small>`, 'Cylindrée');
                        chips += chip(ICO.km, `${moto.km}<small style="opacity:.7;font-weight:600;"> km</small>`, 'Kilométrage');
                        if (moto.moteur) chips += chip(moto.moteur === '2T' ? ICO.m2T : moto.moteur === '4T' ? ICO.m4T : ICO.elec, moto.moteur === 'Électrique' ? '' : moto.moteur, 'Moteur ' + moto.moteur, true);
                        if (moto.cylindres) chips += chip(ICO.cyl, moto.cylindres, 'Cylindres');
                        const optStr = '';
                        const subtitleStr = `<div style="display:flex;flex-wrap:wrap;gap:5px;">${chips}</div>`;

                        div.innerHTML = `
                            ${photoHtml}
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-weight: 900; color: var(--text-main); font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(moto.marque)} ${escHtml(moto.modele)}</div>
                                <div style="margin-top: 6px;">${subtitleStr}</div>
                                ${optStr}
                            </div>
                        `;
                        container.appendChild(div);

                        let pressTimer;
                        let isLongPress = false;

                        const startPress = (e) => {
                            if (e.type === 'touchstart' && e.touches && e.touches.length > 1) return;
                            isLongPress = false;
                            div.style.transform = "scale(0.98)"; 
                            div.style.transition = "transform 0.2s";
                            
                            pressTimer = setTimeout(() => {
                                isLongPress = true;
                                div.style.transform = "scale(1)";
                                this.showMotoOptionsHud(index, moto); 
                            }, 500); 
                        };

                        const cancelPress = () => { clearTimeout(pressTimer); div.style.transform = "scale(1)"; };
                        const handleAction = (e) => {
                            cancelPress();
                            if (isLongPress) { e.preventDefault(); return; }
                            this.showEditMotoModal(index, moto); 
                        };

                        div.addEventListener('mousedown', startPress);
                        div.addEventListener('touchstart', startPress, {passive: true});
                        div.addEventListener('mouseup', cancelPress);
                        div.addEventListener('mouseleave', cancelPress);
                        div.addEventListener('touchmove', cancelPress, {passive: true});
                        div.addEventListener('touchend', cancelPress);
                        div.addEventListener('click', handleAction);
                    });
                    
                    this.updateStats();
                },
                
                updateStats() {
                    const recordedRides = AppStore.get('moto_recorded_rides', []);
                    let totalKm = 0;
                    recordedRides.forEach(ride => { totalKm += parseFloat(ride.dist) || 0; });
                    document.getElementById('stat-rides').textContent = recordedRides.length;
                    document.getElementById('stat-distance').textContent = totalKm % 1 === 0 ? totalKm : totalKm.toFixed(1);
                },

                showEditProfileModal() {
                    const existing = document.getElementById('profile-hud-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'profile-hud-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: var(--bg-color); z-index: 9999; display: flex; flex-direction: column; opacity: 0; transition: opacity 0.2s; overflow-y: auto;";
                    
                    let tempAvatar = this.state.avatar;
                    let tempSocials = JSON.parse(JSON.stringify(this.state.social));

                    overlay.innerHTML = `
                        <div style="padding: 20px; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color); position: sticky; top: 0; z-index: 10; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                            <h3 style="color: var(--text-main); font-size: 1.4rem; font-weight: 900; margin: 0;">Modifier le profil</h3>
                            <button id="hud-btn-cancel" style="background: none; border: none; color: var(--text-muted); font-size: 2rem; cursor: pointer; padding: 0 10px; display: flex; align-items: center;">${VI.x}</button>
                        </div>
                        
                        <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px; padding-bottom: 120px;">
                            
                            <div style="position: relative; width: 100px; height: 100px; margin: 0 auto;">
                                <div id="modal-avatar-preview" style="width: 100%; height: 100%; background-color: var(--accent-color); color: var(--on-accent); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: 900; background-size: cover; background-position: center;">
                                    ${tempAvatar ? '' : this.state.name.charAt(0).toUpperCase()}
                                </div>
                                <button id="btn-upload-avatar" style="position: absolute; bottom: 0; right: 0; background: var(--surface-color); color: var(--text-main); border: 2px solid rgba(255,255,255,0.1); border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1rem; padding: 0;"><svg class="vi" viewBox="0 0 24 24" style="width:18px;height:18px;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
                                <input type="file" id="input-avatar-file" accept="image/*" style="display: none;">
                            </div>

                            <input type="text" id="input-profile-name" value="${escHtml(this.accountName() || this.state.name)}" placeholder="Votre pseudo" ${this.accountName() ? 'readonly aria-readonly="true"' : ''} style="${this.accountName() ? 'opacity:.75;' : ''}width: 100%; padding: 22px; background: var(--surface-color); border: none; border-radius: 16px; color: var(--text-main); font-size: 1.2rem; font-weight: 700; outline: none; text-align: center;">
                            
                            ${this.accountName() ? '<div style="margin-top:-8px;text-align:center;font-size:.78rem;color:var(--text-muted);">Ton pseudo est celui de ton compte.</div>' : ''}
                            <select id="input-profile-style" style="width: 100%; padding: 22px; background: var(--surface-color); border: none; border-radius: 16px; color: ${this.state.ridingStyle ? 'var(--text-main)' : 'var(--text-muted)'}; font-size: 1.1rem; font-weight: 700; outline: none; appearance: none; text-align: center;">
                                <option value="" ${!this.state.ridingStyle ? 'selected' : ''}>Style de conduite (Optionnel)</option>
                                <option value="Ligne droite" ${this.state.ridingStyle === 'Ligne droite' ? 'selected' : ''}>Ligne droite</option>
                                <option value="Pif Paf" ${this.state.ridingStyle === 'Pif Paf' ? 'selected' : ''}>Pif Paf (Virages)</option>
                                <option value="Ville" ${this.state.ridingStyle === 'Ville' ? 'selected' : ''}>Ville</option>
                                <option value="Roadtrip" ${this.state.ridingStyle === 'Roadtrip' ? 'selected' : ''}>Roadtrip</option>
                                <option value="Enduro" ${this.state.ridingStyle === 'Enduro' ? 'selected' : ''}>Enduro</option>
                                <option value="Cross" ${this.state.ridingStyle === 'Cross' ? 'selected' : ''}>Cross</option>
                                <option value="Pistard" ${this.state.ridingStyle === 'Pistard' ? 'selected' : ''}>Pistard</option>
                                <option value="Autre" ${this.state.ridingStyle === 'Autre' ? 'selected' : ''}>Autre</option>
                            </select>

                            <textarea id="input-profile-bio" placeholder="Petite bio (ex: Toujours prêt pour une balade !)" rows="3" style="width: 100%; padding: 22px; background: var(--surface-color); border: none; border-radius: 16px; color: var(--text-main); font-size: 1.1rem; outline: none; resize: none; font-family: inherit;">${this.state.bio}</textarea>

                            <div style="margin-top: 10px;">
                                <div style="font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; font-weight: 700;">Réseaux Sociaux</div>
                                <div id="modal-socials-list" style="display: flex; flex-direction: column; gap: 15px;"></div>
                                <button id="btn-add-social" class="btn" style="width: 100%; margin-top: 15px; background: rgba(255,255,255,0.05); color: var(--text-main); padding: 18px; border-radius: 16px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 10px;">+ Ajouter un réseau social</button>
                            </div>
                        </div>

                        <div style="position: fixed; bottom: 0; left: 0; width: 100%; padding: 20px; background: linear-gradient(transparent, var(--bg-color) 40%); z-index: 10;">
                            <button id="hud-btn-save" class="btn" style="width: 100%; background: var(--accent-color); color: var(--on-accent); padding: 22px; border-radius: 40px; font-weight: 900; font-size: 1.2rem; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">Enregistrer le profil</button>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    
                    if (tempAvatar) {
                        document.getElementById('modal-avatar-preview').style.backgroundImage = `url(${tempAvatar})`;
                    }

                    setTimeout(() => { overlay.style.opacity = '1'; }, 10);

                    const closeHud = () => {
                        overlay.style.opacity = '0';
                        setTimeout(() => overlay.remove(), 200);
                    };

                    const renderSocials = () => {
                        const list = document.getElementById('modal-socials-list');
                        list.innerHTML = '';
                        tempSocials.forEach((soc, idx) => {
                            const row = document.createElement('div');
                            row.style.display = 'flex';
                            row.style.gap = '10px';
                            row.innerHTML = `
                                <select class="social-platform" data-index="${idx}" style="flex: 1; padding: 18px; background: var(--surface-color); border: none; border-radius: 16px; color: var(--text-main); font-size: 1rem; font-weight: 700; outline: none; appearance: none;">
                                    <option value="Instagram" ${soc.platform === 'Instagram' ? 'selected' : ''}>Insta</option>
                                    <option value="TikTok" ${soc.platform === 'TikTok' ? 'selected' : ''}>TikTok</option>
                                    <option value="Facebook" ${soc.platform === 'Facebook' ? 'selected' : ''}>Facebk</option>
                                    <option value="YouTube" ${soc.platform === 'YouTube' ? 'selected' : ''}>▶️ YouTube</option>
                                    <option value="X" ${soc.platform === 'X' ? 'selected' : ''}>X</option>
                                    <option value="Snapchat" ${soc.platform === 'Snapchat' ? 'selected' : ''}>Snap</option>
                                </select>
                                <input type="text" class="social-handle" data-index="${idx}" value="${soc.handle}" placeholder="@pseudo" style="flex: 1.5; padding: 18px; background: var(--surface-color); border: none; border-radius: 16px; color: var(--text-main); font-size: 1rem; outline: none;">
                                <button class="btn-remove-social" data-index="${idx}" style="background: none; border: none; color: var(--danger-color); font-size: 1.5rem; padding: 0 10px; cursor: pointer; display: flex; align-items: center;">${VI.x}</button>
                            `;
                            list.appendChild(row);
                        });

                        document.querySelectorAll('.social-platform').forEach(sel => {
                            sel.addEventListener('change', (e) => { tempSocials[e.target.dataset.index].platform = e.target.value; });
                        });
                        document.querySelectorAll('.social-handle').forEach(inp => {
                            inp.addEventListener('input', (e) => { tempSocials[e.target.dataset.index].handle = e.target.value; });
                        });
                        document.querySelectorAll('.btn-remove-social').forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                tempSocials.splice(e.target.dataset.index, 1);
                                renderSocials();
                            });
                        });
                    };

                    renderSocials();

                    document.getElementById('btn-add-social').addEventListener('click', () => {
                        tempSocials.push({ platform: 'Instagram', handle: '' });
                        renderSocials();
                    });
                    
                    const styleInputEl = document.getElementById('input-profile-style');
                    if (styleInputEl) {
                        styleInputEl.addEventListener('change', function() {
                            this.style.color = this.value === "" ? "var(--text-muted)" : "var(--text-main)";
                        });
                    }

                    document.getElementById('btn-upload-avatar').addEventListener('click', () => { document.getElementById('input-avatar-file').click(); });
                    document.getElementById('input-avatar-file').addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            this.compressImage(file, 400, (compressedBase64) => {
                                tempAvatar = compressedBase64;
                                const preview = document.getElementById('modal-avatar-preview');
                                preview.style.backgroundImage = `url(${tempAvatar})`;
                                preview.textContent = "";
                            });
                        }
                    });

                    document.getElementById('hud-btn-cancel').addEventListener('click', closeHud);
                    
                    document.getElementById('hud-btn-save').addEventListener('click', () => {
                        const nameEl = document.getElementById('input-profile-name');
                        const bioEl = document.getElementById('input-profile-bio');
                        const styleEl = document.getElementById('input-profile-style');
                        
                        const newName = nameEl ? nameEl.value : "";
                        const newBio = bioEl ? bioEl.value : "";
                        const newStyle = styleEl ? styleEl.value : "";

                        this.state.name = this.accountName() || ((newName && newName.trim() !== "") ? newName.trim() : "Pilote Inconnu");
                        this.state.bio = newBio.trim();
                        this.state.ridingStyle = newStyle;
                        this.state.avatar = tempAvatar;
                        this.state.social = tempSocials.filter(s => s && s.handle && s.handle.trim() !== '');
                        
                        this.saveData();
                        this.updateUI();
                        
                        closeHud();
                    });
                },

                showMotoOptionsHud(index, moto) {
                    const existing = document.getElementById('profile-hud-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'profile-hud-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; padding: 20px;";
                    
                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 25px; text-align: center; transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                            <h3 style="color: var(--text-main); font-size: 1.1rem; margin-bottom: 5px;">${escHtml(moto.marque)} ${escHtml(moto.modele)}</h3>
                            <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 25px;">Que souhaitez-vous faire ?</p>
                            
                            <div style="display: flex; flex-direction: column; gap: 12px;">
                                <button id="hud-btn-edit" class="btn" style="background: var(--accent-color); color: var(--on-accent); padding: 18px; border-radius: 16px; font-weight: 800;">Modifier</button>
                                <button id="hud-btn-atelier" class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-main); padding: 18px; border-radius: 16px; font-weight: 800;">Ouvrir dans l'Atelier</button>
                                <button id="hud-btn-delete" class="btn" style="background: rgba(255,69,58,0.1); color: var(--danger-color); padding: 18px; border-radius: 16px; font-weight: 800;">Supprimer</button>
                                <button id="hud-btn-cancel" class="btn" style="background: transparent; color: var(--text-muted); padding: 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); font-weight: 800;">Annuler</button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; }, 10);

                    const closeHud = () => {
                        overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 200);
                    };

                    document.getElementById('hud-btn-edit').addEventListener('click', () => { 
                        closeHud(); 
                        this.showEditMotoModal(index, moto); 
                    });
                    
                    document.getElementById('hud-btn-atelier').addEventListener('click', () => { 
                        closeHud(); 
                        if (typeof ModuleMaintenance !== 'undefined') ModuleMaintenance.selectMotoByIndex(index);
                        if(typeof AppManager !== 'undefined') AppManager.switchView('view-maintenance');
                    });
                    
                    document.getElementById('hud-btn-delete').addEventListener('click', async () => {
                        closeHud();
                        if (await AppDialog.confirm(`Êtes-vous sûr de vouloir supprimer la ${moto.marque} ${moto.modele} de votre garage ?\nSon historique d'entretien sera aussi supprimé.`, { danger: true, okText: 'Supprimer' })) {
                            if (typeof ModuleMaintenance !== 'undefined') { ModuleMaintenance.ensureMotoIds(); ModuleMaintenance.onMotoDeleted(moto); }
                            this.state.motos.splice(index, 1);
                            this.saveData();
                            this.updateUI();
                        }
                    });
                    
                    document.getElementById('hud-btn-cancel').addEventListener('click', closeHud);
                    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeHud(); });
                },

                // Silhouettes de moto vues de profil (une par type) — traits + formes pleines, lisibles même en petit
                typeIcon(type, size) {
                    const C = 'currentColor';
                    const P = (d, o) => `<path d="${d}" fill="${C}"${o ? ` opacity="${o}"` : ''}/>`;
                    const S = (d, w, o) => `<path d="${d}" fill="none" stroke="${C}" stroke-width="${w || 3.2}" stroke-linecap="round" stroke-linejoin="round"${o ? ` opacity="${o}"` : ''}/>`;
                    const wheel = (x, r, knob) => `<circle cx="${x}" cy="36" r="${r}" fill="none" stroke="${C}" stroke-width="4"${knob ? ' stroke-dasharray="3.4 2.2"' : ''}/><circle cx="${x}" cy="36" r="2.4" fill="${C}"/>`;
                    const W = (r, knob) => wheel(14, r, knob) + wheel(66, r, knob);
                    // morceaux communs : bras oscillant, fourche, bloc moteur, selle, phare
                    const swing = S('M14 36L34 31');
                    const fork = (tx, ty) => S(`M66 36L${tx} ${ty}`);
                    const engine = P('M31 24H49l3 10H34z');
                    const seat = (x1, x2, y) => P(`M${x1} ${y}H${x2}v3.5H${x1 + 2}z`);
                    const tank = (x1, x2, y) => P(`M${x1} ${y + 7}Q${x1 + 2} ${y} ${(x1 + x2) / 2} ${y - 1}L${x2} ${y + 2}L${x2 - 3} ${y + 7}z`);
                    const bars = (x, y) => S(`M${x - 2} ${y}L${x + 6} ${y - 3}`);
                    const lamp = (x, y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${C}"/>`;
                    const tail = P('M5 20Q9 17 14 20v3H5z');
                    const road = () => W(11) + swing + fork(56, 14) + engine + tank(28, 50, 17) + seat(12, 30, 22) + tail + bars(55, 13) + lamp(60, 18);
                    const scoot = (r) => `<circle cx="14" cy="38" r="${r}" fill="none" stroke="${C}" stroke-width="4"/><circle cx="66" cy="38" r="${r}" fill="none" stroke="${C}" stroke-width="4"/><circle cx="14" cy="38" r="2" fill="${C}"/><circle cx="66" cy="38" r="2" fill="${C}"/>`;
                    const T = {
                        'Roadster': road(),
                        'Sportive': W(11) + swing + fork(57, 20) + engine + P('M54 12L72 30H52Q50 20 44 18L52 12z') + P('M10 21Q22 14 40 20L42 26H12z') + P('M5 21Q9 18 14 21v3H5z') + S('M52 17L46 17'),
                        'Trail / Adventure': W(12.5) + swing + fork(56, 12) + engine + P('M24 16H46L52 24H26z') + P('M8 20H24V24H8z') + P('M2 12H18V19H2z') + bars(55, 11) + S('M56 10L52 1', 3) + lamp(61, 17),
                        'Enduro / Cross': W(12.5, true) + swing + fork(56, 12) + engine + P('M26 17Q36 12 50 18L48 25H28z') + seat(6, 28, 21) + bars(55, 11) + S('M52 22Q62 12 74 21', 2.6),
                        'Custom': W(11) + swing + S('M66 36L46 12') + P('M30 25H46l2 9H32z') + P('M26 20Q36 14 44 18L42 25H26z') + P('M8 24Q18 20 30 23v4H8z') + S('M40 8Q50 3 58 9') + lamp(52, 15) + P('M3 26Q6 24 9 25L8 32H3z'),
                        'Cruiser': W(11) + swing + S('M66 36L46 14') + P('M30 25H46l2 9H32z') + P('M26 20Q36 14 44 18L42 25H26z') + P('M6 25Q18 20 30 23v4H8z') + S('M38 8Q50 2 58 10') + lamp(51, 17) + P('M4 28Q8 26 12 26L10 34H4z'),
                        'GT / Routière': road() + P('M52 4L62 12L59 15L50 9z', .9) + P('M1 10H16V19H1z'),
                        'Touring': road() + P('M52 3L62 12L59 15L50 8z', .9) + P('M0 7H17V19H0z') + P('M34 36h14l1 4H33z', .8),
                        'Café Racer / Néo-rétro': W(11) + swing + fork(57, 17) + engine + P('M27 20Q36 15 48 19L46 25H28z') + P('M5 21Q14 14 26 19V24H8z') + S('M55 16L64 18') + lamp(61, 22),
                        'Supermotard': W(9.5) + swing + fork(56, 13) + engine + P('M26 17Q36 12 50 18L48 25H28z') + seat(6, 28, 21) + bars(55, 12) + S('M52 22Q62 12 74 22', 2.6),
                        'Scooter': scoot(8) + P('M3 31Q3 19 18 19H34L31 33H14z') + P('M30 34H54L52 29H32z') + P('M46 11H54L59 29H51z') + S('M66 38L56 14') + S('M48 8H60', 3.6) + P('M6 17Q8 12 19 12H29V17H6z'),
                        'Maxi-scooter': scoot(8) + P('M1 33Q1 12 24 12H38L36 34H10z') + P('M34 35H54L52 29H36z') + P('M44 4L57 12L61 30H53L53 17L44 11z') + S('M66 38L57 15') + P('M0 31H8V35H0z'),
                        'Trial': W(10) + S('M14 36L32 30') + fork(56, 14) + P('M30 25H46l2 7H33z') + P('M26 18Q36 14 48 18L46 24H27z') + P('M8 18H26L25 22H8z') + bars(55, 13),
                        'Mini-moto / Pit bike': W(8) + S('M14 36L32 31') + fork(56, 18) + P('M30 26H46l2 8H33z') + P('M27 19Q36 15 47 19L45 25H28z') + seat(8, 27, 22) + bars(55, 17),
                        'Quad / SSV': `<circle cx="18" cy="35" r="11" fill="none" stroke="${C}" stroke-width="5"/><circle cx="62" cy="35" r="11" fill="none" stroke="${C}" stroke-width="5"/><circle cx="18" cy="35" r="3" fill="${C}"/><circle cx="62" cy="35" r="3" fill="${C}"/>` + P('M10 21H36L40 31H12z') + P('M36 17H56L62 26L56 32H36z') + S('M46 17L44 7') + S('M38 7H54', 3.6),
                        'Électrique': W(11) + swing + fork(56, 14) + P('M28 17Q40 12 52 18L50 33H32z') + seat(12, 30, 22) + tail + bars(55, 13) + lamp(60, 18) + `<path d="M42 19l-7 9h5l-2 7 9-10h-5z" fill="var(--bg-color,#000)"/>`
                    };
                    return `<svg viewBox="0 0 80 48" style="width:${size}px;height:${Math.round(size * 0.6)}px;display:block;overflow:visible;">${T[type] || T['Roadster']}</svg>`;
                },

                showAddMotoModal() {
                    this.showEditMotoModal(null, null); 
                },

                // 🟢 MODIFIÉ : Ajout du champ Cylindrée dans la modale
                showEditMotoModal(index, motoData) {
                    const isEditing = index !== null && motoData !== null;
                    const existing = document.getElementById('profile-hud-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'profile-hud-overlay';
                    let tempMotoPhoto = isEditing ? (motoData.photo || null) : null;

                    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                    const cur = isEditing ? motoData : {};
                    const moteurCur = cur.moteur || '';
                    const typeList = ['Roadster', 'Sportive', 'Trail / Adventure', 'Enduro / Cross', 'Custom', 'Cruiser', 'GT / Routière', 'Touring', 'Café Racer / Néo-rétro', 'Supermotard', 'Scooter', 'Maxi-scooter', 'Trial', 'Mini-moto / Pit bike', 'Quad / SSV', 'Électrique', 'Autre'];
                    if (cur.type && !typeList.includes(cur.type)) typeList.push(cur.type);
                    overlay.style.cssText = "position: fixed; inset: 0; background: var(--bg-color); z-index: 9999; display: flex; flex-direction: column; opacity: 0; transition: opacity 0.2s; overflow: hidden;";
                    overlay.innerHTML = `
                        <style>
                            #profile-hud-overlay .mm-body { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 12px 14px 16px; display: flex; flex-direction: column; gap: 12px; }
                            #profile-hud-overlay .mm-f { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
                            #profile-hud-overlay .mm-body > .mm-f { flex: none; }
                            #profile-hud-overlay .mm-f > span { font-size: .68rem; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: var(--text-muted); padding-left: 2px; }
                            #profile-hud-overlay .mm-f > span i { color: var(--accent-color); font-style: normal; }
                            #profile-hud-overlay .mm-in { width: 100%; min-width: 0; box-sizing: border-box; padding: 11px 12px; background: var(--surface-color); border: 1px solid rgba(255,255,255,.07); border-radius: 12px; color: var(--text-main); font-size: 16px; font-weight: 600; outline: none; font-family: inherit; }
                            #profile-hud-overlay .mm-in:focus { border-color: var(--accent-color); }
                            #profile-hud-overlay .mm-row { display: flex; gap: 10px; }
                            #profile-hud-overlay .mm-sec { font-size: .7rem; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text-muted); margin-top: 4px; }
                            #profile-hud-overlay .mm-seg { display: flex; gap: 6px; }
                            #profile-hud-overlay .mm-seg button { flex: 1; padding: 10px 4px; border-radius: 12px; border: 1px solid rgba(255,255,255,.07); background: var(--surface-color); color: var(--text-muted); font-weight: 800; font-size: .85rem; font-family: inherit; cursor: pointer; }
                            #profile-hud-overlay .mm-seg button.on { background: var(--accent-color); color: var(--on-accent); border-color: transparent; }
                            #profile-hud-overlay .mm-photo { display: flex; align-items: center; gap: 12px; padding: 8px; background: var(--surface-color); border: 1px dashed rgba(255,255,255,.2); border-radius: 14px; cursor: pointer; }
                            #profile-hud-overlay .mm-thumb { width: 64px; height: 64px; border-radius: 10px; flex-shrink: 0; background: rgba(255,255,255,.05) center/cover no-repeat; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
                            #profile-hud-overlay .mm-foot { flex-shrink: 0; padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); background: var(--bg-color); border-top: 1px solid rgba(255,255,255,.07); }
                        </style>
                        <div style="flex-shrink:0; padding: calc(10px + env(safe-area-inset-top)) 8px 10px 16px; display: flex; justify-content: space-between; align-items: center; background: var(--surface-color);">
                            <h3 style="color: var(--text-main); font-size: 1.1rem; font-weight: 900; margin: 0;">${isEditing ? 'Modifier la moto' : 'Ajouter une moto'}</h3>
                            <button id="hud-btn-cancel" aria-label="Fermer" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px 10px; display: flex; align-items: center;">${VI.x}</button>
                        </div>

                        <div class="mm-body">
                            <div id="btn-upload-moto" class="mm-photo">
                                <div id="modal-moto-preview" class="mm-thumb" style="${tempMotoPhoto ? `background-image:url(${tempMotoPhoto})` : ''}"><span id="moto-photo-icon" style="display:${tempMotoPhoto ? 'none' : 'flex'};">${VI.bike30}</span></div>
                                <div style="min-width:0;">
                                    <div id="moto-photo-text" style="color: var(--text-main); font-size: .95rem; font-weight: 800;">${tempMotoPhoto ? 'Changer la photo' : 'Ajouter une photo'}</div>
                                    <div style="color: var(--text-muted); font-size: .75rem; margin-top: 2px;">Optionnel</div>
                                </div>
                                <input type="file" id="input-moto-file" accept="image/*" style="display: none;">
                            </div>

                            <div class="mm-row">
                                <label class="mm-f"><span>Marque <i>*</i></span><input class="mm-in" type="text" id="input-moto-marque" value="${esc(cur.marque)}" placeholder="Yamaha" autocomplete="off"></label>
                                <label class="mm-f"><span>Modèle <i>*</i></span><input class="mm-in" type="text" id="input-moto-modele" value="${esc(cur.modele)}" placeholder="MT-07" autocomplete="off"></label>
                            </div>
                            <div class="mm-row">
                                <label class="mm-f"><span>Année <i>*</i></span><input class="mm-in" type="number" inputmode="numeric" id="input-moto-annee" value="${esc(cur.annee)}" placeholder="2021"></label>
                                <label class="mm-f"><span>Kilométrage <i>*</i></span><input class="mm-in" type="number" inputmode="numeric" id="input-moto-km" value="${esc(cur.km)}" placeholder="12000"></label>
                            </div>
                            <label class="mm-f"><span>Type <i>*</i></span><select class="mm-in" id="input-moto-type" style="appearance:none;-webkit-appearance:none;background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23999%22 stroke-width=%223%22><polyline points=%226 9 12 15 18 9%22/></svg>');background-repeat:no-repeat;background-position:right 12px center;padding-right:34px;${cur.type ? '' : 'color:var(--text-muted);'}">
                                    <option value="">Choisir un type…</option>
                                    ${typeList.map(x => `<option value="${esc(x)}" ${cur.type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
                                </select></label>

                            <div class="mm-sec">Moteur (optionnel)</div>
                            <div class="mm-seg" id="seg-moto-moteur">
                                <button type="button" data-v="2T" class="${moteurCur === '2T' ? 'on' : ''}">2 Temps</button>
                                <button type="button" data-v="4T" class="${moteurCur === '4T' ? 'on' : ''}">4 Temps</button>
                                <button type="button" data-v="Électrique" class="${moteurCur === 'Électrique' ? 'on' : ''}">Électrique</button>
                            </div>
                            <input type="hidden" id="select-moto-moteur" value="${esc(moteurCur)}">
                            <div class="mm-row">
                                <label class="mm-f"><span>Cylindrée (cm³)</span><input class="mm-in" type="number" inputmode="numeric" id="input-moto-cylindree" value="${esc(cur.cylindree)}" placeholder="689"></label>
                                <label class="mm-f"><span>Cylindres</span><input class="mm-in" type="number" inputmode="numeric" id="input-moto-cylindres" value="${esc(cur.cylindres)}" placeholder="2"></label>
                            </div>
                        </div>

                        <div class="mm-foot">
                            <button id="hud-btn-save" class="btn" style="width: 100%; background: var(--accent-color); color: var(--on-accent); padding: 14px; border-radius: 14px; font-weight: 900; font-size: 1rem;">${isEditing ? 'Enregistrer' : 'Ajouter au garage'}</button>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { overlay.style.opacity = '1'; }, 10);

                    const closeHud = () => {
                        overlay.style.opacity = '0';
                        setTimeout(() => overlay.remove(), 200);
                    };

                    document.getElementById('btn-upload-moto').addEventListener('click', () => { document.getElementById('input-moto-file').click(); });
                    document.getElementById('input-moto-file').addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            this.compressImage(file, 800, (compressedBase64) => {
                                tempMotoPhoto = compressedBase64;
                                const preview = document.getElementById('modal-moto-preview');
                                preview.style.backgroundImage = `url(${tempMotoPhoto})`;
                                document.getElementById('moto-photo-icon').style.display = 'none';
                                document.getElementById('moto-photo-text').textContent = 'Changer la photo';
                            });
                        }
                    });

                    const typeEl0 = document.getElementById('input-moto-type');
                    typeEl0.addEventListener('change', () => { typeEl0.style.color = typeEl0.value ? 'var(--text-main)' : 'var(--text-muted)'; });
                    document.querySelectorAll('#seg-moto-moteur button').forEach(b => b.addEventListener('click', () => {
                        const on = b.classList.contains('on');
                        document.querySelectorAll('#seg-moto-moteur button').forEach(x => x.classList.remove('on'));
                        if (!on) b.classList.add('on');
                        document.getElementById('select-moto-moteur').value = on ? '' : b.dataset.v;
                    }));

                    document.getElementById('hud-btn-cancel').addEventListener('click', closeHud);
                    
                    document.getElementById('hud-btn-save').addEventListener('click', () => {
                        const marqueEl = document.getElementById('input-moto-marque');
                        const modeleEl = document.getElementById('input-moto-modele');
                        const anneeEl = document.getElementById('input-moto-annee');
                        const kmEl = document.getElementById('input-moto-km');
                        const typeEl = document.getElementById('input-moto-type');
                        const cylindreeEl = document.getElementById('input-moto-cylindree');
                        const moteurEl = document.getElementById('select-moto-moteur');
                        const cylindresEl = document.getElementById('input-moto-cylindres');
                        
                        const marque = marqueEl ? marqueEl.value : "";
                        const modele = modeleEl ? modeleEl.value : "";
                        const annee = anneeEl ? anneeEl.value : "";
                        const km = kmEl ? kmEl.value : "";
                        const type = typeEl ? typeEl.value : "";
                        const cylindree = cylindreeEl ? cylindreeEl.value : "";
                        const moteur = moteurEl ? moteurEl.value : "";
                        const cylindres = cylindresEl ? cylindresEl.value : "";
                        
                        if (!marque || !modele || !annee || !km || !type) {
                            AppDialog.alert("Veuillez remplir tous les champs marqués d'un astérisque (*).");
                            return;
                        }

                        const newMotoData = {
                            marque: marque.trim(),
                            modele: modele.trim(),
                            annee: annee.trim(),
                            km: km.trim(),
                            type: type.trim(),
                            cylindree: cylindree.trim(),
                            moteur: moteur,
                            cylindres: cylindres.trim(),
                            photo: tempMotoPhoto 
                        };

                        if (isEditing) {
                            const prev = this.state.motos[index] || {};
                            if (prev.id) newMotoData.id = prev.id;
                            if (prev.hrTotal !== undefined) newMotoData.hrTotal = prev.hrTotal;
                            // Si le km du profil est modifié, il devient le nouveau compteur de l'Atelier
                            if (prev.kmTotal !== undefined && String(prev.km) === newMotoData.km) newMotoData.kmTotal = prev.kmTotal;
                            this.state.motos[index] = newMotoData;
                        } else {
                            this.state.motos.push(newMotoData);
                        }
                        
                        this.saveData();
                        this.updateUI();
                        closeHud();
                    });
                },
                
                // 🟢 NOUVEAU : Fonction pour demander avec quelle moto on roule
                promptMotoSelection(callback) {
                    // Si le garage est vide, on démarre sans moto spécifique
                    if (this.state.motos.length === 0) {
                        callback(null);
                        return;
                    }
                    
                    // S'il n'y a qu'une seule moto, on la sélectionne automatiquement sans déranger l'utilisateur
                    if (this.state.motos.length === 1) {
                        callback(this.state.motos[0]);
                        return;
                    }

                    // S'il y a plusieurs motos, on affiche le HUD de sélection
                    const existing = document.getElementById('moto-select-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'moto-select-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; padding: 20px;";

                    let html = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 25px; text-align: center; transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                            <h3 style="color: var(--text-main); font-size: 1.2rem; margin-bottom: 5px;">Départ imminent <svg class="vi" viewBox="0 0 24 24" style="width:20px;height:20px;"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg></h3>
                            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 20px;">Avec quelle moto partez-vous ?</p>
                            
                            <div style="display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; margin-bottom: 15px; padding-right: 5px;">
                    `;

                    this.state.motos.forEach((moto, index) => {
                        const photoHtml = moto.photo 
                            ? `<div style="width: 50px; height: 50px; border-radius: 12px; background-image: url(${moto.photo}); background-size: cover; background-position: center; flex-shrink: 0;"></div>`
                            : `<div style="width: 50px; height: 50px; border-radius: 12px; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0;">${VI.bike30}</div>`;

                        html += `
                                <button class="btn-select-moto-ride" data-index="${index}" style="background: var(--active-bg); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 12px; display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: left; transition: transform 0.1s;">
                                    ${photoHtml}
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="color: var(--text-main); font-weight: 900; font-size: 1rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escHtml(moto.marque)} ${escHtml(moto.modele)}</div>
                                        <div style="color: var(--text-muted); font-size: 0.75rem; font-weight: 600; margin-top: 2px;">${moto.type}</div>
                                    </div>
                                </button>
                        `;
                    });

                    html += `
                            </div>
                            <button id="hud-btn-cancel-select" class="btn" style="width: 100%; background: transparent; color: var(--text-muted); padding: 15px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); font-weight: 800;">Annuler</button>
                        </div>
                    `;

                    overlay.innerHTML = html;
                    document.body.appendChild(overlay);

                    setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; }, 10);

                    const closeHud = () => {
                        overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 200);
                    };

                    document.getElementById('hud-btn-cancel-select').addEventListener('click', () => {
                        closeHud();
                        callback(false); // "false" signifie que l'utilisateur a annulé le départ
                    });

                    document.querySelectorAll('.btn-select-moto-ride').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const idx = e.currentTarget.getAttribute('data-index');
                            closeHud();
                            callback(this.state.motos[idx]); // Renvoie la moto choisie
                        });
                        // Petit effet tactile natif
                        btn.addEventListener('touchstart', (e) => e.currentTarget.style.transform = 'scale(0.97)', {passive: true});
                        btn.addEventListener('touchend', (e) => e.currentTarget.style.transform = 'scale(1)', {passive: true});
                    });
                }
                
            };
