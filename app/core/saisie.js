// Saisie sur mobile : empêche le zoom automatique d'iOS et garde le champ visible au-dessus du clavier.
// iOS zoome toute la page quand on touche un champ dont le texte fait moins de 16 px, puis ne dézoome pas : la page devient illisible.
// Les feuilles de style visent déjà 16 px ; ce script rattrape les champs créés plus tard ou dotés d'un style propre.
(function () {
    const SKIP = ['range', 'checkbox', 'radio', 'color', 'file', 'button', 'submit', 'reset', 'image', 'hidden'];
    const isField = (el) => el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && SKIP.indexOf(el.type) < 0;
    const fix = (el) => {
        if (!isField(el)) return;
        try { if (parseFloat(getComputedStyle(el).fontSize) < 16) el.style.setProperty('font-size', '16px', 'important'); } catch (e) {}
    };
    // touchstart arrive avant la prise de focus : la taille est déjà bonne quand iOS décide de zoomer
    document.addEventListener('touchstart', (e) => fix(e.target), { capture: true, passive: true });
    document.addEventListener('focusin', (e) => {
        const el = e.target; if (!isField(el)) return;
        fix(el);
        // le clavier recouvre le bas de l'écran : on remet le champ au centre de la zone visible
        setTimeout(() => { try { if (document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {} }, 350);
    }, true);
    // sécurité : si la page se retrouve zoomée malgré tout, on revient à l'échelle normale
    document.addEventListener('focusout', () => {
        setTimeout(() => {
            const vv = window.visualViewport;
            if (vv && vv.scale > 1.02) {
                const m = document.querySelector('meta[name="viewport"]'); if (!m) return;
                const c = m.getAttribute('content'); m.setAttribute('content', c + ', maximum-scale=1.0'); setTimeout(() => m.setAttribute('content', c), 60);
            }
        }, 150);
    }, true);
})();
