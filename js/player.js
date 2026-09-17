/**
 * プレイヤー操作クラス
 */
class Player extends Entity {
  constructor(id, name, col, row, color, visorColor) {
    super(id, name, col, row, color, visorColor);
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      bomb: false
    };
    this.bombKeyPressed = false;
    this.pressedKeys = new Set();
    this.touchDirection = null;
  }

  handleKeyDown(code) {
    this.pressedKeys.add(code);
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.keys.up = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keys.down = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.keys.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keys.right = true;
        break;
      case 'Space':
      case 'Enter':
      case 'KeyJ':
        if (!this.bombKeyPressed) {
          this.keys.bomb = true;
          this.bombKeyPressed = true;
        }
        break;
    }
  }

  handleKeyUp(code) {
    this.pressedKeys.delete(code);
    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        this.keys.up = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keys.down = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.keys.left = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keys.right = false;
        break;
      case 'Space':
      case 'Enter':
      case 'KeyJ':
        this.bombKeyPressed = false;
        break;
    }
  }

  // タッチ操作用
  setTouchDirection(dir) {
    this.touchDirection = dir;
    this.keys.up = (dir === DIR.UP);
    this.keys.down = (dir === DIR.DOWN);
    this.keys.left = (dir === DIR.LEFT);
    this.keys.right = (dir === DIR.RIGHT);
  }

  triggerTouchBomb() {
    this.keys.bomb = true;
  }

  resetControls() {
    Object.keys(this.keys).forEach(key => { this.keys[key] = false; });
    this.pressedKeys.clear();
    this.touchDirection = null;
    this.bombKeyPressed = false;
  }

  getMisoInput() {
    const held = code => Number(this.pressedKeys.has(code));
    return {
      x: held('KeyD') - held('KeyA'),
      y: held('KeyS') - held('KeyW'),
      railStep: this.touchDirection === DIR.RIGHT ? 1 : this.touchDirection === DIR.LEFT ? -1 : 0,
      depthStep: Number(this.pressedKeys.has('ArrowUp') || this.pressedKeys.has('ArrowRight') || this.touchDirection === DIR.UP)
        - Number(this.pressedKeys.has('ArrowDown') || this.pressedKeys.has('ArrowLeft') || this.touchDirection === DIR.DOWN)
    };
  }

  updatePlayer(dt, map, bombs, entities, onPlaceBomb, onSpawnTrail) {
    if (this.isFlyingAway) {
      super.update(dt, map, bombs, onSpawnTrail);
      return;
    }

    this.isMoving = false;

    // 移動処理（最後に入力された方向、または優先順位に従う）
    let moveDir = null;
    if (this.keys.up) moveDir = DIR.UP;
    else if (this.keys.down) moveDir = DIR.DOWN;
    else if (this.keys.left) moveDir = DIR.LEFT;
    else if (this.keys.right) moveDir = DIR.RIGHT;

    if (moveDir) {
      this.move(moveDir, dt, map, bombs);
    }

    // 爆弾設置処理
    if (this.keys.bomb) {
      this.keys.bomb = false;
      const bomb = this.placeBomb(bombs, entities);
      if (bomb && onPlaceBomb) {
        onPlaceBomb(bomb);
      }
    }

    super.update(dt, map, bombs, onSpawnTrail);
  }
}

/**
 * オンライン通信相手のプレイヤー
 */
class RemotePlayer extends Entity {
  constructor(id, name, col, row, bodyColor, antennaColor, shoeColor) {
    super(id, name, col, row, bodyColor, antennaColor, shoeColor);
    this.targetX = this.x;
    this.targetY = this.y;
  }

  setNetworkState(x, y, facing, isMoving) {
    this.targetX = x;
    this.targetY = y;
    this.facing = facing;
    this.isMoving = isMoving;
  }

  updateRemote(dt, map, bombs, onSpawnTrail) {
    if (this.isFlyingAway) {
      super.update(dt, map, bombs, onSpawnTrail);
      return;
    }

    // 滑らかな位置補間（LERP）
    const lerpSpeed = 18;
    this.x += (this.targetX - this.x) * Math.min(1, lerpSpeed * dt);
    this.y += (this.targetY - this.y) * Math.min(1, lerpSpeed * dt);

    super.update(dt, map, bombs, onSpawnTrail);
  }
}
