/** オンラインの場外参加。撃破と復活の確定はホストが行う。 */
class MisoBonManager {
  constructor(game) {
    this.game = game;
    this.positions = new Map();
    this.cooldowns = new Map();
    this.flights = [];
    this.inputTimer = 0;
    this.rail = [];
    this.cols = game.map?.cols || MAP_COLS;
    this.rows = game.map?.rows || MAP_ROWS;
    for (let col = 1; col < this.cols - 1; col++) this.rail.push({col, row: 0, dx: 0, dy: 1});
    for (let row = 1; row < this.rows - 1; row++) this.rail.push({col: this.cols - 1, row, dx: -1, dy: 0});
    for (let col = this.cols - 2; col > 0; col--) this.rail.push({col, row: this.rows - 1, dx: 0, dy: -1});
    for (let row = this.rows - 2; row > 0; row--) this.rail.push({col: 0, row, dx: 1, dy: 0});
  }

  isOut(entity) {
    return entity && (!entity.alive || entity.isDying || entity.isFlyingAway);
  }

  canPlay(entity) {
    return this.isOut(entity) && !entity.disconnected && !this.game.cpus.includes(entity);
  }

  position(slot) {
    if (!this.positions.has(slot)) this.positions.set(slot, {index: (slot - 1) * 12, depth: 1});
    return this.positions.get(slot);
  }

  move(msg) {
    if (!Number.isInteger(msg.index) || !Number.isInteger(msg.depth)) return;
    const index = ((msg.index % this.rail.length) + this.rail.length) % this.rail.length;
    this.positions.set(msg.slot, {
      index,
      depth: Math.max(1, Math.min(this.rail[index].dx ? this.cols - 2 : this.rows - 2, msg.depth))
    });
  }

  target(slot) {
    const pos = this.position(slot);
    const edge = this.rail[pos.index];
    const limit = edge.dx ? this.cols - 2 : this.rows - 2;
    const depth = Math.min(limit, pos.depth);
    const col = edge.col + edge.dx * depth;
    const row = edge.row + edge.dy * depth;
    return {col, row, edge, valid: this.game.map.isWalkable(col, row) &&
      !this.game.bombs.some(b => b.col === col && b.row === row) &&
      !this.flights.some(b => b.col === col && b.row === row)};
  }

  movementStep(index, input) {
    if (input.railStep) return input.railStep;
    const current = this.rail[index];
    let bestStep = 0;
    let bestScore = 0;
    for (const step of [-1, 1]) {
      const next = this.rail[(index + step + this.rail.length) % this.rail.length];
      const score = (next.col - current.col) * input.x + (next.row - current.row) * input.y;
      if (score > bestScore) { bestScore = score; bestStep = step; }
    }
    return bestStep;
  }

  // 投擲リクエストはホストで生存状態・着地点・連投間隔を確認。
  requestThrow(msg) {
    const g = this.game;
    const owner = g.entities.find(e => e.id === msg.slot);
    if (!g.isOnlineHost || g.gameState !== 'PLAYING' || !this.canPlay(owner) ||
        (this.cooldowns.get(msg.slot) || 0) > 0) return;
    this.move(msg);
    const target = this.target(msg.slot);
    if (!target.valid) return;
    const accepted = {type: 'miso_bomb', slot: msg.slot, generation: owner.deathGeneration,
      col: target.col, row: target.row, fromCol: target.edge.col, fromRow: target.edge.row};
    this.acceptThrow(accepted);
    networkManager.send(accepted);
  }

  acceptThrow(msg) {
    if (this.game.gameState !== 'PLAYING') return;
    this.cooldowns.set(msg.slot, 2);
    this.flights.push({...msg, elapsed: 0});
    soundManager.playBombSet();
  }

  applyHit(msg) {
    const g = this.game;
    const victim = g.entities.find(e => e.id === msg.slot);
    if (!victim || this.isOut(victim)) return;
    victim.deathGeneration++;
    victim.kill();
    if (victim.resetControls) victim.resetControls();
    if (msg.revive) {
      const revived = g.entities.find(e => e.id === msg.revive.slot);
      if (revived && this.canPlay(revived) && revived.deathGeneration === msg.revive.generation) {
        Object.assign(revived, {alive: true, isDying: false, isFlyingAway: false,
          x: (msg.revive.col + 0.5) * TILE_SIZE, y: (msg.revive.row + 0.5) * TILE_SIZE,
          speed: CONFIG.PLAYER_BASE_SPEED, maxBombs: CONFIG.BASE_BOMBS,
          bombPower: CONFIG.BASE_POWER, isMoving: false, invulnerable: 2});
        revived.targetX = revived.x;
        revived.targetY = revived.y;
        if (revived.resetControls) revived.resetControls();
        g.bombs.forEach(b => { if (b.col === revived.col && b.row === revived.row) b.passableEntities.add(revived); });
        g.addFloatingText('復活！', revived.x, revived.y - 20, '#ffcc00');
      }
    }
  }

  hit(victim, credit) {
    const msg = {type: 'combat_hit', slot: victim.id};
    const attacker = credit && this.game.entities.find(e => e.id === credit.slot);
    if (attacker && attacker.id !== victim.id && this.canPlay(attacker) &&
        attacker.deathGeneration === credit.generation) {
      msg.revive = {slot: attacker.id, generation: credit.generation, col: victim.col, row: victim.row};
    }
    this.applyHit(msg);
    networkManager.send(msg);
  }

  update(dt) {
    const g = this.game;
    for (const [slot, time] of this.cooldowns) this.cooldowns.set(slot, Math.max(0, time - dt));
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const flight = this.flights[i];
      flight.elapsed += dt;
      if (flight.elapsed < 0.6) continue;
      const bomb = new Bomb(flight.col, flight.row, 2, null);
      bomb.misoCredit = {slot: flight.slot, generation: flight.generation};
      g.entities.forEach(e => { if (e.col === bomb.col && e.row === bomb.row) bomb.passableEntities.add(e); });
      g.bombs.push(bomb);
      this.flights.splice(i, 1);
    }
    if (!this.canPlay(g.player)) return;
    const keys = g.player.keys;
    const input = g.player.getMisoInput();
    const pos = this.position(g.mySlot);
    const step = this.movementStep(pos.index, input);
    this.inputTimer -= dt;
    if (this.inputTimer <= 0 && (step || input.depthStep)) {
      this.move({slot: g.mySlot, index: pos.index + step,
        depth: pos.depth + input.depthStep});
      networkManager.send({type: 'miso_move', ...this.position(g.mySlot)});
      this.inputTimer = 0.12;
    }
    if (keys.bomb) {
      keys.bomb = false;
      networkManager.send({type: 'miso_throw', ...this.position(g.mySlot)});
    }
    const cooldown = this.cooldowns.get(g.mySlot) || 0;
    g.spectatorStatus.innerText = `💣 みそボン：WASD 外周移動 / ↑→ 遠く・↓← 近く / BOMB 投げる（タッチ：左右で移動・上下で距離）${cooldown > 0 ? `（あと${cooldown.toFixed(1)}秒）` : ''}`;
  }

  render(ctx) {
    const g = this.game;
    if (g.gameMode !== 'ONLINE' || g.gameState !== 'PLAYING') return;
    ctx.save();
    g.entities.filter(e => this.canPlay(e)).forEach(e => {
      const edge = this.rail[this.position(e.id).index];
      const x = (edge.col + 0.5) * TILE_SIZE, y = (edge.row + 0.5) * TILE_SIZE;
      ctx.fillStyle = e.bodyColor;
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${e.id}P`, x, y + 6);
    });
    if (this.canPlay(g.player)) {
      const target = this.target(g.mySlot);
      ctx.strokeStyle = target.valid ? '#ffcc00' : '#ff4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(target.col * TILE_SIZE + 5, target.row * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
    }
    this.flights.forEach(f => {
      const t = Math.min(1, f.elapsed / 0.6);
      const x = (f.fromCol + (f.col - f.fromCol) * t + 0.5) * TILE_SIZE;
      const y = (f.fromRow + (f.row - f.fromRow) * t + 0.5) * TILE_SIZE - Math.sin(t * Math.PI) * 70;
      ctx.fillStyle = '#101218'; ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }
}
