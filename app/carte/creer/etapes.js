// Créer : étapes réorganisables (poignée), repères déplaçables sur la carte, raccourcis Domicile / Travail
// Étend ModuleGPS : ce fichier doit être chargé APRÈS creer.js et recherche.js.
(function () {
    const FAV_KEY = 'moto_fav_places';
    const favs = () => { const f = AppStore.get(FAV_KEY, null); return (f && typeof f === 'object' && !Array.isArray(f)) ? f : {}; };
    const FAV_LABEL = { home: 'Domicile', work: 'Travail' };

    // ---- Wrappers : on complète les fonctions existantes sans les réécrire ----
    const _add = ModuleGPS.addWaypointField;
    const _check = ModuleGPS.checkAndCalculate;
    const _clear = ModuleGPS.clearRoute;
    const _render = ModuleGPS.renderPlaceSuggestions;
    const _pick = ModuleGPS.pickPlace;
    const _open = ModuleGPS.openPlaceSearch;

    Object.assign(ModuleGPS, {
        addWaypointField() {
            _add.apply(this, arguments);
            this.attachStepGrip(document.getElementById('wrap-wp-step-' + this.state.waypointCounter));
        },
        checkAndCalculate() { const r = _check.apply(this, arguments); this.renderRouteMarkers(); return r; },
        clearRoute() { const r = _clear.apply(this, arguments); this.autoStart(); this.renderRouteMarkers(); return r; },

        // ---------- 1. Poignée pour réordonner les étapes ----------
        attachStepGrip(wrap) {
            if (!wrap || wrap.querySelector('.wp-grip')) return;
            const g = document.createElement('button');
            g.type = 'button'; g.className = 'wp-grip'; g.setAttribute('aria-label', 'Déplacer cette étape'); g.textContent = '⠿';
            wrap.insertBefore(g, wrap.firstChild);
            let moved = false;
            g.addEventListener('pointerdown', (e) => {
                e.preventDefault(); moved = false;
                try { g.setPointerCapture(e.pointerId); } catch (_) {}
                wrap.classList.add('wp-dragging');
            });
            g.addEventListener('pointermove', (e) => {
                if (!wrap.classList.contains('wp-dragging')) return;
                const others = [...document.querySelectorAll('#waypoints-container .input-wrapper[id^="wrap-wp-step-"]')].filter(w => w !== wrap);
                for (const o of others) {
                    const r = o.getBoundingClientRect();
                    if (e.clientY > r.top && e.clientY < r.bottom) {
                        const before = e.clientY < r.top + r.height / 2;
                        const ref = before ? o : o.nextSibling;
                        if (ref !== wrap && wrap.nextSibling !== ref) { o.parentNode.insertBefore(wrap, ref); moved = true; }
                        break;
                    }
                }
            });
            const end = () => {
                if (!wrap.classList.contains('wp-dragging')) return;
                wrap.classList.remove('wp-dragging');
                if (moved) this.checkAndCalculate();
            };
            g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
        },

        // ---------- 2. Repères déplaçables sur la carte ----------
        routeFields() {
            return [...document.querySelectorAll('#waypoints-container .floating-input')].filter(i => this.state.coords[i.id]);
        },
        renderRouteMarkers() {
            const s = this.state;
            (s.routeMarkers || []).forEach(m => { try { m.remove(); } catch (e) {} });
            s.routeMarkers = [];
            if (!s.map || typeof maplibregl === 'undefined') return;
            const fields = this.routeFields();
            if (fields.length < 1) return;
            let step = 0;
            fields.forEach((inp, idx) => {
                const isStart = inp.id === 'input-wp-start', isDest = inp.id === 'input-wp-dest';
                if (!isStart && !isDest) step++;
                const el = document.createElement('div');
                el.className = 'rt-mk ' + (isStart ? 'rt-start' : (isDest ? 'rt-dest' : 'rt-step'));
                el.textContent = isStart ? 'A' : (isDest ? '🏁' : String(step));
                el.setAttribute('aria-label', isStart ? 'Départ' : (isDest ? 'Destination' : 'Étape ' + step));
                const mk = new maplibregl.Marker({ element: el, draggable: !s.isTracking }).setLngLat(s.coords[inp.id]).addTo(s.map);
                const before = s.coords[inp.id];
                mk.on('dragend', () => {
                    if (s.isTracking) { mk.setLngLat(before); return; }
                    const ll = mk.getLngLat();
                    s.coords[inp.id] = [ll.lng, ll.lat];
                    inp.value = '📍 Point déplacé';
                    this.checkAndCalculate();
                });
                s.routeMarkers.push(mk);
            });
        },

        // ---------- 3. Domicile / Travail ----------
        getFavPlaces() { return favs(); },
        setFavPlace(kind, r) {
            const f = favs(); f[kind] = { main: r.main, ctx: r.ctx || '', value: r.value || r.main, coords: r.coords };
            AppStore.set(FAV_KEY, f, true);
        },
        openPlaceSearch(inputId) {
            if (this.state.ps) this.state.ps.defining = null;
            const r = _open.apply(this, arguments);
            // Un point posé à la main n'a pas d'adresse : on affiche l'accueil de la recherche plutôt que de le chercher
            const f = document.getElementById(inputId), ps = this.state.ps;
            if (f && ps && /^📍 Point (déplacé|placé)/.test(f.value)) { ps.seq++; ps.input.value = ''; this.renderPlaceSuggestions(null); }
            return r;
        },
        pickPlace(r) {
            const ps = this.state.ps;
            if (ps && ps.defining) {
                this.setFavPlace(ps.defining, r); ps.defining = null;
                ps.input.value = ''; ps.input.placeholder = 'Adresse précise, ville, lieu…';
                ps.label.textContent = ps.prevLabel || ps.label.textContent;
                this.renderPlaceSuggestions(null); return;
            }
            return _pick.apply(this, arguments);
        },
        favRows() {
            const ps = this.state.ps, f = favs(), frag = document.createDocumentFragment();
            ['home', 'work'].forEach(kind => {
                const v = f[kind];
                const b = document.createElement('button'); b.type = 'button'; b.className = 'ps-item ps-fav';
                b.innerHTML = `<span class="ps-ico"><svg viewBox="0 0 24 24">${kind === 'home'
                    ? '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>'
                    : '<rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>'}</svg></span>`;
                const t = document.createElement('span'); t.className = 'ps-txt';
                const m = document.createElement('span'); m.className = 'ps-main'; m.textContent = FAV_LABEL[kind]; t.appendChild(m);
                const c = document.createElement('span'); c.className = 'ps-ctx'; c.textContent = v ? v.main : 'Toucher pour définir'; t.appendChild(c);
                b.appendChild(t);
                const define = () => {
                    ps.defining = kind; ps.prevLabel = ps.label.textContent; ps.label.textContent = FAV_LABEL[kind];
                    ps.input.value = ''; ps.input.placeholder = 'Adresse de ' + (kind === 'home' ? 'ton domicile' : 'ton travail');
                    this.renderPlaceSuggestions(null); ps.input.focus();
                };
                if (v) {
                    const e = document.createElement('span'); e.className = 'ps-edit'; e.textContent = 'Modifier';
                    e.addEventListener('click', (ev) => { ev.stopPropagation(); define(); });
                    b.appendChild(e);
                    b.addEventListener('click', () => _pick.call(this, v));
                } else b.addEventListener('click', define);
                frag.appendChild(b);
            });
            return frag;
        },
    });

    // Insère les raccourcis en tête de l'écran d'accueil de la recherche
    ModuleGPS.renderPlaceSuggestions = function (items) {
        const ps = this.state.ps;
        _render.apply(this, arguments);
        if (items === null && ps && ps.inputId !== 'ev-place' && !ps.defining) ps.list.insertBefore(this.favRows(), ps.list.firstChild);
        if (ps && ps.defining) {
            // Mode « définir » : on ne propose ni GPS ni carte, seulement la saisie
            ps.list.querySelectorAll('.ps-gps, .ps-map').forEach(n => n.remove());
        }
        if (items === null && ps && ps.defining) {
            const h = document.createElement('div'); h.className = 'ps-msg'; h.textContent = 'Tape l\'adresse puis choisis un résultat : il sera enregistré comme ' + FAV_LABEL[ps.defining].toLowerCase() + '.';
            ps.list.insertBefore(h, ps.list.firstChild);
        }
    };
})();
