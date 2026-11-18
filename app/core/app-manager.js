        const AppManager = {
            // NOUVEAU : La liste inclut maintenant les 10 vues dans l'ordre de la barre
            viewOrder: ['view-home', 'view-dashboard', 'view-gps', 'view-music', 'view-weather', 'view-intercom', 'view-community', 'view-profile', 'view-maintenance', 'view-security', 'view-settings'],
            touchStartX: 0, 
            touchStartY: 0, 
            touchEndX: 0,
            touchEndY: 0,
            touchStartTime: 0,

            init() {
                const navButtons = document.querySelectorAll('.nav-btn');
                navButtons.forEach(btn => {
                    if (btn.hasAttribute('data-target')) {
                        btn.addEventListener('click', (e) => {
                            this.switchView(e.currentTarget.getAttribute('data-target'));
                        });
                    }
                });

                const mainArea = document.getElementById('app-content');
                
                mainArea.addEventListener('touchstart', (e) => { 
                    this._edge = !document.body.classList.contains('nav-bottom') && (e.changedTouches[0].clientX >= window.innerWidth - 26 || document.body.classList.contains('nav-open'));
                    if (e.target.closest('#rm, #map-container, [data-no-swipe], .moto-carousel, .at-chips, .at-seg, .atelier-top-nav')) return;
                    this.touchStartX = e.changedTouches[0].screenX; 
                    this.touchStartY = e.changedTouches[0].screenY; 
                    this.touchStartTime = Date.now();
                }, {passive: true});
                
                mainArea.addEventListener('touchend', (e) => { 
                    if (e.target.closest('#rm, #map-container, [data-no-swipe], .moto-carousel, .at-chips, .at-seg, .atelier-top-nav')) return;
                    this.touchEndX = e.changedTouches[0].screenX; 
                    this.touchEndY = e.changedTouches[0].screenY; 
                    this.handleSwipe(); 
                }, {passive: true});

                // L'appli s'ouvre toujours sur l'Accueil (view-home est affichée par défaut)
            },

            handleSwipe() {
                if (this._edge) return;   // glissé depuis le bord droit = ouverture du menu, pas un changement d'onglet
                const diffX = this.touchStartX - this.touchEndX;
                const diffY = this.touchStartY - this.touchEndY;
                const swipeTime = Date.now() - this.touchStartTime;
                
                if (window.ModuleHome && (ModuleHome.drag || Date.now() - ModuleHome.dragEnd < 600)) return;   // glisser d'un bloc de l'accueil : pas de changement d'onglet
                if (swipeTime < 600 && Math.abs(diffX) > 120 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
                    const activeView = document.querySelector('.module-view.active');
                    if (!activeView) return;
                    if (window.AppNav && AppNav.step) { try { if (AppNav.step(diffX > 0 ? 1 : -1)) return; } catch (e) { } }   // ordre du menu actuel
                    
                    const currentIndex = this.viewOrder.indexOf(activeView.id);
                    
                    if (diffX > 0 && currentIndex < this.viewOrder.length - 1) { 
                        this.switchView(this.viewOrder[currentIndex + 1]);
                    } else if (diffX < 0 && currentIndex > 0) { 
                        this.switchView(this.viewOrder[currentIndex - 1]);
                    }
                }
            },

            switchView(targetId) {
                // Écran Route en plein écran = verrouillé : aucun autre onglet tant qu'on n'a pas quitté le plein écran
                if (document.body.classList.contains('rm-imm') && targetId !== 'view-dashboard') return;
                document.querySelectorAll('.module-view').forEach(view => view.classList.remove('active'));
                const targetView = document.getElementById(targetId);
                if (targetView) targetView.classList.add('active');

                const activeButton = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
                if (activeButton) {
                    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
                    activeButton.classList.add('active');
                    
                }
                
                if (targetId === 'view-maintenance' && typeof ModuleMaintenance !== 'undefined') {
                    try { ModuleMaintenance.refresh(); } catch (e) { console.error(e); }
                }

                if (targetId === 'view-gps' && typeof ModuleGPS !== 'undefined' && ModuleGPS.state.map) {
                    setTimeout(() => ModuleGPS.state.map.resize(), 50);
                }

                localStorage.setItem('motoapp_last_view', targetId);
                document.dispatchEvent(new Event('viewchange'));
            }
        };
