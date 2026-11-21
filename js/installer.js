// Page « Installer » : détecte iPhone / Android / ordinateur / navigateur intégré et n'affiche que ce qui concerne le visiteur.
(function () {
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var inapp = /FBAN|FBAV|Instagram|Line\/|MicroMessenger|TikTok|Snapchat|Twitter|GSA\/|; wv\)/.test(ua);
  var fxios = /FxiOS/.test(ua);
  var installed = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  function $(id) { return document.getElementById(id); }
  function show(id) { var e = $(id); if (e) e.hidden = false; }
  var name = ios ? (/CriOS/.test(ua) ? 'Chrome' : /EdgiOS/.test(ua) ? 'Edge' : fxios ? 'Firefox' : inapp ? 'navigateur intégré' : 'Safari') :
             android ? (/SamsungBrowser/.test(ua) ? 'Samsung Internet' : /EdgA/.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox' : inapp ? 'navigateur intégré' : 'Chrome') : 'ordinateur';
  var dev = ios ? 'iPhone' : android ? 'Android' : 'Ordinateur';
  var ok = (ios || android) && !inapp && !fxios;
  var det = $('inst-det');
  if (det) det.innerHTML = 'Détecté : <b>' + dev + (ios || android ? ' · ' + name : '') + '</b> ' + ((ios || android) ? (ok ? '<span class="inst-y">✓ compatible</span>' : '<span class="inst-n">✗ à changer de navigateur</span>') : '');
  if (installed) show('inst-installed');
  else if (inapp || fxios) { show('inst-inapp'); var b = $('inst-inapp-b'); if (b) b.textContent = ios ? 'Safari' : 'Chrome'; }
  else if (ios) show('inst-ios');
  else if (android) show('inst-android');
  else show('inst-desktop');
  if (ios && /CriOS|EdgiOS/.test(ua)) { var t = $('inst-ios-ok'); if (t) t.textContent = 'Ton navigateur est compatible (iOS 16.4 ou plus récent). Safari reste le plus simple.'; }
  ['inst-copy', 'inst-copy2'].forEach(function (id) {
    var btn = $(id); if (!btn) return;
    btn.addEventListener('click', function () {
      var u = location.href.split('#')[0];
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { btn.textContent = 'Lien copié ✓'; }, function () { btn.textContent = u; });
    });
  });
})();
