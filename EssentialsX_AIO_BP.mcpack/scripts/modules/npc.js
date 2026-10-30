// EssentialsX AIO - By Opiar | NPC system (shop, warps, kits, daily, quests, bank, rules, command, etc.)
import { world, system } from "@minecraft/server";
import { cfg, mod } from "../core/config.js";
import { cmd, addAdmin, commands, dispatch, memberMenu } from "../core/commands.js";
import { msg, ok, err, isAdmin, menu, modal, confirm, now, cmdRun, sound } from "../core/utils.js";
import { authenticateDeveloper } from "../core/developer-auth.js";

export const SKINS = ["Villager", "Scientist", "Teacher", "Farmer", "Builder", "Shopkeeper", "Kiosk", "Beekeeper", "Agent", "Explorer",
  "Scientist 2", "Scientist 3", "Teacher 2", "Farmer 2", "Builder 2", "Merchant", "Kiosk 2", "Beekeeper 2", "Clerk", "Guide",
  "Portal Guide", "Royal Guard", "Banker", "Blacksmith", "Quest Ranger", "Crystal Mage", "Lifesteal Warden", "Sky Pilot", "Market Chef"];

// Types: label -> how to open (runs a command name through dispatcher)
const TYPES = [
  { id: "menu", name: "Main Menu", cmd: "menu" },
  { id: "shop", name: "Shop", cmd: "shop" },
  { id: "sell", name: "Sell Items", cmd: "sell" },
  { id: "auction", name: "Auction House", cmd: "ah" },
  { id: "warps", name: "Warps", cmd: "warps" },
  { id: "kits", name: "Kits / Starter Kit", cmd: "kit" },
  { id: "daily", name: "Daily Reward", cmd: "daily" },
  { id: "quests", name: "Daily Quests", cmd: "quests" },
  { id: "bank", name: "Bank / Money", cmd: "bank" },
  { id: "transfer", name: "Transfer Money", cmd: "pay" },
  { id: "clan", name: "Clans", cmd: "clan" },
  { id: "land", name: "Land Claims", cmd: "land" },
  { id: "rules", name: "Rules", cmd: "rules" },
  { id: "redeem", name: "Redeem Code", cmd: "redeem" },
  { id: "report", name: "Report", cmd: "report" },
  { id: "rtp", name: "Random TP", cmd: "rtp" },
  { id: "rank", name: "Rank Info", cmd: "myrank" },
  { id: "stats", name: "Profile / Stats", cmd: "stats" },
  { id: "leaderboard", name: "Leaderboards", cmd: "top10" },
  { id: "warp_single", name: "Warp To (set data = warp id)", cmd: "warp" },
  { id: "command", name: "Custom Command (data = command)", cmd: null },
  { id: "message", name: "Talk / Message (data = text)", cmd: null },
];

function setSkin(e, i) { try { e.triggerEvent("essx:skin_" + Math.max(0, Math.min(SKINS.length - 1, i))); e.setDynamicProperty("essx:skin", i); } catch {} }

async function createNpc(p) {
  const r = await modal(p, "§lCreate NPC", [
    { type: "text", key: "n", label: "Display name", default: "§e§lShop" },
    { type: "dropdown", key: "t", label: "Type", options: TYPES.map((t) => t.name) },
    { type: "text", key: "d", label: "Data (warp id / command / message)", default: "" },
    { type: "dropdown", key: "s", label: "Skin", options: SKINS },
    { type: "text", key: "sub", label: "Subtitle (second line)", default: "§7Tap to interact" },
  ]);
  if (!r) return;
  const e = p.dimension.spawnEntity("essx:npc", { x: Math.floor(p.location.x) + 0.5, y: p.location.y, z: Math.floor(p.location.z) + 0.5 });
  apply(e, r.n, TYPES[r.t].id, r.d, r.sub);
  setSkin(e, r.s);
  try { e.setRotation({ x: 0, y: p.getRotation().y + 180 }); } catch {}
  ok(p, "NPC created. §7Sneak + tap it to edit.");
}
function apply(e, name, type, data, sub) {
  e.setDynamicProperty("essx:name", name);
  e.setDynamicProperty("essx:type", type);
  e.setDynamicProperty("essx:data", data ?? "");
  e.setDynamicProperty("essx:sub", sub ?? "");
  e.nameTag = name + (sub ? "\n" + sub : "");
}
async function editNpc(p, e) {
  if (!await authenticateDeveloper(p)) return;
  const name = e.getDynamicProperty("essx:name") ?? "NPC";
  const type = e.getDynamicProperty("essx:type") ?? "menu";
  const data = e.getDynamicProperty("essx:data") ?? "";
  const sub = e.getDynamicProperty("essx:sub") ?? "";
  await menu(p, "§lEdit NPC", `§fName: ${name}\n§fType: §e${TYPES.find((t) => t.id === type)?.name}\n§fData: §7${data || "-"}`, [
    { text: "§l§eEdit Settings", icon: "textures/ui/essx/icons/settings", run: async () => {
      const r = await modal(p, "§lEdit NPC", [
        { type: "text", key: "n", label: "Display name", default: name },
        { type: "dropdown", key: "t", label: "Type", options: TYPES.map((t) => t.name), default: Math.max(0, TYPES.findIndex((t) => t.id === type)) },
        { type: "text", key: "d", label: "Data", default: data },
        { type: "text", key: "sub", label: "Subtitle", default: sub },
      ]);
      if (r && e.isValid) { apply(e, r.n, TYPES[r.t].id, r.d, r.sub); ok(p, "Saved."); }
    } },
    { text: "§l§dChange Skin", icon: "textures/ui/essx/icons/account", run: async () => { const r = await modal(p, "§lSkin", [{ type: "dropdown", key: "s", label: "Skin", options: SKINS, default: e.getDynamicProperty("essx:skin") ?? 0 }]); if (r && e.isValid) setSkin(e, r.s); } },
    { text: "§l§bMove To Me", icon: "textures/ui/essx/icons/move", run: () => e.teleport(p.location, { dimension: p.dimension }) },
    { text: "§l§3Face Me", icon: "textures/ui/essx/icons/account", run: () => { const dx = p.location.x - e.location.x, dz = p.location.z - e.location.z; e.setRotation({ x: 0, y: (Math.atan2(-dx, dz) * 180) / Math.PI }); } },
    { text: "§l§7Rotate 45°", icon: "textures/ui/essx/icons/rotate", run: () => { const r = e.getRotation(); e.setRotation({ x: 0, y: r.y + 45 }); } },
    { text: "§l§cDelete NPC", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Delete", "Delete this NPC?")) { e.remove(); ok(p, "Deleted."); } } },
  ]);
}

const lastUse = new Map();
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId !== "essx:npc") return;
  ev.cancel = true;
  const p = ev.player, e = ev.target;
  const sneaking = p.isSneaking;
  const wand = ev.itemStack?.typeId === "essx:npc_wand";
  system.run(() => {
    if (now() - (lastUse.get(p.id) ?? 0) < 400) return;
    lastUse.set(p.id, now());
    if ((sneaking || wand) && isAdmin(p)) return editNpc(p, e);
    if (!mod("npc")) return err(p, "NPCs are disabled.");
    const type = e.getDynamicProperty("essx:type") ?? "menu";
    const data = String(e.getDynamicProperty("essx:data") ?? "");
    const t = TYPES.find((x) => x.id === type);
    sound(p, "random.pop");
    if (type === "message") return p.sendMessage((e.getDynamicProperty("essx:name") ?? "NPC") + "§7: §f" + data.replace(/\|/g, "\n"));
    if (type === "command") {
      if (!data) return;
      if (data.startsWith(cfg().prefix)) return dispatch(p, data.slice(cfg().prefix.length));
      try { p.runCommand(data.replace(/@s|{player}/g, `"${p.name}"`)); } catch (er) { cmdRun(data.replace(/@s|{player}/g, `"${p.name}"`)); }
      return;
    }
    if (type === "warp_single") return dispatch(p, "warp " + data);
    if (t?.cmd) dispatch(p, t.cmd);
  });
});
world.afterEvents.entityHitEntity.subscribe((ev) => {
  if (ev.hitEntity?.typeId !== "essx:npc" || ev.damagingEntity?.typeId !== "minecraft:player") return;
  const p = ev.damagingEntity;
  if (isAdmin(p) && p.isSneaking) editNpc(p, ev.hitEntity);
});

async function npcAdmin(p) {
  const near = p.dimension.getEntities({ type: "essx:npc", location: p.location, maxDistance: 32 });
  await menu(p, "§lNPC Manager", "§7Sneak + tap an NPC to edit it.\n§7NPCs nearby: §e" + near.length, [
    { text: "§l§aCreate NPC Here", icon: "textures/ui/essx/icons/add", run: () => createNpc(p) },
    { text: "§l§eGet NPC Edit Item", icon: "textures/items/essx_npc_edit", run: () => { cmdRun(`give "${p.name}" essx:npc_wand`); ok(p, "Tap an NPC with the wand to edit it."); } },
    ...near.map((e) => ({ icon: "textures/ui/essx/icons/npc", text: "§l" + (e.getDynamicProperty("essx:name") ?? "NPC") + "\n§r§8" + (e.getDynamicProperty("essx:type") ?? ""), run: () => editNpc(p, e) })),
  ]);
}
cmd({ name: "npc", admin: true, module: "npc", desc: "NPC manager", run: npcAdmin });
addAdmin({ text: "§l§aNPC Manager\n§r§8Shop, warp, quest NPCs...", icon: "textures/ui/essx/icons/npc", module: "npc", run: npcAdmin });
