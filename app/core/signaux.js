// Signaux sonores et vibrations discrets (arrivée / départ d'un motard dans le canal vocal).
// Réglage « cue » : all (son + vibration) · vibe (vibration seule) · off. Le son est bref et léger : il ne coupe ni la musique ni le micro.
const AppCue = {
    _ac: null, _last: 0,
    beep(freqs, dur) {
        try {
            const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
            const ac = this._ac || (this._ac = new C()); if (ac.state === 'suspended') ac.resume().catch(() => {});
            let t = ac.currentTime + 0.02;
            freqs.forEach(f => {
                const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02); t += dur;
            });
        } catch (e) {}
    },
    play(kind) {
        const m = (typeof AppPrefs !== 'undefined' && AppPrefs.get('cue')) || 'all';
        if (m === 'off') return;
        const now = Date.now(); if (now - this._last < 400) return; this._last = now;   // pas de rafale quand plusieurs motards arrivent d'un coup
        try { if (navigator.vibrate) navigator.vibrate(kind === 'join' ? [60] : [40, 60, 40]); } catch (e) {}
        if (m === 'all') this.beep(kind === 'join' ? [660, 880] : [880, 560], 0.11);
    },
    join() { this.play('join'); },
    leave() { this.play('leave'); }
};
