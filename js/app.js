/* ------------------------------------------------------------------
 * CRAFTS 条带覆盖查询 —— 交互与绘制
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  var D = window.CRAFTS_DATA;
  var A = window.Astro;

  var DECS = D.decs;
  var N = DECS.length;
  var DEC0 = DECS[0];
  var STEP = D.decStep;
  var HALF_H = D.beam.halfHeightDeg;        // 19 波束阵列半高度（度）
  var STRIPS = D.strips;
  var LIVE = null;
  var PULSARS = D.pulsars || [];
  var ATNF = D.atnf || [];
  var t = window.I18N.t;

  var STATUS_COLOR = {
    done: '#4f9dff',
    partial: '#f5b942',
    running: '#2fd8b4',
    idle: '#7b8aa5'
  };
  function statusText(s) { return t('status.' + s); }

  var $ = function (s) { return document.querySelector(s); };
  var canvas = $('#sky');
  var ctx = canvas.getContext('2d');
  var stage = $('.stage');
  var tooltip = $('#tooltip');
  var infoBody = $('#infoBody');

  var state = {
    kind: 'eq',
    layers: { plan: true, observed: true, atnf: true, pulsars: true, milky: true, grid: true, labels: true, za: true, zenith: true, sun: true },
    hover: null,
    selected: null,
    view: { s: 1, tx: 0, ty: 0 },
    proj: null,
    dpr: 1,
    W: 0,
    H: 0,
    syncing: false,
    checkedAt: 0,
    sort: 'desc'
  };

  var planPath = null;
  var planStrips = [];
  var milkyPath = null;
  var framePath = null;
  var obsPaths = [];
  var pyPerDeg = 5;

  /* ---------------- 天顶（FAST 站址正上方） ---------------- */

  function lstDeg() {
    var jd = Date.now() / 86400000 + 2440587.5;
    var T = (jd - 2451545.0) / 36525;
    var gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
               0.000387933 * T * T - T * T * T / 38710000;
    return A.norm360(gmst + D.fastLon);
  }

  function zenithPoint() {
    return { ra: lstDeg(), dec: D.fastLat };
  }

  /** 当前时刻太阳的视位置（低精度公式，约 0.01° 量级） */
  function sunPoint() {
    var jd = Date.now() / 86400000 + 2440587.5;
    var n = jd - 2451545.0;
    var L = A.norm360(280.460 + 0.9856474 * n);
    var g = A.norm360(357.528 + 0.9856003 * n) * A.D2R;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * A.D2R;
    var eps = (23.439 - 0.0000004 * n) * A.D2R;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    return { ra: A.norm360(ra * A.R2D), dec: dec * A.R2D };
  }

  /* ---------------- 几何 ---------------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /**
   * 一条 Dec 条带的带状多边形。
   * 两端沿经线采样，使边缘贴合投影边界（不会出现直边切角）。
   */
  function bandPath(proj, ra0, ra1, dec, half, step) {
    var path = new Path2D();
    var hi = dec + half, lo = dec - half;
    var n = Math.max(2, Math.ceil(Math.abs(ra1 - ra0) / step));
    var edgeN = 18;
    var i, p, d;

    p = proj.project(ra0, hi);
    path.moveTo(p[0], p[1]);
    for (i = 1; i <= n; i++) {
      p = proj.project(ra0 + (ra1 - ra0) * i / n, hi);
      path.lineTo(p[0], p[1]);
    }
    for (i = 1; i <= edgeN; i++) {
      d = hi + (lo - hi) * i / edgeN;
      p = proj.project(ra1, d);
      path.lineTo(p[0], p[1]);
    }
    for (i = n - 1; i >= 0; i--) {
      p = proj.project(ra0 + (ra1 - ra0) * i / n, lo);
      path.lineTo(p[0], p[1]);
    }
    for (i = 1; i < edgeN; i++) {
      d = lo + (hi - lo) * i / edgeN;
      p = proj.project(ra0, d);
      path.lineTo(p[0], p[1]);
    }
    path.closePath();
    return path;
  }

  /**
   * 银道视图下同一条带会被 0h/24h 接缝切成多段；
   * 按投影跳变位置把带子拆成若干独立多边形，逐段填充。
   */
  function bandPathWrapped(proj, ra0, ra1, dec, half, step) {
    var hi = dec + half, lo = dec - half;
    var n = Math.max(2, Math.ceil(Math.abs(ra1 - ra0) / step));
    var top = [], bot = [], i, ra;
    for (i = 0; i <= n; i++) {
      ra = ra0 + (ra1 - ra0) * i / n;
      top.push(proj.project(ra, hi));
      bot.push(proj.project(ra, lo));
    }
    // 用银经跳变判断接缝（屏幕 x 在极区收缩，单靠像素距离不可靠）
    var gap = state.W * 0.45;
    var runs = [], start = 0;
    for (i = 1; i <= n; i++) {
      var g0 = A.eq2gal(ra0 + (ra1 - ra0) * (i - 1) / n, dec)[0];
      var g1 = A.eq2gal(ra0 + (ra1 - ra0) * i / n, dec)[0];
      var l0 = ((g0 + 180) % 360) - 180;   // 转到 -180..180，接缝落在 l=±180
      var l1 = ((g1 + 180) % 360) - 180;
      var wrap = Math.abs(l1 - l0) > 180;
      if (wrap ||
          Math.abs(top[i][0] - top[i - 1][0]) > gap ||
          Math.abs(bot[i][0] - bot[i - 1][0]) > gap) {
        runs.push([start, i - 1]);
        start = i;
      }
    }
    runs.push([start, n]);

    var path = new Path2D();
    runs.forEach(function (r) {
      if (r[1] - r[0] < 1) return;
      path.moveTo(top[r[0]][0], top[r[0]][1]);
      for (var j = r[0] + 1; j <= r[1]; j++) path.lineTo(top[j][0], top[j][1]);
      for (var k = r[1]; k >= r[0]; k--) path.lineTo(bot[k][0], bot[k][1]);
      path.closePath();
    });
    return path;
  }

  function makeBand(proj, ra0, ra1, dec, half, step) {
    return state.kind === 'gal'
      ? bandPathWrapped(proj, ra0, ra1, dec, half, step)
      : bandPath(proj, ra0, ra1, dec, half, step);
  }

  function windowsFor(ra0Deg, durDeg) {
    var end = ra0Deg + durDeg;
    if (end <= 360) return [[ra0Deg, end]];
    return [[ra0Deg, 360], [0, end - 360]];
  }

  function buildPaths() {
    var proj = state.proj;
    if (!proj) return;

    // 222 条 Dec 条带。赤道视图里无缝拼成一条带；
    // 银道视图里逐条绘制，避免宽带在 0h/24h 接缝处自交
    planPath = new Path2D();
    planStrips = [];
    if (state.kind === 'gal') {
      for (var pi = 0; pi < N; pi++) {
        planStrips.push(bandPathWrapped(proj, 0, 360, DECS[pi], STEP / 2, 3));
      }
    } else {
      planPath = bandPath(proj, 0, 360, (DEC0 + DECS[N - 1]) / 2,
                          (DECS[N - 1] - DEC0) / 2 + HALF_H, 2);
    }

    obsPaths = STRIPS.map(function (s) {
      var wins = windowsFor(s.raStartH * 15, s.durH * 15);
      return {
        strip: s,
        paths: wins.map(function (w) {
          return makeBand(proj, w[0], w[1], s.dec, HALF_H, 1);
        })
      };
    });

    // 银道面：沿 l 逐段生成小四边形，避开 0h/24h 接缝处的跳线
    milkyPath = new Path2D();
    for (var l = 0; l < 360; l += 2) {
      var corners = [
        A.gal2eq(l, -7), A.gal2eq(l + 2, -7),
        A.gal2eq(l + 2, 7), A.gal2eq(l, 7)
      ].map(function (g) { return proj.project(g[0], g[1]); });

      var minX = Infinity, maxX = -Infinity;
      corners.forEach(function (c) {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
      });
      if (maxX - minX > state.W * 0.45) continue;  // 跨接缝，跳过

      milkyPath.moveTo(corners[0][0], corners[0][1]);
      for (var k = 1; k < 4; k++) milkyPath.lineTo(corners[k][0], corners[k][1]);
      milkyPath.closePath();
    }

    framePath = new Path2D();
    var outline = proj.outline();
    outline.forEach(function (q, i) {
      i === 0 ? framePath.moveTo(q[0], q[1]) : framePath.lineTo(q[0], q[1]);
    });
    framePath.closePath();

    var a = proj.project(180, 0);
    var b = proj.project(180, 1);
    pyPerDeg = Math.abs(a[1] - b[1]) || 1;
  }

  function rebuild() {
    if (state.W < 10 || state.H < 10) return;
    state.proj = A.createProjection(state.kind, state.W, state.H);
    buildPaths();
    schedule();
  }

  /* ---------------- 绘制 ---------------- */

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      draw();
    });
  }

  function activeItem() { return state.hover || state.selected; }

  function draw() {
    var proj = state.proj;
    if (!proj) return;
    var v = state.view;

    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.W, state.H);

    ctx.save();
    ctx.translate(v.tx, v.ty);
    ctx.scale(v.s, v.s);

    if (state.layers.milky) drawMilky(v);
    if (state.layers.grid) drawGrid(v);
    if (state.layers.za) drawZA(v);
    if (state.layers.plan) drawPlan(v);
    if (state.layers.atnf) drawCatalog(v, ATNF, 'rgba(170,180,200,0.6)', 1.3);
    if (state.layers.pulsars) drawCatalog(v, PULSARS, 'rgba(255,120,120,0.85)', 1.9);
    if (state.layers.observed) drawObserved(v);
    if (state.layers.zenith) drawZenith(v);
    if (state.layers.sun) drawSun(v);
    drawActive(v);
    drawFrame(v);

    ctx.restore();

    if (state.layers.zenith) drawZenithLabel();
    if (state.layers.sun) drawSunLabel();
    if (state.layers.labels) drawLabels();
  }

  function drawMilky(v) {
    ctx.save();
    ctx.fillStyle = 'rgba(150,175,215,0.055)';
    ctx.fill(milkyPath);
    ctx.restore();
  }

  /** 分段绘制折线，跨 0h/24h 处断开，避免横穿全图的直线 */
  function strokeWrapped(proj, pts) {
    var prev = null;
    var gap = state.W * 0.5;
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var p = proj.project(pts[i][0], pts[i][1]);
      if (!prev) {
        ctx.moveTo(p[0], p[1]);
      } else if (Math.abs(p[0] - prev[0]) > gap) {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
      } else {
        ctx.lineTo(p[0], p[1]);
      }
      prev = p;
    }
    ctx.stroke();
  }

  function drawGrid(v) {
    var proj = state.proj;
    var i, d, l, h, eq, pts;

    ctx.save();
    ctx.strokeStyle = 'rgba(130,155,195,0.15)';
    ctx.lineWidth = 0.5 / v.s;
    ctx.setLineDash([2 / v.s, 3.5 / v.s]);

    if (state.kind === 'eq') {
      for (d = -60; d <= 60; d += 30) {
        if (d === 0) continue;
        ctx.beginPath();
        for (i = 0; i <= 360; i += 3) {
          var p = proj.project(i, d);
          i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();
      }
      for (h = 0; h <= 24; h += 2) {
        ctx.beginPath();
        for (d = -90; d <= 90; d += 3) {
          var q = proj.project(h * 15, d);
          d === -90 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]);
        }
        ctx.stroke();
      }
    } else {
      for (d = -60; d <= 60; d += 30) {
        if (d === 0) continue;
        pts = [];
        for (l = 0; l <= 360; l += 3) {
          eq = A.gal2eq(l, d);
          pts.push([eq[0], eq[1]]);
        }
        strokeWrapped(proj, pts);
      }
      for (l = 0; l < 360; l += 30) {
        pts = [];
        for (d = -90; d <= 90; d += 3) {
          eq = A.gal2eq(l, d);
          pts.push([eq[0], eq[1]]);
        }
        strokeWrapped(proj, pts);
      }
    }
    ctx.restore();
  }

  function drawZA(v) {
    var proj = state.proj;
    ctx.save();
    ctx.lineWidth = 1 / v.s;
    ctx.setLineDash([5 / v.s, 4 / v.s]);
    D.zaLines.forEach(function (za, idx) {
      var color = idx === 0 ? 'rgba(239,120,120,0.5)' : 'rgba(190,205,230,0.3)';
      [D.fastLat + za, D.fastLat - za].forEach(function (dec) {
        if (dec < -89 || dec > 89) return;
        ctx.strokeStyle = color;
        ctx.beginPath();
        for (var i = 0; i <= 360; i += 3) {
          var p = proj.project(i, dec);
          i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();
      });
    });
    ctx.restore();
  }

  function drawPlan(v) {
    var act = activeItem();
    ctx.save();
    if (act) {
      ctx.fillStyle = 'rgba(120,132,155,0.05)';
      ctx.strokeStyle = 'rgba(120,132,155,0.13)';
    } else {
      ctx.fillStyle = 'rgba(110,168,255,0.10)';
      ctx.strokeStyle = state.kind === 'gal'
        ? 'rgba(120,175,255,0.07)'
        : 'rgba(110,168,255,0.22)';
    }
    ctx.lineWidth = 1 / v.s;
    if (planStrips.length) {
      planStrips.forEach(function (p) { ctx.fill(p); ctx.stroke(p); });
    } else {
      ctx.fill(planPath);
      ctx.stroke(planPath);
    }
    ctx.restore();
  }

  function drawCatalog(v, list, color, rBase) {
    if (!list.length) return;
    var proj = state.proj;
    var r = Math.max(0.18, rBase / v.s);   // 屏幕上恒为 rBase 像素，不随缩放变大
    var twoPi = Math.PI * 2;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < list.length; i++) {
      var p = proj.project(list[i][0], list[i][1]);
      ctx.moveTo(p[0] + r, p[1]);
      ctx.arc(p[0], p[1], r, 0, twoPi);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawObserved(v) {
    var act = activeItem();
    ctx.save();
    obsPaths.forEach(function (o) {
      var s = o.strip;
      var isAct = act && act.type === 'observed' && act.strip === s;
      if (isAct) return;                 // 高亮由 drawActive 统一绘制，避免露出原来的彩色描边
      var dim = !!act;
      var col = STATUS_COLOR[s.status] || '#4f9dff';

      // 纯色填充，不描边
      ctx.fillStyle = dim ? 'rgba(140,152,175,0.28)' : hexA(col, 0.85);
      o.paths.forEach(function (p) { ctx.fill(p); });
    });
    ctx.restore();
  }

  function drawActive(v) {
    var act = activeItem();
    if (!act || act.type === 'zenith' || act.type === 'sun') return;
    var paths = [];
    if (act.type === 'plan') {
      paths.push(makeBand(state.proj, 0, 360, DECS[act.index], HALF_H, 2));
    } else {
      var o = obsPaths.filter(function (x) { return x.strip === act.strip; })[0];
      if (o) paths = o.paths;
    }
    ctx.save();
    // 统一浅黄色填充，不描边、不加发光
    ctx.fillStyle = 'rgba(255,228,150,0.62)';
    paths.forEach(function (p) { ctx.fill(p); });
    ctx.restore();
  }

  function drawZenith(v) {
    var proj = state.proj;
    var z = zenithPoint();
    var p = proj.project(z.ra, z.dec);
    var r = 1.95 / v.s;                    // 约 1.5× ATNF 散点，能看出六边形轮廓
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 3;
      var x = p[0] + r * Math.cos(a);
      var y = p[1] + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(120,180,255,0.55)';
    ctx.strokeStyle = 'rgba(200,228,255,0.98)';
    ctx.lineWidth = 0.65 / v.s;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  var ECLIPTIC = (function () {
    var eps = 23.439 * A.D2R, pts = [];
    for (var d = 0; d <= 360; d += 2) {
      var lam = d * A.D2R;
      var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
      var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
      pts.push([A.norm360(ra * A.R2D), dec * A.R2D]);
    }
    return pts;
  })();

  function drawSun(v) {
    var proj = state.proj;

    // 太阳周年视运动轨迹（黄道），浅黄虚线
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 214, 120, 0.45)';
    ctx.lineWidth = 1 / v.s;
    ctx.setLineDash([5 / v.s, 4 / v.s]);
    strokeWrapped(proj, ECLIPTIC);
    ctx.restore();

    var s0 = sunPoint();
    var p = proj.project(s0.ra, s0.dec);
    var r = 3.4 / v.s;
    var twoPi = Math.PI * 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, twoPi);
    ctx.fillStyle = 'rgba(255, 205, 92, 0.95)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p[0], p[1], r + 1.6 / v.s, 0, twoPi);
    ctx.strokeStyle = 'rgba(255, 205, 92, 0.55)';
    ctx.lineWidth = 0.8 / v.s;
    ctx.stroke();
    ctx.restore();
  }

  function drawFrame(v) {
    ctx.save();
    ctx.strokeStyle = 'rgba(120,150,195,0.4)';
    ctx.lineWidth = 1.1 / v.s;
    ctx.stroke(framePath);
    ctx.restore();
  }

  function toScreen(p) {
    return [p[0] * state.view.s + state.view.tx, p[1] * state.view.s + state.view.ty];
  }

  function label(text, x, y, align) {
    ctx.font = '13px "Times New Roman", Times, "PingFang SC", serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(5,9,16,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = 'rgba(150,170,200,0.95)';
    ctx.fillText(text, x, y);
  }

  function drawZenithLabel() {
    var proj = state.proj;
    if (!proj) return;
    var z = zenithPoint();
    var p = toScreen(proj.project(z.ra, z.dec));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.font = '12px "Times New Roman", Times, "PingFang SC", serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var label = t('canvas.zenith');
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(5,9,16,0.9)';
    ctx.strokeText(label, p[0] + 15, p[1] - 1);
    ctx.fillStyle = 'rgba(150,205,255,0.95)';
    ctx.fillText(label, p[0] + 15, p[1] - 1);
  }

  function drawSunLabel() {
    var proj = state.proj;
    if (!proj) return;
    var s0 = sunPoint();
    var p = toScreen(proj.project(s0.ra, s0.dec));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.font = '12px "Times New Roman", Times, "PingFang SC", serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(5,9,16,0.9)';
    ctx.strokeText(t('canvas.sun'), p[0] + 8, p[1] - 10);
    ctx.fillStyle = 'rgba(255,214,120,0.95)';
    ctx.fillText(t('canvas.sun'), p[0] + 8, p[1] - 10);
  }

  function drawLabels() {
    var proj = state.proj;
    if (!proj) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

    var p, i, eq;

    if (state.kind === 'eq') {
      var taken = [];
      for (var d0 = -60; d0 <= 60; d0 += 30) {
        p = toScreen(proj.edge(d0, 'left'));
        label((d0 > 0 ? '+' : '') + d0 + '°', p[0] - 10, p[1], 'right');
        taken.push(p);
      }
      for (var h = 0; h <= 24; h += 2) {
        p = toScreen(proj.project(h * 15, -24));
        var clear = taken.every(function (q) {
          return Math.hypot(q[0] - p[0], q[1] - (p[1] + 12)) > 30;
        });
        if (clear) label(h + 'h', p[0], p[1] + 12);
      }
    } else {
      for (var l = 0; l <= 330; l += 30) {
        eq = A.gal2eq(l, 0);
        p = toScreen(proj.project(eq[0], eq[1]));
        label(l + '°', p[0], p[1] + 13);
      }
      for (var b = -60; b <= 60; b += 30) {
        p = toScreen(proj.edge(b, 'left'));
        label((b > 0 ? '+' : '') + b + '°', p[0] - 10, p[1], 'right');
      }
    }
  }

  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------------- 拾取 ---------------- */

  function raInWindow(ra, start, dur, tol) {
    var end = start + dur;
    var r = A.norm360(ra);
    if (end <= 360) return r >= start - tol && r <= end + tol;
    return r >= start - tol || r <= (end - 360) + tol;
  }

  function pick(bx, by) {
    var proj = state.proj;
    if (!proj) return null;
    var g = proj.unproject(bx, by);
    if (!g) return null;

    var tolPx = 10;
    var myScreen = by * state.view.s + state.view.ty;

    if (state.layers.sun) {
      var sp = sunPoint();
      var spx = proj.project(sp.ra, sp.dec);
      var smx = bx * state.view.s + state.view.tx;
      var smy = by * state.view.s + state.view.ty;
      var ssx = spx[0] * state.view.s + state.view.tx;
      var ssy = spx[1] * state.view.s + state.view.ty;
      if (Math.sqrt((smx - ssx) * (smx - ssx) + (smy - ssy) * (smy - ssy)) <= 14) {
        return { type: 'sun' };
      }
    }

    if (state.layers.zenith) {
      var z = zenithPoint();
      var zp = proj.project(z.ra, z.dec);
      var mx = bx * state.view.s + state.view.tx;
      var my = by * state.view.s + state.view.ty;
      var zx = zp[0] * state.view.s + state.view.tx;
      var zy = zp[1] * state.view.s + state.view.ty;
      if (Math.sqrt((mx - zx) * (mx - zx) + (my - zy) * (my - zy)) <= 15) {
        return { type: 'zenith' };
      }
    }

    var best = null, bestDist = Infinity;

    STRIPS.forEach(function (s) {
      var p = proj.project(g.ra, s.dec);
      var dist = Math.abs((p[1] * state.view.s + state.view.ty) - myScreen);
      var raTol = Math.max(0.3, (tolPx * 2) / (pyPerDeg * state.view.s));
      if (dist <= Math.max(tolPx, HALF_H * pyPerDeg * state.view.s + 3) &&
          raInWindow(g.ra, s.raStartH * 15, s.durH * 15, raTol) &&
          dist < bestDist) {
        best = { type: 'observed', strip: s };
        bestDist = dist;
      }
    });
    if (best) return best;

    var lo = DEC0 - HALF_H - 1, hi = DECS[N - 1] + HALF_H + 1;
    if (g.dec < lo || g.dec > hi) return null;

    var idx = clamp(Math.round((g.dec - DEC0) / STEP), 0, N - 1);
    var pp = proj.project(g.ra, DECS[idx]);
    var dy = Math.abs((pp[1] * state.view.s + state.view.ty) - myScreen);
    if (dy > tolPx + 2) return null;

    return { type: 'plan', index: idx };
  }

  function same(a, b) {
    if (!a || !b) return a === b;
    if (a.type !== b.type) return false;
    if (a.type === 'zenith' || a.type === 'sun') return true;
    if (a.type === 'plan') return a.index === b.index;
    return a.strip === b.strip;
  }

  /* ---------------- 提示框 / 信息卡 ---------------- */

  function fmtDeg(v) {
    return (v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '°';
  }

  function fmtRA(hours) {
    var h = ((hours % 24) + 24) % 24;
    var hh = Math.floor(h);
    var mm = Math.round((h - hh) * 60);
    if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
    return (hh < 10 ? '0' + hh : hh) + 'h' + (mm < 10 ? '0' + mm : mm);
  }

  function fmtDec(dec) {
    var sign = dec < 0 ? '−' : '+';
    var a = Math.abs(dec);
    var d = Math.floor(a);
    var m = Math.round((a - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    return sign + d + '°' + (m < 10 ? '0' + m : m) + '′';
  }

  function tipHTML(hit) {
    if (!hit) return '';
    if (hit.type === 'sun') {
      var s1 = sunPoint();
      var g1 = A.eq2gal(s1.ra, s1.dec);
      return '' +
        '<div class="tt-head"><span class="dot-sun"></span>' + t('sun.title') + '</div>' +
        '<dl>' +
        '<div><dt>RA</dt><dd>' + fmtRA(s1.ra / 15) + '</dd></div>' +
        '<div><dt>Dec</dt><dd>' + fmtDec(s1.dec) + '</dd></div>' +
        '<div><dt>l</dt><dd>' + g1[0].toFixed(2) + '°</dd></div>' +
        '<div><dt>b</dt><dd>' + fmtDeg(g1[1]) + '</dd></div>' +
        '</dl>' +
        '<div class="tt-note">' + t('sun.note') + '</div>';
    }
    if (hit.type === 'sun') {
      var s2 = sunPoint();
      var g2 = A.eq2gal(s2.ra, s2.dec);
      return '<div class="info">' +
        '<h3><span class="dot-sun"></span>' + t('sun.title') + '</h3>' +
        '<dl>' +
        '<div><dt>RA</dt><dd>' + fmtRA(s2.ra / 15) + '</dd></div>' +
        '<div><dt>Dec</dt><dd>' + fmtDec(s2.dec) + '</dd></div>' +
        '<div><dt>l</dt><dd>' + g2[0].toFixed(2) + '°</dd></div>' +
        '<div><dt>b</dt><dd>' + fmtDeg(g2[1]) + '</dd></div>' +
        '</dl>' +
        '<span class="tag">' + t('sun.tag') + '</span>' +
        '</div>';
    }
    if (hit.type === 'zenith') {
      var z = zenithPoint();
      var g = A.eq2gal(z.ra, z.dec);
      return '' +
        '<div class="tt-head"><span class="tt-hex"></span>' + t('zenith.title') + '</div>' +
        '<dl>' +
        '<div><dt>RA</dt><dd>' + fmtRA(z.ra / 15) + '</dd></div>' +
        '<div><dt>Dec</dt><dd>' + fmtDec(z.dec) + '</dd></div>' +
        '<div><dt>l</dt><dd>' + g[0].toFixed(2) + '°</dd></div>' +
        '<div><dt>b</dt><dd>' + fmtDeg(g[1]) + '</dd></div>' +
        '</dl>' +
        '<div class="tt-note">' + t('zenith.note') + '</div>';
    }
    if (hit.type === 'observed') {
      var s = hit.strip;
      return '' +
        '<div class="tt-head"><span class="dot ' + s.status + '"></span>' + s.id + '</div>' +
        '<dl>' +
        '<div><dt>' + t('tip.project') + '</dt><dd>' + s.project + '</dd></div>' +
        '<div><dt>' + t('tip.strip') + '</dt><dd>' + s.id + '</dd></div>' +
        '<div><dt>' + t('tip.date') + '</dt><dd>' + s.obsDate + '</dd></div>' +
        '<div><dt>' + t('tip.dec') + '</dt><dd>' + fmtDec(s.dec) + '</dd></div>' +
        '<div><dt>' + t('tip.ra') + '</dt><dd>' + fmtRA(s.raStartH) + ' – ' + fmtRA(s.raStartH + s.durH) + '</dd></div>' +
        '<div><dt>' + t('tip.beams') + '</dt><dd>' + s.done + '/' + s.beams + ' ' + t('x.searched') + '</dd></div>' +
        '</dl>' +
        '<div class="tt-note">' + statusText(s.status) + ' · ' + t('note.click') + '</div>';
    }
    var dec = DECS[hit.index];
    return '' +
      '<div class="tt-head"><span class="dot idle"></span>' + t('label.plan') + ' #' + hit.index + '</div>' +
      '<dl>' +
      '<div><dt>' + t('tip.dec') + '</dt><dd>' + fmtDec(dec) + '</dd></div>' +
      '<div><dt>' + t('tip.index') + '</dt><dd>' + hit.index + ' / ' + (N - 1) + '</dd></div>' +
      '<div><dt>' + t('tip.coverage') + '</dt><dd>' + t('plan.fullRA') + '</dd></div>' +
      '<div><dt>' + t('tip.status') + '</dt><dd>' + t('plan.unobserved') + '</dd></div>' +
      '</dl>' +
      '<div class="tt-note">' + t('note.plan') + '</div>';
  }

  function infoHTML(hit) {
    if (!hit) {
      return '<div class="info-empty">' + t('info.empty') + '</div>';
    }
    if (hit.type === 'sun') {
      var s2 = sunPoint();
      var g2 = A.eq2gal(s2.ra, s2.dec);
      return '<div class="info">' +
        '<h3><span class="dot-sun"></span>' + t('sun.title') + '</h3>' +
        '<dl>' +
        '<div><dt>RA</dt><dd>' + fmtRA(s2.ra / 15) + '</dd></div>' +
        '<div><dt>Dec</dt><dd>' + fmtDec(s2.dec) + '</dd></div>' +
        '<div><dt>l</dt><dd>' + g2[0].toFixed(2) + '°</dd></div>' +
        '<div><dt>b</dt><dd>' + fmtDeg(g2[1]) + '</dd></div>' +
        '</dl>' +
        '<span class="tag">' + t('sun.tag') + '</span>' +
        '</div>';
    }
    if (hit.type === 'zenith') {
      var z = zenithPoint();
      var g = A.eq2gal(z.ra, z.dec);
      return '<div class="info">' +
        '<h3><span class="tt-hex"></span>' + t('zenith.title') + '</h3>' +
        '<dl>' +
        '<div><dt>RA</dt><dd>' + fmtRA(z.ra / 15) + '</dd></div>' +
        '<div><dt>Dec</dt><dd>' + fmtDec(z.dec) + '</dd></div>' +
        '<div><dt>l</dt><dd>' + g[0].toFixed(2) + '°</dd></div>' +
        '<div><dt>b</dt><dd>' + fmtDeg(g[1]) + '</dd></div>' +
        '</dl>' +
        '<span class="tag">' + t('zenith.tag') + '</span>' +
        '</div>';
    }
    if (hit.type === 'observed') {
      var s = hit.strip;
      return '<div class="info">' +
        '<h3><span class="dot ' + s.status + '"></span>' + s.id + '</h3>' +
        '<dl>' +
        '<div><dt>' + t('tip.project') + '</dt><dd>' + s.project + '</dd></div>' +
        '<div><dt>' + t('tip.strip') + '</dt><dd>' + s.id + '</dd></div>' +
        '<div><dt>' + t('tip.date') + '</dt><dd>' + s.obsDate + '</dd></div>' +
        '<div><dt>' + t('tip.ra') + '</dt><dd>' + fmtRA(s.raStartH) + ' – ' + fmtRA(s.raStartH + s.durH) + '</dd></div>' +
        '<div><dt>' + t('tip.decRange') + '</dt><dd>' + fmtDec(s.dec - HALF_H) + ' ~ ' + fmtDec(s.dec + HALF_H) + '</dd></div>' +
        '<div><dt>' + t('tip.progress') + '</dt><dd>' + s.done + '/' + s.beams + '</dd></div>' +
        '<div><dt>' + t('tip.status') + '</dt><dd>' + statusText(s.status) + '</dd></div>' +
        '</dl>' +
        '<span class="tag">' + t('tag.searched') + '</span>' +
        '</div>';
    }
    var dec = DECS[hit.index];
    return '<div class="info">' +
      '<h3><span class="dot idle"></span>' + t('label.plan') + ' #' + hit.index + '</h3>' +
      '<dl>' +
      '<div><dt>' + t('tip.dec') + '</dt><dd>' + fmtDec(dec) + '</dd></div>' +
      '<div><dt>' + t('tip.index') + '</dt><dd>' + hit.index + ' / ' + (N - 1) + '</dd></div>' +
      '<div><dt>' + t('tip.decRange') + '</dt><dd>' + fmtDec(dec - HALF_H) + ' ~ ' + fmtDec(dec + HALF_H) + '</dd></div>' +
      '<div><dt>' + t('tip.coverage') + '</dt><dd>' + t('plan.fullRA2') + '</dd></div>' +
      '<div><dt>' + t('tip.status') + '</dt><dd>' + t('plan.unobserved') + '</dd></div>' +
      '</dl>' +
      '<span class="tag">' + t('tag.plan') + '</span>' +
      '</div>';
  }

  function placeTooltip(x, y) {
    var w = tooltip.offsetWidth || 240;
    var h = tooltip.offsetHeight || 160;
    var left = x + 18;
    var top = y + 18;
    if (left + w > state.W - 8) left = x - w - 18;
    if (top + h > state.H - 8) top = y - h - 18;
    tooltip.style.transform = 'translate(' + Math.max(8, left) + 'px,' + Math.max(8, top) + 'px)';
  }

  function updateTooltip(hit, x, y) {
    if (!hit) { tooltip.classList.remove('show'); return; }
    tooltip.innerHTML = tipHTML(hit);
    tooltip.classList.add('show');
    placeTooltip(x, y);
  }

  /* ---------------- 交互 ---------------- */

  function toBase(mx, my) {
    var v = state.view;
    return { x: (mx - v.tx) / v.s, y: (my - v.ty) / v.s };
  }

  function updateHover(mx, my) {
    var b = toBase(mx, my);
    var hit = pick(b.x, b.y);
    if (!same(hit, state.hover)) {
      state.hover = hit;
      schedule();
      updateInfo();
    }
    updateTooltip(hit, mx, my);

    var g = state.proj && state.proj.unproject(b.x, b.y);
    var readout = $('#coords');
    if (g) {
      if (state.kind === 'eq') {
        readout.textContent = 'RA ' + fmtRA(g.ra / 15) + ', Dec ' + fmtDec(g.dec);
      } else {
        var gal = A.eq2gal(g.ra, g.dec);
        readout.textContent = 'l ' + gal[0].toFixed(1) + '°, b ' + gal[1].toFixed(1) + '°';
      }
    } else {
      readout.textContent = '—';
    }
  }

  function updateInfo() {
    var act = activeItem();
    infoBody.innerHTML = infoHTML(act);
    var items = document.querySelectorAll('#striplist li');
    for (var i = 0; i < items.length; i++) {
      var on = act && act.type === 'observed' && items[i].dataset.id === act.strip.id;
      items[i].classList.toggle('active', !!on);
    }
  }

  function select(hit, focus) {
    state.selected = hit;
    schedule();
    updateInfo();
    if (focus !== false) focusOnHit(hit);
  }

  function focusOnHit(hit) {
    if (!hit || !state.proj) return;
    if (hit.type === 'observed') {
      var s = hit.strip;
      var ra = A.norm360(s.raStartH * 15 + s.durH * 15 / 2);
      focusOn(ra, s.dec, 4.2);
    } else {
      focusOn(180, DECS[hit.index], 2.4);
    }
  }

  function focusOn(ra, dec, scale) {
    var proj = state.proj;
    if (!proj) return;
    var p = proj.project(ra, dec);
    var s = clamp(scale, 1, 14);
    state.view.s = s;
    state.view.tx = state.W / 2 - p[0] * s;
    state.view.ty = state.H / 2 - p[1] * s;
    clampView();
    schedule();
  }

  function clampView() {
    var v = state.view;
    if (v.s <= 1.001) { v.tx = 0; v.ty = 0; v.s = 1; return; }
    v.tx = clamp(v.tx, state.W - state.W * v.s, 0);
    v.ty = clamp(v.ty, state.H - state.H * v.s, 0);
  }

  function resetView() {
    state.view = { s: 1, tx: 0, ty: 0 };
    schedule();
  }

  function zoomAt(mx, my, factor) {
    var v = state.view;
    var s2 = clamp(v.s * factor, 1, 14);
    if (s2 === v.s) return;
    v.tx = mx - (mx - v.tx) * (s2 / v.s);
    v.ty = my - (my - v.ty) * (s2 / v.s);
    v.s = s2;
    clampView();
    schedule();
  }

  /* ---------------- 搜索 ---------------- */

  function nearestIndex(dec) {
    return clamp(Math.round((dec - DEC0) / STEP), 0, N - 1);
  }

  function observedAtDec(idx) {
    for (var k = 0; k < STRIPS.length; k++) {
      if (Math.abs(STRIPS[k].dec - DECS[idx]) < STEP / 2) return STRIPS[k];
    }
    return null;
  }

  function resolveQuery(q) {
    q = (q || '').trim();
    if (!q) return null;
    var lower = q.toLowerCase().replace(/\s+/g, '');

    for (var i = 0; i < STRIPS.length; i++) {
      if (STRIPS[i].id.toLowerCase().indexOf(lower) >= 0) {
        return { type: 'observed', strip: STRIPS[i] };
      }
    }

    // #117 形式：按序号
    var mIdx = q.match(/^#\s*(\d{1,3})$/);
    if (mIdx) {
      var idx = clamp(parseInt(mIdx[1], 10), 0, N - 1);
      var s = observedAtDec(idx);
      return s ? { type: 'observed', strip: s } : { type: 'plan', index: idx };
    }

    // Dec±DDMM / ±DD:MM / 纯度数
    var m = q.match(/^([+-]?)\s*(\d{1,2}(?:\.\d+)?)\s*[°:′'\s]?\s*(\d{0,2}(?:\.\d+)?)\s*′?$/);
    if (m) {
      var sign = m[1] === '-' ? -1 : 1;
      var deg = parseFloat(m[2]);
      var min = m[3] ? parseFloat(m[3]) : 0;
      var dec = sign * (m[3] && deg % 1 === 0 ? (deg + min / 60) : deg);
      var k2 = nearestIndex(dec);
      var s2 = observedAtDec(k2);
      return s2 ? { type: 'observed', strip: s2 } : { type: 'plan', index: k2 };
    }
    return null;
  }

  function runSearch() {
    var q = $('#q').value;
    var hit = resolveQuery(q);
    var hint = $('#qhint');
    if (!hit) {
      hint.textContent = t('err.notfound');
      hint.style.color = '#e08d8d';
      $('#suggest').classList.remove('show');
      return;
    }
    hint.textContent = t('hint.query');
    hint.style.color = '';
    $('#suggest').classList.remove('show');
    select(hit);
  }

  function renderSuggest(q) {
    var box = $('#suggest');
    q = (q || '').trim().toLowerCase();
    if (!q) { box.classList.remove('show'); return; }
    var hits = STRIPS.filter(function (s) {
      return s.id.toLowerCase().indexOf(q) >= 0 || s.project.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 6);
    if (!hits.length) { box.classList.remove('show'); return; }
    box.innerHTML = hits.map(function (s) {
      return '<button data-id="' + s.id + '">' + s.id +
        ' <span class="s-meta">· ' + s.project + ' · ' + s.obsDate + '</span></button>';
    }).join('');
    box.classList.add('show');
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        var strip = STRIPS.filter(function (s) { return s.id === b.dataset.id; })[0];
        select({ type: 'observed', strip: strip });
        $('#q').value = strip.id;
        box.classList.remove('show');
      });
    });
  }

  /* ---------------- 腾讯文档实时数据 ---------------- */

  function applyLive(live) {
    if (!live || !live.strips || !live.strips.length) return false;
    if (LIVE && LIVE.syncedAt === live.syncedAt) return false;
    // 防止回退到更旧的快照（例如 raw 不通时退回 Pages 上的旧文件）
    if (LIVE && new Date(live.syncedAt) < new Date(LIVE.syncedAt)) return false;

    LIVE = live;
    STRIPS = live.strips.map(function (s) {
      var o = {};
      for (var k in s) o[k] = s[k];
      var idx = clamp(Math.round((s.dec - DEC0) / STEP), 0, N - 1);
      o.dec = DECS[idx];                 // 对齐到 222 条计划条带的赤纬
      return o;
    });

    if (state.selected && state.selected.type === 'observed') {
      var keep = STRIPS.filter(function (x) { return x.id === state.selected.strip.id; })[0];
      state.selected = keep ? { type: 'observed', strip: keep } : null;
    }
    if (state.hover && state.hover.type === 'observed') state.hover = null;

    buildPaths();
    buildList();
    updateSyncLabel();
    updateInfo();
    schedule();
    return true;
  }

  function updateSyncLabel() {
    var el = document.getElementById('syncInfo');
    if (!el) return;
    if (LIVE) {
      var d = new Date(LIVE.syncedAt);
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var time = pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
                 pad(d.getHours()) + ':' + pad(d.getMinutes());
      var chk = state.checkedAt
        ? (function () {
            var c = new Date(state.checkedAt);
            return pad(c.getHours()) + ':' + pad(c.getMinutes());
          })()
        : '—';
      el.innerHTML = '<i class="dot-live"></i><span>' + t('foot.sync.on') + ' ' + time +
        ' · ' + t('foot.sync.check') + ' ' + chk + '</span>';
    } else {
      el.innerHTML = '<i class="dot-off"></i><span>' + t('foot.sync.none') + '</span>';
    }
  }

  function setSyncText(text, kind) {
    var el = document.getElementById('syncInfo');
    if (!el) return;
    var cls = kind === 'err' ? 'dot-err' : (kind === 'busy' ? 'dot-busy' : 'dot-live');
    el.innerHTML = '<i class="' + cls + '"></i><span>' + text + '</span>';
  }

  function loadLiveNow() {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'js/live.js?t=' + Date.now();
      s.onload = function () {
        applyLive(window.CRAFTS_LIVE);
        if (s.parentNode) s.parentNode.removeChild(s);
        resolve(true);
      };
      s.onerror = function () {
        if (s.parentNode) s.parentNode.removeChild(s);
        resolve(false);
      };
      document.head.appendChild(s);
    });
  }

  /** 点「刷新」：让本地服务去抓腾讯文档，抓完再重新加载数据 */
  function refreshFromDocs() {
    if (state.syncing) return;
    state.syncing = true;
    var btn = document.getElementById('refresh');
    if (btn) btn.classList.add('spin');
    setSyncText(t('sync.syncing'), 'busy');

    var cfg = window.CRAFTS_CONFIG || {};

    // 公网静态版：没有后端，点一下就把最新数据拉下来
    if (cfg.syncEndpoint === null) {
      var before = LIVE && LIVE.syncedAt;
      setSyncText(t('sync.reloading'), 'busy');
      fetchLive().then(function () {
        if (LIVE && LIVE.syncedAt === before) setSyncText(t('sync.uptodate'), 'ok');
        state.syncing = false;
        if (btn) btn.classList.remove('spin');
      });
      return;
    }

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 120000) : null;

    var base = (cfg.syncEndpoint !== undefined)
      ? cfg.syncEndpoint
      : (location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '');
    fetch(base + '/api/sync',
          { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        return loadLiveNow().then(function () {
          if (!res || !res.ok) setSyncText(t('sync.failed'), 'err');
        });
      })
      .catch(function () {
        return loadLiveNow().then(function () {
          setSyncText(t('sync.noServer'), 'err');
        });
      })
      .then(function () {
        if (timer) clearTimeout(timer);
        state.syncing = false;
        if (btn) btn.classList.remove('spin');
      });
  }

  function loadLiveScript() {
    var s = document.createElement('script');
    s.src = 'js/live.js?t=' + Date.now();
    s.onload = function () {
      applyLive(window.CRAFTS_LIVE);
      if (s.parentNode) s.parentNode.removeChild(s);
    };
    s.onerror = function () { if (s.parentNode) s.parentNode.removeChild(s); };
    document.head.appendChild(s);
  }

  function fetchLive() {
    var cfg = window.CRAFTS_CONFIG || {};
    var url = cfg.liveUrl;
    if (!url) {
      return new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = 'js/live.js?t=' + Date.now();
        s.onload = function () {
          applyLive(window.CRAFTS_LIVE);
          state.checkedAt = Date.now();
          updateSyncLabel();
          if (s.parentNode) s.parentNode.removeChild(s);
          resolve(true);
        };
        s.onerror = function () {
          if (s.parentNode) s.parentNode.removeChild(s);
          resolve(false);
        };
        document.head.appendChild(s);
      });
    }
    return fetch(url + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (json) {
        applyLive(json);
        state.checkedAt = Date.now();
        updateSyncLabel();
        return true;
      })
      .catch(function () {
        return new Promise(function (resolve) {
          var s = document.createElement('script');
          s.src = 'js/live.js?t=' + Date.now();
          s.onload = function () {
            applyLive(window.CRAFTS_LIVE);
            if (s.parentNode) s.parentNode.removeChild(s);
            resolve(true);
          };
          s.onerror = function () { if (s.parentNode) s.parentNode.removeChild(s); resolve(false); };
          document.head.appendChild(s);
        });
      });
  }

  function pollLive() { fetchLive(); }

  /* ---------------- UI ---------------- */

  function sortedStrips() {
    return STRIPS.slice().sort(function (a, b) {
      return state.sort === 'asc' ? a.dec - b.dec : b.dec - a.dec;
    });
  }

  function buildList() {
    var ul = $('#striplist');
    ul.innerHTML = sortedStrips().map(function (s) {
      var pct = s.beams ? Math.round(s.done / s.beams * 100) : 0;
      return '<li data-id="' + s.id + '">' +
        '<i class="bar" style="width:' + pct + '%"></i>' +
        '<span class="dot ' + s.status + '"></span>' +
        '<span class="sid">' + s.id + '</span>' +
        '<span class="smeta">' + (s.done + '/' + s.beams) + '</span>' +
        '</li>';
    }).join('');
    Array.prototype.forEach.call(ul.querySelectorAll('li'), function (li) {
      li.addEventListener('click', function () {
        var strip = STRIPS.filter(function (s) { return s.id === li.dataset.id; })[0];
        select({ type: 'observed', strip: strip });
        $('#q').value = strip.id;
      });
    });
    $('#obsCount').textContent = STRIPS.length + ' ' + t('unit.strips');
  }

  function bindUI() {
    var seg = $('#projseg');
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('.seg');
      if (!b || b.classList.contains('active')) return;
      Array.prototype.forEach.call(seg.querySelectorAll('.seg'), function (x) {
        x.classList.toggle('active', x === b);
      });
      state.kind = b.dataset.kind;
      state.selected = null;
      state.hover = null;
      tooltip.classList.remove('show');
      $('#stageTitle').textContent = t(state.kind === 'eq' ? 'stage.eq' : 'stage.gal');
      resetView();
      rebuild();
      updateInfo();
    });

    $('#layers').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      var k = b.dataset.layer;
      state.layers[k] = !state.layers[k];
      b.classList.toggle('on', state.layers[k]);
      state.hover = null;
      tooltip.classList.remove('show');
      schedule();
      updateInfo();
    });

    $('#go').addEventListener('click', runSearch);
    $('#q').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
      if (e.key === 'Escape') { $('#suggest').classList.remove('show'); }
    });
    $('#q').addEventListener('input', function (e) { renderSuggest(e.target.value); });

    $('#refresh').addEventListener('click', refreshFromDocs);

    var sortBox = document.getElementById('sort');
    if (sortBox) {
      sortBox.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-sort]');
        if (!b) return;
        state.sort = b.getAttribute('data-sort');
        Array.prototype.forEach.call(sortBox.querySelectorAll('button'), function (x) {
          x.classList.toggle('active', x === b);
        });
        buildList();
      });
    }
    $('#zoomIn').addEventListener('click', function () { zoomAt(state.W / 2, state.H / 2, 1.45); });
    $('#zoomOut').addEventListener('click', function () { zoomAt(state.W / 2, state.H / 2, 1 / 1.45); });
    $('#reset').addEventListener('click', function () { resetView(); });

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('pointerleave', function () {
      state.hover = null;
      tooltip.classList.remove('show');
      schedule();
      updateInfo();
      $('#coords').textContent = '—';
    });
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', function () { resetView(); });

    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        state.selected = null;
        state.hover = null;
        tooltip.classList.remove('show');
        schedule();
        updateInfo();
      }
    });

    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  }

  var drag = null;

  function localXY(e) {
    var r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function onDown(e) {
    // 点在右上角工具条上时不要开始拖拽/捕获指针，否则按钮收不到 click
    if (e.target.closest && e.target.closest('.toolbar')) return;
    var p = localXY(e);
    drag = { x: p[0], y: p[1], tx: state.view.tx, ty: state.view.ty, moved: false };
    stage.classList.add('dragging');
    if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    var p = localXY(e);
    if (drag) {
      var dx = p[0] - drag.x, dy = p[1] - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      state.view.tx = drag.tx + dx;
      state.view.ty = drag.ty + dy;
      clampView();
      schedule();
      return;
    }
    updateHover(p[0], p[1]);
  }

  function onUp(e) {
    if (!drag) return;
    var moved = drag.moved;
    drag = null;
    stage.classList.remove('dragging');
    if (!moved) {
      var p = localXY(e);
      var b = toBase(p[0], p[1]);
      var hit = pick(b.x, b.y);
      if (hit) select(hit, false);
      else { state.selected = null; schedule(); updateInfo(); }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    var p = localXY(e);
    zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0016));
  }

  function bindLang() {
    var box = document.getElementById('lang');
    if (box) {
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-lang]');
        if (b) window.I18N.set(b.getAttribute('data-lang'));
      });
    }
    document.addEventListener('langchange', function () {
      $('#stageTitle').textContent = t(state.kind === 'eq' ? 'stage.eq' : 'stage.gal');
      $('#obsCount').textContent = STRIPS.length + ' ' + t('unit.strips');
      updateSyncLabel();
      updateInfo();
      if (state.hover) tooltip.innerHTML = tipHTML(state.hover);
      schedule();
    });
  }

  /* ---------------- 启动 ---------------- */

  function resize() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (!w || !h) return;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.W = w;
    state.H = h;
    canvas.width = Math.round(w * state.dpr);
    canvas.height = Math.round(h * state.dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    rebuild();
    schedule();
  }

  setInterval(schedule, 60000);              // 天顶位置每分钟刷新
  pollLive();                                // 启动即取一次，避免先显示旧快照
  setInterval(pollLive, 15000);              // 之后每 15 秒检查一次
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) pollLive();        // 切回标签页立即刷新
  });
  applyLive(window.CRAFTS_LIVE);
  buildList();
  bindUI();
  bindLang();
  window.I18N.apply();
  resize();
  updateInfo();
})();
