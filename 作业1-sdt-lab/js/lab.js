/* ============================================================
 * lab.js —— 概念实验室（5 个模块）
 *   1. 两个分布        2. ROC 曲线        3. 标准与奖惩
 *   4. SDT 与机器学习  5. 警觉衰退模拟
 * ============================================================ */
(function (global) {
  'use strict';

  const U = Util, SDT = Util.SDT, C = Charts;
  const $ = id => document.getElementById(id);

  const Lab = {
    state: {
      d: 1.5, c: 0,
      auc: 0.85, th: 0.5,
      PS: 0.5, VH: 1, CM: 1, CFA: 1, VCR: 1,
      d0: 1.8, c0: 0, dDown: true, cShift: false
    },
    inited: false,

    init() {
      if (this.inited) return;
      this.inited = true;
      const S = this.state;

      /* --- 标签页切换 --- */
      document.querySelectorAll('.lab-tab').forEach(btn => {
        btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
      });

      /* --- 模块 1：两个分布 --- */
      bindRange('d1', v => { S.d = v; this.syncD(); this.renderDist(); });
      bindRange('c1', v => { S.c = v; this.syncC(); this.renderDist(); });

      /* --- 模块 2：ROC --- */
      bindRange('d2', v => { S.d = v; this.syncD(); this.renderRoc(); });
      bindRange('c2', v => { S.c = v; this.syncC(); this.renderRoc(); });
      bindRange('sv', v => { S.sigma = v; this.renderRoc(); });
      if (!S.sigma) S.sigma = 1;

      /* --- 模块 3：先验与奖惩 --- */
      bindRange('ps', v => { S.PS = v; this.renderPayoff(); });
      ['vH', 'cM', 'cFA', 'vCR'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('input', () => {
          S[id] = parseFloat(el.value) || 0;
          this.renderPayoff();
        });
      });
      const applyBtn = $('btn-apply-c');
      if (applyBtn) applyBtn.addEventListener('click', () => {
        const po = this.payoff();
        if (isFinite(po.cOpt)) { S.c = po.cOpt; this.syncC(); this.renderAll(); }
      });

      /* --- 模块 4：机器学习 --- */
      bindRange('ml-auc', v => { S.auc = v; this.renderML(); });
      bindRange('ml-th', v => { S.th = v; this.renderML(); });

      /* --- 模块 5：警觉模拟 --- */
      bindRange('vig-d', v => { S.d0 = v; this.renderVigStatic(); });
      bindRange('vig-c', v => { S.c0 = v; this.renderVigStatic(); });
      const cb1 = $('vg-ddown'), cb2 = $('vg-cshift');
      if (cb1) cb1.addEventListener('change', () => { S.dDown = cb1.checked; });
      if (cb2) cb2.addEventListener('change', () => { S.cShift = cb2.checked; });
      const runBtn = $('btn-vig');
      if (runBtn) runBtn.addEventListener('click', () => this.runVigilance());

      this.syncAllInputs();
      this.renderAll();
    },

    showTab(name) {
      document.querySelectorAll('.lab-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === name));
      document.querySelectorAll('.lab-panel').forEach(p =>
        p.classList.toggle('active', p.dataset.panel === name));
      this.renderAll();
    },

    /* ---------- 输入同步 ---------- */
    syncD() {
      setRange('d1', this.state.d); setRange('d2', this.state.d);
    },
    syncC() {
      setRange('c1', this.state.c); setRange('c2', this.state.c);
      const iv = $('vig-c'); if (iv) { /* 警觉模块的 c0 独立 */ }
    },
    syncAllInputs() {
      const S = this.state;
      setRange('d1', S.d); setRange('c1', S.c);
      setRange('d2', S.d); setRange('c2', S.c);
      setRange('sv', S.sigma);
      setRange('ps', S.PS);
      setRange('ml-auc', S.auc); setRange('ml-th', S.th);
      setRange('vig-d', S.d0); setRange('vig-c', S.c0);
      ['vH', 'cM', 'cFA', 'vCR'].forEach(id => { const el = $(id); if (el) el.value = S[id]; });
    },

    renderAll() {
      this.renderDist();
      this.renderRoc();
      this.renderPayoff();
      this.renderML();
      this.renderVigStatic();
    },

    /* ============================================================
     * 模块 1：两个分布与判定标准
     * ============================================================ */
    renderDist() {
      const S = this.state;
      if (!$('cv-dist')) return;
      C.distributions($('cv-dist'), S.d, S.c);
      const r = SDT.ratesFromDC(S.d, S.c);
      const H = r.H, FA = r.FA;
      $('lm-h').textContent = H.toFixed(2);
      $('lm-fa').textContent = FA.toFixed(2);
      $('lm-m').textContent = (1 - H).toFixed(2);
      $('lm-cr').textContent = (1 - FA).toFixed(2);
      $('lm-d').textContent = S.d.toFixed(2);
      $('lm-beta').textContent = SDT.betaFromDC(S.d, S.c).toFixed(2);
      $('lm-c2').textContent = S.c.toFixed(2);
      $('lm-ap').textContent = SDT.aprime(H, FA).toFixed(2);
      $('lm-xc').textContent = SDT.criterionX(S.d, S.c).toFixed(2);
    },

    /* ============================================================
     * 模块 2：ROC 曲线
     * ============================================================ */
    renderRoc() {
      const S = this.state;
      if (!$('cv-roc')) return;
      const d = S.d, c = S.c;
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        const z = -3.4 + 6.8 * i / 200;
        const fa = U.Phi(z), h = U.Phi(z + d);
        pts.push([fa, h]);
      }
      const cur = SDT.ratesFromDC(d, c);
      const auc = SDT.aucFromD(d);
      C.plot($('cv-roc'), {
        xDomain: [0, 1], yDomain: [0, 1], xLabel: 'P(FA) 误报率', yLabel: 'P(H) 击中率',
        xFormat: 1, yFormat: 1,
        series: [
          { type: 'line', data: [[0, 0], [1, 1]], color: '#6E7B85', width: 1.4, dash: [5, 4], label: '随机猜测' },
          { type: 'line', data: pts, color: C.COLORS.blue, width: 2.4, label: 'ROC（d′ = ' + d.toFixed(2) + '）' },
          { type: 'points', data: [[cur.FA, cur.H]], color: C.COLORS.red, r: 6, label: '当前判定标准' }
        ],
        legend: 'bottom-left'
      });
      $('roc-auc').textContent = auc.toFixed(3);
      $('roc-ph').textContent = cur.H.toFixed(2);
      $('roc-pfa').textContent = cur.FA.toFixed(2);

      /* z 变换 ROC */
      if ($('cv-zroc')) {
        const sg = S.sigma || 1;
        const line = [], eq = [];
        for (let i = 0; i <= 100; i++) {
          const zf = -3.2 + 6.4 * i / 100;
          line.push([zf, (zf - d) / sg]);
          eq.push([zf, zf - d]);
        }
        const zf0 = U.PhiInv(cur.FA), zh0 = U.PhiInv(cur.H);
        C.plot($('cv-zroc'), {
          xDomain: [-3.2, 3.2], yDomain: [-3.2, 3.2],
          xLabel: 'z(P(FA))', yLabel: 'z(P(H))', xFormat: 1, yFormat: 1,
          series: [
            { type: 'line', data: [[-3.2, -3.2], [3.2, 3.2]], color: '#6E7B85', width: 1.4, dash: [5, 4] },
            { type: 'line', data: eq, color: '#7E8992', width: 1.6, dash: [6, 4], label: '等方差 (slope=1)' },
            { type: 'line', data: line, color: C.COLORS.purple, width: 2.4, label: '不等方差 slope=' + (1 / sg).toFixed(2) },
            { type: 'points', data: [[zf0, zh0]], color: C.COLORS.red, r: 5.5, label: '当前标准' }
          ],
          legend: 'bottom-left'
        });
        $('zroc-slope').textContent = (1 / sg).toFixed(2);
      }
    },

    /* ============================================================
     * 模块 3：先验概率与最优标准
     * ============================================================ */
    payoff() {
      const S = this.state;
      const bOpt = SDT.betaOpt(S.PS, S.VH, S.CM, S.CFA, S.VCR);
      const cOpt = SDT.cFromBeta(bOpt, S.d);
      return { beta: SDT.betaFromDC(S.d, S.c), bOpt: bOpt, cOpt: cOpt };
    },

    renderPayoff() {
      const S = this.state;
      if (!$('pay-ps')) return;
      const po = this.payoff();
      $('pay-ps').textContent = S.PS.toFixed(2);
      $('pay-pn').textContent = (1 - S.PS).toFixed(2);
      $('pay-bopt').textContent = isFinite(po.bOpt) ? po.bOpt.toFixed(2) : '∞';
      $('pay-bcur').textContent = po.beta.toFixed(2);
      $('pay-copt').textContent = isFinite(po.cOpt) ? po.cOpt.toFixed(2) : '—';
      $('pay-ccur').textContent = S.c.toFixed(2);
      $('pay-d').textContent = S.d.toFixed(2);
      $('psv').textContent = Math.round(S.PS * 100) + '%';

      /* 词条：把最优化标准与当前标准同时画出来 */
      if ($('cv-pay')) {
        const xc = SDT.criterionX(S.d, S.c);
        const xo = SDT.criterionX(S.d, isFinite(po.cOpt) ? po.cOpt : S.c);
        const hi = Math.max(4.2, S.d + 3.6), lo = -4.2, step = (hi - lo) / 260;
        const noise = [], signal = [];
        for (let x = lo; x <= hi + 1e-9; x += step) {
          noise.push([x, U.phi(x)]);
          signal.push([x, U.phi(x - S.d)]);
        }
        C.plot($('cv-pay'), {
          xDomain: [lo, hi], yDomain: [0, U.phi(0) * 1.3],
          xLabel: '内部反应强度', yLabel: '概率密度', yFormat: 2,
          series: [
            { type: 'area', data: noise, color: C.COLORS.noise, xClip: [xc, hi], alpha: 0.26 },
            { type: 'area', data: signal, color: C.COLORS.signal, xClip: [xc, hi], alpha: 0.26 },
            { type: 'line', data: noise, color: C.COLORS.noise, width: 2, label: '噪音' },
            { type: 'line', data: signal, color: C.COLORS.signal, width: 2, label: '信号' }
          ],
          vlines: [
            { x: xc, color: '#73C8B8', width: 2.2, label: '你的标准' },
            { x: xo, color: C.COLORS.gold, width: 2.2, dash: [6, 4], label: '最优标准' }
          ],
          legend: 'top-right', pad: { t: 34, r: 16, b: 44, l: 52 }
        });
      }
    },

    /* ============================================================
     * 模块 4：SDT 与机器学习
     * ============================================================ */
    renderML() {
      const S = this.state;
      if (!$('ml-auc')) return;
      const auc = S.auc;
      const d = U.PhiInv(auc) * Math.SQRT2;      // AUC = Φ(d'/√2) → d' = √2·Φ⁻¹(AUC)
      const xc = S.th;                            // 阈值取在分数轴上
      const H = 1 - U.Phi(xc - d);                // P(Hit) = Recall
      const FA = 1 - U.Phi(xc);                   // P(FA) = FPR = 1 − Specificity
      const N = 1000, nP = 500, nN = 500;
      const TP = Math.round(H * nP), FN = nP - TP;
      const FP = Math.round(FA * nN), TN = nN - FP;
      const prec = TP + FP > 0 ? TP / (TP + FP) : NaN;
      const rec = TP + FN > 0 ? TP / (TP + FN) : NaN;
      const f1 = isFinite(prec) && isFinite(rec) && prec + rec > 0 ? 2 * prec * rec / (prec + rec) : NaN;
      const spec = 1 - FA;
      const acc = (TP + TN) / N;
      const c = xc - d / 2;

      $('ml-aucv').textContent = auc.toFixed(2);
      $('ml-thv').textContent = xc.toFixed(2);
      $('ml-d').textContent = d.toFixed(2);
      $('ml-c').textContent = c.toFixed(2);
      $('ml-tp').textContent = TP; $('ml-fp').textContent = FP;
      $('ml-fn').textContent = FN; $('ml-tn').textContent = TN;
      $('ml-prec').textContent = U.fmt(prec, 3);
      $('ml-rec').textContent = U.fmt(rec, 3);
      $('ml-f1').textContent = U.fmt(f1, 3);
      $('ml-spec').textContent = U.fmt(spec, 3);
      $('ml-acc').textContent = U.pct(acc, 1);

      if ($('cv-ml')) {
        const lo = -4, hi = Math.max(5, d + 3.5), step = (hi - lo) / 260;
        const neg = [], pos = [];
        for (let x = lo; x <= hi + 1e-9; x += step) {
          neg.push([x, U.phi(x)]);
          pos.push([x, U.phi(x - d)]);
        }
        C.plot($('cv-ml'), {
          xDomain: [lo, hi], yDomain: [0, U.phi(0) * 1.3],
          xLabel: '模型输出分数', yLabel: '样本密度', yFormat: 2,
          series: [
            { type: 'area', data: neg, color: C.COLORS.blue, xClip: [xc, hi], alpha: 0.26 },
            { type: 'area', data: pos, color: C.COLORS.red, xClip: [xc, hi], alpha: 0.26 },
            { type: 'line', data: neg, color: C.COLORS.blue, width: 2, label: '负例 N(0,1)' },
            { type: 'line', data: pos, color: C.COLORS.red, width: 2, label: '正例 N(d′,1)' }
          ],
          vlines: [{ x: xc, color: '#73C8B8', width: 2.2, label: '分类阈值' }],
          legend: 'top-right', pad: { t: 34, r: 16, b: 44, l: 52 }
        });
      }
    },

    /* ============================================================
     * 模块 5：警觉衰退模拟（Mackworth 钟实验）
     * ============================================================ */
    vigCurve(k) {                    // k = 0..7 时段
      const S = this.state;
      const prog = k / 7;
      const d = S.dDown ? S.d0 * (1 - 0.55 * prog) : S.d0;
      const c = S.cShift ? S.c0 + 0.75 * prog : S.c0;
      return { d: Math.max(0.1, d), c: c };
    },

    renderVigStatic() {
      const S = this.state;
      if (!$('vig-dv')) return;
      $('vig-dv').textContent = S.d0.toFixed(1);
      $('vig-cv').textContent = S.c0.toFixed(2);
      if (!$('cv-vig1')) return;
      const dSeries = [], cSeries = [];
      for (let k = 0; k < 8; k++) {
        const v = this.vigCurve(k);
        dSeries.push([k + 1, v.d]);
        cSeries.push([k + 1, v.c]);
      }
      C.plot($('cv-vig1'), {
        xDomain: [0.5, 8.5], yDomain: [0, Math.max(4, S.d0 + 1)],
        xLabel: '时段（每段 15 分钟）', yLabel: '敏感性 d′', xFormat: 0, yFormat: 1,
        xTicks: [1, 2, 3, 4, 5, 6, 7, 8],
        series: [{ type: 'line', data: dSeries, color: C.COLORS.blue, width: 2.4, label: '理论预测 d′' }]
      });
      C.plot($('cv-vig2'), {
        xDomain: [0.5, 8.5], yDomain: [-1.5, Math.max(2, S.c0 + 1.5)],
        xLabel: '时段', yLabel: '判定标准 c', xFormat: 0, yFormat: 1,
        xTicks: [1, 2, 3, 4, 5, 6, 7, 8],
        hlines: [{ y: 0, color: '#4A535A', dash: [5, 4] }],
        series: [{ type: 'line', data: cSeries, color: C.COLORS.orange, width: 2.4, label: '理论预测 c' }]
      });
    },

    runVigilance() {
      const S = this.state;
      const N_SIG = 30, N_NOI = 270;           // 每时段事件数
      const dp = [], cp = [], hitRate = [], faRate = [];
      for (let k = 0; k < 8; k++) {
        const v = this.vigCurve(k);
        const th = SDT.ratesFromDC(v.d, v.c);
        let h = 0, fa = 0;
        for (let i = 0; i < N_SIG; i++) if (U.RNG.next() < th.H) h++;
        for (let i = 0; i < N_NOI; i++) if (U.RNG.next() < th.FA) fa++;
        const r = SDT.loglinear(h, fa, N_SIG, N_NOI);
        dp.push([k + 1, SDT.dprimeFromRates(r.H, r.FA)]);
        cp.push([k + 1, SDT.cFromRates(r.H, r.FA)]);
        hitRate.push([k + 1, h / N_SIG]);
        faRate.push([k + 1, fa / N_NOI]);
      }
      const dLine = [], cLine = [];
      for (let k = 0; k < 8; k++) {
        const v = this.vigCurve(k);
        dLine.push([k + 1, v.d]); cLine.push([k + 1, v.c]);
      }
      C.plot($('cv-vig1'), {
        xDomain: [0.5, 8.5], yDomain: [0, Math.max(4, S.d0 + 1)],
        xLabel: '时段（每段 15 分钟）', yLabel: '敏感性 d′', xFormat: 0, yFormat: 1,
        xTicks: [1, 2, 3, 4, 5, 6, 7, 8],
        series: [
          { type: 'line', data: dLine, color: '#7E8992', width: 1.6, dash: [6, 4], label: '理论 d′' },
          { type: 'line', data: dp, color: C.COLORS.blue, width: 2.4, label: '实测 d′（含抽样波动）' }
        ],
        legend: 'top-right'
      });
      C.plot($('cv-vig2'), {
        xDomain: [0.5, 8.5], yDomain: [-1.5, Math.max(2, S.c0 + 1.5)],
        xLabel: '时段', yLabel: '判定标准 c', xFormat: 0, yFormat: 1,
        xTicks: [1, 2, 3, 4, 5, 6, 7, 8],
        hlines: [{ y: 0, color: '#4A535A', dash: [5, 4] }],
        series: [
          { type: 'line', data: cLine, color: '#7E8992', width: 1.6, dash: [6, 4], label: '理论 c' },
          { type: 'line', data: cp, color: C.COLORS.orange, width: 2.4, label: '实测 c' }
        ],
        legend: 'top-right'
      });

      const sum = $('vig-sum');
      if (sum) {
        sum.innerHTML = '<b>本时段结果：</b>' +
          '第1段 d′=' + U.fmt(dp[0][1], 2) + '、c=' + U.fmt(cp[0][1], 2) + '；' +
          '第8段 d′=' + U.fmt(dp[7][1], 2) + '、c=' + U.fmt(cp[7][1], 2) + '。' +
          '2 小时内变化：Δd′ = ' + U.fmt(dp[7][1] - dp[0][1], 2) +
          '，Δc = ' + U.fmt(cp[7][1] - cp[0][1], 2) + '。' +
          '<br>注意每段只有 30 个信号事件，d′ 的抽样波动本身就很大——' +
          '这正是真实警觉实验中必须用长时段和多名被试的原因。';
      }
    }
  };

  /* ---------- 小工具 ---------- */
  function bindRange(id, fn) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      const lab = $(id + 'v');
      if (lab) lab.textContent = Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : v.toFixed(1);
      fn(v);
    });
  }
  function setRange(id, v) {
    const el = $(id);
    if (!el) return;
    el.value = v;
    const lab = $(id + 'v');
    if (lab) lab.textContent = Math.abs(v) < 1 && v !== 0 ? Number(v).toFixed(2) : Number(v).toFixed(1);
  }

  global.Lab = Lab;
})(typeof window !== 'undefined' ? window : globalThis);
