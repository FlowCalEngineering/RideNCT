/* Textes légaux publiés côté serveur (Supabase legal_current). Le contenu HTML présent dans la page sert de secours.
   Format d'une section : { title, level (3 = sous-titre), body (texte ou liste de paragraphes), items (liste à puces) }
   ou { summary, body } pour un encadré repliable.
   Mise en forme dans les textes : **gras**, [texte](lien), un retour à la ligne = saut de ligne, une ligne vide = nouveau paragraphe. */
(function () {
  "use strict";
  var cfg = window.RIDENCT || {};
  if (!cfg.supabaseUrl || !cfg.supabaseKey) return;
  var map = {
    "cgu.html": ["cgu"], "cgv.html": ["cgv"],
    "mentions-legales.html": ["mentions", "mentions-legales", "mentions_legales", "ml"],
    "confidentialite.html": ["confidentialite", "confidentialité", "privacy", "politique", "pc"]
  };
  var file = (location.pathname.split("/").pop() || "").replace(/\/$/, "");
  if (!file) return;
  if (!map[file] && map[file + ".html"]) file += ".html";
  var ids = map[file]; if (!ids) return;
  var box = document.querySelector(".wrap.legal"); if (!box) return;

  function txt(v) { return v == null ? "" : String(v); }
  function paras(v) {
    if (v == null) return [];
    if (Array.isArray(v)) return v.map(txt).filter(Boolean);
    return txt(v).split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function pick(o, ks) { for (var i = 0; i < ks.length; i++) if (o[ks[i]] != null && o[ks[i]] !== "") return o[ks[i]]; return null; }

  /* Liens autorisés : pages du site, ancres, https, mailto, tel. Tout le reste (javascript:, data:…) devient du simple texte. */
  function safeHref(h) { return /^(https?:\/\/|mailto:|tel:|#)/i.test(h) || /^[\w\-.\/]+(\.html)?(#[\w\-]+)?$/.test(h); }

  /* Texte avec mise en forme légère -> noeuds DOM (jamais d'innerHTML) */
  function inline(parent, s) {
    s = txt(s);
    var re = /\*\*([\s\S]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|\n|!\[([^\]\n]*)\]\(([^)\s]+)\)/;
    while (s) {
      var m = re.exec(s);
      if (!m) { parent.appendChild(document.createTextNode(s)); break; }
      if (m.index) parent.appendChild(document.createTextNode(s.slice(0, m.index)));
      if (m[0] === "\n") parent.appendChild(document.createElement("br"));
      else if (m[5] != null) {
        if (/^(https:\/\/|img\/)[\w\-.\/%:@]+$/i.test(m[5])) {
          var im = document.createElement("img"); im.setAttribute("src", m[5]); im.setAttribute("alt", m[4]); im.setAttribute("loading", "lazy");
          im.style.maxWidth = "100%"; im.style.height = "auto"; im.style.display = "block"; im.style.margin = "12px auto"; im.style.borderRadius = "8px";
          parent.appendChild(im);
        } else parent.appendChild(document.createTextNode(m[4]));
      }
      else if (m[1] != null) { var b = document.createElement("b"); inline(b, m[1]); parent.appendChild(b); }
      else if (safeHref(m[3])) {
        var a = document.createElement("a"); a.setAttribute("href", m[3]);
        if (/^https?:\/\//i.test(m[3])) a.setAttribute("rel", "noopener noreferrer");
        a.appendChild(document.createTextNode(m[2])); parent.appendChild(a);
      } else parent.appendChild(document.createTextNode(m[2]));
      s = s.slice(m.index + m[0].length);
    }
  }

  function build(secs) {
    if (!secs || typeof secs !== "object") return null;
    if (!Array.isArray(secs)) secs = Object.keys(secs).map(function (k) { var s = secs[k]; return typeof s === "object" && s ? Object.assign({ title: k }, s) : { title: k, body: s }; });
    var frag = document.createDocumentFragment(), n = 0;
    secs.forEach(function (s) {
      if (typeof s === "string") { s = { body: s }; }
      if (!s || typeof s !== "object") return;
      if (s.summary) {
        var dt = document.createElement("details"); dt.className = "legal-form";
        var sm = document.createElement("summary"); inline(sm, s.summary); dt.appendChild(sm);
        paras(pick(s, ["body", "text", "texte", "content"])).forEach(function (p) { var e = document.createElement("p"); inline(e, p); dt.appendChild(e); });
        frag.appendChild(dt); n++; return;
      }
      var t = pick(s, ["title", "titre", "heading", "h", "name"]);
      if (t) { var h = document.createElement(Number(s.level) === 3 ? "h3" : "h2"); inline(h, t); frag.appendChild(h); n++; }
      paras(pick(s, ["body", "text", "texte", "content", "contenu", "paragraphs", "paragraphes", "p"])).forEach(function (p) {
        var e = document.createElement("p"); inline(e, p); frag.appendChild(e); n++;
      });
      var it = pick(s, ["items", "list", "liste", "bullets", "points"]);
      if (Array.isArray(it) && it.length) {
        var ul = document.createElement("ul"); ul.className = "legal-list";
        it.forEach(function (x) { var li = document.createElement("li"); inline(li, typeof x === "object" && x ? pick(x, ["text", "texte", "title"]) : x); ul.appendChild(li); });
        frag.appendChild(ul); n++;
      }
    });
    return n ? frag : null;
  }

  /* Titre : le dernier mot (ou « de vente ») garde le style coloré de la page */
  function setTitle(h1, title) {
    var w = txt(title).trim().split(/\s+/), k = 1;
    if (w.length > 3 && /^(de|du|des|la|le|les)$/i.test(w[w.length - 2])) k = 2;
    h1.textContent = "";
    if (w.length <= k) { h1.textContent = w.join(" "); return; }
    h1.appendChild(document.createTextNode(w.slice(0, w.length - k).join(" ") + " "));
    var sp = document.createElement("span"); sp.textContent = w.slice(w.length - k).join(" "); h1.appendChild(sp);
  }

  fetch(cfg.supabaseUrl + "/rest/v1/rpc/legal_current", {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.supabaseKey, Authorization: "Bearer " + cfg.supabaseKey },
    body: "{}"
  }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || typeof d !== "object") return;
    var doc = null; for (var i = 0; i < ids.length && !doc; i++) doc = d[ids[i]];
    if (!doc) return;
    var frag = build(doc.sections); if (!frag) return;
    box.textContent = ""; box.appendChild(frag);
    if (doc.title) { var h1 = document.querySelector(".page-title h1"); if (h1) setTitle(h1, doc.title); }
    if (doc.date) {
      var p = document.querySelector(".page-title p:not(.eyebrow)");
      if (p) {
        var date = txt(doc.date).replace(/^(version du|dernière mise à jour\s*:)\s*/i, "").replace(/\.$/, "");
        var label = /^\d/.test(date) ? "Version du " + date + "." : "Dernière mise à jour : " + date + ".";
        p.textContent = p.textContent.replace(/\s*(Version du|Dernière mise à jour\s*:).*$/i, "").replace(/\s+$/, "") + (p.textContent.replace(/\s*(Version du|Dernière mise à jour\s*:).*$/i, "").trim() ? " " : "") + label;
      }
    }
  }).catch(function () {});
})();
