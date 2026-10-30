// EssentialsX AIO - By Opiar | Kits, Starter Kit, Daily Rewards, Redeem Codes, Quests, Reports
import { world, system, ItemStack } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod, saveCfg } from "../core/config.js";
import { cmd, addMember, addAdmin } from "../core/commands.js";
import { msg, ok, err, nameOf, isAdmin, menu, modal, confirm, now, fmtTime, log, cur, inv, equip, ARMOR_SLOTS, serializeItem, deserializeItem, itemName, giveItem, online, findPlayer, sound, broadcast, giveType } from "../core/utils.js";
import { addBal } from "./economy.js";
import { playerRankIds, ranks, rankLabel } from "./ranks.js";
import { questCompleteNotice } from "../core/notifications.js";

// ================= KITS =================
const DEFAULT_KITS = {
  starter: { name: "§aStarter", cooldown: 0, once: true, rank: "", money: 100, icon: "textures/items/wood_sword", items: [
    { t: "minecraft:stone_sword", a: 1 }, { t: "minecraft:stone_pickaxe", a: 1 }, { t: "minecraft:stone_axe", a: 1 }, { t: "minecraft:bread", a: 16 }, { t: "minecraft:torch", a: 16 }, { t: "minecraft:oak_log", a: 16 }, { t: "minecraft:white_bed", a: 1 },
  ] },
  daily: { name: "§eFood", cooldown: 86400, once: false, rank: "", money: 0, icon: "textures/items/bread", items: [{ t: "minecraft:cooked_beef", a: 16 }, { t: "minecraft:golden_carrot", a: 8 }] },
  vip: { name: "§aVIP", cooldown: 86400 * 3, once: false, rank: "vip", money: 250, icon: "textures/items/iron_chestplate", items: [
    { t: "minecraft:iron_helmet", a: 1 }, { t: "minecraft:iron_chestplate", a: 1 }, { t: "minecraft:iron_leggings", a: 1 }, { t: "minecraft:iron_boots", a: 1 }, { t: "minecraft:iron_sword", a: 1 }, { t: "minecraft:golden_apple", a: 4 },
  ] },
  mvp: { name: "§bMVP", cooldown: 86400 * 3, once: false, rank: "mvp", money: 500, icon: "textures/items/diamond_chestplate", items: [
    { t: "minecraft:diamond_helmet", a: 1 }, { t: "minecraft:diamond_chestplate", a: 1 }, { t: "minecraft:diamond_leggings", a: 1 }, { t: "minecraft:diamond_boots", a: 1 }, { t: "minecraft:diamond_sword", a: 1, e: [["sharpness", 2]] }, { t: "minecraft:golden_apple", a: 8 },
  ] },
};
function kits() {
  if (!DB.kits.keys().length && !DB.pdata.get("__kitinit")) { DB.kits.data = JSON.parse(JSON.stringify(DEFAULT_KITS)); DB.pdata.set("__kitinit", true); }
  return DB.kits.data;
}
function kitStatus(p, id) {
  const k = kits()[id];
  const used = DB.kitUse.get(p.id, {})[id];
  if (k.rank && !playerRankIds(p.id).includes(k.rank) && !isAdmin(p)) return "§cRequires " + (ranks()[k.rank] ? rankLabel(ranks()[k.rank]) : k.rank);
  if (k.once && used) return "§cAlready claimed";
  if (used && k.cooldown && now() - used < k.cooldown * 1000) return "§6" + fmtTime(k.cooldown * 1000 - (now() - used));
  return true;
}
function giveKit(p, id, force = false) {
  const k = kits()[id];
  if (!k) return err(p, "Kit not found.");
  const st = kitStatus(p, id);
  if (st !== true && !force) return err(p, "Can't claim: " + st);
  for (const o of k.items) { const it = deserializeItem(o); if (it) giveItem(p, it); }
  if (k.money) addBal(p.id, k.money);
  const u = DB.kitUse.get(p.id, {}); u[id] = now(); DB.kitUse.set(p.id, u);
  ok(p, `Claimed kit ${k.name}§a${k.money ? " + " + cur(k.money) : ""}`);
  sound(p, "random.levelup");
}
async function kitsUI(p) {
  const all = kits();
  await menu(p, "§lKits", "§7Claim your kits.", Object.entries(all).map(([id, k]) => {
    const st = kitStatus(p, id);
    return { text: `§l${k.name}\n§r${st === true ? "§aAvailable" : st}`, icon: k.icon, run: async () => {
      const body = k.items.map((o) => `§7- §f${itemName(o)} x${o.a}`).join("\n") + (k.money ? `\n§7- §a${cur(k.money)}` : "");
      if (await confirm(p, "§l" + k.name, body, "§aClaim", "§cBack")) giveKit(p, id);
    } };
  }));
}
async function kitAdmin(p) {
  const all = kits();
  await menu(p, "§lKit Manager", "§7Create kits from your current inventory.", [
    { text: "§l§aCreate Kit From Inventory", icon: "textures/ui/essx/icons/add", run: () => kitEditor(p) },
    ...Object.entries(all).map(([id, k]) => ({ text: "§l" + k.name + "\n§r§8" + id, icon: k.icon, run: () => menu(p, "§l" + k.name, "", [
      { text: "§lEdit Settings", icon: "textures/ui/essx/icons/settings", run: () => kitEditor(p, id) },
      { text: "§lReplace Items With My Inventory", icon: "textures/ui/essx/icons/inventory", run: () => { k.items = invItems(p); DB.kits.save(); ok(p, "Items updated."); } },
      { text: "§lPreview (give to me)", icon: "textures/ui/essx/icons/inventory", run: () => giveKit(p, id, true) },
      { text: "§lGive To Player", icon: "textures/ui/essx/icons/inventory", run: async () => { const t = findPlayer((await modal(p, "Give kit", [{ type: "text", key: "n", label: "Player" }]))?.n); if (t) { giveKit(t, id, true); ok(p, "Given."); } } },
      { text: "§lReset Cooldowns", icon: "textures/ui/essx/icons/clock", run: () => { for (const [pid, u] of DB.kitUse.entries()) delete u[id]; DB.kitUse.save(); ok(p, "Reset."); } },
      { text: "§l§cDelete Kit", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Delete", "Delete kit?")) { delete all[id]; DB.kits.save(); } } },
    ]) })),
  ]);
}
function invItems(p) {
  const c = inv(p); const out = [];
  for (let i = 0; i < c.size; i++) { const s = serializeItem(c.getItem(i)); if (s) out.push(s); }
  const eq = equip(p); for (const s of ARMOR_SLOTS) { const x = serializeItem(eq?.getEquipment(s)); if (x) out.push(x); }
  return out;
}
async function kitEditor(p, id) {
  const all = kits();
  const k = id ? all[id] : { name: "", cooldown: 86400, once: false, rank: "", money: 0, icon: "textures/blocks/chest_front" };
  const rk = ["", ...Object.keys(ranks())];
  const r = await modal(p, id ? "§lEdit Kit" : "§lNew Kit", [
    ...(id ? [] : [{ type: "text", key: "id", label: "Kit ID", placeholder: "pvp" }]),
    { type: "text", key: "name", label: "Display name", default: k.name },
    { type: "text", key: "cd", label: "Cooldown (seconds, 0 = none)", default: k.cooldown },
    { type: "toggle", key: "once", label: "One-time only", default: k.once },
    { type: "dropdown", key: "rank", label: "Required rank", options: rk.map((x) => x || "None"), default: Math.max(0, rk.indexOf(k.rank)) },
    { type: "text", key: "money", label: "Bonus money", default: k.money },
    { type: "text", key: "icon", label: "Icon", default: k.icon },
  ]);
  if (!r) return;
  const kid = id ?? String(r.id).toLowerCase().replace(/\s+/g, "_");
  if (!kid) return err(p, "Invalid id.");
  all[kid] = { ...k, name: r.name || kid, cooldown: +r.cd || 0, once: r.once, rank: rk[r.rank], money: +r.money || 0, icon: r.icon, items: id ? k.items : invItems(p) };
  DB.kits.save();
  ok(p, "Kit saved with " + all[kid].items.length + " items.");
}
cmd({ name: "kit", aliases: ["kits"], module: "kits", desc: "Claim kits", usage: "[name]", run: (p, a) => (a[0] ? giveKit(p, a[0].toLowerCase()) : kitsUI(p)) });
cmd({ name: "createkit", admin: true, module: "kits", desc: "Kit manager", run: kitAdmin });
addMember({ text: "§l§eKits\n§r§8Free item kits", icon: "textures/ui/essx/icons/inventory", module: "kits", run: kitsUI });
addAdmin({ text: "§l§eKit Manager\n§r§8Create / edit kits", icon: "textures/ui/essx/icons/inventory", module: "kits", run: kitAdmin });
// auto starter kit
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn || !mod("kits")) return;
  const p = ev.player;
  if (kits().starter && !DB.kitUse.get(p.id, {}).starter) system.runTimeout(() => { try { giveKit(p, "starter"); } catch {} }, 60);
});

// ================= DAILY REWARD =================
const DAY = 86400000;
function dayNum(t) { return Math.floor((t + 8 * 3600000) / DAY); } // Asia/Manila day boundary
function dailyInfo(p) {
  const d = DB.daily.get(p.id, { last: 0, streak: 0 });
  const today = dayNum(now());
  return { d, today, can: dayNum(d.last) !== today, streakNext: dayNum(d.last) === today - 1 ? Math.min(cfg().daily.maxStreak, d.streak + 1) : 1 };
}
function claimDaily(p) {
  const i = dailyInfo(p);
  if (!i.can) return err(p, "Already claimed today. Come back in §e" + fmtTime(DAY - ((now() + 8 * 3600000) % DAY)));
  const c = cfg().daily;
  const amt = c.base + c.streakBonus * (i.streakNext - 1);
  i.d.last = now(); i.d.streak = i.streakNext; DB.daily.set(p.id, i.d);
  addBal(p.id, amt);
  if (i.streakNext >= c.maxStreak) giveType(p, "minecraft:diamond", 2);
  ok(p, `Daily reward: §e${cur(amt)}§a | Streak: §e${i.streakNext} day(s)${i.streakNext >= c.maxStreak ? " §b+2 diamonds!" : ""}`);
  sound(p, "random.levelup");
}
cmd({ name: "daily", aliases: ["reward"], module: "daily", desc: "Claim daily reward", run: claimDaily });
addMember({ text: "§l§aDaily Reward\n§r§8Claim every day", icon: "textures/ui/essx/icons/gift", module: "daily", run: (p) => {
  const i = dailyInfo(p);
  return menu(p, "§lDaily Reward", `§7Streak: §e${i.d.streak} day(s)\n§7Status: ${i.can ? "§aReady!" : "§cClaimed today"}\n§7Base: §a${cur(cfg().daily.base)} §7+ ${cur(cfg().daily.streakBonus)}/day streak`, [{ text: "§l§aClaim", icon: "textures/ui/essx/icons/check", run: () => claimDaily(p) }]);
} });
system.runInterval(() => { if (!mod("daily")) return; for (const p of online()) if (dailyInfo(p).can) p.sendMessage("§a✦ Your §e!daily §areward is ready!"); }, 20 * 60 * 15);

// ================= REDEEM CODES =================
function redeem(p, code) {
  code = String(code ?? "").trim().toUpperCase();
  const c = DB.codes.get(code);
  if (!c) return err(p, "Invalid code.");
  if (c.expires && c.expires < now()) return err(p, "Code expired.");
  if (c.max && (c.used?.length ?? 0) >= c.max) return err(p, "Code fully redeemed.");
  if ((c.used ?? []).includes(p.id)) return err(p, "You already used this code.");
  c.used = [...(c.used ?? []), p.id]; DB.codes.save();
  if (c.money) addBal(p.id, c.money);
  for (const o of c.items ?? []) { const it = deserializeItem(o); if (it) giveItem(p, it); }
  if (c.kit && kits()[c.kit]) giveKit(p, c.kit, true);
  ok(p, `Code redeemed!${c.money ? " +" + cur(c.money) : ""}${c.items?.length ? " +" + c.items.length + " items" : ""}`);
  sound(p, "random.levelup");
  log("admin", `${p.name} redeemed ${code}`);
}
async function codeAdmin(p) {
  await menu(p, "§lRedeem Codes", "", [
    { text: "§l§aCreate Code", icon: "textures/ui/essx/icons/add", run: async () => {
      const kl = ["", ...Object.keys(kits())];
      const r = await modal(p, "§lNew Code", [
        { type: "text", key: "code", label: "Code", placeholder: "WELCOME2026" },
        { type: "text", key: "money", label: "Money reward", default: 500 },
        { type: "toggle", key: "hand", label: "Include item in my hand", default: false },
        { type: "dropdown", key: "kit", label: "Give kit", options: kl.map((x) => x || "None") },
        { type: "text", key: "max", label: "Max uses (0 = unlimited)", default: 0 },
        { type: "text", key: "hours", label: "Expires in hours (0 = never)", default: 0 },
      ]);
      if (!r?.code) return;
      const items = [];
      if (r.hand) { const c = inv(p).getItem(p.selectedSlotIndex); if (c) items.push(serializeItem(c)); }
      DB.codes.set(String(r.code).toUpperCase(), { money: +r.money || 0, items, kit: kl[r.kit], max: +r.max || 0, expires: +r.hours ? now() + +r.hours * 3600000 : 0, used: [] });
      ok(p, "Code created: §e" + String(r.code).toUpperCase());
    } },
    ...DB.codes.entries().map(([code, c]) => ({ icon: "textures/ui/essx/icons/gift", text: `§l${code}\n§r§8used ${c.used?.length ?? 0}/${c.max || "∞"}`, run: async () => { if (await confirm(p, "Delete", "Delete code " + code + "?")) { DB.codes.delete(code); ok(p, "Deleted."); } } })),
  ]);
}
cmd({ name: "redeem", aliases: ["code"], module: "redeem", desc: "Redeem a code", usage: "<code>", run: async (p, a) => { if (a[0]) return redeem(p, a[0]); const r = await modal(p, "§lRedeem Code", [{ type: "text", key: "c", label: "Enter code" }]); if (r?.c) redeem(p, r.c); } });
addMember({ text: "§l§dRedeem Code\n§r§8Enter a gift code", icon: "textures/ui/essx/icons/gift", module: "redeem", run: async (p) => { const r = await modal(p, "§lRedeem Code", [{ type: "text", key: "c", label: "Enter code" }]); if (r?.c) redeem(p, r.c); } });
addAdmin({ text: "§l§dRedeem Codes\n§r§8Create gift codes", icon: "textures/ui/essx/icons/gift", module: "redeem", run: codeAdmin });

// ================= QUESTS (daily) =================
const QUESTS = [
  { id: "kill_mobs", name: "Monster Hunter", desc: "Kill 25 monsters", type: "kill", target: 25, reward: 150 },
  { id: "kill_zombie", name: "Zombie Slayer", desc: "Kill 10 zombies", type: "kill:minecraft:zombie", target: 10, reward: 100 },
  { id: "mine_stone", name: "Miner", desc: "Mine 128 stone", type: "break:minecraft:stone", target: 128, reward: 120 },
  { id: "mine_diamond", name: "Diamond Digger", desc: "Mine 3 diamond ores", type: "break:diamond", target: 3, reward: 300 },
  { id: "chop", name: "Lumberjack", desc: "Chop 64 logs", type: "break:log", target: 64, reward: 120 },
  { id: "place", name: "Builder", desc: "Place 200 blocks", type: "place", target: 200, reward: 150 },
  { id: "pvp", name: "Gladiator", desc: "Kill 3 players", type: "kill:minecraft:player", target: 3, reward: 250 },
  { id: "farm", name: "Farmer", desc: "Harvest 64 wheat", type: "break:minecraft:wheat", target: 64, reward: 100 },
];
function qdata(p) {
  const d = DB.quests.get(p.id, { day: 0, prog: {}, done: [] });
  const today = dayNum(now());
  if (d.day !== today) { d.day = today; d.prog = {}; d.done = []; DB.quests.set(p.id, d); }
  return d;
}
function progress(p, type) {
  if (!mod("quests")) return;
  const d = qdata(p);
  let changed = false;
  for (const q of QUESTS) {
    if (d.done.includes(q.id)) continue;
    const [kind, ...rest] = q.type.split(":");
    const match = rest.join(":");
    if (!type.startsWith(kind)) continue;
    const val = type.slice(kind.length + 1);
    if (match && !val.includes(match)) continue;
    d.prog[q.id] = (d.prog[q.id] ?? 0) + 1;
    changed = true;
    if (d.prog[q.id] >= q.target) {
      d.done.push(q.id); addBal(p.id, q.reward);
      questCompleteNotice(p, q.name, cur(q.reward));
      sound(p, "random.levelup");
    }
  }
  if (changed) DB.quests.save();
}
world.afterEvents.entityDie.subscribe((ev) => {
  const k = ev.damageSource?.damagingEntity;
  if (k?.typeId !== "minecraft:player") return;
  const fam = ev.deadEntity.getComponent?.("minecraft:type_family");
  const t = ev.deadEntity.typeId;
  if (fam?.hasTypeFamily("monster")) progress(k, "kill");
  progress(k, "kill:" + t);
});
world.afterEvents.playerBreakBlock.subscribe((ev) => progress(ev.player, "break:" + ev.brokenBlockPermutation.type.id));
world.afterEvents.playerPlaceBlock.subscribe((ev) => progress(ev.player, "place:" + ev.block.typeId));
async function questsUI(p) {
  const d = qdata(p);
  const body = QUESTS.map((q) => `${d.done.includes(q.id) ? "§a✔" : "§7○"} §f${q.name} §8- §7${q.desc}\n   §e${Math.min(d.prog[q.id] ?? 0, q.target)}/${q.target} §8| §a${cur(q.reward)}`).join("\n");
  await menu(p, "§lDaily Quests", body + "\n\n§7Quests reset every day.", [{ text: "§lClose", icon: "textures/ui/essx/icons/close" }]);
}
cmd({ name: "quests", aliases: ["quest", "q"], module: "quests", desc: "Daily quests", run: questsUI });
addMember({ text: "§l§6Daily Quests\n§r§8Complete for money", icon: "textures/ui/essx/icons/quest", module: "quests", run: questsUI });

// ================= REPORTS =================
async function reportUI(p) {
  const others = online().filter((o) => o.id !== p.id);
  const names = others.map((o) => o.name);
  const r = await modal(p, "§lReport", [
    { type: "dropdown", key: "type", label: "Type", options: ["Player", "Bug", "Other"] },
    { type: "dropdown", key: "who", label: "Player (if reporting a player)", options: names.length ? ["None", ...names] : ["None"] },
    { type: "dropdown", key: "cat", label: "Reason", options: ["Hacking / Cheats", "Griefing", "Chat abuse", "Scamming", "Bug", "Other"] },
    { type: "text", key: "d", label: "Details", placeholder: "Describe what happened" },
  ]);
  if (!r) return;
  const rep = { id: now().toString(36), by: p.id, type: ["Player", "Bug", "Other"][r.type], target: r.who > 0 ? names[r.who - 1] : "", reason: ["Hacking / Cheats", "Griefing", "Chat abuse", "Scamming", "Bug", "Other"][r.cat], details: r.d, at: now(), loc: { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z), dim: p.dimension.id }, status: "open" };
  DB.reports.data.list.push(rep); DB.reports.save();
  ok(p, "Report sent. Thank you!");
  for (const o of online()) if (isAdmin(o)) { o.sendMessage(`§c[Report] §e${p.name}§f reported §c${rep.target || rep.type}§f: ${rep.reason}`); sound(o, "note.pling"); }
  log("report", `${p.name} reported ${rep.target || rep.type}: ${rep.reason} - ${rep.details}`);
}
async function reportsAdmin(p) {
  const l = DB.reports.data.list.filter((x) => x.status === "open").reverse();
  await menu(p, "§lReports", l.length ? `§7${l.length} open report(s)` : "§7No open reports.", [
    ...l.map((rep) => ({ icon: "textures/ui/essx/icons/flag", text: `§l${rep.target || rep.type}: ${rep.reason}\n§r§8by ${nameOf(rep.by)} ${fmtTime(now() - rep.at)} ago`, run: () => menu(p, "§lReport", `§fBy: §e${nameOf(rep.by)}\n§fType: §7${rep.type}\n§fTarget: §c${rep.target || "-"}\n§fReason: §7${rep.reason}\n§fDetails: §f${rep.details || "-"}\n§fLocation: §7${rep.loc.x}, ${rep.loc.y}, ${rep.loc.z}`, [
      { text: "§l§bTeleport To Location", icon: "textures/ui/essx/icons/teleport", run: () => p.teleport(rep.loc, { dimension: world.getDimension(rep.loc.dim) }) },
      { text: "§l§aMark Resolved", icon: "textures/ui/essx/icons/check", run: () => { rep.status = "closed"; DB.reports.save(); ok(p, "Resolved."); const r = online().find((o) => o.id === rep.by); if (r) ok(r, "Your report was reviewed by staff."); } },
      { text: "§l§cDelete", icon: "textures/ui/essx/icons/delete", run: () => { DB.reports.data.list = DB.reports.data.list.filter((x) => x.id !== rep.id); DB.reports.save(); } },
    ]) })),
    { text: "§l§7Clear Closed Reports", icon: "textures/ui/essx/icons/delete", run: () => { DB.reports.data.list = DB.reports.data.list.filter((x) => x.status === "open"); DB.reports.save(); ok(p, "Cleared."); } },
  ]);
}
cmd({ name: "report", module: "reports", desc: "Report a player or bug", usage: "[player] [reason]",
  run: (p, a) => {
    if (!a.length) return reportUI(p);
    const target = a.shift(); const reason = a.join(" ") || "No reason";
    DB.reports.data.list.push({ id: now().toString(36), by: p.id, type: "Player", target, reason, details: "", at: now(), loc: { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z), dim: p.dimension.id }, status: "open" });
    DB.reports.save(); ok(p, "Report sent.");
    for (const o of online()) if (isAdmin(o)) o.sendMessage(`§c[Report] §e${p.name}§f reported §c${target}§f: ${reason}`);
  } });
cmd({ name: "reports", admin: true, module: "reports", desc: "View reports", run: reportsAdmin });
addMember({ text: "§l§cReport\n§r§8Report player / bug", icon: "textures/ui/essx/icons/flag", module: "reports", run: reportUI });
addAdmin({ text: "§l§cReports\n§r§8Player reports", icon: "textures/ui/essx/icons/flag", module: "reports", run: reportsAdmin });

// ================= RULES =================
cmd({ name: "setrules", admin: true, desc: "Edit server rules (use | between rules)", usage: "<rule1 | rule2 | ...>",
  run: (p, a) => { const c = cfg(); c.server.rules = a.join(" ").split("|").map((s) => s.trim()).filter(Boolean); saveCfg(); ok(p, "Rules updated."); } });
