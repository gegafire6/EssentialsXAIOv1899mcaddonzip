// EssentialsX AIO - By Opiar | Homes, Warps, Spawn, Back, TPA, RTP
import { world, system } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, saveCfg, mod } from "../core/config.js";
import { cmd, addMember, addAdmin } from "../core/commands.js";
import { msg, ok, err, findPlayer, teleport, loc, locStr, menu, modal, confirm, pickPlayer, now, fmtTime, tpHooks, isAdmin, sound, online, nameOf } from "../core/utils.js";
import { homeLimit, playerRankIds } from "./ranks.js";
import { charge, addBal, bal } from "./economy.js";
import { isLoggedIn } from "./login.js";
import { canBuild } from "./protection.js";
import { authenticateDeveloper } from "../core/developer-auth.js";
import { findRtpDestination, inspectRtpColumn, nextRtpRange } from "../core/rtp.js";

// ================= HOMES =================
function homes(id) { return DB.homes.get(id, {}); }
function setHome(p, name = "home") {
  name = name.toLowerCase().slice(0, 20);
  const h = homes(p.id);
  const limit = homeLimit(p.id, cfg().homes.defaultLimit);
  if (!h[name] && Object.keys(h).length >= limit && !isAdmin(p)) return err(p, `Home limit reached (§e${limit}§c). Upgrade your rank for more.`);
  h[name] = loc(p);
  DB.homes.set(p.id, h);
  ok(p, `Home §e${name}§a set at ${locStr(h[name])}`);
}
function goHome(p, name) {
  const h = homes(p.id);
  const keys = Object.keys(h);
  if (!keys.length) return err(p, "You have no homes. Use §e!sethome [name]");
  const k = name ? name.toLowerCase() : keys.length === 1 ? keys[0] : h.home ? "home" : undefined;
  if (!k) return homesUI(p);
  if (!h[k]) return err(p, "Home not found. Homes: §e" + keys.join(", "));
  teleport(p, h[k], "home " + k);
}
async function homesUI(p) {
  const h = homes(p.id);
  const limit = homeLimit(p.id, cfg().homes.defaultLimit);
  await menu(p, "§lHomes", `§7Homes: §e${Object.keys(h).length}/${limit}`, [
    { text: "§l§aSet Home Here", icon: "textures/ui/essx/icons/add", run: async () => { const r = await modal(p, "§lSet Home", [{ type: "text", key: "n", label: "Home name", placeholder: "home", default: "home" }]); if (r) setHome(p, r.n || "home"); } },
    ...Object.entries(h).map(([n, l]) => ({ text: "§l" + n + "\n§r§8" + locStr(l), icon: "textures/items/bed_red", run: () => menu(p, "§lHome: " + n, locStr(l), [
      { text: "§l§aTeleport", icon: "textures/ui/essx/icons/teleport", run: () => teleport(p, l, "home " + n) },
      { text: "§l§eMove Here", icon: "textures/ui/essx/icons/move", run: () => { h[n] = loc(p); DB.homes.set(p.id, h); ok(p, "Home moved."); } },
      { text: "§l§cDelete", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Delete Home", "Delete home " + n + "?")) { delete h[n]; DB.homes.set(p.id, h); ok(p, "Home deleted."); } } },
    ]) })),
  ]);
}
cmd({ name: "sethome", module: "homes", desc: "Set a home", usage: "[name]", run: (p, a) => setHome(p, a[0]) });
cmd({ name: "home", aliases: ["h"], module: "homes", desc: "Teleport home", usage: "[name]", run: (p, a) => goHome(p, a[0]) });
cmd({ name: "homes", module: "homes", desc: "Homes menu", run: homesUI });
cmd({ name: "delhome", module: "homes", desc: "Delete a home", usage: "<name>", run: (p, a) => { const h = homes(p.id); const k = (a[0] ?? "home").toLowerCase(); if (!h[k]) return err(p, "Home not found."); delete h[k]; DB.homes.set(p.id, h); ok(p, "Home deleted."); } });
addMember({ text: "§l§9Homes\n§r§8Set & visit homes", icon: "textures/ui/essx/icons/home", module: "homes", run: homesUI });

// ================= WARPS =================
const WARP_CATEGORIES = ["Other", "Shops", "Towns", "Farms", "Minigames"];
const WARP_PRIVACY = ["public", "private", "trusted"];
const warpReady = p => !!p?.isValid && mod("warps") && isLoggedIn(p);
const warpCreator = p => isAdmin(p) || playerRankIds(p.id).includes("vip");
const personalKey = (id, name) => `player:${id}:${name}`;
const validWarpName = name => /^[a-z0-9_-]{1,24}$/.test(name);
const ownedWarps = p => DB.warps.entries().filter(([, v]) => v.owner === p.id);
const warpSlots = p => {
  const settings = cfg().playerWarps;
  return Math.min(settings.maxSlots, settings.baseSlots + Math.max(0, Math.floor(DB.pdata.get(p.id, {}).warpExtraSlots || 0)));
};
function warpVisible(p, v) {
  if (!v) return false;
  if (!v.owner) return !v.hidden || isAdmin(p);
  return v.owner === p.id || v.privacy === "public" || (v.privacy === "trusted" && (v.trusted ?? []).includes(p.id));
}
function warpLanding(v) {
  try {
    const d = world.getDimension(v.dim), x = Math.floor(v.x), y = Math.floor(v.y), z = Math.floor(v.z);
    const floor = d.getBlock({ x, y: y - 1, z }), feet = d.getBlock({ x, y, z }), head = d.getBlock({ x, y: y + 1, z });
    return !!floor?.isSolid && !floor.isLiquid && !/lava|magma|cactus|campfire|fire|berry|powder_snow/.test(floor.typeId) && !!feet?.isAir && !!head?.isAir;
  } catch { return false; }
}
let playerWarpSequence = 0;
async function preparePlayerWarp(p, destination) {
  const dimension = world.getDimension(destination.dim), origin = { ...p.location, dim: p.dimension.id };
  let area;
  const release = () => {
    if (area) try { dimension.runCommand(`tickingarea remove ${area}`); } catch (e) { console.warn("[EssX] Warp area cleanup failed: " + e); }
  };
  const ready = () => {
    if (!p.isValid || p.dimension.id !== origin.dim || (p.location.x - origin.x) ** 2 + (p.location.y - origin.y) ** 2 + (p.location.z - origin.z) ** 2 > 0.6) throw new Error("Warp teleport cancelled, you moved or left.");
  };
  try {
    ready();
    if (!warpLanding(destination)) {
      const name = `essx_warp_${now().toString(36)}_${++playerWarpSequence}`;
      if (!dimension.runCommand(`tickingarea add circle ${Math.floor(destination.x)} 0 ${Math.floor(destination.z)} 0 ${name} true`).successCount) throw new Error("Warp terrain could not be loaded.");
      area = name;
      for (let tick = 0; tick < 20 && !warpLanding(destination); tick++) {
        await new Promise(resolve => system.runTimeout(resolve, 5));
        ready();
      }
    }
    if (!warpLanding(destination)) throw new Error("Warp destination is unsafe or not loaded.");
    ready();
    return { location: destination, release };
  } catch (e) { release(); throw e; }
}
function personalPosition(p) {
  const position = loc(p), permission = canBuild(p, position, position.dim);
  if (permission !== true) { err(p, permission); return; }
  if (!warpLanding(position)) { err(p, "Set the warp on safe, loaded ground with two clear blocks above it."); return; }
  return position;
}
function removeWarp(id) {
  DB.warps.delete(id);
  for (const [playerId, data] of DB.pdata.entries()) {
    if (Array.isArray(data.warpFavorites) && data.warpFavorites.includes(id))
      DB.pdata.set(playerId, { ...data, warpFavorites: data.warpFavorites.filter(key => key !== id) });
  }
}
function useWarp(p, id) {
  const v = DB.warps.get(id);
  if (!warpReady(p) || !warpVisible(p, v)) return err(p, "Warp not found or unavailable.");
  let charged = 0;
  const validate = () => !warpReady(p) || DB.warps.get(id) !== v || !warpVisible(p, v) ? "Warp changed or is no longer available." : undefined;
  return teleport(p, v, v.display ?? id, {
    validate,
    ...(v.owner ? { prepare: () => preparePlayerWarp(p, v) } : {}),
    beforeCommit: () => {
      if (!v.cost || isAdmin(p) || v.owner === p.id) return true;
      if (v.owner && !mod("economy")) { err(p, "Economy is disabled; paid player warps are unavailable."); return false; }
      const balance = bal(p.id);
      if (!charge(p, v.cost, "this warp")) return false;
      charged = balance - bal(p.id);
      return true;
    },
    onCommitFailure: () => { if (charged) { addBal(p.id, charged); charged = 0; } },
  });
}
function favorite(p, id) {
  if (!warpReady(p) || !warpVisible(p, DB.warps.get(id))) return err(p, "Warp not found or unavailable.");
  const data = DB.pdata.get(p.id, {}), list = Array.isArray(data.warpFavorites) ? data.warpFavorites : [];
  const removing = list.includes(id);
  DB.pdata.set(p.id, { ...data, warpFavorites: removing ? list.filter(x => x !== id) : [...list, id] });
  ok(p, removing ? "Removed from favorites." : "Added to favorites.");
}
async function warpDetail(p, id) {
  const v = DB.warps.get(id);
  if (!warpReady(p) || !warpVisible(p, v)) return err(p, "Warp not found or unavailable.");
  const fav = (DB.pdata.get(p.id, {}).warpFavorites ?? []).includes(id);
  const price = v.cost ? cfg().currency + v.cost : "Free";
  await menu(p, "§l" + (v.display ?? id), `§7Category: §f${v.category || "Other"}\n§7Cost: §e${price}${v.owner ? `\n§7Owner: §f${v.ownerName || "Player"}\n§7Privacy: §f${v.privacy}` : ""}`, [
    { text: "§l§aTeleport\n§r§7" + price, icon: "textures/ui/essx/icons/teleport", run: () => useWarp(p, id) },
    { text: fav ? "§lRemove Favorite" : "§lAdd Favorite", icon: "textures/items/nether_star", run: () => favorite(p, id) },
    ...(v.owner === p.id ? [
      { text: "§lEdit Warp", icon: "textures/ui/essx/icons/edit", run: () => personalEditor(p, id) },
      { text: "§lTrusted Players", icon: "textures/ui/icon_steve", run: () => warpTrustUI(p, id) },
      { text: "§l§cDelete Warp", icon: "textures/ui/essx/icons/delete", run: async () => {
        if (await confirm(p, "Delete Warp", "Delete " + (v.display ?? id) + "?")) {
          if (!warpReady(p) || DB.warps.get(id) !== v || v.owner !== p.id) return err(p, "Warp changed or is unavailable.");
          removeWarp(id); ok(p, "Warp deleted.");
        }
      } },
    ] : []),
  ]);
}
async function warpList(p, title, predicate) {
  if (!warpReady(p)) return err(p, "Warps are unavailable.");
  const list = DB.warps.entries().filter(([id, v]) => warpVisible(p, v) && predicate(id, v));
  await menu(p, title, list.length ? "§7Select a warp." : "§7No warps available.", list.map(([id, v]) => ({
    text: `§l${v.display ?? id}\n§r§7${v.cost ? "Cost " + cfg().currency + v.cost : "Free"}${v.owner ? " · " + (v.ownerName || "Player") : ""}`,
    icon: v.icon || "textures/items/ender_pearl", run: () => warpDetail(p, id),
  })));
}
async function buyWarpSlot(p) {
  if (!warpReady(p) || !warpCreator(p)) return err(p, "VIP or staff rank is required to buy warp slots.");
  const settings = cfg().playerWarps, price = settings.slotPrice;
  if (warpSlots(p) >= settings.maxSlots) return err(p, "Maximum warp slots reached.");
  if (!mod("economy")) return err(p, "Economy is disabled.");
  if (!await confirm(p, "Buy Warp Slot", `Buy one slot for ${cfg().currency}${price}?`)) return;
  if (!warpReady(p) || !warpCreator(p) || !mod("economy") || cfg().playerWarps.slotPrice !== price || warpSlots(p) >= cfg().playerWarps.maxSlots) return err(p, "Slot purchase is no longer available.");
  if (price && !charge(p, price, "a warp slot")) return;
  const data = DB.pdata.get(p.id, {});
  DB.pdata.set(p.id, { ...data, warpExtraSlots: Math.max(0, Math.floor(data.warpExtraSlots || 0)) + 1 });
  ok(p, `Warp slot unlocked. Slots: ${warpSlots(p)}.`);
}
async function myWarpsUI(p) {
  if (!warpReady(p)) return err(p, "Warps are unavailable.");
  const count = ownedWarps(p).length, limit = warpSlots(p), settings = cfg().playerWarps;
  await menu(p, "§lMy Warps", `§7Slots: §e${count}/${limit} §7(max ${settings.maxSlots})\n§7Extra slot: §e${cfg().currency}${settings.slotPrice}`, [
    ...(warpCreator(p) ? [
      { text: "§l§aCreate Player Warp Here", icon: "textures/ui/essx/icons/add", run: () => personalEditor(p) },
      { text: "§lBuy Warp Slot", icon: "textures/items/emerald", run: () => buyWarpSlot(p) },
    ] : []),
    ...ownedWarps(p).map(([id, v]) => ({ text: `§l${v.display ?? id}\n§r§7${v.privacy} · ${v.category || "Other"}`, icon: "textures/items/ender_pearl", run: () => warpDetail(p, id) })),
  ]);
}
async function warpsUI(p) {
  if (!warpReady(p)) return err(p, "Warps are unavailable.");
  await menu(p, "§lWarps", "§7Choose a destination or manage your warps.", [
    { text: "§lPublic Server Warps", icon: "textures/items/ender_pearl", run: () => warpList(p, "§lServer Warps", (_id, v) => !v.owner) },
    { text: "§lPlayer Warps", icon: "textures/ui/icon_steve", run: () => warpList(p, "§lPlayer Warps", (_id, v) => !!v.owner) },
    { text: "§lMy Warps", icon: "textures/ui/essx/icons/home", run: () => myWarpsUI(p) },
    { text: "§lFavorite Warps", icon: "textures/items/nether_star", run: () => warpList(p, "§lFavorites", id => (DB.pdata.get(p.id, {}).warpFavorites ?? []).includes(id)) },
    { text: "§lCategories", icon: "textures/ui/essx/icons/menu", run: () => menu(p, "§lWarp Categories", "§7Select a category.", WARP_CATEGORIES.map(category => ({ text: "§l" + category, icon: "textures/items/ender_pearl", run: () => warpList(p, "§l" + category, (_id, v) => (v.category || "Other") === category) }))) },
    ...(isAdmin(p) ? [{ text: "§l§aCreate Server Warp", icon: "textures/ui/essx/icons/add", run: () => warpEditor(p) }] : []),
  ]);
}
async function personalEditor(p, id) {
  if (!warpReady(p)) return err(p, "Warps are unavailable.");
  const v = id ? DB.warps.get(id) : undefined;
  if (id && v?.owner !== p.id) return err(p, "Warp not found.");
  if (!id && (!warpCreator(p) || ownedWarps(p).length >= warpSlots(p))) return err(p, "VIP or staff rank and a free warp slot are required.");
  const r = await modal(p, id ? "§lEdit Player Warp" : "§lCreate Player Warp", [
    ...(!id ? [{ type: "text", key: "n", label: "Warp ID (letters, numbers, _ or -)", placeholder: "shop" }] : []),
    { type: "text", key: "d", label: "Display name", default: v?.display ?? "" },
    { type: "dropdown", key: "category", label: "Category", options: WARP_CATEGORIES, default: Math.max(0, WARP_CATEGORIES.indexOf(v?.category)) },
    { type: "dropdown", key: "privacy", label: "Privacy", options: WARP_PRIVACY, default: Math.max(0, WARP_PRIVACY.indexOf(v?.privacy)) },
    { type: "text", key: "cost", label: "Teleport cost (whole number)", default: v?.cost ?? 0 },
    { type: "toggle", key: "move", label: id ? "Move warp to my position" : "Set at my position", default: !id },
  ]);
  if (!r) return;
  if (!warpReady(p) || (id && DB.warps.get(id) !== v)) return err(p, "Warp changed or is unavailable.");
  if (!id && (!warpCreator(p) || ownedWarps(p).length >= warpSlots(p))) return err(p, "VIP or staff rank and a free warp slot are required.");
  const name = id ? v.name : String(r.n ?? "").toLowerCase();
  if (!validWarpName(name)) return err(p, "Warp ID must be 1–24 letters, numbers, underscores or hyphens.");
  const key = id ?? personalKey(p.id, name);
  if (!id && DB.warps.has(key)) return err(p, "You already have a warp with that ID.");
  const cost = Number(r.cost);
  if (!Number.isSafeInteger(cost) || cost < 0 || cost > 1000000000) return err(p, "Cost must be a whole number from 0 to 1000000000.");
  const position = !id || r.move ? personalPosition(p) : v;
  if (!position) return;
  DB.warps.set(key, { ...v, ...position, owner: p.id, ownerName: p.name, name, display: String(r.d || name).slice(0, 48), category: WARP_CATEGORIES[r.category] ?? "Other", privacy: WARP_PRIVACY[r.privacy] ?? "private", trusted: v?.trusted ?? [], cost });
  ok(p, "Player warp §e" + name + "§a saved.");
}
async function warpTrustUI(p, id) {
  const v = DB.warps.get(id);
  if (!warpReady(p) || v?.owner !== p.id) return err(p, "Warp not found.");
  await menu(p, "§lTrusted Players", "§7Trusted players may visit when privacy is Trusted.", [
    { text: "§l§aTrust Online Player", icon: "textures/ui/essx/icons/add", run: async () => {
      const target = await pickPlayer(p, "Trust Player");
      if (!target) return;
      if (!warpReady(p) || DB.warps.get(id) !== v || v.owner !== p.id || !target.isValid) return err(p, "Warp or player is unavailable.");
      DB.warps.set(id, { ...v, trusted: [...new Set([...(v.trusted ?? []), target.id])] }); ok(p, "Player trusted.");
    } },
    ...(v.trusted ?? []).map(target => ({ text: "§lRemove " + nameOf(target), icon: "textures/ui/essx/icons/delete", run: () => {
      if (!warpReady(p) || DB.warps.get(id) !== v || v.owner !== p.id) return err(p, "Warp changed or is unavailable.");
      DB.warps.set(id, { ...v, trusted: v.trusted.filter(x => x !== target) }); ok(p, "Player untrusted.");
    } })),
  ]);
}
async function warpEditor(p, name) {
  if (!isAdmin(p) || !await authenticateDeveloper(p) || !warpReady(p) || !isAdmin(p)) return;
  const v = name ? DB.warps.get(name) : undefined;
  if (name && (!v || v.owner)) return err(p, "Server warp not found.");
  const r = await modal(p, name ? "§lEdit Server Warp" : "§lCreate Server Warp", [
    ...(name ? [] : [{ type: "text", key: "n", label: "Warp ID", placeholder: "pvp" }]),
    { type: "text", key: "d", label: "Display name", default: v?.display ?? "" },
    { type: "text", key: "c", label: "Cost (0 = free)", default: v?.cost ?? 0 },
    { type: "text", key: "i", label: "Icon path", default: v?.icon ?? "textures/items/ender_pearl" },
    { type: "dropdown", key: "category", label: "Category", options: WARP_CATEGORIES, default: Math.max(0, WARP_CATEGORIES.indexOf(v?.category)) },
    { type: "toggle", key: "h", label: "Hidden (admins only)", default: v?.hidden },
    { type: "toggle", key: "m", label: name ? "Move warp to my position" : "Use my position", default: !name },
  ]);
  if (!r) return;
  if (!warpReady(p) || !isAdmin(p) || (name && DB.warps.get(name) !== v)) return err(p, "Warp changed or is unavailable.");
  const id = name ?? String(r.n ?? "").toLowerCase().replace(/\s+/g, "_");
  if (!id || (!name && DB.warps.has(id))) return err(p, "Invalid or existing warp ID.");
  const pos = r.m || !name ? loc(p) : v;
  DB.warps.set(id, { ...v, ...pos, display: r.d || id, cost: Math.max(0, +r.c || 0), icon: r.i, hidden: r.h, category: WARP_CATEGORIES[r.category] ?? "Other" });
  ok(p, "Warp §e" + id + "§a saved.");
}
cmd({ name: "warp", module: "warps", desc: "Teleport to a server warp", usage: "[name]", run: (p, a) => (a[0] ? useWarp(p, a[0].toLowerCase()) : warpsUI(p)) });
cmd({ name: "warps", module: "warps", desc: "List warps", run: warpsUI });
cmd({ name: "pwarp", module: "warps", desc: "Player warp menu or visit a player warp", usage: "[go <player> <name>]", run: (p, a) => {
  if (a[0]?.toLowerCase() !== "go") return myWarpsUI(p);
  const target = online().find(x => x.name.toLowerCase() === (a[1] ?? "").toLowerCase());
  if (!target || !validWarpName((a[2] ?? "").toLowerCase())) return err(p, "Player warp not found or owner is offline.");
  return useWarp(p, personalKey(target.id, a[2].toLowerCase()));
} });
cmd({ name: "setwarp", admin: true, module: "warps", desc: "Create server warp here", usage: "<name>", run: (p, a) => {
  if (!warpReady(p) || !isAdmin(p)) return;
  if (!a[0]) return warpEditor(p);
  const id = a[0].toLowerCase(), old = DB.warps.get(id);
  if (old?.owner) return err(p, "Cannot overwrite a player warp.");
  DB.warps.set(id, { ...old, ...loc(p), display: a[0] }); ok(p, "Warp set.");
} });
cmd({ name: "delwarp", admin: true, module: "warps", desc: "Delete server warp", usage: "<name>", run: (p, a) => {
  if (!warpReady(p) || !isAdmin(p)) return;
  const id = (a[0] ?? "").toLowerCase(), v = DB.warps.get(id);
  if (!v || v.owner) return err(p, "Server warp not found.");
  removeWarp(id); ok(p, "Warp deleted.");
} });
addMember({ text: "§l§5Warps\n§r§8Server & player warps", icon: "textures/ui/essx/icons/teleport", module: "warps", run: warpsUI });
addAdmin({ text: "§l§5Warp Manager\n§r§8Create / edit / delete", icon: "textures/ui/essx/icons/teleport", module: "warps", run: async p => {
  if (!warpReady(p) || !isAdmin(p)) return;
  await menu(p, "§lWarp Manager", "", [
    { text: "§l§aCreate Server Warp Here", icon: "textures/ui/essx/icons/add", run: () => warpEditor(p) },
    { text: "§lPlayer Warp Slot Settings", icon: "textures/ui/essx/icons/edit", run: async () => {
      if (!isAdmin(p) || !await authenticateDeveloper(p)) return;
      const old = cfg().playerWarps;
      const r = await modal(p, "Warp Slot Settings", [
        { type: "text", key: "base", label: "Free slots", default: old.baseSlots },
        { type: "text", key: "max", label: "Maximum slots", default: old.maxSlots },
        { type: "text", key: "price", label: "Price per extra slot", default: old.slotPrice },
      ]);
      if (!r || !warpReady(p) || !isAdmin(p)) return;
      const base = Number(r.base), max = Number(r.max), price = Number(r.price);
      if (![base, max, price].every(Number.isSafeInteger) || base < 0 || max < base || max > 100 || price < 0 || price > 1000000000) return err(p, "Invalid slot settings.");
      cfg().playerWarps = { baseSlots: base, maxSlots: max, slotPrice: price }; saveCfg(); ok(p, "Warp slot settings saved.");
    } },
    ...DB.warps.entries().filter(([, v]) => !v.owner).map(([id, v]) => ({ icon: "textures/ui/essx/icons/teleport", text: "§l" + id, run: () => menu(p, "§lWarp " + id, "", [
      { text: "§lEdit", icon: "textures/ui/essx/icons/edit", run: () => warpEditor(p, id) },
      { text: "§l§cDelete", icon: "textures/ui/essx/icons/delete", run: async () => {
        if (!isAdmin(p) || !await authenticateDeveloper(p) || !warpReady(p) || !isAdmin(p) || DB.warps.get(id) !== v) return err(p, "Warp changed or is unavailable.");
        removeWarp(id); ok(p, "Deleted.");
      } },
    ]) })),
  ]);
} });

// ================= SPAWN =================
export function spawnLoc() {
  const s = cfg().spawnLoc;
  if (s) return s;
  const d = world.getDefaultSpawnLocation();
  return { x: d.x + 0.5, y: d.y, z: d.z + 0.5, dim: "minecraft:overworld" };
}

let spawnSequence = 0;
const pendingSpawn = new Set();
const SPAWN_PLANTS = /^minecraft:(?:short_grass|tall_grass|tallgrass|fern|large_fern|deadbush|dead_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony)$/;
export function groundedSpawn(dimension, destination, configured) {
  const x = Math.floor(destination.x), z = Math.floor(destination.z);
  const passable = block => block && (block.isAir || SPAWN_PLANTS.test(block.typeId));
  const room = y => passable(dimension.getBlock({ x, y, z })) && passable(dimension.getBlock({ x, y: y + 1, z }));
  // Keep an indoor/underground spawn below its roof; default spawn starts at the surface.
  const top = configured ? undefined : dimension.getTopmostBlock({ x, z });
  if (!configured && !top) return undefined;
  const start = Math.min(configured ? Math.floor(destination.y) - 1 : top.location.y, dimension.heightRange.max - 3);
  for (let y = start; y >= dimension.heightRange.min; y--) {
    const floor = dimension.getBlock({ x, y, z });
    if (floor?.isSolid && !floor.isLiquid && room(y + 1)) return { ...destination, y: y + 1 };
  }
}

async function prepareSpawn(p, destination) {
  if (pendingSpawn.has(p.id)) throw new Error("Spawn teleport is already in progress.");
  const dimension = world.getDimension(destination.dim ?? "overworld"), origin = { ...p.location, dim: p.dimension.id };
  pendingSpawn.add(p.id);
  let area;
  const release = () => {
    pendingSpawn.delete(p.id);
    if (area) try { dimension.runCommand(`tickingarea remove ${area}`); } catch (e) { console.warn("[EssX] Spawn area cleanup failed: " + e); }
  };
  const ready = () => {
    if (!p.isValid || p.getComponent("minecraft:health")?.currentValue === 0) throw new Error("Spawn teleport cancelled.");
    if (p.dimension.id !== origin.dim || (p.location.x - origin.x) ** 2 + (p.location.y - origin.y) ** 2 + (p.location.z - origin.z) ** 2 > 0.6) throw new Error("Spawn teleport cancelled, you moved.");
    for (const fn of tpHooks.canTeleport) { const reason = fn(p); if (reason) throw new Error(reason); }
  };
  try {
    ready();
    const configured = !!cfg().spawnLoc;
    let landing;
    try { landing = groundedSpawn(dimension, destination, configured); } catch {}
    if (!landing) {
      const name = `essx_spawn_${now().toString(36)}_${++spawnSequence}`;
      if (!dimension.runCommand(`tickingarea add circle ${Math.floor(destination.x)} 0 ${Math.floor(destination.z)} 0 ${name} true`).successCount) throw new Error("Spawn terrain could not be loaded.");
      area = name;
      for (let tick = 0; tick < 20 && !landing; tick++) {
        await new Promise(resolve => system.runTimeout(resolve, 5));
        ready();
        try { landing = groundedSpawn(dimension, destination, configured); } catch {}
      }
    }
    if (!landing) throw new Error("Spawn has no loaded ground with room to stand. Ask an admin to set spawn on the ground.");
    ready();
    return { location: landing, release };
  } catch (e) { release(); throw e; }
}
const goSpawn = p => teleport(p, spawnLoc(), "spawn", { prepare: prepareSpawn });
cmd({ name: "spawn", aliases: ["lobby", "hub"], module: "spawn", desc: "Go to spawn", run: goSpawn });
cmd({ name: "setspawn", admin: true, module: "spawn", desc: "Set server spawn here",
  run: (p) => { cfg().spawnLoc = loc(p); saveCfg(); try { world.setDefaultSpawnLocation({ x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) }); } catch {} ok(p, "Spawn set at " + locStr(cfg().spawnLoc)); } });
addMember({ text: "§l§aSpawn\n§r§8Back to spawn", icon: "textures/ui/essx/icons/coords", module: "spawn", run: goSpawn });

// ================= BACK =================
const backLoc = new Map();
tpHooks.beforeTeleport.push((p) => backLoc.set(p.id, loc(p)));
world.afterEvents.entityDie.subscribe((ev) => {
  if (ev.deadEntity.typeId !== "minecraft:player") return;
  const p = ev.deadEntity;
  backLoc.set(p.id, loc(p));
  if (mod("back")) system.runTimeout(() => { try { msg(p, "§7Use §e!back §7to return to your death point."); } catch {} }, 40);
});
function goBack(p) { if (!mod("back")) return err(p, "Back is disabled on this server."); const l = backLoc.get(p.id); if (!l) return err(p, "No previous location."); return teleport(p, l, "previous location"); }
cmd({ name: "back", module: "back", desc: "Return to last location / death", run: goBack });

// ================= TPA =================
/** target id -> [{from, here, t}] */
const requests = new Map();
const tpaEnabled = p => p?.isValid && mod("tpa");
const requestSeconds = r => Math.max(0, Math.ceil((r.t + cfg().tpa.timeout * 1000 - now()) / 1000));
function pending(targetId) {
  const list = (requests.get(targetId) ?? []).filter(r => requestSeconds(r) > 0);
  if (list.length) requests.set(targetId, list); else requests.delete(targetId);
  return list;
}
function removeRequest(targetId, request) {
  const list = pending(targetId).filter(r => r !== request);
  if (list.length) requests.set(targetId, list); else requests.delete(targetId);
}
function sendTpa(p, t, here) {
  if (!tpaEnabled(p)) return err(p, "TPA is disabled on this server.");
  if (!t?.isValid || t.id === p.id || !online().some(o => o.id === t.id)) return err(p, "Invalid player.");
  if (DB.pdata.get(t.id)?.tpToggle === false) return err(p, t.name + " is not accepting teleport requests.");
  const list = pending(t.id).filter(r => r.from !== p.id);
  list.push({ from: p.id, here, t: now() });
  requests.set(t.id, list);
  ok(p, `Request sent to §e${t.name}§a. Expires in ${cfg().tpa.timeout}s.`);
  msg(t, `§e${p.name} §fwants ${here ? "§byou to teleport to them" : "§bto teleport to you"}§f. Open TPA or use §a${cfg().prefix}tpaccept §for §c${cfg().prefix}tpdeny§f.`);
  sound(t, "random.orb");
}
function getReq(t, fromName) {
  const list = pending(t.id);
  if (fromName) { const f = findPlayer(fromName); return list.find(r => r.from === f?.id); }
  return list[list.length - 1];
}
function accept(t, fromName, selected) {
  if (!tpaEnabled(t)) return err(t, "TPA is disabled on this server.");
  const r = selected ? pending(t.id).find(x => x === selected) : getReq(t, fromName);
  if (!r) return err(t, "That request expired or is no longer pending.");
  const f = online().find(o => o.id === r.from && o.isValid);
  removeRequest(t.id, r);
  if (!f) return err(t, "That player is offline.");
  const mover = r.here ? t : f, destination = r.here ? f : t;
  const originDim = mover.dimension.id;
  const validate = () => {
    if (!mod("tpa")) return "Teleport cancelled: TPA is disabled.";
    if (!mover.isValid || !destination.isValid || !online().some(o => o.id === mover.id) || !online().some(o => o.id === destination.id)) return "Teleport cancelled: a player left.";
    if (mover.getComponent("minecraft:health")?.currentValue <= 0 || destination.getComponent("minecraft:health")?.currentValue <= 0 || mover.dimension.id !== originDim) return "Teleport cancelled: player died or changed dimension.";
  };
  ok(t, "Accepted request from " + f.name);
  if (f.id !== t.id) msg(f, `§a${t.name} accepted your request.`);
  return teleport(mover, loc(destination), destination.name, {
    validate, watchMovement:true,
    resolveDestination: () => loc(destination),
  });
}
function deny(t, fromName, selected) {
  if (!tpaEnabled(t)) return err(t, "TPA is disabled on this server.");
  const r = selected ? pending(t.id).find(x => x === selected) : getReq(t, fromName);
  if (!r) return err(t, "That request expired or is no longer pending.");
  removeRequest(t.id, r);
  const f = online().find(o => o.id === r.from);
  if (f) err(f, t.name + " denied your request.");
  ok(t, "Request denied.");
}
function outgoing(p) {
  const all = [];
  for (const targetId of requests.keys()) for (const r of pending(targetId)) if (r.from === p.id) all.push({ targetId, request:r });
  return all;
}
function cancelTpa(p, targetId, selected) {
  if (!tpaEnabled(p)) return err(p, "TPA is disabled on this server.");
  const entries = outgoing(p).filter(x => (!targetId || x.targetId === targetId) && (!selected || x.request === selected));
  if (!entries.length) return err(p, "No matching outgoing requests.");
  for (const {targetId:id, request} of entries) {
    removeRequest(id, request);
    const target = online().find(o => o.id === id);
    if (target) msg(target, `§7${p.name} cancelled their teleport request.`);
  }
  ok(p, `Cancelled ${entries.length} teleport request${entries.length === 1 ? "" : "s"}.`);
}
function toggleTpa(p) {
  if (!tpaEnabled(p)) return err(p, "TPA is disabled on this server.");
  const d = DB.pdata.get(p.id, {}); d.tpToggle = d.tpToggle === false; DB.pdata.set(p.id, d);
  ok(p, "Requests " + (d.tpToggle ? "enabled" : "disabled"));
}
const warmupText = p => isAdmin(p) || !cfg().teleportDelay ? "Instant for this player." : `Stand still for ${cfg().teleportDelay}s or the teleport is cancelled.`;
async function requestUI(p, r, from) {
  if (!pending(p.id).includes(r)) return err(p, "That request expired or is no longer pending.");
  const mover = r.here ? p : from;
  return menu(p, "§lIncoming Request", `§e${from.name} §7${r.here ? "asks you to teleport to them" : "asks to teleport to you"}.\n§7Expires in §e${requestSeconds(r)}s§7. Refresh to update.\n§7${warmupText(mover)}`, [
    { text:"§l§aAccept", icon:"textures/ui/essx/icons/check", run:()=>accept(p, undefined, r) },
    { text:"§l§cDeny", icon:"textures/ui/essx/icons/close", run:()=>deny(p, undefined, r) },
    { text:"§l§eRefresh timer", icon:"textures/ui/essx/icons/cycle", run:()=>requestUI(p,r,from) },
  ]);
}
async function cancelUI(p) {
  const list = outgoing(p);
  if (!list.length) return err(p, "No outgoing requests.");
  return menu(p, "§lCancel Request", "§7Select an outgoing request to cancel. Timers update when refreshed.", [
    ...list.map(({targetId,request:r}) => { const target = online().find(o => o.id === targetId); return { text:`§l§c${target?.name ?? "Offline"}\n§r§7${r.here ? "TPA Here" : "TPA"} · ${requestSeconds(r)}s left`, icon:"textures/ui/essx/icons/close", run:()=>cancelTpa(p,targetId,r) }; }),
    {text:"§l§eRefresh timer",icon:"textures/ui/essx/icons/cycle",run:()=>cancelUI(p)},
  ]);
}
async function tpaUI(p) {
  if (!tpaEnabled(p)) return err(p, "TPA is disabled on this server.");
  const pend = pending(p.id), sent = outgoing(p), enabled = DB.pdata.get(p.id)?.tpToggle !== false;
  return menu(p, "§lTeleport Requests", `§7Requests: ${enabled ? "§aON" : "§cOFF"} §7| Incoming: ${pend.length} | Outgoing: ${sent.length}\n§7Warmup: ${warmupText(p)}\n§7Request timers refresh when you reopen this menu.`, [
    { text:"§l§bTPA to Player\n§r§8Ask to teleport to them", icon:"textures/items/ender_pearl", run:async()=>{const target=await pickPlayer(p,"§lTPA");if(target)sendTpa(p,target,false);} },
    { text:"§l§dTPA Here\n§r§8Ask them to come to you", icon:"textures/items/ender_eye", run:async()=>{const target=await pickPlayer(p,"§lTPA Here");if(target)sendTpa(p,target,true);} },
    { text:`§l${enabled ? "§a" : "§c"}Receiving: ${enabled ? "ON" : "OFF"}\n§r§8Tap to toggle`, icon:"textures/ui/essx/icons/settings", run:()=>{toggleTpa(p);return tpaUI(p);} },
    ...pend.map(r => { const f = online().find(o => o.id === r.from); return { icon:"textures/ui/icon_steve", text:`§l§e${f?.name ?? "Offline"}\n§r§7${r.here ? "wants you there" : "wants to come"} · ${requestSeconds(r)}s left`, run:()=>f ? requestUI(p,r,f) : err(p,"That player is offline.") }; }),
    ...(sent.length ? [{ text:`§l§cCancel outgoing request\n§r§8${sent.length} pending`, icon:"textures/ui/essx/icons/close", run:()=>cancelUI(p) }] : []),
    ...(mod("back") ? [{ text:"§l§bBack to previous location\n§r§8Last teleport or death", icon:"textures/ui/essx/icons/back", run:()=>goBack(p) }] : []),
    { text:"§l§eRefresh requests\n§r§8Update timers", icon:"textures/ui/essx/icons/cycle", run:()=>tpaUI(p) },
  ]);
}
cmd({ name:"tpa", module:"tpa", desc:"Request to teleport to player", usage:"[player]", run:(p,a)=>a[0]?sendTpa(p,findPlayer(a[0]),false):tpaUI(p) });
cmd({ name:"tpahere", module:"tpa", desc:"Request player to teleport to you", usage:"[player]", run:(p,a)=>a[0]?sendTpa(p,findPlayer(a[0]),true):tpaUI(p) });
cmd({ name:"tpaccept", aliases:["tpyes"], module:"tpa", desc:"Accept teleport request", usage:"[player]", run:(p,a)=>accept(p,a[0]) });
cmd({ name:"tpdeny", aliases:["tpno"], module:"tpa", desc:"Deny teleport request", usage:"[player]", run:(p,a)=>deny(p,a[0]) });
cmd({ name:"tpacancel", module:"tpa", desc:"Cancel outgoing teleport requests", usage:"[player]", run:(p,a)=>{const target=a[0]?findPlayer(a[0]):undefined;if(a[0]&&!target)return err(p,"Player not found.");return cancelTpa(p,target?.id);} });
cmd({ name:"tptoggle", module:"tpa", desc:"Toggle teleport requests", run:toggleTpa });
addMember({ text:"§l§bTPA\n§r§8Teleport requests", icon:"textures/ui/essx/icons/teleport", module:"tpa", run:tpaUI });
world.afterEvents.playerLeave.subscribe(({playerId}) => {
  requests.delete(playerId);
  for (const targetId of requests.keys()) {
    const list = pending(targetId).filter(r => r.from !== playerId);
    if (list.length) requests.set(targetId, list); else requests.delete(targetId);
  }
});

// ================= RTP =================
const pendingRtp = new Set();
let rtpSequence = 0;
async function rtp(p) {
  if (!p.isValid || p.getComponent("minecraft:health")?.currentValue === 0) return;
  if (pendingRtp.has(p.id)) return err(p, "Random TP is already searching for safe ground.");
  if (p.dimension.id !== "minecraft:overworld") return err(p, "RTP only works in the Overworld.");
  const c = { ...cfg().rtp };
  const left = (DB.pdata.get(p.id, {}).rtpAt ?? 0) + c.cooldown * 1000 - now();
  if (left > 0 && !isAdmin(p)) return err(p, "RTP cooldown: §e" + fmtTime(left));
  for (const fn of tpHooks.canTeleport) { const reason = fn(p); if (reason) return err(p, reason); }
  const cost = Math.max(0, Math.floor(Number(c.cost) || 0));
  const origin = { ...p.location, dim: p.dimension.id };
  const ready = () => {
    if (!p.isValid || p.getComponent("minecraft:health")?.currentValue === 0 || !mod("rtp")) throw new Error("Random TP cancelled.");
    if (p.dimension.id !== origin.dim || (p.location.x - origin.x) ** 2 + (p.location.y - origin.y) ** 2 + (p.location.z - origin.z) ** 2 > 0.6) throw new Error("Random TP cancelled, you moved.");
    for (const fn of tpHooks.canTeleport) { const reason = fn(p); if (reason) throw new Error(reason); }
  };
  let paid = 0, landed = false, prepared;
  pendingRtp.add(p.id);
  try {
    if (cost && !isAdmin(p)) {
      if (!charge(p, cost, "RTP")) return;
      paid = cost;
    }
    const range = nextRtpRange(c, c.origin === "spawn" ? spawnLoc() : origin, DB.pdata.get(p.id, {}).rtpProgress);
    msg(p, `§eFinding safe ground ${Math.floor(range.minRadius)}–${Math.ceil(range.maxRadius)} blocks from your RTP origin... stay still.`);
    const dimension = world.getDimension("overworld");
    prepared = await findRtpDestination({
      dimension, center: range.center, minRadius: range.minRadius, maxRadius: range.maxRadius,
      wait: (ticks) => new Promise(resolve => system.runTimeout(resolve, ticks)),
      checkReady: ready,
      makeAreaName: () => `essx_rtp_${now().toString(36)}_${++rtpSequence}`,
    });
    ready();
    for (const fn of tpHooks.beforeTeleport) fn(p);
    // Recheck after loading and hooks, immediately before the actual teleport.
    const checked = inspectRtpColumn(dimension, Math.floor(prepared.location.x), Math.floor(prepared.location.z));
    if (checked.status !== "safe") throw new Error("The destination ground changed. Try RTP again.");
    const destination = checked.location;
    p.teleport(destination, { dimension, checkForBlocks: true, keepVelocity: false });
    landed = true;
    const data = DB.pdata.get(p.id, {});
    data.rtpAt = now();
    data.rtpProgress = { origin: range.origin, center: range.center, distance: Math.hypot(destination.x - range.center.x, destination.z - range.center.z) };
    DB.pdata.set(p.id, data);
    for (const fn of tpHooks.afterTeleport) try { fn(p); } catch {}
    ok(p, `Randomly teleported to §e${Math.floor(destination.x)}, ${destination.y}, ${Math.floor(destination.z)}`);
    sound(p, "mob.endermen.portal");
  } catch (e) {
    if (p.isValid) err(p, "Random TP failed: " + (e.message ?? e));
    console.warn("[EssX] RTP failed: " + e);
  } finally {
    prepared?.release();
    pendingRtp.delete(p.id);
    if (!landed && paid) addBal(p.id, paid);
  }
}
cmd({ name: "rtp", aliases: ["wild", "randomtp"], module: "rtp", desc: "Random teleport", run: rtp });
addMember({ text: "§l§2Random TP\n§r§8Explore the wild", icon: "textures/ui/essx/icons/land", module: "rtp", run: rtp });

// ================= ADMIN TELEPORTS =================
cmd({ name: "tp", admin: true, desc: "Teleport to player / bring", usage: "<player> [target]",
  run: (p, a) => {
    const t = findPlayer(a[0]); if (!t) return err(p, "Player not found.");
    if (a[1]) { const t2 = findPlayer(a[1]); if (!t2) return err(p, "Target not found."); t.teleport(t2.location, { dimension: t2.dimension }); return ok(p, `Teleported ${t.name} to ${t2.name}`); }
    p.teleport(t.location, { dimension: t.dimension }); ok(p, "Teleported to " + t.name);
  } });
cmd({ name: "tphere", aliases: ["bring", "s"], admin: true, desc: "Bring a player to you", usage: "<player>", run: (p, a) => { const t = findPlayer(a[0]); if (!t) return err(p, "Player not found."); t.teleport(p.location, { dimension: p.dimension }); ok(p, "Brought " + t.name); } });
cmd({ name: "tpall", admin: true, desc: "Bring everyone to you", run: (p) => { for (const o of online()) if (o.id !== p.id) o.teleport(p.location, { dimension: p.dimension }); ok(p, "Teleported everyone."); } });
cmd({ name: "top", admin: true, desc: "Go to the highest block", run: (p) => { const b = p.dimension.getTopmostBlock({ x: p.location.x, z: p.location.z }); if (b) p.teleport({ x: p.location.x, y: b.location.y + 1, z: p.location.z }); } });
