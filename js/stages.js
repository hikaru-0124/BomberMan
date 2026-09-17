// ブラウザと対戦サーバーで共通のステージ一覧。
const MAP_STAGES = Object.freeze({
  hexagon: {name: '⬡ ヘキサゴン・アリーナ', description: '6つの開始地点を持つ、大型の結晶六角形バトルフィールド。', cols: 21, rows: 17},
  classic: {name: '🌿 グリーンフィールド', description: 'ブロックを壊して道を開く、いつもの草原。', cols: 15, rows: 13},
  ice: {name: '❄ 氷のアリーナ', description: '中央の十字通路で攻防！ 四隅は結晶ブロック地帯。', cols: 15, rows: 13}
});

const MAX_PLAYERS = 6;
const PLAYER_SLOTS = Object.freeze([
  {slot: 1, name: '白ボン', body: '#2563eb', ant: '#ff4081', shoe: '#ff4081'},
  {slot: 2, name: '黒ボン', body: '#1e293b', ant: '#ef4444', shoe: '#ef4444'},
  {slot: 3, name: '赤ボン', body: '#dc2626', ant: '#dc2626', shoe: '#facc15'},
  {slot: 4, name: '黄ボン', body: '#f59e0b', ant: '#f59e0b', shoe: '#ea580c'},
  {slot: 5, name: '緑ボン', body: '#16a34a', ant: '#34d399', shoe: '#a3e635'},
  {slot: 6, name: '紫ボン', body: '#8b5cf6', ant: '#c084fc', shoe: '#f0abfc'}
]);

function getStageSize(stageId) {
  const stage = MAP_STAGES[normalizeStageId(stageId)];
  return {cols: stage.cols, rows: stage.rows};
}

function getPlayerSpawn(slot, stageId, cols, rows) {
  const isHexagon = normalizeStageId(stageId) === 'hexagon';
  const spawns = isHexagon
    ? [[Math.floor(cols / 2), 2], [cols - 5, 5], [cols - 5, rows - 6], [Math.floor(cols / 2), rows - 3], [4, rows - 6], [4, 5]]
    : [[1, 1], [cols - 2, 1], [cols - 2, rows - 2], [1, rows - 2], [Math.floor(cols / 2), 1], [Math.floor(cols / 2), rows - 2]];
  return spawns[slot - 1];
}
function normalizeStageId(id) {
  return Object.prototype.hasOwnProperty.call(MAP_STAGES, id) ? id : 'classic';
}
if (typeof module !== 'undefined') module.exports = {MAP_STAGES, MAX_PLAYERS, PLAYER_SLOTS, getStageSize, getPlayerSpawn, normalizeStageId};
