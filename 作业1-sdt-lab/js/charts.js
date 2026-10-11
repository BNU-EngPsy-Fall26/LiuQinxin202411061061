/* ============================================================
 * charts.js —— 极简 Canvas 绘图库（无外部依赖）
 * 提供：折线 / 散点 / 面积 / 柱状 / 参考线 / 图例 / 坐标轴
 * ============================================================ */
(function (global) {
  'use strict';

  const SDT = global.SDT || (global.Util && global.Util.SDT);
  const phi = (global.Util && global.Util.phi) ||
    function (z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); };

  /* 图表的调色板：整套是为"炭灰底"配的亮色，和 css/style.css 的
     --bg / --card / --accent 对齐。改成浅色主题时这几个值也要跟着换，
     否则曲线在深底上会糊成一团。 */
  const COLORS = {
    blue: '#5FA8E8', red: '#F2797C', green: '#6ED08C', orange: '#F0A85C',
    gold: '#E3C46A', purple: '#B48CE8', teal: '#73C8B8', grey: '#9BA4AD',
    noise: '#5FA8E8', signal: '#F2797C'
  };

  /* 把 canvas 按 CSS 尺寸 × devicePixelRatio 重置，返回绘图上下文 */
  function prep(cv) {
    const dpr = global.devicePixelRatio || 1;
    let w = cv.clientWidth, h = cv.clientHeight;
    if (!w) w = (cv.parentElement && cv.parentElement.clientWidth) || 640;
    if (!h) h = parseInt(cv.getAttribute('data-h'), 10) || 320;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max) || min === max) return [min];
    const span = max - min;
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm <= 1) step = 1; else if (norm <= 2) step = 2;
    else if (norm <= 2.5) step = 2.5; else if (norm <= 5) step = 5; else step = 10;
    step *= mag;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
      out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    }
    return out;
  }

  function fmtTick(v, f) {
    if (typeof f === 'function') return f(v);
    const n = f === undefined ? (Math.abs(v) < 1 && v !== 0 ? 2 : 1) : f;
    let s = v.toFixed(n);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /**
   * 主绘图函数
   * cfg = {
   *   xDomain:[a,b], yDomain:[a,b], pad:{t,r,b,l},
   *   xLabel, yLabel, xTicks, yTicks, xFormat, yFormat,
   *   bg, grid:true,
   *   bands:[{x0,x1,y0,y1,color}],
   *   hlines:[{y,color,dash,label}], vlines:[{x,color,dash,label,width}],
   *   series:[{type,data,color,width,dash,r,alpha,label,fill,xClip,barWidth}],
   *   legend:false | 'top-left',
   *   font
   * }
   */
  function plot(cv, cfg) {
    const p = prep(cv), ctx = p.ctx, W = p.w, H = p.h;
    const font = cfg.font || '12px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    const pad = Object.assign({ t: 28, r: 20, b: 40, l: 54 }, cfg.pad || {});
    const xd = cfg.xDomain, yd = cfg.yDomain;
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    if (pw <= 10 || ph <= 10) return;
    const X = v => pad.l + (v - xd[0]) / (xd[1] - xd[0]) * pw;
    const Y = v => pad.t + ph - (v - yd[0]) / (yd[1] - yd[0]) * ph;

    ctx.save();
    ctx.font = font;
    ctx.textBaseline = 'middle';

    /* 背景 */
    ctx.fillStyle = cfg.bg || '#333A41';
    ctx.fillRect(pad.l, pad.t, pw, ph);

    /* 色带 */
    (cfg.bands || []).forEach(b => {
      ctx.fillStyle = b.color;
      const x0 = X(b.x0), x1 = X(b.x1 === undefined ? xd[1] : b.x1);
      const y0 = Y(b.y1 === undefined ? yd[1] : b.y1), y1 = Y(b.y0 === undefined ? yd[0] : b.y0);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    });

    /* 网格 + 刻度 */
    const xTicks = cfg.xTicks || niceTicks(xd[0], xd[1], 6);
    const yTicks = cfg.yTicks || niceTicks(yd[0], yd[1], 5);
    ctx.lineWidth = 1;
    ctx.strokeStyle = cfg.gridColor || '#3A4249';
    xTicks.forEach(t => {
      const x = Math.round(X(t)) + 0.5;
      if (x < pad.l - 0.5 || x > W - pad.r + 0.5) return;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
    });
    yTicks.forEach(t => {
      const y = Math.round(Y(t)) + 0.5;
      if (y < pad.t - 0.5 || y > pad.t + ph + 0.5) return;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    });

    /* 数据系列（先画面积/柱，再画线/点） */
    const order = { bars: 0, area: 1, line: 2, points: 3 };
    const series = (cfg.series || []).slice().sort(
      (a, b) => (order[a.type || 'line'] || 9) - (order[b.type || 'line'] || 9));

    series.forEach(s => {
      const color = s.color || COLORS.blue;
      const type = s.type || 'line';
      ctx.save();
      if (s.clipRect) { ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip(); }

      if (type === 'area') {
        const d = s.data;
        if (!d || !d.length) { ctx.restore(); return; }
        const xa = s.xClip ? Math.max(s.xClip[0], xd[0]) : xd[0];
        const xb = s.xClip ? Math.min(s.xClip[1], xd[1]) : xd[1];
        ctx.beginPath();
        let started = false, firstX = null, lastX = null;
        d.forEach(pt => {
          if (pt[0] < xa || pt[0] > xb) return;
          if (!started) { ctx.moveTo(X(pt[0]), Y(0)); firstX = X(pt[0]); started = true; }
          ctx.lineTo(X(pt[0]), Y(pt[1]));
          lastX = X(pt[0]);
        });
        if (started) {
          ctx.lineTo(lastX, Y(0));
          ctx.closePath();
          ctx.globalAlpha = s.alpha === undefined ? 0.22 : s.alpha;
          ctx.fillStyle = color; ctx.fill();
        }
        ctx.restore(); return;
      }

      if (type === 'bars') {
        const d = s.data || [];               // [[x, y], ...] 或 [y,...]
        /* barWidth 一律按"数据单位"给（教师后台三张柱图就是这么传的），
           这里换算成像素。以前直接当像素用，0.3 这种值画出来是一条发丝，
           柱图看着像空的；不传 barWidth 时才退回"按条数均分"的默认值。 */
        const bw = s.barWidth === undefined
          ? (pw / Math.max(1, d.length) * 0.7)
          : s.barWidth * (pw / (xd[1] - xd[0]));
        ctx.globalAlpha = s.alpha === undefined ? 0.9 : s.alpha;
        ctx.fillStyle = color;
        d.forEach((pt, i) => {
          const xv = Array.isArray(pt) ? pt[0] : i;
          const yv = Array.isArray(pt) ? pt[1] : pt;
          const x = X(xv) - bw / 2;
          const y = Y(yv);
          const base = Y(s.base === undefined ? 0 : s.base);
          ctx.fillRect(x, Math.min(y, base), bw, Math.abs(base - y));
        });
        ctx.restore(); return;
      }

      if (type === 'line') {
        const d = s.data;
        if (!d || !d.length) { ctx.restore(); return; }
        ctx.beginPath();
        d.forEach((pt, i) => {
          const x = X(pt[0]), y = Y(pt[1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = s.width || 2;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (s.dash) ctx.setLineDash(s.dash);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore(); return;
      }

      if (type === 'points') {
        const d = s.data;
        ctx.globalAlpha = s.alpha === undefined ? 1 : s.alpha;
        d.forEach(pt => {
          const x = X(pt[0]), y = Y(pt[1]);
          if (x < pad.l - 6 || x > pad.l + pw + 6 || y < pad.t - 6 || y > pad.t + ph + 6) return;
          ctx.beginPath();
          ctx.arc(x, y, s.r || 4, 0, Math.PI * 2);
          if (s.hollow) { ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); }
          else { ctx.fillStyle = s.colorFn ? s.colorFn(pt) : color; ctx.fill(); }
          if (s.ring) { ctx.lineWidth = 1.5; ctx.strokeStyle = '#333A41'; ctx.stroke(); }
        });
        ctx.restore(); return;
      }
      ctx.restore();
    });

    /* 参考线 */
    (cfg.hlines || []).forEach(h => {
      ctx.save();
      ctx.strokeStyle = h.color || '#4A535A';
      ctx.lineWidth = h.width || 1.2;
      if (h.dash) ctx.setLineDash(h.dash);
      ctx.beginPath();
      ctx.moveTo(pad.l, Y(h.y)); ctx.lineTo(pad.l + pw, Y(h.y));
      ctx.stroke();
      if (h.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = h.color || COLORS.grey;
        ctx.font = '11px ' + font.split('px ')[1];
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(h.label, pad.l + 6, Y(h.y) - 3);
      }
      ctx.restore();
    });
    (cfg.vlines || []).forEach(v => {
      ctx.save();
      ctx.strokeStyle = v.color || '#4A535A';
      ctx.lineWidth = v.width || 1.4;
      if (v.dash) ctx.setLineDash(v.dash);
      ctx.beginPath();
      ctx.moveTo(X(v.x), pad.t); ctx.lineTo(X(v.x), pad.t + ph);
      ctx.stroke();
      if (v.label) {
        ctx.setLineDash([]);
        ctx.fillStyle = v.color || COLORS.grey;
        ctx.font = '11px ' + font.split('px ')[1];
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(v.label, X(v.x), pad.t + 3);
      }
      ctx.restore();
    });

    /* 边框 */
    ctx.strokeStyle = '#454E56'; ctx.lineWidth = 1;
    ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, pw - 1, ph - 1);

    /* 刻度文字 */
    ctx.fillStyle = '#9BA4AD';
    ctx.font = '11px ' + font.split('px ')[1];
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    xTicks.forEach(t => {
      const x = X(t);
      if (x < pad.l - 0.5 || x > W - pad.r + 0.5) return;
      ctx.fillText(fmtTick(t, cfg.xFormat), x, pad.t + ph + 7);
    });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    yTicks.forEach(t => {
      const y = Y(t);
      if (y < pad.t - 0.5 || y > pad.t + ph + 0.5) return;
      ctx.fillText(fmtTick(t, cfg.yFormat), pad.l - 8, y);
    });

    /* 轴标题 */
    ctx.fillStyle = '#C3C9CE';
    ctx.font = '12px ' + font.split('px ')[1];
    if (cfg.xLabel) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(cfg.xLabel, pad.l + pw / 2, H - 4);
    }
    if (cfg.yLabel) {
      ctx.save();
      ctx.translate(12, pad.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(cfg.yLabel, 0, 0);
      ctx.restore();
    }

    /* 图例 */
    if (cfg.legend) {
      const items = (cfg.series || []).filter(s => s.label);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '12px ' + font.split('px ')[1];
      let maxw = 0;
      items.forEach(s => { maxw = Math.max(maxw, ctx.measureText(s.label).width); });
      const lw = maxw + 34, lh = items.length * 18 + 10;
      const lx = cfg.legend === 'top-right' ? pad.l + pw - lw - 8 : pad.l + 8;
      const ly = cfg.legend === 'bottom-left' ? pad.t + ph - lh - 8 : pad.t + 8;
      ctx.fillStyle = 'rgba(44,50,55,0.92)';
      ctx.strokeStyle = '#454E56';
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(lx, ly, lw, lh, 8); } else { ctx.rect(lx, ly, lw, lh); }
      ctx.fill(); ctx.stroke();
      items.forEach((s, i) => {
        const y = ly + 14 + i * 18;
        ctx.strokeStyle = s.color || COLORS.blue;
        ctx.lineWidth = s.type === 'points' ? 0 : (s.width || 2);
        if (s.type === 'points') {
          ctx.fillStyle = s.color || COLORS.blue;
          ctx.beginPath(); ctx.arc(lx + 14, y, 4, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.moveTo(lx + 8, y); ctx.lineTo(lx + 22, y); ctx.stroke();
        }
        ctx.fillStyle = '#E2E4E7';
        ctx.fillText(s.label, lx + 28, y);
      });
    }

    ctx.restore();
    return { X, Y, pad, pw, ph };
  }

  /* ---------- 两个正态分布 + 判定标准（专用图） ---------- */
  function distributions(cv, d, c) {
    const xc = SDT.criterionX(d, c);
    const hi = Math.max(4.2, d + 3.6);
    const lo = -4.2;
    const step = (hi - lo) / 260;
    const noise = [], signal = [];
    const peak = Math.max(phi(0), phi(0));
    for (let x = lo; x <= hi + 1e-9; x += step) {
      noise.push([x, phi(x)]);
      signal.push([x, phi(x - d)]);
    }
    return plot(cv, {
      xDomain: [lo, hi], yDomain: [0, peak * 1.32],
      xLabel: '感觉连续体（内部反应强度 x）', yLabel: '概率密度',
      yFormat: 2, xFormat: 1,
      series: [
        { type: 'area', data: noise, color: COLORS.noise, xClip: [xc, hi], alpha: 0.30 },
        { type: 'area', data: signal, color: COLORS.signal, xClip: [xc, hi], alpha: 0.30 },
        { type: 'line', data: noise, color: COLORS.noise, width: 2.2, label: '噪音分布（无信号）' },
        { type: 'line', data: signal, color: COLORS.signal, width: 2.2, label: '信号分布（有信号）' }
      ],
      vlines: [{ x: xc, color: '#73C8B8', width: 2, label: '判定标准 x_c' }],
      legend: true, pad: { t: 34, r: 16, b: 44, l: 52 }
    });
  }

  global.Charts = { prep, plot, distributions, niceTicks, COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
