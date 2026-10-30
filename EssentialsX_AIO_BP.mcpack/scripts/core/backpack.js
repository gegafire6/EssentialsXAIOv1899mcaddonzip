// Personal backpack storage. No vanilla container or opaque item data is reconstructed.
export const BACKPACKS = Object.freeze({
  'essx:backpack': { name: 'Leather Backpack', slots: 9, icon: 'textures/items/essx_backpack' },
  'essx:iron_backpack': { name: 'Iron Backpack', slots: 18, icon: 'textures/items/essx_iron_backpack' },
  'essx:diamond_backpack': { name: 'Diamond Backpack', slots: 27, icon: 'textures/items/essx_diamond_backpack' },
});
const MATERIALS = new Set(`coal charcoal raw_iron raw_copper raw_gold iron_ingot copper_ingot gold_ingot netherite_ingot netherite_scrap diamond emerald lapis_lazuli redstone quartz amethyst_shard flint stick string feather leather rabbit_hide rabbit_foot bone bone_meal gunpowder slime_ball magma_cream blaze_rod blaze_powder ghast_tear ender_pearl ender_eye prismarine_shard prismarine_crystals nautilus_shell heart_of_the_sea echo_shard breeze_rod heavy_core resin_clump clay_ball brick netherbrick paper book ink_sac glow_ink_sac honeycomb sugar wheat wheat_seeds beetroot_seeds melon_seeds pumpkin_seeds torch soul_torch arrow snowball egg end_crystal experience_bottle`.split(' '));
const FOODS = new Set(`apple golden_apple enchanted_golden_apple bread carrot golden_carrot potato baked_potato poisonous_potato beetroot melon_slice sweet_berries glow_berries chorus_fruit dried_kelp beef cooked_beef porkchop cooked_porkchop chicken cooked_chicken mutton cooked_mutton rabbit cooked_rabbit cod cooked_cod salmon cooked_salmon tropical_fish pufferfish rotten_flesh spider_eye cookie pumpkin_pie mushroom_stew rabbit_stew beetroot_soup honey_bottle`.split(' '));
const BLOCKS = new Set(`stone cobblestone mossy_cobblestone dirt coarse_dirt rooted_dirt grass_block sand red_sand gravel clay glass tinted_glass obsidian crying_obsidian bedrock deepslate cobbled_deepslate tuff calcite granite diorite andesite netherrack end_stone soul_sand soul_soil basalt blackstone glowstone sea_lantern lantern soul_lantern crafting_table furnace blast_furnace smoker chest trapped_chest ender_chest barrel hopper dropper dispenser stone_bricks bricks nether_bricks red_nether_bricks quartz_block smooth_quartz iron_block gold_block copper_block diamond_block emerald_block lapis_block redstone_block coal_block netherite_block raw_iron_block raw_gold_block raw_copper_block amethyst_block bone_block slime honey_block hay_block dried_kelp_block snow snow_layer ice packed_ice blue_ice ladder scaffolding cobweb sponge wet_sponge moss_block moss_carpet mud packed_mud mud_bricks pumpkin carved_pumpkin jack_o_lantern melon cactus bamboo sugar_cane kelp seagrass brown_mushroom red_mushroom dandelion poppy azure_bluet allium blue_orchid lily_of_the_valley sunflower lilac rose_bush peony wither_rose deadbush flower_pot anvil chipped_anvil damaged_anvil enchanting_table bookshelf stonecutter grindstone smithing_table fletching_table cartography_table loom bell composter cauldron lever stone_button stone_pressure_plate tripwire_hook daylight_detector repeater comparator piston sticky_piston observer redstone_lamp tnt target`.split(' '));
const WOOD = /^(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|bamboo|crimson|warped)_(?:log|wood|planks|stairs|slab|fence|fence_gate|door|trapdoor|button|pressure_plate|sapling|leaves|stem|hyphae|block|mosaic|mosaic_stairs|mosaic_slab)$/;
const COLOR = /^(?:white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)_(?:wool|carpet|concrete|concrete_powder|terracotta|glazed_terracotta|stained_glass|stained_glass_pane)$/;
// Tools/armor can carry hidden anvil prior-work, trims, dyes or loaded ammunition.
// Keep them in native inventories until a full-fidelity storage backend is available.
export function supportedType(type) {
  if (!type?.startsWith('minecraft:')) return false;
  const id = type.slice(10);
  return MATERIALS.has(id) || FOODS.has(id) || BLOCKS.has(id) || WOOD.test(id) || COLOR.test(id);
}
const jsonClone = value => JSON.parse(JSON.stringify(value));
const utf8Size = text => { let size = 0; for (const c of text) { const n = c.codePointAt(0); size += n <= 0x7f ? 1 : n <= 0x7ff ? 2 : n <= 0xffff ? 3 : 4; } return size; };
export function capacity(inventory) {
  let result = 0;
  for (let i = 0; i < inventory.size; i++) result = Math.max(result, BACKPACKS[inventory.getItem(i)?.typeId]?.slots ?? 0);
  return result;
}
export function encodeItem(item) {
  if (!item || !supportedType(item.typeId)) throw new Error('This item has unsupported or hidden data. Store ordinary materials, blocks or food. Tools, weapons, containers, armor, books with data, maps, potions, fireworks and custom items stay in your inventory.');
  if (item.lockMode !== 'none') throw new Error('Locked items cannot be stored.');
  const durability = item.getComponent('minecraft:durability');
  return { type: item.typeId, amount: item.amount, name: item.nameTag ?? '', lore: item.getRawLore?.() ?? item.getLore(),
    damage: durability?.damage ?? 0, keepOnDeath: item.keepOnDeath,
    canDestroy: item.getCanDestroy().sort(), canPlaceOn: item.getCanPlaceOn().sort(),
    enchantments: (item.getComponent('minecraft:enchantable')?.getEnchantments() ?? []).map(e => [e.type.id, e.level]).sort((a, b) => a[0].localeCompare(b[0])),
    properties: item.getDynamicPropertyIds().sort().map(id => [id, item.getDynamicProperty(id)]) };
}
export function decodeItem(data, api) {
  if (!data || !supportedType(data.type) || !Number.isInteger(data.amount) || data.amount < 1 || data.amount > 64) throw new Error('Backpack item data is invalid; nothing was removed.');
  const item = api.item(data.type, data.amount);
  if (item.amount !== data.amount || data.amount > item.maxAmount) throw new Error('Backpack stack size is invalid.');
  item.nameTag = data.name || undefined; item.setLore(data.lore);
  item.keepOnDeath = data.keepOnDeath; item.setCanDestroy(data.canDestroy); item.setCanPlaceOn(data.canPlaceOn);
  const durability = item.getComponent('minecraft:durability');
  if (data.damage) { if (!durability || data.damage < 0 || data.damage >= durability.maxDurability) throw new Error('Stored tool durability is invalid.'); durability.damage = data.damage; }
  if (data.enchantments.length) {
    const component = item.getComponent('minecraft:enchantable');
    if (!component) throw new Error('Stored enchantments are unavailable.');
    for (const [id, level] of data.enchantments) {
      const type = api.enchantment(id);
      if (!type || !Number.isInteger(level) || level < 1 || level > type.maxLevel) throw new Error('Stored enchantment is unavailable.');
      component.addEnchantment({ type, level });
    }
  }
  for (const [id, value] of data.properties) item.setDynamicProperty(id, value);
  // Reject lossy API changes or unsupported metadata before taking an item out of either inventory.
  if (JSON.stringify(encodeItem(item)) !== JSON.stringify(data)) throw new Error('This item cannot be restored exactly with the current API.');
  return item;
}
export class Backpacks {
  constructor(api) { this.api = api; this.quarantined = new Set(); }
  key(id) { return 'essx:backpack:' + id; }
  load(id) {
    const raw = this.api.read(this.key(id));
    if (raw === undefined) return { version: 2, revision: 0, slots: Array(54).fill(null) };
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('Backpack save is unreadable; it has been preserved.'); }
    if (![1, 2].includes(data?.version) || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.slots) || data.slots.length !== (data.version === 1 ? 27 : 54)) throw new Error('Backpack save format is invalid; it has been preserved.');
    return data.version === 1 ? { ...data, slots: [...data.slots, ...Array(27).fill(null)] } : data;
  }
  check(player, limit, revision) {
    this.api.access(player);
    if (![9, 18, 27, 36, 45, 54].includes(limit)) throw new Error('Invalid Backpack capacity.');
    if (this.quarantined.has(player.id) || this.api.read(this.key(player.id) + ':recovery') !== undefined) throw new Error('Backpack transfer recovery is required. Ask an administrator to inspect the server log.');
    const inv = this.api.inventory(player), current = this.api.limit ? this.api.limit(player, inv) : capacity(inv);
    if (!current || current < limit) throw new Error('Your backpack changed. Carry the same size or larger and reopen the menu.');
    const data = this.load(player.id);
    if (revision !== undefined && data.revision !== revision) throw new Error('Backpack contents changed. Reopen the menu.');
    return { inv, data };
  }
  commit(player, inv, data, changes, slots) {
    const updated = { version: 2, revision: data.revision + 1, slots };
    const text = JSON.stringify(updated);
    if (utf8Size(text) > 30000) throw new Error('Backpack metadata is full. Choose a simpler item.');
    const before = changes.map(([index]) => [index, inv.getItem(index)?.clone()]);
    const written = [];
    try {
      for (const [index, item] of changes) { written.push(index); inv.setItem(index, item); }
      // One synchronous world property write, without an await or debounced DB flush.
      this.api.write(this.key(player.id), text);
    } catch (error) {
      let rollbackFailed = false;
      for (const [index, item] of before) if (written.includes(index)) {
        try { inv.setItem(index, item); } catch { rollbackFailed = true; }
      }
      if (rollbackFailed) {
        this.quarantined.add(player.id);
        let durable = false;
        try {
          const recovery = JSON.stringify({ revision: data.revision, before: before.map(([index, item]) => [index, item ? encodeItem(item) : null]) });
          if (utf8Size(recovery) <= 30000) { this.api.write(this.key(player.id) + ':recovery', recovery); durable = true; }
        } catch { /* The native copies below remain available if world writes are unavailable. */ }
        this.api.recovery(player.id, { before, data, durable });
      }
      throw new Error(rollbackFailed ? 'Inventory recovery is required; backpack transfers are now locked.' : 'Transfer failed; inventory was restored and the backpack save was preserved.');
    }
    return updated;
  }
  deposit(player, inventorySlot, limit, revision, expected) {
    const { inv, data } = this.check(player, limit, revision);
    if (!Number.isInteger(inventorySlot) || inventorySlot < 0 || inventorySlot >= inv.size) throw new Error('Invalid inventory slot.');
    const item = inv.getItem(inventorySlot), encoded = encodeItem(item);
    if (expected !== undefined && JSON.stringify(encoded) !== expected) throw new Error('That item changed while the menu was open. Choose it again.');
    decodeItem(encoded, this.api); // Prove it can round-trip before removing the source.
    const index = data.slots.slice(0, limit).findIndex(item => item === null);
    if (index < 0) throw new Error('Backpack is full. Withdraw a stack first.');
    const slots = jsonClone(data.slots); slots[index] = encoded;
    return this.commit(player, inv, data, [[inventorySlot, undefined]], slots);
  }
  sort(player, limit, revision) {
    const { inv, data } = this.check(player, limit, revision);
    const groups = new Map();
    for (const entry of data.slots.slice(0, limit)) {
      if (!entry) continue;
      const native = decodeItem(entry, this.api);
      const signature = JSON.stringify({ ...entry, amount: 1 });
      const group = groups.get(signature) ?? { entry, max: native.maxAmount, count: 0 };
      group.count += entry.amount;
      groups.set(signature, group);
    }
    const sorted = [];
    for (const [, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      while (group.count) {
        const amount = Math.min(group.count, group.max);
        const entry = { ...group.entry, amount };
        decodeItem(entry, this.api);
        sorted.push(entry); group.count -= amount;
      }
    }
    if (sorted.length > limit) throw new Error('Backpack contents cannot be sorted safely.');
    const slots = [...sorted, ...Array(limit - sorted.length).fill(null), ...data.slots.slice(limit)];
    return this.commit(player, inv, data, [], slots);
  }
  clear(player, limit, revision) {
    const { inv, data } = this.check(player, limit, revision);
    const slots = [...Array(limit).fill(null), ...data.slots.slice(limit)];
    return this.commit(player, inv, data, [], slots);
  }
  depositPicked(player, picked, limit) {
    const { inv, data } = this.check(player, limit);
    const encoded = encodeItem(picked); decodeItem(encoded, this.api);
    const dest = data.slots.slice(0, limit).findIndex(x => x === null);
    if (dest < 0) throw new Error('Backpack is full.');
    const signature = JSON.stringify({ ...encoded, amount: 1 });
    let remaining = encoded.amount;
    const changes = [];
    for (let i = 0; i < inv.size && remaining; i++) {
      const item = inv.getItem(i);
      if (!item || !supportedType(item.typeId) || item.lockMode !== 'none') continue;
      let actual;
      try { actual = encodeItem(item); } catch { continue; }
      if (JSON.stringify({ ...actual, amount: 1 }) !== signature) continue;
      const take = Math.min(remaining, item.amount), rest = item.amount - take;
      const replacement = rest ? item.clone() : undefined;
      if (replacement) replacement.amount = rest;
      changes.push([i, replacement]); remaining -= take;
    }
    if (remaining) throw new Error('Picked up item is no longer in inventory.');
    const slots = jsonClone(data.slots); slots[dest] = encoded;
    return this.commit(player, inv, data, changes, slots);
  }
  withdraw(player, index, limit, revision) {
    const { inv, data } = this.check(player, limit, revision);
    if (!Number.isInteger(index) || index < 0 || index >= limit || !data.slots[index]) throw new Error('That backpack slot is unavailable.');
    let destination = -1;
    for (let i = 0; i < inv.size; i++) if (!inv.getItem(i)) { destination = i; break; }
    if (destination < 0) throw new Error('Make one empty inventory slot first.');
    const item = decodeItem(data.slots[index], this.api), slots = jsonClone(data.slots); slots[index] = null;
    return this.commit(player, inv, data, [[destination, item]], slots);
  }
}
