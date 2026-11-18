// Rappels locaux (notifications Capacitor) : échéance des documents (CT, assurance…) et entretiens datés.
// Rien ne part sur Internet : le téléphone programme lui-même les notifications. Tout est replanifié à chaque modification.
const ModuleReminders = {
    OFFSETS: [30, 7, 1, 0], HOUR: 9, MAX: 50, _t: null,
    plug() { try { const P = window.Capacitor && window.Capacitor.Plugins; return (P && P.LocalNotifications) || null; } catch (e) { return null; } },
    enabled() { return AppPrefs.get('remind') !== 'off'; },
    hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 2000000000 + 1; },
    // Liste des rappels à programmer : [{ key, at(ms), title, body }]
    compute(now) {
        const M = ModuleMaintenance, out = [], day = 86400000; now = now || Date.now();
        const at = (due, off) => { const d = new Date(due - off * day); d.setHours(this.HOUR, 0, 0, 0); return d.getTime(); };
        const push = (key, due, off, title, body) => { const t = at(due, off); if (t > now + 60000) out.push({ key: key + '|' + off, at: t, title, body }); };
        const when = (off) => off === 0 ? "aujourd'hui" : off === 1 ? 'demain' : `dans ${off} jours`;
        let motos = []; try { motos = M.motos(); } catch (e) {}
        const names = {}; motos.forEach(m => { names[m.id] = M.motoName(m); });
        ((M.state.extra && M.state.extra.docs) || []).forEach(d => {
            if (!d.expires || !(d.motoId in names)) return;
            const label = d.label || ((M.DOC_TYPES.find(x => x.id === d.type) || {}).label) || 'Document';
            this.OFFSETS.forEach(off => push('doc:' + d.id, d.expires, off, label + (off === 0 ? ' : échéance' : ' : bientôt'), `${names[d.motoId] || 'Ta moto'} · expire ${when(off)}.`));
        });
        (M.state.tasks || []).forEach(t => {
            if (!(t.motoId in names)) return;
            let due = null;
            try {
                if (M.isDateUnit(t.unit)) due = M.num(t.last) + M.num(t.interval) * M.periodDays(t.unit) * day;
                else if (M.num(t.months) > 0 && M.num(t.lastDate) > 0) due = M.num(t.lastDate) + M.num(t.months) * 30.4375 * day;
            } catch (e) {}
            if (!due || !isFinite(due)) return;
            [7, 1, 0].forEach(off => push('task:' + t.id, due, off, 'Entretien : ' + (t.title || 'à faire'), `${names[t.motoId] || 'Ta moto'} · à faire ${when(off)}.`));
        });
        out.sort((a, b) => a.at - b.at);
        return out.slice(0, this.MAX);
    },
    async sync() {
        const L = this.plug(); if (!L) return false;
        try {
            const pend = L.getPending ? await L.getPending() : { notifications: [] };
            const mine = (pend.notifications || []).filter(n => n.extra && n.extra.vroom === 'rem');
            if (mine.length && L.cancel) await L.cancel({ notifications: mine.map(n => ({ id: n.id })) });
            if (!this.enabled()) return true;
            if (L.checkPermissions) { const p = await L.checkPermissions(); if (!p || p.display !== 'granted') return false; }
            const list = this.compute(), seen = new Set(), notifications = [];
            list.forEach(r => { let id = this.hash(r.key); while (seen.has(id)) id++; seen.add(id); notifications.push({ id, title: r.title, body: r.body, schedule: { at: new Date(r.at), allowWhileIdle: true }, extra: { vroom: 'rem', key: r.key } }); });
            if (notifications.length) await L.schedule({ notifications });
            this.planned = notifications.length;
            return true;
        } catch (e) { return false; }
    },
    soon() { clearTimeout(this._t); this._t = setTimeout(() => this.sync(), 1500); },
    init() {
        const M = ModuleMaintenance;
        if (!M.__remWrapped) {
            M.__remWrapped = true;
            const save = M.save; M.save = function (w) { const r = save.apply(this, arguments); try { if (w === 'tasks' || w === 'extra' || w === 'all') ModuleReminders.soon(); } catch (e) {} return r; };
        }
        document.addEventListener('prefchange', (e) => { if (e.detail.key === 'remind') this.soon(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.soon(); });
        this.soon(); setTimeout(() => this.soon(), 6000);
    }
};
