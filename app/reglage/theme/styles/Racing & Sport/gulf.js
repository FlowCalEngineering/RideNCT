// Thème « Ciel & Orange » — Bleu ciel pastel, orange vif et bandes crème
AppStyles.register({
    key: 'gulf', label: 'Ciel & Orange', hint: 'Bleu ciel pastel, orange vif et bandes crème',
    prev: 'linear-gradient(90deg,#ff7a1a 0 12%,#fff 12% 20%,#a9d3ee 20%)',
    mode: 'light',
    vars: { '--bg-color': '#cfe7f6', '--surface-color': '#fff8ec', '--active-bg': '#ffd9b3', '--text-main': '#0f3557', '--text-muted': '#4a6f8f', '--accent-color': '#ff7a1a', '--on-accent': '#0f3557', '--danger-color': '#c62828' },
    fancy: true,
    css: `
{K} { --style-bg: linear-gradient(90deg, #ff7a1a 0 5px, #fff8ec 5px 9px, #ff7a1a 9px 14px, transparent 14px), linear-gradient(180deg, #d9edf9, #b3d9f0); }
{K} body { background: var(--style-bg); background-attachment: fixed; }
{S}, {K} .ad-card { border: 1px solid #f0d9b8; box-shadow: 0 3px 10px rgba(15,53,87,.14); }
{K} .btn-primary { font-weight: 900; box-shadow: 0 3px 0 #c9560a; }
{K} .pill-nav { background: #fff8ec; }
{K} .nav-btn.active { background: #ff7a1a; color: #0f3557; }
{K} .nav-btn.nav-home { box-shadow: 0 6px 14px rgba(15,53,87,.3), 0 0 0 5px #fff8ec, 0 0 0 8px #ff7a1a; }
{K} .nav-btn.nav-home::before { background: none; }
{K} #view-security .at-home-tile .s.ok { color: #1e7a35; } {K} #view-security .at-home-tile .s.warn { color: #b35c00; }
`,
});
