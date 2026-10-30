// EssentialsX AIO - By Opiar | Menu add-ons: dashboard, maintenance, chat control, rules, mass actions, lookup, online players, my settings
import { world, system } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, saveCfg, CREDITS } from "../core/config.js";
import { cmd, addAdmin, addMember, dispatch } from "../core/commands.js";
import { ok, err, msg, isAdmin, menu, modal, confirm, pickPlayer, now, fmtTime, fmtNum, cur, log, online, broadcast, cmdRun, idByName, nameOf, byId, sound } from "../core/utils.js";
import { chatHooks } from "./chat.js";
import { rankPrefix } from "./ranks.js";
import { bal } from "./economy.js";
import { profileUI } from "./display.js";
import { manageAccountUI } from "./login.js";

const startedAt = now();
const on = (v) => (v ? "§aON" : "§cOFF");
const q = (name) => `"${String(name).replace(/"/g, "")}"`;

// Re-opens the menu after a toggle button (marked keep: true) so the state refreshes in place.
async function loopMenu(build) {
  while (true) {
    const b = await build();
    if (!b?.keep) return;
  }
}

// ================= TPS SAMPLER =================
const samples = [];
let lastSample = Date.now();
system.runInterval(() => {
  const t = Date.now();
  samples.push(Math.min(20, 20 / Math.max(0.001, (t - lastSample) / 1000)));
  lastSample = t;
  if (samples.length > 15) samples.shift();
}, 20);
export const tps = () => (samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 20);

// ================= MAINTENANCE =================
function kickNonAdmins(reason) {
  for (const o of online()) if (!isAdmin(o)) cmdRun(`kick ${q(o.name)} ${reason.replace(/§./g, "")}`);
}
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const p = ev.player, s = cfg().server;
  if (s.maintenance && !isAdmin(p)) system.runTimeout(() => cmdRun(`kick ${q(p.name)} ${s.maintenanceMsg.replace(/§./g, "")}`), 10);
  else if (s.motd) system.runTimeout(() => { try { p.sendMessage("§8[§bMOTD§8] §f" + s.motd); } catch {} }, 100);
});

// ================= CHAT CONTROL (lock, slow mode, staff chat) =================
const staffChatOn = new Set();
const lastSlow = new Map();
function staffSend(p, text) {
  for (const o of online()) if (isAdmin(o)) o.sendMessage(`§c[Staff] §e${p.name}§7: §f${text}`);
}
chatHooks.intercept.push((p, text) => {
  const s = cfg().server;
  if (isAdmin(p)) {
    if (!staffChatOn.has(p.id)) return false;
    system.run(() => staffSend(p, text));
    return true;
  }
  if (s.chatLocked) { system.run(() => err(p, "Chat is locked by staff.")); return true; }
  if (s.slowModeSec > 0) {
    const left = s.slowModeSec * 1000 - (now() - (lastSlow.get(p.id) ?? 0));
    if (left > 0) { system.run(() => err(p, `Slow mode: wait ${Math.ceil(left / 1000)}s.`)); return true; }
    lastSlow.set(p.id, now());
  }
  return false;
});
function clearChat(p) {
  for (const o of online()) for (let i = 0; i < 100; i++) o.sendMessage(" ");
  broadcast("§7Chat was cleared by §e" + p.name);
}
async function chatControlUI(p) {
  await loopMenu(() => {
    const s = cfg().server;
    return menu(p, "§lChat Control", "§7Manage who can talk and how fast.", [
      { text: `§l§eLock Chat: ${on(s.chatLocked)}\n§r§8Only staff can talk`, icon: "textures/ui/lock_color", keep: true, run: () => { s.chatLocked = !s.chatLocked; saveCfg(); broadcast(s.chatLocked ? "§cChat has been locked by staff." : "§aChat has been unlocked."); log("admin", `${p.name} ${s.chatLocked ? "locked" : "unlocked"} chat`); } },
      { text: `§l§bSlow Mode: ${s.slowModeSec ? "§a" + s.slowModeSec + "s" : "§cOFF"}\n§r§8Delay between messages`, icon: "textures/items/clock_item", keep: true, run: async () => {
        const r = await modal(p, "§lSlow Mode", [{ type: "slider", key: "s", label: "Seconds between messages (0 = off)", min: 0, max: 60, default: s.slowModeSec }]);
        if (r) { s.slowModeSec = r.s; saveCfg(); ok(p, "Slow mode " + (r.s ? r.s + "s" : "off") + "."); }
      } },
      { text: `§l§cStaff Chat: ${on(staffChatOn.has(p.id))}\n§r§8Your messages go to staff only`, icon: "textures/items/book_writable", keep: true, run: () => { if (staffChatOn.has(p.id)) staffChatOn.delete(p.id); else staffChatOn.add(p.id); } },
      { text: "§l§7Clear Chat\n§r§8Wipe chat for everyone", icon: "textures/ui/essx/icons/delete", run: () => clearChat(p) },
    ]);
  });
}

// ================= DASHBOARD =================
function countEntities() {
  let all = 0, items = 0, mobs = 0;
  for (const d of ["overworld", "nether", "the_end"]) {
    try {
      const dim = world.getDimension(d);
      all += dim.getEntities().length;
      items += dim.getEntities({ type: "minecraft:item" }).length;
      mobs += dim.getEntities({ families: ["monster"] }).length;
    } catch {}
  }
  return { all, items, mobs };
}
async function dashboardUI(p) {
  const e = countEntities();
  const t = tps();
  const tc = t >= 18 ? "§a" : t >= 14 ? "§e" : "§c";
  const bans = DB.bans.entries().filter(([, b]) => !b.until || b.until > now()).length;
  const mutes = DB.mutes.entries().filter(([, m]) => !m.until || m.until > now()).length;
  const reports = DB.reports.data.list.filter((x) => x.status === "open").length;
  const s = cfg().server;
  const body = [
    "§l§bServer Status",
    `§fTPS: ${tc}${t.toFixed(1)}§7/20`,
    `§fUptime: §e${fmtTime(now() - startedAt)}`,
    `§fOnline: §a${online().length} §7(staff ${online().filter(isAdmin).length})`,
    `§fRegistered players: §b${DB.players.keys().length}`,
    "",
    "§l§bWorld",
    `§fEntities: §e${fmtNum(e.all)} §7| Items: §6${fmtNum(e.items)} §7| Hostile: §c${fmtNum(e.mobs)}`,
    `§fDay: §e${world.getDay()}`,
    "",
    "§l§bModeration",
    `§fActive bans: §c${bans} §7| Mutes: §6${mutes} §7| Open reports: §e${reports}`,
    `§fMaintenance: ${on(s.maintenance)} §7| Chat locked: ${on(s.chatLocked)}`,
    "",
    CREDITS,
  ].join("\n");
  await menu(p, "§lServer Dashboard", body, [
    { text: "§l§aRefresh", icon: "textures/ui/essx/icons/rotate", run: () => dashboardUI(p) },
  ]);
}

// ================= MAINTENANCE UI =================
async function maintenanceUI(p) {
  await loopMenu(() => {
    const s = cfg().server;
    return menu(p, "§lMaintenance Mode", `§7When ON, only staff can join and non-staff are kicked.\n§fKick message: §7${s.maintenanceMsg}`, [
      { text: `§l§eMaintenance: ${on(s.maintenance)}`, icon: "textures/ui/essx/icons/settings", keep: true, run: async () => {
        const next = !s.maintenance;
        if (next && !(await confirm(p, "Enable maintenance", "Kick all non-staff players and block joining?"))) return;
        s.maintenance = next; saveCfg();
        if (next) { broadcast("§c§lServer is entering maintenance mode."); system.runTimeout(() => kickNonAdmins(s.maintenanceMsg), 40); }
        ok(p, "Maintenance " + (next ? "enabled." : "disabled."));
        log("admin", `${p.name} ${next ? "enabled" : "disabled"} maintenance`);
      } },
      { text: "§l§bEdit Kick Message", icon: "textures/items/book_writable", keep: true, run: async () => {
        const r = await modal(p, "§lKick Message", [{ type: "text", key: "m", label: "Shown to kicked players", default: s.maintenanceMsg }]);
        if (r?.m) { s.maintenanceMsg = r.m; saveCfg(); ok(p, "Saved."); }
      } },
    ]);
  });
}

// ================= RULES & MOTD =================
async function rulesEditUI(p) {
  await loopMenu(() => {
    const s = cfg().server;
    return menu(p, "§lRules & MOTD", `§fMOTD: §7${s.motd || "(none)"}\n\n` + (s.rules.map((r, i) => `§e${i + 1}. §f${r}`).join("\n") || "§7No rules yet."), [
      { text: "§l§aAdd Rule", icon: "textures/ui/essx/icons/add", keep: true, run: async () => { const r = await modal(p, "§lAdd Rule", [{ type: "text", key: "t", label: "Rule text" }]); if (r?.t) { s.rules.push(r.t); saveCfg(); ok(p, "Rule added."); } } },
      { text: "§l§bEdit MOTD\n§r§8Shown to players when they join", icon: "textures/items/paper", keep: true, run: async () => { const r = await modal(p, "§lMOTD", [{ type: "text", key: "m", label: "Message (empty = off)", default: s.motd }]); if (r) { s.motd = r.m; saveCfg(); ok(p, "MOTD saved."); } } },
      ...s.rules.map((r, i) => ({ icon: "textures/ui/essx/icons/delete", text: `§c✖ §r${i + 1}. ${r.slice(0, 28)}`, keep: true, run: () => { s.rules.splice(i, 1); saveCfg(); ok(p, "Rule removed."); } })),
    ]);
  });
}

// ================= MASS ACTIONS =================
async function massUI(p) {
  await menu(p, "§lMass Actions", "§7Affects many players or entities at once.", [
    { text: "§l§bBring Everyone\n§r§8Teleport all players to you", icon: "textures/items/ender_pearl", run: async () => { if (!(await confirm(p, "Bring everyone", "Teleport all players to your location?"))) return; let n = 0; for (const o of online()) if (o.id !== p.id) { o.teleport(p.location, { dimension: p.dimension }); n++; } ok(p, `Brought ${n} player(s).`); log("admin", `${p.name} brought everyone`); } },
    { text: "§l§aHeal & Feed Everyone", icon: "textures/items/apple_golden", run: () => { for (const o of online()) { o.getComponent("minecraft:health")?.resetToMaxValue(); o.addEffect("saturation", 20, { amplifier: 255, showParticles: false }); } ok(p, "Everyone healed and fed."); } },
    { text: "§l§4Kick All Non-Staff", icon: "textures/ui/essx/icons/close", run: async () => { if (!(await confirm(p, "Kick everyone", "Kick every non-staff player?"))) return; kickNonAdmins("Kicked by staff"); log("admin", `${p.name} kicked all non-staff`); } },
    { text: "§l§dSend Title to All", icon: "textures/items/book_writable", run: async () => { const r = await modal(p, "§lTitle", [{ type: "text", key: "t", label: "Title" }, { type: "text", key: "s", label: "Subtitle" }]); if (r?.t) for (const o of online()) { o.onScreenDisplay.setTitle(r.t, { subtitle: r.s, fadeInDuration: 10, stayDuration: 70, fadeOutDuration: 10 }); sound(o, "random.levelup"); } } },
  ]);
}

// ================= MUTE LIST =================
async function muteListUI(p) {
  const list = DB.mutes.entries().filter(([, m]) => !m.until || m.until > now());
  await menu(p, "§lMuted Players", list.length ? "§7Tap a player to unmute." : "§7Nobody is muted.", list.map(([id, m]) => ({
    text: `§l${m.name ?? nameOf(id)}\n§r§8${m.until ? fmtTime(m.until - now()) + " left" : "Permanent"} - ${m.reason ?? "-"}`,
    icon: "textures/ui/mute_on",
    run: async () => { if (await confirm(p, "Unmute", `Unmute ${m.name ?? nameOf(id)}?\nBy: ${m.by ?? "?"}`)) { DB.mutes.delete(id); ok(p, "Unmuted."); log("mute", `${p.name} unmuted ${m.name}`); } },
  })));
}

// ================= OFFLINE PLAYER LOOKUP =================
async function lookupUI(p) {
  const r = await modal(p, "§lPlayer Lookup", [{ type: "text", key: "n", label: "Player name (online or offline)", placeholder: "Steve" }], "Search");
  if (!r?.n) return;
  const id = idByName(r.n.trim());
  if (!id) return err(p, "No player found with that name.");
  await lookupPanel(p, id);
}
async function lookupPanel(p, id) {
  const name = nameOf(id);
  const d = DB.players.get(id), pd = DB.pdata.get(id, {});
  const ban = DB.bans.get(id), mute = DB.mutes.get(id);
  const warns = pd.warns ?? [];
  const body = [
    `§fStatus: ${byId(id) ? "§aOnline" : "§7Offline (last seen " + fmtTime(now() - (d?.last ?? now())) + " ago)"}`,
    `§fRank: ${rankPrefix(id)}`,
    `§fBalance: §a${cur(bal(id))}`,
    `§fPlaytime: §e${fmtTime(d?.playtime ?? 0)}`,
    `§fBanned: ${ban ? "§cYes §7- " + ban.reason : "§aNo"}`,
    `§fMuted: ${mute ? "§cYes §7- " + (mute.reason ?? "-") : "§aNo"}`,
    `§fWarnings: §6${warns.length}`,
    ...warns.slice(-5).map((w, i) => `§7  ${i + 1}. §f${w.reason} §8(${w.by}, ${fmtTime(now() - w.at)} ago)`),
  ].join("\n");
  await menu(p, "§lLookup: " + name, body, [
    { text: "§l§eClear Warnings", icon: "textures/ui/WarningGlyph", run: () => { pd.warns = []; DB.pdata.set(id, pd); ok(p, "Warnings cleared."); } },
    ban
      ? { text: "§l§aUnban", icon: "textures/ui/hammer_l", run: () => { DB.bans.delete(id); ok(p, "Unbanned " + name); log("ban", `${p.name} unbanned ${name}`); } }
      : { text: "§l§4Ban", icon: "textures/ui/hammer_l", run: async () => { const x = await modal(p, "Ban " + name, [{ type: "text", key: "d", label: "Duration (30m, 2h, 7d, perm)", default: "perm" }, { type: "text", key: "r", label: "Reason", default: "Breaking rules" }]); if (x) dispatch(p, `ban ${q(name)} ${x.d || "perm"} ${x.r}`); } },
    mute
      ? { text: "§l§aUnmute", icon: "textures/ui/mute_on", run: () => { DB.mutes.delete(id); ok(p, "Unmuted."); } }
      : { text: "§l§6Mute", icon: "textures/ui/mute_on", run: async () => { const x = await modal(p, "Mute " + name, [{ type: "text", key: "d", label: "Duration", default: "30m" }, { type: "text", key: "r", label: "Reason", default: "Chat abuse" }]); if (x) dispatch(p, `mute ${q(name)} ${x.d || "perm"} ${x.r}`); } },
    { text: "§l§bView Profile", icon: "textures/ui/icon_steve", run: () => profileUI(p, id, true) },
  ]);
}

// ================= ADMIN MENU ENTRIES =================
cmd({ name: "dashboard", aliases: ["dash", "status"], admin: true, desc: "Server dashboard", run: dashboardUI });
cmd({ name: "maintenance", aliases: ["maint"], admin: true, desc: "Maintenance mode", run: maintenanceUI });
cmd({ name: "chatcontrol", aliases: ["chatmenu"], admin: true, desc: "Chat lock, slow mode, staff chat", run: chatControlUI });
cmd({ name: "lockchat", aliases: ["mutechat"], admin: true, desc: "Toggle chat lock", run: (p) => { const s = cfg().server; s.chatLocked = !s.chatLocked; saveCfg(); broadcast(s.chatLocked ? "§cChat has been locked by staff." : "§aChat has been unlocked."); } });
cmd({ name: "slowmode", admin: true, desc: "Set chat slow mode", usage: "<seconds>", run: (p, a) => { const s = cfg().server; s.slowModeSec = Math.max(0, Math.min(60, parseInt(a[0]) || 0)); saveCfg(); ok(p, "Slow mode " + (s.slowModeSec ? s.slowModeSec + "s" : "off") + "."); } });
cmd({ name: "lookup", aliases: ["whois"], admin: true, desc: "Look up any player (offline too)", usage: "[player]", run: async (p, a) => { if (!a[0]) return lookupUI(p); const id = idByName(a[0]); if (!id) return err(p, "No player found."); lookupPanel(p, id); } });
cmd({ name: "mutelist", admin: true, desc: "Muted players", run: muteListUI });

addAdmin({ text: "§l§aServer Dashboard\n§r§8TPS, entities, moderation stats", icon: "textures/ui/essx/icons/hologram", run: dashboardUI });
addAdmin({ text: "§l§eChat Control\n§r§8Lock, slow mode, staff chat", icon: "textures/ui/essx/icons/chat", run: chatControlUI });
addAdmin({ text: "§l§6Maintenance Mode\n§r§8Staff-only server", icon: "textures/ui/essx/icons/lock", run: maintenanceUI });
addAdmin({ text: "§l§bPlayer Lookup\n§r§8Search offline players", icon: "textures/ui/essx/icons/search", run: lookupUI });
addAdmin({ text: "§l§6Muted Players\n§r§8View & unmute", icon: "textures/ui/essx/icons/mute", run: muteListUI });
addAdmin({ text: "§l§dRules & MOTD\n§r§8Edit server rules", icon: "textures/ui/essx/icons/rules", run: rulesEditUI });
addAdmin({ text: "§l§cMass Actions\n§r§8Bring all, heal all, kick, title", icon: "textures/ui/essx/icons/mass", run: massUI });

// ================= MEMBER: ONLINE PLAYERS =================
async function playerActionUI(p, t) {
  if (!t?.isValid) return err(p, "That player is no longer online.");
  const btns = [{ text: "§l§eView Profile", icon: "textures/ui/icon_steve", run: () => profileUI(p, t.id, true) }];
  if (t.id !== p.id) {
    btns.push({ text: "§l§dSend Message", icon: "textures/items/paper", run: async () => { const r = await modal(p, "Message " + t.name, [{ type: "text", key: "m", label: "Message" }], "Send"); if (r?.m) dispatch(p, `msg ${q(t.name)} ${r.m}`); } });
    btns.push({ text: "§l§bRequest Teleport (TPA)", icon: "textures/items/ender_pearl", run: () => dispatch(p, `tpa ${q(t.name)}`) });
    btns.push({ text: "§l§3Request Them Here (TPAHere)", icon: "textures/items/ender_eye", run: () => dispatch(p, `tpahere ${q(t.name)}`) });
    btns.push({ text: "§l§cReport Player", icon: "textures/ui/WarningGlyph", run: async () => { const r = await modal(p, "Report " + t.name, [{ type: "text", key: "r", label: "Reason" }], "Send"); if (r?.r) dispatch(p, `report ${q(t.name)} ${r.r}`); } });
  }
  await menu(p, "§l" + t.name, `§fRank: ${rankPrefix(t.id)}\n§fBalance: §a${cur(bal(t.id))}`, btns);
}
export async function onlinePlayersUI(p) {
  const list = online();
  await menu(p, "§lOnline Players", `§7${list.length} online. Tap a player for actions.`, list.map((o) => ({
    text: `§l${o.name}${o.id === p.id ? " §7(you)" : ""}\n§r${rankPrefix(o.id)}`,
    icon: "textures/ui/icon_steve",
    run: () => playerActionUI(p, o),
  })));
}
cmd({ name: "players", aliases: ["playerlist"], desc: "Online players menu", run: onlinePlayersUI });

// ================= MEMBER: SERVER INFO & RULES =================
async function serverInfoUI(p) {
  const s = cfg().server;
  const staff = online().filter(isAdmin);
  const body = [
    `§l${cfg().serverName}`,
    s.motd ? `§7${s.motd}` : "",
    "",
    `§fOnline: §a${online().length} §7| §fUptime: §e${fmtTime(now() - startedAt)}`,
    `§fStaff online: ${staff.length ? staff.map((o) => "§e" + o.name).join("§7, ") : "§7none"}`,
    "",
    "§l§eRules",
    ...(s.rules.length ? s.rules.map((r, i) => `§e${i + 1}. §f${r}`) : ["§7No rules set."]),
    "",
    CREDITS,
  ].join("\n");
  await menu(p, "§lServer Info & Rules", body, [{ text: "§l§bCommand List", icon: "textures/items/book_normal", run: () => dispatch(p, "help") }]);
}
cmd({ name: "rules", aliases: ["info", "serverinfo"], desc: "Server rules & info", run: serverInfoUI });
addMember({ category: "community", order: -3, text: "§l§eServer Info & Rules\n§r§8MOTD, staff online, rules", icon: "textures/ui/essx/icons/rules", run: serverInfoUI });

// ================= MEMBER: MY SETTINGS =================
async function ignoreListUI(p) {
  const ign = DB.pdata.get(p.id)?.ignore ?? [];
  await menu(p, "§lIgnore List", ign.length ? "§7Tap a player to stop ignoring them." : "§7You are not ignoring anyone.", [
    { text: "§l§aIgnore Someone\n§r§8Pick an online player", icon: "textures/ui/essx/icons/add", run: async () => { const t = await pickPlayer(p, "§lIgnore Player"); if (t) dispatch(p, `ignore ${q(t.name)}`); } },
    ...ign.map((id) => ({ text: "§l" + nameOf(id), icon: "textures/ui/icon_steve", run: () => { const d = DB.pdata.get(p.id, {}); d.ignore = (d.ignore ?? []).filter((x) => x !== id); DB.pdata.set(p.id, d); ok(p, "No longer ignoring " + nameOf(id)); } })),
  ]);
}
async function mySettingsUI(p) {
  await loopMenu(() => {
    const d = DB.pdata.get(p.id, {});
    return menu(p, "§lMy Settings", "§7Personal preferences.", [
      { text: "§l§bManage Account\n§r§8Reset your password", icon: "textures/ui/essx/icons/account", run: () => manageAccountUI(p) },
      { text: `§l§bTeleport Requests: ${on(d.tpToggle !== false)}\n§r§8Let others TPA to you`, icon: "textures/items/ender_pearl", keep: true, run: () => { const x = DB.pdata.get(p.id, {}); x.tpToggle = x.tpToggle === false; DB.pdata.set(p.id, x); } },
      { text: `§l§dPrivate Messages: ${on(!d.dmOff)}\n§r§8Receive /msg from others`, icon: "textures/items/paper", keep: true, run: () => { const x = DB.pdata.get(p.id, {}); x.dmOff = !x.dmOff; DB.pdata.set(p.id, x); } },
      { text: "§l§eIgnore List\n§r§8Manage ignored players", icon: "textures/ui/mute_on", keep: true, run: () => ignoreListUI(p) },
      { text: "§l§aToggle Personal HUD\n§r§8Actionbar stats", icon: "textures/items/clock_item", run: () => dispatch(p, "hud") },
      { text: "§l§7Toggle AFK", icon: "textures/ui/dev_glyph_color", run: () => dispatch(p, "afk") },
    ]);
  });
}
cmd({ name: "settings2", aliases: ["mysettings", "prefs"], desc: "Your personal settings", run: mySettingsUI });
addMember({ category: "settings", text: "§l§7My Settings\n§r§8Account, TPA, messages, ignore list", icon: "textures/ui/essx/icons/settings", run: mySettingsUI });
