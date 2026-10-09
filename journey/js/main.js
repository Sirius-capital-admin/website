/* Journey: Lenis smooth scroll, one GSAP ScrollTrigger timeline, one WebGL canvas.
   The scroll position drives a state object S; the render loop turns S into shader uniforms. */
(function () {
  "use strict";

  var root = document.documentElement;
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  if (!root.classList.contains("immersive")) return;

  var params = new URLSearchParams(location.search);
  var fixedQuality = params.has("q") ? Math.max(0.3, Math.min(1, parseFloat(params.get("q")) || 1)) : null;

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  /* ---------- lazy-load the libraries ---------- */

  var loaderArc = $("#loaderArc");
  var loadedCount = 0, loadTotal = 4;
  function bump() {
    loadedCount++;
    loaderArc.style.strokeDashoffset = String(131.95 * (1 - loadedCount / (loadTotal + 1)));
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { bump(); resolve(); };
      s.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  Promise.all([
    loadScript("js/vendor/gsap.min.js"),
    loadScript("js/vendor/three.min.js"),
    loadScript("js/vendor/lenis.min.js")
  ]).then(function () {
    return loadScript("js/vendor/ScrollTrigger.min.js");
  }).then(init).catch(function (err) {
    console.error(err);
    fallBack();
  });

  function fallBack() {
    root.classList.remove("immersive");
    root.classList.add("static");
    var l = $("#loader"); if (l) l.style.display = "none";
  }

  /* ---------- state driven by scroll ---------- */

  var S = {
    intro: 0, pencil: 0, fog: 0,
    t01: 0, t12: 0, t23: 0,
    push0: 0, push1: 0, pushG: 0, push3: 0,
    ship: 0, flash: 0
  };
  var progress = 0;

  function init() {
    var gsap = window.gsap, THREE = window.THREE, Lenis = window.Lenis;
    var G = window.JOURNEY_GLSL;
    // each title letter gets an inner span so it can slide up inside its mask
    $$(".ch").forEach(function (c) { c.innerHTML = "<span>" + c.textContent + "</span>"; });
    gsap.registerPlugin(window.ScrollTrigger);

    /* ----- smooth scroll ----- */
    var lenis = new Lenis({
      duration: 1.25,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true
    });
    lenis.on("scroll", window.ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);

    /* ----- renderer ----- */
    var canvas = $("#gl");
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    } catch (e) { fallBack(); return; }
    renderer.setClearColor(0x000000, 1);

    var quality = fixedQuality || 1;
    var dprBase = Math.min(window.devicePixelRatio || 1, 1.5);
    var U = {
      time: { value: 0 },
      res: { value: new THREE.Vector2(1, 1) },
      mouse: { value: new THREE.Vector2(0, 0) }
    };

    var rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    var rtA = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    var rtB = new THREE.WebGLRenderTarget(2, 2, rtOpts);

    var ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quadGeo = new THREE.PlaneGeometry(2, 2);

    function quadScene(frag, extra) {
      var uniforms = { uTime: U.time, uRes: U.res, uMouse: U.mouse };
      Object.keys(extra || {}).forEach(function (k) { uniforms[k] = extra[k]; });
      var mat = new THREE.ShaderMaterial({ vertexShader: G.quadVert, fragmentShader: frag, uniforms: uniforms, depthTest: false, depthWrite: false });
      var sc = new THREE.Scene();
      var mesh = new THREE.Mesh(quadGeo, mat); mesh.frustumCulled = false;
      sc.add(mesh);
      return { scene: sc, camera: ortho, u: uniforms };
    }

    var mountain = quadScene(G.mountains, { uPush: { value: 0 }, uPencil: { value: 0 }, uFog: { value: 0 }, uIntro: { value: 0 } });
    var storm = quadScene(G.storm, { uPush: { value: 0 }, uFlash: { value: 0 } });
    var forest = quadScene(G.forest, { uPush: { value: 0 } });

    /* ----- globe ----- */
    var globe = (function () {
      var sc = new THREE.Scene();
      var cam = new THREE.PerspectiveCamera(35, 16 / 9, .1, 100);
      var light = { value: new THREE.Vector3(-.8, .35, .55) };
      var mat = new THREE.ShaderMaterial({ vertexShader: G.globeVert, fragmentShader: G.globeFrag, uniforms: { uTime: U.time, uLight: light } });
      var sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), mat);
      var halo = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 96, 64),
        new THREE.ShaderMaterial({ vertexShader: G.globeVert, fragmentShader: G.haloFrag, uniforms: { uLight: light }, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
      );
      var grp = new THREE.Group(); grp.add(sphere); grp.add(halo); grp.rotation.z = .18; grp.rotation.x = .22; sc.add(grp);
      var n = 1800, pos = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u), R = 30 + Math.random() * 10;
        pos[i * 3] = r * Math.cos(a) * R; pos[i * 3 + 1] = u * R; pos[i * 3 + 2] = r * Math.sin(a) * R;
      }
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      var stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: .75, depthWrite: false }));
      sc.add(stars);
      return { scene: sc, camera: cam, sphere: sphere, group: grp, stars: stars };
    })();

    var scenes = [mountain, storm, { scene: globe.scene, camera: globe.camera }, forest];

    /* ----- compositor ----- */
    var comp = (function () {
      var uniforms = { tA: { value: null }, tB: { value: null }, uT: { value: 0 }, uBlack: { value: 0 }, uTime: U.time, uGrain: { value: .075 }, uRes: U.res };
      var mat = new THREE.ShaderMaterial({ vertexShader: G.quadVert, fragmentShader: G.composite, uniforms: uniforms, depthTest: false, depthWrite: false });
      var sc = new THREE.Scene(); var m = new THREE.Mesh(quadGeo, mat); m.frustumCulled = false; sc.add(m);
      return { scene: sc, u: uniforms };
    })();

    function resize() {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setPixelRatio(dprBase * quality);
      renderer.setSize(w, h, false);
      var bw = renderer.domElement.width, bh = renderer.domElement.height;
      rtA.setSize(bw, bh); rtB.setSize(bw, bh);
      U.res.value.set(bw, bh);
      globe.camera.aspect = w / h; globe.camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", function () { resize(); window.ScrollTrigger.refresh(); });

    /* ----- pre-compile every scene while the loader is up ----- */
    scenes.forEach(function (s) {
      renderer.setRenderTarget(rtA);
      renderer.render(s.scene, s.camera);
    });
    renderer.setRenderTarget(null);

    /* ----- mouse parallax ----- */
    var mouseT = { x: 0, y: 0 }, mouseS = { x: 0, y: 0 };
    window.addEventListener("pointermove", function (e) {
      mouseT.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseT.y = -((e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });

    /* ----- DOM handles ----- */
    var txts = $$(".txt");
    var shipEl = $("#ship");
    var ringArc = $("#ringArc");
    var counterNum = $("#counterNum"), counterBar = $("#counterBar"), counterLabel = $("#counterLabel");
    var ticksEl = $("#ticks");

    var SCENES = [
      { label: "Summit", at: .035 },
      { label: "Sketch", at: .30 },
      { label: "Storm", at: .56 },
      { label: "World", at: .76 },
      { label: "Growth", at: .985 }
    ];
    var STARTS = [0, .18, .40, .62, .82];
    var tickBtns = SCENES.map(function (s, i) {
      var b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", "Go to scene " + (i + 1) + ": " + s.label);
      b.addEventListener("click", function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        lenis.scrollTo(max * s.at, { duration: 2.4, easing: function (t) { return t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; } });
      });
      ticksEl.appendChild(b);
      return b;
    });

    /* ----- scroll timeline (units are percent of total scroll) ----- */
    var lines = function (sel) { return $$(sel + " .ln > span"); };
    gsap.set(".ln > span", { yPercent: 115 });
    gsap.set(".ch > span", { yPercent: 115 });
    gsap.set(".dia", { scale: 0, rotation: 45 });
    gsap.set(".txt", { autoAlpha: 0 });
    gsap.set("#s1", { autoAlpha: 1 });

    var tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: "#spacer", start: "top top", end: "bottom bottom", scrub: .9,
        onUpdate: function (self) { progress = self.progress; updateUI(); }
      }
    });
    var dummy = { x: 0 };
    tl.to(dummy, { x: 1, duration: 100 }, 0);

    // camera pushes
    tl.to(S, { push0: 1, duration: 36 }, 0);
    tl.to(S, { push1: 1, duration: 28 }, 40);
    tl.to(S, { pushG: 1, duration: 26 }, 60);
    tl.to(S, { push3: 1, duration: 18 }, 82);

    // scene 1 text out, hero letters spread
    tl.to("#s1 .inner", { y: -50, duration: 11, ease: "power2.in" }, 2);
    tl.to("#s1 .hero-title", { letterSpacing: "0.62em", duration: 11, ease: "power1.in" }, 2);
    tl.to("#s1", { autoAlpha: 0, duration: 7, ease: "power2.in" }, 8);

    // pencil + fog
    tl.to(S, { pencil: 1, duration: 14, ease: "power2.inOut" }, 12);
    tl.to(S, { fog: 1, duration: 10, ease: "power2.inOut" }, 32);
    tl.to(S, { t01: 1, duration: 9, ease: "power2.inOut" }, 40);

    // scene 2 text
    tl.set("#s2", { autoAlpha: 1 }, 20);
    tl.fromTo(lines("#s2 h2"), { yPercent: 115 }, { yPercent: 0, duration: 4, stagger: 1.3, ease: "power3.out" }, 20);
    tl.fromTo($$("#s2 .body > span"), { yPercent: 115 }, { yPercent: 0, duration: 4, ease: "power3.out" }, 23.5);
    tl.to("#s2 .inner", { y: -30, autoAlpha: 0, duration: 5, ease: "power2.in" }, 35);
    tl.set("#s2", { autoAlpha: 0 }, 40.5);

    // scene 3 text, ship
    tl.set("#s3", { autoAlpha: 1 }, 47);
    $$("#s3 .points li").forEach(function (li, i) {
      var at = 48 + i * 4.2;
      tl.fromTo($(".ln > span", li), { yPercent: 115 }, { yPercent: 0, duration: 3.6, ease: "power3.out" }, at + .6);
      tl.to($(".dia", li), { scale: 1, duration: 2.4, ease: "back.out(2)" }, at);
    });
    tl.to("#s3 .inner", { y: -30, autoAlpha: 0, duration: 4, ease: "power2.in" }, 60);
    tl.set("#s3", { autoAlpha: 0 }, 64.5);
    tl.set(shipEl, { autoAlpha: 1 }, 44);
    tl.to(S, { ship: 1, duration: 24 }, 43);
    tl.set(shipEl, { autoAlpha: 0 }, 68);
    tl.to(shipEl, { opacity: 0, duration: 3, ease: "power2.in" }, 65);

    // storm -> globe -> forest
    tl.to(S, { t12: 1, duration: 8, ease: "power2.inOut" }, 62);
    tl.to(S, { t23: 1, duration: 8, ease: "none" }, 82);

    // scene 4 text
    tl.set("#s4", { autoAlpha: 1 }, 69);
    tl.fromTo(lines("#s4 h2"), { yPercent: 115 }, { yPercent: 0, duration: 4, stagger: 1.3, ease: "power3.out" }, 69);
    tl.fromTo($$("#s4 .body > span"), { yPercent: 115 }, { yPercent: 0, duration: 4, ease: "power3.out" }, 72.5);
    tl.to("#s4 .inner", { y: -30, autoAlpha: 0, duration: 4, ease: "power2.in" }, 79);
    tl.set("#s4", { autoAlpha: 0 }, 83);

    // scene 5 text
    tl.set("#s5", { autoAlpha: 1 }, 88);
    tl.fromTo(lines("#s5 h2"), { yPercent: 115 }, { yPercent: 0, duration: 5, stagger: 1.6, ease: "power3.out" }, 88);
    tl.fromTo(lines("#s5 .paras"), { yPercent: 115 }, { yPercent: 0, duration: 4.5, stagger: 1.4, ease: "power3.out" }, 90);

    /* ----- UI state from progress ----- */
    var curIdx = -1;
    function updateUI() {
      var p = progress;
      ringArc.style.strokeDashoffset = String(131.95 * (1 - p));
      counterBar.style.transform = "scaleX(" + p.toFixed(4) + ")";
      var idx = p < STARTS[1] ? 0 : p < STARTS[2] ? 1 : p < STARTS[3] ? 2 : p < STARTS[4] ? 3 : 4;
      if (idx !== curIdx) {
        curIdx = idx;
        tickBtns.forEach(function (b, i) { b.classList.toggle("on", i === idx); });
        counterNum.textContent = "0" + (idx + 1);
        counterLabel.textContent = SCENES[idx].label;
        gsap.fromTo([counterNum, counterLabel], { yPercent: 100 }, { yPercent: 0, duration: .9, ease: "expo.out", overwrite: true });
      }
      var dark = p > .265 && p < .425;
      var tone = dark ? "dark" : "light";
      if (root.getAttribute("data-tone") !== tone) root.setAttribute("data-tone", tone);
    }
    updateUI();

    /* ----- render loop ----- */
    var ema = 16, lastQ = 0, lastLight = 0;
    var flashAt = 6, flashLevel = 0;
    function pick() {
      if (S.t23 > 0.0005) {
        if (S.t23 >= .9995) return [3, 3, 0, 0];
        var blk = 1 - Math.abs(2 * S.t23 - 1);
        blk = Math.min(1, Math.max(0, blk / .7)); blk = blk * blk * (3 - 2 * blk);
        return [2, 3, S.t23 >= .5 ? 1 : 0, blk];
      }
      if (S.t12 > 0.0005) return S.t12 >= .9995 ? [2, 2, 0, 0] : [1, 2, S.t12, 0];
      if (S.t01 > 0.0005) return S.t01 >= .9995 ? [1, 1, 0, 0] : [0, 1, S.t01, 0];
      return [0, 0, 0, 0];
    }

    function drawScene(i, target) {
      var s = scenes[i];
      if (i === 0) {
        mountain.u.uPush.value = S.push0; mountain.u.uPencil.value = S.pencil; mountain.u.uFog.value = S.fog; mountain.u.uIntro.value = S.intro;
      } else if (i === 1) {
        storm.u.uPush.value = S.push1; storm.u.uFlash.value = flashLevel;
      } else if (i === 2) {
        var cam = globe.camera, asp = cam.aspect;
        var k = Math.max(1, 1.25 / asp);
        var e = S.pushG * S.pushG * (3 - 2 * S.pushG);
        cam.position.set(mouseS.x * .08, -mouseS.y * .05 + .1, (5.4 - 1.6 * e) * k);
        cam.lookAt(0, .5 + mouseS.y * .02, 0);
        globe.group.rotation.y = U.time.value * .045 + S.pushG * 1.6;
        globe.stars.rotation.y = U.time.value * .004;
      } else {
        forest.u.uPush.value = S.push3;
      }
      renderer.setRenderTarget(target);
      renderer.render(s.scene, s.camera);
    }

    gsap.ticker.add(function (time, deltaMs) {
      U.time.value = time;
      mouseS.x += (mouseT.x - mouseS.x) * .05; mouseS.y += (mouseT.y - mouseS.y) * .05;
      U.mouse.value.set(mouseS.x, mouseS.y);

      // lightning in the storm scene
      if (S.t01 > .5 && S.t12 < .6) {
        if (time > flashAt) { flashLevel = .9; flashAt = time + 5 + Math.random() * 7; }
      }
      flashLevel *= .9;

      var sel = pick();
      drawScene(sel[0], rtA);
      if (sel[1] !== sel[0]) drawScene(sel[1], rtB);
      comp.u.tA.value = rtA.texture;
      comp.u.tB.value = sel[1] !== sel[0] ? rtB.texture : rtA.texture;
      comp.u.uT.value = sel[1] !== sel[0] ? sel[2] : 0;
      comp.u.uBlack.value = sel[3];
      renderer.setRenderTarget(null);
      renderer.render(comp.scene, ortho);

      // DOM that rides on the same state
      var vw = window.innerWidth;
      var sx = -.34 * vw + S.ship * 1.5 * vw;
      var shipScale = 1 + S.push1 * .12;
      var bob = Math.sin(time * .9) * 3;
      shipEl.style.transform = "translate3d(" + sx.toFixed(1) + "px," + (bob + mouseS.y * -4).toFixed(1) + "px,0) rotate(" + (Math.sin(time * .7) * .6).toFixed(2) + "deg) scale(" + shipScale.toFixed(3) + ")";
      for (var i = 0; i < txts.length; i++) {
        txts[i].style.translate = (mouseS.x * -10).toFixed(1) + "px " + (mouseS.y * 6).toFixed(1) + "px";
      }

      // adapt resolution to keep the frame rate smooth
      if (!fixedQuality) {
        ema += (deltaMs - ema) * .05;
        if (time - lastQ > 1.2) {
          lastQ = time;
          if (ema > 24 && quality > .55) { quality = Math.max(.55, quality - .1); resize(); }
          else if (ema < 14.5 && quality < 1 && time - lastLight > 4) { quality = Math.min(1, quality + .05); lastLight = time; resize(); }
        }
      }
    });

    /* ----- reveal ----- */
    var loader = $("#loader");
    loaderArc.style.strokeDashoffset = "0";
    window.ScrollTrigger.refresh();
    var intro = gsap.timeline({ delay: .2 });
    intro.to(loader, { opacity: 0, duration: .9, ease: "power2.out", onComplete: function () { loader.style.display = "none"; } }, 0);
    intro.to(S, { intro: 1, duration: 3.2, ease: "expo.out" }, 0);
    intro.to(".ch > span", { yPercent: 0, duration: 1.8, stagger: .06, ease: "expo.out" }, .5);
    intro.to("#s1 .tag > span", { yPercent: 0, duration: 1.4, ease: "power3.out" }, 1.4);
    intro.from(".top, .ticks, .counter, .ring", { opacity: 0, duration: 1.2, ease: "power2.out" }, 1.4);

    // anchor link on the ring
    $("#ring").addEventListener("click", function (e) {
      e.preventDefault();
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var next = STARTS[Math.min(4, curIdx + 1)];
      var target = curIdx >= 4 ? 0 : (SCENES[Math.min(4, curIdx + 1)].at) * max;
      lenis.scrollTo(target, { duration: 2.4, easing: function (t) { return t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; } });
    });

    // test hook
    window.__journey = {
      S: S, lenis: lenis,
      go: function (pct, immediate) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        lenis.scrollTo(max * pct, { immediate: !!immediate });
      },
      get progress() { return progress; },
      get quality() { return quality; }
    };
  }
})();
