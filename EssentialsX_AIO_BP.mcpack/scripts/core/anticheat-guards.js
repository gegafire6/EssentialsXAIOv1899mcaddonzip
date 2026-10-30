// Original, conservative evidence buffers for the built-in Celuna/Scythe groups.
export class GuardEvidence {
  constructor() { this.players = new Map(); }
  clear(id) { this.players.delete(id); }
  reset() { this.players.clear(); }
  state(id) {
    if (!this.players.has(id)) this.players.set(id, { swings: [], targets: new Set(), targetTick: -1, water: 0, movementTick: -1, vy: 0 });
    return this.players.get(id);
  }
  swing(id, tick, maxCps) {
    const s = this.state(id);
    s.swings = s.swings.filter((t) => tick - t < 20 && tick >= t);
    s.swings.push(tick);
    // One flag per full sample window, rather than one per excess swing.
    if (s.swings.length > maxCps) { s.swings = []; return true; }
    return false;
  }
  target(id, tick, targetId, limit) {
    const s = this.state(id);
    if (s.targetTick !== tick) { s.targetTick = tick; s.targets.clear(); }
    s.targets.add(targetId);
    if (s.targets.size >= limit) { s.targets.clear(); return true; }
    return false;
  }
  movement(id, tick, vy, waterSurface, unsupported, samples) {
    const s = this.state(id);
    const consecutive = tick === s.movementTick + 1;
    const jump = consecutive && unsupported && s.vy < -0.12 && vy > 0.3;
    s.water = waterSurface ? (consecutive ? s.water + 1 : 1) : 0;
    s.movementTick = tick; s.vy = vy;
    const water = s.water >= samples;
    if (water) s.water = 0;
    return { water, jump };
  }
}
