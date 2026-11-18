// Croisés : motards rencontrés
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                registerCrossing(r) {
                    const now = Date.now();
                    let c = this.state.crossed[r.id];
                    const isNew = !c || (now - c.last > this.config.newCrossingAfter);
                    if (!c) c = this.state.crossed[r.id] = { id: r.id, first: now, last: now, count: 0, place: '' };
                    if (isNew) {
                        c.count++; c.lat = r.lat; c.lon = r.lon; c.place = '';
                        this.reverseGeocode(r.id, r.lat, r.lon);
                    }
                    c.last = now; c.name = r.name;
                    if (this.state.profiles.get(r.id)) c.profile = this.state.profiles.get(r.id);
                    this.saveCrossed();
                },
                async reverseGeocode(id, lat, lon) {
                    try {
                        const res = await fetchT(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=fr`, {}, 8000);
                        const d = await res.json(); const p = d.features && d.features[0] && d.features[0].properties;
                        if (p && this.state.crossed[id]) { this.state.crossed[id].place = String(p.city || p.town || p.village || p.name || '').slice(0, 60); this.saveCrossed(); this.renderLists(); }
                    } catch (e) {}
                },
                saveCrossed() {
                    const list = Object.values(this.state.crossed).sort((a, b) => b.last - a.last).slice(0, 200);
                    this.state.crossed = {}; list.forEach(c => this.state.crossed[c.id] = c);
                    try { localStorage.setItem('motoapp_crossed_riders', JSON.stringify(this.state.crossed)); }
                    catch (e) { 
                        list.slice(50).forEach(c => { if (c.profile) { c.profile.avatar = null; c.profile.motos.forEach(m => m.photo = null); } });
                        try { localStorage.setItem('motoapp_crossed_riders', JSON.stringify(this.state.crossed)); } catch (e2) {}
                    }
                },
});
