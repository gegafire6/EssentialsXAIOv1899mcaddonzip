// EssentialsX AIO - By Opiar | Cosmetics: wearable hats/wings and particle effects
import { world, system, ItemStack } from "@minecraft/server";
import { BODY_PARTICLES, BODY_PARTICLE_SLOTS, BODY_PARTICLE_INTERVAL, BODY_PARTICLE_BUDGET, bodyParticleFrame } from "../core/cosmetic-particles.js";
import { WEARABLES, wearableByItem } from "../core/wearables.js";
import { DB } from "../core/db.js";
import { cfg, saveCfg, mod } from "../core/config.js";
import { cmd, addMember } from "../core/commands.js";
import { ok, err, msg, menu, modal, confirm, pickPlayer, findPlayer, tpHooks, online, isAdmin, cur, dist2 } from "../core/utils.js";
import { registerPlugin } from "../core/plugins.js";
import { topRank } from "./ranks.js";
import { charge } from "./economy.js";
import { authenticateDeveloper } from "../core/developer-auth.js";
import { isLoggedIn } from "./login.js";

export const TIERS = {
  common: { label: "§7[COMMON]", level: 0, color: "§7" },
  rare: { label: "§9[RARE]", level: 1, color: "§9", price: "rarePrice" },
  vip: { label: "§a[VIP]", level: 2, color: "§a", price: "vipPrice" },
  legend: { label: "§6[LEGEND]", level: 3, color: "§6", price: "legendPrice" },
};

// shape: ring | burst | column | spiral (or an array of them)
const FX = [
  { id: "sparkle", name: "Sparkle", tier: "common", particles: ["minecraft:villager_happy"], shape: "burst", sound: "random.orb" },
  { id: "smoke", name: "Smoke Puff", tier: "common", particles: ["minecraft:basic_smoke_particle"], shape: "burst", sound: "random.fizz" },

  { id: "portal", name: "Ender Portal", tier: "rare", particles: ["minecraft:basic_portal_particle"], shape: "ring", sound: "mob.endermen.portal" },
  { id: "hearts", name: "Love Burst", tier: "rare", particles: ["minecraft:heart_particle"], shape: "burst", sound: "random.levelup" },
  { id: "flame", name: "Flame Ring", tier: "rare", particles: ["minecraft:basic_flame_particle"], shape: "ring", sound: "fire.ignite" },
  { id: "notes", name: "Music Notes", tier: "rare", particles: ["minecraft:note_particle"], shape: "burst", sound: "note.harp" },

  { id: "totem", name: "Totem Pillar", tier: "vip", particles: ["minecraft:totem_particle"], shape: "column", sound: "random.totem" },
  { id: "enchant", name: "Enchant Spiral", tier: "vip", particles: ["minecraft:enchanting_table_particle"], shape: "spiral", sound: "random.levelup" },
  { id: "soul", name: "Soul Whirl", tier: "vip", particles: ["minecraft:soul_particle"], shape: "spiral", sound: "mob.vex.ambient" },
  { id: "splash", name: "Water Splash", tier: "vip", particles: ["minecraft:water_splash_particle"], shape: ["ring", "burst"], sound: "random.splash" },

  { id: "dragon", name: "Dragon Breath", tier: "legend", particles: ["minecraft:dragon_breath_trail"], shape: ["spiral", "ring"], sound: "mob.enderdragon.growl" },
  { id: "inferno", name: "Blue Inferno", tier: "legend", particles: ["minecraft:blue_flame_particle", "minecraft:lava_particle"], shape: ["ring", "column"], sound: "mob.blaze.shoot" },
  { id: "starburst", name: "Starburst", tier: "legend", particles: ["minecraft:endrod", "minecraft:large_explosion"], shape: ["burst", "column"], sound: "firework.large_blast" },
  { id: "storm", name: "Thunder Storm", tier: "legend", particles: ["minecraft:electric_spark_particle", "minecraft:critical_hit_emitter"], shape: ["column", "burst"], sound: "ambient.weather.thunder" },
];
const CATALOG = [...FX, ...BODY_PARTICLES, ...WEARABLES];
const fxById = (id) => CATALOG.find((f) => f.id === id);

const SLOTS = [
  { key: "hat", name: "Hats", equipment: "Head", desc: "2D pixel-art hats. Requires an empty helmet slot; remove armor first.", icon: "textures/items/essx_hat_tophat" },
  { key: "wings", name: "Wings", equipment: "Chest", desc: "2D pixel-art wings. Requires an empty chest slot. Visual only: no flight or armor.", icon: "textures/items/essx_wings_angel" },
  { key: "above", name: "Above You Particles", desc: "A rotating Starlight Halo or Floating Hearts above you. No armor slot required.", icon: "textures/items/nether_star" },
  { key: "crown", name: "Head Crown Particles", desc: "A golden Royal Crown around your head. Works with helmets.", icon: "textures/items/essx_hat_crown" },
  { key: "particle_wings", name: "Particle Wings", desc: "Angel or Flame wings behind you. Works with chest armor; visual only, no flight.", icon: "textures/items/essx_wings_angel" },
  { key: "teleport", name: "Teleport Effect", desc: "Plays when you teleport (home, warp, TPA, RTP...)", icon: "textures/items/ender_pearl" },
  { key: "trail", name: "Walking Trail", desc: "Particles that follow you as you move", icon: "textures/items/feather" },
  { key: "kill", name: "Kill Effect", desc: "Plays where you defeat another player", icon: "textures/items/iron_sword" },
  { key: "join", name: "Join Effect", desc: "Plays when you join the server", icon: "textures/items/fireworks" },
];

// ---------- data ----------
function getCos(id) {
  const d = DB.pdata.get(id, {});
  d.cos ??= { owned: [], grant: 0, eq: {} };
  d.cos.owned ??= [];
  d.cos.eq ??= {};
  return { d, c: d.cos };
}
function saveCos(id, d) { DB.pdata.set(id, d); }
function accessLevel(p) {
  if (isAdmin(p)) return 3;
  const prio = topRank(p.id).priority ?? 0;
  const byRank = prio >= 30 ? 3 : prio >= 10 ? 2 : 0;
  return Math.max(byRank, getCos(p.id).c.grant ?? 0);
}
function hasAccess(p, fx) {
  return TIERS[fx.tier].level <= accessLevel(p) || getCos(p.id).c.owned.includes(fx.id);
}
function priceOf(fx) {
  const key = TIERS[fx.tier].price;
  return key ? Math.max(0, cfg().cosmetics[key] ?? 0) : 0;
}

// ---------- rendering ----------
function spawnP(dim, id, x, y, z) { try { dim.spawnParticle(id, { x, y, z }); } catch {} }
function playSound(dim, pos, id) {
  for (const o of online()) {
    if (o.dimension.id !== dim.id || dist2(o.location, pos) > 24 * 24) continue;
    try { o.playSound(id, { location: pos, volume: 0.8 }); } catch {}
  }
}
export function playEffect(dim, pos, fx, withSound = true) {
  for (const shape of [].concat(fx.shape)) {
    if (shape === "ring") {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        for (const id of fx.particles) spawnP(dim, id, pos.x + Math.cos(a) * 1.2, pos.y + 0.2, pos.z + Math.sin(a) * 1.2);
      }
    } else if (shape === "burst") {
      for (let i = 0; i < 14; i++) {
        for (const id of fx.particles) spawnP(dim, id, pos.x + (Math.random() - 0.5) * 1.6, pos.y + Math.random() * 2, pos.z + (Math.random() - 0.5) * 1.6);
      }
    } else if (shape === "column") {
      for (let h = 0; h < 2.4; h += 0.3) for (const id of fx.particles) spawnP(dim, id, pos.x, pos.y + h, pos.z);
    } else if (shape === "spiral") {
      let t = 0;
      const h = system.runInterval(() => {
        const a = t * 0.7, y = pos.y + t * 0.12;
        for (const id of fx.particles) {
          spawnP(dim, id, pos.x + Math.cos(a) * 0.9, y, pos.z + Math.sin(a) * 0.9);
          spawnP(dim, id, pos.x + Math.cos(a + Math.PI) * 0.9, y, pos.z + Math.sin(a + Math.PI) * 0.9);
        }
        if (++t >= 18) system.clearRun(h);
      }, 1);
    }
  }
  if (withSound && fx.sound) playSound(dim, pos, fx.sound);
}
function equipped(p, slot) {
  const wearableSlot = SLOTS.find(s => s.key === slot && s.equipment);
  if (wearableSlot) {
    try {
      const w = wearableByItem(p.getComponent("minecraft:equippable")?.getEquipment(wearableSlot.equipment)?.typeId);
      return w?.slot === slot && hasAccess(p, w) ? w : undefined;
    } catch { return undefined; }
  }
  const id = getCos(p.id).c.eq[slot];
  const choices = BODY_PARTICLE_SLOTS.includes(slot) ? BODY_PARTICLES.filter(f => f.slot === slot) : FX;
  const fx = id ? choices.find(f => f.id === id) : undefined;
  return fx && hasAccess(p, fx) ? fx : undefined;
}
function play(p, slot, at) {
  if (!mod("cosmetics") || p.hasTag("essx:vanish")) return;
  const fx = equipped(p, slot);
  if (!fx) return;
  try { playEffect(p.dimension, at ?? p.location, fx); } catch {}
}

// ---------- triggers ----------
tpHooks.beforeTeleport.push((p) => play(p, "teleport"));
tpHooks.afterTeleport.push((p) => play(p, "teleport"));

world.afterEvents.entityDie.subscribe((ev) => {
  const k = ev.damageSource?.damagingEntity, d = ev.deadEntity;
  if (k?.typeId !== "minecraft:player" || d.typeId !== "minecraft:player" || k.id === d.id) return;
  try { play(k, "kill", d.location); } catch {}
});
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  system.runTimeout(() => { try { play(p, "join"); } catch {} }, 60);
});

const lastPos = new Map();
let trailTick = 0;
system.runInterval(() => {
  if (!mod("cosmetics")) return;
  if (++trailTick < Math.max(1, Math.round(cfg().cosmetics.trailTicks / 2))) return;
  trailTick = 0;
  for (const p of online()) {
    const prev = lastPos.get(p.id);
    const now = p.location;
    lastPos.set(p.id, { x: now.x, y: now.y, z: now.z });
    if (!prev || dist2(prev, now) < 0.01 || p.hasTag("essx:vanish")) continue;
    const fx = equipped(p, "trail");
    if (!fx) continue;
    const id = fx.particles[Math.floor(Math.random() * fx.particles.length)];
    spawnP(p.dimension, id, now.x + (Math.random() - 0.5) * 0.5, now.y + 0.1 + Math.random() * 0.4, now.z + (Math.random() - 0.5) * 0.5);
  }
}, 2);
world.afterEvents.playerLeave.subscribe((ev) => lastPos.delete(ev.playerId));

// Continuous particles use short-lived single-dot emitters and one shared scheduler.
// Round-robin frames cap work while giving later players a turn on busy servers.
let bodyParticleCursor = 0;
system.runInterval(() => {
  if (!mod("cosmetics")) return;
  const players = online();
  if (!players.length) { bodyParticleCursor = 0; return; }
  let used = 0, next = bodyParticleCursor % players.length;
  for (let offset = 0; offset < players.length; offset++) {
    const index = (bodyParticleCursor + offset) % players.length;
    const p = players[index];
    try {
      if (!p.hasTag("essx:vanish")) {
        const frame = BODY_PARTICLE_SLOTS.flatMap(slot => {
          const fx = equipped(p, slot);
          return fx ? bodyParticleFrame(fx, p.location, p.getRotation().y, system.currentTick, p.isSneaking) : [];
        });
        if (used + frame.length > BODY_PARTICLE_BUDGET) { next = index; break; }
        for (const point of frame) spawnP(p.dimension, point.id, point.location.x, point.location.y, point.location.z);
        used += frame.length;
      }
    } catch { /* Player disconnected or their dimension is no longer loaded. */ }
    next = (index + 1) % players.length;
  }
  bodyParticleCursor = next;
}, BODY_PARTICLE_INTERVAL);

// Wearables are native inventory items. Read actual equipment so manually removing
// one (or death/grave collection) never silently creates another copy.
function wearableSlotReady(p, slot) {
  if (!slot.equipment) return true;
  const eq = p.getComponent("minecraft:equippable");
  if (!eq) { err(p, "Equipment is unavailable. Try again."); return false; }
  const item = eq.getEquipment(slot.equipment);
  if (item && wearableByItem(item.typeId)?.slot !== slot.key) {
    err(p, `Remove your ${slot.equipment === "Head" ? "helmet" : "chest armor / Elytra"} first. Your armor has been kept.`);
    return false;
  }
  return true;
}
function enforceWearables(p) {
  const eq = p.getComponent("minecraft:equippable");
  if (!eq) return;
  for (const slot of SLOTS.filter(s => s.equipment)) {
    const w = wearableByItem(eq.getEquipment(slot.equipment)?.typeId);
    if (w && (!mod("cosmetics") || !hasAccess(p, w) || p.hasTag("essx:vanish"))) {
      if (eq.setEquipment(slot.equipment, undefined)) {
        const { d, c } = getCos(p.id);
        delete c.eq[slot.key]; saveCos(p.id, d);
      }
    }
  }
}
system.runInterval(() => {
  for (const p of online()) { try { enforceWearables(p); } catch {} }
}, 20);

// The cape uses an actual chest-slot item, following the existing wearable contract.
// Never recreate it when a player removes it, dies, or replaces their chest equipment.
const CAPE_ITEM = "essx:server_cape";
function capeEquipped(p) {
  return p.getComponent("minecraft:equippable")?.getEquipment("Chest")?.typeId === CAPE_ITEM;
}
function saveCapeDisplay(p, enabled) {
  const data = DB.pdata.get(p.id, {});
  DB.pdata.set(p.id, { ...data, capeDisplay: enabled });
}
function capeReady(p) { return !!p?.isValid && isLoggedIn(p) && mod("cosmetics"); }
function updateCapeDisplay(p, enabled) {
  if (!capeReady(p)) return err(p, "Log in and enable Cosmetics first.");
  const equipment = p.getComponent("minecraft:equippable");
  if (!equipment) return err(p, "Equipment is unavailable. Try again.");
  const current = equipment.getEquipment("Chest");
  if (enabled) {
    if (p.hasTag("essx:vanish")) return err(p, "Leave vanish before enabling the cape.");
    if (current && current.typeId !== CAPE_ITEM) return err(p, "Remove your chest armor, Elytra or wings first. Your equipment was kept.");
    if (!current && !equipment.setEquipment("Chest", new ItemStack(CAPE_ITEM))) return err(p, "Could not equip the cape. Try again.");
  } else if (current?.typeId === CAPE_ITEM && !equipment.setEquipment("Chest", undefined)) {
    return err(p, "Could not remove the cape. Try again.");
  }
  saveCapeDisplay(p, enabled);
  ok(p, "Server cape display " + (enabled ? "enabled." : "disabled."));
}
async function capeDisplayUI(p) {
  if (!capeReady(p)) return err(p, "Log in and enable Cosmetics first.");
  const initial = capeEquipped(p);
  const r = await modal(p, "§lCape Display", [
    { type: "label", label: "§7Server cape uses the chest slot. Remove chest armor, Elytra or wings before enabling." },
    { type: "toggle", key: "enabled", label: "Show server cape", default: initial },
  ], "Save");
  if (!r) return;
  if (!capeReady(p)) return err(p, "Log in and enable Cosmetics first.");
  if (capeEquipped(p) !== initial) return err(p, "Your equipment changed. Reopen Cape Display.");
  updateCapeDisplay(p, !!r.enabled);
}
// Keep the saved switch aligned with the real equipment. Vanish and module
// disable remove only this cosmetic item, never a player's armor or wings.
system.runInterval(() => {
  for (const p of online()) try {
    const eq = p.getComponent("minecraft:equippable");
    if (!eq) continue;
    let worn = eq.getEquipment("Chest")?.typeId === CAPE_ITEM;
    if (worn && (!mod("cosmetics") || p.hasTag("essx:vanish"))) {
      if (!eq.setEquipment("Chest", undefined)) continue;
      worn = false;
    }
    if ((DB.pdata.get(p.id, {}).capeDisplay === true) !== worn) saveCapeDisplay(p, worn);
  } catch { /* Player disconnected or equipment is unavailable. */ }
}, 20);
addMember({ text: "§l§bCape Display\n§r§8Server cape on / off", icon: "textures/items/essx_server_cape", module: "cosmetics", category: "settings", run: capeDisplayUI });

// ---------- UI ----------
const choosing = new Set();
const sessions = new Map();
world.afterEvents.playerLeave.subscribe(ev => {
  sessions.delete(ev.playerId);
  choosing.delete(ev.playerId);
});
async function choose(p, slot, fx) {
  if (choosing.has(p.id)) return err(p, "Finish your current cosmetic selection first.");
  const session = sessions.get(p.id) ?? Symbol();
  sessions.set(p.id, session);
  choosing.add(p.id);
  try {
    if (!mod("cosmetics")) return err(p, "Cosmetics are disabled.");
    if (slot.equipment && p.hasTag("essx:vanish")) return err(p, "Leave vanish before equipping wearables.");
    if (!fx) {
      if (slot.equipment) {
        const eq = p.getComponent("minecraft:equippable");
        if (wearableByItem(eq?.getEquipment(slot.equipment)?.typeId)?.slot === slot.key && !eq.setEquipment(slot.equipment, undefined))
          return err(p, "Could not remove the wearable. Try again.");
      }
      const { d, c } = getCos(p.id);
      delete c.eq[slot.key]; saveCos(p.id, d);
      return ok(p, `${slot.name} turned off.`);
    }
    if (!wearableSlotReady(p, slot)) return;
    if (!hasAccess(p, fx)) {
      const price = priceOf(fx);
      if (price <= 0) return err(p, `${fx.name} needs the ${TIERS[fx.tier].label} §crank or unlock.`);
      if (!(await confirm(p, "§l" + fx.name, `${TIERS[fx.tier].label}\n§fBuy forever for §a${cur(price)}§f?`, "§aBuy", "§cCancel"))) return;
      if (p.isValid === false || sessions.get(p.id) !== session) return;
      if (!mod("cosmetics")) return err(p, "Cosmetics are disabled.");
      if (slot.equipment && p.hasTag("essx:vanish")) return err(p, "Leave vanish before equipping wearables.");
      if (!wearableSlotReady(p, slot)) return;
      // Re-read after the form: a grant, reset, setting or other player data may change.
      if (!hasAccess(p, fx)) {
        if (priceOf(fx) !== price) return err(p, "The price changed. Select the cosmetic again.");
        if (!charge(p, price, fx.name)) return;
        const { d, c } = getCos(p.id);
        if (!c.owned.includes(fx.id)) c.owned.push(fx.id);
        saveCos(p.id, d);
        ok(p, `Unlocked ${TIERS[fx.tier].color}${fx.name}§a!`);
      }
    }
    if (slot.equipment) {
      const eq = p.getComponent("minecraft:equippable");
      if (!eq?.setEquipment(slot.equipment, new ItemStack(fx.item)))
        return err(p, "Could not equip the wearable. Your unlock is saved; try again.");
    }
    const { d, c } = getCos(p.id);
    c.eq[slot.key] = fx.id; saveCos(p.id, d);
    msg(p, `§f${slot.name}: ${TIERS[fx.tier].color}${fx.name}`);
    if (!slot.equipment) {
      try {
        if (fx.slot) {
          if (!p.hasTag("essx:vanish")) for (const point of bodyParticleFrame(fx, p.location, p.getRotation().y, system.currentTick, p.isSneaking)) spawnP(p.dimension, point.id, point.location.x, point.location.y, point.location.z);
        } else playEffect(p.dimension, p.location, fx);
      } catch {}
    }
  } catch {
    err(p, "Could not update the cosmetic. Any purchased unlock is saved; try again.");
  } finally {
    // A disconnected player's older form must not unlock a new session's form.
    if (sessions.get(p.id) === session) choosing.delete(p.id);
  }
}

async function slotUI(p, slot) {
  while (true) {
    const cur = equipped(p, slot.key)?.id;
    const buttons = [
      { text: "§l§cNone (off)\n§r§8" + (cur ? "Disable this cosmetic" : "§aCurrently off"), icon: "textures/ui/essx/icons/close", cos: true, run: () => choose(p, slot, undefined) },
      ...(slot.equipment ? WEARABLES.filter(w => w.slot === slot.key) : BODY_PARTICLE_SLOTS.includes(slot.key) ? BODY_PARTICLES.filter(f => f.slot === slot.key) : FX).map((fx) => {
        const t = TIERS[fx.tier];
        const owned = hasAccess(p, fx);
        const price = priceOf(fx);
        const status = cur === fx.id && owned ? "§aEQUIPPED" : owned ? "§aUnlocked" : price > 0 ? `§eBuy §a${price}` : "§cLocked";
        return { text: `§l${t.color}${fx.name}\n§r${t.label} §8| ${status}`, icon: fx.icon ?? slot.icon, cos: true, run: () => choose(p, slot, fx) };
      }),
    ];
    const b = await menu(p, "§l" + slot.name, `§7${slot.desc}\n§7Tap a cosmetic to equip it. Locked ones need a rank or purchase.`, buttons);
    if (!b?.cos) return;
  }
}

const LEVEL_NAMES = ["Common", "Rare", "VIP", "Legend"];
export async function cosmeticsHub(p) {
  const lvl = accessLevel(p);
  const lines = SLOTS.map((s) => { const fx = equipped(p, s.key); return `§f${s.name}: ${fx ? TIERS[fx.tier].color + fx.name : "§8off"}`; });
  await menu(p, "§lCosmetics", `§7Unlocked up to: ${["§7", "§9", "§a", "§6"][lvl]}${LEVEL_NAMES[lvl]}\n${lines.join("\n")}\n\n§7${TIERS.rare.label} §7${TIERS.vip.label} §7${TIERS.legend.label}`,
    SLOTS.map((s) => ({ text: `§l${s.name}\n§r§8${equipped(p, s.key)?.name ?? "Off"}`, icon: s.icon, run: () => slotUI(p, s) })));
}

async function grantUI(p) {
  const t = await pickPlayer(p, "§lGrant Cosmetics", true);
  if (!t) return;
  const { d, c } = getCos(t.id);
  const r = await modal(p, "§lCosmetics: " + t.name, [
    { type: "dropdown", key: "lvl", label: "Unlock tier (includes lower tiers)", options: ["None", "Rare", "VIP", "Legend"], default: c.grant ?? 0 },
  ], "Save");
  if (!r) return;
  const fresh = getCos(t.id);
  fresh.c.grant = r.lvl;
  saveCos(t.id, fresh.d);
  enforceWearables(t);
  ok(p, `${t.name} cosmetics unlock: ${["None", "Rare", "VIP", "Legend"][r.lvl]}`);
  if (t.id !== p.id) msg(t, "§dYour cosmetics access was updated. Open §e!cosmetics");
}

cmd({
  name: "cosmetics", aliases: ["cos", "fx"], module: "cosmetics", desc: "Open cosmetics (admin: give/take/reset)", usage: "[give|take|reset] [player] [rare|vip|legend|cosmetic]",
  run: async (p, a) => {
    if (!a[0]) return cosmeticsHub(p);
    if (!isAdmin(p)) return err(p, "You don't have permission.");
    if (!await authenticateDeveloper(p)) return;
    const [op, who, what] = a;
    const t = findPlayer(who ?? "");
    if (!t) return err(p, "Usage: !cosmetics <give|take|reset> <player> [rare|vip|legend|cosmeticId]");
    const { d, c } = getCos(t.id);
    if (op === "reset") {
      const eq = t.getComponent("minecraft:equippable");
      for (const slot of SLOTS.filter(s => s.equipment)) {
        if (wearableByItem(eq?.getEquipment(slot.equipment)?.typeId) && !eq.setEquipment(slot.equipment, undefined))
          return err(p, "Could not remove the wearable. Try resetting cosmetics again.");
      }
      d.cos = { owned: [], grant: 0, eq: {} };
      saveCos(t.id, d);
      return ok(p, "Reset cosmetics of " + t.name);
    }
    const tier = TIERS[what];
    const fx = fxById(what);
    if (!tier && !fx) return err(p, "Choose rare, vip, legend or a cosmetic id: " + CATALOG.map((f) => f.id).join(", "));
    if (op === "give") {
      if (tier) c.grant = Math.max(c.grant ?? 0, tier.level); else if (!c.owned.includes(fx.id)) c.owned.push(fx.id);
    } else if (op === "take") {
      if (tier) c.grant = Math.min(c.grant ?? 0, Math.max(0, tier.level - 1)); else c.owned = c.owned.filter((x) => x !== fx.id);
    } else return err(p, "Use give, take or reset.");
    saveCos(t.id, d);
    enforceWearables(t);
    ok(p, `Updated cosmetics of ${t.name}.`);
  },
});
addMember({ text: "§l§dCosmetics\n§r§8Hats, wings & particle effects", icon: "textures/ui/essx/icons/cosmetics", module: "cosmetics", run: cosmeticsHub });

registerPlugin({
  id: "cosmetics", name: "Cosmetics", module: "cosmetics", icon: "textures/items/nether_star",
  desc: "Hats, wings, five continuous above/head/wing particles, plus teleport, trail, kill & join effects.",
  fields: (c) => [
    { type: "label", label: "§7Price 0 = rank/unlock only. VIP rank+ unlocks VIP, Legend rank+ unlocks Legend." },
    { type: "slider", key: "rarePrice", label: "Rare cosmetic price", min: 0, max: 100000, step: 250, default: c.cosmetics.rarePrice },
    { type: "slider", key: "vipPrice", label: "VIP cosmetic price", min: 0, max: 100000, step: 250, default: c.cosmetics.vipPrice },
    { type: "slider", key: "legendPrice", label: "Legend cosmetic price", min: 0, max: 100000, step: 250, default: c.cosmetics.legendPrice },
    { type: "slider", key: "trailTicks", label: "Trail speed (ticks, lower = denser)", min: 2, max: 20, step: 1, default: c.cosmetics.trailTicks },
  ],
  apply: (c, r) => Object.assign(c.cosmetics, r),
  actions: [{ text: "§l§dGrant Player Cosmetics\n§r§8Unlock Rare / VIP / Legend", icon: "textures/ui/icon_steve", run: grantUI }],
});
