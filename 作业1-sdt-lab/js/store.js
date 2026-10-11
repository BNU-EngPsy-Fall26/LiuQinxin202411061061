/* ============================================================
 * store.js —— 本地数据存储（localStorage，带内存回退）
 * 记录结构：见 Store.add()
 * ============================================================ */
(function (global) {
  'use strict';

  const KEY = 'sdtlab.records.v1';
  const UKEY = 'sdtlab.user.v1';

  let memory = [];              // localStorage 不可用时（隐私模式等）的内存回退
  let usable = true;
  try {
    const t = '__sdt_test__';
    global.localStorage.setItem(t, '1');
    global.localStorage.removeItem(t);
  } catch (e) { usable = false; }

  function read() {
    if (!usable) return memory.slice();
    try {
      const raw = global.localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function write(arr) {
    memory = arr.slice();
    if (!usable) return;
    try { global.localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) { usable = false; }
  }

  const Store = {
    isPersistent() { return usable; },

    /* ---------- 被试信息 ---------- */
    user: null,
    loadUser() {
      if (!usable) return this.user;
      try { this.user = JSON.parse(global.localStorage.getItem(UKEY) || 'null'); }
      catch (e) { this.user = null; }
      return this.user;
    },
    saveUser(u) {
      this.user = u;
      if (usable) { try { global.localStorage.setItem(UKEY, JSON.stringify(u)); } catch (e) { } }
    },
    logout() {
      this.user = null;
      if (usable) { try { global.localStorage.removeItem(UKEY); } catch (e) { } }
    },

    /* ---------- 成绩记录 ---------- */
    /* rec = { sid, name, guest, game, gameName, dSetting, nTrials, nS, nN,
     *         feedback, hits, miss, fa, cr, PH, PFA, c, dprime, beta,
     *         aprime, acc, optC } */
    add(rec) {
      const arr = read();
      rec.id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
      rec.ts = Date.now();
      arr.push(rec);
      write(arr);
      return rec;
    },
    all() { return read(); },
    /* 合并外部导入的记录（按 id 去重） */
    merge(list) {
      const arr = read();
      const seen = {};
      arr.forEach(r => { seen[r.id] = 1; });
      let added = 0;
      (list || []).forEach(r => {
        if (!r || !r.game) return;
        if (!r.id) r.id = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
        if (seen[r.id]) return;
        if (!r.ts) r.ts = Date.now();
        seen[r.id] = 1; arr.push(r); added++;
      });
      write(arr);
      return added;
    },
    clear() { write([]); },

    /* ---------- 导出 ---------- */
    toCSV(rows) {
      const cols = ['ts', 'sid', 'name', 'guest', 'gameName', 'nTrials', 'dSetting', 'feedback',
        'stimMs', 'hits', 'miss', 'fa', 'cr', 'PH', 'PFA', 'dprime', 'c', 'beta', 'aprime', 'acc', 'optC'];
      const head = ['时间', '学号', '姓名', '游客', '游戏', '试次数', '设定d\'', '逐试次反馈', '图片限时(秒)',
        '击中H', '漏报M', '误报FA', '正确拒斥CR', 'P(H)', 'P(FA)', 'd\'', 'c', 'β', 'A\'', '准确率', '最优c'];
      const esc = v => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const INT = ['nTrials', 'hits', 'miss', 'fa', 'cr'];
      const lines = [head.map(esc).join(',')];
      (rows || []).forEach(r => {
        const row = cols.map(k => {
          if (k === 'ts') return esc(new Date(r.ts).toLocaleString('zh-CN'));
          if (k === 'guest') return esc(r.guest ? '是' : '否');
          if (k === 'feedback') return esc(r.feedback ? '开启' : '关闭');
          if (k === 'stimMs') return esc(r.stimMs ? (r.stimMs / 1000).toFixed(1) : '不限');
          const v = r[k];
          if (typeof v === 'number' && !isFinite(v)) return '';
          if (typeof v === 'number' && ['PH', 'PFA', 'acc'].indexOf(k) >= 0) return (v * 100).toFixed(1) + '%';
          if (typeof v === 'number' && INT.indexOf(k) >= 0) return String(Math.round(v));
          if (typeof v === 'number') return v.toFixed(k === 'dSetting' ? 1 : 3);
          return esc(v);
        });
        lines.push(row.join(','));
      });
      return '﻿' + lines.join('\r\n');
    },
    exportJSON(rows) { return JSON.stringify(rows || read(), null, 2); }
  };

  global.Store = Store;
})(typeof window !== 'undefined' ? window : globalThis);
