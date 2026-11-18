// Moteur des styles visuels. Chaque thème vit dans SON fichier : reglage/theme/styles/<nom>.js
// et s'enregistre avec AppStyles.register({ key, label, hint, prev, mode?, vars?, fancy?, css?, onApply?, onClear? }).
//   mode  : impose 'dark' ou 'light'          vars : variables CSS imposées (couleurs)
//   fancy : le thème a un fond en dégradé/motif (--style-bg) → les barres et feuilles se raccordent dessus
//   css   : feuille du thème ; {K} = html[data-style="<key>"], {S} = les surfaces (cartes, barre, tuiles, boutons…)
//   onApply()/onClear() : pour un thème vivant (ex. Caméléon)
// L'onglet d'un thème = le NOM DU DOSSIER où est son fichier (reglage/theme/styles/<Onglet>/<thème>.js).
// Ajouter un thème = déposer un fichier dans le bon dossier puis lancer « npm run build » (build.py génère les <script>).
const AppStyles = {
    CATS: [],   // onglets de la page Apparence : remplis à l'enregistrement d'après le dossier de chaque thème
    list: [], defs: {}, _applied: [],
    SURF: '.card, .pill-nav, .setting-btn:not(.btn-primary), .btn:not(.btn-primary):not(.btn-danger), .at-home-tile:not(.primary), .rp-sheet, .ad-card, .hm-t, .hm-sci > button:first-child, .hm-sheet-l button, .hm-ban',
    register(def) {
        const sc = document.currentScript, cat = (sc && sc.dataset.cat) || 'divers', catLabel = (sc && sc.dataset.catLabel) || 'Autres';
        if (!this.CATS.some(c => c.key === cat)) this.CATS.push({ key: cat, label: catLabel });
        this.defs[def.key] = def; this.list.push({ key: def.key, label: def.label, hint: def.hint, prev: def.prev, mode: def.mode, cat });
        if (def.css) {
            const K = 'html[data-style="' + def.key + '"]', S = K + ' :is(' + this.SURF + ')';
            const st = document.createElement('style'); st.id = 'style-css-' + def.key;
            st.textContent = def.css.replace(/\{K\}/g, K).replace(/\{S\}/g, S); document.head.appendChild(st);
        }
    },
    current() { const k = AppTheme.get('style', 'standard'); if (k !== 'standard' && typeof AppSub !== 'undefined' && !AppSub.premium()) return 'standard'; return this.defs[k] ? k : 'standard'; },
    forcedMode() { const d = this.defs[this.current()]; return d && d.mode || null; },
    setVar(k, v) { document.documentElement.style.setProperty(k, v); if (!this._applied.includes(k)) this._applied.push(k); },
    clear() { this._applied.forEach(k => document.documentElement.style.removeProperty(k)); this._applied = []; },
    // Appelé par AppTheme.applyAppTheme() après le mode et l'accent
    apply() {
        const key = this.current(), d = this.defs[key] || {}, h = document.documentElement;
        Object.keys(this.defs).forEach(k => { const o = this.defs[k]; if (o.onClear && k !== key) { try { o.onClear(); } catch (e) {} } });
        this.clear(); h.setAttribute('data-style', key); if (d.fancy) h.setAttribute('data-fancy', '1'); else h.removeAttribute('data-fancy');
        if (d.vars) Object.keys(d.vars).forEach(k => this.setVar(k, d.vars[k]));
        if (d.onApply) { try { d.onApply(); } catch (e) {} }
        try { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', getComputedStyle(h).getPropertyValue('--bg-color').trim() || '#1c1c1e'); } catch (e) {}
    }
};
