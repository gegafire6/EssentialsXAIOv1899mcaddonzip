// Ground verification for RTP. Never substitute a player's altitude for missing terrain.
const PLANTS = /^minecraft:(?:short_grass|tall_grass|tallgrass|fern|large_fern|deadbush|dead_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|.*_tulip|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony)$/;
const HAZARDS = /^minecraft:(?:water|flowing_water|lava|flowing_lava|fire|soul_fire|cactus|magma|magma_block|campfire|soul_campfire|sweet_berry_bush|wither_rose|powder_snow|pointed_dripstone|web|portal|end_portal|bubble_column|snow_layer|leaves|leaves2|.*_leaves)$/;
const passable = (block) => block && (block.isAir || PLANTS.test(block.typeId));

export function inspectRtpColumn(dimension, x, z) {
  try {
    const top = dimension.getTopmostBlock({ x, z });
    if (!top) return { status: "unloaded" };
    for (let y = top.location.y; y >= dimension.heightRange.min; y--) {
      const floor = dimension.getBlock({ x, y, z });
      if (!floor) return { status: "unloaded" };
      if (passable(floor)) continue;
      // Stop at the surface: never search for the ocean floor or land under lava.
      if (!floor.isSolid || floor.isLiquid || floor.isWaterlogged || HAZARDS.test(floor.typeId) || y + 2 >= dimension.heightRange.max) return { status: "unsafe" };
      const feet = dimension.getBlock({ x, y: y + 1, z });
      const head = dimension.getBlock({ x, y: y + 2, z });
      if (!feet || !head) return { status: "unloaded" };
      if (!passable(feet) || !passable(head)) return { status: "unsafe" };
      return { status: "safe", location: { x: x + 0.5, y: y + 1, z: z + 0.5 } };
    }
    return { status: "unsafe" };
  } catch { return { status: "unloaded" }; }
}

// Each successful RTP adds the configured range to the previous distance.
export function nextRtpRange(settings, center, progress) {
  const min = Number(settings.minRadius), max = Number(settings.maxRadius);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) throw new Error("Invalid RTP radius settings.");
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.z)) throw new Error("Invalid RTP center.");
  const origin = settings.origin === "spawn" ? "spawn" : "player";
  const valid = progress?.origin === origin && Number.isFinite(progress.center?.x) && Number.isFinite(progress.center?.z)
    && Number.isFinite(progress.distance) && progress.distance >= 0
    && (origin !== "spawn" || (progress.center.x === center.x && progress.center.z === center.z));
  const anchor = valid ? progress.center : center;
  const distance = valid ? progress.distance : 0;
  const minRadius = distance + min, maxRadius = distance + max;
  if (!Number.isFinite(maxRadius)) throw new Error("Invalid RTP progress.");
  return { center: { x: anchor.x, z: anchor.z }, minRadius, maxRadius, origin };
}

export async function findRtpDestination({ dimension, center, minRadius, maxRadius, wait, checkReady, makeAreaName, random = Math.random, attempts = 8, polls = 20 }) {
  if (!Number.isFinite(minRadius) || !Number.isFinite(maxRadius) || minRadius < 0 || maxRadius < minRadius) throw new Error("Invalid RTP radius settings.");
  if (!Number.isFinite(center?.x) || !Number.isFinite(center?.z)) throw new Error("Invalid RTP center.");
  for (let attempt = 0; attempt < attempts; attempt++) {
    checkReady();
    const angle = random() * Math.PI * 2;
    const radius = minRadius + random() * (maxRadius - minRadius);
    const x = Math.floor(center.x + Math.cos(angle) * radius), z = Math.floor(center.z + Math.sin(angle) * radius);
    // The actual landing is at a block center, which can cross a radius boundary.
    const distance = Math.hypot(x + 0.5 - center.x, z + 0.5 - center.z);
    if (distance < minRadius || distance > maxRadius) continue;
    let result = inspectRtpColumn(dimension, x, z), area, retained = false;
    const release = () => {
      if (!area) return;
      const name = area; area = undefined;
      try { dimension.runCommand(`tickingarea remove ${name}`); }
      catch (error) { console.warn("[EssX] RTP area cleanup failed: " + error); }
    };
    try {
      if (result.status === "unloaded") {
        const name = makeAreaName();
        if (!dimension.runCommand(`tickingarea add circle ${x} 0 ${z} 0 ${name} true`).successCount) throw new Error("RTP terrain could not be loaded.");
        area = name;
        for (let poll = 0; poll < polls && result.status === "unloaded"; poll++) {
          await wait(5);
          checkReady();
          result = inspectRtpColumn(dimension, x, z);
        }
      }
      if (result.status !== "safe") continue;
      checkReady();
      retained = true;
      return { location: result.location, release };
    } finally { if (!retained) release(); }
  }
  throw new Error("No safe loaded ground found. Try RTP again.");
}
