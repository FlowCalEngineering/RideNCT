// Préférences de l'appli (unités, écran allumé, économie d'énergie) — à charger tôt, avant les modules.
const AppPrefs = {
    KEY: 'moto_prefs', DEF: { unit: 'kmh', wake: 'ride', eco: 'off', cue: 'all', remind: 'on', sensors: 'on', nav: 'bottom', navStyle: 'classic', speedStyle: 'barre' },
    _c: null,
    all() { if (!this._c) { let v = {}; try { v = JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch (e) {} this._c = Object.assign({}, this.DEF, v); } return this._c; },
    get(k) { return this.all()[k]; },
    set(k, v) { const a = this.all(); a[k] = v; try { localStorage.setItem(this.KEY, JSON.stringify(a)); } catch (e) {} if (k === 'speedStyle') this.applySpeed(); document.dispatchEvent(new CustomEvent('prefchange', { detail: { key: k, value: v } })); },
    applySpeed() { try { document.documentElement.setAttribute('data-speed', this.get('speedStyle') || 'barre'); } catch (e) {} }
};
AppPrefs.applySpeed();

// Unités : toutes les valeurs sont stockées en km et km/h ; seul l'affichage est converti.
const AppUnits = {
    KM: 1.609344,
    mph() { return AppPrefs.get('unit') === 'mph'; },
    speedLabel() { return this.mph() ? 'mph' : 'km/h'; },
    distLabel() { return this.mph() ? 'mi' : 'km'; },
    spd(kmh) { const v = this.mph() ? kmh / this.KM : kmh; return Math.round(v); },
    km(km) { return this.mph() ? km / this.KM : km; },
    // Distance d'une manœuvre (en mètres) : « 1,2 km » / « 350 m » ou « 0.7 mi » / « 600 ft »
    short(m) {
        m = Math.max(0, +m || 0);
        if (!this.mph()) {
            const r = m > 100 ? Math.round(m / 10) * 10 : Math.round(m / 5) * 5;   // on arrondit AVANT de choisir l'unité (999 m ne devient plus « 1000 m »)
            return r >= 1000 ? (r / 1000).toFixed(1).replace('.', ',') + ' km' : r + ' m';
        }
        const ft = m * 3.28084;
        return ft > 528 ? (m / 1609.344).toFixed(1).replace('.', ',') + ' mi' : Math.max(10, Math.round(ft / 50) * 50) + ' ft';
    },
    // Distance restante d'un trajet (en mètres), sans unité : « 12 » ou « 4,3 »
    trip(m) { const k = this.km(Math.max(0, m) / 1000); return k >= 9.95 ? String(Math.round(k)) : k.toFixed(1).replace('.', ','); },
    // Étiquettes statiques : <… data-u="speed"> et <… data-u="dist">
    paint(root) { (root || document).querySelectorAll('[data-u]').forEach(e => { const t = e.dataset.u === 'speed' ? this.speedLabel() : this.distLabel(); if (e.textContent !== t) e.textContent = t; }); }
};
document.addEventListener('prefchange', (e) => { if (e.detail.key === 'unit') AppUnits.paint(); });
document.addEventListener('DOMContentLoaded', () => AppUnits.paint());
