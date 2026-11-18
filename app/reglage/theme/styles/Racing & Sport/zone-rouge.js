// Thème « Zone Rouge » (dynamique / Shift Light) — la couleur de l'app suit ton état :
//   bleu   : à l'arrêt ou en ville          vert  : roulage tranquille (30–110 km/h)
//   orange : allure soutenue (≥ 110 km/h)   ROUGE : batterie faible, alerte SOS reçue ou envoyée, « Tu vas bien ? »
// Tout est local : on lit la vitesse, la batterie et l'état de la sécurité ; rien n'est envoyé.
const AppZone = {
    _lvl: '', _timer: null,
    LEVELS: { calm: { h: 212, name: 'Calme' }, cruise: { h: 150, name: 'Roulage' }, fast: { h: 30, name: 'Rapide' }, alert: { h: 2, name: 'Alerte' } },
    // Niveau courant d'après l'état de l'app (testable : on peut lui passer un état)
    level(st) {
        const S = st || this.read();
        if (S.battLow || S.sos || S.fall || S.radar) return 'alert';
        if (S.speed >= 110) return 'fast';
        if (S.speed >= 30) return 'cruise';
        return 'calm';
    },
    read() {
        const o = { speed: 0, battLow: false, sos: false, fall: false, radar: false };
        try { o.speed = (ModuleDashboard.state.currentSpeedUi || 0); o.battLow = ModuleDashboard.state.battLow === true; } catch (e) {}
        try { o.sos = !!ModuleSecurity.alert; o.fall = !!ModuleSecurity.pre; o.radar = !!(ModuleSecurity.incoming && ModuleSecurity.incoming.size); } catch (e) {}
        return o;
    },
    paint(lvl, force) {
        if (!force && lvl === this._lvl) return; this._lvl = lvl;
        const h = this.LEVELS[lvl].h, S = (ss, ll) => `hsl(${h} ${ss}% ${ll}%)`;
        AppStyles.setVar('--bg-color', S(40, 6)); AppStyles.setVar('--surface-color', S(32, 11)); AppStyles.setVar('--active-bg', S(34, 19));
        AppStyles.setVar('--text-main', '#ffffff'); AppStyles.setVar('--text-muted', S(18, 72));
        AppStyles.setVar('--accent-color', S(95, lvl === 'alert' ? 52 : 58)); AppStyles.setVar('--on-accent', lvl === 'alert' ? '#ffffff' : '#041014');
        AppStyles.setVar('--zone-glow', S(100, lvl === 'alert' ? 42 : 36));
        document.documentElement.setAttribute('data-zone', lvl);
        try { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', S(40, 6)); } catch (e) {}
    },
    tick() { if (AppStyles.current() === 'zone-rouge') this.paint(this.level(), false); }
};
AppStyles.register({
    key: 'zone-rouge', label: 'Zone Rouge', hint: 'Dynamique : bleu/vert en route, rouge si alerte ou batterie faible',
    prev: 'conic-gradient(from 180deg,#2a8cff,#22d36b,#ff9f0a,#ff3b30,#2a8cff)', mode: 'dark', fancy: true,
    onApply() { AppZone._lvl = ''; AppZone.paint(AppZone.level(), true); clearInterval(AppZone._timer); AppZone._timer = setInterval(() => AppZone.tick(), 1500); },
    onClear() { clearInterval(AppZone._timer); AppZone._timer = null; document.documentElement.removeAttribute('data-zone'); },
    css: `
{K} { --style-bg: radial-gradient(ellipse at 50% -10%, var(--zone-glow, transparent) 0, transparent 55%), var(--bg-color); }
{K} body { background: var(--style-bg); background-attachment: fixed; transition: background-color .6s; }
{S}, {K} .ad-card { border: 1px solid color-mix(in srgb, var(--accent-color) 40%, transparent); border-top: 3px solid var(--accent-color); box-shadow: 0 0 12px color-mix(in srgb, var(--accent-color) 22%, transparent); }
{K} .btn-primary { font-weight: 900; box-shadow: 0 0 16px color-mix(in srgb, var(--accent-color) 55%, transparent); }
{K} .nav-btn.active { background: var(--accent-color); color: var(--on-accent); }
{K} .nav-btn.nav-home { box-shadow: 0 0 20px color-mix(in srgb, var(--accent-color) 60%, transparent), 0 0 0 5px var(--bg-color), 0 0 0 7px var(--accent-color); }
{K} .nav-btn.nav-home::before { background: none; }
@keyframes zr-pulse { 0%, 100% { box-shadow: inset 0 0 0 0 rgba(255,59,48,0); } 50% { box-shadow: inset 0 0 40px 6px rgba(255,59,48,.45); } }
html[data-zone="alert"]::after { content: ''; position: fixed; inset: 0; z-index: 9980; pointer-events: none; animation: zr-pulse 1.4s ease-in-out infinite; }
`
});
