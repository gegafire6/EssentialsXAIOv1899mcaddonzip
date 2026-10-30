// EssentialsX AIO - By Opiar | Chat, join/leave, private messages, mutes
import { world, system } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod } from "../core/config.js";
import { cmd, dispatch } from "../core/commands.js";
import { msg, ok, err, findPlayer, isAdmin, now, fmtTime, log, online, broadcast, sound, giveItem } from "../core/utils.js";
import { rankPrefix, chatRankPrefix } from "./ranks.js";
import { ItemStack } from "@minecraft/server";

export const chatHooks = { format: [], intercept: [] }; // intercept(p, msg) -> true to consume
const lastChat = new Map();
const lastMsg = new Map();
const replyTo = new Map();
export const socialSpy = new Set();

export function isMuted(id) {
  const m = DB.mutes.get(id);
  if (!m) return false;
  if (m.until && m.until < now()) { DB.mutes.delete(id); return false; }
  return m;
}

export function filter(text) {
  if (!mod("filter")) return text;
  for (const w of cfg().chat.filterWords) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    text = text.replace(re, "*".repeat(w.length));
  }
  return text;
}

world.beforeEvents.chatSend.subscribe((ev) => {
  const p = ev.sender;
  const text = ev.message;
  const pre = cfg().prefix;
  if (text.startsWith(pre) && text.length > pre.length) {
    ev.cancel = true;
    const raw = text.slice(pre.length);
    system.run(() => dispatch(p, raw));
    return;
  }
  for (const fn of chatHooks.intercept) {
    if (fn(p, text)) { ev.cancel = true; return; }
  }
  if (!mod("chat")) return;
  ev.cancel = true;
  system.run(() => sendChat(p, text));
});

function sendChat(p, text) {
  const m = isMuted(p.id);
  if (m) return err(p, `You are muted${m.until ? " for " + fmtTime(m.until - now()) : ""}. §7Reason: ${m.reason ?? "-"}`);
  if (mod("antispam") && !isAdmin(p)) {
    const last = lastChat.get(p.id) ?? 0;
    if (now() - last < cfg().chat.cooldownMs) return err(p, "Slow down! You're chatting too fast.");
    if (lastMsg.get(p.id) === text.toLowerCase()) return err(p, "Don't repeat the same message.");
    const caps = text.replace(/[^A-Za-z]/g, "");
    if (caps.length > 6 && (caps.replace(/[^A-Z]/g, "").length / caps.length) * 100 > cfg().chat.maxCaps) text = text.toLowerCase();
  }
  lastChat.set(p.id, now());
  lastMsg.set(p.id, text.toLowerCase());
  if (!isAdmin(p)) text = text.replace(/§|[\uE500-\uE7FF]/g, "");
  text = filter(text);
  let clan = "";
  for (const fn of chatHooks.format) clan = fn(p) ?? clan;
  const rank = chatRankPrefix(p.id);
  // Remove the empty slot's following separator, leaving normal names/messages aligned.
  const format = rank ? cfg().chat.format : cfg().chat.format.replace(/\{rank\} ?/g, "");
  const line = format
    .replace("{rank}", rank)
    .replace("{clan}", clan)
    .replace("{name}", p.name)
    .replace("{msg}", text);
  world.sendMessage(line);
  log("chat", `${p.name}: ${text}`);
}

// ---- Join / Leave ----
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player;
  const first = !DB.players.has(p.id);
  const d = DB.players.get(p.id, { name: p.name, first: now(), last: now(), playtime: 0 });
  d.name = p.name; d.last = now();
  DB.players.set(p.id, d);
  const c = cfg();
  if (first) {
    if (c.firstJoinBroadcast) broadcast(c.firstJoinBroadcast.replace("{name}", p.name));
    if (c.giveMenuItem) system.runTimeout(() => { try { giveItem(p, new ItemStack("essx:menu", 1)); } catch {} }, 40);
  }
  if (c.welcomeMessage) system.runTimeout(() => { try { msg(p, c.welcomeMessage.replace("{name}", p.name)); } catch {} }, 60);
  if (c.joinMessage) broadcast(c.joinMessage.replace("{name}", p.name));
  log("join", p.name + (first ? " (first join)" : ""));
});
world.beforeEvents.playerLeave.subscribe((ev) => {
  const name = ev.player.name; const id = ev.player.id;
  system.run(() => {
    const d = DB.players.get(id);
    if (d) { d.last = now(); DB.players.save(); }
    if (cfg().leaveMessage) broadcast(cfg().leaveMessage.replace("{name}", name));
    log("leave", name);
  });
});
// playtime tracking
system.runInterval(() => {
  for (const p of online()) { const d = DB.players.get(p.id); if (d) d.playtime = (d.playtime ?? 0) + 60000; }
  DB.players.save();
}, 1200);

// ---- Private messages ----
function pm(p, t, text) {
  if (!mod("msg")) return err(p, "Private messages are disabled.");
  const m = isMuted(p.id); if (m) return err(p, "You are muted.");
  const ign = DB.pdata.get(t.id)?.ignore ?? [];
  if (ign.includes(p.id) && !isAdmin(p)) return err(p, t.name + " is ignoring you.");
  if (DB.pdata.get(t.id)?.dmOff && !isAdmin(p)) return err(p, t.name + " has private messages turned off.");
  text = filter(text);
  p.sendMessage(`§d[me -> ${t.name}] §f${text}`);
  t.sendMessage(`§d[${p.name} -> me] §f${text}`);
  sound(t, "random.orb", 1.5);
  replyTo.set(t.id, p.id); replyTo.set(p.id, t.id);
  for (const s of online()) if (socialSpy.has(s.id) && s.id !== p.id && s.id !== t.id) s.sendMessage(`§8[Spy] §7${p.name} -> ${t.name}: ${text}`);
  log("msg", `${p.name} -> ${t.name}: ${text}`);
}
cmd({ name: "msg", aliases: ["tell", "w", "m", "whisper"], module: "msg", desc: "Private message", usage: "<player> <message>",
  run: (p, a) => { const t = findPlayer(a.shift()); if (!t) return err(p, "Player not found."); if (!a.length) return err(p, "Type a message."); pm(p, t, a.join(" ")); } });
cmd({ name: "reply", aliases: ["r"], module: "msg", desc: "Reply to last message", usage: "<message>",
  run: (p, a) => { const t = online().find((o) => o.id === replyTo.get(p.id)); if (!t) return err(p, "No one to reply to."); pm(p, t, a.join(" ")); } });
cmd({ name: "ignore", module: "msg", desc: "Ignore/unignore player", usage: "<player>",
  run: (p, a) => {
    const t = findPlayer(a[0]); if (!t) return err(p, "Player not found.");
    const d = DB.pdata.get(p.id, {}); d.ignore = d.ignore ?? [];
    const i = d.ignore.indexOf(t.id);
    if (i >= 0) { d.ignore.splice(i, 1); ok(p, "No longer ignoring " + t.name); } else { d.ignore.push(t.id); ok(p, "Ignoring " + t.name); }
    DB.pdata.set(p.id, d);
  } });
cmd({ name: "socialspy", admin: true, desc: "See private messages", run: (p) => { if (socialSpy.has(p.id)) { socialSpy.delete(p.id); ok(p, "SocialSpy off"); } else { socialSpy.add(p.id); ok(p, "SocialSpy on"); } } });
cmd({ name: "staffchat", aliases: ["sc"], admin: true, desc: "Staff-only chat", usage: "<message>",
  run: (p, a) => { for (const o of online()) if (isAdmin(o)) o.sendMessage(`§c[Staff] §e${p.name}§7: §f${a.join(" ")}`); } });
cmd({ name: "clearchat", admin: true, desc: "Clear chat for everyone",
  run: (p) => { for (const o of online()) { for (let i = 0; i < 100; i++) o.sendMessage(" "); } broadcast("§7Chat was cleared by §e" + p.name); } });
cmd({ name: "me", module: "chat", desc: "Action message", usage: "<action>", run: (p, a) => { if (isMuted(p.id)) return err(p, "You are muted."); broadcast(`§d* ${p.name} ${filter(a.join(" "))}`); } });
cmd({ name: "list", aliases: ["online", "who"], desc: "Online players", run: (p) => { const o = online(); msg(p, `§fOnline (§a${o.length}§f): ` + o.map((x) => rankPrefix(x.id) + " §f" + x.name).join("§7, ")); } });
cmd({ name: "seen", desc: "When a player was last seen", usage: "<player>",
  run: (p, a) => {
    const n = (a[0] ?? "").toLowerCase();
    const e = DB.players.entries().find(([, d]) => d.name.toLowerCase() === n);
    if (!e) return err(p, "Never seen that player.");
    const on = online().some((o) => o.id === e[0]);
    msg(p, `§e${e[1].name}§f: ${on ? "§aonline now" : "last seen §e" + fmtTime(now() - e[1].last) + " ago"} §7| playtime ${fmtTime(e[1].playtime ?? 0)}`);
  } });
cmd({ name: "playtime", aliases: ["pt"], desc: "Your total playtime", run: (p) => msg(p, "Playtime: §e" + fmtTime(DB.players.get(p.id)?.playtime ?? 0)) });
