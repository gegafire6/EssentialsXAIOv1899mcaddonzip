// EssentialsX AIO - By Opiar | Blurry Java Combat
import { world, system, EquipmentSlot, GameMode } from "@minecraft/server";
import { cfg, mod } from "../core/config.js";
import { registerPlugin } from "../core/plugins.js";
import { actionbar, actionbarBusy } from "../core/actionbar.js";
import { AttackCooldowns, damageMultiplier } from "../core/java-combat.js";

const cooldowns = new AttackCooldowns();
const indicators = new Map();
const supported = !!world.beforeEvents.entityHurt && !!world.afterEvents.playerSwingStart;
let warned = false;
const heldType = (p) => p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId ?? "";
const eligible = (p) => p.typeId === "minecraft:player" && [GameMode.Survival, GameMode.Adventure].includes(p.getGameMode());
const active = () => supported && mod("javaCombat");

world.beforeEvents.entityHurt?.subscribe((ev) => {
  if (!active() || ev.cancel || ev.damageSource.cause !== "entityAttack" || ev.damageSource.damagingProjectile) return;
  const player = ev.damageSource.damagingEntity;
  if (!player || !eligible(player) || ev.hurtEntity.typeId.startsWith("essx:")) return;
  const settings = cfg().javaCombat;
  const isPlayer = ev.hurtEntity.typeId === "minecraft:player";
  if (isPlayer ? !settings.affectPlayers : !settings.affectMobs) return;
  const charge = cooldowns.attack(player.id, heldType(player), system.currentTick, settings.cooldownPercent);
  // Modify the original event: no healing, replacement damage, or protection bypass.
  ev.damage *= damageMultiplier(charge);
});

world.afterEvents.playerSwingStart?.subscribe((ev) => {
  if (!active() || ev.swingSource !== "Attack" || !eligible(ev.player)) return;
  cooldowns.attack(ev.player.id, heldType(ev.player), system.currentTick, cfg().javaCombat.cooldownPercent);
});

system.runInterval(() => {
  if (!active()) {
    cooldowns.states.clear(); indicators.clear();
    if (mod("javaCombat") && !supported && !warned) {
      warned = true;
      console.warn("[EssX] Blurry Java Combat needs entityHurt before-events and playerSwingStart. Enable Beta APIs on a compatible Minecraft version.");
    }
    return;
  }
  const settings = cfg().javaCombat;
  for (const player of world.getAllPlayers()) {
    try {
      if (!eligible(player)) { cooldowns.clear(player.id); indicators.delete(player.id); continue; }
      const state = cooldowns.observe(player.id, heldType(player), system.currentTick);
      const charge = cooldowns.charge(player.id, state.item, system.currentTick, settings.cooldownPercent);
      const previous = indicators.get(player.id);
      if (!settings.showIndicator || !Number.isFinite(state.lastTick) || (charge === 1 && previous === 10)) continue;
      const bars = Math.floor(charge * 10);
      // Yield to combat tags, login notices and other gameplay messages.
      if (actionbarBusy(player.id) || bars === previous) continue;
      actionbar(player, `§7Attack §8[§b${"|".repeat(bars)}§8${"|".repeat(10 - bars)}§8] §f${Math.round(charge * 100)}%`, 150);
      indicators.set(player.id, bars);
    } catch { /* A player can leave while the interval is running. */ }
  }
}, 2);

world.afterEvents.playerLeave.subscribe((ev) => { cooldowns.clear(ev.playerId); indicators.delete(ev.playerId); });
world.afterEvents.entityDie.subscribe((ev) => { cooldowns.clear(ev.deadEntity.id); indicators.delete(ev.deadEntity.id); });
world.afterEvents.playerDimensionChange.subscribe((ev) => { cooldowns.clear(ev.player.id); indicators.delete(ev.player.id); });

registerPlugin({
  id: "javaCombat", name: "Blurry Java Combat", module: "javaCombat", icon: "textures/items/iron_sword",
  desc: "Java-style weapon cooldowns: time attacks for full damage. Includes missed swings and weapon-switch recharge. Requires Beta APIs; Bedrock armor, enchantments and critical hits remain native.",
  fields: (c) => [
    { type: "slider", key: "cooldownPercent", label: "Attack cooldown speed (100 = Java timing; higher = slower)", min: 25, max: 200, step: 5, default: c.javaCombat.cooldownPercent },
    { type: "toggle", key: "showIndicator", label: "Show attack charge in actionbar", default: c.javaCombat.showIndicator },
    { type: "toggle", key: "affectPlayers", label: "Apply cooldown damage to PvP", default: c.javaCombat.affectPlayers },
    { type: "toggle", key: "affectMobs", label: "Apply cooldown damage to mobs", default: c.javaCombat.affectMobs },
  ],
  apply: (c, r) => {
    const percent = Number(r.cooldownPercent);
    Object.assign(c.javaCombat, {
      cooldownPercent: Number.isFinite(percent) ? Math.max(25, Math.min(200, percent)) : 100,
      showIndicator: !!r.showIndicator, affectPlayers: !!r.affectPlayers, affectMobs: !!r.affectMobs,
    });
  },
});
