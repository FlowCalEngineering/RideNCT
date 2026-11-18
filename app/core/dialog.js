/* Échappement HTML : tout texte qui n'est pas écrit par l'appli elle-même (nom, titre, message reçu, fichier importé) passe par ici avant d'entrer dans un innerHTML. */
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// Boîtes de dialogue intégrées à l'app (remplacent alert / confirm / prompt du navigateur)
//   AppDialog.alert(message, {title, okText})                       -> Promise<void>
//   AppDialog.confirm(message, {title, okText, cancelText, danger}) -> Promise<boolean>
//   AppDialog.prompt(title, valeur, {placeholder, okText, message, maxLength}) -> Promise<string|null>
//   AppDialog.toast(message, durée_ms)                              -> petit message qui disparaît seul
// Le style des pop-ups est intégré ici : plus de fichier CSS séparé qui pourrait manquer
(() => { if (document.getElementById('ad-style')) return; const st = document.createElement('style'); st.id = 'ad-style'; st.textContent = `
/* Boîtes de dialogue intégrées (AppDialog) */
.ad-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); opacity: 0; transition: opacity 0.2s ease; }
.ad-overlay.show { opacity: 1; }
.ad-card { width: 100%; max-width: 330px; background: var(--surface-color); color: var(--text-main); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 24px 22px 20px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.6); transform: scale(0.92); transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1); }
.ad-overlay.show .ad-card { transform: scale(1); }
.ad-ico { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; margin: 0 auto 12px; border: 2px solid currentColor; }
.ad-ico .vi { width: 28px; height: 28px; }
.ad-title { font-size: 1.05rem; font-weight: 800; margin: 0 0 8px; overflow-wrap: anywhere; }
.ad-msg { font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin: 0 0 18px; white-space: pre-line; overflow-wrap: anywhere; }
.ad-title:last-child { margin-bottom: 0; }
.ad-input { width: 100%; box-sizing: border-box; margin: 10px 0 18px; padding: 15px; border: none; outline: none; border-radius: 14px; background: rgba(255,255,255,0.1); color: var(--text-main); font-size: 1rem; font-weight: 600; font-family: inherit; text-align: left; }
.ad-actions { display: flex; gap: 10px; margin-top: 6px; }
.ad-actions.ad-col { flex-direction: column; }
.ad-btn { flex: 1; padding: 15px 10px; border: none; border-radius: 40px; font-family: inherit; font-size: 0.85rem; font-weight: 800; letter-spacing: 0.3px; cursor: pointer; }
.ad-primary { background: var(--accent-color); color: var(--on-accent); }
.ad-ghost { background: rgba(255,255,255,0.1); color: var(--text-main); }
.ad-danger { background: var(--danger-color); color: #fff; }
.ad-toast { position: fixed; left: 50%; bottom: calc(110px + env(safe-area-inset-bottom, 0px)); transform: translate(-50%, 20px); max-width: calc(100% - 40px); z-index: 10001; padding: 12px 20px; border-radius: 30px; background: rgba(28,28,30,0.95); color: #fff; border: 1px solid rgba(255,255,255,0.15); font-size: 0.85rem; font-weight: 700; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.5); opacity: 0; pointer-events: none; transition: opacity 0.2s ease, transform 0.2s ease; }
.ad-toast.show { opacity: 1; transform: translate(-50%, 0); }
`; (document.head || document.documentElement).appendChild(st); })();

const AppDialog = {
    _cur: null, _toastTimer: null,
    _open({ title, message, input, buttons, onEnter, icon }) {
        return new Promise((resolve) => {
            if (this._cur) this._cur.close(undefined);          // une seule boîte à la fois
            const root = document.createElement('div'); root.className = 'ad-overlay';
            root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
            const card = document.createElement('div'); card.className = 'ad-card'; root.appendChild(card);
            if (icon) { const ic = document.createElement('i'); ic.className = 'ad-ico'; if (icon.c) ic.style.cssText = 'color:' + icon.c + ';border-color:' + icon.c; ic.innerHTML = '<svg class="vi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon.g + '</svg>'; card.appendChild(ic); }
            if (title) { const h = document.createElement('h3'); h.className = 'ad-title'; h.textContent = title; card.appendChild(h); }
            if (message) { const p = document.createElement('p'); p.className = 'ad-msg'; p.textContent = message; card.appendChild(p); }
            let field = null;
            if (input) {
                field = document.createElement('input'); field.type = input.type || 'text'; field.className = 'ad-input';
                field.value = input.value || ''; field.placeholder = input.placeholder || ''; field.autocomplete = 'off'; field.spellcheck = false;
                if (input.maxLength) field.maxLength = input.maxLength;
                card.appendChild(field);
            }
            const row = document.createElement('div'); row.className = 'ad-actions' + (buttons.length > 2 ? ' ad-col' : ''); card.appendChild(row);
            let done = false;
            const close = (val) => {
                if (done) return; done = true; this._cur = null;
                root.classList.remove('show'); setTimeout(() => root.remove(), 200);
                document.removeEventListener('keydown', onKey, true); resolve(val);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { e.stopPropagation(); close(buttons[0].cancelValue); }
                else if (e.key === 'Enter' && (!e.target || e.target.tagName !== 'BUTTON')) { e.preventDefault(); e.stopPropagation(); onEnter && onEnter(close, field); }
            };
            buttons.forEach(b => {
                const el = document.createElement('button'); el.type = 'button'; el.className = 'ad-btn ' + (b.cls || ''); el.textContent = b.text;
                el.addEventListener('click', () => b.action(close, field)); row.appendChild(el);
            });
            root.addEventListener('click', (e) => { if (e.target === root) close(buttons[0].cancelValue); });
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(root);
            this._cur = { close };
            const reveal = () => { if (root.classList.contains('show')) return; root.classList.add('show'); if (field) { field.focus(); field.select(); } else { const p = row.querySelector('.ad-primary'); if (p) p.focus(); } };
            void root.offsetWidth;   // force le calcul de mise en page : la fenêtre apparaît tout de suite, sans attendre le prochain affichage
            reveal(); requestAnimationFrame(reveal); setTimeout(reveal, 60);
        });
    },
    alert(message, o = {}) {
        return this._open({ title: o.title || '', message: String(message), icon: o.icon, buttons: [{ text: o.okText || 'OK', cls: 'ad-primary', cancelValue: undefined, action: (c) => c(undefined) }], onEnter: (c) => c(undefined) });
    },
    confirm(message, o = {}) {
        return this._open({ title: o.title || '', message: String(message), onEnter: (c) => c(true), buttons: [
            { text: o.cancelText || 'Annuler', cls: 'ad-ghost', cancelValue: false, action: (c) => c(false) },
            { text: o.okText || 'Confirmer', cls: o.danger ? 'ad-danger' : 'ad-primary', action: (c) => c(true) }] });
    },
    prompt(title, value, o = {}) {
        const val = (f) => { const v = o.type === 'password' ? f.value : f.value.trim(); return v ? v : (o.allowEmpty ? '' : null); };
        return this._open({ title, message: o.message || '', input: { value: value || '', placeholder: o.placeholder || '', maxLength: o.maxLength || 80, type: o.type }, onEnter: (c, f) => c(val(f)), buttons: [
            { text: 'Annuler', cls: 'ad-ghost', cancelValue: null, action: (c) => c(null) },
            { text: o.okText || 'Valider', cls: 'ad-primary', action: (c, f) => c(val(f)) }] });
    },
    toast(message, ms = 2800) {
        let t = document.getElementById('ad-toast');
        if (!t) { t = document.createElement('div'); t.id = 'ad-toast'; t.className = 'ad-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
        t.textContent = String(message); t.classList.add('show');
        clearTimeout(this._toastTimer); this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
    }
};

// Stockage local sûr : une donnée corrompue ne fait plus planter l'écran, et un stockage plein prévient au lieu de perdre le trajet en silence
/* Aperçu d'itinéraire (SVG) venu du stockage, d'un import ou d'un motard : accepté seulement s'il ressemble à un SVG sans script ni gestionnaire d'événement. */
function safeSvg(s) { return (typeof s === 'string' && s.length < 200000 && /^\s*<svg[\s>]/.test(s) && !/<script|<foreignObject|<iframe|<image|<a[\s>]|\son\w+\s*=|javascript:|data:text/i.test(s)) ? s : ''; }
const AppStore = {
    // Listes dont chaque élément doit être un objet (un élément nul ou d'un autre type est écarté à la lecture)
    OBJ: ['moto_saved_routes', 'moto_recorded_rides', 'moto_playlists', 'moto_fav_places', 'moto_offline_q'],
    get(key, fallback) { try { const v = this.raw(key); if (v === null || v === '') return fallback; const d = JSON.parse(v); if (d === null || d === undefined || (Array.isArray(fallback) && !Array.isArray(d))) return fallback; if (Array.isArray(d)) return this.OBJ.includes(key) ? d.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : d.filter(x => x != null); return d; } catch (e) { return fallback; } },
    // Lecture « blindée » : un stockage corrompu ou d'une ancienne version ne doit jamais faire planter l'appli
    arr(key, objects) { const v = this.get(key, []); if (!Array.isArray(v)) return []; return objects ? v.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : v.filter(x => x != null); },
    obj(key) { const v = this.get(key, {}); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; },
    // --- Zone volumineuse : les trajets enregistrés vivent dans IndexedDB (limite = place libre du téléphone), pas dans localStorage (~5 Mo) ---
    // Lecture/écriture restent synchrones : une copie en mémoire est chargée au démarrage ; l'écriture part tout de suite vers IndexedDB.
    BIG: ['moto_recorded_rides', 'moto_sensors'], _big: new Map(), _bigMode: 'pending', _bigWaiters: [], _bigQ: Promise.resolve(),
    isBig(key) { return this.BIG.includes(key); },
    // Texte JSON brut d'une clé (zone volumineuse ou localStorage). Une valeur écrite directement dans localStorage (ancienne version, import) est reprise au passage.
    raw(key) {
        if (this._bigMode === 'idb' && this.isBig(key)) {
            if (this._big.has(key)) return this._big.get(key);
            let v = null; try { v = localStorage.getItem(key); } catch (e) {}
            if (v !== null && v !== '') { try { JSON.parse(v); this._big.set(key, v); this._bigPut(key, v).then(() => { try { localStorage.removeItem(key); } catch (e) {} }, () => {}); return v; } catch (e) { return v; } }
            return null;
        }
        return localStorage.getItem(key);
    },
    _bigDb() {
        if (this._dbp) return this._dbp;
        return this._dbp = new Promise((res, rej) => {
            try {
                const r = indexedDB.open(AppData.db('vroom_store'), 1);
                r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) {} };
                r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('bloqué'));
            } catch (e) { rej(e); }
        });
    },
    _bigPut(key, str) {
        // écritures dans l'ordre, une à la fois
        const run = () => this._bigDb().then(db => new Promise((ok, ko) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(str, key); tx.oncomplete = () => ok(); tx.onerror = () => ko(tx.error); tx.onabort = () => ko(tx.error || new Error('abandon')); }));
        const p = this._bigQ.then(run, run); this._bigQ = p.catch(() => {}); return p;
    },
    _bigGet(db, key) { return new Promise((ok, ko) => { const tx = db.transaction('kv', 'readonly'), rq = tx.objectStore('kv').get(key); rq.onsuccess = () => ok(rq.result === undefined ? null : rq.result); rq.onerror = () => ko(rq.error); }); },
    // Chargement + migration depuis localStorage (copie vérifiée avant effacement : rien n'est perdu si l'écriture échoue)
    async bigInit() {
        try {
            if (typeof indexedDB === 'undefined') throw new Error('pas d\'IndexedDB');
            const db = await this._bigDb();
            for (const key of this.BIG) {
                let cur = await this._bigGet(db, key), ls = null; try { ls = localStorage.getItem(key); } catch (e) {}
                if (ls !== null && ls !== '' && cur === null) {
                    let ok = false; try { JSON.parse(ls); ok = true; } catch (e) {}
                    if (ok) { await this._bigPut(key, ls); if ((await this._bigGet(db, key)) === ls) { cur = ls; try { localStorage.removeItem(key); } catch (e) {} } }
                } else if (ls !== null && cur !== null) { try { localStorage.removeItem(key); } catch (e) {} }   // reste d'une ancienne copie, déjà migrée
                if (cur !== null) this._big.set(key, cur);
            }
            this._bigMode = 'idb';
            try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}   // demande de ne pas effacer ces données en cas de manque de place
        } catch (e) { this._bigMode = 'ls'; console.warn('[Stockage] IndexedDB indisponible, repli sur localStorage :', e && e.message); }
        const w = this._bigWaiters; this._bigWaiters = []; w.forEach(f => { try { f(); } catch (e) {} });
    },
    whenReady(fn) { if (this._bigMode !== 'pending') fn(); else { this._bigWaiters.push(fn); setTimeout(() => { if (this._bigMode === 'pending') { this._bigMode = 'ls'; const w = this._bigWaiters; this._bigWaiters = []; w.forEach(f => { try { f(); } catch (e) {} }); } }, 4000); } },
    // Pour la sauvegarde : valeur brute d'une clé volumineuse, et restauration
    bigRaw(key) { try { return this._bigMode === 'idb' ? (this._big.get(key) ?? null) : localStorage.getItem(key); } catch (e) { return null; } },
    async bigRestore(key, str) {
        if (this._bigMode !== 'idb') { localStorage.setItem(key, str); return; }
        await this._bigPut(key, str); this._big.set(key, str); try { localStorage.removeItem(key); } catch (e) {}
    },
    // Place libre sur le téléphone (en octets), si le navigateur sait la dire
    async space() { try { const e = await navigator.storage.estimate(); return { usage: e.usage || 0, quota: e.quota || 0, free: Math.max(0, (e.quota || 0) - (e.usage || 0)) }; } catch (e) { return null; } },
    _bigFail() { try { AppDialog.alert('Le téléphone n\'a plus assez de place : ce trajet n\'a pas pu être enregistré.\n\nLibère de l\'espace (photos, applis, cartes hors ligne) puis réessaie.'); } catch (e) {} },
    set(key, value, quiet) {
        if (this._bigMode === 'idb' && this.isBig(key)) {
            let str; try { str = JSON.stringify(value); } catch (e) { return false; }
            this._big.set(key, str);
            this._bigPut(key, str).catch(() => { if (!quiet) this._bigFail(); });
            return true;
        }
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { if (!quiet) { try { AppDialog.alert('Stockage de l\'appareil plein : impossible d\'enregistrer.\n\nSupprime d\'anciens itinéraires, trajets ou cartes hors ligne puis réessaie.'); } catch (e2) {} } return false; }
    }
};

// fetch avec délai maximal (évite les requêtes qui restent pendues sur réseau dégradé)
function fetchT(url, opts, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 12000);
    const o = Object.assign({}, opts || {}); if (o.signal) { const ext = o.signal; if (ext.aborted) ac.abort(); else ext.addEventListener('abort', () => ac.abort()); }
    o.signal = ac.signal;
    return fetch(url, o).finally(() => clearTimeout(t));
}
AppStore.bigInit();
