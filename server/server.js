/* =========================================================
 * server.js — 奶蛙跑酷 双人联网对战服务器
 * 功能：房间匹配、随机匹配、状态广播、开始同步、断线处理
 * 运行：npm install && npm start   （默认端口 3000）
 * =======================================================*/
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// 简单 HTTP 服务（用于 Render 健康检查 + 浏览器测试页）
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: true,
    service: 'milky-runner-server',
    rooms: rooms.size,
    clients: wss ? wss.clients.size : 0,
    uptime: Math.floor(process.uptime()),
  }));
});

const wss = new WebSocketServer({ server });

/** rooms: Map<roomId, { id, players: Map<id, player>, started }> */
const rooms = new Map();
/** ws -> { id, roomId, name } */
const clients = new Map();

let nextId = 1;
function genId(prefix) {
  return prefix + '_' + (nextId++) + '_' + Math.random().toString(36).slice(2, 7);
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function makePlayer(ws, name) {
  return {
    id: genId('p'),
    name: name || '奶蛙',
    ws,
    score: 0,
    ready: false,
    finished: false,
  };
}

function roomPlayers(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id, name: p.name, score: p.score, ready: p.ready, finished: p.finished,
  }));
}

function broadcastRoom(room) {
  const players = roomPlayers(room);
  for (const p of room.players.values()) {
    send(p.ws, {
      type: 'roomState',
      roomId: room.id,
      started: room.started,
      players,
    });
  }
}

function leaveRoom(info) {
  if (!info || !info.roomId) return;
  const room = rooms.get(info.roomId);
  if (!room) return;
  room.players.delete(info.id);
  if (room.players.size === 0) {
    rooms.delete(info.roomId);
  } else {
    for (const p of room.players.values()) {
      send(p.ws, { type: 'opponentLeft', playerId: info.id });
    }
    broadcastRoom(room);
  }
  info.roomId = null;
}

function joinRoom(ws, roomId, name) {
  const info = clients.get(ws);
  if (!info) return;
  // 已在别的房间则先离开
  if (info.roomId && info.roomId !== roomId) leaveRoom(info);

  let room = rooms.get(roomId);
  if (!room) {
    room = { id: roomId, players: new Map(), started: false };
    rooms.set(roomId, room);
  }

  if (room.players.size >= 2) {
    // 房间满，允许旁观？这里直接拒绝
    send(ws, { type: 'error', message: '房间已满（最多 2 人）' });
    return;
  }

  const player = makePlayer(ws, name);
  info.id = player.id;
  info.roomId = roomId;
  info.name = player.name;
  room.players.set(player.id, player);

  const host = room.players.size === 1 || room.players.values().next().value.id === player.id;
  send(ws, {
    type: 'joined',
    roomId,
    playerId: player.id,
    host: Array.from(room.players.keys())[0] === player.id,
  });

  broadcastRoom(room);

  // 两人到齐，自动倒计时开始
  maybeStart(room);
}

function maybeStart(room) {
  if (room.started) return;
  if (room.players.size === 2) {
    room.started = true;
    // 通知双方开始，并推送 3-2-1 倒计时
    for (const p of room.players.values()) {
      send(p.ws, { type: 'start' });
    }
    let n = 3;
    sendAllCountdown(room, n);
    const timer = setInterval(() => {
      n -= 1;
      if (n >= 1) sendAllCountdown(room, n);
      else clearInterval(timer);
    }, 800);
  }
}

function sendAllCountdown(room, n) {
  for (const p of room.players.values()) {
    send(p.ws, { type: 'countdown', n });
  }
}

wss.on('connection', (ws) => {
  const info = { id: null, roomId: null, name: null };
  clients.set(ws, info);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    const cur = clients.get(ws);

    switch (msg.type) {
      case 'join':
        joinRoom(ws, String(msg.roomId || 'default'), msg.name);
        break;

      case 'random': {
        // 找一个未满且有人的房间，否则新建
        let target = null;
        for (const [rid, room] of rooms) {
          if (room.players.size === 1 && !room.started) { target = rid; break; }
        }
        if (!target) target = 'R' + Math.floor(1000 + Math.random() * 9000);
        joinRoom(ws, target, msg.name);
        break;
      }

      case 'state':
        if (cur.roomId) {
          const room = rooms.get(cur.roomId);
          if (!room) break;
          for (const p of room.players.values()) {
            if (p.id !== cur.id) {
              const st = Object.assign({}, msg.state, { name: cur.name });
              send(p.ws, { type: 'opponentState', state: st });
            }
          }
        }
        break;

      case 'begin': {
        // 房主手动触发（可选）
        if (!cur.roomId) break;
        const room = rooms.get(cur.roomId);
        if (!room) break;
        const firstId = room.players.keys().next().value;
        if (firstId === cur.id) maybeStart(room);
        break;
      }

      case 'finish': {
        if (!cur.roomId) break;
        const room = rooms.get(cur.roomId);
        if (!room) break;
        const p = room.players.get(cur.id);
        if (p) { p.finished = true; p.score = msg.score || p.score; }
        for (const other of room.players.values()) {
          if (other.id !== cur.id) {
            send(other.ws, { type: 'opponentFinished', playerId: cur.id, score: msg.score });
          }
        }
        break;
      }

      case 'ready': {
        if (!cur.roomId) break;
        const room = rooms.get(cur.roomId);
        if (!room) break;
        const p = room.players.get(cur.id);
        if (p) p.ready = true;
        const allReady = Array.from(room.players.values()).every(pl => pl.ready);
        if (allReady && room.players.size === 2) {
          // 重置并重开
          for (const pl of room.players.values()) { pl.ready = false; pl.finished = false; pl.score = 0; }
          room.started = false;
          maybeStart(room);
        } else {
          broadcastRoom(room);
        }
        break;
      }

      case 'leave':
        leaveRoom(cur);
        break;

      case 'ping':
        send(ws, { type: 'pong' });
        break;
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    leaveRoom(info);
    clients.delete(ws);
  });

  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log(`🐸 奶蛙跑酷对战服务器已启动: http://localhost:${PORT}`);
  console.log(`   WebSocket 地址: ws://localhost:${PORT}`);
});
