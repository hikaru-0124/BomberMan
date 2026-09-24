const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({});
for (const name of ['constants', 'stages', 'map', 'entity', 'ai', 'zone']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
}
const {BattleZone, GameMap, AIPlayer, TILE} = vm.runInContext('({BattleZone, GameMap, AIPlayer, TILE})', context);

test('zone warns before shrinking, stays centered and preserves a connected final arena', () => {
  for (const stage of ['classic', 'ice', 'hexagon']) {
    const map = new GameMap(21, 17, stage), zone = new BattleZone(map);
    zone.elapsed = 54.9;
    assert.equal(zone.dangerous(1, 1), false);
    zone.elapsed = 55;
    assert.equal(zone.dangerous(1, 1), true);
    assert.equal(zone.outside(1, 1), false);
    zone.elapsed = 60;
    assert.equal(zone.outside(1, 1), true);
    assert.equal(zone.outside(2, 2), false);
    zone.elapsed = 75;
    assert.equal(zone.level, 2);
    zone.elapsed = 180;
    assert.equal(zone.level, 6);
    assert.equal(zone.nextIn, null);
    const tiles = [];
    for (let row = 0; row < map.rows; row++) for (let col = 0; col < map.cols; col++) {
      assert.equal(zone.outside(col, row), zone.outside(20 - col, 16 - row));
      if (!zone.outside(col, row) && map.getTile(col, row) !== TILE.WALL) tiles.push([col, row]);
    }
    const visited = new Set(), queue = [tiles[0]];
    while (queue.length) {
      const [c, r] = queue.shift(), key = `${c},${r}`;
      if (visited.has(key) || zone.outside(c, r) || map.getTile(c, r) === TILE.WALL) continue;
      visited.add(key);
      queue.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
    }
    assert.equal(visited.size, tiles.length);
    assert.equal(new BattleZone(map).level, 0, 'rematch resets the zone');
  }
});

test('three seconds outside eliminates all exposed survivors together; safety resets the grace period', () => {
  const zone = new BattleZone(new GameMap(21,17));
  zone.elapsed = 60;
  const a = {id: 1, col: 1, row: 1, alive: true, invulnerable: 2};
  const b = {id: 2, col: 1, row: 2, alive: true};
  const hits = [], hit = e => { hits.push(e.id); e.isDying = true; };
  zone.updateHits(2.9, [a,b], hit);
  assert.equal(hits.length, 0);
  zone.updateHits(0.2, [a,b], hit);
  assert.deepEqual(hits, [1,2]);
  zone.updateHits(4, [a,b], hit);
  assert.equal(hits.length, 2);
  a.isDying = false;
  zone.updateHits(2, [a], hit);
  a.col = a.row = 5;
  zone.updateHits(0.1, [a], hit);
  a.col = 1;
  zone.updateHits(2, [a], hit);
  assert.equal(hits.length, 2);
});

test('CPU escape routes lead out of the upcoming hazard', () => {
  const map = new GameMap(21,17,'ice');
  map.grid = map.grid.map(row => row.map(tile => tile === TILE.BLOCK ? TILE.EMPTY : tile));
  map.zone = new BattleZone(map);
  map.zone.elapsed = 55;
  const cpu = new AIPlayer(1,'CPU',1,1,'#fff','#fff','#fff');
  const danger = cpu.buildDangerMap(map, [], []);
  assert.equal(danger.has('1,1'), true);
  const route = cpu.findPathToSafeTile(map, [], danger);
  assert.ok(route.length > 0);
  assert.equal(map.zone.dangerous(route.at(-1).col, route.at(-1).row), false);
});
