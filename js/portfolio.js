(function () {
  "use strict";

  var cfg = window.SIRIUS_CONFIG || {};
  var LIVE = !!cfg.apiBase;
  var app = document.getElementById("app");
  var modeNote = document.getElementById("mode-note");

  var RANGES = {
    "1D": { n: 78, span: 864e5 },
    "1W": { n: 70, span: 7 * 864e5 },
    "1M": { n: 22, span: 30 * 864e5 },
    "3M": { n: 66, span: 91 * 864e5 },
    "1Y": { n: 252, span: 365 * 864e5 },
    "5Y": { n: 260, span: 1826 * 864e5 }
  };

  var state = {
    account: { currency: "GBP" },
    positions: [],
    selected: null,
    range: "1M",
    series: {},
    news: {},
    token: 0
  };

  /* ---------- helpers ---------- */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === "class") node.className = props[k];
        else if (k === "text") node.textContent = props[k];
        else node.setAttribute(k, props[k]);
      });
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n, cur) {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur || "GBP" }).format(n);
    } catch (e) {
      return (cur || "") + " " + n.toFixed(2);
    }
  }

  function num(n, d) {
    return new Intl.NumberFormat("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  }

  function signed(n, d, suffix) {
    var s = (n >= 0 ? "+" : "−") + num(Math.abs(n), d) + (suffix || "");
    return s;
  }

  function arrow(n) { return n >= 0 ? "▲" : "▼"; }
  function tone(n) { return n >= 0 ? "up" : "down"; }

  function fmtTime(t, range) {
    var d = new Date(t);
    if (range === "1D") return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (range === "1W") return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    if (range === "1M" || range === "3M") return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }

  function fmtFull(t, range) {
    var d = new Date(t);
    var opts = range === "1D" || range === "1W"
      ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", year: "numeric" };
    return d.toLocaleString("en-GB", opts);
  }

  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw)));
    var f = raw / p;
    var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf * p;
  }

  /* ---------- sample data (used until the proxy address is set) ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  var FX = 0.78; // sample USD to GBP rate

  function samplePositions() {
    var raw = [
      { ticker: "AMD_US_EQ", symbol: "AMD", name: "Advanced Micro Devices", quantity: 6, avgPrice: 118.4, price: 162.9, vol: 0.026 },
      { ticker: "NVDA_US_EQ", symbol: "NVDA", name: "NVIDIA", quantity: 4, avgPrice: 96.2, price: 141.5, vol: 0.03 },
      { ticker: "AAPL_US_EQ", symbol: "AAPL", name: "Apple", quantity: 5, avgPrice: 175.3, price: 189.1, vol: 0.016 },
      { ticker: "MSFT_US_EQ", symbol: "MSFT", name: "Microsoft", quantity: 2, avgPrice: 410, price: 395.2, vol: 0.015 },
      { ticker: "TSLA_US_EQ", symbol: "TSLA", name: "Tesla", quantity: 3, avgPrice: 262, price: 231.4, vol: 0.035 }
    ];
    return raw.map(function (p) {
      var cost = p.quantity * p.avgPrice * FX;
      var value = p.quantity * p.price * FX;
      return {
        ticker: p.ticker, symbol: p.symbol, name: p.name, currency: "USD",
        quantity: p.quantity, avgPrice: p.avgPrice, price: p.price,
        cost: cost, value: value, pnl: value - cost, vol: p.vol
      };
    });
  }

  function sampleSeries(pos, range) {
    var r = RANGES[range];
    var rand = mulberry32(hash(pos.symbol + range));
    var vol = pos.vol * Math.sqrt(r.span / 864e5 / r.n) * 1.0;
    var now = Date.now();
    var pts = new Array(r.n);
    var p = pos.price;
    for (var i = r.n - 1; i >= 0; i--) {
      pts[i] = { t: now - (r.n - 1 - i) * (r.span / r.n), c: p };
      var shock = (rand() - 0.5) * 2 * vol * 1.7;
      var drift = range === "5Y" || range === "1Y" ? 0.0006 * (r.span / 864e5 / r.n) : 0.0001;
      p = p / (1 + shock + drift);
    }
    return { symbol: pos.symbol, currency: pos.currency, points: pts, sample: true };
  }

  /* ---------- data access ---------- */

  function getCode() {
    try { return sessionStorage.getItem("sirius_code") || ""; } catch (e) { return ""; }
  }
  function setCode(c) {
    try { if (c) sessionStorage.setItem("sirius_code", c); else sessionStorage.removeItem("sirius_code"); } catch (e) { /* ignore */ }
  }

  function api(path) {
    return fetch(cfg.apiBase.replace(/\/$/, "") + path, {
      headers: { "X-Access-Code": getCode() }
    }).then(function (res) {
      if (res.status === 401) { var err = new Error("auth"); err.auth = true; throw err; }
      if (!res.ok) throw new Error("Request failed (" + res.status + ")");
      return res.json();
    });
  }

  function loadPortfolio() {
    if (!LIVE) {
      return Promise.resolve({ account: { currency: "GBP" }, positions: samplePositions() });
    }
    return api("/api/portfolio");
  }

  function loadHistory(pos, range) {
    var key = pos.symbol + "|" + range;
    if (state.series[key]) return Promise.resolve(state.series[key]);
    var p = LIVE
      ? api("/api/history?symbol=" + encodeURIComponent(pos.symbol) + "&range=" + range)
      : Promise.resolve(sampleSeries(pos, range));
    return p.then(function (d) { state.series[key] = d; return d; });
  }

  function loadNews(pos) {
    if (state.news[pos.symbol]) return Promise.resolve(state.news[pos.symbol]);
    var p = LIVE
      ? api("/api/news?symbol=" + encodeURIComponent(pos.symbol))
      : Promise.resolve({ sample: true, items: [] });
    return p.then(function (d) { state.news[pos.symbol] = d; return d; });
  }

  /* ---------- access gate ---------- */

  function showGate(message) {
    app.textContent = "";
    var input = el("input", { id: "code", type: "password", autocomplete: "current-password", required: "" });
    var form = el("form", { class: "gate" }, [
      el("label", { for: "code", text: "Access code" }),
      input,
      el("button", { class: "button", type: "submit", text: "Open portfolio" }),
      message ? el("p", { class: "err", role: "alert", text: message }) : null
    ]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      setCode(input.value.trim());
      start();
    });
    app.appendChild(form);
    input.focus();
  }

  /* ---------- layout ---------- */

  var ui = {};

  function buildLayout() {
    app.textContent = "";

    ui.summary = el("dl", { class: "summary" });
    ui.list = el("ul", { class: "holding-list" });

    ui.title = el("h2", { text: "" });
    ui.price = el("div", { class: "price-now" });
    ui.change = el("div", { class: "price-change" });
    var priceBox = el("div", null, [ui.price, ui.change]);
    ui.ranges = el("div", { class: "ranges", role: "group", "aria-label": "Chart range" });
    Object.keys(RANGES).forEach(function (k) {
      var b = el("button", { class: "range-btn", type: "button", "data-range": k, text: k });
      b.addEventListener("click", function () { state.range = k; renderDetail(); });
      ui.ranges.appendChild(b);
    });
    ui.chart = el("div", { class: "chart-box" });
    ui.legend = el("p", { class: "legend-note" });
    ui.table = el("details", { class: "table-view" });
    ui.stats = el("dl", { class: "stats" });
    ui.news = el("ul", { class: "news-list" });
    ui.newsSection = el("section", { class: "news", "aria-labelledby": "news-h" }, [
      el("h3", { id: "news-h", text: "News" }), ui.news
    ]);

    var detail = el("section", { class: "detail", "aria-live": "polite" }, [
      el("div", { class: "detail-top" }, [ui.title, priceBox]),
      ui.ranges, ui.chart, ui.legend, ui.table, ui.stats, ui.newsSection
    ]);

    var holdings = el("section", { class: "holdings", "aria-labelledby": "hold-h" }, [
      el("h2", { id: "hold-h", text: "Holdings" }), ui.list
    ]);

    ui.perfChart = el("div", { class: "chart-box" });
    var perf = el("section", { class: "perf", "aria-labelledby": "perf-h" }, [
      el("h2", { id: "perf-h", text: "Performance since you bought" }),
      el("p", { class: "lead", text: "Each bar compares today’s price with the average price you paid." }),
      ui.perfChart
    ]);

    app.appendChild(ui.summary);
    app.appendChild(el("div", { class: "pf-grid" }, [holdings, detail]));
    app.appendChild(perf);
  }

  function stat(label, value, cls) {
    return el("div", null, [
      el("dt", { text: label }),
      el("dd", { class: cls || "", text: value })
    ]);
  }

  function renderSummary() {
    var cur = state.account.currency;
    var value = 0, cost = 0, pnl = 0;
    state.positions.forEach(function (p) { value += p.value; cost += p.cost; pnl += p.pnl; });
    var ret = cost ? (pnl / cost) * 100 : 0;
    ui.summary.textContent = "";
    ui.summary.appendChild(stat("Portfolio value", money(value, cur)));
    ui.summary.appendChild(stat("Amount invested", money(cost, cur)));
    ui.summary.appendChild(stat("Profit or loss", arrow(pnl) + " " + (pnl >= 0 ? "+" : "−") + money(Math.abs(pnl), cur), tone(pnl)));
    ui.summary.appendChild(stat("Return", arrow(ret) + " " + signed(ret, 2, "%"), tone(ret)));
  }

  function renderList() {
    ui.list.textContent = "";
    state.positions.forEach(function (p) {
      var ret = p.cost ? (p.pnl / p.cost) * 100 : 0;
      var btn = el("button", { class: "holding-btn", type: "button", "aria-pressed": String(state.selected === p.symbol) }, [
        el("span", { class: "h-sym", text: p.symbol }),
        el("span", { class: "h-val", text: money(p.value, state.account.currency) }),
        el("span", { class: "h-name", text: p.name }),
        el("span", { class: "h-ret " + tone(ret), text: arrow(ret) + " " + signed(ret, 1, "%") })
      ]);
      btn.addEventListener("click", function () {
        state.selected = p.symbol;
        renderList();
        renderDetail();
      });
      ui.list.appendChild(el("li", null, [btn]));
    });
  }

  function currentPos() {
    for (var i = 0; i < state.positions.length; i++) {
      if (state.positions[i].symbol === state.selected) return state.positions[i];
    }
    return null;
  }

  /* ---------- detail ---------- */

  function renderDetail() {
    var pos = currentPos();
    if (!pos) return;
    var token = ++state.token;
    var range = state.range;

    Array.prototype.forEach.call(ui.ranges.children, function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-range") === range));
    });

    ui.title.textContent = pos.name + " (" + pos.symbol + ")";
    ui.price.textContent = money(pos.price, pos.currency);
    ui.change.textContent = "";
    ui.chart.textContent = "";
    ui.chart.appendChild(el("p", { class: "chart-msg", text: "Loading chart…" }));
    ui.legend.textContent = "";
    ui.table.textContent = "";

    var ret = pos.cost ? (pos.pnl / pos.cost) * 100 : 0;
    ui.stats.textContent = "";
    ui.stats.appendChild(stat("Shares", num(pos.quantity, pos.quantity % 1 ? 4 : 0)));
    ui.stats.appendChild(stat("Average price paid", money(pos.avgPrice, pos.currency)));
    ui.stats.appendChild(stat("Current price", money(pos.price, pos.currency)));
    ui.stats.appendChild(stat("Cost", money(pos.cost, state.account.currency)));
    ui.stats.appendChild(stat("Value", money(pos.value, state.account.currency)));
    ui.stats.appendChild(stat("Profit or loss", arrow(pos.pnl) + " " + (pos.pnl >= 0 ? "+" : "−") + money(Math.abs(pos.pnl), state.account.currency) + " (" + signed(ret, 2, "%") + ")", tone(pos.pnl)));

    loadHistory(pos, range).then(function (series) {
      if (token !== state.token) return;
      drawPriceChart(pos, series, range);
    }).catch(function (err) {
      if (token !== state.token) return;
      if (err.auth) return showGate("That access code was not accepted.");
      ui.chart.textContent = "";
      ui.chart.appendChild(el("p", { class: "chart-msg", text: "The chart could not load. Check the proxy and your market data key, then try again." }));
    });

    renderNews(pos, token);
  }

  function renderNews(pos, token) {
    ui.news.textContent = "";
    ui.news.appendChild(el("li", { class: "placeholder", text: "Loading news…" }));
    loadNews(pos).then(function (data) {
      if (token !== state.token) return;
      ui.news.textContent = "";
      if (data.sample) {
        for (var i = 0; i < 3; i++) {
          ui.news.appendChild(el("li", { class: "placeholder" }, [
            el("div", { text: "Sample headline " + (i + 1) }),
            el("div", { class: "meta", text: "Sample data. Live headlines for " + pos.symbol + " appear once you connect the proxy." })
          ]));
        }
        return;
      }
      if (!data.items || !data.items.length) {
        ui.news.appendChild(el("li", { class: "placeholder", text: "No recent news for " + pos.symbol + "." }));
        return;
      }
      data.items.slice(0, 8).forEach(function (n) {
        var link = el("a", { href: safeUrl(n.url), target: "_blank", rel: "noopener noreferrer", text: n.headline });
        var when = n.datetime ? new Date(n.datetime * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
        ui.news.appendChild(el("li", null, [
          link,
          el("div", { class: "meta", text: [n.source, when].filter(Boolean).join(" · ") })
        ]));
      });
    }).catch(function (err) {
      if (token !== state.token) return;
      if (err.auth) return showGate("That access code was not accepted.");
      ui.news.textContent = "";
      ui.news.appendChild(el("li", { class: "placeholder", text: "News could not load." }));
    });
  }

  function safeUrl(u) {
    try {
      var x = new URL(u);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#";
    } catch (e) { return "#"; }
  }

  /* ---------- price chart ---------- */

  function drawPriceChart(pos, series, range) {
    var pts = series.points || [];
    ui.chart.textContent = "";
    if (pts.length < 2) {
      ui.chart.appendChild(el("p", { class: "chart-msg", text: "No price history for this range." }));
      return;
    }

    var first = pts[0].c, last = pts[pts.length - 1].c;
    var chg = last - first, chgPct = first ? (chg / first) * 100 : 0;
    ui.change.className = "price-change " + tone(chg);
    ui.change.textContent = arrow(chg) + " " + signed(chg, 2) + " (" + signed(chgPct, 2, "%") + ") over " + range;

    var W = Math.max(300, ui.chart.clientWidth || 640);
    var H = W < 520 ? 280 : 360;
    var m = { l: 12, r: 58, t: 18, b: 28 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;

    var lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { if (p.c < lo) lo = p.c; if (p.c > hi) hi = p.c; });
    var dLo = Math.min(lo, pos.avgPrice), dHi = Math.max(hi, pos.avgPrice);
    var pad = (dHi - dLo) * 0.08 || dHi * 0.02;
    dLo -= pad; dHi += pad;
    var step = niceStep((dHi - dLo) / 5);
    var tMin = dLo, tMax = dHi;

    function X(i) { return m.l + (i / (pts.length - 1)) * iw; }
    function Y(v) { return m.t + (1 - (v - tMin) / (tMax - tMin)) * ih; }

    var grid = "", labels = "";
    for (var v = Math.ceil(tMin / step) * step; v <= tMax; v += step) {
      var y = Y(v).toFixed(1);
      grid += '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y + '" y2="' + y + '" stroke="var(--grid)" stroke-width="1"/>';
      labels += '<text x="' + (W - m.r + 8) + '" y="' + (Number(y) + 4) + '" font-size="12" fill="var(--ink-soft)">' + esc(num(v, step < 1 ? 2 : step < 10 ? 1 : 0)) + "</text>";
    }

    var xl = "";
    var ticks = W < 520 ? 3 : 5;
    for (var k = 0; k < ticks; k++) {
      var idx = Math.round((k / (ticks - 1)) * (pts.length - 1));
      var anchor = k === 0 ? "start" : k === ticks - 1 ? "end" : "middle";
      xl += '<text x="' + X(idx).toFixed(1) + '" y="' + (H - 8) + '" font-size="12" text-anchor="' + anchor + '" fill="var(--ink-soft)">' + esc(fmtTime(pts[idx].t, range)) + "</text>";
    }

    var d = "";
    pts.forEach(function (p, i) { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.c).toFixed(1); });
    var area = d + "L" + X(pts.length - 1).toFixed(1) + " " + (m.t + ih) + "L" + X(0).toFixed(1) + " " + (m.t + ih) + "Z";

    var yBuy = Y(pos.avgPrice).toFixed(1);
    var buy =
      '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yBuy + '" y2="' + yBuy + '" stroke="var(--buy)" stroke-width="1.5" stroke-dasharray="6 5"/>' +
      '<text x="' + (m.l + 4) + '" y="' + (Number(yBuy) - 6) + '" font-size="12" font-weight="600" fill="var(--ink)">You paid ' + esc(num(pos.avgPrice, 2)) + "</text>";

    var summary = pos.symbol + " price over " + range + ": from " + num(first, 2) + " to " + num(last, 2) +
      ", low " + num(lo, 2) + ", high " + num(hi, 2) + ". You paid " + num(pos.avgPrice, 2) + " on average.";

    var svg =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(summary) + '">' +
      grid + labels + xl +
      '<path d="' + area + '" fill="var(--line)" fill-opacity="0.06"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--line)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      buy +
      '<circle cx="' + X(pts.length - 1).toFixed(1) + '" cy="' + Y(last).toFixed(1) + '" r="4.5" fill="var(--line)" stroke="var(--card)" stroke-width="2"/>' +
      '<g id="cross" style="display:none"><line id="cx" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="var(--ink-soft)" stroke-width="1"/>' +
      '<circle id="cd" r="5" fill="var(--line)" stroke="var(--card)" stroke-width="2"/></g>' +
      '<rect id="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>' +
      "</svg>";

    ui.chart.innerHTML = svg;
    var tip = el("div", { class: "tip", style: "display:none" });
    ui.chart.appendChild(tip);

    var svgEl = ui.chart.querySelector("svg");
    var cross = svgEl.querySelector("#cross"), cx = svgEl.querySelector("#cx"), cd = svgEl.querySelector("#cd");
    var hit = svgEl.querySelector("#hit");

    function move(ev) {
      var rect = svgEl.getBoundingClientRect();
      var scale = W / rect.width;
      var px = (ev.clientX - rect.left) * scale;
      var i = Math.round(((px - m.l) / iw) * (pts.length - 1));
      i = Math.max(0, Math.min(pts.length - 1, i));
      var p = pts[i];
      var x = X(i), y = Y(p.c);
      cross.style.display = "";
      cx.setAttribute("x1", x); cx.setAttribute("x2", x);
      cd.setAttribute("cx", x); cd.setAttribute("cy", y);
      var vs = pos.avgPrice ? ((p.c - pos.avgPrice) / pos.avgPrice) * 100 : 0;
      tip.innerHTML = esc(fmtFull(p.t, range)) + "<br><strong>" + esc(money(p.c, pos.currency)) + "</strong> · " + esc(arrow(vs) + " " + signed(vs, 1, "%")) + " vs paid";
      tip.style.display = "";
      var tx = Math.max(60, Math.min(rect.width - 60, x / scale));
      tip.style.left = tx + "px";
      tip.style.top = Math.max(40, y / scale - 10) + "px";
    }
    function leave() { cross.style.display = "none"; tip.style.display = "none"; }
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);

    ui.legend.textContent = "";
    ui.legend.appendChild(el("span", { class: "swatch-line", "aria-hidden": "true" }));
    ui.legend.appendChild(document.createTextNode(
      "Dashed line is the average price you paid." + (series.sample ? " Prices shown are sample data." : "")
    ));

    // Table view for screen readers and anyone who prefers numbers.
    var rows = "";
    var count = Math.min(12, pts.length);
    for (var r = 0; r < count; r++) {
      var ri = Math.round((r / (count - 1)) * (pts.length - 1));
      var pr = pts[ri];
      var vsb = pos.avgPrice ? ((pr.c - pos.avgPrice) / pos.avgPrice) * 100 : 0;
      rows += "<tr><td>" + esc(fmtFull(pr.t, range)) + "</td><td>" + esc(num(pr.c, 2)) + "</td><td>" + esc(signed(vsb, 1, "%")) + "</td></tr>";
    }
    ui.table.innerHTML = "<summary>Show prices as a table</summary><div class=\"table-scroll\"><table><thead><tr><th>Date</th><th>Price (" + esc(pos.currency) + ")</th><th>Vs paid</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  /* ---------- performance chart ---------- */

  function drawPerfChart() {
    var rows = state.positions.map(function (p) {
      return { symbol: p.symbol, ret: p.avgPrice ? ((p.price - p.avgPrice) / p.avgPrice) * 100 : 0 };
    }).sort(function (a, b) { return b.ret - a.ret; });

    var W = Math.max(300, ui.perfChart.clientWidth || 640);
    var rowH = 34, mt = 14, mb = 14;
    var H = mt + mb + rows.length * rowH;
    var labelW = 56, sideW = 84;
    var pl = labelW + sideW + 8, pr = W - sideW;
    var lo = Math.min(0, Math.min.apply(null, rows.map(function (r) { return r.ret; })));
    var hi = Math.max(0, Math.max.apply(null, rows.map(function (r) { return r.ret; })));
    if (hi === lo) hi = lo + 1;
    function X(v) { return pl + ((v - lo) / (hi - lo)) * (pr - pl); }
    var x0 = X(0);

    var out = "";
    rows.forEach(function (r, i) {
      var y = mt + i * rowH + (rowH - 16) / 2;
      var x1 = X(r.ret);
      var bx = Math.min(x0, x1), bw = Math.max(2, Math.abs(x1 - x0));
      var cls = r.ret >= 0 ? "var(--gain)" : "var(--loss)";
      var lblX = r.ret >= 0 ? bx + bw + 8 : bx - 8;
      var anchor = r.ret >= 0 ? "start" : "end";
      out += '<text x="' + labelW + '" y="' + (y + 12) + '" font-size="13" font-weight="600" text-anchor="end" fill="var(--ink)">' + esc(r.symbol) + "</text>";
      out += '<rect x="' + bx.toFixed(1) + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="16" rx="2" fill="' + cls + '"/>';
      out += '<text x="' + lblX.toFixed(1) + '" y="' + (y + 12.5) + '" font-size="13" text-anchor="' + anchor + '" fill="var(--ink)" style="font-variant-numeric:tabular-nums">' + esc(arrow(r.ret) + " " + signed(r.ret, 1, "%")) + "</text>";
    });
    out += '<line x1="' + x0.toFixed(1) + '" x2="' + x0.toFixed(1) + '" y1="' + (mt - 6) + '" y2="' + (H - mb + 6) + '" stroke="var(--ink-soft)" stroke-width="1"/>';

    var desc = "Return versus average price paid: " + rows.map(function (r) { return r.symbol + " " + signed(r.ret, 1, "%"); }).join(", ") + ".";
    ui.perfChart.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(desc) + '">' + out + "</svg>";
  }

  /* ---------- start ---------- */

  function render() {
    renderSummary();
    renderList();
    renderDetail();
    drawPerfChart();
  }

  var resizeQueued = false;
  function onResize() {
    if (resizeQueued || !ui.chart) return;
    resizeQueued = true;
    requestAnimationFrame(function () {
      resizeQueued = false;
      var pos = currentPos();
      var key = pos ? pos.symbol + "|" + state.range : "";
      if (pos && state.series[key]) drawPriceChart(pos, state.series[key], state.range);
      if (state.positions.length) drawPerfChart();
    });
  }

  function start() {
    if (LIVE && !getCode()) return showGate("");
    modeNote.textContent = LIVE ? "Live data from Trading 212" : "Sample data. Connect your Trading 212 account to see your own holdings.";
    app.textContent = "";
    app.appendChild(el("p", { class: "chart-msg", text: "Loading portfolio…" }));
    loadPortfolio().then(function (data) {
      state.account = data.account || { currency: "GBP" };
      state.positions = data.positions || [];
      if (!state.positions.length) {
        app.textContent = "";
        app.appendChild(el("p", { class: "chart-msg", text: "No open positions found in this account." }));
        return;
      }
      var best = state.positions.slice().sort(function (a, b) { return b.value - a.value; })[0];
      state.selected = best.symbol;
      buildLayout();
      render();
    }).catch(function (err) {
      if (err.auth) { setCode(""); return showGate("That access code was not accepted."); }
      app.textContent = "";
      app.appendChild(el("p", { class: "chart-msg", text: "The portfolio could not load. Check the proxy address in js/config.js and that the proxy is running." }));
    });
  }

  window.addEventListener("resize", onResize);
  start();
})();
