            const ModuleWeather = {
                state: {
                    lastFetch: 0,
                    lat: null,
                    lon: null,
                    isFetching: false
                },
                init() {
                    // Actualise quand on clique sur l'onglet Météo dans la barre de nav
                    document.querySelector('.nav-btn[data-target="view-weather"]').addEventListener('click', () => {
                        this.fetchWeather();
                    });
                    
                    // Actualise via le bouton d'actualisation manuelle
                    document.getElementById('btn-refresh-weather').addEventListener('click', () => {
                        this.fetchWeather(true);
                    });

                    // 🟢 CORRECTION MOBILE : Empêche le défilement météo de déclencher le changement d'onglet
                    const slider = document.getElementById('weather-hourly-container');
                    if (slider) {
                        slider.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: true});
                        slider.addEventListener('touchmove', (e) => e.stopPropagation(), {passive: true});
                        slider.addEventListener('touchend', (e) => e.stopPropagation(), {passive: true});
                    }
                },
                
                async fetchWeather(force = false) {
                    if (this.state.isFetching) return;
                    
                    const now = Date.now();
                    // On met en cache pendant 20 minutes (1200000 ms) pour économiser la batterie
                    if (!force && (now - this.state.lastFetch < 1200000) && this.state.lat) return; 

                    // On récupère le GPS depuis le module de navigation
                    const coords = (typeof ModuleGPS !== 'undefined') ? ModuleGPS.state.lastKnownCoords : null;
                    
                    if (!coords) {
                        document.getElementById('weather-desc').textContent = "Position GPS introuvable 🛰️";
                        return;
                    }
                    
                    this.state.lon = coords[0];
                    this.state.lat = coords[1];
                    this.state.isFetching = true;
                    
                    document.getElementById('weather-desc').textContent = "Recherche satellite... 📡";

                    try {
                        // Appel API Open-Meteo avec les requêtes horaires complètes sur 24h
                        const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.state.lat}&longitude=${this.state.lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,apparent_temperature,precipitation_probability,snowfall,wind_speed_10m,wind_direction_10m,weather_code&timezone=auto&forecast_hours=24`;
                        const res = await fetchT(url, {}, 12000);
                        if (!res.ok) throw new Error("Erreur serveur météo");
                        const data = await res.json();
                        
                        this.updateUI(data);
                        this.state.lastFetch = now;
                    } catch (e) {
                        console.error("Erreur météo:", e);
                        document.getElementById('weather-desc').textContent = "Hors ligne ⚠️";
                    } finally {
                        this.state.isFetching = false;
                    }
                },
                
               updateUI(data) {
                    // Fonction utilitaire pour générer les icônes SVG (Style RideNCT Fil de fer)
                    const svg = (paths) => `<svg viewBox="0 0 24 24" style="width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;">${paths}</svg>`;
                    
                    // Création de notre librairie d'icônes Météo Vectorielles
                    const icSun = svg('<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>');
                    const icCloud = svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>');
                    const icCloudSun = svg('<path d="M12 2v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="M20 12h2"></path><path d="m19.07 4.93-1.41 1.41"></path><path d="M15.94 14A5 5 0 0 0 6 14"></path><path d="M22 20a3 3 0 0 1-3 3H5.53a5.5 5.5 0 0 1 0-11h.47a8 8 0 0 1 15.19 2.53A3 3 0 0 1 22 20Z"></path>');
                    const icFog = svg('<path d="M17.5 15H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path><path d="M8 19h8"></path><path d="M10 22h4"></path>');
                    const icDrizzle = svg('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M8 19v.01"></path><path d="M12 14v.01"></path><path d="M16 19v.01"></path>');
                    const icRain = svg('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M16 14v6"></path><path d="M8 14v6"></path><path d="M12 16v6"></path>');
                    const icSnow = svg('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path><path d="M8 15h.01"></path><path d="M8 19h.01"></path><path d="M12 17h.01"></path><path d="M12 21h.01"></path><path d="M16 15h.01"></path><path d="M16 19h.01"></path>');
                    const icStorm = svg('<path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path><polyline points="13 11 9 17 15 17 11 23"></polyline>');

                    // Dictionnaire des codes WMO associés aux SVGs
                    const wmo = {
                        0: { text: "Ciel clair", icon: icSun },
                        1: { text: "Généralement clair", icon: icCloudSun },
                        2: { text: "Partiel. nuageux", icon: icCloudSun },
                        3: { text: "Couvert", icon: icCloud },
                        45: { text: "Brouillard", icon: icFog },
                        48: { text: "Brouillard givrant", icon: icFog },
                        51: { text: "Bruine légère", icon: icDrizzle },
                        53: { text: "Bruine modérée", icon: icDrizzle },
                        55: { text: "Bruine dense", icon: icRain },
                        61: { text: "Pluie légère", icon: icRain },
                        63: { text: "Pluie modérée", icon: icRain },
                        65: { text: "Pluie forte", icon: icRain },
                        71: { text: "Neige légère", icon: icSnow },
                        73: { text: "Neige modérée", icon: icSnow },
                        75: { text: "Neige forte", icon: icSnow },
                        95: { text: "Orage", icon: icStorm },
                        96: { text: "Orage grêle", icon: icStorm },
                        99: { text: "Orage fort", icon: icStorm }
                    };
                    const defaultWmo = { text: "Instable", icon: icCloud };

                    // 1. Mise à jour du gros widget Hero
                    const currentCode = data.current.weather_code;
                    this.state.code = currentCode; this.state.codeAt = Date.now();
                    const currentInfo = wmo[currentCode] || defaultWmo;
                    const currentRain = data.hourly.precipitation_probability[0] || 0;
                    
                    document.getElementById('weather-temp').textContent = Math.round(data.current.temperature_2m) + '°';
                    document.getElementById('weather-desc').textContent = currentInfo.text;
                    
                    // 🟢 Utilisation de innerHTML pour injecter le SVG
                    document.getElementById('weather-icon').innerHTML = currentInfo.icon; 
                    
                    document.getElementById('weather-wind').innerHTML = Math.round(data.current.wind_speed_10m) + '<small>km/h</small>';
                    document.getElementById('weather-rain').textContent = currentRain + '%';
                    
                    // 2. Génération de la timeline horizontale (Pilules)
                    const hourlyContainer = document.getElementById('weather-hourly-container');
                    hourlyContainer.innerHTML = '';
                    
                    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

                    for (let i = 0; i < 24; i++) {
                        const time = new Date(data.hourly.time[i]);
                        const hourStr = time.getHours().toString().padStart(2, '0') + 'h';
                        
                        const temp = Math.round(data.hourly.temperature_2m[i]);
                        const pop = data.hourly.precipitation_probability[i];
                        const wind = Math.round(data.hourly.wind_speed_10m[i]);
                        const windDir = data.hourly.wind_direction_10m[i]; 
                        const code = data.hourly.weather_code[i];
                        const info = wmo[code] || defaultWmo;
                        
                        const dirIndex = Math.round(windDir / 45) % 8;
                        const dirStr = directions[dirIndex];
                        
                        const card = document.createElement('div');
                        card.className = 'mz-hr';
                        const isNow = i === 0;
                        card.innerHTML = `<div class="h${isNow ? ' now' : ''}">${isNow ? 'Maint.' : hourStr}</div><div class="ic">${info.icon}</div><div class="tp">${temp}°</div><div class="rn">${pop}%</div>`;
                        hourlyContainer.appendChild(card);
                    }
                }
            };
