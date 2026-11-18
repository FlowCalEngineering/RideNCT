// Données locales propres à chaque compte, sur un même téléphone.
// - localStorage : les données du compte propriétaire sont mises de côté (« moto_stash:<compte>:<clé> ») quand un autre compte se connecte,
//   et celles de l'autre compte sont remises en place. Reste commun au téléphone : session, onboarding, permissions, identifiant d'appareil,
//   cartes hors ligne, apparence (thème, couleur).
// - IndexedDB (trajets, atelier, musique) : un nom de base par compte (AppData.db). Le premier compte qui se connecte reprend les données déjà
//   présentes sur le téléphone (aucune migration, mêmes noms de bases).
// À charger EN PREMIER (avant tout script qui lit localStorage).
const AppData = (() => {
    const OWN = 'moto_data_owner', FIRST = 'moto_data_first', ST = 'moto_stash:';
    const DEVICE = /^(moto_auth|moto_data_|moto_stash:|moto_onboarded$|moto_hint_home$|moto_perm_state$|moto_acct_status$|moto_offline_(tiles|upd|pending|rate)$|moto_auto_|motoapp_device_id$|motoapp_(mode|accent|routeColor|lastpos|lang|language|theme)$|ridenct_restore$)/;
    const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
    const del = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
    const keys = () => { const a = []; try { for (let i = 0; i < localStorage.length; i++) a.push(localStorage.key(i)); } catch (e) {} return a; };
    let uid = '';
    try { const s = JSON.parse(get('moto_auth') || 'null'); uid = (s && s.user && s.user.id) || ''; } catch (e) {}

    function swap() {
        if (!uid) return;
        const owner = get(OWN);
        if (!owner) { set(OWN, uid); if (!get(FIRST)) set(FIRST, uid); return; }
        if (owner === uid) return;
        // 1. les données du compte précédent partent dans la réserve (clé par clé : jamais deux copies complètes en même temps)
        keys().filter(k => k && !DEVICE.test(k)).forEach(k => { const v = get(k); if (v !== null && set(ST + owner + ':' + k, v)) del(k); });
        // 2. celles du compte qui se connecte reviennent en place
        const pre = ST + uid + ':';
        keys().filter(k => k && k.indexOf(pre) === 0).forEach(k => { const v = get(k); if (v !== null && set(k.slice(pre.length), v)) del(k); });
        set(OWN, uid);
    }
    try { swap(); } catch (e) {}

    const BASES = ['vroom_atelier', 'vroom_music', 'vroom_store'];
    // Nom de la base IndexedDB du compte courant
    const db = (base) => { const f = get(FIRST) || ''; return (!uid || !f || uid === f) ? base : base + '_' + uid.slice(0, 8); };
    // Compte supprimé : sa réserve et ses bases sont effacées. Exception : le compte « d'origine » du téléphone (celui qui a repris les données
    // d'avant les comptes) laisse ses données sur place, le prochain compte qui se connecte les reprend.
    function release(id) {
        if (!id) return;
        try {
            const pre = ST + id + ':'; keys().filter(k => k && k.indexOf(pre) === 0).forEach(del);
            if (get(FIRST) === id) { if (get(OWN) === id) del(OWN); del(FIRST); return; }
            if (get(OWN) === id) { keys().filter(k => k && !DEVICE.test(k)).forEach(del); del(OWN); }
            BASES.forEach(b => { try { indexedDB.deleteDatabase(b + '_' + id.slice(0, 8)); } catch (e) {} });
        } catch (e) {}
    }
    return { db, release, uid: () => uid, DEVICE };
})();
