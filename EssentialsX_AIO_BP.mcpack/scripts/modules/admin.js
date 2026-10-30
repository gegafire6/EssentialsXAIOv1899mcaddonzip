import { activity } from "../core/activities.js";
import { GRAVE_STYLES, graveStyle } from "../core/grave-styles.js";
import { actionbar } from "../core/actionbar.js";
// EssentialsX AIO - By Opiar | Admin tools: player manager, bans, mutes, freeze, vanish, invsee, spy, broadcast, logs, settings
import { world, system, GameMode, InputPermissionCategory } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, saveCfg, resetCfg, mod, DEFAULTS, CREDITS } from "../core/config.js";
import { cmd, addAdmin, hooks } from "../core/commands.js";
import { msg, ok, err, findPlayer, idByName, nameOf, isAdmin, menu, modal, confirm, pickPlayer, now, fmtTime, parseDuration, log, online, broadcast, inv, equip, ARMOR_SLOTS, itemName, itemIcon, cmdRun, sound, tpHooks, locStr, loc } from "../core/utils.js";
import { bal } from "./economy.js";
import { rankPrefix } from "./ranks.js";
import { alphabeticalMenu } from "../core/menu-order.js";
import { plugins } from "../core/plugins.js";
import { authenticateDeveloper } from "../core/developer-auth.js";

// Alphabetical feature lists retain each button's original action and icon.
const featureMenu = (p, title, body, buttons) => menu(p, title, body, alphabeticalMenu(buttons));

// ================= BANS =================
export function isBanned(id) {
  const b = DB.bans.get(id);
  if (!b) return false;
  if (b.until && b.until < now()) { DB.bans.delete(id); return false; }
  return b;
}
function kick(name, reason) { cmdRun(`kick "${name}" ${reason.replace(/§./g, "")}`); }
function ban(admin, id, name, durMs, reason) {
  DB.bans.set(id, { name, by: admin.name, reason, at: now(), until: durMs ? now() + durMs : 0 });
  const t = online().find((o) => o.id === id);
  if (t) kick(t.name, `You are banned. Reason: ${reason}${durMs ? " | Time: " + fmtTime(durMs) : " | Permanent"}`);
  broadcast(`§c${name} was banned by ${admin.name}${durMs ? " for " + fmtTime(durMs) : ""}. §7Reason: ${reason}`);
  log("ban", `${admin.name} banned ${name} (${durMs ? fmtTime(durMs) : "perm"}): ${reason}`);
}
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  const b = isBanned(p.id) || DB.bans.values().find((x) => x.name?.toLowerCase() === p.name.toLowerCase() && (!x.until || x.until > now()));
  if (b) system.runTimeout(() => kick(p.name, `You are banned. Reason: ${b.reason}${b.until ? " | Expires in " + fmtTime(b.until - now()) : ""}`), 5);
  if (frozen.has(p.id)) applyFreeze(p, true);
  if (p.hasTag("essx:vanish")) p.addEffect("invisibility", 20000000, { showParticles: false });
});

// ================= MUTES =================
function mute(admin, id, name, durMs, reason) {
  DB.mutes.set(id, { name, by: admin.name, reason, until: durMs ? now() + durMs : 0 });
  const t = online().find((o) => o.id === id);
  if (t) err(t, `You were muted${durMs ? " for " + fmtTime(durMs) : ""}. Reason: ${reason}`);
  ok(admin, `Muted ${name}.`);
  log("mute", `${admin.name} muted ${name}: ${reason}`);
}

// ================= FREEZE =================
const frozen = new Map(); // id -> location
function applyFreeze(p, on) {
  try { p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, !on); } catch {}
  if (on) { frozen.set(p.id, { ...p.location }); p.onScreenDisplay.setTitle("§cFROZEN", { subtitle: "§7Do not log out", fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 5 }); }
  else frozen.delete(p.id);
}
system.runInterval(() => {
  for (const p of online()) {
    const f = frozen.get(p.id);
    if (f && (Math.abs(p.location.x - f.x) > 0.3 || Math.abs(p.location.z - f.z) > 0.3 || p.location.y - f.y > 0.5)) p.teleport(f);
  }
}, 5);
hooks.beforeCommand.push((p) => (frozen.has(p.id) && !isAdmin(p) ? "You are frozen." : undefined));
tpHooks.canTeleport.push((p) => (frozen.has(p.id) ? "You are frozen." : undefined));

// ================= VANISH =================
function vanish(p) {
  if (p.hasTag("essx:vanish")) {
    p.removeTag("essx:vanish"); p.removeEffect("invisibility");
    ok(p, "You are now visible."); broadcast(cfg().joinMessage.replace("{name}", p.name));
  } else {
    p.addTag("essx:vanish"); p.addEffect("invisibility", 20000000, { showParticles: false });
    ok(p, "You are now vanished."); broadcast(cfg().leaveMessage.replace("{name}", p.name));
  }
}
system.runInterval(() => { for (const p of online()) if (p.hasTag("essx:vanish")) actionbar(p, "§7You are §bvanished"); }, 40);

// ================= SPY (spectate) =================
const spying = new Map(); // admin id -> {target, back, gm}
function startSpy(p, t) {
  if (activity(p.id)) return err(p, "Finish your current activity before spying.");
  if (spying.has(p.id)) stopSpy(p);
  spying.set(p.id, { target: t.id, back: loc(p), gm: p.getGameMode() });
  p.setGameMode(GameMode.Spectator);
  ok(p, "Spying on §e" + t.name + "§a. Use §e!spy stop§a to return.");
}
function stopSpy(p) {
  const s = spying.get(p.id);
  if (!s) return err(p, "You aren't spying.");
  spying.delete(p.id);
  p.setGameMode(s.gm ?? GameMode.Survival);
  p.teleport({ x: s.back.x, y: s.back.y, z: s.back.z }, { dimension: world.getDimension(s.back.dim) });
  ok(p, "Stopped spying.");
}
system.runInterval(() => {
  for (const [aid, s] of spying) {
    const a = online().find((o) => o.id === aid);
    const t = online().find((o) => o.id === s.target);
    if (!a) { spying.delete(aid); continue; }
    if (!t) { stopSpy(a); continue; }
    const view = t.getViewDirection();
    const pos = { x: t.location.x - view.x * 3, y: t.location.y + 2, z: t.location.z - view.z * 3 };
    a.teleport(pos, { dimension: t.dimension, facingLocation: t.getHeadLocation() });
    actionbar(a, `§7Spying §e${t.name} §7| ❤ ${Math.ceil(t.getComponent("minecraft:health")?.currentValue ?? 0)} | ${locStr(loc(t))}`);
  }
}, 2);

// ================= INVSEE =================
async function invsee(p, t) {
  const c = inv(t);
  const eq = equip(t);
  const items = [];
  for (let i = 0; i < c.size; i++) { const it = c.getItem(i); if (it) items.push({ slot: i, it, src: "inv" }); }
  for (const s of ARMOR_SLOTS) { const it = eq?.getEquipment(s); if (it) items.push({ slot: s, it, src: "eq" }); }
  await menu(p, "§lInventory: " + t.name, `§7${items.length} item stacks. Tap to take.`, [
    { text: "§l§cClear Inventory", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Clear", "Clear " + t.name + "'s inventory?")) { c.clearAll(); for (const s of ARMOR_SLOTS) eq?.setEquipment(s, undefined); ok(p, "Cleared."); log("admin", p.name + " cleared inv of " + t.name); } } },
    ...items.map((x) => ({ icon: itemIcon(x.it.typeId), text: `§l${itemName({ t: x.it.typeId, n: x.it.nameTag })} §rx${x.it.amount}\n§8${x.src === "inv" ? "slot " + x.slot : x.slot}`, run: async () => {
      if (!(await confirm(p, "Take item", `Take ${itemName({ t: x.it.typeId })} x${x.it.amount} from ${t.name}?`))) return;
      if (x.src === "inv") { const it = c.getItem(x.slot); if (it) { const left = inv(p).addItem(it); c.setItem(x.slot, left); } }
      else { const it = eq.getEquipment(x.slot); if (it) { const left = inv(p).addItem(it); eq.setEquipment(x.slot, left); } }
      ok(p, "Item taken."); log("admin", p.name + " took item from " + t.name);
    } })),
  ]);
}

// ================= PLAYER MANAGER =================
async function punishModal(p, title) {
  return modal(p, title, [
    { type: "text", key: "dur", label: "Duration (e.g. 30m, 2h, 7d, perm)", placeholder: "perm", default: "perm" },
    { type: "text", key: "reason", label: "Reason", placeholder: "Breaking rules", default: "Breaking rules" },
  ]);
}
async function playerPanel(p, t) {
  if (!t?.isValid) return;
  const h = t.getComponent("minecraft:health");
  const info = [
    `§fName: §e${t.name}`, `§fRank: ${rankPrefix(t.id)}`, `§fBalance: §a${cfg().currency}${bal(t.id)}`,
    `§fHealth: §c${Math.ceil(h?.currentValue ?? 0)}/${h?.effectiveMax ?? 20}`, `§fGamemode: §b${t.getGameMode()}`,
    `§fLocation: §7${locStr(loc(t))}`, `§fPlaytime: §e${fmtTime(DB.players.get(t.id)?.playtime ?? 0)}`,
    `§fWarnings: §6${DB.pdata.get(t.id)?.warns?.length ?? 0}`, `§fMuted: ${DB.mutes.has(t.id) ? "§cYes" : "§aNo"} §f| Frozen: ${frozen.has(t.id) ? "§cYes" : "§aNo"}`,
  ].join("\n");
  await featureMenu(p, "§l" + t.name, info, [
    { text: "§l§bTeleport To", icon: "textures/items/ender_pearl", run: () => p.teleport(t.location, { dimension: t.dimension }) },
    { text: "§l§bBring Here", icon: "textures/items/ender_eye", run: () => t.teleport(p.location, { dimension: p.dimension }) },
    { text: "§l§eInventory (invsee)", icon: "textures/blocks/chest_front", run: () => invsee(p, t) },
    { text: "§l§dSpy / Spectate", icon: "textures/items/spyglass", run: () => startSpy(p, t) },
    { text: frozen.has(t.id) ? "§l§aUnfreeze" : "§l§3Freeze", icon: "textures/blocks/ice", run: () => { const on = !frozen.has(t.id); applyFreeze(t, on); ok(p, (on ? "Froze " : "Unfroze ") + t.name); log("admin", `${p.name} ${on ? "froze" : "unfroze"} ${t.name}`); } },
    { text: "§l§6Warn", icon: "textures/ui/WarningGlyph", run: async () => { const r = await modal(p, "Warn " + t.name, [{ type: "text", key: "r", label: "Reason", default: "Breaking rules" }]); if (r) warn(p, t, r.r); } },
    { text: DB.mutes.has(t.id) ? "§l§aUnmute" : "§l§6Mute", icon: "textures/ui/mute_on", run: async () => { if (DB.mutes.has(t.id)) { DB.mutes.delete(t.id); ok(p, "Unmuted."); return; } const r = await punishModal(p, "Mute " + t.name); if (r) mute(p, t.id, t.name, parseDuration(r.dur), r.reason); } },
    { text: "§l§cKick", icon: "textures/ui/essx/icons/close", run: async () => { const r = await modal(p, "Kick " + t.name, [{ type: "text", key: "r", label: "Reason", default: "Kicked by admin" }]); if (r) { kick(t.name, r.r); broadcast(`§c${t.name} was kicked. §7${r.r}`); log("kick", `${p.name} kicked ${t.name}: ${r.r}`); } } },
    { text: "§l§4Ban", icon: "textures/ui/hammer_l", run: async () => { const r = await punishModal(p, "Ban " + t.name); if (r) ban(p, t.id, t.name, parseDuration(r.dur), r.reason); } },
    { text: "§l§aHeal & Feed", icon: "textures/items/apple_golden", run: () => { heal(t); ok(p, "Healed " + t.name); } },
    { text: "§l§9Gamemode", icon: "textures/items/diamond_sword", run: async () => { const r = await modal(p, "Gamemode", [{ type: "dropdown", key: "g", label: "Mode", options: ["Survival", "Creative", "Adventure", "Spectator"] }]); if (r) { t.setGameMode([GameMode.Survival, GameMode.Creative, GameMode.Adventure, GameMode.Spectator][r.g]); ok(p, "Gamemode set."); } } },
    { text: "§l§cKill", icon: "textures/items/bone", run: () => { t.kill(); ok(p, "Killed " + t.name); } },
    { text: "§l§8Clear Effects", icon: "textures/items/potion_bottle_empty", run: () => { for (const e of t.getEffects()) t.removeEffect(e.typeId); ok(p, "Effects cleared."); } },
  ]);
}
function heal(t) {
  t.getComponent("minecraft:health")?.resetToMaxValue();
  t.addEffect("saturation", 20, { amplifier: 255, showParticles: false });
  for (const e of t.getEffects()) if (["poison", "wither", "hunger", "nausea", "blindness", "slowness", "weakness", "mining_fatigue", "darkness"].includes(e.typeId)) t.removeEffect(e.typeId);
  t.extinguishFire?.();
}
function warn(p, t, reason) {
  const d = DB.pdata.get(t.id, {}); d.warns = d.warns ?? []; d.warns.push({ by: p.name, reason, at: now() }); DB.pdata.set(t.id, d);
  t.onScreenDisplay.setTitle("§c⚠ WARNING", { subtitle: "§f" + reason, fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 10 });
  err(t, `You were warned by ${p.name}: ${reason} §7(${d.warns.length}/5)`);
  ok(p, `Warned ${t.name} (${d.warns.length}/5)`);
  log("warn", `${p.name} warned ${t.name}: ${reason}`);
  if (d.warns.length >= 5) ban(p, t.id, t.name, 86400000, "Too many warnings");
}

async function bansUI(p) {
  const list = DB.bans.entries().filter(([id]) => isBanned(id));
  await menu(p, "§lBanned Players", list.length ? "" : "§7No bans.", list.map(([id, b]) => ({ icon: "textures/ui/hammer_l",
    text: `§l${b.name}\n§r§8${b.until ? fmtTime(b.until - now()) : "Permanent"} - ${b.reason}`,
    run: async () => { if (await confirm(p, "Unban", `Unban ${b.name}?\nBy: ${b.by}\nReason: ${b.reason}`)) { DB.bans.delete(id); ok(p, "Unbanned " + b.name); log("ban", p.name + " unbanned " + b.name); } },
  })));
}
async function offlineBan(p) {
  const r = await modal(p, "§lBan by Name", [
    { type: "text", key: "n", label: "Player name (offline OK)", placeholder: "Steve" },
    { type: "text", key: "dur", label: "Duration", default: "perm" },
    { type: "text", key: "reason", label: "Reason", default: "Breaking rules" },
  ]);
  if (!r || !r.n) return;
  const id = idByName(r.n) ?? "name:" + String(r.n).toLowerCase();
  ban(p, id, idByName(r.n) ? nameOf(id) : r.n, parseDuration(r.dur), r.reason);
}

// ================= BROADCAST =================
async function broadcastUI(p) {
  const r = await modal(p, "§lBroadcast", [
    { type: "text", key: "m", label: "Message (§ colors allowed)", placeholder: "Server restart in 5 minutes" },
    { type: "dropdown", key: "t", label: "Display", options: ["Chat", "Title", "Actionbar", "All"] },
    { type: "toggle", key: "s", label: "Play sound", default: true },
  ]);
  if (!r || !r.m) return;
  doBroadcast(r.m, r.t, r.s);
  log("admin", p.name + " broadcast: " + r.m);
}
function doBroadcast(m, type = 0, snd = true) {
  for (const o of online()) {
    if (type === 0 || type === 3) o.sendMessage(`§8[§c§lBROADCAST§r§8] §f${m}`);
    if (type === 1 || type === 3) o.onScreenDisplay.setTitle("§c§lANNOUNCEMENT", { subtitle: m, fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 10 });
    if (type === 2 || type === 3) actionbar(o, m);
    if (snd) sound(o, "note.pling");
  }
}
// auto announcements
let annIdx = 0, annT = 0;
system.runInterval(() => {
  if (!mod("announcements")) return;
  const c = cfg().announcements;
  if (!c.messages.length) return;
  if (++annT < Math.max(30, c.intervalSec)) return;
  annT = 0;
  world.sendMessage("§8[§6Info§8] §f" + c.messages[annIdx++ % c.messages.length]);
}, 20);

// ================= LOGS =================
async function logsUI(p, filter) {
  const types = ["all", "chat", "cmd", "join", "leave", "death", "ban", "kick", "mute", "warn", "eco", "admin", "shop", "auction", "land", "report", "rank", "anticheat", "login", "clearlag"];
  if (!filter) {
    return featureMenu(p, "§lServer Logs", "§7Choose a log type.", [
      ...types.map((t) => ({ icon: "textures/ui/essx/icons/logs", text: "§l" + t.toUpperCase(), run: () => logsUI(p, t) })),
      { text: "§l§cClear Logs", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Clear logs", "Delete all logs?")) { DB.logs.data = { list: [] }; ok(p, "Logs cleared."); } } },
    ]);
  }
  const l = DB.logs.data.list.filter((x) => filter === "all" || x.type === filter).slice(-60).reverse();
  const body = l.map((x) => `§8${fmtTime(now() - x.t)} ago §7[${x.type}] §f${x.text}`).join("\n") || "§7Empty";
  await menu(p, "§lLogs: " + filter, body, [{ text: "§lBack", icon: "textures/ui/essx/icons/back" }]);
}
world.afterEvents.entityDie.subscribe((ev) => {
  if (ev.deadEntity.typeId !== "minecraft:player") return;
  const k = ev.damageSource?.damagingEntity;
  log("death", `${ev.deadEntity.name} died (${ev.damageSource.cause}${k ? " by " + (k.typeId === "minecraft:player" ? k.name : k.typeId.replace("minecraft:", "")) : ""})`);
});

// ================= SETTINGS =================
const MODULE_LABELS = {
  homes: "Homes", warps: "Warps", spawn: "Spawn", back: "Back", tpa: "TPA", rtp: "Random TP", economy: "Economy", shop: "Shop",
  auction: "Auction House", land: "Land Claims", clans: "Clans", kits: "Kits", daily: "Daily Rewards", redeem: "Redeem Codes",
  reports: "Reports", msg: "Private Messages", graves: "Gravestones", combat: "Combat Log", chat: "Chat Format", hud: "HUD / Sidebar",
  healthbar: "Mob Healthbar", playerhealth: "Player Health Bar", nametags: "Rank Nametags", clearlag: "ClearLag", afk: "AFK System", regions: "Protected Regions",
  builder: "Structure Builder", npc: "NPC System", holograms: "Holograms", announcements: "Auto Announcements", quests: "Quests", antispam: "Anti Spam", filter: "Chat Filter",
  veinminer: "Vein Miner", treecapitator: "Tree Capitator", login: "Login System", anticheat: "Anti-Cheat", cosmetics: "Cosmetics",
};
async function settingsUI(p) {
  await featureMenu(p, "§lServer Settings", CREDITS, [
    { text: "§l§aModules\n§r§8Enable / disable features", icon: "textures/ui/toggle_on", run: () => modulesUI(p) },
    { text: "§l§eGeneral\n§r§8Prefix, currency, messages", icon: "textures/ui/essx/icons/settings", run: () => generalUI(p) },
    { text: "§l§bTeleport & RTP", icon: "textures/items/ender_pearl", run: () => tpSettings(p) },
    { text: "§l§2Economy & Land", icon: "textures/items/emerald", run: () => ecoSettings(p) },
    { text: "§l§cCombat & AFK", icon: "textures/items/iron_sword", run: () => combatSettings(p) },
    { text: "§l§7Graves\n§r§8Styles, protection & despawn", icon: "textures/ui/essx/icons/grave", run: () => graveSettings(p) },
    { text: "§l§6Announcements", icon: "textures/items/book_writable", run: () => annSettings(p) },
    { text: "§l§dChat Settings", icon: "textures/items/paper", run: () => chatSettings(p) },
    { text: "§l§4Reset All Settings", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Reset", "Reset all settings to default?")) { resetCfg(); ok(p, "Settings reset."); } } },
  ]);
}
async function pluginsUI(p) {
  const c = cfg();
  const buttons = plugins.map((pl) => ({
    text: `§l${pl.name}\n§r${c.modules[pl.module] !== false && c.modules[pl.module] ? "§aENABLED" : "§cDISABLED"} §8| ${pl.desc.slice(0, 40)}`,
    icon: pl.icon,
    run: () => pluginPage(p, pl),
  }));
  await featureMenu(p, "§lPlugins", "§7Manage server plugins. Choose one to enable, disable or configure.", buttons);
}
async function pluginPage(p, pl) {
  const c = cfg();
  const enabled = !!c.modules[pl.module];
  const buttons = [
    { text: enabled ? "§l§cDisable Plugin" : "§l§aEnable Plugin", icon: "textures/ui/toggle_" + (enabled ? "on" : "off"), run: () => { c.modules[pl.module] = !enabled; saveCfg(); ok(p, `${pl.name} ${enabled ? "disabled" : "enabled"}.`); log("admin", `${p.name} ${enabled ? "disabled" : "enabled"} plugin ${pl.name}`); } },
  ];
  if (pl.fields) buttons.push({ text: "§l§eConfigure Settings", icon: "textures/ui/essx/icons/settings", run: async () => {
    const r = await modal(p, "§l" + pl.name, pl.fields(cfg()), "Save");
    if (!r) return;
    pl.apply(cfg(), r);
    saveCfg();
    ok(p, `${pl.name} settings saved.`);
  } });
  for (const a of pl.actions ?? []) buttons.push({ text: a.text, icon: a.icon, run: () => a.run(p) });
  buttons.push({ text: "§lBack", icon: "textures/ui/essx/icons/back" });
  const b = await featureMenu(p, "§l" + pl.name, `${enabled ? "§aEnabled" : "§cDisabled"}\n§7${pl.desc}`, buttons);
  if (b && b.text !== "§lBack") return pluginPage(p, pl);
}
async function modulesUI(p) {
  const c = cfg();
  // Plugins own their switches and configuration; core modules are managed here.
  const pluginModules = new Set(plugins.map((pl) => pl.module));
  const keys = alphabeticalMenu(Object.keys(DEFAULTS.modules).filter((key) => !pluginModules.has(key)), key => MODULE_LABELS[key] ?? key);
  const r = await modal(p, "§lModules", keys.map((k) => ({ type: "toggle", key: k, label: MODULE_LABELS[k] ?? k, default: c.modules[k] !== false })), "Save");
  if (!r) return;
  for (const k of keys) c.modules[k] = !!r[k];
  saveCfg();
  if (c.modules.graves) world.gameRules.keepInventory = true;
  ok(p, "Modules saved.");
}
async function generalUI(p) {
  const c = cfg();
  const r = await modal(p, "§lGeneral", [
    { type: "text", key: "prefix", label: "Command prefix", default: c.prefix },
    { type: "text", key: "serverName", label: "Server name", default: c.serverName },
    { type: "text", key: "currency", label: "Currency symbol", default: c.currency },
    { type: "text", key: "startingBalance", label: "Starting balance", default: c.startingBalance },
    { type: "text", key: "welcomeMessage", label: "Welcome message ({name})", default: c.welcomeMessage },
    { type: "text", key: "firstJoinBroadcast", label: "First join broadcast", default: c.firstJoinBroadcast },
    { type: "text", key: "joinMessage", label: "Join message (empty = off)", default: c.joinMessage },
    { type: "text", key: "leaveMessage", label: "Leave message (empty = off)", default: c.leaveMessage },
    { type: "toggle", key: "giveMenuItem", label: "Give menu item on first join", default: c.giveMenuItem },
  ]);
  if (!r) return;
  c.prefix = String(r.prefix || "!").slice(0, 3); c.serverName = r.serverName; c.currency = r.currency;
  c.startingBalance = Math.max(0, +r.startingBalance || 0); c.welcomeMessage = r.welcomeMessage; c.firstJoinBroadcast = r.firstJoinBroadcast;
  c.joinMessage = r.joinMessage; c.leaveMessage = r.leaveMessage; c.giveMenuItem = r.giveMenuItem;
  saveCfg(); ok(p, "Saved.");
}
async function tpSettings(p) {
  const c = cfg();
  const r = await modal(p, "§lTeleport & Random TP", [
    { type: "label", label: "Each successful Random TP moves farther from your saved origin. Default: add 20–30 blocks each time. No safe ground means no progress and a fee refund." },
    { type: "dropdown", key: "origin", label: "Random TP starting origin", options: ["Player's first successful RTP position", "World/server spawn"], default: c.rtp.origin === "spawn" ? 1 : 0 },
    { type: "text", key: "rmin", label: "RTP minimum added distance (blocks, at least 1)", default: c.rtp.minRadius },
    { type: "text", key: "rmax", label: "RTP maximum added distance (blocks, greater than minimum, up to 5000)", default: c.rtp.maxRadius },
    { type: "text", key: "rcd", label: "RTP cooldown (seconds, 0–86400)", default: c.rtp.cooldown },
    { type: "text", key: "rcost", label: "RTP cost (whole number, 0–1000000000)", default: c.rtp.cost },
    { type: "slider", key: "delay", label: "Other teleport warmup (seconds; RTP searches immediately)", min: 0, max: 10, default: c.teleportDelay },
    { type: "slider", key: "timeout", label: "TPA timeout (sec)", min: 15, max: 300, step: 15, default: c.tpa.timeout },
    { type: "slider", key: "homes", label: "Default home limit", min: 1, max: 30, default: c.homes.defaultLimit },
  ]);
  if (!r) return;
  const keys = ["rmin", "rmax", "rcd", "rcost"];
  if (keys.some((key) => !/^\d+$/.test(String(r[key] ?? "").trim()) || !Number.isSafeInteger(Number(r[key])))) return err(p, "Enter whole numbers for RTP distances, cooldown and cost.");
  const min = Number(r.rmin), max = Number(r.rmax), cooldown = Number(r.rcd), cost = Number(r.rcost);
  if (min < 1 || max <= min || max > 5000) return err(p, "RTP distances must be 1–5000 blocks, with maximum greater than minimum. Try 20 and 30.");
  if (cooldown > 86400 || cost > 1000000000) return err(p, "RTP cooldown must be 0–86400 seconds and cost 0–1000000000.");
  if (![0, 1].includes(r.origin)) return err(p, "Choose player or spawn for the RTP origin.");
  if (!await authenticateDeveloper(p)) return;
  c.teleportDelay = r.delay; c.tpa.timeout = r.timeout; c.homes.defaultLimit = r.homes;
  Object.assign(c.rtp, { minRadius: min, maxRadius: max, cooldown, cost, origin: r.origin === 1 ? "spawn" : "player" });
  saveCfg(); ok(p, `Teleport settings saved. RTP: ${min}–${max} additional blocks per use from saved ${c.rtp.origin} origin.`);
}
cmd({ name: "rtpsettings", admin: true, desc: "Configure teleport and Random TP settings", run: tpSettings });
async function ecoSettings(p) {
  const c = cfg();
  const r = await modal(p, "§lEconomy & Land", [
    { type: "text", key: "kr", label: "Player kill reward", default: c.economy.killReward },
    { type: "text", key: "mr", label: "Monster kill reward", default: c.economy.mobKillReward },
    { type: "text", key: "lp", label: "Land price per block (area)", default: c.land.pricePerBlock },
    { type: "slider", key: "lm", label: "Max claims per player", min: 1, max: 20, default: c.land.maxClaims },
    { type: "slider", key: "ls", label: "Max claim size", min: 10, max: 301, default: c.land.maxSize },
    { type: "text", key: "cc", label: "Clan create cost", default: c.clans.createCost },
    { type: "slider", key: "cm", label: "Clan max members", min: 2, max: 50, default: c.clans.maxMembers },
    { type: "slider", key: "al", label: "Auction max listings / player", min: 1, max: 30, default: c.auction.maxListings },
    { type: "slider", key: "at", label: "Auction tax %", min: 0, max: 50, default: c.auction.taxPercent },
    { type: "slider", key: "ad", label: "Auction duration (hours)", min: 1, max: 168, default: c.auction.durationHours },
    { type: "text", key: "db", label: "Daily reward base", default: c.daily.base },
    { type: "text", key: "ds", label: "Daily streak bonus", default: c.daily.streakBonus },
  ]);
  if (!r) return;
  c.economy.killReward = +r.kr || 0; c.economy.mobKillReward = +r.mr || 0; c.land.pricePerBlock = +r.lp || 0; c.land.maxClaims = r.lm; c.land.maxSize = r.ls;
  c.clans.createCost = +r.cc || 0; c.clans.maxMembers = r.cm; c.auction.maxListings = r.al; c.auction.taxPercent = r.at; c.auction.durationHours = r.ad;
  c.daily.base = +r.db || 0; c.daily.streakBonus = +r.ds || 0;
  saveCfg(); ok(p, "Saved.");
}
async function graveSettings(p) {
  const c = cfg().graves;
  const r = await modal(p, "§lGraves Settings", [
    { type: "dropdown", key: "style", label: "Default grave style (all lie flat)", options: GRAVE_STYLES.map(style => style.label), default: graveStyle(c.defaultStyle).variant },
    { type: "toggle", key: "choices", label: "Allow players to choose their own grave style", default: c.allowPlayerStyles !== false },
    { type: "slider", key: "protect", label: "Grave protection (minutes)", min: 0, max: 120, default: c.protectMinutes },
    { type: "slider", key: "despawn", label: "Grave despawn (minutes)", min: 10, max: 1440, step: 10, default: c.despawnMinutes },
  ]);
  if (!r) return;
  if (!await authenticateDeveloper(p)) return;
  const style = GRAVE_STYLES[r.style];
  if (!style || !Number.isInteger(r.protect) || r.protect < 0 || r.protect > 120 || !Number.isInteger(r.despawn) || r.despawn < 10 || r.despawn > 1440) return err(p, "Choose valid grave settings.");
  Object.assign(c, { defaultStyle: style.id, allowPlayerStyles: !!r.choices, protectMinutes: r.protect, despawnMinutes: r.despawn });
  saveCfg();
  ok(p, "Graves settings saved. Loaded graves refresh within 5 seconds. The default style applies when no player style is selected, or player choices are disabled.");
}

async function combatSettings(p) {
  const c = cfg();
  const r = await modal(p, "§lCombat / AFK", [
    { type: "slider", key: "cs", label: "Combat tag seconds", min: 5, max: 60, default: c.combat.seconds },
    { type: "toggle", key: "ck", label: "Kill players who combat log", default: c.combat.killOnLogout },
    { type: "toggle", key: "ct", label: "Block teleport in combat", default: c.combat.blockTeleport },
    { type: "toggle", key: "ff", label: "Clan friendly fire", default: c.clans.friendlyFire },
    { type: "slider", key: "afk", label: "AFK after (minutes)", min: 1, max: 60, default: c.afk.minutes },
    { type: "toggle", key: "afkk", label: "Kick AFK players", default: c.afk.kick },
    { type: "slider", key: "afkkm", label: "AFK kick after (minutes)", min: 5, max: 240, step: 5, default: c.afk.kickMinutes },
  ]);
  if (!r) return;
  c.combat.seconds = r.cs; c.combat.killOnLogout = r.ck; c.combat.blockTeleport = r.ct; c.clans.friendlyFire = r.ff;
  c.afk.minutes = r.afk; c.afk.kick = r.afkk; c.afk.kickMinutes = r.afkkm;
  saveCfg(); ok(p, "Saved.");
}
async function annSettings(p) {
  const c = cfg().announcements;
  await menu(p, "§lAnnouncements", c.messages.map((m, i) => `§7${i + 1}. §f${m}`).join("\n"), [
    { text: "§l§aAdd Message", icon: "textures/ui/essx/icons/add", run: async () => { const r = await modal(p, "Add", [{ type: "text", key: "m", label: "Message" }]); if (r?.m) { c.messages.push(r.m); saveCfg(); ok(p, "Added."); } } },
    { icon: "textures/ui/essx/icons/clock", text: "§l§eInterval\n§r§8" + c.intervalSec + "s", run: async () => { const r = await modal(p, "Interval", [{ type: "slider", key: "s", label: "Seconds", min: 30, max: 3600, step: 30, default: c.intervalSec }]); if (r) { c.intervalSec = r.s; saveCfg(); } } },
    ...c.messages.map((m, i) => ({ icon: "textures/ui/essx/icons/delete", text: "§c✖ §r" + m.slice(0, 30), run: () => { c.messages.splice(i, 1); saveCfg(); ok(p, "Removed."); } })),
  ]);
}
async function chatSettings(p) {
  const c = cfg().chat;
  const r = await modal(p, "§lChat", [
    { type: "text", key: "f", label: "Format: {clan} {rank} {name} {msg}", default: c.format },
    { type: "slider", key: "cd", label: "Chat cooldown (ms)", min: 0, max: 5000, step: 100, default: c.cooldownMs },
    { type: "slider", key: "caps", label: "Max caps %", min: 10, max: 100, step: 5, default: c.maxCaps },
    { type: "text", key: "w", label: "Filtered words (comma separated)", default: c.filterWords.join(",") },
  ]);
  if (!r) return;
  c.format = r.f || DEFAULTS.chat.format; c.cooldownMs = r.cd; c.maxCaps = r.caps;
  c.filterWords = String(r.w).split(",").map((s) => s.trim()).filter(Boolean);
  saveCfg(); ok(p, "Saved.");
}

// ================= WORLD TOOLS =================
async function worldUI(p) {
  await featureMenu(p, "§lWorld Tools", "", [
    { text: "§l§eTime: Day", icon: "textures/items/clock_item", run: () => cmdRun("time set day") },
    { text: "§l§9Time: Night", icon: "textures/items/clock_item", run: () => cmdRun("time set night") },
    { text: "§l§bWeather: Clear", icon: "textures/ui/essx/icons/sun", run: () => cmdRun("weather clear") },
    { text: "§l§3Weather: Rain", icon: "textures/ui/essx/icons/rain", run: () => cmdRun("weather rain") },
    { text: `§lPVP: ${world.gameRules.pvp ? "§aON" : "§cOFF"}`, icon: "textures/items/iron_sword", run: () => { world.gameRules.pvp = !world.gameRules.pvp; ok(p, "PVP " + (world.gameRules.pvp ? "on" : "off")); } },
    { icon: "textures/ui/essx/icons/inventory", text: `§lKeep Inventory: ${world.gameRules.keepInventory ? "§aON" : "§cOFF"}`, run: () => { world.gameRules.keepInventory = !world.gameRules.keepInventory; ok(p, "Keep inventory toggled."); } },
    { icon: "textures/ui/essx/icons/shield", text: `§lMob Griefing: ${world.gameRules.mobGriefing ? "§aON" : "§cOFF"}`, run: () => { world.gameRules.mobGriefing = !world.gameRules.mobGriefing; } },
    { icon: "textures/ui/essx/icons/cycle", text: `§lDaylight Cycle: ${world.gameRules.doDayLightCycle ? "§aON" : "§cOFF"}`, run: () => { world.gameRules.doDayLightCycle = !world.gameRules.doDayLightCycle; } },
    { icon: "textures/ui/essx/icons/fire", text: `§lFire Spread: ${world.gameRules.doFireTick ? "§aON" : "§cOFF"}`, run: () => { world.gameRules.doFireTick = !world.gameRules.doFireTick; } },
    { icon: "textures/ui/essx/icons/coords", text: `§lShow Coordinates: ${world.gameRules.showCoordinates ? "§aON" : "§cOFF"}`, run: () => { world.gameRules.showCoordinates = !world.gameRules.showCoordinates; } },
  ]);
}

// ================= COMMANDS =================
cmd({ name: "kick", admin: true, desc: "Kick a player", usage: "<player> [reason]", run: (p, a) => { const t = findPlayer(a.shift()); if (!t) return err(p, "Player not found."); const r = a.join(" ") || "Kicked"; kick(t.name, r); broadcast(`§c${t.name} was kicked. §7${r}`); log("kick", `${p.name} kicked ${t.name}: ${r}`); } });
cmd({ name: "ban", admin: true, desc: "Ban a player", usage: "<player> [duration] [reason]",
  run: (p, a) => {
    const n = a.shift(); if (!n) return offlineBan(p);
    const t = findPlayer(n); const id = t?.id ?? idByName(n) ?? "name:" + n.toLowerCase();
    const dur = a[0] && /^\d|perm/i.test(a[0]) ? parseDuration(a.shift()) : 0;
    ban(p, id, t?.name ?? (idByName(n) ? nameOf(id) : n), dur, a.join(" ") || "Breaking rules");
  } });
cmd({ name: "unban", aliases: ["pardon"], admin: true, desc: "Unban a player", usage: "<player>",
  run: (p, a) => { const n = (a[0] ?? "").toLowerCase(); const e = DB.bans.entries().find(([, b]) => b.name.toLowerCase() === n); if (!e) return err(p, "Not banned."); DB.bans.delete(e[0]); ok(p, "Unbanned " + e[1].name); } });
cmd({ name: "banlist", admin: true, desc: "Banned players", run: bansUI });
cmd({ name: "mute", admin: true, desc: "Mute a player", usage: "<player> [duration] [reason]",
  run: (p, a) => { const n = a.shift(); const id = findPlayer(n)?.id ?? idByName(n ?? ""); if (!id) return err(p, "Player not found."); const dur = a[0] && /^\d|perm/i.test(a[0]) ? parseDuration(a.shift()) : 0; mute(p, id, nameOf(id), dur, a.join(" ") || "Chat abuse"); } });
cmd({ name: "unmute", admin: true, desc: "Unmute a player", usage: "<player>", run: (p, a) => { const id = idByName(a[0] ?? ""); if (!id || !DB.mutes.has(id)) return err(p, "Not muted."); DB.mutes.delete(id); ok(p, "Unmuted."); } });
cmd({ name: "warn", admin: true, desc: "Warn a player", usage: "<player> <reason>", run: (p, a) => { const t = findPlayer(a.shift()); if (!t) return err(p, "Player not found."); warn(p, t, a.join(" ") || "Breaking rules"); } });
cmd({ name: "warnings", admin: true, desc: "View/clear warnings", usage: "<player> [clear]",
  run: (p, a) => { const id = idByName(a[0] ?? ""); if (!id) return err(p, "Player not found."); const d = DB.pdata.get(id, {}); if (a[1] === "clear") { d.warns = []; DB.pdata.set(id, d); return ok(p, "Cleared."); } msg(p, `§e${nameOf(id)} warnings:\n` + (d.warns ?? []).map((w, i) => `§7${i + 1}. §f${w.reason} §8(${w.by})`).join("\n")); } });
cmd({ name: "freeze", admin: true, desc: "Freeze/unfreeze player", usage: "<player>", run: (p, a) => { const t = findPlayer(a[0]); if (!t) return err(p, "Player not found."); const on = !frozen.has(t.id); applyFreeze(t, on); ok(p, (on ? "Froze " : "Unfroze ") + t.name); } });
cmd({ name: "vanish", aliases: ["v"], admin: true, desc: "Toggle vanish", run: vanish });
cmd({ name: "spy", admin: true, desc: "Spectate a player", usage: "<player|stop>", run: async (p, a) => { if (a[0] === "stop") return stopSpy(p); const t = a[0] ? findPlayer(a[0]) : await pickPlayer(p, "§lSpy"); if (!t) return err(p, "Player not found."); startSpy(p, t); } });
cmd({ name: "invsee", admin: true, desc: "View player inventory", usage: "<player>", run: async (p, a) => { const t = a[0] ? findPlayer(a[0]) : await pickPlayer(p, "§lInvsee"); if (t) invsee(p, t); } });
cmd({ name: "heal", admin: true, desc: "Heal yourself or player", usage: "[player]", run: (p, a) => { const t = a[0] ? findPlayer(a[0]) : p; if (!t) return err(p, "Player not found."); heal(t); ok(p, "Healed " + t.name); } });
cmd({ name: "feed", admin: true, desc: "Feed yourself or player", usage: "[player]", run: (p, a) => { const t = a[0] ? findPlayer(a[0]) : p; if (!t) return err(p, "Player not found."); t.addEffect("saturation", 20, { amplifier: 255, showParticles: false }); ok(p, "Fed " + t.name); } });
cmd({ name: "gm", aliases: ["gamemode"], admin: true, desc: "Change gamemode", usage: "<s|c|a|sp> [player]",
  run: (p, a) => { const m = { s: GameMode.Survival, "0": GameMode.Survival, c: GameMode.Creative, "1": GameMode.Creative, a: GameMode.Adventure, "2": GameMode.Adventure, sp: GameMode.Spectator, "3": GameMode.Spectator }[(a[0] ?? "").toLowerCase()]; if (!m) return err(p, "Usage: !gm <s|c|a|sp> [player]"); const t = a[1] ? findPlayer(a[1]) : p; if (!t) return err(p, "Player not found."); t.setGameMode(m); ok(p, `${t.name} is now in ${m}`); } });
cmd({ name: "broadcast", aliases: ["bc", "say"], admin: true, desc: "Broadcast a message", usage: "<message>", run: (p, a) => (a.length ? doBroadcast(a.join(" "), 3) : broadcastUI(p)) });
cmd({ name: "logs", admin: true, desc: "Server logs", run: (p) => logsUI(p) });
cmd({ name: "settings", aliases: ["config", "essx"], admin: true, desc: "Server settings", run: settingsUI });
cmd({ name: "admin", aliases: ["op"], admin: true, desc: "Give/remove admin tag", usage: "<player>",
  run: (p, a) => { const t = findPlayer(a[0]); if (!t) return err(p, "Player not found."); if (t.hasTag("essx:admin")) { t.removeTag("essx:admin"); t.removeTag("essx:admin_manual"); ok(p, "Removed admin from " + t.name); } else { t.addTag("essx:admin"); t.addTag("essx:admin_manual"); ok(p, t.name + " is now admin."); } } });
cmd({ name: "player", aliases: ["pm", "manage"], admin: true, desc: "Player manager", usage: "[player]", run: async (p, a) => { const t = a[0] ? findPlayer(a[0]) : await pickPlayer(p, "§lPlayer Manager", true); if (t) playerPanel(p, t); } });
cmd({ name: "credits", aliases: ["about", "version"], desc: "Addon credits", run: (p) => msg(p, CREDITS) });

addAdmin({ text: "§l§cPlayer Manager\n§r§8Kick, ban, mute, freeze...", icon: "textures/ui/essx/icons/account", run: async (p) => { const t = await pickPlayer(p, "§lPlayer Manager", true); if (t) playerPanel(p, t); } });
addAdmin({ text: "§l§4Bans\n§r§8Ban list / ban offline", icon: "textures/ui/essx/icons/ban", run: (p) => featureMenu(p, "§lBans", "", [{ text: "§lBan List", icon: "textures/ui/hammer_l", run: () => bansUI(p) }, { text: "§lBan by Name", icon: "textures/ui/hammer_l", run: () => offlineBan(p) }]) });
addAdmin({ text: "§l§eBroadcast\n§r§8Announce to all", icon: "textures/ui/essx/icons/broadcast", run: broadcastUI });
addAdmin({ text: "§l§5Plugins\n§r§8Gameplay, safety & server plugins", icon: "textures/ui/essx/icons/plugins", run: (p) => pluginsUI(p) });
cmd({ name: "plugins", aliases: ["pl"], admin: true, desc: "Manage server plugins", run: (p) => pluginsUI(p) });
addAdmin({ text: "§l§7Server Logs\n§r§8Chat, commands, deaths...", icon: "textures/ui/essx/icons/logs", run: (p) => logsUI(p) });
addAdmin({ text: "§l§bWorld Tools\n§r§8Time, weather, rules", icon: "textures/ui/essx/icons/cycle", run: worldUI });
addAdmin({ text: "§l§3Self Tools\n§r§8Vanish, gm, heal, spy", icon: "textures/ui/essx/icons/eye", run: (p) => featureMenu(p, "§lSelf Tools", "", [
  { icon: "textures/ui/essx/icons/eye", text: p.hasTag("essx:vanish") ? "§l§aUnvanish" : "§l§bVanish", run: () => vanish(p) },
  { text: "§lCreative", icon: "textures/items/diamond_pickaxe", run: () => p.setGameMode(GameMode.Creative) },
  { text: "§lSurvival", icon: "textures/items/iron_sword", run: () => p.setGameMode(GameMode.Survival) },
  { text: "§lSpectator", icon: "textures/ui/essx/icons/spectator", run: () => p.setGameMode(GameMode.Spectator) },
  { text: "§lHeal & Feed", icon: "textures/ui/essx/icons/heart", run: () => heal(p) },
  { text: "§lStop Spying", icon: "textures/ui/essx/icons/eye", run: () => stopSpy(p) },
  { text: "§lGet Admin Item", icon: "textures/items/essx_admin", run: () => cmdRun(`give "${p.name}" essx:admin_menu`) },
]) });
addAdmin({ text: "§l§8Server Settings\n§r§8Modules & config", icon: "textures/ui/essx/icons/settings", run: settingsUI });
