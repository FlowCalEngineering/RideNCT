        const ModuleMapWeather = {
            state: { data: null, lastFetch: 0, lastPos: null, fetching: false, timer: null },
            REFRESH_MS: 10 * 60 * 1000,   // rafraîchit toutes les 10 min
            MOVE_KM: 8,                    // ou dès qu'on a roulé 8 km depuis la dernière mesure
            STALE_MS: 30 * 60 * 1000,      // au-delà, le widget est grisé

            svg(paths) { return `<svg viewBox="0 0 24 24" style="width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;">${paths}</svg>`; },

            icons() {
                if (this._ic) return this._ic;
                const s = (p) => this.svg(p);
                const cloudBase = '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>';
                this._ic = {
                    sun: s('<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>'),
                    moon: s('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>'),
                    cloudSun: s('<path d="M12 2v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="M20 12h2"></path><path d="m19.07 4.93-1.41 1.41"></path><path d="M15.94 14A5 5 0 0 0 6 14"></path><path d="M22 20a3 3 0 0 1-3 3H5.53a5.5 5.5 0 0 1 0-11h.47a8 8 0 0 1 15.19 2.53A3 3 0 0 1 22 20Z"></path>'),
                    cloudMoon: s('<path d="M13 4a4 4 0 0 0 5.5 5.5A6 6 0 0 1 13 4Z"></path><path d="M22 20a3 3 0 0 1-3 3H5.53a5.5 5.5 0 0 1 0-11h.47a8 8 0 0 1 15.19 2.53A3 3 0 0 1 22 20Z"></path>'),
                    cloud: s('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>'),
                    fog: s('<path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path><path d="M8 19h8"></path><path d="M10 22h4"></path>'),
                    drizzle: s(cloudBase + '<path d="M8 19v.01"></path><path d="M12 14v.01"></path><path d="M16 19v.01"></path>'),
                    rain: s(cloudBase + '<path d="M16 14v6"></path><path d="M8 14v6"></path><path d="M12 16v6"></path>'),
                    snow: s(cloudBase + '<path d="M8 15h.01"></path><path d="M8 19h.01"></path><path d="M12 17h.01"></path><path d="M12 21h.01"></path><path d="M16 15h.01"></path><path d="M16 19h.01"></path>'),
                    storm: s('<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path><polyline points="13 11 9 17 15 17 11 23"></polyline>')
                };
                return this._ic;
            },

            // Code WMO -> { icon, kind }  (kind: clear | cloud | rain | storm | snow | fog)
            info(code, isDay = true) {
                const I = this.icons();
                if (code === 0) return { icon: isDay ? I.sun : I.moon, kind: 'clear' };
                if (code === 1 || code === 2) return { icon: isDay ? I.cloudSun : I.cloudMoon, kind: 'cloud' };
                if (code === 3) return { icon: I.cloud, kind: 'cloud' };
                if (code === 45 || code === 48) return { icon: I.fog, kind: 'fog' };
                if (code >= 51 && code <= 57) return { icon: I.drizzle, kind: 'rain' };
                if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: I.rain, kind: 'rain' };
                if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: I.snow, kind: 'snow' };
                if (code >= 95) return { icon: I.storm, kind: 'storm' };
                return { icon: I.cloud, kind: 'cloud' };
            },

            init() {
                const el = document.getElementById('map-weather');
                if (!el) return;
                // Un tap ouvre l'onglet Météo complet
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const btn = document.querySelector('.nav-btn[data-target="view-weather"]');
                    if (btn) btn.click();
                });
                ['touchstart', 'touchmove', 'touchend'].forEach(ev => el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));

                // 1) Affichage immédiat des dernières données connues (cache), en attendant la mise à jour
                try {
                    const c = JSON.parse(localStorage.getItem('ridenct_mapweather') || 'null');
                    if (c && c.data && c.data.current) {
                        this.state.data = c.data; this.state.lastFetch = c.t || 0; this.state.lastPos = c.pos || null;
                        this.render();
                    }
                } catch (e) {}

                // 2) Position propre au widget (rapide, basse précision) : n'attend plus le GPS de la carte
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (p) => { this.state.ownPos = [p.coords.longitude, p.coords.latitude]; this.tick(); },
                        () => {},
                        { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 }
                    );
                }

                // 3) Vérification toutes les 3 s tant qu'on n'a rien, puis toutes les 20 s
                this.tick();
                const loop = () => {
                    this.tick();
                    this.state.timer = setTimeout(loop, (this.state.data && this.state.lastFetch && Date.now() - this.state.lastFetch < this.STALE_MS) ? 20000 : 3000);
                };
                this.state.timer = setTimeout(loop, 3000);
                document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
            },

            km(a, b) {
                const R = 6371, r = Math.PI / 180;
                const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
                const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
                return 2 * R * Math.asin(Math.sqrt(h));
            },

            tick() {
                if (document.hidden || this.state.fetching) return;
                const pos = ((typeof ModuleGPS !== 'undefined') ? ModuleGPS.state.lastKnownCoords : null) || this.state.ownPos;
                if (!pos) return;   // pas encore de position : on réessaie au prochain tick
                const now = Date.now();
                const age = now - this.state.lastFetch;
                const moved = this.state.lastPos ? this.km(this.state.lastPos, pos) : Infinity;
                if (!this.state.data || age > this.REFRESH_MS || moved > this.MOVE_KM) this.fetch(pos);
                else this.render();   // met à jour l'état "grisé" et la tranche +1h
            },

            async fetch(pos) {
                this.state.fetching = true;
                try {
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos[1].toFixed(4)}&longitude=${pos[0].toFixed(4)}`
                        + `&current=temperature_2m,weather_code,wind_speed_10m,is_day`
                        + `&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,is_day`
                        + `&timezone=auto&forecast_hours=4`;
                    const ctl = new AbortController();
                    const to = setTimeout(() => ctl.abort(), 8000);
                    const res = await fetch(url, { signal: ctl.signal });
                    clearTimeout(to);
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    this.state.data = await res.json();
                    this.state.lastFetch = Date.now();
                    this.state.lastPos = [pos[0], pos[1]];
                    try { localStorage.setItem('ridenct_mapweather', JSON.stringify({ data: this.state.data, t: this.state.lastFetch, pos: this.state.lastPos })); } catch (e) {}
                    this.render();
                } catch (e) {
                    console.warn('Météo carte indisponible :', e);
                    this.render();   // garde les dernières données (grisées si trop vieilles)
                } finally {
                    this.state.fetching = false;
                }
            },

            render() {
                const el = document.getElementById('map-weather');
                const d = this.state.data;
                if (!el || !d || !d.current || !d.hourly) return;

                const cur = d.current;
                const curInfo = this.info(cur.weather_code, cur.is_day === 1);
                document.getElementById('mw-ic').innerHTML = curInfo.icon;
                document.getElementById('mw-temp').textContent = Math.round(cur.temperature_2m) + '°';
                document.getElementById('mw-wind').textContent = Math.round(cur.wind_speed_10m) + ' km/h';

                // Créneau horaire le plus proche de "maintenant + 1 h" (heures locales du lieu, comparées entre elles)
                const t0 = new Date(cur.time).getTime();
                const target = t0 + 3600000;
                const times = d.hourly.time;
                let idx = 0, best = Infinity;
                for (let i = 0; i < times.length; i++) {
                    const diff = Math.abs(new Date(times[i]).getTime() - target);
                    if (diff < best) { best = diff; idx = i; }
                }
                const H = d.hourly;
                const nInfo = this.info(H.weather_code[idx], H.is_day ? H.is_day[idx] === 1 : true);
                const pop = Math.round(H.precipitation_probability[idx] || 0);
                const hh = times[idx].slice(11, 13);

                document.getElementById('mw-nlabel').textContent = '+1h · ' + hh + 'h';
                document.getElementById('mw-nic').innerHTML = nInfo.icon;
                document.getElementById('mw-ntemp').textContent = Math.round(H.temperature_2m[idx]) + '°';
                document.getElementById('mw-nrain-v').textContent = pop + '%';
                document.getElementById('mw-nrain').classList.toggle('dry', pop < 30);

                // Alertes visuelles : contour bleu si pluie probable ou en cours, orange si orage
                const kinds = [curInfo.kind, nInfo.kind];
                const storm = kinds.includes('storm');
                const rain = !storm && (kinds.includes('rain') || kinds.includes('snow') || pop >= 50);
                el.classList.toggle('mw-storm', storm);
                el.classList.toggle('mw-rain', rain);
                el.classList.remove('mw-loading');
                el.classList.toggle('mw-stale', (Date.now() - this.state.lastFetch) > this.STALE_MS);
            }
        };
