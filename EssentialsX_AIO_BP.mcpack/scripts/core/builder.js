// Placement math and bounded, session-scoped block snapshots. No game imports.
export const MAX_BUILD_VOLUME = 8192;
export const DIRECTION_NAMES = ["South", "West", "North", "East"];
export function lookRotation(yaw) {
  if (!Number.isFinite(yaw)) throw new Error("Invalid look direction.");
  return ((Math.round(yaw / 90) % 4) + 4) % 4;
}
export function rotatePoint({ x, y, z }, size, rotation) {
  switch (rotation) {
    case 0: return { x, y, z };
    case 1: return { x: size.z - 1 - z, y, z: x };
    case 2: return { x: size.x - 1 - x, y, z: size.z - 1 - z };
    case 3: return { x: z, y, z: size.x - 1 - x };
    default: throw new Error("Invalid build rotation.");
  }
}
export function placementBounds(size, target, rotation) {
  if (![size.x, size.y, size.z].every((n) => Number.isInteger(n) && n > 0) || size.x * size.y * size.z > MAX_BUILD_VOLUME) throw new Error("Build exceeds the supported volume.");
  if (![target.x, target.y, target.z].every(Number.isSafeInteger)) throw new Error("Target coordinates must be whole numbers.");
  const entrance = rotatePoint({ x: Math.floor(size.x / 2), y: 0, z: 0 }, size, rotation);
  const from = { x: target.x - entrance.x, y: target.y, z: target.z - entrance.z };
  const rotated = rotation % 2 ? { x: size.z, y: size.y, z: size.x } : size;
  const to = { x: from.x + rotated.x - 1, y: from.y + rotated.y - 1, z: from.z + rotated.z - 1 };
  return { from, to };
}
export function overlaps(a, b) {
  return a.dimension.id === b.dimension.id && ["x", "y", "z"].every((axis) => a.from[axis] <= b.to[axis] && a.to[axis] >= b.from[axis]);
}
export function inside(point, { from, to }) {
  return ["x", "y", "z"].every((axis) => point[axis] >= from[axis] && point[axis] < to[axis] + 1);
}
export function* positions({ from, to }) {
  for (let y = from.y; y <= to.y; y++) for (let x = from.x; x <= to.x; x++) for (let z = from.z; z <= to.z; z++) yield { x, y, z };
}

export class BuilderEngine {
  constructor({ manager, getManager = () => manager, resolve, rotations, memoryMode, authorized, canBuild, maxHistory = 16 }) {
    Object.assign(this, { getManager, resolve, rotations, memoryMode, authorized, canBuild, maxHistory });
    this.history = new Map();
    this.sequence = 0;
    this.busy = false;
  }
  // Minecraft world services are unavailable during module evaluation.
  get manager() { return this.getManager(); }
  requireAccess(player) {
    if (!this.authorized(player)) throw new Error("Admin authentication is required for Builder.");
    if (this.busy) throw new Error("Another build operation is running. Try again shortly.");
  }
  checkArea(player, record, replace = true) {
    const { dimension, from, to } = record;
    if (from.y < dimension.heightRange.min || to.y >= dimension.heightRange.max) throw new Error("Build is outside this dimension's Y-level limits.");
    for (const location of positions(record)) {
      const allowed = this.canBuild(player, location, dimension.id);
      if (allowed !== true) throw new Error(String(allowed));
      const block = dimension.getBlock(location);
      if (!block) throw new Error("The whole build area must be loaded. Move closer and try again.");
      if (!replace && !block.isAir) throw new Error("The build area is occupied. Choose a clear area or enable Replace blocks.");
    }
    for (const p of dimension.getPlayers()) {
      const l = p.location;
      if (l.x + 0.3 >= from.x && l.x - 0.3 < to.x + 1 && l.z + 0.3 >= from.z && l.z - 0.3 < to.z + 1 && l.y + 1.8 >= from.y && l.y < to.y + 1) throw new Error("A player is inside the build area. Move everyone outside before placing or undoing.");
    }
  }
  discard(record) {
    try { this.manager.delete(record.snapshot); }
    catch (error) { console.warn("[EssX Builder] Snapshot cleanup failed: " + error); }
  }
  remember(playerId, record) {
    const invalidated = [];
    for (const [id, previous] of this.history) {
      if (id === playerId || overlaps(previous, record)) {
        this.discard(previous); this.history.delete(id); invalidated.push(id);
      }
    }
    this.history.set(playerId, record);
    while (this.history.size > this.maxHistory) {
      const [id, oldest] = this.history.entries().next().value;
      this.discard(oldest); this.history.delete(id); invalidated.push(id);
    }
    return invalidated;
  }
  place(player, blueprint, target, rotation, replace = false, name = "Build") {
    this.requireAccess(player);
    const record = { ...placementBounds(blueprint.size, target, rotation), dimension: player.dimension, name };
    this.checkArea(player, record, replace);
    this.busy = true;
    let template, snapshot;
    try {
      // Resolve every palette entry before touching the world.
      const palette = new Map();
      const permutation = (type, states) => {
        const key = JSON.stringify([type, states]);
        if (!palette.has(key)) palette.set(key, this.resolve(type, states));
        return palette.get(key);
      };
      const blocks = blueprint.blocks.map((b) => ({ ...b, permutation: permutation(b.type, b.states) }));
      const id = `essx:builder_${Date.now()}_${++this.sequence}`;
      template = this.manager.createEmpty(id, blueprint.size, this.memoryMode);
      const air = permutation("minecraft:air");
      for (const location of positions({ from: { x: 0, y: 0, z: 0 }, to: { x: blueprint.size.x - 1, y: blueprint.size.y - 1, z: blueprint.size.z - 1 } })) template.setBlockPermutation(location, air);
      for (const b of blocks) template.setBlockPermutation(b.location, b.permutation);
      snapshot = this.manager.createFromWorld(id + "_undo", record.dimension, record.from, record.to, { includeBlocks: true, includeEntities: false, saveMode: this.memoryMode });
      record.snapshot = snapshot;
      try {
        this.manager.place(template, record.dimension, record.from, { rotation: this.rotations[rotation], includeEntities: false, includeBlocks: true });
      } catch (placementError) {
        try { this.manager.place(snapshot, record.dimension, record.from, { includeEntities: false, includeBlocks: true }); }
        catch {
          this.remember(player.id, { ...record, recovery: true });
          snapshot = undefined; // Keep the recovery snapshot available through Undo.
          throw new Error("Placement and automatic rollback failed. The recovery snapshot is retained; use Undo from Builder when the area is loaded.");
        }
        throw placementError;
      }
      const invalidated = this.remember(player.id, record);
      snapshot = undefined; // The history now owns this snapshot.
      return { ...record, invalidated };
    } finally {
      if (template) this.discard({ snapshot: template });
      if (snapshot) this.discard({ snapshot });
      this.busy = false;
    }
  }
  undo(player) {
    this.requireAccess(player);
    const record = this.history.get(player.id);
    if (!record) throw new Error("No build to undo in this session.");
    if (player.dimension.id !== record.dimension.id) throw new Error("Return to the build's dimension before undoing.");
    this.checkArea(player, record);
    this.busy = true;
    try {
      this.manager.place(record.snapshot, record.dimension, record.from, { includeEntities: false, includeBlocks: true });
      this.discard(record); this.history.delete(player.id);
      return record;
    } finally { this.busy = false; }
  }
}
