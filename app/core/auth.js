// ====================================================================
//  COMPTE (Supabase Auth) — accès à l'appli réservé aux comptes
//  - 1re ouverture (ou après déconnexion) : écran « Connexion / Créer un compte », l'appli ne démarre pas sans compte.
//  - Une session déjà ouverte laisse entrer même hors réseau (on roule souvent sans signal) ; elle est revérifiée en tâche de fond :
//    compte supprimé / banni / session révoquée => retour à l'écran d'accès.
//  - Réglages › Compte : pseudo, e-mail, déconnexion, suppression du compte (fonction serveur delete_my_account).
//  La clé ci-dessous est la clé PUBLIQUE (anon) : la sécurité est dans la base (RLS), pas dans l'appli.
// ====================================================================
const AppAuth = (() => {
    const URL_ = 'https://jpawfdgfggtlqxpbrpnd.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwYXdmZGdmZ2d0bHF4cGJycG5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMDc3NDUsImV4cCI6MjEwODY4Mzc0NX0.z8jJFPBew5OJWnt04yO-RcwP-nwfPA5tcPIzylEykNI';
    const LS = 'moto_auth', NOTE = 'moto_auth_note', BAN = 'moto_auth_ban';
    const rd = () => { try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); return o && o.access_token && o.refresh_token ? o : null; } catch (e) { return null; } };
    let sess = rd(), refreshing = null, lastCheck = 0;
    const save = (o) => { sess = o; try { o ? localStorage.setItem(LS, JSON.stringify(o)) : localStorage.removeItem(LS); } catch (e) {} };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const now = () => Math.floor(Date.now() / 1000);

    // Appel HTTP : { ok, status, json } ; status 0 = pas de réseau
    async function call(path, o = {}) {
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), o.timeout || 15000);
        try {
            const h = { apikey: KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (o.token || KEY) };
            const r = await fetch(URL_ + path, { method: o.method || 'GET', headers: h, body: o.body ? JSON.stringify(o.body) : undefined, signal: ctrl.signal });
            let j = null; try { j = await r.json(); } catch (e) {}
            return { ok: r.ok, status: r.status, json: j };
        } catch (e) { return { ok: false, status: 0, json: null }; } finally { clearTimeout(t); }
    }
    const toSession = (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || (now() + (j.expires_in || 3600)), user: { id: j.user.id, email: j.user.email, username: (j.user.user_metadata && j.user.user_metadata.username) || '' } });

    // Messages d'erreur en français
    function fr(r) {
        const j = r.json || {}, c = j.error_code || j.code || '', m = String(j.msg || j.message || j.error_description || j.error || '').toLowerCase();
        if (r.status === 0) return 'Pas de connexion Internet. Vérifie ton réseau et réessaie.';
        if (c === 'invalid_credentials' || m.includes('invalid login')) return 'E-mail ou mot de passe incorrect.';
        if (c === 'email_not_confirmed' || m.includes('not confirmed')) return 'Confirme d\'abord ton e-mail : clique sur le lien reçu, puis reconnecte-toi.';
        if (c === 'user_banned' || m.includes('banned')) return 'Ce compte est suspendu.';
        if (c === 'user_already_exists' || c === 'email_exists' || m.includes('already')) return 'Un compte existe déjà avec cet e-mail. Connecte-toi.';
        if (c === 'weak_password' || m.includes('password')) return 'Mot de passe trop faible : 10 caractères minimum, évite les mots de passe courants.';
        if (c === 'validation_failed' || m.includes('valid email') || m.includes('invalid email')) return 'Adresse e-mail invalide.';
        if (c === 'over_request_rate_limit' || c === 'over_email_send_rate_limit' || r.status === 429) return 'Trop de tentatives. Attends quelques minutes puis réessaie.';
        if (c === 'signup_disabled') return 'Les inscriptions sont fermées pour le moment.';
        return 'Une erreur est survenue (' + (r.status || '?') + '). Réessaie dans un instant.';
    }

    // Jeton valide (rafraîchi si besoin). null = session perdue ; undefined = réseau indisponible (on garde la session)
    async function token() {
        if (!sess) return null;
        if (sess.expires_at - 60 > now()) return sess.access_token;
        if (!refreshing) refreshing = (async () => {
            const r = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: sess.refresh_token } });
            if (r.ok && r.json && r.json.access_token) { const u = sess.user, n = toSession(r.json); save(Object.assign(n, { user: Object.assign({}, u, n.user, { username: n.user.username || u.username }) })); return sess.access_token; }
            if (r.status === 400 || r.status === 401 || r.status === 403) { kick('Session expirée : reconnecte-toi.'); return null; }
            return undefined;
        })().finally(() => { refreshing = null; });
        return refreshing;
    }
    // Retour forcé à l'écran d'accès
    // Bannissement définitif ? (fonction publique ban_notice : { banned, reason }) — le compte banni n'a plus de session, on garde son e-mail pour l'expliquer
    async function banInfo(email) {
        if (!email) return null;
        const r = await call('/rest/v1/rpc/ban_notice', { method: 'POST', body: { p_email: email }, timeout: 6000 });
        return r.ok && r.json && r.json.banned ? { reason: String(r.json.reason || '') } : null;
    }
    const banText = (b) => 'Ton compte a été banni définitivement et ne peut plus accéder à RideNCT.' + (b && b.reason ? '\n\nMotif : ' + b.reason : '');
    async function kick(msg) {
        const mail = sess && sess.user && sess.user.email, b = await banInfo(mail);
        try { sessionStorage.setItem(NOTE, b ? '' : (msg || '')); if (b) sessionStorage.setItem(BAN, b.reason || ' '); } catch (e) {}
        save(null); location.reload();
    }

    // Vérification en tâche de fond : compte supprimé / banni / révoqué => retour à l'accès
    async function check() {
        if (!sess || Date.now() - lastCheck < 60000) return; lastCheck = Date.now();
        const t = await token(); if (!t) return;
        const r = await call('/auth/v1/user', { token: t });
        if (r.status === 401 || r.status === 403 || r.status === 404) { kick('Ton compte n\'est plus disponible. Connecte-toi ou crée un compte.'); return; }
        if (r.ok && r.json) {
            const un = (r.json.user_metadata && r.json.user_metadata.username) || '';
            const p = await call('/rest/v1/profiles?select=username&user_id=eq.' + encodeURIComponent(r.json.id), { token: t });
            const name = (p.ok && p.json && p.json[0] && p.json[0].username) || un || sess.user.username || '';
            if (name !== sess.user.username || r.json.email !== sess.user.email) { sess.user = Object.assign({}, sess.user, { username: name, email: r.json.email }); save(sess); document.dispatchEvent(new CustomEvent('auth:update')); }
        }
    }

    async function signIn(email, pw) {
        const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: pw } });
        if (r.ok && r.json && r.json.access_token) { save(toSession(r.json)); return { ok: true }; }
        const j = r.json || {};
        if (j.error_code === 'user_banned' || String(j.msg || j.message || '').toLowerCase().includes('banned')) {
            const b = await banInfo(email) || { reason: '' };
            return { ok: false, banned: true, msg: banText(b) };
        }
        return { ok: false, msg: fr(r) };
    }
    async function signUp(email, pw, username) {
        const r = await call('/auth/v1/signup', { method: 'POST', body: { email, password: pw, data: { username } } });
        // Adresse déjà inscrite : Supabase répond « OK » sans erreur (anti-énumération) mais renvoie un utilisateur sans identité
        const u = r.json && (r.json.user || r.json);
        if (r.ok && u && Array.isArray(u.identities) && u.identities.length === 0) return { ok: false, exists: true, msg: 'Cette adresse e-mail est déjà utilisée : un compte existe déjà. Connecte-toi, ou utilise « Mot de passe oublié ? » si besoin.' };
        if (r.ok && r.json && r.json.access_token) { save(toSession(r.json)); return { ok: true }; }
        if (r.ok) return { ok: false, confirm: true, msg: 'Compte créé. Un e-mail de confirmation vient d\'être envoyé : clique sur le lien puis reviens te connecter.' };
        return { ok: false, msg: fr(r) };
    }
    // Métadonnées du compte (acceptation des CGU : version + date) — fusionnées côté Supabase, le pseudo n'est pas touché
    async function saveMeta(data) {
        const t = await token(); if (!t) return { ok: false };
        return call('/auth/v1/user', { method: 'PUT', token: t, body: { data }, timeout: 10000 });
    }
    async function recover(email) {
        const r = await call('/auth/v1/recover', { method: 'POST', body: { email } });
        return r.ok ? { ok: true } : { ok: false, msg: fr(r) };
    }
    async function usernameStatus(n) {
        const r = await call('/rest/v1/rpc/username_status', { method: 'POST', body: { p_name: n }, timeout: 8000 });
        return r.ok && typeof r.json === 'string' ? r.json : '';
    }
    // Modifier le pseudo (fonction set_my_username) : 3 à 20 caractères, vérifié (libre / interdit) avant l'enregistrement
    async function changeUsername() {
        if (!sess) return false;
        let v = sess.user.username || '';
        for (;;) {
            v = await AppDialog.prompt('Modifier mon pseudo', v, { message: '3 à 20 caractères : lettres, chiffres, . _ -', placeholder: 'Ton pseudo', maxLength: 20, okText: 'Enregistrer' });
            if (v === null) return false;
            if (v === sess.user.username) return false;
            let msg = '';
            if (!NAME_RE.test(v)) msg = 'Pseudo invalide : 3 à 20 caractères, lettres, chiffres, point, tiret ou underscore.';
            else {
                const st = await usernameStatus(v);
                if (st === 'pris') msg = 'Ce pseudo est déjà pris. Choisis-en un autre.'; else if (st === 'interdit') msg = 'Ce pseudo n\'est pas autorisé. Choisis-en un autre.'; else if (st === 'format') msg = 'Pseudo invalide : 3 à 20 caractères, lettres, chiffres, point, tiret ou underscore.';
            }
            if (!msg) {
                const r = await rpc('set_my_username', { p_name: v });
                if (r.ok) { sess.user = Object.assign({}, sess.user, { username: v }); save(sess); document.dispatchEvent(new CustomEvent('auth:update')); return true; }
                const j = r.json || {}, m = String(j.message || j.msg || '');
                msg = /username_pris|23505|duplicate/i.test(m + (j.code || '')) ? 'Ce pseudo est déjà pris. Choisis-en un autre.' : /username_interdit/.test(m) ? 'Ce pseudo n\'est pas autorisé. Choisis-en un autre.' : /username_invalide/.test(m) ? 'Pseudo invalide : 3 à 20 caractères, lettres, chiffres, point, tiret ou underscore.' : r.status === 0 ? 'Pas de connexion Internet. Vérifie ton réseau et réessaie.' : 'Impossible d\'enregistrer le pseudo pour le moment. Réessaie dans un instant.';
            }
            await AppDialog.alert(msg, { title: 'Pseudo indisponible' });
        }
    }
    async function signOut() {
        const t = sess && sess.access_token; if (t) call('/auth/v1/logout', { method: 'POST', token: t, timeout: 4000 });
        try { sessionStorage.setItem(NOTE, ''); } catch (e) {} try { AppSub.logOut(); } catch (e) {} save(null); setTimeout(() => location.reload(), 150);
    }
    async function deleteAccount() {
        const t = await token(); if (!t) return { ok: false, msg: t === null ? 'Session expirée : reconnecte-toi.' : fr({ status: 0 }) };
        const r = await call('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {}, token: t });
        if (!r.ok) return { ok: false, msg: r.status === 401 ? 'Session expirée : reconnecte-toi.' : fr(r) };
        try { sessionStorage.setItem(NOTE, 'Ton compte a été supprimé.'); } catch (e) {} try { AppData.release(sess && sess.user && sess.user.id); } catch (e) {} try { AppSub.logOut(); } catch (e) {} save(null); location.reload(); return { ok: true };
    }

    // ---------------- écran d'accès ----------------
    const EYE = '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    // Contrôle à l'inscription (la vérification « mots de passe compromis » de Supabase est réservée à l'offre Pro) : liste de mots de passe courants, séquences, répétitions, e-mail/pseudo
    const COMMON = ['password', 'motdepasse', 'azerty', 'qwerty', 'azertyuiop', 'qwertyuiop', 'azerty123', 'qwerty123', 'abcdef', 'abc123', 'iloveyou', 'jetaime', 'bonjour', 'bienvenue', 'soleil', 'doudou', 'chouchou', 'marseille', 'football', 'motorcycle', 'moto', 'yamaha', 'honda', 'kawasaki', 'suzuki', 'ducati', 'harley', 'triumph', 'ridenct', 'admin', 'welcome', 'letmein', 'monkey', 'dragon', 'master', 'superman', 'trustno1', 'passw0rd', 'p@ssw0rd', 'changeme', 'secret'];
    const weakPw = (pw, mail, name) => {
        const low = pw.toLowerCase(), flat = low.replace(/[^a-z0-9]/g, ''), simple = flat.replace(/[0-9]+$/, '');
        const leet = flat.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a');
        if (new Set(low).size < 4) return 'Mot de passe trop répétitif : mélange davantage de caractères.';
        if (/^[0-9]+$/.test(pw)) return 'Un mot de passe uniquement composé de chiffres est trop facile à deviner.';
        if (COMMON.some(w => simple === w || leet === w || flat === w || (w.length >= 6 && flat.startsWith(w) && flat.length <= w.length + 4))) return 'Ce mot de passe est trop courant : choisis-en un plus original.';
        if ('0123456789012'.includes(flat) || 'abcdefghijklmnopqrstuvwxyz'.includes(flat) || 'azertyuiopqsdfghjklmwxcvbn'.includes(flat) || 'qwertyuiopasdfghjklzxcvbnm'.includes(flat)) return 'Évite les suites de touches ou de chiffres (123456, azerty…).';
        const loc = String(mail || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, ''), nm = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if ((loc.length >= 4 && flat.includes(loc)) || (nm.length >= 4 && flat.includes(nm))) return 'Ne mets pas ton e-mail ou ton pseudo dans ton mot de passe.';
        return '';
    };
    const MAIL_RE = /^\S+@\S+\.\S+$/, NAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
    function gate() {
        if (document.getElementById('auth-gate')) return;
        let note = ''; try { note = sessionStorage.getItem(NOTE) || ''; sessionStorage.removeItem(NOTE); const bn = sessionStorage.getItem(BAN); if (bn !== null) { sessionStorage.removeItem(BAN); setTimeout(() => { try { AppDialog.alert(banText({ reason: bn.trim() }), { title: 'Compte banni' }); } catch (e) {} }, 400); } } catch (e) {}
        const g = document.createElement('div'); g.id = 'auth-gate'; g.className = 'auth-gate';
        g.innerHTML = `<div class="au-in">
            <img class="au-logo" src="assets/icon-only.png" alt="" onerror="this.style.display='none'">
            <h1 class="au-h1">Bienvenue sur RideNCT</h1>
            <div class="au-sub" id="au-sub"></div>
            <div class="au-note" id="au-note" ${note ? '' : 'hidden'}>${esc(note)}</div>
            <div class="au-tabs" role="tablist"><button type="button" class="on" data-tab="in" role="tab">Connexion</button><button type="button" data-tab="up" role="tab">Créer un compte</button></div>
            <form id="au-form" novalidate autocomplete="on">
                <label class="au-f" id="au-f-name" hidden><small>PSEUDO <em id="au-name-st"></em></small><input id="au-name" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20" placeholder="3 à 20 caractères : lettres, chiffres, . _ -"></label>
                <label class="au-f"><small>E-MAIL</small><input id="au-mail" type="email" autocomplete="email" autocapitalize="off" spellcheck="false" inputmode="email" placeholder="moi@exemple.fr"></label>
                <label class="au-f"><small id="au-pw-l">MOT DE PASSE</small><span class="au-pw"><input id="au-pw" type="password" autocomplete="current-password" placeholder="••••••••"><button type="button" class="au-eye" id="au-eye" aria-label="Afficher le mot de passe">${EYE}</button></span></label>
                <button type="submit" class="au-go" id="au-go">Se connecter</button>
            </form>
            <button type="button" class="au-lnk" id="au-forgot">Mot de passe oublié ?</button>
            <div class="au-leg" id="au-leg"></div></div>`;
        document.body.appendChild(g);
        const $ = (s) => g.querySelector(s); let tab = 'in', busy = false, nameOk = null, nt = 0;
        const setTab = (t) => {
            tab = t; g.querySelectorAll('.au-tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
            $('#au-f-name').hidden = t !== 'up'; $('#au-forgot').hidden = t !== 'in';
            $('#au-go').textContent = t === 'in' ? 'Se connecter' : 'Créer mon compte';
            $('#au-sub').textContent = t === 'in' ? 'Connecte-toi pour accéder à l\'app' : 'Crée ton compte en 30 secondes';
            $('#au-pw-l').textContent = t === 'in' ? 'MOT DE PASSE' : 'MOT DE PASSE (10 CARACTÈRES MIN.)';
            $('#au-pw').autocomplete = t === 'in' ? 'current-password' : 'new-password';
            $('#au-leg').innerHTML = t === 'in' ? 'Un compte est nécessaire pour utiliser l\'application.<br>Tes trajets restent enregistrés sur ton téléphone.' : 'Tu pourras supprimer ton compte à tout moment dans Réglages › Compte.<br>Après la création, tu devras accepter chaque point des conditions d\'utilisation.';
            $('#au-leg').innerHTML += '<div class="au-legal"><a href="#" data-lg-open="cgu">CGU</a> · <a href="#" data-lg-open="cgv">CGV</a> · <a href="#" data-lg-open="mentions">Mentions légales</a></div>';
        };
        const nameStatus = (s) => { const e = $('#au-name-st'); const M = { ok: ['✓ disponible', 'ok'], pris: ['déjà pris', 'ko'], format: ['3 à 20 car. : a-z 0-9 . _ -', 'ko'], interdit: ['non autorisé', 'ko'] }; const m = M[s] || ['', '']; e.textContent = m[0]; e.className = m[1]; nameOk = s === 'ok' ? true : (M[s] ? false : null); };
        $('#au-name').addEventListener('input', () => {
            clearTimeout(nt); const v = $('#au-name').value.trim(); nameStatus(''); if (!v) return;
            if (!NAME_RE.test(v)) { nameStatus('format'); return; }
            nt = setTimeout(async () => { const s = await usernameStatus(v); if (v === $('#au-name').value.trim()) nameStatus(s); }, 450);
        });
        g.querySelectorAll('.au-tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
        $('#au-eye').addEventListener('click', () => { const i = $('#au-pw'); i.type = i.type === 'password' ? 'text' : 'password'; });
        const say = (m) => (typeof AppDialog !== 'undefined' ? AppDialog.alert(m) : alert(m));
        $('#au-forgot').addEventListener('click', async () => {
            const mail = $('#au-mail').value.trim(); if (!MAIL_RE.test(mail)) { await say('Saisis d\'abord ton adresse e-mail ci-dessus.'); return; }
            const r = await recover(mail); await say(r.ok ? 'Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d\'être envoyé.' : r.msg);
        });
        $('#au-form').addEventListener('submit', async (e) => {
            e.preventDefault(); if (busy) return;
            const mail = $('#au-mail').value.trim(), pw = $('#au-pw').value, name = $('#au-name').value.trim();
            if (!MAIL_RE.test(mail)) { await say('Adresse e-mail invalide.'); return; }
            if (tab === 'up') {
                if (!NAME_RE.test(name)) { await say('Choisis un pseudo de 3 à 20 caractères (lettres, chiffres, . _ -).'); return; }
                if (nameOk === false) { await say('Ce pseudo n\'est pas disponible : choisis-en un autre.'); return; }
                if (pw.length < 10) { await say('Le mot de passe doit faire au moins 10 caractères.'); return; }
                const weak = weakPw(pw, mail, name); if (weak) { await say(weak); return; }
            } else if (!pw) { await say('Saisis ton mot de passe.'); return; }
            busy = true; const go = $('#au-go'), lab = go.textContent; go.disabled = true; go.classList.add('busy'); go.textContent = 'Un instant…';
            const r = tab === 'in' ? await signIn(mail, pw) : await signUp(mail, pw, name);
            busy = false; go.disabled = false; go.classList.remove('busy'); go.textContent = lab;
            if (r.ok) { location.reload(); return; }
            if (r.confirm || r.exists) setTab('in');
            await say(r.msg);
        });
        setTab('in');
    }

    // ---------------- Réglages › Compte ----------------
    // ---- État du compte : Actif (jusqu'au… / mensuel / annuel) · Banni (signalé, abonnement perdu) · Inactif (version gratuite) ----
    const ST = 'moto_acct_status';
    let stCache = null; try { stCache = JSON.parse(localStorage.getItem(ST) || 'null'); } catch (e) {}
    if (stCache && stCache.uid && sess && stCache.uid !== sess.user.id) stCache = null;
    let stAt = 0;
    const dFr = (iso, long) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' }); } catch (e) { return ''; } };
    const planFr = (p) => { p = String(p || '').toLowerCase(); return /year|annu|an$/.test(p) ? 'paiement annuel' : /month|mens/.test(p) ? 'paiement mensuel' : ''; };
    async function status(force) {
        if (!sess) return null;
        if (!force && stCache && Date.now() - stAt < 60000) return stCache;
        const t = await token(); if (!t) return stCache;
        const id = sess.user.id;
        // Le serveur décide : my_subscription() dit si l'abonnement est actif (règles dans la base)
        const [sub, me] = await Promise.all([
            call('/rest/v1/rpc/my_subscription', { method: 'POST', token: t, body: {} }),
            call('/rest/v1/rpc/my_status', { method: 'POST', token: t, body: {} })]);
        if (!sub.ok && !me.ok) return stCache;   // hors réseau : on garde le dernier état connu
        let st;
        const sj = sub.ok && sub.json && typeof sub.json === 'object' ? sub.json : null;
        if (me.ok && me.json && me.json.banned && (me.json.permanent || me.json.since)) st = { k: 'banned', reason: me.json.reason || '' };
        else if (sj && sj.active) st = { k: 'active', until: sj.until || null, store: sj.provider === 'app_store' || sj.provider === 'play_store', plan: planFr(sj.plan), late: !!sj.late, canceled: !!sj.canceled };
        else if (!sub.ok && stCache) return stCache;   // réponse serveur en erreur : on garde l'état connu
        else st = { k: 'inactive' };
        st.uid = id; stAt = Date.now();
        if (JSON.stringify(st) !== JSON.stringify(stCache)) { stCache = st; try { localStorage.setItem(ST, JSON.stringify(st)); } catch (e) {} document.dispatchEvent(new CustomEvent('auth:status', { detail: st })); }
        return stCache;
    }
    // Libellés : court (pastille du profil) et détaillé (Réglages › Compte)
    function statusText(st) {
        if (!st) return null;
        if (st.k === 'banned') return { c: 'b', short: 'Banni · abonnement perdu', t: 'Banni', d: 'Ton compte a été signalé : tu as perdu ton abonnement.' + (st.reason ? ' Motif : ' + st.reason : '') };
        if (st.k === 'active') {
            const dt = st.until ? dFr(st.until, true) : '', ds = st.until ? dFr(st.until, false) : '';
            const extra = [st.plan, st.canceled ? 'résilié' : '', st.late ? 'paiement en retard' : ''].filter(Boolean).join(' · ');
            return { c: 'a', short: 'Actif' + (ds ? ' · jusqu\'au ' + ds : ''), t: 'Actif', d: (dt ? 'Jusqu\'au ' + dt : 'Abonnement en cours') + (extra ? ' · ' + extra : '') };
        }
        return { c: 'i', short: 'Inactif · version gratuite', t: 'Inactif', d: 'Version gratuite' };
    }
    // Pastille d'état posée sur la photo : coche verte (actif), point d'exclamation rouge (banni), tiret gris (inactif)
    const BADGE_IC = { a: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', b: '<path d="M12 6v7M12 17.5v.1"/>', i: '<path d="M6 12h12"/>' };
    const statusBadge = (st) => { const x = statusText(st); return x ? '<i class="av-badge au-' + x.c + '" role="img" title="' + esc(x.t) + '" aria-label="' + esc(x.t) + '"><svg viewBox="0 0 24 24">' + BADGE_IC[x.c] + '</svg></i>' : ''; };
    const statusPill = (st) => { const x = statusText(st); return x ? '<span class="au-pill au-' + x.c + '"><i></i>' + esc(x.short) + '</span>' : ''; };

    function renderAccount(root) {
        if (!root) return; const u = (sess && sess.user) || {}, ini = (u.username || u.email || '?').trim().charAt(0).toUpperCase();
        root.innerHTML = `<div class="card au-card"><div class="setting-title">Mon compte</div>
            <div class="au-me"><div class="au-av">${esc(ini)}</div><div><b>${esc(u.username || 'Sans pseudo')}</b><span>${esc(u.email || '')}</span></div></div>
            <div id="au-stat"></div><div id="au-sub-host"></div>
            <button type="button" class="btn setting-btn au-row" id="au-name-btn">Modifier mon pseudo</button>
            <button type="button" class="btn setting-btn au-row" id="au-out">Se déconnecter</button>
            <button type="button" class="btn setting-btn au-row au-del" id="au-del">Supprimer mon compte</button>
            <div class="setting-hint">Se déconnecter te ramène à l'écran d'accès. Supprimer le compte efface définitivement ton compte et tes données côté serveur ; les trajets, réglages et le profil restent propres à chaque compte sur ce téléphone.</div></div>`;
        let paint = (st) => { const h = root.querySelector('#au-stat'), x = statusText(st); if (!h) return; h.innerHTML = x ? '<div class="au-state au-' + x.c + '"><b><i></i>' + esc(x.t) + '</b><small>' + esc(x.d) + '</small></div>' : ''; };
        // Boutons d'abonnement (natif seulement) : S'abonner (inactif) · Gérer (abonnement du store actif) + Restaurer
        const paintSub = (st) => {
            const h = root.querySelector('#au-sub-host'); if (!h) return;
            let ok = false; try { ok = AppSub.available(); } catch (e) {}
            if (!ok || !st || st.k === 'banned') { h.innerHTML = ''; return; }
            if (st.k === 'active') { h.innerHTML = st.store ? '<button type="button" class="btn setting-btn au-row" id="au-sub-mg">Gérer mon abonnement</button>' : ''; const m = h.querySelector('#au-sub-mg'); if (m) m.onclick = () => AppSub.manage(); return; }
            const pr = AppSub.price();
            h.innerHTML = '<button type="button" class="btn setting-btn au-row au-sub-go" id="au-sub-go">' + (pr ? 'S\'abonner · ' + esc(pr) + ' / mois' : 'S\'abonner') + '</button><button type="button" class="btn setting-btn au-row" id="au-sub-rs">Restaurer mes achats</button>';
            h.querySelector('#au-sub-go').onclick = () => AppSub.open(); h.querySelector('#au-sub-rs').onclick = () => AppSub.open();
        };
        const paint0 = paint; paint = (st) => { paint0(st); paintSub(st); };
        paint(stCache); status(true).then(paint);
        const onSt = (e) => { if (!root.isConnected) document.removeEventListener('auth:status', onSt); else paint(e.detail); }; document.addEventListener('auth:status', onSt);
        root.querySelector('#au-name-btn').onclick = async () => { if (await changeUsername()) renderAccount(root); };
        root.querySelector('#au-out').onclick = async () => { if (await AppDialog.confirm('Te déconnecter de ton compte ?', { okText: 'Se déconnecter' })) signOut(); };
        root.querySelector('#au-del').onclick = async () => {
            if (!(await AppDialog.confirm('Supprimer définitivement ton compte ?\n\nCette action est irréversible : ton compte, ton pseudo et tes données côté serveur seront effacés.', { okText: 'Supprimer', danger: true }))) return;
            const r = await deleteAccount(); if (!r.ok) AppDialog.alert(r.msg);
        };
    }

    async function rpc(fn, body) { const tk = await token(); if (!tk) return { ok: false, status: 0, json: null }; return call('/rest/v1/rpc/' + fn, { method: 'POST', token: tk, body: body || {} }); }
    async function pub(fn, body) { return call('/rest/v1/rpc/' + fn, { method: 'POST', body: body || {}, timeout: 8000 }); }
    async function fn(name, body) { const tk = await token(); if (!tk) return { ok: false, status: 0, json: null }; return call('/functions/v1/' + name, { method: 'POST', token: tk, body: body || {}, timeout: 8000 }); }   // fonction serveur Supabase (compte connecté)
    const api = { fn, saveMeta, changeUsername, status, statusPill, statusBadge, cached: () => stCache, pub, rpc, has: () => !!sess, user: () => (sess && sess.user) || null, token, check, signIn, signUp, signOut, deleteAccount, renderAccount, gate };
    if (!sess) document.documentElement.classList.add('auth-pending');
    const boot = () => {
        if (!sess) { gate(); return; }
        // Conditions d'utilisation : chaque point doit être coché (compte nouveau ou existant, et à chaque nouvelle version)
        if (typeof AppLegal !== 'undefined' && !AppLegal.accepted()) AppLegal.gate();
        else if (typeof AppLegal !== 'undefined') setTimeout(() => AppLegal.sync(), 4000);
        setTimeout(check, 2500); setTimeout(() => status(true), 3000);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    window.addEventListener('online', () => check());
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 600000) check(); });
    return api;
})();
