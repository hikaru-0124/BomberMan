/**
 * ゲーム統括・メインループ・状態管理クラス
 * シングルプレイ（CPU対戦）& オンライン通信対戦（WebSocket）両対応
 */
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    this.map = null;
    this.player = null;       // 自分が操作するキャラクター
    this.remotePlayers = [];  // 通信相手のプレイヤー
    this.cpus = [];           // CPUボット
    this.entities = [];       // 全キャラクター (1P〜4P)
    this.bombs = [];
    this.explosions = [];
    this.items = [];
    this.particles = [];
    this.floatingTexts = [];

    this.gameState = 'START'; // 'START', 'PLAYING', 'OVER'
    this.gameMode = 'SINGLE'; // 'SINGLE' | 'ONLINE'
    this.mySlot = 1;
    this.isOnlineHost = false;
    this.isSpectating = false;
    this.misoBon = new MisoBonManager(this);
    this.lastTime = performance.now();
    this.roundTime = CONFIG.ROUND_TIME_LIMIT;
    this.zoneSyncTimer = 0;
    if (this.map) this.map.zone = new BattleZone(this.map);
    this.moveSendTimer = 0;

    // UI要素の参照
    this.overlay = document.getElementById('overlay');
    this.viewMainMenu = document.getElementById('viewMainMenu');
    this.viewOnlineLobby = document.getElementById('viewOnlineLobby');
    this.viewRoomWait = document.getElementById('viewRoomWait');
    this.viewGameOver = document.getElementById('viewGameOver');

    this.timeDisplay = document.getElementById('timeDisplay');
    this.spectatorStatus = document.getElementById('spectatorStatus');
    this.muteBtn = document.getElementById('muteBtn');

    // ロビーUI要素
    this.playerNameInput = document.getElementById('playerNameInput');
    this.roomCodeInput = document.getElementById('roomCodeInput');
    this.displayRoomCode = document.getElementById('displayRoomCode');
    this.roomMemberList = document.getElementById('roomMemberList');
    this.btnStartOnlineGame = document.getElementById('btnStartOnlineGame');
    this.btnReady = document.getElementById('btnReady');
    this.readyStatus = document.getElementById('readyStatus');
    this.waitHostText = document.getElementById('waitHostText');
    this.lobbyError = document.getElementById('lobbyError');
    this.stageSelect = document.getElementById('stageSelect');
    this.stageDescription = document.getElementById('stageDescription');
    this.maxPlayersSelect = document.getElementById('maxPlayersSelect');
    this.maxPlayersDescription = document.getElementById('maxPlayersDescription');
    this.arenaSubtitle = document.getElementById('arenaSubtitle');
    for (const [id, stage] of Object.entries(MAP_STAGES)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = stage.name;
      this.stageSelect.appendChild(option);
    }
    for (let count = 2; count <= MAX_PLAYERS; count++) {
      const option = document.createElement('option');
      option.value = count;
      option.textContent = `${count}人`;
      this.maxPlayersSelect.appendChild(option);
    }
    this.setStage('hexagon');
    this.setMaxPlayers(MAX_PLAYERS);

    this.gameOverTitle = document.getElementById('gameOverTitle');
    this.gameOverDesc = document.getElementById('gameOverDesc');

    this.initEventListeners();
    this.initNetworkEvents();
    this.showView('MAIN');
  }

  // ビューの切り替え
  showView(viewName) {
    if (!viewName) {
      this.overlay.classList.add('hidden');
      return;
    }

    this.overlay.classList.remove('hidden');
    this.viewMainMenu.classList.add('hidden');
    this.viewOnlineLobby.classList.add('hidden');
    this.viewRoomWait.classList.add('hidden');
    this.viewGameOver.classList.add('hidden');

    if (viewName === 'MAIN') this.viewMainMenu.classList.remove('hidden');
    else if (viewName === 'LOBBY') this.viewOnlineLobby.classList.remove('hidden');
    else if (viewName === 'ROOM') this.viewRoomWait.classList.remove('hidden');
    else if (viewName === 'GAME_OVER') this.viewGameOver.classList.remove('hidden');
  }

  setStage(stageId) {
    this.stageId = normalizeStageId(stageId);
    this.stageSelect.value = this.stageId;
    this.stageDescription.textContent = MAP_STAGES[this.stageId].description;
    this.stageSelect.disabled = this.gameState === 'PLAYING' || this.gameState === 'OVER' ||
      (this.gameMode === 'ONLINE' && networkManager.roomId && !this.isOnlineHost);
  }

  setMaxPlayers(maxPlayers) {
    this.maxPlayers = Math.max(2, Math.min(MAX_PLAYERS, Number(maxPlayers) || MAX_PLAYERS));
    this.maxPlayersSelect.value = String(this.maxPlayers);
    this.maxPlayersDescription.textContent = `最大${this.maxPlayers}人。空き枠はCPUが参加`;
    this.arenaSubtitle.textContent = `${this.maxPlayers}-PLAYER SURVIVAL ARENA`;
    this.maxPlayersSelect.disabled = this.gameState === 'PLAYING' || this.gameState === 'OVER' ||
      (this.gameMode === 'ONLINE' && networkManager.roomId && !this.isOnlineHost);
    const minimum = this.gameMode === 'ONLINE' ? Math.max(2, this.roomPlayers?.length || 0) : 2;
    for (const option of this.maxPlayersSelect.options) option.disabled = Number(option.value) < minimum;
  }

  createStageMap() {
    const {cols, rows} = getStageSize(this.stageId);
    this.canvas.width = cols * TILE_SIZE;
    this.canvas.height = rows * TILE_SIZE;
    return new GameMap(cols, rows, this.stageId);
  }

  initEventListeners() {
    this.stageSelect.addEventListener('change', () => {
      this.setStage(this.stageSelect.value);
      if (this.gameMode === 'ONLINE' && this.isOnlineHost && networkManager.roomId) {
        networkManager.send({type: 'set_stage', stageId: this.stageId});
      }
    });
    this.maxPlayersSelect.addEventListener('change', () => {
      const count = Number(this.maxPlayersSelect.value);
      if (this.gameMode === 'ONLINE' && networkManager.roomId) {
        networkManager.send({type: 'set_max_players', maxPlayers: count});
        this.maxPlayersSelect.value = String(this.maxPlayers);
      } else this.setMaxPlayers(count);
    });
    // キーボード
    window.addEventListener('keydown', (e) => {
      soundManager.init();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }

      if (this.gameState === 'PLAYING' && this.player) {
        this.player.handleKeyDown(e.code);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.gameState === 'PLAYING' && this.player) {
        this.player.handleKeyUp(e.code);
      }
    });

    // モード選択ボタン
    document.getElementById('btnSingleMode').addEventListener('click', () => {
      soundManager.init();
      this.startSingleGame();
    });

    document.getElementById('btnOnlineMode').addEventListener('click', () => {
      soundManager.init();
      this.lobbyError.innerText = '';
      this.showView('LOBBY');
    });

    // オンラインロビーボタン
    document.getElementById('btnBackToMain').addEventListener('click', () => {
      this.showView('MAIN');
    });

    document.getElementById('btnCreateRoom').addEventListener('click', () => {
      const name = this.playerNameInput.value.trim() || '白ボン';
      this.lobbyError.innerText = '部屋を作成中...';
      networkManager.createRoom(name, this.stageId, this.maxPlayers);
    });

    document.getElementById('btnJoinRoom').addEventListener('click', () => {
      const name = this.playerNameInput.value.trim() || '黒ボン';
      const code = this.roomCodeInput.value.trim();
      if (!code) {
        this.lobbyError.innerText = '部屋番号を入力してください。';
        return;
      }
      this.lobbyError.innerText = '接続中...';
      networkManager.joinRoom(code, name);
    });

    // 部屋待機ボタン
    document.getElementById('btnLeaveRoom').addEventListener('click', () => {
      location.reload(); // 再読み込みで初期化
    });

    this.btnReady.addEventListener('click', () => {
      const me = this.roomPlayers?.find(p => p.slot === this.mySlot);
      if (me) networkManager.send({type: 'set_ready', ready: !me.ready});
    });

    this.btnStartOnlineGame.addEventListener('click', () => {
      if (this.isOnlineHost && this.roomPlayers?.length && this.roomPlayers.every(p => p.ready)) {
        // ホストがステージのブロック配置を生成して全員に配信
        const tempMap = this.createStageMap();
        const mapData = tempMap.getBlockData();
        networkManager.startGame(mapData, this.stageId, this.maxPlayers);
      }
    });

    // リスタートボタン
    document.getElementById('btnRestartGame').addEventListener('click', () => {
      if (this.gameMode === 'SINGLE') {
        this.startSingleGame();
      } else if (this.gameState === 'OVER') {
        networkManager.send({type: 'return_to_room'});
      }
    });

    // ミュートボタン
    this.muteBtn.addEventListener('click', () => {
      soundManager.init();
      const muted = soundManager.toggleMute();
      this.muteBtn.innerHTML = muted ? '🔇 サウンド: OFF' : '🔊 サウンド: ON';
    });

    this.setupTouchControls();
  }

  // オンライン通信イベントの登録
  initNetworkEvents() {
    // 部屋作成成功
    networkManager.on('room_created', (msg) => {
      this.gameMode = 'ONLINE';
      this.isOnlineHost = true;
      this.mySlot = msg.player.slot;
      this.displayRoomCode.innerText = msg.roomId;
      this.btnStartOnlineGame.style.display = 'block';
      this.waitHostText.style.display = 'none';
      this.setStage(msg.stageId);
      this.setMaxPlayers(msg.maxPlayers);
      this.showView('ROOM');
    });

    // 部屋参加成功
    networkManager.on('room_joined', (msg) => {
      this.gameMode = 'ONLINE';
      this.isOnlineHost = msg.isHost;
      this.mySlot = msg.player.slot;
      this.displayRoomCode.innerText = msg.roomId;
      if (this.isOnlineHost) {
        this.btnStartOnlineGame.style.display = 'block';
        this.waitHostText.style.display = 'none';
      } else {
        this.btnStartOnlineGame.style.display = 'none';
        this.waitHostText.style.display = 'block';
      }
      this.setStage(msg.stageId);
      this.setMaxPlayers(msg.maxPlayers);
      this.showView('ROOM');
    });

    // 参加者更新
    networkManager.on('room_update', (players) => {
      this.renderRoomMemberList(players);
    });

    networkManager.on('room_returned', msg => {
      clearTimeout(this.gameOverTimer);
      this.gameState = 'START';
      this.setSpectating(false);
      soundManager.stopBgm();
      this.isOnlineHost = msg.players.some(p => p.slot === this.mySlot && p.isHost);
      networkManager.isHost = this.isOnlineHost;
      this.displayRoomCode.innerText = msg.roomId;
      this.btnStartOnlineGame.style.display = this.isOnlineHost ? 'block' : 'none';
      this.waitHostText.style.display = this.isOnlineHost ? 'none' : 'block';
      this.setStage(msg.stageId);
      this.setMaxPlayers(msg.maxPlayers);
      this.renderRoomMemberList(msg.players);
      this.showView('ROOM');
    });

    networkManager.on('zone_sync', msg => {
      if (this.gameState !== 'PLAYING' || this.isOnlineHost || !this.map.zone) return;
      this.map.zone.elapsed = msg.elapsed;
      this.roundTime = Math.max(0, CONFIG.ROUND_TIME_LIMIT - msg.elapsed);
    });

    networkManager.on('max_players_selected', msg => {
      const player = msg.players.find(p => p.id === networkManager.myPlayer?.id);
      if (player) this.mySlot = player.slot;
      this.setMaxPlayers(msg.maxPlayers);
      this.renderRoomMemberList(msg.players);
    });

    networkManager.on('stage_selected', msg => {
      this.setStage(msg.stageId);
      this.renderRoomMemberList(msg.players);
    });

    // 対戦スタート
    networkManager.on('game_started', (msg) => {
      this.startOnlineGame(msg.players, msg.mapData, msg.stageId, msg.maxPlayers);
    });

    // 他プレイヤー移動
    networkManager.on('player_moved', (msg) => {
      const target = this.remotePlayers.find(p => p.id === msg.slot);
      if (target && !target.isDying && target.alive) {
        target.setNetworkState(msg.x, msg.y, msg.facing, msg.isMoving);
      }
    });

    // 爆弾設置（他者）
    networkManager.on('bomb_placed', (msg) => {
      // 自分の設置でない場合に追加
      if (msg.slot !== this.mySlot && !(this.isOnlineHost && this.cpus.some(cpu => cpu.id === msg.slot))) {
        const owner = this.entities.find(e => e.id === msg.slot);
        const bomb = new Bomb(msg.col, msg.row, msg.power, owner);
        if (owner) {
          owner.activeBombs++;
          bomb.passableEntities.add(owner);
        }
        // 現在そのマスに重なっているキャラ全員に通過権を付与
        this.entities.forEach(ent => {
          if (ent.alive && ent.col === msg.col && ent.row === msg.row) {
            bomb.passableEntities.add(ent);
          }
        });
        this.bombs.push(bomb);
        soundManager.playBombSet();
      }
    });

    // アイテム取得（他者）
    networkManager.on('item_collected', (msg) => {
      if (msg.slot !== this.mySlot) {
        const targetItemIdx = this.items.findIndex(it => it.col === msg.col && it.row === msg.row);
        if (targetItemIdx !== -1) {
          const item = this.items[targetItemIdx];
          const collector = this.entities.find(e => e.id === msg.slot);
          if (collector) {
            item.applyEffect(collector);
          }
          this.createSparkle(item.x, item.y, '#ffd700');
          this.items.splice(targetItemIdx, 1);
        }
      }
    });

    networkManager.on('miso_move', msg => this.misoBon.move(msg));
    networkManager.on('miso_throw', msg => this.misoBon.requestThrow(msg));
    networkManager.on('miso_bomb', msg => this.misoBon.acceptThrow(msg));
    networkManager.on('combat_hit', msg => {
      if (this.gameState === 'PLAYING') this.misoBon.applyHit(msg);
    });
    networkManager.on('round_over', msg => {
      this.endGame(msg.winner === null ? 'draw' : msg.winner === this.mySlot ? 'win' : 'lose');
    });

    // ホストからのCPU同期
    networkManager.on('cpu_synced', (cpuList) => {
      if (!this.isOnlineHost) {
        cpuList.forEach(cData => {
          const cpu = this.cpus.find(c => c.id === cData.slot);
          if (cpu && cpu.alive && !cpu.isDying) {
            cpu.x = cData.x;
            cpu.y = cData.y;
            cpu.facing = cData.facing;
            cpu.isMoving = cData.isMoving;
          }
        });
      }
    });

    // プレイヤー退出
    networkManager.on('player_left', (msg) => {
      if (this.gameState === 'PLAYING') {
        const departed = this.entities.find(e => e.id === msg.slot);
        if (departed) { departed.disconnected = true; departed.kill(); }
      }
      if (msg.newHost && msg.newHost === this.mySlot) {
        this.isOnlineHost = true;
        this.setStage(this.stageId);
        this.setMaxPlayers(this.maxPlayers);
        this.btnStartOnlineGame.style.display = 'block';
        this.waitHostText.style.display = 'none';
      }
      this.renderRoomMemberList(msg.players);
    });

    // エラー
    networkManager.on('error', (msg) => {
      this.lobbyError.innerText = msg.message;
    });
  }

  // 待機部屋のメンバーリスト描画
  renderRoomMemberList(players) {
    this.roomPlayers = players;
    this.updateReadyControls();
    this.setMaxPlayers(this.maxPlayers);
    this.roomMemberList.innerHTML = '';
    const themes = PLAYER_SLOTS.map(player => ({name: `${player.slot}P ${player.name}`, color: `p${player.slot}`}));

    for (let slot = 1; slot <= this.maxPlayers; slot++) {
      const p = players.find(x => x.slot === slot);
      const theme = themes[slot - 1];
      const row = document.createElement('div');
      row.className = `room-member-row ${theme.color}`;

      if (p) {
        const isMe = (p.slot === this.mySlot);
        row.innerHTML = `
          <span><b>${theme.name}</b>: ${p.name} ${isMe ? '(あなた)' : ''}</span>
          <span>${p.isHost ? '<span class="host-badge">HOST</span> ' : ''}${p.ready ? '<span style="color:#10b981;">準備完了</span>' : '<span style="color:#fbbf24;">準備中</span>'}</span>
        `;
      } else {
        row.innerHTML = `
          <span style="color:#64748b;"><b>${theme.name}</b>: 🤖 CPUが参戦</span>
          <span style="color:#64748b; font-size:0.75rem;">(枠空き)</span>
        `;
      }
      this.roomMemberList.appendChild(row);
    }
  }

  updateReadyControls() {
    const players = this.roomPlayers || [];
    const readyCount = players.filter(p => p.ready).length;
    const allReady = players.length > 0 && readyCount === players.length;
    const me = players.find(p => p.slot === this.mySlot);
    this.btnReady.textContent = me?.ready ? '準備完了を取り消す' : '準備完了';
    this.btnReady.setAttribute('aria-pressed', String(!!me?.ready));
    this.btnStartOnlineGame.disabled = !allReady;
    this.readyStatus.textContent = allReady
      ? '全員準備完了！ ホストが対戦を開始できます'
      : `準備完了 ${readyCount}/${players.length}人 — 全員の準備を待っています`;
  }

  setupTouchControls() {
    const bindTouchDir = (id, dir) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const start = (e) => {
        e.preventDefault();
        soundManager.init();
        if (this.player) this.player.setTouchDirection(dir);
      };
      const end = (e) => {
        e.preventDefault();
        if (this.player) this.player.setTouchDirection(null);
      };
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end, { passive: false });
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
    };

    bindTouchDir('btnUp', DIR.UP);
    bindTouchDir('btnDown', DIR.DOWN);
    bindTouchDir('btnLeft', DIR.LEFT);
    bindTouchDir('btnRight', DIR.RIGHT);

    const bombBtn = document.getElementById('btnBomb');
    if (bombBtn) {
      const triggerBomb = (e) => {
        e.preventDefault();
        soundManager.init();
        if (this.player) this.player.triggerTouchBomb();
      };
      bombBtn.addEventListener('touchstart', triggerBomb, { passive: false });
      bombBtn.addEventListener('mousedown', triggerBomb);
    }
  }

  // 1人用シングルプレイ開始（白ボン vs CPU5体）
  startSingleGame() {
    this.setSpectating(false);
    this.gameMode = 'SINGLE';
    this.mySlot = 1;
    this.map = this.createStageMap();
    this.bombs = [];
    this.explosions = [];
    this.items = [];
    this.particles = [];
    this.floatingTexts = [];
    this.roundTime = CONFIG.ROUND_TIME_LIMIT;
    this.zoneSyncTimer = 0;
    if (this.map) this.map.zone = new BattleZone(this.map);

    const [myConfig, ...cpuConfigs] = PLAYER_SLOTS;
    const [myCol, myRow] = getPlayerSpawn(myConfig.slot, this.stageId, this.map.cols, this.map.rows);
    this.player = new Player(myConfig.slot, `1P (${myConfig.name})`, myCol, myRow, myConfig.body, myConfig.ant, myConfig.shoe);
    const personalities = ['aggressive', 'balanced', 'cautious', 'aggressive', 'balanced'];
    const cpuPlayers = cpuConfigs.slice(0, this.maxPlayers - 1).map((config, index) => {
      const [col, row] = getPlayerSpawn(config.slot, this.stageId, this.map.cols, this.map.rows);
      return new AIPlayer(config.slot, `CPU ${config.slot - 1} (${config.name})`, col, row,
        config.body, config.ant, config.shoe, personalities[index]);
    });

    this.remotePlayers = [];
    this.cpus = cpuPlayers;
    this.entities = [this.player, ...this.cpus];
    this.misoBon = new MisoBonManager(this);
    this.updateHudNames();

    this.gameState = 'PLAYING';
    this.setMaxPlayers(this.maxPlayers);
    this.setStage(this.stageId);
    this.showView(null);
    soundManager.startBgm();
  }

  // オンラインマルチ対戦開始（受信したマップデータ & プレイヤー構成）
  startOnlineGame(players, mapData, stageId = 'classic', maxPlayers = MAX_PLAYERS) {
    this.setStage(stageId);
    this.setMaxPlayers(maxPlayers);
    this.setSpectating(false);
    this.gameMode = 'ONLINE';
    this.map = this.createStageMap();
    this.map.init(mapData); // 同一ブロックマップで開始！
    this.misoBon = new MisoBonManager(this);

    this.bombs = [];
    this.explosions = [];
    this.items = [];
    this.particles = [];
    this.floatingTexts = [];
    this.roundTime = CONFIG.ROUND_TIME_LIMIT;
    this.zoneSyncTimer = 0;
    if (this.map) this.map.zone = new BattleZone(this.map);

    this.remotePlayers = [];
    this.cpus = [];
    this.entities = [];

    PLAYER_SLOTS.slice(0, this.maxPlayers).forEach(config => {
      const [col, row] = getPlayerSpawn(config.slot, this.stageId, this.map.cols, this.map.rows);
      const cfg = {...config, col, row};
      const netPlayer = players.find(p => p.slot === cfg.slot);

      if (cfg.slot === this.mySlot) {
        // 自分自身
        const displayName = netPlayer ? `${netPlayer.name} (あなた)` : `${cfg.name} (あなた)`;
        this.player = new Player(cfg.slot, displayName, cfg.col, cfg.row, cfg.body, cfg.ant, cfg.shoe);
        this.entities.push(this.player);
      } else if (netPlayer) {
        // 他のオンラインプレイヤー
        const remote = new RemotePlayer(cfg.slot, netPlayer.name, cfg.col, cfg.row, cfg.body, cfg.ant, cfg.shoe);
        this.remotePlayers.push(remote);
        this.entities.push(remote);
      } else {
        // 空きスロットはCPUが代理参戦！
        const cpu = new AIPlayer(cfg.slot, `CPU (${cfg.name})`, cfg.col, cfg.row, cfg.body, cfg.ant, cfg.shoe, 'balanced');
        this.cpus.push(cpu);
        this.entities.push(cpu);
      }
    });

    this.updateHudNames();

    this.gameState = 'PLAYING';
    this.setMaxPlayers(this.maxPlayers);
    this.setStage(this.stageId);
    this.showView(null);
    soundManager.startBgm();
  }

  updateHudNames() {
    PLAYER_SLOTS.forEach(config => {
      const card = document.getElementById(`hud-p${config.slot}`);
      const name = card?.querySelector('.hud-name span');
      const entity = this.entities.find(candidate => candidate.id === config.slot);
      if (card) card.hidden = !entity;
      if (name) name.textContent = entity ? `${config.slot}P ${entity.name.replace(/ \(あなた\)$/, '')}` : `${config.slot}P ${config.name}`;
    });
  }

  // 吹っ飛びトレイルパーティクル
  createFlyTrail(x, y) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      size: 4 + Math.random() * 5,
      color: 'rgba(255, 255, 255, 0.75)',
      life: 0.35,
      maxLife: 0.35
    });

    if (Math.random() < 0.6) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 70,
        vy: (Math.random() - 0.5) * 70,
        size: 3 + Math.random() * 3,
        color: '#ffea00',
        life: 0.45,
        maxLife: 0.45,
        isStar: true
      });
    }
  }

  createSparkle(x, y, color) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        size: 2 + Math.random() * 3,
        color: color,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6
      });
    }
  }

  addFloatingText(text, x, y, color = '#ffd700') {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 0.8,
      maxLife: 0.8
    });
  }

  // ブロック破壊時
  handleBlockDestroyed(col, row) {
    const cx = (col + 0.5) * TILE_SIZE;
    const cy = (row + 0.5) * TILE_SIZE;

    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * 160,
        vy: (Math.random() - 0.5) * 160,
        size: 3 + Math.random() * 4,
        color: Math.random() > 0.5 ? '#d85c27' : '#f07d4b',
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7
      });
    }

    if (Math.random() < CONFIG.ITEM_DROP_CHANCE) {
      const types = [ITEM_TYPE.BOMB, ITEM_TYPE.FIRE, ITEM_TYPE.SPEED];
      const selectedType = types[Math.floor(Math.random() * types.length)];
      const newItem = new Item(col, row, selectedType);
      this.items.push(newItem);
      this.createSparkle(cx, cy, '#ffd700');
    }
  }

  update(dt) {
    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // フローティングテキスト更新
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= dt * 35;
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    if (this.gameState !== 'PLAYING') return;

    // ホストの時計で全員の縮小範囲を同期。
    const zone = this.map.zone;
    if (this.gameMode === 'SINGLE' || this.isOnlineHost) {
      zone.elapsed += dt;
      this.zoneSyncTimer -= dt;
      if (this.gameMode === 'ONLINE' && this.zoneSyncTimer <= 0) {
        networkManager.send({type: 'zone_sync', elapsed: zone.elapsed});
        this.zoneSyncTimer = 0.25;
      }
    }

    // ラウンド時間カウント
    this.roundTime = Math.max(0, this.roundTime - dt);
    if (this.roundTime <= 0 && (this.gameMode === 'SINGLE' || this.isOnlineHost)) {
      this.roundTime = 0;
      this.endGame('draw');
      return;
    }
    const minutes = Math.floor(this.roundTime / 60);
    const seconds = Math.floor(this.roundTime % 60).toString().padStart(2, '0');
    this.timeDisplay.innerText = `${minutes}:${seconds}`;

    this.entities.forEach(e => { e.invulnerable = Math.max(0, (e.invulnerable || 0) - dt); });
    if (this.gameMode === 'ONLINE') this.misoBon.update(dt);

    // マップ更新
    this.map.update(dt);

    // アイテム更新
    this.items.forEach(it => it.update(dt));

    // 爆弾更新
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const bomb = this.bombs[i];
      bomb.update(dt);

      if (bomb.hasExploded) {
        const exp = new Explosion(
          bomb.col,
          bomb.row,
          bomb.power,
          this.map,
          this.bombs,
          (c, r) => this.handleBlockDestroyed(c, r),
          bomb.misoCredit
        );
        this.explosions.push(exp);
        this.bombs.splice(i, 1);
      }
    }

    // 爆風更新
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.update(dt);
      if (exp.isDone) {
        this.explosions.splice(i, 1);
      }
    }

    // 自分の操作更新
    if (this.player && (this.gameMode !== 'ONLINE' || !this.misoBon.canPlay(this.player)) && (this.player.alive || this.player.isFlyingAway)) {
      this.player.updatePlayer(
        dt,
        this.map,
        this.bombs,
        this.entities,
        (b) => {
          this.bombs.push(b);
          if (this.gameMode === 'ONLINE') {
            networkManager.sendPlaceBomb(b.col, b.row, b.power);
          }
        },
        (x, y) => this.createFlyTrail(x, y)
      );

      // オンライン位置送信 (25Hz)
      if (this.gameMode === 'ONLINE' && this.player.alive && !this.player.isDying) {
        this.moveSendTimer += dt;
        if (this.moveSendTimer > 0.04) {
          this.moveSendTimer = 0;
          networkManager.sendMove(this.player.x, this.player.y, this.player.facing, this.player.isMoving);
        }
      }
    }

    if (this.gameMode === 'ONLINE' && this.player.isFlyingAway) {
      this.player.update(dt, this.map, this.bombs, (x, y) => this.createFlyTrail(x, y));
    }

    // リモートプレイヤー更新
    this.remotePlayers.forEach(rp => {
      rp.updateRemote(dt, this.map, this.bombs, (x, y) => this.createFlyTrail(x, y));
    });

    // CPU更新（シングルプレイ、またはオンラインホスト時）
    if (this.gameMode === 'SINGLE' || this.isOnlineHost) {
      this.cpus.forEach(cpu => {
        if (cpu.alive || cpu.isFlyingAway) {
          cpu.updateAI(
            dt,
            this.map,
            this.bombs,
            this.explosions,
            this.items,
            this.entities,
            (b) => {
              this.bombs.push(b);
              if (this.gameMode === 'ONLINE') {
                networkManager.sendCpuBomb(cpu.id, b.col, b.row, b.power);
              }
            },
            (x, y) => this.createFlyTrail(x, y)
          );
        }
      });

      // ホストがCPU位置を配信
      if (this.gameMode === 'ONLINE' && this.isOnlineHost) {
        const cpuSyncData = this.cpus.map(c => ({
          slot: c.id,
          x: c.x,
          y: c.y,
          facing: c.facing,
          isMoving: c.isMoving
        }));
        networkManager.sendCpuSync(cpuSyncData);
      }
    } else {
      // 非ホストもCPUの死亡演出を進め、脱落状態を確定する。
      this.cpus.forEach(cpu => {
        if (cpu.isFlyingAway) {
          cpu.update(dt, this.map, this.bombs, (x, y) => this.createFlyTrail(x, y));
        }
      });
    }

    if (this.gameMode === 'SINGLE' || this.isOnlineHost) {
      zone.updateHits(dt, this.entities, victim => {
        if (this.gameMode === 'ONLINE') this.misoBon.hit(victim);
        else victim.kill();
      });
    }

    // 衝突判定
    this.checkExplosionCollisions();
    this.checkItemPickups();
    this.updateHUD();
    this.checkGameStatus();
  }

  // 爆風衝突判定
  checkExplosionCollisions() {
    this.explosions.forEach(exp => {
      const targets = this.gameMode === 'ONLINE'
        ? (this.isOnlineHost ? this.entities : [])
        : [this.player, ...this.cpus];
      targets.forEach(victim => {
        if (victim && victim.alive && !victim.isDying && !victim.isFlyingAway &&
            !(victim.invulnerable > 0) && exp.covers(victim.col, victim.row)) {
          if (this.gameMode === 'ONLINE') this.misoBon.hit(victim, exp.misoCredit);
          else victim.kill();
        }
      });

      // アイテム消滅
      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        if (!item.collected && item.immunityTimer <= 0 && exp.covers(item.col, item.row)) {
          this.createSparkle(item.x, item.y, '#ffffff');
          this.items.splice(i, 1);
        }
      }
    });
  }

  // アイテム取得判定
  checkItemPickups() {
    if (!this.player || !this.player.alive || this.player.isFlyingAway) return;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      const dist = Math.hypot(item.x - this.player.x, item.y - this.player.y);

      if (!item.collected && dist < TILE_SIZE * 0.55) {
        const effectText = item.applyEffect(this.player);
        this.items.splice(i, 1);

        const glowColor = item.type === ITEM_TYPE.FIRE ? '#ff5722' : (item.type === ITEM_TYPE.BOMB ? '#ffd700' : '#ff4081');
        this.createSparkle(this.player.x, this.player.y, glowColor);
        soundManager.playPowerup();
        this.addFloatingText(effectText, this.player.x, this.player.y - 20, glowColor);

        if (this.gameMode === 'ONLINE') {
          networkManager.sendCollectItem(item.col, item.row);
        }
      }
    }
  }

  // HUD更新
  updateHUD() {
    this.entities.forEach(ent => {
      const card = document.getElementById(`hud-p${ent.id}`);
      if (!card) return;

      if (!ent.alive || ent.isDying || ent.isFlyingAway) {
        card.classList.add('dead');
        const statusSpan = card.querySelector('.status-text');
        if (statusSpan) statusSpan.innerText = this.gameMode === 'ONLINE' && this.misoBon.canPlay(ent) ? '💣 みそボン' : '💀 脱落';
      } else {
        card.classList.remove('dead');
        const statusSpan = card.querySelector('.status-text');
        if (statusSpan) statusSpan.innerText = ent.invulnerable > 0 ? '✨ 無敵' : '生存';
        const bombsSpan = card.querySelector('.stat-bombs');
        const powerSpan = card.querySelector('.stat-power');
        const speedSpan = card.querySelector('.stat-speed');

        if (bombsSpan) bombsSpan.innerText = `${ent.maxBombs}`;
        if (powerSpan) powerSpan.innerText = `${ent.bombPower}`;
        if (speedSpan) speedSpan.innerText = `${Math.round(ent.speed)}`;
      }
    });
  }

  // 勝敗終了判定
  checkGameStatus() {
    if (this.gameMode === 'ONLINE') {
      const survivors = this.entities.filter(e => e.alive && !e.isDying && !e.isFlyingAway);
      if (!this.isOnlineHost) {
        this.setSpectating(!survivors.some(e => e.id === this.mySlot));
        return;
      }
      if (survivors.length === 0) {
        this.endGame('draw');
      } else if (survivors.length === 1) {
        this.endGame(survivors[0].id === this.mySlot ? 'win' : 'lose');
      } else {
        this.setSpectating(!survivors.some(e => e.id === this.mySlot));
      }
      return;
    }

    const playerAlive = this.player && this.player.alive;
    const othersAlive = this.entities.filter(e => e.id !== this.mySlot && e.alive);

    if (!playerAlive && othersAlive.length === 0) {
      this.endGame('draw');
    } else if (!playerAlive) {
      this.endGame('lose');
    } else if (othersAlive.length === 0 && this.entities.length > 1) {
      this.endGame('win');
    }
  }

  setSpectating(active) {
    this.isSpectating = active;
    this.spectatorStatus.hidden = !active;
  }

  endGame(result) {
    if (this.gameState === 'OVER') return;
    if (this.gameMode === 'ONLINE' && this.isOnlineHost) {
      const winner = result === 'draw' ? null : this.entities.find(e => e.alive && !e.isDying && !e.isFlyingAway)?.id;
      networkManager.send({type: 'round_over', winner: winner ?? null});
    }
    this.gameState = 'OVER';
    this.setSpectating(false);
    soundManager.stopBgm();

    this.gameOverTimer = setTimeout(() => {
      document.getElementById('btnRestartGame').textContent = this.gameMode === 'ONLINE' ? '部屋に戻る（全員）' : 'もう一度あそぶ';
      this.showView('GAME_OVER');
      if (result === 'win') {
        this.gameOverTitle.className = 'overlay-title win';
        this.gameOverTitle.innerText = 'VICTORY!';
        this.gameOverDesc.innerText = 'おめでとうございます！最後まで生き残りました！';
        soundManager.playWin();
      } else if (result === 'lose') {
        this.gameOverTitle.className = 'overlay-title lose';
        this.gameOverTitle.innerText = 'GAME OVER';
        const winner = this.entities.find(e => e.alive && !e.isDying && !e.isFlyingAway);
        this.gameOverDesc.innerText = this.gameMode === 'ONLINE' && winner
          ? `試合終了！ ${winner.name} の勝利です。`
          : '吹き飛ばされてしまいました…';
        soundManager.playLose();
      } else {
        this.gameOverTitle.className = 'overlay-title';
        this.gameOverTitle.innerText = 'DRAW';
        this.gameOverDesc.innerText = '引き分けです！';
      }
    }, 1400);
  }

  // 描画メイン
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const zoneStatus = document.getElementById('zoneStatus');
    zoneStatus.hidden = this.gameState !== 'PLAYING';
    if (this.gameState === 'PLAYING' && this.map?.zone) {
      const zone = this.map.zone;
      const next = zone.nextIn;
      zoneStatus.textContent = `${next === null ? '最終安全地帯' : `安全地帯の縮小まで ${Math.max(0, Math.ceil(next))}秒`} ｜ 赤い範囲に3秒間とどまると脱落${this.player?.alive && zone.outside(this.player.col, this.player.row) ? ' ｜ ⚠ 中央へ逃げて！' : ''}`;
    }

    if (this.map) {
      // 1. マップ
      this.map.render(this.ctx);

      // 2. アイテム
      this.items.forEach(it => it.render(this.ctx));

      // 3. 爆弾
      this.bombs.forEach(b => b.render(this.ctx));

      // 4. 地上キャラクター
      const groundEntities = this.entities.filter(ent => ent.alive && !ent.isFlyingAway).sort((a, b) => a.y - b.y);
      groundEntities.forEach(ent => ent.render(this.ctx));

      // 5. 爆風
      this.explosions.forEach(exp => exp.render(this.ctx));

      // 6. パーティクル
      this.particles.forEach(p => {
        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, p.life / p.maxLife);

        if (p.isStar) {
          this.ctx.fillStyle = p.color;
          this.ctx.beginPath();
          const spikes = 5;
          const outerRadius = p.size * 1.5;
          const innerRadius = p.size * 0.7;
          let rot = Math.PI / 2 * 3;
          let x = p.x;
          let y = p.y;
          const step = Math.PI / spikes;

          this.ctx.moveTo(p.x, p.y - outerRadius);
          for (let i = 0; i < spikes; i++) {
            x = p.x + Math.cos(rot) * outerRadius;
            y = p.y + Math.sin(rot) * outerRadius;
            this.ctx.lineTo(x, y);
            rot += step;
            x = p.x + Math.cos(rot) * innerRadius;
            y = p.y + Math.sin(rot) * innerRadius;
            this.ctx.lineTo(x, y);
            rot += step;
          }
          this.ctx.lineTo(p.x, p.y - outerRadius);
          this.ctx.closePath();
          this.ctx.fill();
        } else {
          this.ctx.fillStyle = p.color;
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      });

      // 7. 最前面の吹っ飛びキャラクター
      const flyingEntities = this.entities.filter(ent => ent.isFlyingAway);
      flyingEntities.forEach(ent => ent.render(this.ctx));

      // 8. フローティングテキスト
      this.floatingTexts.forEach(ft => {
        this.ctx.save();
        this.ctx.font = 'bold 12px "Press Start 2P", sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.strokeText(ft.text, ft.x, ft.y);
        this.ctx.fillStyle = ft.color;
        this.ctx.fillText(ft.text, ft.x, ft.y);
        this.ctx.restore();
      });
      if (this.gameState === 'PLAYING') this.map.zone?.render(this.ctx);
      this.misoBon.render(this.ctx);
    }
  }

  // メインループ
  run() {
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (dt > 0.1) dt = 0.1;

    this.update(dt);
    this.render();

    requestAnimationFrame(() => this.run());
  }
}

// ゲーム起動
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.run();
});
