// ====================================================================
//  INFORMATIONS LÉGALES — CGU / CGV / Mentions légales (textes dans core/legal-textes.js, lisibles hors ligne)
//  - Écran d'acceptation : une case PAR POINT des CGU, obligatoire pour tout compte (nouveau ou existant) avant d'utiliser l'appli.
//    Réaffiché si la `version` des CGU change (legal-textes.js).
//  - L'acceptation (version + date) est gardée sur le téléphone et copiée dans le compte (métadonnées Supabase) dès que le réseau le permet.
//  - Réglages › « Informations légales » (tout en bas) : lecture des 3 documents, de l'état d'acceptation, liens confidentialité / contact.
// ====================================================================
const AppLegal = (() => {
    const KEY = 'moto_cgu', SRV = 'moto_legal_srv', SITE = 'https://ridenct.fr', MAIL = 'FlowCal_Engineering@outlook.fr';
    // Textes : ceux publiés sur le serveur (gardés sur le téléphone, donc lisibles hors ligne) ; à défaut, ceux livrés avec l'appli (legal-textes.js).
    const KEYS = ['cgu', 'cgv', 'mentions', 'confidentialite'];
    const srvRd = () => { try { const o = JSON.parse(localStorage.getItem(SRV) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
    const T = () => { const s = srvRd(), o = {}; KEYS.forEach(k => { o[k] = s[k] || LEGAL_TEXTS[k]; }); return o; }, VER = () => T().cgu.version;
    // Un texte venu du serveur n'est jamais fait confiance : forme vérifiée, tailles limitées, et tout est échappé à l'affichage (rich)
    function valid(d) {
        const str = (v, n) => typeof v === 'string' && v.length <= n;
        if (!d || !/^\d{4}-\d{2}-\d{2}(\.\d+)?$/.test(d.version) || !str(d.title, 120) || !str(d.date || '', 60) || !Array.isArray(d.sections) || !d.sections.length || d.sections.length > 80) return false;
        return d.sections.every(s => s && typeof s.n === 'number' && str(s.t, 200) && Array.isArray(s.p) && s.p.length <= 60 &&
            s.p.every(p => str(p, 20000) || (p && Array.isArray(p.ul) && p.ul.length <= 60 && p.ul.every(i => str(i, 5000)))));
    }
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const uid = () => { try { const u = AppAuth.user(); return u && u.id; } catch (e) { return null; } };
    const rd = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } };
    const wr = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
    // Accepté = bonne version, et (si connu) par CE compte : un autre compte sur le même téléphone doit accepter à son tour
    function accepted() { const o = rd(), id = uid(); return !!(o && o.v === VER() && (!o.u || !id || o.u === id)); }
    const dFr = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } };

    // Texte → HTML sûr : [libellé](url), liens internes app:cgu|cgv|mentions, listes
    function rich(t) {
        return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((app:[a-z]+|https:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (m, l, u) => {
            if (u.startsWith('app:')) return '<a href="#" data-lg-doc="' + u.slice(4) + '">' + l + '</a>';
            return '<a href="' + u.replace(/&amp;/g, '&') + '" target="_blank" rel="noopener noreferrer">' + l + '</a>';
        });
    }
    // Image du texte : ![légende](img:nom) — uniquement les images livrées avec l'appli (core/legal-img/<nom>.png), jamais d'adresse venue du serveur
    const IMG = /^!\[([^\]]{0,120})\]\(img:([a-z0-9-]{1,40})\)$/;
    const para = (p) => { const m = p.match(IMG); return m ? '<figure class="lg-fig"><img src="core/legal-img/' + m[2] + '.png" alt="' + esc(m[1]) + '" loading="lazy" onerror="this.parentNode.style.display=\'none\'"></figure>' : '<p>' + rich(p) + '</p>'; };
    const body = (s) => s.p.map(p => typeof p === 'string' ? para(p) : '<ul>' + p.ul.map(i => '<li>' + rich(i) + '</li>').join('') + '</ul>').join('');

    // Envoi de l'acceptation au compte (best effort, réessayé au lancement suivant)
    async function sync() {
        const o = rd(); if (!o || o.s === 1 || o.v !== VER()) return;
        try { if (typeof AppAuth === 'undefined' || !AppAuth.has()) return; const r = await AppAuth.saveMeta({ cgu_version: o.v, cgu_at: o.at }); if (r && r.ok) { o.s = 1; wr(o); } } catch (e) {}
    }
    function record() { wr({ v: VER(), at: new Date().toISOString(), u: uid() || undefined, s: 0 }); sync(); }

    // Mise à jour automatique : l'éditeur publie un texte sur Supabase, l'appli le récupère (au lancement, au retour du réseau, une fois par jour)
    let busy = false, last = 0;
    async function refresh() {
        if (busy || typeof AppAuth === 'undefined') return; busy = true;
        try {
            const have = {}, t = T(); KEYS.forEach(k => { have[k] = t[k].version; });
            const r = await AppAuth.pub('legal_current', { p_have: have });
            if (!r || !r.ok || !r.json || typeof r.json !== 'object') return;
            last = Date.now();
            const srv = srvRd(); let ch = false;
            KEYS.forEach(k => { const d = r.json[k]; if (d && valid(d) && d.version.localeCompare(t[k].version, 'en', { numeric: true }) > 0) { srv[k] = { version: d.version, title: d.title, date: d.date || '', sections: d.sections }; ch = true; } });
            if (ch) { try { localStorage.setItem(SRV, JSON.stringify(srv)); } catch (e) {} check(true); }
        } catch (e) {} finally { busy = false; }
    }
    // Compte connecté qui n'a pas accepté la version en vigueur (nouvelle version publiée, ou jamais accepté) : écran d'acceptation
    function check(reopen) {
        try {
            if (typeof AppAuth === 'undefined' || !AppAuth.has() || accepted()) return;
            const g = document.getElementById('cgu-gate');
            if (g) { if (!reopen || g.dataset.v === VER()) return; g.remove(); }   // une version plus récente est arrivée pendant la lecture : on repart sur la bonne
            gate();
        } catch (e) {}
    }
    const kick = () => { if (Date.now() - last > 6 * 3600 * 1000) refresh(); };
    window.addEventListener('online', () => { last = 0; refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    document.addEventListener('DOMContentLoaded', () => setTimeout(refresh, 1500));

    // ---------------- Lecteur (CGU / CGV / Mentions) ----------------
    function view(doc) {
        let v = document.getElementById('lg-view');
        if (!v) {
            v = document.createElement('div'); v.id = 'lg-view'; v.className = 'lg-view';
            v.innerHTML = '<div class="lg-hd"><button type="button" class="lg-back" aria-label="Fermer"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button><b id="lg-vt"></b></div>' +
                '<div class="lg-tabs" role="tablist"><button type="button" data-d="cgu">CGU</button><button type="button" data-d="cgv">CGV</button><button type="button" data-d="mentions">Mentions</button><button type="button" data-d="confidentialite">Vie privée</button></div>' +
                '<div class="lg-sc" id="lg-vb"></div>';
            document.body.appendChild(v);
            v.querySelector('.lg-back').onclick = () => { v.classList.remove('show'); setTimeout(() => v.remove(), 200); };
            v.querySelectorAll('.lg-tabs button').forEach(b => b.onclick = () => show(b.dataset.d));
            v.addEventListener('click', (e) => { const a = e.target.closest('[data-lg-doc]'); if (a) { e.preventDefault(); show(a.dataset.lgDoc); } });
            requestAnimationFrame(() => v.classList.add('show'));
        }
        function show(d) {
            const x = T()[d]; if (!x) return;
            v.querySelectorAll('.lg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.d === d));
            v.querySelector('#lg-vt').textContent = x.title;
            const o = rd();
            let h = x.date ? '<div class="lg-ver">Version du ' + esc(x.date) + '</div>' : '';
            if (d === 'cgu') h += '<div class="lg-acc">' + (accepted() && o ? '✓ Acceptées le ' + esc(dFr(o.at)) + ' (version du ' + esc(dFr(x.version)) + ')' : 'Pas encore acceptées sur cet appareil') + '</div>';
            h += x.sections.map(s => '<section class="lg-s' + (s.sub ? ' sub' : '') + '"><h3>' + (s.n ? s.n + '. ' : '') + esc(s.t) + '</h3>' + body(s) + '</section>').join('');
            if (d === 'mentions' || d === 'confidentialite') h += '<section class="lg-s"><h3>Liens utiles</h3><p><a href="' + SITE + '/contact.html" target="_blank" rel="noopener noreferrer">Contact</a> · <a href="' + SITE + '/compte.html" target="_blank" rel="noopener noreferrer">Mon compte</a> · <a href="mailto:' + MAIL + '">' + MAIL + '</a></p></section>';
            const sc = v.querySelector('#lg-vb'); sc.innerHTML = h; sc.scrollTop = 0;
        }
        show(doc || 'cgu');
    }

    // ---------------- Écran d'acceptation (une case par point) ----------------
    function gate(opts) {
        opts = opts || {}; if (document.getElementById('cgu-gate')) return;
        const x = T().cgu, N = x.sections.length, ok = new Set();
        document.documentElement.classList.add('auth-pending');
        const g = document.createElement('div'); g.id = 'cgu-gate'; g.className = 'lg-gate'; g.dataset.v = VER();
        g.innerHTML = '<div class="lg-gin"><h1 class="lg-h1">Conditions d\'utilisation</h1>' +
            '<div class="lg-sub">Version du ' + esc(x.date) + '. Pour utiliser RideNCT, lis et <b>coche chaque point</b> des conditions. Touche un titre pour déplier son texte.</div>' +
            '<div class="lg-list">' + x.sections.map((s, i) => '<div class="lg-it" data-i="' + i + '"><div class="lg-row"><button type="button" class="lg-ck" role="checkbox" aria-checked="false" aria-label="J\'accepte le point ' + s.n + '"></button>' +
                '<button type="button" class="lg-tt"><span>' + s.n + '. ' + esc(s.t) + '</span><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></button></div><div class="lg-bd">' + body(s) + '</div></div>').join('') + '</div>' +
            '<div class="lg-ln"><a href="#" data-lg-doc="cgv">Conditions de vente</a> · <a href="#" data-lg-doc="mentions">Mentions légales</a> · <a href="#" data-lg-doc="confidentialite">Confidentialité</a></div></div>' +
            '<div class="lg-bar"><div class="lg-cnt"><span id="lg-n">0 / ' + N + '</span><i><u id="lg-p"></u></i></div>' +
            '<button type="button" class="lg-go" id="lg-go" disabled>J\'accepte et je continue</button><button type="button" class="lg-no" id="lg-no">Refuser et me déconnecter</button></div>';
        document.body.appendChild(g);
        const upd = () => {
            g.querySelector('#lg-n').textContent = ok.size + ' / ' + N; g.querySelector('#lg-p').style.width = (100 * ok.size / N) + '%';
            const go = g.querySelector('#lg-go'); go.disabled = ok.size < N; go.textContent = ok.size < N ? 'Coche les ' + (N - ok.size) + ' point' + (N - ok.size > 1 ? 's' : '') + ' restant' + (N - ok.size > 1 ? 's' : '') : 'J\'accepte et je continue';
        };
        g.addEventListener('click', (e) => {
            const a = e.target.closest('[data-lg-doc]'); if (a) { e.preventDefault(); view(a.dataset.lgDoc); return; }
            const it = e.target.closest('.lg-it'); if (!it) return; const i = +it.dataset.i;
            if (e.target.closest('.lg-ck')) { const on = !ok.has(i); on ? ok.add(i) : ok.delete(i); const b = it.querySelector('.lg-ck'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); it.classList.toggle('done', on); upd(); }
            else if (e.target.closest('.lg-tt')) it.classList.toggle('open');
        });
        g.querySelector('#lg-go').onclick = () => {
            if (ok.size < N) return; record(); g.remove(); document.getElementById('lg-view') && document.getElementById('lg-view').remove();
            if (!document.getElementById('auth-gate')) document.documentElement.classList.remove('auth-pending');
            if (opts.onAccept) opts.onAccept();
        };
        g.querySelector('#lg-no').onclick = () => { try { AppAuth.signOut(); } catch (e) { location.reload(); } };
        upd();
    }

    // Réglages : tuile « Informations légales » (tout en bas de la page d'accueil des réglages)
    document.addEventListener('click', (e) => { if (e.target.closest('[data-open-legal]')) { e.preventDefault(); view('cgu'); } });
    // Liens « CGU · CGV · Mentions légales » des écrans de connexion
    document.addEventListener('click', (e) => { const a = e.target.closest('[data-lg-open]'); if (a) { e.preventDefault(); view(a.dataset.lgOpen); } });
    return { accepted, gate, view, record, sync, refresh, check, version: VER };
})();
