/* ============================================================
 * games.js —— 四个角色游戏（采蘑菇 / 鉴假员 / 观鸟 / 质检员）+ 实验引擎
 *
 *   页面上的顺序 = RoleList 的顺序（见文件末尾），四关的最优标准连成一条刻度：
 *     采蘑菇  c* = −0.78   漏报代价极大（吃错菇会中毒）→ 很宽松
 *     鉴假员  c* = +0.70   虚报代价极大（砸碎真品）    → 很谨慎
 *     观鸟    c* =  0.00   两边代价都不大，先验与代价相互抵消 → 中立，因人而异
 *     质检员  c* = +0.07   近中立，但真正考的是长时间无信号下 d′ 会不会掉
 *   （渲染器函数本身在文件里仍按 采蘑菇→观鸟→鉴假员→质检员 排列，
 *     与页面顺序无关，不要被小节编号误导。）
 *
 * 设计说明
 *   每一次尝试都有一个"潜在强度" x：
 *       信号试次  x ~ N(d', 1)      噪音试次  x ~ N(0, 1)
 *   画面完全由 x 通过一个单调映射生成（四个游戏都是单通道单调映射），
 *   所以"理想观察者"在视觉量上做阈值判断时，其 d' 恰好等于设定的 d'。
 *   被试真正的困难来自两点：分布在中间重叠，以及判定标准放在哪里。
 * ============================================================ */
(function (global) {
  'use strict';

  const U = Util, SDT = Util.SDT;
  const clamp = U.clamp, lerp = U.lerp, smooth = U.smoothstep;

  /* 图鉴模式：把可疑目标放大、居中，叶子更少更大——底部那条图鉴带很矮，
     按正常比例画的话小鸟只有十几像素，等于没有参考价值。 */
  let GUIDE_FOCUS = false;

  /* "打击点"的归一化坐标（由鉴假员的渲染器写下来）。
     引擎在抡锤动画里要用它把锤子砸到"你刚才判定的那件器物"上。 */
  let HIT_ANCHOR = { x: 0.5, y: 0.5 };

  /* 砸碎动画：SMASH 非 null 时，鉴假员的渲染器把整器画成飞散的碎片。
     这一条是"渲染器 → 引擎"的唯一反向通道，所以只在主画面里生效，
     图鉴条带里永远画整器。 */
  let SMASH = null;
  const SMASH_MS = 760;                   // 抡锤动画时长
  const SMASH_HIT = 0.28;                 // 锤子在这一刻命中（归一化时间）

  /* ============================================================
   * 音效：用 Web Audio 现场合成，不加载任何外部文件
   *   —— 碎裂 = 一声闷响（锤子砸中）+ 高频噪声爆（瓷片炸开）+ 几记清脆的落地声
   *   浏览器要求音频必须由用户操作触发；砸碎本身就是点按钮/敲键，所以没问题。
   * ============================================================ */
  const Sound = {
    MUTE_KEY: 'sdtlab.muted.v1',
    muted: false,
    ctx: null,
    load() {
      try { this.muted = global.localStorage.getItem(this.MUTE_KEY) === '1'; }
      catch (e) { this.muted = false; }
      return this.muted;
    },
    setMuted(m) {
      this.muted = !!m;
      try { global.localStorage.setItem(this.MUTE_KEY, m ? '1' : '0'); } catch (e) { }
      return this.muted;
    },
    /* 瓷器碎裂。correct 只影响"炸开"那一下的音色，不影响音量——
       声音不能泄漏答案。 */
    smashSound(correct) {
      if (this.muted) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        if (!this.ctx) this.ctx = new AC();
        const ac = this.ctx;
        if (ac.state === 'suspended') ac.resume();
        const now = ac.currentTime;

        /* 一、闷响：锤子砸在器物上的那一下 */
        const thud = ac.createOscillator();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(190, now);
        thud.frequency.exponentialRampToValueAtTime(52, now + 0.13);
        const gt = ac.createGain();
        gt.gain.setValueAtTime(0.0001, now);
        gt.gain.exponentialRampToValueAtTime(0.42, now + 0.006);
        gt.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);
        thud.connect(gt); gt.connect(ac.destination);
        thud.start(now); thud.stop(now + 0.18);

        /* 二、瓷片炸开：一段高频噪声，音头极快、衰减略长，用高通滤出"脆" */
        const dur = 0.42;
        const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          const tt = i / ac.sampleRate;
          /* 叠几个短促的包络，听起来像"哗啦"而不是"嘶——" */
          const env = Math.pow(1 - tt / dur, 2.2) * (0.62 + 0.38 * Math.cos(tt * 74));
          d[i] = (Math.random() * 2 - 1) * env;
        }
        const src = ac.createBufferSource(); src.buffer = buf;
        const hp = ac.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = correct ? 900 : 1500;
        const g1 = ac.createGain(); g1.gain.value = 0.26;
        src.connect(hp); hp.connect(g1); g1.connect(ac.destination);
        src.start(now + 0.004);

        /* 三、几记清脆的落地声：瓷片砸在台面上的小"叮" */
        const pins = [0.055, 0.13, 0.26, 0.38];
        for (let i = 0; i < pins.length; i++) {
          const t0 = now + pins[i];
          const o = ac.createOscillator();
          o.type = 'triangle';
          o.frequency.value = 1750 + (i % 3) * 640;
          const g = ac.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.07 - i * 0.012, t0 + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0002, t0 + 0.09);
          o.connect(g); g.connect(ac.destination);
          o.start(t0); o.stop(t0 + 0.1);
        }
      } catch (e) { /* 音频不可用就当没这回事，画面效果照常 */ }
    }
  };

  /* ---------- 颜色小工具 ---------- */
  const hsl = (h, s, l, a) =>
    'hsla(' + ((h % 360) + 360) % 360 + ',' + clamp(s, 0, 100) + '%,' + clamp(l, 0, 100) + '%,' + (a === undefined ? 1 : a) + ')';

  /* ============================================================
   * 一、采蘑菇
   *   线索：菌盖色相 / 斑点数量 / 菌褶颜色 / 菌环菌托 —— 全部由 t 单调决定
   * ============================================================ */
  function drawMushroom(ctx, w, h, x, rnd) {
    const t = clamp((x + 3.4) / 6.8, 0, 1);
    const S = Math.min(w, h * 1.15);

    /* --- 背景：林地 --- */
    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a5c37'); g.addColorStop(0.55, '#2f3d24'); g.addColorStop(1, '#1b2416');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 18; i++) {                       // 林间光斑
      const bx = rnd() * w, by = rnd() * h * 0.8, br = 16 + rnd() * 54;
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, 'rgba(214,232,168,0.11)');
      rg.addColorStop(1, 'rgba(214,232,168,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();
    }

    /* --- 地面 --- */
    ctx.fillStyle = '#243019';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.88);
    ctx.quadraticCurveTo(w * 0.5, h * 0.83, w, h * 0.9);
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();

    /* --- 草丛与落叶（无信息） --- */
    for (let i = 0; i < 90; i++) {
      const gx = rnd() * w, gy = h * (0.86 + rnd() * 0.15);
      const gh = 6 + rnd() * 26;
      ctx.strokeStyle = hsl(78 + rnd() * 40, 30 + rnd() * 25, 18 + rnd() * 22, 0.85);
      ctx.lineWidth = 1 + rnd() * 1.6;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + (rnd() - 0.5) * 14, gy - gh * 0.6, gx + (rnd() - 0.5) * 22, gy - gh);
      ctx.stroke();
    }

    /* --- 蘑菇本体 --- */
    const cx = w * (0.42 + rnd() * 0.16);
    const baseY = h * (0.87 + rnd() * 0.04);
    const capRx = S * (0.20 + rnd() * 0.045);
    const capRy = capRx * (0.60 + rnd() * 0.10);
    const stemH = S * (0.42 + rnd() * 0.10);
    const stemW = capRx * (0.34 + rnd() * 0.07);
    const cy = baseY - stemH;

    /* 菌柄 */
    let gs = ctx.createLinearGradient(cx - stemW, 0, cx + stemW, 0);
    const stemLight = lerp(90, 76, t);
    gs.addColorStop(0, hsl(44, lerp(20, 14, t), stemLight - 12));
    gs.addColorStop(0.35, hsl(44, lerp(18, 12, t), stemLight));
    gs.addColorStop(1, hsl(44, lerp(22, 16, t), stemLight - 18));
    ctx.fillStyle = gs;
    ctx.beginPath();
    ctx.moveTo(cx - stemW * 0.58, baseY);
    ctx.bezierCurveTo(cx - stemW * 0.85, baseY - stemH * 0.35, cx - stemW * 0.44, baseY - stemH * 0.7, cx - stemW * 0.40, cy);
    ctx.lineTo(cx + stemW * 0.40, cy);
    ctx.bezierCurveTo(cx + stemW * 0.44, baseY - stemH * 0.7, cx + stemW * 0.85, baseY - stemH * 0.35, cx + stemW * 0.58, baseY);
    ctx.closePath(); ctx.fill();

    /* 菌托（剧毒特征） */
    if (t > 0.52) {
      const a = smooth(t, 0.52, 0.8);
      ctx.save(); ctx.globalAlpha = a * 0.95;
      ctx.fillStyle = hsl(40, 24, 62);
      ctx.beginPath();
      ctx.ellipse(cx, baseY - stemH * 0.06, stemW * 1.5, stemH * 0.16, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /* 菌环（毒环） */
    if (t > 0.38) {
      const a = smooth(t, 0.38, 0.72);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = hsl(42, 20, 84);
      ctx.beginPath();
      ctx.ellipse(cx, cy + stemH * 0.30, stemW * 0.82, stemH * 0.075, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /* 菌褶 */
    const gillL = lerp(84, 22, t);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, capRx * 1.0, capRx * 0.135, 0, 0, 6.2832);
    ctx.fillStyle = hsl(42, lerp(30, 40, t), gillL);
    ctx.fill();
    ctx.clip();
    for (let i = -22; i <= 22; i++) {
      ctx.strokeStyle = hsl(40, lerp(26, 34, t), gillL - 12, 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + i * capRx * 0.045, cy - capRx * 0.16);
      ctx.lineTo(cx + i * capRx * 0.05, cy + capRx * 0.16);
      ctx.stroke();
    }
    ctx.restore();

    /* 菌盖 */
    const hue = lerp(40, 302, t);
    const sat = lerp(38, 70, t);
    const lig = lerp(61, 43, t);
    let gc = ctx.createLinearGradient(cx - capRx * 0.6, cy - capRy * 1.5, cx + capRx * 0.6, cy);
    gc.addColorStop(0, hsl(hue, sat * 0.86, lig + 14));
    gc.addColorStop(0.55, hsl(hue, sat, lig));
    gc.addColorStop(1, hsl(hue, sat * 1.08, lig - 15));
    ctx.fillStyle = gc;
    ctx.beginPath();
    ctx.moveTo(cx - capRx, cy);
    ctx.bezierCurveTo(cx - capRx, cy - capRy * 1.58, cx + capRx, cy - capRy * 1.58, cx + capRx, cy);
    ctx.closePath();
    ctx.fill();

    /* 菌盖边缘阴影 */
    ctx.strokeStyle = hsl(hue, sat * 1.1, lig - 22, 0.8);
    ctx.lineWidth = Math.max(1.2, capRx * 0.02);
    ctx.stroke();

    /* 白色斑点 */
    const nSpots = Math.round(t * 10 * (0.9 + rnd() * 0.25));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - capRx, cy);
    ctx.bezierCurveTo(cx - capRx, cy - capRy * 1.58, cx + capRx, cy - capRy * 1.58, cx + capRx, cy);
    ctx.closePath(); ctx.clip();
    for (let i = 0; i < nSpots; i++) {
      const u = rnd() * 1.66 - 0.83;
      const top = Math.sqrt(Math.max(0, 1 - u * u));
      const px = cx + u * capRx * (0.94 + rnd() * 0.1);
      const py = cy - rnd() * top * capRy * 1.35;
      ctx.fillStyle = hsl(45, 26, 94, 0.62 + rnd() * 0.3);
      ctx.beginPath();
      ctx.ellipse(px, py, capRx * (0.05 + rnd() * 0.055), capRx * (0.035 + rnd() * 0.035), 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();

    /* 高光 */
    const hl = ctx.createRadialGradient(cx - capRx * 0.35, cy - capRy * 1.0, 0, cx - capRx * 0.35, cy - capRy * 1.0, capRx * 0.85);
    hl.addColorStop(0, 'rgba(255,255,255,0.22)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.moveTo(cx - capRx, cy);
    ctx.bezierCurveTo(cx - capRx, cy - capRy * 1.58, cx + capRx, cy - capRy * 1.58, cx + capRx, cy);
    ctx.closePath(); ctx.fill();

    /* 暗角 */
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }

  /* ============================================================
   * 二、观鸟
   *   线索：树冠里那个"可疑轮廓"的鸟形程度 + 羽毛色偏离叶绿的程度 —— 由 t 单调决定
   * ============================================================ */
  function leafPath(ctx, x, y, r, rot, fill, alpha) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha = alpha; ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(0, -r * 0.62, r, 0);
    ctx.quadraticCurveTo(0, r * 0.62, -r, 0);
    ctx.fill();
    ctx.restore();
  }

  function drawBird(ctx, w, h, x, rnd) {
    const t = clamp((x + 3.4) / 6.8, 0, 1);

    /* --- 树冠背景 --- */
    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#93b45c'); g.addColorStop(0.4, '#5d7f36'); g.addColorStop(1, '#22331a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    /* 叶子半径按画布大小缩放（设计基准 900×506），否则小画布上叶子会挤满整帧 */
    const kF = Math.max(0.2, Math.min(w, h) / 506) * (GUIDE_FOCUS ? 2.6 : 1);

    for (let i = 0; i < 20; i++) {                       // 叶隙光斑
      const bx = rnd() * w, by = rnd() * h * 0.7, br = (20 + rnd() * 60) * kF;
      const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, 'rgba(238,250,190,0.13)');
      rg.addColorStop(1, 'rgba(238,250,190,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, 6.2832); ctx.fill();
    }

    const drawFoliage = (count, rMin, rMax, alpha, lMin, lMax) => {
      for (let i = 0; i < count; i++) {
        const lx = rnd() * w, ly = rnd() * h;
        const r = (rMin + rnd() * (rMax - rMin)) * kF;
        leafPath(ctx, lx, ly, r, rnd() * 6.2832,
          hsl(76 + rnd() * 62, 26 + rnd() * 34, lMin + rnd() * (lMax - lMin)),
          alpha * (0.7 + rnd() * 0.3));
      }
    };
    drawFoliage(GUIDE_FOCUS ? 22 : 70, 16, 34, 0.55, 12, 30);     // 远景叶
    drawFoliage(GUIDE_FOCUS ? 34 : 110, 9, 22, 0.95, 16, 46);      // 中景叶

    /* --- 可疑轮廓 --- */
    const ox = w * (GUIDE_FOCUS ? 0.5 : 0.14 + rnd() * 0.72);
    const oy = h * (GUIDE_FOCUS ? 0.56 : 0.24 + rnd() * 0.52);
    const s = Math.min(w, h) * (GUIDE_FOCUS ? 0.24 : 0.072 + rnd() * 0.016);
    const dir = rnd() < 0.5 ? 1 : -1;
    const bodyA = smooth(t, 0.32, 0.68);       // 光滑鸟身的不透明度
    const beakA = smooth(t, 0.42, 0.78);
    const hue = lerp(96, 26, t), sat = lerp(36, 30, t), lig = lerp(33, 39, t);
    const bodyCol = hsl(hue, sat, lig);
    const darkCol = hsl(hue, sat * 1.1, lig - 14);

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(dir * s, s);

    /* 尾羽 */
    const tailLen = 0.55 + 1.05 * t;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = darkCol;
    ctx.beginPath();
    ctx.moveTo(-0.95, -0.18); ctx.lineTo(-0.95 - tailLen, -0.42); ctx.lineTo(-0.9, 0.12);
    ctx.closePath(); ctx.fill();

    /* 腿 */
    ctx.strokeStyle = hsl(hue, sat * 0.8, lig - 22);
    ctx.lineWidth = 0.085;
    ctx.beginPath();
    ctx.moveTo(-0.25, 0.6); ctx.lineTo(-0.28, 1.05);
    ctx.moveTo(0.32, 0.6); ctx.lineTo(0.36, 1.05);
    ctx.stroke();

    /* 叶簇形态（低鸟形程度时占主导） */
    if (bodyA < 1) {
      ctx.globalAlpha = (1 - bodyA) * 0.98;
      const cols = [bodyCol, darkCol, hsl(hue, sat * 0.9, lig + 8)];
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(i * 0.42 - 0.7, i * 0.13 - 0.2);
        ctx.rotate(i * 1.1 + 0.4);
        ctx.fillStyle = cols[i % 3];
        ctx.beginPath();
        ctx.moveTo(-1.05, 0);
        ctx.quadraticCurveTo(0, -0.52, 1.05, 0);
        ctx.quadraticCurveTo(0, 0.52, -1.05, 0);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    /* 光滑鸟身 */
    const headR = 0.42 + 0.2 * t;
    const headX = 0.92 + 0.1 * t, headY = -0.62 - 0.08 * t;
    if (bodyA > 0) {
      const edgeA = smooth(t, 0.45, 0.9);            // 轮廓清晰度

      ctx.globalAlpha = bodyA;
      /* 身体 */
      ctx.fillStyle = bodyCol;
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.18, 0.72, -0.12, 0, 6.2832);
      ctx.fill();
      /* 颈 + 头 */
      ctx.beginPath();
      ctx.moveTo(0.52, -0.42); ctx.lineTo(headX - headR * 0.5, headY + headR * 0.5);
      ctx.lineTo(headX + headR * 0.2, headY + headR * 0.95); ctx.lineTo(0.7, 0.15);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(headX, headY, headR, 0, 6.2832); ctx.fill();
      /* 翅 */
      ctx.fillStyle = darkCol;
      ctx.beginPath();
      ctx.ellipse(-0.15, 0.08, 0.74, 0.4, -0.38, 0, 6.2832);
      ctx.fill();
      /* 轮廓线：d′ 高时明显勾出鸟形 */
      if (edgeA > 0) {
        ctx.globalAlpha = bodyA * edgeA * 0.75;
        ctx.strokeStyle = hsl(hue, sat * 1.2, lig - 20);
        ctx.lineWidth = 0.07;
        ctx.beginPath();
        ctx.ellipse(0, 0, 1.18, 0.72, -0.12, 0, 6.2832);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(headX, headY, headR, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = bodyA;
      }
      /* 眼睛（带白色眼环） */
      const eyeA = bodyA * smooth(t, 0.4, 0.75);
      if (eyeA > 0) {
        ctx.globalAlpha = eyeA;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(headX + 0.16, headY - 0.12, 0.15, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#17110b';
        ctx.beginPath(); ctx.arc(headX + 0.16, headY - 0.12, 0.095, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = bodyA;
      }
    }

    /* 喙（鸟类的关键线索） */
    if (beakA > 0) {
      const bx0 = headX + headR * 0.55, by0 = headY - 0.02;
      ctx.globalAlpha = beakA;
      ctx.fillStyle = hsl(lerp(52, 34, t), 64, lerp(74, 56, t));
      ctx.beginPath();
      ctx.moveTo(bx0, by0 - 0.2);
      ctx.lineTo(bx0 + 0.25 + 0.65 * t, by0);
      ctx.lineTo(bx0, by0 + 0.2);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    /* --- 前景遮挡叶 --- */
    const nOcc = Math.round(lerp(7.5, 1.0, t) * (0.6 + rnd() * 0.8) * (GUIDE_FOCUS ? 0.35 : 1));
    for (let i = 0; i < nOcc; i++) {
      const ang = rnd() * 6.2832, rad = s * (0.4 + rnd() * 2.4);
      leafPath(ctx, ox + Math.cos(ang) * rad, oy + Math.sin(ang) * rad,
        s * (0.75 + rnd() * 1.1), rnd() * 6.2832,
        hsl(78 + rnd() * 52, 30 + rnd() * 30, 18 + rnd() * 30), 0.96);
    }

    /* --- 前景树叶（散在画面各处，制造搜索负担） --- */
    drawFoliage(GUIDE_FOCUS ? 18 : 60, 20, 46, 0.98, 14, 34);

    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.36)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }

  /* ============================================================
   * 三、鉴假员（古董鉴定）：信号 = 赝品
   *   破绽是一组随 t 单调增强的线索，t 低时全部不出现，那就是一件手绘的真品：
   *     纹样：手绘的笔笔不同  →  贴花印上去的一模一样地重复
   *     釉面：多出一道笔直的合模缝（上下两半模具对合留下的）
   *     底足：磕掉釉、露出崭新的现代白瓷茬（最响的一条）
   *     贼光：现代釉面那种又亮又硬的条形反光
   *   t≈0.5 是噪音分布的中心，所以四条线索的起点都在它之后——常见的真品
   *   应当是一条破绽都没有的，只有嫌疑很大的那几件才会陆续显形。
   *
   *   注意：所有与 t 无关的随机取值（位置、大小、朝向）都放在前面算完，
   *   并且不依赖 t——这样图鉴左右两格用同一个种子时，除了"信号"以外
   *   的一切都完全一致。
   * ============================================================ */

  /* 器物侧影：(u, 半宽) 控制点，u=0 是底足、u=1 是瓶口。
     用 Catmull-Rom 插值成光滑曲线，左右对称。 */
  const VASE_PROF = [
    [0.00, 0.185], [0.05, 0.215], [0.20, 0.315], [0.42, 0.325],
    [0.62, 0.275], [0.76, 0.150], [0.88, 0.140], [0.95, 0.180], [1.00, 0.190]
  ];
  function vaseHalf(u) {
    const n = VASE_PROF.length;
    let i = 0;
    while (i < n - 2 && VASE_PROF[i + 1][0] < u) i++;
    const p0 = VASE_PROF[Math.max(0, i - 1)], p1 = VASE_PROF[i];
    const p2 = VASE_PROF[Math.min(n - 1, i + 1)], p3 = VASE_PROF[Math.min(n - 1, i + 2)];
    const k = (u - p1[0]) / Math.max(1e-6, p2[0] - p1[0]);
    const k2 = k * k, k3 = k2 * k;
    return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * k +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * k2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * k3);
  }
  function vasePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(vaseHalf(0), 0);
    for (let i = 1; i <= 40; i++) { const u = i / 40; ctx.lineTo(vaseHalf(u), -u); }
    for (let i = 39; i >= 0; i--) { const u = i / 40; ctx.lineTo(-vaseHalf(u), -u); }
    ctx.closePath();
  }

  /* 一朵青花"缠枝花"：五瓣 + 花心。位置/大小/角度一样 → 看着就像贴花印的 */
  function blueMotif(ctx, cx, cy, r, rot, alpha) {
    if (alpha <= 0.003) return;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#2a5296';
    for (let k = 0; k < 5; k++) {
      ctx.save(); ctx.rotate(k / 5 * 6.2832);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.62, -r * 0.40, 0, -r);
      ctx.quadraticCurveTo(-r * 0.62, -r * 0.40, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#1d3d78';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.30, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  /* 碎片：从器物上炸开、旋转、落到台面上。用 x 当种子，所以逐帧稳定 */
  function drawShards(ctx, ox, baseY, s, x, u) {
    const r2 = U.mulberry32(Math.round((x + 20) * 977) + 13);
    const N = 16;
    ctx.save();
    ctx.translate(ox, baseY);
    ctx.scale(s, s);
    for (let i = 0; i < N; i++) {
      /* 随机数一次取完：即使这一片不画，也不会打乱后面的序列 */
      const a0 = r2() * 6.2832;
      const u0 = 0.10 + r2() * 0.74;              // 原本长在器物的哪一段
      const w0 = 0.030 + r2() * 0.085;
      const h0 = 0.030 + r2() * 0.088;
      const rot0 = r2() * 6.2832;
      const spin = (r2() - 0.5) * 10;
      const vx = Math.cos(a0) * (0.35 + r2() * 0.75);
      const vy = -0.35 - r2() * 1.05;
      const uLand = 0.52 + r2() * 0.36;           // 各自落地的时间
      const sh = r2();
      const j1 = r2(), j2 = r2(), j3 = r2(), j4 = r2();

      const ue = Math.min(u, uLand);              // 落地后就停在台面上
      const px = Math.cos(a0) * 0.14 + vx * ue;
      const py = Math.min(-0.02, -u0 + vy * ue + 2.4 * ue * ue);
      const alpha = 1 - smooth(u, 0.60, 1.0);
      if (alpha <= 0.012) continue;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(rot0 + spin * ue);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = sh < 0.34 ? '#cbc5b1' : (sh < 0.78 ? '#f2eee0' : '#fffdf6');
      ctx.strokeStyle = 'rgba(52,46,34,0.45)';
      ctx.lineWidth = 0.006;
      ctx.beginPath();
      if (i % 3 === 0) {                                 // 隔几片来一个小尖片
        ctx.moveTo(-w0 * 0.8, h0);
        ctx.lineTo(w0 * (0.8 + j1 * 0.4), h0 * (0.5 + j2 * 0.6));
        ctx.lineTo(-w0 * 0.2, -h0 * (0.9 + j3 * 0.3));
      } else {
        ctx.moveTo(-w0 + j1 * 0.02, -h0);
        ctx.lineTo(w0, -h0 * (0.5 + j2 * 0.5));
        ctx.lineTo(w0 * (0.6 + j3 * 0.5), h0);
        ctx.lineTo(-w0, h0 * (0.4 + j4 * 0.6));
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      /* 有几片还带着釉上的青花：一眼就能看出这是"碎掉的瓷器"而不是白纸片 */
      if (sh >= 0.34 && sh < 0.62) {
        ctx.strokeStyle = 'rgba(42,82,150,0.7)';
        ctx.lineWidth = Math.max(0.004, h0 * 0.42);
        ctx.beginPath();
        ctx.moveTo(-w0 * 0.7, -h0 * 0.12);
        ctx.lineTo(w0 * 0.7, -h0 * 0.12);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawAntique(ctx, w, h, x, rnd) {
    const t = clamp((x + 3.4) / 6.8, 0, 1);

    /* ---------- 器物在台面上的位置与尺寸（先算出来：聚光灯要跟着它走） ---------- */
    const s = GUIDE_FOCUS
      ? Math.min(w, h) * 0.60
      : Math.min(w, h) * (0.50 + rnd() * 0.07);            // 器物的高度（像素）
    const ox = w * (GUIDE_FOCUS ? 0.5 : 0.28 + rnd() * 0.44);
    const TBLY = h * (GUIDE_FOCUS ? 0.76 : 0.70 + rnd() * 0.04);   // 台面高度
    const dir = rnd() < 0.5 ? 1 : -1;                      // 消耗同一个随机数，两格才不会错位

    /* ---------- 背景：预展室的墙 ---------- */
    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3a2b20'); g.addColorStop(0.55, '#2a1f18'); g.addColorStop(1, '#160f0b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    /* 墙上的展架：几件模糊的藏品，交代"这是个鉴定现场" */
    const nShelf = GUIDE_FOCUS ? 1 : 2;
    for (let i = 0; i < nShelf; i++) {
      const sy = h * (0.15 + i * 0.20);
      ctx.fillStyle = 'rgba(74,55,38,0.9)';
      ctx.fillRect(0, sy, w, Math.max(2, h * 0.012));
      const nIt = 3 + Math.floor(rnd() * 3);
      for (let j = 0; j < nIt; j++) {
        const ix = rnd() * w, iw = h * (0.04 + rnd() * 0.06), ih = h * (0.05 + rnd() * 0.09);
        ctx.fillStyle = 'rgba(26,20,16,' + (0.45 + rnd() * 0.4) + ')';
        ctx.beginPath();
        ctx.ellipse(ix, sy - ih * 0.45, iw * 0.5, ih * 0.5, 0, 0, 6.2832);
        ctx.fill();
      }
    }

    /* ---------- 聚光灯：从顶上打下来，跟着器物走 ---------- */
    /* 叠几层由宽到窄、由淡到浓的三角，把光锥的边缘化软一点 */
    for (let k = 4; k >= 0; k--) {
      const wf = 1 - k * 0.15, aa = 0.020 + k * 0.007;
      ctx.fillStyle = 'rgba(255,232,190,' + aa + ')';
      ctx.beginPath();
      ctx.moveTo(ox - w * 0.035 * wf, 0);
      ctx.lineTo(ox + w * 0.035 * wf, 0);
      ctx.lineTo(ox + w * 0.30 * wf, TBLY);
      ctx.lineTo(ox - w * 0.30 * wf, TBLY);
      ctx.closePath(); ctx.fill();
    }
    const pg = ctx.createRadialGradient(ox, TBLY, 0, ox, TBLY, w * 0.26);
    pg.addColorStop(0, 'rgba(255,228,178,0.22)');
    pg.addColorStop(1, 'rgba(255,222,172,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(ox, TBLY, w * 0.26, h * 0.075, 0, 0, 6.2832); ctx.fill();

    /* ---------- 木质台面 ---------- */
    const tg = ctx.createLinearGradient(0, TBLY, 0, h);
    tg.addColorStop(0, '#6b4a2c'); tg.addColorStop(0.14, '#513722'); tg.addColorStop(1, '#281a10');
    ctx.fillStyle = tg; ctx.fillRect(0, TBLY, w, h - TBLY);
    ctx.strokeStyle = 'rgba(255,216,164,0.24)';
    ctx.lineWidth = Math.max(1, h * 0.004);
    ctx.beginPath(); ctx.moveTo(0, TBLY); ctx.lineTo(w, TBLY); ctx.stroke();
    ctx.strokeStyle = 'rgba(24,14,8,0.32)';
    for (let i = 0; i < 4; i++) {                          // 木纹
      const gy = TBLY + (h - TBLY) * (0.18 + i * 0.22) + (rnd() - 0.5) * h * 0.02;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    /* ---------- 台上的两件道具（与信号无关，纯语境） ---------- */
    const propX = ox < w * 0.5 ? w * 0.80 : w * 0.20;
    const propY = TBLY + (h - TBLY) * 0.60;
    ctx.save();                                            // 放大镜
    ctx.translate(propX, propY); ctx.rotate(dir * 0.26);
    ctx.fillStyle = 'rgba(198,224,238,0.20)';
    ctx.beginPath(); ctx.arc(0, 0, h * 0.072, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(198,208,216,0.92)';
    ctx.lineWidth = Math.max(2, h * 0.014);
    ctx.beginPath(); ctx.arc(0, 0, h * 0.072, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = '#7d5330';
    ctx.lineWidth = Math.max(3, h * 0.020); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, h * 0.072); ctx.lineTo(-dir * h * 0.018, h * 0.185); ctx.stroke();
    ctx.restore();
    ctx.save();                                            // 一张出库单
    ctx.translate(propX - (propX > w * 0.5 ? 1 : -1) * w * 0.11, propY + h * 0.045);
    ctx.rotate(-0.14 * dir);
    ctx.fillStyle = 'rgba(238,230,208,0.92)';
    ctx.fillRect(-h * 0.055, -h * 0.038, h * 0.11, h * 0.076);
    ctx.strokeStyle = 'rgba(126,108,82,0.55)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-h * 0.042, -h * 0.024 + i * h * 0.019);
      ctx.lineTo(h * 0.042, -h * 0.024 + i * h * 0.019);
      ctx.stroke();
    }
    ctx.restore();

    /* ---------- 器物 ---------- */
    const baseY = TBLY;                                    // 底足落在台面上
    if (!GUIDE_FOCUS) HIT_ANCHOR = { x: ox / w, y: (baseY - s * 0.46) / h };

    /* 破绽：全部随 t 单调增强。
     * 起点必须落在噪音分布的中心（t=0.5，即 x=0）**之后**：
     * 噪音试次 x~N(0,1) 对应的 t 集中在 0.5 附近，若破绽在这里就已经显形，
     * 那"真品"看起来也全是破绽，任务就退化成"随便砸"了。
     * 现在四条线索都从 t≈0.5 之后才起来，缝的坡度最陡（最像"有 / 没有"的一条）。 */
    const printA = smooth(t, 0.48, 0.86);                  // 贴花：纹样一模一样地重复
    const seamA = smooth(t, 0.56, 0.84);                   // 合模缝：真品手工拉坯，一点缝都没有
    const glossA = smooth(t, 0.52, 0.90);                  // 贼光
    const chipA = smooth(t, 0.58, 0.94);                   // 底足的新瓷茬：最响的一条

    const smashU = (!GUIDE_FOCUS && SMASH) ? SMASH.t : -1;
    if (smashU >= SMASH_HIT) {
      drawShards(ctx, ox, baseY, s, x, (smashU - SMASH_HIT) / (1 - SMASH_HIT));
    } else {
      ctx.save();
      ctx.translate(ox, baseY);
      ctx.scale(s, s);

      /* 器身：瓷胎固有色 + 侧面受光 */
      vasePath(ctx);
      const bgr = ctx.createLinearGradient(-0.36, 0, 0.36, 0);
      bgr.addColorStop(0, '#8e9690');
      bgr.addColorStop(0.20, '#d9dcd0');
      bgr.addColorStop(0.42, '#f7f4e8');
      bgr.addColorStop(0.68, '#e2e0d2');
      bgr.addColorStop(1, '#9aa199');
      ctx.fillStyle = bgr; ctx.fill();
      ctx.strokeStyle = 'rgba(40,36,26,0.5)';
      ctx.lineWidth = 0.008; ctx.stroke();

      ctx.save();                                          // 聚光灯在器身上的反光
      vasePath(ctx); ctx.clip();
      const hgl = ctx.createRadialGradient(-0.10, -0.44, 0, -0.10, -0.44, 0.52);
      hgl.addColorStop(0, 'rgba(255,248,226,0.55)');
      hgl.addColorStop(1, 'rgba(255,248,226,0)');
      ctx.fillStyle = hgl; ctx.fillRect(-0.4, -1.05, 0.8, 1.1);
      ctx.restore();

      /* 纹样：手绘（笔笔不同） ⇄ 贴花（一模一样地重复），交叉淡入淡出 */
      ctx.save();
      vasePath(ctx); ctx.clip();
      for (let i = 0; i < 9; i++) {                        // 手绘
        const u = 0.20 + rnd() * 0.46;
        const half = vaseHalf(u);
        const col = (i % 3) - 1;                           // -1 / 0 / +1：先铺开，再加抖动
        const mx = (col * 0.52 + (rnd() - 0.5) * 0.30) * half;
        const mr = 0.050 + rnd() * 0.045;
        const rot = (rnd() - 0.5) * 2.4;
        blueMotif(ctx, mx, -u, mr, rot, (1 - printA) * (0.70 + rnd() * 0.24));
      }
      if (printA > 0.003) {                                // 贴花：3 行 4 列，等距同角度同大小
        const RP = [0.26, 0.40, 0.54], CP = [-0.16, -0.055, 0.055, 0.16];
        for (let r = 0; r < RP.length; r++) {
          for (let c = 0; c < CP.length; c++) {
            if (Math.abs(CP[c]) > vaseHalf(RP[r]) * 0.86) continue;
            blueMotif(ctx, CP[c], -RP[r], 0.052, 0, printA * 0.92);
          }
        }
      }
      ctx.restore();

      /* 合模缝：上下两半模具对合留下的一道**笔直**的竖缝，真品是手工拉坯，不会有。
       * 注意画直——带锯齿就变成"裂纹"了，那是另一个故事（也更容易被误读成每只都有毛病）。 */
      if (seamA > 0.003) {
        ctx.globalAlpha = seamA;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(64,58,46,0.62)';
        ctx.lineWidth = 0.008;
        ctx.beginPath();
        ctx.moveTo(-0.075, -0.10);
        ctx.lineTo(-0.078, -0.46);
        ctx.lineTo(-0.074, -0.80);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,252,240,0.38)';        // 缝边的一道细高光：模具对合的台阶
        ctx.lineWidth = 0.0035;
        ctx.beginPath();
        ctx.moveTo(-0.062, -0.11); ctx.lineTo(-0.062, -0.78);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* 贼光：现代釉面那种又亮又硬的条形反光 */
      if (glossA > 0.003) {
        ctx.save();
        vasePath(ctx); ctx.clip();
        const gl = ctx.createLinearGradient(-0.02, -0.74, 0.18, -0.22);
        gl.addColorStop(0, 'rgba(255,255,255,0)');
        gl.addColorStop(0.45, 'rgba(255,255,255,' + (0.60 * glossA) + ')');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(-0.12, -0.82, 0.44, 0.72);
        ctx.restore();
      }

      /* 圈足与瓶口 */
      ctx.strokeStyle = 'rgba(60,54,42,0.55)'; ctx.lineWidth = 0.012;
      ctx.beginPath(); ctx.ellipse(0, -0.014, 0.185, 0.030, 0, 0, 6.2832); ctx.stroke();
      ctx.fillStyle = '#e9e6d7';
      ctx.beginPath(); ctx.ellipse(0, -1.0, 0.19, 0.032, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(60,54,42,0.5)'; ctx.lineWidth = 0.008;
      ctx.beginPath(); ctx.ellipse(0, -1.0, 0.19, 0.032, 0, 0, 6.2832); ctx.stroke();

      /* 底足磕掉釉，露出崭新的现代白瓷：最响的一条破绽 */
      if (chipA > 0.003) {
        ctx.globalAlpha = chipA;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0.052, 0.006);
        ctx.lineTo(0.134, -0.026);
        ctx.lineTo(0.170, -0.074);
        ctx.lineTo(0.122, -0.100);
        ctx.lineTo(0.056, -0.060);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(46,40,30,0.7)'; ctx.lineWidth = 0.006; ctx.stroke();
        ctx.fillStyle = 'rgba(226,240,255,0.85)';          // 新茬上的一点冷调高光
        ctx.beginPath(); ctx.arc(0.114, -0.062, 0.019, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    /* ---------- 四周压暗，把视线收在器物上 ---------- */
    const vg = ctx.createRadialGradient(ox, TBLY - s * 0.4, Math.min(w, h) * 0.22,
      w / 2, h / 2, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.46)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }

  /* ============================================================
   * 四、质检员
   *   线索：涂装缺陷强度 I = max(0, x) —— 溢色 / 毛边 / 挂漆 / 色块错位
   *   合格试次 x~N(0,1) 时 I 大多为 0 或极小；不合格试次 x~N(d',1) 时 I 明显。
   * ============================================================ */
  function drawFigurine(ctx, w, h, x, rnd) {
    const I = clamp(x, 0, 3.4) / 3.4;          // 缺陷强度 0~1
    /* 图鉴模式：放大到近 2 倍，并把画面抬起来——只留「头 + 脖子 + 上身」，
     * 因为 72px 高的参考条带里，不放大根本看不清有没有溢色、挂漆。 */
    const S = h * (GUIDE_FOCUS ? 1.28 : 0.66);
    const cx = GUIDE_FOCUS ? w * 0.5 : w * (0.46 + rnd() * 0.08);
    const baseY = h * (GUIDE_FOCUS ? 1.147 : 0.87);

    /* --- 摄影棚背景 --- */
    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f2f5f9'); g.addColorStop(0.62, '#dde3ea'); g.addColorStop(1, '#bcc4d0');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const gl = ctx.createRadialGradient(cx, baseY - S * 0.7, 0, cx, baseY - S * 0.7, S * 1.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.75)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, w, h);

    /* --- 台面与投影 --- */
    ctx.fillStyle = '#b3bcc9';
    ctx.beginPath(); ctx.ellipse(cx, baseY + S * 0.04, S * 0.5, S * 0.075, 0, 0, 6.2832); ctx.fill();
    const sh = ctx.createRadialGradient(cx, baseY + S * 0.04, 0, cx, baseY + S * 0.04, S * 0.5);
    sh.addColorStop(0, 'rgba(40,50,70,0.28)'); sh.addColorStop(1, 'rgba(40,50,70,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(cx, baseY + S * 0.04, S * 0.5, S * 0.08, 0, 0, 6.2832); ctx.fill();

    /* --- 本次款式（与缺陷无关的随机变化） --- */
    const pal = [
      { hair: 348, coat: 208, trim: 45 },
      { hair: 26, coat: 268, trim: 190 },
      { hair: 210, coat: 340, trim: 45 },
      { hair: 46, coat: 152, trim: 15 },
      { hair: 288, coat: 30, trim: 205 }
    ][Math.floor(rnd() * 5)];
    const jitter = (rnd() - 0.5) * 16;
    const P = {
      hair: hsl(pal.hair + jitter, 52, 42),
      hairD: hsl(pal.hair + jitter, 56, 30),
      coat: hsl(pal.coat + jitter, 46, 52),
      coatD: hsl(pal.coat + jitter, 50, 38),
      trim: hsl(pal.trim + jitter, 62, 56),
      skin: hsl(28, 42, 84)
    };
    const tilt0 = (rnd() - 0.5) * 0.14;            // 仍要消耗这一次随机数，保证两格款式一致
    const tilt = GUIDE_FOCUS ? 0 : tilt0;          // 图鉴里摆正，方便左右对照
    const hasProp = rnd() < 0.55;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(tilt);

    /* 底座 */
    ctx.fillStyle = '#5b6472';
    ctx.beginPath();
    ctx.moveTo(-S * 0.26, 0); ctx.lineTo(S * 0.26, 0);
    ctx.lineTo(S * 0.22, -S * 0.07); ctx.lineTo(-S * 0.22, -S * 0.07);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(0, -S * 0.07, S * 0.22, S * 0.035, 0, 0, 6.2832); ctx.fill();

    const bodyTop = -S * 0.58, bodyBot = -S * 0.07;

    /* 身体（连衣裙 / 外套） */
    let gc = ctx.createLinearGradient(-S * 0.2, 0, S * 0.2, 0);
    gc.addColorStop(0, P.coatD); gc.addColorStop(0.45, P.coat); gc.addColorStop(1, P.coatD);
    ctx.fillStyle = gc;
    ctx.beginPath();
    ctx.moveTo(-S * 0.20, bodyBot);
    ctx.lineTo(-S * 0.10, bodyTop);
    ctx.lineTo(S * 0.10, bodyTop);
    ctx.lineTo(S * 0.20, bodyBot);
    ctx.closePath(); ctx.fill();

    /* 腰带 */
    ctx.fillStyle = P.trim;
    ctx.fillRect(-S * 0.155, bodyTop + S * 0.14, S * 0.31, S * 0.035);

    /* 手臂 */
    ctx.strokeStyle = P.coat; ctx.lineWidth = S * 0.055; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-S * 0.10, bodyTop + S * 0.04); ctx.lineTo(-S * 0.17, -S * 0.28 + rnd() * S * 0.03);
    ctx.moveTo(S * 0.10, bodyTop + S * 0.04); ctx.lineTo(S * 0.17, -S * 0.28 + rnd() * S * 0.03);
    ctx.stroke();

    /* 脖子：把手办的头和身体接成一个整体（原来中间是断开的，头像是浮在空中） */
    ctx.fillStyle = P.skin;
    ctx.beginPath();
    ctx.moveTo(-S * 0.058, bodyTop + S * 0.02);
    ctx.lineTo(-S * 0.052, -S * 0.74);
    ctx.lineTo(S * 0.052, -S * 0.74);
    ctx.lineTo(S * 0.058, bodyTop + S * 0.02);
    ctx.closePath(); ctx.fill();

    /* 领口：把脖子和外套接起来，不留缝隙 */
    ctx.fillStyle = P.trim;
    ctx.beginPath(); ctx.ellipse(0, bodyTop + S * 0.028, S * 0.108, S * 0.036, 0, 0, 6.2832); ctx.fill();

    /* 头发（后） */
    ctx.fillStyle = P.hairD;
    ctx.beginPath(); ctx.ellipse(0, -S * 0.80, S * 0.155, S * 0.16, 0, 0, 6.2832); ctx.fill();

    /* 头 */
    ctx.fillStyle = P.skin;
    ctx.beginPath(); ctx.arc(0, -S * 0.76, S * 0.125, 0, 6.2832); ctx.fill();

    /* 头发（前） */
    ctx.fillStyle = P.hair;
    ctx.beginPath();
    ctx.arc(0, -S * 0.78, S * 0.128, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-S * 0.13, -S * 0.78);
    ctx.quadraticCurveTo(-S * 0.16, -S * 0.62, -S * 0.09, -S * 0.66);
    ctx.quadraticCurveTo(-S * 0.12, -S * 0.72, -S * 0.13, -S * 0.78);
    ctx.fill();

    /* 眼睛 */
    ctx.fillStyle = '#2b2b33';
    ctx.beginPath(); ctx.arc(-S * 0.045, -S * 0.755, S * 0.016, 0, 6.2832); ctx.fill();
    ctx.beginPath(); ctx.arc(S * 0.045, -S * 0.755, S * 0.016, 0, 6.2832); ctx.fill();

    /* 小道具（与缺陷无关） */
    if (hasProp) {
      ctx.strokeStyle = P.trim; ctx.lineWidth = S * 0.028;
      ctx.beginPath();
      ctx.moveTo(S * 0.19, -S * 0.24); ctx.lineTo(S * 0.27, -S * 0.60); ctx.stroke();
    }

    /* ---------- 缺陷叠加：全部由 I 驱动 ---------- */
    if (I > 0.015) {
      const a = clamp(I * 1.2, 0, 1);

      /* 1) 主溢色块：一大块越过边界的漆，随 I 长大 */
      const angle = rnd() * 6.2832;
      const rad = S * (0.10 + 0.14 * rnd());
      const px0 = Math.cos(angle) * rad;
      const py0 = -S * 0.42 + Math.sin(angle) * rad;
      ctx.fillStyle = P.trim;
      ctx.globalAlpha = clamp(0.25 + 0.6 * I, 0, 0.95);
      ctx.beginPath();
      ctx.ellipse(px0, py0, S * (0.03 + 0.10 * I), S * (0.025 + 0.085 * I), angle, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = 1;

      /* 2) 溢色斑点（漆渗到相邻区域） */
      const nBlob = Math.round(I * 11);
      for (let i = 0; i < nBlob; i++) {
        const side = rnd() < 0.5 ? -1 : 1;
        const by = -S * (0.08 + rnd() * 0.62);
        const bxx = side * S * (0.05 + rnd() * 0.18);
        const c = rnd();
        ctx.fillStyle = c < 0.4 ? P.trim : (c < 0.7 ? P.hair : '#f6f7f9');
        ctx.globalAlpha = a * (0.45 + rnd() * 0.45);
        ctx.beginPath();
        ctx.arc(bxx, by, S * (0.012 + 0.055 * I * (0.4 + rnd() * 0.8)), 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 3) 挂漆 / 流痕 */
      const nDrip = Math.round(I * 4);
      for (let i = 0; i < nDrip; i++) {
        const dx = -S * 0.17 + rnd() * S * 0.34;
        const dy0 = -S * (0.10 + rnd() * 0.34);
        const len = S * (0.05 + 0.28 * I) * (0.5 + rnd() * 0.9);
        ctx.strokeStyle = P.trim;
        ctx.globalAlpha = a * 0.85;
        ctx.lineCap = 'round';
        ctx.lineWidth = S * (0.008 + 0.022 * I);
        ctx.beginPath();
        ctx.moveTo(dx, dy0);
        ctx.quadraticCurveTo(dx + S * 0.012, dy0 + len * 0.6, dx, dy0 + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* 4) 边缘毛糙 / 锯齿 */
      if (I > 0.15) {
        ctx.strokeStyle = P.coatD;
        ctx.globalAlpha = a * 0.95;
        ctx.lineWidth = S * 0.014;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const N = 18;
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const pxx = -S * 0.21 + S * 0.42 * u + (rnd() - 0.5) * S * 0.05 * I;
          const pyy = bodyTop + (rnd() - 0.5) * S * 0.06 * I - S * 0.02;
          if (i === 0) ctx.moveTo(pxx, pyy); else ctx.lineTo(pxx, pyy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* 5) 大面积色块错位（腰带 + 刘海整块偏移） */
      if (I > 0.4) {
        const k = smooth(I, 0.4, 1);
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = P.trim;
        ctx.beginPath();
        ctx.rect(-S * 0.155 + S * 0.055 * k, bodyTop + S * 0.14, S * 0.31, S * 0.035);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(S * 0.04 * k, -S * 0.78 + S * 0.03 * k, S * 0.128, Math.PI * 1.02, Math.PI * 1.9);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* 6) 颗粒 / 积漆噪点 */
      const nSpeck = Math.round(I * 90);
      for (let i = 0; i < nSpeck; i++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(30,30,40,0.4)';
        ctx.globalAlpha = a * 0.7;
        const sx2 = -S * 0.23 + rnd() * S * 0.46;
        const sy2 = -S * 0.90 + rnd() * S * 0.84;
        ctx.fillRect(sx2, sy2, S * 0.009, S * 0.009);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  /* ============================================================
   * 角色注册表
   * ============================================================ */
  const Roles = {
    mushroom: {
      id: 'mushroom', icon: '🍄', name: '采蘑菇', subtitle: '山野采集 · 判断毒菇',
      yes: '有毒', no: '无毒',
      scene: '山野采集 · 判断毒菇',
      focus: '漏报的代价特别大',
      PS: 0.4,
      pay: { VH: 10, CM: 100, CFA: 8, VCR: 10 },
      payText: [
        ['正确识别毒菇（避开）', 'V(H)', '+10'],
        ['误食毒菇（漏报）', 'C(M)', '−100'],
        ['误把好菇丢掉（误报）', 'C(FA)', '−8'],
        ['正确识别可食菇', 'V(CR)', '+10']
      ],
      cardDesc: '毒菇和可食菇长得极像。<b>采到毒菇可能致命，误丢一朵好菇只是可惜</b>——宁可错丢，不能错吃。',
      desc: '你在林子深处采蘑菇，毒菇和可食菇长得极像，只能靠菌盖颜色、白斑、菌褶、菌环分辨——' +
        '这些线索在中间地带是重叠的，谁也说不准。麻烦在于代价不对称：' +
        '<b>吃错菇可能致命，丢错一朵好菇只是可惜</b>。',
      cue: '注意：菌盖越偏紫红、白斑越多越密、菌褶越深、出现菌环/菌托 → 越可能有毒。',
      guideA: '典型无毒菇', guideB: '典型有毒菇',
      lesson: '<b>本关重点：漏报的代价是误报的十几倍</b>（吃错蘑菇 −100，丢错菇 −8）。' +
        '按公式算出来的最优标准明显偏宽松——宁可错丢，不能错吃。这就是"奖惩不对称"如何把 β* 推走的典型例子。',
      draw: drawMushroom
    },
    bird: {
      id: 'bird', icon: '🐦', name: '观鸟', subtitle: '林间样线 · 这是鸟吗',
      yes: '是鸟', no: '不是鸟',
      scene: '林间样线调查 · 判断是鸟还是树叶',
      focus: '两种错的代价都不大 · 标准因人而异',
      PS: 0.3,
      /* 中立关：先验偏低（30%）推人偏谨慎，漏报略贵（16 对 6）又把人往宽松拉，
         两股力量刚好抵消 → β* = (7/3)×(12/28) = 1 → c* = 0。
         也就是说这一关**没有**该松还是该紧的规范答案，各人的标准由自己的偏好决定。 */
      pay: { VH: 12, CM: 16, CFA: 6, VCR: 6 },
      payText: [
        ['认出真鸟（记录到一笔）', 'V(H)', '+12'],
        ['漏掉真鸟（这一趟白跑了）', 'C(M)', '−16'],
        ['把树叶当成鸟（多记一笔，回头核）', 'C(FA)', '−6'],
        ['正确排除干扰', 'V(CR)', '+6']
      ],
      cardDesc: '你在做鸟类调查记录，误记和漏记代价都不大，标准怎么定看你自己。',
      desc: '你沿固定样线做鸟类调查。鸟总藏在枝叶交错、光影斑驳的地方，' +
        '很多轮廓"看起来像鸟"。这一关两种错的代价都很小、也差得不多——' +
        '<b>没有哪种错误贵到逼你改变策略</b>，所以标准怎么定，全看你自己。',
      cue: '注意：轮廓越光滑完整、有明确的喙和尾羽、颜色越偏离叶绿 → 越可能是鸟。',
      guideA: '只是树叶（不是鸟）', guideB: '真正的鸟',
      lesson: '<b>本关重点：两种错的代价都不大，最优标准就压在正中间（c* = 0）</b>。' +
        '注意它是怎么被"抵消"出来的：先验偏低（只有 30% 是鸟）本来会推着你谨慎一点（宁可少记），' +
        '而漏报比虚报贵（16 对 6）又把你往宽松那头拉——两股力量几乎相互抵消，最优标准就落回了中立位置。' +
        '换句话说，<b>这一关没有"标准答案"</b>：你的 c 主要由你自己的偏好决定。' +
        '所以别去猜"应该"怎么答——按你自己的倾向答，然后看看它落在哪里。',
      draw: drawBird
    },
    antique: {
      id: 'antique', icon: '🏺', name: '鉴假员', subtitle: '拍卖行预展 · 这是赝品吗',
      yes: '赝品', no: '真品',
      scene: '拍卖行预展 · 判断是真品还是赝品',
      focus: '虚报的代价特别大',
      PS: 0.3,
      pay: { VH: 10, CM: 20, CFA: 40, VCR: 5 },
      payText: [
        ['认出赝品，把它挡在门外', 'V(H)', '+10'],
        ['赝品当真品收下（买了一堆假货）', 'C(M)', '−20'],
        ['把真品当成赝品，一锤砸碎', 'C(FA)', '−40'],
        ['真品顺利上拍', 'V(CR)', '+5']
      ],
      cardDesc: '<b>砸碎一件真品，赔偿和名声都补不回来</b>；放进一件赝品只是交学费——拿不准就先别砸。',
      desc: '你是拍卖行的鉴定师，判断器物是<b>真品</b>还是<b>赝品</b>；判为赝品就<b>当场一锤砸碎</b>。' +
        '代价极不对称：<b>砸碎一件真品，赔偿和名声都补不回来；放走一件赝品只是交学费</b>。',
      cue: '看三处破绽：釉面有没有一道笔直的合模缝（真品手工拉坯，不会有）、' +
        '纹样是不是一模一样地重复、底足有没有磕出白瓷新茬。三处都干净就是真品——别只看"旧不旧"。',
      guideA: '真品（手绘纹样 · 无接缝）', guideB: '赝品（贴花 + 合模缝 + 新茬）',
      lesson: '<b>本关重点：虚报的代价是漏报的两倍</b>（砸碎真品 −40，收进赝品 −20）。' +
        '所以最优标准是<b>偏谨慎</b>的：证据不够硬就先不动手，要有把握才抡锤。' +
        '"谨慎"在这里不是性格问题，是算出来的——把它和采蘑菇放在一起看：' +
        '同样是"眼前的这团东西到底是不是目标"，采蘑菇那边漏报贵（−100），最优标准压到 −0.78；' +
        '这一关虚报贵（−40），最优标准就翻到了 +0.70——而两关的 d′ 一个字符都没变。' +
        '再看第三关观鸟：两边代价都不大，最优标准就落在正中间。三关连起来，' +
        '就是"敏感性不变、只有奖惩在变"的一整条刻度。',
      smash: true,
      draw: drawAntique
    },
    qc: {
      id: 'qc', icon: '🧸', name: '质检员', subtitle: '手办出厂检验 · 合格吗',
      yes: '不合格', no: '合格',
      scene: '手办出厂检验 · 判断涂装是否合格',
      focus: '信号非常稀少，考验你还看不看得清',
      /* 信号只有 8%：20 次里通常只有 1~2 次。先验这么低会把人往"谨慎"那头推，
         (1−P(S))/P(S) = 11.5 倍；所以误报与正确拒斥的代价必须压得很小（−4 / +2），
         让 (V(CR)+C(FA))/(V(H)+C(M)) = 6/65 刚好抵消 → β* = 1.06 → c* ≈ +0.03，
         标准仍然停在中间——这一关考的还是"长时间没信号之后 d′ 掉不掉"。 */
      PS: 0.08,
      pay: { VH: 15, CM: 50, CFA: 4, VCR: 2 },
      payText: [
        ['拦下缺陷品', 'V(H)', '+15'],
        ['缺陷品流出（客户退货）', 'C(M)', '−50'],
        ['报废合格品（误判）', 'C(FA)', '−4'],
        ['正确放行合格品', 'V(CR)', '+2']
      ],
      cardDesc: '产线上不合格的只有 8%。<b>连续几十只都没问题之后，你还看得清吗？</b>',
      desc: '这条产线的涂装工艺很成熟，<b>每 100 只里只有 8 只不合格</b>。难的不是"敢不敢判"，' +
        '而是<b>在连续几十只都没问题之后，你还看得清吗</b>——长时间没有信号，人会不知不觉松懈，' +
        '敏感性悄悄下降。',
      cue: '主要看涂装：溢色、挂漆流痕、边缘毛糙、色块错位。' +
        '轻微的花痕几乎每一只都有——问题是花到什么程度算不合格。',
      guideA: '合格样品（涂装干净）', guideB: '典型不合格（溢色/挂漆）',
      lesson: '<b>本关重点：信号极其稀少（只有 8%）</b>。信号少 + 两种错误代价接近，' +
        '算出来的最优标准几乎就在中立位置——也就是说，这一关<b>不考"标准放在哪"，考的是' +
        '"你在长时间没有信号之后，还看得清吗"</b>：d′ 有没有掉下来。' +
        '这正是警觉（vigilance）研究的核心问题，可以在「概念实验室 → 警觉模拟」里继续推演。',
      draw: drawFigurine
    }
  };
  const RoleList = [Roles.mushroom, Roles.antique, Roles.bird, Roles.qc];

  /* 结果页里"你更保守/更宽松"那句话要举本关的具体例子 */
  const MISS_TXT = {
    mushroom: '吃到毒菇', bird: '漏掉真鸟', antique: '把赝品收进来', qc: '让缺陷品流出'
  };
  const FA_TXT = {
    mushroom: '扔掉好菇', bird: '把树叶记成鸟', antique: '把真品砸碎', qc: '报废合格品'
  };

  /* ============================================================
   * 实验引擎
   * ============================================================ */
  const Game = {
    role: null, d: 1.8, n: 20, feedback: false, nP: 5,
    trials: [], idx: 0,
    tally: { h: 0, m: 0, fa: 0, cr: 0 },        // 只统计正式试次
    ptally: { h: 0, m: 0, fa: 0, cr: 0 },       // 练习试次（不计分）
    running: false, begun: false, awaitingReal: false, pfb: null,
    cv: null, gcv: null, els: {},

    init(els) { this.els = els; this.cv = els.canvas; this.gcv = els.guide; },

    /* ---------- 限时呈现 ---------- */
    /* 每个试次的画面只显示 stimMs 毫秒，之后换成"已隐藏"的提示板，
       被试凭刚才的印象作答。设为 0 表示不限时。 */
    armStim() {
      const bar = this.els.stimBar;
      const i = bar && bar.firstElementChild;
      this.clearStim();
      if (!this.stimMs) { if (bar) bar.classList.add('off'); return; }
      if (bar) {
        bar.classList.remove('off');
        i.style.transition = 'none';
        i.style.width = '100%';
        void i.offsetWidth;                       // 强制重排，让动画重新开始
        i.style.transition = 'width ' + this.stimMs + 'ms linear';
        i.style.width = '0%';
      }
      const self = this, run = this.runId, at = this.idx;
      this.stimTimer = setTimeout(function () {
        if (self.runId !== run || self.idx !== at || self.blank) return;
        self.hidden = true;
        self.clearStim();                         // 画面都撤了，倒计时条也别留着
        self.drawCurrent();
      }, this.stimMs);
    },

    clearStim() {
      if (this.stimTimer) { clearTimeout(this.stimTimer); this.stimTimer = null; }
      const bar = this.els.stimBar;
      if (bar) {
        bar.classList.add('off');
        const i = bar.firstElementChild;
        if (i) { i.style.transition = 'none'; i.style.width = '0%'; }
      }
    },

    /* ---------- 开始一轮实验 ---------- */
    start(roleId, opts) {
      opts = opts || {};
      this.role = Roles[roleId];
      this.d = opts.d === undefined ? 1.8 : opts.d;
      this.n = opts.n === undefined ? 20 : opts.n;
      this.feedback = !!opts.feedback;
      this.stimMs = opts.stimMs === undefined ? 3000 : opts.stimMs;
      this.nP = opts.practice === undefined ? 5 : opts.practice;
      this.trials = [];
      this.idx = 0;
      this.tally = { h: 0, m: 0, fa: 0, cr: 0 };
      this.ptally = { h: 0, m: 0, fa: 0, cr: 0 };
      this.pfb = null;
      this.running = true;
      this.begun = false;
      this.awaitingReal = false;
      this.inPractice = this.nP > 0;      // 阶段标志（不是逐试次推导），
                                          // 否则答完最后一个练习试次、反馈卡还亮着的时候，
                                          // 进度条会提前跳成"第 1 / 20 次"
      this.blank = false;
      this.hidden = false;
      this.clearStim();
      this.runId = (this.runId || 0) + 1;   // 防止上一局的延时回调干扰新一局

      /* 练习试次（this.nP 个）排在正式试次前面，共用同一个下标 this.idx，
         用 tr.practice 区分——这样试次流程（drawCurrent / armStim / respond）
         完全不用改结构，只要在计数和收尾处分流即可。 */
      for (let i = 0; i < this.nP; i++) this.trials.push(this.practiceTrial(i));

      const nS = Math.round(this.n * this.role.PS);
      const nN = this.n - nS;
      const types = [];
      for (let i = 0; i < nS; i++) types.push(true);
      for (let i = 0; i < nN; i++) types.push(false);
      U.RNG.shuffle(types);

      for (let i = 0; i < types.length; i++) {
        const isS = types[i];
        const latent = isS ? U.RNG.normal() + this.d : U.RNG.normal();
        this.trials.push({
          isS: isS,
          x: latent,
          seed: Math.floor(U.RNG.next() * 2147483647),
          answered: null, practice: false
        });
      }
      this.nS = nS; this.nN = nN;

      this.drawGuide();
      this.updateHeader();
      this.drawCurrent();
      this.updateMuteBtn();
      /* 注意：这里**不**启动倒计时。start() 是在任务说明层还盖着的时候调用的，
         若此刻就开始计时，"第 1 个试次"的图会在同学还在读说明的时候就被撤掉，
         等点击开始时只剩一块"画面已隐藏"的板子。计时改到 begin()。 */
      return this;
    },

    /* ---------- 五个练习试次 ----------
     * 固定内容（全班一样，方便老师统一讲）：从"一眼就能看出来"逐步过渡到"中间地带"，
     * 让同学先建立起刺激两端的样子，再撞见它其实是连续变化的。
     * 难度随当前 d′ 缩放；种子固定，所以每次进入同一关，练习的画面也一致。 */
    practiceTrial(i) {
      const spec = [
        [true, this.d + 1.40],        // 一眼就是「有信号」
        [false, -1.40],               // 一眼就是「无信号」
        [true, this.d + 0.90],        // 比较明确的信号
        [false, -0.80],               // 比较明确的噪音
        [true, this.d * 0.5]          // 中间地带：证据很弱，最容易被判错
      ];
      const s = spec[Math.min(i, spec.length - 1)];
      return { isS: s[0], x: s[1], seed: 700011 + i * 977, answered: null, practice: true };
    },

    /* ---------- 收起任务说明层之后，才真正开始 ----------
     * 一是重画一遍（这时页面才可见，Charts.prep 拿到的才是真实尺寸），
     * 二是到这一刻才开始算限时。 */
    begin() {
      if (!this.running || this.begun) return;
      this.begun = true;
      this.blank = false;
      this.hidden = false;
      this.pfb = null;
      this.drawGuide();
      this.drawCurrent();
      this.updateHeader();
      this.armStim();
    },

    /* 练习结束、同学点「开始正式实验」之后调用 */
    beginReal() {
      if (!this.running || !this.awaitingReal) return;
      this.awaitingReal = false;
      this.inPractice = false;
      this.blank = false;
      this.hidden = false;
      this.pfb = null;
      this.drawCurrent();
      this.updateHeader();
      this.armStim();
    },

    /* 只有需要"砸"的场景才显示喇叭按钮 */
    updateMuteBtn() {
      const b = this.els.mute;
      if (!b) return;
      b.style.display = this.role && this.role.smash ? '' : 'none';
      b.textContent = Sound.muted ? '🔇 静音' : '🔊 碎裂声';
      b.classList.toggle('off', Sound.muted);
    },

    /* ---------- 画面绘制 ---------- */
    drawCurrent() {
      if (this.idx >= this.trials.length) return;
      const tr = this.trials[this.idx];
      const p = Charts.prep(this.cv);
      if (this.blank) {                       // 试次间隔的空白帧
        p.ctx.fillStyle = '#20242c';
        p.ctx.fillRect(0, 0, p.w, p.h);
        if (this.pfb) { this.drawPracticeFeedback(p.ctx, p.w, p.h); return; }
        p.ctx.fillStyle = 'rgba(255,255,255,0.16)';
        p.ctx.font = '14px "PingFang SC",system-ui,sans-serif';
        p.ctx.textAlign = 'center';
        p.ctx.fillText('…', p.w / 2, p.h / 2);
        return;
      }
      if (this.hidden) {                      // 限时已到：画面撤掉，凭印象作答
        p.ctx.fillStyle = '#20242c';
        p.ctx.fillRect(0, 0, p.w, p.h);
        p.ctx.textAlign = 'center';
        p.ctx.fillStyle = 'rgba(255,255,255,0.62)';
        p.ctx.font = '600 ' + Math.round(Math.max(14, Math.min(20, p.h * 0.065))) + 'px "PingFang SC",system-ui,sans-serif';
        p.ctx.fillText('画面已隐藏 —— 凭刚才的印象作答', p.w / 2, p.h / 2 - 4);
        p.ctx.fillStyle = 'rgba(255,255,255,0.32)';
        p.ctx.font = Math.round(Math.max(11, Math.min(13, p.h * 0.045))) + 'px "PingFang SC",system-ui,sans-serif';
        p.ctx.fillText('限时 ' + (this.stimMs / 1000).toFixed(1) + ' 秒', p.w / 2, p.h / 2 + Math.round(p.h * 0.06));
        return;
      }
      this.role.draw(p.ctx, p.w, p.h, tr.x, U.mulberry32(tr.seed));
    },

    /* ---------- 练习试次的反馈卡 ----------
     * 直接说清"这一次实际是什么"和"你答成了什么"，并把四个类别用 SDT 的
     * 正式术语写出来（击中 / 正确拒斥 / 漏报 / 虚报），
     * 让同学在做正式实验之前就把词和情形对上号。 */
    drawPracticeFeedback(ctx, w, h) {
      const f = this.pfb;
      const col = f.correct ? '#7ee08a' : '#ff8d8d';
      const bw = Math.min(w * 0.72, 640);
      const bh = Math.min(h * 0.52, 240);
      const bx = (w - bw) / 2, by = (h - bh) / 2;
      const r = 14;
      const SANS = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';

      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, r);
      else ctx.rect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(14,18,26,0.88)';
      ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      ctx.font = '700 ' + Math.round(Math.max(22, Math.min(38, bh * 0.20))) + 'px ' + SANS;
      ctx.fillText(f.label, w / 2, by + bh * 0.33);

      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      ctx.font = Math.round(Math.max(13, Math.min(17, bh * 0.090))) + 'px ' + SANS;
      ctx.fillText(f.sub, w / 2, by + bh * 0.58);

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = Math.round(Math.max(12, Math.min(15, bh * 0.078))) + 'px ' + SANS;
      ctx.fillText(f.why, w / 2, by + bh * 0.79);
      ctx.restore();
    },

    /* 重绘。注意：图鉴条带也要一起重绘——
     * start() 时页面还是隐藏的，Charts.prep() 拿不到真实尺寸，只能退回到
     * 640×320 的兜底值；不重绘的话，那块 640×320 的位图会被拉伸成细长条，
     * 画面里的东西会横向拉宽、纵向压扁。 */
    redraw() { if (this.running) { this.drawGuide(); this.drawCurrent(); } },

    drawGuide() {
      const p = Charts.prep(this.gcv);
      const ctx = p.ctx, w = p.w, h = p.h;
      const hw = Math.floor((w - 2) / 2);          // 每格虚拟宽度
      const SEED = 20241011;                        // 两格用同一随机种子 → 只有"信号"不同
      /* 垫底色：角色自己会铺满整个矩形，这里只是兜底——用页面卡片色，
         万一哪一格没铺满，露出来的是深色而不是一块白 */
      ctx.fillStyle = '#333A41'; ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, hw, h); ctx.clip();
      GUIDE_FOCUS = true;
      this.role.draw(ctx, hw, h, -3.4, U.mulberry32(SEED));
      GUIDE_FOCUS = false;
      ctx.restore();

      ctx.save();
      ctx.beginPath(); ctx.rect(hw + 2, 0, w - hw - 2, h); ctx.clip();
      ctx.translate(hw + 2, 0);
      GUIDE_FOCUS = true;
      this.role.draw(ctx, hw, h, 3.4, U.mulberry32(SEED));
      GUIDE_FOCUS = false;
      ctx.restore();

      ctx.fillStyle = 'rgba(36,41,46,0.78)';
      ctx.fillRect(hw, 0, 2, h);

      /* 两格说明放在画布下方的 HTML 里（画在画布里会挡住图，矮屏尤其明显） */
      const ca = document.getElementById('guideCapA'), cb = document.getElementById('guideCapB');
      if (ca) ca.textContent = this.role.guideA;
      if (cb) cb.textContent = this.role.guideB;
    },

    /* ---------- 试次流程 ---------- */
    updateHeader() {
      const e = this.els;
      const inPrac = this.inPractice;
      if (e.progress) {
        e.progress.textContent = this.awaitingReal ? '练习结束'
          : inPrac ? '练习 ' + Math.min(this.idx + 1, this.nP) + ' / ' + this.nP
            : '第 ' + Math.min(this.idx - this.nP + 1, this.n) + ' / ' + this.n + ' 次';
      }
      if (e.stim) e.stim.textContent = this.stimMs ? '限时 ' + (this.stimMs / 1000).toFixed(1) + ' 秒' : '不限时';
      if (e.tally) {
        if (inPrac || this.awaitingReal) {   // 练习期实时把四类都摆出来，边做边认词
          e.tally.style.display = '';
          e.tally.textContent = '练习（不计分）：击中 ' + this.ptally.h + ' · 正确拒斥 ' + this.ptally.cr +
            ' · 漏报 ' + this.ptally.m + ' · 虚报 ' + this.ptally.fa;
        } else if (this.feedback) {
          e.tally.style.display = '';
          e.tally.textContent = '已记录：击中 ' + this.tally.h + ' · 误报 ' + this.tally.fa;
        } else {
          e.tally.style.display = 'none';
        }
      }
    },

    respond(saidYes) {
      if (!this.running || this.idx >= this.trials.length) return;
      if (this.awaitingReal) return;         // 停在"练习结束"的过渡层上，不接受作答
      if (this.blank) return;                // 试次间隔（图像还没出来）不接受作答，
                                             // 否则连按两次就把下一个试次也一起答了
      const tr = this.trials[this.idx];
      if (tr.answered !== null) return;
      tr.answered = saidYes ? 1 : 0;

      const bucket = tr.practice ? this.ptally : this.tally;
      let correct;
      if (tr.isS && saidYes) { bucket.h++; correct = true; }
      else if (tr.isS && !saidYes) { bucket.m++; correct = false; }
      else if (!tr.isS && saidYes) { bucket.fa++; correct = false; }
      else { bucket.cr++; correct = true; }
      tr.correct = correct;

      /* 练习试次一定给反馈（不然"练习"就没有意义了），正式试次才看那个开关 */
      if (tr.practice) {
        const R = this.role;
        this.pfb = {
          label: tr.isS ? (saidYes ? '击中' : '漏报') : (saidYes ? '虚报' : '正确拒斥'),
          correct: correct,
          sub: '你说「' + (saidYes ? R.yes : R.no) + '」· 它其实是「' + (tr.isS ? R.yes : R.no) + '」',
          why: tr.isS
            ? (saidYes ? '有信号，你也说了「有」——这一次抓住了'
              : '有信号，你说了「无」——这一次漏掉了')
            : (saidYes ? '没有信号，你说了「有」——这一次报错了'
              : '没有信号，你说了「无」——这一次正确地放过了')
        };
      } else this.pfb = null;

      if (!tr.practice) this.flash(correct);   // 练习改用画布上的反馈卡，不再叠 ✓/✗
      this.clearStim();                     // 本试次的倒计时到此为止
      this.idx++;
      this.blank = true;
      this.hidden = false;

      /* 需要"砸"的场景：说「赝品」= 抡锤，先放一段砸碎动画再进入下一试次。
         （注意：砸碎效果对错都一样，只是个"打击感"——是否砸对仍然只由
          逐试次反馈那一个开关决定，免得把反馈偷偷塞回测量里。） */
      const smashing = this.role.smash && saidYes;
      const prac = !!tr.practice;
      const gap = prac ? 1500 : 240;        // 练习的反馈卡要留够阅读时间
      const self = this, run = this.runId;
      if (smashing) {
        Sound.smashSound(correct);
        this.playSmash(correct);
      } else {
        this.drawCurrent();
      }
      this.updateHeader();
      setTimeout(function () {
        if (self.runId !== run) return;     // 已经换了一局，丢弃
        self.blank = false;
        if (self.idx >= self.trials.length) { self.finish(); return; }
        if (self.idx === self.nP) {          // 刚答完最后一个练习试次
          self.blank = true;                 // 停在反馈卡上，别把第一个正式试次画出来
          self.awaitingReal = true;
          self.updateHeader();
          if (global.App && global.App.showReady) global.App.showReady();
          return;
        }
        self.pfb = null;
        self.drawCurrent(); self.updateHeader(); self.armStim();
      }, (smashing ? SMASH_MS + 140 : 0) + gap);
    },

    /* ---------- 砸碎动画 ----------
     * 锤子抡下来 → 命中 → 器物炸成碎片飞散、落到台面上 → 镜头抖动衰减。
     * 碎片由渲染器画（只有它知道器物长什么样、在哪儿），这里只负责
     * 抡锤、闪光、粉尘和抖动。全程画在 canvas 上，不改动任何 DOM。 */
    playSmash(correct) {
      const self = this, run = this.runId, t0 = (global.performance || Date).now();
      function frame() {
        if (self.runId !== run) return;
        const t = ((global.performance || Date).now() - t0) / SMASH_MS;
        if (t >= 1) {
          /* 练习试次被砸碎时，反馈卡不能在第一时间画（会被抡锤动画盖住），
             等碎片落定再补上；正式试次没有 pfb，交给 respond() 的定时器接管。 */
          if (self.pfb) { self.blank = true; self.drawCurrent(); }
          return;
        }
        self.drawSmashFrame(clamp(t, 0, 1), correct);
        global.requestAnimationFrame(frame);
      }
      global.requestAnimationFrame(frame);
    },

    /* 锤子：柄沿着 +y 长出去，锤头落在柄的末端 */
    drawHammer(ctx, L, K) {
      ctx.strokeStyle = '#7d5230';
      ctx.lineWidth = K * 0.020; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, K * 0.02); ctx.lineTo(0, L); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,224,180,0.35)';
      ctx.lineWidth = K * 0.006;
      ctx.beginPath(); ctx.moveTo(-K * 0.005, K * 0.06); ctx.lineTo(-K * 0.005, L * 0.94); ctx.stroke();

      const hw = K * 0.052, hh = K * 0.090;
      ctx.save();
      ctx.translate(0, L);
      const mg = ctx.createLinearGradient(-hw, 0, hw, 0);
      mg.addColorStop(0, '#6f7883'); mg.addColorStop(0.38, '#ced5dd');
      mg.addColorStop(0.64, '#eff3f7'); mg.addColorStop(1, '#79828d');
      ctx.fillStyle = mg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-hw, -hh * 0.5, hw * 2, hh, K * 0.012);
      else ctx.rect(-hw, -hh * 0.5, hw * 2, hh);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,34,40,0.55)'; ctx.lineWidth = K * 0.004; ctx.stroke();
      ctx.restore();
    },

    drawSmashFrame(t, correct) {
      const tr = this.trials[this.idx - 1];
      if (!tr) return;
      const p = Charts.prep(this.cv);
      const ctx = p.ctx, w = p.w, h = p.h;
      const K = Math.min(w, h);
      /* 砸实之后才抖 */
      const after = t < SMASH_HIT ? 0 : Math.max(0, 1 - (t - SMASH_HIT) / 0.26);
      const shakeAmp = K * 0.030 * after;

      /* 画面本身（同一试次、同一个种子 → 和刚才看到的一模一样）。
         SMASH 是给渲染器的信号：过了命中点，它就改画碎片。 */
      ctx.save();
      ctx.translate(Math.sin(t * 71) * shakeAmp, Math.cos(t * 57) * shakeAmp * 0.7);
      SMASH = { t: t };
      this.role.draw(ctx, w, h, tr.x, U.mulberry32(tr.seed));
      SMASH = null;
      ctx.restore();

      const ax = HIT_ANCHOR.x * w, ay = HIT_ANCHOR.y * h;

      /* ---------- 锤子 ---------- */
      const pvx = ax + K * 0.26, pvy = ay - K * 0.42;      // 轴心：右上方
      const dx = ax - pvx, dy = ay - pvy;
      const aim = Math.atan2(-dx, dy);                     // 柄指向器物的角度
      const L = Math.hypot(dx, dy);
      const sw = t < SMASH_HIT ? Math.pow(t / SMASH_HIT, 0.60) : 1;
      const rebound = t < SMASH_HIT ? 0 : Math.min(1, (t - SMASH_HIT) / 0.55);
      const ang = lerp(aim - 1.30, aim - 0.22 * rebound, sw);

      if (t < SMASH_HIT + 0.30) {                          // 砸完就让锤子淡出
        const fade = t < SMASH_HIT ? 1 : Math.max(0, 1 - (t - SMASH_HIT) / 0.30);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(pvx, pvy);
        if (t < SMASH_HIT && sw > 0.10) {                  // 抡下来的残影
          for (let k = 2; k >= 1; k--) {
            ctx.save();
            ctx.rotate(ang - 0.19 * k);
            ctx.globalAlpha = fade * 0.14 * (3 - k);
            this.drawHammer(ctx, L, K);
            ctx.restore();
          }
        }
        ctx.rotate(ang);
        this.drawHammer(ctx, L, K);
        ctx.restore();
      }

      /* ---------- 命中：粉尘、碎屑、闪光 ---------- */
      if (t >= SMASH_HIT) {
        const ht = smooth(t, SMASH_HIT, SMASH_HIT + 0.05);
        const out = Math.max(0, 1 - smooth(t, SMASH_HIT + 0.05, 1.0));
        const warm = this.feedback && correct;             // 只有开了反馈才染色
        const R = K * (0.10 + 0.42 * smooth(t, SMASH_HIT, 0.92));
        const cg2 = ctx.createRadialGradient(ax, ay, 0, ax, ay, R);
        cg2.addColorStop(0, warm ? 'rgba(255,246,214,' + (0.85 * out) + ')'
          : 'rgba(238,240,236,' + (0.72 * out) + ')');
        cg2.addColorStop(0.4, 'rgba(232,224,204,' + (0.30 * out) + ')');
        cg2.addColorStop(1, 'rgba(220,214,196,0)');
        ctx.fillStyle = cg2;
        ctx.beginPath(); ctx.arc(ax, ay, R, 0, 6.2832); ctx.fill();

        ctx.save();                                        // 放射状的碎屑轨迹
        ctx.translate(ax, ay);
        for (let i = 0; i < 12; i++) {
          const ang2 = i / 12 * 6.2832 + 0.9;
          const len = R * (0.45 + (i % 4) * 0.42) * ht;
          ctx.strokeStyle = 'rgba(246,244,236,' + (0.55 * out) + ')';
          ctx.lineWidth = Math.max(1, K * 0.005);
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang2) * len * 0.35, Math.sin(ang2) * len * 0.35);
          ctx.lineTo(Math.cos(ang2) * len, Math.sin(ang2) * len);
          ctx.stroke();
        }
        ctx.restore();
      }

      /* 全屏一闪（锤子砸下去的那一下）+ 收尾压暗 */
      const fl = t < SMASH_HIT ? 0 : Math.max(0, 1 - (t - SMASH_HIT) / 0.16);
      if (fl > 0) {
        ctx.fillStyle = 'rgba(255,250,236,' + (0.26 * fl * fl) + ')';
        ctx.fillRect(0, 0, w, h);
      }
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.24,
        w / 2, h / 2, Math.max(w, h) * 0.64);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,' + (0.42 * after) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    },

    flash(correct) {
      const el = this.els.flash;
      if (!el) return;
      if (!this.feedback) return;
      el.textContent = correct ? '✓' : '✗';
      el.className = 'flash show ' + (correct ? 'ok' : 'bad');
      setTimeout(function () { el.className = 'flash'; }, 340);
    },

    /* ---------- 结算 ---------- */
    finish() {
      if (!this.running) return;          // 防止重复结算
      this.running = false;
      const h = this.tally.h, m = this.tally.m, fa = this.tally.fa, cr = this.tally.cr;
      const nS = h + m, nN = fa + cr;
      const r = SDT.loglinear(h, fa, nS, nN);
      const dprime = SDT.dprimeFromRates(r.H, r.FA);
      const c = SDT.cFromRates(r.H, r.FA);
      const beta = SDT.betaFromRates(r.H, r.FA);
      const ap = SDT.aprime(r.H, r.FA);
      const acc = (h + cr) / (nS + nN);
      const pay = this.role.pay;
      const bOpt = SDT.betaOpt(this.role.PS, pay.VH, pay.CM, pay.CFA, pay.VCR);
      const optC = SDT.cFromBeta(bOpt, this.d);

      const rec = {
        sid: (Store.user && Store.user.sid) || 'guest',
        name: (Store.user && Store.user.name) || '游客',
        guest: !(Store.user && Store.user.sid && Store.user.name),
        game: this.role.id, gameName: this.role.name,
        dSetting: this.d, nTrials: this.n, nS: nS, nN: nN,
        feedback: this.feedback, stimMs: this.stimMs,
        hits: h, miss: m, fa: fa, cr: cr,
        PH: r.H, PFA: r.FA, dprime: dprime, c: c, beta: beta, aprime: ap,
        acc: acc, optC: optC
      };
      this.lastRecord = rec;
      try { Store.add(rec); } catch (e) { }

      this.renderResult(rec);
      /* 结算完自动进入结果页——否则画面停在最后一帧的空白上，看起来像"卡住" */
      if (global.App && global.App.go) global.App.go('result');
      return rec;
    },

    renderResult(rec) {
      const $ = id => document.getElementById(id);
      const R = this.role;
      $('r-title').textContent = R.icon + ' ' + R.name + ' · ' + this.n + ' 次判断';
      $('r-sub').textContent = R.scene + '　|　设定难度 d′ = ' + this.d.toFixed(1) +
        '　|　信号先验 P(S) = ' + Math.round(R.PS * 100) + '%' +
        '　|　图片限时 ' + (this.stimMs ? (this.stimMs / 1000).toFixed(1) + ' 秒' : '不限') +
        (this.feedback ? '　|　逐试次反馈：开' : '');

      $('cm-h').textContent = 'H = ' + rec.hits;
      $('cm-m').textContent = 'M = ' + rec.miss;
      $('cm-fa').textContent = 'FA = ' + rec.fa;
      $('cm-cr').textContent = 'CR = ' + rec.cr;
      $('cm-hn').textContent = rec.hits + ' / ' + rec.nS;
      $('cm-mn').textContent = rec.miss + ' / ' + rec.nS;
      $('cm-fan').textContent = rec.fa + ' / ' + rec.nN;
      $('cm-crn').textContent = rec.cr + ' / ' + rec.nN;

      $('m-ph').textContent = U.fmt(rec.PH, 2);
      $('m-pfa').textContent = U.fmt(rec.PFA, 2);
      $('m-d').textContent = U.fmt(rec.dprime, 2);
      $('m-beta').textContent = U.fmt(rec.beta, 2);
      $('m-c').textContent = U.fmt(rec.c, 2);
      $('m-ap').textContent = U.fmt(rec.aprime, 2);
      $('m-acc').textContent = U.pct(rec.acc, 0);

      /* 与两种典型策略对比 */
      const A = { ph: 0.60, pfa: 0.10, d: 1.8, c: 0.5, acc: 0.75 };
      const B = { ph: 0.90, pfa: 0.40, d: 1.8, c: -0.5, acc: 0.75 };
      $('cmp-a-ph').textContent = A.ph.toFixed(2);
      $('cmp-a-pfa').textContent = A.pfa.toFixed(2);
      $('cmp-a-d').textContent = '~' + A.d.toFixed(1);
      $('cmp-a-c').textContent = '+' + A.c.toFixed(1);
      $('cmp-a-acc').textContent = '75%';
      $('cmp-b-ph').textContent = B.ph.toFixed(2);
      $('cmp-b-pfa').textContent = B.pfa.toFixed(2);
      $('cmp-b-d').textContent = '~' + B.d.toFixed(1);
      $('cmp-b-c').textContent = '−' + Math.abs(B.c).toFixed(1);
      $('cmp-b-acc').textContent = '75%';
      $('cmp-you-ph').textContent = rec.PH.toFixed(2);
      $('cmp-you-pfa').textContent = rec.PFA.toFixed(2);
      $('cmp-you-d').textContent = U.fmt(rec.dprime, 2);
      $('cmp-you-c').textContent = (rec.c >= 0 ? '+' : '') + U.fmt(rec.c, 2);
      $('cmp-you-acc').textContent = Math.round(rec.acc * 100) + '%';

      /* 最优标准提示 */
      const optBox = $('r-opt');
      const stance = rec.c > 0.25 ? '偏保守（谨慎型）' : (rec.c < -0.25 ? '偏宽松（冒险型）' : '接近中立');
      let msg = '你的标准 c = ' + U.fmt(rec.c, 2) + '，' + stance + '。';
      if (isFinite(rec.optC)) {
        msg += '按本场景的先验概率 P(S)=' + Math.round(R.PS * 100) + '% 和奖惩的不对称，' +
          '最优标准约为 c* = ' + U.fmt(rec.optC, 2) + '（β* = ' + U.fmt(SDT.betaOpt(R.PS, R.pay.VH, R.pay.CM, R.pay.CFA, R.pay.VCR), 2) + '）。';
        const diff = rec.c - rec.optC;
        if (Math.abs(diff) < 0.25) msg += ' 你的标准已经很接近最优！';
        else if (diff > 0) msg += ' 你比最优标准更保守——漏报（' + MISS_TXT[R.id] + '）的代价在你这里被低估了。';
        else msg += ' 你比最优标准更宽松——误报（' + FA_TXT[R.id] + '）的代价在你这里被低估了。';
      }
      if (R.lesson) msg += '<br><br>' + R.lesson;
      optBox.innerHTML = msg;

      const km = $('r-key');
      km.innerHTML = '<b>关键洞察：</b>同学A和同学B的 d′ 几乎一样（分辨能力相当），' +
        '但他们的标准完全不同！A很谨慎（只在很确定时说"有"），B很宽松（稍微像就说"有"）。' +
        '<b>准确率掩盖了这个区别</b>——这就是为什么工程心理学要把"能不能分清楚"（d′）' +
        '和"敢不敢说有"（β / c）分开。';
    },

    setBlank(v) { this.blank = !!v; }
  };

  global.Games = { Roles: Roles, RoleList: RoleList, Game: Game, Sound: Sound };
})(typeof window !== 'undefined' ? window : globalThis);
