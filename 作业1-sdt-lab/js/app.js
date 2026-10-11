/* ============================================================
 * app.js —— 页面路由 / 登录 / 事件绑定
 * ============================================================ */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);

  const App = {
    screen: 'login',
    lastRole: 'mushroom',
    started: false,

    init() {
      /* --- 角色卡片 --- */
      const wrap = $('game-cards');
      if (wrap) {
        wrap.innerHTML = Games.RoleList.map(r => (
          '<div class="g-card" data-role="' + r.id + '">' +
          '<div class="g-icon">' + r.icon + '</div>' +
          '<h3>' + r.name + '</h3>' +
          '<div class="g-sub">' + r.subtitle + '</div>' +
          '<p class="g-desc">' + (r.cardDesc || r.desc) + '</p>' +
          '<div class="g-meta"><span>信号先验 P(S) = ' + Math.round(r.PS * 100) + '%</span>' +
          (r.focus ? '<span class="hot">' + r.focus + '</span>' : '') + '</div>' +
          '<div class="g-go">进入场景 →</div>' +
          '</div>'
        )).join('');
        wrap.querySelectorAll('.g-card').forEach(card => {
          card.addEventListener('click', () => this.pickRole(card.dataset.role));
        });
      }

      /* --- 登录 --- */
      const u = Store.loadUser();
      if (u) { if ($('in-sid')) $('in-sid').value = u.sid || ''; if ($('in-name')) $('in-name').value = u.name || ''; }
      $('btn-login') && $('btn-login').addEventListener('click', () => {
        const sid = ($('in-sid').value || '').trim();
        const name = ($('in-name').value || '').trim();
        if (!sid || !name) {
          $('login-err').textContent = '请填写学号和姓名，或选择游客模式。';
          return;
        }
        Store.saveUser({ sid: sid, name: name });
        this.updateWho();
        this.go('select');
      });
      $('btn-guest') && $('btn-guest').addEventListener('click', () => {
        Store.logout(); this.updateWho(); this.go('select');
      });
      ['in-sid', 'in-name'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-login').click(); });
      });

      /* --- 选择页控件 --- */
      const sd = $('sel-d');
      if (sd) {
        const upd = () => {
          $('sel-d-val').textContent = parseFloat(sd.value).toFixed(1);
          const v = parseFloat(sd.value);
          $('sel-d-hint').textContent = v <= 1.0 ? '很难：信号与噪音高度重叠'
            : v <= 2.0 ? '中等难度' : v <= 2.8 ? '偏易' : '很容易：两者几乎不会混淆';
        };
        sd.addEventListener('input', upd); upd();
      }

      /* --- 游戏页 --- */
      Games.Game.init({
        canvas: $('gameCanvas'), guide: $('guideCanvas'), stimBar: $('stimBar'),
        progress: $('g-progress'), stim: $('g-stim'), tally: $('g-tally'), flash: $('flash'),
        mute: $('btn-mute')
      });
      Games.Sound.load();
      $('btn-mute') && $('btn-mute').addEventListener('click', () => {
        Games.Sound.setMuted(!Games.Sound.muted);
        Games.Game.updateMuteBtn();
      });
      $('btn-yes') && $('btn-yes').addEventListener('click', () => Games.Game.respond(true));
      $('btn-no') && $('btn-no').addEventListener('click', () => Games.Game.respond(false));
      $('btn-start') && $('btn-start').addEventListener('click', () => this.hideIntro());
      $('btn-real') && $('btn-real').addEventListener('click', () => this.hideReady());
      document.addEventListener('keydown', e => {
        if (this.screen !== 'game') return;
        /* 说明层和"练习结束"过渡层盖着的时候不接受作答 */
        if (!$('introOverlay').classList.contains('hide')) return;
        if ($('readyOverlay') && !$('readyOverlay').classList.contains('hide')) return;
        const k = e.key.toLowerCase();
        if (k === 'f' || k === '1' || k === 'arrowleft') { e.preventDefault(); Games.Game.respond(true); }
        if (k === 'j' || k === '2' || k === 'arrowright') { e.preventDefault(); Games.Game.respond(false); }
      });

      /* --- 结果页 --- */
      $('btn-again') && $('btn-again').addEventListener('click', () => this.pickRole(this.lastRole));
      $('btn-other') && $('btn-other').addEventListener('click', () => this.go('select'));
      $('btn-tolab') && $('btn-tolab').addEventListener('click', () => this.go('lab'));

      /* --- 顶栏 --- */
      $('btn-dash') && $('btn-dash').addEventListener('click', () => this.go('dash'));
      $('btn-home') && $('btn-home').addEventListener('click', () => this.go('select'));
      $('btn-logout') && $('btn-logout').addEventListener('click', () => {
        Store.logout(); this.updateWho(); this.go('login');
      });

      /* --- 选择页底部直达链接 --- */
      const tl = $('to-lab-link');
      if (tl) tl.addEventListener('click', e => { e.preventDefault(); this.go('lab'); });

      /* --- 实验室 / 后台 --- */
      Lab.init();
      Dash.init();

      global.addEventListener('resize', debounce(() => this.redraw(), 160));

      this.updateWho();
      this.go(Store.user ? 'select' : 'login');
      this.started = true;
    },

    updateWho() {
      const el = $('whoami');
      if (!el) return;
      const u = Store.user;
      el.textContent = u ? ('👤 ' + u.name + '（' + u.sid + '）') : '游客模式';
      const lo = $('btn-logout');
      if (lo) lo.style.display = u ? '' : 'none';
    },

    go(name) {
      if (name === 'lab') Lab.init();
      if (name === 'dash') { Dash.init(); Dash.render(); }
      this.screen = name;
      document.querySelectorAll('.screen').forEach(s => {
        s.classList.toggle('active', s.id === 'screen-' + name);
      });
      const bar = $('topbar-actions');
      if (bar) bar.style.display = (name === 'login') ? 'none' : '';
      global.scrollTo(0, 0);
      setTimeout(() => this.redraw(), 30);
    },

    pickRole(id) {
      this.lastRole = id;
      const R = Games.Roles[id];
      const d = $('sel-d') ? parseFloat($('sel-d').value) : 1.8;
      const n = document.querySelector('input[name="sel-n"]:checked');
      const nTrials = n ? parseInt(n.value, 10) : 20;
      const fb = $('sel-fb') ? $('sel-fb').checked : false;
      const st = document.querySelector('input[name="sel-stim"]:checked');
      const stimMs = st ? parseInt(st.value, 10) : 3000;

      Games.Game.start(id, { d: d, n: nTrials, feedback: fb, stimMs: stimMs });
      this.go('game');

      /* 任务说明层：只留三块——这一关在干什么、该看哪些线索、接下来怎么走。
         奖惩表、P(S) 换算成次数、"画面只显示几秒"这几句都撤了：
         前两者在选择页的卡片标签（先验 P(S)）与结果页里还会出现，限时则靠画面底部的倒计时条实时显示。 */
      $('introTitle').innerHTML = R.icon + ' ' + R.name + '　<span class="intro-sub">' + R.scene + '</span>';
      $('introBody').innerHTML =
        '<p class="intro-desc">' + R.desc + '</p>' +
        '<p class="intro-cue"><b>观察提示：</b>' + R.cue + '</p>' +
        '<p class="muted">先做 <b>' + Games.Game.nP + '</b> 次练习（答完立刻告诉你对错，不计分），' +
        '再做 <b>' + nTrials + '</b> 次正式判断：判断每个画面「' + R.yes + '」还是「' + R.no + '」。</p>' +
        (R.smash ? '<p class="muted">按「' + R.yes + '」= 抡锤砸碎，带碎裂动画和音效（右上角可静音）。</p>' : '') +
        '<p class="muted">快捷键：<b>F / ←</b> 选「' + R.yes + '」，<b>J / →</b> 选「' + R.no + '」</p>';
      $('introOverlay').classList.remove('hide');
      $('g-role').textContent = R.icon + ' ' + R.name;
      $('g-sub').textContent = R.scene;
      $('btn-yes').textContent = R.yes;
      $('btn-no').textContent = R.no;
      $('btn-yes').className = 'ans-btn ans-yes';
      $('btn-no').className = 'ans-btn ans-no';
    },

    hideIntro() {
      $('introOverlay').classList.add('hide');
      /* 说明层收起之后才真正开始：这时页面可见、画布尺寸正确，限时也从这一刻起算 */
      Games.Game.begin();
    },

    /* 练习试次做完了（引擎回调）：先停下来打个招呼，再进正式实验，
       免得同学以为"怎么突然开始算分了"。 */
    showReady() {
      const fb = Games.Game.feedback;
      const n = Games.Game.n;
      $('readyTitle').innerHTML = '✅ 练习结束';
      $('readyBody').innerHTML =
        '<p class="intro-desc">刚才那 <b>' + Games.Game.nP + '</b> 次是练习，<b>不计入成绩</b>。' +
        '下面开始<b>正式实验</b>：还有 <b>' + n + '</b> 次判断，<b>这 ' + n + ' 次会计入你的结果</b>。</p>' +
        '<p class="muted">' + (fb
          ? '正式试次仍然会亮 ✓ / ✗，但不再告诉你它实际是什么。'
          : '正式试次不会再告诉你对错——知道对错，标准就被它牵着走了。') + '</p>';
      $('readyOverlay').classList.remove('hide');
    },

    hideReady() {
      $('readyOverlay').classList.add('hide');
      Games.Game.beginReal();
    },

    redraw() {
      if (!this.started) return;
      if (this.screen === 'game') Games.Game.redraw();
      if (this.screen === 'lab') Lab.renderAll();
      if (this.screen === 'dash') Dash.render();
    }
  };

  function debounce(fn, ms) {
    let t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  global.App = App;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
