/**
 * アイテム管理クラス
 * パワーアップアイテムの生成、描画、取得判定、消滅判定
 */
class Item {
  constructor(col, row, type) {
    this.col = col;
    this.row = row;
    this.type = type; // 'bomb', 'fire', 'speed'
    this.collected = false;
    this.animTimer = Math.random() * Math.PI * 2; // アニメーションオフセット

    // 出現直後の無敵タイマー（自身のブロックを壊した爆風で即消滅するのを防止）
    this.immunityTimer = 0.9; 

    // 出現ポップアニメーション
    this.spawnTimer = 0.4;
    this.spawnDuration = 0.4;
  }

  // 中心座標
  get x() {
    return (this.col + 0.5) * TILE_SIZE;
  }
  get y() {
    return (this.row + 0.5) * TILE_SIZE;
  }

  update(dt) {
    this.animTimer += dt * 5;
    if (this.immunityTimer > 0) {
      this.immunityTimer -= dt;
    }
    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
    }
  }

  // 描画
  render(ctx) {
    if (this.collected) return;

    const cx = this.x;
    let cy = this.y + Math.sin(this.animTimer) * 3; // 上下に浮遊

    // 出現時のポヨンと跳ねる演出
    let scale = 1;
    if (this.spawnTimer > 0) {
      const progress = 1 - (this.spawnTimer / this.spawnDuration);
      // イージングバウンス
      const bounce = Math.sin(progress * Math.PI) * 14;
      cy -= bounce;
      scale = 0.6 + progress * 0.4;
    }

    const size = TILE_SIZE * 0.78 * scale;
    const half = size / 2;

    ctx.save();

    // アイテム外側のキラキラ光輪エフェクト
    const glowAlpha = 0.4 + Math.sin(this.animTimer * 2) * 0.25;
    ctx.shadowColor = this.type === ITEM_TYPE.FIRE ? '#ff5722' : (this.type === ITEM_TYPE.BOMB ? '#ffd700' : '#00e5ff');
    ctx.shadowBlur = 10;

    // アイテム台座（角丸四角形プレート）
    ctx.fillStyle = '#181f34';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(cx - half, cy - half, size, size, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0; // 内部描画のためリセット

    // プレート内側の軽いハイライト
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(cx - half + 2, cy - half + 2, size - 4, (size - 4) / 2);

    // 種類に応じたシンボル描画
    if (this.type === ITEM_TYPE.BOMB) {
      // 元ネタ風の黒爆弾アイコン
      ctx.fillStyle = '#111318';
      ctx.beginPath();
      ctx.arc(cx, cy + 3 * scale, 11 * scale, 0, Math.PI * 2);
      ctx.fill();

      // ツヤハイライト
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 3.5 * scale, cy - 0.5 * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // 口金
      ctx.fillStyle = '#7a8299';
      ctx.fillRect(cx - 3 * scale, cy - 10 * scale, 6 * scale, 3 * scale);

      // 導火線
      ctx.strokeStyle = '#c5943f';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10 * scale);
      ctx.quadraticCurveTo(cx + 5 * scale, cy - 14 * scale, cx + 8 * scale, cy - 11 * scale);
      ctx.stroke();

      // 赤い火花
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(cx + 7 * scale, cy - 14 * scale, 3 * scale, 3 * scale);

    } else if (this.type === ITEM_TYPE.FIRE) {
      // 元ネタ風の炎（ファイヤー君）
      // 外側の赤炎
      ctx.fillStyle = '#ff2200';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 14 * scale);
      ctx.bezierCurveTo(cx + 10 * scale, cy - 8 * scale, cx + 13 * scale, cy + 5 * scale, cx + 8 * scale, cy + 12 * scale);
      ctx.bezierCurveTo(cx, cy + 15 * scale, cx - 8 * scale, cy + 12 * scale, cx - 13 * scale, cy + 5 * scale);
      ctx.bezierCurveTo(cx - 10 * scale, cy - 8 * scale, cx, cy - 14 * scale, cx, cy - 14 * scale);
      ctx.fill();

      // 内側の黄色炎
      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7 * scale);
      ctx.bezierCurveTo(cx + 6 * scale, cy - 3 * scale, cx + 8 * scale, cy + 5 * scale, cx + 4 * scale, cy + 9 * scale);
      ctx.bezierCurveTo(cx, cy + 11 * scale, cx - 4 * scale, cy + 9 * scale, cx - 8 * scale, cy + 5 * scale);
      ctx.bezierCurveTo(cx - 6 * scale, cy - 3 * scale, cx, cy - 7 * scale, cx, cy - 7 * scale);
      ctx.fill();

      // 元ネタ風の可愛い2つの目！
      ctx.fillStyle = '#111';
      ctx.fillRect(cx - 4 * scale, cy - 1 * scale, 2.5 * scale, 4 * scale);
      ctx.fillRect(cx + 1.5 * scale, cy - 1 * scale, 2.5 * scale, 4 * scale);

    } else if (this.type === ITEM_TYPE.SPEED) {
      // 元ネタ完全再現！赤いローラースケート靴（Skate）
      // 靴（赤）
      ctx.fillStyle = '#ff2b44';
      ctx.beginPath();
      ctx.roundRect(cx - 10 * scale, cy - 10 * scale, 12 * scale, 12 * scale, 2);
      ctx.roundRect(cx - 10 * scale, cy - 2 * scale, 20 * scale, 7 * scale, 2);
      ctx.fill();

      // 白い靴紐・ハイライト
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 6 * scale, cy - 8 * scale, 6 * scale, 2 * scale);
      ctx.fillRect(cx - 6 * scale, cy - 4 * scale, 6 * scale, 2 * scale);
      ctx.fillRect(cx + 4 * scale, cy, 4 * scale, 3 * scale); // つま先ハイライト

      // シャーシプレート（シルバー）
      ctx.fillStyle = '#a0aec0';
      ctx.fillRect(cx - 10 * scale, cy + 5 * scale, 20 * scale, 2.5 * scale);

      // 前後の黄色ウィール（車輪）
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(cx - 6 * scale, cy + 9 * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.arc(cx + 6 * scale, cy + 9 * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();

      // 車輪のハブ
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(cx - 6 * scale, cy + 9 * scale, 1.2 * scale, 0, Math.PI * 2);
      ctx.arc(cx + 6 * scale, cy + 9 * scale, 1.2 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // 取得効果を適用
  applyEffect(entity) {
    let effectText = '';
    if (this.type === ITEM_TYPE.BOMB) {
      if (entity.maxBombs < CONFIG.MAX_BOMBS) {
        entity.maxBombs++;
      }
      effectText = '💣 BOMB +1';
    } else if (this.type === ITEM_TYPE.FIRE) {
      if (entity.bombPower < CONFIG.MAX_POWER) {
        entity.bombPower++;
      }
      effectText = '🔥 FIRE +1';
    } else if (this.type === ITEM_TYPE.SPEED) {
      if (entity.speed < CONFIG.MAX_SPEED) {
        entity.speed = Math.min(CONFIG.MAX_SPEED, entity.speed + CONFIG.PLAYER_SPEED_BOOST);
      }
      effectText = '⚡ SPEED UP!';
    }
    this.collected = true;
    return effectText;
  }
}
