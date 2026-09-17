/**
 * 爆弾および爆風管理クラス
 */

class Bomb {
  constructor(col, row, power, owner) {
    this.col = col;
    this.row = row;
    this.power = power;
    this.owner = owner;
    this.timer = CONFIG.BOMB_FUSE_TIME;
    this.hasExploded = false;
    this.fuseSparkTimer = 0;

    // 爆弾を踏み越えられるエンティティのリスト（初期は設置したマスにいるキャラ全員）
    this.passableEntities = new Set();
  }

  update(dt) {
    this.timer -= dt * 1000;
    this.fuseSparkTimer += dt * 20;

    if (this.timer <= 0 && !this.hasExploded) {
      this.explode();
    }
  }

  // 爆発処理
  explode() {
    if (this.hasExploded) return;
    this.hasExploded = true;
    if (this.owner) {
      this.owner.activeBombs = Math.max(0, this.owner.activeBombs - 1);
    }
    soundManager.playExplosion();
  }

  render(ctx) {
    const cx = (this.col + 0.5) * TILE_SIZE;
    const cy = (this.row + 0.5) * TILE_SIZE;

    // 鼓動（爆発が近づくにつれて速く大きく脈動）
    const remainingRatio = Math.max(0, this.timer / CONFIG.BOMB_FUSE_TIME);
    const pulseSpeed = 4 + (1 - remainingRatio) * 16;
    const pulseScale = 1 + Math.sin(Date.now() * 0.001 * pulseSpeed) * 0.08;

    const radius = (TILE_SIZE * 0.38) * pulseScale;

    ctx.save();

    // 爆弾の影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + radius * 0.8, radius * 0.9, radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // 爆弾本体（艶のある黒球体、爆発直前は赤黒点滅警告）
    const isFlashing = remainingRatio < 0.28 && Math.floor(Date.now() / 80) % 2 === 0;

    if (isFlashing) {
      // 爆発寸前の赤熱フラッシュ（元ネタの点滅警告！）
      ctx.fillStyle = '#ff1100';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffea00';
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(
        cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
        cx, cy, radius
      );
      grad.addColorStop(0, '#5a6275');
      grad.addColorStop(0.3, '#2a2e3a');
      grad.addColorStop(0.8, '#101218');
      grad.addColorStop(1, '#050608');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // ハイライト
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.35, cy - radius * 0.35, radius * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // 金属口金
    ctx.fillStyle = '#8f9bb3';
    ctx.fillRect(cx - 3, cy - radius - 3, 6, 4);

    // 導火線
    ctx.strokeStyle = '#c5943f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius - 3);
    ctx.quadraticCurveTo(cx + 6, cy - radius - 8, cx + 8, cy - radius - 5);
    ctx.stroke();

    // 火花（パチパチ）
    const sparkX = cx + 8;
    const sparkY = cy - radius - 5;
    const sparkColor = Math.sin(this.fuseSparkTimer) > 0 ? '#ffea00' : '#ff3300';
    ctx.fillStyle = sparkColor;
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 3 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

/**
 * 爆風クラス（十字に広がる炎）
 */
class Explosion {
  constructor(centerCol, centerRow, power, map, allBombs, onBlockDestroyed, misoCredit = null) {
    this.misoCredit = misoCredit;
    this.centerCol = centerCol;
    this.centerRow = centerRow;
    this.power = power;
    this.timer = CONFIG.EXPLOSION_DURATION;
    this.isDone = false;
    this.segments = []; // 爆風が及ぶマス一覧 [{ col, row, dir }]

    this.calculateSpread(map, allBombs, onBlockDestroyed);
  }

  // 爆風の拡散計算
  calculateSpread(map, allBombs, onBlockDestroyed) {
    // 中心
    this.segments.push({ col: this.centerCol, row: this.centerRow, dir: 'center' });

    const directions = [
      { x: 0, y: -1, dir: 'vert', endDir: 'end_up' },
      { x: 0, y: 1, dir: 'vert', endDir: 'end_down' },
      { x: -1, y: 0, dir: 'horiz', endDir: 'end_left' },
      { x: 1, y: 0, dir: 'horiz', endDir: 'end_right' }
    ];

    directions.forEach(d => {
      for (let step = 1; step <= this.power; step++) {
        const c = this.centerCol + d.x * step;
        const r = this.centerRow + d.y * step;

        const tile = map.getTile(c, r);

        // 壁（ハードブロック）なら爆風は遮断
        if (tile === TILE.WALL) {
          break;
        }

        // ソフトブロックなら、そのマスで燃焼して停止
        if (tile === TILE.BLOCK) {
          this.segments.push({ col: c, row: r, dir: step === this.power ? d.endDir : d.dir });
          map.destroyBlock(c, r, onBlockDestroyed);
          break;
        }

        // 空きマス
        const isEnd = (step === this.power);
        this.segments.push({ col: c, row: r, dir: isEnd ? d.endDir : d.dir });

        // そのマスに別の爆弾があれば即時誘爆
        const hitBomb = allBombs.find(b => b.col === c && b.row === r && !b.hasExploded);
        if (hitBomb) {
          if (this.misoCredit) hitBomb.misoCredit = this.misoCredit;
          hitBomb.explode();
        }
      }
    });
  }

  update(dt) {
    this.timer -= dt * 1000;
    if (this.timer <= 0) {
      this.isDone = true;
    }
  }

  // 爆風が指定座標を含んでいるか判定
  covers(col, row) {
    return this.segments.some(s => s.col === col && s.row === row);
  }

  render(ctx) {
    const alpha = Math.min(1, this.timer / (CONFIG.EXPLOSION_DURATION * 0.25));

    ctx.save();
    ctx.globalAlpha = alpha;

    this.segments.forEach(seg => {
      const x = seg.col * TILE_SIZE;
      const y = seg.row * TILE_SIZE;
      const cx = x + TILE_SIZE / 2;
      const cy = y + TILE_SIZE / 2;

      // 炎の外側（赤・オレンジ）
      ctx.fillStyle = '#ff2a00';
      if (seg.dir === 'center') {
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.48, 0, Math.PI * 2);
        ctx.fill();
      } else if (seg.dir === 'horiz') {
        ctx.fillRect(x, cy - TILE_SIZE * 0.38, TILE_SIZE, TILE_SIZE * 0.76);
      } else if (seg.dir === 'vert') {
        ctx.fillRect(cx - TILE_SIZE * 0.38, y, TILE_SIZE * 0.76, TILE_SIZE);
      } else if (seg.dir === 'end_left') {
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.42, Math.PI * 0.5, Math.PI * 1.5);
        ctx.fillRect(cx, cy - TILE_SIZE * 0.38, TILE_SIZE * 0.5, TILE_SIZE * 0.76);
        ctx.fill();
      } else if (seg.dir === 'end_right') {
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.42, -Math.PI * 0.5, Math.PI * 0.5);
        ctx.fillRect(x, cy - TILE_SIZE * 0.38, TILE_SIZE * 0.5, TILE_SIZE * 0.76);
        ctx.fill();
      } else if (seg.dir === 'end_up') {
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.42, Math.PI, Math.PI * 2);
        ctx.fillRect(cx - TILE_SIZE * 0.38, cy, TILE_SIZE * 0.76, TILE_SIZE * 0.5);
        ctx.fill();
      } else if (seg.dir === 'end_down') {
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.42, 0, Math.PI);
        ctx.fillRect(cx - TILE_SIZE * 0.38, y, TILE_SIZE * 0.76, TILE_SIZE * 0.5);
        ctx.fill();
      }

      // 中間炎（明るいオレンジ）
      ctx.fillStyle = '#ff8800';
      if (seg.dir === 'center') {
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.34, 0, Math.PI * 2);
        ctx.fill();
      } else if (seg.dir === 'horiz' || seg.dir === 'end_left' || seg.dir === 'end_right') {
        ctx.fillRect(x, cy - TILE_SIZE * 0.24, TILE_SIZE, TILE_SIZE * 0.48);
      } else {
        ctx.fillRect(cx - TILE_SIZE * 0.24, y, TILE_SIZE * 0.48, TILE_SIZE);
      }

      // 中心部（鮮やかな黄色・白）
      ctx.fillStyle = '#fffa65';
      if (seg.dir === 'center') {
        ctx.beginPath();
        ctx.arc(cx, cy, TILE_SIZE * 0.18, 0, Math.PI * 2);
        ctx.fill();
      } else if (seg.dir === 'horiz' || seg.dir === 'end_left' || seg.dir === 'end_right') {
        ctx.fillRect(x, cy - TILE_SIZE * 0.1, TILE_SIZE, TILE_SIZE * 0.2);
      } else {
        ctx.fillRect(cx - TILE_SIZE * 0.1, y, TILE_SIZE * 0.2, TILE_SIZE);
      }
    });

    ctx.restore();
  }
}
