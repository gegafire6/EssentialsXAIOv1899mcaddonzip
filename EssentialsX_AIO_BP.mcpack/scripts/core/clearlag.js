// Shared ClearLag scan/selection/removal policy. Minecraft objects are supplied by the caller.
export const CLEARLAG_DIMENSIONS = ["overworld", "nether", "the_end"];
const ESSENTIAL_TYPES = new Set(["minecraft:player", "minecraft:npc", "minecraft:agent"]);
export const isEssentialType = (id) => ESSENTIAL_TYPES.has(id) || id.startsWith("essx:");
const belongs = (entity, family) => entity.matches({ families: [family] });

function classify(entity, typeId) {
  if (typeId === "minecraft:item") return "items";
  if (typeId === "minecraft:xp_orb") return "xp";
  if (typeId === "minecraft:arrow") return "arrows";
  if (belongs(entity, "monster")) return "hostile";
  if (belongs(entity, "animal")) return "passive";
  if (belongs(entity, "mob")) return "otherMobs";
  if (/^minecraft:(?:[a-z_]+_)?(?:boat|raft|minecart)$/.test(typeId) || belongs(entity, "boat") || belongs(entity, "minecart")) return "vehicles";
  return "other";
}

/** A single, deduplicated snapshot of currently loaded non-player entities in all three dimensions. */
export function scanClearLag(world) {
  const entities = [], unavailableDimensions = [], seen = new Set();
  let invalid = 0;
  for (const dimension of CLEARLAG_DIMENSIONS) {
    let found;
    try { found = world.getDimension(dimension).getEntities(); }
    catch { unavailableDimensions.push(dimension); continue; }
    for (const entity of found) {
      try {
        if (entity.isValid === false) { invalid++; continue; }
        const { id, typeId } = entity;
        if (seen.has(id)) continue;
        seen.add(id);
        if (typeId === "minecraft:player") continue;
        const protectedEntity = isEssentialType(typeId) || belongs(entity, "essx");
        const group = protectedEntity ? "protected" : classify(entity, typeId);
        // The healthbar plugin sets this marker only for its temporary, generated mob label.
        const named = group !== "items" && !!entity.nameTag && entity.getDynamicProperty("essx:hb") !== true;
        entities.push({ entity, typeId, group, named, protected: protectedEntity });
      } catch { invalid++; }
    }
  }
  return { entities, unavailableDimensions, invalid };
}

const GROUP_FLAGS = { items: "clearItems", xp: "clearXp", arrows: "clearArrows", hostile: "clearHostile", passive: "clearPassive", otherMobs: "clearOtherMobs" };

function decision(entry, config, scope) {
  if (entry.protected) return "protected";
  const override = Object.hasOwn(config.typeOverrides ?? {}, entry.typeId) ? config.typeOverrides[entry.typeId] : undefined;
  if (override === false) return "unselected";
  const selected = scope === "configured"
    ? override === true || !!config[GROUP_FLAGS[entry.group]]
    : scope === "projectiles" ? entry.group === "xp" || entry.group === "arrows" : entry.group === scope;
  if (!selected) return "unselected";
  if (config.keepNamed !== false && entry.named) return "named";
  return "eligible";
}

/** Counts are derived from the same policy used for cleanup, rather than total world entity counts. */
export function clearLagSummary(snapshot, config, scope = "configured") {
  const result = { loaded: snapshot.entities.length, eligible: 0, protected: 0, named: 0, unselected: 0,
    removed: 0, failed: 0, invalid: snapshot.invalid, unavailableDimensions: [...snapshot.unavailableDimensions] };
  for (const entry of snapshot.entities) result[decision(entry, config, scope)]++;
  return result;
}

/** Remove each eligible entity once; one failure never stops the remaining cleanup. */
export function clearLagSnapshot(snapshot, config, scope = "configured") {
  const result = clearLagSummary(snapshot, config, scope);
  for (const entry of snapshot.entities) {
    if (decision(entry, config, scope) !== "eligible") continue;
    try { entry.entity.remove(); result.removed++; }
    catch { result.failed++; }
  }
  return result;
}
