// Thème « Pluie » — Bleus grisés, ardoise et argent phosphorescent
AppStyles.register({
    key: 'pluie', label: 'Pluie', hint: 'Bleus grisés, ardoise et argent phosphorescent',
    prev: 'linear-gradient(135deg,#1b2530,#26333f 60%,#8ef5d0)',
    mode: 'dark',
    vars: { '--bg-color': '#18222c', '--surface-color': '#243240', '--active-bg': '#34475a', '--text-main': '#e6eef5', '--text-muted': '#9fb2c2', '--accent-color': '#8ef5d0', '--on-accent': '#06241c', '--danger-color': '#ff8a80' },
    fancy: true,
    css: `
{K} { --style-bg: repeating-linear-gradient(100deg, rgba(190,215,235,.035) 0 1px, transparent 1px 13px), linear-gradient(180deg, #223140, #141d26); }
{K} body { background: var(--style-bg); background-attachment: fixed; }
{S}, {K} .ad-card { background: linear-gradient(180deg, rgba(60,82,104,.55), rgba(36,50,64,.7)); border: 1px solid rgba(190,215,235,.22); box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 6px 14px rgba(0,0,0,.3); }
{K} .btn-primary { background: #8ef5d0; color: #06241c; box-shadow: 0 0 14px rgba(142,245,208,.45); }
{K} .nav-btn.active { background: rgba(142,245,208,.18); color: #8ef5d0; box-shadow: 0 0 12px rgba(142,245,208,.4); }
{K} .nav-btn.nav-home { box-shadow: 0 0 18px rgba(142,245,208,.5), 0 0 0 5px #18222c, 0 0 0 6px #8ef5d0; }
{K} .nav-btn.nav-home::before { background: none; }
`,
});
