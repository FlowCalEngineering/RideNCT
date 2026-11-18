            // Sécurité : détection de chute (accéléromètre + GPS), alerte plein écran, appel du contact d'urgence, SMS pré-rempli (l'utilisateur envoie),
            // et alerte P2P (rayon 1 km) relayée par le courtier MQTT du radar (rubrique /sos/<cellule>).
            const ModuleSecurity = {
                state: { isArmed: false },
                SENS: {
                    low:  { label: 'Faible',  g: 6.5, kmh: 20, hint: 'Seuls les chocs violents déclenchent l\'alerte (peu de fausses alertes).' },
                    mid:  { label: 'Moyenne', g: 4.5, kmh: 15, hint: 'Compromis recommandé : chute ou choc franc à vitesse de route.' },
                    high: { label: 'Élevée',  g: 3.0, kmh: 8,  hint: 'Détecte les chutes lentes ou légères (plus de risques de fausses alertes).' }
                },
                SOS_KM: 1, CELL: 0.005, CFG_KEY: 'moto_security_cfg', MED_KEY: 'moto_medical',
                cfg: { sens: 'mid', delay: 30, pre: 15, auto: true, contacts: [], share: true, lock: true, smsMed: true },
                med: { blood: '', allergies: '', meds: '', conditions: '', notes: '' }, pre: null,
                buf: [], speeds: [], pos: null, pending: null, alert: null, net: null, netCell: null, incoming: new Map(), motionOn: false,

                init() { this.loadCfg(); this.loadMed(); this.initListeners(); this.renderSettings(); this.render.updateStatus(false); setInterval(() => this.netTick(), 10000); },
                loadCfg() { try { const c = JSON.parse(localStorage.getItem(this.CFG_KEY) || '{}'); this.cfg = Object.assign(this.cfg, c); if (!Array.isArray(this.cfg.contacts)) this.cfg.contacts = []; } catch (e) {} },
                loadMed() { try { const m = JSON.parse(localStorage.getItem(this.MED_KEY) || '{}'); Object.keys(this.med).forEach(k => { if (typeof m[k] === 'string') this.med[k] = m[k].slice(0, 300); }); } catch (e) {} },
                saveMed() { try { localStorage.setItem(this.MED_KEY, JSON.stringify(this.med)); } catch (e) {} this.syncLockCard(); },
                hasMed() { return Object.values(this.med).some(v => v && v.trim()); },
                // Résumé court (écran verrouillé, SMS) : groupe sanguin, allergies, traitements, pathologies
                medSummary(withContact) {
                    const m = this.med, a = [];
                    if (m.blood) a.push('Groupe ' + m.blood);
                    if (m.allergies.trim()) a.push('Allergies : ' + m.allergies.trim());
                    if (m.meds.trim()) a.push('Traitement : ' + m.meds.trim());
                    if (m.conditions.trim()) a.push(m.conditions.trim());
                    if (m.notes.trim()) a.push(m.notes.trim());
                    const c = this.cfg.contacts[0]; if (withContact && c) a.push('Prévenir : ' + c.name + ' ' + c.phone);
                    return a.join(' · ');
                },
                // Android : notification permanente visible écran verrouillé (plugin natif), tant que la surveillance est active
                syncLockCard() {
                    try {
                        const N = this.nat(); if (!N) return;
                        if (this.state.isArmed && this.cfg.lock && this.hasMed() && N.showMedicalCard) N.showMedicalCard({ title: 'Fiche médicale · ' + this.myName(), text: this.medSummary(true) }).catch(() => {});
                        else if (N.hideMedicalCard) N.hideMedicalCard().catch(() => {});
                    } catch (e) {}
                },
                saveCfg() { try { localStorage.setItem(this.CFG_KEY, JSON.stringify(this.cfg)); } catch (e) {} },
                esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
                hex(n) { return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join(''); },
                myName() { try { return (ModuleProfile.state.name || 'Un motard').slice(0, 40); } catch (e) { return 'Un motard'; } },

                // Navigation accueil ↔ sous-pages (comme l'Atelier)
                go(id) {
                    const root = document.getElementById('view-security'); if (!root) return;
                    root.querySelectorAll('.sec-sub-view').forEach(v => v.classList.toggle('active', v.id === id));
                    const home = id === 'sec-sub-home'; root.classList.toggle('sec-home', home);
                    const v = document.getElementById(id); document.getElementById('sec-pagetitle-t').textContent = (v && v.dataset.title) || 'Sécurité';
                    root.scrollTop = 0;
                },
                homeInfo() {
                    const $ = (i) => document.getElementById(i), n = this.cfg.contacts.length, set = (i, t, c) => { const e = $(i); if (e) { e.textContent = t; e.className = 's' + (c ? ' ' + c : ''); } };
                                        set('sec-s-contacts', n ? n + ' contact' + (n > 1 ? 's' : '') + ' · ' + this.cfg.contacts[0].name + ' appelé en 1er' : 'Aucun contact : à ajouter', n ? 'ok' : 'warn');
                    set('sec-s-med', this.hasMed() ? 'Renseignée' + (this.cfg.lock ? ' · écran verrouillé' : '') : 'À remplir', this.hasMed() ? 'ok' : 'warn');
                    set('sec-s-detect', (this.cfg.auto ? 'Auto au départ · ' : '') + this.SENS[this.cfg.sens].label + ' · ' + this.cfg.pre + ' s pour répondre');
                    set('sec-s-share', this.cfg.share ? 'Activée · rayon 1 km' : 'Désactivée', this.cfg.share ? 'ok' : '');
                },
                initListeners() {
                    const $ = (i) => document.getElementById(i);
                    document.querySelectorAll('#view-security [data-sgo]').forEach(b => b.addEventListener('click', () => this.go(b.dataset.sgo)));
                    $('sec-back').addEventListener('click', () => this.go('sec-sub-home'));
                    $('btn-toggle-security').addEventListener('click', () => this.state.isArmed ? this.disarm() : this.arm(false));
                    $('sec-auto').addEventListener('click', () => { this.cfg.auto = !this.cfg.auto; this.saveCfg(); this.renderSettings(); });
                    // Démarrer / arrêter une balade (bouton Démarrer de la carte) active / coupe la surveillance toute seule
                    if (typeof ModuleGPS !== 'undefined' && ModuleGPS.toggleTracking && !ModuleGPS._secWrapped) {
                        const _tt = ModuleGPS.toggleTracking; ModuleGPS._secWrapped = true;
                        ModuleGPS.toggleTracking = function () {
                            const was = this.state.isTracking, r = _tt.apply(this, arguments), now = this.state.isTracking;
                            try { if (!was && now) ModuleSecurity.rideStarted(); else if (was && !now) ModuleSecurity.rideStopped(); } catch (e) { console.warn('sécurité auto', e); }
                            return r;
                        };
                    }
                    $('btn-sos-manual').addEventListener('click', () => this.triggerAlert('manual'));
                    $('sec-test').addEventListener('click', () => this.startPre('test'));
                    $('sec-pre').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; this.cfg.pre = Number(b.dataset.v); this.saveCfg(); this.renderSettings(); });
                    $('sec-lock').addEventListener('click', () => { this.cfg.lock = !this.cfg.lock; this.saveCfg(); this.renderSettings(); this.syncLockCard(); });
                    $('sec-smsmed').addEventListener('click', () => { this.cfg.smsMed = !this.cfg.smsMed; this.saveCfg(); this.renderSettings(); });
                    $('sec-med-view').addEventListener('click', () => this.showMedical());
                    ['blood', 'allergies', 'meds', 'conditions', 'notes'].forEach(k => { const el = $('med-' + k); el.addEventListener('change', () => { this.med[k] = el.value.trim().slice(0, 300); this.saveMed(); this.renderSettings(); }); });
                    $('sec-sens').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; this.cfg.sens = b.dataset.v; this.saveCfg(); this.renderSettings(); });
                    $('sec-delay').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; this.cfg.delay = Number(b.dataset.v); this.saveCfg(); this.renderSettings(); });
                    $('sec-share').addEventListener('click', () => { this.cfg.share = !this.cfg.share; this.saveCfg(); this.renderSettings(); this.netTick(); });
                    $('sec-c-add').addEventListener('click', () => {
                        const name = $('sec-c-name').value.trim(), phone = $('sec-c-phone').value.replace(/[^\d+]/g, '');
                        if (phone.replace(/\D/g, '').length < 6) { try { ModuleCommunity.showNotification('Numéro invalide', 'Entre un numéro de téléphone complet.'); } catch (e) {} return; }
                        if (this.cfg.contacts.length >= 5) { try { ModuleCommunity.showNotification('Maximum atteint', '5 contacts au maximum.'); } catch (e) {} return; }
                        this.cfg.contacts.push({ name: name || 'Contact', phone }); this.saveCfg(); $('sec-c-name').value = ''; $('sec-c-phone').value = ''; this.renderSettings();
                    });
                    const pick = $('sec-c-pick');
                    if (navigator.contacts && navigator.contacts.select) {
                        pick.style.display = '';
                        pick.addEventListener('click', async () => {
                            try {
                                const r = await navigator.contacts.select(['name', 'tel'], { multiple: false });
                                if (r && r[0] && r[0].tel && r[0].tel[0]) { this.cfg.contacts.push({ name: (r[0].name && r[0].name[0]) || 'Contact', phone: String(r[0].tel[0]).replace(/[^\d+]/g, '') }); this.saveCfg(); this.renderSettings(); }
                            } catch (e) {}
                        });
                    }
                },
                async arm(auto) {
                    if (this.state.isArmed) return true;
                    this._quiet = !!auto;
                    const ok = await this.api.startSensors(); if (!ok) { this._quiet = false; return false; }
                    this.state.isArmed = true; this.autoArmed = !!auto; setTimeout(() => { this._quiet = false; }, 5000);
                    this.render.updateStatus(true); this.netTick(); this.syncLockCard(); return true;
                },
                disarm() {
                    this.state.isArmed = false; this.autoArmed = false; this._quiet = false; this.api.stopSensors();
                    this.render.updateStatus(false); this.netTick(); this.syncLockCard();
                },
                rideStarted() { if (this.cfg.auto && !this.state.isArmed) this.arm(true); },
                // Fin de balade : on ne coupe que si c'est le départ qui a activé la surveillance (jamais pendant une alerte)
                rideStopped() { if (this.autoArmed && this.state.isArmed && !this.alert && !this.pre) this.disarm(); },
                renderSettings() {
                    const $ = (i) => document.getElementById(i);
                    this.homeInfo();
                    $('sec-sens').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === this.cfg.sens));
                    $('sec-sens-hint').textContent = this.SENS[this.cfg.sens].hint;
                    $('sec-delay').querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === this.cfg.delay));
                    $('sec-share').classList.toggle('on', !!this.cfg.share);
                    $('sec-pre').querySelectorAll('button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === this.cfg.pre));
                    $('sec-lock').classList.toggle('on', !!this.cfg.lock); $('sec-auto').classList.toggle('on', !!this.cfg.auto); $('sec-smsmed').classList.toggle('on', !!this.cfg.smsMed);
                    ['blood', 'allergies', 'meds', 'conditions', 'notes'].forEach(k => { const el = $('med-' + k); if (document.activeElement !== el) el.value = this.med[k]; });
                    $('sec-med-view').style.display = this.hasMed() ? '' : 'none';
                    const box = $('sec-contacts'); box.innerHTML = '';
                    if (!this.cfg.contacts.length) box.innerHTML = '<div class="sec-hint">Aucun contact pour le moment.</div>';
                    this.cfg.contacts.forEach((c, i) => {
                        const row = document.createElement('div'); row.className = 'sec-ct' + (i === 0 ? ' first' : '');
                        row.innerHTML = `<i>${i === 0 ? '📞' : '✉'}</i><div><b>${this.esc(c.name)}</b><span>${this.esc(c.phone)} · ${i === 0 ? 'appelé en premier' : 'reçoit le SMS'}</span></div><button type="button" aria-label="Supprimer">✕</button>`;
                        row.querySelector('button').addEventListener('click', () => { this.cfg.contacts.splice(i, 1); this.saveCfg(); this.renderSettings(); });
                        box.appendChild(row);
                    });
                },

                render: {
                    updateStatus(isArmed) {
                        const text = document.getElementById('security-status-text'); const btn = document.getElementById('btn-toggle-security'); const sub = document.getElementById('security-sub');
                        if (isArmed) { text.textContent = AppLang.fr.sosActive; text.style.color = "#30d158"; btn.textContent = "Désactiver Surveillance"; btn.style.backgroundColor = "transparent"; btn.style.border = "2px solid var(--surface-color)"; if (sub) sub.textContent = 'Surveillance en cours : garde l\'appli ouverte et l\'écran allumé.'; }
                        else { text.textContent = AppLang.fr.sosInactive; text.style.color = "var(--text-muted)"; btn.textContent = "Activer Surveillance"; btn.style.backgroundColor = "var(--accent-color)"; btn.style.border = "none"; if (sub) sub.textContent = 'Active la surveillance pendant que tu roules. Garde l\'appli ouverte, écran allumé.'; }
                    }
                },

                // ---------------- Capteurs ----------------
                api: {
                    async startSensors() {
                        const S = ModuleSecurity;
                        try { if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') { const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') { S.say('Capteur refusé', 'Autorise l\'accès au mouvement pour détecter les chutes.'); return false; } } } catch (e) {}
                        if (typeof DeviceMotionEvent === 'undefined') { S.say('Capteur indisponible', 'Cet appareil n\'a pas de capteur de mouvement.'); return false; }
                        try { const N = S.nat(); if (N && N.requestPermissions) await N.requestPermissions({ permissions: ['call'] }); } catch (e) {}
                        S.buf = []; S.motionOn = false;
                        S._mh = (e) => S.onMotion(e); window.addEventListener('devicemotion', S._mh);
                        if (navigator.geolocation) S._gw = navigator.geolocation.watchPosition((p) => S.onGps(p), () => {}, { enableHighAccuracy: true, maximumAge: 2000 });
                        try { if (typeof ScreenWakeManager !== 'undefined') ScreenWakeManager.request(); } catch (e) {}
                        setTimeout(() => { if (S.state.isArmed && !S.motionOn) S.say('Capteur muet', 'Aucune donnée de mouvement reçue : la détection de chute ne fonctionnera pas sur cet appareil / navigateur.'); }, 4000);
                        return true;
                    },
                    stopSensors() {
                        const S = ModuleSecurity;
                        if (S._mh) window.removeEventListener('devicemotion', S._mh); S._mh = null;
                        if (S._gw != null && navigator.geolocation) navigator.geolocation.clearWatch(S._gw); S._gw = null;
                        S.pending = null; S.buf = [];
                    }
                },
                // Passerelle Capacitor : plugin natif « Emergency » (appel direct + fiche médicale écran verrouillé). Sans lui : lien tel: (l'utilisateur valide).
                nat() { try { const P = window.Capacitor && window.Capacitor.Plugins; return (P && P.Emergency) || null; } catch (e) { return null; } },
                // Dernière position GPS fraîche (4 s max), sinon la dernière connue
                freshPos() {
                    return new Promise((res) => {
                        const fallback = () => res(this.myPos());
                        if (!navigator.geolocation) return fallback();
                        const to = setTimeout(fallback, 4200);
                        navigator.geolocation.getCurrentPosition((p) => { clearTimeout(to); this.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }; res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); }, () => { clearTimeout(to); fallback(); }, { enableHighAccuracy: true, timeout: 4000, maximumAge: 5000 });
                    });
                },
                say(t, m) { if (this._quiet) return; try { ModuleCommunity.showNotification(t, m); } catch (e) { console.log(t, m); } },
                onGps(p) {
                    const sp = (p.coords.speed != null && !isNaN(p.coords.speed)) ? p.coords.speed * 3.6 : null, t = Date.now();
                    this.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t };
                    if (sp !== null) {
                        this.speeds.push([t, sp]); this.speeds = this.speeds.filter(x => t - x[0] < 20000);
                        // Téléphone amorti (poche, sacoche) : choc modéré + arrêt brutal (≥ seuil de vitesse → < 6 km/h en moins de 4 s)
                        if (this.state.isArmed && !this.pending && !this.alert && !this.pre && sp < 6) {
                            const S = this.SENS[this.cfg.sens], before = this.speeds.filter(x => t - x[0] < 4000 && t - x[0] > 300).map(x => x[1]);
                            const peak = Math.max(0, ...this.buf.filter(x => t - x[0] < 5000).map(x => x[1]));
                            if (before.length && Math.max(...before) >= Math.max(S.kmh, 30) && peak >= S.g * 0.6) this.beginCrashWatch(peak, 'decel');
                        }
                    }
                },
                myPos() {
                    if (this.pos && Date.now() - this.pos.t < 120000) return { lat: this.pos.lat, lon: this.pos.lon };
                    try { const m = ModuleCommunity.state.myPos; if (m) return { lat: m.lat, lon: m.lon }; } catch (e) {}
                    try { const c = ModuleGPS.state.lastKnownCoords; if (c) return { lat: c[1], lon: c[0] }; } catch (e) {}
                    return this.pos ? { lat: this.pos.lat, lon: this.pos.lon } : null;
                },
                onMotion(e) {
                    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
                    this.motionOn = true;
                    const g = Math.hypot(a.x, a.y, a.z) / 9.81, t = Date.now();
                    this.buf.push([t, g]); while (this.buf.length && t - this.buf[0][0] > 10000) this.buf.shift();
                    if (this.pending || this.alert || this.pre) return;
                    const S = this.SENS[this.cfg.sens];
                    if (g < S.g) return;
                    // Contexte : on roulait ? (si le GPS donne une vitesse récente, elle doit avoir dépassé le seuil de la sensibilité)
                    const rec = this.speeds.filter(x => t - x[0] < 12000);
                    if (rec.length && Math.max(...rec.map(x => x[1])) < S.kmh) return;
                    this.beginCrashWatch(g);
                },
                // Choc détecté : on observe 4 à 14 s. Immobile + plus de vitesse → chute probable ; si le motard repart (> 25 km/h) c'était une bosse.
                beginCrashWatch(g, why) {
                    if (this.pending || this.alert || this.pre) return;
                    const P = this.pending = { t0: Date.now(), g, why: why || 'shock' };
                    P.timer = setInterval(() => {
                        if (this.pending !== P) { clearInterval(P.timer); return; }
                        const age = Date.now() - P.t0; if (age < 4000) return;
                        const r = this.crashState();
                        if (r === 'crash') { clearInterval(P.timer); this.pending = null; if (this.state.isArmed) this.startPre('crash'); }
                        else if (r === 'rolling' || age > 14000) { clearInterval(P.timer); this.pending = null; }
                    }, 1000);
                },
                // 'crash' = immobile et à l'arrêt · 'rolling' = il roule normalement · 'wait' = indécis
                crashState() {
                    const t = Date.now(), last = this.buf.filter(x => t - x[0] < 3000).map(x => x[1]);
                    const rec = this.speeds.filter(x => t - x[0] < 4000), moving = rec.length && rec[rec.length - 1][1] > 25;
                    if (moving) return 'rolling';
                    let still = false;
                    if (last.length >= 5) { const m = last.reduce((a, b) => a + b, 0) / last.length, sd = Math.sqrt(last.reduce((a, b) => a + (b - m) ** 2, 0) / last.length); still = sd < 0.25; }
                    return still ? 'crash' : 'wait';
                },
                verifyCrash() { const p = this.pending; if (p) { clearInterval(p.timer); this.pending = null; } if (p && this.state.isArmed && !this.alert && !this.pre && this.crashState() === 'crash') this.startPre('crash'); },

                // ---------------- Alerte (plein écran, appel, SMS, P2P) ----------------
                tone(on) {
                    try {
                        clearInterval(this._beep); if (!on) return;
                        const ctx = this._ac || (this._ac = new (window.AudioContext || window.webkitAudioContext)());
                        this._beep = setInterval(() => { try { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 980; g.gain.value = 0.25; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.35); } catch (e) {} if (navigator.vibrate) navigator.vibrate([300, 150, 300]); }, 900);
                    } catch (e) {}
                },
                triggerAlert(kind) {
                    if (this.alert) return;
                    const test = kind === 'test', A = this.alert = { id: this.hex(8), kind, test, t0: Date.now(), remaining: this.cfg.delay, smsDone: false, called: false, native: false };
                    A.pos = this.myPos();
                    this.showAlert(); this.tone(true);
                    try { if (typeof ScreenWakeManager !== 'undefined') ScreenWakeManager.request(); } catch (e) {}
                    if (!test) {
                        // Motards à proximité : prévenus seulement à la fin du compte à rebours sans réponse (jamais dès le début : évite les fausses alertes)
                        if (this.cfg.share) this.ensureNet();
                        // position GPS fraîche : sert au SMS (et remplace la position de l'alerte P2P au prochain envoi)
                        this.freshPos().then((p) => { if (!this.alert || this.alert !== A) return; if (p) A.pos = p; this.publishSos(); });
                        // l'appel quitte l'appli : on laisse partir l'alerte P2P d'abord
                        setTimeout(() => this.callPrimary(), 1500);
                    }
                    A.timer = setInterval(() => {
                        A.remaining--; this.updateAlert();
                        if (A.remaining <= 0) { clearInterval(A.timer); this.escalate(); }
                    }, 1000);
                },
                // ---------------- Avant l'alerte : « Tu vas bien ? » (rien n'est envoyé pendant ce compte à rebours) ----------------
                startPre(kind) {
                    if (this.alert || this.pre) return;
                    const P = this.pre = { kind, remaining: this.cfg.pre };
                    const o = document.createElement('div'); o.id = 'sos-pre'; o.className = 'sos-overlay sos-pre';
                    o.innerHTML = `<h1>${kind === 'test' ? 'Test : chute simulée' : 'Chute détectée'}</h1><div class="sos-count" id="pre-count">${P.remaining}</div><p>Tu vas bien ? Sans réponse, l'alerte part à la fin du compte à rebours.</p>
                        <button type="button" class="sos-ok" id="pre-ok">Je vais bien</button>
                        <button type="button" class="sos-sec" id="pre-go">Lancer l'alerte maintenant</button>`;
                    document.body.appendChild(o);
                    this.tone(true); try { if (typeof ScreenWakeManager !== 'undefined') ScreenWakeManager.request(); } catch (e) {}
                    const buzz = () => { try { if (navigator.vibrate) navigator.vibrate([500, 250, 500]); } catch (e) {} }; buzz(); P.vib = setInterval(buzz, 1500);
                    const end = () => { clearInterval(P.timer); clearInterval(P.vib); this.tone(false); if (navigator.vibrate) navigator.vibrate(0); o.remove(); this.pre = null; };
                    o.querySelector('#pre-ok').addEventListener('click', end);
                    o.querySelector('#pre-go').addEventListener('click', () => { end(); this.triggerAlert(kind); });
                    P.timer = setInterval(() => { P.remaining--; const c = o.querySelector('#pre-count'); if (c) c.textContent = Math.max(0, P.remaining); if (P.remaining <= 0) { end(); this.triggerAlert(kind); } }, 1000);
                },
                cancelPre() { const o = document.getElementById('sos-pre'); if (o) { const b = o.querySelector('#pre-ok'); if (b) b.click(); } },
                // Fiche médicale en plein écran (lisible par un secouriste), accessible depuis l'alerte et depuis Sécurité
                showMedical() {
                    if (document.getElementById('med-sheet')) return;
                    const m = this.med, row = (l, v) => v && v.trim() ? `<div class="med-r"><span>${l}</span><b>${this.esc(v)}</b></div>` : '';
                    const o = document.createElement('div'); o.id = 'med-sheet'; o.className = 'med-sheet';
                    o.innerHTML = `<div class="med-box"><h2>Fiche médicale</h2><div class="med-who">${this.esc(this.myName())}</div>
                        ${row('Groupe sanguin', m.blood)}${row('Allergies', m.allergies)}${row('Traitements', m.meds)}${row('Pathologies', m.conditions)}${row('Autres infos', m.notes)}
                        ${this.cfg.contacts.map(c => `<a class="med-c" href="tel:${this.esc(this.tel(c.phone))}"><span>Prévenir</span><b>${this.esc(c.name)} · ${this.esc(c.phone)}</b></a>`).join('')}
                        <button type="button" class="sos-ok" id="med-close">Fermer</button></div>`;
                    document.body.appendChild(o);
                    o.querySelector('#med-close').addEventListener('click', () => o.remove());
                },
                fmtDelay(s) { return s >= 60 ? Math.round(s / 60) + ' min' : s + ' s'; },
                // Numéro propre pour tel: / sms: (chiffres, +, pause) : un contact importé ou modifié ne peut pas glisser d'autres paramètres dans le lien
                tel(p) { return String(p == null ? '' : p).replace(/[^\d+]/g, '').slice(0, 20); },
                open(url) { try { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { window.location.href = url; } },
                callPrimary() {
                    const A = this.alert; if (!A || A.test || A.called) return; A.called = true;
                    const c = this.cfg.contacts[0]; this.updateAlert(); if (!c) return;
                    const N = this.nat();
                    if (N && N.call) N.call({ number: this.tel(c.phone) }).catch(() => this.open('tel:' + this.tel(c.phone))); else this.open('tel:' + this.tel(c.phone));
                },
                smsRecipients() { return this.cfg.contacts.length > 1 ? this.cfg.contacts.slice(1) : this.cfg.contacts; },
                smsBody() {
                    const A = this.alert, p = A && A.pos;
                    const where = p ? `Position GPS : ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}${p.acc ? ' (±' + Math.round(p.acc) + ' m)' : ''} https://maps.google.com/?q=${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : 'Position GPS inconnue.';
                    const med = (this.cfg.smsMed && this.hasMed()) ? ' Infos médicales : ' + this.medSummary(false) + '.' : '';
                    return `ALERTE de ${this.myName()} : accident détecté, sans réponse depuis ${this.fmtDelay(this.cfg.delay)}. ${where}${med}`;
                },
                smsLink() {
                    const rec = this.smsRecipients();
                    if (!rec.length) return null;
                    return 'sms:' + rec.map(c => this.tel(c.phone)).filter(Boolean).join(',') + '?body=' + encodeURIComponent(this.smsBody());
                },
                alertNearby() {
                    const A = this.alert; if (!A || A.test || A.p2p || !this.cfg.share) return;
                    A.p2p = true; this.ensureNet(); this.publishSos();
                    A.keep = setInterval(() => { A.pos = this.myPos() || A.pos; this.publishSos(); }, 20000);
                },
                // Fin du délai sans réponse (ou bouton) : motards proches prévenus + messagerie SMS ouverte avec le message prêt (l'utilisateur appuie sur Envoyer)
                escalate() {
                    const A = this.alert; if (!A || A.smsDone) return; clearInterval(A.timer); A.remaining = 0; A.smsDone = true;
                    if (!A.test) { this.alertNearby(); const l = this.smsLink(); if (l) this.open(l); }
                    this.updateAlert();
                },
                cancelAlert() {
                    const A = this.alert; if (!A) return;
                    clearInterval(A.timer); clearInterval(A.keep); this.tone(false); if (navigator.vibrate) navigator.vibrate(0);
                    if (!A.test && A.p2p && this.cfg.share) { for (let i = 0; i < 3; i++) setTimeout(() => this.publishCancel(A.id), i * 1500); }
                    this.alert = null; const o = document.getElementById('sos-overlay'); if (o) o.remove();
                },
                showAlert() {
                    const A = this.alert, o = document.createElement('div'); o.id = 'sos-overlay'; o.className = 'sos-overlay';
                    const title = A.test ? 'Test de l\'alerte' : (A.kind === 'manual' ? 'SOS' : 'Accident détecté');
                    o.innerHTML = `<h1>${title}</h1><div class="sos-count" id="sos-count"></div><p id="sos-msg"></p><div class="sos-steps" id="sos-steps"></div>
                        <button type="button" class="sos-ok" id="sos-ok">Je vais bien</button>
                        <button type="button" class="sos-sec" id="sos-call112">Appeler les secours (112)</button>
                        <button type="button" class="sos-sec" id="sos-callc" style="display:none"></button>
                        <button type="button" class="sos-sec" id="sos-sms" style="display:none">Envoyer l'alerte maintenant</button>
                        <button type="button" class="sos-sec" id="sos-med" style="display:none">Fiche médicale</button>`;
                    document.body.appendChild(o);
                    o.querySelector('#sos-ok').addEventListener('click', () => this.cancelAlert());
                    if (this.hasMed()) { const mb = o.querySelector('#sos-med'); mb.style.display = ''; mb.addEventListener('click', () => this.showMedical()); }
                    o.querySelector('#sos-call112').addEventListener('click', () => { if (!A.test) this.open('tel:112'); });
                    o.querySelector('#sos-sms').addEventListener('click', () => { if (A.test) return; this.escalate(); });
                    const c = this.cfg.contacts[0];
                    if (c) { const b = o.querySelector('#sos-callc'); b.style.display = ''; b.textContent = 'Appeler ' + c.name; b.addEventListener('click', () => { if (!A.test) this.open('tel:' + this.tel(c.phone)); }); }
                    this.updateAlert();
                },
                updateAlert() {
                    const A = this.alert, o = document.getElementById('sos-overlay'); if (!A || !o) return;
                    const $ = (i) => o.querySelector('#' + i), c = this.cfg.contacts[0];
                    $('sos-count').textContent = A.smsDone ? '✓' : A.remaining;
                    $('sos-msg').textContent = A.smsDone ? (A.test ? 'Test terminé : le message aurait été préparé et les motards prévenus.' : 'Message prêt dans ta messagerie : appuie sur Envoyer.') : (A.test ? 'Mode test : aucun appel, aucun envoi.' : 'Si tu vas bien, appuie sur le bouton avant la fin du compte à rebours.');
                    const steps = [];
                    steps.push(A.test ? '• (test) alerte aux motards à 1 km' : (this.cfg.share ? (A.p2p ? '• Motards à moins de 1 km prévenus' : `• Motards à moins de 1 km prévenus dans ${A.remaining} s`) : '• Alerte aux motards désactivée'));
                    steps.push(c ? (A.called || A.test ? `• ${A.test ? 'Appel de' : 'Appel lancé vers'} ${c.name}` : `• Appel de ${c.name}…`) : '• Aucun contact d\'urgence : ajoutes-en dans Sécurité');
                    steps.push(this.cfg.contacts.length ? (A.smsDone ? '• SMS avec ta position : prêt à envoyer' : `• SMS avec ta position dans ${A.remaining} s`) : '');
                    $('sos-steps').innerHTML = steps.filter(Boolean).join('<br>');
                    $('sos-sms').style.display = (this.cfg.contacts.length && !A.test) ? '' : 'none';
                },

                // ---------------- Réseau P2P (MQTT) : alertes dans un rayon de 1 km ----------------
                root() { return ModuleCommunity.config.topicRoot + '/sos/'; },
                cellKey(lat, lon) { return `${Math.floor(lat / this.CELL)}_${Math.floor(lon / this.CELL)}`; },
                netWanted() { return !!this.cfg.share && (this.state.isArmed || !!(ModuleCommunity.state && ModuleCommunity.state.enabled) || !!(ModuleGPS.state && ModuleGPS.state.isTracking)); },
                ensureNet() {
                    if (this.net || typeof MiniMQTT === 'undefined') return;
                    this.net = new MiniMQTT(ModuleCommunity.config.brokers, ('vsos' + this.hex(8)).slice(0, 23), {
                        connect: () => { this.netCell = null; this.netTick(); if (this.alert && !this.alert.test && this.alert.p2p) this.publishSos(); },
                        message: (t, p) => this.onNet(t, p), status: () => {}
                    });
                    this.net.start();
                },
                stopNet() { if (this.net) { try { this.net.stop(); } catch (e) {} } this.net = null; this.netCell = null; },
                netTick() {
                    try {
                        const now = Date.now(); this.incoming.forEach((r, id) => { if (now - r.seen > (r.friend ? 2 * 3600000 : 5 * 60000)) { if (r.marker) r.marker.remove(); this.incoming.delete(id); const c = document.querySelector(`#sos-in [data-id="${id}"]`); if (c) c.remove(); } });
                        if (!this.netWanted() && !(this.alert && !this.alert.test)) { if (this.net) this.stopNet(); return; }
                        this.ensureNet(); const p = this.myPos(); if (!this.net || !p) return;
                        const cell = this.cellKey(p.lat, p.lon);
                        if (this.net.connected && cell !== this.netCell) { if (this.netCell) this.net.unsubscribe(this.root() + this.netCell); this.net.subscribe(this.root() + cell); this.netCell = cell; }
                    } catch (e) {}
                },
                cellsAround(lat, lon) {
                    const s = this.CELL, dLat = this.SOS_KM / 111.32, dLon = this.SOS_KM / (111.32 * Math.max(0.1, Math.cos(lat * Math.PI / 180))), out = [];
                    for (let y = Math.floor((lat - dLat) / s); y <= Math.floor((lat + dLat) / s); y++) for (let x = Math.floor((lon - dLon) / s); x <= Math.floor((lon + dLon) / s); x++) out.push(`${y}_${x}`);
                    return out;
                },
                // Texte signé d'une alerte : le signataire ne peut pas être usurpé, et on ne peut ni annuler ni détourner l'alerte d'un autre
                sosText(t, id, lat, lon, n, ts) { return ['vroom-sos-v1', t, id, lat, lon, n, ts].join('|'); },
                async publishSos() {
                    const A = this.alert; if (!A || A.test || !A.p2p || !this.cfg.share || !this.net) return;
                    const p = A.pos || this.myPos(); if (!p) return;
                    try {
                        const lat = +p.lat.toFixed(5), lon = +p.lon.toFixed(5), n = this.myName(), ts = Date.now();
                        const s = await ModuleCommunity.signText(this.sosText('sos', A.id, lat, lon, n, ts));
                        if (!this.net || this.alert !== A) return;
                        const msg = JSON.stringify({ t: 'sos', id: A.id, lat, lon, n, ts, k: ModuleCommunity.state.idPub, s });
                        this.cellsAround(p.lat, p.lon).forEach(c => this.net.publish(this.root() + c, msg, false));
                    } catch (e) { console.warn('[SOS] signature impossible', e); }
                },
                async publishCancel(id) {
                    const p = this.myPos(); if (!p || !this.net) return;
                    try {
                        const ts = Date.now(), s = await ModuleCommunity.signText(this.sosText('ok', id, '', '', '', ts));
                        if (!this.net) return;
                        const msg = JSON.stringify({ t: 'ok', id, ts, k: ModuleCommunity.state.idPub, s });
                        this.cellsAround(p.lat, p.lon).forEach(c => this.net.publish(this.root() + c, msg, false));
                    } catch (e) {}
                },
                async onNet(topic, payload) {
                    if (!this.cfg.share || !topic.startsWith(this.root())) return;
                    let m; try { m = JSON.parse(payload); } catch (e) { return; }
                    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !/^[a-f0-9]{8,16}$/.test(m.id)) return;
                    if (this.alert && this.alert.id === m.id) return;
                    if (m.t !== 'sos' && m.t !== 'ok') return;
                    const ts0 = Number(m.ts); if (!isFinite(ts0) || Date.now() - ts0 > 20 * 60000 || ts0 - Date.now() > 5 * 60000) return;
                    // Alerte signée obligatoire : sans signature valide, elle est ignorée
                    const str = m.t === 'ok' ? this.sosText('ok', m.id, '', '', '', m.ts) : this.sosText('sos', m.id, m.lat, m.lon, m.n, m.ts);
                    const krid = await ModuleCommunity.verifyText(m.k, m.s, str);
                    if (!krid || krid === ModuleCommunity.state.myId) return;
                    if (m.t === 'ok') { const r0 = this.incoming.get(m.id); if (r0 && r0.krid === krid) this.clearIncoming(m.id); return; }   // seul l'auteur de l'alerte peut l'annuler
                    const prev = this.incoming.get(m.id);
                    if (prev && prev.krid !== krid) return;                                                                                        // personne ne peut détourner l'alerte d'un autre
                    const lat = Number(m.lat), lon = Number(m.lon), ts = Number(m.ts);
                    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !isFinite(ts)) return;
                    if (Date.now() - ts > 20 * 60000 || ts - Date.now() > 5 * 60000) return;
                    const me = this.myPos(); if (!me) return;
                    const d = ModuleCommunity.distance(me, { lat, lon }); if (d > this.SOS_KM * 1000 + 300) return;
                    const name = String(m.n || 'Un motard').slice(0, 40);
                    let r = this.incoming.get(m.id);
                    if (r) { r.lat = lat; r.lon = lon; r.d = d; r.seen = Date.now(); if (r.marker) r.marker.setLngLat([lon, lat]); this.updateIncoming(r); return; }
                    const friend = ModuleCommunity.isFriend(krid);
                    if (this.incoming.size >= 5) {   // plein : un ami prend la place de la plus ancienne alerte d'inconnu ; un inconnu ne prend jamais la place de personne
                        const old = friend ? [...this.incoming.values()].filter(x => !x.friend).sort((a, b) => a.seen - b.seen)[0] : null;
                        if (!old) return; this.clearIncoming(old.id, true);
                    }
                    r = { id: m.id, lat, lon, d, name, seen: Date.now(), krid, friend }; this.incoming.set(m.id, r);
                    this.addIncomingMarker(r); this.showIncoming(r);
                    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
                    try { const ctx = this._ac || (this._ac = new (window.AudioContext || window.webkitAudioContext)()); [0, 0.4, 0.8].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.25); }); } catch (e) {}
                },
                addIncomingMarker(r) {
                    try {
                        const map = ModuleGPS.state.map; if (!map || typeof maplibregl === 'undefined') return;
                        const el = document.createElement('div'); el.className = 'sos-mk'; el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
                        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.showIncoming(r); });
                        r.marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lon, r.lat]).addTo(map);
                    } catch (e) {}
                },
                showIncoming(r) {
                    let box = document.getElementById('sos-in'); if (!box) { box = document.createElement('div'); box.id = 'sos-in'; box.className = 'sos-in'; document.body.appendChild(box); }
                    let c = box.querySelector(`[data-id="${r.id}"]`); if (!c) { c = document.createElement('div'); c.className = 'sos-card'; c.dataset.id = r.id; box.appendChild(c); }
                    c.innerHTML = `<b>🚨 ${r.friend ? 'Ami en détresse' : 'Motard en détresse'}</b><span>${this.esc(r.name)}${r.friend ? '' : ' (non vérifié)'} · à ${r.d >= 1000 ? (r.d / 1000).toFixed(1) + ' km' : Math.round(r.d) + ' m'}</span>
                        <div class="sos-b"><button type="button" class="main" data-a="map">Voir sur la carte</button><button type="button" data-a="go">Y aller</button><button type="button" data-a="x">Fermer</button></div>`;
                    c.querySelector('[data-a="map"]').addEventListener('click', () => this.focusIncoming(r));
                    c.querySelector('[data-a="go"]').addEventListener('click', () => { AppManager.switchView('view-gps'); const t = document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]'); if (t) t.click(); setTimeout(() => ModuleGPS.navigateToPOI('Motard en détresse', r.lat, r.lon), 200); c.remove(); });
                    c.querySelector('[data-a="x"]').addEventListener('click', () => c.remove());
                },
                updateIncoming(r) { const c = document.querySelector(`#sos-in [data-id="${r.id}"]`); if (c) this.showIncoming(r); },
                focusIncoming(r) {
                    AppManager.switchView('view-gps'); const t = document.querySelector('.gps-tab-btn[data-sub="sub-gps-carte"]'); if (t) t.click();
                    setTimeout(() => { try { if (!r.marker) this.addIncomingMarker(r); const m = ModuleGPS.state.map; m.resize(); m.flyTo({ center: [r.lon, r.lat], zoom: 15, duration: 1200 }); } catch (e) {} }, 150);
                },
                clearIncoming(id, silent) {
                    const r = this.incoming.get(id); if (!r) return;
                    if (r.marker) r.marker.remove(); this.incoming.delete(id);
                    const c = document.querySelector(`#sos-in [data-id="${id}"]`); if (c) c.remove();
                    if (silent) return;
                    this.say('Fausse alerte', `${r.name} va bien : l'alerte est annulée.`);
                },

                compute: {
                    detectCrash() { /* voir onMotion / verifyCrash */ }
                }
            };
