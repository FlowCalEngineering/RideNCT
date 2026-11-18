// A6 · Badges des motards qui dépannent. Tout reste sur le téléphone ; une aide compte quand le demandeur la confirme (message signé « thx », voir aide.js).
const ModuleBadges = {
    KEY: 'rn_badges',
    DEFS: [
        { k: 'first', n: 'Premier secours', d: '1 aide', c: '#30d158', g: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>', ok: s => s.n >= 1 },
        { k: 'five', n: 'Dépanneur', d: '5 aides', c: '#ff9f0a', g: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>', ok: s => s.n >= 5, p: s => [s.n, 5] },
        { k: 'ten', n: 'Bon samaritain', d: '10 aides', c: '#0a84ff', g: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>', ok: s => s.n >= 10, p: s => [s.n, 10] },
        { k: 'legend', n: 'Légende', d: '25 aides', c: '#bf5af2', g: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>', ok: s => s.n >= 25, p: s => [s.n, 25] },
        { k: 'flat', n: 'Roi de la mèche', d: '1 crevaison', c: '#ff453a', g: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>', ok: s => s.kd.flat >= 1 },
        { k: 'fuel', n: "Sauveur d'essence", d: '3 bidons', c: '#ff9f0a', g: '<path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17M3 22h10M6 8h4"/><path d="M13 11h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V9l-3-3"/>', ok: s => s.kd.fuel >= 3, p: s => [s.kd.fuel, 3] },
        { k: 'night', n: 'Chouette', d: 'aide après 22 h', c: '#5e5ce6', g: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', ok: s => s.night >= 1 },
        { k: 'loyal', n: 'Fidèle', d: '3 motards aidés', c: '#32ade6', g: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>', ok: s => s.who >= 3, p: s => [s.who, 3] }
    ],
    ico(b, on, px) { return `<i class="aide-bi${on ? '' : ' off'}" style="${on ? 'border-color:' + b.c + ';color:' + b.c + ';' : ''}${px ? 'width:' + px + 'px;height:' + px + 'px;' : ''}"><svg class="vi" viewBox="0 0 24 24">${b.g}</svg></i>`; },
    load() { try { const d = JSON.parse(localStorage.getItem(this.KEY) || '{}'); return { helps: Array.isArray(d.helps) ? d.helps : [], shown: Array.isArray(d.shown) ? d.shown : [] }; } catch (e) { return { helps: [], shown: [] }; } },
    save(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} },
    stats(d) {
        d = d || this.load(); const kd = { flat: 0, fuel: 0, mech: 0, batt: 0 }; let night = 0; const who = new Set();
        d.helps.forEach(h => { if (kd[h.kd] != null) kd[h.kd]++; const hr = new Date(h.ts).getHours(); if (hr >= 22 || hr < 5) night++; if (h.who) who.add(h.who); });
        return { n: d.helps.length, kd, night, who: who.size };
    },
    earned(d) { const s = this.stats(d); return this.DEFS.filter(b => b.ok(s)).map(b => b.k); },
    // Une aide confirmée ; renvoie les badges nouvellement gagnés
    add(h) {
        const d = this.load(); if (!h || !h.id || d.helps.some(x => x.id === h.id)) return [];
        const before = this.earned(d); d.helps.push({ id: h.id, kd: h.kd, ts: h.ts || Date.now(), who: h.who || '' }); if (d.helps.length > 500) d.helps.shift();
        const nw = this.earned(d).filter(k => !before.includes(k)); d.shown = d.shown.concat(nw); this.save(d);
        try { if (typeof ModuleProfile !== 'undefined') ModuleProfile.saveData(); } catch (e) {}
        try { this.render(); if (typeof ModuleAide !== 'undefined') ModuleAide.renderPage(); } catch (e) {}
        const list = this.DEFS.filter(b => nw.includes(b.k));
        if (list.length) { try { const b0 = list[0]; AppDialog.alert(list.map(b => `${b.n} (${b.d})`).join('\n'), { title: list.length > 1 ? 'Nouveaux badges' : 'Nouveau badge', okText: 'OK', icon: { g: b0.g, c: b0.c } }); } catch (e) {} }
        return nw;
    },
    summary() {
        const s = this.stats(), e = this.earned(), top = this.DEFS.filter(b => e.includes(b.k) && b.p).pop(), nxt = this.DEFS.find(b => b.p && !b.ok(s));
        const name = top ? top.n : (e.length ? this.DEFS.find(b => b.k === e[0]).n : 'Aucun badge');
        const pr = nxt ? nxt.p(s) : null;
        return `<button type="button" class="card sec-card aide-bdg" id="aide-bdg"><span class="sec-h" style="margin:0">Mes badges</span><b class="aide-nm">${name} · ${s.n} aide${s.n > 1 ? 's' : ''}</b>${pr ? `<span class="sec-hint" style="margin:0">Prochain badge : ${nxt.d}</span><span class="aide-bar"><i style="width:${Math.min(100, Math.round(100 * pr[0] / pr[1]))}%"></i></span>` : `<span class="sec-hint" style="margin:0">${s.n ? 'Tous les paliers atteints' : 'Aide un motard pour gagner ton premier badge'}</span>`}</button>`;
    },
    // Profil : bandeau « Trophées » + badge principal à côté du pseudo ; un appui ouvre la feuille complète
    // Trophées d'un autre motard (reçus avec son profil)
    otherHtml(keys) {
        const on = this.DEFS.filter(b => keys.includes(b.k)); if (!on.length) return '';
        return `<div style="width:100%;max-width:480px"><div class="comm-label"><span>Trophées · ${on.length} / ${this.DEFS.length}</span></div><div class="pf-tr-row" style="justify-content:center;flex-wrap:wrap">${on.map(b => this.ico(b, true, 46)).join('')}</div><div style="font-size:.75rem;color:var(--text-muted);margin-top:8px;font-weight:600">${on.map(b => b.n).join(' · ')}</div></div>`;
    },
    renderProfile() {
        const st = document.getElementById('pf-trophy'), mn = document.getElementById('profile-main-badge'); const e = this.earned(), on = this.DEFS.filter(b => e.includes(b.k));
        if (mn) { const top = on.filter(b => ['first', 'five', 'ten', 'legend'].includes(b.k)).pop() || on[0]; mn.innerHTML = top ? `<svg class="vi" viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg> ${top.n}` : ''; mn.style.display = top ? '' : 'none'; }
        if (!st) return;
        const shown = on.slice(0, 5).map(b => this.ico(b, true, 44)).join('') + this.DEFS.filter(b => !e.includes(b.k)).slice(0, Math.max(0, 5 - on.length)).map(b => this.ico(b, false, 44)).join('');
        st.innerHTML = `<div class="pf-tr-h"><span>Trophées · ${on.length} / ${this.DEFS.length}</span><span>Voir tout ›</span></div><div class="pf-tr-row">${shown}</div>`;
        st.onclick = () => this.openSheet();
    },
    openSheet() {
        const old = document.getElementById('badges-ov'); if (old) old.remove();
        const s = this.stats(), e = this.earned(), o = document.createElement('div'); o.id = 'badges-ov'; o.className = 'rp-overlay aide-ov';
        o.innerHTML = `<div class="rp-sheet aide-sh"><div class="aide-hd"><b>Trophées</b><button type="button" class="aide-x" aria-label="Fermer">✕</button></div><div class="aide-bg">${this.DEFS.map(b => { const on = e.includes(b.k), p = !on && b.p ? b.p(s) : null; return `<div class="aide-b${on ? '' : ' off'}">${this.ico(b, on)}<b>${b.n}</b><small>${on ? b.d + ' ✓' : (p ? p[0] + ' / ' + p[1] : b.d)}</small></div>`; }).join('')}</div><p class="aide-note">Visibles par les motards que tu croises, sur ton profil.</p></div>`;
        document.body.appendChild(o);
        o.addEventListener('click', ev => { if (ev.target === o || ev.target.closest('.aide-x')) o.remove(); });
    },
    render() {
        this.renderProfile();
        const pg = document.getElementById('badges-page'); if (!pg) return;
        const s = this.stats(), e = this.earned();
        pg.innerHTML = `<div class="card security-card aide-st"><div class="sensor-title">Aides reçues et confirmées</div><h2 class="sensor-status">${s.n}</h2></div>
            <div class="aide-bg">${this.DEFS.map(b => { const on = e.includes(b.k), p = !on && b.p ? b.p(s) : null; return `<div class="aide-b${on ? '' : ' off'}">${this.ico(b, on)}<b>${b.n}</b><small>${on ? b.d + ' ✓' : (p ? p[0] + ' / ' + p[1] : b.d)}</small></div>`; }).join('')}</div>
            <div class="sec-hint">Un badge se gagne quand le motard que tu as dépanné confirme ton aide. Les badges sont visibles par les motards que tu croises, sur ton profil.</div>`;
    }
};
document.addEventListener('DOMContentLoaded', () => ModuleBadges.render());
setTimeout(() => ModuleBadges.render(), 1000);
