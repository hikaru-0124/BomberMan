/**
 * BomberMan オンライン通信対戦サーバー
 * 静的ファイル配信 + WebSocket ルーム管理
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const {MAX_PLAYERS, normalizeStageId} = require('./js/stages');

const PORT = process.env.PORT || 8000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP静的ファイルサーバー
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';

  // 公開するのはゲームの画面とアセットだけ。
  if (reqPath !== '/index.html' &&
      !/^\/(?:js|css)\/[a-zA-Z0-9_-]+\.(?:js|css)$/.test(reqPath)) {
    res.writeHead(404);
    return res.end('Not Found');
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // ディレクトリトラバーサル防止
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error');
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    }
  });
});

// WebSocketサーバー
const wss = new WebSocketServer({ server });

// ルーム管理: roomId -> Room
const rooms = new Map();

function generateId(length = 4) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

class Room {
  constructor(id) {
    this.id = id;
    this.clients = new Map(); // ws -> { id, slot, name }
    this.state = 'LOBBY';     // 'LOBBY' | 'PLAYING'
    this.hostWs = null;
    this.mapData = null;
    this.stageId = 'classic';
    this.maxPlayers = MAX_PLAYERS;
  }

  getAvailableSlot() {
    const usedSlots = new Set();
    for (const info of this.clients.values()) {
      usedSlots.add(info.slot);
    }
    for (let slot = 1; slot <= this.maxPlayers; slot++) {
      if (!usedSlots.has(slot)) return slot;
    }
    return null; // 満員
  }

  addClient(ws, name) {
    const slot = this.getAvailableSlot();
    if (!slot) return null;

    const clientId = generateId(6);
    const clientInfo = { id: clientId, slot, name: name || `プレイヤー ${slot}` };
    this.clients.set(ws, clientInfo);

    if (!this.hostWs) {
      this.hostWs = ws;
    }

    return clientInfo;
  }

  removeClient(ws) {
    const info = this.clients.get(ws);
    this.clients.delete(ws);

    if (this.hostWs === ws) {
      // ホストを引き継ぎ
      const remaining = Array.from(this.clients.keys());
      this.hostWs = remaining.length > 0 ? remaining[0] : null;
    }

    return info;
  }

  broadcast(msg, excludeWs = null) {
    const data = JSON.stringify(msg);
    for (const clientWs of this.clients.keys()) {
      if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    }
  }

  getPlayerList() {
    const list = [];
    for (const [cWs, info] of this.clients.entries()) {
      list.push({
        id: info.id,
        slot: info.slot,
        name: info.name,
        isHost: (cWs === this.hostWs)
      });
    }
    return list.sort((a, b) => a.slot - b.slot);
  }
}

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        // ルーム作成
        case 'create_room': {
          let roomId;
          do {
            roomId = generateId(4);
          } while (rooms.has(roomId));

          const room = new Room(roomId);
          room.stageId = normalizeStageId(data.stageId);
          room.maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(data.maxPlayers) || MAX_PLAYERS));
          rooms.set(roomId, room);
          currentRoom = room;

          const clientInfo = room.addClient(ws, data.name);
          ws.send(JSON.stringify({
            type: 'room_created',
            roomId,
            stageId: room.stageId,
            maxPlayers: room.maxPlayers,
            player: clientInfo,
            isHost: true
          }));

          room.broadcast({
            type: 'room_update',
            players: room.getPlayerList()
          });
          break;
        }

        // ルーム参加
        case 'join_room': {
          const roomId = (data.roomId || '').trim().toUpperCase();
          const room = rooms.get(roomId);

          if (!room) {
            return ws.send(JSON.stringify({
              type: 'error',
              message: `部屋 [${roomId}] が見つかりませんでした。`
            }));
          }

          if (room.state !== 'LOBBY') {
            return ws.send(JSON.stringify({
              type: 'error',
              message: 'この部屋の対戦はすでに始まっています。'
            }));
          }

          const clientInfo = room.addClient(ws, data.name);
          if (!clientInfo) {
            return ws.send(JSON.stringify({
              type: 'error',
              message: `部屋が満員です（最大${MAX_PLAYERS}人）。`
            }));
          }

          currentRoom = room;
          ws.send(JSON.stringify({
            type: 'room_joined',
            roomId,
            stageId: room.stageId,
            maxPlayers: room.maxPlayers,
            player: clientInfo,
            isHost: (ws === room.hostWs)
          }));

          room.broadcast({
            type: 'room_update',
            players: room.getPlayerList()
          });
          break;
        }

        case 'set_stage': {
          if (!currentRoom || currentRoom.state !== 'LOBBY' || currentRoom.hostWs !== ws) return;
          currentRoom.stageId = normalizeStageId(data.stageId);
          currentRoom.broadcast({type: 'stage_selected', stageId: currentRoom.stageId});
          break;
        }

        // ゲーム開始（ホストのみ）
        case 'start_game': {
          if (!currentRoom || currentRoom.hostWs !== ws || currentRoom.state !== 'LOBBY') return;

          currentRoom.state = 'PLAYING';
          // マップのブロック配置データを生成して共通化
          currentRoom.mapData = data.mapData;
          currentRoom.stageId = normalizeStageId(data.stageId);

          currentRoom.broadcast({
            type: 'game_started',
            players: currentRoom.getPlayerList(),
            stageId: currentRoom.stageId,
            maxPlayers: currentRoom.maxPlayers,
            mapData: currentRoom.mapData
          });
          break;
        }

        // プレイヤー移動同期
        case 'player_move': {
          if (!currentRoom || currentRoom.state !== 'PLAYING') return;
          const info = currentRoom.clients.get(ws);
          if (!info) return;

          currentRoom.broadcast({
            type: 'player_moved',
            slot: info.slot,
            x: data.x,
            y: data.y,
            facing: data.facing,
            isMoving: data.isMoving
          }, ws);
          break;
        }

        // 爆弾設置
        case 'place_bomb': {
          if (!currentRoom || currentRoom.state !== 'PLAYING') return;
          const info = currentRoom.clients.get(ws);
          if (!info) return;

          currentRoom.broadcast({
            type: 'bomb_placed',
            slot: info.slot,
            col: data.col,
            row: data.row,
            power: data.power
          });
          break;
        }

        // アイテム取得同期
        case 'collect_item': {
          if (!currentRoom || currentRoom.state !== 'PLAYING') return;
          const info = currentRoom.clients.get(ws);
          if (!info) return;

          currentRoom.broadcast({
            type: 'item_collected',
            slot: info.slot,
            col: data.col,
            row: data.row
          });
          break;
        }

        // 場外移動と投擲希望。送信者のスロットをサーバー側で確定。
        case 'miso_move':
        case 'miso_throw': {
          if (!currentRoom || currentRoom.state !== 'PLAYING') return;
          const info = currentRoom.clients.get(ws);
          if (!info || !Number.isInteger(data.index) || !Number.isInteger(data.depth)) return;
          const msg = {type: data.type, slot: info.slot, index: data.index, depth: data.depth};
          if (data.type === 'miso_throw') {
            if (currentRoom.hostWs?.readyState === WebSocket.OPEN) currentRoom.hostWs.send(JSON.stringify(msg));
          } else currentRoom.broadcast(msg, ws);
          break;
        }

        // 撃破・復活は同じイベントで配信し、端末間の勝敗判定のずれを防ぐ。
        case 'miso_bomb':
        case 'combat_hit':
        case 'round_over': {
          if (!currentRoom || currentRoom.state !== 'PLAYING' || currentRoom.hostWs !== ws) return;
          currentRoom.broadcast(data, ws);
          if (data.type === 'round_over') currentRoom.state = 'OVER';
          break;
        }

        // 空きスロットCPU同期（ホストが送信）
        case 'cpu_sync': {
          if (!currentRoom || currentRoom.hostWs !== ws) return;
          currentRoom.broadcast({
            type: 'cpu_synced',
            cpus: data.cpus
          }, ws);
          break;
        }

        // CPU爆弾設置
        case 'cpu_bomb': {
          if (!currentRoom || currentRoom.hostWs !== ws) return;
          currentRoom.broadcast({
            type: 'bomb_placed',
            slot: data.slot,
            col: data.col,
            row: data.row,
            power: data.power
          });
          break;
        }
      }
    } catch (err) {
      console.error('WS Error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      const info = currentRoom.removeClient(ws);
      if (currentRoom.clients.size === 0) {
        rooms.delete(currentRoom.id);
      } else {
        currentRoom.broadcast({
          type: 'player_left',
          slot: info ? info.slot : null,
          players: currentRoom.getPlayerList(),
          newHost: currentRoom.hostWs ? currentRoom.clients.get(currentRoom.hostWs)?.slot : null
        });
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BOMBER BATTLE サーバー稼働中: http://0.0.0.0:${PORT}`);
});
