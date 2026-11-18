/* Profil : Records / Bornes en lignes de liste, sans barre d'onglets. */
(function () {
    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-pfgo], #pf-back'); if (!t) return;
        var id = t.id === 'pf-back' ? 'pf-garage' : t.getAttribute('data-pfgo');
        var b = document.querySelector('#pf-tabs button[data-pf="' + id + '"]'); if (b) b.click();
    });
})();
