// Sondage RideNCT : questions affichées par étapes, réponses envoyées à Supabase (fonction submit_survey).
(function () {
  "use strict";
  var cfg = window.RIDENCT || {};
  var root = document.getElementById("survey");
  if (!root) return;

  // type : one = choix unique, multi = plusieurs choix (max = limite), text = texte libre
  var STEPS = [
    { t: "Profil du motard", s: "Pour mieux te connaître.", q: [
      { id: "permis", t: "Quel type de permis / véhicule conduisez-vous ?", k: "one", o: ["125 cm³ (permis B ou A1)", "Moto A2", "Moto grosse cylindrée (permis A)", "Scooter", "Je prépare mon permis", "Autre"] },
      { id: "usage", t: "Quel est votre usage principal de la moto ?", k: "one", o: ["Balades loisir", "Trajets quotidiens (domicile-travail)", "Road trips et grands voyages", "Sorties en groupe ou en club", "Circuit ou piste", "Tout-terrain"] },
      { id: "route", t: "Quel type de route préférez-vous ?", k: "one", o: ["Routes sinueuses de campagne", "Cols de montagne", "Autoroute et voies rapides", "Ville", "Chemins et off-road", "Un peu de tout"] },
      { id: "frequence", t: "À quelle fréquence roulez-vous ?", k: "one", o: ["Tous les jours", "Plusieurs fois par semaine", "Chaque week-end", "Quelques fois par mois", "Quelques fois par an"] },
      { id: "avec_qui", t: "Avec qui roulez-vous ?", k: "multi", o: ["Seul(e)", "En duo (passager)", "Avec des amis", "En club ou association", "Avec des motards rencontrés en ligne"] }
    ] },
    { t: "Habitudes et outils actuels", s: "Comment tu roules aujourd'hui.", q: [
      { id: "style", t: "Comment roulez-vous ?", k: "one", o: ["Tranquille, je profite du paysage", "Dynamique", "Sportif", "Voyageur, longues distances", "Ça dépend des jours"] },
      { id: "apps", t: "Quelles applications utilisez-vous déjà sur la route ?", k: "multi", o: ["Google Maps", "Waze", "Calimoto", "Kurviger", "Rever", "Apple Plans", "GPS moto dédié (Garmin, TomTom…)", "Aucune", "Autre"] },
      { id: "intercom", t: "Avez-vous un intercom connecté dans votre casque ?", k: "one", o: ["Oui", "Non, mais j'aimerais", "Non, et je n'en ai pas besoin"] },
      { id: "communication", t: "Comment communiquez-vous sur la route ?", k: "multi", o: ["Gestes et signes", "Intercom de casque", "Appel téléphone Bluetooth", "Talkie-walkie", "Arrêts réguliers", "Je ne communique pas"] },
      { id: "agacements", t: "Qu'est-ce qui vous agace le plus dans les apps actuelles ?", k: "multi", max: 3, o: ["Interface trop chargée ou compliquée", "Abonnements chers", "Itinéraires pas adaptés à la moto", "Pas de mode hors ligne", "Batterie qui se vide", "Pas d'intercom intégré", "Vie privée et données revendues", "Rien de particulier"], x: "agacements_precision", xp: "Autre chose qui t'agace ? (facultatif)" }
    ] },
    { t: "Besoins et fonctionnalités clés", s: "Tes besoins sont notre priorité.", q: [
      { id: "plus_utiles", t: "Parmi ces fonctionnalités, lesquelles vous seraient les plus utiles ?", k: "multi", max: 4, o: ["GPS pensé pour la moto", "Intercom vocal entre motards", "Radar des motards autour de moi", "Suivi de la position de mes amis", "Alertes de dangers sur la route", "Carnet d'entretien de la moto", "Alerte en cas de chute", "Météo et pluie sur le trajet", "Cartes hors ligne", "Planificateur d'itinéraire"] },
      { id: "navigation", t: "Pour la navigation, qu'attendez-vous en priorité d'une app moto ?", h: "Choisis tes 2 préférées.", k: "multi", max: 2, o: ["Routes sinueuses et panoramiques", "Éviter autoroutes et péages", "Cartes hors ligne", "Dangers et radars en temps réel", "Virages, altitude et pente", "Partage d'itinéraire avec le groupe", "Guidage vocal clair", "Stations-service selon l'autonomie"] },
      { id: "audio", t: "Quelle fonctionnalité audio / vocale vous intéresse le plus en roulant ?", k: "one", o: ["Intercom entre motards", "Musique partagée avec le groupe", "Guidage vocal", "Commandes vocales mains libres", "Appels et messages", "Aucune"] },
      { id: "services", t: "Parmi ces services intégrés, lesquels utiliseriez-vous vraiment ?", h: "Coche tout ce qui s'applique.", k: "multi", o: ["Radar des amis", "Carnet d'entretien", "Garage avec plusieurs motos", "Alerte de chute", "Communauté et événements", "Mode rencontre entre motards", "Météo", "Partage de musique"] },
      { id: "indispensables", t: "Si vous deviez choisir seulement 2 fonctionnalités indispensables au lancement :", k: "multi", max: 2, o: ["GPS moto", "Intercom vocal", "Radar des motards", "Alertes de dangers", "Carnet d'entretien", "Alerte de chute", "Planificateur d'itinéraire", "Cartes hors ligne"] },
      { id: "reve", t: "Y a-t-il une fonctionnalité dont vous rêvez et qui n'existe nulle part ailleurs ?", k: "text", ph: "Dis-nous tout (facultatif)" },
      { id: "payer", t: "Seriez-vous prêt(e) à payer pour une application moto complète ?", k: "one", o: ["Oui, par abonnement mensuel", "Oui, par achat unique", "Peut-être, selon le prix", "Non, uniquement gratuit"] }
    ] },
    { t: "Dernière étape", s: "Merci d'avoir répondu jusque-là.", q: [
      { id: "beta", t: "Souhaitez-vous tester l'application en avant-première (bêta) ?", k: "one", o: ["Oui", "Peut-être", "Non"] }
    ], mail: true }
  ];

  var ans = {}, extra = {}, mail = "", step = 0, sending = false;
  var el = function (tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  var ok = function (v) { return Array.isArray(v) ? v.length > 0 : !!v; };

  function render() {
    root.innerHTML = "";
    var S = STEPS[step], total = STEPS.length;
    var head = el("div", "sv-head");
    head.appendChild(el("p", "sv-step", "Étape " + (step + 1) + " sur " + total));
    var bar = el("div", "sv-bar"); bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", total); bar.setAttribute("aria-valuenow", step);
    var fill = el("span"); fill.style.width = Math.round(step / total * 100) + "%"; bar.appendChild(fill); head.appendChild(bar);
    head.appendChild(el("h2", "", S.t)); head.appendChild(el("p", "sv-sub", S.s));
    root.appendChild(head);
    var hp = el("input", "hp"); hp.name = "hp_url"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.setAttribute("aria-hidden", "true"); hp.setAttribute("aria-label", "Ne pas remplir"); root.appendChild(hp);

    S.q.forEach(function (q, qi) {
      var f = el("fieldset", "sv-q"); var lg = el("legend", "", q.t); f.appendChild(lg);
      if (q.h || q.k === "multi") f.appendChild(el("p", "sv-hint", q.h || (q.max ? "Jusqu'à " + q.max + " choix." : "Plusieurs choix possibles.")));
      if (q.k === "text") {
        var ta = el("textarea"); ta.rows = 3; ta.maxLength = 600; ta.placeholder = q.ph || ""; ta.value = ans[q.id] || ""; ta.setAttribute("aria-label", q.t);
        ta.addEventListener("input", function () { ans[q.id] = ta.value.trim(); });
        f.appendChild(ta);
      } else {
        var g = el("div", "sv-opts");
        q.o.forEach(function (o, oi) {
          var id = "q" + step + "_" + qi + "_" + oi, lab = el("label", "sv-opt"), inp = el("input");
          inp.type = q.k === "one" ? "radio" : "checkbox"; inp.name = q.id; inp.id = id; inp.value = o;
          var cur = ans[q.id]; inp.checked = q.k === "one" ? cur === o : Array.isArray(cur) && cur.indexOf(o) >= 0;
          inp.addEventListener("change", function () {
            if (q.k === "one") { ans[q.id] = o; }
            else {
              var a = Array.isArray(ans[q.id]) ? ans[q.id].slice() : [];
              var i = a.indexOf(o);
              if (inp.checked) { if (q.max && a.length >= q.max) { inp.checked = false; hint(f, "Tu peux choisir " + q.max + " réponse" + (q.max > 1 ? "s" : "") + " au maximum."); return; } a.push(o); }
              else if (i >= 0) a.splice(i, 1);
              ans[q.id] = a;
            }
            clearErr();
            if (S.mail) toggleMail();
          });
          lab.appendChild(inp); lab.appendChild(el("span", "", o)); g.appendChild(lab);
        });
        f.appendChild(g);
        if (q.x) {
          var t2 = el("input", "sv-x"); t2.type = "text"; t2.maxLength = 200; t2.placeholder = q.xp || ""; t2.value = extra[q.x] || ""; t2.setAttribute("aria-label", q.xp || "Précision");
          t2.addEventListener("input", function () { extra[q.x] = t2.value.trim(); }); f.appendChild(t2);
        }
      }
      root.appendChild(f);
    });

    if (S.mail) {
      var mb = el("div", "sv-mail"); mb.id = "sv-mail";
      var lb = el("label"); lb.appendChild(el("span", "", "Ton e-mail, pour te prévenir si tu es retenu(e) pour la bêta"));
      var inp = el("input"); inp.type = "email"; inp.autocomplete = "email"; inp.placeholder = "ton@email.fr"; inp.maxLength = 254; inp.value = mail;
      inp.addEventListener("input", function () { mail = inp.value.trim(); });
      lb.appendChild(inp); mb.appendChild(lb);
      var lg2 = el("p", "sv-legal"); lg2.innerHTML = 'Facultatif. Utilisé uniquement pour la bêta, jamais transmis. <a href="confidentialite.html">Confidentialité</a>';
      mb.appendChild(lg2); root.appendChild(mb); toggleMail();
    }

    var err = el("p", "sv-err"); err.setAttribute("role", "alert"); err.id = "sv-err"; root.appendChild(err);
    var nav = el("div", "sv-nav");
    if (step > 0) { var b = el("button", "btn btn-ghost", "← Retour"); b.type = "button"; b.addEventListener("click", function () { step--; render(); top(); }); nav.appendChild(b); }
    var n = el("button", "btn btn-primary", step === total - 1 ? "Envoyer mes réponses" : "Suivant →"); n.type = "button"; n.id = "sv-next";
    n.addEventListener("click", next); nav.appendChild(n); root.appendChild(nav);
  }
  function toggleMail() { var m = document.getElementById("sv-mail"); if (m) m.hidden = !(ans.beta === "Oui" || ans.beta === "Peut-être"); }
  function hint(f, t) { var e = document.getElementById("sv-err"); if (e) e.textContent = t; }
  function clearErr() { var e = document.getElementById("sv-err"); if (e) e.textContent = ""; }
  function top() { var h = root.getBoundingClientRect().top + window.scrollY - 90; window.scrollTo({ top: Math.max(0, h), behavior: "auto" }); }

  function next() {
    var S = STEPS[step], e = document.getElementById("sv-err");
    for (var i = 0; i < S.q.length; i++) { var q = S.q[i]; if (q.k !== "text" && !ok(ans[q.id])) { e.textContent = "Réponds à : « " + q.t + " »"; return; } }
    if (S.mail && !document.getElementById("sv-mail").hidden && mail && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(mail)) { e.textContent = "Cette adresse e-mail n'est pas valide."; return; }
    if (step < STEPS.length - 1) { step++; render(); top(); return; }
    send();
  }

  function send() {
    if (sending) return;
    var hp = root.querySelector(".hp"); if (hp && hp.value) { done(); return; }
    var payload = {}; Object.keys(ans).forEach(function (k) { if (ok(ans[k])) payload[k] = ans[k]; });
    Object.keys(extra).forEach(function (k) { if (extra[k]) payload[k] = extra[k]; });
    var wantsMail = ans.beta === "Oui" || ans.beta === "Peut-être";
    var btn = document.getElementById("sv-next"), e = document.getElementById("sv-err");
    if (!cfg.supabaseUrl || !cfg.supabaseKey) { e.textContent = "Le sondage n'est pas disponible pour le moment."; return; }
    sending = true; btn.disabled = true; btn.textContent = "Envoi…";
    fetch(cfg.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/rpc/submit_survey", { method: "POST", headers: { apikey: cfg.supabaseKey, Authorization: "Bearer " + cfg.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_answers: payload, p_email: wantsMail && mail ? mail : null, p_survey: "v1" }) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(/rate_limit/.test((j && j.message) || "") ? "rate" : "fail"); }, function () { throw new Error("fail"); });
        done();
      })
      .catch(function (er) {
        e.textContent = er && er.message === "rate" ? "Trop d'envois depuis ta connexion. Réessaie un peu plus tard." : "L'envoi a échoué. Vérifie ta connexion et réessaie.";
        sending = false; btn.disabled = false; btn.textContent = "Envoyer mes réponses";
      });
  }
  function done() {
    try { localStorage.setItem("rn_survey", JSON.stringify({ t: Date.now(), done: true })); } catch (e) { }
    root.innerHTML = "";
    var c = el("div", "sv-done");
    c.appendChild(el("h2", "", "Merci, c'est envoyé !"));
    c.appendChild(el("p", "", "Tes réponses nous aident à construire l'application que les motards attendent vraiment."));
    var r = el("div", "cta-row");
    var a = el("a", "btn btn-primary", "Essayer le planificateur"); a.href = "planificateur.html";
    var b = el("a", "btn btn-ghost", "Retour à l'accueil"); b.href = "./";
    r.appendChild(a); r.appendChild(b); c.appendChild(r); root.appendChild(c); top();
  }
  render();
})();
