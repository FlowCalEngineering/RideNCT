        const AppTheme = {
            mapStyles: {
                dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', // Carte sombre
                light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'     // Carte claire
            },
            accentThemes: [
                { key: 'blanc',  label: 'Racing',  color: '#ff6a1a', text: '#ffffff', light: '#e8590c' },   // clé historique « blanc » conservée (réglages existants) ; teinte = orange Racing
                { key: 'bleu',   label: 'Bleu',    color: '#0a84ff', text: '#ffffff', light: '#0066cc' },
                { key: 'rouge',  label: 'Rouge',   color: '#ff453a', text: '#ffffff', light: '#d70015' },
                { key: 'vert',   label: 'Vert',    color: '#30d158', text: '#1c1c1e', light: '#1e7a35' },
                { key: 'orange', label: 'Orange',  color: '#ff9f0a', text: '#1c1c1e', light: '#b35c00' },
                { key: 'violet', label: 'Violet',  color: '#bf5af2', text: '#ffffff', light: '#8944ab' }
            ],
            routeColors: [
                { key: 'racing', label: 'Racing', color: '#ff6a1a' },
                { key: 'bleu',   label: 'Bleu',   color: '#0a84ff' },
                { key: 'rouge',  label: 'Rouge',  color: '#ff453a' },
                { key: 'vert',   label: 'Vert',   color: '#30d158' },
                { key: 'orange', label: 'Orange', color: '#ff9f0a' },
                { key: 'jaune',  label: 'Jaune',  color: '#ffd60a' },
                { key: 'blanc',  label: 'Blanc',  color: '#ffffff' }
            ],
            get(key, fallback) {
                try { return localStorage.getItem('motoapp_' + key) || fallback; } catch (e) { return fallback; }
            },
            set(key, value) {
                try { localStorage.setItem('motoapp_' + key, value); } catch (e) {}
            },
            // Mode choisi : 'dark' | 'light' | 'auto'. En auto, clair entre le lever et le coucher du soleil (calculé en local, sans serveur).
            rememberPos(lat, lng) {
                const now = Date.now(); if (now - (this._posT || 0) < 60000) return; this._posT = now;
                this.set('lastpos', lat.toFixed(3) + ',' + lng.toFixed(3));
            },
            isDaytime(date) {
                const d = date || new Date(); let lat = 48.85, lng = 2.35;
                try { const p = (this.get('lastpos', '') || '').split(','); if (p.length === 2 && isFinite(p[0]) && isFinite(p[1])) { lat = +p[0]; lng = +p[1]; } } catch (e) {}
                const rad = Math.PI / 180, JD = d.getTime() / 86400000 + 2440587.5, n0 = Math.ceil(JD - 2451545.0 + 0.0008);
                for (let k = -1; k <= 1; k++) {
                    const n = n0 + k, Js = n + lng / 360, M = (357.5291 + 0.98560028 * Js) % 360, Mr = M * rad;
                    const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
                    const lam = ((M + C + 180 + 102.9372) % 360) * rad;
                    const Jt = 2451545.0 + Js + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lam);
                    const dec = Math.asin(Math.sin(lam) * Math.sin(23.4397 * rad));
                    const x = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
                    if (x <= -1) return true; if (x >= 1) return false;      // soleil de minuit / nuit polaire
                    const w = Math.acos(x) / rad / 360, rise = (Jt - w - 2440587.5) * 86400000, set = (Jt + w - 2440587.5) * 86400000;
                    if (d.getTime() >= rise && d.getTime() < set) return true;
                }
                return false;
            },
            // Thème réellement appliqué (dark / light)
            effectiveMode() {
                const f = (typeof AppStyles !== 'undefined') ? AppStyles.forcedMode() : null; if (f) return f;   // certains styles imposent Sombre ou Clair
                const m = this.get('mode', 'dark');
                return m === 'auto' ? (this.isDaytime() ? 'light' : 'dark') : m;
            },
            // Vérifie chaque minute : en auto, bascule toute l'app et la carte au lever / coucher du soleil
            startAuto() {
                if (this._autoTimer) return; this._cur = this.effectiveMode();
                this._autoTimer = setInterval(() => {
                    const m = this.effectiveMode(); if (m === this._cur) return; this._cur = m;
                    this.applyAppTheme();
                    if (typeof ModuleGPS !== 'undefined' && ModuleGPS.applyMapTheme) ModuleGPS.applyMapTheme();
                }, 60000);
            },
            fade() {
                const h = document.documentElement; h.classList.add('theme-fade');
                clearTimeout(this._fadeT); this._fadeT = setTimeout(() => h.classList.remove('theme-fade'), 700);
            },
            applyAppTheme() {
                const mode = this.effectiveMode();
                const prev = document.documentElement.getAttribute('data-mode');
                // Bascule instantanée et complète : plus de fondu global (il laissait des zones non repeintes, comme la barre de navigation)
                document.documentElement.classList.remove('theme-fade');
                document.documentElement.setAttribute('data-mode', mode);
                document.documentElement.style.colorScheme = mode;
                const accentKey = this.get('accent', 'blanc');
                const accent = this.accentThemes.find(t => t.key === accentKey) || this.accentThemes[0];
                // Accent « Blanc » : invisible sur fond clair → on l'inverse (encre foncée) en mode clair
                // Mode clair : version foncée de l'accent (texte et boutons lisibles sur fond clair, texte blanc dessus)
                // Mode sombre : accent vif ; texte sombre sur vert et orange (le blanc y était illisible)
                const light = mode === 'light' && accent.light;
                document.documentElement.setAttribute('data-accent', accent.key);
                document.documentElement.style.setProperty('--accent-color', light ? accent.light : accent.color);
                document.documentElement.style.setProperty('--on-accent', light ? '#ffffff' : accent.text);
                if (typeof AppStyles !== 'undefined') AppStyles.apply();
                // Force un recalcul + un repaint complet (certaines WebView gardaient d'anciennes couleurs sur des zones isolées)
                void document.documentElement.offsetHeight;
            },
            getMapStyleUrl() {
                const mode = this.effectiveMode();
                return this.mapStyles[mode] || this.mapStyles.dark;
            },
            getRouteColor() {
                const key = this.get('routeColor', 'racing');
                const found = this.routeColors.find(c => c.key === key);
                return found ? found.color : '#0a84ff';
            }
        };
        AppTheme.applyAppTheme(); 
