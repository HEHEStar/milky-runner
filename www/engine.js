/* =========================================================
 * engine.js — 奶蛙跑酷核心引擎
 * 三跑道、跳跃、下滑、障碍、金币、双人同步
 * 纯 Canvas 渲染，透视伪 3D
 * =======================================================*/
(function (global) {
  'use strict';

  const LANES = 3;
  const LANE_W = 120;          // 世界单位：每条道宽
  const ROAD_HALF = LANE_W * LANES / 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }

  class Runner {
    constructor(theme) {
      this.theme = theme;
      this.reset();
    }
    reset() {
      this.lane = 1;             // 0 左 1 中 2 右
      this.laneF = 1;            // 平滑插值用
      this.y = 0;                // 跳跃高度
      this.vy = 0;
      this.jumping = false;
      this.sliding = false;
      this.slideT = 0;
      this.alive = true;
      this.hitT = 0;
      this.dist = 0;             // 前进距离
      this.coins = 0;
      this.score = 0;
      this.finished = false;
      this.expression = 'normal';
      this.t = 0;
    }

    get worldLane() { return this.laneF; }

    jump() {
      if (this.jumping || this.sliding || !this.alive) return;
      this.jumping = true;
      this.vy = 1;              // 归一化初速
    }
    slide() {
      if (this.sliding || !this.alive) return;
      if (this.jumping) { this.vy = -1; return; }
      this.sliding = true;
      this.slideT = 0.55;
    }
    move(dir) {
      if (!this.alive) return;
      this.lane = clamp(this.lane + dir, 0, LANES - 1);
    }

    update(dt, speed) {
      this.t += dt;
      // 跳跃物理（归一化）
      if (this.jumping) {
        this.vy -= dt * 3.4;
        this.y += this.vy * dt * 2.2;
        if (this.y <= 0) { this.y = 0; this.vy = 0; this.jumping = false; }
      }
      // 下滑计时
      if (this.sliding) {
        this.slideT -= dt;
        if (this.slideT <= 0) this.sliding = false;
      }
      // 血量恢复表情
      if (this.hitT > 0) {
        this.hitT -= dt;
        this.expression = 'ouch';
      } else if (!this.alive) {
        this.expression = 'ouch';
      } else {
        this.expression = this.coins > 0 ? 'happy' : 'normal';
      }
      // 平滑换道
      this.laneF += (this.lane - this.laneF) * Math.min(1, dt * 12);
      // 前进
      if (this.alive && !this.finished) {
        this.dist += speed * dt;
        this.score = Math.floor(this.dist / 10) + this.coins * 10;
      }
    }
  }

  class Engine {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts || {};
      this.mode = 'solo';                 // solo | online
      this.net = this.opts.net || null;
      this.me = new Runner('player');
      this.rival = new Runner('rival');
      this.rivalActive = false;
      this.obstacles = [];
      this.coinItems = [];
      this.scenery = [];
      this.spawnTimer = 0;
      this.coinTimer = 0;
      this.baseSpeed = 420;               // 世界单位/秒
      this.speed = this.baseSpeed;
      this.elapsed = 0;
      this.running = false;
      this.paused = false;
      this.cameraShake = 0;
      this.syncAcc = 0;
      this.finishDist = 9000;             // 目标距离
      this.onFinish = opts.onFinish || null;
      this.onScore = opts.onScore || null;
      this._resize();
      this._onResize = () => this._resize();
      window.addEventListener('resize', this._onResize);
    }

    _resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.W = w; this.H = h;
      this.horizon = h * 0.34;
    }

    reset() {
      this.me.reset();
      this.rival.reset();
      this.rivalActive = false;
      this.obstacles = [];
      this.coinItems = [];
      this.spawnTimer = 0.4;
      this.coinTimer = 0.8;
      this.elapsed = 0;
      this.speed = this.baseSpeed;
      this.cameraShake = 0;
      this.syncAcc = 0;
    }

    start(mode) {
      this.mode = mode || 'solo';
      this.reset();
      this.running = true;
      this.paused = false;
      if (this.mode === 'online' && this.net && this.net.opponent) {
        this.rivalActive = true;
      }
    }

    stop() { this.running = false; this.paused = false; }

    jump() { if (this.running && !this.paused) this.me.jump(); }
    slide() { if (this.running && !this.paused) this.me.slide(); }
    move(d) { if (this.running && !this.paused) this.me.move(d); }

    // 接入对手快照
    applyOpponent(state) {
      if (!state) return;
      this.rivalActive = true;
      this.rival.lane = state.lane;
      this.rival.laneF = state.laneF != null ? state.laneF : state.lane;
      this.rival.dist = state.dist;
      this.rival.y = state.y || 0;
      this.rival.sliding = !!state.sliding;
      this.rival.alive = state.alive !== false;
      this.rival.finished = !!state.finished;
      this.rival.score = state.score || 0;
      this.rival.name = state.name;
    }

    // ---- 生成关卡 ----
    _spawn(dt) {
      // 障碍
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const lane = Math.floor(Math.random() * LANES);
        const type = Math.random() < 0.5 ? 'block' : 'gate';
        // 避免相邻障碍把三条道同时堵死：同距离段最多 1 个
        const near = this.obstacles.some(o => Math.abs(o.dist - (this.me.dist + 1600)) < 500);
        if (!near) {
          this.obstacles.push({
            lane, dist: this.me.dist + 1600, type, hit: false, passed: false,
          });
        }
        this.spawnTimer = rand(0.55, 0.95) * (this.baseSpeed / this.speed);
      }
      // 金币
      this.coinTimer -= dt;
      if (this.coinTimer <= 0) {
        const lane = Math.floor(Math.random() * LANES);
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          this.coinItems.push({ lane, dist: this.me.dist + 1400 + i * 160, got: false });
        }
        this.coinTimer = rand(0.9, 1.6);
      }
      // 清理
      this.obstacles = this.obstacles.filter(o => o.dist > this.me.dist - 300);
      this.coinItems = this.coinItems.filter(c => c.dist > this.me.dist - 200 && !c.got);
    }

    _collide() {
      const me = this.me;
      for (const o of this.obstacles) {
        if (o.hit) continue;
        const dd = o.dist - me.dist;
        if (dd < 60 && dd > -60) {
          if (Math.abs(o.lane - me.laneF) < 0.5) {
            // gate 需下滑，block 需跳跃
            let dodged = false;
            if (o.type === 'block' && me.y > 0.55) dodged = true;
            if (o.type === 'gate' && me.sliding) dodged = true;
            if (!dodged) {
              o.hit = true;
              me.alive = false;
              me.hitT = 0.6;
              this.cameraShake = 16;
              if (this.onFinish) this.onFinish({ dead: true, score: me.score, coins: me.coins });
            }
          }
        }
      }
      for (const c of this.coinItems) {
        if (c.got) continue;
        const dd = c.dist - me.dist;
        if (dd < 60 && dd > -60 && Math.abs(c.lane - me.laneF) < 0.5 && me.y < 0.9) {
          c.got = true;
          me.coins += 1;
        }
      }
    }

    // ---- 主循环 ----
    frame(dt) {
      if (!this.running || this.paused) { this.draw(); return; }
      dt = Math.min(dt, 0.05);
      this.elapsed += dt;
      // 速度逐渐加快
      this.speed = this.baseSpeed + Math.min(320, this.elapsed * 12);

      this.me.update(dt, this.speed);
      if (this.mode === 'solo' && this.rivalActive) this.rival.update(dt, this.speed);

      this._spawn(dt);
      this._collide();

      // 到达终点
      if (this.me.dist >= this.finishDist && !this.me.finished) {
        this.me.finished = true;
        if (this.onFinish) this.onFinish({ dead: false, score: this.me.score, coins: this.me.coins });
        if (this.net) this.net.finish(this.me.score);
      }

      if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt * 60);

      // 联网同步（约 20Hz）
      if (this.net && this.net.connected && this.mode === 'online') {
        this.syncAcc += dt;
        if (this.syncAcc >= 0.05) {
          this.syncAcc = 0;
          this.net.syncState({
            lane: this.me.lane,
            laneF: this.me.laneF,
            dist: this.me.dist,
            y: this.me.y,
            sliding: this.me.sliding,
            alive: this.me.alive,
            finished: this.me.finished,
            score: this.me.score,
          });
        }
      }

      if (this.onScore) this.onScore({ me: this.me, rival: this.rival, rivalActive: this.rivalActive });

      this.draw();
    }

    // ---- 渲染 ----
    _project(lane, worldDist, height) {
      // 相机跟踪玩家，玩家固定在屏幕下方
      const camDist = this.me.dist;
      const d = worldDist - camDist;
      const nearD = 120, farD = 2400;
      const persp = clamp(d, -nearD, farD) / farD;   // 0 近 -> 1 远
      const yBase = this.H * 0.92;
      const yFar = this.horizon;
      const y = yBase + (yFar - yBase) * persp - (height || 0) * (this.H * 0.35) * (1 - persp * 0.6);

      const scale = 1 - persp * 0.82;
      const centerX = this.W / 2;
      const roadW = this.W * 0.9 * scale;
      const laneOffset = (lane - (LANES - 1) / 2) / LANES;
      const x = centerX + laneOffset * roadW * 1.6;
      return { x, y, scale, persp };
    }

    draw() {
      const ctx = this.ctx;
      const W = this.W, H = this.H;
      ctx.save();
      if (this.cameraShake > 0) {
        ctx.translate(rand(-1, 1) * this.cameraShake, rand(-1, 1) * this.cameraShake);
      }

      // 天空
      const sky = ctx.createLinearGradient(0, 0, 0, this.horizon + 40);
      sky.addColorStop(0, '#bfeeff');
      sky.addColorStop(1, '#8fe0ff');
      ctx.fillStyle = sky;
      ctx.fillRect(-40, -40, W + 80, this.horizon + 60);

      // 云
      this._drawClouds(ctx);

      // 地面
      const ground = ctx.createLinearGradient(0, this.horizon, 0, H);
      ground.addColorStop(0, '#9fe3b6');
      ground.addColorStop(1, '#78cf9a');
      ctx.fillStyle = ground;
      ctx.fillRect(-40, this.horizon, W + 80, H - this.horizon + 40);

      // 跑道
      this._drawRoad(ctx);

      // 障碍与金币（按距离排序，远的先画）
      const items = [];
      for (const o of this.obstacles) items.push({ kind: 'obs', d: o });
      for (const c of this.coinItems) if (!c.got) items.push({ kind: 'coin', d: c });
      items.sort((a, b) => (b.d.dist) - (a.d.dist));
      for (const it of items) {
        if (it.kind === 'obs') this._drawObstacle(ctx, it.d);
        else this._drawCoin(ctx, it.d);
      }

      // 对手（画在玩家稍后，模拟前方）
      if (this.rivalActive) {
        const p = this._project(this.rival.laneF, this.rival.dist + 120, this.rival.y + (this.rival.sliding ? -0.25 : 0));
        if (p.persp < 1) {
          // 对手名牌
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ff9d5c';
          ctx.font = `bold ${Math.max(10, 14 * p.scale)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(this.rival.name || '对手', p.x, p.y - 60 * p.scale);
          ctx.restore();
          global.FrogArt.drawFrog(ctx, p.x, p.y, 70 * p.scale, {
            theme: 'rival', t: this.elapsed, look: 0,
            squash: this.rival.sliding ? 0.6 : 0,
            expression: this.rival.alive === false ? 'ouch' : 'normal',
          });
        }
      }

      // 玩家
      const p = this._project(this.me.laneF, this.me.dist, this.me.y + (this.me.sliding ? -0.25 : 0));
      global.FrogArt.drawFrog(ctx, p.x, p.y, 84 * p.scale, {
        theme: 'player', t: this.me.t, look: (this.me.lane - 1) * 0.4,
        squash: this.me.sliding ? 0.6 : (this.me.jumping ? -0.2 : 0),
        expression: this.me.expression,
      });

      // 近处暗角
      ctx.restore();
    }

    _drawClouds(ctx) {
      const t = this.elapsed * 12;
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 260 - t * (0.5 + i * 0.1)) % (this.W + 300)) - 150;
        const cy = 40 + (i % 3) * 45;
        const s = 0.7 + (i % 3) * 0.25;
        ctx.beginPath();
        ctx.arc(cx, cy, 30 * s, 0, Math.PI * 2);
        ctx.arc(cx + 34 * s, cy + 6 * s, 24 * s, 0, Math.PI * 2);
        ctx.arc(cx - 34 * s, cy + 8 * s, 20 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    _drawRoad(ctx) {
      const nearLeft = this._project(-0.5, this.me.dist, 0);
      const nearRight = this._project(LANES - 0.5, this.me.dist, 0);
      const farLeft = this._project(-0.5, this.me.dist + 2400, 0);
      const farRight = this._project(LANES - 0.5, this.me.dist + 2400, 0);

      // 路面
      ctx.beginPath();
      ctx.moveTo(nearLeft.x, nearLeft.y);
      ctx.lineTo(farLeft.x, farLeft.y);
      ctx.lineTo(farRight.x, farRight.y);
      ctx.lineTo(nearRight.x, nearRight.y);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, this.horizon, 0, this.H);
      g.addColorStop(0, '#f3e2b8');
      g.addColorStop(1, '#e9cf95');
      ctx.fillStyle = g;
      ctx.fill();

      // 车道分隔线（滚动虚线）
      ctx.strokeStyle = 'rgba(255,255,255,.8)';
      for (let lane = 0; lane <= LANES; lane++) {
        for (let k = 0; k < 12; k++) {
          const d0 = Math.floor(this.me.dist / 300) * 300 + k * 300;
          const scroll = (this.me.dist % 300);
          const a = this._project(lane - 0.5, d0 - scroll, 0);
          const b = this._project(lane - 0.5, d0 - scroll + 180, 0);
          ctx.lineWidth = Math.max(1, 5 * a.scale);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    _drawObstacle(ctx, o) {
      const p = this._project(o.lane, o.dist, 0);
      if (p.persp >= 1 || p.y < this.horizon - 20) return;
      const s = p.scale;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#3a5a44';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 40 * s, 12 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (o.type === 'block') {
        // 需要跳过的方块
        const w = 70 * s, h = 70 * s;
        ctx.fillStyle = '#ff8f6b';
        roundRect(ctx, p.x - w / 2, p.y - h, w, h, 10 * s);
        ctx.fill();
        ctx.fillStyle = '#ffb59a';
        roundRect(ctx, p.x - w / 2 + 6 * s, p.y - h + 6 * s, w - 12 * s, 14 * s, 6 * s);
        ctx.fill();
        // 表情
        ctx.fillStyle = '#7a3b28';
        ctx.beginPath(); ctx.arc(p.x - 12 * s, p.y - h * 0.6, 4 * s, 0, Math.PI * 2);
        ctx.arc(p.x + 12 * s, p.y - h * 0.6, 4 * s, 0, Math.PI * 2); ctx.fill();
      } else {
        // 需要下滑的门（横杆）
        const w = 100 * s, h = 26 * s;
        ctx.fillStyle = '#8f7bff';
        roundRect(ctx, p.x - w / 2, p.y - 110 * s, w, h, 8 * s);
        ctx.fill();
        ctx.fillStyle = '#b3a6ff';
        roundRect(ctx, p.x - w / 2 + 6 * s, p.y - 110 * s + 5 * s, w - 12 * s, 8 * s, 4 * s);
        ctx.fill();
        // 立柱
        ctx.fillStyle = '#6c5ce0';
        ctx.fillRect(p.x - w / 2, p.y - 110 * s, 8 * s, 110 * s);
        ctx.fillRect(p.x + w / 2 - 8 * s, p.y - 110 * s, 8 * s, 110 * s);
      }
      ctx.restore();
    }

    _drawCoin(ctx, c) {
      const p = this._project(c.lane, c.dist, 0.45);
      if (p.persp >= 1 || p.y < this.horizon - 20) return;
      const s = p.scale;
      const spin = Math.abs(Math.cos(this.elapsed * 4 + c.dist * 0.01));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(0.4 + spin * 0.6, 1);
      const r = 20 * s;
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#fff3b0');
      g.addColorStop(1, '#ffc63d');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e8a90f';
      ctx.lineWidth = 3 * s;
      ctx.stroke();
      ctx.fillStyle = '#e8a90f';
      ctx.font = `bold ${r}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('¥', 0, 1);
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  global.Runner = Runner;
  global.Engine = Engine;
})(window);
