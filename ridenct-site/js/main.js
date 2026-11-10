(function () {
  var cfg = window.RIDENCT || {};
  var page = document.body.getAttribute("data-page") || "";

  var links = [
    ["fonctionnalites.html", "Fonctionnalités", "features"],
    ["planificateur.html", "Planificateur", "planner"],
    ["tarifs.html", "Tarifs", "pricing"],
    ["communaute.html", "Communauté", "community"]
  ];
  var more = [
    ["securite.html", "Sécurité", "security"],
    ["faq.html", "FAQ", "faq"],
    ["contact.html", "Contact", "contact"]
  ];
  var ico = function (d) { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"; };
  var ICONS = {
    security: ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    faq: ico('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>'),
    contact: ico('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>')
  };
  var li = function (l) {
    return '<li><a href="' + l[0] + '"' + (l[2] === page ? ' aria-current="page"' : "") + ">" + (ICONS[l[2]] || "") + l[1] + "</a></li>";
  };
  var nav = links.map(li).join("");
  var moreOn = more.some(function (l) { return l[2] === page; });
  var moreHtml =
    '<li class="more"><button type="button" class="more-btn' + (moreOn ? " on" : "") + '" aria-expanded="false" aria-haspopup="true">Infos <span aria-hidden="true">▾</span></button>' +
    '<ul class="more-list">' + more.map(li).join("") + "</ul></li>";
  var userIco = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  var header =
    '<header class="site-header"><div class="wrap nav">' +
    '<a class="brand" href="index.html"><img src="assets/img/icon-192.png" alt="" width="36" height="36">RideNCT</a>' +
    '<ul class="nav-links" id="nav-links">' + nav + moreHtml +
    '<li><a class="nav-user" href="compte.html" aria-label="Mon compte"' + (page === "account" ? ' aria-current="page"' : "") + ">" + userIco + "<span>Mon compte</span></a></li>" +
    '<li><a class="btn btn-primary btn-small cta-pulse" href="contact.html" title="Android : bientôt"><span class="dot-live" aria-hidden="true"></span>Accès prioritaire <span class="arr" aria-hidden="true">→</span></a></li></ul>' +
    '<button class="menu-btn" id="menu-btn" aria-label="Ouvrir le menu" aria-expanded="false">☰</button>' +
    "</div></header>";

  var year = new Date().getFullYear();
  var owner = cfg.editeur && cfg.editeur.indexOf("À compléter") !== 0 ? cfg.editeur : "RideNCT";
  var footer =
    '<footer class="site-footer"><div class="wrap">' +
    '<div class="foot-cols">' +
    '<div><a class="brand" href="index.html"><img src="assets/img/icon-192.png" alt="" width="36" height="36">RideNCT</a><p>L\'application des motards : navigation, intercom, communauté, sécurité et atelier.</p></div>' +
    '<div><h4>Découvrir</h4><ul><li><a href="fonctionnalites.html">Fonctionnalités</a></li><li><a href="planificateur.html">Planificateur</a></li><li><a href="tarifs.html">Tarifs</a></li><li><a href="communaute.html">Communauté</a></li><li><a href="securite.html">Sécurité</a></li><li><a href="faq.html">FAQ</a></li></ul></div>' +
    '<div><h4>Informations</h4><ul><li><a href="compte.html">Mon compte</a></li><li><a href="contact.html">Contact</a></li><li><a href="cgu.html">Conditions d\'utilisation</a></li><li><a href="mentions-legales.html">Mentions légales</a></li><li><a href="confidentialite.html">Confidentialité</a></li></ul></div>' +
    '</div><div class="foot-bottom">© ' + year + " " + owner + ". Tous droits réservés.<span class=\"foot-serial\">FC-RNCT · ATELIER · ÉDITION " + year + "</span></div></div></footer>";

  var h = document.getElementById("site-header");
  var f = document.getElementById("site-footer");
  if (h) h.outerHTML = header;
  if (f) f.outerHTML = footer;

  // Menu « Plus »
  var moreEl = document.querySelector(".more");
  if (moreEl) {
    var mb = moreEl.querySelector(".more-btn");
    var setMore = function (o) { moreEl.classList.toggle("open", o); mb.setAttribute("aria-expanded", o ? "true" : "false"); };
    mb.addEventListener("click", function (e) { e.stopPropagation(); setMore(!moreEl.classList.contains("open")); });
    document.addEventListener("click", function (e) { if (!moreEl.contains(e.target)) setMore(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMore(false); });
  }

  // Barre qui se réduit en défilant
  var hdr = document.querySelector(".site-header");
  var onScroll = function () {
    if (hdr) hdr.classList.toggle("small", window.scrollY > 40);
    if (sticky) sticky.classList.toggle("show", window.scrollY > 420);
  };

  // Bouton fixe en bas sur mobile
  var sticky = null;
  if (["contact", "account", "planner", "features"].indexOf(page) < 0) {
    sticky = document.createElement("a");
    sticky.className = "sticky-cta";
    sticky.href = cfg.androidUrl || "contact.html";
    sticky.innerHTML = (cfg.androidUrl ? "Télécharger sur Android" : "Accès prioritaire") + ' <span aria-hidden="true">→</span>';
    document.body.appendChild(sticky);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Police des titres : activée seulement si le fichier est présent
  if (document.fonts && document.fonts.load) {
    document.fonts.load("700 1em RideDisplay").then(function (f) {
      if (f && f.length) document.documentElement.classList.add("display-ok");
    }).catch(function () { });
  }

  // Compteurs
  var nums = document.querySelectorAll(".num[data-to]");
  var runNum = function (el) {
    var to = parseInt(el.getAttribute("data-to"), 10), suf = el.getAttribute("data-suffix") || "";
    if (!to) { el.textContent = "0"; return; }
    var t0 = null;
    var step = function (t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / 1100);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suf;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if ("IntersectionObserver" in window) {
    var no = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { runNum(e.target); no.unobserve(e.target); } });
    }, { threshold: 0.6 });
    nums.forEach(function (n) { if (parseInt(n.getAttribute("data-to"), 10)) n.textContent = "0" + (n.getAttribute("data-suffix") || ""); no.observe(n); });
  }

  // Bulles en orbite : l'info s'ouvre du bon côté
  var orb = document.querySelector(".orb");
  if (orb) {
    orb.querySelectorAll(".bub").forEach(function (b) {
      var place = function () {
        var o = orb.getBoundingClientRect(), r = b.getBoundingClientRect();
        var dx = r.left + r.width / 2 - (o.left + o.width / 2), dy = r.top + r.height / 2 - (o.top + o.height / 2);
        b.setAttribute("data-h", dx > 40 ? "r" : dx < -40 ? "l" : "c");
        b.setAttribute("data-v", dy > 0 ? "up" : "down");
      };
      b.addEventListener("mouseenter", place);
      b.addEventListener("focus", place);
    });
  }

  var btn = document.getElementById("menu-btn");
  var list = document.getElementById("nav-links");
  if (btn && list) {
    var setMenu = function (open) {
      list.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.textContent = open ? "✕" : "☰";
    };
    btn.addEventListener("click", function () { setMenu(!list.classList.contains("open")); });
    list.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  }

  // Boutons de téléchargement : actifs seulement si un lien est renseigné
  document.querySelectorAll("[data-store]").forEach(function (a) {
    var url = a.getAttribute("data-store") === "ios" ? cfg.iosUrl : cfg.androidUrl;
    if (url) {
      a.href = url;
    } else {
      a.href = "contact.html";
      a.insertAdjacentHTML("beforeend", ' <small style="opacity:.8">· au prochain départ</small>');
    }
  });

  // Apparition au scroll
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }

  // Formulaire de contact
  var form = document.getElementById("contact-form");
  if (form) {
    var msg = document.getElementById("form-msg");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.hp_url && form.hp_url.value) return;
      var data = new FormData(form);
      var name = (data.get("name") || "").toString().trim();
      var email = (data.get("email") || "").toString().trim();
      var topic = (data.get("topic") || "").toString();
      var text = (data.get("message") || "").toString().trim();
      if (!name || !email || !text) {
        msg.className = "form-msg err";
        msg.textContent = "Renseigne ton nom, ton e-mail et un message.";
        return;
      }
      if (cfg.supabaseUrl && cfg.supabaseKey) {
        var sb = cfg.supabaseUrl.replace(/\/+$/, "");
        var sendBtn = form.querySelector("button[type=submit]"); if (sendBtn) sendBtn.disabled = true;
        fetch(sb + "/rest/v1/rpc/send_contact", { method: "POST", headers: { apikey: cfg.supabaseKey, Authorization: "Bearer " + cfg.supabaseKey, "Content-Type": "application/json" },
          body: JSON.stringify({ p_name: name, p_email: email, p_topic: topic, p_message: text }) })
          .then(function (r) {
            if (!r.ok) return r.json().then(function (j) { throw new Error(/rate_limit/.test((j && j.message) || "") ? "rate" : "fail"); }, function () { throw new Error("fail"); });
            form.reset(); msg.className = "form-msg ok"; msg.textContent = "Message envoyé. Merci, on te répond vite.";
          })
          .catch(function (er) {
            msg.className = "form-msg err";
            msg.textContent = er && er.message === "rate" ? "Trop de messages envoyés. Réessaie un peu plus tard." : "L'envoi a échoué. Vérifie ta connexion et réessaie.";
          })
          .then(function () { if (sendBtn) sendBtn.disabled = false; });
      } else if (cfg.formEndpoint) {
        fetch(cfg.formEndpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })
          .then(function (r) {
            if (!r.ok) throw new Error();
            form.reset();
            msg.className = "form-msg ok";
            msg.textContent = "Message envoyé. Merci !";
          })
          .catch(function () {
            msg.className = "form-msg err";
            msg.textContent = "L'envoi a échoué. Réessaie ou écris-nous directement par e-mail.";
          });
      } else {
        var subject = encodeURIComponent("[RideNCT] " + topic);
        var body = encodeURIComponent(text + "\n\n" + name + " — " + email);
        window.location.href = "mailto:" + cfg.email + "?subject=" + subject + "&body=" + body;
        msg.className = "form-msg ok";
        msg.textContent = "Ton application de messagerie va s'ouvrir avec le message prêt à envoyer.";
      }
    });
  }

  var sujet = /[?&]sujet=testeur/.test(location.search);
  if (form && sujet && form.topic) form.topic.value = "Devenir testeur";

  // Liste d'attente (Supabase) + compteur réel
  var SB = (cfg.supabaseUrl || "").replace(/\/+$/, ""), KEY = cfg.supabaseKey || "";
  var rpc = function (name, body) {
    return fetch(SB + "/rest/v1/rpc/" + name, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  };
  document.querySelectorAll("[data-wl]").forEach(function (f) {
    if (!f.previousElementSibling || !f.previousElementSibling.classList.contains("live")) {
      var lv = document.createElement("span"); lv.className = "live";
      lv.innerHTML = "<i></i>" + (cfg.androidUrl ? "Android · disponible" : "Android · bientôt");
      f.parentNode.insertBefore(lv, f);
    }
    if (!SB || !KEY) { f.hidden = true; return; }
    var box = f.parentNode, out = box.querySelector(".wl-msg");
    var say = function (t, k) { out.textContent = t; out.className = "wl-msg" + (k ? " " + k : ""); };
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (f.hp_url && f.hp_url.value) return;
      var v = f.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { say("Cette adresse e-mail n'est pas valide.", "err"); return; }
      var b = f.querySelector("button"); b.disabled = true; say("Un instant…");
      rpc("join_waitlist", { p_email: v, p_source: "site-" + page }).then(function (r) {
        if (!r.ok) throw new Error();
        f.reset(); f.hidden = true; say("C'est noté ! Tu seras prévenu à la sortie de l'app.", "ok");
      }).catch(function () { b.disabled = false; say("Impossible d'enregistrer pour le moment. Réessaie dans un instant ou écris-nous.", "err"); });
    });
  });
  var counts = document.querySelectorAll(".wl-count");
  if (counts.length && SB && KEY) {
    rpc("waitlist_count").then(function (r) { return r.ok ? r.json() : null; }).then(function (n) {
      if (typeof n !== "number" || n < (cfg.waitlistMin || 25)) return;
      counts.forEach(function (c) { c.innerHTML = "<i></i>Déjà <b>" + n + "</b> motards inscrits pour la sortie Android"; c.hidden = false; });
    }).catch(function () { });
  }

  // Annonces et état du service (données réelles : table app_status / app_announcements)
  if (SB && KEY) {
    rpc("app_status").then(function (r) { return r.ok ? r.json() : null; }).then(function (st) {
      if (!st || typeof st !== "object") return;
      var dis = []; try { dis = JSON.parse(localStorage.getItem("rn_dis") || "[]"); } catch (e) { }
      var wrap = document.createElement("div"); wrap.className = "site-banners";
      var add = function (cls, title, body, id) {
        var b = document.createElement("div"); b.className = "site-banner " + cls; b.setAttribute("role", cls === "maint" ? "alert" : "status");
        var t = document.createElement("div"); t.className = "sb-text";
        if (title) { var s = document.createElement("b"); s.textContent = title; t.appendChild(s); }
        if (body) { var p = document.createElement("span"); p.textContent = (title ? " " : "") + body; t.appendChild(p); }
        b.appendChild(t);
        if (id) {
          var x = document.createElement("button"); x.type = "button"; x.className = "sb-x"; x.setAttribute("aria-label", "Fermer l'annonce"); x.textContent = "×";
          x.addEventListener("click", function () { b.remove(); dis.push(id); try { localStorage.setItem("rn_dis", JSON.stringify(dis.slice(-30))); } catch (e) { } });
          b.appendChild(x);
        }
        wrap.appendChild(b);
      };
      if (st.maintenance) add("maint", "Maintenance en cours.", st.message || "Certains services peuvent être indisponibles.", null);
      (st.announcements || []).forEach(function (a) { if (a && a.title && dis.indexOf(a.id) < 0) add(a.level === "warning" ? "warn" : "info", a.title, a.body || "", a.id); });
      if (wrap.children.length) document.body.insertBefore(wrap, document.body.firstChild);
      var fb = document.querySelector(".foot-bottom");
      if (fb) { var s2 = document.createElement("span"); s2.className = "foot-status" + (st.maintenance ? " maint" : ""); s2.textContent = st.maintenance ? "Maintenance en cours" : "Service en ligne"; fb.insertBefore(s2, fb.firstChild); }
    }).catch(function () { });
  }

  // Section testeurs : seulement de vrais retours (cfg.temoignages). ?apercu=avis montre la mise en page avec des textes d'exemple.
  var avis = document.querySelector("[data-avis]");
  if (avis) {
    var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var tem = (cfg.temoignages || []).filter(function (t) { return t && t.texte; });
    var sample = false;
    if (!tem.length && /[?&]apercu=avis/.test(location.search)) {
      sample = true;
      tem = [
        { nom: "Prénom", moto: "Ta moto", texte: "Texte d'exemple pour voir la mise en page. Ici viendra le vrai retour d'un testeur." },
        { nom: "Prénom", moto: "Ta moto", texte: "Deuxième exemple, un peu plus long, pour vérifier que les cartes restent bien alignées quand les textes n'ont pas la même taille." },
        { nom: "Prénom", moto: "Ta moto", texte: "Troisième exemple." }
      ];
    }
    var cards = tem.map(function (t) {
      var ini = esc((t.nom || "?").charAt(0).toUpperCase());
      return '<figure class="avis-card"><blockquote>« ' + esc(t.texte) + ' »</blockquote><figcaption><span class="avis-av">' + ini + "</span><span><b>" + esc(t.nom) + "</b>" + (t.moto ? "<small>" + esc(t.moto) + "</small>" : "") + "</span></figcaption></figure>";
    }).join("");
    var join = '<div class="avis-card avis-join"><h3>Toi aussi, teste l\'app en avant-première</h3><p>Dis-nous quelle moto tu conduis et comment tu roules : on te recontacte pour les prochains essais.</p><a class="btn btn-primary" href="contact.html?sujet=testeur">Devenir testeur <span class="arr" aria-hidden="true">→</span></a></div>';
    avis.innerHTML = '<div class="wrap">' + (sample ? '<p class="avis-badge">Aperçu : textes d\'exemple, invisibles pour les visiteurs.</p>' : "") +
      '<div class="section-head center"><h2>' + (tem.length ? "Ils testent l'app en avant-première" : "Deviens testeur de la première heure") + "</h2><p>" +
      (tem.length ? "Les retours de motards qui ont déjà essayé RideNCT sur la route." : "On cherche des motards pour essayer RideNCT avant tout le monde et nous dire ce qui manque.") + '</p></div><div class="avis-grid' + (tem.length ? "" : " solo") + '">' + cards + join + "</div></div>";
  }

  // Bouton retour en haut (pages longues)
  if (["planner", "account"].indexOf(page) < 0) {
    var up = document.createElement("button");
    up.type = "button"; up.className = "to-top"; up.setAttribute("aria-label", "Revenir en haut de la page"); up.innerHTML = "↑";
    up.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
    document.body.appendChild(up);
    window.addEventListener("scroll", function () { up.classList.toggle("show", window.scrollY > 900); }, { passive: true });
  }

  // Service worker : le site reste utilisable hors ligne
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () { }); });
  }

  // Mentions légales : champs configurables
  document.querySelectorAll("[data-cfg]").forEach(function (el) {
    var v = cfg[el.getAttribute("data-cfg")];
    if (v) el.textContent = v;
  });
})();

/* Finitions : halo qui suit le curseur sur les cartes, fondu entre pages */
(function () {
  if (window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    document.addEventListener("pointermove", function (e) {
      var c = e.target.closest && e.target.closest(".card");
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left) + "px");
      c.style.setProperty("--my", (e.clientY - r.top) + "px");
    }, { passive: true });
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
    var h = a.getAttribute("href");
    if (!h || h.charAt(0) === "#" || /^(https?:|mailto:|tel:)/.test(h) || a.hasAttribute("download")) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault(); document.body.classList.add("leaving");
    setTimeout(function () { location.href = a.href; }, 170);
  });
  window.addEventListener("pageshow", function () { document.body.classList.remove("leaving"); });
})();

/* Garage : dessins qui se tracent, photos, parallaxe, phare, étincelles */
(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && "IntersectionObserver" in window) {
    root.classList.add("bp-js");
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    document.querySelectorAll(".bp").forEach(function (b) { io.observe(b); });
  }
  document.querySelectorAll(".ph img").forEach(function (img) {
    var fail = function () { img.parentNode.classList.add("no-img"); };
    if (img.complete && img.naturalWidth === 0) fail();
    img.addEventListener("error", fail);
    img.addEventListener("load", function () { if (img.naturalWidth) img.parentNode.classList.add("has-img"); });
    if (img.complete && img.naturalWidth) img.parentNode.classList.add("has-img");
  });
  var pars = document.querySelectorAll("[data-parallax]");
  if (pars.length && !reduce) {
    var tick = false;
    var upd = function () {
      tick = false;
      pars.forEach(function (p) {
        var r = p.getBoundingClientRect(), vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        var k = (r.top + r.height / 2 - vh / 2) / vh;
        p.style.setProperty("--py", (k * -r.height * 0.18).toFixed(1) + "px");
      });
    };
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }
  var hero = document.querySelector(".hero");
  if (hero && !reduce && window.matchMedia("(hover: hover)").matches) {
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      hero.style.setProperty("--hx", (e.clientX - r.left) + "px");
      hero.style.setProperty("--hy", (e.clientY - r.top) + "px");
    }, { passive: true });
  }
  if (!reduce && window.matchMedia("(hover: hover)").matches) {
    var last = 0;
    document.addEventListener("pointerenter", function (e) {
      var b = e.target.closest && e.target.closest(".btn-primary");
      var now = Date.now();
      if (!b || now - last < 500) return;
      last = now;
      for (var i = 0; i < 9; i++) {
        var sp = document.createElement("span"); sp.className = "spark";
        var a = Math.random() * Math.PI * 2, d = 24 + Math.random() * 38;
        sp.style.left = e.clientX + "px"; sp.style.top = e.clientY + "px";
        sp.style.setProperty("--dx", Math.cos(a) * d + "px"); sp.style.setProperty("--dy", (Math.sin(a) * d + 14) + "px");
        document.body.appendChild(sp);
        setTimeout(function (n) { return function () { n.remove(); }; }(sp), 700);
      }
    }, true);
  }
})();
