            const ModuleMusic = {
                state: {
                    audioObj: null,
                    tracks: [],        // { id, name, title, artist, album, size, blob, coverBlob, dur }
                    order: [],         // ids dans l'ordre de lecture
                    pos: -1,           // position dans order
                    currentId: null,
                    shuffle: false,
                    repeat: 0,         // 0 = off, 1 = tout, 2 = un titre
                    volume: 1,
                    dragging: false,
                    curUrl: null,
                    curCoverUrl: null,
                    volSupported: true,
                    dbOk: true
                },

                $(id) { return document.getElementById(id); },
                esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
                lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} },

                async init() {
                    this.state.audioObj = this.$('vroom-audio-player');
                    // Le volume HTML n'est pas modifiable sur iOS : on masque alors le curseur
                    try { const t = new Audio(); t.volume = 0.5; this.state.volSupported = (t.volume === 0.5); } catch (e) {}

                    this.initTabs();
                    this.initLocalPlayer();
                    try { await this.loadLibrary(); } catch (e) { console.warn('Musique : bibliothèque', e); }
                    this.renderPlaylist();
                    this.refreshLocalUI();
                    this.initDevice();
                    this.initLinks();
                },

                /* ============================================================
                   OUTILS UI : toast + fenêtres
                ============================================================ */
                toast(msg) {
                    const t = this.$('mu-toast'); if (!t) return;
                    t.textContent = msg; t.classList.add('show');
                    clearTimeout(this._tt);
                    this._tt = setTimeout(() => t.classList.remove('show'), 2800);
                },

                sheet(title, bodyHtml, buttons) {
                    const ov = document.createElement('div');
                    ov.className = 'mu-overlay';
                    ov.innerHTML = `<div class="mu-sheet"><h3>${this.esc(title)}</h3><div class="mu-sheet-body">${bodyHtml}</div><div class="mu-sheet-btns"></div></div>`;
                    const close = () => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 200); };
                    const bar = ov.querySelector('.mu-sheet-btns');
                    (buttons || [{ label: 'Fermer' }]).forEach(b => {
                        const el = document.createElement('button');
                        el.className = 'btn'; el.textContent = b.label;
                        if (b.danger) el.style.color = 'var(--danger-color)';
                        el.addEventListener('click', () => { const keep = b.action ? b.action(ov) : false; if (keep !== true) close(); });
                        bar.appendChild(el);
                    });
                    ov.addEventListener('click', e => { if (e.target === ov) close(); });
                    document.body.appendChild(ov);
                    requestAnimationFrame(() => ov.classList.add('show'));
                    return ov;
                },

                /* Barre de progression glissable (souris + tactile) */
                bindSeek(bar, cfg) {
                    const frac = e => { const r = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
                    let active = false;
                    bar.addEventListener('pointerdown', e => {
                        if (!cfg.enabled()) return;
                        active = true; this.state.dragging = true;
                        try { bar.setPointerCapture(e.pointerId); } catch (x) {}
                        cfg.preview(frac(e)); e.preventDefault();
                    });
                    bar.addEventListener('pointermove', e => { if (active) cfg.preview(frac(e)); });
                    const end = e => {
                        if (!active) return; active = false; this.state.dragging = false;
                        if (e.type !== 'pointercancel') cfg.commit(frac(e));
                    };
                    bar.addEventListener('pointerup', end);
                    bar.addEventListener('pointercancel', end);
                },

                initTabs() {
                    const tabs = document.querySelectorAll('.music-tab-btn');
                    tabs.forEach(tab => {
                        tab.addEventListener('click', (e) => {
                            const targetId = e.currentTarget.getAttribute('data-sub');
                            tabs.forEach(t => t.classList.remove('active'));
                            e.currentTarget.classList.add('active');
                            document.querySelectorAll('.music-sub-view').forEach(v => v.classList.remove('active'));
                            const targetView = this.$(targetId);
                            if (targetView) targetView.classList.add('active');
                            this.lsSet('ridenct_music_tab', targetId);
                        });
                    });
                    const last = this.lsGet('ridenct_music_tab');
                    if (last) { const b = document.querySelector(`.music-tab-btn[data-sub="${last}"]`); if (b) b.click(); }
                },

                /* ============================================================
                   BASE DE DONNÉES LOCALE (stockage illimité, IndexedDB)
                ============================================================ */
                _db: null,
                openDB() {
                    if (this._db) return this._db;
                    this._db = new Promise((res, rej) => {
                        if (!window.indexedDB) return rej(new Error('no idb'));
                        const r = indexedDB.open(AppData.db('vroom_music'), 1);
                        r.onupgradeneeded = () => {
                            const db = r.result;
                            if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
                            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
                        };
                        r.onsuccess = () => res(r.result);
                        r.onerror = () => rej(r.error);
                    });
                    return this._db;
                },
                async tx(store, mode, fn) {
                    const db = await this.openDB();
                    return new Promise((res, rej) => {
                        const t = db.transaction(store, mode);
                        const out = fn(t.objectStore(store));
                        t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
                        t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
                    });
                },
                async kvGet(k) { try { return await this.tx('kv', 'readonly', s => s.get(k)); } catch (e) { return undefined; } },
                async kvSet(k, v) { try { await this.tx('kv', 'readwrite', s => s.put(v, k)); } catch (e) {} },

                async loadLibrary() {
                    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
                    let rows = [];
                    try { rows = (await this.tx('tracks', 'readonly', s => s.getAll())) || []; }
                    catch (e) { this.state.dbOk = false; return; }
                    this.state.tracks = rows;
                    const s = this.state;
                    const [shuf, rep, vol, last, pos] = await Promise.all(['shuffle', 'repeat', 'volume', 'lastId', 'pos'].map(k => this.kvGet(k)));
                    s.shuffle = !!shuf; s.repeat = rep || 0;
                    if (typeof vol === 'number') s.volume = vol;
                    s.audioObj.volume = s.volume;
                    const lid = rows.find(t => t.id === last) ? last : (rows[0] && rows[0].id);
                    this.buildOrder(lid);
                    if (lid != null) {
                        this.selectTrack(lid, false);
                        if (typeof pos === 'number' && last === lid) {
                            s.audioObj.addEventListener('loadedmetadata', () => { try { s.audioObj.currentTime = pos; } catch (e) {} }, { once: true });
                        }
                    }
                },

                /* ============================================================
                   LECTURE : ordre / aléatoire / répétition
                ============================================================ */
                buildOrder(currentId) {
                    const s = this.state;
                    let ids = s.tracks.map(t => t.id);
                    if (s.shuffle) {
                        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
                        const k = ids.indexOf(currentId);
                        if (k > 0) { ids.splice(k, 1); ids.unshift(currentId); }
                    }
                    s.order = ids;
                    s.pos = Math.max(-1, ids.indexOf(currentId));
                },

                current() { return this.state.tracks.find(t => t.id === this.state.currentId) || null; },

                /* Charge un titre dans le lecteur (sans forcément le lancer) */
                async selectTrack(id, autoplay) {
                    const s = this.state, t = s.tracks.find(x => x.id === id);
                    if (!t) return;
                    if (t.stream && typeof ModuleMusicShare !== 'undefined' && ModuleMusicShare.hasGraph()) { this.toast('Titre lu en ligne : indisponible après un partage dans un canal. Redémarre l\'app ou utilise la clé API pour le télécharger.'); return; }
                    s.currentId = id;
                    const p = s.order.indexOf(id); if (p >= 0) s.pos = p;
                    this.kvSet('lastId', id);
                    if (!t.blob && !t.stream) {
                        // titre Drive pas encore téléchargé
                        s.audioObj.pause(); s.audioObj.removeAttribute('src'); s.audioObj.load();
                        if (s.curUrl) { URL.revokeObjectURL(s.curUrl); s.curUrl = null; }
                        if (s.curCoverUrl) { URL.revokeObjectURL(s.curCoverUrl); s.curCoverUrl = null; }
                        this.updateTrackUI(); this.renderPlaylist(); this.onPlayState();
                        if (!autoplay) return;
                        s.loading = id; this.$('local-artist').innerHTML = VI.cloud + ' Téléchargement depuis Drive…';
                        try { await this.fetchDriveBlob(t); }
                        catch (e) { if (s.loading === id) { s.loading = null; this.updateTrackUI(); this.toast('Téléchargement impossible : ' + e.message); } return; }
                        if (s.currentId !== id) return;
                        s.loading = null;
                    }
                    if (s.curUrl) URL.revokeObjectURL(s.curUrl);
                    if (s.curCoverUrl) { URL.revokeObjectURL(s.curCoverUrl); s.curCoverUrl = null; }
                    s.curUrl = t.blob ? URL.createObjectURL(t.blob) : null;
                    s.audioObj.src = s.curUrl || t.stream;
                    if (t.coverBlob) s.curCoverUrl = URL.createObjectURL(t.coverBlob);
                    this.updateTrackUI();
                    this.updateMediaSession();
                    if (autoplay) {
                        const pr = s.audioObj.play();
                        if (pr && pr.catch) pr.catch(() => {});
                        this.prefetchNext();
                    }
                    this.renderPlaylist();
                    if (typeof ModuleMusicShare !== 'undefined') ModuleMusicShare.onTrackChange();
                },

                playIndexById(id) { this.selectTrack(id, true); },

                togglePlay() {
                    const a = this.state.audioObj;
                    if (!this.state.tracks.length) { this.$('local-file-input').click(); return; }
                    if (!this.state.currentId) { this.selectTrack(this.state.order[0], true); return; }
                    if (!a.getAttribute('src')) { this.selectTrack(this.state.currentId, true); return; }
                    if (a.paused) { const pr = a.play(); if (pr && pr.catch) pr.catch(e => this.toast('Lecture impossible')); }
                    else a.pause();
                },

                nextTrack(auto) {
                    const s = this.state; if (!s.order.length) return;
                    if (auto && s.repeat === 2) { s.audioObj.currentTime = 0; s.audioObj.play().catch(() => {}); return; }
                    let p = s.pos + 1;
                    if (p >= s.order.length) {
                        if (s.repeat === 1 || !auto) {
                            if (s.shuffle) { const last = s.currentId; this.buildOrder(null); if (s.order.length > 1 && s.order[0] === last) s.order.push(s.order.shift()); }
                            p = 0;
                        } else {
                            // fin de liste sans répétition : on s'arrête sur le premier titre
                            this.selectTrack(s.order[0], false);
                            return;
                        }
                    }
                    this.selectTrack(s.order[p], true);
                },

                prevTrack() {
                    const s = this.state; if (!s.order.length) return;
                    if (s.audioObj.currentTime > 3 || s.pos <= 0 && s.repeat !== 1) { s.audioObj.currentTime = 0; return; }
                    const p = s.pos <= 0 ? s.order.length - 1 : s.pos - 1;
                    this.selectTrack(s.order[p], true);
                },

                toggleShuffle() {
                    const s = this.state; s.shuffle = !s.shuffle;
                    this.buildOrder(s.currentId); this.kvSet('shuffle', s.shuffle);
                    this.refreshLocalUI(); this.toast(s.shuffle ? 'Lecture aléatoire activée' : 'Lecture aléatoire désactivée');
                },
                cycleRepeat() {
                    const s = this.state; s.repeat = (s.repeat + 1) % 3; this.kvSet('repeat', s.repeat);
                    this.refreshLocalUI(); this.toast(['Répétition désactivée', 'Répéter toute la liste', 'Répéter ce titre'][s.repeat]);
                },

                /* ============================================================
                   LECTEUR LOCAL : événements
                ============================================================ */
                initLocalPlayer() {
                    const a = this.state.audioObj, fileInput = this.$('local-file-input');
                    this.$('btn-load-local').addEventListener('click', () => fileInput.click());
                    fileInput.addEventListener('change', async (e) => {
                        const files = Array.from(e.target.files || []); e.target.value = '';
                        if (files.length) await this.addFiles(files);
                    });
                    this.$('btn-clear-local').addEventListener('click', () => {
                        if (!this.state.tracks.length) return;
                        this.sheet('Vider la playlist ?', `<p style="color:var(--text-muted);font-size:0.85rem;line-height:1.5;">Les ${this.state.tracks.length} titres seront retirés de l'application (tes fichiers d'origine ne sont pas touchés).</p>`,
                            [{ label: 'Vider', danger: true, action: () => { this.clearAll(); } }, { label: 'Annuler' }]);
                    });
                    this.$('btn-local-play').addEventListener('click', () => this.togglePlay());
                    this.$('btn-local-next').addEventListener('click', () => this.nextTrack(false));
                    this.$('btn-local-prev').addEventListener('click', () => this.prevTrack());
                    this.$('btn-local-shuffle').addEventListener('click', () => this.toggleShuffle());
                    this.$('btn-local-repeat').addEventListener('click', () => this.cycleRepeat());

                    // --- GESTION DU VOLUME (Slider + Gros Boutons Tactiles) ---
                    const volContainer = this.$('local-volume-row');
                    const volSlider = this.$('local-volume');
                    
                    // On récupère ou on crée les boutons + et -
                    let btnVolDown = volContainer.querySelector('#btn-vol-down');
                    let btnVolUp = volContainer.querySelector('#btn-vol-up');

                    // Si les boutons n'existent pas encore dans ton HTML, on les insère dynamiquement
                    if (!btnVolDown || !btnVolUp) {
                        volContainer.innerHTML = `
                            <button id="btn-vol-down" class="mu-vbtn" aria-label="Baisser le volume" data-no-swipe>-</button>
                            <input type="range" id="local-volume" min="0" max="100" step="1" value="${Math.round(this.state.volume * 100)}" aria-label="Volume" data-no-swipe>
                            <button id="btn-vol-up" class="mu-vbtn" aria-label="Augmenter le volume" data-no-swipe>+</button>
                        `;
                        // On re-sélectionne le slider fraîchement recréé
                        const newVolSlider = this.$('local-volume');
                        btnVolDown = this.$('btn-vol-down');
                        btnVolUp = this.$('btn-vol-up');

                        // Fonction locale pour appliquer le volume
                        const applyVolume = (val) => {
                            let safeVal = Math.max(0, Math.min(100, val));
                            newVolSlider.value = safeVal;
                            this.setVolume(safeVal / 100, false);
                            this.kvSet('volume', this.state.volume); // Sauvegarde
                        };

                        // Écouteur pour le slider
                        newVolSlider.addEventListener('input', (e) => applyVolume(parseInt(e.target.value)));
                        
                        // Écouteurs pour les boutons - et + (par paliers de 10)
                        btnVolDown.addEventListener('click', () => applyVolume(parseInt(newVolSlider.value) - 10));
                        btnVolUp.addEventListener('click', () => applyVolume(parseInt(newVolSlider.value) + 10));
                    } else {
                         // Si les boutons étaient déjà là, on lie juste les événements normalement
                         const applyVolume = (val) => {
                            let safeVal = Math.max(0, Math.min(100, val));
                            volSlider.value = safeVal;
                            this.setVolume(safeVal / 100, false);
                            this.kvSet('volume', this.state.volume);
                        };
                        volSlider.addEventListener('input', (e) => applyVolume(parseInt(e.target.value)));
                        btnVolDown.addEventListener('click', () => applyVolume(parseInt(volSlider.value) - 10));
                        btnVolUp.addEventListener('click', () => applyVolume(parseInt(volSlider.value) + 10));
                    }
                    // -----------------------------------------------------------

                    a.addEventListener('timeupdate', () => this.updateProgress());
                    a.addEventListener('loadedmetadata', () => {
                        this.$('local-time-total').textContent = this.fmt(a.duration);
                        const t = this.current();
                        if (t && isFinite(a.duration) && Math.abs((t.dur || 0) - a.duration) > 0.5) { t.dur = a.duration; this.persistTrack(t); this.refreshCount(); }
                        this.updateProgress(); this.updatePositionState();
                    });
                    a.addEventListener('play', () => this.onPlayState());
                    a.addEventListener('pause', () => this.onPlayState());
                    a.addEventListener('ended', () => this.nextTrack(true));
                    a.addEventListener('error', () => {
                        if (!this.current() || !a.getAttribute('src')) return;
                        this.toast(this.current().stream ? 'Lecture Drive impossible (fichier trop gros, privé ou limité par Google)' : 'Fichier illisible, titre suivant…');
                        if (this.state.tracks.length > 1 && !this.current().stream) setTimeout(() => this.nextTrack(true), 600);
                    });
                    setInterval(() => { if (!a.paused && this.state.currentId != null) this.kvSet('pos', a.currentTime); }, 5000);
                    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state.currentId != null) this.kvSet('pos', a.currentTime); });

                    this.bindSeek(this.$('local-progress-bar'), {
                        enabled: () => this.state.currentId != null && isFinite(a.duration),
                        preview: f => {
                            this.$('local-progress-fill').style.width = (f * 100) + '%';
                            this.$('local-time-current').textContent = this.fmt(f * a.duration);
                        },
                        commit: f => { a.currentTime = f * a.duration; this.updatePositionState(); }
                    });
                },

                async persistTrack(t) { try { await this.tx('tracks', 'readwrite', s => s.put(t)); } catch (e) {} },

                async addFiles(files) {
                    const s = this.state; let added = 0, skipped = 0;
                    this.toast(`Ajout de ${files.length} fichier${files.length > 1 ? 's' : ''}…`);
                    for (const f of files) {
                        if (f.type && !f.type.startsWith('audio') && !/\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i.test(f.name)) { skipped++; continue; }
                        if (s.tracks.some(t => t.name === f.name && t.size === f.size)) { skipped++; continue; }
                        const meta = await this.readTags(f);
                        const base = f.name.replace(/\.[^/.]+$/, '');
                        let title = meta.title, artist = meta.artist;
                        if (!title) {
                            const m = base.split(' - ');
                            if (m.length >= 2) { artist = artist || m[0].trim(); title = m.slice(1).join(' - ').trim(); }
                            else title = base;
                        }
                        const rec = { name: f.name, title, artist: artist || '', album: meta.album || '', size: f.size, blob: f, coverBlob: meta.cover || null, dur: 0, added: Date.now(), source: 'local' };
                        try { rec.id = await this.tx('tracks', 'readwrite', st => st.add(rec)); }
                        catch (e) { rec.id = Date.now() + added; s.dbOk = false; }
                        s.tracks.push(rec);
                        if (s.shuffle && s.order.length) s.order.splice(s.pos + 1 + Math.floor(Math.random() * Math.max(1, s.order.length - s.pos)), 0, rec.id);
                        else s.order.push(rec.id);
                        added++;
                        if (added % 25 === 0) this.toast(`Ajout… ${added}/${files.length}`);
                    }
                    this.renderPlaylist(); this.refreshCount();
                    if (added && s.currentId == null) this.selectTrack(s.order[0], true);
                    this.toast(added ? `${added} titre${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}` + (skipped ? ` · ${skipped} ignoré${skipped > 1 ? 's' : ''}` : '') : 'Aucun nouveau titre');
                    if (!s.dbOk) this.toast('Stockage indisponible : la playlist ne sera pas conservée');
                },

                async removeTrack(id) {
                    const s = this.state, wasCur = id === s.currentId;
                    const idx = s.order.indexOf(id);
                    s.tracks = s.tracks.filter(t => t.id !== id);
                    s.order = s.order.filter(x => x !== id);
                    if (idx >= 0 && idx <= s.pos) s.pos--;
                    try { await this.tx('tracks', 'readwrite', st => st.delete(id)); } catch (e) {}
                    if (wasCur) {
                        const a = s.audioObj; a.pause(); a.removeAttribute('src'); a.load();
                        s.currentId = null;
                        if (s.order.length) this.selectTrack(s.order[Math.min(Math.max(s.pos + 1, 0), s.order.length - 1)], false);
                        else { s.pos = -1; this.updateTrackUI(); }
                    }
                    this.renderPlaylist(); this.refreshCount(); this.onPlayState();
                },

                async clearAll() {
                    const s = this.state, a = s.audioObj;
                    a.pause(); a.removeAttribute('src'); a.load();
                    if (s.curUrl) URL.revokeObjectURL(s.curUrl);
                    s.curUrl = null; s.tracks = []; s.order = []; s.pos = -1; s.currentId = null;
                    try { await this.tx('tracks', 'readwrite', st => st.clear()); } catch (e) {}
                    this.kvSet('lastId', null);
                    this.updateTrackUI(); this.renderPlaylist(); this.refreshCount(); this.onPlayState();
                },

                /* ---------- Lecture des tags ID3 (titre, artiste, album, pochette) ---------- */
                async readTags(file) {
                    const out = {};
                    try {
                        if (!/\.mp3$/i.test(file.name) && file.type !== 'audio/mpeg') return out;
                        const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
                        if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return out;
                        const ver = head[3];
                        const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
                        const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 12 * 1024 * 1024)).arrayBuffer());
                        const dec = (bytes, enc) => {
                            let label = 'iso-8859-1';
                            if (enc === 1) { label = (bytes[0] === 0xFE && bytes[1] === 0xFF) ? 'utf-16be' : 'utf-16le'; }
                            else if (enc === 2) label = 'utf-16be'; else if (enc === 3) label = 'utf-8';
                            let b = bytes;
                            if (enc === 1 && b.length >= 2 && ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0xFE && b[1] === 0xFF))) b = b.subarray(2);
                            return new TextDecoder(label).decode(b).replace(/\0+$/g, '').replace(/\0/g, ' ').trim();
                        };
                        const idLen = ver === 2 ? 3 : 4, hdrLen = ver === 2 ? 6 : 10;
                        let p = 0;
                        while (p + hdrLen < buf.length) {
                            const id = String.fromCharCode(...buf.subarray(p, p + idLen));
                            if (!/^[A-Z0-9]+$/.test(id)) break;
                            let fs;
                            if (ver === 2) fs = (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5];
                            else if (ver === 4) fs = (buf[p + 4] << 21) | (buf[p + 5] << 14) | (buf[p + 6] << 7) | buf[p + 7];
                            else fs = ((buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7]) >>> 0;
                            if (fs <= 0 || p + hdrLen + fs > buf.length) break;
                            const d = buf.subarray(p + hdrLen, p + hdrLen + fs);
                            if (id === 'TIT2' || id === 'TT2') out.title = dec(d.subarray(1), d[0]);
                            else if (id === 'TPE1' || id === 'TP1') out.artist = dec(d.subarray(1), d[0]);
                            else if (id === 'TALB' || id === 'TAL') out.album = dec(d.subarray(1), d[0]);
                            else if (id === 'APIC' && !out.cover) {
                                const enc = d[0]; let q = 1;
                                while (q < d.length && d[q] !== 0) q++;
                                const mime = String.fromCharCode(...d.subarray(1, q)) || 'image/jpeg';
                                q += 2; // fin du mime + type d'image
                                if (enc === 1 || enc === 2) { while (q + 1 < d.length && !(d[q] === 0 && d[q + 1] === 0)) q += 2; q += 2; }
                                else { while (q < d.length && d[q] !== 0) q++; q += 1; }
                                if (q < d.length) out.cover = new Blob([d.slice(q)], { type: /^image\//.test(mime) ? mime : 'image/jpeg' });
                            }
                            p += hdrLen + fs;
                        }
                    } catch (e) { /* tags illisibles : on utilisera le nom du fichier */ }
                    return out;
                },

                /* ============================================================
                   AFFICHAGE
                ============================================================ */
                fmt(sec) {
                    if (!isFinite(sec) || sec < 0) return '0:00';
                    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
                    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
                },

                updateProgress() {
                    const a = this.state.audioObj;
                    if (this.state.dragging || !isFinite(a.duration) || !a.duration) return;
                    this.$('local-progress-fill').style.width = (a.currentTime / a.duration * 100) + '%';
                    this.$('local-time-current').textContent = this.fmt(a.currentTime);
                    const now = Date.now();
                    if (now - (this._ps || 0) > 4000) { this._ps = now; this.updatePositionState(); }
                },

                onPlayState() {
                    const playing = !this.state.audioObj.paused && this.state.currentId != null;
                    this.$('icon-local-play').style.display = playing ? 'none' : 'block';
                    this.$('icon-local-pause').style.display = playing ? 'block' : 'none';
                    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
                    this.renderPlaylist();
                    if (typeof ModuleMusicShare !== 'undefined') ModuleMusicShare.render();
                },

                updateTrackUI() {
                    const t = this.current(), art = this.$('local-artwork');
                    this.$('local-title').textContent = t ? t.title : 'Aucun titre chargé';
                    this.$('local-artist').textContent = t ? (t.artist || t.album || 'Artiste inconnu') : 'RideNCT Player';
                    if (t && this.state.curCoverUrl) { art.style.backgroundImage = `url("${this.state.curCoverUrl}")`; art.style.backgroundSize = 'cover'; art.style.backgroundPosition = 'center'; art.textContent = ''; }
                    else { art.style.backgroundImage = ''; art.innerHTML = VI.musicBig; }
                    this.$('local-progress-fill').style.width = '0%';
                    this.$('local-time-current').textContent = '0:00';
                    this.$('local-time-total').textContent = t && t.dur ? this.fmt(t.dur) : '0:00';
                },

                /* Volume musique unique (lecteur local + musique partagée dans l'Intercom) */
                setVolume(v, persist) {
                    const s = this.state; v = Math.max(0, Math.min(1, v)); s.volume = v;
                    const g = (typeof ModuleMusicShare !== 'undefined') ? ModuleMusicShare.st.graph : null;
                    if (g && g.local) { g.local.gain.value = v; s.audioObj.volume = 1; } else s.audioObj.volume = v;
                    const pct = Math.round(v * 100);
                    const ls = this.$('local-volume'); if (ls) ls.value = pct;
                    const ic = this.$('ic-music-vol'); if (ic) { ic.value = pct; const l = this.$('ic-music-vol-val'); if (l) l.textContent = pct + '%'; }
                    if (typeof ModuleMusicShare !== 'undefined') { ModuleMusicShare.st.vol = pct; ModuleMusicShare.applyMusic(); }
                    if (persist) this.kvSet('volume', v);
                },

                refreshLocalUI() {
                    const s = this.state;
                    this.setVolume(s.volume, false);
                    this.$('btn-local-shuffle').classList.toggle('on', s.shuffle);
                    this.$('btn-local-repeat').classList.toggle('on', s.repeat > 0);
                    this.$('rep1-badge').style.display = s.repeat === 2 ? 'block' : 'none';
                    const vr = this.$('local-volume-row');
                    vr.style.display = s.volSupported ? 'flex' : 'none';
                    this.$('local-volume').value = Math.round(s.volume * 100);
                    this.refreshCount(); this.onPlayState();
                },

                refreshCount() {
                    const s = this.state, el = this.$('local-count');
                    if (!s.tracks.length) { el.textContent = ''; return; }
                    const total = s.tracks.reduce((x, t) => x + (t.dur || 0), 0);
                    const known = s.tracks.every(t => t.dur);
                    const mb = s.tracks.reduce((x, t) => x + t.size, 0) / 1048576;
                    el.textContent = `${s.tracks.length} titre${s.tracks.length > 1 ? 's' : ''}` + (total ? ` · ${known ? '' : '≈ '}${total >= 3600 ? Math.floor(total / 3600) + ' h ' + String(Math.floor(total % 3600 / 60)).padStart(2, '0') + ' min' : Math.round(total / 60) + ' min'}` : '') + ` · ${mb >= 1024 ? (mb / 1024).toFixed(1) + ' Go' : Math.round(mb) + ' Mo'}`;
                },

                renderPlaylist() {
                    const c = this.$('local-playlist-container'), s = this.state;
                    if (!s.tracks.length) { c.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:24px 10px;">Votre playlist locale est vide.<br>Ajoute des musiques ou choisis un dossier dans « Sources » : elles restent dans l\'app, même hors ligne.</div>'; return; }
                    const playing = !s.audioObj.paused;
                    const ids = s.shuffle ? s.order : s.tracks.map(t => t.id);
                    c.innerHTML = '';
                    ids.forEach((id, n) => {
                        const t = s.tracks.find(x => x.id === id); if (!t) return;
                        const cur = id === s.currentId;
                        const row = document.createElement('div');
                        row.className = 'playlist-item' + (cur ? ' active' : '');
                        row.innerHTML = `<div class="pi-num">${cur ? `<span class="pi-eq${playing ? '' : ' paused'}"><i></i><i></i><i></i></span>` : n + 1}</div>
                            <div class="pi-body"><div class="pi-title">${this.esc(t.title)}</div><div class="pi-sub">${this.esc(t.artist || 'Artiste inconnu')}${t.dur ? ' · ' + this.fmt(t.dur) : ''}${t.source === 'drive' ? (t.stream ? ' · ' + VI.cloud + ' en ligne' : t.blob ? ' · ' + VI.cloud + ' ✓' : ' · ' + VI.cloud + ' à télécharger') : ''}</div></div>
                            <button class="pi-del" aria-label="Retirer" style="display:flex;align-items:center;justify-content:center;">${VI.x}</button>`;
                        row.addEventListener('click', e => {
                            if (e.target.closest('.pi-del')) { this.removeTrack(id); return; }
                            if (cur) this.togglePlay(); else this.selectTrack(id, true);
                        });
                        c.appendChild(row);
                    });
                },

                /* ---------- Commandes écran verrouillé / casque / Bluetooth ---------- */
                updateMediaSession() {
                    if (!('mediaSession' in navigator)) return;
                    const t = this.current(); if (!t) return;
                    try {
                        const art = [];
                        if (this.state.curCoverUrl) art.push({ src: this.state.curCoverUrl, sizes: '512x512', type: t.coverBlob.type || 'image/jpeg' });
                        navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist || 'RideNCT', album: t.album || 'RideNCT Player', artwork: art });
                        if (!this._msBound) {
                            this._msBound = true;
                            const a = this.state.audioObj, set = (n, f) => { try { navigator.mediaSession.setActionHandler(n, f); } catch (e) {} };
                            set('play', () => { if (!this.state.currentId && this.state.order.length) this.selectTrack(this.state.order[0], true); else a.play().catch(() => {}); });
                            set('pause', () => a.pause());
                            set('previoustrack', () => this.prevTrack());
                            set('nexttrack', () => this.nextTrack(false));
                            set('seekbackward', d => { a.currentTime = Math.max(0, a.currentTime - ((d && d.seekOffset) || 10)); });
                            set('seekforward', d => { a.currentTime = Math.min(a.duration || 1e9, a.currentTime + ((d && d.seekOffset) || 10)); });
                            set('seekto', d => { if (d && typeof d.seekTime === 'number') a.currentTime = d.seekTime; });
                        }
                    } catch (e) {}
                },
                updatePositionState() {
                    const a = this.state.audioObj;
                    try { if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && isFinite(a.duration) && a.duration > 0) navigator.mediaSession.setPositionState({ duration: a.duration, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, a.duration) }); } catch (e) {}
                },

                /* ============================================================
                   SOURCES : dossier de l'appareil
                ============================================================ */
                isAudioName(n) { return /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i.test(n); },

                async initDevice() {
                    const hasFS = typeof window.showDirectoryPicker === 'function';
                    this.$('dir-pick').addEventListener('click', () => hasFS ? this.pickDirFS() : this.$('dir-fallback').click());
                    this.$('dir-fallback').addEventListener('change', async e => {
                        const files = Array.from(e.target.files || []).filter(f => this.isAudioName(f.name)); e.target.value = '';
                        if (!files.length) { this.toast('Aucune musique trouvée dans ce dossier'); return; }
                        const root = (files[0].webkitRelativePath || '').split('/')[0] || 'Dossier choisi';
                        this.kvSet('dirName', root); this.$('dir-status').innerHTML = VI.folder + ' ' + this.esc(root);
                        await this.addFiles(files);
                    });
                    this.$('dir-sync').addEventListener('click', () => this.syncDirFS(true));
                    const name = await this.kvGet('dirName');
                    if (name) this.$('dir-status').innerHTML = VI.folder + ' ' + this.esc(name);
                    if (hasFS) {
                        const h = await this.kvGet('dirHandle');
                        if (h) {
                            this._dirHandle = h; this.$('dir-sync').style.display = 'block';
                            try { if ((await h.queryPermission({ mode: 'read' })) === 'granted') this.syncDirFS(false); } catch (e) {}
                        }
                    }
                },

                async pickDirFS() {
                    try {
                        const h = await window.showDirectoryPicker({ id: 'vroom-music', mode: 'read' });
                        this._dirHandle = h; await this.kvSet('dirHandle', h); await this.kvSet('dirName', h.name);
                        this.$('dir-status').innerHTML = VI.folder + ' ' + this.esc(h.name); this.$('dir-sync').style.display = 'block';
                        await this.syncDirFS(true);
                    } catch (e) { if (e.name !== 'AbortError') this.toast('Dossier inaccessible'); }
                },

                async syncDirFS(interactive) {
                    const h = this._dirHandle; if (!h) return;
                    try {
                        let perm = await h.queryPermission({ mode: 'read' });
                        if (perm !== 'granted' && interactive) perm = await h.requestPermission({ mode: 'read' });
                        if (perm !== 'granted') return;
                        const files = [];
                        const walk = async (dir, depth) => {
                            for await (const [n, e] of dir.entries()) {
                                if (e.kind === 'file' && this.isAudioName(n)) {
                                    const f = await e.getFile(); if (!this.state.tracks.some(t => t.name === f.name && t.size === f.size)) files.push(f);
                                } else if (e.kind === 'directory' && depth < 6) await walk(e, depth + 1);
                            }
                        };
                        await walk(h, 0);
                        if (files.length) await this.addFiles(files); else if (interactive) this.toast('Dossier à jour');
                    } catch (e) { if (interactive) this.toast('Synchronisation impossible'); }
                },

                /* ============================================================
                   SOURCES : Google Drive par lien de partage
                ============================================================ */
                // Optionnel : ta clé API Google (Drive API) pour lister les dossiers partagés,
                // lire les noms et télécharger les titres pour le hors ligne. Sans clé : liens de fichiers uniquement.
                GOOGLE_API_KEY: '',
                gdKey() { return this.GOOGLE_API_KEY || this.lsGet('ridenct_gd_key') || ''; },

                /* Parcourt un dossier Drive (récursif) ; pub = lien partagé (clé API) sinon compte connecté */
                async gdScan(folderId, pub) {
                    const found = [];
                    const get = async url => {
                        const r = await fetch(url + '&key=' + encodeURIComponent(this.gdKey()));
                        if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (e) {} throw new Error(m || ('Erreur ' + r.status)); }
                        return r.json();
                    };
                    const walk = async (id, depth) => {
                        let page = '';
                        do {
                            const q = encodeURIComponent(`'${id}' in parents and trashed=false`);
                            const j = await get(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + page : ''}`);
                            page = j.nextPageToken || '';
                            for (const x of j.files || []) {
                                if (x.mimeType === 'application/vnd.google-apps.folder') { if (depth < 5) await walk(x.id, depth + 1); }
                                else if ((x.mimeType || '').startsWith('audio/') || this.isAudioName(x.name)) found.push(x);
                            }
                        } while (page);
                    };
                    await walk(folderId, 0);
                    return found;
                },

                async gdAddItems(found, pub) {
                    const s = this.state; let added = 0;
                    for (const x of found) {
                        if (s.tracks.some(t => t.driveId === x.id)) continue;
                        const base = x.name.replace(/\.[^/.]+$/, ''), m = base.split(' - ');
                        const rec = { name: x.name, title: m.length >= 2 ? m.slice(1).join(' - ').trim() : base, artist: m.length >= 2 ? m[0].trim() : '', album: '', size: Number(x.size) || 0, blob: null, coverBlob: null, dur: 0, added: Date.now(), source: 'drive', driveId: x.id, pub: !!pub };
                        try { rec.id = await this.tx('tracks', 'readwrite', st => st.add(rec)); } catch (e) { rec.id = 'd' + x.id; }
                        s.tracks.push(rec); s.order.push(rec.id); added++;
                    }
                    this.renderPlaylist(); this.refreshCount();
                    if (added && s.currentId == null) this.selectTrack(s.order[0], false);
                    return added;
                },

                /* ---------- Liens de partage ---------- */
                async initLinks() {
                    this.links = (await this.kvGet('pubLinks')) || [];
                    if (this.GOOGLE_API_KEY) this.$('gl-key-block').style.display = 'none';
                    else this.$('gl-key').value = this.lsGet('ridenct_gd_key') || '';
                    this.$('gl-go').addEventListener('click', () => this.linkAdd());
                    this.$('gl-sync').addEventListener('click', async () => { for (const l of this.links) if (!l.stream) await this.linkScan(l, true); });
                    this.linksRender();
                },
                linksRender() {
                    const box = this.$('gl-list'); box.innerHTML = '';
                    this.links.forEach((l, i) => {
                        const row = document.createElement('div'); row.className = 'mu-fl';
                        row.innerHTML = `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.folder ? VI.folder : VI.music} ${this.esc(l.name)}</span><button class="pi-del" aria-label="Retirer" style="display:flex;align-items:center;justify-content:center;">${VI.x}</button>`;
                        row.querySelector('button').addEventListener('click', async () => {
                            const rm = this.state.tracks.filter(t => t.pub && t.linkId === l.id && !t.blob).map(t => t.id);
                            for (const id of rm) await this.removeTrack(id);
                            this.links.splice(i, 1); await this.kvSet('pubLinks', this.links); this.linksRender();
                        });
                        box.appendChild(row);
                    });
                    this.$('gl-sync').style.display = this.links.length ? 'block' : 'none';
                },
                parseDriveLink(u) {
                    const m = u.match(/\/folders\/([\w-]{10,})/) || u.match(/\/d\/([\w-]{10,})/) || u.match(/[?&]id=([\w-]{10,})/);
                    return m ? { id: m[1], folder: /\/folders\//.test(u) } : null;
                },
                async linkAdd() {
                    const lines = this.$('gl-link').value.split(/\n+/).map(x => x.trim()).filter(Boolean);
                    const entries = lines.map(l => { const i = l.lastIndexOf('|'); const url = i >= 0 ? l.slice(i + 1).trim() : l; const nm = i >= 0 ? l.slice(0, i).trim() : ''; const d = this.parseDriveLink(url); return d && Object.assign(d, { label: nm }); }).filter(Boolean);
                    if (!entries.length) { this.toast('Lien Drive non reconnu'); return; }
                    const k = this.$('gl-key').value.trim();
                    if (k && !this.GOOGLE_API_KEY) { if (!/^AIza[\w-]{30,}$/.test(k)) { this.toast('Clé API invalide (commence par AIza…)'); return; } this.lsSet('ridenct_gd_key', k); }
                    let added = 0, n = this.state.tracks.filter(t => t.stream).length;
                    for (const en of entries) {
                        try {
                            if (this.gdKey()) {
                                const r = await fetch(`https://www.googleapis.com/drive/v3/files/${en.id}?fields=id,name,mimeType,size&supportsAllDrives=true&key=${encodeURIComponent(this.gdKey())}`);
                                if (!r.ok) throw new Error(r.status === 404 ? 'Introuvable ou non partagé « avec le lien »' : r.status === 403 ? 'Accès refusé (partage ou clé API)' : 'Erreur ' + r.status);
                                const meta = await r.json();
                                const l = { id: en.id, name: meta.name, folder: meta.mimeType === 'application/vnd.google-apps.folder', file: meta };
                                if (!this.links.some(x => x.id === en.id)) this.links.push(l);
                                await this.linkScan(l, true);
                            } else {
                                if (en.folder) { this.toast('Un dossier entier demande une clé API : colle plutôt les liens des fichiers'); continue; }
                                if (this.links.some(x => x.id === en.id)) continue;
                                n++;
                                const name = en.label || ('Titre Drive ' + n);
                                const l = { id: en.id, name, folder: false, stream: true };
                                this.links.push(l);
                                const rec = { name, title: name, artist: '', album: '', size: 0, blob: null, coverBlob: null, dur: 0, added: Date.now(), source: 'drive', driveId: en.id, pub: true, stream: `https://drive.google.com/uc?export=download&id=${en.id}`, linkId: en.id };
                                try { rec.id = await this.tx('tracks', 'readwrite', st => st.add(rec)); } catch (e) { rec.id = 'd' + en.id; }
                                this.state.tracks.push(rec); this.state.order.push(rec.id); added++;
                            }
                        } catch (e) { this.toast(e.message); }
                    }
                    await this.kvSet('pubLinks', this.links);
                    this.$('gl-link').value = ''; this.linksRender(); this.renderPlaylist(); this.refreshCount();
                    if (added) { this.toast(`${added} titre${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}`); if (this.state.currentId == null) this.selectTrack(this.state.order[0], false); }
                },
                async linkScan(l, interactive) {
                    try {
                        this.toast('Analyse du lien…');
                        const found = l.folder ? await this.gdScan(l.id, true) : [l.file];
                        found.forEach(x => x.linkId = l.id);
                        const before = this.state.tracks.length;
                        const added = await this.gdAddItems(found, true);
                        this.state.tracks.forEach(t => { if (t.pub && !t.linkId && found.some(x => x.id === t.driveId)) t.linkId = l.id; });
                        this.state.tracks.slice(before).forEach(t => { t.linkId = l.id; this.persistTrack(t); });
                        this.toast(added ? `${added} titre${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}` : (found.length ? 'Lien à jour' : 'Aucune musique trouvée'));
                    } catch (e) { if (interactive) this.toast(e.message); }
                },

                /* Télécharge un titre Drive (puis il reste en cache hors ligne) */
                async fetchDriveBlob(t) {
                    if (t.blob) return;
                    if (this._dl && this._dl[t.id]) return this._dl[t.id];
                    this._dl = this._dl || {};
                    this._dl[t.id] = (async () => {
                        if (!t.pub) throw new Error('source supprimée');
                        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${t.driveId}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(this.gdKey())}`);
                        if (!r.ok) throw new Error(r.status === 403 ? 'accès refusé (quota ou partage)' : 'erreur ' + r.status);
                        const blob = await r.blob();
                        t.blob = blob; t.size = blob.size || t.size;
                        const meta = await this.readTags(blob);
                        if (meta.title) t.title = meta.title; if (meta.artist) t.artist = meta.artist; if (meta.album) t.album = meta.album; if (meta.cover) t.coverBlob = meta.cover;
                        await this.persistTrack(t);
                    })();
                    try { await this._dl[t.id]; } finally { delete this._dl[t.id]; }
                },

                prefetchNext() {
                    const s = this.state; if (!s.order.length) return;
                    const nx = s.tracks.find(t => t.id === s.order[(s.pos + 1) % s.order.length]);
                    if (nx && nx.source === 'drive' && !nx.blob && !nx.stream && navigator.onLine && nx.pub && this.gdKey()) this.fetchDriveBlob(nx).then(() => this.renderPlaylist()).catch(() => {});
                }
            };
