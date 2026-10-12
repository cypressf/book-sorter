(function () {
  "use strict";

  var PAGE = 40;
  var QUICK_GENRES = ["Fantasy", "Science Fiction", "Romance", "Mystery", "Thriller", "Historical Fiction",
    "Nonfiction", "Classics", "Horror", "Young Adult", "Memoir", "Literary Fiction"];

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    q: $("q"), sort: $("sort"), toggle: $("toggleFilters"), filters: $("filters"), filterCount: $("filterCount"),
    incChips: $("incChips"), excChips: $("excChips"), incInput: $("incInput"), excInput: $("excInput"),
    quick: $("quickGenres"), genreList: $("genreList"),
    minRating: $("minRating"), minCount: $("minCount"), yearFrom: $("yearFrom"), yearTo: $("yearTo"),
    pagesMin: $("pagesMin"), pagesMax: $("pagesMax"), bundles: $("bundles"), lang: $("lang"), type: $("type"), prior: $("prior"),
    reset: $("reset"), status: $("status"), results: $("results"), more: $("more"), mean: $("meanRating")
  };

  var DATA = null;      // raw payload
  var BOOKS = [];       // parsed books
  var matches = [];     // current filtered + sorted list
  var shown = 0;
  var include = [];     // genre names
  var exclude = [];

  // Box sets, omnibuses, sheet music etc. crowd the top of rating sorts, so they're hidden by default.
  var BUNDLE_RX = /box(ed)?[\s-]*set|boxset|\bcollection\b|omnibus|sheet music|songbook|piano|for (flute|violin|clarinet|guitar|trumpet)|selections from|\bbooks? \d+\s*[-–&]\s*\d+|\bvol(ume)?s?\.? \d+\s*[-–]\s*\d+|coloring book|calendar|\bbundle\b|complete (series|trilogy|saga|novels)|\b\d+-book set|;.*;/i;

  var NUMERIC = ["minRating", "minCount", "yearFrom", "yearTo", "pagesMin", "pagesMax"];
  var DEFAULTS = { sort: "weighted", prior: "1000", lang: "", type: "" };

  // ---------- data ----------
  function parse(d) {
    var genres = d.genres, langs = d.languages;
    return d.books.map(function (r) {
      var series = r[9] || "";
      var m = series.match(/^(.*?)\s*#(\S+)$/);
      return {
        id: r[0], title: r[1], author: r[2], rating: r[3], count: r[4],
        genres: r[5].map(function (k) { return genres[k]; }),
        year: r[6] || null, pages: r[7] || null,
        lang: r[8] >= 0 ? langs[r[8]] : "",
        series: m ? m[1] : series, seriesNo: m ? m[2] : "",
        cover: r[10], stars: r[11], // [5,4,3,2,1]
        bundle: BUNDLE_RX.test(r[1]),
        hay: (r[1] + " " + r[2] + " " + series).toLowerCase()
      };
    });
  }

  function coverUrl(b) {
    if (!b.cover) return "";
    if (/^https?:/.test(b.cover)) return b.cover;
    if (/\.jpg$/.test(b.cover)) return DATA.coverPrefix + b.cover;
    return DATA.coverPrefix + b.cover + "/" + b.id + ".jpg";
  }

  // ---------- state <-> URL ----------
  function readState() {
    var p = new URLSearchParams(location.search);
    els.q.value = p.get("q") || "";
    els.sort.value = p.get("sort") || DEFAULTS.sort;
    els.prior.value = p.get("m") || DEFAULTS.prior;
    els.lang.value = p.get("lang") || "";
    els.type.value = p.get("type") || "";
    NUMERIC.forEach(function (k) { els[k].value = p.get(k) || ""; });
    include = (p.get("g") || "").split("|").filter(Boolean);
    exclude = (p.get("x") || "").split("|").filter(Boolean);
    els.bundles.checked = p.get("sets") !== "1";
    if (els.sort.selectedIndex < 0) els.sort.value = DEFAULTS.sort;
    if (els.prior.selectedIndex < 0) els.prior.value = DEFAULTS.prior;
  }

  function writeState() {
    var p = new URLSearchParams();
    if (els.q.value.trim()) p.set("q", els.q.value.trim());
    if (els.sort.value !== DEFAULTS.sort) p.set("sort", els.sort.value);
    if (els.prior.value !== DEFAULTS.prior) p.set("m", els.prior.value);
    if (els.lang.value) p.set("lang", els.lang.value);
    if (els.type.value) p.set("type", els.type.value);
    NUMERIC.forEach(function (k) { if (els[k].value !== "") p.set(k, els[k].value); });
    if (!els.bundles.checked) p.set("sets", "1");
    if (include.length) p.set("g", include.join("|"));
    if (exclude.length) p.set("x", exclude.join("|"));
    var qs = p.toString();
    history.replaceState(null, "", qs ? "?" + qs : location.pathname);
  }

  // ---------- filtering ----------
  function num(el) { var v = parseFloat(el.value); return isNaN(v) ? null : v; }

  function apply() {
    if (!BOOKS.length) return;
    var words = els.q.value.toLowerCase().split(/\s+/).filter(Boolean);
    var minR = num(els.minRating), minN = num(els.minCount);
    var y0 = num(els.yearFrom), y1 = num(els.yearTo);
    var p0 = num(els.pagesMin), p1 = num(els.pagesMax);
    var lang = els.lang.value, type = els.type.value, hideSets = els.bundles.checked;
    var m = parseFloat(els.prior.value) || 1000, C = DATA.meanRating;

    matches = BOOKS.filter(function (b) {
      if (hideSets && b.bundle) return false;
      if (minR !== null && b.rating < minR) return false;
      if (minN !== null && b.count < minN) return false;
      if (y0 !== null && (b.year === null || b.year < y0)) return false;
      if (y1 !== null && (b.year === null || b.year > y1)) return false;
      if (p0 !== null && (b.pages === null || b.pages < p0)) return false;
      if (p1 !== null && (b.pages === null || b.pages > p1)) return false;
      if (lang && b.lang !== lang) return false;
      if (type === "standalone" && b.series) return false;
      if (type === "series" && !b.series) return false;
      if (type === "first" && b.seriesNo !== "1") return false;
      for (var i = 0; i < include.length; i++) if (b.genres.indexOf(include[i]) < 0) return false;
      for (var j = 0; j < exclude.length; j++) if (b.genres.indexOf(exclude[j]) >= 0) return false;
      for (var k = 0; k < words.length; k++) if (b.hay.indexOf(words[k]) < 0) return false;
      return true;
    });

    matches.forEach(function (b) { b.score = (b.count * b.rating + m * C) / (b.count + m); });

    var s = els.sort.value;
    var cmp = {
      weighted: function (a, b) { return b.score - a.score; },
      rating: function (a, b) { return b.rating - a.rating || b.count - a.count; },
      count: function (a, b) { return b.count - a.count; },
      newest: function (a, b) { return (b.year || -1e9) - (a.year || -1e9) || b.score - a.score; },
      oldest: function (a, b) { return (a.year || 1e9) - (b.year || 1e9) || b.score - a.score; },
      "short": function (a, b) { return (a.pages || 1e9) - (b.pages || 1e9) || b.score - a.score; },
      "long": function (a, b) { return (b.pages || -1) - (a.pages || -1) || b.score - a.score; }
    }[s] || function (a, b) { return b.score - a.score; };
    matches.sort(cmp);

    shown = 0;
    els.results.innerHTML = "";
    renderMore();
    els.status.textContent = matches.length.toLocaleString() + " book" + (matches.length === 1 ? "" : "s");
    updateFilterCount();
    writeState();
  }

  function updateFilterCount() {
    var n = include.length + exclude.length + (els.lang.value ? 1 : 0) + (els.type.value ? 1 : 0) + (els.bundles.checked ? 0 : 1);
    NUMERIC.forEach(function (k) { if (els[k].value !== "") n++; });
    els.filterCount.textContent = n ? String(n) : "";
  }

  // ---------- rendering ----------
  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function histogram(b) {
    if (!b.stars || b.stars.length !== 5) return "";
    var asc = b.stars.slice().reverse(); // 1★..5★
    var max = Math.max.apply(null, asc) || 1;
    var bars = asc.map(function (c, i) {
      return '<span class="bar" style="height:' + Math.max(4, Math.round(c / max * 100)) + '%" title="' +
        (i + 1) + '★: ' + c.toLocaleString() + '"></span>';
    }).join("");
    return '<button type="button" class="hist" aria-expanded="false" aria-label="Show rating breakdown">' +
      '<span class="end">★</span><span class="bars">' + bars + '</span><span class="end">★★★★★</span></button>';
  }

  function detail(b) {
    var total = b.stars.reduce(function (a, c) { return a + c; }, 0) || 1;
    var rows = b.stars.map(function (c, i) {
      var pct = c / total * 100;
      return "<tr><td class='s'>" + (5 - i) + "★</td><td><div class='track'><div class='fill' style='width:" +
        pct.toFixed(1) + "%'></div></div></td><td class='p'>" + pct.toFixed(pct < 10 ? 1 : 0) + "%</td><td class='c'>" +
        c.toLocaleString() + "</td></tr>";
    }).join("");
    return "<div class='detail'><table>" + rows + "</table></div>";
  }

  function card(b, rank) {
    var gr = "https://www.goodreads.com/book/show/" + b.id;
    var sg = "https://app.thestorygraph.com/browse?search_term=" + encodeURIComponent(b.title + " " + b.author);
    var meta = esc(b.author) + (b.year ? " · " + (b.year < 0 ? -b.year + " BC" : b.year) : "") +
      (b.pages ? " · " + b.pages + " pp" : "");
    var series = b.series ? "<div class='meta'>" + esc(b.series) + (b.seriesNo ? " #" + esc(b.seriesNo) : "") + "</div>" : "";
    var img = coverUrl(b);
    var li = document.createElement("li");
    li.className = "book";
    li.innerHTML =
      "<div class='rank'>" + rank + "</div>" +
      "<a href='" + gr + "' target='_blank' rel='noopener'>" +
        (img ? "<img class='cover' loading='lazy' referrerpolicy='no-referrer' alt='' src='" + esc(img) + "'>" : "<div class='cover'></div>") +
      "</a>" +
      "<div class='info'>" +
        "<h2 class='title'><a href='" + gr + "' target='_blank' rel='noopener'>" + esc(b.title) + "</a></h2>" +
        "<div class='meta'>" + meta + "</div>" + series +
        "<div class='scoreline'>" +
          "<div class='nums'><b>" + b.rating.toFixed(2) + "</b> ★ <span class='sub'>" + fmt(b.count) + " ratings · weighted " + b.score.toFixed(2) + "</span></div>" +
          histogram(b) +
        "</div>" +
        "<div class='slot'></div>" +
        (b.genres.length ? "<div class='genres'>" + b.genres.slice(0, 5).map(esc).join(" · ") + "</div>" : "") +
        "<div class='links'><a href='" + gr + "' target='_blank' rel='noopener'>Goodreads</a>" +
        "<a href='" + sg + "' target='_blank' rel='noopener'>StoryGraph</a></div>" +
      "</div>";
    var h = li.querySelector(".hist");
    if (h) h.addEventListener("click", function () {
      var slot = li.querySelector(".slot");
      var open = h.getAttribute("aria-expanded") === "true";
      h.setAttribute("aria-expanded", open ? "false" : "true");
      slot.innerHTML = open ? "" : detail(b);
    });
    var im = li.querySelector("img");
    if (im) im.addEventListener("error", function () { im.style.visibility = "hidden"; });
    return li;
  }

  function renderMore() {
    var frag = document.createDocumentFragment();
    var end = Math.min(shown + PAGE, matches.length);
    for (var i = shown; i < end; i++) frag.appendChild(card(matches[i], i + 1));
    els.results.appendChild(frag);
    shown = end;
    els.more.hidden = shown >= matches.length;
  }

  // ---------- genre chips ----------
  function renderChips() {
    function draw(list, box, cls, remove) {
      box.innerHTML = "";
      list.forEach(function (g) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "chip" + cls;
        b.innerHTML = esc(g) + "<span class='del' aria-hidden='true'>×</span>";
        b.setAttribute("aria-label", "Remove " + g);
        b.addEventListener("click", function () { remove(g); });
        box.appendChild(b);
      });
    }
    draw(include, els.incChips, "", function (g) { include = include.filter(function (x) { return x !== g; }); renderChips(); apply(); });
    draw(exclude, els.excChips, " x", function (g) { exclude = exclude.filter(function (x) { return x !== g; }); renderChips(); apply(); });
    els.quick.innerHTML = "";
    QUICK_GENRES.filter(function (g) { return include.indexOf(g) < 0 && DATA && DATA.genres.indexOf(g) >= 0; })
      .forEach(function (g) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "chip"; b.textContent = "+ " + g;
        b.addEventListener("click", function () { addGenre(include, g); });
        els.quick.appendChild(b);
      });
  }

  function matchGenre(v) {
    v = v.trim().toLowerCase();
    if (!v) return null;
    for (var i = 0; i < DATA.genres.length; i++) if (DATA.genres[i].toLowerCase() === v) return DATA.genres[i];
    return null;
  }

  function addGenre(list, g) {
    if (!g) return;
    include = include.filter(function (x) { return x !== g; });
    exclude = exclude.filter(function (x) { return x !== g; });
    (list === include ? include : exclude).push(g);
    renderChips(); apply();
  }

  function wireGenreInput(input, which) {
    function tryAdd() {
      var g = matchGenre(input.value);
      if (g) { addGenre(which === "inc" ? include : exclude, g); input.value = ""; }
    }
    input.addEventListener("change", tryAdd);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); tryAdd(); } });
    input.addEventListener("input", function () { if (matchGenre(input.value)) tryAdd(); });
  }

  // ---------- events ----------
  var t = null;
  function debounced() { clearTimeout(t); t = setTimeout(apply, 180); }

  els.q.addEventListener("input", debounced);
  NUMERIC.forEach(function (k) { els[k].addEventListener("input", debounced); });
  [els.sort, els.lang, els.type, els.prior, els.bundles].forEach(function (el) { el.addEventListener("change", apply); });
  els.more.addEventListener("click", renderMore);
  els.toggle.addEventListener("click", function () {
    var open = els.filters.hidden;
    els.filters.hidden = !open;
    els.toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  els.reset.addEventListener("click", function () {
    include = []; exclude = [];
    NUMERIC.forEach(function (k) { els[k].value = ""; });
    els.lang.value = ""; els.type.value = ""; els.prior.value = DEFAULTS.prior; els.bundles.checked = true;
    renderChips(); apply();
  });
  wireGenreInput(els.incInput, "inc");
  wireGenreInput(els.excInput, "exc");

  // ---------- boot ----------
  readState();
  fetch("books.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      DATA = d;
      BOOKS = parse(d);
      els.mean.textContent = d.meanRating.toFixed(2);
      els.genreList.innerHTML = d.genres.map(function (g) { return "<option value='" + esc(g) + "'>"; }).join("");
      d.languages.slice(0, 40).forEach(function (l) {
        var o = document.createElement("option"); o.value = l; o.textContent = l; els.lang.appendChild(o);
      });
      var p = new URLSearchParams(location.search);
      if (p.get("lang")) els.lang.value = p.get("lang");
      include = include.filter(function (g) { return d.genres.indexOf(g) >= 0; });
      exclude = exclude.filter(function (g) { return d.genres.indexOf(g) >= 0; });
      renderChips();
      apply();
    })
    .catch(function (e) { els.status.textContent = "Couldn't load the book data (" + e.message + "). Try reloading."; });
})();
