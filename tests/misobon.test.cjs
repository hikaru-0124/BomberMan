const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
  const sent = [];
  const context = vm.createContext({networkManager: {send: m => sent.push(m)},
    soundManager: {playBlowAway(){}, playBombSet(){}, playExplosion(){}}});
  for (const file of ['constants', 'stages', 'entity', 'bomb', 'map', 'misobon'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context);
  const {Entity, GameMap, MisoBonManager, Bomb, Explosion} = vm.runInContext('({Entity, GameMap, MisoBonManager, Bomb, Explosion})', context);
  const entities = [1,2,3,4].map(id => new Entity(id, 'P' + id, id, 1, '#fff', '#fff'));
  const game = {isOnlineHost: true, gameState: 'PLAYING', entities, cpus: [entities[3]],
    map: new GameMap(), bombs: [], mySlot: 1, player: entities[0], addFloatingText(){}};
  const miso = new MisoBonManager(game);
  return {game, miso, sent, Bomb, Explosion};
}
test('rail wraps and throws must land on a free floor tile', () => {
  const {game, miso, sent} = setup();
  miso.move({slot:1, index:-1, depth:99});
  assert.equal(miso.position(1).index, miso.rail.length - 1);
  assert.equal(miso.position(1).depth, 13);
  miso.requestThrow({slot:1,index:0,depth:1});
  assert.equal(sent.length,0, 'living players cannot throw');
  miso.hit(game.player);
  miso.requestThrow({slot:1,index:0,depth:1});
  assert.equal(miso.flights.length,1);
  assert.equal(miso.flights[0].generation,1);
  miso.requestThrow({slot:1,index:1,depth:1});
  assert.equal(miso.flights.length,1, 'cooldown rejects consecutive throws');
  miso.cooldowns.set(1,0);
  game.map.setTile(2,1,2);
  miso.requestThrow({slot:1,index:1,depth:1});
  assert.equal(miso.flights.length,1,'blocks cannot be landing sites');
});
test('miso kill revives at victim position with protection and only once per death', () => {
  const {game,miso,sent} = setup();
  miso.hit(game.player);
  const credit = {slot:1,generation:1};
  const victim = game.entities[1];
  miso.hit(victim,credit);
  assert.equal(game.player.alive,true);
  assert.equal(game.player.isDying,false);
  assert.equal(game.player.x,victim.x);
  assert.equal(game.player.invulnerable,2);
  assert.equal(sent.at(-1).revive.slot,1);
  miso.hit(game.player);
  miso.hit(game.entities[2],credit);
  assert.equal(game.player.isDying,true,'old throws cannot revive a later life');
  assert.equal(sent.at(-1).revive,undefined);
});
test('CPU kills revive humans, disconnected players cannot revive', () => {
  const {game,miso} = setup();
  miso.hit(game.player);
  miso.hit(game.entities[3],{slot:1,generation:1});
  assert.equal(game.player.isDying,false);
  miso.hit(game.player);
  game.player.disconnected=true;
  miso.hit(game.entities[1],{slot:1,generation:2});
  assert.equal(game.player.isDying,true);
});
test('chain reaction inherits miso credit but ordinary explosions do not', () => {
  const {game,Bomb,Explosion} = setup();
  const chained = new Bomb(2,1,1,game.entities[1]);
  game.map.setTile(2,1,0);
  const credit = {slot:1,generation:3};
  new Explosion(1,1,2,game.map,[chained],()=>{},credit);
  assert.equal(chained.hasExploded,true);
  assert.equal(chained.misoCredit,credit);
  const normal = new Bomb(2,1,1,null);
  new Explosion(1,1,2,game.map,[normal],()=>{});
  assert.equal(normal.misoCredit,undefined);
});
