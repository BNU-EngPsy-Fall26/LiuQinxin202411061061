/* ============================================================
 * util.js —— 统计工具 / 随机数 / 信号检测论公式
 * 无依赖，可在浏览器与 Node 中使用
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 随机数（可复现） ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const RNG = {
    _r: mulberry32((Date.now() ^ 0x9e3779b9) >>> 0),
    seed(s) { this._r = mulberry32(s >>> 0); return this; },
    next() { return this._r(); },
    range(a, b) { return a + (b - a) * this._r(); },
    int(a, b) { return Math.floor(this.range(a, b + 1)); },
    /* 标准正态（Box–Muller，带缓存） */
    _spare: null,
    normal() {
      if (this._spare !== null) { const v = this._spare; this._spare = null; return v; }
      let u = 0, v = 0, s = 0;
      do { u = this._r() * 2 - 1; v = this._r() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      this._spare = v * m;
      return u * m;
    },
    pick(arr) { return arr[Math.floor(this._r() * arr.length)]; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this._r() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  };

  /* ---------- 误差函数与正态分布 ---------- */
  function erf(x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  function Phi(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function phi(z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); }

  /* 正态分位数（Acklam 算法，精度 ~1e-9） */
  function PhiInv(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00];
    const pl = 0.02425;
    let q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= 1 - pl) {
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  /* ---------- 简单数学 ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t, a, b) { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
  function fmt(v, n) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return v.toFixed(n === undefined ? 2 : n);
  }
  function pct(v, n) { return fmt(v * 100, n === undefined ? 1 : n) + '%'; }

  /* ============================================================
   * 信号检测论核心公式（等方差高斯模型）
   *   噪音分布 N(0,1)，信号分布 N(d',1)，判定标准位于 x_c
   *   P(H) = Φ(d'/2 − c)      P(FA) = Φ(−d'/2 − c)      x_c = c + d'/2
   *   d' = z(H) − z(FA)       c = −(z(H)+z(FA))/2       β = e^(d'·c)
   * ============================================================ */
  const SDT = {
    /* 由模型参数生成理论击中/误报率 */
    ratesFromDC(d, c) {
      return { H: Phi(d / 2 - c), FA: Phi(-d / 2 - c) };
    },
    /* 判定标准位置（相对噪音均值的坐标） */
    criterionX(d, c) { return c + d / 2; },
    /* 由经验率反推指标 */
    dprimeFromRates(H, FA) { return PhiInv(H) - PhiInv(FA); },
    cFromRates(H, FA) { return -0.5 * (PhiInv(H) + PhiInv(FA)); },
    betaFromRates(H, FA) {
      const zh = PhiInv(H), zf = PhiInv(FA);
      return Math.exp((zf * zf - zh * zh) / 2);
    },
    betaFromDC(d, c) { return Math.exp(d * c); },
    /* 非参数敏感性 A'（Pollack & Norman） */
    aprime(H, FA) {
      if (H >= FA) {
        return 0.5 + ((H - FA) * (1 + H - FA)) / (4 * Math.max(H, 1e-9) * Math.max(1 - FA, 1e-9));
      }
      return 0.5 - ((FA - H) * (1 + FA - H)) / (4 * Math.max(FA, 1e-9) * Math.max(1 - H, 1e-9));
    },
    /* 等方差 ROC 曲线下面积 */
    aucFromD(d) { return Phi(d / Math.SQRT2); },
    /* 对数线性修正：避免 0 与 1 导致的无穷值（Hautus, 1995） */
    loglinear(h, fa, nS, nN) {
      return { H: (h + 0.5) / (nS + 1), FA: (fa + 0.5) / (nN + 1) };
    },
    /* 最优 β：先验概率与支付矩阵（V 为收益、C 为代价，均取正值大小） */
    betaOpt(PS, VH, CM, CFA, VCR) {
      const PN = 1 - PS;
      if (PS <= 0 || VH + CM <= 0) return Infinity;
      return (PN / PS) * ((VCR + CFA) / (VH + CM));
    },
    /* 由 β 换算 c：β = e^(d'·c) → c = ln β / d' */
    cFromBeta(beta, d) {
      if (!isFinite(beta) || beta <= 0 || d <= 0) return NaN;
      return Math.log(beta) / d;
    }
  };

  const Util = { mulberry32, RNG, erf, Phi, phi, PhiInv, clamp, lerp, smoothstep, fmt, pct, SDT };

  global.Util = Util;
  global.SDT = SDT;
  if (typeof module !== 'undefined' && module.exports) module.exports = Util;
})(typeof window !== 'undefined' ? window : globalThis);
