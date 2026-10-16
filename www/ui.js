/* =========================================================
 * ui.js — 界面控制、输入、游戏主循环
 * =======================================================*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const screens = {
    menu: $('menu'),
    online: $('online'),
    settings: $('settings'),
    game: $('game'),
  };

  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  // ---- 预览画布 ----
  const preview = $('previewCanvas');
  const pctx = preview.getContext('2d');
  let pt = 0;
  (function previewLoop() {
    pt += 1 / 60;
    pctx.clearRect(0, 0, preview.width, preview.height);
    window.FrogArt.drawFrog(pctx, 110, 190, 200, {
      theme: 'player', t: pt, look: Math.sin(pt) * 0.5,
      squash: Math.sin(pt * 2) * 0.08,
    });
    if (screens.menu.classList.contains('active')) requestAnimationFrame(previewLoop);
  })();

  // ---- 服务器提示 ----
  const net = new window.Net();
  function refreshServerHint() {
    $('serverHint').textContent = '服务器：' + net.getServer();
    $('serverInput').value = net.getServer();
  }
  refreshServerHint();

  // ---- 游戏引擎 ----
  const canvas = $('gameCanvas');
  const engine = new window.Engine(canvas, {
    net: net,
    onFinish: onFinish,
    onScore: onScore,
  });

  let lastT = performance.now();
  function loop(now) {
    const dt = (now - lastT) / 1000;
    lastT = now;
    if (screens.game.classList.contains('active')) engine.frame(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function onScore(info) {
    $('hudScore1').textContent = info.me.score;
    if (info.rivalActive) $('hudScore2').textContent = info.rival.score || 0;
  }

  let finished = false;
  function onFinish(res) {
    if (finished) return;
    finished = true;
    engine.paused = true;
    showResult(res);
  }

  function showResult(res) {
    $('resultTitle').textContent = res.dead ? '撞到啦～' : '冲线完成！';
    $('rName1').textContent = myName;
    $('rScore1').textContent = res.score;
    if (engine.rivalActive) {
      $('rName2').textContent = engine.rival.name || '对手';
      $('rScore2').textContent = engine.rival.score || 0;
    } else {
      $('rName2').textContent = '对手';
      $('rScore2').textContent = '-';
    }
    $('result').classList.remove('hidden');
  }

  // ================= 菜单按钮 =================
  let myName = '奶蛙';
  let inRoom = false;
  let isHost = false;

  $('btnSolo').onclick = () => {
    myName = '奶蛙';
    startGame('solo', false);
  };

  $('btnOnline').onclick = () => {
    show('online');
    $('matchHint').textContent = '输入房间号，或点随机匹配';
  };

  $('btnSettings').onclick = () => { show('settings'); };

  $('btnBack1').onclick = () => { net.leave(); show('menu'); };
  $('btnBack2').onclick = () => { show('menu'); };

  $('btnSave').onclick = () => {
    const url = $('serverInput').value.trim();
    if (!url) return;
    net.setServer(url);
    refreshServerHint();
    $('matchHint').textContent = '已保存：' + url;
    show('menu');
  };

  // ================= 联网匹配 =================
  let connecting = false;

  async function ensureConnected() {
    if (connecting) return;
    connecting = true;
    $('matchHint').textContent = '正在连接服务器…';
    try {
      await net.connect();
      $('matchHint').textContent = '已连接，等待房间信息…';
    } catch (e) {
      $('matchHint').textContent = '❌ ' + e.message + '（请检查服务器地址）';
      connecting = false;
      throw e;
    }
    connecting = false;
  }

  $('btnJoin').onclick = async () => {
    const room = $('roomInput').value.trim() || '8888';
    myName = $('nameInput').value.trim() || '奶蛙';
    try { await ensureConnected(); } catch (e) { return; }
    net.join(room, myName);
    $('matchHint').textContent = `已进入房间 ${room}，等待对手…`;
  };

  $('btnRandom').onclick = async () => {
    myName = $('nameInput').value.trim() || '奶蛙';
    try { await ensureConnected(); } catch (e) { return; }
    net.randomMatch(myName);
    $('matchHint').textContent = '正在随机匹配…';
  };

  // ================= 网络事件 =================
  net.on('joined', (msg) => {
    inRoom = true;
    isHost = msg.host;
    $('matchHint').textContent = `已进入房间 ${msg.roomId}，你是${isHost ? '房主' : '加入者'}，等待对手…`;
  });

  net.on('roomState', (msg) => {
    const n = (msg.players || []).length;
    if (n >= 2) {
      $('matchHint').textContent = '对手已到齐！准备开始…';
      // 房主发开始
      if (isHost && !engine.running) {
        net.send({ type: 'begin' });
      }
    } else {
      $('matchHint').textContent = `房间里 ${n} 人，等待对手…（把房间号告诉朋友）`;
    }
  });

  net.on('start', () => {
    startGame('online', true);
  });

  net.on('countdown', (msg) => {
    showCountdown(msg.n);
  });

  net.on('opponentState', (st) => {
    engine.applyOpponent(st);
  });

  net.on('opponentLeft', () => {
    $('netBadge').textContent = '对手已离开';
    $('netBadge').classList.add('off');
    $('netBadge').classList.remove('hidden');
  });

  net.on('opponentFinished', (msg) => {
    if (engine.rivalActive) engine.rival.score = msg.score;
  });

  net.on('disconnected', () => {
    $('netBadge').textContent = '断线重连中…';
    $('netBadge').classList.add('off');
    $('netBadge').classList.remove('hidden');
  });

  net.on('connected', () => {
    $('netBadge').textContent = '已连接';
    $('netBadge').classList.remove('off');
  });

  net.on('serverError', (m) => {
    $('matchHint').textContent = '服务器：' + m;
  });

  // ================= 倒计时 =================
  let cdTimers = [];
  function showCountdown(n) {
    const el = $('countdown');
    el.classList.remove('hidden');
    el.textContent = n;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'pop .3s ease';
  }
  function startCountdownThenGo(cb) {
    cdTimers.forEach(clearTimeout); cdTimers = [];
    const seq = ['3', '2', '1', 'GO!'];
    seq.forEach((s, i) => {
      cdTimers.push(setTimeout(() => {
        const el = $('countdown');
        el.classList.remove('hidden');
        el.textContent = s;
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = 'pop .3s ease';
        if (i === seq.length - 1) {
          setTimeout(() => el.classList.add('hidden'), 500);
          cb();
        }
      }, i * 700));
    });
  }

  // ================= 开始游戏 =================
  function startGame(mode, withCountdown) {
    finished = false;
    $('result').classList.add('hidden');
    $('hudName1').textContent = myName;
    $('hudName2').textContent = (net.opponent && net.opponent.name) || '对手';
    $('hudScore1').textContent = '0';
    $('hudScore2').textContent = '0';
    if (mode === 'online') {
      $('netBadge').textContent = '已连接';
      $('netBadge').classList.remove('off', 'hidden');
    } else {
      $('netBadge').classList.add('hidden');
    }

    show('game');
    engine.reset();
    engine.me.name = myName;

    if (withCountdown) {
      engine.running = false;
      engine.paused = true;
      startCountdownThenGo(() => {
        engine.start('online');
        if (net.opponent) engine.applyOpponent(net.opponent);
      });
    } else {
      engine.start(mode);
    }
  }

  // ================= 输入 =================
  // 键盘（桌面调试）
  window.addEventListener('keydown', (e) => {
    if (!screens.game.classList.contains('active')) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') engine.move(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd') engine.move(1);
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') engine.jump();
    else if (e.key === 'ArrowDown' || e.key === 's') engine.slide();
  });

  // 触屏滑动手势
  let touchStart = null;
  const touchLayer = $('touchLayer');
  touchLayer.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  touchLayer.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const TH = 24;
    if (adx < TH && ady < TH) {
      engine.jump();
    } else if (adx > ady) {
      engine.move(dx > 0 ? 1 : -1);
    } else {
      if (dy < 0) engine.jump(); else engine.slide();
    }
    touchStart = null;
  }, { passive: true });

  // 点击四个操作区（快速响应）
  document.querySelectorAll('.touch-zone').forEach(z => {
    z.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (z.classList.contains('zone-left')) engine.move(-1);
      else if (z.classList.contains('zone-right')) engine.move(1);
      else if (z.classList.contains('zone-up')) engine.jump();
      else if (z.classList.contains('zone-down')) engine.slide();
    }, { passive: false });
  });

  // ================= 暂停 / 结算按钮 =================
  $('btnPause').onclick = () => {
    if (!engine.running) return;
    engine.paused = !engine.paused;
    $('btnPause').textContent = engine.paused ? '▶' : 'II';
  };

  $('btnAgain').onclick = () => {
    $('result').classList.add('hidden');
    if (engine.mode === 'online' && net.connected) {
      // 重新准备，等房主再次 begin
      net.ready();
      show('online');
      $('matchHint').textContent = '等待再来一局…';
    } else {
      startGame('solo', false);
    }
  };

  $('btnQuit').onclick = () => {
    $('result').classList.add('hidden');
    engine.stop();
    if (engine.mode === 'online') net.leave();
    show('menu');
  };

  // 防止页面滚动
  document.addEventListener('touchmove', (e) => {
    if (screens.game.classList.contains('active')) e.preventDefault();
  }, { passive: false });

})();
