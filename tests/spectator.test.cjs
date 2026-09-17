const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const context = vm.createContext({window: {addEventListener() {}}});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../js/game.js'), 'utf8'), context);
const Game = vm.runInContext('Game', context);
function makeGame(mode, livingSlots) {
  const game = Object.create(Game.prototype);
  Object.assign(game, {gameMode: mode, isOnlineHost: true, gameState: 'PLAYING', mySlot: 1,
    spectatorStatus: {hidden: true}, isSpectating: false,
    entities: [1, 2, 3, 4].map(id => ({id, alive: livingSlots.includes(id)}))});
  game.player = game.entities[0];
  game.endGame = result => { game.result = result; game.gameState = 'OVER'; game.setSpectating(false); };
  return game;
}
test('online elimination keeps the match running until one survivor remains', () => {
  const game = makeGame('ONLINE', [2, 3, 4]);
  game.checkGameStatus();
  assert.equal(game.gameState, 'PLAYING');
  assert.equal(game.isSpectating, true);
  assert.equal(game.spectatorStatus.hidden, false);
  game.entities[2].alive = false;
  game.checkGameStatus();
  assert.equal(game.gameState, 'PLAYING');
  game.entities[3].alive = false;
  game.checkGameStatus();
  assert.equal(game.result, 'lose');
  assert.equal(game.spectatorStatus.hidden, true);
});
test('dying characters are eliminated before their animation finishes', () => {
  const game = makeGame('ONLINE', [1, 2, 3]);
  game.player.isDying = true;
  game.checkGameStatus();
  assert.equal(game.isSpectating, true);
  game.entities[2].isDying = true;
  game.checkGameStatus();
  assert.equal(game.result, 'lose');
});
test('online victory and simultaneous elimination', () => {
  for (const [slots, result] of [[[1], 'win'], [[], 'draw']]) {
    const game = makeGame('ONLINE', slots);
    game.checkGameStatus();
    assert.equal(game.result, result);
  }
});
test('single player still ends when the player is eliminated', () => {
  const game = makeGame('SINGLE', [2, 3, 4]);
  game.checkGameStatus();
  assert.equal(game.result, 'lose');
  assert.equal(game.isSpectating, false);
});
