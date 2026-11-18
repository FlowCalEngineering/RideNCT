// Musique en mosaïque : les tuiles pilotent le lecteur existant (aucune logique audio ici)
(function () {
    const $ = (id) => document.getElementById(id), root = $('sub-music-local');
    if (!root) return;
    const tile = (k) => root.querySelector('.mu-tile[data-mt="' + k + '"]');
    const tab = (sub) => document.querySelector('.music-tab-btn[data-sub="' + sub + '"]');
    const sync = () => {
        const sh = $('btn-local-shuffle'), on = !!(sh && sh.classList.contains('on')), t = tile('shuffle');
        if (t) { t.classList.toggle('on', on); $('mt-shuf').textContent = on ? 'Activé' : 'Désactivé'; }
    };
    root.addEventListener('click', (e) => {
        const b = e.target.closest('.mu-tile'); if (!b) return;
        if (b.dataset.mt === 'sources') { const t = tab('sub-music-sources'); if (t) t.click(); }
        else if (b.dataset.mt === 'shuffle') { const s = $('btn-local-shuffle'); if (s) s.click(); }
        setTimeout(sync, 60);
    });
    const back = $('mu-back'); if (back) back.addEventListener('click', () => { const t = tab('sub-music-local'); if (t) t.click(); });
    const sh = $('btn-local-shuffle'); if (sh) new MutationObserver(sync).observe(sh, { attributes: true });
    sync(); setTimeout(sync, 500);
})();
