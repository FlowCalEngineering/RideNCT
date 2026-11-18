/* Profil : export / import de toutes les données de l'app dans un seul fichier. */
const ProfileBackup = {
    APP: 'ridenct-sauvegarde', OLD_APP: 'vroom-sauvegarde',
    // La session du compte (jetons) n'entre JAMAIS dans une sauvegarde : ni exportée, ni restaurée
    keep(k) { return /^(moto|motoapp)/.test(k) && !/^moto_(auth|data_|stash:)/.test(k); },
    // Compte propriétaire : la sauvegarde est liée au compte qui l'a créée
    me() { try { return (typeof AppAuth !== 'undefined' && AppAuth.user()) || null; } catch (e) { return null; } },
    async tag(id) { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vroom-compte:' + id))); return Array.from(h.slice(0, 16), b => b.toString(16).padStart(2, '0')).join(''); },
    idb() { return ModuleMaintenance.Photos.open(); },
    async readStore(db, name) {
        const out = {}; if (!db) return out;
        try {
            await new Promise((ok) => {
                const tx = db.transaction(name), os = tx.objectStore(name), rq = os.openCursor();
                rq.onsuccess = () => { const c = rq.result; if (c) { out[c.key] = c.value; c.continue(); } else ok(); };
                rq.onerror = () => ok();
            });
        } catch (e) {}
        return out;
    },
    async writeStore(db, name, obj) {
        if (!db) return;
        for (const [k, v] of Object.entries(obj || {})) {
            try { await new Promise((ok, ko) => { const tx = db.transaction(name, 'readwrite'); tx.objectStore(name).put(v, k); tx.oncomplete = ok; tx.onerror = () => ko(); tx.onabort = () => ko(); }); } catch (e) {}
        }
    },
    async collect() {
        const ls = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (this.keep(k)) ls[k] = localStorage.getItem(k); }
        AppStore.BIG.forEach(k => { const v = AppStore.bigRaw(k); if (v !== null) ls[k] = v; });   // trajets : stockés dans IndexedDB
        const db = await this.idb();
        const me = this.me();
        return { app: this.APP, version: 1, exportedAt: new Date().toISOString(), account: me ? { id: me.id, name: me.username || '' } : null, ls, atelier: { kv: await this.readStore(db, 'kv'), photos: await this.readStore(db, 'photos') } };
    },
    // --- Chiffrement par phrase secrète : PBKDF2-SHA256 (600 000 tours) + AES-GCM 256 ---
    KDF_ITER: 600000,
    b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
    unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },
    async deriveKey(pass, salt, iter) {
        const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    async encryptData(data, pass) {
        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(pass, salt, this.KDF_ITER);
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))));
        return { app: this.APP, version: 2, enc: true, acc: data.account && data.account.id ? await this.tag(data.account.id) : undefined, kdf: 'PBKDF2-SHA256', iter: this.KDF_ITER, exportedAt: data.exportedAt, salt: this.b64(salt), iv: this.b64(iv), ct: this.b64(ct) };
    },
    async decryptData(env, pass) {
        const iter = Number(env.iter); if (!(iter >= 100000 && iter <= 5000000)) throw new Error('paramètres invalides');
        const key = await this.deriveKey(pass, this.unb64(env.salt), iter);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(env.iv) }, key, this.unb64(env.ct));
        return JSON.parse(new TextDecoder().decode(pt));
    },
    async doExport() {
        const btn = document.getElementById('pf-export'); if (btn) btn.disabled = true;
        try {
            const pass = await AppDialog.prompt('Protéger la sauvegarde ?', '', { type: 'password', allowEmpty: true, maxLength: 100, okText: 'Exporter', placeholder: 'Phrase secrète (8 caractères minimum)',
                message: 'La sauvegarde contient ta fiche médicale, tes contacts d\'urgence, tes amis et ton identité. Une phrase secrète la chiffre. Si tu l\'oublies, la sauvegarde est perdue. Laisse vide pour exporter sans protection.' });
            if (pass === null) return;
            if (pass && pass.length < 8) { await AppDialog.alert('La phrase secrète doit faire au moins 8 caractères.'); return; }
            let data = await this.collect();
            if (pass) data = await this.encryptData(data, pass);
            const name = 'ridenct-sauvegarde-' + new Date().toISOString().slice(0, 10) + (pass ? '-chiffree' : '') + '.json';
            const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try { await navigator.share({ files: [file], title: 'Sauvegarde RideNCT' }); this.mark(); return; } catch (e) { if (e && e.name === 'AbortError') return; }
            }
            const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); this.mark();
        } catch (e) { AppDialog.alert("L'export a échoué. Réessaie."); }
        finally { if (btn) btn.disabled = false; }
    },
    mark() { try { const s = ProfileStats.load(); s.exported = 1; ProfileStats.save(s); ProfileStats.refresh(); } catch (e) {} },
    async doImport(file) {
        let data;
        if (file.size > 120 * 1024 * 1024) return AppDialog.alert('Ce fichier est trop volumineux pour être une sauvegarde de l\'app.');
        try { data = JSON.parse(await file.text()); } catch (e) { return AppDialog.alert("Ce fichier n'est pas une sauvegarde valide."); }
        const me = this.me(), myTag = me ? await this.tag(me.id) : '';
        const other = (who) => AppDialog.alert('Cette sauvegarde appartient à un autre compte' + (who ? ' (« ' + who + ' »)' : '') + '.\n\nElle ne peut pas être restaurée sur ' + (me && me.username ? 'le compte « ' + me.username + ' »' : 'ce compte') + '. Connecte-toi avec le compte qui l\'a créée pour la restaurer.');
        if (data && (data.app === this.APP || data.app === this.OLD_APP) && data.enc) {
            if (data.acc && myTag && data.acc !== myTag) return other('');
            if (typeof data.salt !== 'string' || typeof data.iv !== 'string' || typeof data.ct !== 'string') return AppDialog.alert("Ce fichier n'est pas une sauvegarde valide.");
            let plain = null;
            for (let i = 0; i < 3 && !plain; i++) {
                const pass = await AppDialog.prompt('Sauvegarde protégée', '', { type: 'password', maxLength: 100, okText: 'Déchiffrer', placeholder: 'Phrase secrète', message: i ? 'Phrase secrète incorrecte. Réessaie.' : 'Saisis la phrase secrète choisie à l\'export.' });
                if (pass === null) return;
                try { plain = await this.decryptData(data, pass); } catch (e) { plain = null; }
            }
            if (!plain) return AppDialog.alert('Phrase secrète incorrecte ou fichier abîmé : la sauvegarde n\'a pas été restaurée.');
            data = plain;
        }
        if (!data || (data.app !== this.APP && data.app !== this.OLD_APP) || !data.ls || typeof data.ls !== 'object') return AppDialog.alert("Ce fichier n'est pas une sauvegarde de l'app.");
        if (data.account && data.account.id && me && data.account.id !== me.id) return other(data.account.name || '');
        const legacy = !(data.account && data.account.id);
        const n = Object.keys(data.ls).filter(k => this.keep(k)).length, ph = Object.keys((data.atelier || {}).photos || {}).length;
        const day = String(data.exportedAt || '').slice(0, 10);
        const yes = await AppDialog.confirm(`Restaurer la sauvegarde${day ? ' du ' + day : ''} ?\n\n${n} réglages et listes, ${ph} photo${ph > 1 ? 's' : ''}. Les données actuelles de même nom seront remplacées.${legacy ? '\n\nCette sauvegarde date d\'avant les comptes : elle sera rattachée à ton compte.' : ''}`, { danger: true, okText: 'Restaurer' });
        if (!yes) return;
        // Restauration « tout ou rien » : on garde l'ancien contenu et on le remet si l'écriture échoue en route (stockage plein)
        const undo = new Map();
        try {
            const bigs = [];
            Object.entries(data.ls).forEach(([k, v]) => { if (this.keep(k) && typeof v === 'string') { if (AppStore.isBig(k)) { bigs.push([k, v]); return; } if (!undo.has(k)) undo.set(k, localStorage.getItem(k)); localStorage.setItem(k, v); } });
            for (const [k, v] of bigs) await AppStore.bigRestore(k, v);
            const db = await this.idb(), at = data.atelier || {};
            await this.writeStore(db, 'kv', at.kv); await this.writeStore(db, 'photos', at.photos);
        } catch (e) {
            undo.forEach((old, k) => { try { if (old === null) localStorage.removeItem(k); else localStorage.setItem(k, old); } catch (x) {} });
            return AppDialog.alert("La restauration a échoué : l'espace de stockage est peut-être plein.\n\nTes données actuelles n'ont pas été modifiées.");
        }
        // Laisse au navigateur le temps de finir d'écrire le stockage avant de recharger (sinon une écriture récente peut être perdue)
        // Copie en session : au rechargement, langue.js réapplique ces valeurs si le navigateur en a perdu
        try { const cp = {}; Object.entries(data.ls).forEach(([k, v]) => { if (this.keep(k) && typeof v === 'string') cp[k] = v; }); sessionStorage.setItem('ridenct_restore', JSON.stringify(cp)); } catch (e) {}
        await new Promise(r => setTimeout(r, 600));
        location.reload();
    },
    init() {
        const ex = document.getElementById('pf-export'), im = document.getElementById('pf-import'), fi = document.getElementById('pf-file');
        if (!ex || !im || !fi) return;
        ex.addEventListener('click', () => this.doExport());
        im.addEventListener('click', () => fi.click());
        fi.addEventListener('change', () => { const f = fi.files[0]; fi.value = ''; if (f) this.doImport(f); });
    }
};
ProfileBackup.init();
