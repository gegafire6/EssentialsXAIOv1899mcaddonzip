// EssentialsX AIO - By Opiar | Ranks
import { world } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, saveCfg } from "../core/config.js";
import { RANK_TAGS, rankTag, tagPrefix } from "../core/rank-tags.js";
import { cmd, addAdmin } from "../core/commands.js";
import { ok, err, msg, idByName, nameOf, modal, menu, pickPlayer, byId, log, confirm } from "../core/utils.js";

const DEFAULT_RANKS = {
  member: { name: "Member", prefix: "§7[Member]", priority: 0, homes: 3, staff: false, default: true },
  vip: { name: "VIP", prefix: "§a[VIP]", priority: 10, homes: 5, staff: false },
  staff: { name: "Staff", prefix: "§c[Staff]", priority: 80, homes: 10, staff: true },
  admin: { name: "Admin", prefix: "§c[Admin]", priority: 95, homes: 20, staff: true },
  co_owner: { name: "Co Owner", prefix: "§c[Co Owner]", priority: 99, homes: 50, staff: true },
  mod: { name: "Moderator", prefix: "§9[Mod]", priority: 90, homes: 15, staff: true },
  owner: { name: "Owner", prefix: "§4[§cOwner§4]", priority: 100, homes: 50, staff: true },
};

// Social ranks are decorative player roles; no additional permissions or home perks.
const SOCIAL_RANK_IDS = ["facebook", "roblox", "telegram"];
for (const id of SOCIAL_RANK_IDS) {
  const tag = rankTag(id);
  DEFAULT_RANKS[id] = { name: id[0].toUpperCase() + id.slice(1), prefix: "§" + tag.color + "[" + tag.label + "]",
    priority: 1, homes: 3, staff: false, default: false };
}

// Fresh worlds get the full catalog; saved definitions and assignments stay intact.
for (const id of Object.keys(DEFAULT_RANKS)) DEFAULT_RANKS[id].tagStyle = id;

export function rankLabel(rank, id = rank.id) {
  const style = rankStyle(rank, id);
  return style ? tagPrefix(style) : (rank.prefix ?? "").replace(/[\uE500-\uE5FF] ?/g, "");
}

function rankStyle(rank, id = rank.id) {
  // Removed decorative styles use Member without rewriting saved role permissions.
  if (rank.tagStyle && !rankTag(rank.tagStyle)) return rankTag("member");
  const retiredPrefixes = { mvp: "§b[MVP]", legend: "§6[§eLegend§6]", helper: "§d[Helper]" };
  if (!rank.tagStyle && retiredPrefixes[id] === rank.prefix && rank.prefix) return rankTag("member");
  let style = rankTag(rank.tagStyle);
  // Recognize only unedited legacy built-in prefixes. Custom saved prefixes remain explicit.
  if (!style && !rank.tagStyle && DEFAULT_RANKS[id]?.prefix === rank.prefix) style = rankTag(id);
  return style;
}

// Explicitly omit retired compact badges in sidebars and player holograms.
export function rankIcon() {
  return "";
}

// Menu and personal sidebar show compact artwork beside the assigned style name.
// Resolve the assigned role/style independently of chat visibility preferences.
export function rankBadge(id) {
  const rank = topRank(id);
  const style = rankStyle(rank);
  return style && cfg().rankTagIcons !== false
    ? "§r§f" + style.chatGlyph + " §" + style.color + "§l" + style.label + "§r"
    : rankLabel(rank);
}

// Overhead names retain the bracketed role label beside its compact badge.
export function nametagRankPrefix(id) {
  const rank = topRank(id);
  const style = rankStyle(rank);
  const label = rankLabel(rank);
  return style && cfg().rankTagIcons !== false
    ? "§r§f" + style.chatGlyph + " " + label
    : label;
}

export function chatRankPrefix(id) {
  const rank = topRank(id);
  return chatStylePrefix(rankStyle(rank), rank.prefix ?? "");
}

function chatStylePrefix(style, fallback = "") {
  if (cfg().chat.rankBadges === false || cfg().chat.rankBadgeMode === "none") return "";
  // Keep the readable label even when an icon is unavailable or explicitly disabled.
  if (!style) return fallback.replace(/[\uE500-\uE7FF]/g, "").trim();
  // Use the same saved style label/color as nametags, menus and the sidebar.
  const { color, label } = style;
  if (cfg().chat.rankBadgeMode === "icon" && cfg().rankTagIcons !== false) {
    return "§r§f" + style.chatGlyph + " §" + color + "§l" + label + "§r";
  }
  return "§r§l§" + color + "[" + label + "]§r";
}

// Explicit admin action: only add missing definitions. Decorative presets grant no access or perks.
export function installRankPresets() {
  const all = ranks();
  let added = 0;
  for (const tag of RANK_TAGS) {
    if (Object.prototype.hasOwnProperty.call(all, tag.id)) continue;
    all[tag.id] = { name: tag.label, prefix: "§" + tag.color + "[" + tag.label + "]", tagStyle: tag.id,
      priority: 0, homes: 3, staff: false, default: false };
    added++;
  }
  if (added) DB.ranks.save();
  return added;
}

export function ranks() {
  if (!DB.ranks.keys().length) DB.ranks.data = JSON.parse(JSON.stringify(DEFAULT_RANKS));
  // Install only the newly introduced roles once; preserve saved IDs and later deletions.
  const c = cfg();
  if ((c.socialRanksVersion ?? 0) < 1) {
    for (const id of SOCIAL_RANK_IDS) {
      if (!Object.prototype.hasOwnProperty.call(DB.ranks.data, id)) {
        DB.ranks.data[id] = { ...DEFAULT_RANKS[id] };
      }
    }
    DB.ranks.save();
    c.socialRanksVersion = 1;
    saveCfg();
  }
  return DB.ranks.data;
}
export function playerRankIds(id) {
  const r = DB.playerRanks.get(id);
  const all = ranks();
  const list = (r ?? []).filter((x) => all[x]);
  if (!list.length) { const d = Object.keys(all).find((k) => all[k].default) ?? Object.keys(all)[0]; return d ? [d] : []; }
  return list;
}
export function topRank(id) {
  const all = ranks();
  const ids = playerRankIds(id).sort((a, b) => (all[b].priority ?? 0) - (all[a].priority ?? 0));
  return ids[0] ? { ...all[ids[0]], id: ids[0] } : { id: "none", name: "None", prefix: "", priority: 0, homes: 3 };
}
export function rankPrefix(id) {
  return rankLabel(topRank(id));
}
export function homeLimit(id, def) {
  const all = ranks();
  return Math.max(def, ...playerRankIds(id).map((r) => all[r].homes ?? 0));
}
export function setRanks(id, list) {
  DB.playerRanks.set(id, list);
  applyStaff(byId(id));
}
export function applyStaff(p) {
  if (!p) return;
  const all = ranks();
  const staff = playerRankIds(p.id).some((r) => all[r]?.staff);
  if (staff) p.addTag("essx:admin");
  else if (p.hasTag("essx:admin") && !p.hasTag("essx:admin_manual")) p.removeTag("essx:admin");
}

world.afterEvents.playerSpawn.subscribe((ev) => { if (ev.initialSpawn) applyStaff(ev.player); });

async function rankEditor(p, rid) {
  const all = ranks();
  const r = rid ? all[rid] : { name: "", prefix: "§7[New]", priority: 1, homes: 3, staff: false };
  const styles = [undefined, ...RANK_TAGS.map(tag => tag.id)];
  const styleLabels = ["Custom text prefix", ...RANK_TAGS.map(tag => tag.group + " / " + tag.label)];
  const selectedStyle = styles.indexOf(rankStyle(r, rid)?.id);
  const f = await modal(p, rid ? "§lEdit Rank: " + r.name : "§lCreate Rank", [
    ...(rid ? [] : [{ type: "text", key: "id", label: "Rank ID (no spaces)", placeholder: "vip" }]),
    { type: "text", key: "name", label: "Display name", default: r.name },
    { type: "text", key: "prefix", label: "Custom text prefix (used with Custom style)", default: r.prefix },
    { type: "dropdown", key: "style", label: "Rank tag style (appearance only)", options: styleLabels, default: Math.max(0, selectedStyle) },
    { type: "slider", key: "priority", label: "Priority", min: 0, max: 100, default: r.priority },
    { type: "slider", key: "homes", label: "Home limit", min: 1, max: 50, default: r.homes },
    { type: "toggle", key: "staff", label: "Staff (admin access)", default: r.staff },
    { type: "toggle", key: "def", label: "Default rank for new players", default: !!r.default },
  ]);
  if (!f) return;
  const id = rid ?? String(f.id || "").toLowerCase().replace(/\s+/g, "_");
  if (!id) return err(p, "Invalid ID.");
  if (!rid && Object.prototype.hasOwnProperty.call(all, id)) return err(p, "That rank ID already exists. Edit it instead.");
  if (f.def) for (const k of Object.keys(all)) all[k].default = false;
  all[id] = { ...r, name: f.name || id, prefix: f.prefix, priority: f.priority, homes: f.homes, staff: f.staff, default: f.def };
  if (styles[f.style]) all[id].tagStyle = styles[f.style];
  else delete all[id].tagStyle;
  DB.ranks.save();
  ok(p, "Rank saved: " + rankLabel(all[id], id));
}

async function tagGallery(p) {
  await menu(p, "§lRank Tag Collection", "§7" + RANK_TAGS.length + " original styles. Choose a style in Edit Rank. Installing presets adds missing ranks with priority 0, 3 homes and no admin access.",
    [...new Set(RANK_TAGS.map(tag => tag.group))].map(group => ({
      text: "§l" + group + " Tags", icon: RANK_TAGS.find(tag => tag.group === group).icon,
      run: () => menu(p, "§l" + group + " Tags", "§7Preview only. Open a rank's editor to select its style.", RANK_TAGS.filter(tag => tag.group === group).map(tag => ({
        text: tagPrefix(tag) + "\n§7" + tag.id, icon: tag.icon,
        run: () => menu(p, "§l" + tag.label, tagPrefix(tag) + "\n§7Chat: " + chatStylePrefix(tag) + " §f" + p.name + " hello\n§7Style ID: " + tag.id + "\nSelect this style under Ranks > your rank > Edit. Appearance does not change permissions.", []),
      }))),
    })));
}

async function ranksAdmin(p) {
  const all = ranks();
  await menu(p, "§lRank Manager", "§7Create, edit and assign ranks.", [
    { text: "§l§aCreate Rank", icon: "textures/ui/essx/icons/add", run: () => rankEditor(p) },
    { text: "§l§eAssign Rank\n§r§8Give/remove player rank", icon: "textures/ui/icon_steve", run: () => assignUI(p) },
    { text: "§l§bRank Tag Collection\n§r§7" + RANK_TAGS.length + " pixel-style tags", icon: "textures/ui/rank_tags/owner", run: () => tagGallery(p) },
    { text: "§l§aAdd Missing Preset Ranks\n§r§7Keeps all existing ranks", icon: "textures/ui/essx/icons/add", run: async () => {
      if (await confirm(p, "Add rank presets", "Add missing tag ranks? Existing ranks and assignments stay as they are. New presets have priority 0, 3 homes and NO admin access. Edit permissions and priority yourself if needed.")) {
        const count = installRankPresets();
        ok(p, "Added " + count + " ranks. Select a rank to edit its style and settings.");
        log("rank", p.name + " installed " + count + " rank tag presets");
      }
    } },
    { text: "§lChat Rank Display\n§r§7" + (cfg().chat.rankBadges === false || cfg().chat.rankBadgeMode === "none" ? "Hidden" : cfg().chat.rankBadgeMode === "icon" ? "Badge + rank name (classic chat)" : "Colored text"), icon: "textures/items/name_tag", run: async () => {
      const current = cfg().chat.rankBadges === false || cfg().chat.rankBadgeMode === "none" ? 2 : cfg().chat.rankBadgeMode === "icon" ? 0 : 1;
      const r = await modal(p, "§lChat Rank Display", [{ type: "dropdown", key: "mode", label: "Chat display", options: ["Badge + rank name (classic chat)", "Colored text (Ore UI / no icons)", "Hidden"], default: current }]);
      if (!r || ![0, 1, 2].includes(r.mode)) return;
      cfg().chat.rankBadgeMode = ["icon", "text", "none"][r.mode];
      cfg().chat.rankBadges = r.mode !== 2;
      saveCfg();
      ok(p, r.mode === 0 ? "Classic chat badges enabled. All recipients need compatible classic chat and the resource pack." : r.mode === 1 ? "Colored text ranks enabled." : "Chat rank tags hidden.");
    } },
    { text: "§lIcon Glyphs: " + (cfg().rankTagIcons !== false ? "§aON" : "§cOFF") + "\n§r§7Turn off if another font pack conflicts", icon: "textures/items/name_tag", run: () => {
      cfg().rankTagIcons = cfg().rankTagIcons === false;
      saveCfg();
      ok(p, "Rank glyphs " + (cfg().rankTagIcons ? "enabled." : "disabled. Chat badges use readable text instead."));
    } },
    ...Object.entries(all).sort((a, b) => b[1].priority - a[1].priority).map(([id, r]) => ({
      text: rankLabel(r, id) + "\n§r§8" + id + " | prio " + r.priority,
      icon: rankStyle(r, id)?.icon ?? "textures/items/name_tag",
      run: () => menu(p, "§l" + r.name, rankLabel(r, id), [
        { text: "§lEdit", icon: "textures/ui/essx/icons/edit", run: () => rankEditor(p, id) },
        { text: "§l§cDelete", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Delete rank", "Delete " + r.name + "?")) { delete all[id]; DB.ranks.save(); ok(p, "Deleted."); } } },
      ]),
    })),
  ]);
}
async function assignUI(p) {
  const t = await pickPlayer(p, "§lAssign Rank", true);
  if (!t) return;
  const all = ranks();
  const ids = Object.keys(all);
  const cur = playerRankIds(t.id);
  const f = await modal(p, "§lRanks: " + t.name, ids.map((id) => ({ type: "toggle", key: id, label: rankLabel(all[id], id) + " §7(" + id + ")", default: cur.includes(id) })));
  if (!f) return;
  setRanks(t.id, ids.filter((id) => f[id]));
  ok(p, "Updated ranks for " + t.name);
  msg(t, "§aYour rank is now " + rankPrefix(t.id));
  log("rank", `${p.name} set ranks of ${t.name}: ${ids.filter((id) => f[id]).join(",")}`);
}

cmd({ name: "rank", admin: true, desc: "Manage ranks", usage: "<add|remove|list|menu> [player] [rank]",
  run: (p, a) => {
    const [op, who, rid] = a;
    if (!op || op === "menu") return ranksAdmin(p);
    if (op === "list") return msg(p, Object.entries(ranks()).map(([k, v]) => rankLabel(v, k) + "§7(" + k + ")").join(" "));
    const id = who ? idByName(who) : undefined;
    if (!id || !rid || !ranks()[rid]) return err(p, "Usage: !rank <add|remove> <player> <rankId>");
    const list = new Set(DB.playerRanks.get(id) ?? []);
    if (op === "add") list.add(rid); else if (op === "remove") list.delete(rid);
    setRanks(id, [...list]);
    ok(p, `${nameOf(id)} ranks: ${[...list].join(", ") || "default"}`);
  } });
cmd({ name: "myrank", desc: "Show your rank", run: (p) => msg(p, "Your rank: " + rankPrefix(p.id)) });

addAdmin({ text: "§l§6Ranks\n§r§8Create & assign ranks", icon: "textures/ui/essx/icons/ranks", run: ranksAdmin });
