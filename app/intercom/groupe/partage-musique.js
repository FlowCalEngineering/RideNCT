            // La musique du lecteur RideNCT est envoyée en direct (WebRTC, chiffré) aux seuls motards
            // du même canal, sur une piste audio dédiée : chacun peut la couper ou régler son volume
            // sans toucher à la voix. Un seul « DJ » à la fois : celui qui démarre prend la main.
            const ModuleMusicShare = {
                st: { on: false, graph: null, remote: null, listen: true, vol: 80, voice: 100, hb: null },
                /* Volume réel d'un motard = son réglage individuel × volume général des motards */
                voiceVol(rid, individual) {
                    let ind = individual;
                    if (ind == null) { ind = 100; try { const m = ModuleIntercom.state.userVolumes; if (rid && m.has(rid)) ind = m.get(rid); } catch (e) {} }
                    return Math.max(0, Math.min(1, (ind / 100) * (this.st.voice / 100)));
                },
                applyVoice() {
                    if (typeof ModuleCommunity === 'undefined') return;
                    ModuleCommunity.state.peers.forEach(p => this.setGain(p, 'voice'));
                },
                applyMusic() { if (typeof ModuleCommunity === 'undefined') return; ModuleCommunity.state.peers.forEach(p => this.setGain(p, 'music')); },

                /* ---- Volume fiable partout (iPhone ignore audio.volume) : le son passe par un GainNode WebAudio ---- */
                ctx() {
                    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
                    if (!this._ctx) {
                        this._ctx = new AC();
                        this._ctx.onstatechange = () => { this.applyVoice(); this.applyMusic(); };
                        const wake = () => { if (this._ctx && this._ctx.state !== 'running') this._ctx.resume().catch(() => {}); };
                        ['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, wake, { passive: true }));
                    }
                    if (this._ctx.state !== 'running') this._ctx.resume().catch(() => {});
                    return this._ctx;
                },
                wire(peer, kind, stream) {
                    try {
                        const c = this.ctx(); if (!c) return false;
                        if (peer[kind + 'Src']) { try { peer[kind + 'Src'].disconnect(); } catch (e) {} }
                        const src = c.createMediaStreamSource(stream), g = c.createGain(); g.gain.value = 0;
                        src.connect(g); g.connect(c.destination);
                        peer[kind + 'Src'] = src; peer[kind + 'Gain'] = g;
                        const el = kind === 'voice' ? peer.audioEl : peer.musicEl;
                        if (el) { el.muted = true; const p = el.play(); if (p && p.catch) p.catch(() => {}); }  // l'élément reste branché (nécessaire pour que le flux circule)
                        this.setGain(peer, kind);
                        return true;
                    } catch (e) { return false; }
                },
                /* active = on entend ce flux ; sinon silence */
                setGain(peer, kind, active) {
                    if (active !== undefined) peer['_on_' + kind] = !!active;
                    const on = !!peer['_on_' + kind];
                    const vol = kind === 'voice' ? this.voiceVol(peer.rid) : this.st.vol / 100;
                    const el = kind === 'voice' ? peer.audioEl : peer.musicEl, g = peer[kind + 'Gain'];
                    const wa = !!(g && this._ctx && this._ctx.state === 'running');
                    if (g) g.gain.value = (wa && on) ? vol : 0;
                    if (el) {
                        if (wa) el.muted = true;                    // le son sort par WebAudio
                        else { el.volume = vol; el.muted = !on; }   // repli : lecture directe (contexte audio pas encore autorisé)
                    }
                },
                $(id) { return document.getElementById(id); },
                IC() { return (typeof ModuleIntercom !== 'undefined') ? ModuleIntercom.state : null; },
                inRoom() { const c = this.IC(); return !!(c && c.isConnected && c.currentCode != null); },
                roomPeers() {
                    const c = this.IC(); if (!this.inRoom()) return [];
                    return Array.from(ModuleCommunity.state.peers.values()).filter(p => ModuleIntercom.sameRoom(p));
                },
                sendRoom(obj) {
                    obj.type = 'music'; obj.rid = ModuleCommunity.state.myId;
                    this.roomPeers().forEach(p => ModuleCommunity.sendTo(p, obj));
                },
                toast(m) { if (typeof ModuleMusic !== 'undefined') ModuleMusic.toast(m); },
                hasGraph() { return !!this.st.graph; },

                init() {
                    try { this.st.listen = localStorage.getItem('ridenct_share_listen') !== '0'; } catch (e) {}
                    try { const v = parseInt(localStorage.getItem('ridenct_ic_voice_master'), 10); this.st.voice = isNaN(v) ? 100 : v; } catch (e) { this.st.voice = 100; }
                    this.$('ic-music-vol').value = this.st.vol; this.$('ic-music-vol-val').textContent = this.st.vol + '%';
                    this.$('ic-voice-vol').value = this.st.voice; this.$('ic-voice-vol-val').textContent = this.st.voice + '%';
                    ['ic-voice-vol', 'ic-voice-vol-auto'].forEach(id => this.$(id).addEventListener('input', e => {
                        this.st.voice = parseInt(e.target.value, 10);
                        ['ic-voice-vol', 'ic-voice-vol-auto'].forEach(x => { this.$(x).value = this.st.voice; this.$(x + '-val').textContent = this.st.voice + '%'; });
                        try { localStorage.setItem('ridenct_ic_voice_master', String(this.st.voice)); } catch (x) {}
                        this.applyVoice();
                    }));
                    this.$('ic-voice-vol-auto').value = this.st.voice; this.$('ic-voice-vol-auto-val').textContent = this.st.voice + '%';
                    this.$('ic-music-share-btn').addEventListener('click', () => this.st.on ? this.stop(true) : this.start());
                    this.$('ic-music-listen').addEventListener('click', () => {
                        this.st.listen = !this.st.listen; try { localStorage.setItem('ridenct_share_listen', this.st.listen ? '1' : '0'); } catch (e) {}
                        this.render(); if (typeof ModuleCommunity !== 'undefined') ModuleCommunity.refreshAudioRouting();
                    });
                    this.$('ic-music-vol').addEventListener('input', e => ModuleMusic.setVolume(parseInt(e.target.value, 10) / 100, true));
                    this.$('ic-music-prev').addEventListener('click', () => ModuleMusic.prevTrack());
                    this.$('ic-music-next').addEventListener('click', () => ModuleMusic.nextTrack(false));
                    this.$('ic-music-play').addEventListener('click', () => ModuleMusic.togglePlay());
                    this.render();
                },

                /* Chaîne audio : lecteur RideNCT → (haut-parleur) + (piste envoyée aux autres) */
                ensureGraph() {
                    if (this.st.graph) return this.st.graph;
                    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('Audio non compatible');
                    const ctx = this.ctx() || new AC(), a = ModuleMusic.state.audioObj;
                    const src = ctx.createMediaElementSource(a), dest = ctx.createMediaStreamDestination();
                    // Volume local = gain après la prise du flux partagé : les autres entendent le titre à pleine puissance
                    const local = ctx.createGain(); src.connect(local); local.connect(ctx.destination);
                    this.st.graph = { ctx, src, dest, local, track: dest.stream.getAudioTracks()[0], linked: false };
                    ModuleMusic.setVolume(ModuleMusic.state.volume, false);
                    return this.st.graph;
                },

                async start() {
                    if (!this.inRoom()) return;
                    if (typeof AppSub !== 'undefined' && !AppSub.gate()) return;
                    if (!AppWarn.done('musique') && !(await AppWarn.ask('musique'))) return;
                    const t = ModuleMusic.current();
                    if (!t) { this.toast('Choisis d\'abord un titre dans l\'onglet Musique'); return; }
                    if (t.stream && !this.st.graph) { this.toast('Ce titre est lu en ligne depuis Drive : il ne peut pas être partagé. Ajoute-le en local.'); return; }
                    try {
                        const g = this.ensureGraph();
                        await g.ctx.resume();
                        if (!g.linked) { g.src.connect(g.dest); g.linked = true; }
                    } catch (e) { this.toast('Partage impossible : ' + e.message); return; }
                    this.st.on = true;
                    this.st.remote = null;
                    this.sendRoom(Object.assign({ act: 'start' }, this.meta()));
                    clearInterval(this.st.hb);
                    this.st.hb = setInterval(() => { if (this.st.on) this.sendRoom(Object.assign({ act: 'meta' }, this.meta())); }, 6000);
                    ModuleCommunity.refreshAudioRouting();
                    this.render();
                    if (ModuleMusic.state.audioObj.paused) this.toast('Partage actif — lance la lecture pour que les autres entendent');
                },

                stop(notify) {
                    const g = this.st.graph;
                    if (g && g.linked) { try { g.src.disconnect(g.dest); } catch (e) {} g.linked = false; }
                    if (notify && this.st.on) this.sendRoom({ act: 'stop' });
                    this.st.on = false; clearInterval(this.st.hb); this.st.hb = null;
                    if (typeof ModuleCommunity !== 'undefined') ModuleCommunity.refreshAudioRouting();
                    this.render();
                },

                meta() {
                    const t = ModuleMusic.current();
                    let name = 'Un motard'; try { name = ModuleProfile.state.name || name; } catch (e) {}
                    return { name: String(name).slice(0, 40), title: t ? t.title : '', artist: t ? (t.artist || '') : '' };
                },

                onTrackChange() { if (this.st.on) { this.sendRoom(Object.assign({ act: 'meta' }, this.meta())); this.render(); } },
                onLeave() { this.stop(true); this.st.remote = null; this.render(); },

                /* ---- Réception ---- */
                isMusicTrack(peer, ev) {
                    try {
                        const list = peer.pc.getTransceivers().filter(t => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio');
                        return list.indexOf(ev.transceiver) === 1;
                    } catch (e) { return false; }
                },
                onMusicTrack(peer, track) {
                    if (!peer.musicEl) {
                        const a = document.createElement('audio'); a.autoplay = true; a.playsInline = true; a.style.display = 'none';
                        document.body.appendChild(a); peer.musicEl = a;
                    }
                    peer.musicEl.volume = this.st.vol / 100;
                    peer.musicEl.srcObject = new MediaStream([track]);
                    peer.musicEl.muted = true;
                    this.wire(peer, 'music', peer.musicEl.srcObject);
                    ModuleCommunity.refreshAudioRouting();
                },
                /* Appelé pour chaque motard connecté par refreshAudioRouting */
                routePeer(peer, sameRoom) {
                    if (peer.musicSender) {
                        const want = (sameRoom && this.st.on && this.st.graph) ? this.st.graph.track : null;
                        if (peer.musicSender.track !== want) { try { peer.musicSender.replaceTrack(want).catch(() => {}); } catch (e) {} }
                    }
                    if (peer.musicEl) {
                        const mine = this.st.remote && this.st.remote.sid === peer.sid;
                        const hear = !!(sameRoom && mine && this.st.listen && !this.st.on);
                        this.setGain(peer, 'music', hear);
                        if (hear) { const p = peer.musicEl.play(); if (p && p.catch) p.catch(() => {}); }
                    }
                },
                onData(peer, m) {
                    if (typeof AppSub !== 'undefined' && !AppSub.premium()) return;   // gratuit : ne reçoit pas la musique partagée
                    const c = this.IC(); if (!this.inRoom() || !ModuleIntercom.sameRoom(peer)) return;
                    const clean = s => String(s == null ? '' : s).slice(0, 120);
                    const info = { sid: peer.sid, name: clean(m.name) || 'Un motard', title: clean(m.title), artist: clean(m.artist) };
                    if (m.act === 'start') {
                        if (this.st.on) { this.stop(false); this.toast(info.name + ' prend la main sur la musique'); }
                        this.st.remote = info;
                    } else if (m.act === 'meta') {
                        if (this.st.on) return;
                        if (!this.st.remote || this.st.remote.sid === peer.sid) this.st.remote = info;
                    } else if (m.act === 'stop') {
                        if (this.st.remote && this.st.remote.sid === peer.sid) this.st.remote = null;
                    } else return;
                    ModuleCommunity.refreshAudioRouting();
                    this.render();
                },
                onPeerClosed(sid) { if (this.st.remote && this.st.remote.sid === sid) { this.st.remote = null; this.render(); } },

                render() {
                    if (!this.$('ic-music-card')) return;
                    const on = this.st.on, r = this.st.remote, M = (typeof ModuleMusic !== 'undefined') ? ModuleMusic : null;
                    this.$('ic-music-share-btn').innerHTML = on ? VI.stop + '<span>Arrêter le partage</span>' : VI.music + '<span>Partager ma musique</span>';
                    this.$('ic-music-share-btn').style.display = (r && !on) ? 'none' : 'flex';
                    this.$('ic-music-self').style.display = on ? 'block' : 'none';
                    this.$('ic-music-now').style.display = (r && !on) ? 'block' : 'none';
                    if (on && M) {
                        const t = M.current();
                        this.$('ic-music-self-title').textContent = t ? t.title : 'Aucun titre en cours';
                        this.$('ic-music-self-artist').textContent = t ? (t.artist || '') : '';
                        this.$('ic-music-play').innerHTML = M.state.audioObj.paused ? VI.play.replace('class="vi"','class="vi" style="width:20px;height:20px;fill:currentColor"') : VI.pause.replace('class="vi"','class="vi" style="width:20px;height:20px;fill:currentColor"');
                    }
                    if (r && !on) {
                        this.$('ic-music-now-who').textContent = r.name + ' partage sa musique';
                        this.$('ic-music-now-title').textContent = r.title || '—';
                        this.$('ic-music-now-artist').textContent = r.artist;
                        this.$('ic-music-listen').innerHTML = (this.st.listen ? VI.volume : VI.mute).replace('class="vi"','class="vi" style="width:18px;height:18px"');
                    }
                }
            };
            document.addEventListener('DOMContentLoaded', () => ModuleMusicShare.init());
