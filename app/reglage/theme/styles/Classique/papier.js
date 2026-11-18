// Thème « Papier » — Ton carte routière papier
AppStyles.register({
    key: 'papier', label: 'Papier', hint: 'Ton carte routière papier',
    prev: 'linear-gradient(135deg,#efe6d2,#cdbf9d)',
    mode: 'light',
    vars: { '--bg-color': '#efe6d2', '--surface-color': '#f8f1e0', '--active-bg': '#e2d6b8', '--text-main': '#2b2418', '--text-muted': '#7a6a4c', '--accent-color': '#8b3a1e', '--on-accent': '#f8f1e0', '--danger-color': '#b3261e' },
    css: `
{S} { border: 1px solid #cdbf9d; box-shadow: 0 2px 0 rgba(139,90,43,.12); }
{K} .pill-nav { background: #f8f1e0; box-shadow: 0 3px 0 rgba(139,90,43,.15); }
{K} .nav-btn.active { background: #e2d6b8; color: #8b3a1e; }
{K} .nav-btn.nav-home { box-shadow: 0 6px 14px rgba(139,90,43,.3), 0 0 0 5px #efe6d2, 0 0 0 6px #cdbf9d; }
{K} :is(#view-security .at-home-tile .s.ok) { color: #1e7a35; }
{K} :is(#view-security .at-home-tile .s.warn) { color: #b35c00; }
`,
});
