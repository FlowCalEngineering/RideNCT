// Alertes prédictives : règles sur les profils de trajet (A2) → bloc « À surveiller », carte après trajet, notification locale.
// Étend ModuleMaintenance : chargé APRÈS usure.js. Rien ne part sur Internet.
Object.assign(ModuleMaintenance, {
    PRED: { sin: 50, lo: 0.4, rainDays: 3, ratioTyre: 0.5, ratioPads: 0.6, etaDays: 7, cooldownDays: 3, later: 7, checked: 14 },
    predIcon(kind) {
        const p = { tyre: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>', chain: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/>', pads: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>', eta: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' }[kind];
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
    },
    predSnoozed(key) { return (this.state.extra.notified['predz:' + key] || 0) > Date.now(); },
    predSnooze(key, days) { this.state.extra.notified['predz:' + key] = Date.now() + days * 86400000; this.save('extra'); },
    // Liste des alertes en cours pour une moto : [{ key, kind, title, text, task }]
    predictions(moto, now) {
        const out = [], P = this.PRED, day = 86400000; now = now || Date.now();
        if (!moto) return out;
        const tasks = this.state.tasks.filter(t => t.motoId === moto.id && !this.isDateUnit(t.unit));
        const rides = this.state.extra.rides.filter(r => r.motoId === moto.id && r.sin !== undefined).sort((a, b) => b.t - a.t);
        const wavg = (list, f) => { const km = list.reduce((a, r) => a + r.km, 0); return km > 0 ? list.reduce((a, r) => a + f(r) * r.km, 0) / km : 0; };
        const dow = new Date(now).getDay(), when = (dow >= 1 && dow <= 4) ? 'avant ce week-end' : 'avant ta prochaine sortie';
        const push = (key, kind, title, text, task) => { if (!this.predSnoozed(key)) out.push({ key, kind, title, text, task }); };
        // Pneus : sorties très sinueuses
        const last3 = rides.filter(r => now - r.t < 14 * day).slice(0, 3);
        if (last3.length) {
            const sin = Math.round(wavg(last3, r => r.sin));
            if (sin >= P.sin) tasks.filter(t => /pneu/i.test(t.title)).forEach(t => {
                const st = this.taskStatus(t, moto); if (st.ratio < P.ratioTyre) return;
                push('pneu:' + t.id, 'tyre', `${t.title} à vérifier`, `Tes dernières sorties étaient très sinueuses (${sin} °/km). Usure estimée : ${Math.round(st.pct)} %. Vérifie-le ${when}.`, t);
            });
        }
        // Chaîne : trajet sous la pluie, pas encore graissée depuis
        const wet = rides.find(r => (r.rain || 0) >= 0.5 && now - r.t < P.rainDays * day);
        if (wet) {
            const ch = tasks.filter(t => /cha[iî]ne/i.test(t.title)), t = ch.find(x => /graiss/i.test(x.title)) || ch[0];
            if (t && !(this.num(t.lastDate) > wet.t)) push('chaine:' + wet.id, 'chain', 'Chaîne à entretenir', `Tu as roulé sous la pluie ${now - wet.t < 1.5 * day ? 'hier' : 'récemment'} : pense à nettoyer et graisser ta chaîne.`, t);
        }
        // Plaquettes : beaucoup de trafic lent
        const week = rides.filter(r => now - r.t < 7 * day);
        if (week.length && wavg(week, r => r.lo) >= P.lo) tasks.filter(t => /plaquette/i.test(t.title)).forEach(t => {
            const st = this.taskStatus(t, moto); if (st.ratio < P.ratioPads) return;
            push('plaq:' + t.id, 'pads', `${t.title} à contrôler`, `Beaucoup de trafic lent récemment : contrôle-les (usure estimée ${Math.round(st.pct)} %).`, t);
        });
        // Échéance proche à ton rythme actuel
        tasks.forEach(t => {
            const st = this.taskStatus(t, moto); if (st.level === 'over') return;
            const eta = this.etaOf(t, moto, st); if (!eta) return;
            const d = Math.ceil((eta - now) / day);
            if (d <= P.etaDays) push('eta:' + t.id, 'eta', t.title, `À ton rythme actuel, il sera dû ${d <= 1 ? 'demain' : `d'ici ${d} jours`}.`, t);
        });
        return out;
    },
    // Bloc « À surveiller » en haut de la page À prévoir
    renderWatch(moto) {
        const box = this.$('atelier-watch'); if (!box) return;
        const list = this.predictions(moto);
        if (!list.length) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="watch-sec">À SURVEILLER</div>';
        list.forEach(p => {
            const c = document.createElement('div'); c.className = 'watch-card';
            c.innerHTML = `<div class="watch-r"><div class="watch-i">${this.predIcon(p.kind)}</div><div><b>${this.esc(p.title)}</b><p>${this.esc(p.text)}</p></div></div>
                <div class="watch-b"><button type="button" class="later">Plus tard</button><button type="button" class="ok">${p.kind === 'tyre' ? 'Vérifié' : 'Fait'}</button></div>`;
            c.querySelector('.later').addEventListener('click', () => { this.predSnooze(p.key, this.PRED.later); this.renderForecasts(); });
            c.querySelector('.ok').addEventListener('click', () => {
                if (p.kind === 'tyre' || p.kind === 'chain' || p.kind === 'pads') { this.predSnooze(p.key, this.PRED.checked); this.renderForecasts(); }
                else this.openDoneSheet(p.task);
            });
            box.appendChild(c);
        });
    },
    // Après un trajet : carte dans l'app (une fois tous les 3 jours par alerte) + notification locale le lendemain à 9 h
    predictNotify(moto) {
        try {
            const nt = this.state.extra.notified, now = Date.now(); let changed = false;
            this.predictions(moto, now).forEach(p => {
                const k = 'pred:' + p.key; if (now - (nt[k] || 0) < this.PRED.cooldownDays * 86400000) return;
                nt[k] = now; changed = true;
                this.notify(p.title, p.text);
                this.predSchedule(p, now);
            });
            if (changed) this.save('extra');
        } catch (e) { console.error('predictNotify', e); }
    },
    async predSchedule(p, now) {
        try {
            const R = typeof ModuleReminders !== 'undefined' ? ModuleReminders : null, L = R && R.plug(); if (!L || !R.enabled()) return;
            if (L.checkPermissions) { const c = await L.checkPermissions(); if (!c || c.display !== 'granted') return; }
            const d = new Date(now + 2 * 3600000); d.setDate(d.getDate() + (d.getHours() >= 9 ? 1 : 0)); d.setHours(9, 0, 0, 0);
            await L.schedule({ notifications: [{ id: R.hash('pred:' + p.key), title: p.title, body: p.text, schedule: { at: d, allowWhileIdle: true }, extra: { vroom: 'pred', key: p.key } }] });
        } catch (e) {}
    }
});
