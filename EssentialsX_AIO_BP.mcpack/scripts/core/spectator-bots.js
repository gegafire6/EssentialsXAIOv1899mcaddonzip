// Minecraft objects are supplied by the caller so follower lifecycle can be tested.
export const SPECTATOR_BOT_TYPE = "essx:spectator_bot";
const DIMENSIONS = ["overworld", "nether", "the_end"];

export class SpectatorBots {
  constructor(world) {
    this.world = world;
    this.owners = new Map();
    this.entities = new Map();
    this.nextSweep = 0;
    this.hits = new Map();
    this.seenHits = new Map();
  }

  clearHits(playerId) { this.hits.delete(playerId); this.seenHits.delete(playerId); }

  targetFromView(player) {
    try {
      // Include other entities in the ray so a nearer mob/player shields the bot.
      const hits = player.getEntitiesFromViewDirection({ maxDistance: 3,
        ignoreBlockCollision: false, includeLiquidBlocks: false, includePassableBlocks: false });
      const nearest = hits.filter(h => h.entity.id !== player.id && h.distance >= 0 && h.distance <= 3)
        .sort((a, b) => a.distance - b.distance)[0]?.entity;
      return nearest?.isValid && nearest.typeId === SPECTATOR_BOT_TYPE && this.entities.has(nearest.id) ? nearest : undefined;
    } catch { return undefined; } // Unsupported raycast or unavailable entity: never invent a hit.
  }

  recordHit(playerId, entity, tick) {
    if (entity.typeId !== SPECTATOR_BOT_TYPE || !entity.isValid || !this.entities.has(entity.id)) return false;
    let seen = this.seenHits.get(playerId);
    if (!seen || seen.tick !== tick) {
      seen = { tick, targets: new Set() };
      this.seenHits.set(playerId, seen);
    }
    if (seen.targets.has(entity.id)) return false;
    seen.targets.add(entity.id);
    const hits = (this.hits.get(playerId) ?? 0) + 1;
    if (hits < 20) { this.hits.set(playerId, hits); return false; }
    this.hits.delete(playerId); // Keep deduplication through the 20th hit.
    return true;
  }

  removeOwner(ownerId) {
    this.clearHits(ownerId);
    const entity = this.owners.get(ownerId);
    if (!entity) return;
    // Forget first: cleanup must never produce a violation, even if death fires.
    this.owners.delete(ownerId);
    this.entities.delete(entity.id);
    try { entity.remove(); } catch { /* Retry loaded orphans during the next sweep. */ }
  }

  consumeDeath(entity) {
    if (entity.typeId !== SPECTATOR_BOT_TYPE) return false;
    const ownerId = this.entities.get(entity.id);
    if (ownerId === undefined) return false;
    this.entities.delete(entity.id);
    this.owners.delete(ownerId);
    return true;
  }

  update(players, enabled, tick) {
    const present = new Set();
    if (!enabled) { this.hits.clear(); this.seenHits.clear(); }
    if (enabled) for (const player of players) {
      try {
        if (player.getComponent("minecraft:health")?.currentValue <= 0) continue;
        present.add(player.id);
        const head = player.getHeadLocation();
        const view = player.getViewDirection();
        const length = Math.hypot(view.x, view.z);
        // Stay two blocks behind the horizontal view, away from normal aimed attacks.
        const position = { x: head.x - (length > 0.01 ? view.x / length : 0) * 2,
          y: player.location.y, z: head.z - (length > 0.01 ? view.z / length : 1) * 2 };
        let entity = this.owners.get(player.id);
        if (entity && !entity.isValid) { this.removeOwner(player.id); entity = undefined; }
        if (!entity) {
          entity = player.dimension.spawnEntity(SPECTATOR_BOT_TYPE, position);
          this.owners.set(player.id, entity);
          this.entities.set(entity.id, player.id);
        } else {
          entity.teleport(position, { dimension: player.dimension });
        }
      } catch { /* A player may leave or the destination chunk may be unavailable. Retry later. */ }
    }
    for (const id of this.owners.keys()) if (!present.has(id)) this.removeOwner(id);
    for (const id of this.seenHits.keys()) if (!present.has(id)) this.clearHits(id);

    // Also remove leftovers after script reloads or when an unloaded chunk returns.
    if (tick < this.nextSweep) return;
    this.nextSweep = tick + 100;
    for (const id of DIMENSIONS) try {
      for (const entity of this.world.getDimension(id).getEntities({ type: SPECTATOR_BOT_TYPE })) {
        if (!this.entities.has(entity.id)) try { entity.remove(); } catch {}
      }
    } catch { /* Unavailable dimensions are retried on the next sweep. */ }
  }
}
