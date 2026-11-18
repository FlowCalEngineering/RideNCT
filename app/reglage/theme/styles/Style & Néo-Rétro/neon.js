AppStyles.register({key:"neon",label:"N\xE9on Cyber",hint:"Noir d'encre, cyan \xE9lectrique et magenta",prev:"linear-gradient(135deg,#05060d 40%,#00e5ff 62%,#ff2bd6)",mode:"dark",vars:{"--bg-color":"#05060d","--surface-color":"#0b1022","--active-bg":"#14213f","--text-main":"#e8fbff","--text-muted":"#7fa3b3","--accent-color":"#00e5ff","--on-accent":"#00181c","--danger-color":"#ff2bd6"},fancy:!0,css:`
{K} { --style-bg: radial-gradient(circle at 12% 0%, rgba(0,229,255,.16), transparent 45%), radial-gradient(circle at 95% 100%, rgba(255,43,214,.18), transparent 45%), #05060d; }
{K} body { background: var(--style-bg); background-attachment: fixed; }
{S}, {K} .ad-card { background: linear-gradient(160deg, rgba(14,22,48,.92), rgba(8,12,28,.92)); border: 1px solid rgba(0,229,255,.55); box-shadow: 0 0 12px rgba(0,229,255,.28), inset 0 0 14px rgba(0,229,255,.08); }
{K} :is(.hm-t, .at-home-tile:not(.primary)):nth-child(even) { border-color: rgba(255,43,214,.6); box-shadow: 0 0 12px rgba(255,43,214,.28), inset 0 0 14px rgba(255,43,214,.08); }
{K} .btn-primary { background: #00e5ff; color: #00181c; box-shadow: 0 0 18px rgba(0,229,255,.65); font-weight: 900; }
{K} .nav-btn.active { background: rgba(0,229,255,.16); color: #00e5ff; box-shadow: 0 0 14px rgba(0,229,255,.5), inset 0 0 0 1px rgba(0,229,255,.7); }
{K} .nav-btn.nav-home { background: #00e5ff; color: #00181c; box-shadow: 0 0 22px rgba(0,229,255,.8), 0 0 0 5px #05060d, 0 0 0 7px #ff2bd6; }
{K} .nav-btn.nav-home::before { background: none; }
{K} .pill-nav { border: 1px solid rgba(255,43,214,.65); box-shadow: 0 0 14px rgba(255,43,214,.35); }
`});
