// Sirius A and B: a Kepler orbit around the shared centre of mass, plus the
// scroll sequence that moves the diagram aside and brings in the About text.
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var svg = document.getElementById("orbit");
  if (!svg) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- orbit model (values for the real Sirius system) ---------- */

  var ECC = 0.59;          // orbital eccentricity
  var SEMI = 20;           // relative semi-major axis, astronomical units
  var PERIOD_YEARS = 50.1; // one full orbit
  var MASS_A = 2.06, MASS_B = 1.02; // solar masses
  var FRAC_B = MASS_A / (MASS_A + MASS_B); // share of the separation covered by B
  var FRAC_A = MASS_B / (MASS_A + MASS_B); // share covered by A
  var TILT = -0.45;        // rotates the orbit on screen
  var SECONDS_PER_ORBIT = 36;

  function relative(M) {
    var E = M;
    for (var i = 0; i < 14; i++) E -= (E - ECC * Math.sin(E) - M) / (1 - ECC * Math.cos(E));
    var x = SEMI * (Math.cos(E) - ECC);
    var y = SEMI * Math.sqrt(1 - ECC * ECC) * Math.sin(E);
    var c = Math.cos(TILT), s = Math.sin(TILT);
    return [x * c - y * s, x * s + y * c];
  }

  // Fit both orbits inside the viewBox.
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  var i, p;
  for (i = 0; i < 240; i++) {
    var r = relative((i / 240) * Math.PI * 2);
    [[r[0] * FRAC_B, r[1] * FRAC_B], [-r[0] * FRAC_A, -r[1] * FRAC_A]].forEach(function (q) {
      minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]);
      minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
    });
  }
  var VW = 800, VH = 520, PAD = 70;
  var scale = Math.min((VW - 2 * PAD) / (maxX - minX), (VH - 2 * PAD) / (maxY - minY));
  var offX = VW / 2 - ((minX + maxX) / 2) * scale;
  var offY = VH / 2 - ((minY + maxY) / 2) * scale;

  function toScreen(x, y) { return [offX + x * scale, offY + y * scale]; }
  function posB(M) { var r = relative(M); return toScreen(r[0] * FRAC_B, r[1] * FRAC_B); }
  function posA(M) { var r = relative(M); return toScreen(-r[0] * FRAC_A, -r[1] * FRAC_A); }

  function pathFor(fn) {
    var d = "";
    for (var k = 0; k <= 240; k++) {
      var q = fn((k / 240) * Math.PI * 2);
      d += (k ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
    }
    return d + "Z";
  }

  function add(parent, tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    parent.appendChild(n);
    return n;
  }

  var orbits = document.getElementById("orbits");
  add(orbits, "path", { d: pathFor(posB), stroke: "#ffffff", "stroke-opacity": "0.28", "stroke-width": "1.25" });
  add(orbits, "path", { d: pathFor(posA), stroke: "#bcd8ff", "stroke-opacity": "0.4", "stroke-width": "1.25" });

  var centre = document.getElementById("centre");
  var c0 = toScreen(0, 0);
  add(centre, "path", { d: "M" + (c0[0] - 5) + " " + c0[1] + "H" + (c0[0] + 5) + "M" + c0[0] + " " + (c0[1] - 5) + "V" + (c0[1] + 5), stroke: "#ffffff", "stroke-opacity": "0.7", "stroke-width": "1" });
  var cl = add(centre, "text", { x: c0[0] + 8, y: c0[1] + 18, fill: "#ffffff", "fill-opacity": "0.7", "font-size": "12", "font-family": "Schibsted Grotesk, sans-serif" });
  cl.textContent = "Centre of mass";

  var starA = document.getElementById("star-a");
  var starB = document.getElementById("star-b");
  var link = document.getElementById("link");
  var trail = document.getElementById("trail");

  function render(M) {
    var a = posA(M), b = posB(M);
    starA.setAttribute("transform", "translate(" + a[0].toFixed(1) + " " + a[1].toFixed(1) + ")");
    starB.setAttribute("transform", "translate(" + b[0].toFixed(1) + " " + b[1].toFixed(1) + ")");
    link.setAttribute("x1", a[0]); link.setAttribute("y1", a[1]);
    link.setAttribute("x2", b[0]); link.setAttribute("y2", b[1]);
    var d = "";
    for (var k = 0; k <= 36; k++) {
      var q = posB(M - k * 0.014);
      d += (k ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
    }
    trail.setAttribute("d", d);
  }

  var note = document.getElementById("orbit-note");
  if (note) {
    var yearsPerSecond = (PERIOD_YEARS / SECONDS_PER_ORBIT).toFixed(1);
    note.textContent = "Sirius is two stars. The faint one, Sirius B, circles the bright one about every 50 years. Here, one second is about " + yearsPerSecond + " years.";
  }

  var M0 = 2.3;
  var startedAt = performance.now();
  var running = false;

  function frame(now) {
    var M = M0 + ((now - startedAt) / 1000 / SECONDS_PER_ORBIT) * Math.PI * 2;
    render(M);
    if (running) requestAnimationFrame(frame);
  }

  function setMotion() {
    if (reduce.matches) {
      running = false;
      render(M0);
    } else if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }
  setMotion();
  if (reduce.addEventListener) reduce.addEventListener("change", setMotion);

  /* ---------- scroll sequence ---------- */

  var story = document.getElementById("story");
  var hero = document.getElementById("hero-copy");
  var wrap = document.getElementById("orbit-wrap");
  var about = document.getElementById("about-copy");
  var cue = document.getElementById("cue");
  var root = document.documentElement;

  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // Keep the star labels about 12px on screen however small the diagram is drawn.
  var labelA = document.getElementById("label-a");
  var labelB = document.getElementById("label-b");
  function sizeLabels() {
    var w = svg.getBoundingClientRect().width;
    if (!w) return;
    var units = Math.max(15, Math.min(40, (12.5 * VW) / w));
    [labelA, labelB].forEach(function (t) {
      t.setAttribute("font-size", units.toFixed(1));
      t.setAttribute("x", (units * 0.75 + 4).toFixed(1));
      t.setAttribute("y", (-units * 0.6 - 4).toFixed(1));
    });
    cl.setAttribute("font-size", Math.max(12, units * 0.8).toFixed(1));
  }

  var queued = false;
  function update() {
    queued = false;
    sizeLabels();
    if (!root.classList.contains("pin")) return;

    var rect = story.getBoundingClientRect();
    var vh = window.innerHeight, vw = window.innerWidth;
    var total = rect.height - vh;
    var prog = clamp(-rect.top / total, 0, 1);

    var heroOut = clamp((prog - 0.06) / 0.2, 0, 1);
    hero.style.opacity = String(1 - heroOut);
    hero.style.transform = "translateY(" + (-prog * 70).toFixed(1) + "px)";
    note.style.opacity = String(1 - clamp((prog - 0.04) / 0.16, 0, 1));
    cue.style.opacity = String(1 - clamp(prog / 0.08, 0, 1));
    cue.style.pointerEvents = prog > 0.08 ? "none" : "auto";

    var q = ease(clamp((prog - 0.2) / 0.45, 0, 1));
    var narrow = vw <= 832;
    var s = 1 - (narrow ? 0.38 : 0.4) * q;
    var tx = narrow ? 0 : q * vw * 0.21;
    var ty = narrow ? -q * vh * 0.2 : 0;
    wrap.style.transform = "translate(-50%, -50%) translate(" + tx.toFixed(1) + "px, " + ty.toFixed(1) + "px) scale(" + s.toFixed(3) + ")";

    var a = clamp((prog - 0.5) / 0.25, 0, 1);
    about.style.opacity = String(a);
    about.style.pointerEvents = a > 0.6 ? "auto" : "none";
    var lift = (1 - a) * 40;
    about.style.transform = narrow
      ? "translateY(" + lift.toFixed(1) + "px)"
      : "translateY(calc(-50% + " + lift.toFixed(1) + "px))";
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  update();

  // The cue and the About link jump to the point where the About text is fully shown.
  if (cue) {
    cue.addEventListener("click", function (e) {
      var target = document.getElementById("about");
      if (target) { e.preventDefault(); target.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth" }); }
    });
  }
})();
