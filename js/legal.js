/* Textes légaux publiés côté serveur (Supabase legal_current). Le contenu HTML présent dans la page sert de secours. */
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
  function build(secs) {
    if (!secs || typeof secs !== "object") return null;
    if (!Array.isArray(secs)) secs = Object.keys(secs).map(function (k) { var s = secs[k]; return typeof s === "object" && s ? Object.assign({ title: k }, s) : { title: k, body: s }; });
    var frag = document.createDocumentFragment(), n = 0;
    secs.forEach(function (s) {
      if (typeof s === "string") { s = { body: s }; }
      if (!s || typeof s !== "object") return;
      var t = pick(s, ["title", "titre", "heading", "h", "name"]);
      if (t) { var h = document.createElement("h2"); h.textContent = txt(t); frag.appendChild(h); n++; }
      paras(pick(s, ["body", "text", "texte", "content", "contenu", "paragraphs", "paragraphes", "p"])).forEach(function (p) {
        var e = document.createElement("p"); e.textContent = p; frag.appendChild(e); n++;
      });
      var it = pick(s, ["items", "list", "liste", "bullets", "points"]);
      if (Array.isArray(it) && it.length) {
        var ul = document.createElement("ul");
        it.forEach(function (x) { var li = document.createElement("li"); li.textContent = txt(typeof x === "object" && x ? pick(x, ["text", "texte", "title"]) : x); ul.appendChild(li); });
        frag.appendChild(ul); n++;
      }
    });
    return n ? frag : null;
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
    if (doc.title) { var h1 = document.querySelector(".page-title h1"); if (h1) h1.textContent = txt(doc.title); }
    if (doc.date) { var p = document.querySelector(".page-title p:not(.eyebrow)"); if (p) p.textContent = "Version du " + txt(doc.date).replace(/^version du\s*/i, "") + "."; }
  }).catch(function () {});
})();
