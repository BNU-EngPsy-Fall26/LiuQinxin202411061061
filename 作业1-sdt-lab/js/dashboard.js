/* ============================================================
 * dashboard.js —— 教师管理后台
 * 数据来自本机 localStorage，可导出 CSV / JSON，也可导入合并
 * ============================================================ */
(function (global) {
  'use strict';

  const U = Util, C = Charts;
  const $ = id => document.getElementById(id);

  /* 四个场景在 ROC 图上的颜色：为炭灰底选的高饱和亮色，两两之间色相拉开 */
  const GAME_COLOR = { mushroom: '#D08A4A', bird: '#6ED08C', antique: '#B48CE8', qc: '#5FA8E8' };
  const GAME_NAME = { mushroom: '采蘑菇', bird: '观鸟', antique: '鉴假员', qc: '质检员' };
  const GAME_IDS = ['mushroom', 'antique', 'bird', 'qc'];

  const Dash = {
    filter: 'all',
    inited: false,

    init() {
      if (this.inited) return;
      this.inited = true;

      document.querySelectorAll('.dash-filter').forEach(b => {
        b.addEventListener('click', () => {
          this.filter = b.dataset.game;
          document.querySelectorAll('.dash-filter').forEach(x =>
            x.classList.toggle('active', x.dataset.game === this.filter));
          this.render();
        });
      });

      bind('btn-refresh', () => this.render());
      bind('btn-csv', () => this.download('sdt-lab-' + stamp() + '.csv', Store.toCSV(this.rows()), 'text/csv'));
      bind('btn-json', () => this.download('sdt-lab-' + stamp() + '.json', Store.exportJSON(this.rows()), 'application/json'));
      bind('btn-clear', () => {
        if (confirm('确定清空本机保存的全部成绩记录吗？此操作不可撤销。')) {
          Store.clear(); this.render();
        }
      });
      bind('btn-import', () => { const f = $('file-import'); if (f) f.click(); });
      const fi = $('file-import');
      if (fi) fi.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const data = JSON.parse(fr.result);
            const n = Store.merge(Array.isArray(data) ? data : [data]);
            alert('已合并 ' + n + ' 条新记录。');
            this.render();
          } catch (err) { alert('文件解析失败：' + err.message); }
        };
        fr.readAsText(file, 'utf-8');
        e.target.value = '';
      });

      const note = $('store-note');
      if (note && !Store.isPersistent()) {
        note.textContent = '⚠ 浏览器本地存储不可用（可能处于隐私模式），数据只保存在当前页面内存中。';
        note.style.display = '';
      }
    },

    rows() {
      const all = Store.all();
      return this.filter === 'all' ? all : all.filter(r => r.game === this.filter);
    },

    render() {
      if (!$('dash-tbody')) return;
      const rows = this.rows();
      const all = Store.all();

      const players = {};
      all.forEach(r => { players[r.sid + '|' + r.name] = 1; });
      $('dash-count').textContent = rows.length;
      $('dash-players').textContent = Object.keys(players).length;

      this.renderRoc(rows);
      this.renderHist(rows);
      this.renderC(rows);
      this.renderGameMean(rows);
      this.renderIdeal(rows);
      this.renderTable(rows);
    },

    /* ---------- 班级 ROC 散点 ---------- */
    renderRoc(rows) {
      if (!$('cv-dash-roc')) return;
      const byGame = {};
      GAME_IDS.forEach(g => { byGame[g] = []; });
      rows.forEach(r => {
        if (byGame[r.game]) byGame[r.game].push([r.PFA, r.PH]);
      });
      const series = [{
        type: 'line', data: [[0, 0], [1, 1]], color: '#6E7B85', width: 1.4, dash: [5, 4], label: '随机猜测'
      }];
      GAME_IDS.forEach(g => {
        if (!byGame[g] || !byGame[g].length) return;
        series.push({
          type: 'points', data: byGame[g], color: GAME_COLOR[g], r: 5.5, alpha: 0.85, ring: true,
          label: GAME_NAME[g]
        });
      });
      C.plot($('cv-dash-roc'), {
        xDomain: [0, 1], yDomain: [0, 1], xFormat: 1, yFormat: 1,
        xLabel: 'P(FA) 误报率', yLabel: 'P(H) 击中率',
        series: series, legend: 'bottom-left'
      });
    },

    /* ---------- d′ 直方图 ---------- */
    renderHist(rows) {
      if (!$('cv-dash-d')) return;
      const vals = rows.map(r => r.dprime).filter(v => isFinite(v));
      const bins = 16, lo = -1, hi = 5;
      const counts = new Array(bins).fill(0);
      vals.forEach(v => {
        let i = Math.floor((U.clamp(v, lo, hi - 1e-6) - lo) / (hi - lo) * bins);
        counts[i]++;
      });
      const w = (hi - lo) / bins;
      const data = counts.map((c, i) => [lo + w * (i + 0.5), c]);
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
      const yt = intTicks(Math.max.apply(null, counts));
      C.plot($('cv-dash-d'), {
        xDomain: [lo, hi], yDomain: [0, yt.top], yTicks: yt.ticks,
        xLabel: '敏感性 d′', yLabel: '人数', xFormat: 1, yFormat: 0,
        series: [{ type: 'bars', data: data, barWidth: (hi - lo) / bins * 0.82, color: '#5FA8E8', label: '人数' }],
        vlines: isFinite(mean) ? [{ x: mean, color: '#F2797C', width: 2, dash: [6, 4], label: '均值 ' + mean.toFixed(2) }] : []
      });
    },

    /* ---------- c 分布 ---------- */
    renderC(rows) {
      if (!$('cv-dash-c')) return;
      const vals = rows.map(r => r.c).filter(v => isFinite(v));
      const bins = 16, lo = -2.5, hi = 2.5;
      const counts = new Array(bins).fill(0);
      vals.forEach(v => {
        let i = Math.floor((U.clamp(v, lo, hi - 1e-6) - lo) / (hi - lo) * bins);
        counts[i]++;
      });
      const w = (hi - lo) / bins;
      const data = counts.map((c, i) => [lo + w * (i + 0.5), c]);
      const yt = intTicks(Math.max.apply(null, counts));
      C.plot($('cv-dash-c'), {
        xDomain: [lo, hi], yDomain: [0, yt.top], yTicks: yt.ticks,
        xLabel: '判定标准 c（< 0 宽松，> 0 谨慎）', yLabel: '人数', xFormat: 1, yFormat: 0,
        series: [{ type: 'bars', data: data, barWidth: (hi - lo) / bins * 0.82, color: '#F0A85C' }],
        vlines: [{ x: 0, color: '#73C8B8', width: 1.6, dash: [5, 4], label: '中立' }]
      });
    },

    /* ---------- 各场景平均 d′ ---------- */
    renderGameMean(rows) {
      if (!$('cv-dash-game')) return;
      const games = GAME_IDS.map(id => [id, GAME_NAME[id]]);
      const nG = games.length;
      const data = games.map(([id], i) => {
        const v = rows.filter(r => r.game === id).map(r => r.dprime).filter(isFinite);
        const m = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
        return { x: i, mean: m, n: v.length };
      });
      C.plot($('cv-dash-game'), {
        xDomain: [-0.7, nG - 0.3], yDomain: [0, Math.max(2.2, Math.max.apply(null, data.map(d => d.mean)) * 1.25)],
        xTicks: games.map((g, i) => i), yFormat: 1, yLabel: '平均 d′',
        series: [{ type: 'bars', data: data.map((d, i) => [i, d.mean]), barWidth: 0.5, color: '#73C8B8' }],
        legend: false,
        pad: { t: 26, r: 20, b: 26, l: 48 }
      });
      const ctx = $('cv-dash-game').getContext('2d');
      const dpr = global.devicePixelRatio || 1;
      const W = $('cv-dash-game').clientWidth, H = $('cv-dash-game').clientHeight;
      ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = '12px "PingFang SC",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#E2E4E7';
      const padL = 48, padR = 20, pw = W - padL - padR;
      games.forEach(([, name], i) => {
        const x = padL + (i + 0.5) / nG * pw;
        ctx.fillText(name + '（n=' + data[i].n + '）', x, H - 8);
      });
      ctx.restore();
    },

    /* ---------- 经验 d′ vs 系统设定 d′ ---------- */
    renderIdeal(rows) {
      if (!$('cv-dash-ideal')) return;
      const pts = rows.filter(r => isFinite(r.dprime))
        .map(r => [r.dSetting, r.dprime]);
      const mx = 4;
      C.plot($('cv-dash-ideal'), {
        xDomain: [0, mx], yDomain: [0, mx], xFormat: 1, yFormat: 1,
        xLabel: '系统设定 d′（理想观察者）', yLabel: '个人经验 d′',
        series: [
          { type: 'line', data: [[0, 0], [mx, mx]], color: '#7E8992', width: 1.8, dash: [6, 4], label: '理想观察者（对角线）' },
          { type: 'points', data: pts, r: 5, alpha: 0.8, ring: true, colorFn: p => '#5FA8E8', color: '#5FA8E8', label: '每条记录' }
        ],
        legend: 'bottom-left'
      });
    },

    /* ---------- 明细表 ---------- */
    renderTable(rows) {
      const tb = $('dash-tbody');
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="15" class="empty">暂无数据——让同学先完成一轮实验吧</td></tr>';
        return;
      }
      const sorted = rows.slice().sort((a, b) => b.ts - a.ts);
      tb.innerHTML = sorted.map(r => {
        const t = new Date(r.ts);
        const ts = t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) +
          ' ' + pad2(t.getHours()) + ':' + pad2(t.getMinutes());
        return '<tr>' +
          '<td>' + esc(r.sid) + '</td>' +
          '<td>' + esc(r.name) + '</td>' +
          '<td>' + esc(r.gameName) + '</td>' +
          '<td class="num">' + r.hits + '</td>' +
          '<td class="num">' + r.miss + '</td>' +
          '<td class="num">' + r.fa + '</td>' +
          '<td class="num">' + r.cr + '</td>' +
          '<td class="num">' + U.fmt(r.PH, 2) + '</td>' +
          '<td class="num">' + U.fmt(r.PFA, 2) + '</td>' +
          '<td class="num"><b>' + U.fmt(r.dprime, 2) + '</b></td>' +
          '<td class="num">' + U.fmt(r.c, 2) + '</td>' +
          '<td class="num">' + Math.round(r.acc * 100) + '%</td>' +
          '<td class="num">' + U.fmt(r.dSetting, 1) + '</td>' +
          '<td class="num">' + r.nTrials + '</td>' +
          '<td>' + ts + '</td>' +
          '</tr>';
      }).join('');
    },

    download(name, text, mime) {
      const blob = new Blob([text], { type: mime + ';charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
  };

  /* 人数直方图的整数刻度：避免 niceTicks 产生 0,0,1,1 这类重复标签 */
  function intTicks(max) {
    const raw = Math.max(1, max) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag);
    const top = Math.max(step, Math.ceil(Math.max(1, max) / step) * step);
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    return { ticks, top };
  }

  function bind(id, fn) { const el = $(id); if (el) el.addEventListener('click', fn); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp() {
    const d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
  }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  global.Dash = Dash;
})(typeof window !== 'undefined' ? window : globalThis);
