// EssentialsX AIO - By Opiar | Optional gameplay plugins
import { world, system, GameMode } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod, saveCfg } from "../core/config.js";
import { cmd, addMember } from "../core/commands.js";
import { registerPlugin } from "../core/plugins.js";
import { online, isAdmin, menu, modal, pickPlayer, ok, err, msg, cur, nameOf, log } from "../core/utils.js";
import { addBal, takeBal } from "./economy.js";
import { isLoggedIn } from "./login.js";

const integer = (value, min, max, fallback) => Math.min(max, Math.max(min, Math.floor(Number.isFinite(Number(value)) ? Number(value) : fallback)));
const data = (id) => DB.gameplay.get(id, {});
const save = (id, value) => DB.gameplay.set(id, value);
const activePlayer = (p) => {
  if (!isLoggedIn(p)) return false;
  try { return ![GameMode.Creative, GameMode.Spectator].includes(p.getGameMode()); } catch { return false; }
};
const healthConfig = () => {
  const c = cfg().lifesteal;
  const min = integer(c.minHearts, 2, 40, 5);
  const max = integer(c.maxHearts, min, 40, 20);
  return { min, max, start: integer(c.startingHearts, min, max, 10), transfer: integer(c.transfer, 1, 5, 1) };
};
function hearts(id) {
  const c = healthConfig();
  return integer(data(id).hearts ?? c.start, c.min, c.max, c.start);
}
function setHearts(id, value) { const d = data(id); d.hearts = value; save(id, d); }
const applied = new Map();
function applyHearts(p, respawn = false) {
  const enabled = mod("lifesteal");
  // The persistent flag also cleans up health groups after a script/world reload.
  if (!enabled && !p.getDynamicProperty("essx:lifesteal_applied")) { applied.delete(p.id); return; }
  const target = enabled ? hearts(p.id) : 10;
  const key = enabled ? target : "reset";
  if (!respawn && applied.get(p.id) === key) return;
  const health = p.getComponent("minecraft:health");
  if (!health || health.currentValue <= 0) return;
  const current = health.currentValue;
  p.triggerEvent(enabled ? `essx:hearts_${target}` : "essx:hearts_reset");
  // Component changes can refill health: retain current HP except on respawn.
  system.run(() => {
    try {
      const updated = p.getComponent("minecraft:health");
      if (updated.currentValue > 0) updated.setCurrentValue(Math.min(respawn ? target * 2 : current, updated.effectiveMax));
    } catch (e) { console.warn("[EssX] Lifesteal current health: " + e); }
  });
  p.setDynamicProperty("essx:lifesteal_applied", enabled || undefined);
  applied.set(p.id, key);
}
function allowedKill(k, v, feature, seconds) {
  const d = data(k.id), now = Date.now();
  const windowMs = integer(seconds, 0, 3600, 300) * 1000;
  const recent = d.recent?.[feature] ?? {};
  if (recent[v.id] !== undefined && now - recent[v.id] < windowMs) return false;
  const fresh = Object.fromEntries(Object.entries(recent).filter(([, time]) => now - time < windowMs));
  fresh[v.id] = now;
  d.recent = { ...d.recent, [feature]: fresh };
  save(k.id, d);
  return true;
}

world.afterEvents.entityDie.subscribe((ev) => {
  const victim = ev.deadEntity;
  if (victim.typeId !== "minecraft:player") return;
  // Any death ends a streak, including environmental deaths. Existing stats are untouched.
  const dead = data(victim.id);
  if (mod("killstreak") && dead.streak) { dead.streak = 0; save(victim.id, dead); }
  applied.delete(victim.id);
  const killer = ev.damageSource?.damagingEntity;
  if (killer?.typeId !== "minecraft:player" || killer.id === victim.id || !activePlayer(killer) || !activePlayer(victim)) return;
  if (mod("lifesteal")) {
    const c = healthConfig(), from = hearts(victim.id), to = hearts(killer.id);
    const amount = Math.min(c.transfer, from - c.min, c.max - to);
    if (amount > 0 && allowedKill(killer, victim, "lifesteal", cfg().lifesteal.cooldownSec)) {
      setHearts(victim.id, from - amount); setHearts(killer.id, to + amount);
      try { applyHearts(killer); } catch (e) { console.warn("[EssX] Lifesteal health: " + e); }
      ok(killer, `Lifesteal: +${amount} heart(s). Maximum: ${to + amount}.`);
      msg(victim, `§cLifesteal: -${amount} heart(s). Maximum: ${from - amount}.`);
    }
  }
  if (mod("bounty") && mod("economy")) {
    const d = data(victim.id), amount = d.bounty ?? 0;
    if (amount > 0) {
      // Clear the funded pot before paying; there is no minted bounty reward.
      d.bounty = 0; save(victim.id, d); addBal(killer.id, amount);
      const text = `§6Bounty claimed! §e${killer.name} §fearned §a${cur(amount)} §ffor defeating §e${victim.name}§f.`;
      if (cfg().bounty.announce) world.sendMessage(text); else msg(killer, text);
      log("eco", `${killer.name} claimed ${amount} bounty on ${victim.name}`);
    }
  }
  if (mod("killstreak") && allowedKill(killer, victim, "killstreak", cfg().killstreak.cooldownSec)) {
    const d = data(killer.id), c = cfg().killstreak;
    d.streak = (d.streak ?? 0) + 1; save(killer.id, d);
    const every = integer(c.everyKills, 2, 50, 3);
    if (d.streak % every === 0) {
      const amount = Math.min(integer(c.maxReward, 0, 1000000, 1000), Math.floor(d.streak / every) * integer(c.reward, 0, 100000, 100));
      if (mod("economy") && amount > 0) addBal(killer.id, amount);
      const text = `§cKill Streak! §e${killer.name} §fhas §c${d.streak} §fkills${mod("economy") && amount > 0 ? ` §8| §a+${cur(amount)}` : ""}.`;
      if (c.announce) world.sendMessage(text); else msg(killer, text);
    }
  }
});
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  applied.delete(player.id);
  system.runTimeout(() => { try { applyHearts(player, !initialSpawn); } catch (e) { console.warn("[EssX] Lifesteal spawn: " + e); } }, 1);
});

async function heartEditor(p) {
  if (!isAdmin(p)) return err(p, "You don't have permission.");
  const t = await pickPlayer(p, "Lifesteal - Player", true);
  if (!t) return;
  const c = healthConfig();
  const r = await modal(p, "Set Hearts - " + t.name, [
    { type: "text", key: "hearts", label: `Maximum hearts (${c.min}-${c.max}; starting value resets this player)`, default: hearts(t.id) },
  ]);
  if (!r) return;
  if (!Number.isInteger(Number(r.hearts)) || Number(r.hearts) < c.min || Number(r.hearts) > c.max) return err(p, "Enter whole hearts within the configured limits.");
  setHearts(t.id, Number(r.hearts)); applied.delete(t.id);
  applyHearts(t); ok(p, `${t.name}: ${hearts(t.id)} hearts saved.`);
  log("admin", `${p.name} set Lifesteal hearts for ${t.name} to ${hearts(t.id)}`);
}
cmd({ name: "hearts", module: "lifesteal", desc: "View your Lifesteal hearts", run: (p) => msg(p, `§cLifesteal §8| §fMaximum hearts: §c${hearts(p.id)}`) });

async function bountyBoard(p) {
  if (!mod("bounty")) return err(p, "Combat Bounty is disabled.");
  if (!mod("economy")) return err(p, "Enable Economy to use Combat Bounty. Existing pots are preserved.");
  const pots = DB.gameplay.entries().filter(([, d]) => d.bounty > 0).sort((a, b) => b[1].bounty - a[1].bounty);
  return menu(p, "§6Combat Bounty", pots.slice(0, 20).map(([id, d]) => `§e${nameOf(id)} §8- §a${cur(d.bounty)}`).join("\n") || "§7No active bounties.", [
    { text: "§l§6Place a Bounty", icon: "textures/items/gold_ingot", run: async () => {
      const t = await pickPlayer(p, "Bounty - Target"); if (!t || t.id === p.id) return;
      const r = await modal(p, "Bounty on " + t.name, [{ type: "text", key: "amount", label: "Amount paid from your balance", default: cfg().bounty.minAmount }]);
      if (!r) return;
      const amount = Number(r.amount), c = cfg().bounty;
      if (!Number.isSafeInteger(amount) || amount < c.minAmount || amount > c.maxAmount) return err(p, `Enter a whole amount from ${c.minAmount} to ${c.maxAmount}.`);
      // Recheck after awaiting forms: settings may have changed in the meantime.
      if (!mod("bounty") || !mod("economy") || !isLoggedIn(p)) return err(p, "Bounty is unavailable.");
      const d = data(t.id);
      if (!Number.isSafeInteger((d.bounty ?? 0) + amount)) return err(p, "Bounty limit reached.");
      if (!takeBal(p.id, amount)) return err(p, "Not enough money.");
      d.bounty = (d.bounty ?? 0) + amount; save(t.id, d);
      ok(p, `Placed ${cur(amount)} on ${t.name}. Total: ${cur(d.bounty)}.`);
      log("eco", `${p.name} funded ${amount} bounty on ${t.name}`);
    } },
  ]);
}
cmd({ name: "bounty", module: "bounty", desc: "Fund and view player bounties", run: bountyBoard });
addMember({ text: "§l§6Combat Bounty\n§r§8Fund & claim player bounties", icon: "textures/ui/essx/icons/bounty", module: "bounty", category: "games", run: bountyBoard });

// Rescue only to a checked two-block air space above a safe solid floor.
const ground = new Map(), rescued = new Map(), rescueWarning = new Set();
function safeAt(dim, pos) {
  try {
    const floor = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y) - 1, z: Math.floor(pos.z) });
    const feet = dim.getBlock(pos), head = dim.getBlock({ ...pos, y: pos.y + 1 });
    return !!floor?.isSolid && !/magma|cactus|campfire|fire|lava|powder_snow/.test(floor.typeId) && feet?.isAir && head?.isAir;
  } catch { return false; }
}
function antiVoidTick(p) {
  if (!mod("antivoid") || !activePlayer(p)) { ground.delete(p.id); return; }
  const dim = p.dimension, pos = p.location;
  const min = dim.heightRange.min;
  if (p.isOnGround && safeAt(dim, pos)) {
    ground.set(p.id, { ...pos, dim: dim.id }); rescueWarning.delete(p.id);
  }
  if (pos.y >= min - integer(cfg().antivoid.margin, 1, 16, 4)) return;
  if (Date.now() - (rescued.get(p.id) ?? 0) < integer(cfg().antivoid.cooldownSec, 1, 60, 10) * 1000) return;
  const targets = [ground.get(p.id), cfg().antivoid.rescuePoints[dim.id]];
  const target = targets.find((t) => t && t.dim === dim.id && safeAt(dim, t));
  if (!target) {
    if (!rescueWarning.has(p.id)) { rescueWarning.add(p.id); err(p, "Anti-Void: no safe ground recorded. Ask an admin to set a rescue point in this dimension."); }
    return;
  }
  p.teleport({ x: target.x, y: target.y, z: target.z }, { dimension: dim });
  // Brief resistance covers residual fall damage; no global damage rule is changed.
  p.addEffect("resistance", 40, { amplifier: 4, showParticles: false });
  rescued.set(p.id, Date.now()); ok(p, "Anti-Void returned you to safe ground.");
}

const votes = new Set(); let voteStarted = 0, voteDay;
const voters = () => online().filter(activePlayer);
const isNight = () => { const time = world.getTimeOfDay(); return time >= 12542 && time < 23460; };
function clearVotes() { votes.clear(); voteStarted = 0; voteDay = undefined; }
function updateVotes() {
  if (!mod("nightvote")) { clearVotes(); return; }
  if (!isNight() || (voteDay !== undefined && voteDay !== world.getDay()) || (voteStarted && Date.now() - voteStarted >= integer(cfg().nightvote.timeoutSec, 30, 600, 120) * 1000)) { clearVotes(); return; }
  const eligible = voters(), ids = new Set(eligible.map((p) => p.id));
  for (const id of votes) if (!ids.has(id)) votes.delete(id);
  const required = Math.max(integer(cfg().nightvote.minPlayers, 1, 100, 1), Math.ceil(eligible.length * integer(cfg().nightvote.percent, 10, 100, 50) / 100));
  if (votes.size > 0 && votes.size >= required) {
    world.setTimeOfDay(0); clearVotes(); world.sendMessage("§bNight Vote §8» §aVote passed. Good morning!");
  }
}
function nightVote(p) {
  if (!mod("nightvote") || !activePlayer(p)) return err(p, "Night Vote requires a logged-in Survival or Adventure player.");
  updateVotes();
  if (!isNight()) return err(p, "You can vote during the night.");
  if (votes.has(p.id)) return err(p, "You already voted this night.");
  if (!voteStarted) { voteStarted = Date.now(); voteDay = world.getDay(); }
  votes.add(p.id);
  const required = Math.max(integer(cfg().nightvote.minPlayers, 1, 100, 1), Math.ceil(voters().length * integer(cfg().nightvote.percent, 10, 100, 50) / 100));
  world.sendMessage(`§bNight Vote §8» §e${p.name} §fvoted §a${votes.size}/${required}§f. Use §b${cfg().prefix}nightvote§f.`);
  updateVotes();
}
cmd({ name: "nightvote", module: "nightvote", desc: "Vote to skip the current night", run: nightVote });
addMember({ text: "§l§bNight Vote\n§r§8Vote for morning", icon: "textures/ui/essx/icons/moon", module: "nightvote", run: nightVote });
world.afterEvents.playerLeave.subscribe(({ playerId }) => { applied.delete(playerId); ground.delete(playerId); rescued.delete(playerId); rescueWarning.delete(playerId); votes.delete(playerId); });
system.runInterval(() => {
  for (const p of online()) {
    try { applyHearts(p); } catch (e) { console.warn("[EssX] Lifesteal sync: " + e); }
    try { antiVoidTick(p); } catch (e) { console.warn("[EssX] Anti-Void: " + e); }
  }
  updateVotes();
}, 10);

const slider = (key, label, min, max, value) => ({ type: "slider", key, label, min, max, step: 1, default: integer(value, min, max, min) });
registerPlugin({ id: "lifesteal", name: "Lifesteal", module: "lifesteal", icon: "textures/ui/essx/icons/heart",
  desc: "PvP transfers maximum hearts. Hearts persist; no elimination at the minimum.",
  fields: (c) => [slider("startingHearts", "Starting hearts (new players)", 2, 40, c.lifesteal.startingHearts), slider("minHearts", "Minimum hearts", 2, 40, c.lifesteal.minHearts), slider("maxHearts", "Maximum hearts", 2, 40, c.lifesteal.maxHearts), slider("transfer", "Hearts transferred per PvP kill", 1, 5, c.lifesteal.transfer), slider("cooldownSec", "Same victim reward cooldown (seconds)", 0, 3600, c.lifesteal.cooldownSec)],
  apply: (c, r) => { const min = integer(r.minHearts, 2, 40, 5), max = integer(r.maxHearts, min, 40, 20); Object.assign(c.lifesteal, { minHearts: min, maxHearts: max, startingHearts: integer(r.startingHearts, min, max, 10), transfer: integer(r.transfer, 1, 5, 1), cooldownSec: integer(r.cooldownSec, 0, 3600, 300) }); },
  actions: [{ text: "§l§cManage Player Hearts", icon: "textures/items/apple_golden", run: heartEditor }],
});
registerPlugin({ id: "bounty", name: "Combat Bounty", module: "bounty", icon: "textures/ui/essx/icons/bounty",
  desc: "Players fund bounty pots; a PvP killer claims the pot. Requires Economy.",
  fields: (c) => [slider("minAmount", "Minimum bounty contribution", 1, 10000, c.bounty.minAmount), slider("maxAmount", "Maximum bounty contribution", 100, 100000, c.bounty.maxAmount), { type: "toggle", key: "announce", label: "Broadcast bounty claims", default: c.bounty.announce }],
  apply: (c, r) => { const min = integer(r.minAmount, 1, 10000, 100); Object.assign(c.bounty, { minAmount: min, maxAmount: integer(r.maxAmount, min, 100000, 100000), announce: !!r.announce }); },
  actions: [{ text: "§l§6Open Bounty Board", icon: "textures/ui/essx/icons/bounty", run: bountyBoard }],
});
registerPlugin({ id: "killstreak", name: "Kill Streak Rewards", module: "killstreak", icon: "textures/ui/essx/icons/trophy",
  desc: "Milestone PvP rewards, capped payout and repeat-victim cooldown. Any death resets the streak.",
  fields: (c) => [slider("everyKills", "Kills per milestone", 2, 50, c.killstreak.everyKills), slider("reward", "Base milestone reward (Economy)", 0, 100000, c.killstreak.reward), slider("maxReward", "Maximum payout per milestone", 0, 1000000, c.killstreak.maxReward), slider("cooldownSec", "Same victim reward cooldown (seconds)", 0, 3600, c.killstreak.cooldownSec), { type: "toggle", key: "announce", label: "Broadcast milestones", default: c.killstreak.announce }],
  apply: (c, r) => Object.assign(c.killstreak, { everyKills: integer(r.everyKills, 2, 50, 3), reward: integer(r.reward, 0, 100000, 100), maxReward: integer(r.maxReward, 0, 1000000, 1000), cooldownSec: integer(r.cooldownSec, 0, 3600, 300), announce: !!r.announce }),
});
registerPlugin({ id: "antivoid", name: "Anti-Void", module: "antivoid", icon: "textures/ui/essx/icons/shield",
  desc: "Rescue falling players to checked ground in the same dimension. Set a backup rescue point below.",
  fields: (c) => [slider("margin", "Blocks below dimension minimum before rescue", 1, 16, c.antivoid.margin), slider("cooldownSec", "Rescue cooldown (seconds)", 1, 60, c.antivoid.cooldownSec)],
  apply: (c, r) => Object.assign(c.antivoid, { margin: integer(r.margin, 1, 16, 4), cooldownSec: integer(r.cooldownSec, 1, 60, 10) }),
  actions: [{ text: "§l§bSet Rescue Point Here", icon: "textures/ui/essx/icons/teleport", run: (p) => {
    if (!isAdmin(p)) return err(p, "You don't have permission.");
    if (!safeAt(p.dimension, p.location)) return err(p, "Stand on solid safe ground with two blocks of air above it.");
    cfg().antivoid.rescuePoints[p.dimension.id] = { ...p.location, dim: p.dimension.id };
    // Plugin actions save configuration independently of the settings form.
    saveCfg(); ok(p, "Rescue point saved for " + p.dimension.id);
    log("admin", `${p.name} set Anti-Void rescue point in ${p.dimension.id}`);
  } }],
});
registerPlugin({ id: "nightvote", name: "Night Vote", module: "nightvote", icon: "textures/ui/essx/icons/moon",
  desc: "Logged-in Survival/Adventure players vote for morning; votes expire and offline votes are removed.",
  fields: (c) => [slider("percent", "Percentage of eligible online players required", 10, 100, c.nightvote.percent), slider("timeoutSec", "Vote expiry (seconds)", 30, 600, c.nightvote.timeoutSec), slider("minPlayers", "Minimum votes required", 1, 100, c.nightvote.minPlayers)],
  apply: (c, r) => Object.assign(c.nightvote, { percent: integer(r.percent, 10, 100, 50), timeoutSec: integer(r.timeoutSec, 30, 600, 120), minPlayers: integer(r.minPlayers, 1, 100, 1) }),
});
