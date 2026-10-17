// Fundo de estrelas compartilhado (Livraria, Cinema, Mangás e Revisão).
// Mesmo desenho das cópias que ficavam dentro de cada página, mais leve:
// - fundo e nebulosas desenhados uma vez num canvas fora da tela (refeitos ao redimensionar);
// - brilho das estrelas a partir de um sprite por cor, sem criar gradientes a cada quadro;
// - conexões por grade espacial (só estrelas de células vizinhas), não todos os pares;
// - pausa com a aba oculta, quantidade de estrelas conforme a largura da tela e um quadro
//   parado quando o sistema pede menos movimento (prefers-reduced-motion).
(function () {
  "use strict";

  var DEFAULTS = {
    stars: 320,
    vx: [-0.04, 0.04],
    vy: [-0.02, 0.03],
    radius: [0.3, 1.2],
    radiusLayerBase: 0.6,
    alpha: [0.3, 1],
    twinkle: [0.005, 0.025],
    minAlpha: 0.15,
    hues: { white: [220, 215, 255], gold: [200, 169, 110], violet: [140, 120, 210], sky: [120, 190, 240] },
    nebulas: [
      { x: 0.15, y: 0.2, r: 320, color: "rgba(80,50,180,0.035)" },
      { x: 0.75, y: 0.6, r: 280, color: "rgba(180,120,50,0.028)" },
      { x: 0.5, y: 0.85, r: 200, color: "rgba(40,120,150,0.025)" }
    ],
    connectDist: 100,
    connectAlpha: 0.07,
    connectWidth: 0.4,
    connectMinWidth: 900, // abaixo disso não desenha conexões (celular)
    repel: 90,
    repelForce: 0.6,
    glow: 3,
    core: 0.6,
    coreAlpha: 1.4,
    shootInterval: 4000,
    shootFirst: 800,
    shootLen: [100, 200],
    shootSpeed: [8, 16],
    shootFade: 0.012,
    shootMidStop: 0.3,
    shootMidAlpha: 0.6,
    shootWidth: 1.2,
    shootHead: 1.5
  };

  function extend(base, extra) {
    var out = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (k in extra || {}) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    return out;
  }

  function rand(range) {
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  function start(canvas, options) {
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    var o = extend(DEFAULTS, options);
    var reducedMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var hueNames = Object.keys(o.hues);
    var W = 0;
    var H = 0;
    var stars = [];
    var shoots = [];
    var mouse = { x: -9999, y: -9999 };
    var bgCanvas = document.createElement("canvas");
    var sprites = {};
    var rafId = 0;
    var resizeRaf = 0;
    var connectDistSq = o.connectDist * o.connectDist;

    // brilho de cada cor num sprite (gradiente radial branco -> cor -> transparente)
    hueNames.forEach(function (name) {
      var c = document.createElement("canvas");
      var size = 64;
      var rgb = o.hues[name];
      c.width = c.height = size;
      var g = c.getContext("2d");
      var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",1)");
      grad.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      sprites[name] = c;
    });

    function starCount() {
      if (W <= 640) return Math.round(o.stars * 0.35);
      if (W <= 1024) return Math.round(o.stars * 0.6);
      return o.stars;
    }

    function pickHue() {
      if (Math.random() >= 0.15) return hueNames[0];
      if (Math.random() < 0.5) return hueNames[1];
      return Math.random() < 0.5 ? hueNames[2] : hueNames[3];
    }

    function initStars() {
      var n = starCount();
      stars = [];
      for (var i = 0; i < n; i += 1) {
        var layer = Math.floor(Math.random() * 3);
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: rand(o.vx) * (layer + 1),
          vy: rand(o.vy) * (layer + 1),
          r: rand(o.radius) * (layer * 0.4 + o.radiusLayerBase),
          a: rand(o.alpha),
          ts: rand(o.twinkle),
          td: Math.random() > 0.5 ? 1 : -1,
          layer: layer,
          hue: pickHue()
        });
      }
    }

    function paintBackground() {
      bgCanvas.width = W;
      bgCanvas.height = H;
      var b = bgCanvas.getContext("2d");
      var bg = b.createRadialGradient(W * 0.35, H * 0.3, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.9);
      bg.addColorStop(0, "#08082a");
      bg.addColorStop(0.4, "#05050f");
      bg.addColorStop(1, "#020208");
      b.fillStyle = bg;
      b.fillRect(0, 0, W, H);
      o.nebulas.forEach(function (n) {
        var cx = W * n.x;
        var cy = H * n.y;
        var g = b.createRadialGradient(cx, cy, 0, cx, cy, n.r);
        g.addColorStop(0, n.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        b.fillStyle = g;
        b.beginPath();
        b.arc(cx, cy, n.r, 0, Math.PI * 2);
        b.fill();
      });
    }

    function drawConnections() {
      if (W < o.connectMinWidth) return;
      var cell = o.connectDist;
      var cols = Math.ceil(W / cell) + 1;
      var grid = {};
      var i;
      for (i = 0; i < stars.length; i += 1) {
        var s = stars[i];
        var key = Math.floor(s.x / cell) + Math.floor(s.y / cell) * cols;
        (grid[key] || (grid[key] = [])).push(i);
      }
      ctx.lineWidth = o.connectWidth;
      for (i = 0; i < stars.length; i += 1) {
        var a = stars[i];
        var cx = Math.floor(a.x / cell);
        var cy = Math.floor(a.y / cell);
        for (var dy = -1; dy <= 1; dy += 1) {
          for (var dx = -1; dx <= 1; dx += 1) {
            var list = grid[(cx + dx) + (cy + dy) * cols];
            if (!list) continue;
            for (var k = 0; k < list.length; k += 1) {
              var j = list[k];
              if (j <= i) continue; // cada par uma vez
              var bStar = stars[j];
              if (bStar.layer !== a.layer) continue;
              var ddx = a.x - bStar.x;
              var ddy = a.y - bStar.y;
              var distSq = ddx * ddx + ddy * ddy;
              if (distSq >= connectDistSq) continue;
              ctx.strokeStyle = "rgba(200,180,255," + ((1 - Math.sqrt(distSq) / o.connectDist) * o.connectAlpha) + ")";
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(bStar.x, bStar.y);
              ctx.stroke();
            }
          }
        }
      }
    }

    function stepStars(move) {
      for (var i = 0; i < stars.length; i += 1) {
        var s = stars[i];
        if (move) {
          s.a += s.ts * s.td;
          if (s.a >= 1) { s.a = 1; s.td = -1; }
          if (s.a <= o.minAlpha) { s.a = o.minAlpha; s.td = 1; }
          var mx = mouse.x - s.x;
          var my = mouse.y - s.y;
          var md = Math.sqrt(mx * mx + my * my);
          if (md < o.repel && md > 0) {
            var f = (1 - md / o.repel) * o.repelForce;
            s.x -= (mx / md) * f;
            s.y -= (my / md) * f;
          }
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < -5) s.x = W + 5;
          if (s.x > W + 5) s.x = -5;
          if (s.y < -5) s.y = H + 5;
          if (s.y > H + 5) s.y = -5;
        }
        var glow = s.r * o.glow;
        ctx.globalAlpha = s.a;
        ctx.drawImage(sprites[s.hue], s.x - glow, s.y - glow, glow * 2, glow * 2);
        var rgb = o.hues[s.hue];
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + Math.min(s.a * o.coreAlpha, 1) + ")";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * o.core, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function stepShoots() {
      for (var i = shoots.length - 1; i >= 0; i -= 1) {
        var sh = shoots[i];
        sh.x -= Math.cos(sh.angle) * sh.speed;
        sh.y += Math.sin(sh.angle) * sh.speed;
        sh.alpha -= o.shootFade;
        if (sh.alpha <= 0 || sh.x < -50 || sh.y > H + 50) {
          shoots.splice(i, 1);
          continue;
        }
        var tx = sh.x + Math.cos(sh.angle) * sh.len;
        var ty = sh.y - Math.sin(sh.angle) * sh.len;
        var grad = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
        grad.addColorStop(0, "rgba(255,255,255," + sh.alpha + ")");
        grad.addColorStop(o.shootMidStop, "rgba(200,180,255," + (sh.alpha * o.shootMidAlpha) + ")");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = o.shootWidth;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, o.shootHead, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255," + sh.alpha + ")";
        ctx.fill();
      }
    }

    function draw(move) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bgCanvas, 0, 0);
      drawConnections();
      stepStars(move);
      if (move) stepShoots();
    }

    function frame() {
      rafId = 0;
      if (document.hidden) return;
      draw(true);
      rafId = requestAnimationFrame(frame);
    }

    function play() {
      if (reducedMotion) { draw(false); return; } // um quadro parado
      if (!rafId && !document.hidden) rafId = requestAnimationFrame(frame);
    }

    function resize() {
      resizeRaf = 0;
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      paintBackground();
      initStars();
      if (reducedMotion) draw(false);
    }

    function spawnShoot() {
      if (document.hidden || reducedMotion) return;
      shoots.push({
        x: W * 0.2 + Math.random() * W * 0.8,
        y: Math.random() * H * 0.4,
        len: rand(o.shootLen),
        angle: (20 + Math.random() * 30) * Math.PI / 180,
        speed: rand(o.shootSpeed),
        alpha: 1
      });
    }

    window.addEventListener("resize", function () {
      if (!resizeRaf) resizeRaf = requestAnimationFrame(resize);
    });
    window.addEventListener("mousemove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener("mouseleave", function () { mouse.x = -9999; mouse.y = -9999; });
    window.addEventListener("touchmove", function (e) {
      if (e.touches && e.touches[0]) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
    }, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
        return;
      }
      play();
    });

    resize();
    setInterval(spawnShoot, o.shootInterval);
    setTimeout(spawnShoot, o.shootFirst);
    play();
    return { redraw: function () { draw(false); } };
  }

  window.SoterStarfield = { start: start };
}());
