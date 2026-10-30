// Paid item services. Quotes hold no money/items; each successful write is charged.
import { EnchantmentTypes, EquipmentSlot } from '@minecraft/server';
import { cfg, mod } from '../core/config.js';
import { cmd, addMember } from '../core/commands.js';
import { activity } from '../core/activities.js';
import { registerPlugin } from '../core/plugins.js';
import { menu, modal, confirm, inv, itemName, cur, ok, err, log } from '../core/utils.js';
import { bal, charge, addBal } from './economy.js';
import { isLoggedIn } from './login.js';

const busy = new Set();
const validPrice = n => Number.isSafeInteger(n) && n >= 1 && n <= 100000;
const rate = service => service === 'repair' ? cfg().repair.price : cfg().enchant.pricePerLevel;
function access(p, service) {
  if (!p?.isValid || !isLoggedIn(p) || !mod(service) || !mod('economy')) throw new Error('This item service is unavailable. Log in and enable Economy.');
  if (activity(p.id)) throw new Error('Finish your trade or duel before using item services.');
  if (!validPrice(rate(service))) throw new Error('Ask an admin to set a valid item service price.');
}
async function session(p, service, run) {
  if (busy.has(p.id)) return err(p, 'Finish your current repair or enchant menu first.');
  busy.add(p.id);
  try { access(p, service); await run(); }
  catch (e) { err(p, e.message ?? 'Item service failed. Please try again.'); }
  finally { busy.delete(p.id); }
}
// Compare editable item data across form waits; ItemStack.clone retains full data.
function fingerprint(item) {
  if (!item) return '';
  return JSON.stringify([item.typeId, item.amount, item.nameTag ?? '', item.getLore(), item.getCanDestroy().sort(), item.getCanPlaceOn().sort(), item.lockMode, item.keepOnDeath,
    item.getComponent('minecraft:durability')?.damage ?? 0,
    item.getComponent('minecraft:enchantable')?.getEnchantments().map(e => [e.type.id, e.level]).sort() ?? [],
    item.getDynamicPropertyIds().sort().map(id => [id, item.getDynamicProperty(id)])]);
}
function inventorySlots(p, all) {
  const container = inv(p);
  const slots = (all ? Array.from({ length: container.size }, (_, i) => i) : [p.selectedSlotIndex])
    .map(slot => ({ get: () => container.getItem(slot), set: item => container.setItem(slot, item) }));
  if (all) {
    const equipment = p.getComponent('minecraft:equippable');
    if (equipment) for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
      slots.push({ get: () => equipment.getEquipment(slot), set: item => {
        if (!equipment.setEquipment(slot, item)) throw new Error('Equipment could not be updated.');
      } });
    }
  }
  return slots;
}
function checkQuote(p, service, plan, price, selectedSlot) {
  access(p, service);
  if (rate(service) !== price) throw new Error('The price changed. Open the menu again.');
  if (selectedSlot !== undefined && p.selectedSlotIndex !== selectedSlot) throw new Error('Your held item changed. Open the menu again.');
  if (plan.some(entry => fingerprint(entry.slot.get()) !== entry.before)) throw new Error('An item changed. Open the menu again for a new quote.');
}
function purchase(p, service, plan, price, selectedSlot) {
  checkQuote(p, service, plan, price, selectedSlot);
  const total = plan.reduce((sum, entry) => sum + entry.cost, 0);
  if (!Number.isSafeInteger(total) || total < 1) throw new Error('Invalid item service price.');
  if (bal(p.id) < total) throw new Error(`You need ${cur(total)}. Balance: ${cur(bal(p.id))}`);
  let completed = 0, spent = 0;
  // No awaits here: no other script action can change the quote during these writes.
  for (const entry of plan) {
    if (!charge(p, entry.cost, service)) break;
    try { entry.slot.set(entry.item); }
    catch { addBal(p.id, entry.cost); continue; }
    completed++; spent += entry.cost;
  }
  if (!completed) return err(p, 'The items could not be updated. No money was taken.');
  ok(p, `${service === 'repair' ? 'Repaired' : 'Enchanted'} ${completed} item${completed === 1 ? '' : 's'} for ${cur(spent)}.${completed < plan.length ? ' Unchanged items were not charged.' : ''}`);
  log('eco', `${p.name} paid ${spent} for ${service} (${completed} items)`);
}
async function repair(p, all) {
  access(p, 'repair');
  const price = rate('repair'), selected = all ? undefined : p.selectedSlotIndex;
  const plan = [];
  for (const slot of inventorySlots(p, all)) {
    const original = slot.get(), durability = original?.getComponent('minecraft:durability');
    if (!durability || durability.damage <= 0) continue;
    const item = original.clone(); item.getComponent('minecraft:durability').damage = 0;
    plan.push({ slot, item, before: fingerprint(original), cost: price });
  }
  if (!plan.length) return err(p, all ? 'No damaged items in your inventory or equipment.' : 'Hold a damaged tool, weapon or armor item.');
  const total = plan.length * price;
  if (!await confirm(p, 'Repair Tools', `Repair ${plan.length} damaged item${plan.length === 1 ? '' : 's'}?\nPrice: ${cur(price)} each\nTotal: ${cur(total)}\nBalance: ${cur(bal(p.id))}\nOnly successful repairs are charged.`)) return;
  purchase(p, 'repair', plan, price, selected);
}
export async function repairToolsUI(p) {
  // The choice menu owns no pending quote; each repair action creates its own session.
  try { access(p, 'repair'); } catch (e) { return err(p, e.message); }
  return menu(p, 'Repair Tools', `Repair damaged items for ${cur(rate('repair'))} each.\nBalance: ${cur(bal(p.id))}`, [
    { text: '§lRepair Held Item', icon: 'textures/items/iron_pickaxe', run: () => session(p, 'repair', () => repair(p, false)) },
    { text: '§lRepair Entire Inventory\n§r§7Includes equipped armor and offhand', icon: 'textures/blocks/chest_front', run: () => session(p, 'repair', () => repair(p, true)) },
  ]);
}
const enchantName = type => type.id.replace(/^minecraft:/, '').split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
export async function enchantItemUI(p) {
  return session(p, 'enchant', async () => {
    const selected = p.selectedSlotIndex, slot = inventorySlots(p, false)[0], original = slot.get();
    if (!original?.getComponent('minecraft:enchantable')) return err(p, 'Hold an enchantable item first.');
    const before = fingerprint(original), price = rate('enchant');
    const types = EnchantmentTypes.getAll().sort((a, b) => enchantName(a).localeCompare(enchantName(b)));
    if (!types.length) return err(p, 'No enchantments are available.');
    const r = await modal(p, 'Enchant Item in Hand', [
      { type: 'label', label: `${itemName(original)}\nPrice: ${cur(price)} × chosen level\nChoose an enchantment supported by this item.` },
      { type: 'dropdown', key: 'type', label: 'Enchantment (maximum level shown)', options: types.map(type => `${enchantName(type)} (max ${type.maxLevel})`) },
      { type: 'text', key: 'level', label: 'Level (whole number, 1 to enchantment maximum)', default: '1' },
    ], 'Review Price');
    if (!r) return;
    const type = Number.isInteger(r.type) ? types[r.type] : undefined;
    const level = Number(String(r.level ?? '').trim());
    if (!type || !/^\d+$/.test(String(r.level ?? '').trim()) || !Number.isSafeInteger(level) || level < 1 || level > type.maxLevel) return err(p, 'Choose a valid enchantment and a level within its maximum.');
    const item = original.clone(), ench = item.getComponent('minecraft:enchantable');
    const current = ench.getEnchantment(type.id);
    if (current && current.level >= level) return err(p, 'This item already has that enchantment at the same or a higher level.');
    if (current) ench.removeEnchantment(type.id);
    const enchantment = { type, level };
    if (!ench.canAddEnchantment(enchantment)) return err(p, 'That enchantment is incompatible with this item or its current enchantments.');
    ench.addEnchantment(enchantment);
    const cost = price * level, plan = [{ slot, item, before, cost }];
    checkQuote(p, 'enchant', plan, price, selected);
    if (!await confirm(p, 'Enchant Item in Hand', `${itemName(original)}\n${enchantName(type)} ${level}\nTotal: ${cur(cost)}\nBalance: ${cur(bal(p.id))}`)) return;
    purchase(p, 'enchant', plan, price, selected);
  });
}

cmd({ name: 'repairtools', module: 'repair', desc: 'Pay to repair held item or inventory', run: repairToolsUI });
cmd({ name: 'enchantitem', module: 'enchant', desc: 'Pay to enchant the item in your hand', run: enchantItemUI });
addMember({ text: '§l§bRepair Tools\n§r§7Repair held item or inventory', icon: 'textures/items/iron_pickaxe', module: 'repair', run: repairToolsUI });
addMember({ text: '§l§dEnchant Item\n§r§7Choose enchantment and level', icon: 'textures/items/book_enchanted', module: 'enchant', run: enchantItemUI });
for (const [id, name, key, label] of [['repair', 'Repair Tools', 'price', 'Price per damaged item'], ['enchant', 'Enchant Item', 'pricePerLevel', 'Price per enchantment level']]) {
  registerPlugin({ id, name, module: id, icon: id === 'repair' ? 'textures/items/iron_pickaxe' : 'textures/items/book_enchanted', desc: 'Paid item service. Requires Economy and login.',
    fields: c => [{ type: 'slider', key, label, min: 1, max: 100000, step: 1, default: c[id][key] }],
    apply: (c, r) => { if (validPrice(r[key])) c[id][key] = r[key]; },
  });
}
