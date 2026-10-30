import { actionbar } from "../core/actionbar.js";
// EssentialsX AIO - By Opiar | Vein Miner + Tree Capitator plugins
import { world, system, GameMode } from "@minecraft/server";
import { cfg, mod, saveCfg } from "../core/config.js";
import { registerPlugin } from "../core/plugins.js";
import { heldItem, setHeld, removeItem, countItem, sound } from "../core/utils.js";
import { canBuild } from "./protection.js";

const ACTIVATION = ["Sneak while mining", "Always on", "Only when NOT sneaking"];

const ORE = /^minecraft:(?:lit_)?(?:deepslate_)?(?:coal|iron|copper|gold|redstone|lapis|diamond|emerald)_ore$|^minecraft:(?:nether_gold_ore|quartz_ore|ancient_debris)$/;
const LOG = /^minecraft:(?:stripped_)?(?:[a-z_]+)_(?:log|stem)$/;
const LEAVES = /_leaves$|^minecraft:(?:nether_wart_block|warped_wart_block|shroomlight)$/;
const SOIL = /^minecraft:(?:dirt|grass_block|podzol|mycelium|mud|muddy_mangrove_roots|rooted_dirt|moss_block|coarse_dirt|crimson_nylium|warped_nylium)$/;
const XP = { coal_ore: 1, lapis_ore: 4, redstone_ore: 3, diamond_ore: 5, emerald_ore: 5, quartz_ore: 3, nether_gold_ore: 1 };
const SAPLING = { oak: "oak_sapling", spruce: "spruce_sapling", birch: "birch_sapling", jungle: "jungle_sapling", acacia: "acacia_sapling", dark_oak: "dark_oak_sapling", cherry: "cherry_sapling", mangrove: "mangrove_propagule" };

const NEIGHBORS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) NEIGHBORS.push([x, y, z]);

const busy = new Set();
const ore = (id) => id.replace("minecraft:", "").replace("lit_", "").replace("deepslate_", "");

function shouldActivate(p, mode) {
  if (mode === 1) return true;
  return mode === 0 ? p.isSneaking : !p.isSneaking;
}

/** Flood-fill from `origin`, returning blocks (excluding origin) matching `match`. */
function collect(dim, origin, match, max, minY = -Infinity) {
  const seen = new Set([`${origin.x},${origin.y},${origin.z}`]);
  const queue = [origin];
  const found = [];
  while (queue.length && found.length < max) {
    const c = queue.shift();
    for (const [dx, dy, dz] of NEIGHBORS) {
      const pos = { x: c.x + dx, y: c.y + dy, z: c.z + dz };
      if (pos.y < minY) continue;
      const key = `${pos.x},${pos.y},${pos.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let b;
      try { b = dim.getBlock(pos); } catch { continue; }
      if (!b || !match(b)) continue;
      found.push(b);
      queue.push(pos);
      if (found.length >= max) break;
    }
  }
  return found;
}

function enchantLevel(item, id) {
  try { return item.getComponent("minecraft:enchantable")?.getEnchantment(id)?.level ?? 0; } catch { return 0; }
}

/** Wear down the held tool. Returns false when the tool broke or can't take more damage. */
function damageTool(p, item, amount) {
  try {
    const d = item.getComponent("minecraft:durability");
    if (!d) return true;
    const unb = enchantLevel(item, "unbreaking");
    for (let i = 0; i < amount; i++) if (Math.random() < 1 / (unb + 1)) d.damage++;
    if (d.damage >= d.maxDurability) { setHeld(p, undefined); sound(p, "random.break"); return false; }
    setHeld(p, item);
    return true;
  } catch { return true; }
}

function durabilityLeft(item) {
  try { const d = item.getComponent("minecraft:durability"); return d ? d.maxDurability - d.damage : Infinity; } catch { return Infinity; }
}

/** Break a block the way the player would (loot respects Fortune / Silk Touch via the held tool). */
function breakBlock(p, dim, block, silk) {
  const { x, y, z } = block.location;
  let dropped = false;
  try {
    const r = p.runCommand(`loot spawn ${x} ${y} ${z} mine ${x} ${y} ${z} mainhand`);
    dropped = r.successCount > 0;
  } catch {}
  if (dropped) { try { dim.setBlockType(block.location, "minecraft:air"); } catch {} }
  else { try { dim.runCommand(`setblock ${x} ${y} ${z} air destroy`); } catch { return false; } }
  return true;
}

function giveXp(p, typeId, silk) {
  if (silk || !cfg().veinminer.giveXp) return;
  const n = XP[ore(typeId)];
  if (n) { try { p.runCommand(`xp ${n} @s`); } catch {} }
}

function veinMine(p, ev) {
  const c = cfg().veinminer;
  const item = heldItem(p);
  const id = ev.brokenBlockPermutation.type.id;
  const isOre = ORE.test(id);
  const extra = (c.extraBlocks ?? []).map((s) => (s.includes(":") ? s : "minecraft:" + s));
  if (!isOre && !extra.includes(id)) return;
  if (c.requireTool && isOre && !item?.typeId.endsWith("_pickaxe")) return;
  if (!item && c.requireTool) return;
  const dim = ev.block.dimension;
  const family = ore(id);
  const match = (b) => (isOre ? ORE.test(b.typeId) && ore(b.typeId) === family : b.typeId === id);
  const blocks = collect(dim, ev.block.location, match, Math.max(1, c.maxBlocks) - 1);
  if (!blocks.length) return;

  const silk = item ? enchantLevel(item, "silk_touch") > 0 : false;
  let mined = 0;
  let tool = item;
  for (const b of blocks) {
    if (canBuild(p, b.location, dim.id) !== true) continue;
    if (c.useDurability && tool && durabilityLeft(tool) <= 1) break;
    const typeId = b.typeId;
    if (!breakBlock(p, dim, b, silk)) continue;
    mined++;
    giveXp(p, typeId, silk);
    if (c.useDurability && tool && !damageTool(p, tool, 1)) break;
    if (c.useDurability && tool) tool = heldItem(p) ?? undefined;
    if (c.useDurability && !tool) break;
  }
  if (mined) actionbar(p, `§bVein Miner §7- §f${mined + 1} §7blocks`);
}

function chopTree(p, ev) {
  const c = cfg().treecapitator;
  const id = ev.brokenBlockPermutation.type.id;
  if (!LOG.test(id)) return;
  const item = heldItem(p);
  if (c.requireAxe && !item?.typeId.endsWith("_axe")) return;
  const dim = ev.block.dimension;
  const origin = ev.block.location;
  const species = id.replace("minecraft:", "").replace("stripped_", "").replace(/_(log|stem)$/, "");
  const match = (b) => LOG.test(b.typeId) && b.typeId.replace("minecraft:", "").replace("stripped_", "").replace(/_(log|stem)$/, "") === species;
  const logs = collect(dim, origin, match, Math.max(1, c.maxBlocks) - 1, origin.y);
  if (!logs.length) return;

  // Only natural trees: at least one log in the cluster must touch leaves.
  const touchesLeaves = [{ location: origin }, ...logs].some((b) => NEIGHBORS.some(([dx, dy, dz]) => {
    try { const n = dim.getBlock({ x: b.location.x + dx, y: b.location.y + dy, z: b.location.z + dz }); return n && LEAVES.test(n.typeId); } catch { return false; }
  }));
  if (!touchesLeaves) return;

  let chopped = 0;
  let tool = item;
  const brokenAt = [origin];
  for (const b of logs.sort((a, z) => a.location.y - z.location.y)) {
    if (canBuild(p, b.location, dim.id) !== true) continue;
    if (c.useDurability && tool && durabilityLeft(tool) <= 1) break;
    if (!breakBlock(p, dim, b, false)) continue;
    chopped++;
    brokenAt.push(b.location);
    if (c.useDurability && tool && !damageTool(p, tool, 1)) break;
    if (c.useDurability && tool) tool = heldItem(p) ?? undefined;
    if (c.useDurability && !tool) break;
  }

  if (c.instantLeafDecay) {
    let leaves = 0;
    for (const l of brokenAt) {
      if (leaves >= 160) break;
      for (const b of collect(dim, l, (x) => LEAVES.test(x.typeId) && x.permutation.getState("persistent_bit") !== true, 40)) {
        if (leaves >= 160) break;
        if (canBuild(p, b.location, dim.id) !== true) continue;
        try { dim.runCommand(`setblock ${b.location.x} ${b.location.y} ${b.location.z} air destroy`); leaves++; } catch {}
      }
    }
  }

  if (c.replant) {
    const sap = SAPLING[species];
    try {
      const below = dim.getBlock({ x: origin.x, y: origin.y - 1, z: origin.z });
      if (sap && below && SOIL.test(below.typeId) && countItem(p, "minecraft:" + sap) > 0 && removeItem(p, "minecraft:" + sap, 1)) {
        dim.setBlockType(origin, "minecraft:" + sap);
      }
    } catch {}
  }
  if (chopped) actionbar(p, `§2Tree Capitator §7- §f${chopped + 1} §7logs`);
}

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const p = ev.player;
  if (busy.has(p.id)) return;
  const vm = mod("veinminer"), tc = mod("treecapitator");
  if (!vm && !tc) return;
  try { if (p.getGameMode() === GameMode.Creative || p.getGameMode() === GameMode.Spectator) return; } catch {}
  busy.add(p.id);
  try {
    if (tc && shouldActivate(p, cfg().treecapitator.activation) && LOG.test(ev.brokenBlockPermutation.type.id)) chopTree(p, ev);
    else if (vm && shouldActivate(p, cfg().veinminer.activation)) veinMine(p, ev);
  } catch (e) { console.warn("[EssX] gathering error: " + e); }
  finally { busy.delete(p.id); }
});

const pct = (arr) => (arr ?? []).join(", ");

registerPlugin({
  id: "veinminer", name: "Vein Miner", module: "veinminer", icon: "textures/items/diamond_pickaxe",
  desc: "Mine a whole ore vein by breaking one block.",
  fields: (c) => [
    { type: "slider", key: "maxBlocks", label: "Max blocks per vein", min: 2, max: 256, step: 2, default: Math.min(256, c.veinminer.maxBlocks) },
    { type: "dropdown", key: "activation", label: "Activation", options: ACTIVATION, default: c.veinminer.activation },
    { type: "toggle", key: "requireTool", label: "Require a pickaxe", default: c.veinminer.requireTool },
    { type: "toggle", key: "useDurability", label: "Use tool durability", default: c.veinminer.useDurability },
    { type: "toggle", key: "giveXp", label: "Give XP for ores", default: c.veinminer.giveXp },
    { type: "text", key: "extra", label: "Extra block ids (comma separated, e.g. gravel,clay)", default: pct(c.veinminer.extraBlocks) },
  ],
  apply: (c, r) => {
    Object.assign(c.veinminer, { maxBlocks: r.maxBlocks, activation: r.activation, requireTool: r.requireTool, useDurability: r.useDurability, giveXp: r.giveXp });
    c.veinminer.extraBlocks = String(r.extra).split(",").map((s) => s.trim()).filter(Boolean);
  },
});
registerPlugin({
  id: "treecapitator", name: "Tree Capitator", module: "treecapitator", icon: "textures/items/iron_axe",
  desc: "Chop down an entire tree by breaking one log.",
  fields: (c) => [
    { type: "slider", key: "maxBlocks", label: "Max logs per tree", min: 8, max: 512, step: 8, default: Math.min(512, c.treecapitator.maxBlocks) },
    { type: "dropdown", key: "activation", label: "Activation", options: ACTIVATION, default: c.treecapitator.activation },
    { type: "toggle", key: "requireAxe", label: "Require an axe", default: c.treecapitator.requireAxe },
    { type: "toggle", key: "useDurability", label: "Use tool durability", default: c.treecapitator.useDurability },
    { type: "toggle", key: "replant", label: "Auto replant (uses a sapling from inventory)", default: c.treecapitator.replant },
    { type: "toggle", key: "instantLeafDecay", label: "Instantly remove leaves", default: c.treecapitator.instantLeafDecay },
  ],
  apply: (c, r) => Object.assign(c.treecapitator, r),
});
