const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {EventEmitter} = require('node:events');

test('a finished room returns all members and supports another match with the same slots', () => {
  let wss;
  const context = vm.createContext({
    require(name) {
      if (name === 'http') return {createServer: () => ({listen() {}})};
      if (name === 'ws') return {
        WebSocket: {OPEN: 1},
        WebSocketServer: class extends EventEmitter {constructor() {super(); wss = this;}}
      };
      if (name === './js/stages') return require('../js/stages');
      return require(name);
    },
    __dirname: path.join(__dirname, '..'), process: {env: {}}, console
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8'), context);
  function client() {
    const ws = new EventEmitter();
    ws.readyState = 1;
    ws.messages = [];
    ws.send = raw => ws.messages.push(JSON.parse(raw));
    ws.request = data => ws.emit('message', JSON.stringify(data));
    wss.emit('connection', ws);
    return ws;
  }
  const host = client(), guest = client();
  host.request({type: 'create_room', name: 'Host', stageId: 'hexagon', maxPlayers: 4});
  const roomId = host.messages[0].roomId;
  guest.request({type: 'join_room', roomId, name: 'Guest'});
  guest.request({type: 'set_max_players', maxPlayers: 6});
  assert.equal(host.messages.at(-1).type, 'room_update', 'guests cannot change capacity');
  for (const count of [2, 6, 4]) {
    host.request({type: 'set_max_players', maxPlayers: count});
    for (const ws of [host, guest]) assert.equal(ws.messages.at(-1).maxPlayers, count);
  }
  host.request({type: 'start_game', mapData: []});
  assert.equal(host.messages.at(-1).type, 'max_players_selected', 'unready room cannot start');
  host.request({type: 'set_ready', ready: true});
  host.request({type: 'start_game', mapData: []});
  assert.equal(host.messages.at(-1).type, 'room_update', 'one unready guest blocks start');
  guest.request({type: 'set_ready', ready: true});
  guest.request({type: 'set_ready', ready: false});
  assert.equal(host.messages.at(-1).players[1].ready, false);
  host.request({type: 'start_game', mapData: []});
  assert.equal(host.messages.at(-1).type, 'room_update', 'cancelling readiness blocks start');
  guest.request({type: 'set_ready', ready: true});
  host.request({type: 'set_max_players', maxPlayers: 5});
  assert.ok(host.messages.at(-1).players.every(p => !p.ready));
  host.request({type: 'set_max_players', maxPlayers: 4});
  for (const ws of [host, guest]) ws.request({type: 'set_ready', ready: true});
  host.request({type: 'start_game', mapData: ['first'], stageId: 'hexagon'});
  host.request({type: 'set_max_players', maxPlayers: 2});
  assert.equal(host.messages.at(-1).type, 'game_started', 'capacity is locked during play');
  guest.request({type: 'zone_sync', elapsed: 100});
  assert.equal(host.messages.at(-1).type, 'game_started');
  host.request({type: 'zone_sync', elapsed: 60});
  assert.equal(guest.messages.at(-1).type, 'zone_sync');
  assert.equal(guest.messages.at(-1).elapsed, 60);
  guest.request({type: 'return_to_room'});
  assert.equal(host.messages.at(-1).type, 'game_started', 'cannot interrupt an active match');
  guest.request({type: 'round_over', winner: 2});
  guest.request({type: 'return_to_room'});
  assert.equal(host.messages.at(-1).type, 'game_started', 'only host can end a match');
  host.request({type: 'round_over', winner: 1});
  guest.request({type: 'return_to_room'});
  for (const ws of [host, guest]) {
    const msg = ws.messages.at(-1);
    assert.equal(msg.type, 'room_returned');
    assert.ok(msg.players.every(p => !p.ready), 'rematch requires fresh readiness');
    assert.equal(msg.roomId, roomId);
    assert.equal(msg.stageId, 'hexagon');
    assert.equal(msg.maxPlayers, 4);
    assert.deepEqual(msg.players.map(p => [p.name, p.slot, p.isHost]), [['Host', 1, true], ['Guest', 2, false]]);
  }
  const newcomer = client();
  newcomer.request({type: 'join_room', roomId, name: 'New'});
  assert.equal(newcomer.messages[0].type, 'room_joined');
  guest.request({type: 'start_game', mapData: []});
  assert.equal(host.messages.at(-1).type, 'room_update', 'guest cannot start the rematch');
  for (const ws of [host, guest, newcomer]) ws.request({type: 'set_ready', ready: true});
  host.request({type: 'set_stage', stageId: 'ice'});
  assert.ok(host.messages.at(-1).players.every(p => !p.ready), 'stage changes reset readiness');
  for (const ws of [host, guest, newcomer]) ws.request({type: 'set_ready', ready: true});
  host.request({type: 'start_game', stageId: 'ice', mapData: ['new']});
  for (const ws of [host, guest, newcomer]) {
    assert.equal(ws.messages.at(-1).type, 'game_started');
    assert.deepEqual(ws.messages.at(-1).mapData, ['new']);
    assert.equal(ws.messages.at(-1).players.length, 3);
  }
  host.request({type: 'round_over', winner: 1});
  host.request({type: 'return_to_room'});
  host.request({type: 'set_max_players', maxPlayers: 2});
  assert.equal(host.messages.at(-1).maxPlayers, 4, 'cannot exclude connected players');
  guest.emit('close');
  host.request({type: 'set_max_players', maxPlayers: 2});
  const changed = newcomer.messages.at(-1);
  assert.equal(changed.maxPlayers, 2);
  assert.deepEqual(changed.players.map(p => [p.name,p.slot]), [['Host',1],['New',2]]);
  for (const ws of [host, newcomer]) ws.request({type: 'set_ready', ready: true});
  host.request({type: 'start_game', stageId: 'ice', mapData: []});
  assert.equal(newcomer.messages.at(-1).maxPlayers, 2);
  assert.equal(newcomer.messages.at(-1).players[1].slot, 2);
});

test('returning to the room cancels a pending result screen and restores host controls', () => {
  const callbacks = {};
  let cancelled;
  const context = vm.createContext({window: {addEventListener() {}},
    networkManager: {on: (name, cb) => callbacks[name] = cb},
    clearTimeout: timer => {cancelled = timer;}, soundManager: {stopBgm() {}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8'), context);
  const Game = vm.runInContext('Game', context);
  for (const isHost of [true, false]) {
    const game = Object.create(Game.prototype);
    Object.assign(game, {gameOverTimer: 42, gameState: 'OVER', mySlot: 1,
      spectatorStatus: {}, displayRoomCode: {}, btnStartOnlineGame: {style: {}}, waitHostText: {style: {}},
      setStage(id) {this.stageId = id;}, setMaxPlayers(n) {this.maxPlayers = n;},
      renderRoomMemberList(players) {this.players = players;}, showView(view) {this.view = view;}});
    game.initNetworkEvents();
    callbacks.room_returned({roomId: 'ABCD', stageId: 'ice', maxPlayers: 4, players: [{slot: 1, isHost}]});
    assert.equal(cancelled, 42);
    assert.equal(game.gameState, 'START');
    assert.equal(game.view, 'ROOM');
    assert.equal(game.displayRoomCode.innerText, 'ABCD');
    assert.equal(game.btnStartOnlineGame.style.display, isHost ? 'block' : 'none');
    assert.equal(game.waitHostText.style.display, isHost ? 'none' : 'block');
  }
});


test('capacity controls are available only to the waiting host and respect current membership', () => {
  const networkManager = {roomId: 'ROOM'};
  const context = vm.createContext({window: {addEventListener() {}}, networkManager, MAX_PLAYERS: 6});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8'), context);
  const Game = vm.runInContext('Game', context);
  const game = Object.create(Game.prototype);
  Object.assign(game, {gameMode: 'ONLINE', gameState: 'START', isOnlineHost: true,
    roomPlayers: [{}, {}, {}], maxPlayersSelect: {options: [2,3,4,5,6].map(value => ({value}))},
    maxPlayersDescription: {}, arenaSubtitle: {}});
  game.setMaxPlayers(4);
  assert.equal(game.maxPlayersSelect.disabled, false);
  assert.equal(game.maxPlayersSelect.options[0].disabled, true);
  assert.equal(game.maxPlayersSelect.options[1].disabled, false);
  game.isOnlineHost = false;
  game.setMaxPlayers(4);
  assert.equal(game.maxPlayersSelect.disabled, true);
  game.isOnlineHost = true;
  game.gameState = 'PLAYING';
  game.setMaxPlayers(4);
  assert.equal(game.maxPlayersSelect.disabled, true);
});


test('ready button and start controls reflect every human including the host', () => {
  const context = vm.createContext({window: {addEventListener() {}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8'), context);
  const Game = vm.runInContext('Game', context);
  const game = Object.create(Game.prototype);
  Object.assign(game, {mySlot: 1, roomPlayers: [{slot: 1, ready: false}, {slot: 2, ready: true}],
    btnReady: {setAttribute(key, value) {this[key] = value;}}, btnStartOnlineGame: {}, readyStatus: {}});
  game.updateReadyControls();
  assert.equal(game.btnStartOnlineGame.disabled, true);
  assert.equal(game.btnReady.textContent, '準備完了');
  game.roomPlayers[0].ready = true;
  game.updateReadyControls();
  assert.equal(game.btnStartOnlineGame.disabled, false);
  assert.equal(game.btnReady.textContent, '準備完了を取り消す');
  assert.equal(game.btnReady['aria-pressed'], 'true');
  game.roomPlayers[1].ready = false;
  game.updateReadyControls();
  assert.equal(game.btnStartOnlineGame.disabled, true);
});
