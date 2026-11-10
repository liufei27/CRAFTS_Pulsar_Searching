/* ------------------------------------------------------------------
 * 天文坐标与投影工具
 *
 *  - 赤道坐标 (RA/Dec, J2000) ↔ 银道坐标 (l/b)
 *  - Mollweide 等面积投影（与 CRAFTS 论文中两张天区图的样式一致）
 *  - 赤道视图：RA 24h 在左、0h 在右，Dec 自下而上增大
 *  - 银道视图：l=0 在正中，l 向两侧到 180
 * ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var D2R = Math.PI / 180;
  var R2D = 180 / Math.PI;

  // J2000 银道坐标系的北极 / 银经零点（经典常数）
  var RA_NGP = 192.85948;
  var DEC_NGP = 27.12825;
  var L_NCP = 122.93192;

  function norm360(a) {
    a = a % 360;
    return a < 0 ? a + 360 : a;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /* 赤道 → 银道 */
  function eq2gal(raDeg, decDeg) {
    var ra = raDeg * D2R, dec = decDeg * D2R;
    var dG = DEC_NGP * D2R, aG = RA_NGP * D2R;
    var sinB = Math.sin(dec) * Math.sin(dG) +
               Math.cos(dec) * Math.cos(dG) * Math.cos(ra - aG);
    var b = Math.asin(clamp(sinB, -1, 1));
    var y = Math.cos(dec) * Math.sin(ra - aG);
    var x = Math.sin(dec) * Math.cos(dG) -
            Math.cos(dec) * Math.sin(dG) * Math.cos(ra - aG);
    var l = (L_NCP * D2R) - Math.atan2(y, x);
    return [norm360(l * R2D), b * R2D];
  }

  /* 银道 → 赤道 */
  function gal2eq(lDeg, bDeg) {
    var l = lDeg * D2R, b = bDeg * D2R;
    var dG = DEC_NGP * D2R, aG = RA_NGP * D2R, lN = L_NCP * D2R;
    var sinDec = Math.sin(b) * Math.sin(dG) +
                 Math.cos(b) * Math.cos(dG) * Math.cos(lN - l);
    var dec = Math.asin(clamp(sinDec, -1, 1));
    var y = Math.cos(b) * Math.sin(lN - l);
    var x = Math.sin(b) * Math.cos(dG) -
            Math.cos(b) * Math.sin(dG) * Math.cos(lN - l);
    var ra = aG + Math.atan2(y, x);
    return [norm360(ra * R2D), dec * R2D];
  }

  /* Mollweide：由银纬求辅助角 θ，满足 2θ + sin2θ = π sin b */
  function mollweideTheta(bRad) {
    var t = bRad;
    for (var i = 0; i < 8; i++) {
      var denom = 2 + 2 * Math.cos(2 * t);
      if (Math.abs(denom) < 1e-9) break;
      t -= (2 * t + Math.sin(2 * t) - Math.PI * Math.sin(bRad)) / denom;
    }
    return t;
  }

  /**
   * 建立投影器
   * @param {'eq'|'gal'} kind
   * @param {number} W 画布宽（CSS px）
   * @param {number} H 画布高（CSS px）
   */
  function createProjection(kind, W, H) {
    var padX = 46, padY = 34;
    var cx = W / 2, cy = H / 2;

    // Mollweide 的椭圆长轴是短轴的 2 倍，取能放下的最大尺寸
    var Xmax = Math.min((W - padX * 2) / 2, H - padY * 2);
    var Ymax = Xmax / 2;
    if (Xmax < 40) Xmax = 40;

    var proj = {
      kind: kind,
      W: W,
      H: H,
      cx: cx,
      cy: cy,
      Xmax: Xmax,
      Ymax: Ymax,

      /** 天球坐标 → 画布像素 */
      project: function (raDeg, decDeg) {
        var lam, bRad;
        if (kind === 'eq') {
          lam = (180 - raDeg) * D2R;          // RA 24h 在左、0h 在右
          bRad = decDeg * D2R;
        } else {
          var g = eq2gal(raDeg, decDeg);
          var l = ((g[0] + 180) % 360) - 180; // l=0 居中
          lam = -l * D2R;                     // 银经向左增大（与参考图一致）
          bRad = g[1] * D2R;
        }
        var th = mollweideTheta(bRad);
        return [
          cx + (lam / Math.PI) * Math.cos(th) * Xmax,
          cy - Math.sin(th) * Ymax
        ];
      },

      /** 画布像素 → 天球坐标；椭圆外返回 null */
      unproject: function (x, y) {
        var dy = (cy - y) / Ymax;
        if (dy < -1 || dy > 1) return null;
        var th = Math.asin(clamp(dy, -1, 1));
        var b = Math.asin(clamp((2 * th + Math.sin(2 * th)) / Math.PI, -1, 1));
        var cosTh = Math.cos(th);
        var lam = Math.abs(cosTh) < 1e-6
          ? 0
          : ((x - cx) / (Xmax * cosTh)) * Math.PI;
        if (lam < -Math.PI - 1e-6 || lam > Math.PI + 1e-6) return null;

        if (kind === 'eq') {
          var ra = norm360(180 - lam * R2D);
          return { ra: ra, dec: b * R2D };
        }
        var l = norm360(-lam * R2D);
        var eq = gal2eq(l, b * R2D);
        return { ra: eq[0], dec: eq[1] };
      },

      /** 投影边界上某纬度对应的点（side: 'left' | 'right'），用于把刻度放到天球外 */
      edge: function (latDeg, side) {
        var th = mollweideTheta(latDeg * D2R);
        var sign = side === 'left' ? -1 : 1;
        return [cx + sign * Math.cos(th) * Xmax, cy - Math.sin(th) * Ymax];
      },

      /** Mollweide 投影的边界椭圆（用于画外框） */
      outline: function () {
        var pts = [], i, th;
        for (i = 0; i <= 120; i++) {
          th = -Math.PI / 2 + Math.PI * i / 120;
          pts.push([cx + Xmax * Math.cos(th), cy - Ymax * Math.sin(th)]);
        }
        for (i = 120; i >= 0; i--) {
          th = -Math.PI / 2 + Math.PI * i / 120;
          pts.push([cx - Xmax * Math.cos(th), cy - Ymax * Math.sin(th)]);
        }
        return pts;
      }
    };
    return proj;
  }

  global.Astro = {
    D2R: D2R,
    R2D: R2D,
    norm360: norm360,
    clamp: clamp,
    eq2gal: eq2gal,
    gal2eq: gal2eq,
    createProjection: createProjection
  };
})(window);
