/* =========================================================
 * net.js — 双人联网对战客户端
 * 负责：连接服务器、房间匹配、状态同步、对手渲染
 * =======================================================*/
(function (global) {
  'use strict';

  const DEFAULT_SERVER = 'ws://localhost:3000';

  class Net {
    constructor() {
      this.ws = null;
      this.connected = false;
      this.roomId = null;
      this.playerId = null;
      this.isHost = false;
      this.name = '奶蛙';
      this.handlers = {};       // 事件回调
      this.reconnectTimer = null;
      this.serverUrl = localStorage.getItem('mfr_server') || DEFAULT_SERVER;
      this.opponent = null;     // { name, lane, x, alive, score, finished }
      this._manualClose = false;
    }

    getServer() { return this.serverUrl; }
    setServer(url) {
      this.serverUrl = url.trim();
      localStorage.setItem('mfr_server', this.serverUrl);
    }

    on(evt, fn) { this.handlers[evt] = fn; return this; }
    emit(evt, data) { if (this.handlers[evt]) this.handlers[evt](data); }

    connect() {
      return new Promise((resolve, reject) => {
        if (this.ws && this.connected) return resolve();
        this._manualClose = false;
        let url = this.serverUrl;
        if (!url) url = DEFAULT_SERVER;

        try {
          this.ws = new WebSocket(url);
        } catch (e) {
          return reject(new Error('服务器地址无效: ' + url));
        }

        const timeout = setTimeout(() => {
          reject(new Error('连接超时，请检查服务器地址'));
          try { this.ws.close(); } catch (_) {}
        }, 8000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.emit('connected');
          resolve();
        };
        this.ws.onerror = () => {
          clearTimeout(timeout);
          if (!this.connected) reject(new Error('无法连接服务器'));
          this.emit('error');
        };
        this.ws.onclose = () => {
          this.connected = false;
          this.emit('disconnected');
          if (!this._manualClose) this._scheduleReconnect();
        };
        this.ws.onmessage = (ev) => {
          let msg;
          try { msg = JSON.parse(ev.data); } catch (e) { return; }
          this._handle(msg);
        };
      });
    }

    _scheduleReconnect() {
      if (this.reconnectTimer) return;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.connected) this.connect().then(() => {
          if (this.roomId) this.join(this.roomId, this.name);
        }).catch(() => {});
      }, 3000);
    }

    _handle(msg) {
      switch (msg.type) {
        case 'joined':
          this.roomId = msg.roomId;
          this.playerId = msg.playerId;
          this.isHost = msg.host;
          this.opponent = null;
          this.emit('joined', msg);
          break;
        case 'roomState':
          this.emit('roomState', msg);
          if (msg.players) {
            const other = msg.players.find(p => p.id !== this.playerId);
            if (other) this.opponent = Object.assign({}, this.opponent, other);
          }
          break;
        case 'opponentState':
          this.opponent = Object.assign({}, this.opponent || {}, msg.state);
          this.emit('opponentState', this.opponent);
          break;
        case 'start':
          this.emit('start', msg);
          break;
        case 'countdown':
          this.emit('countdown', msg);
          break;
        case 'opponentLeft':
          this.emit('opponentLeft', msg);
          break;
        case 'opponentFinished':
          this.emit('opponentFinished', msg);
          break;
        case 'error':
          this.emit('serverError', msg.message);
          break;
        case 'pong':
          break;
      }
    }

    send(obj) {
      if (this.ws && this.connected) {
        this.ws.send(JSON.stringify(obj));
      }
    }

    join(roomId, name) {
      this.roomId = roomId;
      this.name = name || this.name;
      this.send({ type: 'join', roomId: roomId, name: this.name });
    }

    randomMatch(name) {
      this.name = name || this.name;
      this.send({ type: 'random', name: this.name });
    }

    ready() { this.send({ type: 'ready' }); }

    // 高频位置同步（由引擎每帧调用，内部节流）
    syncState(state) {
      this.send({ type: 'state', state: state });
    }

    finish(score) { this.send({ type: 'finish', score: score }); }

    leave() {
      this._manualClose = true;
      if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      if (this.ws) {
        try { this.send({ type: 'leave' }); this.ws.close(); } catch (_) {}
      }
      this.connected = false;
      this.roomId = null;
      this.playerId = null;
      this.opponent = null;
    }
  }

  global.Net = Net;
})(window);
