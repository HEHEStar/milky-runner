/* =========================================================
 * frog.js — 原创奶萌角色「奶蛙」纯 Canvas 绘制
 * 圆滚滚 / 大眼睛 / 腮红 / 奶嘴，风格奶萌，原创不侵权
 * =======================================================*/
(function (global) {
  'use strict';

  // 主题色，可给两个玩家不同配色
  const THEMES = {
    player: { body: '#a7e6b8', bodyDark: '#7fd0a0', belly: '#e8fff0', blush: '#ffb3c8', eye: '#2a3f2f' },
    rival:  { body: '#ffd6a7', bodyDark: '#ffb877', belly: '#fff5e6', blush: '#ff9ec4', eye: '#4a3220' },
  };

  /**
   * 绘制奶蛙
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x 中心 x
   * @param {number} y 底部 y（脚底）
   * @param {number} size 体型缩放（基准约 60）
   * @param {object} opt { theme, t, squash, look, expression }
   */
  function drawFrog(ctx, x, y, size, opt) {
    opt = opt || {};
    const theme = THEMES[opt.theme] || THEMES.player;
    const t = opt.t || 0;                 // 时间，用于轻微呼吸/摆动
    const squash = opt.squash || 0;       // 挤压 -1..1
    const look = opt.look || 0;           // 视线 -1..1
    const expr = opt.expression || 'normal'; // normal / happy / ouch

    const s = size / 60;
    const wobble = Math.sin(t * 3) * 1.2;
    const breathe = 1 + Math.sin(t * 2.4) * 0.03;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + squash * 0.18, 1 - squash * 0.18);
    ctx.rotate(wobble * Math.PI / 180);

    // ---- 阴影 ----
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#1b3550';
    ctx.beginPath();
    ctx.ellipse(0, 0, 34 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.scale(s * breathe, s * breathe);
    ctx.translate(0, -34); // 让 (0,0) 变为角色中心

    // ---- 后腿 ----
    ctx.fillStyle = theme.bodyDark;
    ctx.beginPath(); ctx.ellipse(-20, 26, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(20, 26, 12, 9, 0, 0, Math.PI * 2); ctx.fill();

    // ---- 后脚掌 ----
    ctx.fillStyle = theme.bodyDark;
    ctx.beginPath(); ctx.ellipse(-22, 32, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(22, 32, 11, 6, 0, 0, Math.PI * 2); ctx.fill();

    // ---- 身体（圆滚滚） ----
    const g = ctx.createRadialGradient(-12, -14, 6, 0, 0, 40);
    g.addColorStop(0, theme.body);
    g.addColorStop(1, theme.bodyDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 2, 32, 33, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- 肚皮 ----
    ctx.fillStyle = theme.belly;
    ctx.beginPath();
    ctx.ellipse(0, 12, 19, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // ---- 小短手 ----
    ctx.fillStyle = theme.body;
    ctx.beginPath(); ctx.ellipse(-30, 8, 9, 11, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(30, 8, 9, 11, 0.3, 0, Math.PI * 2); ctx.fill();

    // ---- 头顶奶泡（奶嘴/奶滴装饰，奶萌点） ----
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-12, -32, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-2, -38, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(9, -33, 6.5, 0, Math.PI * 2); ctx.fill();

    // ---- 眼睛（大眼萌） ----
    const eyeY = -6;
    const eyeDX = 13;
    drawEye(ctx, -eyeDX, eyeY, look, expr, theme);
    drawEye(ctx, eyeDX, eyeY, look, expr, theme);

    // ---- 腮红 ----
    ctx.fillStyle = theme.blush;
    ctx.globalAlpha = 0.75;
    ctx.beginPath(); ctx.ellipse(-24, 6, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, 6, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // ---- 嘴巴 / 奶嘴 ----
    if (expr === 'ouch') {
      drawMouthOuch(ctx);
    } else {
      drawSmile(ctx, expr === 'happy');
    }

    ctx.restore();
  }

  function drawEye(ctx, cx, cy, look, expr, theme) {
    // 眼白
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(cx, cy, 10, 11.5, 0, 0, Math.PI * 2); ctx.fill();

    // 瞳孔
    const px = cx + look * 2.5;
    ctx.fillStyle = theme.eye;
    ctx.beginPath(); ctx.arc(px, cy + 1, 6, 0, Math.PI * 2); ctx.fill();

    // 高光
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px + 2.2, cy - 2.2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px - 2, cy + 2.5, 1.1, 0, Math.PI * 2); ctx.fill();

    // 委屈眼（ouch）
    if (expr === 'ouch') {
      ctx.strokeStyle = theme.eye;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 10);
      ctx.lineTo(cx, cy - 13);
      ctx.lineTo(cx + 8, cy - 10);
      ctx.stroke();
    }
  }

  function drawSmile(ctx, big) {
    ctx.strokeStyle = '#3a5a44';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (big) {
      // 张嘴笑
      ctx.fillStyle = '#ff8a9e';
      ctx.beginPath();
      ctx.ellipse(0, 12, 9, 7, 0, 0, Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#3a5a44';
      ctx.beginPath();
      ctx.arc(0, 11, 9, 0.1, Math.PI - 0.1);
      ctx.stroke();
    } else {
      // 小微笑 + 一点奶嘴感
      ctx.arc(0, 7, 8, 0.15, Math.PI - 0.15);
      ctx.stroke();
      // 奶嘴小圆
      ctx.fillStyle = '#ffcf5c';
      ctx.beginPath(); ctx.arc(0, 16, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMouthOuch(ctx) {
    ctx.strokeStyle = '#3a5a44';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 18, 7, Math.PI + 0.3, -0.3);
    ctx.stroke();
  }

  global.FrogArt = { drawFrog, THEMES };
})(window);
