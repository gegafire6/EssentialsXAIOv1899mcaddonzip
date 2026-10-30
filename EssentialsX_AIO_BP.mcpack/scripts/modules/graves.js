// EssentialsX AIO - By Opiar | Gravestones (keeps full item data: enchants, names, shulker contents)
import { world, system } from "@minecraft/server";
import { GRAVE_STYLES, graveStyle } from "../core/grave-styles.js";
import { DB } from "../core/db.js";
import { cfg, mod } from "../core/config.js";
import { cmd, addMember } from "../core/commands.js";
import { msg, ok, err, nameOf, isAdmin, menu, now, fmtTime, inv, equip, ARMOR_SLOTS, online, log, locStr, teleport } from "../core/utils.js";

function playerGraveStyle(id) {
  const settings = cfg().graves;
  return graveStyle(settings.allowPlayerStyles === false ? settings.defaultStyle : (DB.pdata.get(id, {}).graveStyle ?? settings.defaultStyle));
}
function applyGraveStyle(entity, style) {
  // Cosmetic failures must never interrupt moving or recovering inventory.
  try {
    if (entity.getDynamicProperty("essx:grave_style") === style.id) return;
    entity.triggerEvent("essx:grave_" + style.id);
    entity.setDynamicProperty("essx:grave_style", style.id);
  } catch (error) { console.warn("[EssX] grave style failed: " + error); }
}

system.run(() => { try { if (mod("graves")) world.gameRules.keepInventory = true; } catch {} });

world.afterEvents.entityDie.subscribe((ev) => {
  const p = ev.deadEntity;
  if (p.typeId !== "minecraft:player" || !mod("graves")) return;
  if (!world.gameRules.keepInventory) return;
  try {
    const c = inv(p);
    const eq = equip(p);
    const keepsBackpack = item => item?.keepOnDeath && ['essx:backpack', 'essx:iron_backpack', 'essx:diamond_backpack'].includes(item.typeId);
    let count = 0;
    for (let i = 0; i < c.size; i++) { const item = c.getItem(i); if (item && !keepsBackpack(item)) count++; }
    for (const s of ARMOR_SLOTS) if (eq?.getEquipment(s)) count++;
    if (!count) return;
    const dim = p.dimension;
    const range = dim.heightRange;
    const l = { x: Math.floor(p.location.x) + 0.5, y: Math.max(range.min + 1, Math.min(range.max - 2, Math.floor(p.location.y))), z: Math.floor(p.location.z) + 0.5 };
    const g = dim.spawnEntity("essx:grave", l);
    const style = playerGraveStyle(p.id);
    applyGraveStyle(g, style);
    const gc = g.getComponent("minecraft:inventory").container;
    for (let i = 0; i < c.size; i++) {
      const item = c.getItem(i);
      if (item && !keepsBackpack(item)) c.transferItem(i, gc);
    }
    for (const s of ARMOR_SLOTS) { const it = eq?.getEquipment(s); if (it) { gc.addItem(it); eq.setEquipment(s, undefined); } }
    const id = "G" + now().toString(36);
    g.nameTag = `§c✝ §f${p.name}'s Grave\n§7Tap to collect`;
    g.addTag("essx_grave:" + id);
    g.setDynamicProperty("essx:owner", p.id);
    g.setDynamicProperty("essx:at", now());
    DB.graves.set(id, { owner: p.id, name: p.name, loc: { ...l, dim: dim.id }, at: now(), style: style.id });
    system.runTimeout(() => { try { msg(p, `§cYour items are in a grave at §e${locStr({ ...l, dim: dim.id })}§c. Protected for §e${cfg().graves.protectMinutes}m§c.`); } catch {} }, 30);
    log("death", `${p.name} grave at ${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`);
  } catch (e) { console.warn("[EssX] grave failed " + e); }
});

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId !== "essx:grave") return;
  ev.cancel = true;
  const p = ev.player, g = ev.target;
  system.run(() => loot(p, g));
});
world.afterEvents.entityHitEntity.subscribe((ev) => {
  if (ev.hitEntity?.typeId === "essx:grave" && ev.damagingEntity?.typeId === "minecraft:player") loot(ev.damagingEntity, ev.hitEntity);
});

const looting = new Set();

function loot(p, g) {
  if (!g.isValid || looting.has(g.id)) return;
  looting.add(g.id);
  try { collect(p, g); } finally { looting.delete(g.id); }
}

function collect(p, g) {
  const owner = g.getDynamicProperty("essx:owner");
  const at = g.getDynamicProperty("essx:at") ?? 0;
  const prot = cfg().graves.protectMinutes * 60000;
  if (owner !== p.id && !isAdmin(p) && now() - at < prot) return err(p, `This grave is protected for §e${fmtTime(prot - (now() - at))}`);
  const gc = g.getComponent("minecraft:inventory").container;
  const pc = inv(p);
  const eq = equip(p);
  let moved = 0;
  for (let i = 0; i < gc.size; i++) {
    const it = gc.getItem(i);
    if (!it) continue;
    // auto-equip armor if slot empty
    const slot = /_helmet|turtle_helmet|carved_pumpkin/.test(it.typeId) ? "Head" : /_chestplate|elytra/.test(it.typeId) ? "Chest" : /_leggings/.test(it.typeId) ? "Legs" : /_boots/.test(it.typeId) ? "Feet" : it.typeId === "minecraft:shield" || it.typeId === "minecraft:totem_of_undying" ? "Offhand" : undefined;
    if (slot && eq && !eq.getEquipment(slot)) { eq.setEquipment(slot, it); gc.setItem(i, undefined); moved++; continue; }
    const left = gc.transferItem(i, pc);
    if (left) { p.dimension.spawnItem(left, p.location); gc.setItem(i, undefined); }
    moved++;
  }
  for (const t of g.getTags()) if (t.startsWith("essx_grave:")) archiveGrave(t.slice(11), "Collected");
  g.remove();
  ok(p, `Collected ${moved} item stack(s) from ${owner === p.id ? "your" : nameOf(owner) + "'s"} grave.`);
  try { p.playSound("random.levelup"); } catch {}
}

// despawn old graves -> drop items
system.runInterval(() => {
  const life = cfg().graves.despawnMinutes * 60000;
  for (const d of ["overworld", "nether", "the_end"]) {
    for (const g of world.getDimension(d).getEntities({ type: "essx:grave" })) {
      const at = g.getDynamicProperty("essx:at") ?? 0;
      const left = life - (now() - at);
      if (left > 0) {
        const graveId = g.getTags().find(tag => tag.startsWith("essx_grave:"))?.slice(11);
        const record = graveId ? DB.graves.get(graveId) : undefined;
        const style = playerGraveStyle(g.getDynamicProperty("essx:owner"));
        applyGraveStyle(g, style);
        if (record && record.style !== style.id) DB.graves.set(graveId, { ...record, style: style.id });
        const name = nameOf(g.getDynamicProperty("essx:owner"));
        const prot = cfg().graves.protectMinutes * 60000 - (now() - at);
        g.nameTag = `§c✝ §f${name}'s Grave\n${prot > 0 ? "§aProtected " + fmtTime(prot) : "§eUnprotected"}\n§7Despawns in ${fmtTime(left)}`;
        continue;
      }
      const gc = g.getComponent("minecraft:inventory").container;
      for (let i = 0; i < gc.size; i++) { const it = gc.getItem(i); if (it) { g.dimension.spawnItem(it, g.location); gc.setItem(i, undefined); } }
      for (const t of g.getTags()) if (t.startsWith("essx_grave:")) archiveGrave(t.slice(11), "Expired");
      g.remove();
    }
  }
  for (const [id, gr] of DB.graves.entries()) if (now() - gr.at > life + 3600000) archiveGrave(id, "Expired");
}, 100);

// Keep locations separately from active graves; collection/despawn still removes the entity.
const HISTORY_LIMIT = 20;
function archiveGrave(id, status) {
  const grave = DB.graves.get(id);
  if (!grave) return;
  const history = DB.graveHistory.get(grave.owner, []).filter(g => g.id !== id);
  history.push({ ...grave, id, status, archivedAt: now() });
  DB.graveHistory.set(grave.owner, history.sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT));
  DB.graves.delete(id);
}

function getGrave(p, id, owner, previous) {
  if (!mod("graves")) return;
  const grave = previous
    ? DB.graveHistory.get(owner, []).find(g => g.id === id)
    : DB.graves.get(id);
  return grave && (grave.owner === p.id || isAdmin(p)) ? grave : undefined;
}

function teleportToGrave(p, id, owner, previous) {
  const grave = getGrave(p, id, owner, previous);
  if (!grave) return err(p, "This grave record is no longer available.");
  return teleport(p, grave.loc, previous ? "previous grave location" : "grave", {
    prepare: () => {
      const current = getGrave(p, id, owner, previous);
      if (!current) throw new Error("This grave record is no longer available.");
      return { location: current.loc };
    },
  });
}

async function graveDetails(p, id, owner, previous) {
  const grave = getGrave(p, id, owner, previous);
  if (!grave) return err(p, "This grave record is no longer available.");
  await menu(p, previous ? "§lPrevious Grave" : "§lGrave", `§f${grave.name}\n§7${locStr(grave.loc)}\n§7${fmtTime(now() - grave.at)} ago\n${previous ? "§e" + grave.status + ": location only; items are not restored." : "§7Teleport here to collect your items."}`, [
    { text: "§l§aTeleport", icon: "textures/ui/essx/icons/teleport", run: () => teleportToGrave(p, id, owner, previous) },
  ]);
}

async function previousGravesUI(p) {
  const history = DB.graveHistory.get(p.id, []).slice().sort((a, b) => b.at - a.at);
  await menu(p, "§lPrevious Graves", history.length ? "§7Your last 20 collected or expired graves. Teleport returns to the location only." : "§7No previous graves recorded yet.", history.map(g => ({
    icon: graveStyle(g.style).icon ?? "textures/ui/essx/icons/grave",
    text: `§l${g.status} Grave\n§r§8${locStr(g.loc)} | ${fmtTime(now() - g.at)} ago`,
    run: () => graveDetails(p, g.id, p.id, true),
  })));
}

function chooseGraveStyle(p, id) {
  if (!mod("graves")) return err(p, "Graves are disabled.");
  if (cfg().graves.allowPlayerStyles === false) return err(p, "Grave style is set by the server.");
  const style = graveStyle(id);
  const data = DB.pdata.get(p.id, {});
  data.graveStyle = style.id;
  DB.pdata.set(p.id, data);
  for (const [graveId, record] of DB.graves.entries()) {
    if (record.owner !== p.id) continue;
    DB.graves.set(graveId, { ...record, style: style.id });
    // Unloaded graves keep their saved selection and refresh when their chunk loads.
    try {
      for (const entity of world.getDimension(record.loc.dim).getEntities({ type: "essx:grave", tags: ["essx_grave:" + graveId] })) {
        applyGraveStyle(entity, style);
      }
    } catch {}
  }
  ok(p, style.label + " selected for your active and future graves.");
}
async function graveStylesUI(p) {
  const selected = playerGraveStyle(p.id);
  if (cfg().graves.allowPlayerStyles === false) return menu(p, "§lGrave Styles", "§7The server has selected §e" + selected.label + "§7. Player style choices are disabled.", []);
  await menu(p, "§lGrave Styles", "§7All styles lie flat. Applies to your active and future graves.\n§7Selected: §e" + selected.label, GRAVE_STYLES.map(style => ({
    text: `§l${style.id === selected.id ? "§a✓ " : "§f"}${style.label}\n§r§8${style.description}`,
    icon: style.icon ?? "textures/ui/essx/icons/grave",
    run: () => chooseGraveStyle(p, style.id),
  })));
}

async function gravesUI(p) {
  const mine = DB.graves.entries().filter(([, g]) => g.owner === p.id || isAdmin(p)).sort(([, a], [, b]) => b.at - a.at);
  await menu(p, "§lGraves", mine.length ? "§7Select an active grave to teleport." : "§7No active graves. Check Previous Graves for saved locations.", [
    ...mine.map(([id, g]) => ({
      icon: graveStyle(g.style).icon ?? "textures/ui/essx/icons/grave",
      text: `§l${g.name}\n§r§8${locStr(g.loc)} | ${fmtTime(now() - g.at)} ago`,
      run: () => graveDetails(p, id, g.owner, false),
    })),
    { text: "§l§bGrave Styles\n§r§8Skeleton, gravestone, ataol, cruz", icon: "textures/ui/essx/icons/grave_cross", run: () => graveStylesUI(p) },
    { text: "§l§ePrevious Graves\n§r§8Saved death locations", icon: "textures/ui/essx/icons/grave", run: () => previousGravesUI(p) },
  ]);
}
cmd({ name: "graves", aliases: ["grave"], module: "graves", desc: "View graves and teleport to saved locations", run: gravesUI });
addMember({ text: "§l§8Graves\n§r§8Teleport & grave history", icon: "textures/ui/essx/icons/grave", module: "graves", run: gravesUI });
