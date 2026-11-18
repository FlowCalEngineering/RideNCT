/* Intercom : bouton Invitations (rejoindre un groupe) et retour, sans barre secondaire. */
(function () {
    function tab(sub) { var t = document.querySelector('.intercom-tab-btn[data-sub="' + sub + '"]'); if (t) t.click(); }
    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('#btn-ic-invitations, #btn-ic-back'); if (!t) return;
        tab(t.id === 'btn-ic-back' ? 'sub-intercom-radar' : 'sub-intercom-invites');
    });
})();
