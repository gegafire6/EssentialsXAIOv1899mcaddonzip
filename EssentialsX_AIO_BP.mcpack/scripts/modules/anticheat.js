// EssentialsX AIO - By Opiar | Anti-Cheat plugin: kill aura, hitbox/reach, fly, speed, x-ray, autoclicker, nuker
import { world, system, GameMode } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod, saveCfg } from "../core/config.js";
import { cmd } from "../core/commands.js";
import { SpectatorBots, SPECTATOR_BOT_TYPE } from "../core/spectator-bots.js";
import { GuardEvidence } from "../core/anticheat-guards.js";
import { isLoggedIn } from "./login.js";
import { registerPlugin } from "../core/plugins.js";
import { msg, ok, err, isAdmin, menu, modal, confirm, now, fmtTime, log, online, broadcast, cmdRun, findPlayer, idByName, tpHooks } from "../core/utils.js";

const CHAT_PREFIX = "§8[§c§lAnticheat§r§8]§r";

const ACTIONS = ["Alert staff only", "Kick", "Temp ban"];
const GROUPS = { celunaSwing: "celuna", celunaMulti: "celuna", scytheWater: "scythe", scytheJump: "scythe" };
const guards = new GuardEvidence();
const spectatorBots = new SpectatorBots(world);
const spectatorNotices = new Map();
const CHECKS = {
  spectatorBot: { label: "Kill Aura: Spectator Bot", desc: "Invisible invulnerable bots: every 20 melee attacks broadcasts a violation to all players. Admin exemption and Survival/Adventure rules apply.", extras: [] },
  celunaSwing: { label: "Celuna: Swing Rate", desc: "Original built-in check: excessive attack swings, including misses (not mining)", extras: [{ key: "maxCps", label: "Max attack swings per second", min: 15, max: 40, step: 1 }] },
  celunaMulti: { label: "Celuna: Multi Target", desc: "Original built-in check: distinct melee targets in one server tick", extras: [{ key: "targets", label: "Distinct targets in one tick", min: 3, max: 8, step: 1 }] },
  scytheWater: { label: "Scythe: Water Walk", desc: "Original built-in check: sustained level movement on open water without swimming", extras: [{ key: "samples", label: "Consecutive ticks on water", min: 20, max: 100, step: 5 }] },
  scytheJump: { label: "Scythe: Air Jump", desc: "Original built-in check: upward impulse after falling without a nearby support block", extras: [] },
  killaura: { label: "Kill Aura", desc: "Hitting behind you / many targets at once", extras: [{ key: "angle", label: "Max attack angle (deg)", min: 60, max: 180, step: 5 }, { key: "multiTargets", label: "Targets within 4 ticks", min: 2, max: 6, step: 1 }] },
  hitbox: { label: "Hitbox / Reach", desc: "Eye-to-hitbox reach over 5 blocks by default (including 6–10+), or off-crosshair hits", extras: [{ key: "reach", label: "Allowed reach (blocks)", min: 5, max: 10, step: 0.1 }, { key: "angle", label: "Max crosshair angle (deg)", min: 20, max: 90, step: 5 }] },
  fly: { label: "Fly", desc: "Survival/Adventure flight mode, unsupported hovering or sustained rising", extras: [] },
  speed: { label: "Speed", desc: "Sustained excess walking/sprinting speed with potion, terrain and impulse grace", extras: [{ key: "limit", label: "Tolerance multiplier vs normal walk/sprint", min: 1.2, max: 5, step: 0.05 }] },
  xray: { label: "X-Ray", desc: "Repeated rare ore veins in darkness with little digging; no torch alone is not proof", extras: [{ key: "minOres", label: "Dark rare ores before check", min: 2, max: 10, step: 1 }, { key: "ratio", label: "Min other blocks per rare ore", min: 4, max: 40, step: 1 }, { key: "minVeins", label: "Separate dark ore veins", min: 2, max: 8, step: 1 }, { key: "darkLevel", label: "Maximum light level for dark mining", min: 0, max: 7, step: 1 }] },
  autoclicker: { label: "Auto Clicker", desc: "13+ observed attack swings per second by default; 1–10 normal, 11–12 tolerance. Uses hit fallback without swing API.", extras: [{ key: "maxCps", label: "Allowed CPS (12 detects 13+)", min: 10, max: 40, step: 1 }] },
  nuker: { label: "Nuker", desc: "Breaking many / far blocks too fast", extras: [{ key: "perSecond", label: "Max blocks per second", min: 6, max: 40, step: 1 }, { key: "reach", label: "Max break reach", min: 5, max: 12, step: 0.5 }] },
};

const live = new Map(); // id -> { check -> { vl, t } }
const lastAlert = new Map();
const state = new Map(); // movement + combat state per player id
let lagUntil = 0;

const st = (p) => {
  let s = state.get(p.id);
  if (!s) { s = { air: 0, rise: 0, flight: 0, fast: 0, moveTick: -1, terrainUntil: -1, hurt: -999, tp: -999, pos: { ...p.location }, hits: [], attackFlag: -Infinity, fallbackHit: -1, targets: [], breaks: [], ore: undefined }; state.set(p.id, s); }
  return s;
};
const tick = () => system.currentTick;
const ac = () => cfg().anticheat;
const on = (name) => mod("anticheat") && (!GROUPS[name] || mod(GROUPS[name])) && ac().checks[name]?.enabled !== false;

function exempt(p) {
  if (ac().exemptAdmins && isAdmin(p)) return true;
  if (ac().lagGuard && tick() < lagUntil) return true;
  return false;
}
function survival(p) {
  try { const g = p.getGameMode(); return g !== GameMode.Creative && g !== GameMode.Spectator; } catch { return true; }
}

// ---------- Flagging & punishment ----------
function alertStaff(text) {
  if (!ac().alertStaff) return;
  for (const o of online()) if (isAdmin(o) && !o.hasTag("essx:ac_mute")) o.sendMessage(text);
}

function flag(p, check, info, amount = 1) {
  const cc = ac().checks[check];
  const rec = live.get(p.id) ?? {};
  const e = rec[check] ?? { vl: 0, t: 0 };
  e.vl += amount; e.t = now();
  rec[check] = e;
  live.set(p.id, rec);

  const db = DB.anticheat.get(p.id, { name: p.name, total: 0, checks: {}, punished: 0, last: 0 });
  db.name = p.name; db.total++; db.checks[check] = (db.checks[check] ?? 0) + 1; db.last = now();
  DB.anticheat.set(p.id, db);

  const label = check === "spectatorBot" ? "Kill Aura" : CHECKS[check].label;
  const alert = `${CHAT_PREFIX} §f${p.name} §eUsing §6${label} §eHacks §8| §7Violation §c${Math.round(e.vl)}/${cc.maxVL}§r`;
  if (check === "spectatorBot") broadcast(alert);

  const key = p.id + check;
  if (!lastAlert.has(key) || tick() - lastAlert.get(key) > 40) {
    lastAlert.set(key, tick());
    if (check !== "spectatorBot") alertStaff(alert);
    log("anticheat", `${p.name} flagged ${CHECKS[check].label} VL ${Math.round(e.vl)}/${cc.maxVL} ${info}`);
  }
  if (e.vl >= cc.maxVL) { e.vl = 0; punish(p, check, cc); }
}

function punish(p, check, cc) {
  if (cc.action === 0) return;
  const label = CHECKS[check].label;
  const reason = `Cheating detected (${label})`;
  const db = DB.anticheat.get(p.id);
  if (db) { db.punished = (db.punished ?? 0) + 1; DB.anticheat.set(p.id, db); }
  if (cc.action === 2) {
    const mins = ac().banMinutes;
    DB.bans.set(p.id, { name: p.name, by: "AntiCheat", reason, at: now(), until: mins ? now() + mins * 60000 : 0 });
    log("ban", `AntiCheat banned ${p.name} (${label})`);
  } else log("kick", `AntiCheat kicked ${p.name} (${label})`);
  const announcement = `${CHAT_PREFIX} §f${p.name} §cwas ${cc.action === 2 ? "banned" : "kicked"} §7for §6${label}§7.§r`;
  if (ac().broadcastPunish) broadcast(announcement);
  else alertStaff(announcement);
  cmdRun(`kick "${p.name}" ${reason}`);
}

// Violation decay
system.runInterval(() => {
  const decay = Math.max(5, ac().decaySec) * 1000;
  for (const [id, rec] of live) {
    for (const k of Object.keys(rec)) {
      if (now() - rec[k].t >= decay) { rec[k].vl = Math.max(0, rec[k].vl - 1); rec[k].t = now(); }
      if (rec[k].vl <= 0) delete rec[k];
    }
    if (!Object.keys(rec).length) live.delete(id);
  }
}, 20);

// ---------- Lag guard ----------
let lastMs = Date.now();
system.runInterval(() => {
  const t = Date.now();
  if (t - lastMs > 150) lagUntil = tick() + 60;
  lastMs = t;
}, 1);

// ---------- Spectator bot followers ----------
// Keep the bot evidence separate from angle/reach checks and their punishments.
system.runInterval(() => spectatorBots.update(online(), on("spectatorBot"), tick()), 1);
world.afterEvents.entityDie.subscribe((ev) => {
  if (ev.deadEntity.typeId === "minecraft:player") {
    spectatorBots.removeOwner(ev.deadEntity.id);
    return;
  }
  spectatorBots.consumeDeath(ev.deadEntity);
});
world.afterEvents.playerLeave.subscribe((ev) => {
  spectatorBots.removeOwner(ev.playerId);
  spectatorNotices.delete(ev.playerId);
});

function spectatorSkipReason(p) {
  if (!on("spectatorBot")) return "Anti-Cheat or the Spectator Bot check is disabled.";
  if (ac().exemptAdmins && isAdmin(p)) return "admin hits are ignored. Turn off Plugins > Anti-Cheat > Configure Settings > Exempt admins to count your hits.";
  if (!survival(p)) return "Creative/Spectator hits are ignored. Use Survival or Adventure.";
  if (!isLoggedIn(p)) return "Log in before testing bot hits.";
  if (ac().lagGuard && tick() < lagUntil) return "Lag guard is pausing detection. Wait for the server to recover.";
  return undefined;
}

function spectatorStatus(p) {
  const reason = spectatorSkipReason(p);
  const follower = spectatorBots.owners.get(p.id);
  const hits = spectatorBots.hits.get(p.id) ?? 0;
  msg(p, `§bSpectator Bot §7| §f${reason ?? "Counting hits; every 20 broadcasts to all players."}`);
  msg(p, `§7Your counted hits: §e${hits}/20 §7| Your follower: §e${follower?.isValid ? "ready" : "unavailable"} §7| Attack swings: §e${world.afterEvents.playerSwingStart ? "available" : "unavailable"}`);
  if (!follower?.isValid && on("spectatorBot")) msg(p, "§eActivate both updated packs and Beta APIs, then check the content log for bot spawn errors.");
}

function spectatorHit(p, target) {
  if (p.typeId !== "minecraft:player" || !target?.isValid ||
      target.typeId !== SPECTATOR_BOT_TYPE || !spectatorBots.entities.has(target.id)) return;
  const reason = spectatorSkipReason(p);
  if (reason) {
    spectatorBots.clearHits(p.id);
    const previous = spectatorNotices.get(p.id);
    if (!previous || previous.reason !== reason || tick() - previous.tick >= 200) {
      spectatorNotices.set(p.id, { reason, tick: tick() });
      p.sendMessage("§eSpectator Bot: " + reason + " Partial hits reset.");
    }
    return;
  }
  spectatorNotices.delete(p.id);
  if (spectatorBots.recordHit(p.id, target, tick())) flag(p, "spectatorBot", "20 melee attacks on spectator bots");
}

// ---------- Combat checks ----------
// Distance to the nearest point of the collision box, not its center.
function meleeReach(head, target) {
  try {
    let box;
    if (typeof target.getAABB === "function") box = target.getAABB();
    else if (target.typeId === "minecraft:player") {
      box = { center: { x: target.location.x, y: target.location.y + 0.9, z: target.location.z }, extent: { x: 0.3, y: 0.9, z: 0.3 } };
    }
    if (!box) return undefined;
    const distances = ["x", "y", "z"].map(axis => Math.max(0, Math.abs(head[axis] - box.center[axis]) - Math.abs(box.extent[axis])));
    return distances.every(Number.isFinite) ? Math.hypot(...distances) : undefined;
  } catch { return undefined; }
}

function countAttack(p) {
  const s = st(p), t = tick();
  if (!on("autoclicker") || exempt(p) || !survival(p) || !isLoggedIn(p)) {
    s.hits = []; s.attackFlag = -Infinity; return;
  }
  s.hits = s.hits.filter(at => t - at < 20 && t >= at);
  s.hits.push(t);
  // Keep the sliding window, but flag at most once per second.
  if (s.hits.length > ac().checks.autoclicker.maxCps && t - s.attackFlag >= 20) {
    s.attackFlag = t;
    flag(p, "autoclicker", `${s.hits.length} observed attacks in 20 ticks`);
  }
}

const BIG = /ender_dragon|ghast|giant|warden|ravager|iron_golem|elder_guardian|wither|hoglin|zoglin|boat|minecart/;
world.afterEvents.entityHitEntity.subscribe((ev) => {
  const p = ev.damagingEntity, t = ev.hitEntity;
  if (t?.typeId === SPECTATOR_BOT_TYPE) {
    spectatorHit(p, t);
    return;
  }
  if (!mod("anticheat") || p.typeId !== "minecraft:player" || !t?.isValid || exempt(p)) return;
  if (!survival(p) || !isLoggedIn(p)) return;
  const s = st(p);
  // A mace Wind Burst hit can launch the attacker without hurting them.
  s.guardImpulseUntil = tick() + 20;
  try {
    const held = p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex);
    if (held?.typeId === "minecraft:mace" && held.getComponent("minecraft:enchantable")?.getEnchantment("wind_burst")) s.nativeImpulseUntil = tick() + 40;
  } catch {}
  const n = now();
  if (on("celunaMulti") && isLoggedIn(p) && guards.target(p.id, tick(), t.id, ac().checks.celunaMulti.targets)) {
    flag(p, "celunaMulti", "multiple distinct targets in one tick");
  }

  // One source per attack: the swing event includes misses and avoids hit/swing duplicates.
  if (!world.afterEvents.playerSwingStart && s.fallbackHit !== tick()) {
    s.fallbackHit = tick();
    countAttack(p);
  }

  const head = p.getHeadLocation();
  const v = { x: t.location.x - head.x, y: t.location.y + 0.9 - head.y, z: t.location.z - head.z };
  const d = Math.hypot(v.x, v.y, v.z);
  if (d > 0.1 && !BIG.test(t.typeId)) {
    const dir = p.getViewDirection();
    const angle = (Math.acos(Math.max(-1, Math.min(1, (dir.x * v.x + dir.y * v.y + dir.z * v.z) / d))) * 180) / Math.PI;
    if (on("killaura") && d > 1.5 && angle > ac().checks.killaura.angle) flag(p, "killaura", `angle ${angle.toFixed(0)}° dist ${d.toFixed(1)}`, 2);
    if (on("hitbox")) {
      const h = ac().checks.hitbox;
      const reach = meleeReach(head, t);
      if (reach !== undefined && reach > h.reach + 0.001) flag(p, "hitbox", `reach ${reach.toFixed(2)} blocks (allowed ${h.reach})`);
      else if (d > 3 && angle > h.angle) flag(p, "hitbox", `off-crosshair ${angle.toFixed(0)}° at ${d.toFixed(1)}`);
    }
  }
  if (on("killaura")) {
    const tk = tick();
    s.targets.push({ tk, id: t.id });
    s.targets = s.targets.filter((x) => tk - x.tk <= 4);
    const distinct = new Set(s.targets.map((x) => x.id)).size;
    if (distinct >= ac().checks.killaura.multiTargets) { flag(p, "killaura", `${distinct} targets in 4 ticks`, 2); s.targets = []; }
  }
});

// Count attack animations, including misses; do not count mining or item-use animations.
world.afterEvents.playerSwingStart?.subscribe(({ player: p, swingSource }) => {
  // Damage immunity can suppress the melee-hit notification. Count an Attack
  // swing only when its nearest unobstructed target is a tracked bot. Both event
  // paths share tick deduplication, including the hit that produces a warning.
  if (swingSource === "Attack" && on("spectatorBot")) {
    const target = spectatorBots.targetFromView(p);
    if (target) { spectatorHit(p, target); return; }
  }
  if (swingSource !== "Attack") return;
  countAttack(p);
  if (!on("celunaSwing") || exempt(p) || !survival(p) || !isLoggedIn(p)) { guards.clear(p.id); return; }
  if (guards.swing(p.id, tick(), ac().checks.celunaSwing.maxCps)) flag(p, "celunaSwing", "excessive attack swings in 20 ticks");
});

world.afterEvents.entityHurt.subscribe((ev) => {
  const e = ev.hurtEntity;
  if (e.typeId === "minecraft:player") { st(e).hurt = tick(); guards.clear(e.id); }
});
function resetPositionEvidence(p) {
  state.delete(p.id);
  st(p).tp = tick();
  guards.clear(p.id);
}
world.afterEvents.playerDimensionChange.subscribe((ev) => resetPositionEvidence(ev.player));
tpHooks.afterTeleport.push(resetPositionEvidence);

// Artifact dash grants a short movement grace without changing potion effects.
export function allowArtifactImpulse(p) {
  const s = st(p);
  s.nativeImpulseUntil = Math.max(s.nativeImpulseUntil ?? 0, tick() + 20);
  guards.clear(p.id);
}

// ---------- Movement checks ----------
const NO_FLY_EFFECTS = ["levitation", "slow_falling", "jump_boost"];
function hasAny(p, list) { for (const k of list) { try { if (p.getEffect(k)) return true; } catch {} } return false; }
function blockBelow(p, depth) {
  try {
    const { x, y, z } = p.location;
    for (let i = 1; i <= depth; i++) {
      const b = p.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y) - i, z: Math.floor(z) });
      if (b && !b.isAir && !b.isLiquid) return b;
    }
  } catch {}
  return undefined;
}

// Unknown/unloaded blocks and nearby liquid or solid support cannot prove an air jump.
function clearBelow(p) {
  try {
    const { x, y, z } = p.location;
    const head = p.getHeadLocation();
    if (!p.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) })?.isAir ||
        !p.dimension.getBlock({ x: Math.floor(head.x), y: Math.floor(head.y), z: Math.floor(head.z) })?.isAir) return false;
    for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const b = p.dimension.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y) - dy, z: Math.floor(z) + dz });
      if (!b?.isAir) return false;
    }
    return true;
  } catch { return false; }
}

system.runInterval(() => {
  if (!mod("anticheat")) { guards.reset(); state.clear(); return; }
  for (const p of online()) {
    const s = st(p);
    const pos = p.location;
    const consecutive = tick() === s.moveTick + 1;
    const moved = consecutive ? Math.hypot(pos.x - s.pos.x, pos.z - s.pos.z) : 0;
    if ((pos.x - s.pos.x) ** 2 + (pos.y - s.pos.y) ** 2 + (pos.z - s.pos.z) ** 2 > 64) s.tp = tick();
    s.pos = { ...pos }; s.moveTick = tick();
    if (!consecutive) s.fast = s.air = s.rise = s.flight = 0;
    if (exempt(p) || !survival(p) || !isLoggedIn(p)) { s.air = s.rise = s.flight = s.fast = 0; guards.clear(p.id); continue; }
    const recent = tick() - s.hurt < 40 || tick() - s.tp < 40;
    let riding = false;
    try { riding = !!p.getComponent("minecraft:riding")?.entityRidingOn; } catch {}
    const impulse = tick() < (s.nativeImpulseUntil ?? 0);
    const special = p.isGliding || p.isInWater || p.isSwimming || p.isClimbing || riding || recent || impulse || p.isSleeping || hasAny(p, NO_FLY_EFFECTS);
    const vel = p.getVelocity();

    // Scythe group: sustained movement evidence; the existing protections remain shared.
    if ((!on("scytheWater") && !on("scytheJump")) || special || p.isFlying || tick() < (s.guardImpulseUntil ?? 0)) {
      // Keep combat windows intact; reset only the movement evidence.
      const g = guards.state(p.id); g.water = 0; g.movementTick = -1;
    } else {
      let water = false;
      if (on("scytheWater") && Math.abs(vel.y) < 0.01 && Math.hypot(vel.x, vel.z) > 0.06) try {
        const { x, y, z } = pos;
        const feet = p.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
        const below = p.dimension.getBlock({ x: Math.floor(x), y: Math.floor(y - 0.2), z: Math.floor(z) });
        // Nearby ledges, lily pads and other solid support invalidate water-walk evidence.
        let open = true;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const b = p.dimension.getBlock({ x: Math.floor(x) + dx, y: Math.floor(y - 0.2), z: Math.floor(z) + dz });
          if (!b || (!b.isAir && !b.isLiquid)) open = false;
        }
        water = open && feet?.isAir && below?.typeId === "minecraft:water" && Math.abs(vel.y) < 0.01 && Math.hypot(vel.x, vel.z) > 0.06;
      } catch { /* Unloaded terrain is not evidence. */ }
      const evidence = guards.movement(p.id, tick(), vel.y, on("scytheWater") && water,
        on("scytheJump") && vel.y > 0.3 && !p.isOnGround && clearBelow(p), ac().checks.scytheWater.samples);
      if (evidence.water) flag(p, "scytheWater", "sustained level movement above open water");
      if (evidence.jump) flag(p, "scytheJump", "falling changed to upward motion without nearby support");
    }

    // Fly: an airborne Survival/Adventure flight bit is evidence, not an exemption.
    if (!on("fly") || p.isOnGround || special) { s.air = s.rise = s.flight = 0; }
    else {
      s.air++;
      s.flight = p.isFlying ? s.flight + 1 : 0;
      s.rise = vel.y > 0.04 ? s.rise + 1 : 0;
      if (s.flight >= 10) {
        flag(p, "fly", "unauthorized flight mode for 10 ticks"); s.flight = 0;
      } else if (s.air > 25 && Math.abs(vel.y) < 0.03 && s.air % 10 === 0 && clearBelow(p)) {
        flag(p, "fly", `unsupported hovering ${s.air} ticks`);
      } else if (s.rise > 14 && clearBelow(p)) {
        flag(p, "fly", `unsupported rising ${s.rise} ticks`, 2); s.rise = 0;
      }
    }

    // Speed: use the relevant walk/sprint baseline plus sustained samples.
    const below = blockBelow(p, 1);
    let boostedTerrain = below && /^minecraft:(?:ice|blue_ice|packed_ice|frosted_ice)$/.test(below.typeId);
    if (below && /^minecraft:soul_(?:sand|soil)$/.test(below.typeId)) {
      try {
        const boots = p.getComponent("minecraft:equippable")?.getEquipment("Feet");
        boostedTerrain = !!boots?.getComponent("minecraft:enchantable")?.getEnchantment("soul_speed");
      } catch { boostedTerrain = true; }
    }
    if (boostedTerrain) s.terrainUntil = tick() + 40;
    let terrainLoaded = false;
    try { terrainLoaded = !!p.dimension.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }); } catch {}
    if (!on("speed") || special || p.isFlying || !terrainLoaded || tick() < s.terrainUntil) { s.fast = 0; continue; }
    let mul = 1;
    try { const e = p.getEffect("speed"); if (e) mul += 0.2 * (e.amplifier + 1); } catch {}
    // Airborne sprint jumps retain the sprint baseline even if the sprint bit flickers.
    const baseline = p.isSprinting || !p.isOnGround ? 0.2806 : 0.21585;
    const limit = baseline * ac().checks.speed.limit * mul;
    const h = Math.max(Math.hypot(vel.x, vel.z), moved);
    s.fast = h > limit ? s.fast + 1 : 0;
    if (s.fast >= 6) { flag(p, "speed", `${(h * 20).toFixed(1)} b/s (limit ${(limit * 20).toFixed(1)}, ${p.isSprinting ? "sprint" : "walk"})`); s.fast = 0; }
  }
}, 1);

// ---------- Block checks ----------
function darkMining(p, block, maxLight) {
  if (hasAny(p, ["night_vision"])) return false;
  try {
    const head = p.getHeadLocation();
    const eyeBlock = p.dimension.getBlock({ x: Math.floor(head.x), y: Math.floor(head.y), z: Math.floor(head.z) });
    const levels = [block.getLightLevel?.(), eyeBlock?.getLightLevel?.()];
    // Unknown/unloaded/unsupported lighting cannot establish darkness.
    return levels.every(level => Number.isFinite(level) && level >= 0 && level <= maxLight);
  } catch { return false; }
}

const RARE = /^minecraft:(?:deepslate_)?(?:diamond_ore|emerald_ore)$|^minecraft:ancient_debris$/;
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const p = ev.player;
  if (!mod("anticheat") || exempt(p) || !survival(p) || !isLoggedIn(p)) return;
  const s = st(p);
  const n = now();
  const id = ev.brokenBlockPermutation.type.id;

  if (on("nuker")) {
    const c = ac().checks.nuker;
    s.breaks.push(n);
    while (s.breaks.length && n - s.breaks[0] > 1000) s.breaks.shift();
    const h = p.getHeadLocation(), b = ev.block.location;
    const d = Math.hypot(h.x - (b.x + 0.5), h.y - (b.y + 0.5), h.z - (b.z + 0.5));
    if (d > c.reach) flag(p, "nuker", `reach ${d.toFixed(1)}`);
    if (s.breaks.length > c.perSecond) { flag(p, "nuker", `${s.breaks.length} blocks/s`); s.breaks = []; }
  }

  if (on("xray") && ev.block.location.y <= 48) {
    // A bounded session window; light level includes torches, lanterns and daylight.
    if (!s.ore || n - s.ore.start > 90000) s.ore = { rare: 0, dark: 0, other: 0, veins: [], start: n };
    const x = s.ore;
    if (RARE.test(id)) {
      x.rare++;
      const c = ac().checks.xray;
      if (darkMining(p, ev.block, c.darkLevel)) {
        x.dark++;
        const location = ev.block.location;
        if (x.veins.every(v => (v.x-location.x) ** 2 + (v.y-location.y) ** 2 + (v.z-location.z) ** 2 > 64)) x.veins.push({ ...location });
      }
      if (x.dark >= c.minOres && x.veins.length >= c.minVeins && x.other / x.rare < c.ratio) {
        flag(p, "xray", `${x.dark} dark rare ores in ${x.veins.length} separate veins; ${x.other} other blocks in 90 seconds`);
        s.ore = undefined;
      }
    } else x.other++;
  }
});

world.beforeEvents.playerLeave.subscribe((ev) => { state.delete(ev.player.id); live.delete(ev.player.id); guards.clear(ev.player.id);
  for (const key of lastAlert.keys()) if (key.startsWith(ev.player.id)) lastAlert.delete(key); });
world.afterEvents.playerSpawn.subscribe((ev) => resetPositionEvidence(ev.player));

// ---------- UI ----------
function vlText(id) {
  const rec = live.get(id);
  if (!rec) return "§7none";
  return Object.entries(rec).map(([k, v]) => `§c${CHECKS[k].label} §f${Math.round(v.vl)}`).join("§7, ");
}

async function recordsUI(p) {
  const list = DB.anticheat.entries().sort((a, b) => b[1].last - a[1].last).slice(0, 30);
  if (!list.length) return err(p, "No violations recorded yet.");
  await menu(p, "§lPlayer Records", "§7Most recent offenders.", list.map(([id, r]) => ({ text: `§l${r.name}\n§r§c${r.total} flags §8| §7${fmtTime(now() - r.last)} ago`, icon: "textures/ui/icon_steve", id, r })))
    .then(async (b) => { if (b?.r) await recordDetail(p, b.id, b.r); });
}
async function recordDetail(p, id, r) {
  const lines = Object.entries(r.checks).map(([k, n]) => `§7${CHECKS[k]?.label ?? k}: §c${n}`).join("\n");
  await menu(p, "§l" + r.name, `§7Total flags: §c${r.total}\n§7Punishments: §e${r.punished ?? 0}\n§7Live VL: ${vlText(id)}\n\n${lines}`, [
    { text: "§l§cClear Record", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Clear", `Clear anti-cheat record of ${r.name}?`)) { DB.anticheat.delete(id); live.delete(id); spectatorBots.clearHits(id); ok(p, "Cleared."); } } },
  ]);
}
async function alertsUI(p) {
  const l = DB.logs.data.list.filter((x) => x.type === "anticheat").slice(-40).reverse();
  const body = l.map((x) => `§8${fmtTime(now() - x.t)} ago §f${x.text}`).join("\n") || "§7No alerts yet.";
  await menu(p, "§lRecent Alerts", body, [{ text: "§lBack", icon: "textures/ui/essx/icons/back" }]);
}
async function checkUI(p, name) {
  const c = ac().checks[name];
  const def = CHECKS[name];
  const fields = [
    { type: "label", label: "§7" + def.desc },
    { type: "toggle", key: "enabled", label: "Enabled", default: c.enabled !== false },
    { type: "dropdown", key: "action", label: "Punishment at max VL", options: ACTIONS, default: c.action },
    { type: "slider", key: "maxVL", label: "Max violation level", min: 1, max: 30, step: 1, default: c.maxVL },
    ...def.extras.map((e) => ({ type: "slider", key: e.key, label: e.label, min: e.min, max: e.max, step: e.step, default: Math.min(e.max, Math.max(e.min, c[e.key])) })),
  ];
  const r = await modal(p, "§l" + def.label, fields, "Save");
  if (!r) return;
  Object.assign(c, r);
  saveCfg();
  ok(p, `${def.label} saved.`);
}
async function checksUI(p, group) {
  const buttons = Object.entries(CHECKS).filter(([k]) => !group || GROUPS[k] === group).map(([k, d]) => {
    const c = ac().checks[k];
    return { text: `§l${d.label}\n§r${c.enabled !== false ? "§aON" : "§cOFF"} §8| §7${ACTIONS[c.action]} @ VL ${c.maxVL}`, icon: "textures/ui/essx/icons/settings", run: () => checkUI(p, k).then(() => checksUI(p, group)) };
  });
  await menu(p, "§lAnti-Cheat Checks", "§7Select a check to configure.", buttons);
}
async function onlineUI(p) {
  const list = online().map((o) => ({ text: `§l${o.name}\n§r§7VL: ${vlText(o.id)}`, icon: "textures/ui/icon_steve" }));
  await menu(p, "§lLive Violation Levels", "§7Online players.", list);
}
async function acUI(p) {
  const muted = p.hasTag("essx:ac_mute");
  await menu(p, "§lAnti-Cheat", `§7Flags recorded: §e${DB.anticheat.keys().length} players\n§7Your alerts: ${muted ? "§cOFF" : "§aON"}`, [
    { text: "§l§eConfigure Checks\n§r§8Kill aura, fly, x-ray...", icon: "textures/ui/essx/icons/settings", run: () => checksUI(p) },
    { text: "§l§cRecent Alerts", icon: "textures/items/book_normal", run: () => alertsUI(p) },
    { text: "§l§6Player Records", icon: "textures/ui/icon_steve", run: () => recordsUI(p) },
    { text: "§l§bLive Violation Levels", icon: "textures/ui/icon_steve", run: () => onlineUI(p) },
    { text: "§l§bSpectator Bot Status", icon: "textures/ui/essx/icons/flag", run: () => spectatorStatus(p) },
    { icon: "textures/ui/essx/icons/flag", text: `§l§dToggle My Alerts §r§8(${muted ? "off" : "on"})`, run: () => toggleAlerts(p) },
  ]);
}
function toggleAlerts(p) {
  if (p.hasTag("essx:ac_mute")) { p.removeTag("essx:ac_mute"); ok(p, "Anti-cheat alerts enabled."); }
  else { p.addTag("essx:ac_mute"); msg(p, "§eAnti-cheat alerts muted for you."); }
}

cmd({
  name: "anticheat", aliases: ["ac"], admin: true, desc: "Anti-cheat panel", usage: "[bot|alerts|vl <player>|clear <player>]",
  run: async (p, a) => {
    const sub = (a[0] ?? "").toLowerCase();
    if (sub === "bot") return spectatorStatus(p);
    if (sub === "alerts") return toggleAlerts(p);
    if (sub === "vl" && a[1]) {
      const id = idByName(a[1]); const r = id && DB.anticheat.get(id);
      return r ? msg(p, `§f${r.name}: §c${r.total} flags §7| live: ${vlText(id)}`) : err(p, "No record for that player.");
    }
    if (sub === "clear" && a[1]) {
      const id = idByName(a[1]);
      if (!id) return err(p, "Unknown player.");
      DB.anticheat.delete(id); live.delete(id); spectatorBots.clearHits(id); return ok(p, "Record cleared.");
    }
    return acUI(p);
  },
});

registerPlugin({
  id: "anticheat", name: "Anti-Cheat", module: "anticheat", icon: "textures/ui/hammer_l",
  desc: "Base anti-cheat plus original Celuna combat and Scythe movement groups. New checks default to staff alerts; configure limits per check.",
  fields: (c) => [
    { type: "toggle", key: "exemptAdmins", label: "Exempt admins", default: c.anticheat.exemptAdmins },
    { type: "toggle", key: "alertStaff", label: "Send alerts to staff chat", default: c.anticheat.alertStaff },
    { type: "toggle", key: "broadcastPunish", label: "Broadcast kicks/bans to everyone", default: c.anticheat.broadcastPunish },
    { type: "toggle", key: "lagGuard", label: "Lag guard (pause checks when server lags)", default: c.anticheat.lagGuard },
    { type: "slider", key: "decaySec", label: "Violation decay (seconds per 1 VL)", min: 5, max: 300, step: 5, default: c.anticheat.decaySec },
    { type: "slider", key: "banMinutes", label: "Temp ban length (minutes, 0 = permanent)", min: 0, max: 10080, step: 10, default: c.anticheat.banMinutes },
  ],
  apply: (c, r) => Object.assign(c.anticheat, r),
  actions: [
    { text: "§l§eConfigure Checks\n§r§8Per-check punishment & limits", icon: "textures/ui/essx/icons/settings", run: checksUI },
    { text: "§l§cRecent Alerts", icon: "textures/items/book_normal", run: alertsUI },
    { text: "§l§6Player Records", icon: "textures/ui/icon_steve", run: recordsUI },
    { text: "§l§bLive Violation Levels", icon: "textures/ui/icon_steve", run: onlineUI },
    { text: "§l§bSpectator Bot Status", icon: "textures/ui/essx/icons/flag", run: spectatorStatus },
  ],
});

for (const [id, name, desc] of [
  ["celuna", "Celuna AntiCheat (Built-in)", "Original EssentialsX combat checks: missed attack swing rate and same-tick multi-target hits. Not the official Celuna addon. Requires the Anti-Cheat plugin."],
  ["scythe", "Scythe AntiCheat (Built-in)", "Original EssentialsX movement checks: sustained water walking and unsupported air jumps. Not the official Scythe addon. Requires the Anti-Cheat plugin."],
]) registerPlugin({
  id, name, module: id, icon: "textures/ui/hammer_l", desc,
  actions: [{ text: "§lConfigure Group Checks", icon: "textures/ui/essx/icons/settings", run: (p) => checksUI(p, id) }],
});
