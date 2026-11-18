// Avertissements d'usage (pop-ups) : résumé des CGU + avertissement, avant les fonctions sensibles.
//   AppWarn.done(clé)  -> true si l'utilisateur a déjà pris connaissance (compte + version des CGU)
//   AppWarn.ask(clé)   -> Promise<boolean> : true = « J'ai compris » (mémorisé) ; false = « Annuler » (rien n'est mémorisé,
//                         l'utilisateur est renvoyé à l'accueil : la pop-up réapparaîtra à son retour)
//   AppWarn.launch()   -> information de lancement (détection de chute) : aucune action requise, affichée une fois par compte
// Les accusés sont réinitialisés quand la version des CGU change.
const AppWarn = (() => {
    const KEY = 'moto_warn';
    const DEFS = {
        'radar-amis': { ic: '📡', t: 'Radar amis', s: 'Ta position est partagée en temps réel avec tes amis (portée 300 m) tant que le radar est actif. Tu peux le couper à tout moment.', w: 'Ne manipule pas l\'appli en roulant. Ne partage ta position qu\'avec des personnes de confiance.', n: 10, h: 'Géolocalisation, radar et profil' },
        'radar': { ic: '📡', t: 'Radar et entraide', s: 'Ta position est visible des motards proches tant que le radar est actif. Les demandes d\'aide alertent les motards dans un rayon de 5 km.', w: 'Ne lance une demande d\'aide que pour un vrai besoin : les abus sont sanctionnés. Ne manipule pas l\'appli en roulant.', n: 10, h: 'Géolocalisation, radar et profil' },
        'intercom': { ic: '🎧', t: 'Intercom', s: 'La voix est échangée en direct (de motard à motard, chiffrée) avec les membres du canal. Tu peux quitter le canal à tout moment.', w: 'Ne manipule pas l\'appli en roulant. Reste courtois : pas d\'enregistrement ni de diffusion sans l\'accord des personnes.', n: 8, h: 'Communication vocale' },
        'rencontre': { ic: '🤝', t: 'Mode rencontre', s: 'Tu peux parler à des motards que tu ne connais pas, croisés sur la route. Ta voix et ton pseudo sont audibles de ceux qui sont à portée.', w: 'Ne donne aucune information personnelle (adresse, numéro…). Reste courtois et signale tout abus.', n: 8, h: 'Communication vocale' },
        'danger': { ic: '⚠️', t: 'Signalement de danger', s: 'Les signalements sont faits par les motards eux-mêmes : ils sont communautaires, non garantis et peuvent être inexacts ou périmés.', w: 'Ne manipule pas l\'appli en roulant : arrête-toi pour signaler. Les faux signalements sont sanctionnés.', n: 7, h: 'Navigation et signalements communautaires' },
        'guidage': { ic: '🧭', t: 'Navigation et guidage', s: 'Le guidage est une aide : l\'itinéraire peut être inexact, fermé ou dangereux. Le code de la route et ta vigilance priment toujours.', w: 'Ne regarde pas et ne touche pas ton téléphone en roulant. Respecte la signalisation, même si le guidage dit autre chose.', n: 6, h: 'Sécurité routière et responsabilité' },
        'musique': { ic: '🎵', t: 'Partage de musique', s: 'Ta musique est envoyée en direct, chiffrée, aux seuls motards de ton canal. Chacun peut la couper ou régler son volume.', w: 'Ne partage que des titres que tu as le droit de diffuser (droits d\'auteur). Tu en es responsable.', n: 9, h: 'Partage de musique et droits d\'auteur' },
        'partage-itineraire': { ic: '🗺️', t: 'Partage d\'itinéraire', s: 'Ton trajet est envoyé à la personne ou au canal que tu choisis, ou exporté en fichier GPX. Il peut révéler des lieux que tu fréquentes (domicile, travail…).', w: 'Vérifie qui reçoit ton trajet et retire les lieux privés (départ, arrivée). Un fichier GPX envoyé ne peut plus être repris.', n: 10, h: 'Géolocalisation, radar et profil' },
        'roadbook-public': { ic: '📖', t: 'Publication au roadbook communautaire', s: 'Ton trajet, son titre et sa description seront visibles de tous les utilisateurs de RideNCT, sous ton pseudo.', w: 'Ne publie rien d\'illégal, d\'offensif ni d\'inexact, et évite de publier un trajet qui part de ton domicile. Les contenus abusifs sont retirés.', n: 14, h: 'Règles d\'usage, modération et suspension' },
        'chute': { ic: '🚨', t: 'Détection de chute', s: 'RideNCT peut détecter une chute et prévenir tes contacts d\'urgence. En utilisant l\'appli, tu reconnais ces informations : aucune confirmation n\'est nécessaire pour que la détection fonctionne.', w: 'Ce n\'est pas un service d\'urgence. En cas d\'accident, appelle le 112. La détection peut échouer ou se déclencher à tort.', n: 11, h: 'Détection de chute et alertes', info: true }
    };
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const uid = () => { try { const u = AppAuth.user(); return u && u.id; } catch (e) { return null; } };
    const ver = () => { try { return AppLegal.version(); } catch (e) { return ''; } };
    const rd = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
    function done(k) {
        const o = rd(); if (!o || !o.k || !o.k[k]) return false;
        const v = ver(), id = uid();
        return (!v || o.v === v) && (!o.u || !id || o.u === id);
    }
    function mark(k) {
        let o = rd(); const v = ver(), id = uid();
        if (!o || o.v !== v || (o.u && id && o.u !== id)) o = { v, u: id || undefined, k: {} };
        o.k[k] = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
    }
    function leave() { try { AppManager.switchView('view-home'); } catch (e) {} }

    function css() {
        if (document.getElementById('aw-style')) return;
        const st = document.createElement('style'); st.id = 'aw-style'; st.textContent = `
.aw-ov { position: fixed; inset: 0; z-index: 9993; background: rgba(0,0,0,.62); display: flex; align-items: flex-end; justify-content: center; opacity: 0; transition: opacity .2s; }
.aw-ov.show { opacity: 1; }
.aw-sh { width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; box-sizing: border-box; background: var(--surface-color, #2c2c2e); color: var(--text-main); border-top: 3px solid var(--rc, var(--accent-color)); padding: 18px 18px calc(env(safe-area-inset-bottom, 0px) + 18px); clip-path: polygon(0 14px, 14px 0, 100% 0, 100% 100%, 0 100%); transform: translateY(30px); transition: transform .22s; }
.aw-ov.show .aw-sh { transform: none; }
.aw-ic { width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; font-size: 24px; background: var(--rc, var(--accent-color)); clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)); }
.aw-h { margin: 10px 0 4px; font-size: 1.25rem; font-style: italic; font-weight: 900; }
.aw-s { margin: 0 0 10px; font-size: .88rem; line-height: 1.5; color: var(--text-muted); }
.aw-w { margin: 0 0 10px; padding: 9px 11px; font-size: .84rem; line-height: 1.45; border-left: 3px solid var(--rc, var(--accent-color)); background: color-mix(in srgb, var(--rc, var(--accent-color)) 14%, transparent); }
.aw-w b { color: var(--rc, var(--accent-color)); }
.aw-l { display: block; margin: 0 0 14px; padding: 0; background: none; border: 0; font: inherit; font-size: .82rem; color: var(--rc, var(--accent-color)); text-decoration: underline; text-align: left; cursor: pointer; }
.aw-b { display: flex; gap: 10px; }
.aw-b button { flex: 1; padding: 13px 0; border: 0; font: inherit; font-weight: 800; font-size: .9rem; cursor: pointer; clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px)); }
.aw-ok { background: var(--rc, var(--accent-color)); color: var(--rc-on, #fff); }
.aw-no { background: color-mix(in srgb, var(--text-main) 14%, transparent); color: var(--text-main); }
@media (orientation: landscape) and (max-height: 520px) { .aw-sh { max-height: 98vh; padding-top: 12px; } .aw-ic { display: none; } .aw-h { margin-top: 0; } }`;
        document.head.appendChild(st);
    }

    // Affiche la pop-up ; résout true (« J'ai compris ») ou false (« Annuler »)
    function show(k) {
        const d = DEFS[k]; if (!d) return Promise.resolve(true);
        css();
        return new Promise(res => {
            document.querySelectorAll('.aw-ov').forEach(n => n.remove());
            const ov = document.createElement('div'); ov.className = 'aw-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
            ov.innerHTML = '<div class="aw-sh"><div class="aw-ic">' + d.ic + '</div><h1 class="aw-h">' + esc(d.t) + '</h1><p class="aw-s">' + esc(d.s) + '</p>' +
                '<div class="aw-w"><b>Avertissement :</b> ' + esc(d.w) + '</div>' +
                '<button type="button" class="aw-l">Lire les CGU · § ' + d.n + ' ' + esc(d.h) + '</button>' +
                '<div class="aw-b">' + (d.info ? '' : '<button type="button" class="aw-no">Annuler</button>') + '<button type="button" class="aw-ok">' + (d.info ? 'Compris' : 'J\'ai compris') + '</button></div></div>';
            document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('show'));
            const end = (ok) => { ov.classList.remove('show'); setTimeout(() => ov.remove(), 220); res(ok); };
            ov.querySelector('.aw-ok').addEventListener('click', () => { mark(k); end(true); });
            const no = ov.querySelector('.aw-no'); if (no) no.addEventListener('click', () => { end(false); leave(); });
            ov.querySelector('.aw-l').addEventListener('click', () => {
                try { AppLegal.view('cgu'); setTimeout(() => { const s = document.querySelectorAll('#lg-vb .lg-s')[d.n - 1]; if (s) s.scrollIntoView(); }, 350); } catch (e) {}
            });
        });
    }
    async function ask(k) { if (done(k)) return true; return show(k); }

    // Information de lancement (détection de chute) : sans action requise, juste après l'acceptation des CGU
    function launch() {
        if (done('chute')) return;
        let n = 0; const t = setInterval(() => {
            if (++n > 80) { clearInterval(t); return; }
            if (document.getElementById('cgu-gate') || document.getElementById('auth-gate') && document.documentElement.classList.contains('auth-pending')) return;
            try { if (!AppLegal.accepted()) return; } catch (e) {}
            clearInterval(t); if (!done('chute')) show('chute');
        }, 700);
    }
    return { done, ask, launch, mark, DEFS };
})();
