/** 安全地帯。オンラインではホストの経過時間と撃破判定を使用する。 */
class BattleZone {
  constructor(map) {
    this.map = map;
    this.elapsed = 0;
    this.exposure = new Map();
    this.maxLevel = Math.max(0, Math.floor((Math.min(map.cols, map.rows) - 5) / 2));
  }

  get level() {
    return Math.min(this.maxLevel, this.elapsed < 60 ? 0 : 1 + Math.floor((this.elapsed - 60) / 15));
  }

  get nextIn() {
    return this.level >= this.maxLevel ? null : (this.level === 0 ? 60 : 60 + this.level * 15) - this.elapsed;
  }

  outside(col, row, level = this.level) {
    const inset = 1 + level;
    return col < inset || row < inset || col >= this.map.cols - inset || row >= this.map.rows - inset;
  }

  dangerous(col, row) {
    return this.outside(col, row) || (this.nextIn !== null && this.nextIn <= 5 && this.outside(col, row, this.level + 1));
  }

  updateHits(dt, entities, hit) {
    for (const entity of entities) {
      if (!entity.alive || entity.isDying || entity.isFlyingAway || !this.outside(entity.col, entity.row)) {
        this.exposure.delete(entity.id);
        continue;
      }
      const time = (this.exposure.get(entity.id) || 0) + dt;
      this.exposure.set(entity.id, time);
      if (time >= 3) {
        this.exposure.delete(entity.id);
        hit(entity);
      }
    }
  }

  render(ctx) {
    ctx.save();
    for (let row = 1; row < this.map.rows - 1; row++) {
      for (let col = 1; col < this.map.cols - 1; col++) {
        const outside = this.outside(col, row);
        if (!outside && !this.dangerous(col, row)) continue;
        ctx.fillStyle = outside ? 'rgba(190, 20, 65, 0.48)' : 'rgba(255, 190, 30, 0.35)';
        ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
    const inset = (1 + this.level) * TILE_SIZE;
    ctx.strokeStyle = '#ffcc33';
    ctx.lineWidth = 3;
    ctx.strokeRect(inset, inset, this.map.cols * TILE_SIZE - inset * 2, this.map.rows * TILE_SIZE - inset * 2);
    ctx.restore();
  }
}
