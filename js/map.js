/**
 * マップ管理クラス
 * ステージ生成、ブロック配置、壁・ブロックの描画、衝突判定
 */
class GameMap {
  constructor(cols = MAP_COLS, rows = MAP_ROWS, stageId = 'classic') {
    this.stageId = normalizeStageId(stageId);
    this.cols = cols;
    this.rows = rows;
    this.grid = []; // [row][col]
    this.burningBlocks = []; // 破壊中のブロック情報 { col, row, progress, maxProgress }
    this.init();
  }

  init(blockData = null, stageId = this.stageId) {
    this.stageId = normalizeStageId(stageId);
    this.grid = [];
    this.burningBlocks = [];

    if (blockData) {
      this.grid = blockData.map(row => [...row]);
      return;
    }

    const safeZones = this.getSafeZones();

    if (this.stageId === 'hexagon') {
      this.generateHexagonArena(safeZones);
      return;
    }

    if (this.stageId === 'ice') {
      this.generateIceArena(safeZones);
      return;
    }

    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        // 外壁
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
          row.push(TILE.WALL);
        }
        // 偶数マス固定柱（破壊不可）
        else if (r % 2 === 0 && c % 2 === 0) {
          row.push(TILE.WALL);
        }
        // スポーン安全地帯
        else if (safeZones.has(`${c},${r}`)) {
          row.push(TILE.EMPTY);
        }
        // ソフトブロック（確率配置）
        else if (Math.random() < CONFIG.BLOCK_SPAWN_CHANCE) {
          row.push(TILE.BLOCK);
        } else {
          row.push(TILE.EMPTY);
        }
      }
      this.grid.push(row);
    }
  }

  generateIceArena(safeZones) {
    const midCol = Math.floor(this.cols / 2);
    const midRow = Math.floor(this.rows / 2);
    // 左右・上下で同じ配置にし、どのスポーンも同じ条件にする。
    const quadrants = new Map();
    for (let row = 0; row < this.rows; row++) {
      const tiles = [];
      for (let col = 0; col < this.cols; col++) {
        const outer = col === 0 || row === 0 || col === this.cols - 1 || row === this.rows - 1;
        const centralLane = col === midCol || row === midRow;
        const pillar = col % 2 === 0 && row % 2 === 0 && !centralLane;
        if (outer || pillar) tiles.push(TILE.WALL);
        else if (safeZones.has(`${col},${row}`) || centralLane) tiles.push(TILE.EMPTY);
        else {
          const key = `${Math.min(col, this.cols - 1 - col)},${Math.min(row, this.rows - 1 - row)}`;
          if (!quadrants.has(key)) quadrants.set(key, Math.random() < 0.65 ? TILE.BLOCK : TILE.EMPTY);
          tiles.push(quadrants.get(key));
        }
      }
      this.grid.push(tiles);
    }
  }

  getSafeZones() {
    const safeZones = new Set();
    const positionKey = this.stageId === 'hexagon' ? 'hexagon' : 'classic';
    PLAYER_SLOTS.forEach(slot => {
      const [col, row] = getPlayerSpawn(slot.slot, positionKey, this.cols, this.rows);
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        safeZones.add(`${col + dx},${row + dy}`);
      });
    });
    return safeZones;
  }

  getHexRange(row) {
    const inset = Math.max(1, Math.floor((this.rows - 3) / 2) - Math.min(row, this.rows - 1 - row));
    return [inset, this.cols - 1 - inset];
  }

  generateHexagonArena(safeZones) {
    for (let row = 0; row < this.rows; row++) {
      const tiles = [];
      const [minCol, maxCol] = this.getHexRange(row);
      for (let col = 0; col < this.cols; col++) {
        const outside = col < minCol || col > maxCol;
        const boundary = !outside && (col === minCol || col === maxCol || row === 0 || row === this.rows - 1);
        const pillar = !outside && col % 2 === 0 && row % 2 === 0;
        if (outside || boundary) tiles.push(TILE.WALL);
        else if (safeZones.has(`${col},${row}`)) tiles.push(TILE.EMPTY);
        else if (pillar) tiles.push(TILE.WALL);
        else tiles.push(Math.random() < 0.58 ? TILE.BLOCK : TILE.EMPTY);
      }
      this.grid.push(tiles);
    }
  }

  getBlockData() {
    return this.grid.map(row => [...row]);
  }

  // 座標からタイル取得
  getTile(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return TILE.WALL;
    }
    return this.grid[row][col];
  }

  // タイル設定
  setTile(col, row, tileType) {
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      this.grid[row][col] = tileType;
    }
  }

  // ソフトブロックの破壊開始
  destroyBlock(col, row, onComplete) {
    if (this.getTile(col, row) !== TILE.BLOCK) return;

    // 既に燃焼中か確認
    const exists = this.burningBlocks.some(b => b.col === col && b.row === row);
    if (exists) return;

    this.burningBlocks.push({
      col,
      row,
      progress: 0,
      duration: CONFIG.BLOCK_BURN_DURATION,
      onComplete
    });
  }

  update(dt) {
    for (let i = this.burningBlocks.length - 1; i >= 0; i--) {
      const b = this.burningBlocks[i];
      b.progress += dt * 1000;
      if (b.progress >= b.duration) {
        // 燃え尽き完了
        this.setTile(b.col, b.row, TILE.EMPTY);
        if (b.onComplete) {
          b.onComplete(b.col, b.row);
        }
        this.burningBlocks.splice(i, 1);
      }
    }
  }

  // 通行可能か（空マスかつ燃焼中でない）
  isWalkable(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    if (this.grid[row][col] !== TILE.EMPTY) return false;
    // 燃焼中のブロックも通過不可
    if (this.burningBlocks.some(b => b.col === col && b.row === row)) return false;
    return true;
  }

  // 描画処理
  render(ctx) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const tile = this.grid[r][c];

        if (this.stageId === 'hexagon') {
          this.renderHexTile(ctx, c, r, tile);
          continue;
        }
        if (this.stageId === 'ice') {
          this.renderIceTile(ctx, c, r, tile);
          continue;
        }

        // 床の描画（元ネタ風の鮮やかなグリーン芝生チェッカー模様）
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = '#48ab3b';
        } else {
          ctx.fillStyle = '#3c9331';
        }
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        // 芝生の微細テクスチャ（点々）
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(x + 10, y + 10, 2, 2);
        ctx.fillRect(x + 28, y + 16, 2, 2);
        ctx.fillRect(x + 18, y + 34, 2, 2);
        ctx.fillRect(x + 36, y + 38, 2, 2);

        if (tile === TILE.WALL) {
          const isOuter = (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1);
          this.renderWall(ctx, x, y, isOuter);
        } else if (tile === TILE.BLOCK) {
          const burning = this.burningBlocks.find(b => b.col === c && b.row === r);
          if (burning) {
            this.renderBurningBlock(ctx, x, y, burning.progress / burning.duration);
          } else {
            this.renderSoftBlock(ctx, x, y);
          }
        }
      }
    }
  }

  renderHexTile(ctx, col, row, tile) {
    const x = col * TILE_SIZE, y = row * TILE_SIZE;
    const [minCol, maxCol] = this.getHexRange(row);
    if (col < minCol || col > maxCol) {
      ctx.fillStyle = '#080b18';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      return;
    }
    ctx.fillStyle = (col + row) % 2 ? '#31245b' : '#403171';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = 'rgba(199, 172, 255, 0.18)';
    ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    if (tile === TILE.WALL) {
      ctx.fillStyle = '#21183f'; ctx.fillRect(x + 3, y + 5, TILE_SIZE - 6, TILE_SIZE - 5);
      ctx.fillStyle = '#7254b7'; ctx.fillRect(x + 3, y + 3, TILE_SIZE - 8, TILE_SIZE - 8);
      ctx.fillStyle = '#c9b5ff'; ctx.fillRect(x + 5, y + 5, TILE_SIZE - 12, 5);
    } else if (tile === TILE.BLOCK) {
      const burning = this.burningBlocks.find(b => b.col === col && b.row === row);
      if (burning) { this.renderBurningBlock(ctx, x, y, burning.progress / burning.duration); return; }
      ctx.fillStyle = '#24143d'; ctx.fillRect(x + 6, y + 9, TILE_SIZE - 10, TILE_SIZE - 8);
      ctx.fillStyle = '#a87cf5';
      ctx.beginPath(); ctx.moveTo(x + 24, y + 3); ctx.lineTo(x + 43, y + 20);
      ctx.lineTo(x + 33, y + 44); ctx.lineTo(x + 12, y + 44); ctx.lineTo(x + 4, y + 20); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f0e9ff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#d8c6ff'; ctx.beginPath(); ctx.moveTo(x + 22, y + 7); ctx.lineTo(x + 13, y + 35); ctx.lineTo(x + 26, y + 27); ctx.closePath(); ctx.fill();
    }
  }

  renderIceTile(ctx, col, row, tile) {
    const x = col * TILE_SIZE, y = row * TILE_SIZE, size = TILE_SIZE;
    const central = col === Math.floor(this.cols / 2) || row === Math.floor(this.rows / 2);
    ctx.fillStyle = central ? '#86cbdc' : (col + row) % 2 === 0 ? '#548fae' : '#619ebb';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(215, 248, 255, 0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    // 氷の細い亀裂と、中央通路の雪の結晶。
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 5); ctx.lineTo(x + 15, y + 18); ctx.lineTo(x + 10, y + 26);
    ctx.stroke();
    if (central) {
      ctx.strokeStyle = 'rgba(235, 255, 255, 0.55)';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const angle = i * Math.PI / 3;
        ctx.moveTo(x + 24 - Math.cos(angle) * 7, y + 24 - Math.sin(angle) * 7);
        ctx.lineTo(x + 24 + Math.cos(angle) * 7, y + 24 + Math.sin(angle) * 7);
      }
      ctx.stroke();
    }
    if (tile === TILE.WALL) {
      const outer = col === 0 || row === 0 || col === this.cols - 1 || row === this.rows - 1;
      ctx.fillStyle = '#1c3559'; ctx.fillRect(x + 2, y + 4, size - 4, size - 4);
      ctx.fillStyle = outer ? '#31577e' : '#a5d9ef';
      ctx.fillRect(x + 2, y + 2, size - 6, size - 7);
      ctx.fillStyle = outer ? '#689bb9' : '#e1faff';
      ctx.fillRect(x + 2, y + 2, size - 6, 5);
      ctx.fillStyle = outer ? '#203f64' : '#4c92b9';
      ctx.fillRect(x + size - 9, y + 7, 5, size - 12);
      if (!outer) {
        ctx.fillStyle = '#7dbdda';
        ctx.beginPath(); ctx.moveTo(x + 24, y + 10); ctx.lineTo(x + 36, y + 24);
        ctx.lineTo(x + 24, y + 37); ctx.lineTo(x + 12, y + 24); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#eefcff'; ctx.stroke();
      }
    } else if (tile === TILE.BLOCK) {
      const burning = this.burningBlocks.find(b => b.col === col && b.row === row);
      if (burning) { this.renderBurningBlock(ctx, x, y, burning.progress / burning.duration); return; }
      ctx.fillStyle = '#214e75'; ctx.fillRect(x + 5, y + 8, size - 7, size - 9);
      ctx.fillStyle = '#60e0ee';
      ctx.beginPath(); ctx.moveTo(x + 12, y + 3); ctx.lineTo(x + 36, y + 3);
      ctx.lineTo(x + 44, y + 14); ctx.lineTo(x + 41, y + 42);
      ctx.lineTo(x + 8, y + 42); ctx.lineTo(x + 3, y + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d8ffff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#a8f6f8';
      ctx.beginPath(); ctx.moveTo(x + 12, y + 5); ctx.lineTo(x + 23, y + 18);
      ctx.lineTo(x + 7, y + 35); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2c99c4'; ctx.beginPath(); ctx.moveTo(x + 35, y + 8);
      ctx.lineTo(x + 26, y + 24); ctx.lineTo(x + 33, y + 38); ctx.stroke();
    }
  }

  // ハードブロック（元ネタ風の白コンクリート・立体柱）
  renderWall(ctx, x, y, isOuter) {
    const pad = 1;
    const w = TILE_SIZE - pad * 2;
    const h = TILE_SIZE - pad * 2;
    const bx = x + pad;
    const by = y + pad;

    if (isOuter) {
      // 外壁は重厚なブルーストーン
      ctx.fillStyle = '#425b78';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = '#6585ab';
      ctx.fillRect(bx, by, w, 4);
      ctx.fillRect(bx, by, 4, h);
      ctx.fillStyle = '#26374a';
      ctx.fillRect(bx, by + h - 4, w, 4);
      ctx.fillRect(bx + w - 4, by, 4, h);
      // 目地
      ctx.fillStyle = '#1c2836';
      ctx.fillRect(bx, by + Math.floor(h / 2), w, 2);
      ctx.fillRect(bx + Math.floor(w / 2), by, 2, h);
      return;
    }

    // 内部の固定柱（元ネタおなじみの白・ライトグレーのコンクリートブロック）
    // 影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(bx + 4, by + 4, w, h);

    // ブロックベース
    ctx.fillStyle = '#ccd3e0';
    ctx.fillRect(bx, by, w, h);

    // 上部ハイライト（天板）
    ctx.fillStyle = '#f2f5fa';
    ctx.fillRect(bx + 2, by + 2, w - 4, 10);
    ctx.fillRect(bx + 2, by + 2, 8, h - 4);

    // 右下シャドウ
    ctx.fillStyle = '#8e98aa';
    ctx.fillRect(bx + w - 6, by + 2, 4, h - 4);
    ctx.fillRect(bx + 2, by + h - 6, w - 4, 4);

    // 中央の立体パネル（元ネタの柱の凹凸）
    ctx.fillStyle = '#b8c2d4';
    ctx.fillRect(bx + 8, by + 12, w - 16, h - 20);

    ctx.fillStyle = '#e5ebf5';
    ctx.fillRect(bx + 10, by + 14, w - 20, 4);
    ctx.fillRect(bx + 10, by + 14, 4, h - 24);

    ctx.fillStyle = '#798396';
    ctx.fillRect(bx + w - 14, by + 14, 4, h - 24);
    ctx.fillRect(bx + 10, by + h - 14, w - 20, 4);
  }

  // ソフトブロック（元ネタ風の赤レンガブロック）
  renderSoftBlock(ctx, x, y) {
    const pad = 1;
    const w = TILE_SIZE - pad * 2;
    const h = TILE_SIZE - pad * 2;
    const bx = x + pad;
    const by = y + pad;

    // 影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(bx + 3, by + 3, w, h);

    // ベースレンガ色
    ctx.fillStyle = '#d85c27';
    ctx.fillRect(bx, by, w, h);

    // 上部ハイライト
    ctx.fillStyle = '#f07d4b';
    ctx.fillRect(bx, by, w, 3);
    ctx.fillRect(bx, by, 3, h);

    // 下部シャドウ
    ctx.fillStyle = '#8a2b06';
    ctx.fillRect(bx, by + h - 3, w, 3);
    ctx.fillRect(bx + w - 3, by, 3, h);

    // レンガ目地模様（元ネタ風のハッキリした横線と縦線）
    ctx.fillStyle = '#5c1b03';
    const rowH = Math.floor(h / 3);
    ctx.fillRect(bx, by + rowH, w, 3);
    ctx.fillRect(bx, by + rowH * 2, w, 3);

    // 縦目地
    ctx.fillRect(bx + Math.floor(w * 0.45), by, 3, rowH);
    ctx.fillRect(bx + Math.floor(w * 0.2), by + rowH, 3, rowH);
    ctx.fillRect(bx + Math.floor(w * 0.7), by + rowH, 3, rowH);
    ctx.fillRect(bx + Math.floor(w * 0.5), by + rowH * 2, 3, rowH);

    // 各レンガ片のハイライト
    ctx.fillStyle = '#ff9866';
    ctx.fillRect(bx + 4, by + 4, 12, 2);
    ctx.fillRect(bx + Math.floor(w * 0.2) + 5, by + rowH + 4, 16, 2);
    ctx.fillRect(bx + 4, by + rowH * 2 + 4, 14, 2);
  }

  // 燃焼破壊演出
  renderBurningBlock(ctx, x, y, factor) {
    const pad = 1;
    const w = TILE_SIZE - pad * 2;
    const h = TILE_SIZE - pad * 2;
    const bx = x + pad;
    const by = y + pad;

    const scale = 1 - factor * 0.35;
    const alpha = 1 - factor;
    const sw = w * scale;
    const sh = h * scale;
    const ox = bx + (w - sw) / 2;
    const oy = by + (h - sh) / 2;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    // 崩れ落ちるレンガ炎
    ctx.fillStyle = '#ff3300';
    ctx.fillRect(ox, oy, sw, sh);

    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(ox + 4, oy + 4, Math.max(0, sw - 8), Math.max(0, sh - 8));

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + sw / 4, oy + sh / 4, sw / 2, sh / 2);
    ctx.restore();
  }
}
