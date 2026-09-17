/**
 * ゲーム全般の定数定義
 */
const TILE_SIZE = 48;
const MAP_COLS = 15;
const MAP_ROWS = 13;

const CANVAS_WIDTH = MAP_COLS * TILE_SIZE; // 720
const CANVAS_HEIGHT = MAP_ROWS * TILE_SIZE; // 624

// タイル種別
const TILE = {
  EMPTY: 0,
  WALL: 1,      // 破壊不可の外壁・固定柱
  BLOCK: 2      // 破壊可能なソフトブロック
};

// アイテム種別
const ITEM_TYPE = {
  BOMB: 'bomb',   // 爆弾設置可能数 +1
  FIRE: 'fire',   // 爆風範囲 +1
  SPEED: 'speed'  // 移動速度 +15%
};

// ゲームバランス設定
const CONFIG = {
  BOMB_FUSE_TIME: 2400,        // 爆弾設置から爆発までの時間(ms)
  EXPLOSION_DURATION: 400,     // 爆風の持続時間(ms)
  BLOCK_BURN_DURATION: 300,    // ブロック燃焼演出時間(ms)
  
  PLAYER_BASE_SPEED: 170,      // 基本速度(px/秒)
  PLAYER_SPEED_BOOST: 25,      // スピードアイテム1つあたりの加算
  PLAYER_MAX_SPEED: 280,       // 最大速度
  
  BASE_BOMBS: 1,               // 初期爆弾数
  MAX_BOMBS: 6,                // 最大爆弾数
  
  BASE_POWER: 1,               // 初期火力（中心から十字各1マス）
  MAX_POWER: 6,                // 最大火力
  
  BLOCK_SPAWN_CHANCE: 0.72,    // 空きマスにソフトブロックが出る確率
  ITEM_DROP_CHANCE: 0.55,      // ブロック破壊時にアイテムが出る確率
  
  ROUND_TIME_LIMIT: 180        // 1ラウンド制限時間(秒)
};

// 方向定義
const DIR = {
  UP: { x: 0, y: -1, name: 'up' },
  DOWN: { x: 0, y: 1, name: 'down' },
  LEFT: { x: -1, y: 0, name: 'left' },
  RIGHT: { x: 1, y: 0, name: 'right' },
  NONE: { x: 0, y: 0, name: 'none' }
};
