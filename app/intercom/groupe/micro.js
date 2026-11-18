// Réglages du micro de l'intercom : suppression de bruit, filtre vent/moteur, volume, seuil anti-bruit (porte), choix du micro.
// Chaîne audio : micro → filtre passe-haut → volume → porte anti-bruit → limiteur → flux envoyé aux autres motards.
// intercom.js appelle ModuleMic.* seulement si ce module est chargé.
const ModuleMic = {
    KEY: 'moto_mic_cfg',
    PRESETS: {
        standard: { ns: true, echo: true, agc: true, hp: 0, gate: 0, gain: 100 },
        moto:     { ns: true, echo: true, agc: true, hp: 120, gate: 35, gain: 110 },
        vent:     { ns: true, echo: true, agc: true, hp: 250, gate: 50, gain: 130 }
    },
    NAMES: { standard: 'Standard', moto: 'Moto', vent: 'Vent fort' },
    cfg: null, ctx: null, raw: null, n: null, level: -100, open: true, _iv: null,
    $(id) { return document.getElementById(id); },
    toast(m) { if (typeof AppDialog !== 'undefined') AppDialog.toast(m); },

    // ---- Réglages mémorisés ----
    load() {
        if (this.cfg) return this.cfg;
        let saved = {}; try { saved = JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch (e) {}
        this.cfg = Object.assign({ preset: 'moto', deviceId: '' }, this.PRESETS.moto, saved);
        return this.cfg;
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.cfg)); } catch (e) {} },
    constraints() {
        const c = this.load(), a = { echoCancellation: { ideal: !!c.echo }, noiseSuppression: { ideal: !!c.ns }, autoGainControl: { ideal: !!c.agc } };
        if (c.deviceId) a.deviceId = { ideal: c.deviceId };
        return { audio: a };
    },
    gateDb() { const g = +this.load().gate || 0; return g <= 0 ? -100 : -75 + g * 0.45; },

    // ---- Chaîne audio ----
    async wrap(stream) {
        this.stopGraph(); this.raw = stream;
        try {
            const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return stream;
            const ctx = new AC(); this.ctx = ctx; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            const src = ctx.createMediaStreamSource(stream), hp = ctx.createBiquadFilter(), gain = ctx.createGain(), lim = ctx.createDynamicsCompressor(), dest = ctx.createMediaStreamDestination();
            hp.type = 'highpass'; hp.Q.value = 0.707;
            lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.1;
            this.n = { hp, gain, gate: null, gateGain: null };
            src.connect(hp); hp.connect(gain);
            let gate = null; try { gate = await this.makeGate(ctx); } catch (e) {}
            if (gate) { this.n.gate = gate; gain.connect(gate); gate.connect(lim); }
            else { // Repli (navigateur sans AudioWorklet) : porte pilotée par un minuteur
                const gg = ctx.createGain(), an = ctx.createAnalyser(); an.fftSize = 512; this.n.gateGain = gg;
                gain.connect(an); gain.connect(gg); gg.connect(lim);
                const buf = new Float32Array(an.fftSize); let hold = 0;
                this._iv = setInterval(() => {
                    an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
                    const db = 20 * Math.log10(Math.sqrt(s / buf.length) + 1e-9), th = this.gateDb(), on = th <= -99 || db > th;
                    if (on) hold = Date.now() + 350; const o = on || Date.now() < hold; this.level = db; this.open = o;
                    gg.gain.setTargetAtTime(o ? 1 : 0, ctx.currentTime, o ? 0.01 : 0.05);
                }, 40);
            }
            lim.connect(dest); this.apply();
            return dest.stream;
        } catch (e) { console.warn('[Micro] chaîne audio indisponible, micro brut utilisé', e); this.stopGraph(false); return stream; }
    },
    async makeGate(ctx) {
        if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('no worklet');
        const code = `class G extends AudioWorkletProcessor{constructor(){super();this.th=-100;this.g=1;this.hold=0;this.n=0;this.port.onmessage=e=>{if(e.data&&typeof e.data.th==='number')this.th=e.data.th}}
process(i,o){const a=i[0]&&i[0][0],b=o[0]&&o[0][0];if(!a||!b)return true;let s=0;for(let k=0;k<a.length;k++)s+=a[k]*a[k];
const db=20*Math.log10(Math.sqrt(s/a.length)+1e-9),on=this.th<=-99||db>this.th;if(on)this.hold=sampleRate*0.35;else this.hold-=a.length;
const t=(on||this.hold>0)?1:0,g0=this.g,g1=t>g0?Math.min(1,g0+0.35):Math.max(0,g0-0.06);this.g=g1;
for(let k=0;k<a.length;k++)b[k]=a[k]*(g0+(g1-g0)*k/a.length);
if(++this.n%12===0)this.port.postMessage({db:db,open:t});return true}}registerProcessor('moto-gate',G)`;
        const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        const node = new AudioWorkletNode(ctx, 'moto-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
        node.port.onmessage = (e) => { this.level = e.data.db; this.open = !!e.data.open; };
        return node;
    },
    // Applique les réglages en direct (sans couper le micro)
    apply() {
        const c = this.load(), n = this.n; if (!n || !this.ctx) return;
        const t = this.ctx.currentTime;
        n.hp.frequency.setTargetAtTime(c.hp > 0 ? c.hp : 10, t, 0.02);
        n.gain.gain.setTargetAtTime(Math.max(0, c.gain) / 100, t, 0.02);
        if (n.gate) n.gate.port.postMessage({ th: this.gateDb() });
        if (!c.gate && n.gateGain) n.gateGain.gain.setTargetAtTime(1, t, 0.02);
        const tr = this.raw && this.raw.getAudioTracks()[0];
        if (tr && tr.applyConstraints) tr.applyConstraints({ echoCancellation: !!c.echo, noiseSuppression: !!c.ns, autoGainControl: !!c.agc }).catch(() => {});
    },
    stopGraph(stopRaw = true) {
        clearInterval(this._iv); this._iv = null;
        if (this.n && this.n.gate) { try { this.n.gate.port.onmessage = null; this.n.gate.disconnect(); } catch (e) {} }
        if (this.ctx) { try { this.ctx.close(); } catch (e) {} }
        if (stopRaw && this.raw) this.raw.getTracks().forEach(t => t.stop());
        this.ctx = null; this.n = null; if (stopRaw) this.raw = null; this.level = -100; this.open = true;
    },
    release() { this.stopGraph(true); },

    // Change de micro (casque Bluetooth, micro filaire...) : on rouvre le flux et on remplace la piste envoyée
    async reacquire() {
        const api = (typeof ModuleIntercom !== 'undefined') ? ModuleIntercom.api : null; if (!api || !api.localStream) return;
        const old = this.raw;
        try {
            let s; try { s = await navigator.mediaDevices.getUserMedia(this.constraints()); } catch (e) { s = await navigator.mediaDevices.getUserMedia({ audio: true }); }
            const out = await this.wrap(s); if (old && old !== s) old.getTracks().forEach(t => t.stop());
            if (ModuleIntercom.state.isMicMuted) out.getAudioTracks().forEach(t => t.enabled = false);
            api.localStream = out; if (typeof ModuleCommunity !== 'undefined') ModuleCommunity.setLocalStream(out);
        } catch (e) { this.toast('Micro indisponible'); }
    },

    // ---- Interface ----
    set(key, val) { const c = this.load(); c[key] = val; if (key !== 'deviceId') c.preset = 'perso'; this.save(); this.apply(); },
    setPreset(name) { const c = this.load(); Object.assign(c, this.PRESETS[name], { preset: name }); this.save(); this.apply(); },
    async devices() {
        try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications'); } catch (e) { return []; }
    },
    // host : conteneur d'une page (Réglages › Micro intercom) ; sans host, feuille flottante comme avant
    async openPanel(host) {
        const old = this.$('mic-overlay'); if (old) old.remove();
        const ov = document.createElement('div'); ov.id = 'mic-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s;';
        const chip = (on) => `border:1px solid ${on ? 'var(--accent-color)' : 'rgba(128,128,128,.25)'};background:${on ? 'var(--accent-color)' : 'transparent'};color:${on ? 'var(--on-accent)' : 'var(--text-main)'};border-radius:12px;padding:9px 6px;font-weight:800;font-size:.78rem;font-family:inherit;cursor:pointer;flex:1;`;
        const row = (t, sub, body) => `<div style="padding:12px 0;border-top:1px solid rgba(128,128,128,.14);"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px;"><b style="font-size:.9rem;color:var(--text-main);">${t}</b><span data-val style="font-size:.78rem;font-weight:800;color:var(--text-muted);font-variant-numeric:tabular-nums;"></span></div>${sub ? `<div style="font-size:.72rem;color:var(--text-muted);font-weight:600;margin:-4px 0 8px;">${sub}</div>` : ''}${body}</div>`;
        const tog = (k, t, sub) => `<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(128,128,128,.14);cursor:pointer;"><span><b style="display:block;font-size:.88rem;color:var(--text-main);">${t}</b><span style="font-size:.72rem;color:var(--text-muted);font-weight:600;">${sub}</span></span><input type="checkbox" data-t="${k}" style="width:22px;height:22px;accent-color:var(--accent-color);flex-shrink:0;"></label>`;
        ov.innerHTML = `<div style="background:var(--surface-color);border-radius:24px 24px 0 0;width:100%;max-width:480px;max-height:88vh;display:flex;flex-direction:column;padding:18px 16px calc(16px + env(safe-area-inset-bottom));">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><h3 style="margin:0;font-size:1.15rem;font-weight:900;color:var(--text-main);">Réglages du micro</h3><button type="button" data-x style="background:none;border:none;color:var(--text-muted);font-size:1.3rem;padding:4px 8px;cursor:pointer;">✕</button></div>
            <div data-no-swipe style="overflow-y:auto;">
                <div style="display:flex;gap:6px;margin-bottom:12px;">${Object.keys(this.PRESETS).map(k => `<button type="button" data-p="${k}"></button>`).join('')}</div>
                <div style="background:rgba(128,128,128,.14);border-radius:12px;height:14px;position:relative;overflow:hidden;"><div data-bar style="position:absolute;left:0;top:0;bottom:0;width:0;background:#30d158;transition:background .1s;"></div><div data-mark style="position:absolute;top:0;bottom:0;width:2px;background:#ff9f0a;"></div></div>
                <div style="font-size:.72rem;color:var(--text-muted);font-weight:600;margin:6px 0 4px;">Parle : la barre verte doit dépasser le trait orange. Grise = ta voix est coupée par l'anti-bruit.</div>
                ${row('Volume du micro', '', '<input type="range" data-s="gain" min="50" max="200" step="5" class="vol-slider" style="width:100%;">')}
                ${row('Anti-bruit (vent, moteur)', 'Coupe le micro quand tu ne parles pas. Monte-le si on entend le vent en roulant.', '<input type="range" data-s="gate" min="0" max="100" step="1" class="vol-slider" style="width:100%;">')}
                ${row('Filtre graves (vent, moteur)', '', `<div style="display:flex;gap:6px;">${[[0, 'Aucun'], [120, 'Léger'], [250, 'Fort']].map(([v, l]) => `<button type="button" data-hp="${v}">${l}</button>`).join('')}</div>`)}
                ${tog('ns', 'Suppression de bruit', 'Réduit les bruits de fond (traitement du téléphone)')}
                ${tog('echo', "Annulation d'écho", 'Évite que ta voix revienne dans les haut-parleurs')}
                ${tog('agc', 'Volume automatique', 'Égalise la voix si tu parles bas ou fort')}
                <div data-dev style="padding:12px 0;border-top:1px solid rgba(128,128,128,.14);"><b style="display:block;font-size:.9rem;color:var(--text-main);margin-bottom:8px;">Micro utilisé</b><select data-d style="width:100%;padding:12px;border-radius:12px;background:var(--bg-color);color:var(--text-main);border:1px solid rgba(128,128,128,.25);font-family:inherit;font-size:.85rem;"></select></div>
            </div></div>`;
        (host || document.body).appendChild(ov); requestAnimationFrame(() => ov.style.opacity = '1');
        if (host) {   // page intégrée : pas de fond flottant ni de titre (la barre de la page fait office d'en-tête)
            ov.style.cssText = 'opacity:1;'; const sh = ov.firstElementChild; sh.style.cssText = 'width:100%;display:flex;flex-direction:column;';
            sh.firstElementChild.style.display = 'none'; const sc = sh.querySelector('[data-no-swipe]'); if (sc) sc.style.overflow = 'visible';
        }
        const q = (s) => ov.querySelector(s), qa = (s) => ov.querySelectorAll(s);
        const paint = () => {
            const c = this.load();
            qa('[data-p]').forEach(b => { b.style.cssText = chip(c.preset === b.dataset.p); b.textContent = this.NAMES[b.dataset.p]; });
            qa('[data-hp]').forEach(b => b.style.cssText = chip(c.hp === +b.dataset.hp));
            qa('[data-t]').forEach(i => i.checked = !!c[i.dataset.t]);
            qa('[data-s]').forEach(i => { i.value = c[i.dataset.s]; });
            const vals = ov.querySelectorAll('[data-val]'); vals[0].textContent = c.gain + '%'; vals[1].textContent = c.gate ? c.gate + '/100' : 'Désactivé';
            q('[data-mark]').style.left = (c.gate ? Math.max(0, Math.min(100, (this.gateDb() + 80) / 80 * 100)) : 0) + '%'; q('[data-mark]').style.display = c.gate ? 'block' : 'none';
        };
        const fillDevices = async () => {
            const sel = q('[data-d]'), list = await this.devices(), c = this.load();
            sel.innerHTML = '<option value="">Micro par défaut</option>' + list.map((d, i) => `<option value="${this.esc(d.deviceId)}">${this.esc(d.label || 'Micro ' + (i + 1))}</option>`).join('');
            sel.value = list.some(d => d.deviceId === c.deviceId) ? c.deviceId : '';
        };
        paint(); fillDevices();
        qa('[data-p]').forEach(b => b.addEventListener('click', () => { this.setPreset(b.dataset.p); paint(); }));
        qa('[data-hp]').forEach(b => b.addEventListener('click', () => { this.set('hp', +b.dataset.hp); paint(); }));
        qa('[data-t]').forEach(i => i.addEventListener('change', () => { this.set(i.dataset.t, i.checked); paint(); }));
        qa('[data-s]').forEach(i => i.addEventListener('input', () => { this.set(i.dataset.s, +i.value); paint(); }));
        q('[data-d]').addEventListener('change', async (e) => { this.set('deviceId', e.target.value); await this.reacquire(); fillDevices(); });
        let raf = 0; const loop = () => {
            const bar = q('[data-bar]'); if (!bar) return;
            bar.style.width = Math.max(0, Math.min(100, (this.level + 80) / 80 * 100)) + '%'; bar.style.background = this.open ? '#30d158' : '#8e8e93';
            raf = requestAnimationFrame(loop);
        }; loop();
        const close = () => { cancelAnimationFrame(raf); ov.style.opacity = '0'; setTimeout(() => ov.remove(), 200); };
        ov.addEventListener('click', e => { if (e.target === ov) close(); }); q('[data-x]').addEventListener('click', close);
        if (!this.raw) { const m = document.createElement('div'); m.style.cssText = 'font-size:.72rem;color:var(--text-muted);font-weight:700;margin-bottom:6px;'; m.textContent = 'Le micro est inactif : rejoins un canal pour voir le niveau en direct.'; q('[data-bar]').parentNode.before(m); }
    },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    init() { document.querySelectorAll('#ic-mic-settings-btn').forEach(b => b.addEventListener('click', () => this.openPanel())); }
};
document.addEventListener('DOMContentLoaded', () => ModuleMic.init());
