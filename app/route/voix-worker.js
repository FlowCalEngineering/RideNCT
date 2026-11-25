// Voix naturelle : moteur Piper (WASM) dans un Web Worker, pour ne jamais figer la carte pendant la synthèse.
import * as tts from 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web/+esm';
self.onmessage = async (e) => {
    const { id, op, text, voice } = e.data;
    try {
        if (op === 'download') { await tts.download(voice, (p) => self.postMessage({ id, prog: p && p.total ? Math.round(p.loaded * 100 / p.total) : 0 })); self.postMessage({ id, ok: true }); }
        else if (op === 'stored') self.postMessage({ id, ok: true, list: await tts.stored() });
        else if (op === 'predict') { const w = await tts.predict({ text, voiceId: voice }); const buf = await w.arrayBuffer(); self.postMessage({ id, ok: true, buf }, [buf]); }
    } catch (err) { self.postMessage({ id, ok: false, err: String((err && err.message) || err).replace(/\s+/g, ' ').slice(0, 160) }); }
};
