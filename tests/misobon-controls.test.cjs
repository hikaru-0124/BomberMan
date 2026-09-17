const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({});
for (const name of ['constants', 'entity', 'player', 'misobon']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'), context);
}
const {Player, MisoBonManager, DIR} = vm.runInContext('({Player, MisoBonManager, DIR})', context);
function player() { return new Player(1, 'P1', 1, 1, '#fff', '#fff'); }
test('WASD moves spatially around all four edges without changing throw distance', () => {
  const p = player(), miso = new MisoBonManager({});
  for (const [code, edge, step] of [
    ['KeyD', {col:5,row:0}, 1], ['KeyA', {col:5,row:0}, -1],
    ['KeyS', {col:14,row:5}, 1], ['KeyW', {col:14,row:5}, -1],
    ['KeyA', {col:5,row:12}, 1], ['KeyD', {col:5,row:12}, -1],
    ['KeyW', {col:0,row:5}, 1], ['KeyS', {col:0,row:5}, -1]
  ]) {
    p.handleKeyDown(code);
    const input = p.getMisoInput();
    const index = miso.rail.findIndex(e => e.col === edge.col && e.row === edge.row);
    assert.equal(miso.movementStep(index, input), step, code);
    assert.equal(input.depthStep, 0);
    p.handleKeyUp(code);
  }
});
test('arrows adjust distance without moving the player around the rail', () => {
  const p = player(), miso = new MisoBonManager({});
  for (const [code, delta] of [['ArrowUp',1],['ArrowRight',1],['ArrowDown',-1],['ArrowLeft',-1]]) {
    p.handleKeyDown(code);
    assert.equal(p.getMisoInput().depthStep,delta);
    assert.equal(miso.movementStep(4,p.getMisoInput()),0);
    p.handleKeyUp(code);
  }
});
test('touch controls and normal movement remain available; reset clears held input', () => {
  const p = player();
  p.setTouchDirection(DIR.RIGHT);
  assert.equal(p.getMisoInput().railStep,1);
  p.setTouchDirection(DIR.UP);
  assert.equal(p.getMisoInput().depthStep,1);
  p.setTouchDirection(null);
  for (const code of ['KeyW','ArrowUp']) {
    p.handleKeyDown(code);
    assert.equal(p.keys.up,true);
    p.handleKeyUp(code);
    assert.equal(p.keys.up,false);
  }
  p.handleKeyDown('KeyD'); p.handleKeyDown('ArrowUp'); p.triggerTouchBomb();
  p.resetControls();
  assert.equal(p.getMisoInput().x,0);
  assert.equal(p.getMisoInput().depthStep,0);
  assert.equal(p.keys.bomb,false);
});
