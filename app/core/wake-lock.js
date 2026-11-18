        const ScreenWakeManager = {
            sentinel: null, want: false,
            async request() {
                this.want = true;
                if (!('wakeLock' in navigator)) return;
                try {
                    this.sentinel = await navigator.wakeLock.request('screen');
                    this.sentinel.addEventListener('release', () => { this.sentinel = null; });
                } catch (err) {
                    console.warn('Anti-veille refusé par le système :', err);
                }
            },
            // Réglages › Écran : « toujours allumé » le garde dès l'ouverture de l'appli ; sinon seules la balade et la sécurité le demandent
            init() {
                if (AppPrefs.get('wake') === 'always') this.request();
                document.addEventListener('prefchange', (e) => { if (e.detail.key === 'wake' && e.detail.value === 'always') this.request(); });
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible' && this.want) this.request();
                });
            }
        };
