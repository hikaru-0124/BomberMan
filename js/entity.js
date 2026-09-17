/**
 * キャラクター（プレイヤー・CPU）の基底クラス
 * 元ネタ（ボンバーマン）に準拠したビジュアル & 死亡時のド派手な吹っ飛び演出
 */
class Entity {
  constructor(id, name, col, row, bodyColor, antennaColor, shoeColor = '#ff4081') {
    this.id = id;
    this.name = name;
    this.bodyColor = bodyColor;       // 服の色（1P: 青, CPU1: 赤, CPU2: 緑, CPU3: 黄）
    this.antennaColor = antennaColor; // アンテナ・ポンポンの色
    this.shoeColor = shoeColor;       // 靴の色（白ボンは伝統のピンク/マゼンタ）

    // 位置（ピクセル単位）
    this.x = (col + 0.5) * TILE_SIZE;
    this.y = (row + 0.5) * TILE_SIZE;
    this.radius = TILE_SIZE * 0.36; // 当たり判定半径

    // 能力パラメータ
    this.speed = CONFIG.PLAYER_BASE_SPEED;
    this.maxBombs = CONFIG.BASE_BOMBS;
    this.activeBombs = 0;
    this.bombPower = CONFIG.BASE_POWER;

    // 状態
    this.alive = true;
    this.deathGeneration = 0;
    this.invulnerable = 0;
    this.isDying = false;
    this.facing = DIR.DOWN; // 現在の向き
    this.walkAnimTimer = 0;
    this.isMoving = false;

    // 吹っ飛び演出用パラメータ
    this.isFlyingAway = false;
    this.flyVx = 0;
    this.flyVy = 0;
    this.flyRotation = 0;
    this.flyRotationSpeed = 0;
    this.flyScale = 1.0;
    this.flyTimer = 0;
    this.trailTimer = 0;

    // 現在居るマス
    this.currentCol = col;
    this.currentRow = row;
  }

  // 現在のグリッド座標
  get col() {
    return Math.floor(this.x / TILE_SIZE);
  }
  get row() {
    return Math.floor(this.y / TILE_SIZE);
  }

  update(dt, map, bombs, onSpawnTrail) {
    if (!this.alive) return;

    // 死亡吹っ飛びアニメーション
    if (this.isFlyingAway) {
      this.flyTimer += dt;
      this.x += this.flyVx * dt;
      this.y += this.flyVy * dt;
      this.flyVy += 1150 * dt; // 重力加速度
      this.flyRotation += this.flyRotationSpeed * dt;

      // 手前に飛び出してくるように拡大してから遠ざかる
      if (this.flyTimer < 0.5) {
        this.flyScale = 1.0 + (this.flyTimer / 0.5) * 0.9; // 最大1.9倍
      } else {
        this.flyScale = Math.max(0.4, 1.9 - (this.flyTimer - 0.5) * 0.8);
      }

      // 吹っ飛びの軌跡に星や煙リングを放出
      this.trailTimer += dt;
      if (this.trailTimer > 0.04) {
        this.trailTimer = 0;
        if (onSpawnTrail) {
          onSpawnTrail(this.x, this.y);
        }
      }

      // 画面外に落下したか一定時間経過で死亡完了
      if (this.flyTimer > 1.8 || this.y > CANVAS_HEIGHT + 140) {
        this.alive = false;
        this.isFlyingAway = false;
        this.isDying = false;
      }
      return;
    }

    this.currentCol = this.col;
    this.currentRow = this.row;

    if (this.isMoving) {
      this.walkAnimTimer += dt * 10;
    } else {
      this.walkAnimTimer = 0;
    }

    // 設置した爆弾から離脱したかのチェック
    bombs.forEach(bomb => {
      if (bomb.passableEntities.has(this)) {
        const bX = (bomb.col + 0.5) * TILE_SIZE;
        const bY = (bomb.row + 0.5) * TILE_SIZE;
        const dist = Math.hypot(this.x - bX, this.y - bY);
        if (dist > TILE_SIZE * 0.85) {
          bomb.passableEntities.delete(this);
        }
      }
    });
  }

  /**
   * コーナリングアシスト付き移動処理
   */
  move(dir, dt, map, bombs) {
    if (!this.alive || this.isDying || this.isFlyingAway) return;

    this.facing = dir;
    this.isMoving = true;

    const moveDist = this.speed * dt;
    let targetX = this.x + dir.x * moveDist;
    let targetY = this.y + dir.y * moveDist;

    // 水平方向移動時の垂直方向アライメント（コーナリング補正）
    if (dir.x !== 0) {
      const centerTileY = (this.row + 0.5) * TILE_SIZE;
      const offsetY = this.y - centerTileY;

      const nextCol = this.col + dir.x;
      const isBlocked = !this.canEnter(nextCol, this.row, map, bombs);

      if (isBlocked) {
        const assistSpeed = this.speed * dt * 0.8;
        if (offsetY > 4 && this.canEnter(nextCol, this.row + 1, map, bombs) && this.canEnter(this.col, this.row + 1, map, bombs)) {
          targetY += assistSpeed;
        } else if (offsetY < -4 && this.canEnter(nextCol, this.row - 1, map, bombs) && this.canEnter(this.col, this.row - 1, map, bombs)) {
          targetY -= assistSpeed;
        }
      } else {
        if (Math.abs(offsetY) > 2) {
          targetY -= Math.sign(offsetY) * Math.min(Math.abs(offsetY), this.speed * dt * 0.5);
        }
      }
    }

    // 垂直方向移動時の水平方向アライメント（コーナリング補正）
    if (dir.y !== 0) {
      const centerTileX = (this.col + 0.5) * TILE_SIZE;
      const offsetX = this.x - centerTileX;

      const nextRow = this.row + dir.y;
      const isBlocked = !this.canEnter(this.col, nextRow, map, bombs);

      if (isBlocked) {
        const assistSpeed = this.speed * dt * 0.8;
        if (offsetX > 4 && this.canEnter(this.col + 1, nextRow, map, bombs) && this.canEnter(this.col + 1, this.row, map, bombs)) {
          targetX += assistSpeed;
        } else if (offsetX < -4 && this.canEnter(this.col - 1, nextRow, map, bombs) && this.canEnter(this.col - 1, this.row, map, bombs)) {
          targetX -= assistSpeed;
        }
      } else {
        if (Math.abs(offsetX) > 2) {
          targetX -= Math.sign(offsetX) * Math.min(Math.abs(offsetX), this.speed * dt * 0.5);
        }
      }
    }

    // 衝突判定解決
    const resolvedPos = this.resolveCollision(targetX, targetY, map, bombs);
    this.x = resolvedPos.x;
    this.y = resolvedPos.y;
  }

  canEnter(col, row, map, bombs) {
    if (!map.isWalkable(col, row)) return false;
    const bomb = bombs.find(b => b.col === col && b.row === row && !b.hasExploded);
    if (bomb && !bomb.passableEntities.has(this)) {
      return false;
    }
    return true;
  }

  resolveCollision(targetX, targetY, map, bombs) {
    let finalX = targetX;
    let finalY = targetY;

    if (finalX > this.x) {
      const testX = finalX + this.radius;
      const topY = this.y - this.radius * 0.7;
      const botY = this.y + this.radius * 0.7;
      const c = Math.floor(testX / TILE_SIZE);
      const r1 = Math.floor(topY / TILE_SIZE);
      const r2 = Math.floor(botY / TILE_SIZE);
      if (!this.canEnter(c, r1, map, bombs) || !this.canEnter(c, r2, map, bombs)) {
        finalX = c * TILE_SIZE - this.radius - 0.01;
      }
    } else if (finalX < this.x) {
      const testX = finalX - this.radius;
      const topY = this.y - this.radius * 0.7;
      const botY = this.y + this.radius * 0.7;
      const c = Math.floor(testX / TILE_SIZE);
      const r1 = Math.floor(topY / TILE_SIZE);
      const r2 = Math.floor(botY / TILE_SIZE);
      if (!this.canEnter(c, r1, map, bombs) || !this.canEnter(c, r2, map, bombs)) {
        finalX = (c + 1) * TILE_SIZE + this.radius + 0.01;
      }
    }

    if (finalY > this.y) {
      const testY = finalY + this.radius;
      const leftX = finalX - this.radius * 0.7;
      const rightX = finalX + this.radius * 0.7;
      const r = Math.floor(testY / TILE_SIZE);
      const c1 = Math.floor(leftX / TILE_SIZE);
      const c2 = Math.floor(rightX / TILE_SIZE);
      if (!this.canEnter(c1, r, map, bombs) || !this.canEnter(c2, r, map, bombs)) {
        finalY = r * TILE_SIZE - this.radius - 0.01;
      }
    } else if (finalY < this.y) {
      const testY = finalY - this.radius;
      const leftX = finalX - this.radius * 0.7;
      const rightX = finalX + this.radius * 0.7;
      const r = Math.floor(testY / TILE_SIZE);
      const c1 = Math.floor(leftX / TILE_SIZE);
      const c2 = Math.floor(rightX / TILE_SIZE);
      if (!this.canEnter(c1, r, map, bombs) || !this.canEnter(c2, r, map, bombs)) {
        finalY = (r + 1) * TILE_SIZE + this.radius + 0.01;
      }
    }

    return { x: finalX, y: finalY };
  }

  placeBomb(bombs, entities = []) {
    if (!this.alive || this.isDying || this.isFlyingAway) return null;
    if (this.activeBombs >= this.maxBombs) return null;

    const c = this.col;
    const r = this.row;

    const existing = bombs.find(b => b.col === c && b.row === r && !b.hasExploded);
    if (existing) return null;

    const bomb = new Bomb(c, r, this.bombPower, this);
    this.activeBombs++;

    bomb.passableEntities.add(this);
    entities.forEach(ent => {
      if (ent.alive && ent.col === c && ent.row === r) {
        bomb.passableEntities.add(ent);
      }
    });

    soundManager.playBombSet();
    return bomb;
  }

  // 被弾（ド派手な吹っ飛び演出の開始！）
  kill() {
    if (!this.alive || this.isDying || this.isFlyingAway) return;
    this.isDying = true;
    this.isFlyingAway = true;
    this.flyTimer = 0;
    this.trailTimer = 0;

    // 上空へ大きく打ち上げられてキリモミ回転！
    this.flyVx = (Math.random() - 0.5) * 320;
    this.flyVy = -620 - Math.random() * 100;
    this.flyRotationSpeed = (this.flyVx >= 0 ? 1 : -1) * (14 + Math.random() * 6);
    this.flyScale = 1.0;

    soundManager.playBlowAway();
  }

  // キャラクターの描画（元ネタ完全再現！）
  render(ctx) {
    if (!this.alive && !this.isFlyingAway) return;

    ctx.save();

    let cx = this.x;
    let cy = this.y;

    // 吹っ飛び演出時の座標変換
    if (this.isFlyingAway) {
      ctx.translate(cx, cy);
      ctx.rotate(this.flyRotation);
      ctx.scale(this.flyScale, this.flyScale);
      cx = 0;
      cy = 0;
    } else {
      // 通常時の地面の影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + this.radius * 0.8, this.radius * 0.85, this.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const bounce = this.isFlyingAway ? 0 : Math.abs(Math.sin(this.walkAnimTimer)) * 3;
    const walkOffset = this.isFlyingAway ? 0 : Math.sin(this.walkAnimTimer) * 5;

    // 1. 足・シューズ（元ネタの丸いピンク/赤シューズ）
    ctx.fillStyle = this.shoeColor;
    if (this.facing === DIR.LEFT) {
      ctx.beginPath();
      ctx.arc(cx - 5 + walkOffset, cy + 10, 5, 0, Math.PI * 2);
      ctx.arc(cx + 3 - walkOffset, cy + 10, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.facing === DIR.RIGHT) {
      ctx.beginPath();
      ctx.arc(cx - 3 + walkOffset, cy + 10, 5, 0, Math.PI * 2);
      ctx.arc(cx + 5 - walkOffset, cy + 10, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx - 7, cy + 10 - walkOffset * 0.4, 5, 0, Math.PI * 2);
      ctx.arc(cx + 7, cy + 10 + walkOffset * 0.4, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. 胴体（服）
    ctx.fillStyle = this.bodyColor;
    ctx.beginPath();
    ctx.roundRect(cx - 10, cy - 2 - bounce, 20, 13, 4);
    ctx.fill();

    // 白いベルト & 黄色い四角いバックル
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 10, cy + 5 - bounce, 20, 3);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(cx - 3.5, cy + 4 - bounce, 7, 5);

    // 3. 手・グローブ（白い丸い手袋）
    ctx.fillStyle = '#ffffff';
    if (this.isFlyingAway) {
      // 吹っ飛び時は万歳スタイルでバタバタ
      ctx.beginPath();
      ctx.arc(cx - 13, cy - 10, 5, 0, Math.PI * 2);
      ctx.arc(cx + 13, cy - 10, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.facing === DIR.LEFT) {
      ctx.beginPath();
      ctx.arc(cx - 8 - walkOffset, cy + 3 - bounce, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.facing === DIR.RIGHT) {
      ctx.beginPath();
      ctx.arc(cx + 8 + walkOffset, cy + 3 - bounce, 4.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx - 12, cy + 3 - bounce + walkOffset * 0.5, 4.5, 0, Math.PI * 2);
      ctx.arc(cx + 12, cy + 3 - bounce - walkOffset * 0.5, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. 首周りの白襟
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 6, cy - 4 - bounce, 12, 3);

    // 5. 頭部（ヘルメット）
    const headY = cy - 11 - bounce;

    // 白ヘルメット球体
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, headY, 13, 0, Math.PI * 2);
    ctx.fill();

    // ヘルメットの立体ハイライト
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, headY + 5, 12, 0.2, Math.PI - 0.2);
    ctx.fill();

    // 6. 頭頂部アンテナ（元ネタの四角いポンポン）
    // アンテナ台座
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(cx - 2, headY - 15, 4, 3);
    // アンテナ本体（ピンク/各カラーの球体/ポンポン）
    ctx.fillStyle = this.antennaColor;
    ctx.beginPath();
    ctx.arc(cx, headY - 16, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // 7. 顔（フェイスプレート）
    let faceX = cx;
    let faceY = headY + 1;

    if (this.facing === DIR.LEFT) faceX -= 3;
    if (this.facing === DIR.RIGHT) faceX += 3;
    if (this.facing === DIR.UP) faceY -= 2;

    // 背面（上向き）でなければ顔を描画
    if (this.facing !== DIR.UP || this.isFlyingAway) {
      // 肌色の顔エリア
      ctx.fillStyle = '#ffe0bd';
      ctx.beginPath();
      ctx.roundRect(faceX - 8.5, faceY - 6.5, 17, 13, 5);
      ctx.fill();

      // 額のピンクライン（ボンバーマンのトレードマーク！）
      ctx.fillStyle = this.antennaColor;
      ctx.fillRect(faceX - 4, faceY - 6, 8, 2);

      // ほっぺのチーク
      ctx.fillStyle = 'rgba(255, 120, 160, 0.4)';
      ctx.beginPath();
      ctx.arc(faceX - 6, faceY + 2.5, 2, 0, Math.PI * 2);
      ctx.arc(faceX + 6, faceY + 2.5, 2, 0, Math.PI * 2);
      ctx.fill();

      // 目・表情の描画
      if (this.isFlyingAway) {
        // 【吹っ飛び時のやられ顔！】× × の目と「O」の口！
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 2;

        // 左目 ×
        ctx.beginPath();
        ctx.moveTo(faceX - 6, faceY - 3);
        ctx.lineTo(faceX - 2, faceY + 1);
        ctx.moveTo(faceX - 2, faceY - 3);
        ctx.lineTo(faceX - 6, faceY + 1);
        ctx.stroke();

        // 右目 ×
        ctx.beginPath();
        ctx.moveTo(faceX + 2, faceY - 3);
        ctx.lineTo(faceX + 6, faceY + 1);
        ctx.moveTo(faceX + 6, faceY - 3);
        ctx.lineTo(faceX + 2, faceY + 1);
        ctx.stroke();

        // あんぐり開いた口 O
        ctx.fillStyle = '#ff3366';
        ctx.beginPath();
        ctx.ellipse(faceX, faceY + 4, 3, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

      } else {
        // 通常時の愛嬌ある縦長黒目！
        let eyeOffset = 0;
        if (this.facing === DIR.LEFT) eyeOffset = -2;
        if (this.facing === DIR.RIGHT) eyeOffset = 2;

        // 左目
        ctx.fillStyle = '#111118';
        ctx.beginPath();
        ctx.roundRect(faceX - 4.5 + eyeOffset, faceY - 3.5, 2.8, 6.5, 1.2);
        ctx.fill();

        // 右目
        ctx.beginPath();
        ctx.roundRect(faceX + 1.8 + eyeOffset, faceY - 3.5, 2.8, 6.5, 1.2);
        ctx.fill();

        // 目のキラキラハイライト（上部）
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(faceX - 4 + eyeOffset, faceY - 3, 1.5, 2);
        ctx.fillRect(faceX + 2.3 + eyeOffset, faceY - 3, 1.5, 2);
      }
    }

    ctx.restore();
  }
}
