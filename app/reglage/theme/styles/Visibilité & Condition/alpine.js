// Thème « Haute Montagne » — Blanc glacier, gris rocheux et bleu givré
AppStyles.register({
    key: 'alpine', label: 'Haute Montagne', hint: 'Blanc glacier, gris rocheux et bleu givré',
    prev: 'linear-gradient(135deg,#f4f8fc,#c4d3e3 55%,#1f5fa8)',
    mode: 'light',
    vars: { '--bg-color': '#eaf1f8', '--surface-color': '#ffffff', '--active-bg': '#d3e3f3', '--text-main': '#16263a', '--text-muted': '#586b80', '--accent-color': '#1f5fa8', '--on-accent': '#ffffff', '--danger-color': '#c62828' },
    fancy: true,
    css: `
{K} { --style-bg: linear-gradient(180deg, #f7fbff 0%, #e3edf7 55%, #c9d8e8 100%); }
{K} body { background: var(--style-bg); background-attachment: fixed; }
{S}, {K} .ad-card { background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(240,247,253,.85)); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border: 1px solid #c7d6e6; box-shadow: 0 4px 14px rgba(40,70,110,.12), inset 0 1px 0 #fff; }
{K} .btn-primary { background: linear-gradient(180deg, #3a7bc8, #1f5fa8); box-shadow: inset 0 1px 0 rgba(255,255,255,.4), 0 4px 10px rgba(31,95,168,.3); }
{K} .nav-btn.active { background: #d3e3f3; color: #1f5fa8; }
{K} .nav-btn.nav-home { box-shadow: 0 6px 14px rgba(31,95,168,.35), 0 0 0 5px #eaf1f8, 0 0 0 6px #c7d6e6; }
{K} .nav-btn.nav-home::before { background: none; }
{K} #view-security .at-home-tile .s.ok { color: #1e7a35; } {K} #view-security .at-home-tile .s.warn { color: #b35c00; }
`,
});
