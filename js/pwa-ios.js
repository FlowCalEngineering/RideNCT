// Bloc « Installer sur iPhone (PWA) » de la page Tarifs : visible seulement si connecté et si cfg.pwaUrl est renseigné.
(function () {
  var cfg = window.RIDENCT || {}, box = document.getElementById('pwa-ios');
  if (!box || !cfg.pwaUrl) return;
  var logged = false;
  try { var s = JSON.parse(localStorage.getItem('ridenct_session_v1') || 'null'); logged = !!(s && s.access_token); } catch (e) { }
  if (!logged) return;
  var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var go = document.getElementById('pwa-go'), st = document.getElementById('pwa-st'), note = document.getElementById('pwa-note');
  go.setAttribute('href', cfg.pwaUrl);
  if (ios) { st.hidden = false; } else { go.textContent = 'Ouvrir la version web'; note.textContent = 'Pour installer, ouvre cette page sur ton iPhone (Safari).'; }
  box.hidden = false;
})();
