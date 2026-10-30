// EssentialsX AIO - By Opiar | Admin structure builder
import { world, system, ItemStack, EquipmentSlot, BlockPermutation, StructureRotation, StructureSaveMode } from "@minecraft/server";
import { mod } from "../core/config.js";
import { addAdmin, cmd } from "../core/commands.js";
import { authenticateDeveloper, hasDeveloperAccess } from "../core/developer-auth.js";
import { menu, modal, confirm, isAdmin, giveItem, ok, err, log } from "../core/utils.js";
import { canBuild } from "./protection.js";
import { isLoggedIn } from "./login.js";
import { BUILDS, BUILD_CATEGORIES } from "../core/build-catalog.js";
import { BuilderEngine, lookRotation, DIRECTION_NAMES } from "../core/builder.js";

import { areaEditPlan, walkingAreaPlan, MAX_WALK_VOLUME } from "../core/area-edit.js";

const AREA_WAND = "essx:area_wand";
const WAND = "essx:builder_wand";
const selected = new Map();
const forms = new Set();
const placing = new Set();
const sneaking = new Set();
const lastUse = new Map();
const walking = new Map();
let walkCursor = 0;
const footAnchor = p => ({ x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) });
const heldAreaWand = p => p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId === AREA_WAND;
function stopAreaWalk(p, message) {
  const active = walking.delete(p.id);
  if (message && active) ok(p, message);
  return active;
}
const engine = new BuilderEngine({
  getManager: () => world.structureManager,
  resolve: (type, states) => BlockPermutation.resolve(type, states),
  rotations: [StructureRotation.None, StructureRotation.Rotate90, StructureRotation.Rotate180, StructureRotation.Rotate270],
  memoryMode: StructureSaveMode.Memory,
  authorized: (p) => mod("builder") && isLoggedIn(p) && hasDeveloperAccess(p),
  canBuild,
});
const heldWand = (p) => p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId === WAND;
const access = async (p) => {
  if (!mod("builder")) return false;
  if (!isLoggedIn(p)) { err(p, "Login before using Builder."); return false; }
  return authenticateDeveloper(p);
};

async function chooseBuild(p, build) {
  const blueprint = build.create();
  const old = selected.get(p.id);
  const r = await modal(p, build.name, [
    { type: "label", label: `${build.description}\nSize: ${blueprint.size.x} × ${blueprint.size.y} × ${blueprint.size.z}\nFront entrance is centered on the targeted block; the build extends in the chosen direction.` },
    { type: "dropdown", key: "direction", label: "Build extends toward", options: ["Current look direction", ...DIRECTION_NAMES], default: old?.direction ?? 0 },
    { type: "dropdown", key: "yMode", label: "Floor Y-level", options: ["Target block top + offset", "Exact floor Y"], default: old?.yMode ?? 0 },
    { type: "slider", key: "offset", label: "Y offset from target surface", min: -32, max: 32, step: 1, default: old?.offset ?? 0 },
    { type: "text", key: "exactY", label: "Exact floor Y (used only in exact mode)", default: old?.exactY ?? Math.floor(p.location.y) },
    { type: "toggle", key: "replace", label: "Replace ALL blocks in the bounding box, including interior air", default: false },
    { type: "label", label: "Placement saves one Undo snapshot per admin for this session. Undo restores the entire box, including any later edits or container contents there. Entities are not saved or removed. Overlapping builds invalidate older Undo snapshots." },
  ], "Select Build");
  if (!r) return;
  const exactY = Number(String(r.exactY).trim());
  if (r.yMode === 1 && (!String(r.exactY).trim() || !Number.isSafeInteger(exactY))) return err(p, "Enter a whole-number floor Y-level.");
  if (!await access(p)) return;
  selected.set(p.id, { build, direction: r.direction, yMode: r.yMode, offset: r.offset, exactY, replace: !!r.replace });
  ok(p, `${build.name} selected. Hold the Builder Wand, look at a block within 48 blocks, then use it to place. Crouch with the wand to reopen Builder.`);
}

async function placeSelected(p) {
  if (placing.has(p.id) || forms.has(p.id)) return;
  placing.add(p.id);
  try {
    if (!await access(p)) return;
    stopAreaWalk(p, "Walking Area Edit stopped for manual placement.");
    const selection = selected.get(p.id);
    if (!selection) return err(p, "Choose a build in !builder first.");
    const hit = p.getBlockFromViewDirection({ maxDistance: 48, includeLiquidBlocks: false, includePassableBlocks: false });
    if (!hit) return err(p, "Look at a solid block within 48 blocks.");
    const location = hit.block.location;
    const target = { x: location.x, y: selection.yMode === 1 ? selection.exactY : location.y + 1 + selection.offset, z: location.z };
    const rotation = selection.direction === 0 ? lookRotation(p.getRotation().y) : selection.direction - 1;
    const result = engine.place(p, selection.build.create(), target, rotation, selection.replace, selection.build.name);
    ok(p, `${selection.build.name} placed at ${result.from.x}, ${result.from.y}, ${result.from.z}. Use !buildundo to restore the area.`);
    log("admin", `${p.name} placed ${selection.build.id} in ${p.dimension.id} at ${JSON.stringify(result.from)} direction ${DIRECTION_NAMES[rotation]}`);
    for (const other of world.getAllPlayers()) if (other.id !== p.id && result.invalidated.includes(other.id)) other.sendMessage("§e[Builder] Your previous Undo snapshot expired because of an overlapping build or the session history limit.");
  } catch (error) { err(p, "Builder: " + error.message); }
  finally { placing.delete(p.id); }
}

async function undoBuild(p) {
  if (!await access(p)) return;
  stopAreaWalk(p, "Walking mode stopped before Undo. Only the latest batch will be restored.");
  const record = engine.history.get(p.id);
  if (!record) return err(p, "No build to undo in this session.");
  if (!await confirm(p, "Undo " + record.name, "Restore the entire saved bounding box? Later block edits and container changes inside this area will also be replaced. Entities are not restored.")) return;
  try {
    // The player may have interacted with another command while the form was open.
    if (engine.history.get(p.id) !== record) return err(p, "Your Undo snapshot changed. Open Undo again.");
    const restored = engine.undo(p);
    ok(p, restored.name + " undone.");
    log("admin", `${p.name} undid ${restored.name} in ${restored.dimension.id} at ${JSON.stringify(restored.from)}`);
  } catch (error) { err(p, "Undo: " + error.message); }
}

async function editArea(p, operation) {
  const anchor = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const dimension = p.dimension.id;
  const grass = operation === "grass";
  const result = await modal(p, grass ? "§lGrass Floor" : "§lClear Area", [
    { type: "label", label: `Origin: ${anchor.x}, ${anchor.y}, ${anchor.z}. Coordinates stay anchored here while this form is open.\n${grass ? "Replaces one flat layer with grass blocks." : "Replaces the entire box with air; blocks and containers inside are removed."}` },
    ...(grass ? [{ type: "slider", key: "radius", label: "Radius (10 = 21 × 21 blocks)", min: 1, max: 20, step: 1, default: 10 }] : [
      { type: "slider", key: "width", label: "Width X", min: 1, max: 64, step: 1, default: 35 },
      { type: "slider", key: "depth", label: "Depth Z", min: 1, max: 64, step: 1, default: 35 },
      { type: "slider", key: "height", label: "Height Y", min: 1, max: 32, step: 1, default: 1 },
      { type: "slider", key: "offsetX", label: "Start X offset from origin", min: -64, max: 64, step: 1, default: 30 },
      { type: "slider", key: "offsetZ", label: "Start Z offset from origin", min: -64, max: 64, step: 1, default: 30 },
    ]),
    { type: "dropdown", key: "yMode", label: "Y placement", options: ["Exact world Y", "Offset from origin Y"], default: 0 },
    { type: "text", key: "y", label: "Y-level / offset", default: grass ? "58" : "90" },
    { type: "label", label: "Maximum 8,192 blocks; the entire area must be loaded and free of players. Uses the same one-per-admin Undo history as Builder. Undo restores later edits and container contents too; entities are excluded. History ends on world/script reload." },
  ], "Preview Area");
  if (!result) return;
  let plan;
  try { plan = areaEditPlan(operation, result, anchor); }
  catch (error) { return err(p, error.message); }
  if (!await confirm(p, plan.name, `${plan.name}: ${plan.volume.toLocaleString("en-US")} blocks\nFrom: ${plan.from.x}, ${plan.from.y}, ${plan.from.z}\nTo: ${plan.to.x}, ${plan.to.y}, ${plan.to.z}\nDimension: ${dimension}\nReplaces ALL blocks in this box. Save an Undo snapshot and apply?`)) return;
  if (placing.has(p.id)) return;
  placing.add(p.id);
  try {
    if (!await access(p)) return;
    if (p.dimension.id !== dimension) return err(p, "Return to the original dimension and reopen Area Edit.");
    stopAreaWalk(p, "Walking mode stopped for the one-time edit.");
    const applied = engine.place(p, plan.blueprint, plan.target, 0, true, plan.name);
    ok(p, `${plan.name} applied: ${plan.volume} blocks. Use Undo Last Edit or !buildundo to restore.`);
    log("admin", `${p.name} used ${plan.name} in ${dimension} from ${JSON.stringify(plan.from)} to ${JSON.stringify(plan.to)}`);
    for (const other of world.getAllPlayers()) if (other.id !== p.id && applied.invalidated.includes(other.id)) other.sendMessage("§e[Builder] Your Undo snapshot expired because of an overlapping area edit or history limit.");
  } catch (error) { err(p, "Area Edit: " + error.message); }
  finally { placing.delete(p.id); }
}
async function configureWalkingArea(p, operation) {
  const grass = operation === "grass";
  const r = await modal(p, grass ? "§lWalking Grass Floor" : "§lWalking Clear Area", [
    { type: "label", label: `${grass ? "A grass floor follows underneath you." : "Clear a box ahead of the direction you walk; your own floor is kept by the default Y offset."}\nHold Area Edit and walk into another X/Z block to apply. Crouch or switch items to pause. Stop Walking Mode turns it off.` },
    ...(grass ? [{ type: "slider", key: "radius", label: "Grass radius", min: 1, max: 10, step: 1, default: 10 }] : [
      { type: "slider", key: "width", label: "Width across your path", min: 1, max: 15, step: 1, default: 7 },
      { type: "slider", key: "depth", label: "Distance ahead to clear", min: 1, max: 15, step: 1, default: 7 },
      { type: "slider", key: "height", label: "Height to clear", min: 1, max: 12, step: 1, default: 4 },
    ]),
    { type: "dropdown", key: "yMode", label: "Y placement", options: ["Exact world Y", "Offset from current feet Y"], default: 1 },
    { type: "text", key: "y", label: "Y-level / offset", default: grass ? "-1" : "0" },
    { type: "label", label: `Maximum ${MAX_WALK_VOLUME} blocks per batch. Protected/unloaded areas, players in the box or invalid Y stop the mode. Undo restores ONLY the latest batch, not the entire walked path. Changing dimensions, teleporting more than 16 blocks, losing access or leaving the server stops the mode.` },
  ], "Start Walking Mode");
  if (!r) return;
  const anchor = footAnchor(p), dimension = p.dimension.id;
  let plan;
  try { plan = walkingAreaPlan(operation, r, anchor, anchor, p.getRotation().y); }
  catch (error) { return err(p, error.message); }
  if (!await confirm(p, plan.name, `${plan.volume} blocks per batch. This repeatedly replaces blocks as you walk while holding Area Edit. The area follows your CURRENT position. Undo saves only the latest batch; earlier edits in the path remain. Start?`)) return;
  if (!await access(p)) return;
  if (p.dimension.id !== dimension) return err(p, "Dimension changed. Open walking mode again.");
  walking.set(p.id, { operation, options: { ...r }, dimension, last: footAnchor(p), nextTick: system.currentTick });
  ok(p, "Walking " + (grass ? "Grass" : "Clear") + " enabled. Hold Area Edit and walk. Use Stop Walking Mode or !areastop to stop.");
}

// One global bounded batch per pass. Each active player has a ten-tick cooldown.
system.runInterval(() => {
  const players = new Map(world.getAllPlayers().map(p => [p.id, p]));
  for (const id of walking.keys()) if (!players.has(id)) walking.delete(id);
  const entries = [...walking.entries()];
  if (!entries.length) { walkCursor = 0; return; }
  for (let offset = 0; offset < entries.length; offset++) {
    const index = (walkCursor + offset) % entries.length;
    const [id, state] = entries[index], p = players.get(id);
    try {
      if (!mod("builder") || !isLoggedIn(p) || !hasDeveloperAccess(p)) {
        walking.delete(id); err(p, "Walking Area Edit stopped: access is unavailable."); continue;
      }
      const anchor = footAnchor(p);
      if (p.dimension.id !== state.dimension || Math.hypot(anchor.x - state.last.x, anchor.y - state.last.y, anchor.z - state.last.z) > 16) {
        walking.delete(id); err(p, "Walking Area Edit stopped after teleporting/changing dimension. Start it again here."); continue;
      }
      if (!heldAreaWand(p) || p.isSneaking || forms.has(id) || placing.has(id)) { state.last = anchor; continue; }
      if (system.currentTick < state.nextTick || anchor.x === state.last.x && anchor.z === state.last.z || engine.busy) continue;
      const plan = walkingAreaPlan(state.operation, state.options, anchor, state.last, p.getRotation().y);
      placing.add(id);
      try {
        const result = engine.place(p, plan.blueprint, plan.target, plan.rotation, true, plan.name);
        state.last = anchor; state.nextTick = system.currentTick + 10;
        for (const other of players.values()) if (other.id !== id && result.invalidated.includes(other.id)) other.sendMessage("§e[Builder] Your Undo snapshot expired because of an overlapping walking edit or history limit.");
      } finally { placing.delete(id); }
      walkCursor = (index + 1) % entries.length;
      break;
    } catch (error) {
      walking.delete(id);
      try { err(p, "Walking Area Edit stopped: " + error.message); } catch {}
      walkCursor = (index + 1) % entries.length;
      break;
    }
  }
}, 5);

async function areaEditorPage(p) {
  if (!await access(p)) return;
  const active = walking.get(p.id);
  await menu(p, "§lArea Editor", `§7${active ? "Walking mode: " + active.operation.toUpperCase() : "Walking mode: OFF"}\n§7Hold Area Edit and walk to follow. Crouch/switch items to pause.\n§7Undo restores only the latest batch.`, [
    { text: "§lClear Area (Walk)\n§r§7Automatically clear ahead as you walk", icon: "textures/items/essx_area_clear", run: () => configureWalkingArea(p, "clear") },
    { text: "§lGet Area Edit Item", icon: "textures/items/essx_area_edit", run: async () => { if (await access(p)) { giveItem(p, new ItemStack(AREA_WAND, 1)); ok(p, "Choose Grass or Clear, hold Area Edit and walk. Use the item for its menu."); } } },
    { text: "§lGrass Floor (Walk)\n§r§7Grass follows underneath your feet", icon: "textures/items/essx_area_grass", run: () => configureWalkingArea(p, "grass") },
    { text: "§lOne-time Edit\n§r§7Original fixed-coordinate fill/clear", icon: "textures/items/essx_area_edit", run: () => menu(p, "§lOne-time Edit", "§7Preview and apply one fixed box.", [
      { text: "§lClear Area", icon: "textures/items/essx_area_clear", run: () => editArea(p, "clear") },
      { text: "§lGrass Floor", icon: "textures/items/essx_area_grass", run: () => editArea(p, "grass") },
    ]) },
    { text: "§lStop Walking Mode", icon: "textures/ui/essx/icons/close", run: () => { stopAreaWalk(p); ok(p, "Walking Area Edit is off."); } },
    { text: "§lUndo Last Edit\n§r§7Stop walking and undo the latest batch", icon: "textures/ui/essx/icons/back", run: () => undoBuild(p) },
  ]);
}
export async function areaEditorMenu(p) {
  if (forms.has(p.id) || placing.has(p.id)) return;
  forms.add(p.id);
  try { await areaEditorPage(p); }
  catch (error) { err(p, "Area Edit: " + error.message); }
  finally { forms.delete(p.id); }
}

export async function builderMenu(p) {
  if (forms.has(p.id) || placing.has(p.id)) return;
  forms.add(p.id);
  try {
    if (!await access(p)) return;
    const choice = selected.get(p.id);
    await menu(p, `§lBuilder • ${BUILDS.length} Builds`, `§7${choice ? "Selected: " + choice.build.name : "Choose a category and a build."}\n§7Get a Builder Wand, then crouch while holding it to open this menu. Stand, aim at a block and use the wand to place.\n§7Undo lasts until script/world reload; at most 16 admins' latest snapshots are retained.`, [
      ...BUILD_CATEGORIES.map((category) => ({ text: `§l${category.name}\n§r§7${BUILDS.filter((b) => b.category === category.id).length} builds`, icon: category.icon,
        run: () => menu(p, category.name, "§7Select a build and placement options.", BUILDS.filter((b) => b.category === category.id).map((build) => ({ text: "§l" + build.name, icon: category.icon, run: () => chooseBuild(p, build) }))) })),
      { text: "§lArea Editor\n§r§7Grass floors, clear blocks & Undo", icon: "textures/items/essx_area_edit", run: () => areaEditorPage(p) },
      { text: "§lGet Builder Wand", icon: "textures/items/essx_builder_wand", run: async () => { if (await access(p)) { giveItem(p, new ItemStack(WAND, 1)); ok(p, "Hold the Builder Wand and crouch to open Builder. Use it while standing to place the selected build."); } } },
      { text: "§lUndo Last Build", icon: "textures/ui/essx/icons/back", run: () => undoBuild(p) },
    ]);
  } catch (error) { err(p, "Builder: " + error.message); }
  finally { forms.delete(p.id); }
}

addAdmin({ text: "§l§aArea Editor\n§r§8Grass floors, clear blocks & Undo", icon: "textures/items/essx_area_edit", module: "builder", run: areaEditorMenu });
cmd({ name: "areastop", admin: true, desc: "Stop your walking Area Edit mode", run: p => { stopAreaWalk(p); ok(p, "Walking Area Edit is off."); } });
cmd({ name: "areaedit", aliases: ["area"], admin: true, module: "builder", desc: "Open Area Edit tools", run: areaEditorMenu });

addAdmin({ text: `§l§aBuilder • ${BUILDS.length} Builds\n§r§8Houses, farms, decorations & undo`, icon: "textures/ui/essx/icons/builder", module: "builder", run: builderMenu });
cmd({ name: "builder", admin: true, module: "builder", desc: "Open the structure Builder menu", run: builderMenu });
cmd({ name: "buildplace", admin: true, module: "builder", desc: "Place the selected build at the block you are looking at", run: placeSelected });
cmd({ name: "buildundo", admin: true, module: "builder", desc: "Undo your latest build in this session", run: undoBuild });

world.beforeEvents.itemUse.subscribe((ev) => {
  const areaWand = ev.itemStack?.typeId === AREA_WAND;
  if (!areaWand && ev.itemStack?.typeId !== WAND) return;
  const canceled = ev.cancel;
  ev.cancel = true; // Cancel the usable component so the wand is never consumed.
  if (canceled || !isAdmin(ev.source) || !mod("builder") || !isLoggedIn(ev.source)) return;
  const p = ev.source;
  if (Date.now() - (lastUse.get(p.id) ?? 0) < 500) return;
  lastUse.set(p.id, Date.now());
  system.run(() => {
    if (!p.isValid) return;
    if (areaWand) void areaEditorMenu(p);
    else if (p.isSneaking || !selected.has(p.id)) void builderMenu(p);
    else void placeSelected(p);
  });
});
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    try {
      if (!mod("builder") || !isAdmin(p) || !isLoggedIn(p) || !heldWand(p) || !p.isSneaking) { sneaking.delete(p.id); continue; }
      if (sneaking.has(p.id)) continue;
      sneaking.add(p.id);
      void builderMenu(p);
    } catch { /* Player left during polling. */ }
  }
}, 4);
world.afterEvents.playerLeave.subscribe((ev) => {
  walking.delete(ev.playerId);
  selected.delete(ev.playerId); sneaking.delete(ev.playerId); lastUse.delete(ev.playerId);
  // Form/placement guards release in their own finally blocks; undo remains session-scoped.
});
