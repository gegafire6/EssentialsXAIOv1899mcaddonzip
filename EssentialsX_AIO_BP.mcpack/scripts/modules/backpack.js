// EssentialsX AIO | Craftable, personal Backpacks. By Opiar.
import { world, system, ItemStack, EnchantmentTypes, GameMode } from '@minecraft/server';
import { DB } from '../core/db.js';
import { charge, addBal } from './economy.js';
import { cfg, mod } from '../core/config.js';
import { registerPlugin } from '../core/plugins.js';
import { cmd, addMember } from '../core/commands.js';
import { reserve, release, activity } from '../core/activities.js';
import { menu, confirm, inv, itemName, itemIcon, ok, err, msg } from '../core/utils.js';
import { isLoggedIn } from './login.js';
import { inCombat } from './protection.js';
import { BACKPACKS, Backpacks, capacity, encodeItem, supportedType } from '../core/backpack.js';

const sessions = new Map(), recoveryCopies = new Map();
const backpackPrefs = p => DB.pdata.get(p.id, {}).backpack ?? {};
function setBackpackPrefs(p, changes) { const data = DB.pdata.get(p.id, {}); DB.pdata.set(p.id, { ...data, backpack: { ...data.backpack, ...changes } }); }
function effectiveCapacity(p, inventory = inv(p)) { const base = capacity(inventory); return base ? Math.min(54, base + Math.max(0, Math.min(5, Math.floor(backpackPrefs(p).extraRows || 0))) * 9) : 0; }
let sequence = 0;
function access(p, expectedToken) {
  if (!p?.isValid || !mod('backpack') || !isLoggedIn(p)) throw new Error('Backpack is unavailable. Log in and enable the plugin.');
  if (![GameMode.Survival, GameMode.Adventure].includes(p.getGameMode()) || p.getComponent('minecraft:health')?.currentValue <= 0) throw new Error('Use Backpack while alive in Survival or Adventure.');
  if (cfg().backpack.blockInCombat && mod('combat') && inCombat(p)) throw new Error('Wait until combat ends before opening your Backpack.');
  const token = sessions.get(p.id);
  if (!token || expectedToken !== undefined && token !== expectedToken || activity(p.id)?.token !== token) throw new Error('Backpack session expired. Reopen it.');
}
const storage = new Backpacks({
  read: key => world.getDynamicProperty(key), write: (key, value) => world.setDynamicProperty(key, value),
  inventory: inv, access, limit: effectiveCapacity, item: (id, amount) => new ItemStack(id, amount), enchantment: id => EnchantmentTypes.get(id),
  recovery: (id, data) => { recoveryCopies.set(id, data); console.warn(`[EssX Backpack] Inventory rollback failed for player ${id}; recovery copies retained for this script session. Durable recovery marker: ${data.durable}. Do not reload before recovering.`); },
});
async function session(p, run) {
  if (sessions.has(p.id)) return err(p, 'Finish your current Backpack menu first.');
  const token = 'backpack:' + ++sequence;
  if (!reserve([p.id], 'backpack', token)) return err(p, 'Finish your trade, duel or other activity first.');
  sessions.set(p.id, token);
  try { access(p, token); await run(token); }
  catch (error) { err(p, error.message ?? 'Backpack could not be opened.'); }
  finally { if (sessions.get(p.id) === token) sessions.delete(p.id); release([p.id], token); }
}
const limitFor = p => {
  const limit = effectiveCapacity(p);
  if (!limit) throw new Error('Carry a Leather, Iron or Diamond Backpack first. Use !backpack help for recipes.');
  return limit;
};
const guide = p => msg(p, 'Backpack recipes (crafting table):\nLeather: 8 leather around a chest → 9 slots.\nIron: 8 iron ingots around a Leather Backpack → 18 slots.\nDiamond: diamonds on the four sides, iron ingots in the corners, Iron Backpack in the center → 27 slots.\nUse the item or !backpack to open. !backpack deposit stores your held stack; !backpack take <1–27> withdraws a stored stack.\nStorage is personal: giving the bag away does not give away its contents. Larger rows stay saved when using a smaller bag. Purchased rows add to the carried bag up to 54 slots. Tools/weapons/containers/armor/maps/books with data/potions/fireworks and other unsupported items are refused.');
async function chooseDeposit(p, limit, data, token) {
  access(p, token);
  const inventory = inv(p), buttons = [];
  for (let i = 0; i < inventory.size; i++) {
    const item = inventory.getItem(i);
    if (!item || !supportedType(item.typeId) || item.lockMode !== 'none') continue;
    const encoded = encodeItem(item);
    buttons.push({ text: `§f${itemName(item)} ×${item.amount}\n§7Inventory slot ${i + 1}`, icon: itemIcon(item.typeId), slot: i, expected: JSON.stringify(encoded) });
  }
  if (!buttons.length) return err(p, 'No supported items to store. Backpack items and items with hidden data stay in your inventory.');
  const choice = await menu(p, 'Store a stack', 'Each stack uses one Backpack slot. Special item data is checked before moving.', buttons);
  if (!choice || choice.slot === undefined) return;
  access(p, token);
  storage.deposit(p, choice.slot, limit, data.revision, choice.expected);
  ok(p, 'Stack stored in your Backpack.');
}
async function chooseWithdraw(p, limit, data, token) {
  const buttons = data.slots.slice(0, limit).flatMap((item, slot) => item ? [{
    text: `§f${item.name || itemName({ t: item.type })} ×${item.amount}\n§7Backpack slot ${slot + 1}`,
    icon: itemIcon(item.type), slot,
  }] : []);
  if (!buttons.length) return err(p, 'These Backpack slots are empty.');
  const choice = await menu(p, 'Take a stack', 'One empty player inventory slot is required.', buttons);
  if (!choice || choice.slot === undefined) return;
  access(p, token);
  storage.withdraw(p, choice.slot, limit, data.revision); ok(p, 'Stack returned to your inventory.');
}
function bagSlot(p) {
  const inventory = inv(p); let index = -1, best = 0;
  for (let i = 0; i < inventory.size; i++) { const slots = BACKPACKS[inventory.getItem(i)?.typeId]?.slots ?? 0; if (slots > best) { best = slots; index = i; } }
  return index;
}
function updateBagFlag(p, token, slot, type, enabled) {
  access(p, token);
  const inventory = inv(p), old = inventory.getItem(slot);
  if (!old || !BACKPACKS[old.typeId]) throw new Error('Backpack changed. Reopen the menu.');
  const item = old.clone(), marker = 'essx:managed_backpack_lock';
  if (type === 'lock') {
    if (enabled && item.lockMode !== 'none' && !item.getDynamicProperty(marker)) throw new Error('This bag is locked by another feature.');
    if (enabled) { item.lockMode = 'inventory'; item.setDynamicProperty(marker, true); }
    else if (item.getDynamicProperty(marker)) { item.lockMode = 'none'; item.setDynamicProperty(marker, undefined); }
    else if (item.lockMode !== 'none') throw new Error('This bag is locked by another feature.');
  } else item.keepOnDeath = enabled;
  inventory.setItem(slot, item);
  ok(p, type === 'lock' ? `Backpack lock ${enabled ? 'on' : 'off'}.` : `Keep backpack on death ${enabled ? 'on' : 'off'}.`);
}
async function buyBag(p, token) {
  const price = cfg().backpack.buyPrice;
  if (!mod('economy')) throw new Error('Economy is disabled.');
  if (!await confirm(p, 'Buy Backpack', `Buy a Leather Backpack for ${cfg().currency}${price}?`)) return;
  access(p, token);
  if (!mod('economy') || price !== cfg().backpack.buyPrice) throw new Error('Price or economy changed; try again.');
  const inventory = inv(p);
  if (capacity(inventory)) throw new Error('You already carry a backpack.');
  let slot = -1; for (let i = 0; i < inventory.size; i++) if (!inventory.getItem(i)) { slot = i; break; }
  if (slot < 0) throw new Error('Make one empty inventory slot first.');
  const bag = new ItemStack('essx:backpack', 1);
  if (price && !charge(p, price, 'a backpack')) return;
  try { inventory.setItem(slot, bag); } catch (e) { if (price) addBal(p.id, price); throw new Error('Could not give the backpack; payment refunded.'); }
  ok(p, 'Leather Backpack purchased.');
}
async function buyRow(p, token, limit) {
  const price = cfg().backpack.rowPrice;
  if (!mod('economy') || limit >= 54) throw new Error('Economy is disabled or the backpack is at maximum capacity.');
  if (!await confirm(p, 'Upgrade Backpack', `Add 9 slots for ${cfg().currency}${price}? Maximum 54 slots.`)) return;
  access(p, token);
  if (!mod('economy') || cfg().backpack.rowPrice !== price || limitFor(p) !== limit || limit >= 54) throw new Error('Backpack or price changed; try again.');
  const rows = Math.max(0, Math.min(5, Math.floor(backpackPrefs(p).extraRows || 0)));
  if (rows >= 5) throw new Error('Maximum upgrades reached.');
  if (price && !charge(p, price, 'a backpack row')) return;
  try { setBackpackPrefs(p, { extraRows: rows + 1 }); } catch (e) { if (price) addBal(p.id, price); throw new Error('Upgrade failed; payment refunded.'); }
  ok(p, `Backpack upgraded to ${limitFor(p)} slots.`);
}
const BACKPACK_SKINS = [
  { id: 'essx:backpack_skin_leather', name: 'Leather Look', icon: 'textures/items/essx_backpack' },
  { id: 'essx:backpack_skin_diamond', name: 'Diamond Look', icon: 'textures/items/essx_diamond_backpack' },
];
const backpackSkin = item => BACKPACK_SKINS.find(s => s.id === item?.typeId);
async function skinMenu(p, token) {
  access(p, token);
  const eq = p.getComponent('minecraft:equippable');
  if (!eq) throw new Error('Equipment is unavailable.');
  const original = eq.getEquipment('Chest')?.typeId;
  const selected = await menu(p, 'Backpack Skins', '§7Visual only. Uses the chest slot; remove armor, Elytra, cape or wings first.', [
    { text: '§cNo backpack skin', skin: 'off' },
    ...BACKPACK_SKINS.map(s => ({ text: `§b${s.name}`, icon: s.icon, skin: s.id })),
  ]);
  if (!selected?.skin) return;
  access(p, token); limitFor(p);
  const current = eq.getEquipment('Chest');
  if (current?.typeId !== original) throw new Error('Chest equipment changed. Reopen the skin menu.');
  if (selected.skin === 'off') {
    if (backpackSkin(current) && !eq.setEquipment('Chest', undefined)) throw new Error('Could not remove the skin.');
    return ok(p, 'Backpack skin turned off.');
  }
  if (p.hasTag('essx:vanish')) throw new Error('Leave vanish before equipping a skin.');
  if (current && !backpackSkin(current)) throw new Error('Remove your chest armor, Elytra, cape or wings first. Your equipment was kept.');
  if (!BACKPACK_SKINS.some(s => s.id === selected.skin)) throw new Error('Unknown backpack skin.');
  if (!eq.setEquipment('Chest', new ItemStack(selected.skin, 1))) throw new Error('Could not equip the backpack skin.');
  ok(p, 'Backpack skin equipped.');
}
system.runInterval(() => {
  for (const p of world.getAllPlayers()) try {
    const eq = p.getComponent('minecraft:equippable');
    if (backpackSkin(eq?.getEquipment('Chest')) && (!mod('backpack') || !capacity(inv(p)) || p.hasTag('essx:vanish'))) eq.setEquipment('Chest', undefined);
  } catch { /* Disconnected or unavailable equipment. */ }
}, 20);
export async function backpackMenu(p) {
  return session(p, async token => {
    while (true) {
      access(p, token);
      const base = capacity(inv(p)), limit = effectiveCapacity(p), prefs = backpackPrefs(p);
      if (!limit) {
        const choice = await menu(p, 'Backpack', '§7Buy or craft a backpack to access your personal storage.', [
          { text: `§aBuy Leather Backpack\n§7${cfg().currency}${cfg().backpack.buyPrice}`, action: 'buy' },
          { text: '§eRecipes & help', action: 'help' },
        ]);
        if (!choice?.action) return;
        access(p, token);
        if (choice.action === 'buy') await buyBag(p, token);
        if (choice.action === 'help') guide(p);
        continue;
      }
      const { data } = storage.check(p, limit), used = data.slots.slice(0, limit).filter(Boolean).length;
      const hidden = data.slots.slice(limit).filter(Boolean).length, bag = Object.values(BACKPACKS).find(b => b.slots === base);
      const slot = bagSlot(p), current = inv(p).getItem(slot), locked = !!current?.getDynamicProperty('essx:managed_backpack_lock');
      const pickupAvailable = !!world.afterEvents.entityItemPickup;
      const choice = await menu(p, bag.name, `§f${used}/${limit} slots used • ${limit / 9} rows\n§7Contents stay saved on death. Bag keep-on-death: ${current.keepOnDeath ? 'ON' : 'OFF'}${hidden ? `\n§e${hidden} stack(s) need a larger Backpack.` : ''}`, [
        { text: '§aStore a stack', icon: 'textures/ui/essx/icons/backpack_store', action: 'deposit' },
        { text: '§bTake a stack', icon: 'textures/ui/essx/icons/backpack_take', action: 'withdraw' },
        { text: `§eAuto-Pickup: ${!pickupAvailable ? 'Unavailable' : prefs.autoPickup ? 'ON' : 'OFF'}\n§7Supported items only`, action: 'pickup' },
        { text: '§bSort and stack', action: 'sort' },
        { text: '§cClear accessible slots', action: 'clear' },
        { text: `§eBackpack Lock: ${locked ? 'ON' : 'OFF'}`, action: 'lock' },
        { text: `§eKeep Backpack on Death: ${current.keepOnDeath ? 'ON' : 'OFF'}`, action: 'death' },
        { text: `§aUpgrade +9 slots\n§7${cfg().currency}${cfg().backpack.rowPrice} · max 54`, action: 'upgrade' },
        { text: '§dBackpack Skins', action: 'skin' },
        { text: '§eRecipes & help', icon: bag.icon, action: 'help' },
      ]);
      if (!choice?.action) return;
      access(p, token);
      if (choice.action === 'deposit') await chooseDeposit(p, limit, data, token);
      if (choice.action === 'withdraw') await chooseWithdraw(p, limit, data, token);
      if (choice.action === 'help') guide(p);
      if (choice.action === 'pickup') { if (!pickupAvailable) throw new Error('Auto-pickup is unavailable in this Bedrock version.'); setBackpackPrefs(p, { autoPickup: !prefs.autoPickup }); }
      if (choice.action === 'sort') { storage.sort(p, limit, data.revision); ok(p, 'Backpack sorted.'); }
      if (choice.action === 'clear' && await confirm(p, 'Clear Backpack', `Permanently delete ALL ${used} stacks in the accessible ${limit} slots? Hidden slots are kept.`, '§cDelete', '§aCancel')) { access(p, token); storage.clear(p, limit, data.revision); ok(p, 'Accessible backpack slots cleared.'); }
      if (choice.action === 'lock' || choice.action === 'death') {
        const fresh = inv(p).getItem(slot);
        if (!fresh || fresh.typeId !== current.typeId || fresh.lockMode !== current.lockMode || fresh.keepOnDeath !== current.keepOnDeath || fresh.getDynamicProperty('essx:managed_backpack_lock') !== current.getDynamicProperty('essx:managed_backpack_lock')) throw new Error('Backpack changed. Reopen the menu.');
        updateBagFlag(p, token, slot, choice.action, choice.action === 'lock' ? !locked : !current.keepOnDeath);
      }
      if (choice.action === 'upgrade') await buyRow(p, token, limit);
      if (choice.action === 'skin') await skinMenu(p, token);
    }
  });
}
// Pickup runs only after native collection. If matching inventory items cannot be
// moved safely, they stay in the normal inventory; no item entity is cancelled.
world.afterEvents.entityItemPickup?.subscribe(ev => {
  const p = ev.entity;
  if (p?.typeId !== 'minecraft:player' || !p.isValid || !backpackPrefs(p).autoPickup || sessions.has(p.id)) return;
  const token = 'backpack:pickup:' + ++sequence;
  if (!reserve([p.id], 'backpack', token)) return;
  sessions.set(p.id, token);
  try {
    access(p, token); const limit = limitFor(p);
    for (const item of ev.items ?? []) try { storage.depositPicked(p, item, limit); } catch { /* Full, unsupported or changed: leave in inventory. */ }
  } catch { /* Not eligible: leave the normal pickup untouched. */ }
  finally { if (sessions.get(p.id) === token) sessions.delete(p.id); release([p.id], token); }
});
cmd({ name: 'backpack', aliases: ['bp', 'bag'], module: 'backpack', desc: 'Open your personal Backpack', usage: '[help | deposit | take <slot>]',
  run: async (p, args) => {
    const operation = (args[0] ?? 'open').toLowerCase();
    if (operation === 'help') return guide(p);
    if (operation === 'open') return backpackMenu(p);
    return session(p, async () => {
      const limit = limitFor(p), { data } = storage.check(p, limit);
      if (operation === 'deposit') { storage.deposit(p, p.selectedSlotIndex, limit, data.revision); return ok(p, 'Held stack stored.'); }
      if (operation === 'take') {
        const slot = Number(args[1]);
        if (!Number.isInteger(slot) || slot < 1 || slot > limit) throw new Error(`Choose a Backpack slot from 1 to ${limit}.`);
        storage.withdraw(p, slot - 1, limit, data.revision); return ok(p, 'Stack returned to your inventory.');
      }
      throw new Error('Use !backpack, !backpack deposit, !backpack take <slot> or !backpack help.');
    });
  },
});
addMember({ text: '§l§6Backpack\n§r§7Personal item storage', icon: BACKPACKS['essx:backpack'].icon, module: 'backpack', category: 'community', run: backpackMenu });
registerPlugin({ id: 'backpack', name: 'Backpack', module: 'backpack', icon: BACKPACKS['essx:backpack'].icon,
  desc: 'Craft Leather (9), Iron (18) and Diamond (27) Backpacks. Personal storage persists through relogs and death. Use the item or !backpack.',
  fields: c => [{ type: 'toggle', key: 'blockInCombat', label: 'Block Backpack access during PvP combat', default: c.backpack.blockInCombat }, { type: 'slider', key: 'buyPrice', label: 'Leather Backpack price', min: 0, max: 100000, step: 100, default: c.backpack.buyPrice }, { type: 'slider', key: 'rowPrice', label: 'Price per 9-slot upgrade', min: 0, max: 100000, step: 100, default: c.backpack.rowPrice }],
  apply: (c, r) => { c.backpack.blockInCombat = !!r.blockInCombat; c.backpack.buyPrice = r.buyPrice; c.backpack.rowPrice = r.rowPrice; },
  actions: [{ text: 'Backpack recipes & help', run: guide }],
});
world.beforeEvents.itemUse.subscribe(ev => {
  if (!BACKPACKS[ev.itemStack?.typeId]) return;
  const canceled = ev.cancel; ev.cancel = true;
  if (canceled || !mod('backpack') || !isLoggedIn(ev.source)) return;
  const p = ev.source;
  system.run(() => { if (p.isValid) void backpackMenu(p); });
});
// Invalidate forms after death/dimension changes, and release locks when a player leaves.
function close(id) { const token = sessions.get(id); if (token) { sessions.delete(id); release([id], token); } }
world.afterEvents.playerLeave.subscribe(ev => close(ev.playerId));
world.afterEvents.playerDimensionChange.subscribe(ev => close(ev.player.id));
world.afterEvents.entityDie.subscribe(ev => { if (ev.deadEntity.typeId === 'minecraft:player') close(ev.deadEntity.id); });
