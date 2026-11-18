// Annonces et maintenance : fenêtre à l'ouverture de l'appli (et pendant qu'elle tourne) quand l'équipe publie un message.
// Source : fonction publique app_status() de Supabase → { maintenance, message, announcements:[{id,title,body,level}] }.
//  - Maintenance active : fenêtre « Maintenance en cours » à chaque lancement de l'appli (et si le message change pendant qu'elle tourne), l'appli reste utilisable.
//  - Annonce : fenêtre à chaque lancement tant qu'elle est publiée (une seule fois par lancement, pas à chaque vérification).
//  - Compte sanctionné sans blocage (ligne account_bans posée par l'admin, compte non bloqué) : fenêtre « Abonnement désactivé » à chaque ouverture (fonction my_status).
//  - Avertissement (trop de signalements, ou envoyé par l'admin) : fenêtre « Avertissement » une fois, accusé de réception au clic sur « Compris » (my_warnings / ack_warning).
// Hors réseau : rien ne s'affiche, on réessaie au retour du réseau. Les fenêtres s'enchaînent, jamais deux à la fois.
const AppNotices = (() => {
    let busy = false, last = 0, banShown = false;
    const shown = new Set();   // déjà montrés depuis le lancement en cours
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    async function free() { for (let i = 0; i < 40 && document.querySelector('.ad-overlay'); i++) await sleep(500); }
    async function show(title, msg) { await free(); try { await AppDialog.alert(msg, { title, okText: 'Compris' }); } catch (e) {} }
    let tries = 0;
    async function check(force) {
        if (busy || typeof AppAuth === 'undefined' || typeof AppDialog === 'undefined' || (!force && Date.now() - last < 30000)) return;
        busy = true;
        try {
            // Les deux questions partent ensemble (rapide au lancement), les fenêtres s'ouvrent ensuite l'une après l'autre
            const [m, w, r] = await Promise.all([
                AppAuth.has() && !banShown ? AppAuth.rpc('my_status').catch(() => null) : Promise.resolve(null),
                AppAuth.has() ? AppAuth.rpc('my_warnings').catch(() => null) : Promise.resolve(null),
                AppAuth.pub('app_status').catch(() => null)
            ]);
            const s = r && r.ok && r.json;
            if (!s) {   // réseau pas encore prêt juste après le lancement : on réessaie vite (3 s, 6 s, 9 s… jusqu'à 8 fois)
                if (tries < 8) { tries++; setTimeout(() => check(true), 3000 * tries); }
                return;
            }
            last = Date.now(); tries = 0;
            // Sanction sans blocage du compte (abonnement désactivé) : rappel à chaque ouverture de l'appli
            // (seuil de signalements atteint sans décision de l'admin = 'since' vide : ce n'est pas une sanction)
            if (m && m.ok && m.json && m.json.banned && !m.json.permanent && m.json.since && !banShown) {
                banShown = true;
                await show('Abonnement désactivé', 'Ton compte a été signalé : tu as perdu l\'accès à ton abonnement. Tu gardes l\'accès à l\'application en version gratuite.' + (m.json.reason ? '\n\nMotif : ' + m.json.reason : ''));
            }
            // Avertissements non acquittés : un par un, acquittés une fois lus
            for (const x of (w && w.ok && Array.isArray(w.json) ? w.json : [])) {
                if (!x || !x.id || shown.has('w:' + x.id)) continue;
                shown.add('w:' + x.id);
                await show('Avertissement', String(x.message || 'La communauté t\'a signalé. Merci de respecter les conditions d\'utilisation de RideNCT.'));
                try { await AppAuth.rpc('ack_warning', { p_id: x.id }); } catch (e) {}
            }
            if (s.maintenance) {
                const msg = String(s.message || 'L\'application est en maintenance : certaines fonctions peuvent être indisponibles. Merci de ta patience.');
                if (!shown.has('m:' + msg)) { shown.add('m:' + msg); await show('Maintenance en cours', msg); }
            }
            for (const a of (Array.isArray(s.announcements) ? s.announcements : [])) {
                if (!a || !a.id || shown.has('a:' + a.id)) continue;
                shown.add('a:' + a.id); await show(String(a.title || 'Annonce'), String(a.body || a.title || ''));
            }
        } catch (e) {} finally { busy = false; }
    }
    const boot = () => setTimeout(() => check(true), 1200);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    window.addEventListener('online', () => setTimeout(() => check(true), 1000));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(check, 800); });
    setInterval(check, 600000);
    return { check };
})();
