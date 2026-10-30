// Complete bounded versions of the reference grass/air fill commands.
import { MAX_BUILD_VOLUME, lookRotation, placementBounds } from "./builder.js";
function integer(value, label, min, max) {
  if (typeof value !== "number" && typeof value !== "string" || String(value).trim() === "") throw new Error(label + " must be a whole number.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(label + ` must be a whole number from ${min} to ${max}.`);
  return n;
}
export function areaEditPlan(operation, options, anchor) {
  if (operation !== "grass" && operation !== "clear") throw new Error("Unknown area operation.");
  if (![anchor.x, anchor.y, anchor.z].every(Number.isSafeInteger)) throw new Error("Invalid area anchor.");
  const mode = integer(options.yMode, "Y mode", 0, 1);
  const yValue = integer(options.y, "Y-level / offset", -1000000, 1000000);
  let width, depth, height, x, z;
  if (operation === "grass") {
    const radius = integer(options.radius, "Radius", 1, 20);
    width = depth = radius * 2 + 1; height = 1;
    x = anchor.x - radius; z = anchor.z - radius;
  } else {
    width = integer(options.width, "Width", 1, 64);
    depth = integer(options.depth, "Depth", 1, 64);
    height = integer(options.height, "Height", 1, 32);
    x = anchor.x + integer(options.offsetX, "X offset", -64, 64);
    z = anchor.z + integer(options.offsetZ, "Z offset", -64, 64);
  }
  const from = { x, y: mode === 0 ? yValue : anchor.y + yValue, z };
  const to = { x: x + width - 1, y: from.y + height - 1, z: z + depth - 1 };
  if (![...Object.values(from), ...Object.values(to)].every(Number.isSafeInteger)) throw new Error("Area coordinates exceed whole-number precision.");
  const volume = width * depth * height;
  if (volume > MAX_BUILD_VOLUME) throw new Error(`Area has ${volume} blocks; maximum is ${MAX_BUILD_VOLUME}. Reduce its dimensions.`);
  const type = operation === "grass" ? "minecraft:grass_block" : "minecraft:air";
  const blocks = [];
  // Clear blueprints can be empty: BuilderEngine explicitly fills the template with air.
  if (operation === "grass") for (let bx = 0; bx < width; bx++) for (let bz = 0; bz < depth; bz++) blocks.push({ location: { x: bx, y: 0, z: bz }, type });
  return {
    name: operation === "grass" ? "Grass Floor" : "Clear Area", from, to, volume, type,
    target: { x: from.x + Math.floor(width / 2), y: from.y, z: from.z },
    blueprint: { size: { x: width, y: height, z: depth }, blocks },
  };
}


export const MAX_WALK_VOLUME = 2048;
export function walkingAreaPlan(operation, options, anchor, previous = anchor, yaw = 0) {
  let plan;
  if (operation === "grass") plan = { ...areaEditPlan(operation, options, anchor), rotation: 0 };
  else {
    const dx = anchor.x - previous.x, dz = anchor.z - previous.z;
    const rotation = lookRotation(dx || dz ? Math.atan2(-dx, dz) * 180 / Math.PI : yaw);
    // The nearest row is two blocks ahead, so the wearer stays outside the box.
    const forward = [{x:0,z:1},{x:-1,z:0},{x:0,z:-1},{x:1,z:0}][rotation];
    plan = areaEditPlan(operation, { ...options, offsetX: 0, offsetZ: 0 }, anchor);
    const target = { x: anchor.x + forward.x * 2, y: plan.from.y, z: anchor.z + forward.z * 2 };
    plan = { ...plan, ...placementBounds(plan.blueprint.size, target, rotation), target, rotation };
  }
  if (![...Object.values(plan.from), ...Object.values(plan.to)].every(Number.isSafeInteger)) throw new Error("Walking area coordinates exceed whole-number precision.");
  if (plan.volume > MAX_WALK_VOLUME) throw new Error(`Walking edits are limited to ${MAX_WALK_VOLUME} blocks per batch. Reduce the size.`);
  return { ...plan, name: "Walking " + plan.name };
}
