// Starfield: three layers of stars that drift at different speeds as you scroll.
(function () {
  "use strict";
  var canvas = document.getElementById("space");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var rand = rng(2026);
  var specs = [
    { n: 150, r: [0.4, 0.9], a: [0.25, 0.55], k: 0.05 },
    { n: 70, r: [0.7, 1.3], a: [0.4, 0.8], k: 0.12 },
    { n: 24, r: [1.1, 1.9], a: [0.7, 1], k: 0.24 }
  ];
  var layers = specs.map(function (s) {
    var stars = [];
    for (var i = 0; i < s.n; i++) {
      stars.push({
        x: rand(),
        y: rand(),
        r: s.r[0] + rand() * (s.r[1] - s.r[0]),
        a: s.a[0] + rand() * (s.a[1] - s.a[0]),
        tint: rand() < 0.22 ? "188,216,255" : "255,255,255"
      });
    }
    return { k: s.k, stars: stars };
  });

  var W = 0, H = 0, queued = false;

  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    queued = false;
    var sy = window.pageYOffset || 0;
    ctx.clearRect(0, 0, W, H);
    layers.forEach(function (layer, li) {
      layer.stars.forEach(function (s) {
        var y = (((s.y * H - sy * layer.k) % H) + H) % H;
        var x = s.x * W;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, 6.2832);
        ctx.fillStyle = "rgba(" + s.tint + "," + s.a.toFixed(2) + ")";
        if (li === 2) { ctx.shadowColor = "rgba(" + s.tint + ",0.8)"; ctx.shadowBlur = 6; }
        else ctx.shadowBlur = 0;
        ctx.fill();
      });
    });
    ctx.shadowBlur = 0;
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(draw);
  }

  size();
  draw();
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", function () { size(); queue(); });
})();
