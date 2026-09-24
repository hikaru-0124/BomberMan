/**
 * CPU AI クラス
 * 危険回避、安全な爆弾設置、アイテム回収、敵追跡アルゴリズム
 */
class AIPlayer extends Entity {
  constructor(id, name, col, row, bodyColor, antennaColor, shoeColor, personality = 'balanced') {
    super(id, name, col, row, bodyColor, antennaColor, shoeColor);
    this.personality = personality; // 'aggressive', 'cautious', 'balanced'
    this.targetCol = col;
    this.targetRow = row;
    this.currentPath = [];
    this.thinkCooldown = 0;
    this.bombCooldown = 1.0 + Math.random() * 1.5;
  }

  updateAI(dt, map, bombs, explosions, items, entities, onPlaceBomb, onSpawnTrail) {
    if (!this.alive) return;

    if (this.isFlyingAway) {
      super.update(dt, map, bombs, onSpawnTrail);
      return;
    }

    this.thinkCooldown -= dt;
    this.bombCooldown -= dt;

    // 危険マスマップの構築
    const dangerMap = this.buildDangerMap(map, bombs, explosions);

    // 現在自分が危険マスにいるか？
    const inDanger = dangerMap.has(`${this.col},${this.row}`);

    // 定期的な思考更新（または危険時に即時再計算）
    if (this.thinkCooldown <= 0 || (inDanger && this.currentPath.length === 0)) {
      this.thinkCooldown = 0.15 + Math.random() * 0.1; // 約0.2秒ごとに再考
      this.decideNextAction(map, bombs, dangerMap, items, entities, onPlaceBomb);
    }

    // パスに沿って移動
    this.followPath(dt, map, bombs);

    super.update(dt, map, bombs, onSpawnTrail);
  }

  // 危険マスマップ（どのマスが爆風予定地か）
  buildDangerMap(map, bombs, explosions) {
    const danger = new Map(); // key: 'c,r', value: danger level / time

    if (map.zone) {
      for (let row = 1; row < map.rows - 1; row++) {
        for (let col = 1; col < map.cols - 1; col++) {
          if (map.zone.dangerous(col, row)) danger.set(`${col},${row}`, 100);
        }
      }
    }

    // 現在の爆風
    explosions.forEach(exp => {
      exp.segments.forEach(seg => {
        danger.set(`${seg.col},${seg.row}`, 100);
      });
    });

    // 設置されている爆弾の爆風予定範囲
    bombs.forEach(b => {
      if (b.hasExploded) return;
      danger.set(`${b.col},${b.row}`, b.timer);

      const dirs = [
        { x: 0, y: -1 }, { x: 0, y: 1 },
        { x: -1, y: 0 }, { x: 1, y: 0 }
      ];

      dirs.forEach(d => {
        for (let step = 1; step <= b.power; step++) {
          const c = b.col + d.x * step;
          const r = b.row + d.y * step;

          if (map.getTile(c, r) === TILE.WALL) break;
          danger.set(`${c},${r}`, b.timer);
          if (map.getTile(c, r) === TILE.BLOCK) break;
        }
      });
    });

    return danger;
  }

  // AIの意思決定メインロジック
  decideNextAction(map, bombs, dangerMap, items, entities, onPlaceBomb) {
    const curKey = `${this.col},${this.row}`;
    const inDanger = dangerMap.has(curKey);

    // 1. 【最優先】危険マスにいる場合は、最も近い安全マスへ退避！
    if (inDanger) {
      const escapePath = this.findPathToSafeTile(map, bombs, dangerMap);
      if (escapePath && escapePath.length > 0) {
        this.currentPath = escapePath;
        return;
      }
    }

    // 2. 近くにアイテムがあるか？安全であれば拾いに行く
    const nearItem = this.findBestItem(items, dangerMap, map, bombs);
    if (nearItem) {
      const path = this.findPath(this.col, this.row, nearItem.col, nearItem.row, map, bombs, dangerMap);
      if (path && path.length > 0) {
        this.currentPath = path;
        return;
      }
    }

    // 3. 爆弾設置の検討（ソフトブロック破壊または敵攻撃）
    if (this.bombCooldown <= 0 && this.activeBombs < this.maxBombs) {
      const shouldBomb = this.checkShouldBomb(map, entities);
      if (shouldBomb) {
        // 自滅しないか（今爆弾を置いても安全に逃げられるマスがあるか）事前検証
        if (this.canSafelyEscapeAfterBomb(map, bombs, dangerMap)) {
          const bomb = this.placeBomb(bombs, entities);
          if (bomb) {
            onPlaceBomb(bomb);
            this.bombCooldown = 2.0 + Math.random() * 1.5;
            // 直ちに安全マスへ逃げるルートを再計算
            const updatedDanger = this.buildDangerMap(map, bombs, []);
            const escapePath = this.findPathToSafeTile(map, bombs, updatedDanger);
            if (escapePath) {
              this.currentPath = escapePath;
            }
            return;
          }
        }
      }
    }

    // 4. 周囲のソフトブロックや敵に近づく
    const target = this.findStrategicTarget(map, entities, dangerMap, bombs);
    if (target) {
      const path = this.findPath(this.col, this.row, target.col, target.row, map, bombs, dangerMap);
      if (path && path.length > 0) {
        this.currentPath = path;
        return;
      }
    }

    // 5. ランダムに近くの安全マスをパトロール
    this.wanderSafely(map, bombs, dangerMap);
  }

  // 爆弾を置くべき状況か（隣接するソフトブロックがある、または敵が近い）
  checkShouldBomb(map, entities) {
    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];

    // 隣接ソフトブロックがあるか
    for (const d of dirs) {
      const c = this.col + d.x;
      const r = this.row + d.y;
      if (map.getTile(c, r) === TILE.BLOCK) {
        return true;
      }
    }

    // 近く（直線距離2〜3マス以内）に他の生存キャラがいるか
    for (const other of entities) {
      if (other.id !== this.id && other.alive) {
        const dist = Math.abs(other.col - this.col) + Math.abs(other.row - this.row);
        if (dist <= 2) {
          return true;
        }
      }
    }

    return false;
  }

  // 今のマスに爆弾を置いたと仮定して、安全に退避できるかシミュレーション
  canSafelyEscapeAfterBomb(map, bombs, dangerMap) {
    // 仮想の爆弾を追加した危険マップを作成
    const simDanger = new Map(dangerMap);
    simDanger.set(`${this.col},${this.row}`, CONFIG.BOMB_FUSE_TIME);

    const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
    dirs.forEach(d => {
      for (let step = 1; step <= this.bombPower; step++) {
        const c = this.col + d.x * step;
        const r = this.row + d.y * step;
        if (map.getTile(c, r) === TILE.WALL) break;
        simDanger.set(`${c},${r}`, CONFIG.BOMB_FUSE_TIME);
        if (map.getTile(c, r) === TILE.BLOCK) break;
      }
    });

    // 仮想爆弾が存在する状態で安全マスへの道があるか
    const escapePath = this.findPathToSafeTile(map, bombs, simDanger);
    return escapePath !== null && escapePath.length > 0;
  }

  // 最も近い安全マスへのBFS探索
  findPathToSafeTile(map, bombs, dangerMap) {
    const queue = [{ col: this.col, row: this.row, path: [] }];
    const visited = new Set([`${this.col},${this.row}`]);

    const dirs = [
      { x: 0, y: -1, dir: DIR.UP },
      { x: 0, y: 1, dir: DIR.DOWN },
      { x: -1, y: 0, dir: DIR.LEFT },
      { x: 1, y: 0, dir: DIR.RIGHT }
    ];

    while (queue.length > 0) {
      const curr = queue.shift();

      // 安全マスに到達！
      if (!dangerMap.has(`${curr.col},${curr.row}`)) {
        return curr.path;
      }

      for (const d of dirs) {
        const nextCol = curr.col + d.x;
        const nextRow = curr.row + d.y;
        const key = `${nextCol},${nextRow}`;

        if (!visited.has(key) && this.canEnter(nextCol, nextRow, map, bombs)) {
          visited.add(key);
          queue.push({
            col: nextCol,
            row: nextRow,
            path: [...curr.path, { col: nextCol, row: nextRow, dir: d.dir }]
          });
        }
      }
    }

    return null; // 退避場所が見つからない絶体絶命
  }

  // 目標座標へのBFS経路探索
  findPath(startCol, startRow, targetCol, targetRow, map, bombs, dangerMap) {
    const queue = [{ col: startCol, row: startRow, path: [] }];
    const visited = new Set([`${startCol},${startRow}`]);

    const dirs = [
      { x: 0, y: -1, dir: DIR.UP },
      { x: 0, y: 1, dir: DIR.DOWN },
      { x: -1, y: 0, dir: DIR.LEFT },
      { x: 1, y: 0, dir: DIR.RIGHT }
    ];

    while (queue.length > 0) {
      const curr = queue.shift();

      if (curr.col === targetCol && curr.row === targetRow) {
        return curr.path;
      }

      for (const d of dirs) {
        const nextCol = curr.col + d.x;
        const nextRow = curr.row + d.y;
        const key = `${nextCol},${nextRow}`;

        // 危険なマスは避けて通る
        if (!visited.has(key) && this.canEnter(nextCol, nextRow, map, bombs) && !dangerMap.has(key)) {
          visited.add(key);
          queue.push({
            col: nextCol,
            row: nextRow,
            path: [...curr.path, { col: nextCol, row: nextRow, dir: d.dir }]
          });
        }
      }
    }

    return null;
  }

  // 最寄りの有効アイテム探索
  findBestItem(items, dangerMap, map, bombs) {
    let closestItem = null;
    let minDist = Infinity;

    items.forEach(it => {
      if (it.collected) return;
      if (dangerMap.has(`${it.col},${it.row}`)) return;

      const dist = Math.abs(it.col - this.col) + Math.abs(it.row - this.row);
      if (dist < minDist) {
        minDist = dist;
        closestItem = it;
      }
    });

    return closestItem;
  }

  // 戦略的ターゲット探索（近くのソフトブロックに隣接するマス）
  findStrategicTarget(map, entities, dangerMap, bombs) {
    // 近くの破壊可能ブロックの隣接マスを探す
    for (let radius = 1; radius <= 5; radius++) {
      for (let r = -radius; r <= radius; r++) {
        for (let c = -radius; c <= radius; c++) {
          const col = this.col + c;
          const row = this.row + r;
          if (map.getTile(col, row) === TILE.BLOCK) {
            // そのブロックの隣のマスで歩ける安全な場所を探す
            const adjDirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
            for (const ad of adjDirs) {
              const ac = col + ad.x;
              const ar = row + ad.y;
              if (this.canEnter(ac, ar, map, bombs) && !dangerMap.has(`${ac},${ar}`)) {
                return { col: ac, row: ar };
              }
            }
          }
        }
      }
    }
    return null;
  }

  // ランダムパトロール
  wanderSafely(map, bombs, dangerMap) {
    const dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
    // シャッフル
    dirs.sort(() => Math.random() - 0.5);

    for (const d of dirs) {
      const nc = this.col + d.x;
      const nr = this.row + d.y;
      if (this.canEnter(nc, nr, map, bombs) && !dangerMap.has(`${nc},${nr}`)) {
        this.currentPath = [{ col: nc, row: nr, dir: d }];
        break;
      }
    }
  }

  // 算出されたパスに沿って移動
  followPath(dt, map, bombs) {
    if (!this.currentPath || this.currentPath.length === 0) {
      this.isMoving = false;
      return;
    }

    const nextStep = this.currentPath[0];
    const targetX = (nextStep.col + 0.5) * TILE_SIZE;
    const targetY = (nextStep.row + 0.5) * TILE_SIZE;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy);

    // 次のグリッド中心に十分近づいたら次のステップへ
    if (dist < 5) {
      this.currentPath.shift();
      if (this.currentPath.length === 0) {
        this.isMoving = false;
        return;
      }
    }

    // 移動方向の決定
    let dir = DIR.NONE;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
    } else if (Math.abs(dy) > 0) {
      dir = dy > 0 ? DIR.DOWN : DIR.UP;
    }

    if (dir !== DIR.NONE) {
      this.move(dir, dt, map, bombs);
    } else {
      this.isMoving = false;
    }
  }
}
