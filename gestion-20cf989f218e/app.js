'use strict';

const SUPABASE_URL = 'https://jpawfdgfggtlqxpbrpnd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9glJJ7YBqhQUhT42hQynDg_H_Rng3ac';
const IDLE_MINUTES = 15;
const PRICE_MONTH = 2.99;
const PRICE_YEAR = 24.99;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ridenct-admin-auth' }
});

const $ = (id) => document.getElementById(id);
const state = {
  me: null, role: null, route: { page: 'home', tab: 'overview' },
  users: [], reports: [], suspicious: [], messages: [], terms: [], audit: [], waitlist: [], devices: [],
  map: null, mapLoaded: false, markers: [], drawing: false, zoneStart: null, focus: null, enrollId: null, stats: null,
  sel: { users: new Set(), review: new Set(), msgs: new Set(), riders: new Set() }, riders: [],
  userFilter: 'all', drawerUser: null, drawerSeq: 0, palSeq: 0, pendingUser: null
};
const canWrite = () => state.role === 'admin';

/* ---------- stockage local (préférences) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('ridenct.' + k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ridenct.' + k, String(v)); } catch (e) { /* ignoré */ } }
};

/* ---------- utilitaires ---------- */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtInt = (n) => Number(n || 0).toLocaleString('fr-FR');
const fmtEur = (n) => Number(n || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtBytes = (b) => {
  b = Number(b || 0);
  if (b < 1024) return b + ' o';
  const u = ['Ko', 'Mo', 'Go', 'To'];
  let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return b.toFixed(b >= 100 ? 0 : 1).replace('.', ',') + ' ' + u[i];
};
const isInf = (d) => d === 'infinity' || d === '+infinity';
const isBanned = (u) => !!u.banned_until && (isInf(u.banned_until) || new Date(u.banned_until) > new Date());
const fmtUntil = (d) => (isInf(d) || new Date(d) - Date.now() > 50 * 365 * 86400000 ? 'définitivement' : fmtDay(d));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
const hhmm = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const validMail = (s) => /^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']{2,}$/.test(s || '');

function friendly(err) {
  const m = (err && (err.message || err.details)) || String(err);
  if (/version_exists/.test(m)) return 'Cette version existe déjà : change le numéro de version.';
  if (/forbidden_write/.test(m)) return 'Ton rôle (support) est en lecture seule.';
  if (/forbidden/i.test(m)) return 'Accès refusé : ce compte n\'est pas administrateur.';
  if (/mfa_required_vault/.test(m)) return 'Le coffre exige la 2FA : active-la et valide ton code (Réglages › Sécurité), puis reviens ici.';
  if (/mfa_required_first/.test(m)) return 'Valide d\'abord ta 2FA (code à 6 chiffres) pour exiger la 2FA.';
  if (/mfa_required/.test(m)) return 'La double authentification est exigée : active-la et saisis ton code dans Réglages › Sécurité.';
  if (/self_action/.test(m)) return 'Action impossible sur ton propre compte.';
  if (/target_is_admin/.test(m)) return 'Ce compte est administrateur : retire d\'abord ses droits dans Réglages › Administrateurs.';
  if (/user_not_found/.test(m)) return 'Aucun compte RideNCT avec cet e-mail.';
  if (/invalid_term/.test(m)) return 'Terme invalide : lettres minuscules et chiffres uniquement.';
  if (/invalid_plan/.test(m)) return 'Formule invalide.';
  if (/invalid_date/.test(m)) return 'La date de fin doit être dans le futur.';
  if (/invalid_role/.test(m)) return 'Rôle invalide.';
  if (/invalid_zone/.test(m)) return 'Zone invalide.';
  if (/invalid_device/.test(m)) return 'Identifiant d\'appareil invalide (8 à 64 caractères).';
  if (/has_paid_sub/.test(m)) return 'Ce compte a déjà un abonnement payant actif : rien n\'est modifié.';
  if (/not_manual/.test(m)) return 'Seuls les abonnements offerts peuvent être retirés ici.';
  if (/code_exists/.test(m)) return 'Ce code existe déjà.';
  if (/invalid_code/.test(m)) return 'Code invalide : 4 à 20 lettres ou chiffres.';
  if (/invalid_days/.test(m)) return 'Durée invalide (1 à 365 jours).';
  if (/invalid_uses/.test(m)) return 'Nombre d\'utilisations invalide.';
  if (/invalid_title/.test(m)) return 'Titre obligatoire (80 caractères max).';
  if (/invalid_threshold/.test(m)) return 'Seuil invalide (1 à 100).';
  if (/sub_banned/.test(m)) return 'L\'abonnement de ce compte est banni : rétablis-le d\'abord.';
  if (/no_sub/.test(m)) return 'Ce compte n\'a pas d\'abonnement actif à retirer.';
  if (/no_rider/.test(m)) return 'Ce compte n\'a aucun appareil lié : impossible d\'ajouter un signalement factice.';
  if (/not_found/.test(m)) return 'Élément introuvable (déjà supprimé ?).';
  if (/Could not find the function|PGRST202|schema cache/i.test(m)) return 'Fonctions manquantes ou périmées : exécute admin_setup.sql dans Supabase (SQL Editor).';
  return m;
}
function showError(err) { $('banner-text').textContent = friendly(err); $('banner').hidden = false; }
function clearError() { $('banner').hidden = true; }
$('banner-close').addEventListener('click', clearError);

let busy = 0;
async function rpc(name, args, quiet) {
  if (!quiet) { busy++; $('loadbar').hidden = false; }
  try {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) {
      if (/permission denied for function/i.test(error.message || '') && !$('app').hidden) sessionLost();
      throw error;
    }
    return data;
  } finally {
    if (!quiet) { busy = Math.max(0, busy - 1); if (!busy) $('loadbar').hidden = true; }
  }
}

function csvEscape(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadCSV(filename, headers, rows) {
  const lines = [headers.join(';')].concat(rows.map((r) => r.map(csvEscape).join(';')));
  downloadBlob(filename, new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

/* ---------- boîte de dialogue ---------- */
function openModal({ title, text, ok = 'Confirmer', tone = 'danger', fields, confirmWord }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    $('modal-title').textContent = title;
    $('modal-text').textContent = text || '';
    $('modal-text').hidden = !text;
    const box = $('modal-fields');
    box.innerHTML = '';
    (fields || []).forEach((f) => {
      const l = document.createElement('label');
      l.textContent = f.label;
      let inp;
      if (f.type === 'select') {
        inp = document.createElement('select');
        f.options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; inp.appendChild(o); });
      } else if (f.type === 'textarea') {
        inp = document.createElement('textarea');
        inp.rows = 5;
      } else {
        inp = document.createElement('input');
        inp.type = f.type || 'text';
      }
      inp.id = 'mf-' + f.id;
      if (f.value != null) inp.value = f.value;
      l.appendChild(inp);
      box.appendChild(l);
    });
    let cw = null;
    if (confirmWord) {
      const l = document.createElement('label');
      l.textContent = 'Tape « ' + confirmWord + ' » pour confirmer';
      cw = document.createElement('input');
      cw.autocomplete = 'off';
      cw.spellcheck = false;
      l.appendChild(cw);
      box.appendChild(l);
    }
    const okBtn = $('modal-ok');
    okBtn.textContent = ok;
    okBtn.className = 'btn ' + tone;
    const sync = () => { okBtn.disabled = cw ? norm(cw.value.trim()) !== norm(confirmWord) : false; };
    if (cw) cw.addEventListener('input', sync);
    sync();
    $('modal').hidden = false;
    const first = box.querySelector('input,select');
    (first || $('modal-cancel')).focus();
    const done = (v) => {
      $('modal').hidden = true;
      okBtn.onclick = null;
      $('modal-cancel').onclick = null;
      $('modal').onkeydown = null;
      okBtn.disabled = false;
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignoré */ } }
      resolve(v);
    };
    okBtn.onclick = () => {
      if (okBtn.disabled) return;
      if (!fields) return done(true);
      const vals = {};
      fields.forEach((f) => { vals[f.id] = $('mf-' + f.id).value; });
      done(vals);
    };
    $('modal-cancel').onclick = () => done(fields ? null : false);
    $('modal').onkeydown = (ev) => {
      if (ev.key === 'Enter' && ev.target.tagName !== 'BUTTON' && !okBtn.disabled) { ev.preventDefault(); okBtn.click(); }
    };
  });
}
const confirmDialog = openModal;
const formDialog = openModal;

/* ---------- inactivité ---------- */
let idleTimer;
function armIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { await sb.auth.signOut(); location.reload(); }, IDLE_MINUTES * 60000);
}
['mousemove', 'keydown', 'click', 'touchstart'].forEach((ev) =>
  document.addEventListener(ev, () => { if (!$('app').hidden) armIdle(); }, { passive: true }));

/* ---------- connexion ---------- */
function loginError(msg) { const p = $('login-error'); p.textContent = msg; p.hidden = !msg; }
let sessionLostBusy = false;
async function sessionLost() {
  if (sessionLostBusy) return;
  sessionLostBusy = true;
  clearTimeout(idleTimer);
  try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* ignoré */ }
  state.role = null;
  closeDrawer();
  backToLogin();
  loginError('Session expirée (déconnexion depuis un autre onglet ou une autre appli). Reconnecte-toi.');
  sessionLostBusy = false;
}
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && !$('app').hidden) sessionLost(); });

function backToLogin() {
  $('mfa-form').hidden = true; $('login-form').hidden = false; $('login').hidden = false; $('app').hidden = true;
}

async function afterPassword(user) {
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
    $('login-form').hidden = true;
    $('mfa-form').hidden = false;
    $('mfa-error').hidden = true;
    $('mfa-code').value = '';
    $('mfa-code').focus();
    state.pendingUser = user;
    return;
  }
  enterApp(user);
}

async function enterApp(user) {
  let role = null;
  try { role = await rpc('admin_role'); }
  catch (e) { await sb.auth.signOut(); backToLogin(); loginError(friendly(e)); return; }
  if (!role) { await sb.auth.signOut(); backToLogin(); loginError('Ce compte n\'est pas administrateur.'); return; }
  state.me = user;
  state.role = role;
  $('me').textContent = user.email || '';
  $('role-badge').innerHTML = role === 'admin' ? '<span class="badge ad">admin</span>' : '<span class="badge wa">support · lecture seule</span>';
  $('admin-add-panel').hidden = role !== 'admin';
  $('login').hidden = true;
  $('app').hidden = false;
  armIdle();
  if (!/^#\/[a-z]+/.test(location.hash)) {
    const saved = store.get('route', 'home/overview');
    history.replaceState(null, '', '#/' + saved);
  }
  render();
  setInterval(() => { if (!$('app').hidden && document.visibilityState === 'visible') quietStats(); }, 60000);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError('');
  const { data, error } = await sb.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-pass').value });
  if (error) { loginError('E-mail ou mot de passe incorrect.'); return; }
  $('login-pass').value = '';
  afterPassword(data.user);
});
$('mfa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = $('mfa-error'); p.hidden = true;
  const { data: f } = await sb.auth.mfa.listFactors();
  const factor = ((f && f.all) || []).find((x) => x.factor_type === 'totp' && x.status === 'verified');
  if (!factor) { p.textContent = 'Aucune 2FA trouvée sur ce compte.'; p.hidden = false; return; }
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: $('mfa-code').value.trim() });
  if (error) { p.textContent = 'Code invalide ou expiré.'; p.hidden = false; return; }
  enterApp(state.pendingUser);
});
$('logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) afterPassword(data.session.user);
})();

/* ---------- navigation ---------- */
const PAGES = {
  sec: { title: '', desc: '', tabs: [['users', ''], ['mod', ''], ['msg', ''], ['track', ''], ['sys', '']] },
  home: { title: 'Accueil', desc: 'Ce qui demande ton attention et l\'état général de RideNCT.', tabs: [['overview', 'Vue d\'ensemble'], ['stats', 'Statistiques'], ['health', 'Santé']] },
  reports: { title: 'Signalements', desc: 'Carte des repères, repères suspects et utilisateurs signalés par la communauté.', tabs: [['map', 'Carte'], ['review', 'À vérifier'], ['riders', 'Utilisateurs signalés'], ['routes', 'Circuits'], ['warnings', 'Avertissements']] },
  messages: { title: 'Messages', desc: 'Messages du formulaire de contact et inscrits sur la liste d\'attente.', tabs: [['contact', 'Messages'], ['mail', 'Boîte contact@'], ['waitlist', 'Liste d\'attente']] },
  bans: { title: 'Bannissements', desc: 'Appareils bannis et pseudos interdits.', tabs: [['devices', 'Appareils'], ['terms', 'Pseudos bloqués']] },
  users: { title: 'Utilisateurs', desc: 'Clique sur une ligne pour ouvrir la fiche : abonnement, bannissement, suppression.' },
  maintenance: { title: 'Maintenance', desc: 'Espace disque, purges et sauvegarde.', tabs: [['purge', 'Espace et purge'], ['auto', 'Purge automatique'], ['backup', 'Sauvegarde']] },
  vault: { title: 'Coffre', desc: 'Codes et clés des services (Resend, Supabase…), chiffrés, avec 2FA obligatoire.' },
  legal: { title: 'Textes légaux', desc: 'CGU, CGV, mentions légales et politique de confidentialité publiés sur le site et dans l\'app.' },
  survey: { title: 'Questionnaire', desc: 'Réponses du questionnaire du site : résultats par question et réponses individuelles.' },
  audit: { title: 'Journal', desc: 'Toutes les actions des administrateurs.' },
  promos: { title: 'Codes promo', desc: 'Offre des essais gratuits avec un code à saisir dans l\'app.' },
  comms: { title: 'Communication', desc: 'Annonces dans l\'app et mode maintenance.', tabs: [['announce', 'Annonces'], ['mailing', 'Annonce par e-mail'], ['status', 'Mode maintenance']] },
  settings: { title: 'Réglages', desc: 'Sécurité du compte, modération et administrateurs.', tabs: [['security', 'Sécurité'], ['moderation', 'Modération'], ['admins', 'Administrateurs']] }
};
const LOADERS = {
  'sec/users': renderSecList, 'sec/mod': renderSecList, 'sec/msg': renderSecList, 'sec/track': renderSecList, 'sec/sys': renderSecList,
  'home/overview': loadDashboard, 'home/stats': loadStats, 'home/health': loadHealth,
  'reports/map': loadMap, 'reports/review': loadReview, 'reports/riders': loadRiders, 'reports/routes': loadRoutes, 'reports/warnings': loadWarnings,
  'messages/contact': loadMessages, 'messages/mail': loadMail, 'messages/waitlist': loadMessages,
  'bans/devices': loadDevices, 'bans/terms': loadModeration,
  users: loadUsers,
  'maintenance/purge': loadMaintenance, 'maintenance/auto': loadAutoSettings, 'maintenance/backup': loadBackup,
  audit: loadAudit, vault: loadVault, survey: loadSurvey, legal: loadLegal,
  promos: loadPromos, 'comms/announce': loadAnnouncements, 'comms/mailing': loadMailing, 'comms/status': loadMaintMode,
  'settings/security': loadSecurity, 'settings/moderation': loadModSettings, 'settings/admins': loadAdmins
};

/* Sections du menu : [route, libellé, icône, description, couleur, clé de badge] */
const SECTIONS = {
  home: { title: 'Accueil', items: [['home/overview', 'Accueil']] },
  users: { title: 'Utilisateurs et abonnements', items: [
    ['users', 'Utilisateurs', '👥', 'Fiche, abonnement, bannissement, e-mail, export', ''],
    ['promos', 'Codes promo', '🏷', 'Essais gratuits à offrir', ''],
    ['reports/warnings', 'Avertissements', '⚠', 'Envoyés, lus ou non', 'o']] },
  mod: { title: 'Modération', items: [
    ['reports/map', 'Carte des repères', '📍', 'Tous les dangers, zone de suppression', 'o'],
    ['reports/review', 'Repères à vérifier', '🔎', 'Repères suspects', 'o', 'suspicious'],
    ['reports/riders', 'Utilisateurs signalés', '🚩', 'Signalements des autres cavaliers', 'o', 'user_reports_open'],
    ['reports/routes', 'Circuits', '🛣', 'Circuits publiés par les utilisateurs', 'o', 'routes_reported'],
    ['bans/devices', 'Appareils bannis', '📵', 'Bannir un appareil', ''],
    ['bans/terms', 'Pseudos interdits', '🚫', 'Termes bloqués', '']] },
  msg: { title: 'Messages et annonces', items: [
    ['messages/contact', 'Messages du formulaire', '💬', 'Contact depuis le site', 'b', 'messages_open'],
    ['messages/mail', 'Boîte contact@', '📥', 'Lire et répondre', 'b'],
    ['messages/waitlist', 'Liste d\'attente', '📋', 'Inscrits avant le lancement', 'b'],
    ['legal', 'Textes légaux', '⚖', 'CGU, CGV, mentions légales, confidentialité', 'p'],
    ['survey', 'Questionnaire', '📝', 'Réponses du formulaire du site', 'b'],
    ['comms/announce', 'Annonces dans l\'app', '📣', 'Messages affichés aux utilisateurs', 'p'],
    ['comms/mailing', 'Annonce par e-mail', '📧', 'Envoi à tous', 'p'],
    ['comms/status', 'Mode maintenance', '🛠', 'Couper l\'app temporairement', 'p']] },
  track: { title: 'Suivi', items: [
    ['home/stats', 'Statistiques', '📊', 'Inscriptions, fréquentation, qualité', 'b'],
    ['home/health', 'Santé', '❤', 'Contrôles et e-mails', ''],
    ['audit', 'Journal', '📜', 'Toutes les actions des admins', 'b']] },
  sys: { title: 'Système', items: [
    ['maintenance/purge', 'Espace et purge', '🗄', 'Espace disque, nettoyage', 'p'],
    ['maintenance/auto', 'Purge automatique', '⏱', 'Nettoyage programmé', 'p'],
    ['maintenance/backup', 'Sauvegardes', '💾', 'Télécharger, automatique', 'p'],
    ['vault', 'Coffre', '🔑', 'Codes et clés des services', 'o'],
    ['settings/security', 'Sécurité', '🔐', 'Mot de passe et 2FA', ''],
    ['settings/moderation', 'Réglages modération', '🎚', 'Seuils, CGU', ''],
    ['settings/admins', 'Administrateurs', '🧑‍💼', 'Accès et rôles', '']] }
};
const sectionOf = (key) => Object.keys(SECTIONS).find((k) => SECTIONS[k].items.some((i) => i[0] === key)) || 'home';

function parseHash() {
  const m = /^#\/([a-z]+)(?:\/([a-z]+))?/.exec(location.hash);
  let page = m && PAGES[m[1]] ? m[1] : 'home';
  const P = PAGES[page];
  let tab = null;
  if (P.tabs) tab = P.tabs.some((t) => t[0] === (m && m[2])) ? m[2] : P.tabs[0][0];
  return { page, tab };
}
const routeKey = () => state.route.page + (state.route.tab ? '/' + state.route.tab : '');
function navigate(route) {
  const target = '#/' + route;
  if (location.hash === target) render(); else location.hash = target;
}
window.addEventListener('hashchange', () => { if (!$('app').hidden) render(); });

function renderTabs() {
  if (state.route && state.route.page === 'sec') { $('tabs').hidden = true; return; }
  const sec = SECTIONS[sectionOf(routeKey())];
  const nav = $('tabs');
  if (sec.items.length < 2) { nav.hidden = true; nav.innerHTML = ''; return; }
  const st = state.stats || {};
  const cur = routeKey();
  nav.innerHTML = sec.items.map((it) => {
    const n = it[5] ? Number(st[it[5]] || 0) : 0;
    return `<button type="button" class="tab${it[0] === cur ? ' active' : ''}" data-route="${it[0]}">${esc(it[1])}${n > 0 ? `<span class="count">${fmtInt(n)}</span>` : ''}</button>`;
  }).join('');
  nav.hidden = false;
}


/* ---------- mobile : accueil façon écran de téléphone, liste de section, barre du bas ---------- */
const LAUNCH = [
  ['users', 'Utilisateurs', 'ic-users', '#2bc4ae,#168a79'],
  ['mod', 'Modération', 'ic-ban', '#f5a04a,#d4720f'],
  ['msg', 'Messages', 'ic-mail', '#5b8def,#3a63c4'],
  ['track', 'Suivi', 'ic-list', '#a07be8,#6c48b8'],
  ['sys', 'Système', 'ic-sliders', '#8d949e,#5d646d'],
  ['search', 'Rechercher', 'ic-search', '#3fb97a,#238753']
];
function secBadge(k) {
  const s = state.stats || {};
  if (k === 'mod') return Number(s.suspicious || 0) + Number(s.user_reports_open || 0) + Number(s.routes_reported || 0);
  if (k === 'msg') return Number(s.messages_open || 0);
  if (k === 'sys') { const limit = Number(s.db_limit_mb || 0) * 1048576; return limit && s.db_bytes / limit >= 0.8 ? '!' : 0; }
  return 0;
}
function renderLauncher() {
  const el = $('home-launcher');
  if (el) {
    el.innerHTML = LAUNCH.map(([k, label, ic, g]) => {
      const n = secBadge(k);
      return `<button type="button" class="lapp" data-launch="${k}"><span class="aico" style="background:linear-gradient(135deg,${g.split(',')[0]},${g.split(',')[1]})"><svg class="ic"><use href="#${ic}"/></svg>${n ? `<span class="abd${n === '!' ? ' warn' : ''}">${n}</span>` : ''}</span>${esc(label)}</button>`;
    }).join('');
  }
  const mini = $('home-mini'), s = state.stats;
  if (mini && s) mini.innerHTML = card('Abonnés actifs', fmtInt(s.subs_active), 'teal', 'users', 'subs') + card('Dangers actifs', fmtInt(s.dangers_active), 'orange', 'reports/map') + card('Utilisateurs', fmtInt(s.users), '', 'users');
  [['bb-mod', secBadge('mod')], ['bb-msg', secBadge('msg')]].forEach(([id, n]) => { const b = $(id); if (b) { b.textContent = n; b.hidden = !n; } });
}
function renderSecList() {
  const k = state.route.tab, S = SECTIONS[k], el = $('pane-sec'), st = state.stats || {};
  if (!S) return;
  el.innerHTML = '<div class="tiles">' + S.items.map((it) => {
    const n = it[5] ? Number(st[it[5]] || 0) : 0;
    return `<button type="button" class="tile ${it[4] || ''}" data-route="${it[0]}"><div class="ico">${it[2]}</div><div><b>${esc(it[1])}</b><small>${esc(it[3])}</small></div>${n > 0 ? `<div class="n">${fmtInt(n)}</div>` : ''}</button>`;
  }).join('') + '</div>';
}

function renderHub() {
  const el = $('home-hub');
  if (!el) return;
  const st = state.stats || {};
  el.innerHTML = Object.entries(SECTIONS).filter(([k]) => k !== 'home').map(([k, S]) => `<div class="hub-sec"><h2>${esc(S.title)}</h2><div class="tiles">` +
    S.items.map((it) => {
      const n = it[5] ? Number(st[it[5]] || 0) : 0;
      return `<button type="button" class="tile ${it[4] || ''}" data-route="${it[0]}"><div class="ico">${it[2]}</div><div><b>${esc(it[1])}</b><small>${esc(it[3])}</small></div>${n > 0 ? `<div class="n">${fmtInt(n)}</div>` : ''}</button>`;
    }).join('') + '</div></div>').join('');
}

function render() {
  state.route = parseHash();
  const key = routeKey();
  store.set('route', key);
  const P = PAGES[state.route.page];
  const secKey = state.route.page === 'sec' ? state.route.tab : sectionOf(key);
  $('page-title').textContent = state.route.page === 'sec' ? SECTIONS[secKey].title : secKey === 'home' ? P.title : SECTIONS[secKey].title;
  const it = SECTIONS[secKey].items.find((i) => i[0] === key);
  $('page-desc').textContent = state.route.page === 'sec' ? '' : secKey === 'home' || !it ? P.desc : it[1] + ' — ' + it[3];
  $('updated').textContent = '';
  updateTitle();
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.sec === secKey));
  document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.id !== (state.route.page === 'sec' ? 'pane-sec' : 'pane-' + key.replace('/', '-')); });
  document.querySelectorAll('#bottombar button[data-sec]').forEach((b) => b.classList.toggle('active', b.dataset.sec === secKey));
  renderTabs();
  renderHub();
  renderLauncher();
  if (key !== 'reports/map') cancelZone();
  $('side').classList.remove('open');
  window.scrollTo(0, 0);
  loadRoute();
}

async function loadRoute() {
  clearError();
  const key = routeKey();
  try {
    await LOADERS[key]();
    $('updated').textContent = 'Mis à jour ' + hhmm();
    if (key !== 'home/overview' && key !== 'home/stats') quietStats();
  } catch (e) {
    const m = String((e && e.message) || '');
    if (/mfa_required/.test(m) && !/mfa_required_first/.test(m) && key !== 'settings/security') navigate('settings/security');
    showError(e);
  }
}
$('refresh').addEventListener('click', loadRoute);
$('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sec]');
  if (!b) return;
  const cur = routeKey();
  const items = SECTIONS[b.dataset.sec].items;
  navigate(items.some((i) => i[0] === cur) ? cur : items[0][0]);
});
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-route]');
  if (b) navigate(b.dataset.route);
});
$('home-launcher').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-launch]');
  if (!b) return;
  if (b.dataset.launch === 'search') openPalette(); else navigate('sec/' + b.dataset.launch);
});
$('pane-sec').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-route]');
  if (b) navigate(b.dataset.route);
});
$('bottombar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'bb-more') { $('side').classList.toggle('open'); return; }
  if (b.dataset.sec === 'home') navigate('home/overview'); else navigate('sec/' + b.dataset.sec);
});
$('home-hub').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-route]');
  if (b) navigate(b.dataset.route);
});
$('menu-toggle').addEventListener('click', () => $('side').classList.toggle('open'));
document.addEventListener('click', (e) => {
  if ($('side').classList.contains('open') && !e.target.closest('#side') && !e.target.closest('#menu-toggle') && !e.target.closest('#bb-more')) $('side').classList.remove('open');
});

/* ---------- tri, sélection, actions groupées ---------- */
const sortState = (() => { try { return JSON.parse(store.get('sort', '{}')) || {}; } catch (e) { return {}; } })();
const DEFAULT_SORT = { users: ['created', 'desc'], review: ['created', 'desc'], devices: ['created', 'desc'], audit: ['created', 'desc'], waitlist: ['created', 'desc'] };
const SORT_KEYS = {
  users: {
    username: (u) => norm(u.username), email: (u) => norm(u.email), sub: (u) => subLabel(u), created: (u) => u.created_at,
    login: (u) => u.last_sign_in_at, status: (u) => statusLabel(u)
  },
  review: { type: (r) => r.kind + r.subtype, title: (r) => norm(r.title), reason: (r) => r.reason, votes: (r) => Number(r.denies) - Number(r.confirms), burst: (r) => r.burst || 0, created: (r) => r.created_at },
  devices: { device: (d) => d.device_id, reports: (d) => Number(d.reports), created: (d) => d.created_at, by: (d) => norm(d.banned_by_email) },
  audit: { created: (a) => a.created_at, admin: (a) => norm(a.admin_email), action: (a) => norm(ACTION_FR[a.action] || a.action), target: (a) => norm(a.target) },
  waitlist: { email: (w) => norm(w.email), source: (w) => norm(w.source), created: (w) => w.created_at }
};
function getSort(name) { return sortState[name] || DEFAULT_SORT[name]; }
function sortList(name, list) {
  const [key, dir] = getSort(name);
  const f = SORT_KEYS[name][key] || (() => 0);
  const m = dir === 'asc' ? 1 : -1;
  return list.slice().sort((a, b) => {
    const va = f(a), vb = f(b);
    const na = va == null || va === '', nb = vb == null || vb === '';
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * m;
    return String(va).localeCompare(String(vb), 'fr') * m;
  });
}
function th(name, key, label) {
  const [k, d] = getSort(name);
  const arrow = k === key ? (d === 'asc' ? ' ▲' : ' ▼') : '';
  return `<th class="sortable" data-sort="${name}:${key}" aria-sort="${k === key ? (d === 'asc' ? 'ascending' : 'descending') : 'none'}">${esc(label)}${arrow}</th>`;
}
const chkTh = (name, ids) => {
  if (!canWrite()) return '';
  const all = ids.length && ids.every((i) => state.sel[name].has(i));
  return `<th class="chk"><input type="checkbox" data-selall="${name}" aria-label="Tout sélectionner"${all ? ' checked' : ''}></th>`;
};
const chkTd = (name, id, disabled) =>
  canWrite() ? `<td class="chk">${disabled ? '' : `<input type="checkbox" data-sel="${name}" data-id="${esc(id)}"${state.sel[name].has(id) ? ' checked' : ''} aria-label="Sélectionner">`}</td>` : '';

const BULK_EL = { users: 'users-bulk', review: 'review-bulk', msgs: 'msg-bulk', riders: 'riders-bulk' };
const BULK_BTNS = {
  users: [['ban', 'Bannir', 'warn'], ['unban', 'Débannir', '']],
  review: [['del', 'Supprimer les signalements', 'danger'], ['ban', 'Bannir les appareils', 'danger']],
  msgs: [['done', 'Marquer traités', 'ok'], ['del', 'Supprimer', 'danger']],
  riders: [['done', 'Classer', 'ok'], ['del', 'Supprimer les signalements', 'danger']]
};
function renderBulk(name) {
  const el = $(BULK_EL[name]);
  const n = state.sel[name].size;
  if (!n || !canWrite()) { el.hidden = true; el.innerHTML = ''; return; }
  el.innerHTML = `<strong>${n} sélectionné(s)</strong><span class="grow"></span>` +
    BULK_BTNS[name].map(([k, l, c]) => `<button type="button" class="btn sm ${c}" data-bulk="${name}:${k}">${l}</button>`).join('') +
    `<button type="button" class="btn sm ghost" data-bulk="${name}:clear">Désélectionner</button>`;
  el.hidden = false;
}
function pruneSel(name, ids) {
  const keep = new Set(ids);
  [...state.sel[name]].forEach((i) => { if (!keep.has(i)) state.sel[name].delete(i); });
}
const RERENDER = { users: () => renderUsers(), review: () => renderReview(), msgs: () => renderMessages(), riders: () => renderRiders(), devices: () => renderDevices(), audit: () => renderAudit(), waitlist: () => renderWaitlist() };
const VISIBLE_IDS = {
  users: () => visibleUsers().filter((u) => !u.adm).map((u) => u.user_id),
  review: () => state.suspicious.map((r) => r.id),
  msgs: () => visibleMessages().map((m) => m.id),
  riders: () => visibleRiders().map((r) => r.rid)
};

async function each(ids, fn) {
  let ok = 0, fail = 0, last = null;
  for (const id of ids) { try { await fn(id); ok++; } catch (e) { fail++; last = e; } }
  return { ok, fail, last };
}
function bulkReport(r, label) {
  if (r.fail) showError({ message: `${r.ok} ${label}, ${r.fail} en échec : ${friendly(r.last)}` });
}

async function runBulk(name, k) {
  if (k === 'clear') { state.sel[name].clear(); RERENDER[name](); return; }
  if (!canWrite()) { showError({ message: 'forbidden_write' }); return; }
  const ids = [...state.sel[name]];
  const n = ids.length;
  if (!n) return;
  clearError();
  if (name === 'users') {
    if (k === 'ban') {
      const reason = await askBan(n + ' compte(s)');
      if (reason === null) return;
      bulkReport(await each(ids, (id) => rpc('admin_set_ban', { p_user: id, p_banned: true, p_reason: reason }, true)), 'bannis');
    } else {
      bulkReport(await each(ids, (id) => rpc('admin_set_ban', { p_user: id, p_banned: false }, true)), 'débannis');
    }
    state.sel.users.clear();
    await loadUsers();
  } else if (name === 'review') {
    if (k === 'del') {
      if (!(await confirmDialog({ title: 'Supprimer ' + n + ' signalement(s) ?', text: 'Ils disparaîtront de la carte pour tous les utilisateurs.', ok: 'Supprimer' }))) return;
      bulkReport(await each(ids, (id) => rpc('admin_delete_report', { p_id: id }, true)), 'supprimés');
    } else {
      const devs = [...new Set(state.suspicious.filter((r) => state.sel.review.has(r.id)).map((r) => r.device_id))];
      const v = await formDialog({
        title: 'Bannir ' + devs.length + ' appareil(s) ?', text: 'Ils ne pourront plus créer de signalements ni voter.', ok: 'Bannir',
        fields: [
          { id: 'reason', label: 'Motif (facultatif)', type: 'text' },
          { id: 'del', label: 'Signalements existants', type: 'select', options: [['1', 'Les supprimer aussi'], ['0', 'Les conserver']] }
        ]
      });
      if (!v) return;
      bulkReport(await each(devs, (d) => rpc('admin_ban_device', { p_device: d, p_reason: v.reason, p_delete_reports: v.del === '1' }, true)), 'appareils bannis');
    }
    state.sel.review.clear();
    await loadReview();
  } else if (name === 'riders') {
    if (k === 'del') {
      if (!(await confirmDialog({ title: 'Supprimer les signalements de ' + n + ' utilisateur(s) ?', text: 'Utile pour les faux signalements. Les comptes bannis automatiquement ne sont pas débannis : fais-le depuis leur fiche.', ok: 'Supprimer' }))) return;
      bulkReport(await each(ids, (id) => rpc('admin_delete_user_reports', { p_rid: id }, true)), 'supprimés');
    } else {
      bulkReport(await each(ids, (id) => rpc('admin_set_user_reports_handled', { p_rid: id, p_handled: true }, true)), 'classés');
    }
    state.sel.riders.clear();
    await loadRiders();
  } else if (name === 'msgs') {
    if (k === 'del') {
      if (!(await confirmDialog({ title: 'Supprimer ' + n + ' message(s) ?', text: 'Suppression définitive.', ok: 'Supprimer' }))) return;
      bulkReport(await each(ids, (id) => rpc('admin_delete_message', { p_id: id }, true)), 'supprimés');
    } else {
      bulkReport(await each(ids, (id) => rpc('admin_set_message_handled', { p_id: id, p_handled: true }, true)), 'traités');
    }
    state.sel.msgs.clear();
    await loadMessages();
  }
  quietStats();
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.sel) {
    const set = state.sel[t.dataset.sel];
    if (t.checked) set.add(t.dataset.id); else set.delete(t.dataset.id);
    RERENDER[t.dataset.sel]();
  } else if (t.dataset && t.dataset.selall) {
    const name = t.dataset.selall;
    const ids = VISIBLE_IDS[name]();
    if (t.checked) ids.forEach((i) => state.sel[name].add(i)); else ids.forEach((i) => state.sel[name].delete(i));
    RERENDER[name]();
  }
});

const MAIL_FIELD = { id: 'mail', label: 'Prévenir l\'utilisateur par e-mail (fonction admin-mail)', type: 'select', options: [['oui', 'Oui'], ['non', 'Non']] };
/* ---------- bannissement (toujours à vie) ---------- */
async function askBan(label) {
  const v = await formDialog({
    title: 'Bannir ' + label + ' à vie ?',
    text: 'Le compte est déconnecté et ne pourra plus se reconnecter. Son abonnement en cours est retiré (à résilier aussi chez le prestataire de paiement s\'il est payant). Le motif sera affiché à l\'utilisateur par l\'app.',
    ok: 'Bannir à vie',
    fields: [{ id: 'reason', label: 'Motif (facultatif, 200 caractères)', type: 'text' }, MAIL_FIELD]
  });
  state.notifyMail = !!v && v.mail === 'oui';
  return v ? v.reason : null;
}

async function askSubBan(label) {
  const v = await formDialog({
    title: 'Bannir l\'abonnement de ' + label + ' ?',
    text: 'Le compte reste utilisable (connexion, carte, signalements), mais son abonnement en cours est retiré et il ne pourra plus en avoir : ni paiement, ni abonnement offert, ni code promo. À résilier aussi chez le prestataire de paiement s\'il est payant.',
    ok: 'Bannir l\'abonnement',
    fields: [{ id: 'reason', label: 'Motif (facultatif, 200 caractères)', type: 'text' }, MAIL_FIELD]
  });
  state.notifyMail = !!v && v.mail === 'oui';
  return v ? v.reason : null;
}

/* ---------- cartes de chiffres ---------- */
const card = (k, v, tone = '', go = '', uf = '') =>
  `<div class="card${go ? ' link' : ''}"${go ? ` data-go="${go}"${uf ? ` data-uf="${uf}"` : ''} tabindex="0" role="link"` : ''}><div class="k">${esc(k)}</div><div class="v ${tone}">${esc(v)}</div></div>`;
const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`;
const STATUS_FR = { none: 'aucun', active: 'actif', past_due: 'impayé', canceled: 'résilié' };

function setBadge(id, n) { const b = $(id); b.textContent = n; b.hidden = !(n > 0); }
function renderTodo(s) {
  const el = $('home-todo');
  const items = [];
  if (s.suspicious > 0) items.push([`${fmtInt(s.suspicious)} signalement(s) suspect(s) à vérifier`, 'reports/review']);
  if (s.user_reports_open > 0) items.push([`${fmtInt(s.user_reports_open)} utilisateur(s) signalé(s) à examiner`, 'reports/riders']);
  if (s.routes_reported > 0) items.push([`${fmtInt(s.routes_reported)} circuit(s) signalé(s) à examiner`, 'reports/routes']);
  if (s.messages_open > 0) items.push([`${fmtInt(s.messages_open)} message(s) non traité(s)`, 'messages/contact']);
  const limit = Number(s.db_limit_mb || 0) * 1048576;
  if (limit && s.db_bytes / limit >= 0.8) items.push([`Base à ${Math.round((s.db_bytes / limit) * 100)} % de la limite (${fmtBytes(s.db_bytes)} sur ${fmtInt(s.db_limit_mb)} Mo)`, 'maintenance/purge']);
  if (s.reports_expired >= 50) items.push([`${fmtInt(s.reports_expired)} signalements expirés à purger`, 'maintenance/purge']);
  if (!items.length) { el.className = 'todo ok'; el.innerHTML = 'Rien à traiter. Tout est à jour.'; return; }
  el.className = 'todo warn';
  el.innerHTML = '<div class="todo-title">À traiter</div>' +
    items.map(([t, go]) => `<button type="button" class="todo-item" data-go="${go}"><span>${esc(t)}</span><span class="todo-cta">Ouvrir →</span></button>`).join('');
}
function updateTitle() {
  const s = state.stats || {};
  const n = Number(s.suspicious || 0) + Number(s.messages_open || 0) + Number(s.user_reports_open || 0);
  document.title = (n ? '(' + n + ') ' : '') + 'RideNCT admin · ' + PAGES[state.route.page].title;
}
function applyStats(s) {
  notifyChanges(state.stats, s);
  state.stats = s;
  updateTitle();
  setBadge('badge-reports', Number(s.suspicious) + Number(s.user_reports_open || 0) + Number(s.routes_reported || 0));
  setBadge('badge-messages', Number(s.messages_open));
  const limit = Number(s.db_limit_mb || 0) * 1048576;
  $('badge-maint').hidden = !(limit && s.db_bytes / limit >= 0.8);
  renderTodo(s);
  renderTabs();
  renderHub();
  renderLauncher();
}
async function quietStats() { try { applyStats(await rpc('admin_stats', null, true)); } catch (e) { /* silencieux */ } }

/* ---------- accueil ---------- */
const KIND_FR = { past_due: 'impayé', expired: 'expiré', expiring: 'fin sous 7 j' };
function relanceHref(a) {
  const name = a.username || '';
  const sujet = a.kind === 'past_due' ? 'Ton abonnement RideNCT : paiement à régulariser' : 'Ton abonnement RideNCT arrive à échéance';
  const corps = 'Bonjour' + (name ? ' ' + name : '') + ',\n\n' + (a.kind === 'past_due'
    ? 'Nous n\'avons pas pu encaisser le dernier paiement de ton abonnement RideNCT.'
    : 'Ton abonnement RideNCT ' + (a.kind === 'expired' ? 'a pris fin' : 'se termine') + ' le ' + fmtDay(a.sub_end) + '.') +
    '\nTu peux le renouveler depuis l\'app.\n\nÀ bientôt sur la route,\nL\'équipe RideNCT';
  return 'mailto:' + encodeURIComponent(a.email) + '?subject=' + encodeURIComponent(sujet) + '&body=' + encodeURIComponent(corps);
}
function renderAttention(list) {
  $('dash-attention').innerHTML = list.length
    ? '<thead><tr><th>Utilisateur</th><th>État</th><th>Formule</th><th>Fin</th><th></th></tr></thead><tbody>' +
      list.map((a) => `<tr><td>${esc(a.username || a.email)}${a.username ? ` <span class="muted small">${esc(a.email)}</span>` : ''}</td><td><span class="badge ${a.kind === 'expiring' ? 'wa' : 'ko'}">${esc(KIND_FR[a.kind] || a.kind)}</span>${a.provider === 'manual' ? ' <span class="badge ad">offert</span>' : ''}</td><td>${esc(a.plan || '—')}</td><td>${fmtDay(a.sub_end)}</td><td class="actions">${validMail(a.email) ? `<a class="btn sm" href="${relanceHref(a)}">Relancer</a>` : ''}</td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Rien à suivre.</td></tr></tbody>';
}

async function loadDashboard() {
  const alerts = rpc('admin_subscription_alerts');
  const s = await rpc('admin_stats');
  applyStats(s);
  const limit = Number(s.db_limit_mb || 0) * 1048576;
  $('dash-cards').innerHTML =
    card('Utilisateurs', fmtInt(s.users), '', 'users') +
    card('Actifs sur 7 jours', fmtInt(s.active_7d)) +
    card('Abonnés actifs', fmtInt(s.subs_active), 'teal', 'users', 'subs') +
    card('Dangers actifs', fmtInt(s.dangers_active), 'orange', 'reports/map') +
    card('Balades actives', fmtInt(s.rides_active), '', 'reports/map') +
    card('Comptes bannis', fmtInt(s.banned), s.banned > 0 ? 'red' : '', 'users', 'banned') +
    card('Appareils bannis', fmtInt(s.banned_devices), s.banned_devices > 0 ? 'red' : '', 'bans/devices') +
    card('Liste d\'attente', fmtInt(s.waitlist), '', 'messages/waitlist') +
    card('Taille base' + (limit ? ' (' + Math.round((s.db_bytes / limit) * 100) + ' %)' : ''), fmtBytes(s.db_bytes), '', 'maintenance/purge');
  const st = Object.entries(s.subs_by_status || {});
  const pl = Object.entries(s.subs_by_plan || {});
  $('dash-subs').innerHTML =
    (st.length ? st.map(([k, n]) => kv(STATUS_FR[k] || k, fmtInt(n))).join('') : '<div class="muted">Aucun abonnement pour l\'instant.</div>') +
    (pl.length ? '<div class="kv"><span class="muted small">Actifs par formule</span><span></span></div>' + pl.map(([k, n]) => kv(k, fmtInt(n))).join('') : '');
  $('dash-reports').innerHTML =
    kv('Actifs', fmtInt(s.reports_active)) +
    kv('Expirés (à purger)', fmtInt(s.reports_expired)) +
    kv('Total en base', fmtInt(s.reports_total));
  renderAttention((await alerts) || []);
}

/* ---------- statistiques ---------- */
function barChart(id, rows, key, color) {
  const el = $(id);
  const vals = rows.map((r) => Number(r[key]) || 0);
  const max = Math.max(0, ...vals);
  if (!max) { el.innerHTML = '<div class="muted">Aucune donnée sur la période.</div>'; return; }
  const W = 640, H = 130, pad = 22;
  const bw = (W - 10) / vals.length;
  const bars = vals.map((v, i) => {
    const h = Math.round((v / max) * (H - pad - 14));
    return `<rect x="${(5 + i * bw + bw * 0.15).toFixed(1)}" y="${H - pad - h}" width="${Math.max(bw * 0.7, 1).toFixed(1)}" height="${h}" rx="1.5" fill="var(--${color})"><title>${esc(fmtDay(rows[i].day))} : ${v}</title></rect>`;
  }).join('');
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><title>Courbe</title>${bars}<line x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/><text class="ax" x="5" y="${H - 6}">${esc(fmtDay(rows[0].day))}</text><text class="ax" x="${W - 5}" y="${H - 6}" text-anchor="end">${esc(fmtDay(rows[rows.length - 1].day))}</text><text class="ax" x="5" y="10">max ${max}</text></svg>`;
}
function renderFunnel(f) {
  const base = Number(f.users) || 0;
  const rows = [['Inscrits', f.users], ['Pseudo choisi', f.with_username], ['Actifs 30 jours', f.active_30d], ['Actifs 7 jours', f.active_7d], ['Ont eu un abonnement', f.subs_ever], ['Abonnés actifs', f.subs_active]];
  $('funnel').innerHTML = rows.map(([l, n]) => {
    const pct = base ? Math.round((Number(n) / base) * 100) : 0;
    return `<div class="funnel-row"><span>${esc(l)}</span><div class="bar"><i style="width:${pct}%"></i></div><span>${fmtInt(n)} · ${pct} %</span></div>`;
  }).join('') + `<p class="muted small">Inactifs depuis plus de 30 jours : ${fmtInt(f.dormant)} · impayés : ${fmtInt(f.past_due)} · résiliés : ${fmtInt(f.canceled)}</p>`;
}
function renderTiming(rows) {
  const grid = {};
  let max = 0;
  rows.forEach((r) => { grid[r.dow + ':' + r.hr] = r.n; max = Math.max(max, r.n); });
  if (!max) { $('timing-grid').innerHTML = '<div class="muted">Aucune donnée sur la période.</div>'; return; }
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  let html = '<div class="heat"><span></span>' + Array.from({ length: 24 }, (_, h) => `<span class="hh">${h % 3 === 0 ? h : ''}</span>`).join('');
  days.forEach((d, i) => {
    html += `<span class="hl">${d}</span>`;
    for (let h = 0; h < 24; h++) {
      const n = grid[(i + 1) + ':' + h] || 0;
      html += `<span class="hc" title="${d} ${h} h : ${n}" style="${n ? `background:rgba(240,138,36,${(0.2 + 0.8 * n / max).toFixed(2)})` : ''}"></span>`;
    }
  });
  $('timing-grid').innerHTML = html + '</div>';
}
function renderZones(rows) {
  $('zones-table').innerHTML = rows.length
    ? '<thead><tr><th>Zone</th><th>Dangers</th><th>Démentis</th><th></th></tr></thead><tbody>' +
      rows.map((z) => `<tr><td>${Number(z.lat).toFixed(1)}, ${Number(z.lng).toFixed(1)}</td><td>${fmtInt(z.n)}</td><td>${fmtInt(z.denied)}</td><td class="actions"><button class="btn sm" data-act="focus" data-lng="${z.lng}" data-lat="${z.lat}">Voir</button></td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Aucune donnée.</td></tr></tbody>';
}
function renderQuality(rows) {
  $('quality-table').innerHTML = rows.length
    ? '<thead><tr><th>Type</th><th>Nombre</th><th>Confirm. moy.</th><th>Démentis moy.</th><th>Démentis</th></tr></thead><tbody>' +
      rows.map((q) => `<tr><td>${esc(q.kind)} · ${esc(q.subtype)}</td><td>${fmtInt(q.n)}</td><td>${esc(q.avg_confirms)}</td><td>${esc(q.avg_denies)}</td><td><span class="badge ${Number(q.denied_pct) >= 50 ? 'ko' : Number(q.denied_pct) >= 25 ? 'wa' : 'ok'}">${esc(q.denied_pct)} %</span></td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Aucune donnée.</td></tr></tbody>';
}
async function loadStats() {
  const days = Number($('stats-days').value) || 30;
  const [s, series, funnel, timing, zones, quality] = await Promise.all([
    rpc('admin_stats'), rpc('admin_stats_series', { p_days: days }), rpc('admin_funnel'),
    rpc('admin_report_timing', { p_days: days }), rpc('admin_report_zones', { p_days: days }), rpc('admin_report_quality', { p_days: days })
  ]);
  applyStats(s);
  renderFunnel(funnel);
  renderTiming(timing || []);
  renderZones(zones || []);
  renderQuality(quality || []);
  const mrr = s.paid_monthly * PRICE_MONTH + s.paid_yearly * PRICE_YEAR / 12;
  const conv = s.users ? (s.subs_active / s.users) * 100 : 0;
  $('stats-cards').innerHTML =
    card('Actifs 7 jours', fmtInt(s.active_7d)) +
    card('Actifs 30 jours', fmtInt(s.active_30d)) +
    card('Conversion', conv.toFixed(1).replace('.', ',') + ' %', 'teal') +
    card('Payants mensuels', fmtInt(s.paid_monthly)) +
    card('Payants annuels', fmtInt(s.paid_yearly)) +
    card('Offerts', fmtInt(s.subs_gifted)) +
    card('Revenu mensuel est.', fmtEur(mrr), 'teal') +
    card('Revenu annuel est.', fmtEur(mrr * 12));
  const rows = series || [];
  if (!rows.length) { ['chart-signups', 'chart-logins', 'chart-reports'].forEach((i) => { $(i).innerHTML = '<div class="muted">Aucune donnée.</div>'; }); return; }
  barChart('chart-signups', rows, 'signups', 'teal');
  barChart('chart-logins', rows, 'logins', 'orange');
  barChart('chart-reports', rows, 'reports', 'red');
}
$('stats-days').addEventListener('change', () => { store.set('stats.days', $('stats-days').value); loadRoute(); });

/* ---------- utilisateurs ---------- */
const subLabel = (u) => (u.sub_status === 'active' && u.sub_provider === 'manual' ? 'offert' : STATUS_FR[u.sub_status] || u.sub_status || 'aucun');
const statusLabel = (u) => (u.adm ? 'admin' : isBanned(u) ? 'banni' : 'actif');
const UF = {
  all: ['Tous', () => true],
  subs: ['Abonnés', (u) => u.sub_status === 'active' && u.sub_provider !== 'manual'],
  gift: ['Offerts', (u) => u.sub_status === 'active' && u.sub_provider === 'manual'],
  pastdue: ['Impayés', (u) => u.sub_status === 'past_due'],
  banned: ['Bannis', isBanned],
  subbanned: ['Abo banni', (u) => !!u.sub_banned],
  admins: ['Admins', (u) => !!u.adm],
  reported: ['Signalés', (u) => Number(u.reports_received) > 0]
};
const visibleUsers = () => state.users.filter(UF[state.userFilter][1]);

async function loadUsers() {
  const q = $('user-search').value.trim();
  state.users = (await rpc('admin_list_users', { p_search: q || null, p_limit: 500 })) || [];
  pruneSel('users', state.users.filter((u) => !u.adm).map((u) => u.user_id));
  renderUsers();
}
function renderUsers() {
  if (!UF[state.userFilter]) state.userFilter = 'all';
  $('user-chips').innerHTML = Object.entries(UF).map(([k, [label, fn]]) =>
    `<button type="button" class="fchip${k === state.userFilter ? ' active' : ''}" data-uf="${k}">${label}<b>${fmtInt(state.users.filter(fn).length)}</b></button>`).join('');
  renderBulk('users');
  const t = $('users-table');
  const list = sortList('users', visibleUsers());
  if (!list.length) {
    t.innerHTML = '<tbody><tr><td class="empty">Aucun utilisateur.</td></tr></tbody>';
    $('users-count').textContent = '';
    return;
  }
  const rows = list.map((u) => {
    const status = u.adm ? `<span class="badge ad">${esc(u.adm_role)}</span>` : isBanned(u) ? '<span class="badge ko">banni</span>' : '<span class="badge ok">actif</span>';
    const sl = subLabel(u);
    const sub = sl === 'offert' ? '<span class="badge ad">offert</span>' : sl === 'actif' ? '<span class="badge ok">actif</span>' : sl === 'aucun' ? '<span class="badge">aucun</span>' : `<span class="badge wa">${esc(sl)}</span>`;
    return `<tr class="row-click${state.sel.users.has(u.user_id) ? ' sel' : ''}" data-user="${esc(u.user_id)}">${chkTd('users', u.user_id, u.adm)}<td>${esc(u.username || '—')}</td><td>${esc(u.email || '—')}</td><td>${sub}</td><td>${fmtDay(u.created_at)}</td><td>${fmtDate(u.last_sign_in_at)}</td><td>${status}</td></tr>`;
  }).join('');
  t.innerHTML = '<thead><tr>' + chkTh('users', VISIBLE_IDS.users()) + th('users', 'username', 'Pseudo') + th('users', 'email', 'E-mail') + th('users', 'sub', 'Abo') + th('users', 'created', 'Inscrit') + th('users', 'login', 'Dernière connexion') + th('users', 'status', 'Statut') + '</tr></thead><tbody>' + rows + '</tbody>';
  $('users-count').textContent = fmtInt(list.length) + ' affiché(s) sur ' + fmtInt(state.users.length) + ' chargé(s)' + (state.users.length >= 500 ? ' (limite 500 : affine la recherche)' : '');
}
$('user-search').addEventListener('input', debounce(() => loadUsers().catch(showError), 300));
$('user-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uf]');
  if (!b) return;
  state.userFilter = b.dataset.uf;
  store.set('users.filter', state.userFilter);
  renderUsers();
});
$('export-users').addEventListener('click', () => {
  downloadCSV('utilisateurs-ridenct.csv',
    ['pseudo', 'email', 'inscrit', 'derniere_connexion', 'banni', 'abonnement', 'formule', 'fin_periode', 'origine_abo', 'role_admin'],
    visibleUsers().map((u) => [u.username, u.email, u.created_at, u.last_sign_in_at, isBanned(u) ? 'oui' : 'non', u.sub_status, u.sub_plan, u.sub_end, u.sub_provider, u.adm_role]));
});

/* ---------- fiche utilisateur ---------- */
function openUser(u) {
  state.drawerUser = u;
  $('drawer').hidden = false;
  renderDrawer();
  loadUserHistory(u);
  loadUserReports(u);
  loadUserRoutes(u);
}
async function loadUserRoutes(u) {
  const box = () => $('drawer-routes');
  if (!box() || u.adm) return;
  try {
    const rows = (await rpc('admin_list_routes', { p_user: u.user_id }, true)) || [];
    if (!state.drawerUser || state.drawerUser.user_id !== u.user_id || !box()) return;
    box().innerHTML = rows.length ? rows.map((r) => `<div class="item">${r.reports > 0 ? `<span class="badge ko">${fmtInt(r.reports)} signalement(s)</span> ` : ''}<strong>${esc(r.title)}</strong> <span class="muted small">· ${esc(r.region)} · ${(r.dist_m / 1000).toFixed(0)} km · ${fmtInt(r.downloads)} téléch. · ${fmtDate(r.created_at)}</span></div>`).join('') : '<span class="muted">Aucun circuit publié.</span>';
  } catch (e) { if (box()) box().textContent = 'Circuits indisponibles.'; }
}
async function loadUserReports(u) {
  const box = () => $('drawer-reports');
  if (!box() || u.adm) return;
  try {
    const all = (await rpc('admin_list_user_reports', {}, true)) || [];
    if (!state.drawerUser || state.drawerUser.user_id !== u.user_id || !box()) return;
    const rows = all.filter((r) => r.user_id === u.user_id);
    const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
    const total = rows.length ? Math.max(...rows.map((r) => Number(r.acct_total || 0))) : 0;
    const fake = sum('fake');
    const items = rows.flatMap((r) => r.items || []).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 15);
    const W = canWrite();
    const reasons = ['musique', 'propos', 'autre'].filter((k) => sum(k) > 0).map((k) => `<span class="badge wa">${REASON_FR[k]} ${sum(k)}</span>`).join(' ');
    const list = items.map((i) => `<div class="item"><span class="badge">${esc(REASON_FR[i.reason] || i.reason)}</span> ${esc(i.details || '—')}<span class="muted small"> · ${i.fake ? '<span class="badge wa">FACTICE</span>' : esc(i.by || 'compte supprimé')} · ${fmtDate(i.at)}</span></div>`).join('');
    const ctl = W ? `<div class="row mt"><select id="fake-reason" aria-label="Cause du signalement factice"><option value="musique">Musique</option><option value="propos">Propos</option><option value="autre">Autre</option></select><button type="button" class="btn sm" data-act="fake-add" data-id="${esc(u.user_id)}" data-name="${esc(u.username || u.email)}">+1 signalement factice</button>${fake > 0 ? `<button type="button" class="btn sm" data-act="fake-clear" data-id="${esc(u.user_id)}" data-name="${esc(u.username || u.email)}">Retirer les factices</button>` : ''}</div>` : '';
    box().innerHTML = `<div class="row"><span class="badge ${rows.some((r) => r.alert) ? 'ko' : ''}">${fmtInt(total)} signalant(s) distinct(s)</span>${fake > 0 ? `<span class="badge wa">dont ${fmtInt(fake)} factice(s)</span>` : ''}${rows.some((r) => r.alert) ? '<span class="badge ko">seuil atteint : avertissement envoyé à l\'utilisateur</span>' : ''} ${reasons}</div>` + (list ? `<div class="items">${list}</div>` : '<p class="muted small">Aucun signalement reçu.</p>') + ctl;
  } catch (e) { if (box()) box().textContent = 'Signalements indisponibles.'; }
}
function closeDrawer() { $('drawer').hidden = true; state.drawerUser = null; }
function renderDrawer() {
  const u = state.drawerUser;
  if (!u) return;
  const W = canWrite();
  const banned = isBanned(u);
  const gift = u.sub_status === 'active' && u.sub_provider === 'manual';
  const nm = esc(u.username || u.email);
  $('drawer-title').textContent = u.username || u.email || 'Utilisateur';
  $('drawer-sub').textContent = u.username ? u.email || '' : '';
  const badges = [];
  badges.push(u.adm ? `<span class="badge ad">${esc(u.adm_role)}</span>` : banned ? '<span class="badge ko">banni</span>' : '<span class="badge ok">actif</span>');
  if (u.sub_banned) badges.push('<span class="badge ko">abonnement banni</span>');
  if (Number(u.warnings_pending) > 0) badges.push(`<span class="badge wa">${fmtInt(u.warnings_pending)} avertissement(s) non lu(s)</span>`);
  badges.push(`<span class="badge ${gift ? 'ad' : u.sub_status === 'active' ? 'ok' : u.sub_status === 'none' || !u.sub_status ? '' : 'wa'}">abo : ${esc(subLabel(u))}</span>`);
  let acts = `<button type="button" class="btn sm" data-act="copymail" data-mail="${esc(u.email)}">Copier l'e-mail</button>`;
  if (W && !u.adm) {
    if (gift) acts += `<button type="button" class="btn sm" data-act="revokegift" data-id="${esc(u.user_id)}" data-name="${nm}">Retirer l'abo offert</button>`;
    else if (u.sub_status === 'active' || u.sub_status === 'past_due') acts += `<button type="button" class="btn sm warn" data-act="cancelsub" data-id="${esc(u.user_id)}" data-name="${nm}">Retirer l'abonnement</button>`;
    if (!gift && u.sub_status !== 'active' && u.sub_status !== 'past_due') acts += `<button type="button" class="btn sm ok" data-act="grant" data-id="${esc(u.user_id)}" data-name="${nm}">Offrir un abo</button>`;
    acts += `<button type="button" class="btn sm warn" data-act="warn" data-id="${esc(u.user_id)}" data-name="${nm}">Envoyer un avertissement</button>`;
    acts += u.sub_banned
      ? `<button type="button" class="btn sm ok" data-act="subunban" data-id="${esc(u.user_id)}" data-name="${nm}">Rétablir l'abonnement</button>`
      : `<button type="button" class="btn sm warn" data-act="subban" data-id="${esc(u.user_id)}" data-name="${nm}">Bannir l'abonnement</button>`;
    acts += banned
      ? `<button type="button" class="btn sm" data-act="unban" data-id="${esc(u.user_id)}" data-name="${nm}">Débannir le compte</button>`
      : `<button type="button" class="btn sm warn" data-act="ban" data-id="${esc(u.user_id)}" data-name="${nm}">Bannir le compte (à vie)</button>`;
    if (Number(u.reports_received) > 0) acts += `<button type="button" class="btn sm" data-go="reports/riders">Voir les signalements</button>`;
    acts += `<button type="button" class="btn sm danger" data-act="deluser" data-id="${esc(u.user_id)}" data-name="${nm}">Supprimer</button>`;
  }
  if (W) acts += `<button type="button" class="btn sm" data-act="mail-user" data-id="${esc(u.user_id)}" data-name="${nm}">Écrire un e-mail</button><button type="button" class="btn sm" data-act="export-user" data-id="${esc(u.user_id)}" data-name="${nm}" data-mail="${esc(u.email)}">Exporter les données</button>`;
  $('drawer-body').innerHTML =
    `<div class="badges">${badges.join('')}</div>` +
    '<div>' + kv('E-mail', u.email || '—') + kv('Inscrit le', fmtDay(u.created_at)) + kv('Dernière connexion', fmtDate(u.last_sign_in_at)) +
    (Number(u.reports_received) > 0 ? kv('Signalements reçus', fmtInt(u.reports_received)) : '') + kv('Formule', u.sub_plan || '—') + kv('Fin de période', u.sub_end ? fmtDay(u.sub_end) : '—') + kv('CGU acceptées', u.cgu_version ? 'version ' + u.cgu_version : 'aucune') + (u.sub_banned ? kv('Abonnement banni', u.sub_ban_reason || 'oui') : '') + (banned ? kv('Banni', fmtUntil(u.banned_until)) + (u.ban_reason ? kv('Motif', u.ban_reason) : '') : '') + '</div>' +
    (u.adm ? '<p class="muted small">Compte administrateur : retire d\'abord ses droits (Réglages › Administrateurs) pour le bannir ou le supprimer.</p>' : '') +
    `<h4>Actions</h4><div class="acts">${acts}</div>` +
    (u.adm ? '' : '<h4>Signalements reçus</h4><div id="drawer-reports"><span class="muted">Chargement…</span></div><h4>Circuits publiés</h4><div id="drawer-routes"><span class="muted">Chargement…</span></div>') +
    '<h4>Historique</h4><div class="hist" id="drawer-hist"><span class="muted">Chargement…</span></div>';
}
async function loadUserHistory(u) {
  const seq = ++state.drawerSeq;
  try {
    const all = (await rpc('admin_list_audit', { p_limit: 1000 }, true)) || [];
    if (seq !== state.drawerSeq || !$('drawer-hist')) return;
    const mail = norm(u.email);
    const mine = mail ? all.filter((a) => norm(a.target).includes(mail)).slice(0, 8) : [];
    $('drawer-hist').innerHTML = mine.length
      ? mine.map((a) => `<div><span>${esc(ACTION_FR[a.action] || a.action)} · ${esc(a.admin_email || 'système')}</span><span>${fmtDate(a.created_at)}</span></div>`).join('')
      : '<span class="muted">Aucune action enregistrée sur ce compte.</span>';
  } catch (e) { if ($('drawer-hist')) $('drawer-hist').innerHTML = '<span class="muted">Historique indisponible.</span>'; }
}
async function refreshUser(id, email) {
  if (!state.drawerUser || state.drawerUser.user_id !== id) return;
  try {
    const rows = (await rpc('admin_list_users', { p_search: email || null, p_limit: 20 }, true)) || [];
    const u = rows.find((x) => x.user_id === id);
    if (!u) { closeDrawer(); return; }
    state.drawerUser = u;
    renderDrawer();
    loadUserHistory(u);
    loadUserReports(u);
    loadUserRoutes(u);
  } catch (e) { /* ignoré */ }
}
async function afterFake(id) {
  if (routeKey() === 'reports/riders') await loadRiders();
  if (routeKey() === 'users') await loadUsers();
  if (state.drawerUser && state.drawerUser.user_id === id) { await refreshUser(id, state.drawerUser.email); }
}
async function afterUserChange(id) {
  const email = state.drawerUser && state.drawerUser.user_id === id ? state.drawerUser.email : null;
  if (routeKey() === 'users') await loadUsers();
  if (routeKey() === 'reports/riders') await loadRiders();
  await refreshUser(id, email);
}
$('drawer-close').addEventListener('click', closeDrawer);
$('drawer-bg').addEventListener('click', closeDrawer);
$('users-table').addEventListener('click', (e) => {
  const sh = e.target.closest('th[data-sort]');
  if (sh) return;
  const tr = e.target.closest('tr[data-user]');
  if (!tr || e.target.closest('input,button,a')) return;
  const u = state.users.find((x) => x.user_id === tr.dataset.user);
  if (u) openUser(u);
});

/* ---------- carte ---------- */
function ensureMap() {
  if (state.map) return;
  const map = new maplibregl.Map({ container: 'map', center: [2.5, 46.6], zoom: 5, style: 'https://tiles.openfreemap.org/styles/positron' });
  state.map = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    const empty = { type: 'FeatureCollection', features: [] };
    map.addSource('heat', { type: 'geojson', data: empty });
    map.addLayer({
      id: 'heat', type: 'heatmap', source: 'heat', layout: { visibility: 'none' },
      paint: {
        'heatmap-radius': 28, 'heatmap-intensity': 1.2, 'heatmap-opacity': 0.85,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(31,181,160,0.5)', 0.5, 'rgba(240,138,36,0.75)', 1, 'rgba(229,83,75,0.95)']
      }
    });
    map.addSource('zone', { type: 'geojson', data: empty });
    map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': '#e5534b', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'zone-line', type: 'line', source: 'zone', paint: { 'line-color': '#e5534b', 'line-width': 2 } });
    state.mapLoaded = true;
    if (state.reports.length) renderMap(false);
  });
  map.on('mousedown', (e) => { if (state.drawing) state.zoneStart = e.lngLat; });
  map.on('mousemove', (e) => { if (state.drawing && state.zoneStart) drawRect(state.zoneStart, e.lngLat); });
  map.on('mouseup', (e) => {
    if (!state.drawing || !state.zoneStart) return;
    const a = state.zoneStart;
    state.zoneStart = null;
    drawRect(a, e.lngLat);
    purgeZone(a, e.lngLat);
  });
}
async function loadMap() {
  ensureMap();
  setTimeout(() => state.map.resize(), 50);
  state.reports = (await rpc('admin_list_reports')) || [];
  renderMap(!state.focus);
  if (state.focus) {
    state.map.flyTo({ center: [state.focus.lng, state.focus.lat], zoom: 14 });
    state.focus = null;
  }
}
function popupNode(r) {
  const expired = new Date(r.expires_at) <= new Date();
  const d = document.createElement('div');
  d.className = 'pop';
  const add = (tag, text) => { const e = document.createElement(tag); e.textContent = text; d.appendChild(e); return e; };
  add('h4', r.title || r.subtype || r.kind);
  add('p', (r.kind === 'danger' ? 'Danger' : 'Balade') + ' · ' + r.subtype + (expired ? ' · expiré' : ''));
  if (r.place_name) add('p', 'Lieu : ' + r.place_name);
  if (r.description) add('p', r.description);
  if (r.organizer_name) add('p', 'Organisateur : ' + r.organizer_name);
  if (r.level) add('p', 'Niveau : ' + r.level);
  if (r.starts_at) add('p', 'Début : ' + fmtDate(r.starts_at));
  add('p', 'Créé : ' + fmtDate(r.created_at) + ' · expire : ' + fmtDate(r.expires_at));
  add('p', 'Confirmations : ' + r.confirms + ' · démentis : ' + r.denies);
  add('p', 'Appareil : ' + r.device_id);
  if (canWrite()) {
    const row = document.createElement('div');
    row.className = 'row';
    const mk = (cls, label, fn) => { const b = document.createElement('button'); b.className = 'btn sm ' + cls; b.textContent = label; b.onclick = fn; row.appendChild(b); };
    mk('danger', 'Supprimer', () => deleteReport(r.id));
    mk('warn', 'Tout de cet appareil', () => deleteDevice(r.device_id));
    mk('danger', 'Bannir l\'appareil', () => banDevice(r.device_id));
    d.appendChild(row);
  }
  return d;
}
async function deleteReport(id) {
  if (!(await confirmDialog({ title: 'Supprimer ce signalement ?', text: 'Il disparaîtra de la carte pour tous les utilisateurs.', ok: 'Supprimer' }))) return;
  try { await rpc('admin_delete_report', { p_id: id }); await reloadAfterReportChange(); } catch (e) { showError(e); }
}
async function deleteDevice(device) {
  if (!(await confirmDialog({ title: 'Supprimer tout ce que cet appareil a signalé ?', text: 'Tous les signalements créés par cet appareil seront supprimés (spam, abus).', ok: 'Tout supprimer' }))) return;
  try { await rpc('admin_delete_device_reports', { p_device: device }); await reloadAfterReportChange(); } catch (e) { showError(e); }
}
async function reloadAfterReportChange() {
  const k = routeKey();
  if (k === 'reports/map') await loadMap();
  else if (k === 'reports/review') await loadReview();
  else if (k === 'bans/devices') await loadDevices();
  quietStats();
}
async function banDevice(device, reason) {
  const v = await formDialog({
    title: 'Bannir cet appareil ?',
    text: 'Il ne pourra plus créer de signalements ni voter. ' + String(device).slice(0, 16) + '…',
    ok: 'Bannir',
    fields: [
      { id: 'reason', label: 'Motif (facultatif)', type: 'text', value: reason || '' },
      { id: 'del', label: 'Signalements existants', type: 'select', options: [['1', 'Les supprimer aussi'], ['0', 'Les conserver']] }
    ]
  });
  if (!v) return false;
  try {
    await rpc('admin_ban_device', { p_device: device, p_reason: v.reason, p_delete_reports: v.del === '1' });
    await reloadAfterReportChange();
    return true;
  } catch (e) { showError(e); return false; }
}
function filteredReports() {
  const kind = $('map-kind').value;
  const showExpired = $('map-expired').checked;
  const days = Number($('map-period').value) || 0;
  const now = Date.now();
  return state.reports.filter((r) =>
    (kind === 'all' || r.kind === kind) &&
    (showExpired || new Date(r.expires_at) > now) &&
    (!days || now - new Date(r.created_at) <= days * 86400000));
}
function renderMap(fit) {
  if (!state.map) return;
  state.markers.forEach((m) => m.remove());
  state.markers = [];
  const heat = $('map-heat').checked;
  const list = filteredReports();
  const now = Date.now();
  const bounds = new maplibregl.LngLatBounds();
  list.forEach((r) => {
    bounds.extend([r.lng, r.lat]);
    if (heat) return;
    const el = document.createElement('div');
    const sub = /accident|animal/.test(r.subtype) ? r.subtype : '';
    el.className = 'pin ' + r.kind + ' ' + sub + (new Date(r.expires_at) <= now ? ' expired' : '');
    const mk = new maplibregl.Marker({ element: el })
      .setLngLat([r.lng, r.lat])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setDOMContent(popupNode(r)))
      .addTo(state.map);
    state.markers.push(mk);
  });
  if (state.mapLoaded) {
    state.map.getSource('heat').setData({
      type: 'FeatureCollection',
      features: list.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } }))
    });
    state.map.setLayoutProperty('heat', 'visibility', heat ? 'visible' : 'none');
  }
  $('map-count').textContent = fmtInt(list.length) + ' signalement(s) affiché(s) sur ' + fmtInt(state.reports.length) + ' en base. Rouge : danger, teal : balade, pâle : expiré.';
  if (fit && list.length) state.map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 0 });
}
['map-kind', 'map-period', 'map-expired', 'map-heat'].forEach((id) => $(id).addEventListener('change', () => {
  const el = $(id);
  store.set(id, el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value);
  renderMap(false);
}));
function drawRect(a, b) {
  if (!state.mapLoaded) return;
  const w = Math.min(a.lng, b.lng), e = Math.max(a.lng, b.lng), s = Math.min(a.lat, b.lat), n = Math.max(a.lat, b.lat);
  state.map.getSource('zone').setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }]
  });
}
function startZone() {
  ensureMap();
  state.drawing = true;
  state.zoneStart = null;
  state.map.dragPan.disable();
  state.map.getCanvas().style.cursor = 'crosshair';
  $('map-hint').hidden = false;
  $('map-zone').textContent = 'Annuler la zone';
}
function cancelZone() {
  state.drawing = false;
  state.zoneStart = null;
  $('map-hint').hidden = true;
  $('map-zone').textContent = 'Purger une zone';
  if (!state.map) return;
  state.map.dragPan.enable();
  state.map.getCanvas().style.cursor = '';
  if (state.mapLoaded) state.map.getSource('zone').setData({ type: 'FeatureCollection', features: [] });
}
async function purgeZone(a, b) {
  const w = Math.min(a.lng, b.lng), e = Math.max(a.lng, b.lng), s = Math.min(a.lat, b.lat), n = Math.max(a.lat, b.lat);
  const kind = $('map-kind').value;
  const hits = state.reports.filter((r) => r.lng >= w && r.lng <= e && r.lat >= s && r.lat <= n && (kind === 'all' || r.kind === kind));
  if (!hits.length) { cancelZone(); $('map-count').textContent = 'Aucun signalement dans cette zone.'; return; }
  const ok = await confirmDialog({
    title: 'Supprimer ' + hits.length + ' signalement(s) dans cette zone ?',
    text: 'Type : ' + (kind === 'all' ? 'tous' : kind === 'danger' ? 'dangers' : 'balades') + ', expirés inclus. Suppression définitive.',
    ok: 'Supprimer la zone',
    confirmWord: hits.length >= 20 ? 'supprimer' : null
  });
  if (ok) {
    try { await rpc('admin_delete_reports_in_bbox', { p_min_lat: s, p_min_lng: w, p_max_lat: n, p_max_lng: e, p_kind: kind === 'all' ? null : kind }); }
    catch (err) { showError(err); }
  }
  cancelZone();
  await loadMap();
  quietStats();
}
$('map-zone').addEventListener('click', () => {
  if (!canWrite()) { showError({ message: 'forbidden_write' }); return; }
  if (state.drawing) cancelZone(); else startZone();
});

/* ---------- à vérifier ---------- */
async function loadReview() {
  state.suspicious = (await rpc('admin_suspicious_reports')) || [];
  pruneSel('review', state.suspicious.map((r) => r.id));
  renderReview();
}
function renderReview() {
  renderBulk('review');
  const t = $('review-table');
  if (!state.suspicious.length) { t.innerHTML = '<tbody><tr><td class="empty">Rien à vérifier.</td></tr></tbody>'; return; }
  const W = canWrite();
  const list = sortList('review', state.suspicious);
  t.innerHTML = '<thead><tr>' + chkTh('review', state.suspicious.map((r) => r.id)) + th('review', 'type', 'Type') + th('review', 'title', 'Titre') + th('review', 'reason', 'Raison') + th('review', 'votes', 'Conf. / démentis') + th('review', 'burst', 'Rafale (1 h)') + th('review', 'created', 'Créé') + '<th></th></tr></thead><tbody>' +
    list.map((r) => `<tr class="${state.sel.review.has(r.id) ? 'sel' : ''}">${chkTd('review', r.id)}<td>${esc(r.kind)} · ${esc(r.subtype)}</td><td>${esc(r.title || '—')}</td><td><span class="badge ${/rafale/.test(r.reason) ? 'ko' : 'wa'}">${esc(r.reason)}</span></td><td>${r.confirms} / ${r.denies}</td><td>${r.burst ? r.burst + ' signalements' : '—'}</td><td>${fmtDate(r.created_at)}</td><td class="actions"><button class="btn sm" data-act="focus" data-lng="${r.lng}" data-lat="${r.lat}">Voir</button>${W ? `<button class="btn sm danger" data-act="delreport" data-id="${esc(r.id)}">Supprimer</button><button class="btn sm danger" data-act="bandevice" data-device="${esc(r.device_id)}">Bannir l'appareil</button>` : ''}</td></tr>`).join('') + '</tbody>';
}

/* ---------- utilisateurs signalés ---------- */
const REASON_FR = { musique: 'Musique', propos: 'Propos', autre: 'Autre' };
const visibleRiders = () => state.riders.filter((r) => !$('riders-open-only').checked || r.is_open);
async function loadRiders() {
  state.riders = (await rpc('admin_list_user_reports')) || [];
  pruneSel('riders', state.riders.map((r) => r.rid));
  renderRiders();
}
function renderRiders() {
  const W = canWrite();
  const list = visibleRiders();
  renderBulk('riders');
  const all = list.length && W ? `<div class="msg"><input type="checkbox" data-selall="riders" aria-label="Tout sélectionner"${list.every((r) => state.sel.riders.has(r.rid)) ? ' checked' : ''}><span class="muted small">Tout sélectionner</span></div>` : '';
  $('riders-list').innerHTML = list.length ? all + list.map((r) => {
    const name = r.username || r.email || r.reported_name || 'Inconnu';
    const banned = isBanned(r);
    const who = r.user_id ? esc(r.email || '') : '<span class="muted">compte introuvable (supprimé ou jamais lié)</span>';
    const reasons = ['musique', 'propos', 'autre'].filter((k) => r[k] > 0).map((k) => `<span class="badge wa">${REASON_FR[k]} ${r[k]}</span>`).join(' ');
    const items = (r.items || []).map((i) => {
      const young = !i.fake && i.age_days != null && i.age_days < 7;
      const serial = Number(i.by_total) >= 5;
      return `<div class="item"><span class="badge">${esc(REASON_FR[i.reason] || i.reason)}</span> ${esc(i.details || '—')}<span class="muted small"> · ${i.fake ? '<span class="badge wa">FACTICE</span>' : esc(i.by || 'compte supprimé')} · ${fmtDate(i.at)}</span> ${young ? `<span class="badge wa">compte de ${esc(i.age_days)} j</span>` : ''}${serial ? `<span class="badge wa">${esc(i.by_total)} signalements émis</span>` : ''}</div>`;
    }).join('');
    const flags = (r.alert ? '<span class="badge ko">seuil atteint : avertissement envoyé à l\'utilisateur</span>' : '') + (r.burst ? '<span class="badge wa">rafale (moins d\'1 h)</span>' : '') + (r.suspect > 0 ? `<span class="badge wa">${esc(r.suspect)} signalant(s) récent(s) ou en série</span>` : '');
    const acts = [];
    if (r.user_id) acts.push(`<button type="button" class="btn sm" data-act="rider-user" data-mail="${esc(r.email)}">Fiche</button>`);
    if (W && r.user_id && !r.adm) acts.push(banned
      ? `<button type="button" class="btn sm" data-act="unban" data-id="${esc(r.user_id)}" data-name="${esc(name)}">Débannir</button>`
      : `<button type="button" class="btn sm warn" data-act="ban" data-id="${esc(r.user_id)}" data-name="${esc(name)}">Bannir</button>`);
    if (W && r.user_id) {
      acts.push(`<button type="button" class="btn sm" data-act="fake-add" data-id="${esc(r.user_id)}" data-name="${esc(name)}">+1 factice</button>`);
      if (r.fake > 0) acts.push(`<button type="button" class="btn sm" data-act="fake-clear" data-id="${esc(r.user_id)}" data-name="${esc(name)}">Retirer les factices</button>`);
    }
    if (W) {
      acts.push(`<button type="button" class="btn sm ${r.is_open ? 'ok' : ''}" data-act="rider-done" data-rid="${esc(r.rid)}" data-on="${r.is_open ? '1' : '0'}">${r.is_open ? 'Classer' : 'Rouvrir'}</button>`);
      acts.push(`<button type="button" class="btn sm danger" data-act="rider-del" data-rid="${esc(r.rid)}" data-name="${esc(name)}">Supprimer les signalements</button>`);
    }
    return `<div class="msg${state.sel.riders.has(r.rid) ? ' sel' : ''}">${W ? `<input type="checkbox" data-sel="riders" data-id="${esc(r.rid)}"${state.sel.riders.has(r.rid) ? ' checked' : ''} aria-label="Sélectionner">` : '<span></span>'}<div><div class="top"><span><strong>${esc(name)}</strong> · ${who} ${banned ? '<span class="badge ko">banni</span>' : ''}${r.adm ? ' <span class="badge ad">admin</span>' : ''}${r.is_open ? '' : ' <span class="badge ok">classé</span>'}</span><span class="muted small">dernier : ${fmtDate(r.last_at)}</span></div><div class="row mt"><span class="badge ko">${fmtInt(r.total)} signalement(s)</span>${r.fake > 0 ? `<span class="badge wa">${fmtInt(r.fake)} factice(s)</span>` : ''}${r.acct_total > r.total ? `<span class="badge ko">${fmtInt(r.acct_total)} sur le compte (tous appareils)</span>` : ''}${reasons}${flags}</div><details class="items"><summary>Voir le détail</summary>${items}</details><div class="row">${acts.join('')}</div></div></div>`;
  }).join('') : '<div class="empty">Aucun utilisateur signalé.</div>';
}
$('riders-export').addEventListener('click', () => {
  const rows = [];
  state.riders.forEach((r) => (r.items || []).forEach((i) => rows.push([r.email || r.reported_name || r.rid, r.username || '', r.acct_total, REASON_FR[i.reason] || i.reason, i.details || '', i.fake ? 'FACTICE' : (i.by || 'compte supprimé'), i.at, i.fake ? 'oui' : 'non'])));
  downloadCSV('signalements-par-utilisateur-ridenct.csv', ['compte', 'pseudo', 'signalants_distincts', 'cause', 'détail', 'signalé_par', 'date', 'factice'], rows);
});
$('riders-open-only').addEventListener('change', () => { store.set('riders.open', $('riders-open-only').checked ? '1' : '0'); renderRiders(); });

/* ---------- e-mails (fonction Edge admin-mail) ---------- */
async function mailCall(body) {
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new Error('Session expirée : reconnecte-toi.');
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/functions/v1/admin-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + data.session.access_token },
      body: JSON.stringify(body)
    });
  } catch (e) { throw new Error('Fonction admin-mail injoignable (réseau).'); }
  let d = null;
  try { d = await r.json(); } catch (e) { /* ignoré */ }
  if (r.status === 404) throw new Error('La fonction admin-mail n\'est pas déployée (voir supabase/functions/admin-mail/README.md).');
  if (!r.ok) throw new Error((d && (d.error || d.message)) || 'Erreur e-mail (' + r.status + ').');
  return d;
}
async function notifyUser(id, kind) {
  if (!state.notifyMail) return;
  try {
    await mailCall({ action: 'notice', user_id: id, kind });
    $('updated').textContent = 'E-mail envoyé à ' + hhmm();
  } catch (e) { showError({ message: 'Sanction appliquée, mais e-mail non envoyé : ' + friendly(e) }); }
}

/* ---------- santé ---------- */
const HEALTH_LVL = { ok: ['ok', 'OK'], warn: ['wa', 'À surveiller'], bad: ['ko', 'Problème'], info: ['', 'Info'] };
async function loadHealth() {
  const h = await rpc('admin_health');
  $('health-list').innerHTML = ((h && h.checks) || []).map((c) => {
    const [cls, lab] = HEALTH_LVL[c.level] || HEALTH_LVL.info;
    return `<div class="msg"><span></span><div><div class="top"><span><strong>${esc(c.label)}</strong></span><span class="badge ${cls}">${lab}</span></div><div class="body muted">${esc(c.detail)}</div></div></div>`;
  }).join('') || '<div class="empty">Aucun contrôle.</div>';
  $('health-mail').textContent = 'Vérification…';
  try {
    const st = await mailCall({ action: 'status' });
    const doms = (st.domains || []).map((d) => `<span class="badge ${d.status === 'verified' ? 'ok' : 'wa'}">${esc(d.name)} : ${esc(d.status)}</span>`).join(' ');
    const warn = st.sent_today >= st.daily_limit * 0.8 ? ' <span class="badge wa">quota du jour presque atteint</span>' : '';
    $('health-mail').innerHTML = `${doms || 'Aucun domaine.'}<div class="mt">E-mails envoyés aujourd'hui : <strong>${fmtInt(st.sent_today)}</strong> / ${fmtInt(st.daily_limit)}${warn}</div>`;
  } catch (e) { $('health-mail').innerHTML = `<span class="badge wa">Indisponible</span> ${esc(friendly(e))}`; }
}

/* ---------- avertissements (journal) ---------- */
async function loadWarnings() {
  state.warnings = (await rpc('admin_list_warnings')) || [];
  renderWarnings();
}
function renderWarnings() {
  const W = canWrite();
  const list = (state.warnings || []).filter((w) => !$('warn-unread-only').checked || !w.acknowledged_at);
  $('warnings-list').innerHTML = list.length ? list.map((w) => {
    const name = w.username || w.email || 'Compte supprimé';
    return `<div class="msg"><span></span><div><div class="top"><span><strong>${esc(name)}</strong> · ${esc(w.email || '')} · <span class="badge ${w.kind === 'admin' ? 'ad' : 'wa'}">${w.kind === 'admin' ? 'Admin' + (w.by_email ? ' (' + esc(w.by_email) + ')' : '') : 'Automatique (seuil)'}</span> ${w.acknowledged_at ? `<span class="badge ok">lu le ${fmtDate(w.acknowledged_at)}</span>` : '<span class="badge ko">non lu</span>'}</span><span class="muted small">${fmtDate(w.created_at)}</span></div><div class="body">${esc(w.message)}</div><div class="row">${w.email ? `<button type="button" class="btn sm" data-act="rider-user" data-mail="${esc(w.email)}">Fiche</button>` : ''}${W ? `<button type="button" class="btn sm danger" data-act="delwarn" data-id="${esc(w.id)}">Supprimer</button>` : ''}</div></div></div>`;
  }).join('') : '<div class="empty">Aucun avertissement.</div>';
}
$('warn-unread-only').addEventListener('change', renderWarnings);


/* ---------- textes légaux ---------- */
const LEGAL_DOCS = [['cgu', 'CGU'], ['cgv', 'CGV'], ['mentions', 'Mentions légales'], ['confidentialite', 'Confidentialité']];
const LEGAL_TYPES = { h2: 'Titre', h3: 'Sous-titre', p: 'Paragraphe', ul: 'Liste' };
const LS = { doc: 'cgu', list: [], drafts: {}, loaded: false };
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const todayFR = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
function legalNextVersion(doc) {
  /* doit être supérieure à toutes les versions connues, y compris celle embarquée dans l'app (sinon l'app l'ignore) */
  const have = LS.list.filter((x) => x.doc === doc).map((x) => x.version);
  const seed = window.LEGAL_SEED && window.LEGAL_SEED[doc]; if (seed && seed.version) have.push(seed.version);
  const base = todayISO();
  let max = -1;
  have.forEach((v) => { if (v === base) max = Math.max(max, 1); else if (v.startsWith(base + '.')) max = Math.max(max, Number(v.slice(base.length + 1)) || 0); });
  return max < 0 ? base : base + '.' + (max + 1);
}
/* sections (format de l'app : {n, t, sub?, p:[texte | {ul:[…]}]}) -> blocs à plat pour l'éditeur.
   Les anciens formats {title, body, items} restent lisibles. */
function legalToBlocks(secs) {
  const out = [];
  (Array.isArray(secs) ? secs : []).forEach((s) => {
    if (typeof s === 'string') s = { p: [s] };
    if (!s || typeof s !== 'object') return;
    const t = s.t != null ? s.t : s.title;
    const n = Number(s.n) > 0 ? s.n + '. ' : '';
    if (t) out.push({ t: (s.sub || Number(s.level) === 3) ? 'h3' : 'h2', x: n + String(t) });
    let p = s.p != null ? s.p : s.body;
    p = p == null ? [] : Array.isArray(p) ? p : String(p).split(/\n{2,}/);
    p.forEach((x) => {
      if (x && typeof x === 'object' && Array.isArray(x.ul)) out.push({ t: 'ul', x: x.ul.map((i) => String(i)).join('\n') });
      else if (String(x).trim()) out.push({ t: 'p', x: String(x).trim() });
    });
    if (Array.isArray(s.items) && s.items.length) out.push({ t: 'ul', x: s.items.map((i) => String(i)).join('\n') });
  });
  return out;
}
/* blocs -> sections au format de l'app. Un titre ouvre une section ; « 10. Litiges » donne n = 10, t = « Litiges ». */
function legalToSections(blocks) {
  const secs = [];
  let cur = null;
  const fresh = () => { cur = { n: 0, t: '', p: [] }; secs.push(cur); };
  blocks.forEach((b) => {
    const x = String(b.x || '').replace(/\r/g, '').trim();
    if (!x) return;
    if (b.t === 'h2' || b.t === 'h3') {
      fresh();
      const title = x.replace(/\n+/g, ' '), m = /^(\d{1,3})\.\s+(.+)$/.exec(title);
      if (m) { cur.n = Number(m[1]); cur.t = m[2]; } else cur.t = title;
      if (b.t === 'h3') cur.sub = true;
    } else if (b.t === 'p') {
      if (!cur) fresh();
      x.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).forEach((s) => cur.p.push(s));
    } else if (b.t === 'ul') {
      if (!cur) fresh();
      cur.p.push({ ul: x.split('\n').map((s) => s.trim()).filter(Boolean) });
    }
  });
  return secs;
}
/* mêmes limites que l'app (sinon elle ignorerait la version) : renvoie un message d'erreur ou '' */
function legalCheck(d, secs) {
  if (d.title.length > 120) return 'Titre trop long (120 caractères maximum).';
  if (d.date.length > 60) return 'Date trop longue (60 caractères maximum).';
  if (secs.length > 80) return 'Trop de sections (' + secs.length + ', maximum 80) : regroupe des paragraphes.';
  for (const s of secs) {
    if (s.t.length > 200) return 'Titre trop long : « ' + s.t.slice(0, 40) + '… » (200 caractères maximum).';
    if (s.p.length > 60) return 'Section « ' + s.t.slice(0, 40) + ' » : trop de paragraphes (' + s.p.length + ', maximum 60).';
    for (const x of s.p) {
      if (typeof x === 'string' && x.length > 20000) return 'Paragraphe trop long dans « ' + s.t.slice(0, 40) + ' ».';
      if (typeof x === 'object' && (x.ul.length > 60 || x.ul.some((i) => i.length > 5000))) return 'Liste trop longue dans « ' + s.t.slice(0, 40) + ' » (60 éléments de 5000 caractères maximum).';
    }
  }
  return '';
}
function legalDraft() {
  if (!LS.drafts[LS.doc]) LS.drafts[LS.doc] = { title: '', date: '', version: '', blocks: [], reaccept: false, from: null };
  return LS.drafts[LS.doc];
}
async function loadLegal() {
  LS.list = (await rpc('admin_list_legal')) || [];
  LS.loaded = true;
  if (!legalDraft().blocks.length && !legalDraft().title) await legalLoadVersion(LS.doc, null, true);
  renderLegal();
}
async function legalLoadVersion(doc, version, silent) {
  const row = ((await rpc('admin_get_legal', { p_doc: doc, p_version: version })) || [])[0];
  const d = LS.drafts[doc] = { title: '', date: '', version: '', blocks: [], reaccept: false, from: null };
  if (row) {
    d.title = row.title; d.date = version ? row.date_label : (row.date_label ? todayFR() : ''); d.blocks = legalToBlocks(row.sections); d.from = row.version;
  } else if (window.LEGAL_SEED && window.LEGAL_SEED[doc]) {
    const s = window.LEGAL_SEED[doc]; d.title = s.title; d.date = s.date; d.blocks = s.blocks.map((b) => ({ t: b.t, x: b.x })); d.from = 'site';
  }
  d.version = legalNextVersion(doc);
  if (!silent) renderLegal();
}
function legalImportSeed() {
  const s = window.LEGAL_SEED && window.LEGAL_SEED[LS.doc];
  if (!s) return;
  LS.drafts[LS.doc] = { title: s.title, date: s.date, version: legalNextVersion(LS.doc), blocks: s.blocks.map((b) => ({ t: b.t, x: b.x })), reaccept: false, from: 'site' };
  renderLegal();
}
function renderLegal() {
  const d = legalDraft(), W = canWrite();
  $('legal-docs').innerHTML = LEGAL_DOCS.map(([k, l]) => `<button type="button" class="btn sm${k === LS.doc ? ' active' : ''}" data-ldoc="${k}">${l}</button>`).join('');
  $('legal-title').value = d.title; $('legal-date').value = d.date; $('legal-version').value = d.version;
  $('legal-reaccept-wrap').hidden = LS.doc !== 'cgu';
  $('legal-reaccept').checked = !!d.reaccept;
  $('legal-publish').hidden = !W;
  $('legal-blocks').innerHTML = d.blocks.length ? d.blocks.map((b, i) => {
    const rows = Math.min(14, Math.max(b.t === 'h2' || b.t === 'h3' ? 1 : 2, Math.ceil(String(b.x).length / 90) + (String(b.x).match(/\n/g) || []).length));
    return `<div class="lblk ${b.t}"><select data-lsel="${i}" aria-label="Type de bloc">${Object.entries(LEGAL_TYPES).map(([k, l]) => `<option value="${k}"${k === b.t ? ' selected' : ''}>${l}</option>`).join('')}</select>` +
      `<textarea data-ltxt="${i}" rows="${rows}" aria-label="Texte"${b.t === 'ul' ? ' placeholder="Un élément par ligne"' : b.t === 'det' ? ' placeholder="Première ligne = titre de l\'encadré, puis les paragraphes (séparés par une ligne vide)"' : ''}>${esc(b.x)}</textarea>` +
      `<div class="ctl"><button type="button" class="btn sm" data-lact="up" data-i="${i}" aria-label="Monter"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="btn sm" data-lact="down" data-i="${i}" aria-label="Descendre"${i === d.blocks.length - 1 ? ' disabled' : ''}>↓</button><button type="button" class="btn sm danger" data-lact="del" data-i="${i}" aria-label="Supprimer">✕</button></div></div>`;
  }).join('') : '<div class="empty">Aucun bloc. Ajoute un titre ou un paragraphe, ou importe le texte actuel du site.</div>';
  const mine = LS.list.filter((x) => x.doc === LS.doc);
  $('legal-history').innerHTML = mine.length ? mine.map((x, i) =>
    `<div class="lver">${i === 0 ? '<span class="badge ok">en ligne</span> ' : ''}<b>${esc(x.version)}</b><div class="muted small">${fmtDate(x.published_at)} · ${fmtInt(x.n)} section(s)${x.published_by_email ? ' · ' + esc(x.published_by_email) : ''}</div><button type="button" class="btn sm mt" data-lload="${esc(x.version)}">Charger dans l'éditeur</button></div>`).join('')
    : '<div class="muted small">Aucune version en base : le site et l\'app affichent le texte intégré à leurs pages.</div>';
  const seedBox = $('legal-seed');
  seedBox.hidden = !(window.LEGAL_SEED && window.LEGAL_SEED[LS.doc]);
  seedBox.innerHTML = '<div class="small muted">Texte actuel de la page du site (version de secours) :</div><button type="button" class="btn sm mt" id="legal-import">Importer le texte actuel du site</button>';
  $('legal-import').addEventListener('click', legalImportSeed);
  $('legal-preview').hidden = true;
}
/* aperçu : même rendu que js/legal.js du site */
function legalSafeHref(h) { return /^(https?:\/\/|mailto:|tel:|#|app:[a-z]+$)/i.test(h) || /^[\w\-.\/]+(\.html)?(#[\w\-]+)?$/.test(h); }
function legalInline(parent, s) {
  s = String(s == null ? '' : s);
  const re = /\*\*([\s\S]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\n|!\[([^\]\n]*)\]\(([^)\s]+)\)/;
  while (s) {
    const m = re.exec(s);
    if (!m) { parent.appendChild(document.createTextNode(s)); break; }
    if (m.index) parent.appendChild(document.createTextNode(s.slice(0, m.index)));
    if (m[0] === '\n') parent.appendChild(document.createElement('br'));
    else if (m[5] != null) {
      if (/^img:[a-z0-9-]{1,40}$/.test(m[5])) { const sp = document.createElement('span'); sp.className = 'muted small'; sp.textContent = '[Image : ' + (m[4] || m[5].slice(4)) + ']'; parent.appendChild(sp); }
      else if (/^https:\/\/[\w\-.\/%:@]+$/i.test(m[5])) { const im = document.createElement('img'); im.setAttribute('src', m[5]); im.setAttribute('alt', m[4]); im.style.maxWidth = '100%'; im.style.display = 'block'; im.style.margin = '12px auto'; parent.appendChild(im); }
      else { const sp = document.createElement('span'); sp.className = 'muted small'; sp.textContent = '[Image : ' + (m[4] || m[5]) + ']'; parent.appendChild(sp); }
    }
    else if (m[1] != null) { const b = document.createElement('b'); legalInline(b, m[1]); parent.appendChild(b); }
    else if (legalSafeHref(m[3])) { const a = document.createElement('a'); a.setAttribute('href', m[3]); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); a.appendChild(document.createTextNode(m[2])); parent.appendChild(a); }
    else parent.appendChild(document.createTextNode(m[2]));
    s = s.slice(m.index + m[0].length);
  }
}
function legalPreview() {
  const d = legalDraft(), secs = legalToSections(d.blocks), box = $('legal-preview');
  box.textContent = '';
  const h1 = document.createElement('h1'); h1.style.fontSize = '1.4rem'; h1.textContent = d.title || '(sans titre)'; box.appendChild(h1);
  if (d.date) { const p = document.createElement('p'); p.className = 'muted small'; p.textContent = /^\d/.test(d.date) ? 'Version du ' + d.date + '.' : 'Dernière mise à jour : ' + d.date + '.'; box.appendChild(p); }
  secs.forEach((s) => {
    if (s.t) { const h = document.createElement(s.sub ? 'h3' : 'h2'); legalInline(h, (s.n > 0 ? s.n + '. ' : '') + s.t); box.appendChild(h); }
    s.p.forEach((x) => {
      if (typeof x === 'object') { const ul = document.createElement('ul'); x.ul.forEach((t) => { const li = document.createElement('li'); legalInline(li, t); ul.appendChild(li); }); box.appendChild(ul); }
      else { const p = document.createElement('p'); legalInline(p, x); box.appendChild(p); }
    });
  });
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
}
async function legalPublish() {
  const d = legalDraft();
  d.title = $('legal-title').value.trim(); d.date = $('legal-date').value.trim(); d.version = $('legal-version').value.trim();
  const secs = legalToSections(d.blocks);
  if (d.title.length < 3) throw new Error('Le titre doit faire au moins 3 caractères.');
  if (!/^\d{4}-\d{2}-\d{2}(\.\d+)?$/.test(d.version)) throw new Error('Version invalide : format AAAA-MM-JJ ou AAAA-MM-JJ.2');
  if (!secs.length) throw new Error('Le texte est vide.');
  const bad = legalCheck(d, secs); if (bad) throw new Error(bad);
  const re = LS.doc === 'cgu' && d.reaccept;
  const ok = await confirmDialog({ title: 'Publier ' + d.version + ' ?', text: 'Cette version sera visible tout de suite sur le site et dans l\'app, et ne pourra plus être modifiée.' + (re ? ' Les utilisateurs devront accepter à nouveau les CGU.' : ''), ok: 'Publier' });
  if (!ok) return;
  await rpc('admin_publish_legal', { p_doc: LS.doc, p_version: d.version, p_title: d.title, p_date: d.date, p_sections: secs });
  if (re) await rpc('admin_set_cgu_version', { p_version: d.version });
  $('updated').textContent = 'Publié à ' + hhmm();
  LS.list = (await rpc('admin_list_legal')) || [];
  d.reaccept = false; d.from = d.version; d.version = legalNextVersion(LS.doc);
  renderLegal();
}
$('legal-docs').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-ldoc]');
  if (!b) return;
  const cur = legalDraft(); cur.title = $('legal-title').value; cur.date = $('legal-date').value; cur.version = $('legal-version').value;
  LS.doc = b.dataset.ldoc;
  clearError();
  try { if (!legalDraft().blocks.length && !legalDraft().title) await legalLoadVersion(LS.doc, null, true); renderLegal(); } catch (err) { showError(err); }
});
$('pane-legal').addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = legalDraft();
  try {
    if (t.dataset.ladd) { d.blocks.push({ t: t.dataset.ladd, x: '' }); renderLegal(); const ta = $('legal-blocks').querySelectorAll('textarea'); if (ta.length) ta[ta.length - 1].focus(); }
    else if (t.dataset.lact) {
      const i = Number(t.dataset.i);
      if (t.dataset.lact === 'del') d.blocks.splice(i, 1);
      else { const j = t.dataset.lact === 'up' ? i - 1 : i + 1; if (j >= 0 && j < d.blocks.length) [d.blocks[i], d.blocks[j]] = [d.blocks[j], d.blocks[i]]; }
      renderLegal();
    } else if (t.dataset.lload) {
      clearError();
      if (!(await confirmDialog({ title: 'Charger la version ' + t.dataset.lload + ' ?', text: 'Le contenu en cours d\'édition de ce document sera remplacé.', ok: 'Charger' }))) return;
      await legalLoadVersion(LS.doc, t.dataset.lload);
    } else if (t.id === 'legal-preview-btn') { d.title = $('legal-title').value; d.date = $('legal-date').value; legalPreview(); }
    else if (t.id === 'legal-publish') { clearError(); await legalPublish(); }
  } catch (err) { showError(err); }
});
$('legal-blocks').addEventListener('input', (e) => {
  const ta = e.target.closest('textarea[data-ltxt]');
  if (ta) legalDraft().blocks[Number(ta.dataset.ltxt)].x = ta.value;
});
$('legal-blocks').addEventListener('change', (e) => {
  const s = e.target.closest('select[data-lsel]');
  if (s) { legalDraft().blocks[Number(s.dataset.lsel)].t = s.value; renderLegal(); }
});
$('legal-reaccept').addEventListener('change', () => { legalDraft().reaccept = $('legal-reaccept').checked; });
['legal-title', 'legal-date', 'legal-version'].forEach((id) => $(id).addEventListener('input', () => {
  const d = legalDraft(); d.title = $('legal-title').value; d.date = $('legal-date').value; d.version = $('legal-version').value;
}));

/* ---------- questionnaire du site ---------- */
const SURVEY_LABELS = {
  usage: 'Usage de la moto', frequence: 'Fréquence de sortie', route: 'Type de routes', style: 'Style de conduite', permis: 'Permis',
  avec_qui: 'Avec qui roulent-ils', apps: 'Applis utilisées aujourd\'hui', navigation: 'Navigation : ce qu\'ils veulent', communication: 'Communication en roulant',
  audio: 'Musique / audio', intercom: 'Intéressés par un intercom', services: 'Services qui les attirent', agacements: 'Ce qui agace dans les apps actuelles',
  plus_utiles: 'Fonctions les plus utiles', indispensables: 'Indispensables', payer: 'Prêts à payer ?', beta: 'Intéressés par la bêta'
};
const surveyLabel = (k) => SURVEY_LABELS[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const surveyVal = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
state.survey = { view: store.get('survey.view', 'stats'), version: '', stats: null, list: [] };
async function loadSurvey() {
  const S = state.survey;
  const v = S.version || null;
  const [stats, list] = await Promise.all([rpc('admin_survey_overview', { p_survey: v }), rpc('admin_list_survey', { p_survey: v })]);
  S.stats = stats || { total: 0, questions: [], surveys: [] };
  S.list = list || [];
  const sel = $('survey-version');
  const versions = (S.stats.surveys || []).map((x) => x.survey);
  sel.innerHTML = '<option value="">Toutes les versions</option>' + versions.map((x) => `<option value="${esc(x)}"${x === S.version ? ' selected' : ''}>Version ${esc(x)}</option>`).join('');
  renderSurvey();
}
function renderSurvey() {
  const S = state.survey, st = S.stats || { total: 0, questions: [] };
  document.querySelectorAll('#survey-view button').forEach((b) => b.classList.toggle('active', b.dataset.view === S.view));
  $('survey-stats').hidden = S.view !== 'stats';
  $('survey-list').hidden = S.view !== 'list';
  $('survey-count').textContent = '(' + fmtInt(st.total) + ')';
  const payer = (st.questions || []).find((q) => q.key === 'payer');
  let ready = '—';
  if (payer && payer.n) {
    const yes = (payer.values || []).filter((x) => !/^non/i.test(x.v)).reduce((s, x) => s + Number(x.n), 0);
    ready = Math.round(100 * yes / payer.n) + ' %';
  }
  $('survey-cards').innerHTML =
    `<div class="card"><div class="k">Réponses</div><div class="v">${fmtInt(st.total)}</div></div>` +
    `<div class="card"><div class="k">Avec e-mail</div><div class="v">${fmtInt(st.with_email)}</div></div>` +
    `<div class="card"><div class="k">Prêts à payer (oui ou peut-être)</div><div class="v teal">${esc(ready)}</div></div>` +
    `<div class="card"><div class="k">Dernière réponse</div><div class="v" style="font-size:18px">${fmtDate(st.last)}</div></div>`;
  $('survey-stats').innerHTML = st.total ? (st.questions || []).map((q) => {
    const max = Math.max(...q.values.map((x) => Number(x.n)), 1);
    return `<div class="sq"><h3>${esc(surveyLabel(q.key))} <span class="muted small">· ${fmtInt(q.n)} réponse(s)</span></h3>` +
      q.values.slice(0, 12).map((x) => `<div class="sr"><span title="${esc(x.v)}">${esc(x.v)}</span><div class="sbar"><i style="width:${Math.round(100 * Number(x.n) / max)}%"></i></div><span class="muted">${fmtInt(x.n)} · ${Math.round(100 * Number(x.n) / q.n)} %</span></div>`).join('') +
      (q.values.length > 12 ? `<div class="muted small">+ ${q.values.length - 12} autre(s) valeur(s)</div>` : '') + '</div>';
  }).join('') : '<div class="empty">Aucune réponse pour l\'instant.</div>';
  const W = canWrite();
  $('survey-list').innerHTML = S.list.length ? S.list.map((r) => {
    const a = r.answers || {};
    const keys = Object.keys(a);
    const head = ['usage', 'frequence', 'payer'].filter((k) => a[k] != null).map((k) => `<span class="muted small">${esc(surveyLabel(k))}</span> ${esc(surveyVal(a[k]))}`).join(' · ');
    const tags = (Array.isArray(a.indispensables) ? a.indispensables : []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="msg sresp"><span></span><div><div class="top"><span><span class="badge">${esc(r.survey)}</span> <strong>${r.contact_email ? esc(r.contact_email) : '<span class="muted">anonyme</span>'}</strong></span><span class="muted small">${fmtDate(r.created_at)}</span></div>` +
      `<div>${head}</div><div>${tags}</div>` +
      `<details class="mt"><summary class="muted small">Toutes les réponses (${keys.length})</summary><dl>${keys.map((k) => `<dt>${esc(surveyLabel(k))}</dt><dd>${esc(surveyVal(a[k]))}</dd>`).join('')}</dl></details>` +
      `<div class="row">${r.contact_email && validMail(r.contact_email) ? `<a class="btn sm" href="mailto:${esc(r.contact_email)}">Écrire</a>` : ''}${W ? `<button type="button" class="btn sm danger" data-act="delsurvey" data-id="${esc(r.id)}">Supprimer</button>` : ''}</div></div></div>`;
  }).join('') : '<div class="empty">Aucune réponse pour l\'instant.</div>';
}
$('survey-view').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  state.survey.view = b.dataset.view;
  store.set('survey.view', b.dataset.view);
  renderSurvey();
});
$('survey-version').addEventListener('change', async (e) => { state.survey.version = e.target.value; clearError(); try { await loadSurvey(); } catch (err) { showError(err); } });
$('survey-export').addEventListener('click', () => {
  const rows = state.survey.list;
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.answers || {})))];
  downloadCSV('questionnaire-ridenct.csv', ['date', 'version', 'email'].concat(keys.map(surveyLabel)),
    rows.map((r) => [r.created_at, r.survey, r.contact_email || ''].concat(keys.map((k) => surveyVal((r.answers || {})[k])))));
});

/* ---------- circuits communautaires ---------- */
const LEVEL_FR = { balade: 'Balade', dynamique: 'Dynamique', fifou: 'Fifou' };
function decodePolyline(s) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (let k = 0; k < 2; k++) {
      let r = 0, sh = 0, b;
      do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32 && i < s.length + 1);
      const dlt = r & 1 ? ~(r >> 1) : r >> 1;
      if (k === 0) lat += dlt; else lng += dlt;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
function routeSvg(pts) {
  let p;
  try { p = decodePolyline(String(pts || '')); } catch (e) { p = []; }
  if (p.length < 2) return '<span class="muted">Trace illisible.</span>';
  const step = Math.max(1, Math.ceil(p.length / 600));
  p = p.filter((_, i) => i % step === 0 || i === p.length - 1);
  const lats = p.map((x) => x[0]), lngs = p.map((x) => x[1]);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
  const k = Math.cos(((minLa + maxLa) / 2) * Math.PI / 180);
  const w = Math.max((maxLn - minLn) * k, 1e-6), h = Math.max(maxLa - minLa, 1e-6);
  const W = 500, H = 220, pad = 14, sc = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
  const ox = (W - w * sc) / 2, oy = (H - h * sc) / 2;
  const X = (ln) => (ox + (ln - minLn) * k * sc).toFixed(1), Y = (la) => (oy + (maxLa - la) * sc).toFixed(1);
  const d = p.map((x, i) => (i ? 'L' : 'M') + X(x[1]) + ' ' + Y(x[0])).join('');
  const a = p[0], b = p[p.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tracé du circuit"><path d="${d}" fill="none" stroke="#1fb5a0" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(a[1])}" cy="${Y(a[0])}" r="5" fill="#f08a24"/><circle cx="${X(b[1])}" cy="${Y(b[0])}" r="5" fill="#e5534b"/></svg><div class="muted small">Départ en orange, arrivée en rouge · ${fmtInt(p.length)} points</div>`;
}
state.routes = [];
async function loadRoutes() {
  state.routes = (await rpc('admin_list_routes')) || [];
  const sel = $('routes-region'), cur = sel.value;
  const regions = [...new Set(state.routes.map((r) => r.region))].sort();
  sel.innerHTML = '<option value="">Toutes régions</option>' + regions.map((x) => `<option value="${esc(x)}"${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');
  renderRoutes();
}
function visibleRoutes() {
  const q = norm($('routes-search').value), reg = $('routes-region').value, lvl = $('routes-level').value, flag = $('routes-flag-only').checked;
  return state.routes.filter((r) => (!flag || r.reports > 0) && (!reg || r.region === reg) && (!lvl || r.level === lvl)
    && (!q || norm(r.title + ' ' + (r.author || '') + ' ' + (r.email || '')).includes(q)));
}
const hm = (min) => (min >= 60 ? Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') : min + ' min');
function renderRoutes() {
  const all = state.routes, list = visibleRoutes(), W = canWrite();
  const flagged = all.filter((r) => r.reports > 0).length;
  $('routes-cards').innerHTML =
    `<div class="card"><div class="k">Circuits publiés</div><div class="v">${fmtInt(all.length)}</div></div>` +
    `<div class="card"><div class="k">Signalés</div><div class="v ${flagged ? 'orange' : ''}">${fmtInt(flagged)}</div></div>` +
    `<div class="card"><div class="k">Téléchargements</div><div class="v">${fmtInt(all.reduce((s, r) => s + Number(r.downloads || 0), 0))}</div></div>` +
    `<div class="card"><div class="k">Auteurs</div><div class="v">${fmtInt(new Set(all.map((r) => r.user_id)).size)}</div></div>`;
  $('routes-list').innerHTML = list.length ? list.map((r) => {
    const acts = [`<button type="button" class="btn sm" data-act="route-view" data-id="${esc(r.id)}">Voir la trace</button>`];
    if (r.email) acts.push(`<button type="button" class="btn sm" data-act="rider-user" data-mail="${esc(r.email)}">Fiche auteur</button>`);
    if (W && r.reports > 0) acts.push(`<button type="button" class="btn sm" data-act="route-clear" data-id="${esc(r.id)}">Ignorer</button>`);
    if (W) acts.push(`<button type="button" class="btn sm danger" data-act="route-del" data-id="${esc(r.id)}" data-name="${esc(r.title)}">Supprimer</button>`);
    return `<div class="msg"><span></span><div><div class="top"><span>${r.reports > 0 ? `<span class="badge ko">${fmtInt(r.reports)} signalement(s)</span> ` : ''}<strong>${esc(r.title)}</strong></span><span class="muted small">${fmtDate(r.created_at)}</span></div>` +
      `<div class="muted small">${esc(r.author || '?')} · ${esc(r.region)} · ${esc(LEVEL_FR[r.level] || r.level)} · ${(r.dist_m / 1000).toFixed(0)} km · ${hm(r.dur_min)} · ${fmtInt(r.downloads)} téléchargement(s)</div>` +
      (r.description ? `<div class="small">${esc(r.description)}</div>` : '') +
      `<div class="row mt">${acts.join('')}</div><div class="rt-view" id="rt-${esc(r.id)}" hidden></div></div></div>`;
  }).join('') : '<div class="empty">Aucun circuit.</div>';
}
['routes-search', 'routes-region', 'routes-level', 'routes-flag-only'].forEach((id) => $(id).addEventListener(id === 'routes-search' ? 'input' : 'change', renderRoutes));
$('routes-export').addEventListener('click', () => {
  downloadCSV('circuits-ridenct.csv', ['titre', 'auteur', 'e-mail', 'région', 'niveau', 'distance_km', 'durée_min', 'téléchargements', 'signalements', 'publié'],
    visibleRoutes().map((r) => [r.title, r.author, r.email || '', r.region, r.level, (r.dist_m / 1000).toFixed(1), r.dur_min, r.downloads, r.reports, r.created_at]));
});

/* ---------- boîte contact@ ---------- */
async function loadMail() {
  $('mail-view').hidden = true;
  try {
    const r = await mailCall({ action: 'inbox' });
    state.mail = r.emails || [];
    $('mail-list').innerHTML = state.mail.length ? state.mail.map((m) =>
      `<div class="msg"><span></span><div><div class="top"><span><strong>${esc(m.from)}</strong> · ${esc(m.subject || '(sans objet)')}${m.attachments ? ` <span class="badge">${esc(m.attachments)} pièce(s) jointe(s)</span>` : ''}</span><span class="muted small">${fmtDate(m.created_at)}</span></div><div class="row"><button type="button" class="btn sm" data-act="mail-open" data-id="${esc(m.id)}">Ouvrir</button></div></div></div>`).join('')
      : '<div class="empty">Boîte vide.</div>';
  } catch (e) {
    $('mail-list').innerHTML = '<div class="empty">Boîte indisponible.</div>';
    throw e;
  }
}
$('mail-refresh').addEventListener('click', async () => { clearError(); try { await loadMail(); } catch (e) { showError(e); } });
async function openMail(id) {
  const m = await mailCall({ action: 'message', id });
  const W = canWrite();
  const doc = m.html
    ? '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:"><base target="_blank">' + m.html
    : '<pre style="white-space:pre-wrap;font-family:sans-serif">' + esc(m.text || '(message vide)') + '</pre>';
  const box = $('mail-view');
  box.hidden = false;
  box.innerHTML = `<h2>${esc(m.subject || '(sans objet)')}</h2><p class="muted small">De ${esc(m.from)} · ${fmtDate(m.created_at)}</p><iframe id="mail-frame" sandbox="" style="width:100%;height:320px;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe>` +
    (W ? `<textarea id="mail-reply-text" class="mt" rows="5" maxlength="5000" placeholder="Ta réponse (envoyée depuis contact@ridenct.fr)"></textarea><div class="row mt"><button type="button" class="btn primary" data-act="mail-reply" data-id="${esc(m.id)}">Envoyer la réponse</button></div>` : '');
  $('mail-frame').srcdoc = doc;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- annonce par e-mail ---------- */
async function loadMailing() {
  const [w, u] = await Promise.all([rpc('admin_mail_count', { p_group: 'waitlist' }), rpc('admin_mail_count', { p_group: 'users' })]);
  const sel = $('mailing-group');
  sel.options[0].textContent = `Liste d'attente (${fmtInt(w)})`;
  sel.options[1].textContent = `Utilisateurs inscrits, comptes actifs (${fmtInt(u)})`;
  $('mailing-send').disabled = !canWrite();
}
$('mailing-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  try {
    const group = $('mailing-group').value;
    const n = await rpc('admin_mail_count', { p_group: group });
    if (!n) { showError({ message: 'Aucun destinataire dans ce groupe.' }); return; }
    if (!(await confirmDialog({ title: 'Envoyer cette annonce à ' + n + ' destinataire(s) ?', text: 'L\'envoi est immédiat et ne peut pas être annulé.', ok: 'Envoyer' }))) return;
    const r = await mailCall({ action: 'mailing', group, subject: $('mailing-subject').value.trim(), text: $('mailing-text').value.trim() });
    $('mailing-subject').value = '';
    $('mailing-text').value = '';
    $('updated').textContent = (r.sent || n) + ' e-mail(s) envoyé(s) à ' + hhmm();
  } catch (err) { showError(err); }
});

/* ---------- coffre ---------- */
let vaultTimers = new Map();
function vaultHide(id) {
  const t = vaultTimers.get(id);
  if (t) { clearTimeout(t); vaultTimers.delete(id); }
  const box = document.querySelector(`[data-vault-val="${CSS.escape(id)}"]`);
  if (box) { box.textContent = ''; box.hidden = true; }
}
function vaultClearAll() { [...vaultTimers.keys()].forEach(vaultHide); }
async function loadVault() {
  vaultClearAll();
  const W = canWrite();
  $('vault-form').hidden = !W;
  state.vault = (await rpc('admin_vault_list')) || [];
  $('vault-list').innerHTML = state.vault.length ? state.vault.map((v) =>
    `<div class="msg"><span></span><div><div class="top"><span><strong>${esc(v.label)}</strong> · <span class="badge ad">${esc(v.service)}</span></span><span class="muted small">${v.last_revealed_at ? 'consulté le ' + fmtDate(v.last_revealed_at) : 'jamais consulté'}</span></div>${v.note ? `<div class="body muted">${esc(v.note)}</div>` : ''}<div class="row"><code data-vault-val="${esc(v.id)}" hidden style="user-select:all;word-break:break-all"></code></div><div class="row"><button type="button" class="btn sm" data-act="vault-show" data-id="${esc(v.id)}">Afficher</button><button type="button" class="btn sm" data-act="vault-copy" data-id="${esc(v.id)}">Copier</button>${W ? `<button type="button" class="btn sm" data-act="vault-edit" data-id="${esc(v.id)}">Modifier</button><button type="button" class="btn sm danger" data-act="vault-del" data-id="${esc(v.id)}" data-name="${esc(v.label)}">Supprimer</button>` : ''}</div></div></div>`).join('')
    : '<div class="empty">Coffre vide.</div>';
}
function vaultResetForm() {
  $('vault-id').value = '';
  $('vault-form').reset();
  $('vault-cancel').hidden = true;
  $('vault-secret').required = true;
}
$('vault-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  try {
    await rpc('admin_vault_save', { p_id: $('vault-id').value || null, p_label: $('vault-label').value, p_service: $('vault-service').value, p_note: $('vault-note').value, p_secret: $('vault-secret').value });
    vaultResetForm();
    $('updated').textContent = 'Enregistré à ' + hhmm();
    await loadVault();
  } catch (err) { showError(err); }
});
$('vault-cancel').addEventListener('click', vaultResetForm);
$('vault-secret').required = true;
window.addEventListener('hashchange', vaultClearAll);

/* ---------- appareils bannis ---------- */
async function loadDevices() {
  state.devices = (await rpc('admin_list_banned_devices')) || [];
  $('device-add-panel').hidden = !canWrite();
  renderDevices();
}
function renderDevices() {
  const W = canWrite();
  const list = sortList('devices', state.devices);
  $('devices-table').innerHTML = list.length
    ? '<thead><tr>' + th('devices', 'device', 'Appareil') + '<th>Motif</th>' + th('devices', 'reports', 'Signalements restants') + th('devices', 'created', 'Banni le') + th('devices', 'by', 'Par') + '<th></th></tr></thead><tbody>' +
      list.map((d) => `<tr><td><code>${esc(d.device_id)}</code></td><td class="wrap">${esc(d.reason || '—')}</td><td>${fmtInt(d.reports)}</td><td>${fmtDate(d.created_at)}</td><td>${esc(d.banned_by_email || '—')}</td><td class="actions">${W ? `<button class="btn sm" data-act="unbandevice" data-device="${esc(d.device_id)}">Débannir</button>` : ''}</td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Aucun appareil banni.</td></tr></tbody>';
}
$('device-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const id = $('device-id').value.trim();
  const reason = $('device-reason').value.trim();
  if (await banDevice(id, reason)) { $('device-id').value = ''; $('device-reason').value = ''; }
});

/* ---------- maintenance ---------- */
async function loadMaintenance() {
  const [s, storage] = await Promise.all([rpc('admin_stats'), rpc('admin_storage')]);
  applyStats(s);
  const W = canWrite();
  const limit = Number(s.db_limit_mb || 0) * 1048576;
  $('maint-cards').innerHTML =
    card('Taille base', fmtBytes(s.db_bytes) + (limit ? ' / ' + fmtInt(s.db_limit_mb) + ' Mo' : '')) +
    card('Signalements expirés', fmtInt(s.reports_expired), s.reports_expired > 0 ? 'orange' : '') +
    card('Journal anti-spam', fmtInt(s.rate_events));
  const item = (label, count, kind, days, btn, tone) =>
    `<div class="kv"><span>${esc(label)} <span class="muted">(${fmtInt(count)})</span></span>${W ? `<button class="btn sm ${tone}" data-act="purge" data-kind="${kind}" data-days="${days}" data-label="${esc(label)}">${esc(btn)}</button>` : ''}</div>`;
  $('purge-list').innerHTML =
    item('Signalements expirés', s.reports_expired, 'expired_reports', 0, 'Purger', 'warn') +
    item('Journal anti-spam de plus d\'un jour', s.rate_events_old, 'rate_events', 1, 'Purger', 'warn') +
    item('Tout le journal anti-spam', s.rate_events, 'rate_events', 0, 'Vider', 'danger');
  if (!$('purge-result').textContent) $('purge-result').textContent = 'L\'espace disque est récupéré progressivement par Postgres (nettoyage automatique), pas instantanément.';
  $('storage-table').innerHTML = '<thead><tr><th>Table</th><th>Lignes (approx.)</th><th>Taille</th></tr></thead><tbody>' +
    (storage || []).map((r) => `<tr><td>${esc(r.tbl)}</td><td>${fmtInt(r.approx_rows)}</td><td>${fmtBytes(r.bytes)}</td></tr>`).join('') + '</tbody>';
}
async function loadAutoSettings() {
  const cfg = await rpc('admin_get_settings');
  const W = canWrite();
  $('set-auto').checked = !!cfg.auto_purge;
  $('set-reports-days').value = cfg.purge_reports_days;
  $('set-rate-days').value = cfg.purge_rate_days;
  $('set-limit').value = cfg.db_limit_mb;
  ['set-auto', 'set-reports-days', 'set-rate-days', 'set-limit', 'settings-save'].forEach((id) => { $(id).disabled = !W; });
  $('cron-state').textContent = !cfg.cron_available ? 'pg_cron indisponible : la purge automatique ne tournera pas.'
    : cfg.cron_scheduled ? 'Tâche planifiée chaque nuit à 03:30 UTC' + (cfg.auto_purge ? ', active.' : ', désactivée (case non cochée).')
    : 'pg_cron présent mais la tâche n\'est pas planifiée : rejoue admin_setup.sql.';
}
async function loadBackup() {
  const W = canWrite();
  $('backup-btn').hidden = !W;
  $('backup-note').hidden = W;
  const [cfg, list] = await Promise.all([rpc('admin_get_settings'), rpc('admin_list_backups')]);
  $('auto-backup').checked = !!cfg.auto_backup;
  $('auto-backup').disabled = !W;
  $('backup-take').disabled = !W;
  $('backup-cron-note').textContent = !cfg.cron_available ? 'pg_cron indisponible : pas de sauvegarde automatique.' : cfg.backup_scheduled ? 'Tâche planifiée.' : 'Tâche non planifiée : rejoue admin_setup.sql.';
  $('backups-table').innerHTML = (list || []).length
    ? '<thead><tr><th>Date</th><th>Type</th><th>Taille</th><th></th></tr></thead><tbody>' +
      list.map((b) => `<tr><td>${fmtDate(b.created_at)}</td><td>${b.kind === 'auto' ? 'automatique' : 'manuelle'}</td><td>${fmtBytes(b.bytes)}</td><td class="actions">${W ? `<button class="btn sm" data-act="dl-backup" data-id="${esc(b.id)}" data-date="${esc(String(b.created_at).slice(0, 10))}">Télécharger</button>` : ''}</td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Aucune sauvegarde stockée.</td></tr></tbody>';
}
$('auto-backup').addEventListener('change', async (e) => {
  clearError();
  try { await rpc('admin_set_auto_backup', { p_on: e.target.checked }); } catch (err) { e.target.checked = !e.target.checked; showError(err); }
});
$('backup-take').addEventListener('click', async () => {
  clearError();
  try { await rpc('admin_take_backup'); await loadBackup(); } catch (err) { showError(err); }
});
$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  try {
    await rpc('admin_set_settings', {
      p_auto_purge: $('set-auto').checked,
      p_reports_days: Number($('set-reports-days').value) || 0,
      p_rate_days: Number($('set-rate-days').value) || 0,
      p_db_limit_mb: Number($('set-limit').value) || 500
    });
    await loadAutoSettings();
    quietStats();
    $('updated').textContent = 'Enregistré à ' + hhmm();
  } catch (err) { showError(err); }
});
$('backup-btn').addEventListener('click', async () => {
  clearError();
  try {
    const data = await rpc('admin_backup');
    downloadBlob('sauvegarde-ridenct-' + isoDay(0) + '.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  } catch (err) { showError(err); }
});

/* ---------- messages et liste d'attente ---------- */
const visibleMessages = () => state.messages.filter((m) => !$('msg-open-only').checked || !m.handled);
function renderMessages() {
  const W = canWrite();
  const list = visibleMessages();
  renderBulk('msgs');
  const all = list.length && W ? `<div class="msg"><input type="checkbox" data-selall="msgs" aria-label="Tout sélectionner"${list.every((m) => state.sel.msgs.has(m.id)) ? ' checked' : ''}><span class="muted small">Tout sélectionner</span></div>` : '';
  $('messages-list').innerHTML = list.length
    ? all + list.map((m) => `<div class="msg${state.sel.msgs.has(m.id) ? ' sel' : ''}">${W ? `<input type="checkbox" data-sel="msgs" data-id="${esc(m.id)}"${state.sel.msgs.has(m.id) ? ' checked' : ''} aria-label="Sélectionner">` : '<span></span>'}<div><div class="top"><span><strong>${esc(m.name)}</strong> · ${esc(m.email)} · <span class="badge">${esc(m.topic)}</span>${m.handled ? ' <span class="badge ok">traité</span>' : ''}</span><span class="muted small">${fmtDate(m.created_at)}</span></div><div class="body">${esc(m.message)}</div><div class="row">${validMail(m.email) ? `<a class="btn sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + m.topic)}">Répondre</a>` : ''}${W ? `<button class="btn sm ${m.handled ? '' : 'ok'}" data-act="handled" data-id="${esc(m.id)}" data-on="${m.handled ? '0' : '1'}">${m.handled ? 'Rouvrir' : 'Marquer traité'}</button><button class="btn sm danger" data-act="delmsg" data-id="${esc(m.id)}">Supprimer</button>` : ''}</div></div></div>`).join('')
    : '<div class="empty">Aucun message.</div>';
}
function renderWaitlist() {
  const W = canWrite();
  const list = sortList('waitlist', state.waitlist);
  $('waitlist-table').innerHTML = list.length
    ? '<thead><tr>' + th('waitlist', 'email', 'E-mail') + th('waitlist', 'source', 'Source') + th('waitlist', 'created', 'Date') + '<th></th></tr></thead><tbody>' +
      list.map((w) => `<tr><td>${esc(w.email)}</td><td>${esc(w.source)}</td><td>${fmtDate(w.created_at)}</td><td class="actions">${W ? `<button class="btn sm danger" data-act="delwait" data-id="${esc(w.id)}">Supprimer</button>` : ''}</td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Liste d\'attente vide.</td></tr></tbody>';
}
async function loadMessages() {
  const [msgs, wl] = await Promise.all([rpc('admin_list_messages'), rpc('admin_list_waitlist')]);
  state.messages = msgs || [];
  state.waitlist = wl || [];
  pruneSel('msgs', state.messages.map((m) => m.id));
  renderMessages();
  renderWaitlist();
}
$('msg-open-only').addEventListener('change', () => { store.set('msg.open', $('msg-open-only').checked ? '1' : '0'); renderMessages(); });
$('export-waitlist').addEventListener('click', () => {
  downloadCSV('liste-attente-ridenct.csv', ['email', 'source', 'date'], state.waitlist.map((w) => [w.email, w.source, w.created_at]));
});

/* ---------- pseudos bloqués ---------- */
async function loadModeration() {
  state.terms = (await rpc('admin_list_terms')) || [];
  $('term-form').hidden = !canWrite();
  renderTerms();
}
function renderTerms() {
  const f = $('term-filter').value.trim().toLowerCase();
  const W = canWrite();
  const list = state.terms.filter((t) => !f || t.term.includes(f));
  $('terms-list').innerHTML = list.length
    ? list.map((t) => `<span class="chip ${esc(t.mode)}" title="${t.mode === 'exact' ? 'exact' : 'contient'}">${esc(t.term)}${W ? `<button data-act="rmterm" data-id="${esc(t.term)}" aria-label="Retirer">×</button>` : ''}</span>`).join('')
    : '<span class="muted">Aucun terme.</span>';
}
$('term-filter').addEventListener('input', renderTerms);
$('term-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  try {
    await rpc('admin_add_term', { p_term: $('term-input').value, p_mode: $('term-mode').value });
    $('term-input').value = '';
    await loadModeration();
  } catch (err) { showError(err); }
});

/* ---------- journal ---------- */
const ACTION_FR = {
  'texte_légal_publié': 'Texte légal publié',
  'circuit_supprimé': 'Circuit supprimé', 'signalements_circuit_effacés': 'Signalements de circuit effacés',
  'réponse_questionnaire_supprimée': 'Réponse questionnaire supprimée',
  'bannissement': 'Bannissement', 'débannissement': 'Débannissement', 'suppression_compte': 'Suppression de compte',
  'abonnement_offert': 'Abonnement offert', 'abonnement_offert_retiré': 'Abonnement offert retiré',
  'admin_déclaré': 'Admin déclaré', 'admin_retiré': 'Admin retiré', 'signalement_supprimé': 'Signalement supprimé',
  'signalements_appareil_supprimés': 'Signalements d\'un appareil supprimés', 'zone_purgée': 'Zone purgée',
  'purge': 'Purge', 'purge_auto': 'Purge automatique', 'sauvegarde_exportée': 'Sauvegarde exportée',
  'message_supprimé': 'Message supprimé', 'attente_supprimé': 'Liste d\'attente : retrait',
  'terme_bloqué_ajouté': 'Terme bloqué ajouté', 'terme_bloqué_retiré': 'Terme bloqué retiré',
  'mfa_obligatoire': '2FA obligatoire', 'reglages': 'Réglages',
  'appareil_banni': 'Appareil banni', 'appareil_débanni': 'Appareil débanni',
  'auto_ban_signalements': 'Bannissement automatique (signalements)',
  'signalement_utilisateur_traité': 'Utilisateur signalé : classé', 'signalement_utilisateur_rouvert': 'Utilisateur signalé : rouvert',
  'signalements_utilisateur_supprimés': 'Signalements d\'un utilisateur supprimés',
  'abonnement_retiré': 'Abonnement retiré', 'abonnement_retiré_auto': 'Abonnement retiré automatiquement (signalements)', 'coffre_ajouté': 'Coffre : entrée ajoutée', 'coffre_modifié': 'Coffre : entrée modifiée', 'coffre_consulté': 'Coffre : valeur consultée', 'coffre_supprimé': 'Coffre : entrée supprimée', 'avertissement_supprimé': 'Avertissement supprimé', 'export_donnees': 'Export des données d\'un compte', 'email_envoyé': 'E-mail envoyé', 'annonce_email': 'Annonce par e-mail', 'avertissement_signalements': 'Avertissement automatique (seuil de signalements)', 'avertissement_envoyé': 'Avertissement envoyé', 'abonnement_banni_auto': 'Abonnement banni automatiquement (signalements)', 'abonnement_banni': 'Abonnement banni', 'abonnement_rétabli': 'Abonnement rétabli', 'signalement_factice_ajouté': 'Signalement factice ajouté', 'signalements_factices_supprimés': 'Signalements factices supprimés', 'maintenance_activée': 'Maintenance activée', 'maintenance_désactivée': 'Maintenance désactivée',
  'annonce_enregistrée': 'Annonce enregistrée', 'annonce_supprimée': 'Annonce supprimée',
  'code_promo_créé': 'Code promo créé', 'code_promo_activé': 'Code promo activé', 'code_promo_désactivé': 'Code promo désactivé',
  'code_promo_supprimé': 'Code promo supprimé', 'code_promo_utilisé': 'Code promo utilisé', 'sauvegarde_stockée': 'Sauvegarde stockée'
};
async function loadAudit() {
  state.audit = (await rpc('admin_list_audit', { p_limit: 1000 })) || [];
  const sel = $('audit-action');
  const cur = sel.value || store.get('audit.action', '');
  const actions = [...new Set(state.audit.map((a) => a.action))].sort();
  sel.innerHTML = '<option value="">Toutes les actions</option>' + actions.map((a) => `<option value="${esc(a)}">${esc(ACTION_FR[a] || a)}</option>`).join('');
  sel.value = actions.includes(cur) ? cur : '';
  renderAudit();
}
function renderAudit() {
  const f = norm($('audit-filter').value.trim());
  const act = $('audit-action').value;
  const list = sortList('audit', state.audit.filter((a) => (!act || a.action === act) && (!f || norm([a.admin_email, a.action, ACTION_FR[a.action], a.target, a.details].join(' ')).includes(f))));
  $('audit-table').innerHTML = list.length
    ? '<thead><tr>' + th('audit', 'created', 'Date') + th('audit', 'admin', 'Admin') + th('audit', 'action', 'Action') + th('audit', 'target', 'Cible') + '<th>Détails</th></tr></thead><tbody>' +
      list.map((a) => `<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.admin_email || 'système')}</td><td>${esc(ACTION_FR[a.action] || a.action)}</td><td class="wrap">${esc(a.target || '—')}</td><td class="wrap">${esc(a.details || '—')}</td></tr>`).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Aucune action enregistrée.</td></tr></tbody>';
}
$('audit-filter').addEventListener('input', renderAudit);
$('audit-action').addEventListener('change', () => { store.set('audit.action', $('audit-action').value); renderAudit(); });

/* tri : clic sur un en-tête */
document.addEventListener('click', (e) => {
  const h = e.target.closest('th[data-sort]');
  if (!h) return;
  const [name, key] = h.dataset.sort.split(':');
  const [k, d] = getSort(name);
  sortState[name] = [key, k === key && d === 'asc' ? 'desc' : k === key ? 'asc' : (key === 'created' || key === 'login' || key === 'reports' || key === 'burst' ? 'desc' : 'asc')];
  store.set('sort', JSON.stringify(sortState));
  RERENDER[name]();
});

/* ---------- sécurité (2FA) ---------- */
async function loadSecurity() {
  const st = await rpc('admin_security_state');
  const { data: f } = await sb.auth.mfa.listFactors();
  const verified = ((f && f.all) || []).filter((x) => x.factor_type === 'totp' && x.status === 'verified');
  $('mfa-status').innerHTML =
    kv('Rôle', st.role === 'admin' ? 'admin complet' : 'support (lecture seule)') +
    kv('Session', st.aal === 'aal2' ? 'code 2FA validé' : 'mot de passe seul') +
    kv('2FA', verified.length ? 'activée' : 'non activée');
  $('mfa-actions').innerHTML = verified.length
    ? `<button class="btn danger" data-act="mfa-remove" data-id="${esc(verified[0].id)}">Retirer la 2FA</button>`
    : '<button class="btn primary" data-act="mfa-enroll">Activer la 2FA</button>';
  $('mfa-enroll').hidden = true;
  $('require-mfa').checked = !!st.require_mfa;
  $('require-mfa').disabled = st.role !== 'admin';
}
async function startEnroll() {
  const { data: f } = await sb.auth.mfa.listFactors();
  for (const x of ((f && f.all) || [])) {
    if (x.factor_type === 'totp' && x.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: x.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'RideNCT admin ' + isoDay(0) });
  if (error) throw error;
  state.enrollId = data.id;
  $('mfa-qr').src = data.totp.qr_code;
  $('mfa-secret').textContent = data.totp.secret;
  $('mfa-verify-code').value = '';
  $('mfa-enroll').hidden = false;
}
$('mfa-verify-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: state.enrollId, code: $('mfa-verify-code').value.trim() });
  if (error) { showError({ message: 'Code invalide ou expiré.' }); return; }
  await loadSecurity();
});
$('require-mfa').addEventListener('change', async (e) => {
  clearError();
  const on = e.target.checked;
  try { await rpc('admin_set_require_mfa', { p_on: on }); }
  catch (err) { e.target.checked = !on; showError(err); }
});

/* ---------- administrateurs ---------- */
async function loadAdmins() {
  const list = (await rpc('admin_list_admins')) || [];
  const W = canWrite();
  $('admins-table').innerHTML = '<thead><tr><th>Pseudo</th><th>E-mail</th><th>Rôle</th><th>Depuis</th><th></th></tr></thead><tbody>' +
    list.map((a) => {
      const me = state.me && a.user_id === state.me.id;
      return `<tr><td>${esc(a.username || '—')}</td><td>${esc(a.email)}${me ? ' <span class="badge ad">toi</span>' : ''}</td><td><span class="badge ${a.role === 'admin' ? 'ad' : 'wa'}">${a.role === 'admin' ? 'admin' : 'support'}</span></td><td>${fmtDay(a.created_at)}</td><td class="actions">${W && !me ? `<button class="btn sm danger" data-act="rmadmin" data-id="${esc(a.user_id)}" data-name="${esc(a.email)}">Retirer</button>` : ''}</td></tr>`;
    }).join('') + '</tbody>';
}
$('admin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const email = $('admin-email').value.trim();
  const role = $('admin-role').value;
  const label = role === 'admin' ? 'administrateur complet' : 'support (lecture seule)';
  if (!(await confirmDialog({ title: 'Déclarer ' + label + ' ?', text: email + (role === 'admin' ? ' pourra bannir, supprimer des comptes et purger le serveur.' : ' pourra tout consulter sans rien modifier.'), ok: 'Déclarer', tone: 'primary' }))) return;
  try {
    await rpc('admin_add_admin', { p_email: email, p_role: role });
    $('admin-email').value = '';
    await loadAdmins();
  } catch (err) { showError(err); }
});

/* ---------- codes promo ---------- */
async function loadPromos() {
  const list = (await rpc('admin_list_promos')) || [];
  const W = canWrite();
  $('promo-add-panel').hidden = !W;
  $('promos-table').innerHTML = list.length
    ? '<thead><tr><th>Code</th><th>Formule</th><th>Durée</th><th>Utilisations</th><th>Expire</th><th>État</th><th></th></tr></thead><tbody>' +
      list.map((p) => {
        const dead = !p.active || (p.expires_at && new Date(p.expires_at) < new Date()) || (p.max_uses && p.uses >= p.max_uses);
        return `<tr><td><code>${esc(p.code)}</code></td><td>${p.plan === 'yearly' ? 'annuel' : 'mensuel'}</td><td>${esc(p.days)} j</td><td>${fmtInt(p.uses)}${p.max_uses ? ' / ' + fmtInt(p.max_uses) : ''}</td><td>${p.expires_at ? fmtDay(p.expires_at) : '—'}</td><td><span class="badge ${dead ? 'ko' : 'ok'}">${dead ? (p.active ? 'épuisé ou expiré' : 'désactivé') : 'actif'}</span></td><td class="actions">${W ? `<button class="btn sm" data-act="promo-toggle" data-code="${esc(p.code)}" data-on="${p.active ? '0' : '1'}">${p.active ? 'Désactiver' : 'Activer'}</button><button class="btn sm danger" data-act="promo-del" data-code="${esc(p.code)}">Supprimer</button>` : ''}</td></tr>`;
      }).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Aucun code promo.</td></tr></tbody>';
}
$('promo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const exp = $('promo-expires').value;
  try {
    await rpc('admin_create_promo', {
      p_code: $('promo-code').value, p_plan: $('promo-plan').value, p_days: Number($('promo-days').value) || 0,
      p_max_uses: $('promo-max').value ? Number($('promo-max').value) : null,
      p_expires: exp ? new Date(exp + 'T23:59:59').toISOString() : null
    });
    $('promo-code').value = '';
    await loadPromos();
  } catch (err) { showError(err); }
});

/* ---------- annonces et maintenance ---------- */
const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return new Date(x - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
let annList = [];
function resetAnnForm() {
  $('ann-id').value = ''; $('ann-title').value = ''; $('ann-body').value = ''; $('ann-level').value = 'info';
  $('ann-start').value = ''; $('ann-end').value = ''; $('ann-active').checked = true;
  $('ann-save').textContent = 'Publier'; $('ann-cancel').hidden = true;
}
async function loadAnnouncements() {
  annList = (await rpc('admin_list_announcements')) || [];
  const W = canWrite();
  $('ann-panel').hidden = !W;
  const now = Date.now();
  $('ann-table').innerHTML = annList.length
    ? '<thead><tr><th>Titre</th><th>Niveau</th><th>Période</th><th>État</th><th></th></tr></thead><tbody>' +
      annList.map((a) => {
        const live = a.active && (!a.starts_at || new Date(a.starts_at) <= now) && (!a.ends_at || new Date(a.ends_at) > now);
        return `<tr><td class="wrap"><strong>${esc(a.title)}</strong><div class="muted small">${esc(a.body || '')}</div></td><td><span class="badge ${a.level === 'warning' ? 'wa' : ''}">${a.level === 'warning' ? 'avertissement' : 'info'}</span></td><td>${a.starts_at ? fmtDate(a.starts_at) : 'dès maintenant'} → ${a.ends_at ? fmtDate(a.ends_at) : 'sans fin'}</td><td><span class="badge ${live ? 'ok' : ''}">${live ? 'visible' : a.active ? 'planifiée ou terminée' : 'masquée'}</span></td><td class="actions">${W ? `<button class="btn sm" data-act="ann-edit" data-id="${esc(a.id)}">Modifier</button><button class="btn sm danger" data-act="ann-del" data-id="${esc(a.id)}" data-name="${esc(a.title)}">Supprimer</button>` : ''}</td></tr>`;
      }).join('') + '</tbody>'
    : '<tbody><tr><td class="empty">Aucune annonce.</td></tr></tbody>';
}
$('ann-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  try {
    await rpc('admin_save_announcement', {
      p_id: $('ann-id').value || null, p_title: $('ann-title').value, p_body: $('ann-body').value, p_level: $('ann-level').value,
      p_starts: fromLocalInput($('ann-start').value), p_ends: fromLocalInput($('ann-end').value), p_active: $('ann-active').checked
    });
    resetAnnForm();
    await loadAnnouncements();
  } catch (err) { showError(err); }
});
$('ann-cancel').addEventListener('click', resetAnnForm);
async function loadMaintMode() {
  const st = await rpc('admin_get_app_status');
  const W = canWrite();
  $('maint-on').checked = !!st.maintenance;
  $('maint-msg').value = st.message || '';
  ['maint-on', 'maint-msg', 'maint-save'].forEach((id) => { $(id).disabled = !W; });
}
$('maint-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const on = $('maint-on').checked;
  if (on && !(await confirmDialog({ title: 'Activer le mode maintenance ?', text: 'Tous les utilisateurs verront le message et ne pourront plus utiliser l\'app tant qu\'il est actif.', ok: 'Activer' }))) return;
  try {
    await rpc('admin_set_maintenance', { p_on: on, p_message: $('maint-msg').value });
    $('updated').textContent = 'Enregistré à ' + hhmm();
  } catch (err) { showError(err); }
});

/* ---------- réglages de modération et notifications ---------- */
function renderNotifState() {
  const st = typeof Notification === 'undefined' ? 'indisponible' : Notification.permission;
  $('notif-state').textContent = st === 'granted' ? 'Activées sur ce navigateur.' : st === 'denied' ? 'Bloquées par le navigateur : autorise-les dans les réglages du site.' : st === 'indisponible' ? 'Non supportées par ce navigateur.' : 'Non activées.';
  $('notif-btn').disabled = st === 'granted' || st === 'denied' || st === 'indisponible';
}
async function loadModSettings() {
  const cfg = await rpc('admin_get_settings');
  $('thr-value').value = cfg.report_threshold;
  $('thr-value').disabled = !canWrite();
  $('thr-save').disabled = !canWrite();
  $('cgu-version').value = cfg.cgu_version || '1';
  $('cgu-version').disabled = !canWrite();
  $('cgu-save').disabled = !canWrite();
  $('cgu-info').textContent = Number(cfg.cgu_outdated) > 0 ? fmtInt(cfg.cgu_outdated) + ' compte(s) n\'ont pas encore accepté la version ' + cfg.cgu_version + '. L\'app lit cgu_required() et enregistre l\'acceptation avec accept_cgu(version).' : 'Tous les comptes ont accepté la version ' + cfg.cgu_version + '. Changer la version demande une nouvelle acceptation à tous.';
  renderNotifState();
}
$('thr-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  try { await rpc('admin_set_report_threshold', { p_n: Number($('thr-value').value) || 0 }); $('updated').textContent = 'Enregistré à ' + hhmm(); }
  catch (err) { showError(err); }
});
$('cgu-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  try { await rpc('admin_set_cgu_version', { p_version: $('cgu-version').value.trim() }); $('updated').textContent = 'Enregistré à ' + hhmm(); await loadModSettings(); }
  catch (err) { showError(err); }
});
$('notif-btn').addEventListener('click', async () => {
  try { await Notification.requestPermission(); } catch (e) { /* ignoré */ }
  renderNotifState();
});
function notifyChanges(prev, s) {
  if (!prev || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const out = [];
  if (s.messages_open > prev.messages_open) out.push((s.messages_open - prev.messages_open) + ' nouveau(x) message(s)');
  if (s.user_reports_open > prev.user_reports_open) out.push((s.user_reports_open - prev.user_reports_open) + ' utilisateur(s) signalé(s)');
  if (s.suspicious > prev.suspicious) out.push((s.suspicious - prev.suspicious) + ' signalement(s) suspect(s)');
  if (out.length) { try { new Notification('RideNCT admin', { body: out.join(' · ') }); } catch (e) { /* ignoré */ } }
}

/* ---------- recherche rapide (Ctrl+K) ---------- */
const pal = { items: [], idx: 0 };
function pageItems() {
  const out = [];
  Object.entries(PAGES).forEach(([p, P]) => {
    if (!P.tabs) out.push({ group: 'Pages', label: P.title, sub: P.desc, run: () => navigate(p) });
    else P.tabs.forEach(([t, l]) => out.push({ group: 'Pages', label: P.title + ' › ' + l, sub: '', run: () => navigate(p + '/' + t) }));
  });
  out.push({ group: 'Actions', label: 'Actualiser la page', sub: '', run: () => loadRoute() });
  if (canWrite()) out.push({ group: 'Actions', label: 'Télécharger la sauvegarde', sub: 'Maintenance › Sauvegarde', run: () => navigate('maintenance/backup') });
  out.push({ group: 'Actions', label: 'Se déconnecter', sub: '', run: () => $('logout').click() });
  return out;
}
function openPalette() {
  $('palette').hidden = false;
  $('palette-input').value = '';
  buildPalette('');
  $('palette-input').focus();
}
function closePalette() { $('palette').hidden = true; state.palSeq++; }
function buildPalette(q, users) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const base = pageItems().filter((it) => words.every((w) => norm(it.label + ' ' + it.sub).includes(w)));
  const urows = (users || []).map((u) => ({ group: 'Utilisateurs', label: u.username || u.email, sub: u.username ? u.email : '', run: () => openUser(u) }));
  pal.items = urows.concat(base);
  pal.idx = 0;
  drawPalette();
}
function drawPalette() {
  const list = $('palette-list');
  if (!pal.items.length) { list.innerHTML = '<div class="pal-empty">Aucun résultat.</div>'; return; }
  let html = '', last = '';
  pal.items.forEach((it, i) => {
    if (it.group !== last) { html += `<div class="pal-group">${esc(it.group)}</div>`; last = it.group; }
    html += `<div class="pal-item${i === pal.idx ? ' active' : ''}" data-i="${i}"><span>${esc(it.label)}</span><span class="s">${esc(it.sub)}</span></div>`;
  });
  list.innerHTML = html;
  const a = list.querySelector('.pal-item.active');
  if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
}
function runPalette(i) {
  const it = pal.items[i];
  if (!it) return;
  closePalette();
  it.run();
}
const searchUsersForPalette = debounce(async (q, seq) => {
  if (q.trim().length < 2) return;
  try {
    const rows = (await rpc('admin_list_users', { p_search: q.trim(), p_limit: 6 }, true)) || [];
    if (seq !== state.palSeq || $('palette').hidden) return;
    buildPalette(q, rows);
  } catch (e) { /* ignoré */ }
}, 250);
$('palette-input').addEventListener('input', () => {
  const q = $('palette-input').value;
  buildPalette(q);
  searchUsersForPalette(q, ++state.palSeq);
});
$('palette-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); pal.idx = Math.min(pal.items.length - 1, pal.idx + 1); drawPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); pal.idx = Math.max(0, pal.idx - 1); drawPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); runPalette(pal.idx); }
});
$('palette-list').addEventListener('click', (e) => {
  const it = e.target.closest('.pal-item');
  if (it) runPalette(Number(it.dataset.i));
});
$('palette-bg').addEventListener('click', closePalette);
$('open-palette').addEventListener('click', openPalette);

document.addEventListener('keydown', (e) => {
  if ($('app').hidden) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if ($('modal').hidden) { if ($('palette').hidden) openPalette(); else closePalette(); }
    return;
  }
  if (e.key === '/' && $('modal').hidden && $('palette').hidden && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) {
    e.preventDefault();
    openPalette();
    return;
  }
  if (e.key !== 'Escape') return;
  if (!$('modal').hidden) $('modal-cancel').click();
  else if (!$('palette').hidden) closePalette();
  else if (!$('drawer').hidden) closeDrawer();
  else if (state.drawing) cancelZone();
});

/* ---------- actions (délégation) ---------- */
document.addEventListener('click', async (e) => {
  const bulk = e.target.closest('[data-bulk]');
  if (bulk) { const [n, k] = bulk.dataset.bulk.split(':'); try { await runBulk(n, k); } catch (err) { showError(err); } return; }
  const go = e.target.closest('[data-go]');
  if (go) {
    if (!$('drawer').hidden) closeDrawer();
    if (go.dataset.uf) { state.userFilter = go.dataset.uf; store.set('users.filter', state.userFilter); }
    navigate(go.dataset.go);
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const d = b.dataset;
  clearError();
  try {
    switch (d.act) {
      case 'ban': {
        const reason = await askBan(d.name);
        if (reason === null) return;
        await rpc('admin_set_ban', { p_user: d.id, p_banned: true, p_reason: reason });
        await afterUserChange(d.id);
        await notifyUser(d.id, 'ban');
        break;
      }
      case 'warn': {
        const v = await formDialog({
          title: 'Avertir ' + d.name + ' ?',
          text: 'Un message d\'alerte s\'affichera dans l\'app RideNCT à sa prochaine ouverture, jusqu\'à ce qu\'il clique sur « J\'ai compris ». Aucune sanction n\'est appliquée.',
          ok: 'Envoyer l\'avertissement',
          fields: [MAIL_FIELD, { id: 'msg', label: 'Message (500 caractères)', type: 'textarea', value: 'Attention : votre comportement a été signalé. Merci de respecter les conditions générales d\'utilisation de RideNCT, sous peine de sanctions.' }]
        });
        if (!v || !v.msg) return;
        await rpc('admin_send_warning', { p_user: d.id, p_message: v.msg });
        await afterUserChange(d.id);
        state.notifyMail = v.mail === 'oui';
        await notifyUser(d.id, 'warning');
        break;
      }
      case 'mail-user': {
        const v = await formDialog({ title: 'Écrire à ' + d.name, text: 'L\'e-mail part de contact@ridenct.fr ; les réponses y reviennent.', ok: 'Envoyer',
          fields: [{ id: 'subject', label: 'Objet', type: 'text' }, { id: 'text', label: 'Message', type: 'textarea' }] });
        if (!v) return;
        await mailCall({ action: 'send_user', user_id: d.id, subject: v.subject, text: v.text });
        $('updated').textContent = 'E-mail envoyé à ' + hhmm();
        break;
      }
      case 'export-user': {
        const data = await rpc('admin_export_user', { p_user: d.id });
        downloadBlob('export-donnees-' + String(d.mail || d.id).replace(/[^a-z0-9@._-]/gi, '_') + '.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        break;
      }
      case 'route-view': {
        const box = $('rt-' + d.id);
        if (!box) return;
        if (!box.hidden) { box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = '<span class="muted">Chargement…</span>';
        const row = ((await rpc('admin_get_route', { p_id: d.id })) || [])[0];
        box.innerHTML = row ? routeSvg(row.pts) : '<span class="muted">Circuit introuvable.</span>';
        return;
      }
      case 'route-clear':
        await rpc('admin_clear_route_reports', { p_id: d.id });
        await loadRoutes();
        break;
      case 'route-del':
        if (!(await confirmDialog({ title: 'Supprimer le circuit « ' + d.name + ' » ?', text: 'Il disparaît pour tous les utilisateurs. Suppression définitive.', ok: 'Supprimer' }))) return;
        await rpc('admin_delete_route', { p_id: d.id });
        await loadRoutes();
        break;
      case 'delsurvey':
        if (!(await confirmDialog({ title: 'Supprimer cette réponse ?', text: 'Suppression définitive.', ok: 'Supprimer' }))) return;
        await rpc('admin_delete_survey', { p_id: d.id });
        await loadSurvey();
        break;
      case 'delwarn':
        await rpc('admin_delete_warning', { p_id: Number(d.id) });
        await loadWarnings();
        break;
      case 'mail-open':
        await openMail(d.id);
        return;
      case 'mail-reply': {
        const txt = $('mail-reply-text').value.trim();
        if (txt.length < 2) { showError({ message: 'Écris ta réponse avant d\'envoyer.' }); return; }
        await mailCall({ action: 'reply', id: d.id, text: txt });
        $('mail-reply-text').value = '';
        $('updated').textContent = 'Réponse envoyée à ' + hhmm();
        break;
      }
      case 'vault-show': {
        const val = await rpc('admin_vault_reveal', { p_id: d.id });
        const box = document.querySelector(`[data-vault-val="${CSS.escape(d.id)}"]`);
        if (!box) return;
        box.textContent = val || '(vide)';
        box.hidden = false;
        if (vaultTimers.get(d.id)) clearTimeout(vaultTimers.get(d.id));
        vaultTimers.set(d.id, setTimeout(() => vaultHide(d.id), 30000));
        return;
      }
      case 'vault-copy': {
        const val = await rpc('admin_vault_reveal', { p_id: d.id });
        try { await navigator.clipboard.writeText(val || ''); $('updated').textContent = 'Copié (le presse-papiers n\'est pas vidé automatiquement) à ' + hhmm(); }
        catch (e) { showError({ message: 'Copie impossible : utilise « Afficher » puis sélectionne la valeur.' }); }
        return;
      }
      case 'vault-edit': {
        const v = (state.vault || []).find((x) => x.id === d.id);
        if (!v) return;
        $('vault-id').value = v.id;
        $('vault-label').value = v.label;
        $('vault-service').value = v.service;
        $('vault-note').value = v.note || '';
        $('vault-secret').value = '';
        $('vault-secret').required = false;
        $('vault-cancel').hidden = false;
        $('vault-label').focus();
        return;
      }
      case 'vault-del':
        if (!(await confirmDialog({ title: 'Supprimer « ' + d.name + ' » du coffre ?', text: 'La valeur est effacée définitivement.', ok: 'Supprimer', confirmWord: 'supprimer' }))) return;
        await rpc('admin_vault_delete', { p_id: d.id });
        await loadVault();
        break;
      case 'subban': {
        const reason = await askSubBan(d.name);
        if (reason === null) return;
        await rpc('admin_set_sub_ban', { p_user: d.id, p_banned: true, p_reason: reason });
        await afterUserChange(d.id);
        await notifyUser(d.id, 'sub_ban');
        break;
      }
      case 'subunban':
        await rpc('admin_set_sub_ban', { p_user: d.id, p_banned: false });
        await afterUserChange(d.id);
        break;
      case 'cancelsub':
        if (!(await confirmDialog({ title: 'Retirer l\'abonnement en cours ?', text: d.name + ' garde son compte mais perd son abonnement. S\'il est payant, résilie-le aussi chez le prestataire de paiement.', ok: 'Retirer l\'abonnement' }))) return;
        await rpc('admin_cancel_subscription', { p_user: d.id });
        await afterUserChange(d.id);
        break;
      case 'unban':
        await rpc('admin_set_ban', { p_user: d.id, p_banned: false });
        await afterUserChange(d.id);
        break;
      case 'deluser':
        if (!(await confirmDialog({ title: 'Supprimer ce compte ?', text: d.name + ' : compte, profil et abonnement seront effacés définitivement.', ok: 'Supprimer', confirmWord: 'supprimer' }))) return;
        await rpc('admin_delete_user', { p_user: d.id });
        closeDrawer();
        state.sel.users.delete(d.id);
        if (routeKey() === 'users') await loadUsers();
        break;
      case 'grant': {
        const v = await formDialog({
          title: 'Offrir un abonnement', text: d.name, ok: 'Offrir', tone: 'primary',
          fields: [
            { id: 'plan', label: 'Formule', type: 'select', options: [['monthly', 'Mensuel'], ['yearly', 'Annuel']] },
            { id: 'until', label: 'Valable jusqu\'au', type: 'date', value: isoDay(30) }
          ]
        });
        if (!v) return;
        const until = new Date(v.until + 'T23:59:59');
        if (isNaN(until)) throw { message: 'invalid_date' };
        await rpc('admin_grant_subscription', { p_user: d.id, p_plan: v.plan, p_until: until.toISOString() });
        await afterUserChange(d.id);
        break;
      }
      case 'revokegift':
        if (!(await confirmDialog({ title: 'Retirer l\'abonnement offert ?', text: d.name + ' repasse sans abonnement.', ok: 'Retirer' }))) return;
        await rpc('admin_revoke_subscription', { p_user: d.id });
        await afterUserChange(d.id);
        break;
      case 'rider-user': {
        const rows = (await rpc('admin_list_users', { p_search: d.mail, p_limit: 20 })) || [];
        const u = rows.find((x) => x.email === d.mail);
        if (u) openUser(u); else showError({ message: 'Compte introuvable.' });
        return;
      }
      case 'fake-add': {
        const rs = $('fake-reason');
        const res = await rpc('admin_add_fake_report', { p_user: d.id, p_reason: rs ? rs.value : 'autre', p_n: 1 });
        $('updated').textContent = 'Factice ajouté (' + (res && res.total) + ' au total)' + (res && res.warned ? ' : avertissement envoyé' : '') + ' à ' + hhmm();
        await afterFake(d.id);
        break;
      }
      case 'fake-clear':
        await rpc('admin_clear_fake_reports', { p_user: d.id });
        await afterFake(d.id);
        break;
      case 'rider-done':
        await rpc('admin_set_user_reports_handled', { p_rid: d.rid, p_handled: d.on === '1' });
        await loadRiders();
        break;
      case 'rider-del':
        if (!(await confirmDialog({ title: 'Supprimer les signalements reçus par ' + d.name + ' ?', text: 'Utile pour les faux signalements. Un compte banni automatiquement reste banni : débannis-le ensuite si besoin.', ok: 'Supprimer' }))) return;
        await rpc('admin_delete_user_reports', { p_rid: d.rid });
        await loadRiders();
        break;
      case 'promo-toggle':
        await rpc('admin_set_promo_active', { p_code: d.code, p_on: d.on === '1' });
        await loadPromos();
        break;
      case 'promo-del':
        if (!(await confirmDialog({ title: 'Supprimer le code ' + d.code + ' ?', text: 'Les abonnements déjà offerts avec ce code ne changent pas.', ok: 'Supprimer' }))) return;
        await rpc('admin_delete_promo', { p_code: d.code });
        await loadPromos();
        break;
      case 'ann-edit': {
        const a = annList.find((x) => x.id === d.id);
        if (!a) return;
        $('ann-id').value = a.id; $('ann-title').value = a.title; $('ann-body').value = a.body || ''; $('ann-level').value = a.level;
        $('ann-start').value = toLocalInput(a.starts_at); $('ann-end').value = toLocalInput(a.ends_at); $('ann-active').checked = a.active;
        $('ann-save').textContent = 'Enregistrer'; $('ann-cancel').hidden = false;
        $('ann-title').focus();
        return;
      }
      case 'ann-del':
        if (!(await confirmDialog({ title: 'Supprimer l\'annonce « ' + d.name + ' » ?', text: 'Elle disparaît de l\'app.', ok: 'Supprimer' }))) return;
        await rpc('admin_delete_announcement', { p_id: d.id });
        await loadAnnouncements();
        break;
      case 'dl-backup': {
        const data = await rpc('admin_get_backup', { p_id: Number(d.id) });
        downloadBlob('sauvegarde-ridenct-' + d.date + '-' + d.id + '.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        return;
      }
      case 'copymail':
        try { await navigator.clipboard.writeText(d.mail || ''); b.textContent = 'Copié'; setTimeout(() => { b.textContent = 'Copier l\'e-mail'; }, 1500); }
        catch (err) { showError({ message: 'Copie impossible : sélectionne l\'e-mail à la main.' }); }
        return;
      case 'rmadmin':
        if (!(await confirmDialog({ title: 'Retirer les droits admin ?', text: d.name + ' ne pourra plus utiliser ce logiciel.', ok: 'Retirer' }))) return;
        await rpc('admin_remove_admin', { p_user: d.id });
        await loadAdmins();
        break;
      case 'purge': {
        if (!(await confirmDialog({ title: 'Purger : ' + d.label + ' ?', text: 'Suppression définitive des données concernées.', ok: 'Purger' }))) return;
        const n = await rpc('admin_purge', { p_kind: d.kind, p_days: Number(d.days) });
        await loadMaintenance();
        $('purge-result').textContent = fmtInt(n) + ' ligne(s) supprimée(s). L\'espace disque est récupéré progressivement par Postgres.';
        break;
      }
      case 'delmsg':
        if (!(await confirmDialog({ title: 'Supprimer ce message ?', text: 'Suppression définitive.', ok: 'Supprimer' }))) return;
        await rpc('admin_delete_message', { p_id: d.id });
        await loadMessages();
        break;
      case 'handled':
        await rpc('admin_set_message_handled', { p_id: d.id, p_handled: d.on === '1' });
        await loadMessages();
        break;
      case 'delwait':
        if (!(await confirmDialog({ title: 'Retirer cet e-mail de la liste ?', text: 'Suppression définitive.', ok: 'Retirer' }))) return;
        await rpc('admin_delete_waitlist', { p_id: d.id });
        await loadMessages();
        break;
      case 'rmterm':
        await rpc('admin_remove_term', { p_term: d.id });
        await loadModeration();
        break;
      case 'delreport':
        await deleteReport(d.id);
        return;
      case 'bandevice':
        await banDevice(d.device);
        return;
      case 'unbandevice':
        if (!(await confirmDialog({ title: 'Débannir cet appareil ?', text: 'Il pourra de nouveau créer des signalements et voter.', ok: 'Débannir', tone: 'primary' }))) return;
        await rpc('admin_unban_device', { p_device: d.device });
        await loadDevices();
        break;
      case 'focus':
        state.focus = { lng: Number(d.lng), lat: Number(d.lat) };
        navigate('reports/map');
        return;
      case 'mfa-enroll':
        await startEnroll();
        return;
      case 'mfa-remove': {
        if ($('require-mfa').checked) throw { message: 'Désactive d\'abord « Exiger la 2FA », sinon tu serais bloqué.' };
        if (!(await confirmDialog({ title: 'Retirer la 2FA ?', text: 'Ton compte ne sera plus protégé que par le mot de passe.', ok: 'Retirer' }))) return;
        const { error } = await sb.auth.mfa.unenroll({ factorId: d.id });
        if (error) throw { message: 'Impossible de retirer la 2FA : ' + error.message };
        await loadSecurity();
        break;
      }
      default:
        return;
    }
    quietStats();
  } catch (err) { showError(err); }
});

/* ---------- préférences mémorisées ---------- */
(function restorePrefs() {
  state.userFilter = store.get('users.filter', 'all');
  ['map-kind', 'map-period'].forEach((id) => { const v = store.get(id, null); if (v != null && [...$(id).options].some((o) => o.value === v)) $(id).value = v; });
  ['map-expired', 'map-heat'].forEach((id) => { const v = store.get(id, null); if (v != null) $(id).checked = v === '1'; });
  const sd = store.get('stats.days', null);
  if (sd && [...$('stats-days').options].some((o) => o.value === sd)) $('stats-days').value = sd;
  const mo = store.get('msg.open', null);
  if (mo != null) $('msg-open-only').checked = mo === '1';
  const ro = store.get('riders.open', null);
  if (ro != null) $('riders-open-only').checked = ro === '1';
})();
