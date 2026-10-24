import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, findPath, walkable } from '../app/static/game.mjs';
for (const biome of ['crystal','forest','ruins','autumn','coast','meadow']) {
  test(`${biome}: piezas accesibles, puente bloqueado y faro alcanzable al repararlo`, () => {
    const world={id:biome,biome};const map=makeMap(world);
    for (const target of [map.guide,map.workshop,...map.pickups]) assert.ok(findPath(map,map.spawn,target,false).length);
    assert.equal(findPath(map,map.spawn,map.beacon,false).length,0);
    for(const target of [map.guardian,map.beacon])assert.ok(findPath(map,map.spawn,target,true).length);
    assert.equal(walkable(map,0,0,true),false);
    assert.deepEqual(map,makeMap(world));
    for(const p of findPath(map,map.spawn,map.beacon,true)) assert.ok(walkable(map,p.x,p.y,true));
  });
}
test('las materias tienen distribuciones de terreno diferentes',()=>{
  const maps=['crystal','forest','ruins','autumn','coast','meadow'].map(biome=>JSON.stringify(makeMap({id:biome,biome}).tiles));
  assert.equal(new Set(maps).size,6);
});
