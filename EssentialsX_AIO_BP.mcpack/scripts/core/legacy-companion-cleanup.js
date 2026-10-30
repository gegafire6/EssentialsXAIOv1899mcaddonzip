// Retire companions from v1.8.86 without discarding their native item inventories.
// The compatibility entity has no AI, model, spawn item, command or plugin entry.
import { world, system } from '@minecraft/server';
const LEGACY = 'essx:ai_player';
function clearIdentity(p) { p.setDynamicProperty('essx:ai_entity', undefined); world.setDynamicProperty('essx:ai_dead:' + p.id, undefined); }
function retire() {
  const players = new Map(world.getAllPlayers().map(p => [p.id, p]));
  for (const p of players.values()) try { clearIdentity(p); } catch {}
  for (const dimension of ['overworld', 'nether', 'the_end']) try {
    for (const entity of world.getDimension(dimension).getEntities({ type: LEGACY })) try {
      const source = entity.getComponent('minecraft:inventory')?.container;
      const owner = players.get(entity.getDynamicProperty('essx:ai_owner'));
      const destination = owner?.isValid && owner.getComponent('minecraft:health')?.currentValue > 0 ? owner.getComponent('minecraft:inventory')?.container : undefined;
      if (entity.getComponent('minecraft:health')?.currentValue <= 0) continue;
      if (source) for (let slot = 0; slot < source.size; slot++) {
        if (!source.getItem(slot)) continue;
        // Move whole native stacks only. Overflow is dropped at the old companion.
        let free = -1;
        if (destination) for (let i = 0; i < destination.size; i++) if (!destination.getItem(i)) { free = i; break; }
        if (free >= 0) source.moveItem(slot, free, destination);
      }
      let hasItems = false;
      if (source) for (let slot = 0; slot < source.size; slot++) if (source.getItem(slot)) { hasItems = true; break; }
      // Native death drops the remaining inventory atomically; no spawn/clear retry duplication.
      if (hasItems) { if (!entity.kill()) throw new Error('Native inventory drop could not be completed.'); }
      else entity.remove();
    } catch (error) { console.warn('[EssX] Legacy companion retirement will retry: ' + error); }
  } catch { /* Newly loaded legacy chunks are swept later. */ }
}
world.afterEvents.playerSpawn.subscribe(({ player }) => { try { clearIdentity(player); } catch {} });
system.run(retire);
system.runInterval(retire, 100);
