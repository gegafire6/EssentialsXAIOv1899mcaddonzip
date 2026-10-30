// EssentialsX AIO - By Opiar | Craftable door and chest locks
import { world, system } from "@minecraft/server";
import { DB } from "../core/db.js";
import { canBuild, canInteract } from "./protection.js";
import { isLoggedIn } from "./login.js";
import { err, ok, inv, giveType, now } from "../core/utils.js";

const LOCK_ITEM = "essx:lock";
const SIDES = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
const warnings = new Map();
const key = (dim, pos) => `${dim}:${pos.x},${pos.y},${pos.z}`;
const isChest = (b) => /^minecraft:(?:chest|.*_chest)$/.test(b.typeId);
const isDoor = (b) => /^minecraft:.*_door$/.test(b.typeId);
const isTrapdoor = (b) => /^minecraft:(?:trapdoor|.*_trapdoor)$/.test(b.typeId);
const supported = (b) => isChest(b) || isDoor(b) || isTrapdoor(b);
const lockName = (b) => isChest(b) ? "Chest" : "Door";

function blockAt(dim, pos) {
  try { return dim.getBlock(pos); } catch { return undefined; }
}
function state(block, name) {
  try { return block.permutation.getState(name); } catch { return undefined; }
}
function containerSize(block) {
  try { return block.getComponent("minecraft:inventory")?.container?.size ?? 0; } catch { return 0; }
}
function neighbors(block) {
  return SIDES.map(({ x, z }) => blockAt(block.dimension, { x: block.location.x + x, y: block.location.y, z: block.location.z + z })).filter(Boolean);
}
function directLock(block) {
  const lock = DB.blockLocks.get(key(block.dimension.id, block.location));
  return lock?.type === block.typeId ? lock : undefined;
}
function lockAt(block) {
  const direct = directLock(block);
  if (direct) return direct;
  // Also deny opening a newly joined half if the chest layout changed externally.
  if (isChest(block) && containerSize(block) > 27) {
    for (const neighbor of neighbors(block)) {
      if (neighbor.typeId === block.typeId && containerSize(neighbor) > 27) {
        const lock = directLock(neighbor);
        if (lock) return lock;
      }
    }
  }
}
function targetBlocks(block) {
  if (isDoor(block)) {
    const pos = { ...block.location, y: block.location.y - (state(block, "upper_block_bit") ? 1 : 0) };
    const bottom = blockAt(block.dimension, pos);
    const top = blockAt(block.dimension, { ...pos, y: pos.y + 1 });
    return bottom?.typeId === block.typeId && top?.typeId === block.typeId ? [bottom, top] : undefined;
  }
  if (isChest(block) && containerSize(block) > 27) {
    const facing = state(block, "facing_direction") ?? state(block, "minecraft:cardinal_direction");
    const partners = neighbors(block).filter((other) => other.typeId === block.typeId && containerSize(other) > 27 && (state(other, "facing_direction") ?? state(other, "minecraft:cardinal_direction")) === facing);
    // Do not guess when several adjacent double chests have ambiguous pairings.
    return partners.length === 1 ? [block, partners[0]] : undefined;
  }
  return [block];
}
function permitted(p, blocks) {
  for (const block of blocks) {
    for (const check of [canBuild, canInteract]) {
      const reason = check(p, block.location, block.dimension.id);
      if (reason !== true) { err(p, reason); return false; }
    }
  }
  return true;
}
function currentTarget(p, dimension, position) {
  if (!p.isValid || p.dimension.id !== dimension.id || !isLoggedIn(p)) return undefined;
  const d = p.location;
  if ((d.x - position.x) ** 2 + (d.y - position.y) ** 2 + (d.z - position.z) ** 2 > 64) return undefined;
  return blockAt(dimension, position);
}
function applyLock(p, dimension, position, slot, type) {
  const block = currentTarget(p, dimension, position);
  if (!block || block.typeId !== type || !supported(block) || p.selectedSlotIndex !== slot) return;
  const blocks = targetBlocks(block);
  if (!blocks) return err(p, "Separate adjacent double chests before locking, or check both door halves.");
  if (!permitted(p, blocks)) return;
  if (blocks.some((b) => lockAt(b))) return err(p, isChest(block) ? "this chest has lock" : "this door has locked");
  const inventory = inv(p), held = inventory.getItem(slot);
  if (held?.typeId !== LOCK_ITEM || held.amount < 1) return;
  if (held.amount === 1) inventory.setItem(slot, undefined);
  else { held.amount--; inventory.setItem(slot, held); }
  const lock = { owner: p.id, ownerName: p.name, type, dim: dimension.id, blocks: blocks.map((b) => ({ ...b.location })) };
  for (const b of blocks) DB.blockLocks.set(key(dimension.id, b.location), lock);
  ok(p, `${lockName(block)} Has been lock`);
}
function removeLock(p, dimension, position) {
  const block = currentTarget(p, dimension, position);
  if (!block || !p.isSneaking || inv(p).getItem(p.selectedSlotIndex)) return;
  const lock = lockAt(block);
  if (!lock || lock.owner !== p.id || !permitted(p, [block])) return;
  for (const pos of lock.blocks) {
    const id = key(lock.dim, pos), current = DB.blockLocks.get(id);
    if (current?.owner === p.id && current.type === lock.type) DB.blockLocks.delete(id);
  }
  giveType(p, LOCK_ITEM, 1);
  ok(p, `${lockName(block)} has been unlocked`);
}
function warn(p, message) {
  system.run(() => {
    if (p.isValid && now() - (warnings.get(p.id) ?? 0) >= 1500) {
      warnings.set(p.id, now());
      err(p, message);
    }
  });
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const block = event.block;
  if (!supported(block)) return;
  const p = event.player, lock = lockAt(block);
  if (lock && lock.owner !== p.id) {
    event.cancel = true;
    warn(p, `Locked by ${lock.ownerName}.`);
    return;
  }
  if (event.cancel) return; // Respect existing region/claim restrictions.
  if (event.itemStack?.typeId === LOCK_ITEM) {
    event.cancel = true;
    if (event.isFirstEvent === false) return;
    const slot = p.selectedSlotIndex, pos = { ...block.location }, type = block.typeId, dimension = block.dimension;
    system.run(() => applyLock(p, dimension, pos, slot, type));
  } else if (lock && p.isSneaking && !event.itemStack) {
    event.cancel = true;
    if (event.isFirstEvent === false) return;
    const pos = { ...block.location }, dimension = block.dimension;
    system.run(() => removeLock(p, dimension, pos));
  }
});

function protectedLock(block) {
  const lock = lockAt(block);
  if (lock) return lock;
  // Breaking a door's support would otherwise drop both locked halves.
  const above = blockAt(block.dimension, { ...block.location, y: block.location.y + 1 });
  return above && isDoor(above) ? lockAt(above) : undefined;
}
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const lock = protectedLock(event.block);
  if (!lock) return;
  event.cancel = true;
  warn(event.player, lock.owner === event.player.id ? "Remove your lock with sneak + empty-hand use before breaking this block." : `Locked by ${lock.ownerName}.`);
});
world.beforeEvents.playerPlaceBlock.subscribe((event) => {
  // Joining another chest must not change the inventory protected by an existing lock.
  const placing = event.permutationToPlace.type.id;
  if (!/^minecraft:(?:chest|.*_chest)$/.test(placing)) return;
  if (neighbors(event.block).some((b) => b.typeId === placing && directLock(b))) {
    event.cancel = true;
    warn(event.player, "Remove the nearby chest lock before adding another chest.");
  }
});
world.beforeEvents.explosion.subscribe((event) => {
  const blocks = event.getImpactedBlocks();
  const keep = blocks.filter((block) => !protectedLock(block));
  if (keep.length !== blocks.length) event.setImpactedBlocks(keep);
});
world.beforeEvents.playerLeave.subscribe((event) => warnings.delete(event.player.id));
