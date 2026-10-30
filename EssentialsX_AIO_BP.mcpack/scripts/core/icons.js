import { wearableByItem } from "./wearables.js";
import { VANILLA_ITEM_TEXTURES, VANILLA_ITEM_ALIASES } from "./vanilla-item-icons.js";

// Item IDs and Bedrock texture filenames differ, especially for blocks and legacy items.
// Paths verified against Mojang/bedrock-samples resource_pack/textures.
const ITEM_TEXTURES = {
  oak_door: "door_wood", oak_boat: "boat_oak", oak_sign: "sign",
  redstone: "redstone_dust", lapis_lazuli: "dye_powder_blue",
  cooked_beef: "beef_cooked", cooked_porkchop: "porkchop_cooked", cooked_chicken: "chicken_cooked",
  golden_carrot: "carrot_golden", golden_apple: "apple_golden",
  wheat_seeds: "seeds_wheat", sugar_cane: "reeds", melon_slice: "melon", bone_meal: "dye_powder_white",
  slime_ball: "slimeball", bow: "bow_standby", fishing_rod: "fishing_rod_uncast",
  totem_of_undying: "totem", bed: "bed_red", compass: "compass_item", clock: "clock_item",
  wooden_sword: "wood_sword", wooden_pickaxe: "wood_pickaxe", wooden_axe: "wood_axe",
  wooden_shovel: "wood_shovel", wooden_hoe: "wood_hoe",
  book: "book_normal", enchanted_book: "book_enchanted", writable_book: "book_writable",
  beef: "beef_raw", porkchop: "porkchop_raw", chicken: "chicken_raw",
};
const BLOCK_TEXTURES = {
  grass_block: "grass_side_carried", dirt: "dirt", cobblestone: "cobblestone", stone: "stone",
  oak_log: "log_oak", spruce_log: "log_spruce", sand: "sand", glass: "glass",
  stone_bricks: "stonebrick", quartz_block: "quartz_block_side", obsidian: "obsidian",
  white_wool: "wool_colored_white", pumpkin: "pumpkin_side", cactus: "cactus_side",
  piston: "piston_top_normal", sticky_piston: "piston_top_sticky", observer: "observer_front",
  redstone_torch: "redstone_torch_on", tnt: "tnt_side", torch: "torch_on", chest: "chest_front",
};

export function itemIcon(typeId) {
  // Custom items need their own resource-pack mapping rather than a vanilla path.
  const custom = {
    "essx:aegis_heart": "textures/items/essx_aegis_heart",
    "essx:phoenix_ember": "textures/items/essx_phoenix_ember",
    "essx:tempest_feather": "textures/items/essx_tempest_feather",
    "essx:titan_gauntlet": "textures/items/essx_titan_gauntlet",
    "essx:void_prism": "textures/items/essx_void_prism",

    "essx:backpack": "textures/items/essx_backpack",
    "essx:iron_backpack": "textures/items/essx_iron_backpack",
    "essx:diamond_backpack": "textures/items/essx_diamond_backpack",
    "essx:lock": "textures/items/essx_lock",
    "essx:menu": "textures/items/essx_menu",
    "essx:admin_menu": "textures/items/essx_admin",
    "essx:npc_wand": "textures/items/essx_npc_edit",
  };
  if (!typeId || (typeId.includes(":") && !typeId.startsWith("minecraft:")))
    return custom[typeId] ?? wearableByItem(typeId)?.icon ?? "textures/ui/essx/icons/inventory";
  const id = typeId.replace(/^minecraft:/, "");
  if (Object.hasOwn(BLOCK_TEXTURES, id)) return "textures/blocks/" + BLOCK_TEXTURES[id];
  // The shield's entity texture is a UV sheet, so use the armor symbol in forms.
  if (id === "shield") return "textures/items/iron_chestplate";
  if (Object.hasOwn(ITEM_TEXTURES, id)) return "textures/items/" + ITEM_TEXTURES[id];
  if (Object.hasOwn(VANILLA_ITEM_ALIASES, id)) return VANILLA_ITEM_ALIASES[id];
  if (VANILLA_ITEM_TEXTURES.has(id)) return "textures/items/" + id;
  // Unknown blocks/addon items still get a visible inventory symbol, never a guessed missing path.
  return "textures/ui/essx/icons/inventory";
}
