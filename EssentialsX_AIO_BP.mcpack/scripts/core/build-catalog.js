// Original, generated build templates. Local +Z runs from the entrance toward the back.
export const BUILD_CATEGORIES = [
  { id: "houses", name: "Houses & Bases", icon: "textures/items/oak_door" },
  { id: "farms", name: "Farms", icon: "textures/items/wheat" },
  { id: "large", name: "Large Structures", icon: "textures/blocks/stonebrick" },
  { id: "decor", name: "Outdoor Decorations", icon: "textures/items/flower_pot" },
  { id: "fantasy", name: "Fantasy Builds", icon: "textures/items/amethyst_shard" },
  { id: "utility", name: "Utility Builds", icon: "textures/items/iron_pickaxe" },
];

class Blueprint {
  constructor(x, y, z) { this.size = { x, y, z }; this.blocks = new Map(); }
  set(x, y, z, type, states) {
    if (![x, y, z].every(Number.isInteger) || x < 0 || y < 0 || z < 0 || x >= this.size.x || y >= this.size.y || z >= this.size.z) throw new Error("Blueprint coordinate outside bounds");
    this.blocks.set(`${x},${y},${z}`, { location: { x, y, z }, type: "minecraft:" + type, states });
    return this;
  }
  fill(x1, y1, z1, x2, y2, z2, type, states) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) this.set(x, y, z, type, states);
    return this;
  }
  floor(y, type, inset = 0) { return this.fill(inset, y, inset, this.size.x - 1 - inset, y, this.size.z - 1 - inset, type); }
  walls(x1, z1, x2, z2, y1, y2, type) {
    this.fill(x1, y1, z1, x2, y2, z1, type).fill(x1, y1, z2, x2, y2, z2, type);
    return this.fill(x1, y1, z1, x1, y2, z2, type).fill(x2, y1, z1, x2, y2, z2, type);
  }
  door(x, z, y = 1) { return this.fill(x, y, z, x, y + 1, z, "air"); }
  finish() { return { size: this.size, blocks: [...this.blocks.values()] }; }
}
// Compact medieval homes inspired by the supplied timber/stone, garden and wizard references.
// Every garden, overhang and chimney stays inside the same Undo bounding box.
const stair = (direction, upsideDown = false) => ({ weirdo_direction: direction, upside_down_bit: upsideDown });
const leaves = { persistent_bit: true, update_bit: false };
function timberDoor(b, x, y, z) {
  for (let half = 0; half < 2; half++) b.set(x, y + half, z, "spruce_door", {
    "minecraft:cardinal_direction": "north", door_hinge_bit: false, open_bit: false, upper_block_bit: !!half,
  });
}
function medievalHouse({ wood = "spruce", w = 13, d = 15, garden = false, balconyRoof = false, wizard = false } = {}) {
  const mid = Math.floor(w / 2), roofBase = 11;
  const b = new Blueprint(w, wizard ? 26 : roofBase + mid + 4, d);
  const beam = wood + "_log", planks = wood + "_planks";
  const infill = garden || wizard ? "calcite" : "stripped_oak_log";
  b.floor(0, "grass_block");
  // Raised stone plinth, a clear front approach, and a timber ground floor.
  b.fill(3, 0, 5, w - 4, 0, d - 4, "stone_bricks").fill(3, 1, 5, w - 4, 1, d - 4, "stone_bricks");
  b.fill(4, 1, 6, w - 5, 1, d - 5, planks);
  b.walls(3, 5, w - 4, d - 4, 2, 5, "stone_bricks");
  for (const x of [3, w - 4]) for (const z of [5, 8, d - 4]) b.fill(x, 1, z, x, 6, z, beam);
  // The upper story overhangs the lower stone walls.
  b.fill(2, 6, 4, w - 3, 6, d - 3, planks).walls(2, 4, w - 3, d - 3, 7, 10, infill);
  for (const x of [2, w - 3]) for (const z of [4, 8, d - 3]) b.fill(x, 6, z, x, 10, z, beam);
  b.walls(2, 4, w - 3, d - 3, 10, 10, planks);
  for (const z of [4, d - 3]) b.fill(mid, 7, z, mid, 10, z, beam);
  // Large recessed windows and shutters on both stories.
  for (const x of [3, w - 4]) for (const z of [7, d - 6]) b.fill(x, 3, z, x, 4, z, "glass_pane");
  for (const x of [mid - 2, mid + 2]) b.fill(x, 3, 5, x, 4, 5, "glass_pane");
  for (const x of [2, w - 3]) for (const z of [6, d - 5]) {
    b.fill(x, 7, z, x, 9, z + 1, "glass_pane");
    b.fill(x, 7, z - 1, x, 9, z - 1, planks);
  }
  for (const x of [mid - 2, mid + 2]) b.fill(x, 7, 4, x, 9, 4, "glass_pane");
  // Wrap the front balcony in trapdoor rails and support it with full-height posts.
  b.fill(3, 6, 2, w - 4, 6, 3, planks);
  for (const x of [3, w - 4]) b.fill(x, 1, 2, x, 6, 2, beam).fill(x, 7, 3, x, 7, 3, "spruce_fence");
  for (let x = 3; x <= w - 4; x++) b.set(x, 7, 2, "spruce_trapdoor", { direction: 0, open_bit: true, upside_down_bit: false });
  b.fill(3, 5, 2, w - 4, 5, 2, planks);
  for (const x of [4, w - 5]) b.set(x, 4, 2, "lantern", { hanging: true });
  timberDoor(b, mid, 2, 5); timberDoor(b, mid, 7, 4);
  b.fill(mid - 1, 1, 2, mid + 1, 1, 4, "stone_bricks");
  b.fill(mid - 1, 0, 1, mid + 1, 0, 1, "stone_brick_stairs", stair(2));
  b.fill(mid - 1, 0, 0, mid + 1, 0, 0, "cobblestone");
  // Steep tiled roof with contrasting stone stair edges and a capped ridge.
  for (let x = 0; x < w; x++) {
    const y = roofBase + Math.min(x, w - 1 - x);
    for (const z of [4, d - 3]) b.fill(x, roofBase, z, x, y, z, planks);
    const slope = x < mid ? 0 : 1;
    b.fill(x, y, 3, x, y, d - 2, x === mid ? "deepslate_tiles" : "deepslate_tile_stairs", x === mid ? undefined : stair(slope));
    for (const z of [3, d - 2]) b.set(x, y, z, x === mid ? "stone_bricks" : "stone_brick_stairs", x === mid ? undefined : stair(slope));
  }
  b.fill(mid, roofBase + mid + 1, 3, mid, roofBase + mid + 1, d - 2, "stone_brick_slab");
  b.fill(mid - 1, 11, 4, mid + 1, 13, 4, "glass_pane");
  b.set(mid, 14, 4, beam);
  if (balconyRoof) {
    for (let dx = -3; dx <= 3; dx++) {
      const y = 10 + 3 - Math.abs(dx);
      b.fill(mid + dx, y, 0, mid + dx, y, 3, dx === 0 ? "deepslate_tiles" : "deepslate_tile_stairs", dx === 0 ? undefined : stair(dx < 0 ? 0 : 1));
      b.set(mid + dx, y, 0, dx === 0 ? "stone_bricks" : "stone_brick_stairs", dx === 0 ? undefined : stair(dx < 0 ? 0 : 1));
    }
  }
  // Chimney is stone from the foundation through the roof, with a supported smoke cap.
  const chimneyX = w - 4, chimneyZ = d - 5, capY = roofBase + 6;
  b.fill(chimneyX, 1, chimneyZ, chimneyX, capY, chimneyZ, "cobblestone");
  b.set(chimneyX, capY + 1, chimneyZ, "campfire", { extinguished: false });
  // Furnished interior and an unobstructed ladder opening to the upper story.
  b.set(w - 5, 2, d - 5, "crafting_table").set(w - 6, 2, d - 5, "furnace");
  b.set(w - 5, 7, d - 4, "chest").set(mid, 7, d - 5, "barrel");
  b.fill(2, 10, 8, w - 3, 10, 8, planks);
  b.set(mid, 5, 8, "lantern", { hanging: true }).set(mid, 9, 8, "lantern", { hanging: true });
  b.fill(3, 2, 9, 3, 8, 9, beam).fill(4, 2, 9, 4, 8, 9, "ladder", { facing_direction: 5 });
  // Beds face south: foot at z=7, head at z=8, on the upper floor.
  for (let half = 0; half < 2; half++) b.set(w - 5, 7, 7 + half, "bed", { direction: 0, head_piece_bit: !!half, occupied_bit: false });
  // Supported flower boxes frame the entry rather than blocking the front path.
  for (const x of [mid - 2, mid + 2]) {
    b.set(x, 2, 4, "dirt").set(x, 3, 4, x < mid ? "poppy" : "cornflower");
    b.set(x, 2, 3, "spruce_trapdoor", { direction: 0, open_bit: true, upside_down_bit: false });
  }
  for (const x of [1, w - 2]) for (let z = 2; z < d - 1; z += 3) {
    b.set(x, 1, z, "oak_leaves", leaves);
    if (garden) b.set(x, 2, z, "azalea_leaves_flowered", leaves);
  }
  for (const [x, z] of [[1, 1], [w - 2, 1], [2, d - 2], [w - 3, d - 2]]) b.set(x, 1, z, x % 2 ? "poppy" : "dandelion");
  if (garden) {
    for (const x of [1, w - 2]) b.fill(x, 1, 5, x, 1, d - 3, "oak_leaves", leaves);
    for (const x of [2, w - 3]) for (const z of [5, d - 4]) b.fill(x, 2, z, x, 4, z, "oak_leaves", leaves);
    for (const x of [1, w - 2]) for (const z of [6, 7, 10, 11]) b.set(x, 6, z, "azalea_leaves_flowered", leaves);
    for (const x of [mid - 3, mid + 3]) b.fill(x, 1, 4, x, 4, 4, "oak_leaves", leaves);
    for (const x of [3, w - 4]) b.set(x, 8, 3, "azalea_leaves_flowered", leaves);
  }
  if (wizard) {
    // Attached turret: three reachable floors, amber windows and a tall dark spire.
    const tx = mid, tz = 5;
    b.fill(tx - 2, 0, tz - 2, tx + 2, 1, tz + 2, "stone_bricks");
    b.walls(tx - 2, tz - 2, tx + 2, tz + 2, 2, 18, "spruce_planks");
    b.fill(tx - 1, 2, tz - 1, tx + 1, 18, tz + 1, "air");
    for (const x of [tx - 2, tx + 2]) for (const z of [tz - 2, tz + 2]) b.fill(x, 2, z, x, 18, z, "spruce_log");
    for (const y of [6, 11, 16]) {
      b.fill(tx - 1, y, tz - 1, tx + 1, y, tz + 1, "spruce_planks");
      b.set(tx, y + 2, tz - 2, "glowstone").set(tx + 2, y + 2, tz, "glowstone");
    }
    b.fill(tx - 2, 2, tz - 1, tx - 2, 17, tz - 1, "spruce_log");
    b.fill(tx - 1, 2, tz - 1, tx - 1, 17, tz - 1, "ladder", { facing_direction: 5 });
    timberDoor(b, tx, 2, tz - 2); timberDoor(b, tx, 7, tz - 2);
    // Doors at the back connect both house stories to the forward turret.
    b.fill(tx, 2, tz + 2, tx, 3, tz + 2, "air");
    b.fill(tx, 7, tz + 2, tx, 8, tz + 2, "air");
    for (let layer = 0; layer < 6; layer++) {
      const radius = Math.floor((6 - layer) / 2), y = 19 + layer;
      b.fill(tx - radius, y, tz - radius, tx + radius, y, tz + radius, "deepslate_tiles");
      for (const z of [tz - radius, tz + radius]) b.fill(tx - radius, y, z, tx + radius, y, z, "deepslate_tile_stairs", stair(z < tz ? 2 : 3));
    }
    b.set(tx, 25, tz, "spruce_fence");
    // A lower side spire and covered side porches give the manor an asymmetric silhouette.
    const sx = 3, sz = d - 6;
    b.walls(sx - 1, sz - 1, sx + 1, sz + 1, 7, 14, "calcite");
    b.fill(sx, 7, sz, sx, 14, sz, "air");
    b.fill(sx, 7, sz, sx, 13, sz, "ladder", { facing_direction: 5 });
    b.fill(sx + 1, 7, sz, sx + 1, 8, sz, "air");
    b.set(sx - 1, 12, sz, "glowstone");
    for (let layer = 0; layer < 5; layer++) {
      const r = Math.floor((4 - layer) / 2);
      b.fill(sx - r, 15 + layer, sz - r, sx + r, 15 + layer, sz + r, "deepslate_tiles");
    }
    b.set(sx, 20, sz, "spruce_fence");
    for (const x of [1, w - 2]) {
      b.fill(x, 1, 3, x, 1, d - 3, "spruce_planks");
      b.fill(x, 2, 3, x, 2, d - 3, "spruce_fence");
      for (const z of [3, 8, d - 3]) b.fill(x, 1, z, x, 5, z, "spruce_log");
      b.fill(x - 1, 6, 2, x + 1, 6, d - 2, "deepslate_tile_slab");
    }
  }
  return b.finish();
}
function courtyard() {
  const b = new Blueprint(11, 7, 11);
  b.floor(0, "smooth_sandstone").walls(1, 1, 9, 9, 1, 4, "sandstone");
  b.walls(1, 1, 9, 9, 5, 5, "cut_sandstone").door(5, 1);
  for (const x of [3, 7]) b.fill(x, 2, 1, x, 3, 1, "glass").fill(x, 2, 9, x, 3, 9, "glass");
  b.fill(1, 4, 1, 3, 4, 9, "smooth_sandstone").fill(7, 4, 1, 9, 4, 9, "smooth_sandstone");
  b.walls(3, 3, 7, 7, 1, 1, "smooth_sandstone").fill(4, 1, 4, 6, 1, 6, "water").set(2, 1, 8, "chest").set(8, 1, 8, "crafting_table");
  for (const x of [2, 8]) for (const z of [2, 8]) b.set(x, 5, z, "lantern");
  return b.finish();
}
function cropFarm(crop, greenhouse) {
  const b = new Blueprint(11, greenhouse ? 7 : 5, 11);
  b.floor(0, "dirt").walls(0, 0, 10, 10, 0, 0, "oak_planks");
  b.walls(0, 0, 10, 10, 1, 1, greenhouse ? "glass" : "oak_fence").door(5, 0);
  for (let x = 2; x <= 8; x++) for (let z = 2; z <= 8; z++) {
    b.set(x, 1, z, "farmland", { moisturized_amount: 7 }).set(x, 2, z, crop, { growth: 7 });
  }
  b.set(5, 1, 5, "water").set(5, 2, 5, "air");
  b.set(1, 1, 9, "composter").set(9, 1, 9, "chest");
  for (const x of [0, 10]) for (const z of [0, 10]) b.fill(x, 1, z, x, 2, z, "oak_log").set(x, 3, z, "glowstone");
  if (greenhouse) b.walls(0, 0, 10, 10, 2, 4, "glass").door(5, 0).floor(5, "glass");
  return b.finish();
}
function cactus() {
  const b = new Blueprint(9, 6, 10);
  b.floor(0, "sandstone").walls(0, 0, 8, 9, 1, 2, "glass");
  b.fill(1, 1, 1, 7, 1, 1, "water");
  for (const x of [2, 4, 6]) b.set(x, 1, 3, "sandstone").set(x, 2, 3, "sand").set(x, 3, 3, "cactus");
  for (const x of [3, 5]) b.set(x, 4, 3, "oak_fence");
  for (let x = 1; x <= 7; x++) b.set(x, 0, 7, "hopper", { facing_direction: 3 }).set(x, 0, 8, "chest", { "minecraft:cardinal_direction": "south" });
  b.fill(1, 1, 8, 7, 1, 9, "air");
  return b.finish();
}
function tower(fantasy = false) {
  const b = new Blueprint(9, 16, 9);
  const wall = fantasy ? "deepslate_bricks" : "stone_bricks";
  b.floor(0, wall).walls(1, 1, 7, 7, 1, 12, wall).door(4, 1);
  for (const y of [4, 8, 12]) {
    b.fill(1, y, 1, 7, y, 7, "spruce_planks").set(4, y, 2, "air");
    for (const x of [1, 7]) b.set(x, y - 2, 4, fantasy ? "purple_stained_glass" : "glass");
    b.set(2, y + 1, 2, "lantern");
  }
  b.fill(4, 1, 2, 4, 12, 2, "ladder", { facing_direction: 3 });
  if (fantasy) {
    for (let i = 0; i < 3; i++) b.fill(i, 13 + i, i, 8 - i, 13 + i, 8 - i, "purple_concrete");
    b.set(4, 15, 4, "glowstone");
  } else {
    b.walls(0, 0, 8, 8, 13, 13, wall);
    for (let x = 0; x <= 8; x += 2) for (const z of [0, 8]) b.set(x, 14, z, wall);
    for (let z = 2; z < 8; z += 2) for (const x of [0, 8]) b.set(x, 14, z, wall);
  }
  b.set(2, 1, 6, "chest");
  return b.finish();
}
function gatehouse() {
  const b = new Blueprint(15, 11, 7);
  b.floor(0, "stone_bricks");
  for (const x of [0, 10]) {
    b.walls(x, 0, x + 4, 6, 1, 8, "stone_bricks").fill(x, 8, 0, x + 4, 8, 6, "stone_bricks");
    b.door(x + 2, 0).set(x + 2, 5, 0, "glass");
    for (let z = 0; z <= 6; z += 2) for (const xx of [x, x + 4]) b.set(xx, 9, z, "stone_bricks");
  }
  b.fill(5, 6, 1, 9, 7, 5, "stone_bricks").fill(5, 5, 1, 5, 5, 5, "stone_bricks").fill(9, 5, 1, 9, 5, 5, "stone_bricks");
  b.set(6, 5, 3, "sea_lantern").set(8, 5, 3, "sea_lantern");
  return b.finish();
}
function greatHall() {
  const b = new Blueprint(17, 12, 13);
  b.floor(0, "stone_bricks").walls(1, 1, 15, 11, 1, 5, "oak_planks");
  for (const x of [1, 15]) for (const z of [1, 5, 9, 11]) b.fill(x, 1, z, x, 5, z, "oak_log");
  b.fill(7, 1, 1, 9, 3, 1, "air");
  for (let x = 0; x < 17; x++) {
    const y = 6 + Math.floor(Math.min(x, 16 - x) / 2);
    b.fill(x, 6, 1, x, y, 1, "oak_planks").fill(x, 6, 11, x, y, 11, "oak_planks").fill(x, y, 0, x, y, 12, "spruce_planks");
  }
  for (const x of [1, 15]) for (const z of [3, 7]) b.fill(x, 2, z, x, 4, z, "glass");
  b.fill(6, 1, 4, 10, 1, 9, "oak_planks");
  for (const x of [5, 11]) b.fill(x, 1, 4, x, 1, 9, "spruce_slab");
  for (const z of [3, 7, 10]) b.set(8, 5, z, "sea_lantern");
  return b.finish();
}
function fountain() {
  const b = new Blueprint(9, 6, 9);
  b.floor(0, "stone_bricks").walls(0, 0, 8, 8, 1, 1, "stone_bricks").fill(1, 1, 1, 7, 1, 7, "water");
  b.fill(4, 1, 4, 4, 3, 4, "chiseled_stone_bricks").set(4, 4, 4, "sea_lantern");
  for (const x of [0, 8]) for (const z of [0, 8]) b.set(x, 2, z, "lantern");
  return b.finish();
}
function gazebo() {
  const b = new Blueprint(9, 8, 9);
  b.floor(0, "oak_planks");
  for (const x of [1, 7]) for (const z of [1, 7]) b.fill(x, 1, z, x, 4, z, "oak_log");
  b.walls(1, 1, 7, 7, 1, 1, "oak_fence").door(4, 1);
  for (let i = 0; i < 3; i++) b.fill(i, 5 + i, i, 8 - i, 5 + i, 8 - i, "spruce_planks");
  b.set(4, 4, 4, "sea_lantern").fill(2, 1, 6, 6, 1, 6, "oak_slab");
  return b.finish();
}
function market() {
  const b = new Blueprint(9, 6, 7);
  b.floor(0, "oak_planks");
  for (const x of [1, 7]) for (const z of [1, 5]) b.fill(x, 1, z, x, 4, z, "oak_fence");
  for (let x = 0; x < 9; x++) b.fill(x, 4, 0, x, 4, 6, x % 2 ? "white_wool" : "red_wool");
  b.fill(2, 1, 2, 6, 1, 2, "oak_planks").set(2, 1, 4, "chest").set(6, 1, 4, "barrel").set(4, 3, 3, "sea_lantern");
  return b.finish();
}
function mushroom() {
  const b = new Blueprint(11, 10, 11);
  b.floor(0, "moss_block").fill(3, 0, 3, 7, 0, 7, "oak_planks").walls(3, 3, 7, 7, 1, 5, "mushroom_stem").door(5, 3);
  b.set(3, 3, 5, "glass").set(7, 3, 5, "glass");
  b.fill(1, 6, 1, 9, 6, 9, "red_mushroom_block").fill(0, 7, 0, 10, 7, 10, "red_mushroom_block").fill(2, 8, 2, 8, 8, 8, "red_mushroom_block");
  for (const [x, z] of [[2, 2], [4, 7], [7, 3], [8, 8]]) b.set(x, 8, z, "white_concrete");
  b.set(4, 1, 6, "crafting_table").set(6, 1, 6, "chest").set(5, 4, 5, "sea_lantern");
  return b.finish();
}
function shrine() {
  const b = new Blueprint(11, 10, 11);
  b.floor(0, "polished_deepslate").fill(2, 1, 2, 8, 1, 8, "quartz_block").fill(4, 2, 4, 6, 2, 6, "amethyst_block");
  for (const x of [1, 9]) for (const z of [1, 9]) b.fill(x, 1, z, x, 5, z, "quartz_pillar").set(x, 6, z, "sea_lantern");
  b.fill(5, 3, 5, 5, 8, 5, "amethyst_block").fill(4, 4, 5, 6, 6, 5, "purple_stained_glass").fill(5, 4, 4, 5, 6, 6, "purple_stained_glass");
  b.set(5, 9, 5, "sea_lantern").fill(4, 1, 0, 6, 1, 1, "quartz_slab");
  return b.finish();
}
function workshop() {
  const b = new Blueprint(11, 7, 9);
  b.floor(0, "stone_bricks").walls(0, 0, 10, 8, 1, 4, "spruce_planks").door(5, 0).floor(5, "spruce_slab");
  const tools = ["crafting_table", "furnace", "blast_furnace", "smoker", "smithing_table", "anvil", "stonecutter_block"];
  tools.forEach((type, i) => b.set(i + 2, 1, 6, type));
  b.set(2, 1, 2, "chest").set(8, 1, 2, "barrel").set(5, 4, 4, "sea_lantern");
  for (const x of [0, 10]) b.fill(x, 2, 3, x, 3, 5, "glass");
  return b.finish();
}
function storage() {
  const b = new Blueprint(13, 7, 11);
  b.floor(0, "stone_bricks").walls(0, 0, 12, 10, 1, 4, "oak_planks").floor(5, "oak_slab").door(6, 0);
  for (const x of [2, 4, 8, 10]) for (const z of [3, 6, 8]) for (const y of [1, 2, 3]) b.set(x, y, z, "barrel");
  b.set(6, 1, 9, "crafting_table").set(6, 4, 3, "sea_lantern").set(6, 4, 8, "sea_lantern");
  return b.finish();
}
function bridge() {
  const b = new Blueprint(7, 7, 15);
  b.fill(1, 2, 1, 5, 2, 13, "spruce_planks");
  for (const z of [0, 14]) b.fill(1, 1, z, 5, 1, z, "spruce_slab");
  for (const x of [0, 6]) {
    b.fill(x, 2, 1, x, 3, 13, "spruce_fence");
    for (const z of [2, 7, 12]) b.fill(x, 0, z, x, 4, z, "spruce_log").set(x, 5, z, "lantern");
  }
  return b.finish();
}

export const BUILDS = [
  { id: "oak_cabin", name: "Oak Balcony House", category: "houses", description: "Two-story stone-and-oak home with a double gable, balcony, lanterns and flower boxes.", create: () => medievalHouse({ wood: "oak", w: 15, d: 15, balconyRoof: true }) },
  { id: "courtyard", name: "Desert Courtyard House", category: "houses", description: "Sandstone base with shaded wings and an open courtyard pool.", create: courtyard },
  { id: "spruce_lodge", name: "Spruce Gable Cottage", category: "houses", description: "Steep dark roof, stone foundation, timber framing, chimney and furnished upper floor.", create: () => medievalHouse() },
  { id: "garden_manor", name: "Overgrown Garden Manor", category: "houses", description: "Garden home with pale infill, leafy walls, flower boxes and a timber balcony.", create: () => medievalHouse({ wood: "oak", w: 15, d: 17, garden: true }) },
  { id: "wheat_farm", name: "Irrigated Wheat Farm", category: "farms", description: "Mature manual wheat plots, irrigation, lighting and composter.", create: () => cropFarm("wheat", false) },
  { id: "greenhouse", name: "Carrot Greenhouse", category: "farms", description: "Glass greenhouse with irrigated manual carrot plots.", create: () => cropFarm("carrots", true) },
  { id: "cactus_farm", name: "Automatic Cactus Harvester", category: "farms", description: "Growth-breaking fences, water collection, hoppers and output chests. Requires random ticks.", create: cactus },
  { id: "watchtower", name: "Stone Watchtower", category: "large", description: "Three accessible floors, ladder and crenellated lookout.", create: () => tower(false) },
  { id: "gatehouse", name: "Castle Gatehouse", category: "large", description: "Twin stone towers joined by a raised arch passage.", create: gatehouse },
  { id: "great_hall", name: "Timber Great Hall", category: "large", description: "Spacious settlement hall with long table, benches and vaulted roof.", create: greatHall },
  { id: "fountain", name: "Village Fountain", category: "decor", description: "Contained water basin with illuminated central stone monument.", create: fountain },
  { id: "gazebo", name: "Garden Gazebo", category: "decor", description: "Open timber pavilion, stepped roof, seating and lantern.", create: gazebo },
  { id: "market", name: "Striped Market Stall", category: "decor", description: "Red-and-white canopy, shop counter and storage.", create: market },
  { id: "mushroom", name: "Mushroom Cottage", category: "fantasy", description: "Hollow mushroom home with a spotted red cap and work area.", create: mushroom },
  { id: "shrine", name: "Amethyst Crystal Shrine", category: "fantasy", description: "Quartz platform, glowing pillars and a crystal centerpiece.", create: shrine },
  { id: "wizard_tower", name: "Wizard Tower", category: "fantasy", description: "Deepslate tower with a purple roof, colored windows and accessible floors.", create: () => tower(true) },
  { id: "wizard_manor", name: "Wizard Spire Manor", category: "fantasy", description: "Tall fantasy home with an attached climbable turret, amber windows and a dark spire.", create: () => medievalHouse({ w: 17, d: 17, wizard: true }) },
  { id: "workshop", name: "Survival Workshop", category: "utility", description: "Sheltered crafting, smelting, smithing, anvil and stonecutting stations.", create: workshop },
  { id: "storage", name: "Storage Depot", category: "utility", description: "Organized barrel aisles, crafting station and covered lighting.", create: storage },
  { id: "bridge", name: "Lantern Footbridge", category: "utility", description: "Raised timber crossing with railings, supports and lantern posts.", create: bridge },
];
