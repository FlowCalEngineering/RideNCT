/* MODE ROUTE — commandes vocales « intelligentes » : destination, lieux les plus proches, infos de trajet.
   S'appuie sur VoiceNLU (route/voix.js, compréhension locale) et sur les recherches de la carte (adresses, lieux, hors ligne). Charger après route.js. */
Object.assign(ModuleRoute, {
    pending: null,           // { cands, idx, until, title } : proposition en attente de « oui » / « non » / toucher
    CAT_QS: { cafe: ['café', 'bar', 'pub'], resto: ['restaurant', 'pizzeria', 'brasserie'], fuel: ['station service', 'station', 'carburant'] },
    CAT_RADIUS: { fuel: 40, hopital: 40, garage: 40, hotel: 40 },   // km ; 15 par défaut

    pendingOk() { return !!this.pending && Date.now() < this.pending.until; },
    refPos() {
        try { const G = ModuleGPS, s = G.state; if (s.lastKnownCoords) return s.lastKnownCoords; if (s.map) { const c = s.map.getCenter(); return [c.lng, c.lat]; } } catch (e) {}
        return null;
    },
    dkm(a, b) { try { return ModuleGPS.poiDistKm(a, b); } catch (e) { return 0; } },
    fmtKm(km) { return AppUnits.short(km * 1000); },
    speakable(t) { return String(t).replace(/\bkm\b/g, 'kilomètres').replace(/\bmi\b/g, 'miles').replace(/\bm\b/g, 'mètres').replace(/(\d),(\d)/g, '$1 virgule $2'); },
    /* Voix de l'appli (le micro est coupé pendant qu'elle parle). Seulement si la confirmation n'est pas réglée sur « visuel seulement ». */
    speak(text) {
        if (this.fbMode() === 'none' || !('speechSynthesis' in window)) return;
        try { const u = new SpeechSynthesisUtterance(this.speakable(text)); u.lang = 'fr-FR'; this.quiet = Date.now() + 8000; u.onend = () => { this.quiet = Date.now() + 600; }; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
    },
    fail(msg) { this.pill('ko', msg, 3500); this.speak(msg); },

    /* Variantes d'une adresse mal entendue : on retire peu à peu ce qui peut être du bruit (début abîmé, numéro, fin) */
    destVariants(q) {
        const t = q.trim().split(/\s+/), out = [q];
        const add = (a) => { const v = a.join(' ').trim(); if (v.length >= 3 && !out.includes(v)) out.push(v); };
        if (t.length > 1) add(t.slice(1));
        if (/^\d+$/.test(t[0]) && t.length > 2) add(t.slice(1));                       // sans le numéro
        if (t.length > 3) add(t.slice(-3));                                              // rue + ville
        if (t.length > 2) add(t.slice(0, -1));                                           // sans le dernier mot
        if (t.length > 1) add(t.slice(-1));                                              // la ville seule
        return out.slice(0, 5);
    },
    async geocodeSmart(q) {
        const vs = this.destVariants(q);
        for (let i = 0; i < vs.length; i++) {
            const r = await this.geocode(vs[i]);
            if (r && r.length) { if (i > 0) r.forEach(x => { x.ctx = [x.ctx, 'approximatif'].filter(Boolean).join(' · '); }); return r; }
        }
        return [];
    },
    startNav(dest, fuzzy) {
        this.cancelPending(true); this.destMode = 0; this.pill('armed', 'Recherche…', 20000);
        this.geocodeSmart(dest).then(c => {
            c = c || []; const rc = this.matchRecent(dest).map(x => Object.assign({}, x, { ctx: 'Récent' })); rc.forEach(x => { c = c.filter(y => !(y.name === x.name || this.dkm(y.coords, x.coords) < .3)); }); c = rc.slice(0, 1).concat(c);
            if (!c.length) { this.fail('Introuvable : ' + dest + ' · dis « autre adresse »'); return; }
            const ref = this.refPos(); c.forEach(x => { x.km = ref ? this.dkm(ref, x.coords) : null; }); this.propose(c.slice(0, 3), 'Aller à', dest);
        }).catch(() => this.fail('Recherche impossible'));
    },
    /* L'adresse n'est pas la bonne / introuvable : on réécoute directement l'adresse (pas besoin de répéter « emmène-moi à ») */
    askDest() {
        this.cancelPending(true); this.destMode = Date.now() + 15000; this.armedUntil = this.destMode;
        this.pill('armed', 'Dis l\'adresse', 15000); this.speak('Quelle adresse ?');
    },

    /* ---------- recherche d'une destination (adresses BAN + lieux Photon, ou cartes téléchargées) ---------- */
    async geocode(q) {
        const G = ModuleGPS, ref = this.refPos(), bias = ref ? `&lat=${ref[1].toFixed(4)}&lon=${ref[0].toFixed(4)}` : '';
        const offline = async () => { try { if (typeof OfflineGeo === 'undefined') return []; await OfflineGeo.ready(true); return (await OfflineGeo.search(q, ref, 4)).map(h => ({ name: h.main, ctx: h.ctx, coords: h.coords })); } catch (e) { return []; } };
        if (G.isOffline && G.isOffline()) return offline();
        const [ban, pho] = await Promise.allSettled([
            G.poiFetchJSON(`${G.BAN_API}?q=${encodeURIComponent(q)}&limit=4${bias}`, 8000),
            G.poiFetchJSON(`${G.PHOTON_API}?q=${encodeURIComponent(q)}&limit=4&lang=fr${bias}`, 8000)
        ]);
        const out = [];
        const add = (name, ctx, coords, src) => { if (name && coords) out.push({ name, ctx, coords, src }); };
        if (pho.status === 'fulfilled' && pho.value && pho.value.features) pho.value.features.forEach(f => {
            const p = f.properties || {}; let main = p.name || ''; if (p.housenumber && p.street) main = `${p.housenumber} ${p.street}`; else if (!main && p.street) main = p.street;
            const sub = []; if (p.city && p.city !== main) sub.push(p.city); if (p.postcode) sub.push(p.postcode);
            add(main || sub.shift(), sub.join(' · '), f.geometry.coordinates, 'photon');
        });
        if (ban.status === 'fulfilled' && ban.value && ban.value.features) ban.value.features.forEach(f => { const p = f.properties || {}; add(p.name || p.label, [p.postcode, p.city].filter(Boolean).join(' '), f.geometry.coordinates, 'ban'); });
        const hasNum = /\d/.test(q); out.sort((a, b) => (hasNum ? (a.src === 'ban' ? 0 : 1) - (b.src === 'ban' ? 0 : 1) : 0));
        const seen = new Set(), uniq = out.filter(r => { const k = r.name.toLowerCase() + '|' + r.coords.map(v => v.toFixed(2)).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
        if (!uniq.length && ban.status === 'rejected' && pho.status === 'rejected') return offline();
        return uniq;
    },

    /* ---------- lieu le plus proche (café, resto, essence…) ---------- */
    async nearby(cat) {
        const G = ModuleGPS, def = VoiceNLU.CATS[cat], ref = this.refPos(); if (!def || !ref) return null;
        const R = this.CAT_RADIUS[cat] || 15, dLat = R / 111, dLon = R / (111 * Math.cos(ref[1] * Math.PI / 180));
        const bbox = [ref[0] - dLon, ref[1] - dLat, ref[0] + dLon, ref[1] + dLat].map(v => v.toFixed(5)).join(',');
        const out = [];
        const push = (name, ctx, coords) => { if (coords) out.push({ name: name || def.label, ctx: ctx || '', coords, km: this.dkm(ref, coords) }); };
        // Déjà chargés par le radar de la carte (stations officielles, restos, cafés)
        const key = { cafe: 'drink', resto: 'food', fuel: 'fuel' }[cat];
        try { if (key && G.state.poiWide) G.state.poiWide.forEach(f => { if (f.properties.cat === key) push(f.properties.name, f.properties.ville || f.properties.adresse, f.geometry.coordinates); }); } catch (e) {}
        const offline = G.isOffline && G.isOffline();
        if (!offline) {
            const qs = this.CAT_QS[cat] || [def.q];
            const rs = await Promise.allSettled(qs.map(q => G.poiFetchJSON(`${G.PHOTON_API}?q=${encodeURIComponent(q)}&lat=${ref[1].toFixed(5)}&lon=${ref[0].toFixed(5)}&bbox=${bbox}&limit=30&lang=fr` + def.tags.map(t => '&osm_tag=' + encodeURIComponent(t)).join(''), 10000)));
            rs.forEach(r => { if (r.status === 'fulfilled' && r.value && r.value.features) r.value.features.forEach(f => { const p = f.properties || {}; push(p.name, [p.street, p.city || p.town || p.village].filter(Boolean).join(', '), f.geometry && f.geometry.coordinates); }); });
        }
        if (!out.length) { try { if (typeof OfflineGeo !== 'undefined') { await OfflineGeo.ready(true); (await OfflineGeo.search(def.q, ref, 10)).forEach(h => push(h.main, h.ctx, h.coords)); } } catch (e) {} }
        out.sort((a, b) => a.km - b.km);
        const seen = new Set(); const uniq = out.filter(r => { const k = r.name.toLowerCase() + '|' + r.coords.map(v => v.toFixed(3)).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
        return uniq.filter(r => r.km <= R * 1.5).slice(0, 3);
    },

    /* ---------- proposition, confirmation (voix ou toucher) ---------- */
    propose(cands, title, heard) {
        this.pending = { cands, idx: 0, until: Date.now() + 30000, title, heard };
        this.armedUntil = Date.now() + 30000;
        this.renderSheet();
        const c = cands[0]; this.pill('armed', 'Confirmer ?', 30000);
        this.speak(`${c.name}${c.km != null ? ', à ' + this.fmtKm(c.km) : ''}. On y va ?`);
    },
    renderSheet() {
        let sh = this.$('rm-vsheet'); const P = this.pending;
        if (!sh) { sh = document.createElement('div'); sh.id = 'rm-vsheet'; sh.className = 'rm-vsheet'; sh.hidden = true; this.$('rm').appendChild(sh); }
        if (!P) { sh.hidden = true; return; }
        sh.innerHTML = '';
        const h = document.createElement('div'); h.className = 'rm-sheet-h'; h.textContent = P.title; sh.appendChild(h);
        if (P.kind === 'invite') {
            const inv = P.inv, row = document.createElement('div'); row.className = 'rm-inv';
            const a = document.createElement('i'); a.textContent = (inv.senderName || '?').charAt(0).toUpperCase(); if (inv.avatarSrc) { a.textContent = ''; const im = document.createElement('img'); im.src = inv.avatarSrc; im.alt = ''; a.appendChild(im); }
            const t = document.createElement('span'); const nm = document.createElement('b'); nm.textContent = inv.senderName; const sm = document.createElement('small'); sm.textContent = 'Groupe : ' + inv.roomName; t.append(nm, sm); row.append(a, t); sh.appendChild(row);
            const bx = document.createElement('div'); bx.className = 'rm-invb';
            const no = document.createElement('button'); no.type = 'button'; no.className = 'rm-invno'; no.textContent = 'Refuser'; no.addEventListener('click', () => { const r = this.refuseInvite(inv); this.pill('ok', typeof r === 'string' ? r : r.label, 2000); });
            const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'rm-invok'; ok.textContent = 'Accepter'; ok.addEventListener('click', () => { const r = this.acceptInvite(inv); this.pill(typeof r === 'string' ? 'ko' : 'ok', typeof r === 'string' ? r.replace(/^!/, '') : r.label, 2500); });
            bx.append(no, ok); sh.appendChild(bx);
            const x0 = document.createElement('button'); x0.type = 'button'; x0.className = 'rm-sheet-x'; x0.textContent = 'Plus tard'; x0.addEventListener('click', () => this.cancelPending()); sh.appendChild(x0);
            sh.hidden = false; clearTimeout(this._pendT); this._pendT = setTimeout(() => { if (this.pending === P) this.cancelPending(true); }, 45000); return;
        }
        if (P.heard) { const hd = document.createElement('div'); hd.className = 'rm-heard'; hd.textContent = 'J\'ai compris : « ' + P.heard + ' »'; sh.appendChild(hd); }
        P.cands.forEach((c, i) => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'rm-cand' + (i === P.idx ? ' first' : '');
            const n = document.createElement('i'); n.textContent = String(i + 1);
            const t = document.createElement('span'); const nm = document.createElement('b'); nm.textContent = c.name; const sm = document.createElement('small'); sm.textContent = [c.km != null ? this.fmtKm(c.km) : '', c.ctx].filter(Boolean).join(' · '); t.append(nm, sm);
            b.append(n, t); b.addEventListener('click', () => this.confirm(i)); sh.appendChild(b);
        });
        if (P.heard) { const o = document.createElement('button'); o.type = 'button'; o.className = 'rm-other'; o.textContent = 'Ce n\'est pas ça · dire l\'adresse'; o.addEventListener('click', () => this.askDest()); sh.appendChild(o); }
        const x = document.createElement('button'); x.type = 'button'; x.className = 'rm-sheet-x'; x.textContent = 'Annuler'; x.addEventListener('click', () => this.cancelPending()); sh.appendChild(x);
        sh.hidden = false;
        clearTimeout(this._pendT); this._pendT = setTimeout(() => { if (this.pending === P) this.cancelPending(true); }, 30000);
    },
    cancelPending(silent) { this.pending = null; clearTimeout(this._pendT); this.armedUntil = 0; const sh = this.$('rm-vsheet'); if (sh) sh.hidden = true; if (!silent) this.pill(this.rec ? 'listen' : null); },
    async confirm(i) {
        const P = this.pending; if (!P || !P.cands[i]) return; const c = P.cands[i];
        this.cancelPending(true); this.pill('ok', 'En route : ' + c.name, 2500); if (c.name !== 'Maison' && c.name !== 'Travail') this.remember(c);
        try { this.ensureMap(); await ModuleGPS.navigateToPOI(c.name, c.coords[1], c.coords[0]); } catch (e) { this.fail('Navigation impossible'); }
    },

    /* ---------- infos de trajet ---------- */
    navInfo() {
        const g = id => ((this.$(id) || {}).textContent || '').trim(), hud = this.$('nav-instruction-hud');
        const on = !!(hud && hud.style.display !== 'none' && g('nt-eta') && g('nt-eta') !== '--:--');
        return { on, eta: g('nt-eta'), time: g('nt-time'), dist: g('nt-dist') + ' ' + (AppUnits.distLabel()) };
    },
    hm(s) { return String(s).replace(':', ' heures ').replace(/\s0(\d)$/, ' $1'); },

    /* ---------- lieux mémorisés (maison, travail) et destinations récentes : tout reste sur le téléphone ---------- */
    PL_KEY: 'moto_rm_places', RC_KEY: 'moto_rm_recent',
    places() { return AppStore.obj(this.PL_KEY); },
    savePlace(k, v) { const p = this.places(); p[k] = v; try { localStorage.setItem(this.PL_KEY, JSON.stringify(p)); } catch (e) {} },
    recents() { return AppStore.arr(this.RC_KEY, true); },
    remember(c) {
        const l = this.recents().filter(x => x.name !== c.name); l.unshift({ name: c.name, ctx: c.ctx || '', coords: c.coords }); 
        try { localStorage.setItem(this.RC_KEY, JSON.stringify(l.slice(0, 8))); } catch (e) {}
    },
    matchRecent(q) {
        const fq = VoiceNLU.flat(q).trim().split(/\s+/).filter(t => t && !VoiceNLU.STOP.includes(t)); if (!fq.length) return [];
        return this.recents().filter(r => { const fr = VoiceNLU.flat(r.name).trim().split(/\s+/); return fq.every(t => fr.some(w => w === t || w.startsWith(t) || (t.length >= 4 && VoiceNLU.lev(w, t) <= 1))); });
    },


    /* ---------- invitations à un groupe vocal : feuille « Accepter / Refuser », voix oui / non ---------- */
    invites() { try { return (ModuleIntercom.state.receivedInvites || []).slice().sort((a, b) => b.time - a.time); } catch (e) { return []; } },
    pickInvite(who) {
        const l = this.invites(); if (!l.length) return null; if (!who) return l[0];
        const w = VoiceNLU.flat(who).trim();
        return l.find(i => VoiceNLU.flat(i.senderName).split(/\s+/).some(t => t === w || (w.length >= 4 && VoiceNLU.lev(t, w) <= 1))) || l[0];
    },
    hookInvites() {
        let I = null; try { I = ModuleIntercom; } catch (e) {}
        if (!I || !I.receiveInvite) { if (!this._hookTry || this._hookTry < 20) { this._hookTry = (this._hookTry || 0) + 1; setTimeout(() => this.hookInvites(), 500); } return; }
        if (I.receiveInvite._rm) return;
        const orig = I.receiveInvite, self = this;
        I.receiveInvite = function () { const r = orig.apply(this, arguments); try { self.onInvite(); } catch (e) { console.warn('Invitation :', e); } return r; };
        I.receiveInvite._rm = true;
    },
    onInvite() {
        if (!this.$('rm') || (!this.active && !this.rec)) return;          // l'écran Route n'est pas en service : la notification de l'appli suffit
        if (this.pending && this.pending.kind !== 'invite') return;        // une destination est en cours de confirmation : l'invitation reste dans « Invitations »
        this.showInvite();
    },
    showInvite(inv) {
        inv = inv || this.invites()[0]; if (!inv) return false;
        const n = this.invites().length;
        this.pending = { kind: 'invite', inv, cands: [], idx: 0, until: Date.now() + 45000, title: 'Invitation de groupe' + (n > 1 ? ' (' + n + ')' : '') };
        this.armedUntil = Date.now() + 45000; this.renderSheet(); this.pill('armed', 'Accepter ?', 45000);
        this.speak(`${inv.senderName} t'invite dans le groupe ${inv.roomName}. Tu acceptes ?`); return true;
    },
    acceptInvite(inv) {
        if (!inv) return '!Aucune invitation en attente';
        try { ModuleIntercom.state.receivedInvites = ModuleIntercom.state.receivedInvites.filter(i => i.id !== inv.id); } catch (e) {}
        this.cancelPending(true);
        try { ModuleIntercom.renderReceivedInvites(); } catch (e) {}
        try { ModuleIntercom.connectToRoom(inv.roomName, 'Invité', inv.roomCode, inv.isPrivate !== false, { pin: inv.pin, allowed: inv.from ? [inv.from] : [] }); } catch (e) { return '!Connexion impossible'; }
        return { label: 'Groupe : ' + inv.roomName, say: 'Tu rejoins ' + inv.roomName };
    },
    refuseInvite(inv) {
        if (!inv) return '!Aucune invitation en attente';
        try { ModuleIntercom.state.receivedInvites = ModuleIntercom.state.receivedInvites.filter(i => i.id !== inv.id); } catch (e) {}
        this.cancelPending(true);
        try { ModuleIntercom.renderReceivedInvites(); } catch (e) {}
        const next = this.invites()[0]; if (next) setTimeout(() => this.showInvite(next), 1200);
        return 'Invitation refusée';
    },
    /* ---------- infos parlées : météo détaillée, compteur, position, batterie… ---------- */
    say(label, say) { return { label, say: say || label, ms: 4500 }; },
    txt(id) { return ((this.$(id) || {}).textContent || '').trim(); },
    weatherAbout(what) {
        let d = null; try { d = ModuleMapWeather.state.data; } catch (e) {} if (!d || !d.current) return '!Météo indisponible';
        const c = d.current, u = AppUnits.speedLabel(), t = Math.round(c.temperature_2m), w = AppUnits.spd(c.wind_speed_10m);
        const spk = (x) => x + (u === 'mph' ? ' miles à l\'heure' : ' kilomètres heure');
        if (what === 'vent') return this.say('Vent ' + w + ' ' + u, 'Le vent souffle à ' + spk(w));
        if (what === 'pluie') {
            const H = d.hourly; if (!H || !H.time) return '!Prévisions indisponibles';
            const t0 = new Date(c.time).getTime(); let i0 = H.time.findIndex(x => new Date(x).getTime() >= t0 - 1800000); if (i0 < 0) i0 = 0;
            let best = 0, at = i0; for (let i = i0; i < Math.min(i0 + 6, H.time.length); i++) { const p = H.precipitation_probability[i] || 0; if (p > best) { best = p; at = i; } }
            if (best < 30) return this.say('Pas de pluie prévue', 'Pas de pluie prévue dans les six prochaines heures');
            const h = H.time[at].slice(11, 13) * 1, delta = Math.max(0, Math.round((new Date(H.time[at]).getTime() - t0) / 3600000));
            return this.say(Math.round(best) + ' % de pluie vers ' + h + ' h', 'Risque de pluie de ' + Math.round(best) + ' pour cent' + (delta ? ', dans environ ' + delta + (delta > 1 ? ' heures' : ' heure') : ', maintenant'));
        }
        if (what === 'temp') return this.say(t + '° · ressenti ' + Math.round(c.apparent_temperature != null ? c.apparent_temperature : t) + '°', 'Il fait ' + t + ' degrés');
        return { label: t + '° · vent ' + w + ' ' + u, say: 'Il fait ' + t + ' degrés, vent ' + w + (u === 'mph' ? ' miles à l\'heure' : ' kilomètres heure'), ms: 4000 };
    },
    whereAmI() {
        const ref = this.refPos(); if (!ref) return '!Position introuvable';
        const G = ModuleGPS; if (G.isOffline && G.isOffline()) return '!Hors ligne : position non nommée';
        this.pill('armed', 'Je regarde…', 8000);
        G.poiFetchJSON(`${String(G.PHOTON_API).replace(/api\/?$/, 'reverse')}?lon=${ref[0].toFixed(5)}&lat=${ref[1].toFixed(5)}&lang=fr&limit=1`, 8000).then(r => {
            const p = r && r.features && r.features[0] && r.features[0].properties; if (!p) return this.fail('Lieu inconnu');
            const t = [p.street || p.name, p.city || p.town || p.village || p.county].filter(Boolean).join(', ');
            this.pill('ok', t, 5000); this.speak('Tu es ' + (p.street ? 'sur ' : 'à ') + t);
        }).catch(() => this.fail('Position indisponible'));
        return 'Où suis-je ?';
    },
    battery() {
        if (!navigator.getBattery) return '!Batterie : information indisponible';
        navigator.getBattery().then(b => { const p = Math.round(b.level * 100); this.pill('ok', 'Batterie ' + p + ' %' + (b.charging ? ' · en charge' : ''), 4500); this.speak('Batterie à ' + p + ' pour cent' + (b.charging ? ', en charge' : '')); }).catch(() => this.fail('Batterie indisponible'));
        return 'Batterie';
    },
    members() {
        let st = null; try { st = ModuleIntercom.state; } catch (e) {} if (!st || !st.isConnected) return '!Tu n\'es dans aucun groupe';
        const names = (st.participants || []).map(p => p.senderName || '?'), n = names.length + 1;
        if (!names.length) return this.say('Tu es seul dans le groupe', 'Tu es seul dans le groupe');
        return this.say(n + ' personnes : ' + names.join(', '), n + ' personnes dans le groupe : ' + names.join(', ') + ' et toi');
    },
    inviteRider(name) {
        let st = null; try { st = ModuleIntercom.state; } catch (e) {} if (!st || !st.isConnected) return '!Rejoins d\'abord un groupe pour inviter';
        let rs = []; try { rs = ModuleCommunity.nearRiders(); } catch (e) {}
        const nm = (r) => { try { const p = ModuleCommunity.state.profiles.get(r.id); return (p && p.name) || r.name || ''; } catch (e) { return r.name || ''; } };
        const w = VoiceNLU.flat(name).trim(), hit = rs.find(r => VoiceNLU.flat(nm(r)).split(/\s+/).some(t => t === w || (w.length >= 4 && VoiceNLU.lev(t, w) <= 1)));
        if (!hit) return '!Aucun motard « ' + name + ' » à proximité';
        try { ModuleIntercom.api.sendInvite(hit.id, st.currentRoomName, st.currentCode); } catch (e) { return '!Invitation impossible'; }
        return this.say('Invitation envoyée à ' + nm(hit), 'Invitation envoyée à ' + nm(hit));
    },

    /* ---------- point d'entrée : phrase brute → action ; renvoie un libellé, « !message », un objet {label, say} ou null ---------- */
    understand(raw) {
        if (typeof VoiceNLU === 'undefined') return null;
        if (this.destMode && Date.now() < this.destMode) {   // on attendait l'adresse
            const f0 = VoiceNLU.flat(raw).trim();
            if (/^(non|annule|laisse tomber|laisse|stop|oublie)\b/.test(f0) && f0.split(/\s+/).length <= 3) { this.destMode = 0; this.armedUntil = 0; return 'Annulé'; }
            const q = VoiceNLU.parse(raw, {});
            if (q && q.intent !== 'nav_to' && q.intent !== 'redo') this.destMode = 0;   // une vraie commande (zoom, musique…) : on ne la prend pas pour une adresse
            else { const dest = q && q.intent === 'nav_to' ? q.dest : VoiceNLU.cleanDest(VoiceNLU.cleanTail(raw)); if (dest.length >= 2) { this.startNav(dest); return 'Recherche : ' + dest; } }
        }
        if (this.sug && Date.now() < this.sug.until && /^(oui|ouais|ok|c est ca|exact|voila|c est bon|vas y)\b/.test(VoiceNLU.flat(raw).trim())) {
            const t = this.sug.text; this.sug = null; this.armedUntil = 0;
            return this.understand(t) || this.command(this.norm(t));
        }
        const r = VoiceNLU.parse(raw, { pending: this.pendingOk() }); if (!r) return null;
        const G = (() => { try { return ModuleGPS; } catch (e) { return null; } })(), map = () => { this.goto('map'); return G && G.state.map; };
        switch (r.intent) {
            case 'cmd': if (r.cmd === 'rejoins le groupe' && this.invites().length) return this.acceptInvite(this.pickInvite()); return this.command(r.cmd);
            case 'save_place': {
                const ref = this.refPos(); if (!ref) return '!Position introuvable';
                this.savePlace(r.place, { name: r.place === 'home' ? 'Maison' : 'Travail', coords: ref }); return r.place === 'home' ? 'Maison enregistrée' : 'Travail enregistré';
            }
            case 'go_place': {
                const pl = this.places()[r.place]; const nm = r.place === 'home' ? 'Maison' : 'Travail';
                if (!pl || !pl.coords) return '!' + nm + ' non enregistré : dis « enregistre ici comme ' + (r.place === 'home' ? 'maison' : 'travail') + ' »';
                const ref = this.refPos(); this.cancelPending(true);
                this.propose([{ name: nm, ctx: 'Lieu enregistré', coords: pl.coords, km: ref ? this.dkm(ref, pl.coords) : null }], 'Aller à'); return 'Direction ' + nm.toLowerCase();
            }
            case 'yes': if (this.pending && this.pending.kind === 'invite') return this.acceptInvite(this.pending.inv); this.confirm(this.pending.idx || 0); return 'On y va';
            case 'no': if (this.pending && this.pending.kind === 'invite') return this.refuseInvite(this.pending.inv); this.cancelPending(); return 'Annulé';
            case 'invite_accept': return this.acceptInvite(this.pickInvite(r.who));
            case 'invite_refuse': return this.refuseInvite(this.pickInvite(r.who));
            case 'invite_list': { const l = this.invites(); if (!l.length) return this.say('Aucune invitation en attente'); this.showInvite(l[0]); return l.length + ' invitation' + (l.length > 1 ? 's' : ''); }
            case 'members': return this.members();
            case 'invite_rider': return this.inviteRider(r.name);
            case 'invite_open': this.goto('intercom'); try { ModuleIntercom.showInviteHud(); } catch (e) {} return 'Inviter un motard';
            case 'meet': {
                let on = false; try { on = !!ModuleIntercom.state.autoModeActive; } catch (e) {}
                if (r.on === null || r.on !== on) { this.goto('intercom'); const b = this.$('rm-meet'); if (b) b.click(); return on ? 'Mode rencontre coupé' : 'Mode rencontre activé'; }
                return on ? '!Mode rencontre déjà activé' : '!Mode rencontre déjà coupé';
            }
            case 'volume_set': { try { ModuleMusic.setVolume(r.level / 100, true); } catch (e) { return '!Musique indisponible'; } return 'Volume ' + r.level + ' %'; }
            case 'volume_get': { let v = null; try { v = Math.round(ModuleMusic.state.volume * 100); } catch (e) {} return v === null ? '!Volume inconnu' : this.say('Volume ' + v + ' %', 'Le volume est à ' + v + ' pour cent'); }
            case 'track_info': { let t = null; try { t = ModuleMusic.current(); } catch (e) {} if (!t) return '!Aucun titre en lecture'; return this.say(t.title + (t.artist ? ' · ' + t.artist : ''), t.title + (t.artist ? ', de ' + t.artist : '')); }
            case 'shuffle': try { ModuleMusic.toggleShuffle(); return ModuleMusic.state.shuffle ? 'Lecture aléatoire' : 'Aléatoire coupé'; } catch (e) { return '!Musique indisponible'; }
            case 'repeat': try { ModuleMusic.cycleRepeat(); return ['Répétition coupée', 'Répéter la liste', 'Répéter ce titre'][ModuleMusic.state.repeat]; } catch (e) { return '!Musique indisponible'; }
            case 'speed_now': { const v = this.txt('ui-speed') || '0', u = AppUnits.speedLabel(); return this.say(v + ' ' + u, 'Tu roules à ' + v + (u === 'mph' ? ' miles à l\'heure' : ' kilomètres heure')); }
            case 'trip_dist': { const v = this.txt('ui-distance'); if (!v) return '!Distance inconnue'; return this.say(v, 'Distance parcourue : ' + this.speakable(v)); }
            case 'engine_hours': { const v = this.txt('ui-engine-hours'); if (!v) return '!Durée inconnue'; return this.say(v, 'Temps de roulage : ' + v.replace(/h$/, ' heures').replace('.', ' virgule ')); }
            case 'battery': return this.battery();
            case 'speed_limit': { const e = this.$('nt-limit'); const v = e && e.style.display !== 'none' ? e.textContent.trim() : ''; if (!v || v === '--') return '!Limite inconnue ici'; return this.say('Limite ' + v, 'La limite est de ' + v); }
            case 'next_turn': { const i = this.navInfo(); if (!i.on) return '!Aucun itinéraire en cours'; const t = [this.txt('nav-distance'), this.txt('nav-label'), this.txt('nav-street')].filter(Boolean).join(' · '); return this.say(t, [this.speakable(this.txt('nav-distance')), this.txt('nav-label'), this.txt('nav-street')].filter(Boolean).join(', ')); }
            case 'where_am_i': return this.whereAmI();
            case 'pick':
                if (r.n === 'next') { this.pending.idx = (this.pending.idx + 1) % this.pending.cands.length; this.renderSheet(); const c = this.pending.cands[this.pending.idx]; this.speak(`${c.name}${c.km != null ? ', à ' + this.fmtKm(c.km) : ''}. On y va ?`); return 'Autre choix'; }
                if (this.pending.cands[r.n - 1]) { this.confirm(r.n - 1); return 'Choix ' + r.n; }
                return '!Choix inconnu';
            case 'zoom_in': { const m = map(); if (m) m.zoomIn(); return 'Zoom avant'; }
            case 'zoom_out': { const m = map(); if (m) m.zoomOut(); return 'Zoom arrière'; }
            case 'recenter': map(); this.recenter(); return 'Carte recentrée';
            case 'stop_nav': { const i = this.navInfo(); if (!i.on) return '!Aucun itinéraire en cours'; try { G.clearRoute(); } catch (e) {} return 'Itinéraire supprimé'; }
            case 'eta': {
                const i = this.navInfo();
                if (!i.on) { const d = new Date(), t = d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0'); return { label: 'Il est ' + t, say: 'Il est ' + d.getHours() + ' heures ' + d.getMinutes() }; }
                return r.what === 'duree' ? { label: 'Encore ' + i.time, say: 'Il reste ' + i.time } : { label: 'Arrivée à ' + i.eta, say: 'Arrivée à ' + this.hm(i.eta) };
            }
            case 'remaining': { const i = this.navInfo(); if (!i.on) return '!Aucun itinéraire en cours'; return { label: 'Il reste ' + i.dist, say: 'Il reste ' + i.dist }; }
            case 'weather': return this.weatherAbout(r.what);
            case 'nav_to': this.startNav(r.dest, r.fuzzy); return 'Direction ' + r.dest;
            case 'redo': this.askDest(); return 'Autre adresse';
            case 'nearest': {
                const def = VoiceNLU.CATS[r.cat]; this.cancelPending(true); this.pill('armed', 'Recherche…', 15000);
                if (!this.refPos()) return '!Position introuvable';
                this.nearby(r.cat).then(c => { if (!c || !c.length) return this.fail('Aucun ' + def.label.toLowerCase() + ' trouvé à proximité'); this.propose(c, def.label + ' le plus proche'); }).catch(() => this.fail('Recherche impossible'));
                return def.label + ' le plus proche';
            }
        }
        return null;
    }
});

(() => { const i0 = ModuleRoute.init; ModuleRoute.init = function () { const r = i0.apply(this, arguments); this.hookInvites(); return r; }; })();
