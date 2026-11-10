// Fonctionnalités : les écrans s'ouvrent comme dans l'app pendant que tu fais défiler.
(function () {
  var fx = document.getElementById("fx");
  if (!fx) return;
  var stage = fx.querySelector(".fx-stage");
  var slides = [].slice.call(fx.querySelectorAll(".fx-slide"));
  var tabs = [].slice.call(fx.querySelectorAll(".fx-tab"));
  var count = fx.querySelector(".fx-count b");
  var bar = fx.querySelector(".fx-prog i");
  var N = slides.length, cur = -1, STEP = 0.8;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.documentElement.classList.add("fx-js");

  function sizes() {
    var sh = stage.getBoundingClientRect().height;
    fx.style.height = Math.round(sh + (N - 1) * sh * STEP) + "px";
    return sh;
  }
  function top() { return fx.getBoundingClientRect().top + window.scrollY; }
  function show(i) {
    if (i === cur) return;
    cur = i;
    slides.forEach(function (s, k) {
      s.classList.toggle("on", k === i);
      s.classList.toggle("before", k < i);
      s.setAttribute("aria-hidden", k === i ? "false" : "true");
    });
    tabs.forEach(function (t, k) { t.classList.toggle("on", k === i); if (k === i) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current"); });
    stage.setAttribute("data-i", i);
    stage.setAttribute("data-p", i % 2);
    if (count) count.textContent = ("0" + (i + 1)).slice(-2);
    if (bar) bar.style.width = ((i + 1) / N * 100) + "%";
  }
  function update() {
    var sh = stage.getBoundingClientRect().height;
    var p = (window.scrollY - top()) / (sh * STEP);
    var i = Math.max(0, Math.min(N - 1, Math.round(p - 0.15)));
    show(i);
  }
  function go(i) {
    var sh = stage.getBoundingClientRect().height;
    window.scrollTo({ top: top() + i * sh * STEP + 2, behavior: reduce ? "auto" : "smooth" });
  }
  tabs.forEach(function (t, k) { t.addEventListener("click", function () { go(k); }); });
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", function () { sizes(); update(); });
  document.addEventListener("keydown", function (e) {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    var r = fx.getBoundingClientRect();
    if (r.top > 120 || r.bottom < window.innerHeight * 0.6) return;
    if (e.key === "ArrowRight" && cur < N - 1) { e.preventDefault(); go(cur + 1); }
    if (e.key === "ArrowLeft" && cur > 0) { e.preventDefault(); go(cur - 1); }
  });
  sizes(); show(0); update();
  window.addEventListener("load", function () { sizes(); update(); });

  // Lien direct (#carte, #expert…)
  var h = (location.hash || "").replace("#", "");
  if (h) { var k = slides.findIndex(function (s) { return s.id === h; }); if (k >= 0) setTimeout(function () { go(k); }, 60); }
})();
