/* Intercom : demande l'accès au micro à l'OS dès qu'on ouvre l'onglet (une fois par lancement), au lieu d'attendre « Rejoindre ». */
(function () {
    'use strict';
    let asked = false, busy = false;
    async function state() {
        try { if (navigator.permissions && navigator.permissions.query) return (await navigator.permissions.query({ name: 'microphone' })).state; } catch (e) { }
        return 'unknown';
    }
    async function ask() {
        if (asked || busy) return; busy = true;
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
            if (typeof ModuleIntercom !== 'undefined' && ModuleIntercom.state && ModuleIntercom.state.isConnected) { asked = true; return; }
            const st = await state();
            if (st === 'denied') { asked = true; try { AppDialog.toast('Micro refusé : autorise-le dans les réglages du téléphone pour parler en intercom.', 6000); } catch (e) { } return; }
            try { ModuleTTS.log('intercom : demande du micro à l’OS (' + st + ')'); } catch (e) { }
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach((t) => t.stop()); asked = true;
            try { ModuleTTS.log('intercom : micro accordé'); } catch (e) { }
            try { AppPermissions.mark('mic', 'ok'); } catch (e) { }
        } catch (e) {
            try { ModuleTTS.log('intercom : micro refusé ' + (e && e.name)); } catch (x) { }
            if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { asked = true; try { AppDialog.toast('Micro refusé : autorise-le dans les réglages du téléphone pour parler en intercom.', 6000); } catch (x) { } }
        } finally { busy = false; }
    }
    function init() {
        const v = document.getElementById('view-intercom'); if (!v) return;
        const check = () => { if (v.classList.contains('active') && !document.hidden) setTimeout(ask, 350); };
        new MutationObserver(check).observe(v, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', check);
        check();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
