const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({});
for (const name of ['constants','stages','map']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',name+'.js'),'utf8'),context);
const {GameMap,TILE,getStageSize,getPlayerSpawn,normalizeStageId} = vm.runInContext('({GameMap,TILE,getStageSize,getPlayerSpawn,normalizeStageId})',context);
test('all maps preserve their spawn exits and connected destructible terrain', () => {
 for(const stage of ['classic','ice','hexagon']) for(let trial=0;trial<40;trial++) {
  const {cols,rows}=getStageSize(stage), map=new GameMap(cols,rows,stage);
  assert.equal(map.grid.length,rows);
  assert.ok(map.grid.every(row=>row.length===cols));
  for(const slot of [1,2,3,4,5,6]) {
    const [c,r]=getPlayerSpawn(slot,stage,cols,rows);
    assert.equal(map.getTile(c,r),TILE.EMPTY);
  }
  const start = getPlayerSpawn(1,stage,cols,rows);
  const queue=[start], visited=new Set([start.join(',')]);
  for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
   const [x,y]=queue[i], c=x+dx,r=y+dy,key=`${c},${r}`;
   if(map.getTile(c,r)!==TILE.WALL&&!visited.has(key)){visited.add(key);queue.push([c,r]);}
  }
  assert.equal(visited.size,map.grid.flat().filter(t=>t!==TILE.WALL).length);
 }
});
test('hexagon arena has six equal spawn zones and dark void outside its walls', () => {
 const {cols,rows}=getStageSize('hexagon'), map=new GameMap(cols,rows,'hexagon');
 assert.deepEqual([cols,rows],[21,17]);
 for(let slot=1;slot<=6;slot++) {
  const [col,row]=getPlayerSpawn(slot,'hexagon',cols,rows);
  assert.equal(map.getTile(col,row),TILE.EMPTY);
  assert.ok([[0,1],[0,-1],[1,0],[-1,0]].some(([dx,dy]) => map.getTile(col+dx,row+dy) === TILE.EMPTY));
 }
 for(let row=0;row<rows;row++) {
  const [min,max]=map.getHexRange(row);
  for(let col=0;col<cols;col++) {
   if(col<min||col>max)assert.equal(map.getTile(col,row),TILE.WALL);
  }
 }
});
test('ice arena has an open cross and symmetric quadrants', () => {
 const {cols,rows}=getStageSize('ice'), map=new GameMap(cols,rows,'ice');
 assert.deepEqual([cols,rows],[21,17]);
 assert.deepEqual(Object.values(getStageSize('classic')),[21,17]);
 for(let r=1;r<rows-1;r++) assert.equal(map.getTile(Math.floor(cols/2),r),TILE.EMPTY);
 for(let c=1;c<cols-1;c++) assert.equal(map.getTile(c,Math.floor(rows/2)),TILE.EMPTY);
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) {
  assert.equal(map.getTile(c,r),map.getTile(cols-1-c,r));
  assert.equal(map.getTile(c,r),map.getTile(c,rows-1-r));
 }
 assert.equal(new GameMap().getTile(2,6),TILE.WALL,'classic keeps the original pillars');
});
test('network grid round trip preserves the chosen map without sharing mutable rows', () => {
 const host=new GameMap(15,13,'ice'), guest=new GameMap(15,13,'ice');
 const payload=JSON.parse(JSON.stringify(host.getBlockData()));
 guest.init(payload);
 assert.equal(JSON.stringify(guest.grid),JSON.stringify(host.grid));
 assert.equal(guest.stageId,'ice');
 guest.setTile(1,1,TILE.BLOCK);
 assert.equal(host.getTile(1,1),TILE.EMPTY);
 assert.equal(payload[1][1],TILE.EMPTY);
 assert.equal(normalizeStageId('__proto__'),'classic');
 assert.equal(new GameMap(15,13,'unknown').stageId,'classic');
});
