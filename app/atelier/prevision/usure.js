// Usure réelle par pièce : les km sont pondérés par la façon de rouler (virages, vitesse, pluie).
// Étend ModuleMaintenance : chargé APRÈS prevision.js. Chaque trajet GPS enregistre un profil (sin °/km, hi/lo parts de temps, rain 0..1).
Object.assign(ModuleMaintenance, {
    WEAR_DAYS: 30,
    // Pièce → facteurs d'usure (poids de chaque facteur dans le coefficient)
    WEAR_KINDS: [
        { re: /pneu/i, w: { s: 0.5, hi: 0.3 } },
        { re: /plaquette|disque/i, w: { s: 0.4, lo: 0.4 } },
        { re: /cha[iî]ne/i, w: { rain: 0.4, hi: 0.3, s: 0.1 } },
        { re: /vidange|filtre|bougie/i, w: { hi: 0.2, lo: 0.3 } }
    ],
    WEAR_WHY: { s: 'virages', hi: 'vitesse', lo: 'trafic lent', rain: 'pluie' },
    wearKind(task) { if (!task || this.isDateUnit(task.unit)) return null; return this.WEAR_KINDS.find(k => k.re.test(task.title || '')) || null; },
    // Facteurs 0..1 d'un trajet
    rideF(r) { return { s: Math.max(0, Math.min(1, (r.sin || 0) / 80)), hi: r.hi || 0, lo: r.lo || 0, rain: r.rain || 0 }; },
    // Usure supplémentaire (en km ou h) depuis le dernier entretien de la pièce : null si aucun trajet profilé
    wearOf(task, moto, used) {
        const kind = this.wearKind(task), since = this.num(task.lastDate);
        if (!kind || !since || used <= 0) return null;
        let extra = 0, nom = 0; const part = { s: 0, hi: 0, lo: 0, rain: 0 };
        this.state.extra.rides.forEach(r => {
            if (r.motoId !== moto.id || r.t <= since || r.sin === undefined) return;
            const amount = task.unit === 'km' ? r.km : r.hr, f = this.rideF(r); let c = 0;
            Object.keys(kind.w).forEach(k => { const v = kind.w[k] * f[k]; c += v; part[k] += v * amount; });
            extra += c * amount; nom += amount;
        });
        if (nom <= 0 || extra <= 0) return null;
        const coef = 1 + extra / Math.max(used, nom);
        if (coef < 1.05) return null;
        const top = Object.keys(part).sort((a, b) => part[b] - part[a])[0];
        return { extra, coef, why: this.WEAR_WHY[top] };
    },
    // Bloc « Ton roulage » : moyenne des trajets profilés sur 30 jours
    renderRiding(moto) {
        const box = this.$('atelier-riding'); if (!box) return;
        const since = Date.now() - this.WEAR_DAYS * 86400000;
        const rs = this.state.extra.rides.filter(r => moto && r.motoId === moto.id && r.t >= since && r.sin !== undefined);
        const km = rs.reduce((a, r) => a + r.km, 0), hr = rs.reduce((a, r) => a + r.hr, 0);
        if (km < 5 || hr <= 0) { box.innerHTML = ''; return; }
        const sin = rs.reduce((a, r) => a + r.sin * r.km, 0) / km;
        const rainKm = rs.reduce((a, r) => a + (r.rain || 0) * r.km, 0) / km;
        const lab = sin < 20 ? 'Roulant' : sin < 50 ? 'Mixte' : 'Sinueux';
        box.innerHTML = `<div class="riding-card"><b>TON ROULAGE · ${this.WEAR_DAYS} DERNIERS JOURS</b><div class="riding-chips">
            <div><b>${lab}</b><span>${this.fmt(sin)} °/km</span></div><div><b>${this.fmt(km / hr)} km/h</b><span>vitesse moy.</span></div><div><b>${this.fmt(rainKm * 100)} %</b><span>sous la pluie</span></div></div></div>`;
    }
});
