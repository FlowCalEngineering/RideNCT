AppStyles.register({key:"chrono",label:"Chrono",hint:"Anthracite, zone rouge et blanc vif",prev:"linear-gradient(90deg,#1d1f23 70%,#ff2a1a 70%)",mode:"dark",vars:{"--bg-color":"#121316","--surface-color":"#1d1f24","--active-bg":"#2c2f36","--text-main":"#ffffff","--text-muted":"#a7abb5","--accent-color":"#ff2a1a","--on-accent":"#ffffff","--danger-color":"#ff2a1a"},fancy:!0,css:`
{K} { --style-bg: linear-gradient(180deg, rgba(255,42,26,.0) 70%, rgba(255,42,26,.16)), repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 1px, transparent 1px 10px), #121316; }
{K} body { background: var(--style-bg); background-attachment: fixed; }
{S}, {K} .ad-card { border: 1px solid #353841; border-top: 3px solid #ff2a1a; box-shadow: 0 5px 12px rgba(0,0,0,.4); }
{K} .btn-primary { background: #ff2a1a; color: #fff; font-weight: 900; letter-spacing: .5px; text-transform: uppercase; }
{K} .nav-btn.active { background: #ff2a1a; color: #fff; }
{K} .nav-btn.nav-home { box-shadow: 0 0 0 4px #121316, 0 0 0 7px #fff, 0 8px 22px rgba(0,0,0,.5); }
{K} .nav-btn.nav-home::before { background: none; }
{K} .pill-nav { background: #1d1f24; border: 1px solid #353841; }
`});
