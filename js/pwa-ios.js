// Bandeau « Installer RideNCT sur iPhone » en haut de chaque page : iPhone / iPad seulement, et pas dans l'appli installée.
(function () {
  var cfg = window.RIDENCT || {}, url = cfg.pwaUrl || 'app/';
  var ua = navigator.userAgent || '';
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ios || navigator.standalone === true || document.getElementById('pwa-bar')) return;
  try { if (sessionStorage.getItem('pwa_bar_x')) return; } catch (e) { }
  var bar = document.createElement('div'); bar.id = 'pwa-bar'; bar.className = 'pwa-bar';
  bar.innerHTML = '<img src="assets/img/icon-192.png" alt="" width="36" height="36"><span><b>RideNCT sur iPhone</b><small>Installe l\'appli sur ton écran d\'accueil</small></span><a class="btn btn-primary" href="' + url + '">Installer</a><button type="button" aria-label="Fermer">×</button>';
  bar.querySelector('button').onclick = function () { bar.remove(); try { sessionStorage.setItem('pwa_bar_x', '1'); } catch (e) { } };
  document.body.insertBefore(bar, document.body.firstChild);
})();
