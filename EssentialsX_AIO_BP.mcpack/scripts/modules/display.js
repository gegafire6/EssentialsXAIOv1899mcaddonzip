// EssentialsX AIO - By Opiar | Sidebar, nametags, healthbar, holograms, leaderboards, stats, item tools
import { world, system, DisplaySlotId, ObjectiveSortOrder } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod, saveCfg } from "../core/config.js";
import { cmd, addAdmin, addMember } from "../core/commands.js";
import { msg, ok, err, nameOf, isAdmin, menu, modal, confirm, now, fmtTime, online, cur, fmtNum, heldItem, setHeld, findPlayer, loc, locStr, byId, idByName, dimName } from "../core/utils.js";
import { PLAYER_HEALTH_STYLES, playerHealthStyle, playerHealthNametag } from "../core/player-health.js";
import { registerPlugin } from "../core/plugins.js";
import { actionbarBusy, clearActionbarNotice } from "../core/actionbar.js";
import { buildSidebar, SIDEBAR_BACKGROUNDS, SIDEBAR_ICONS } from "../core/sidebar.js";
import { rankPrefix, rankIcon, rankBadge, nametagRankPrefix } from "./ranks.js";
import { bal, topList } from "./economy.js";
import { clanOf } from "./clans.js";
import { tps, onlinePlayersUI } from "./servertools.js";

// ================= STATS =================
function stat(id) { return DB.stats.get(id, { kills: 0, deaths: 0, mobs: 0, blocks: 0 }); }
world.afterEvents.entityDie.subscribe((ev) => {
  const d = ev.deadEntity, k = ev.damageSource?.damagingEntity;
  if (d.typeId === "minecraft:player") { const s = stat(d.id); s.deaths++; DB.stats.set(d.id, s); }
  if (k?.typeId === "minecraft:player" && k.id !== d.id) { const s = stat(k.id); if (d.typeId === "minecraft:player") s.kills++; else s.mobs++; DB.stats.set(k.id, s); }
});
world.afterEvents.playerBreakBlock.subscribe((ev) => { const s = stat(ev.player.id); s.blocks++; DB.stats.data[ev.player.id] = s; DB.stats.save(); });
function profileText(viewer, id) {
  const s = stat(id);
  const d = DB.players.get(id);
  const t = byId(id);
  const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills;
  const cl = clanOf(id);
  const lines = [
    `§fStatus: ${t ? "§aOnline now" : "§7Offline - last seen " + fmtTime(now() - (d?.last ?? now())) + " ago"}`,
    `§fRank: ${rankPrefix(id)}`,
    `§fClan: §b${cl ? "[" + cl.c.tag + "] " + cl.c.name : "-"}`,
    `§fBalance: §a${cur(bal(id))}`,
  ];
  if (t) {
    const h = t.getComponent("minecraft:health");
    if (h) lines.push(`§fHealth: §c${Math.ceil(h.currentValue)}§7/${Math.round(h.effectiveMax)}`);
    lines.push(`§fDimension: §d${dimName(t.dimension.id)}`);
    if (isAdmin(viewer)) lines.push(`§fLocation: §7${locStr(loc(t))}`);
  }
  lines.push(
    `§fKills: §c${s.kills} §f| Deaths: §7${s.deaths} §f| K/D: §e${kd}`,
    `§fMobs killed: §6${s.mobs}`,
    `§fBlocks mined: §b${fmtNum(s.blocks)}`,
    `§fPlaytime: §e${fmtTime(d?.playtime ?? 0)}`,
    `§fFirst joined: §7${fmtTime(now() - (d?.first ?? now()))} ago`,
  );
  return lines.join("\n");
}
export async function profileUI(p, id, fromList = false) {
  const name = nameOf(id);
  const buttons = fromList ? [{ text: "§lBack", icon: "textures/ui/essx/icons/back" }, { text: "§lClose", icon: "textures/ui/essx/icons/close" }] : [{ text: "§lClose", icon: "textures/ui/essx/icons/close" }];
  await menu(p, (id === p.id ? "§lMy Profile: " : "§lProfile: ") + name, profileText(p, id), buttons);
}
async function viewOtherUI(p) {
  const others = online().filter((o) => o.id !== p.id);
  const offline = DB.players.entries()
    .filter(([id]) => id !== p.id && !byId(id))
    .sort((a, b) => (b[1].last ?? 0) - (a[1].last ?? 0))
    .slice(0, 15);
  await menu(p, "§lView Other Player", `§7Online: §a${others.length} §7| Recently seen: §e${offline.length}`, [
    { text: "§l§bSearch Player\n§r§8Type a name (online or offline)", icon: "textures/ui/essx/icons/search", run: async () => {
      const r = await modal(p, "§lSearch Player", [{ type: "text", key: "n", label: "Player name", placeholder: "Steve" }], "Search");
      if (!r?.n) return;
      const id = idByName(r.n.trim());
      if (!id) return err(p, "No player found with that name.");
      await profileUI(p, id, true);
    } },
    ...others.map((o) => ({ text: `§l${o.name}\n§r§aOnline`, icon: "textures/ui/icon_steve", run: () => profileUI(p, o.id, true) })),
    ...offline.map(([id, d]) => ({ text: `§l${d.name}\n§r§8Last seen ${fmtTime(now() - (d.last ?? now()))} ago`, icon: "textures/ui/icon_steve", run: () => profileUI(p, id, true) })),
  ]);
}
async function profileHub(p) {
  await menu(p, "§lPlayers & Profile", `§7${p.name}`, [
    { text: "§l§eMy Stats\n§r§8Your info & stats", icon: "textures/ui/icon_steve", run: () => profileUI(p, p.id) },
    { text: "§l§aOnline Players\n§r§8Message, TPA, view profile", icon: "textures/ui/essx/icons/clan", run: () => onlinePlayersUI(p) },
    { text: "§l§bView Other Player\n§r§8See another player's info", icon: "textures/ui/essx/icons/clan", run: () => viewOtherUI(p) },
  ]);
}
cmd({ name: "stats", aliases: ["profile"], desc: "Player stats (online or offline)", usage: "[player]", run: (p, a) => { const id = a[0] ? (findPlayer(a[0])?.id ?? idByName(a[0].replace(/^@/, "").replace(/"/g, ""))) : p.id; if (!id) return err(p, "Player not found."); profileUI(p, id); } });
cmd({ name: "viewplayer", aliases: ["vp", "viewp"], desc: "View another player's info", run: viewOtherUI });
addMember({ category: "community", order: -2, text: "§l§ePlayers & Profile\n§r§8Stats, online & offline players", icon: "textures/ui/essx/icons/account", run: profileHub });

// ================= LEADERBOARDS =================
const HOLOGRAM_BADGES = {
  money: SIDEBAR_ICONS.money, kills: SIDEBAR_ICONS.kills, deaths: SIDEBAR_ICONS.deaths,
  mobs: SIDEBAR_ICONS.kills, blocks: "\ue51f", playtime: SIDEBAR_ICONS.time, clans: SIDEBAR_ICONS.online,
};
const LB = {
  money: { title: "§a§lTop Money", get: () => topList(10).map(([id, v]) => [id, cur(v)]) },
  kills: { title: "§c§lTop Kills", get: () => DB.stats.entries().sort((a, b) => b[1].kills - a[1].kills).slice(0, 10).map(([id, s]) => [id, s.kills + " kills"]) },
  deaths: { title: "§7§lTop Deaths", get: () => DB.stats.entries().sort((a, b) => b[1].deaths - a[1].deaths).slice(0, 10).map(([id, s]) => [id, s.deaths + " deaths"]) },
  mobs: { title: "§6§lTop Mob Hunters", get: () => DB.stats.entries().sort((a, b) => b[1].mobs - a[1].mobs).slice(0, 10).map(([id, s]) => [id, s.mobs + " mobs"]) },
  blocks: { title: "§b§lTop Miners", get: () => DB.stats.entries().sort((a, b) => b[1].blocks - a[1].blocks).slice(0, 10).map(([id, s]) => [id, fmtNum(s.blocks) + " blocks"]) },
  playtime: { title: "§e§lTop Playtime", get: () => DB.players.entries().sort((a, b) => (b[1].playtime ?? 0) - (a[1].playtime ?? 0)).slice(0, 10).map(([id, d]) => [id, fmtTime(d.playtime ?? 0)]) },
  clans: { title: "§b§lTop Clans", get: () => DB.clans.entries().sort((a, b) => (b[1].kills ?? 0) - (a[1].kills ?? 0)).slice(0, 10).map(([, c]) => [null, `[${c.tag}] ${c.name} - ${c.kills ?? 0} kills`]) },
};
function lbText(type, includeTitle = true, hologram = false) {
  const l = LB[type];
  if (!l) return "?";
  const badges = hologram && cfg().rankTagIcons !== false;
  const headingBadge = badges ? "§r§f" + HOLOGRAM_BADGES[type] + " §r" : "";
  const rows = l.get().map(([id, v], i) => {
    const badge = badges && id ? rankIcon(id) : "";
    const valueColor = hologram && type === "money" ? "§a" : "§7";
    const value = hologram && type === "money" ? String(v).replace(/§./g, "") : v;
    return `§e#${i + 1} §f${badge ? badge + " §f" : ""}${id ? nameOf(id) : ""} ${valueColor}${value}`;
  });
  return (includeTitle ? headingBadge + l.title + "\n" : "") + "§8----------\n" + (rows.join("\n") || "§7No data");
}

// ================= HOLOGRAMS =================
function holoText(h) {
  const textBadge = cfg().rankTagIcons !== false ? "§r§f" + SIDEBAR_ICONS.rank + " §r" : "";
  const base = h.lb ? lbText(h.lb, true, true) : textBadge + h.text;
  return base.replace(/\\n|\|/g, "\n").replace("{online}", String(online().length)).replace("{server}", cfg().serverName);
}
system.runInterval(() => {
  if (!mod("holograms")) return;
  for (const [id, h] of DB.holo.entries()) {
    try {
      const dim = world.getDimension(h.dim);
      const found = dim.getEntities({ type: "essx:floating_text", tags: ["essx_holo:" + id] });
      const txt = holoText(h);
      if (found.length) {
        for (let i = 1; i < found.length; i++) found[i].remove();
        if (found[0].nameTag !== txt) found[0].nameTag = txt;
        continue;
      }
      if (!online().some((p) => p.dimension.id === h.dim && (p.location.x - h.x) ** 2 + (p.location.z - h.z) ** 2 < 48 * 48)) continue;
      const e = dim.spawnEntity("essx:floating_text", { x: h.x, y: h.y, z: h.z });
      e.addTag("essx_holo:" + id);
      e.nameTag = txt;
    } catch {}
  }
}, 40);
function removeHolo(id) {
  const h = DB.holo.get(id);
  if (h) try { for (const e of world.getDimension(h.dim).getEntities({ type: "essx:floating_text", tags: ["essx_holo:" + id] })) e.remove(); } catch {}
  DB.holo.delete(id);
}
async function holoUI(p) {
  await menu(p, "§lHolograms & Leaderboards", "§7Floating text at your position.\n§7Use §e|§7 for new lines, {online}, {server}.", [
    { text: "§l§aCreate Text Hologram", icon: "textures/ui/essx/icons/add", run: async () => { const r = await modal(p, "§lNew Hologram", [{ type: "text", key: "t", label: "Text", placeholder: "§bWelcome!|§7Have fun" }, { type: "slider", key: "y", label: "Height offset x0.5", min: 0, max: 10, default: 3 }]); if (r?.t) { const id = "H" + now().toString(36); const l = loc(p); DB.holo.set(id, { text: r.t, x: l.x, y: p.location.y + r.y * 0.5, z: l.z, dim: p.dimension.id }); ok(p, "Hologram created."); } } },
    { text: "§l§6Create Leaderboard", icon: "textures/items/diamond", run: async () => { const keys = Object.keys(LB); const r = await modal(p, "§lNew Leaderboard", [{ type: "dropdown", key: "t", label: "Type", options: keys }, { type: "slider", key: "y", label: "Height offset x0.5", min: 0, max: 10, default: 4 }]); if (r) { const id = "H" + now().toString(36); const l = loc(p); DB.holo.set(id, { lb: keys[r.t], x: l.x, y: p.location.y + r.y * 0.5, z: l.z, dim: p.dimension.id }); ok(p, "Leaderboard created."); } } },
    { text: "§l§cDelete Nearest", icon: "textures/ui/essx/icons/delete", run: () => { let best, bd = 1e9; for (const [id, h] of DB.holo.entries()) { if (h.dim !== p.dimension.id) continue; const d = (h.x - p.location.x) ** 2 + (h.z - p.location.z) ** 2; if (d < bd) { bd = d; best = id; } } if (!best || bd > 100) return err(p, "No hologram within 10 blocks."); removeHolo(best); ok(p, "Deleted."); } },
    ...DB.holo.entries().map(([id, h]) => ({ icon: "textures/ui/essx/icons/hologram", text: `§l${h.lb ? "LB: " + h.lb : (h.text ?? "").slice(0, 24)}\n§r§8${locStr({ ...h })}`, run: () => menu(p, "§lHologram", holoText(h), [
      { text: "§lEdit Text", icon: "textures/ui/essx/icons/edit", run: async () => { if (h.lb) return err(p, "Leaderboards can't be edited."); const r = await modal(p, "Edit", [{ type: "text", key: "t", label: "Text", default: h.text }]); if (r) { h.text = r.t; DB.holo.save(); } } },
      { text: "§lMove Here", icon: "textures/ui/essx/icons/move", run: () => { removeHolo(id); DB.holo.set(id, { ...h, x: p.location.x, y: p.location.y + 1.5, z: p.location.z, dim: p.dimension.id }); ok(p, "Moved."); } },
      { text: "§lTeleport", icon: "textures/ui/essx/icons/teleport", run: () => p.teleport({ x: h.x, y: h.y, z: h.z }, { dimension: world.getDimension(h.dim) }) },
      { text: "§l§cDelete", icon: "textures/ui/essx/icons/delete", run: () => { removeHolo(id); ok(p, "Deleted."); } },
    ]) })),
  ]);
}
cmd({ name: "holo", aliases: ["hologram", "ft", "leaderboard", "lb"], admin: true, module: "holograms", desc: "Holograms & leaderboards", run: holoUI });
addAdmin({ text: "§l§bHolograms\n§r§8Floating text & leaderboards", icon: "textures/ui/essx/icons/hologram", module: "holograms", run: holoUI });
cmd({ name: "top10", aliases: ["leaderboards"], desc: "View leaderboards", run: (p) => menu(p, "§lLeaderboards", "", Object.keys(LB).map((k) => ({ icon: "textures/ui/essx/icons/trophy", text: "§l" + LB[k].title, run: () => menu(p, LB[k].title, lbText(k, false), [{ text: "§lBack", icon: "textures/ui/essx/icons/back" }]) }))) });
addMember({ category: "community", order: -1, text: "§l§6Leaderboards\n§r§8Top players", icon: "textures/ui/essx/icons/trophy", run: (p) => menu(p, "§lLeaderboards", "", Object.keys(LB).map((k) => ({ icon: "textures/ui/essx/icons/trophy", text: "§l" + LB[k].title, run: () => menu(p, LB[k].title, lbText(k, false), [{ text: "§lBack", icon: "textures/ui/essx/icons/back" }]) }))) });

// ================= SIDEBAR =================
let sideLines = [];
function sidebar() {
  const sb = world.scoreboard;
  const c = cfg();
  if (!mod("hud") || !c.hud.sidebar || c.hud.mode !== "server") {
    if (sb.getObjective("essx_side")) { try { sb.removeObjective("essx_side"); } catch {} sideLines = []; }
    return;
  }
  const existing = sb.getObjective("essx_side");
  if (!existing) sideLines = [];
  const obj = existing ?? sb.addObjective("essx_side", c.hud.title);
  if (obj.displayName !== c.hud.title) { sb.removeObjective("essx_side"); sideLines = []; return; }
  const players = online();
  const staffs = players.filter((o) => isAdmin(o)).length;
  const t = tps();
  const tpsColor = t >= 18 ? "§a" : t >= 12 ? "§e" : "§c";
  const d = new Date(now() + 8 * 3600000);
  const h24 = d.getUTCHours();
  const clock = `${h24 % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
  const [richest] = topList(1);
  const sep = (pad) => "§3--------§d--§3--------" + "§r".repeat(pad);
  const lines = [
    sep(0),
    "§b§lONLINE",
    `§fPlayers: §b${players.length}`,
    `§fStaffs: §b${staffs}`,
    "§b§lSTATISTICS",
    `§fTPS: ${tpsColor}${t.toFixed(1)}`,
    `§fTime: §b${clock}`,
    `§fClans: §b${DB.clans.keys().length}`,
    `§fAuctions: §6${DB.auction.data.list.length}`,
    richest ? `§fRichest: §a${nameOf(richest[0])}` : "§fRichest: §7-",
    sep(1),
  ];
  if (lines.join("|") === sideLines.join("|")) return;
  for (const pt of obj.getParticipants()) obj.removeParticipant(pt);
  lines.forEach((l, i) => obj.setScore(l, lines.length - i));
  sideLines = lines;
  try { sb.setObjectiveAtDisplaySlot(DisplaySlotId.Sidebar, { objective: obj, sortOrder: ObjectiveSortOrder.Descending }); } catch {}
}
system.runInterval(() => { try { sidebar(); } catch {} }, 100);

// Personal sidebar uses the actionbar factory in the resource pack. Native notices take priority.
const hudOn = new Set(); // Original compact HUD remains available in server-summary mode.
const personalShown = new Set();
const sessionStarts = new Map();
// Script API v2 loads modules before world/player APIs are available. Defer
// reload initialization so a sidebar read cannot abort admin/menu registration.
world.afterEvents.worldLoad.subscribe(() => {
  for (const p of online()) if (!sessionStarts.has(p.id)) sessionStarts.set(p.id, now());
});
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) sessionStarts.set(player.id, now());
});
function sessionPlaytime(p) {
  if (!sessionStarts.has(p.id)) sessionStarts.set(p.id, now());
  return Math.max(0, now() - sessionStarts.get(p.id));
}
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  hudOn.delete(playerId); personalShown.delete(playerId); sessionStarts.delete(playerId); clearActionbarNotice(playerId);
});
system.runInterval(() => {
  const c = cfg();
  const players = online();
  const personal = mod("hud") && c.hud.sidebar && c.hud.mode !== "server";
  for (const p of players) {
    try {
      const playtime = sessionPlaytime(p);
      if (actionbarBusy(p.id)) { personalShown.delete(p.id); continue; }
      if (personal && !DB.pdata.get(p.id)?.hudHidden) {
        const s = stat(p.id);
        p.onScreenDisplay.setActionBar(buildSidebar({
          name: p.name, rank: rankBadge(p.id), rankIcon: "", balance: bal(p.id), currency: c.currency,
          location: p.location, level: p.level, dimension: p.dimension.id, kills: s.kills, deaths: s.deaths, playtime,
          online: players.length, tps: tps(),
        }, c.hud));
        personalShown.add(p.id);
      } else {
        if (personalShown.delete(p.id)) p.onScreenDisplay.setActionBar("");
        if (mod("hud") && c.hud.mode === "server" && hudOn.has(p.id)) {
          const s = stat(p.id);
          p.onScreenDisplay.setActionBar(`§a${cur(bal(p.id))} §8| ${rankPrefix(p.id)} §8| §c⚔ ${s.kills} §8| §bOnline ${players.length}`);
        }
      }
    } catch {} // A player leaving during refresh must not interrupt updates for other players.
  }
}, 20);
cmd({ name: "hud", module: "hud", desc: "Toggle your HUD", run: (p) => {
  if (cfg().hud.mode === "server") {
    if (hudOn.has(p.id)) { hudOn.delete(p.id); ok(p, "HUD off"); } else { hudOn.add(p.id); ok(p, "HUD on"); }
  } else {
    const data = DB.pdata.get(p.id, {});
    data.hudHidden = !data.hudHidden;
    DB.pdata.set(p.id, data);
    if (data.hudHidden && personalShown.delete(p.id) && !actionbarBusy(p.id)) p.onScreenDisplay.setActionBar("");
    ok(p, data.hudHidden ? "Sidebar off" : "Sidebar on");
  }
} });
registerPlugin({
  id: "sidebar", name: "Sidebar Scoreboard", module: "hud", icon: "textures/ui/sidebar/tps",
  desc: "Nine backgrounds including Midnight Blue, Emerald Glass and Royal Gold. Use !hud to hide your personal sidebar.",
  fields: (c) => [
    { type: "toggle", key: "sidebar", label: "Show sidebar", default: c.hud.sidebar },
    { type: "dropdown", key: "mode", label: "Display mode", options: ["Personal sidebar (resource pack)", "Shared server summary (vanilla)"], default: c.hud.mode === "server" ? 1 : 0 },
    { type: "dropdown", key: "background", label: "Personal sidebar background (resource pack)", options: SIDEBAR_BACKGROUNDS.map(b => b.label), default: Math.max(0, SIDEBAR_BACKGROUNDS.findIndex(b => b.id === c.hud.background)) },
    { type: "text", key: "title", label: "Sidebar title", default: c.hud.title },
    { type: "text", key: "subtitle", label: "Subtitle", default: c.hud.subtitle },
    { type: "text", key: "footer", label: "Footer", default: c.hud.footer },
    { type: "toggle", key: "extraStats", label: "Show XP / world / K-D below deaths", default: c.hud.extraStats !== false },
    { type: "toggle", key: "icons", label: "Pixel icons (requires resource pack)", default: c.hud.icons },
  ],
  apply: (c, r) => Object.assign(c.hud, { ...r, mode: r.mode === 1 ? "server" : "personal",
    background: SIDEBAR_BACKGROUNDS[r.background]?.id ?? SIDEBAR_BACKGROUNDS.find(b => b.id === c.hud.background)?.id ?? "default" }),
  actions: SIDEBAR_BACKGROUNDS.filter(b => b.icon).map(background => ({
    text: background.label,
    icon: background.icon,
    run: p => { cfg().hud.background = background.id; saveCfg(); ok(p, "Sidebar background: " + background.label); },
  })),
});

// ================= NAMETAGS =================
// Track only our own output so disabling both features restores the previous name.
const playerNameTags = new Map();
system.runInterval(() => {
  const rankNames = mod("nametags"), healthNames = mod("playerhealth");
  const present = new Set();
  for (const p of online()) {
    present.add(p.id);
    try {
      const previous = playerNameTags.get(p.id);
      if (!rankNames && !healthNames) {
        if (previous && p.hasTag("essx:vanish")) {
          if (p.nameTag !== "") p.nameTag = "";
          previous.text = "";
        } else {
          if (previous && p.nameTag === previous.text) p.nameTag = previous.restore;
          playerNameTags.delete(p.id);
        }
        continue;
      }
      let tag = "";
      if (!p.hasTag("essx:vanish")) {
        tag = "§r§f" + p.name;
        if (rankNames) {
          const nick = DB.pdata.get(p.id)?.nick;
          const cl = mod("clans") ? clanOf(p.id) : undefined;
          const prefix = [nametagRankPrefix(p.id), cl ? (cl.c.color ?? "§b") + "[" + cl.c.tag + "]" : ""].filter(Boolean).join(" ");
          tag = `${prefix ? prefix + " " : ""}§r§f${nick ?? p.name}`;
        }
        if (healthNames) tag = playerHealthNametag(tag, p.getComponent("minecraft:health"), cfg().playerhealth);
      }
      playerNameTags.set(p.id, { text: tag, restore: previous?.restore ?? (p.nameTag || p.name) });
      if (p.nameTag !== tag) p.nameTag = tag;
    } catch {} // A player can disconnect while the online list is being processed.
  }
  for (const id of playerNameTags.keys()) if (!present.has(id)) playerNameTags.delete(id);
}, 5);

registerPlugin({
  id: "playerhealth", name: "Player Health Bar", module: "playerhealth", icon: "textures/ui/essx/icons/heart",
  desc: "Three live player health styles matching the reference layouts.",
  fields: (c) => [
    { type: "dropdown", key: "style", label: "Health style", options: PLAYER_HEALTH_STYLES, default: playerHealthStyle(c.playerhealth.style) },
    { type: "toggle", key: "textOnly", label: "Text only (without custom health textures)", default: c.playerhealth.textOnly === true },
  ],
  apply: (c, r) => Object.assign(c.playerhealth, { style: playerHealthStyle(r.style), textOnly: r.textOnly === true }),
  actions: PLAYER_HEALTH_STYLES.map((label, style) => ({
    text: "§l" + (style + 1) + ". " + label,
    icon: "textures/ui/essx/icons/heart",
    run: (p) => { cfg().playerhealth.style = style; saveCfg(); ok(p, "Player health style: " + label); },
  })),
});

// ================= MOB HEALTHBAR =================
const hbTimers = new Map();
const prettyType = (id) => id.replace("minecraft:", "").split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
function healthBarText(e, curv, max, dmg) {
  const c = cfg().mobhealth;
  const pct = max > 0 ? Math.min(1, curv / max) : 0;
  const col = pct > 0.6 ? "§a" : pct > 0.3 ? "§e" : "§c";
  const len = Math.max(3, Math.min(20, c.length));
  const fill = Math.round(pct * len);
  let bar = "";
  if (c.style === 0) bar = `${col}${"|".repeat(fill)}§8${"|".repeat(len - fill)}`;
  else if (c.style === 1) bar = `§c${"❤".repeat(fill)}§8${"❤".repeat(len - fill)}`;
  else if (c.style === 2) bar = `${col}${Math.round(pct * 100)}%`;
  const parts = [];
  if (c.showName) parts.push(`§f${prettyType(e.typeId)}`);
  let line = bar;
  if (c.showNumber) line += `${line ? " " : ""}§f${Math.ceil(curv)}§7/${Math.round(max)}`;
  if (c.showDamage && dmg > 0) line += ` §7(§c-${dmg.toFixed(1)}§7)`;
  if (line) parts.push(line);
  return parts.join("\n");
}
world.afterEvents.entityHurt.subscribe((ev) => {
  if (!mod("healthbar")) return;
  const e = ev.hurtEntity;
  if (e.typeId === "minecraft:player" || e.typeId.startsWith("essx:")) return;
  try {
    const c = cfg().mobhealth;
    if (c.scope === 1 && !e.matches({ families: ["monster"] })) return;
    if (c.scope === 2 && e.matches({ families: ["monster"] })) return;
    if (e.nameTag && !e.getDynamicProperty("essx:hb")) return; // custom named mob
    const h = e.getComponent("minecraft:health");
    if (!h || h.currentValue <= 0) return;
    e.nameTag = healthBarText(e, Math.max(0, h.currentValue), h.effectiveMax, ev.damage ?? 0);
    e.setDynamicProperty("essx:hb", true);
    const old = hbTimers.get(e.id); if (old !== undefined) system.clearRun(old);
    hbTimers.set(e.id, system.runTimeout(() => { try { if (e.isValid) { e.nameTag = ""; e.setDynamicProperty("essx:hb", undefined); } } catch {} hbTimers.delete(e.id); }, Math.max(1, c.showSeconds) * 20));
  } catch {}
});

registerPlugin({
  id: "mobhealth", name: "Mob Health Bar", module: "healthbar", icon: "textures/ui/essx/icons/heart",
  desc: "Shows a health bar above mobs when you hurt them.",
  fields: (c) => [
    { type: "dropdown", key: "style", label: "Bar style", options: ["Bars |||||", "Hearts", "Percent"], default: c.mobhealth.style },
    { type: "slider", key: "length", label: "Bar length", min: 3, max: 20, step: 1, default: c.mobhealth.length },
    { type: "slider", key: "showSeconds", label: "Show for (seconds)", min: 1, max: 15, step: 1, default: c.mobhealth.showSeconds },
    { type: "dropdown", key: "scope", label: "Mobs", options: ["All mobs", "Hostile only", "Passive only"], default: c.mobhealth.scope },
    { type: "toggle", key: "showName", label: "Show mob name", default: c.mobhealth.showName },
    { type: "toggle", key: "showNumber", label: "Show health number", default: c.mobhealth.showNumber },
    { type: "toggle", key: "showDamage", label: "Show last damage", default: c.mobhealth.showDamage },
  ],
  apply: (c, r) => Object.assign(c.mobhealth, r),
});

// ================= ITEM TOOLS & MISC =================
cmd({ name: "rename", admin: true, desc: "Rename held item", usage: "<name>", run: (p, a) => { const it = heldItem(p); if (!it) return err(p, "Hold an item."); it.nameTag = a.join(" ").replace(/&/g, "§") || undefined; setHeld(p, it); ok(p, "Renamed."); } });
cmd({ name: "lore", admin: true, desc: "Set lore of held item (| = new line)", usage: "<text|clear>", run: (p, a) => { const it = heldItem(p); if (!it) return err(p, "Hold an item."); const t = a.join(" "); it.setLore(t === "clear" ? [] : t.replace(/&/g, "§").split("|")); setHeld(p, it); ok(p, "Lore set."); } });
cmd({ name: "repair", aliases: ["fix"], admin: true, desc: "Repair held item", run: (p) => { const it = heldItem(p); const d = it?.getComponent("minecraft:durability"); if (!d) return err(p, "Can't repair that."); d.damage = 0; setHeld(p, it); ok(p, "Repaired."); } });
cmd({ name: "hat", desc: "Wear held block as hat", run: (p) => { const it = heldItem(p); if (!it) return err(p, "Hold a block."); const eq = p.getComponent("minecraft:equippable"); const old = eq.getEquipment("Head"); eq.setEquipment("Head", it); setHeld(p, old); ok(p, "Nice hat!"); } });
cmd({ name: "nick", aliases: ["nickname"], admin: true, desc: "Set nickname (nametag)", usage: "<nick|off> [player]", run: (p, a) => { const t = a[1] ? findPlayer(a[1]) : p; if (!t) return err(p, "Player not found."); const d = DB.pdata.get(t.id, {}); d.nick = !a[0] || a[0] === "off" ? undefined : a[0].replace(/&/g, "§"); DB.pdata.set(t.id, d); ok(p, "Nickname updated."); } });
cmd({ name: "ping", desc: "Server TPS check", run: (p) => { const t0 = Date.now(), tick0 = system.currentTick; system.runTimeout(() => { const tps = Math.min(20, 20 / ((Date.now() - t0) / 1000) * ((system.currentTick - tick0) / 20)); msg(p, `§fServer TPS: §a${tps.toFixed(1)}`); }, 20); } });
cmd({ name: "coords", aliases: ["pos", "where"], desc: "Show coordinates", run: (p) => msg(p, "§fYou are at §e" + locStr(loc(p))) });
