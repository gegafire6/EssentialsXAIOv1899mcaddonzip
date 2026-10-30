// EssentialsX AIO - By Opiar | Server Shop, Sell, Auction House
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { SHOP_THEME_MARKER, buildShopPage } from "../core/shop-layout.js";
import { DB } from "../core/db.js";
import { cfg, mod } from "../core/config.js";
import { cmd, addMember, addAdmin } from "../core/commands.js";
import { MENU_THEME_MARKER, show, msg, ok, err, nameOf, isAdmin, menu, modal, confirm, now, fmtTime, log, cur, heldItem, setHeld, serializeItem, deserializeItem, itemName, countItem, removeItem, giveItem, byId, inv, sound, itemIcon } from "../core/utils.js";
import { charge, addBal, bal } from "./economy.js";
import { authenticateDeveloper } from "../core/developer-auth.js";

// ================= DEFAULT SHOP =================
const I = (t, buy, sell, amount = 1) => ({ t: "minecraft:" + t, buy, sell, amount });
const DEFAULT_SHOP = [
  { name: "Blocks", icon: "textures/blocks/grass_side_carried", items: [I("grass_block", 5, 1, 16), I("dirt", 2, 0, 16), I("cobblestone", 2, 1, 16), I("stone", 4, 1, 16), I("oak_log", 8, 2, 16), I("spruce_log", 8, 2, 16), I("sand", 3, 1, 16), I("glass", 6, 0, 16), I("stone_bricks", 6, 1, 16), I("quartz_block", 40, 8, 16), I("obsidian", 30, 6, 1), I("white_wool", 10, 2, 16)] },
  { name: "Ores", icon: "textures/items/diamond", items: [I("coal", 5, 2), I("iron_ingot", 20, 8), I("gold_ingot", 30, 12), I("redstone", 4, 1), I("lapis_lazuli", 6, 2), I("diamond", 200, 80), I("emerald", 150, 60), I("netherite_ingot", 4000, 1500), I("copper_ingot", 6, 2), I("quartz", 6, 2)] },
  { name: "Food", icon: "textures/items/apple", items: [I("bread", 4, 1), I("cooked_beef", 8, 2), I("cooked_porkchop", 8, 2), I("cooked_chicken", 6, 1), I("apple", 4, 1), I("golden_carrot", 15, 4), I("golden_apple", 150, 40), I("cake", 30, 5)] },
  { name: "Farming", icon: "textures/items/wheat", items: [I("wheat_seeds", 2, 0, 16), I("wheat", 3, 1), I("carrot", 3, 1), I("potato", 3, 1), I("sugar_cane", 4, 1), I("pumpkin", 6, 2), I("melon_slice", 2, 1), I("bone_meal", 3, 1, 16), I("cactus", 4, 1), I("bamboo", 1, 0, 16)] },
  { name: "Mob Drops", icon: "textures/items/rotten_flesh", items: [I("rotten_flesh", 2, 1), I("bone", 4, 2), I("string", 4, 2), I("gunpowder", 10, 4), I("spider_eye", 6, 2), I("ender_pearl", 40, 10), I("blaze_rod", 40, 12), I("slime_ball", 15, 5), I("leather", 8, 3), I("feather", 3, 1)] },
  { name: "Tools & Combat", icon: "textures/items/diamond_sword", items: [I("iron_pickaxe", 80, 0), I("iron_sword", 60, 0), I("iron_axe", 70, 0), I("bow", 50, 0), I("arrow", 2, 0, 16), I("shield", 40, 0), I("diamond_pickaxe", 700, 0), I("diamond_sword", 500, 0), I("fishing_rod", 30, 0), I("totem_of_undying", 2500, 500)] },
  { name: "Redstone", icon: "textures/items/redstone_dust", items: [I("redstone", 4, 1), I("repeater", 15, 0), I("comparator", 25, 0), I("piston", 30, 0), I("sticky_piston", 45, 0), I("observer", 30, 0), I("hopper", 60, 0), I("lever", 4, 0), I("redstone_torch", 4, 0), I("tnt", 80, 0)] },
  { name: "Misc", icon: "textures/items/name_tag", items: [I("name_tag", 100, 0), I("saddle", 150, 0), I("experience_bottle", 30, 0, 8), I("torch", 2, 0, 16), I("bed", 30, 0), I("chest", 15, 0), I("elytra", 15000, 2000), I("shulker_shell", 400, 100)] },
];
function shop() {
  if (!DB.shop.data.categories?.length && !DB.shop.data.init) { DB.shop.data = { categories: JSON.parse(JSON.stringify(DEFAULT_SHOP)), init: true }; }
  return DB.shop.data.categories;
}

export async function shopUI(p) {
  let selected = 0, categoryPage = 0, itemPage = 0;
  while (p.isValid && mod("shop")) {
    const cats = shop();
    const page = buildShopPage(cats, selected, categoryPage, itemPage, {
      name: it => itemName(it.item ?? it),
      currency: cur,
      icon: it => itemIcon(it.item?.t ?? it.t),
    });
    selected = page.category; categoryPage = page.categoryPage; itemPage = page.itemPage;
    const categoryRefs = cats.slice();
    const itemRefs = (cats[page.category]?.items ?? []).slice();
    const form = new ActionFormData().title(SHOP_THEME_MARKER + "Server Shop")
      .body(`§l§f${page.title} §r§8| §a${cur(bal(p.id))} §8| §7Items ${page.itemPage + 1}/${page.itemPages}`);
    for (const button of page.buttons) form.button(button.text, button.icon || undefined);
    const result = await show(p, form);
    if (result.canceled || result.selection === undefined || !p.isValid || !mod("shop")) return;
    const button = page.buttons[result.selection];
    if (!button) return;
    if (button.kind === "close" || button.kind === "back") return;
    if (button.kind === "category") { if (shop()[button.index] !== categoryRefs[button.index]) continue; selected = button.index; itemPage = 0; }
    else if (button.kind === "categories") categoryPage = button.page;
    else if (button.kind === "items") itemPage = button.page;
    else if (button.kind === "item") {
      // Forms can stay open during an admin edit: never resolve a stale slot to another item.
      if (shop()[button.category] !== categoryRefs[button.category] || shop()[button.category]?.items[button.index] !== itemRefs[button.index]) continue;
      await itemUI(p, button.category, button.index);
    } else if (button.kind === "sell") await sellUI(p);
    else if (button.kind === "classic") await classicShopUI(p);
  }
}
async function classicShopUI(p) {
  const cats = shop();
  await menu(p, "§l§6Server Shop", `§7Balance: §a${cur(bal(p.id))}`, [
    ...cats.map((c, ci) => ({ text: `§l${c.name}\n§r§8${c.items.length} items`, icon: c.icon || "textures/ui/essx/icons/shop", run: () => catUI(p, ci) })),
    { text: "§l§aSell Items\n§r§8Sell hand / all", icon: "textures/items/gold_ingot", run: () => sellUI(p) },
  ]);
}
async function catUI(p, ci) {
  const c = shop()[ci];
  await menu(p, "§l" + c.name, `§7Balance: §a${cur(bal(p.id))}`, c.items.map((it, ii) => ({
    text: `§l${itemName(it.item ?? it)} §rx${it.amount}\n§2Buy ${cur(it.buy)}${it.sell ? " §8| §6Sell " + cur(it.sell) : ""}`,
    icon: itemIcon(it.item?.t ?? it.t),
    run: () => itemUI(p, ci, ii),
  })));
}
// The detail view uses the shared menu skin with its own short heading.
async function shopDetailForm(p, title, body, buttons) {
  const form = new ActionFormData().title(MENU_THEME_MARKER + title).body(body);
  for (const button of buttons) form.button(button.text, button.icon || "textures/ui/essx/icons/shop");
  const result = await show(p, form);
  return result.canceled ? undefined : buttons[result.selection];
}
async function itemUI(p, ci, ii) {
  const it = shop()?.[ci]?.items?.[ii];
  if (!it) return;
  // Keep the displayed price and item fixed across every screen in this purchase.
  const snapshot = JSON.stringify(it);
  const current = () => p.isValid && mod("shop") && shop()?.[ci]?.items?.[ii] === it && JSON.stringify(it) === snapshot;
  const type = it.item?.t ?? it.t, name = itemName(it.item ?? it);
  if (!Number.isInteger(it.amount) || it.amount < 1 || it.amount > 64 ||
      !Number.isFinite(it.buy) || it.buy < 0 || !Number.isFinite(it.sell) || it.sell < 0) {
    return err(p, "This shop item needs valid prices and a bundle size of 1 to 64.");
  }
  const icon = itemIcon(type);
  const changed = () => err(p, "Shop item changed. Open it again to see the updated offer.");
  while (current()) {
    const have = countItem(p, type);
    const choice = await shopDetailForm(p, "Item Shop",
      `§l§b${name}§r\n§7Buy: §a${cur(it.buy)} §7/ ${it.amount} items\n§7Sell: ${it.sell ? "§6" + cur(it.sell) + " §7/ item" : "§cNot sellable"}\n\n§bYou own: §f${have} §8| §bBalance: §a${cur(bal(p.id))}`,
      [
        { mode: "buy", text: `§l§aBuy Items\n§r§7${it.amount} items per bundle`, icon },
        ...(it.sell ? [{ mode: "sell", text: `§l§6Sell Items\n§r§7${cur(it.sell)} per item`, icon: "textures/ui/essx/icons/wallet" }] : []),
        { mode: "back", text: "§l§bBack to Shop", icon: "textures/ui/essx/icons/back" },
      ]);
    if (!choice || choice.mode === "back") return;
    if (!current()) return changed();
    const buying = choice.mode === "buy", verb = buying ? "Buy" : "Sell";
    while (current()) {
      const balance = bal(p.id), owned = countItem(p, type);
      const max = buying ? (it.buy === 0 ? 64 : Math.min(64, Math.floor(balance / it.buy))) : Math.min(64, owned);
      if (max < 1) { err(p, buying ? "Not enough money for one bundle." : "You don't have that item."); break; }
      const quantities = (buying ? [1, 4, 16, 64] : [1, 16, 32, 64]).filter(q => q <= max);
      if (!quantities.includes(max)) quantities.push(max);
      const describe = q => `§f${buying ? q * it.amount : q} items §8| §${buying ? "a" : "6"}${cur(q * (buying ? it.buy : it.sell))}`;
      const selected = await shopDetailForm(p, verb + " Quantity",
        `§l§b${name}§r\n§7${buying ? "1 bundle = " + it.amount + " items" : "Sell quantities count individual items"}\n§bBalance: §a${cur(balance)} §8| §bOwned: §f${owned}\n§7Choose a quantity to review the total.`,
        [
          ...quantities.map(q => ({ q, text: `§l§${buying ? "a" : "6"}${verb} ${q}${buying ? (q === 1 ? " bundle" : " bundles") : " items"}\n§r${describe(q)}`, icon })),
          { custom: true, text: "§l§bCustom Quantity\n§r§7Enter an exact amount", icon: "textures/ui/essx/icons/edit" },
          { back: true, text: "§l§bBack to Item", icon: "textures/ui/essx/icons/back" },
        ]);
      if (!selected) return;
      if (!current()) return changed();
      if (selected.back) break;
      let q = selected.q;
      if (selected.custom) {
        const result = await modal(p, "§l" + verb + " " + name, [
          { type: "label", label: `§7${buying ? "1 bundle = " + it.amount + " items" : "Quantity counts individual items"}\n§7Allowed: §f1–${max}\n§7The next screen shows your exact total.` },
          { type: "text", key: "q", label: buying ? "Number of bundles" : "Number of items", placeholder: "1–" + max, default: "1" },
        ], "Review Total");
        if (!current()) return changed();
        if (!result) continue;
        const text = String(result.q ?? "").trim();
        q = /^\d+$/.test(text) ? Number(text) : NaN;
      }
      if (!Number.isInteger(q) || q < 1 || q > max) { err(p, `Enter a whole number from 1 to ${max}.`); continue; }
      const count = buying ? q * it.amount : q, total = q * (buying ? it.buy : it.sell);
      if (!Number.isFinite(total)) return err(p, "This shop price is too large.");
      const reviewBalance = bal(p.id);
      if (buying && reviewBalance < total) { err(p, "Your balance changed. Choose a smaller quantity."); continue; }
      const review = await shopDetailForm(p, "Review " + verb,
        `§l§b${name}§r\n§7Quantity: §f${count} items${buying ? " §7(" + q + " bundles)" : ""}\n§7${buying ? "Total cost" : "You receive"}: §${buying ? "a" : "6"}${cur(total)}\n\n§bBalance: §a${cur(reviewBalance)}\n§bAfter ${buying ? "purchase" : "sale"}: §a${cur(reviewBalance + (buying ? -total : total))}\n§7${buying ? "Items that do not fit drop at your feet." : "Only the selected quantity will be sold."}`,
        [
          { confirm: true, text: `§l§${buying ? "a" : "6"}Confirm ${verb}\n§r${count} items §8| §f${cur(total)}`, icon: "textures/ui/essx/icons/check" },
          { text: "§l§bChange Quantity", icon: "textures/ui/essx/icons/back" },
        ]);
      if (!review) return;
      if (!current()) return changed();
      if (!review.confirm) continue;
      if (buying) {
        // Validate all item stacks before taking payment, preserving custom item data.
        const stacks = [];
        try {
          for (let i = 0; i < q; i++) {
            const stack = it.item ? deserializeItem({ ...it.item, a: it.amount }) : new ItemStack(type, it.amount);
            if (!stack) throw new Error("Invalid shop item");
            stacks.push(stack);
          }
        } catch { return err(p, "This item is unavailable. Ask an admin to check the shop entry."); }
        if (!charge(p, total, "this purchase")) break;
        for (const stack of stacks) giveItem(p, stack);
        ok(p, `Bought ${count}x ${name} for ${cur(total)}`);
        log("shop", `${p.name} bought ${count} ${type} for ${total}`);
      } else {
        if (countItem(p, type) < count) { err(p, "Your inventory changed. Choose a new quantity."); continue; }
        if (!removeItem(p, type, count)) return err(p, "Unable to remove the selected items.");
        addBal(p.id, total);
        ok(p, `Sold ${count}x ${name} for ${cur(total)}`);
        log("shop", `${p.name} sold ${count} ${type} for ${total}`);
      }
      break;
    }
  }
}

function sellPrice(type) {
  let best = 0;
  for (const c of shop()) for (const it of c.items) if ((it.item?.t ?? it.t) === type && it.sell > best) best = it.sell;
  return best;
}
function sellHand(p) {
  const it = heldItem(p);
  if (!it) return err(p, "Hold an item to sell.");
  const pr = sellPrice(it.typeId);
  if (!pr) return err(p, "This item can't be sold to the shop.");
  const total = pr * it.amount;
  setHeld(p, undefined);
  addBal(p.id, total);
  ok(p, `Sold ${it.amount}x ${itemName({ t: it.typeId })} for ${cur(total)}`);
}
function sellAll(p) {
  const c = inv(p);
  let total = 0, n = 0;
  for (let i = 9; i < c.size; i++) {
    const it = c.getItem(i);
    if (!it || it.nameTag) continue;
    const pr = sellPrice(it.typeId);
    if (!pr) continue;
    total += pr * it.amount; n += it.amount; c.setItem(i, undefined);
  }
  if (!n) return err(p, "Nothing sellable in your inventory (hotbar is skipped).");
  addBal(p.id, total);
  ok(p, `Sold ${n} items for ${cur(total)}`);
}
async function sellUI(p) {
  await menu(p, "§lSell", "§7Sell All skips your hotbar and named items.", [
    { text: "§l§aSell Item In Hand", icon: "textures/ui/essx/icons/shop", run: () => sellHand(p) },
    { text: "§l§6Sell All Inventory", icon: "textures/ui/essx/icons/shop", run: async () => { if (await confirm(p, "Sell All", "Sell all sellable items (except hotbar)?")) sellAll(p); } },
  ]);
}

async function shopAdmin(p) {
  if (!await authenticateDeveloper(p)) return;
  const cats = shop();
  await menu(p, "§lEdit Shop", "", [
    { text: "§l§aAdd Category", icon: "textures/ui/essx/icons/add", run: async () => { const r = await modal(p, "§lNew Category", [{ type: "text", key: "n", label: "Name" }, { type: "text", key: "i", label: "Icon path", default: "textures/items/diamond" }]); if (r?.n) { cats.push({ name: r.n, icon: r.i, items: [] }); DB.shop.save(); ok(p, "Added."); } } },
    { text: "§l§6Reset To Default Shop", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Reset", "Reset shop to defaults?")) { DB.shop.data = { categories: JSON.parse(JSON.stringify(DEFAULT_SHOP)), init: true }; ok(p, "Reset."); } } },
    ...cats.map((c, ci) => ({ text: "§l" + c.name, icon: c.icon || "textures/ui/essx/icons/shop", run: () => menu(p, "§l" + c.name, "", [
      { text: "§l§aAdd Item In Hand\n§r§8Keeps name/enchants", icon: "textures/ui/essx/icons/add", run: () => addHandItem(p, ci) },
      { text: "§l§aAdd Item By ID", icon: "textures/ui/essx/icons/add", run: () => addIdItem(p, ci) },
      { text: "§l§eRename Category", icon: "textures/ui/essx/icons/edit", run: async () => { const r = await modal(p, "Rename", [{ type: "text", key: "n", label: "Name", default: c.name }, { type: "text", key: "i", label: "Icon", default: c.icon }]); if (r) { c.name = r.n || c.name; c.icon = r.i; DB.shop.save(); } } },
      { text: "§l§cDelete Category", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Delete", "Delete " + c.name + "?")) { cats.splice(ci, 1); DB.shop.save(); } } },
      ...c.items.map((it, ii) => ({ icon: itemIcon(it.item?.t ?? it.t), text: `§l${itemName(it.item ?? it)}\n§r§8B ${it.buy} | S ${it.sell} | x${it.amount}`, run: () => editItem(p, ci, ii) })),
    ]) })),
  ]);
}
async function priceForm(p, title, d = {}) {
  return modal(p, title, [
    { type: "text", key: "buy", label: "Buy price (per amount)", default: d.buy ?? 10 },
    { type: "text", key: "sell", label: "Sell price per item (0 = can't sell)", default: d.sell ?? 0 },
    { type: "slider", key: "amt", label: "Amount per purchase", min: 1, max: 64, default: d.amount ?? 1 },
  ]);
}
async function addHandItem(p, ci) {
  const it = heldItem(p); if (!it) return err(p, "Hold an item.");
  const r = await priceForm(p, "§lAdd " + itemName({ t: it.typeId, n: it.nameTag }), { amount: it.amount });
  if (!r) return;
  const s = serializeItem(it);
  shop()[ci].items.push({ t: it.typeId, item: s, buy: +r.buy || 0, sell: +r.sell || 0, amount: r.amt });
  DB.shop.save(); ok(p, "Item added.");
}
async function addIdItem(p, ci) {
  const r = await modal(p, "§lAdd Item", [{ type: "text", key: "id", label: "Item ID", placeholder: "minecraft:diamond" }, { type: "text", key: "buy", label: "Buy price", default: 10 }, { type: "text", key: "sell", label: "Sell price", default: 0 }, { type: "slider", key: "amt", label: "Amount", min: 1, max: 64, default: 1 }]);
  if (!r?.id) return;
  const id = String(r.id).includes(":") ? r.id : "minecraft:" + r.id;
  try { new ItemStack(id, 1); } catch { return err(p, "Invalid item ID."); }
  shop()[ci].items.push({ t: id, buy: +r.buy || 0, sell: +r.sell || 0, amount: r.amt });
  DB.shop.save(); ok(p, "Item added.");
}
async function editItem(p, ci, ii) {
  const it = shop()[ci].items[ii];
  await menu(p, "§l" + itemName(it.item ?? it), "", [
    { text: "§l§eEdit Prices", icon: "textures/ui/essx/icons/edit", run: async () => { const r = await priceForm(p, "Edit", it); if (r) { it.buy = +r.buy || 0; it.sell = +r.sell || 0; it.amount = r.amt; DB.shop.save(); ok(p, "Saved."); } } },
    { text: "§l§cRemove Item", icon: "textures/ui/essx/icons/delete", run: () => { shop()[ci].items.splice(ii, 1); DB.shop.save(); ok(p, "Removed."); } },
  ]);
}

cmd({ name: "shop", aliases: ["store", "market"], module: "shop", desc: "Open server shop", run: shopUI });
cmd({ name: "sell", module: "shop", desc: "Sell items", usage: "[hand|all]", run: (p, a) => (a[0] === "all" ? sellAll(p) : a[0] === "hand" ? sellHand(p) : sellUI(p)) });
cmd({ name: "worth", module: "shop", desc: "Sell value of held item", run: (p) => { const it = heldItem(p); if (!it) return err(p, "Hold an item."); const pr = sellPrice(it.typeId); msg(p, pr ? `§fWorth: §a${cur(pr)} §7each, §a${cur(pr * it.amount)} §7stack` : "§cNot sellable."); } });
addMember({ text: "§l§6Shop\n§r§8Buy & sell items", icon: "textures/ui/essx/icons/shop", module: "shop", run: shopUI });
addAdmin({ text: "§l§6Shop Editor\n§r§8Categories, prices", icon: "textures/ui/essx/icons/shop", module: "shop", run: shopAdmin });

// ================= AUCTION HOUSE =================
function ah() { return DB.auction.data; }
function expire() {
  const d = ah();
  const dur = cfg().auction.durationHours * 3600000;
  const keep = [];
  for (const l of d.list) {
    if (now() - l.at > dur) { (d.claims[l.seller] ??= []).push(l.item); }
    else keep.push(l);
  }
  if (keep.length !== d.list.length) { d.list = keep; DB.auction.save(); }
}
system.runInterval(expire, 1200);

async function sellOnAh(p) {
  const it = heldItem(p);
  if (!it) return err(p, "Hold the item you want to auction.");
  const mine = ah().list.filter((l) => l.seller === p.id).length;
  if (mine >= cfg().auction.maxListings && !isAdmin(p)) return err(p, `Max ${cfg().auction.maxListings} listings.`);
  const r = await modal(p, "§lList on Auction", [
    { type: "label", label: `§fItem: §e${itemName({ t: it.typeId, n: it.nameTag })} x${it.amount}\n§7Tax on sale: ${cfg().auction.taxPercent}%` },
    { type: "text", key: "price", label: "Price", placeholder: "100" },
  ]);
  if (!r) return;
  const price = Math.floor(+r.price || 0);
  if (price < 1) return err(p, "Invalid price.");
  const cur2 = heldItem(p);
  if (!cur2 || cur2.typeId !== it.typeId || cur2.amount !== it.amount) return err(p, "Item changed, try again.");
  ah().list.push({ id: now().toString(36) + Math.floor(Math.random() * 999), seller: p.id, item: serializeItem(cur2), price, at: now() });
  setHeld(p, undefined);
  DB.auction.save();
  ok(p, `Listed for ${cur(price)}.`);
  world.sendMessage(`§8[§6AH§8] §e${p.name}§f listed §b${itemName(serializeItem(cur2))} x${cur2.amount}§f for §a${cur(price)}`);
  log("auction", `${p.name} listed ${cur2.typeId} x${cur2.amount} for ${price}`);
}
async function browse(p, page = 0, mineOnly = false) {
  expire();
  const all = ah().list.filter((l) => !mineOnly || l.seller === p.id).sort((a, b) => b.at - a.at);
  const per = 10, pages = Math.max(1, Math.ceil(all.length / per));
  const slice = all.slice(page * per, page * per + per);
  const dur = cfg().auction.durationHours * 3600000;
  const btns = slice.map((l) => ({
    text: `§l${itemName(l.item)} §rx${l.item.a}\n§a${cur(l.price)} §8| ${nameOf(l.seller)} | ${fmtTime(dur - (now() - l.at))}`,
    icon: itemIcon(l.item.t),
    run: () => listingUI(p, l.id),
  }));
  if (page > 0) btns.push({ text: "§l« Previous", icon: "textures/ui/essx/icons/back", run: () => browse(p, page - 1, mineOnly) });
  if (page < pages - 1) btns.push({ text: "§lNext »", icon: "textures/ui/essx/icons/next", run: () => browse(p, page + 1, mineOnly) });
  await menu(p, `§l${mineOnly ? "My Listings" : "Auction House"} §r§8(${page + 1}/${pages})`, all.length ? `§7Balance: §a${cur(bal(p.id))}` : "§7No listings.", btns);
}
async function listingUI(p, id) {
  const d = ah();
  const l = d.list.find((x) => x.id === id);
  if (!l) return err(p, "Listing no longer available.");
  const ench = l.item.e?.map(([e, lv]) => e.replace("minecraft:", "") + " " + lv).join(", ");
  const body = `§fItem: §e${itemName(l.item)} x${l.item.a}\n§fPrice: §a${cur(l.price)}\n§fSeller: §e${nameOf(l.seller)}${ench ? "\n§fEnchants: §d" + ench : ""}${l.item.l ? "\n§fLore: §7" + l.item.l.join(" ") : ""}`;
  if (l.seller === p.id || isAdmin(p)) {
    if (l.seller !== p.id && !await authenticateDeveloper(p)) return;
    return menu(p, "§lListing", body, [{ text: "§l§cCancel Listing\n§r§8Return item", icon: "textures/ui/essx/icons/shop", run: () => {
      const i = d.list.findIndex((x) => x.id === id); if (i < 0) return;
      d.list.splice(i, 1); (d.claims[l.seller] ??= []).push(l.item); DB.auction.save();
      ok(p, "Cancelled. Item sent to collection box.");
    } }]);
  }
  if (!(await confirm(p, "§lBuy Item", body, "§aBuy for " + cur(l.price)))) return;
  const i = d.list.findIndex((x) => x.id === id);
  if (i < 0) return err(p, "Already sold.");
  if (!charge(p, l.price, "this item")) return;
  d.list.splice(i, 1); DB.auction.save();
  const it = deserializeItem(l.item); if (it) giveItem(p, it);
  const tax = Math.floor((l.price * cfg().auction.taxPercent) / 100);
  addBal(l.seller, l.price - tax);
  ok(p, `Bought ${itemName(l.item)} for ${cur(l.price)}`);
  const s = byId(l.seller); if (s) { ok(s, `${p.name} bought your ${itemName(l.item)} for ${cur(l.price)} §7(tax ${cur(tax)})`); sound(s, "random.levelup"); }
  log("auction", `${p.name} bought ${l.item.t} from ${nameOf(l.seller)} for ${l.price}`);
}
function collect(p) {
  const d = ah();
  const c = d.claims[p.id] ?? [];
  if (!c.length) return err(p, "Collection box is empty.");
  for (const o of c) { const it = deserializeItem(o); if (it) giveItem(p, it); }
  ok(p, `Collected ${c.length} item stack(s).`);
  d.claims[p.id] = []; DB.auction.save();
}
async function ahUI(p) {
  const claims = ah().claims[p.id]?.length ?? 0;
  await menu(p, "§l§6Auction House", `§7Listings: §e${ah().list.length}\n§7Balance: §a${cur(bal(p.id))}`, [
    { text: "§l§bBrowse Listings", icon: "textures/items/book_enchanted", run: () => browse(p) },
    { text: "§l§aSell Item In Hand", icon: "textures/items/gold_ingot", run: () => sellOnAh(p) },
    { text: "§l§eMy Listings", icon: "textures/items/paper", run: () => browse(p, 0, true) },
    { text: `§l§dCollection Box\n§r§8${claims} item(s)`, icon: "textures/blocks/chest_front", run: () => collect(p) },
  ]);
}
cmd({ name: "ah", aliases: ["auction", "auctionhouse"], module: "auction", desc: "Auction house", usage: "[sell <price>|collect]",
  run: async (p, a) => {
    if (a[0] === "sell" && a[1]) {
      const it = heldItem(p); if (!it) return err(p, "Hold an item.");
      const price = Math.floor(+a[1]); if (!price || price < 1) return err(p, "Invalid price.");
      if (ah().list.filter((l) => l.seller === p.id).length >= cfg().auction.maxListings && !isAdmin(p)) return err(p, "Max listings reached.");
      ah().list.push({ id: now().toString(36) + Math.floor(Math.random() * 999), seller: p.id, item: serializeItem(it), price, at: now() });
      setHeld(p, undefined); DB.auction.save(); return ok(p, "Listed for " + cur(price));
    }
    if (a[0] === "collect") return collect(p);
    ahUI(p);
  } });
addMember({ text: "§l§6Auction House\n§r§8Trade with players", icon: "textures/ui/essx/icons/shop", module: "auction", run: ahUI });
