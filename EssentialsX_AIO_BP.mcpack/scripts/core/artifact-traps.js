// The vanilla mansion's portal trap contains exactly two ender pearls and nearby TNT.
// Only this recognizable untouched trap is eligible; no existing stacks are replaced.
import { world, system, ItemStack } from '@minecraft/server';
import { ARTIFACTS } from './artifacts.js';
function inspectTrap(block, checkTnt = true) {
  if (!block || block.typeId !== 'minecraft:trapped_chest' || block.dimension.id !== 'minecraft:overworld') return;
  const {x,y,z} = block.location, dim = block.dimension;
  const container = block.getComponent('minecraft:inventory')?.container;
  if (!container || container.size !== 27) return;
  let pearls = 0, free = -1;
  for (let i=0;i<container.size;i++) {
    const item=container.getItem(i);
    if (!item) { if (free<0) free=i; continue; }
    if (item.typeId !== 'minecraft:ender_pearl') return;
    pearls += item.amount;
  }
  if (pearls !== 2 || free < 0) return;
  if (checkTnt) {
    let tnt = 0;
    for (let dx=-2;dx<=2;dx++) for (let dy=-1;dy<=1;dy++) for (let dz=-2;dz<=2;dz++) {
      if (!dx&&!dy&&!dz) continue;
      if (dim.getBlock({x:x+dx,y:y+dy,z:z+dz})?.typeId === 'minecraft:tnt') tnt++;
    }
    if (tnt < 2) return;
  }
  return {container,free,key:`essx:artifact_trap:${dim.id}:${x}:${y}:${z}`};
}
export function addTrapArtifact(block, read, write, create, random = Math.random, recognizedBeforeOpening = false) {
  const trap = inspectTrap(block, !recognizedBeforeOpening);
  if (!trap || read(trap.key) !== undefined) return false;
  const ids = Object.keys(ARTIFACTS), index = Math.floor(random()*ids.length);
  if (index < 0 || index >= ids.length) return false;
  const item = create(ids[index]);
  // Persist first so an interrupted insertion never duplicates artifacts on retries.
  write(trap.key, true);
  trap.container.setItem(trap.free,item);
  return true;
}
const pending = new Map();
function interactionKey(player,block) {
  const {x,y,z}=block.location;return `${player.id}:${block.dimension.id}:${x}:${y}:${z}`;
}
world.beforeEvents.playerInteractWithBlock.subscribe(({player,block,cancel})=>{
  if (cancel) return;
  try {
    if (!inspectTrap(block)) return;
    const key=interactionKey(player,block),token={};pending.set(key,token);
    // Canceled interactions have no after event; expire their evidence on the next tick.
    system.run(()=>{if(pending.get(key)===token)pending.delete(key);});
  } catch {}
});
world.afterEvents.playerInteractWithBlock.subscribe(({player,block})=>{
  try {
    const key=interactionKey(player,block);
    if (!pending.has(key)) return;
    pending.delete(key);
    addTrapArtifact(block,k=>world.getDynamicProperty(k),(k,v)=>world.setDynamicProperty(k,v),id=>new ItemStack(id,1),Math.random,true);
  } catch (e) { console.warn('[EssX] Could not populate mansion trap: '+e); }
});
