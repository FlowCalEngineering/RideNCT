// Verrouillage de la rotation pendant une balade : l'écran garde l'orientation qu'il avait au départ,
// même si on penche le téléphone (support de guidon). Déverrouillé à l'arrêt de la balade.
// Natif : plugin @capacitor/screen-orientation ; navigateur : screen.orientation.lock (si le navigateur l'accepte).
window.AppOrient = (() => {
    let locked = false;
    const plugin = () => { try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.ScreenOrientation; } catch (e) { return null; } };
    const current = () => {
        const land = window.matchMedia('(orientation: landscape)').matches;      // ce que voit l'utilisateur
        try { const t = screen.orientation && screen.orientation.type; if (t && t.indexOf(land ? 'landscape' : 'portrait') === 0) return t; } catch (e) { }   // garde le sens exact (paysage gauche / droite) si cohérent
        return land ? 'landscape-primary' : 'portrait-primary';
    };
    return {
        isLocked: () => locked,
        async lock() {
            const type = current(); locked = true;
            try { const P = plugin(); if (P && P.lock) { await P.lock({ orientation: type }); return type; } } catch (e) { }
            try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock(type); } catch (e) { }
            return type;
        },
        async unlock() {
            if (!locked) return; locked = false;
            try { const P = plugin(); if (P && P.unlock) { await P.unlock(); return; } } catch (e) { }
            try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
        }
    };
})();
