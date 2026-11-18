// Outils d'affichage : notifications, confirmations, formatage
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
                fmtDist(d) { return d === null || d === undefined ? '' : d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`; },
                fmtAgo(t) {
                    const s = (Date.now() - t) / 1000;
                    if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
                    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`; if (s < 86400 * 30) return `il y a ${Math.round(s / 86400)} j`;
                    return new Date(t).toLocaleDateString('fr-FR');
                },
                avatarHtml(prof, name, cls) {
                    const img = prof && prof.avatar;
                    return `<div class="${cls}" style="${img ? `background-image:url('${img}')` : ''}">${img ? '' : this.esc((name || '?').charAt(0).toUpperCase())}</div>`;
                },
                motoLine(prof) { const m = prof && prof.motos && prof.motos[0]; return m ? `${m.marque} ${m.modele}`.trim() : ''; },
                showNotification(title, message, iconSvg = '', duration = 4000) {
                    let container = document.getElementById('vroom-toast-container');
                    if (!container) {
                        container = document.createElement('div');
                        container.id = 'vroom-toast-container';
                        container.style.cssText = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10000; display: flex; flex-direction: column; gap: 10px; width: 90%; max-width: 400px; pointer-events: none;";
                        document.body.appendChild(container);
                    }
                    
                    const toast = document.createElement('div');
                    toast.style.cssText = "background: rgba(28,28,30,0.95); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 16px; padding: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; gap: 15px; transform: translateY(-30px); opacity: 0; transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); pointer-events: auto; cursor: pointer;";
                    
                    toast.innerHTML = `
                        <div style="display:flex; align-items:center; justify-content:center; flex-shrink:0;">${iconSvg}</div>
                        <div style="flex: 1; min-width: 0; text-align: left;">
                            <div style="color: #fff; font-weight: 900; font-size: 1rem;">${this.esc(title)}</div>
                            <div style="color: rgba(255,255,255,0.7); font-size: 0.8rem; margin-top: 2px;">${this.esc(message)}</div>
                        </div>
                    `;
                    
                    toast.addEventListener('click', () => {
                        toast.style.transform = "translateY(-30px)";
                        toast.style.opacity = "0";
                        setTimeout(() => toast.remove(), 300);
                    });

                    container.appendChild(toast);
                    
                    requestAnimationFrame(() => {
                        toast.style.transform = "translateY(0)";
                        toast.style.opacity = "1";
                    });
                    
                    setTimeout(() => {
                        if(toast.parentNode) {
                            toast.style.transform = "translateY(-30px)";
                            toast.style.opacity = "0";
                            setTimeout(() => { if(toast.parentNode) toast.remove(); }, 300);
                        }
                    }, duration);
                },
                // NOUVEAU : Fenêtre de confirmation native de l'app
                showConfirm(title, message, onConfirm) {
                    const existing = document.getElementById('vroom-confirm-overlay');
                    if (existing) existing.remove();

                    const overlay = document.createElement('div');
                    overlay.id = 'vroom-confirm-overlay';
                    overlay.style.cssText = "position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; padding: 20px;";

                    overlay.innerHTML = `
                        <div style="background: var(--surface-color); border-radius: 24px; width: 100%; max-width: 320px; padding: 25px; text-align: center; transform: scale(0.9); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                            <h3 style="color: var(--text-main); font-size: 1.2rem; margin-bottom: 10px;">${this.esc(title)}</h3>
                            <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 25px; line-height: 1.4;">${this.esc(message)}</p>
                            
                            <div style="display: flex; gap: 10px;">
                                <button id="confirm-btn-cancel" class="btn" style="flex: 1; background: transparent; color: var(--text-muted); padding: 15px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); font-weight: 800;">Annuler</button>
                                <button id="confirm-btn-yes" class="btn" style="flex: 1; background: rgba(255,69,58,0.1); color: var(--danger-color); padding: 15px; border-radius: 16px; font-weight: 800;">Confirmer</button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(overlay);
                    setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('div').style.transform = 'scale(1)'; }, 10);

                    const closeConfirm = () => {
                        overlay.style.opacity = '0'; overlay.querySelector('div').style.transform = 'scale(0.9)';
                        setTimeout(() => overlay.remove(), 200);
                    };

                    document.getElementById('confirm-btn-cancel').addEventListener('click', closeConfirm);
                    document.getElementById('confirm-btn-yes').addEventListener('click', () => {
                        closeConfirm();
                        if (onConfirm) onConfirm();
                    });
                },
});
