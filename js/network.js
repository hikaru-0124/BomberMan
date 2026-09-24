/**
 * オンライン通信マネージャー (WebSocket)
 */
class NetworkManager {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.roomId = null;
    this.myPlayer = null;
    this.isHost = false;
    this.callbacks = {};
  }

  connect(onOpen) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (onOpen) onOpen();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}`);

    this.ws.onopen = () => {
      this.isConnected = true;
      if (onOpen) onOpen();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.trigger('disconnect');
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      this.trigger('error', { message: 'サーバーとの通信でエラーが発生しました。' });
    };
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  trigger(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // ルーム作成
  createRoom(playerName, stageId = 'classic', maxPlayers = MAX_PLAYERS) {
    this.connect(() => {
      this.send({ type: 'create_room', name: playerName, stageId, maxPlayers });
    });
  }

  // ルーム参加
  joinRoom(roomId, playerName) {
    this.connect(() => {
      this.send({ type: 'join_room', roomId, name: playerName });
    });
  }

  // ゲーム開始（ホスト）
  startGame(mapData, stageId = 'classic', maxPlayers = MAX_PLAYERS) {
    this.send({ type: 'start_game', mapData, stageId, maxPlayers });
  }

  // 自分の移動送信
  sendMove(x, y, facing, isMoving) {
    this.send({ type: 'player_move', x, y, facing, isMoving });
  }

  // 爆弾設置送信
  sendPlaceBomb(col, row, power) {
    this.send({ type: 'place_bomb', col, row, power });
  }

  // アイテム取得送信
  sendCollectItem(col, row) {
    this.send({ type: 'collect_item', col, row });
  }

  // 被弾送信
  sendHit(slot) {
    this.send({ type: 'player_hit', slot });
  }

  // CPU同期（ホスト）
  sendCpuSync(cpus) {
    this.send({ type: 'cpu_sync', cpus });
  }

  sendCpuBomb(slot, col, row, power) {
    this.send({ type: 'cpu_bomb', slot, col, row, power });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        this.roomId = msg.roomId;
        this.myPlayer = msg.player;
        this.isHost = true;
        this.trigger('room_created', msg);
        break;

      case 'room_joined':
        this.roomId = msg.roomId;
        this.myPlayer = msg.player;
        this.isHost = msg.isHost;
        this.trigger('room_joined', msg);
        break;

      case 'room_update':
        this.trigger('room_update', msg.players);
        break;

      case 'game_started':
        this.trigger('game_started', msg);
        break;

      case 'player_moved':
        this.trigger('player_moved', msg);
        break;

      case 'bomb_placed':
        this.trigger('bomb_placed', msg);
        break;

      case 'item_collected':
        this.trigger('item_collected', msg);
        break;

      case 'max_players_selected': {
        const player = msg.players.find(p => p.id === this.myPlayer?.id);
        if (player) this.myPlayer = player;
        this.trigger('max_players_selected', msg);
        break;
      }

      case 'zone_sync':
      case 'room_returned':
      case 'stage_selected':
      case 'miso_move':
      case 'miso_throw':
      case 'miso_bomb':
      case 'combat_hit':
      case 'round_over':
        this.trigger(msg.type, msg);
        break;

      case 'player_hit':
        this.trigger('player_hit', msg);
        break;

      case 'cpu_synced':
        this.trigger('cpu_synced', msg.cpus);
        break;

      case 'player_left':
        this.trigger('player_left', msg);
        break;

      case 'error':
        this.trigger('error', msg);
        break;
    }
  }
}

const networkManager = new NetworkManager();
