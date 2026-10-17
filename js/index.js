(function () {
  "use strict";

  var PARALLAX_LAYERS = 3;
  var SHOOT_INTERVAL = 4000;
  var CONNECT_DIST = 100;
  var MOUSE_REPEL = 90;

  var canvas = document.getElementById("bg-canvas");
  var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  var prefersReducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var starCount = prefersReducedMotion ? 70 : 220;
  var connectDistSq = CONNECT_DIST * CONNECT_DIST;
  var shootTimer = null;
  var animationFrameId = 0;
  var isAnimating = false;
  var W;
  var H;
  var stars = [];
  var shoots = [];
  var mouse = { x: -9999, y: -9999 };

  // Hero constellation — stars travel between pool and background, never disappear
  var HERO_ZONE_X0 = 0;
  var HERO_ZONE_W  = 0;
  var heroScrollY  = 0;
  var heroIdx      = 0;
  var heroPhase    = 'morphing'; // 'morphing' | 'forming' | 'holding'
  var heroPhaseT   = 0;
  var HERO_MORPH   = 2400;  // ms for stars to travel to new positions
  var HERO_FORM    = 3200;  // ms to draw all connections
  var HERO_HOLD    = 20000; // ms to hold constellation
  var heroPool     = [];    // hero stars (NOT in stars[])
  var heroEdges    = [];    // { a, b } — indices into non-leaving heroPool entries

  // Real constellation shapes — positions based on actual sky patterns
  var HERO_CONSTS = [
    {
      name: 'Orion',
      nodes: [
        { rx: 0.36, ry: 0.20 }, // 0 Betelgeuse α
        { rx: 0.64, ry: 0.22 }, // 1 Bellatrix γ
        { rx: 0.30, ry: 0.68 }, // 2 Rigel β
        { rx: 0.70, ry: 0.70 }, // 3 Saiph κ
        { rx: 0.40, ry: 0.44 }, // 4 Alnitak ζ
        { rx: 0.50, ry: 0.42 }, // 5 Alnilam ε
        { rx: 0.60, ry: 0.44 }  // 6 Mintaka δ
      ],
      edges: [[0,1],[0,4],[1,6],[4,5],[5,6],[0,2],[1,3]]
    },
    {
      name: 'Cassiopeia',
      nodes: [
        { rx: 0.08, ry: 0.30 }, // 0 β Cas Caph
        { rx: 0.30, ry: 0.42 }, // 1 α Cas Schedar
        { rx: 0.50, ry: 0.30 }, // 2 γ Cas center
        { rx: 0.70, ry: 0.42 }, // 3 δ Cas Ruchbah
        { rx: 0.92, ry: 0.30 }  // 4 ε Cas Segin
      ],
      edges: [[0,1],[1,2],[2,3],[3,4]]
    },
    {
      name: 'Crux',
      nodes: [
        { rx: 0.50, ry: 0.22 }, // 0 γ Cru Gacrux top
        { rx: 0.78, ry: 0.44 }, // 1 β Cru Mimosa right
        { rx: 0.50, ry: 0.66 }, // 2 α Cru Acrux bottom
        { rx: 0.22, ry: 0.44 }, // 3 δ Cru left
        { rx: 0.63, ry: 0.32 }  // 4 ε Cru upper-right
      ],
      edges: [[0,2],[1,3],[0,4]]
    },
    {
      name: 'Lyra',
      nodes: [
        { rx: 0.50, ry: 0.12 }, // 0 α Lyr Vega
        { rx: 0.32, ry: 0.30 }, // 1 ζ¹ Lyr
        { rx: 0.36, ry: 0.44 }, // 2 ζ² Lyr
        { rx: 0.68, ry: 0.28 }, // 3 β Lyr
        { rx: 0.64, ry: 0.42 }, // 4 γ Lyr
        { rx: 0.50, ry: 0.50 }  // 5 δ¹ Lyr
      ],
      edges: [[0,1],[0,3],[1,2],[3,4],[2,5],[4,5]]
    },
    {
      name: 'Scorpius',
      nodes: [
        { rx: 0.46, ry: 0.12 }, // 0 σ Sco
        { rx: 0.60, ry: 0.12 }, // 1 τ Sco
        { rx: 0.50, ry: 0.22 }, // 2 α Sco Antares
        { rx: 0.64, ry: 0.26 }, // 3 δ Sco Dschubba
        { rx: 0.52, ry: 0.36 }, // 4 π Sco
        { rx: 0.52, ry: 0.50 }, // 5 μ¹ Sco
        { rx: 0.58, ry: 0.63 }, // 6 ζ¹ Sco
        { rx: 0.68, ry: 0.74 }, // 7 η Sco
        { rx: 0.74, ry: 0.84 }, // 8 θ Sco
        { rx: 0.76, ry: 0.90 }  // 9 ι Sco stinger
      ],
      edges: [[0,2],[1,3],[2,3],[2,4],[4,5],[5,6],[6,7],[7,8],[8,9]]
    },
    {
      name: 'Leo',
      nodes: [
        { rx: 0.20, ry: 0.56 }, // 0 α Leo Regulus
        { rx: 0.25, ry: 0.40 }, // 1 η Leo
        { rx: 0.38, ry: 0.30 }, // 2 γ Leo Algieba
        { rx: 0.50, ry: 0.24 }, // 3 ζ Leo
        { rx: 0.58, ry: 0.20 }, // 4 μ Leo sickle top
        { rx: 0.60, ry: 0.34 }, // 5 ε Leo
        { rx: 0.55, ry: 0.48 }, // 6 δ Leo Zosma
        { rx: 0.78, ry: 0.44 }, // 7 β Leo Denebola
        { rx: 0.68, ry: 0.60 }  // 8 θ Leo
      ],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,2],[5,6],[6,0],[6,8],[8,7]]
    },
    {
      name: 'Ursa Major',
      nodes: [
        { rx: 0.92, ry: 0.20 }, // 0 η UMa Alkaid handle tip
        { rx: 0.76, ry: 0.30 }, // 1 ζ UMa Mizar
        { rx: 0.62, ry: 0.36 }, // 2 ε UMa Alioth
        { rx: 0.50, ry: 0.40 }, // 3 δ UMa Megrez junction
        { rx: 0.56, ry: 0.58 }, // 4 γ UMa Phecda
        { rx: 0.40, ry: 0.66 }, // 5 β UMa Merak
        { rx: 0.36, ry: 0.50 }  // 6 α UMa Dubhe
      ],
      edges: [[0,1],[1,2],[2,3],[3,6],[6,5],[5,4],[4,3]]
    },
    {
      name: 'Perseus',
      nodes: [
        { rx: 0.50, ry: 0.26 }, // 0 α Per Mirfak center
        { rx: 0.30, ry: 0.18 }, // 1 γ Per
        { rx: 0.66, ry: 0.20 }, // 2 δ Per
        { rx: 0.74, ry: 0.36 }, // 3 ε Per
        { rx: 0.76, ry: 0.52 }, // 4 ζ Per Atik
        { rx: 0.60, ry: 0.62 }, // 5 ξ Per Menkib
        { rx: 0.36, ry: 0.56 }, // 6 η Per
        { rx: 0.20, ry: 0.42 }  // 7 τ Per
      ],
      edges: [[1,0],[0,2],[2,3],[3,4],[4,5],[5,6],[6,0],[0,7]]
    }
  ];

  var hueMap = {
    white: [220, 215, 255],
    gold: [200, 169, 110],
    violet: [140, 120, 210],
    sky: [120, 190, 240]
  };

  function shouldAnimateBackground() {
    return !!(canvas && ctx && !document.hidden);
  }

  function resolveStarCount() {
    var width = window.innerWidth || 0;
    if (prefersReducedMotion) return 70;
    if (width <= 640) return 90;
    if (width <= 1024) return 140;
    return 220;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function initStars() {
    stars = [];
    starCount = resolveStarCount();
    for (var i = 0; i < starCount; i += 1) {
      var layer = Math.floor(Math.random() * PARALLAX_LAYERS);
      stars.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-0.04, 0.04) * (layer + 1),
        vy: rand(-0.02, 0.03) * (layer + 1),
        r: rand(0.3, 1.2) * (layer * 0.4 + 0.6),
        alpha: rand(0.3, 1),
        twinkleSpeed: rand(0.005, 0.025),
        twinkleDir: Math.random() > 0.5 ? 1 : -1,
        layer: layer,
        hue: Math.random() < 0.15 ? (Math.random() < 0.5 ? "gold" : (Math.random() < 0.5 ? "violet" : "sky")) : "white"
      });
    }
  }

  function spawnShoot() {
    shoots.push({
      x: rand(W * 0.2, W),
      y: rand(0, H * 0.4),
      len: rand(100, 200),
      angle: rand(20, 50) * Math.PI / 180,
      speed: rand(8, 16),
      alpha: 1
    });
  }

  function heroEase(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function recruitBgStar(targetX, targetY) {
    var best = -1, bestD = Infinity;
    for (var i = 0; i < stars.length; i++) {
      var dx = stars[i].x - targetX, dy = stars[i].y - targetY;
      var d  = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    var src = best >= 0 ? stars.splice(best, 1)[0]
            : { x: targetX + rand(-80, 80), y: targetY + rand(-60, 60),
                r: rand(0.5, 1.0), alpha: rand(0.5, 0.9),
                twinkleSpeed: rand(0.006, 0.018), twinkleDir: 1, hue: 'white', layer: 1 };
    return {
      x: src.x, y: src.y,
      r: Math.max(src.r, 0.5),
      alpha: src.alpha,
      twinkleSpeed: src.twinkleSpeed || 0.010,
      twinkleDir: src.twinkleDir || 1,
      hue: 'gold', layer: src.layer || 1,
      baseX: targetX, baseY: targetY,
      startX: src.x, startY: src.y,
      leaving: false, leaveAlpha: 1,
      leaveVx: 0, leaveVy: 0,
      t_freq:  0.18 + Math.random() * 0.18,
      t_amp:   0.8  + Math.random() * 1.8,
      t_phase: Math.random() * Math.PI * 2
    };
  }

  function releaseHeroStar(star) {
    star.leaving    = true;
    star.leaveAlpha = 1;
    star.leaveVx    = rand(-0.06, 0.06);
    star.leaveVy    = rand(-0.05, 0.05);
  }

  function buildConstellation(constl) {
    var positions = constl.nodes.map(function (n) {
      return { x: HERO_ZONE_X0 + n.rx * HERO_ZONE_W, y: n.ry * H };
    });

    var available = heroPool.filter(function (s) { return !s.leaving; });
    var usedAvail = {}, assignments = [], i, j;

    for (i = 0; i < positions.length; i++) {
      var best = -1, bestD = Infinity;
      for (j = 0; j < available.length; j++) {
        if (usedAvail[j]) continue;
        var dx = available[j].x - positions[i].x;
        var dy = available[j].y - positions[i].y;
        var d  = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = j; }
      }
      assignments[i] = best;
      if (best >= 0) usedAvail[best] = true;
    }

    for (j = 0; j < available.length; j++) {
      if (!usedAvail[j]) releaseHeroStar(available[j]);
    }

    var newPool = heroPool.filter(function (s) { return s.leaving; });

    for (i = 0; i < positions.length; i++) {
      var pos  = positions[i];
      var star;
      if (assignments[i] >= 0) {
        star         = available[assignments[i]];
        star.startX  = star.x;
        star.startY  = star.y;
        star.baseX   = pos.x;
        star.baseY   = pos.y;
        star.t_phase = Math.random() * Math.PI * 2;
        star.t_freq  = 0.18 + Math.random() * 0.18;
        star.t_amp   = 0.8  + Math.random() * 1.8;
      } else {
        star = recruitBgStar(pos.x, pos.y);
      }
      newPool.push(star);
    }

    heroPool  = newPool;
    heroEdges = constl.edges.map(function (e) { return { a: e[0], b: e[1] }; });
  }

  function initHeroConstellation() {
    // Return current pool to background before rebuilding
    for (var k = 0; k < heroPool.length; k++) {
      var s = heroPool[k];
      s.vx = rand(-0.04, 0.04);
      s.vy = rand(-0.02, 0.03);
      s.hue = 'white';
      stars.push(s);
    }
    heroPool  = [];
    heroEdges = [];
    if (prefersReducedMotion || W < 900) return;
    var contentW  = Math.min(1785, W - 40);
    var leftPad   = (W - contentW) / 2;
    HERO_ZONE_X0  = leftPad + contentW * 0.60;
    HERO_ZONE_W   = contentW * 0.40;
    heroIdx   = 0;
    heroPhase = 'morphing';
    heroPhaseT = performance.now();
    buildConstellation(HERO_CONSTS[heroIdx]);
  }

  function drawSparkle(x, y, r, alpha) {
    var outerR = r, innerR = r * 0.13;
    var gr = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    gr.addColorStop(0, 'rgba(201,169,110,' + (0.40 * alpha).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(201,169,110,0)');
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.beginPath();
    for (var p = 0; p < 4; p++) {
      var ao = (p / 4) * Math.PI * 2 - Math.PI / 2;
      var ai = ao + Math.PI / 4;
      var ox = x + Math.cos(ao) * outerR, oy = y + Math.sin(ao) * outerR;
      var ix = x + Math.cos(ai) * innerR, iy = y + Math.sin(ai) * innerR;
      if (p === 0) { ctx.moveTo(ox, oy); } else { ctx.lineTo(ox, oy); }
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(225,205,155,' + alpha.toFixed(3) + ')';
    ctx.fill();
  }

  function drawHeroConstellation() {
    if (prefersReducedMotion || W < 900 || !heroPool.length) return;

    var scrollFade = Math.max(0, Math.min(1, 1 - heroScrollY / (H * 0.65)));
    if (scrollFade <= 0) return;

    var now     = performance.now();
    var t       = now * 0.001;
    var elapsed = now - heroPhaseT;
    var i, k;

    // Phase transitions
    if (heroPhase === 'morphing' && elapsed >= HERO_MORPH) {
      heroPhase  = 'forming';
      heroPhaseT = now;
      elapsed    = 0;
    }
    if (heroPhase === 'forming' && elapsed >= HERO_FORM) {
      heroPhase  = 'holding';
      heroPhaseT = now;
      elapsed    = 0;
    }
    if (heroPhase === 'holding' && elapsed >= HERO_HOLD) {
      heroPhase  = 'morphing';
      heroPhaseT = now;
      elapsed    = 0;
      heroIdx    = (heroIdx + 1) % HERO_CONSTS.length;
      buildConstellation(HERO_CONSTS[heroIdx]);
    }

    // Compute positions for non-leaving hero stars
    var active = [];
    for (k = 0; k < heroPool.length; k++) {
      if (!heroPool[k].leaving) active.push(heroPool[k]);
    }

    var activePos = active.map(function (star) {
      var x, y;
      if (heroPhase === 'morphing') {
        var ease = heroEase(Math.min(1, elapsed / HERO_MORPH));
        x = star.startX + (star.baseX - star.startX) * ease;
        y = star.startY + (star.baseY - star.startY) * ease;
      } else {
        x = star.baseX + Math.sin(t * star.t_freq + star.t_phase) * star.t_amp;
        y = star.baseY + Math.cos(t * star.t_freq * 0.7 + star.t_phase + 1.3) * star.t_amp * 0.6;
      }
      star.x = x;
      star.y = y;
      return { x: x, y: y };
    });

    // Update leaving stars (drift and fade back into background)
    for (k = heroPool.length - 1; k >= 0; k--) {
      var ls = heroPool[k];
      if (!ls.leaving) continue;
      ls.x += ls.leaveVx;
      ls.y += ls.leaveVy;
      ls.leaveAlpha -= 0.0035;
      if (ls.leaveAlpha <= 0) {
        ls.hue   = Math.random() < 0.15 ? (Math.random() < 0.5 ? 'gold' : 'violet') : 'white';
        ls.vx    = rand(-0.04, 0.04);
        ls.vy    = rand(-0.02, 0.03);
        ls.alpha = rand(0.3, 0.8);
        stars.push(ls);
        heroPool.splice(k, 1);
      }
    }

    // Draw connections (staggered draw during 'forming', full during 'holding')
    var n       = heroEdges.length;
    var stagger = n > 1 ? (HERO_FORM * 0.50) / (n - 1) : 0;
    var connDur = HERO_FORM * 0.50;

    ctx.save();
    for (i = 0; i < heroEdges.length; i++) {
      var edge = heroEdges[i];
      var pa = activePos[edge.a];
      var pb = activePos[edge.b];
      if (!pa || !pb) continue;

      var prog = 0;
      if (heroPhase === 'holding') {
        prog = 1;
      } else if (heroPhase === 'forming') {
        var ce = elapsed - i * stagger;
        prog = Math.max(0, Math.min(1, ce / connDur));
      }
      if (prog <= 0.002) continue;

      var ex = pa.x + (pb.x - pa.x) * prog;
      var ey = pa.y + (pb.y - pa.y) * prog;
      ctx.strokeStyle = 'rgba(201,169,110,' + (0.28 * prog * scrollFade).toFixed(3) + ')';
      ctx.lineWidth   = 0.5;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.restore();

    // Draw active hero sparkles
    for (i = 0; i < active.length; i++) {
      var star = active[i];
      star.alpha += star.twinkleSpeed * star.twinkleDir;
      if (star.alpha >= 1)   { star.alpha = 1;   star.twinkleDir = -1; }
      if (star.alpha <= 0.2) { star.alpha = 0.2; star.twinkleDir =  1; }
      drawSparkle(activePos[i].x, activePos[i].y, 3.5, scrollFade * star.alpha * 0.92);
    }

    // Draw leaving stars (fading back into background)
    for (k = 0; k < heroPool.length; k++) {
      var ls = heroPool[k];
      if (!ls.leaving) continue;
      drawSparkle(ls.x, ls.y, 2.8, ls.leaveAlpha * scrollFade * 0.65);
    }
  }

  function drawNebula(cx, cy, r, color) {
    var gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawConstellations() {
    if (prefersReducedMotion || W < 900) return;
    ctx.save();
    for (var i = 0; i < stars.length; i += 1) {
      for (var j = i + 1; j < stars.length; j += 1) {
        var dx = stars[i].x - stars[j].x;
        var dy = stars[i].y - stars[j].y;
        var distSq = dx * dx + dy * dy;
        if (distSq < connectDistSq && stars[i].layer === stars[j].layer) {
          var d = Math.sqrt(distSq);
          var op = (1 - d / CONNECT_DIST) * 0.07;
          ctx.strokeStyle = "rgba(200,180,255," + op + ")";
          ctx.lineWidth = 0.4;
          ctx.beginPath();
          ctx.moveTo(stars[i].x, stars[i].y);
          ctx.lineTo(stars[j].x, stars[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function frame() {
    if (!shouldAnimateBackground()) {
      isAnimating = false;
      animationFrameId = 0;
      return;
    }

    ctx.clearRect(0, 0, W, H);

    var bg = ctx.createRadialGradient(W * 0.35, H * 0.3, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.9);
    bg.addColorStop(0, "#08082a");
    bg.addColorStop(0.4, "#05050f");
    bg.addColorStop(1, "#020208");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    drawNebula(W * 0.15, H * 0.2, 320, "rgba(80,50,180,0.035)");
    drawNebula(W * 0.75, H * 0.6, 280, "rgba(180,120,50,0.028)");
    drawNebula(W * 0.5, H * 0.85, 200, "rgba(40,120,150,0.025)");

    drawConstellations();

    for (var i = 0; i < stars.length; i += 1) {
      var s = stars[i];
      s.alpha += s.twinkleSpeed * s.twinkleDir;
      if (s.alpha >= 1) { s.alpha = 1; s.twinkleDir = -1; }
      if (s.alpha <= 0.15) { s.alpha = 0.15; s.twinkleDir = 1; }

      var mx = mouse.x - s.x;
      var my = mouse.y - s.y;
      var md = Math.sqrt(mx * mx + my * my);
      if (md < MOUSE_REPEL && md > 0) {
        var force = (1 - md / MOUSE_REPEL) * 0.6;
        s.x -= (mx / md) * force;
        s.y -= (my / md) * force;
      }

      s.x += s.vx;
      s.y += s.vy;
      if (s.x < -5) s.x = W + 5;
      if (s.x > W + 5) s.x = -5;
      if (s.y < -5) s.y = H + 5;
      if (s.y > H + 5) s.y = -5;

      var rgb = hueMap[s.hue];
      var glow = s.r * 3;
      var glowGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glow);
      glowGrad.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + s.alpha + ")");
      glowGrad.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
      ctx.beginPath();
      ctx.arc(s.x, s.y, glow, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + Math.min(s.alpha * 1.4, 1) + ")";
      ctx.fill();
    }

    drawHeroConstellation();

    for (var k = shoots.length - 1; k >= 0; k -= 1) {
      var sh = shoots[k];
      sh.x -= Math.cos(sh.angle) * sh.speed;
      sh.y += Math.sin(sh.angle) * sh.speed;
      sh.alpha -= 0.012;

      if (sh.alpha <= 0 || sh.x < -50 || sh.y > H + 50) {
        shoots.splice(k, 1);
        continue;
      }

      var tx = sh.x + Math.cos(sh.angle) * sh.len;
      var ty = sh.y - Math.sin(sh.angle) * sh.len;
      var grad = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
      grad.addColorStop(0, "rgba(255,255,255," + sh.alpha + ")");
      grad.addColorStop(0.3, "rgba(200,180,255," + (sh.alpha * 0.6) + ")");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255," + sh.alpha + ")";
      ctx.fill();
    }

    animationFrameId = requestAnimationFrame(frame);
  }

  function resize() {
    if (!canvas || !ctx) return;
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    initStars();
    initHeroConstellation();
  }

  function ensureAnimationLoop() {
    if (!shouldAnimateBackground() || isAnimating) return;
    isAnimating = true;
    frame();
  }

  function stopAnimationLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    isAnimating = false;
  }

  function countArray(value) {
    return Array.isArray(value) ? value.length : 0;
  }

  function countObjectKeys(value) {
    return value && typeof value === "object" ? Object.keys(value).length : 0;
  }

  function getState() {
    return window.SoterStorage && window.SoterStorage.getState ? window.SoterStorage.getState() : null;
  }

  function getData() {
    var state = getState();
    return state && state.data ? state.data : {};
  }

  function getTasks(data) {
    return data.tasks || data.tarefas || [];
  }

  function getDreams(data) {
    if (data.sonhosHub && Array.isArray(data.sonhosHub.sonhos)) return data.sonhosHub.sonhos;
    return data.sonhos || [];
  }

  function getWishlist(data) {
    if (data.wishlistTracker && Array.isArray(data.wishlistTracker.items)) return data.wishlistTracker.items;
    return data.wishlist || [];
  }

  function getFinances(data) {
    if (data.financasTracker && Array.isArray(data.financasTracker.txs)) return data.financasTracker.txs;
    return data.financas || [];
  }

  function getReviewCount(data) {
    var planner = data.revisaoPlanner;
    if (!planner || typeof planner !== "object") return 0;
    return countArray(planner.cards) || countArray(planner.reviews) || countArray(planner.items) || countArray(planner.sessions);
  }

  function getGymCount(data) {
    var gym = data.academiaTracker;
    if (!gym || typeof gym !== "object") return 0;
    return countArray(gym.exercicios) || countArray(gym.exercises) || countArray(gym.workouts);
  }

  function getStudyHours(data) {
    var tracker = data.estudoTracker;
    var estudos = tracker && Array.isArray(tracker.sessions) ? tracker.sessions : (data.estudos || data.studySessions || data.study || []);
    return (Array.isArray(estudos) ? estudos : []).reduce(function (acc, item) {
      return acc + Number(item && item.horas || item && item.hours || 0);
    }, 0);
  }

  function formatCount(value, nounSingular, nounPlural) {
    var amount = Number(value || 0);
    return amount + " " + (amount === 1 ? nounSingular : nounPlural);
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (!node) return;
    node.textContent = value;
  }

  function setStat(name, value) {
    document.querySelectorAll("[data-stat=\"" + name + "\"]").forEach(function (node) {
      node.textContent = value;
    });
  }

  var _xpLiquid = null;

  function setBar(id, percent) {
    var node = document.getElementById(id);
    if (!node) return;
    if (node.tagName === 'CANVAS') {
      if (id === 'hs-xp-bar-2' && window.createLiquidBar) {
        if (!_xpLiquid) _xpLiquid = window.createLiquidBar(node);
        _xpLiquid.set(percent);
      }
      return;
    }
    node.style.width = Math.max(0, Math.min(100, percent)) + "%";
  }

  function getRpgXp(state) {
    if (window.SoterRPG && typeof window.SoterRPG.calcXP === "function") {
      return Number(window.SoterRPG.calcXP(state) || 0);
    }
    return 0;
  }

  function getRpgLevel(xp) {
    if (window.SoterRPG && typeof window.SoterRPG.getLevel === "function") {
      return Number(window.SoterRPG.getLevel(xp) || 1);
    }
    return 1;
  }

  function getRpgTitle(level) {
    var titles = ["Iniciante", "Aprendiz", "Explorador", "Aventureiro", "Viajante", "Veterano", "Especialista", "Mestre", "Gr\u00e3o-Mestre", "Lend\u00e1rio"];
    return titles[Math.max(0, Math.min(titles.length - 1, level - 1))] || "Iniciante";
  }

  function getXpForLevel(level) {
    if (window.SoterRPG && typeof window.SoterRPG.xpForLevel === "function") {
      return Number(window.SoterRPG.xpForLevel(level) || 0);
    }
    return level * 100 + (level - 1) * 50;
  }

  function hydrateMoodNote(state) {
    var data = state && state.data ? state.data : {};
    var mood = String(data.homeMood || "");
    var note = String(data.homeQuickNote || "");
    var noteInput = document.getElementById("quickNote");
    setText("moodDisplay", mood || "â€”");
    if (noteInput && noteInput.value !== note) noteInput.value = note;
    document.querySelectorAll(".humor-btn").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.textContent === mood);
    });
  }

  function syncHomeDate() {
    var now = new Date();
    var text = now.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    setText("homeDate", text);
  }

  function setMood(btn, mood) {
    var state = getState();
    if (!state) return;
    if (!state.data || typeof state.data !== "object") state.data = {};
    state.data.homeMood = mood;
    if (window.SoterStorage && typeof window.SoterStorage.save === "function") {
      window.SoterStorage.save(state);
    }
    hydrateMoodNote(state);
  }

  function saveNote() {
    var state = getState();
    var input = document.getElementById("quickNote");
    if (!state || !input) return;
    if (!state.data || typeof state.data !== "object") state.data = {};
    state.data.homeQuickNote = String(input.value || "");
    if (window.SoterStorage && typeof window.SoterStorage.save === "function") {
      window.SoterStorage.save(state);
    }
  }

  function hydrateSummary() {
    var state = getState() || {};
    var data = getData();
    var books = countArray(data.trackerLivraria || data.trackerLivros || data.livros || data.livraria);
    var cinema = countArray(data.trackerCinema || data.trackerFilmes || data.trackerSeries || data.cinema || data.filmes);
    var mangas = countArray(data.trackerMangas || data.trackerManga || data.mangas);
    var dreams = countArray(getDreams(data));
    var trips = countArray(data.viagens || data.travels);
    var wishlist = countArray(getWishlist(data));
    var finances = countArray(getFinances(data));
    var tasks = countArray(getTasks(data));
    var review = getReviewCount(data);
    var gym = getGymCount(data);
    var study = getStudyHours(data);
    var notifications = countArray(data.notifications);
    var doneTasks = getTasks(data).filter(function (item) { return item && item.done; }).length;
    var pendingTasks = Math.max(0, tasks - doneTasks);
    var rpgXp = getRpgXp(state);
    var rpgLevel = getRpgLevel(rpgXp);
    var xpThisLevel = getXpForLevel(rpgLevel);
    var xpNextLevel = getXpForLevel(rpgLevel + 1);
    var xpPct = xpNextLevel > xpThisLevel ? Math.max(0, Math.min(100, Math.round((rpgXp - xpThisLevel) / (xpNextLevel - xpThisLevel) * 100))) : 0;
    var xpRemaining = Math.max(0, xpNextLevel - rpgXp);
    var records = books + cinema + mangas + dreams + trips + wishlist + finances + tasks + review + gym;
    var library = books + cinema + mangas;
    var personal = dreams + trips + wishlist + finances;
    var execution = tasks + review + gym;
    var attrs = window.SoterRPG && typeof window.SoterRPG.getAttrs === "function"
      ? window.SoterRPG.getAttrs(state)
      : [
          { label: "Intelecto", val: Math.min(100, books * 4 + study * 2) },
          { label: "Forca", val: Math.min(100, gym * 3) },
          { label: "Sabedoria", val: Math.min(100, books * 2 + study * 3) },
          { label: "Disciplina", val: Math.min(100, tasks * 2 + gym) },
          { label: "Exploracao", val: Math.min(100, trips * 10 + cinema * 2) },
          { label: "Prestigio", val: Math.min(100, Math.floor(rpgXp / 20)) }
        ];

    setStat("modules", "10");
    setStat("records", String(records));
    setStat("notifications", String(notifications));
    setStat("library-detail", formatCount(library, "midia", "midias"));
    setStat("personal-detail", formatCount(personal, "meta", "metas"));
    setStat("planning-detail", formatCount(tasks + review, "frente", "frentes"));
    setStat("evolution-detail", formatCount(countObjectKeys(data.rpg || {}) ? 2 : 1, "sistema", "sistemas"));
    setStat("dreams", formatCount(dreams, "sonho", "sonhos"));
    setStat("wishlist", formatCount(wishlist, "desejo", "desejos"));

    setText("hero-rpg-level", String(rpgLevel));
    setText("constellation-rpg-level", String(rpgLevel));
    setText("constellation-rpg-title", getRpgTitle(rpgLevel));
    setText("featured-rpg-level", String(rpgLevel));
    setText("featured-rpg-title", getRpgTitle(rpgLevel));
    setText("hs-livros", String(books));
    setText("hs-filmes", String(cinema));
    setText("hs-viagens", String(trips));
    setText("ht-livros", String(books));
    setText("ht-cinema", String(cinema));
    setText("ht-mangas", String(mangas));
    setText("ht-tarefas", String(tasks));
    setText("hs-dreams", String(dreams));
    setText("hs-wishlist", String(wishlist));
    setText("hs-level-2", String(rpgLevel));
    setText("hs-rpg-title-2", getRpgTitle(rpgLevel));
    setText("xp-progress-label", Math.round(rpgXp) + " XP - " + xpRemaining + " XP para o proximo nivel");

    setBar("hs-xp-bar-2", xpPct);
    attrs.forEach(function (attr) {
      var key = String(attr && attr.label || "")
        .toLowerCase()
        .replace(/\u00e7/g, "c")
        .replace(/\u00e3/g, "a")
        .replace(/\u00ed/g, "i")
        .replace(/\u00f3/g, "o");
      var id = key === "intelecto" ? "intellect"
        : key === "forca" ? "strength"
        : key === "sabedoria" ? "wisdom"
        : key === "disciplina" ? "discipline"
        : key === "exploracao" ? "exploration"
        : key === "prestigio" ? "prestige"
        : "";
      if (!id) return;
      setBar("attr-" + id, Number(attr.val || 0));
      setText("attr-" + id + "-val", String(Number(attr.val || 0)));
    });

    hydrateMoodNote(state);
    syncHomeDate();
  }

  function initReveal() {
    var items = document.querySelectorAll(".reveal-up");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    items.forEach(function (item) { observer.observe(item); });
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener("mouseleave", function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });
  window.addEventListener("touchmove", function (e) {
    if (e.touches && e.touches[0]) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
  }, { passive: true });
  window.addEventListener("scroll", function () {
    heroScrollY = window.pageYOffset || window.scrollY || 0;
  }, { passive: true });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopAnimationLoop();
      return;
    }
    ensureAnimationLoop();
  });
  window.addEventListener("soter:notifications-changed", hydrateSummary);
  window.addEventListener("soter:remote-state-applied", hydrateSummary);
  window.addEventListener("storage", hydrateSummary);
  window.setMood = setMood;
  window.saveNote = saveNote;

  if (canvas && ctx) {
    resize();
    shootTimer = setInterval(function () {
      if (!document.hidden && !prefersReducedMotion) spawnShoot();
    }, SHOOT_INTERVAL);
    setTimeout(function () {
      if (!document.hidden && !prefersReducedMotion) spawnShoot();
    }, 800);
    ensureAnimationLoop();
  }

  initReveal();
  hydrateSummary();
}());
