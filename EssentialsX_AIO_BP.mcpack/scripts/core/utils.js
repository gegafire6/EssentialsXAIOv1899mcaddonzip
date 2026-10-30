import { actionbar } from "./actionbar.js";
// EssentialsX AIO - By Opiar
import { world, system, ItemStack, PlayerPermissionLevel, EquipmentSlot, EnchantmentTypes } from "@minecraft/server";
import { ActionFormData, ModalFormData, FormCancelationReason } from "@minecraft/server-ui";
import { DB } from "./db.js";
export { itemIcon } from "./icons.js";
import { cfg } from "./config.js";

export const TAG = "§8[§bEssX§8]§r ";

export function messagePrefix() {
  const tag = cfg().messageTag;
  return typeof tag === "string" && tag.trim() ? `§8[§b${tag.trim()}§8]§r ` : TAG;
}

export function msg(p, text) {
  try { p.sendMessage(messagePrefix() + text); } catch {}
}
export function ok(p, text) { msg(p, "§a" + text); sound(p, "random.orb"); }
export function err(p, text) { msg(p, "§c" + text); sound(p, "note.bass"); }
export function sound(p, id, pitch = 1) { try { p.playSound(id, { pitch }); } catch {} }
export function broadcast(text) { world.sendMessage(text); }

export function isAdmin(p) {
  try {
    if (p.hasTag("essx:admin") || p.hasTag("admin")) return true;
    return p.playerPermissionLevel === PlayerPermissionLevel.Operator;
  } catch { return false; }
}

export function online() { return world.getAllPlayers(); }
export function findPlayer(name) {
  if (!name) return undefined;
  const n = name.replace(/^@/, "").replace(/"/g, "").toLowerCase();
  const all = online();
  return all.find((p) => p.name.toLowerCase() === n) ?? all.find((p) => p.name.toLowerCase().startsWith(n));
}
export function byId(id) { return online().find((p) => p.id === id); }
export function nameOf(id) { return DB.players.get(id)?.name ?? "Unknown"; }
export function idByName(name) {
  const n = name.toLowerCase();
  for (const [id, d] of DB.players.entries()) if (d.name.toLowerCase() === n) return id;
  for (const [id, d] of DB.players.entries()) if (d.name.toLowerCase().startsWith(n)) return id;
  return undefined;
}

export function now() { return Date.now(); }
export function fmtTime(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const out = [];
  if (d) out.push(d + "d");
  if (h) out.push(h + "h");
  if (m) out.push(m + "m");
  if (sec || !out.length) out.push(sec + "s");
  return out.join(" ");
}
/** "1d2h30m" | "10m" | "perm" -> ms (0 = permanent) */
export function parseDuration(str) {
  if (!str || /^(perm|permanent|forever|0)$/i.test(str)) return 0;
  let total = 0;
  const re = /(\d+)\s*(w|d|h|m|s)/gi;
  let m;
  while ((m = re.exec(str))) total += +m[1] * { w: 604800, d: 86400, h: 3600, m: 60, s: 1 }[m[2].toLowerCase()] * 1000;
  if (!total && /^\d+$/.test(str)) total = +str * 60000;
  return total;
}
export function money(n) {
  return "§a" + cfg().currency + fmtNum(n);
}
export function fmtNum(n) {
  n = Math.floor(n);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
export function cur(n) { return cfg().currency + fmtNum(n); }

export function loc(p) {
  const l = p.location;
  return { x: Math.floor(l.x) + 0.5, y: Math.floor(l.y), z: Math.floor(l.z) + 0.5, dim: p.dimension.id, rx: p.getRotation().x, ry: p.getRotation().y };
}
export function locStr(l) { return `${Math.floor(l.x)}, ${Math.floor(l.y)}, ${Math.floor(l.z)} §7(${dimName(l.dim)})`; }
export function dimName(id) { return (id ?? "overworld").replace("minecraft:", "").replace("the_", ""); }
export function dist2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; }

// ---------- Teleport with warmup ----------
const pendingTp = new Map();
export const tpHooks = { canTeleport: [], beforeTeleport: [], afterTeleport: [] };

export function teleport(p, l, label = "destination", opts = {}) {
  for (const fn of tpHooks.canTeleport) {
    const reason = fn(p);
    if (reason) return err(p, reason);
  }
  const delay = opts.instant || isAdmin(p) ? 0 : cfg().teleportDelay;
  const doIt = async () => {
    let prepared, committed = false;
    try {
      const invalid = opts.validate?.();
      if (invalid) return err(p, invalid);
      // Optional terrain preparation runs after warmup and owns its temporary resources.
      if (opts.prepare) {
        prepared = await opts.prepare(p, l);
        if (!p.isValid) return;
        for (const fn of tpHooks.canTeleport) {
          const reason = fn(p);
          if (reason) return err(p, reason);
        }
      }
      if (opts.validate) {
        const invalidAfterPreparation = opts.validate();
        if (invalidAfterPreparation) return err(p, invalidAfterPreparation);
        for (const fn of tpHooks.canTeleport) {
          const reason = fn(p); if (reason) return err(p, reason);
        }
      }
      const destination = prepared?.location ?? opts.resolveDestination?.() ?? l;
      const dim = world.getDimension(destination.dim ?? "overworld");
      if (opts.beforeCommit && !opts.beforeCommit()) return;
      committed = !!opts.beforeCommit;
      for (const fn of tpHooks.beforeTeleport) fn(p);
      p.teleport({ x: destination.x, y: destination.y, z: destination.z }, {
        dimension: dim, rotation: destination.rx !== undefined ? { x: destination.rx, y: destination.ry } : undefined,
        ...(prepared ? { checkForBlocks: true, keepVelocity: false } : {}),
      });
      committed = false;
      for (const fn of tpHooks.afterTeleport) try { fn(p); } catch {}
      ok(p, "Teleported to §e" + label + "§a.");
      sound(p, "mob.endermen.portal");
    } catch (e) {
      if (committed) try { opts.onCommitFailure?.(); } catch (refundError) { console.warn("[EssX] Teleport refund failed: " + refundError); }
      err(p, "Teleport failed: " + e);
    }
    finally { prepared?.release?.(); }
  };
  if (!delay) return doIt();
  const start = { ...p.location };
  pendingTp.get(p.id)?.cancel?.();
  const intervalTicks = opts.watchMovement ? 1 : 20;
  let ticksLeft = delay * 20;
  msg(p, `§eTeleporting in §b${delay}s§e... don't move.`);
  const h = system.runInterval(() => {
    if (!p.isValid) return cancel();
    let invalid;
    try { invalid = opts.validate?.(); } catch { invalid = "Teleport cancelled."; }
    if (invalid) { err(p, invalid); return cancel(); }
    if (dist2(p.location, start) > (opts.watchMovement ? 0.01 : 0.6)) { err(p, "Teleport cancelled, you moved."); return cancel(); }
    ticksLeft -= intervalTicks;
    if (ticksLeft <= 0) { cancel(); doIt(); }
    else if (ticksLeft % 20 === 0) actionbar(p, `§eTeleporting in §b${ticksLeft / 20}§e...`);
  }, intervalTicks);
  const cancel = () => { system.clearRun(h); pendingTp.delete(p.id); };
  pendingTp.set(p.id, { cancel });
}

// ---------- Forms ----------
const activeForms = new Set();
export async function show(p, form) {
  if (activeForms.has(p.id)) return { canceled: true };
  activeForms.add(p.id);
  try {
    // Leave the item/chat event before requesting UI from the client.
    await sleep(1);
    for (let i = 0; i < 60; i++) {
      if (!p.isValid) return { canceled: true };
      const r = await form.show(p);
      if (r.canceled && r.cancelationReason === FormCancelationReason.UserBusy) {
        await sleep(5);
        continue;
      }
      return r;
    }
    err(p, "Close chat or your current screen, then try opening the menu again.");
  } catch (error) {
    err(p, "Unable to open the menu. Close other screens and try again.");
    console.warn("[EssX Forms] " + error);
  } finally {
    activeForms.delete(p.id);
  }
  return { canceled: true };
}
export function sleep(ticks) { return new Promise((res) => system.runTimeout(res, ticks)); }

/**
 * Menu helper. buttons: [{text, icon?, run?:fn}]
 * returns selected button object or undefined
 */
// Invisible formatting marker selects our resource-pack skin; vanilla forms still show readable titles.
export const MENU_THEME_MARKER = "§0§r§0§r";
const themedTitle = () => MENU_THEME_MARKER + (cfg().menuName || "EssentialsX Menu");
const menuDepth = new Map();
const wentBack = new Set();
const isBackButton = (b) => !b.run && /^back$/i.test(b.text.replace(/§./g, "").trim());

/*
 * Menus opened from inside another menu's button get an automatic Back button.
 * Pressing Back closes only the child and re-opens the parent menu it came from.
 * Closing a menu with the X still closes everything.
 */
export async function menu(p, title, body, buttons) {
  const depth = menuDepth.get(p.id) ?? 0;
  const list = depth > 0 && !buttons.some(isBackButton)
    ? [...buttons, { text: "§l§cBack", icon: "textures/ui/essx/icons/back" }]
    : buttons;
  menuDepth.set(p.id, depth + 1);
  try {
    while (true) {
      const f = new ActionFormData().title(themedTitle());
      f.body(`§a${title}§r${body ? "\n" + body : ""}`);
      for (const b of list) f.button(b.text.replace(/§8/g, "§7"), b.icon?.trim() || "textures/ui/essx/icons/menu");
      const r = await show(p, f);
      if (r.canceled || r.selection === undefined) return undefined;
      const b = list[r.selection];
      if (isBackButton(b)) { wentBack.add(p.id); return b; }
      if (!b?.run) return b;
      wentBack.delete(p.id);
      await b.run();
      if (wentBack.delete(p.id)) continue;
      return b;
    }
  } finally {
    menuDepth.set(p.id, depth);
  }
}

/**
 * Modal helper. fields: [{type:'text'|'toggle'|'slider'|'dropdown'|'label', key, label, ...}]
 * returns object of key -> value, or undefined when canceled
 */
export async function modal(p, title, fields, submit = "Submit") {
  const f = new ModalFormData().title(themedTitle());
  // Keep each form's title in its content while the shared heading is configurable.
  fields = [{ type: "label", label: `§a${title}§r` }, ...fields];
  let inputs = 0;
  for (const fl of fields) {
    switch (fl.type) {
      case "label": f.label(fl.label); break;
      case "text": f.textField(fl.label, fl.placeholder ?? "", { defaultValue: String(fl.default ?? "") }); inputs++; break;
      case "toggle": f.toggle(fl.label, { defaultValue: !!fl.default }); inputs++; break;
      case "slider": f.slider(fl.label, fl.min, fl.max, { valueStep: fl.step ?? 1, defaultValue: fl.default ?? fl.min }); inputs++; break;
      case "dropdown": f.dropdown(fl.label, fl.options, { defaultValueIndex: fl.default ?? 0 }); inputs++; break;
    }
  }
  f.submitButton(submit);
  const r = await show(p, f);
  if (r.canceled || !r.formValues) return undefined;
  const vals = r.formValues;
  const full = vals.length === fields.length;
  const out = {};
  let vi = 0;
  fields.forEach((fl, i) => {
    if (fl.type === "label") { if (full) vi++; return; }
    out[fl.key] = vals[full ? i : vi];
    vi++;
  });
  return out;
}

export async function confirm(p, title, body, yes = "§aConfirm", no = "§cCancel") {
  const r = await show(p, new ActionFormData().title(themedTitle()).body(`§a${title}§r\n${body}`).button(yes, "textures/ui/essx/icons/check").button(no, "textures/ui/essx/icons/close"));
  return !r.canceled && r.selection === 0;
}

// ---------- Players picker ----------
export async function pickPlayer(p, title = "Select Player", includeSelf = false) {
  const list = online().filter((o) => includeSelf || o.id !== p.id);
  if (!list.length) { err(p, "No other players online."); return undefined; }
  const b = await menu(p, title, "§7Online: " + list.length, list.map((o) => ({ text: "§l" + o.name + "\n§r§8" + (isAdmin(o) ? "Admin" : "Player"), icon: "textures/ui/icon_steve", pl: o })));
  return b?.pl;
}

// ---------- Inventory helpers ----------
export function inv(p) { return p.getComponent("minecraft:inventory").container; }
export function heldItem(p) { return inv(p).getItem(p.selectedSlotIndex); }
export function setHeld(p, item) { inv(p).setItem(p.selectedSlotIndex, item); }
export function equip(p) { return p.getComponent("minecraft:equippable"); }
export const ARMOR_SLOTS = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];

export function countItem(p, typeId) {
  const c = inv(p); let n = 0;
  for (let i = 0; i < c.size; i++) { const it = c.getItem(i); if (it?.typeId === typeId) n += it.amount; }
  return n;
}
export function removeItem(p, typeId, amount) {
  const c = inv(p);
  for (let i = 0; i < c.size && amount > 0; i++) {
    const it = c.getItem(i);
    if (it?.typeId !== typeId) continue;
    if (it.amount <= amount) { amount -= it.amount; c.setItem(i, undefined); }
    else { it.amount -= amount; amount = 0; c.setItem(i, it); }
  }
  return amount === 0;
}
export function giveItem(p, item) {
  const left = inv(p).addItem(item);
  if (left) p.dimension.spawnItem(left, p.location);
}
export function giveType(p, typeId, amount) {
  try {
    const max = new ItemStack(typeId, 1).maxAmount;
    while (amount > 0) { const n = Math.min(max, amount); giveItem(p, new ItemStack(typeId, n)); amount -= n; }
    return true;
  } catch { return false; }
}

/** Serialize an ItemStack into plain JSON (type, amount, name, lore, enchants, damage). */
export function serializeItem(it) {
  if (!it) return undefined;
  const o = { t: it.typeId, a: it.amount };
  if (it.nameTag) o.n = it.nameTag;
  const lore = it.getLore(); if (lore.length) o.l = lore;
  try {
    const ench = it.getComponent("minecraft:enchantable");
    if (ench) { const e = ench.getEnchantments(); if (e.length) o.e = e.map((x) => [x.type.id, x.level]); }
  } catch {}
  try { const d = it.getComponent("minecraft:durability"); if (d && d.damage) o.d = d.damage; } catch {}
  return o;
}
export function deserializeItem(o) {
  if (!o) return undefined;
  try {
    const it = new ItemStack(o.t, o.a ?? 1);
    if (o.n) it.nameTag = o.n;
    if (o.l) it.setLore(o.l);
    if (o.e) { const ench = it.getComponent("minecraft:enchantable"); for (const [id, lvl] of o.e) try { const type = EnchantmentTypes.get(id); if (type) ench?.addEnchantment({ type, level: Math.min(lvl, type.maxLevel) }); } catch {} }
    if (o.d) { const d = it.getComponent("minecraft:durability"); if (d) d.damage = o.d; }
    return it;
  } catch { return undefined; }
}
export function itemName(o) {
  if (!o) return "?";
  if (o.n) return o.n;
  const t = (o.t ?? o.typeId ?? "").replace("minecraft:", "");
  return t.split("_").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

// ---------- Logs ----------
export function log(type, text) {
  const l = DB.logs.data.list;
  l.push({ t: now(), type, text });
  if (l.length > 300) l.splice(0, l.length - 300);
  DB.logs.save();
}

export function cmdRun(cmd, dim = "overworld") {
  try { return world.getDimension(dim).runCommand(cmd); } catch (e) { return undefined; }
}
