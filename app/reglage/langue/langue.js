// Restauration de sauvegarde : si le navigateur a perdu des écritures récentes au rechargement, on les réapplique ici (copie gardée en session)
// Migration : anciennes clés « vroom_* » (ancien nom de l'app) → « ridenct_* »
(function () { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.indexOf('vroom_') === 0) { const n = 'ridenct_' + k.slice(6); if (localStorage.getItem(n) === null) localStorage.setItem(n, localStorage.getItem(k)); localStorage.removeItem(k); } } } catch (e) {} })();
(function () { try { const raw = sessionStorage.getItem('ridenct_restore'); if (!raw) return; sessionStorage.removeItem('ridenct_restore'); const o = JSON.parse(raw); Object.keys(o).forEach(k => { if (/^(moto|motoapp)/.test(k) && typeof o[k] === 'string' && localStorage.getItem(k) !== o[k]) localStorage.setItem(k, o[k]); }); } catch (e) {} })();
        const AppLang = {
            fr: {
                start: "Démarrer",
                speedUnit: "km/h",
                distance: "Distance",
                engine: "Moteur",
                gpsWait: "Recherche GPS...",
                sosActive: "ACTIF",
                sosInactive: "INACTIF"
            }
        };
        const currentLang = AppLang.fr;
