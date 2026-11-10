// Planificateur expert RideNCT (version web).
// Reprend le moteur « routes d'amusement » de l'app (js/moteur.js) : trajet de référence, routes OpenStreetMap du couloir, recherche A* qui préfère les virages.
(function () {
  'use strict';
  var CFG = window.RIDENCT || {};
  var STYLE_URL = CFG.mapStyle || 'https://tiles.openfreemap.org/styles/liberty';
  var KEY = 'ridenct_planner_v1';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  var MODES = {
    autoroute: { label: 'Autoroute', color: '#6b7280', kmh: 100 },
    rapide: { label: 'Rapide', color: '#e8873a', kmh: 62 },
    sinueux: { label: 'Sinueux', color: '#12877f', kmh: 48 }
  };
  var MOTOS = { routiere: ['Routière', 1], trail: ['Trail', 0.88], sportive: ['Sportive', 1.1], scooter: ['Scooter', 0.78] };
  var PRESETS = [
    { id: 'dim', label: 'Balade du dimanche', style: 66, avoid: { autoroutes: true, peages: true, nationales: false }, loop: false },
    { id: 'col', label: 'Cols et montagne', style: 92, avoid: { autoroutes: true, peages: true, nationales: true }, loop: false },
    { id: 'eff', label: 'Trajet efficace', style: 12, avoid: { autoroutes: false, peages: false, nationales: false }, loop: false },
    { id: 'dec', label: 'Découverte en boucle', style: 80, avoid: { autoroutes: true, peages: true, nationales: true }, loop: true }
  ];
  var WX_TEXT = function (c) {
    if (c === 0) return 'Dégagé'; if (c <= 2) return 'Peu nuageux'; if (c === 3) return 'Couvert'; if (c === 45 || c === 48) return 'Brouillard';
    if (c >= 51 && c <= 57) return 'Bruine'; if ((c >= 61 && c <= 67)) return 'Pluie'; if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'Neige';
    if (c >= 80 && c <= 82) return 'Averses'; if (c >= 95) return 'Orage'; return 'Variable';
  };

  var st, map = null, ready = false, markers = [], busy = false, cancelled = false, t0 = 0, deadline = 0, msg = '', tick = 0;
  var tab = 'etapes', hist = { u: [], r: [], last: '' }, errMsg = '';

  function isoLocal(d) { var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function fresh() {
    var d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
    return { title: '', pts: [], style: 66, avoid: { autoroutes: true, peages: true, nationales: false }, loop: false, moto: 'routiere', depart: isoLocal(d), res: null };
  }
  function load() {
    var s = fresh();
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (j && Array.isArray(j.pts)) {
        s.pts = j.pts.filter(function (p) { return p && Array.isArray(p.ll) && isFinite(p.ll[0]) && isFinite(p.ll[1]); }).map(function (p) { return { ll: p.ll, name: String(p.name || 'Point'), kind: p.kind === 'stop' ? 'stop' : 'pass', pause: +p.pause || 0, mode: MODES[p.mode] ? p.mode : 'auto' }; });
        if (isFinite(j.style)) s.style = Math.max(0, Math.min(100, +j.style));
        if (j.avoid) s.avoid = { autoroutes: !!j.avoid.autoroutes, peages: !!j.avoid.peages, nationales: !!j.avoid.nationales };
        s.loop = !!j.loop; if (MOTOS[j.moto]) s.moto = j.moto; s.title = String(j.title || '');
      }
    } catch (e) { }
    return s;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ pts: st.pts, style: st.style, avoid: st.avoid, loop: st.loop, moto: st.moto, title: st.title })); } catch (e) { }
  }

  // ---------- historique ----------
  function snap() { return JSON.stringify(st.pts); }
  function histPush() { var c = snap(); if (c === hist.last) return; hist.u.push(hist.last); if (hist.u.length > 60) hist.u.shift(); hist.r = []; hist.last = c; }
  function undo() { if (!hist.u.length) return; hist.r.push(hist.last); hist.last = hist.u.pop(); st.pts = JSON.parse(hist.last); st.res = null; save(); renderAll(); }
  function redo() { if (!hist.r.length) return; hist.u.push(hist.last); hist.last = hist.r.pop(); st.pts = JSON.parse(hist.last); st.res = null; save(); renderAll(); }
  function touch() { histPush(); st.res = null; errMsg = ''; save(); renderAll(); }

  // ---------- noms de lieux ----------
  var rq = [], rbusy = false;
  function reverseName(p, force) { rq.push([p, force]); if (!rbusy) runRq(); }
  async function runRq() {
    rbusy = true;
    while (rq.length) {
      var it = rq.shift(), p = it[0];
      try {
        var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 6000);
        var r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=fr&lat=' + p.ll[1] + '&lon=' + p.ll[0], { signal: ac.signal }); clearTimeout(to);
        var d = await r.json(), a = d.address || {};
        var n = a.village || a.town || a.city || a.hamlet || a.municipality || d.name || '';
        if (n && (it[1] || /^(Point|Étape|Départ|Arrivée) ?\d*$/.test(p.name))) { p.name = n; save(); renderSteps(); syncMarkers(); }
      } catch (e) { }
      await sleep(1100);
    }
    rbusy = false;
  }

  // ---------- points ----------
  function addPoint(ll, name) {
    var p = { ll: [+ll[0].toFixed(5), +ll[1].toFixed(5)], name: name || (st.pts.length ? 'Point ' + st.pts.length : 'Départ'), kind: 'pass', pause: 0, mode: 'auto' };
    st.pts.push(p); touch(); if (!name) reverseName(p, false);
  }
  function insertAt(i, ll) {
    var p = { ll: [+ll[0].toFixed(5), +ll[1].toFixed(5)], name: 'Étape ' + i, kind: 'pass', pause: 0, mode: 'auto' };
    st.pts.splice(i, 0, p); touch(); reverseName(p, false);
  }
  function move(i, j) { if (j < 0 || j >= st.pts.length || i === j) return; var p = st.pts.splice(i, 1)[0]; st.pts.splice(j, 0, p); touch(); }
  function remove(i) { st.pts.splice(i, 1); touch(); }
  function reverse() { st.pts.reverse(); touch(); }
  function reset() { st = fresh(); hist = { u: [], r: [], last: snap() }; save(); renderAll(); }
  function label(i, n) { return i === 0 ? 'D' : (i === n - 1 && n > 1 && !st.loop) ? 'A' : String(i); }
  function effMode(i) {
    var p = st.pts[i], m = p && p.mode !== 'auto' ? p.mode : (st.style >= 50 ? 'sinueux' : st.style >= 20 ? 'rapide' : 'autoroute');
    if (m === 'autoroute' && (st.avoid.autoroutes || st.avoid.peages)) m = 'rapide';
    if (m === 'rapide' && st.avoid.nationales) m = 'sinueux';
    return m;
  }

  // ---------- carte ----------
  function initMap() {
    if (typeof maplibregl === 'undefined') { $('pl-hint').textContent = 'La carte ne s\'est pas chargée. Recharge la page.'; return; }
    map = new maplibregl.Map({ container: 'map', style: STYLE_URL, center: [2.2137, 46.2276], zoom: 5, attributionControl: false });
    var mapErr = 0;
    map.on('error', function (ev) { if (!map.loaded() && !mapErr++) { var h = $('pl-hint'); if (h && !map.isStyleLoaded()) h.textContent = 'Le fond de carte ne répond pas. Vérifie ta connexion ou réessaie dans un moment.'; } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('load', function () {
      map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'route-case', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1f2226', 'line-width': 12, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 7 } });
      map.addSource('pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'pins', type: 'circle', source: 'pins', paint: { 'circle-radius': 4.5, 'circle-color': '#e8873a', 'circle-stroke-color': '#1f2226', 'circle-stroke-width': 2 } });
      ready = true; syncMap(); fit();
    });
    map.on('click', function (e) {
      var ll = [e.lngLat.lng, e.lngLat.lat], hit = st.res ? nearLeg(e.point) : null;
      if (hit !== null) insertAt(hit + 1, ll); else addPoint(ll);
    });
    map.on('mousemove', function (e) { if (st.res) map.getCanvas().style.cursor = nearLeg(e.point) !== null ? 'copy' : ''; });
  }
  function nearLeg(pt) {
    var best = null, bd = 12;
    st.res.legs.forEach(function (L, k) {
      var prev = null;
      for (var i = 0; i < L.coords.length; i += Math.max(1, Math.floor(L.coords.length / 400))) {
        var q = map.project([L.coords[i][0], L.coords[i][1]]);
        if (prev) {
          var dx = q.x - prev.x, dy = q.y - prev.y, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((pt.x - prev.x) * dx + (pt.y - prev.y) * dy) / l2)) : 0;
          var d = Math.hypot(pt.x - (prev.x + t * dx), pt.y - (prev.y + t * dy));
          if (d < bd) { bd = d; best = k; }
        }
        prev = q;
      }
    });
    return best;
  }
  function syncMarkers() {
    markers.forEach(function (m) { m.remove(); }); markers = [];
    if (!map) return;
    st.pts.forEach(function (p, i) {
      var el = document.createElement('div'); el.className = 'pl-mk ' + (i === 0 ? 's' : (p.kind === 'stop' ? 'a' : 'v')); el.textContent = label(i, st.pts.length); el.title = p.name;
      var m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(p.ll).addTo(map);
      m.on('dragend', function () { var ll = m.getLngLat(); p.ll = [+ll.lng.toFixed(5), +ll.lat.toFixed(5)]; p.name = 'Point ' + i; touch(); reverseName(p, true); });
      markers.push(m);
    });
  }
  function syncRoute() {
    if (!ready) return;
    var f = [], pins = [], r = st.res;
    if (r) { r.legs.forEach(function (L) { f.push({ type: 'Feature', properties: { c: MODES[L.mode].color }, geometry: { type: 'LineString', coordinates: L.coords.map(function (c) { return [c[0], c[1]]; }) } }); }); r.pinPts.forEach(function (c) { pins.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }); }); }
    map.getSource('route').setData({ type: 'FeatureCollection', features: f });
    map.getSource('pins').setData({ type: 'FeatureCollection', features: pins });
  }
  function syncMap() { syncMarkers(); syncRoute(); }
  function fit() {
    if (!map) return; var c = [];
    if (st.res) st.res.legs.forEach(function (L) { L.coords.forEach(function (x, i) { if (i % 5 === 0) c.push(x); }); }); else st.pts.forEach(function (p) { c.push(p.ll); });
    if (!c.length) return;
    if (c.length === 1) { map.easeTo({ center: c[0], zoom: Math.max(map.getZoom(), 10) }); return; }
    var b = new maplibregl.LngLatBounds(c[0], c[0]); c.forEach(function (x) { b.extend([x[0], x[1]]); });
    map.fitBounds(b, { padding: 60, maxZoom: 14, duration: 600 });
  }

  // ---------- recherche ----------
  var qSeq = 0, qTimer = 0;
  async function getJSON(url, ms) { var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, ms || 8000); try { var r = await fetch(url, { signal: ac.signal }); return await r.json(); } finally { clearTimeout(to); } }
  function showResults(items, text) {
    var l = $('pl-sl'); l.hidden = false; l.innerHTML = '';
    if (text) { l.innerHTML = '<div class="pl-hintl">' + esc(text) + '</div>'; return; }
    items.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pl-res'; b.innerHTML = '<b>' + esc(r.main) + '</b><small>' + esc(r.ctx) + '</small>';
      b.onclick = function () { l.hidden = true; $('pl-q').value = ''; addPoint(r.coords, r.main); if (map) map.easeTo({ center: r.coords, zoom: Math.max(map.getZoom(), 10) }); };
      l.appendChild(b);
    });
  }
  async function runSearch(text) {
    var my = ++qSeq; showResults([], 'Recherche…');
    var c = map ? map.getCenter() : null, bias = c ? '&lat=' + c.lat.toFixed(4) + '&lon=' + c.lng.toFixed(4) : '';
    var res = await Promise.allSettled([
      getJSON('https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(text) + '&limit=5&autocomplete=1' + bias),
      getJSON('https://photon.komoot.io/api/?q=' + encodeURIComponent(text) + '&limit=6&lang=fr' + bias)]);
    if (my !== qSeq) return;
    var out = [], ban = res[0], pho = res[1];
    if (pho.status === 'fulfilled' && pho.value && pho.value.features) pho.value.features.forEach(function (f) {
      var p = f.properties || {}, main = p.name || (p.housenumber && p.street ? p.housenumber + ' ' + p.street : p.street) || '', sub = [p.postcode, p.city && p.city !== main ? p.city : '', p.country].filter(Boolean);
      if (!main && sub.length) main = sub.shift(); if (main) out.push({ main: main, ctx: sub.join(' · '), coords: f.geometry.coordinates });
    });
    if (ban.status === 'fulfilled' && ban.value && ban.value.features) ban.value.features.forEach(function (f) { var p = f.properties || {}; out.push({ main: p.name || p.label, ctx: [p.postcode, p.city].filter(Boolean).join(' '), coords: f.geometry.coordinates }); });
    var seen = {}, uniq = out.filter(function (r) { var k = r.main.toLowerCase() + '|' + r.coords.map(function (v) { return v.toFixed(3); }).join(','); if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 8);
    if (!uniq.length) showResults([], ban.status === 'rejected' && pho.status === 'rejected' ? 'Recherche indisponible : place le point directement sur la carte.' : 'Aucun résultat');
    else showResults(uniq);
  }
  function myPosition() {
    if (!navigator.geolocation) { setStatus('La localisation n\'est pas disponible sur cet appareil.', true); return; }
    navigator.geolocation.getCurrentPosition(function (pos) { var ll = [pos.coords.longitude, pos.coords.latitude]; addPoint(ll, 'Ma position'); if (map) map.easeTo({ center: ll, zoom: Math.max(map.getZoom(), 11) }); },
      function () { setStatus('Localisation refusée ou indisponible.', true); }, { enableHighAccuracy: false, timeout: 8000 });
  }

  // ---------- calcul ----------
  async function osrmJson(path, ms) {
    var hosts = ['https://router.project-osrm.org/route/v1/driving/', 'https://routing.openstreetmap.de/routed-car/route/v1/driving/'];
    for (var i = 0; i < hosts.length; i++) {
      var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, ms || 12000);
      try { var r = await fetch(hosts[i] + path, { signal: ac.signal }); var d = await r.json(); if (d && d.code === 'Ok' && d.routes && d.routes[0]) return d; } catch (e) { } finally { clearTimeout(to); }
    }
    return null;
  }
  async function brouter(a, b, profile) {
    var ac = new AbortController(), to = setTimeout(function () { ac.abort(); }, 12000);
    try {
      var r = await fetch('https://brouter.de/brouter?lonlats=' + a[0] + ',' + a[1] + '|' + b[0] + ',' + b[1] + '&profile=' + profile + '&format=geojson', { signal: ac.signal });
      if (!r.ok) throw new Error('brouter');
      var d = await r.json(), ft = d.features && d.features[0]; if (!ft) throw new Error('brouter');
      return { coords: ft.geometry.coordinates, dist: parseFloat(ft.properties['track-length']) || 0 };
    } finally { clearTimeout(to); }
  }
  function niceMsg(m) { return String(m).replace('Téléchargement des routes', 'Analyse des routes'); }
  function setStatus(m, isErr) { msg = m; errMsg = isErr ? m : ''; paintStatus(); }
  function paintStatus() {
    var el = $('pl-status'); if (!el) return;
    var text = busy ? msg + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s' : errMsg;
    el.hidden = !text; el.textContent = text; el.className = 'pl-status' + (!busy && errMsg ? ' err' : '');
  }
  async function routeLeg(a, b, mode, k) {
    var f = MOTOS[st.moto][1], co = a[0] + ',' + a[1] + ';' + b[0] + ',' + b[1], out;
    var osrm = async function () {
      var d = await osrmJson(co + '?overview=full&geometries=geojson'); if (!d) throw new Error('serveur d\'itinéraire injoignable (étape ' + k + ')');
      var r = d.routes[0]; return { coords: r.geometry.coordinates, dist: r.distance, dur: r.duration / f };
    };
    if (mode === 'autoroute') out = await osrm();
    else if (mode === 'sinueux') {
      try {
        if (Date.now() > deadline - 4000) throw new Error('serveur de routes trop lent');
        var ref = null; try { setStatus('Trajet de référence…'); var d = await osrmJson(co + '?overview=full&geometries=geojson', 7000); if (d) ref = d.routes[0].geometry.coordinates; } catch (e) { }
        var o = await ExpertMoteur.leg(a, b, { ref: ref, style: Math.max(st.style, 55), avoidNat: !!st.avoid.nationales, status: function (m) { setStatus(niceMsg(m)); }, cancelled: function () { return cancelled; }, deadline: deadline });
        var kmh = Math.max(34, 60 - 24 * o.fun);
        out = { coords: o.coords, dist: o.dist, dur: o.dist / (kmh / 3.6) / f, fun: o.fun, engine: 'curvy' };
      } catch (e) {
        if (cancelled || (e && e.message === 'annulé')) throw new Error('annulé');
        var why = String((e && e.message) || e); setStatus('Moteur indisponible, calcul standard…');
        try { var br = await brouter(a, b, 'moped'); out = { coords: br.coords, dist: br.dist, dur: br.dist / (MODES[mode].kmh / 3.6) / f, fallback: true, why: why }; }
        catch (e2) { out = await osrm(); out.fallback = true; out.why = why; }
      }
    } else {
      try { setStatus('Calcul du tronçon…'); var br2 = await brouter(a, b, 'fastbike'); out = { coords: br2.coords, dist: br2.dist, dur: br2.dist / (MODES[mode].kmh / 3.6) / f }; }
      catch (e) { out = await osrm(); out.fallback = true; }
    }
    out.mode = mode; return out;
  }
  async function calculate() {
    if (busy) { cancelled = true; setStatus('Annulation…'); return; }
    if (st.pts.length < 2) { setStatus('Place au moins 2 points sur la carte : un départ et une arrivée.', true); return; }
    busy = true; cancelled = false; t0 = Date.now(); deadline = Date.now() + 45000; msg = 'Calcul…'; errMsg = '';
    var btn = $('pl-calc'); btn.textContent = 'Annuler'; btn.classList.add('pl-cancel');
    tick = setInterval(paintStatus, 1000); paintStatus();
    try {
      var seq = st.pts.map(function (p) { return p; });
      if (st.loop) seq.push({ ll: st.pts[0].ll, name: st.pts[0].name, mode: st.pts[st.pts.length - 1].mode });
      var legs = [];
      for (var k = 1; k < seq.length; k++) {
        if (cancelled) throw new Error('annulé');
        var m = effMode(Math.min(k, st.pts.length - 1)); setStatus(seq.length > 2 ? 'Tronçon ' + k + '/' + (seq.length - 1) : 'Calcul…');
        legs.push(await routeLeg(seq[k - 1].ll, seq[k].ll, m, k));
      }
      setStatus('Altitude et météo…');
      await analyse(legs);
      tab = 'analyse'; errMsg = ''; renderAll(); fit(); weather();
    } catch (e) {
      if (!(cancelled || (e && e.message === 'annulé'))) { console.warn('Planificateur : calcul', e); errMsg = 'Impossible de calculer l\'itinéraire : ' + String((e && e.message) || e) + '. Vérifie ta connexion et réessaie.'; }
    } finally { clearInterval(tick); busy = false; cancelled = false; btn.classList.remove('pl-cancel'); calcBtn(); paintStatus(); }
  }

  // ---------- analyse ----------
  function metres(c0, c1) { var R = 6371000, k = Math.PI / 180, x = (c1[0] - c0[0]) * k * Math.cos((c0[1] + c1[1]) / 2 * k), y = (c1[1] - c0[1]) * k; return Math.hypot(x, y) * R; }
  function resample(coords, step) {
    var out = [coords[0]], acc = 0, last = coords[0];
    for (var i = 1; i < coords.length; i++) {
      var c = coords[i], d = metres(last, c);
      while (acc + d >= step) { var t = (step - acc) / d, p = [last[0] + (c[0] - last[0]) * t, last[1] + (c[1] - last[1]) * t]; out.push(p); last = p; d = metres(last, c); acc = 0; }
      acc += d; last = c;
    }
    return out;
  }
  function bendsOf(coords) {
    var P = resample(coords.map(function (c) { return [c[0], c[1]]; }), 20), res = { light: 0, tight: 0, hair: 0, pins: [] };
    if (P.length < 5) return res;
    var brg = function (a, b) { return Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI; };
    var H = []; for (var i = 0; i + 2 < P.length; i++) H.push(brg(P[i], P[i + 2]));
    var wrap = function (d) { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
    var sum = 0, len = 0, sign = 0, quiet = 0, startIdx = 0;
    var close = function (end) {
      var T = Math.abs(sum);
      if (T >= 25) { if (T >= 120 && len <= 200) { res.hair++; res.pins.push(P[Math.min(P.length - 1, Math.round((startIdx + end) / 2) + 1)]); } else if (T >= 60) res.tight++; else res.light++; }
      sum = 0; len = 0; sign = 0; quiet = 0;
    };
    for (var j = 1; j < H.length; j++) {
      var d = wrap(H[j] - H[j - 1]);
      if (Math.abs(d) >= 1.5) { var sg = d > 0 ? 1 : -1; if (sign && sg !== sign) close(j); if (!sign) startIdx = j; sign = sg; sum += d; len += 20; quiet = 0; }
      else if (sign && ++quiet >= 3) close(j);
    }
    if (sign) close(H.length);
    return res;
  }
  async function elevations(coords) {
    var N = 80, idx = []; for (var i = 0; i < N; i++) idx.push(Math.round(i * (coords.length - 1) / (N - 1)));
    var la = idx.map(function (i) { return coords[i][1].toFixed(4); }).join(','), lo = idx.map(function (i) { return coords[i][0].toFixed(4); }).join(',');
    try {
      var d = await getJSON('https://api.open-meteo.com/v1/elevation?latitude=' + la + '&longitude=' + lo, 9000);
      if (!d.elevation || d.elevation.length !== N) return null;
      var out = new Array(coords.length);
      for (var a = 0; a < N - 1; a++) for (var j = idx[a]; j <= idx[a + 1]; j++) { var t = idx[a + 1] === idx[a] ? 0 : (j - idx[a]) / (idx[a + 1] - idx[a]); out[j] = d.elevation[a] + (d.elevation[a + 1] - d.elevation[a]) * t; }
      return out;
    } catch (e) { return null; }
  }
  async function analyse(legs) {
    var all = [], dist = 0, dur = 0, pauseTot = 0;
    legs.forEach(function (l) { all.push.apply(all, all.length ? l.coords.slice(1) : l.coords); dist += l.dist; dur += l.dur; });
    st.pts.forEach(function (p) { if (p.kind === 'stop') pauseTot += (p.pause || 0) * 60; });
    var b = { light: 0, tight: 0, hair: 0, pins: [] };
    legs.forEach(function (l) { var r = bendsOf(l.coords); b.light += r.light; b.tight += r.tight; b.hair += r.hair; b.pins.push.apply(b.pins, r.pins); });
    var c = 0, legDist = legs.map(function (l) { return (c += l.dist); }), t = 0, legTime = legs.map(function (l) { return (t += l.dur); });
    var z = await elevations(all), elev = null, gain = 0, max = null;
    if (z) {
      var N = 120, ev = []; for (var i = 0; i < N; i++) ev.push(z[Math.round(i * (z.length - 1) / (N - 1))]);
      var sm = ev.map(function (v, i) { var a = 0, n = 0; for (var j = Math.max(0, i - 1); j <= Math.min(N - 1, i + 1); j++) { a += ev[j]; n++; } return a / n; });
      for (var k = 1; k < N; k++) if (sm[k] > sm[k - 1]) gain += sm[k] - sm[k - 1];
      max = Math.max.apply(null, sm); elev = sm;
    }
    st.res = { legs: legs, dist: dist, dur: dur, pauseTot: pauseTot, legDist: legDist, legTime: legTime, elev: elev, gain: Math.round(gain), max: max == null ? null : Math.round(max),
      bends: b.light + b.tight + b.hair, light: b.light, tight: b.tight, hair: b.hair, pinPts: b.pins, wx: null, cmp: null };
  }
  function etas() {
    var r = st.res; if (!r) return []; var t0m = new Date(st.depart).getTime(); if (isNaN(t0m)) return [];
    var out = [], pause = 0;
    st.pts.forEach(function (p, i) { var driven = i === 0 ? 0 : (r.legTime[i - 1] || 0); out.push(new Date(t0m + (driven + pause) * 1000)); if (p.kind === 'stop') pause += (p.pause || 0) * 60; });
    return out;
  }
  async function weather() {
    var r = st.res; if (!r) return; var eta = etas(); if (!eta.length) return;
    var key = JSON.stringify([st.depart, st.pts.map(function (p) { return p.ll; }), st.pts.map(function (p) { return p.pause; })]); r.wxKey = key;
    var out = await Promise.all(st.pts.map(async function (p, i) {
      try {
        var d = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + p.ll[1] + '&longitude=' + p.ll[0] + '&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=7', 9000);
        var e = eta[i], pad = function (n) { return String(n).padStart(2, '0'); }, h = Math.round(e.getTime() / 3600000) * 3600000, hh = new Date(h);
        var tag = hh.getFullYear() + '-' + pad(hh.getMonth() + 1) + '-' + pad(hh.getDate()) + 'T' + pad(hh.getHours()) + ':00', k = d.hourly.time.indexOf(tag); if (k < 0) return null;
        return { code: d.hourly.weather_code[k], t: Math.round(d.hourly.temperature_2m[k]), pop: d.hourly.precipitation_probability[k] || 0 };
      } catch (er) { return null; }
    }));
    if (st.res !== r || r.wxKey !== key) return;
    r.wx = out; r.wxDone = true; renderBody(); renderStats();
  }
  var wxBad = function (w) { return !!w && (w.code >= 95 || w.pop >= 70 || (w.code >= 61 && w.code <= 67) || (w.code >= 80 && w.code <= 82)); };
  async function compare() {
    var r = st.res; if (!r || r.cmpBusy) return; r.cmpBusy = true; renderBody();
    try {
      var legs = [];
      for (var k = 1; k < st.pts.length + (st.loop ? 1 : 0); k++) { var a = st.pts[k - 1].ll, b = st.pts[k % st.pts.length].ll; legs.push(await routeLeg(a, b, 'autoroute', k)); }
      var bn = { light: 0, tight: 0, hair: 0 }, dist = 0, dur = 0;
      legs.forEach(function (l) { var x = bendsOf(l.coords); bn.light += x.light; bn.tight += x.tight; bn.hair += x.hair; dist += l.dist; dur += l.dur; });
      r.cmp = { dist: dist, dur: dur, bends: bn.light + bn.tight + bn.hair, hair: bn.hair };
    } catch (e) { errMsg = 'Comparaison impossible : ' + String((e && e.message) || e); }
    r.cmpBusy = false; renderBody(); paintStatus();
  }

  // ---------- GPX ----------
  function exportGpx() {
    var r = st.res; if (!r) return;
    var coords = []; r.legs.forEach(function (l, i) { (i ? l.coords.slice(1) : l.coords).forEach(function (c) { coords.push(c); }); });
    var name = st.title || (st.pts[0].name + ' - ' + st.pts[st.pts.length - 1].name);
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RideNCT" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>' + esc(name) + '</name></metadata>\n';
    st.pts.forEach(function (p) { x += '<wpt lat="' + p.ll[1] + '" lon="' + p.ll[0] + '"><name>' + esc(p.name) + '</name></wpt>\n'; });
    x += '<trk><name>' + esc(name) + '</name><trkseg>\n';
    coords.forEach(function (c) { x += '<trkpt lat="' + (+c[1]).toFixed(5) + '" lon="' + (+c[0]).toFixed(5) + '"/>\n'; });
    x += '</trkseg></trk>\n</gpx>\n';
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob([x], { type: 'application/gpx+xml' }));
    a.href = url; a.download = (name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'itineraire') + '.gpx';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function importGpx() {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.gpx,application/gpx+xml,text/xml';
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () {
        try {
          var x = new DOMParser().parseFromString(rd.result, 'text/xml');
          var pts = Array.prototype.map.call(x.querySelectorAll('trkpt, rtept'), function (e) { return [parseFloat(e.getAttribute('lon')), parseFloat(e.getAttribute('lat'))]; }).filter(function (c) { return isFinite(c[0]) && isFinite(c[1]); });
          if (pts.length < 2) { setStatus('Ce fichier GPX ne contient pas assez de points.', true); return; }
          var n = Math.min(8, pts.length), pick = []; for (var i = 0; i < n; i++) pick.push(pts[Math.round(i * (pts.length - 1) / (n - 1))]);
          var nm = x.querySelector('trk > name, rte > name, gpx > name');
          st.pts = pick.map(function (c, i) { return { ll: [+c[0].toFixed(5), +c[1].toFixed(5)], name: i === 0 ? 'Départ' : i === n - 1 ? 'Arrivée' : 'Étape ' + i, kind: 'pass', pause: 0, mode: 'auto' }; });
          st.title = nm && nm.textContent ? nm.textContent.trim() : f.name.replace(/\.[^.]+$/, '');
          touch(); fit(); st.pts.forEach(function (p) { reverseName(p, true); });
        } catch (e) { setStatus('Fichier GPX illisible.', true); }
      };
      rd.readAsText(f);
    };
    inp.click();
  }

  // ---------- panneau ----------
  var fmtDur = function (s) { var m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' min'; };
  var fmtT = function (d) { return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };
  function renderStats() {
    var r = st.res, km = r ? r.dist / 1000 : 0, tot = r ? r.dur + r.pauseTot : 0;
    $('pl-stats').innerHTML = '<div><b>' + (r ? Math.round(km) + ' km' : '–') + '</b><small>Distance</small></div><div><b>' + (r ? fmtDur(tot) : '–') + '</b><small>Durée</small></div><div><b>' + (r ? r.bends : '–') + '</b><small>Virages</small></div><div><b class="hot">' + (r ? r.hair : '–') + '</b><small>Épingles</small></div>';
  }
  function renderTabs() {
    var T = [['etapes', 'Étapes'], ['reglages', 'Réglages'], ['analyse', 'Analyse'], ['outils', 'Outils']];
    $('pl-tabs').innerHTML = T.map(function (t) { return '<button type="button" role="tab" class="pl-tab' + (tab === t[0] ? ' on' : '') + '" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>'; }).join('');
  }
  function guideHtml() {
    var n = st.pts.length, cur = st.res ? 3 : n >= 2 ? 2 : 1;
    var s = [['Place tes points', 'départ, étapes, arrivée'], ['Calcule', 'le tracé le plus sympa'], ['Exporte', 'GPX vers ton téléphone']];
    return '<ol class="pl-guide" aria-label="Marche à suivre">' + s.map(function (x, i) { return '<li class="' + (i + 1 === cur ? 'now' : i + 1 < cur ? 'done' : '') + '"><b>' + (i + 1 < cur ? '✓' : i + 1) + '</b><span>' + x[0] + '<small>' + x[1] + '</small></span></li>'; }).join('') + '</ol>';
  }
  function stepsHtml() {
    var n = st.pts.length, r = st.res;
    if (!n) return guideHtml() + '<p class="pl-help">Clique sur la carte pour placer ton départ, puis tes étapes et ton arrivée. Tu peux aussi chercher un lieu en haut du panneau.</p>';
    return guideHtml() + st.pts.map(function (p, i) {
      var lg = r && i > 0 && r.legs[i - 1] ? r.legs[i - 1] : null;
      var modes = i === 0 ? '' : '<div class="pl-chips">' + ['auto'].concat(Object.keys(MODES)).map(function (k) { return '<button type="button" class="pl-c' + (p.mode === k ? ' on' : '') + '" data-mode="' + k + '" data-i="' + i + '">' + (k === 'auto' ? 'Auto' : MODES[k].label) + '</button>'; }).join('') + '</div>';
      var kind = i === 0 ? '' : '<div class="pl-row2"><button type="button" class="pl-c' + (p.kind === 'stop' ? ' on' : '') + '" data-kind="' + i + '">' + (p.kind === 'stop' ? 'Arrêt' : 'Passage') + '</button>' + (p.kind === 'stop' ? '<label class="pl-pause">pause <input type="number" min="0" max="240" step="5" value="' + p.pause + '" data-pause="' + i + '" aria-label="Durée de la pause en minutes"> min</label>' : '') + '</div>';
      var info = lg ? '<div class="pl-leg">' + MODES[lg.mode].label + ' · ' + Math.round(lg.dist / 1000) + ' km · ' + fmtDur(lg.dur) + '</div>' : '';
      return '<div class="pl-step" data-i="' + i + '"><div class="pl-r1"><span class="pl-grip" draggable="true" data-i="' + i + '" title="Glisser pour changer l\'ordre" aria-hidden="true">⋮⋮</span><span class="pl-dot ' + (i === 0 ? 's' : p.kind === 'stop' ? 'a' : 'v') + '">' + label(i, n) + '</span>'
        + '<input class="pl-nm" value="' + esc(p.name) + '" data-name="' + i + '" aria-label="Nom de l\'étape ' + (i + 1) + '">'
        + '<button type="button" class="pl-ib" data-up="' + i + '" aria-label="Monter" ' + (i === 0 ? 'disabled' : '') + '>↑</button><button type="button" class="pl-ib" data-dn="' + i + '" aria-label="Descendre" ' + (i === n - 1 ? 'disabled' : '') + '>↓</button>'
        + '<button type="button" class="pl-ib" data-del="' + i + '" aria-label="Supprimer ce point">×</button></div>' + modes + kind + info + '</div>';
    }).join('') + '<p class="pl-help">Sans choix, le mode suit le style de route (onglet Réglages). Clique sur le tracé pour ajouter une étape.</p>';
  }
  function settingsHtml() {
    var styleName = st.style >= 67 ? 'Le plus tordu' : st.style >= 34 ? 'Sinueux' : st.style >= 15 ? 'Rapide' : 'Direct';
    var pre = PRESETS.map(function (P) { var on = st.style === P.style && ['autoroutes', 'peages', 'nationales'].every(function (k) { return !!st.avoid[k] === P.avoid[k]; }) && st.loop === P.loop; return '<button type="button" class="pl-c' + (on ? ' on' : '') + '" data-preset="' + P.id + '">' + P.label + '</button>'; }).join('');
    var av = [['autoroutes', 'Autoroutes'], ['peages', 'Péages'], ['nationales', 'Nationales']].map(function (a) { return '<button type="button" class="pl-c' + (st.avoid[a[0]] ? ' on' : '') + '" data-avoid="' + a[0] + '">' + a[1] + '</button>'; }).join('');
    var mo = Object.keys(MOTOS).map(function (k) { return '<button type="button" class="pl-c' + (st.moto === k ? ' on' : '') + '" data-moto="' + k + '">' + MOTOS[k][0] + '</button>'; }).join('');
    return '<div class="pl-card"><h3>Préréglages</h3><div class="pl-chips">' + pre + '</div></div>'
      + '<div class="pl-card"><h3>Style de route <span id="pl-sname">' + styleName + ' · ' + st.style + ' %</span></h3><input type="range" id="pl-style" min="0" max="100" value="' + st.style + '" aria-label="Style de route"><div class="pl-rl"><span>Rapide</span><span>Équilibré</span><span>Le plus tordu</span></div></div>'
      + '<div class="pl-card"><h3>Éviter</h3><div class="pl-chips">' + av + '</div></div>'
      + '<div class="pl-card"><h3>Objectif</h3><div class="pl-chips"><button type="button" class="pl-c' + (!st.loop ? ' on' : '') + '" data-loop="0">Aller simple</button><button type="button" class="pl-c' + (st.loop ? ' on' : '') + '" data-loop="1">Boucle</button></div></div>'
      + '<div class="pl-card"><h3>Profil moto</h3><div class="pl-chips">' + mo + '</div></div>'
      + '<div class="pl-card"><h3>Départ</h3><input type="datetime-local" id="pl-dep" value="' + esc(st.depart) + '" aria-label="Date et heure de départ"></div>';
  }
  function altSvg(r, h) {
    var e = r.elev, W = 320, lo = Math.min.apply(null, e), hi = Math.max.apply(null, e), span = Math.max(30, hi - lo), N = e.length;
    var X = function (i) { return (i / (N - 1) * W).toFixed(1); }, Y = function (v) { return (h - 6 - (v - lo) / span * (h - 14)).toFixed(1); };
    var line = e.map(function (v, i) { return (i ? 'L' : 'M') + X(i) + ' ' + Y(v); }).join(' '), marks = '';
    st.pts.forEach(function (p, i) { if (i === 0 || i > r.legDist.length) return; var d = r.legDist[i - 1] / r.dist * W; marks += '<line x1="' + d.toFixed(1) + '" x2="' + d.toFixed(1) + '" y1="0" y2="' + h + '" stroke="currentColor" stroke-dasharray="2 3" opacity=".45"/>'; });
    return '<svg class="pl-alt" viewBox="0 0 ' + W + ' ' + h + '" preserveAspectRatio="none" style="height:' + h + 'px" role="img" aria-label="Profil d\'altitude"><path d="' + line + ' L' + W + ' ' + h + ' L0 ' + h + 'Z" fill="currentColor" opacity=".16"/><path d="' + line + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>' + marks + '</svg>';
  }
  function analyseHtml() {
    var r = st.res; if (!r) return '<p class="pl-help">Calcule l\'itinéraire pour voir l\'altitude, les virages et la météo à chaque étape.</p>';
    var km = r.dist / 1000, mx = Math.max(1, r.light, r.tight, r.hair), perKm = km ? r.bends / km : 0;
    var rate = perKm >= 1.2 ? 'Route excellente' : perKm >= 0.7 ? 'Très amusante' : perKm >= 0.35 ? 'Sympa' : 'Plutôt calme';
    var bar = function (l, v, c) { return '<span>' + l + '</span><div class="pl-bar"><i style="width:' + Math.round(v / mx * 100) + '%;background:' + c + '"></i></div><span>' + v + '</span>'; };
    var h = '';
    h += r.elev ? '<div class="pl-card"><h3>Altitude <span>max ' + r.max + ' m · +' + r.gain + ' m</span></h3>' + altSvg(r, 90) + '<div class="pl-lg"><span>Départ</span><span>Arrivée</span></div></div>' : '<div class="pl-card"><h3>Altitude</h3><p class="pl-help">Données d\'altitude indisponibles pour le moment.</p></div>';
    h += '<div class="pl-card"><h3>Compteur de virages <span>' + rate + ' · ' + perKm.toFixed(2).replace('.', ',') + ' par km</span></h3><div class="pl-bars">' + bar('Légers', r.light, '#8aa0a6') + bar('Serrés', r.tight, '#12877f') + bar('Épingles', r.hair, '#e8873a') + '</div></div>';
    var eta = etas(), wx = '', warn = '';
    if (r.wx) {
      wx = '<div class="pl-wx">' + st.pts.map(function (p, i) { var w = r.wx[i]; return '<div class="' + (wxBad(w) ? 'bad' : '') + '"><small>' + label(i, st.pts.length) + (eta[i] ? ' · ' + fmtT(eta[i]) : '') + '</small>' + (w ? '<b>' + w.t + '°</b><small>' + WX_TEXT(w.code) + '</small>' : '<b>–</b>') + '</div>'; }).join('') + '</div>';
      var bi = r.wx.findIndex(wxBad); if (bi >= 0) warn = '<p class="pl-warn">Pluie ou orage prévu vers ' + fmtT(eta[bi]) + ' à ' + esc(st.pts[bi].name) + '. Pense à partir plus tôt ou à décaler.</p>';
    } else wx = '<p class="pl-help">' + (r.wxDone ? 'Météo indisponible pour cette date.' : 'Prévisions en cours de chargement…') + '</p>';
    h += '<div class="pl-card"><h3>Météo à chaque étape</h3>' + wx + warn + '</div>';
    if (r.cmp) {
      var c = r.cmp, dk = Math.round((r.dist - c.dist) / 1000), dm = Math.round((r.dur - c.dur) / 60), db = r.bends - c.bends, sg = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v); };
      h += '<div class="pl-card"><h3>Comparaison · trajet direct</h3><div class="pl-cmp"><span></span><b>Direct</b><b>Ton tracé</b><span>Distance</span><span>' + Math.round(c.dist / 1000) + ' km</span><span>' + Math.round(r.dist / 1000) + ' km</span><span>Durée</span><span>' + fmtDur(c.dur) + '</span><span>' + fmtDur(r.dur) + '</span><span>Virages</span><span>' + c.bends + '</span><span>' + r.bends + '</span><span>Épingles</span><span>' + c.hair + '</span><span>' + r.hair + '</span></div><p class="pl-help">' + sg(dk) + ' km · ' + sg(dm) + ' min · ' + sg(db) + ' virages par rapport au trajet direct.</p></div>';
    } else h += '<div class="pl-card"><h3>Comparaison</h3><button type="button" class="pl-c on" data-cmp="1" ' + (r.cmpBusy ? 'disabled' : '') + '>' + (r.cmpBusy ? 'Calcul du trajet direct…' : 'Comparer avec le trajet direct') + '</button></div>';
    var fb = r.legs.filter(function (l) { return l.fallback; }), cv = r.legs.filter(function (l) { return l.engine === 'curvy'; });
    if (fb.length) h += '<p class="pl-help">' + (fb.length > 1 ? fb.length + ' tronçons ont été calculés' : 'Un tronçon a été calculé') + ' avec le routage standard : ' + esc(fb[0].why || 'service indisponible') + '.</p>';
    if (cv.length) h += '<p class="pl-help">' + cv.length + ' tronçon' + (cv.length > 1 ? 's' : '') + ' calculé' + (cv.length > 1 ? 's' : '') + ' par la recherche de routes d\'amusement.</p>';
    return h;
  }
  function toolsHtml() {
    var r = st.res, n = st.pts.length;
    var t = function (id, l, sub, dis) { return '<button type="button" class="pl-tl" data-tool="' + id + '" ' + (dis ? 'disabled' : '') + '><b>' + l + '</b><small>' + sub + '</small></button>'; };
    return '<div class="pl-card pl-send"><h3>Envoyer sur ton téléphone</h3><div class="pl-tg">' + t('exp', 'Exporter GPX', 'pour ton GPS ou l\'app', !r) + t('imp', 'Importer GPX', 'depuis un fichier', false) + '</div></div>'
      + '<div class="pl-tg">' + t('undo', 'Annuler', 'dernière modification', !hist.u.length) + t('redo', 'Rétablir', 'modification annulée', !hist.r.length)
      + t('rev', 'Inverser', 'le sens du trajet', n < 2) + t('reset', 'Tout effacer', 'nouvel itinéraire', !n) + '</div>'
      + '<div class="pl-card pl-app"><h3>Encore plus loin dans l\'app</h3><p class="pl-help">Calcul hors ligne sur le téléphone, suivi GPS du tracé sans recalcul, cartes téléchargées, partage au groupe. <a href="tarifs.html">Voir ce qui est inclus</a></p></div>';
  }
  function renderBody() {
    var el = $('pl-body'), keep = el.scrollTop;
    el.innerHTML = tab === 'etapes' ? stepsHtml() : tab === 'reglages' ? settingsHtml() : tab === 'analyse' ? analyseHtml() : toolsHtml();
    el.scrollTop = keep;
  }
  function renderSteps() { if (tab === 'etapes' && document.activeElement && document.activeElement.className !== 'pl-nm') renderBody(); }
  function calcBtn() {
    var b = $('pl-calc'); if (!b || busy) return;
    b.textContent = st.res ? 'Recalculer l\'itinéraire' : 'Calculer l\'itinéraire';
    b.classList.toggle('hot', !st.res && st.pts.length >= 2);
  }
  function renderAll() { calcBtn(); renderStats(); renderTabs(); renderBody(); syncMap(); $('pl-hint').hidden = st.pts.length > 0; paintStatus(); }

  function bind() {
    var body = $('pl-body');
    $('pl-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; renderTabs(); renderBody(); } });
    body.addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return; var d = t.dataset;
      if (d.up != null) move(+d.up, +d.up - 1); else if (d.dn != null) move(+d.dn, +d.dn + 1); else if (d.del != null) remove(+d.del);
      else if (d.mode) { st.pts[+d.i].mode = d.mode; touch(); }
      else if (d.kind != null) { var p = st.pts[+d.kind]; p.kind = p.kind === 'stop' ? 'pass' : 'stop'; if (p.kind === 'stop' && !p.pause) p.pause = 15; touch(); }
      else if (d.preset) { var P = PRESETS.filter(function (x) { return x.id === d.preset; })[0]; st.style = P.style; st.avoid = JSON.parse(JSON.stringify(P.avoid)); st.loop = P.loop; touch(); }
      else if (d.avoid) { st.avoid[d.avoid] = !st.avoid[d.avoid]; touch(); }
      else if (d.loop != null) { st.loop = d.loop === '1'; touch(); }
      else if (d.moto) { st.moto = d.moto; touch(); }
      else if (d.cmp) compare();
      else if (d.tool) { var k = d.tool; if (k === 'undo') undo(); else if (k === 'redo') redo(); else if (k === 'rev') reverse(); else if (k === 'imp') importGpx(); else if (k === 'exp') exportGpx(); else if (k === 'reset') reset(); }
    });
    body.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.name != null) { var p = st.pts[+t.dataset.name]; p.name = t.value.trim() || p.name; save(); syncMarkers(); }
      else if (t.dataset.pause != null) { st.pts[+t.dataset.pause].pause = Math.max(0, Math.min(240, +t.value || 0)); touch(); }
      else if (t.id === 'pl-style') { st.style = +t.value; touch(); }
      else if (t.id === 'pl-dep') { st.depart = t.value || st.depart; if (st.res) { st.res.wx = null; st.res.wxDone = false; renderBody(); renderStats(); weather(); } }
    });
    body.addEventListener('input', function (e) {
      if (e.target.id === 'pl-style') { var v = +e.target.value; $('pl-sname').textContent = (v >= 67 ? 'Le plus tordu' : v >= 34 ? 'Sinueux' : v >= 15 ? 'Rapide' : 'Direct') + ' · ' + v + ' %'; }
    });
    var dragFrom = -1;
    body.addEventListener('dragstart', function (e) { var g = e.target.closest('.pl-grip'); if (!g) return; dragFrom = +g.dataset.i; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (er) { } });
    body.addEventListener('dragover', function (e) { if (dragFrom >= 0 && e.target.closest('.pl-step')) e.preventDefault(); });
    body.addEventListener('drop', function (e) { var s = e.target.closest('.pl-step'); if (!s || dragFrom < 0) return; e.preventDefault(); var to = +s.dataset.i, from = dragFrom; dragFrom = -1; move(from, to); });
    body.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList.contains('pl-nm')) e.target.blur(); });

    $('pl-calc').addEventListener('click', calculate);
    $('pl-me').addEventListener('click', myPosition);
    var q = $('pl-q');
    q.addEventListener('input', function () { clearTimeout(qTimer); var t = q.value.trim(); if (t.length < 3) { qSeq++; $('pl-sl').hidden = true; return; } qTimer = setTimeout(function () { runSearch(t); }, 300); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = $('pl-sl').querySelector('.pl-res'); if (f) f.click(); } else if (e.key === 'Escape') { $('pl-sl').hidden = true; } });
    document.addEventListener('click', function (e) { if (!e.target.closest('.pl-search')) $('pl-sl').hidden = true; });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('planner')) return;
    st = load(); hist.last = snap();
    bind(); initMap(); renderAll();
    window.addEventListener('beforeunload', save);
  });
})();
