// Compte RideNCT : inscription, connexion et statut d'abonnement, reliés à Supabase.
// Le compte sert uniquement à savoir si l'abonnement est actif. Aucune autre donnée n'est envoyée.
// Client minimal (sans bibliothèque) : API d'authentification (GoTrue) et API de données (PostgREST) de Supabase.
(function () {
  'use strict';
  var CFG = window.RIDENCT || {};
  var URL_BASE = (CFG.supabaseUrl || '').replace(/\/+$/, '');
  var KEY = CFG.supabaseKey || '';
  var SKEY = 'ridenct_session_v1';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ---------- session ----------
  var session = null;
  function readSession() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
  function writeSession(s) { session = s; try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) { } }
  function fromToken(t) {
    return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at ? t.expires_at * 1000 : Date.now() + (t.expires_in || 3600) * 1000, user: t.user || null };
  }

  // ---------- appels ----------
  function ApiError(status, body) { this.status = status; this.code = (body && (body.error_code || body.code)) || ''; this.msg = (body && (body.msg || body.message || body.error_description || body.error)) || ''; }
  async function call(path, opt) {
    opt = opt || {};
    var h = { 'apikey': KEY, 'Content-Type': 'application/json' };
    if (opt.auth && session) h['Authorization'] = 'Bearer ' + session.access_token;
    var r;
    try { r = await fetch(URL_BASE + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined }); }
    catch (e) { throw new ApiError(0, { error_code: 'network' }); }
    var data = null; try { data = await r.json(); } catch (e) { }
    if (!r.ok) throw new ApiError(r.status, data);
    return data;
  }
  async function refresh() {
    if (!session || !session.refresh_token) return false;
    try { var t = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }); writeSession(fromToken(t)); return true; }
    catch (e) { if (e.status === 400 || e.status === 401 || e.status === 403) writeSession(null); return false; }
  }
  async function authed(path, opt) {
    opt = opt || {}; opt.auth = true;
    if (session && session.expires_at - Date.now() < 30000) await refresh();
    if (!session) throw new ApiError(401, { error_code: 'no_session' });
    try { return await call(path, opt); }
    catch (e) { if (e.status === 401 && await refresh()) return call(path, opt); throw e; }
  }

  var ERR = {
    invalid_credentials: 'E-mail ou mot de passe incorrect.',
    user_already_exists: 'Un compte existe déjà avec cet e-mail. Connecte-toi.',
    email_exists: 'Un compte existe déjà avec cet e-mail. Connecte-toi.',
    weak_password: 'Mot de passe trop faible. Utilise au moins 10 caractères.',
    email_not_confirmed: 'Ton e-mail n\'est pas encore confirmé. Clique sur le lien reçu par e-mail.',
    over_email_send_rate_limit: 'Trop d\'e-mails envoyés. Réessaie dans quelques minutes.',
    over_request_rate_limit: 'Trop de tentatives. Réessaie dans quelques minutes.',
    email_address_invalid: 'Cette adresse e-mail n\'est pas valide.',
    same_password: 'Le nouveau mot de passe doit être différent de l\'ancien.',
    signup_disabled: 'Les inscriptions sont fermées pour le moment.',
    network: 'Connexion impossible. Vérifie ton réseau et réessaie.',
    username_pris: 'Ce nom d\'utilisateur est déjà pris.',
    username_interdit: 'Ce nom d\'utilisateur n\'est pas autorisé. Choisis-en un autre.',
    username_invalide: 'Nom d\'utilisateur invalide : 3 à 20 caractères (lettres, chiffres, _ . -).',
    user_banned: 'Ce compte est suspendu. Si tu penses à une erreur, écris-nous depuis la page Contact.',
    no_session: 'Ta session a expiré. Connecte-toi à nouveau.'
  };
  function errText(e) { return ERR[e.code] || (e.status === 0 ? ERR.network : e.status === 429 ? ERR.over_request_rate_limit : 'Une erreur est survenue. Réessaie dans un instant.'); }

  // ---------- interface ----------
  var view = 'login', recovery = false, busy = false, sub = null, lastTab = null, uname = null, ban = null, link = null;
  var root;
  function msg(text, kind) { var m = $('cp-msg'); if (!m) return; m.textContent = text || ''; m.className = 'form-msg' + (kind ? ' ' + kind : ''); }
  var UN = /^[A-Za-z0-9_.-]{3,20}$/;
  async function nameStatus(n) {
    try { var r = await call('/rest/v1/rpc/username_status', { method: 'POST', body: { p_name: n } }); return typeof r === 'string' ? r : null; } catch (e) { return null; }
  }
  function nameErr(st) { return st === 'interdit' ? ERR.username_interdit : st === 'pris' ? ERR.username_pris : st === 'format' ? ERR.username_invalide : null; }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function renderConfigMissing() {
    root.innerHTML = '<div class="cp-card"><h2>Comptes bientôt disponibles</h2><p class="cp-sub">La connexion n\'est pas encore configurée sur ce site.</p></div>';
  }
  function tabs() {
    return '<div class="cp-tabs" data-v="' + view + '" role="tablist"><button type="button" role="tab" class="cp-tab' + (view === 'login' ? ' on' : '') + '" data-view="login" aria-selected="' + (view === 'login') + '">Connexion</button>'
      + '<button type="button" role="tab" class="cp-tab' + (view === 'signup' ? ' on' : '') + '" data-view="signup" aria-selected="' + (view === 'signup') + '">Créer un compte</button></div>';
  }
  var LOGO = '<img class="cp-logo" src="assets/img/icon-192.png" alt="" width="56" height="56">';
  function renderAuth() {
    var h = '<div class="cp-card">' + LOGO;
    if (recovery) {
      h += '<h2>Nouveau mot de passe</h2><p class="cp-sub">Choisis un nouveau mot de passe pour ton compte.</p><form id="cp-form" data-act="newpass" novalidate>'
        + '<label>Nouveau mot de passe<input id="cp-p1" type="password" autocomplete="new-password" minlength="10" required></label>'
        + '<label>Confirmer le mot de passe<input id="cp-p2" type="password" autocomplete="new-password" minlength="10" required></label>'
        + '<button class="btn btn-primary" type="submit">Enregistrer</button><p class="form-msg" id="cp-msg" role="status"></p></form>';
    } else if (view === 'forgot') {
      h += '<h2>Mot de passe oublié</h2><p class="cp-sub">Saisis ton e-mail : tu recevras un lien pour choisir un nouveau mot de passe.</p><form id="cp-form" data-act="forgot" novalidate>'
        + '<label>E-mail<input id="cp-email" type="email" autocomplete="email" required></label>'
        + '<button class="btn btn-primary" type="submit">Envoyer le lien</button><p class="form-msg" id="cp-msg" role="status"></p>'
        + '<button type="button" class="cp-link" data-view="login">Retour à la connexion</button></form>';
    } else if (view === 'signup') {
      h += tabs() + '<form id="cp-form" data-act="signup" novalidate>'
        + '<label>Nom d\'utilisateur<input id="cp-user" autocomplete="username" maxlength="20" placeholder="ex : RiderDu44" required><small class="cp-hint" id="cp-uhint">3 à 20 caractères : lettres, chiffres, _ . -</small></label>'
        + '<label>E-mail<input id="cp-email" type="email" autocomplete="email" required></label>'
        + '<label>Mot de passe (10 caractères minimum)<input id="cp-p1" type="password" autocomplete="new-password" minlength="10" required></label>'
        + '<label>Confirmer le mot de passe<input id="cp-p2" type="password" autocomplete="new-password" minlength="10" required></label>'
        + '<label class="cp-check"><input id="cp-ok" type="checkbox"><span>J\'accepte les <a href="cgu.html" target="_blank" rel="noopener">conditions d\'utilisation</a> et j\'ai lu la <a href="confidentialite.html" target="_blank" rel="noopener">politique de confidentialité</a>. J\'ai au moins 15 ans.</span></label>'
        + '<button class="btn btn-primary" type="submit">Créer mon compte</button><p class="form-msg" id="cp-msg" role="status"></p></form>'
        + '<p class="cp-note">Un compte est nécessaire pour utiliser l\'application, en version gratuite comme complète. Il sert uniquement à savoir si ton abonnement est actif. Tes données restent sur ton téléphone.</p>';
    } else {
      h += tabs() + '<form id="cp-form" data-act="login" novalidate>'
        + '<label>E-mail<input id="cp-email" type="email" autocomplete="email" required></label>'
        + '<label>Mot de passe<input id="cp-p1" type="password" autocomplete="current-password" required></label>'
        + '<button class="btn btn-primary" type="submit">Se connecter</button><p class="form-msg" id="cp-msg" role="status"></p>'
        + '<button type="button" class="cp-link" data-view="forgot">Mot de passe oublié ?</button></form>';
    }
    root.innerHTML = h + '</div>';
    enhance();
  }
  // Champs mot de passe avec œil + glissement des onglets
  function enhance() {
    root.querySelectorAll('input[type="password"]').forEach(function (inp) {
      var w = document.createElement('span'); w.className = 'cp-pw';
      inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cp-eye'; b.setAttribute('aria-label', 'Afficher le mot de passe');
      b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      b.addEventListener('click', function () { var s = inp.type === 'password'; inp.type = s ? 'text' : 'password'; b.setAttribute('aria-label', s ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); b.classList.toggle('on', s); });
      w.appendChild(b);
    });
    var t = root.querySelector('.cp-tabs');
    if (t && lastTab && lastTab !== view && (lastTab === 'login' || lastTab === 'signup')) {
      t.setAttribute('data-v', lastTab);
      requestAnimationFrame(function () { requestAnimationFrame(function () { t.setAttribute('data-v', view); }); });
    }
    lastTab = (view === 'login' || view === 'signup') ? view : lastTab;
  }
  function statusInfo() {
    if (sub === undefined || sub === 'error') return { cls: 'none', label: 'Indisponible', text: 'Impossible de lire ton abonnement pour le moment. Réessaie plus tard.' };
    var s = sub ? sub.status : 'none';
    var end = sub && sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    if (s === 'active' && sub.provider === 'manual') return { cls: 'ok', label: 'Abonnement offert', text: end ? 'Accès complet offert jusqu\'au ' + end + '.' : 'Accès complet offert.' };
    if (s === 'active') return { cls: 'ok', label: 'Abonnement actif', text: end ? 'Renouvelé jusqu\'au ' + end + '.' : 'Toutes les fonctionnalités de RideNCT sont débloquées.' };
    if (s === 'past_due') return { cls: 'warn', label: 'Paiement en retard', text: 'Ton dernier paiement n\'a pas abouti. Mets à jour ton moyen de paiement pour garder l\'accès.' };
    if (s === 'canceled') return { cls: 'none', label: 'Abonnement résilié', text: end ? 'Accès complet jusqu\'au ' + end + '.' : 'Ton abonnement est terminé.' };
    return { cls: 'none', label: 'Version gratuite', text: 'Ton compte est actif : tu utilises la version gratuite de RideNCT. L\'abonnement n\'est pas encore ouvert.' };
  }
  function ic(d) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var PERKS = [['Radar amis', 'Vois tes amis sur la carte'], ['Carte en mode expert', 'Routes sinueuses calculées dans l\'app'], ['Intercom en groupe', 'Plus de 2 motards en même temps'], ['Partage d\'itinéraire', 'Envoie ton tracé au groupe'], ['Partage de musique', 'Avec ton groupe intercom'], ['Mode rencontre', 'Croise d\'autres motards'], ['Garage complet', 'Plusieurs motos au lieu d\'une']];
  function renderAccount() {
    var u = session.user || {}, si = statusInfo(), act = sub && sub !== 'error' && sub.status === 'active';
    var since = u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
    var ini = esc((uname || u.email || '?').charAt(0).toUpperCase());
    var perks = PERKS.map(function (x) { return '<li class="' + (act ? 'on' : 'off') + '"><span class="pk">' + (act ? '✓' : '🔒') + '</span><span><b>' + x[0] + '</b><small>' + x[1] + '</small></span></li>'; }).join('');
    var tiles = [['Planificateur', 'Prépare une route', 'planificateur.html', '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>'], ['Fonctionnalités', 'Fais le tour de l\'app', 'fonctionnalites.html', '<path d="M3.4 17A10 10 0 1 1 20.6 17"/><path d="M12 14l3-3"/>'], ['Tarifs', 'Gratuit ou complet', 'tarifs.html', '<path d="M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'], ['Contact', 'Une idée, un souci', 'contact.html', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>']]
      .map(function (t) { return '<a class="cp-tile" href="' + t[2] + '">' + ic(t[3]) + '<b>' + t[0] + '</b><small>' + t[1] + '</small></a>'; }).join('');
    root.className = 'cp-dash';
    root.innerHTML =
      '<div class="cp-dash-grid">'
      + '<aside class="cp-card cp-me">' + '<div class="cp-av">' + ini + '</div>'
      + '<h2>' + (uname ? '@' + esc(uname) : 'Bienvenue') + '</h2><p class="cp-sub">' + esc(u.email || '') + '</p>'
      + (since ? '<p class="cp-since">Membre depuis ' + esc(since) + '</p>' : '')
      + '<span class="cp-badge ' + si.cls + '">' + si.label + '</span>'
      + '<div class="cp-acts"><button type="button" class="btn btn-ghost" data-act="logout">Se déconnecter</button></div>'
      + '</aside>'
      + '<div class="cp-main">'
      + (ban && ban.banned ? '<section class="cp-card cp-ban" role="alert"><h3>Compte sous restriction</h3><p>' + (ban.reason ? 'Motif : ' + esc(ban.reason) + '. ' : '') + 'Si tu penses à une erreur, <a href="contact.html">écris-nous</a>.</p></section>' : '')
      + '<section class="cp-card"><h3>Mon abonnement</h3><div class="cp-sub-box ' + si.cls + '"><b>' + si.label + '</b><p>' + si.text + '</p></div>'
      + (act ? '' : '<a class="btn btn-primary cp-cta" href="tarifs.html">Voir ce que débloque la version complète <span class="arr" aria-hidden="true">→</span></a>') + '</section>'
      + '<section class="cp-card"><h3>' + (act ? 'Ce que ton abonnement débloque' : 'Avec la version complète') + '</h3><ul class="cp-perks">' + perks + '</ul></section>'
      + '<div class="cp-tiles">' + tiles + '</div>'
      + '<section class="cp-card"><h3>Paramètres</h3>'
      + '<div class="cp-row"><div><b>Nom d\'utilisateur</b><small>' + (uname ? '@' + esc(uname) : 'Pas encore choisi') + '</small></div><div id="cp-un"><button type="button" class="btn btn-ghost" data-act="editname">' + (uname ? 'Modifier' : 'Choisir') + '</button></div></div>'
      + (link ? '<div class="cp-row"><div><b>Application RideNCT</b><small>' + (link.linked ? 'Liée à ce compte' : 'Pas encore liée à ce compte') + '</small></div></div>' : '')
      + '<div class="cp-row"><div><b>Mot de passe</b><small>Change-le quand tu veux</small></div><button type="button" class="btn btn-ghost" data-act="showpass">Modifier</button></div>'
      + '<div id="cp-pass" hidden><form id="cp-form" data-act="changepass" novalidate>'
      + '<label>Nouveau mot de passe<input id="cp-p1" type="password" autocomplete="new-password" minlength="10" required></label>'
      + '<label>Confirmer le mot de passe<input id="cp-p2" type="password" autocomplete="new-password" minlength="10" required></label>'
      + '<button class="btn btn-primary" type="submit">Enregistrer</button></form></div>'
      + '<p class="form-msg" id="cp-msg" role="status"></p>'
      + '<p class="cp-note">Ce compte est nécessaire pour utiliser l\'application et sert uniquement à savoir si ton abonnement est actif. Ton profil, tes trajets et ton carnet restent sur ton téléphone.</p>'
      + '<div class="cp-row"><div><b>Mes données</b><small>Télécharge ce que le site conserve sur toi</small></div><button type="button" class="btn btn-ghost" data-act="export">Télécharger</button></div>'
      + '<details class="cp-danger"><summary>Supprimer mon compte</summary><p>Cette action est définitive : ton adresse e-mail, ton nom d\'utilisateur et ton statut d\'abonnement sont effacés et ne pourront pas être récupérés. Si tu avais un abonnement actif, supprime-le d\'abord auprès du service par lequel tu l\'as souscrit. Tes données sur ton téléphone ne sont pas touchées. Pour confirmer, écris <b>SUPPRIMER</b> et saisis ton mot de passe.</p>'
      + '<form id="cp-del" data-act="delete" novalidate><input id="cp-delq" autocomplete="off" aria-label="Écris SUPPRIMER pour confirmer" placeholder="SUPPRIMER"><input id="cp-delpw" type="password" autocomplete="current-password" aria-label="Ton mot de passe" placeholder="Mot de passe"><button class="btn btn-danger" type="submit">Supprimer définitivement</button></form></details></section>'
      + '</div></div>';
    document.body.classList.add('cp-in');
    enhance();
  }
  function render() {
    if (!URL_BASE || !KEY) { renderConfigMissing(); return; }
    if (session && !recovery) renderAccount(); else { root.className = ''; document.body.classList.remove('cp-in'); renderAuth(); }
  }

  async function loadName() {
    try { var r = await authed('/rest/v1/profiles?select=username&limit=1'); uname = r && r[0] ? r[0].username : null; }
    catch (e) { uname = null; }
  }
  async function loadSub() {
    await loadName();
    try { var r = await authed('/rest/v1/subscriptions?select=status,plan,current_period_end,provider&limit=1'); sub = r && r[0] ? r[0] : null; }
    catch (e) { sub = 'error'; }
    try { ban = await authed('/rest/v1/rpc/my_status', { method: 'POST', body: {} }); } catch (e) { ban = null; }
    try { link = await authed('/rest/v1/rpc/my_link', { method: 'POST', body: {} }); } catch (e) { link = null; }
  }

  // ---------- actions ----------
  async function withBusy(btn, fn) {
    if (busy) return; busy = true; if (btn) btn.disabled = true; msg('');
    try { await fn(); } finally { busy = false; if (btn && btn.isConnected) btn.disabled = false; }
  }
  async function doLogin() {
    var email = $('cp-email').value.trim(), pw = $('cp-p1').value;
    if (!validEmail(email) || !pw) { msg('Saisis ton e-mail et ton mot de passe.', 'err'); return; }
    try { var t = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: pw } }); writeSession(fromToken(t)); sub = undefined; render(); await loadSub(); render(); }
    catch (e) { msg(errText(e), 'err'); }
  }
  async function doSignup() {
    var email = $('cp-email').value.trim(), p1 = $('cp-p1').value, p2 = $('cp-p2').value;
    var un = $('cp-user').value.trim();
    if (!UN.test(un)) { msg(ERR.username_invalide, 'err'); return; }
    if (!validEmail(email)) { msg('Cette adresse e-mail n\'est pas valide.', 'err'); return; }
    if (p1.length < 10) { msg('Le mot de passe doit faire au moins 10 caractères.', 'err'); return; }
    if (p1 !== p2) { msg('Les deux mots de passe sont différents.', 'err'); return; }
    if (!$('cp-ok').checked) { msg('Coche la case pour accepter les conditions d\'utilisation et la politique de confidentialité.', 'err'); return; }
    var nst = await nameStatus(un);
    if (nameErr(nst)) { msg(nameErr(nst), 'err'); return; }
    try {
      var t = await call('/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', body: { email: email, password: p1, data: { username: un, cgu_accepted_at: new Date().toISOString(), cgu_version: '2026-11-10' } } });
      if (t && t.access_token) { writeSession(fromToken(t)); sub = undefined; render(); await loadSub(); render(); }
      else { root.innerHTML = '<div class="cp-card"><h2>Vérifie ta boîte mail</h2><p class="cp-sub">Un e-mail de confirmation vient d\'être envoyé à <b>' + esc(email) + '</b>. Clique sur le lien pour activer ton compte.</p><p class="cp-note">Rien reçu ? Regarde dans tes courriers indésirables, puis réessaie dans quelques minutes.</p><button type="button" class="cp-link" data-view="login">Aller à la connexion</button></div>'; }
    } catch (e) { msg(errText(e), 'err'); }
  }
  async function doForgot() {
    var email = $('cp-email').value.trim();
    if (!validEmail(email)) { msg('Saisis une adresse e-mail valide.', 'err'); return; }
    try { await call('/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', body: { email: email } }); msg('Si un compte existe avec cet e-mail, un lien vient d\'être envoyé.', 'ok'); }
    catch (e) { msg(errText(e), 'err'); }
  }
  async function doNewPass(fromRecovery) {
    var p1 = $('cp-p1').value, p2 = $('cp-p2').value;
    if (p1.length < 10) { msg('Le mot de passe doit faire au moins 10 caractères.', 'err'); return; }
    if (p1 !== p2) { msg('Les deux mots de passe sont différents.', 'err'); return; }
    try {
      await authed('/auth/v1/user', { method: 'PUT', body: { password: p1 } });
      if (fromRecovery) { recovery = false; await loadSub(); render(); msg('Mot de passe modifié.', 'ok'); }
      else { $('cp-pass').hidden = true; msg('Mot de passe modifié.', 'ok'); }
    } catch (e) { msg(errText(e), 'err'); }
  }
  async function doSetName() {
    var n = $('cp-newname').value.trim();
    if (!UN.test(n)) { msg(ERR.username_invalide, 'err'); return; }
    try { await authed('/rest/v1/rpc/set_my_username', { method: 'POST', body: { p_name: n } }); uname = n; render(); msg('Nom d\'utilisateur enregistré.', 'ok'); }
    catch (e) { msg(e.msg && /username_pris/.test(e.msg) || e.code === '23505' ? ERR.username_pris : (e.msg && /username_interdit/.test(e.msg) ? ERR.username_interdit : e.code === '22023' ? ERR.username_invalide : errText(e)), 'err'); }
  }
  function doExport() {
    var u = session.user || {};
    var out = { exporte_le: new Date().toISOString(), compte: { email: u.email || null, cree_le: u.created_at || null }, profil: { nom_utilisateur: uname || null }, abonnement: sub && sub !== 'error' ? sub : null };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })); a.download = 'ridenct-mes-donnees.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    msg('Fichier téléchargé.', 'ok');
  }
  async function doLogout() { try { await authed('/auth/v1/logout', { method: 'POST' }); } catch (e) { } writeSession(null); sub = null; view = 'login'; render(); }
  async function doDelete() {
    if ($('cp-delq').value.trim().toUpperCase() !== 'SUPPRIMER') { msg('Écris SUPPRIMER pour confirmer.', 'err'); return; }
    var pw = $('cp-delpw').value, em = (session.user && session.user.email) || '';
    if (!pw) { msg('Saisis ton mot de passe pour confirmer.', 'err'); return; }
    try { await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: em, password: pw } }); }
    catch (e) { msg(e.status === 400 ? 'Mot de passe incorrect.' : errText(e), 'err'); return; }
    try { await authed('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} }); writeSession(null); sub = null; view = 'login'; render(); msg('Ton compte a été supprimé.', 'ok'); }
    catch (e) { msg(errText(e), 'err'); }
  }

  var tmr = 0;
  function watchName() {
    root.addEventListener('input', function (e) {
      if (e.target.id !== 'cp-user' && e.target.id !== 'cp-newname') return;
      var inp = e.target, h = $('cp-uhint'); if (!h) return;
      clearTimeout(tmr); var v = inp.value.trim();
      if (!v) { h.textContent = '3 à 20 caractères : lettres, chiffres, _ . -'; h.className = 'cp-hint'; return; }
      if (!UN.test(v)) { h.textContent = 'Caractères autorisés : lettres, chiffres, _ . - (3 à 20).'; h.className = 'cp-hint err'; return; }
      h.textContent = 'Vérification…'; h.className = 'cp-hint';
      tmr = setTimeout(async function () {
        var f = await nameStatus(v); if (inp.value.trim() !== v) return;
        if (f === 'ok') { h.textContent = '✓ Disponible'; h.className = 'cp-hint ok'; }
        else if (nameErr(f)) { h.textContent = f === 'pris' ? 'Déjà pris.' : nameErr(f); h.className = 'cp-hint err'; }
        else { h.textContent = ''; }
      }, 400);
    });
  }
  function bind() {
    watchName();
    root.addEventListener('click', function (e) {
      var v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; render(); return; }
      var a = e.target.closest('button[data-act]'); if (!a) return;
      if (a.dataset.act === 'logout') withBusy(a, doLogout);
      else if (a.dataset.act === 'editname') {
        $('cp-un').innerHTML = '<form data-act="setname" novalidate class="cp-inline"><input id="cp-newname" maxlength="20" autocomplete="off" aria-label="Nom d\'utilisateur" value="' + esc(uname || '') + '"><button class="btn btn-primary" type="submit">Enregistrer</button></form><small class="cp-hint" id="cp-uhint">3 à 20 caractères : lettres, chiffres, _ . -</small>';
        $('cp-newname').focus();
      }
      else if (a.dataset.act === 'export') doExport();
      else if (a.dataset.act === 'showpass') { $('cp-pass').hidden = !$('cp-pass').hidden; }
    });
    root.addEventListener('submit', function (e) {
      e.preventDefault(); var f = e.target, act = f.dataset.act, btn = f.querySelector('button[type="submit"]');
      if (act === 'login') withBusy(btn, doLogin); else if (act === 'signup') withBusy(btn, doSignup); else if (act === 'forgot') withBusy(btn, doForgot);
      else if (act === 'newpass') withBusy(btn, function () { return doNewPass(true); }); else if (act === 'changepass') withBusy(btn, function () { return doNewPass(false); });
      else if (act === 'delete') withBusy(btn, doDelete);
      else if (act === 'setname') withBusy(btn, doSetName);
    });
  }

  // Retour d'un lien e-mail (confirmation ou réinitialisation) : les jetons arrivent dans l'adresse après le #
  async function handleHash() {
    var h = location.hash.replace(/^#/, ''); if (!h || h.indexOf('access_token=') < 0 && h.indexOf('error=') < 0) return;
    var p = new URLSearchParams(h);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    if (p.get('error')) { msg(p.get('error_code') === 'otp_expired' ? 'Ce lien a expiré. Demande-en un nouveau.' : 'Ce lien n\'est plus valide.', 'err'); view = 'login'; return 'error'; }
    var s = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Date.now() + (parseInt(p.get('expires_in'), 10) || 3600) * 1000, user: null };
    writeSession(s);
    try { s.user = await call('/auth/v1/user', { auth: true }); writeSession(s); } catch (e) { writeSession(null); return 'error'; }
    if (p.get('type') === 'recovery') recovery = true;
    return 'ok';
  }

  document.addEventListener('DOMContentLoaded', async function () {
    root = $('compte'); if (!root) return;
    bind();
    if (!URL_BASE || !KEY) { render(); return; }
    session = readSession();
    var r = await handleHash();
    if (r === 'error') { render(); setTimeout(function () { msg('Ce lien n\'est plus valide ou a expiré. Demande-en un nouveau.', 'err'); }, 0); return; }
    if (session && !recovery) {
      if (session.expires_at - Date.now() < 30000) await refresh();
      if (session) { render(); if (!session.user) { try { session.user = await authed('/auth/v1/user'); writeSession(session); } catch (e) { } } await loadSub(); }
    }
    render();
  });
})();
