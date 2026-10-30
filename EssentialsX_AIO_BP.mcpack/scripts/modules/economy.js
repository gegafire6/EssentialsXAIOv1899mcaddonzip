import { actionbar } from "../core/actionbar.js";
// EssentialsX AIO - By Opiar | Economy
import { world } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod } from "../core/config.js";
import { cmd, addMember, addAdmin } from "../core/commands.js";
import { msg, ok, err, findPlayer, idByName, nameOf, cur, modal, pickPlayer, menu, byId, log, isAdmin } from "../core/utils.js";

export function bal(id) {
  if (!DB.eco.has(id)) DB.eco.set(id, cfg().startingBalance);
  return DB.eco.get(id, 0);
}
export function setBal(id, v) { DB.eco.set(id, Math.max(0, Math.floor(v))); syncScore(id); }
export function addBal(id, v) { setBal(id, bal(id) + v); }
export function takeBal(id, v) {
  if (bal(id) < v) return false;
  setBal(id, bal(id) - v);
  return true;
}
function syncScore(id) {
  try {
    const p = byId(id);
    if (!p) return;
    const obj = world.scoreboard.getObjective("money") ?? world.scoreboard.addObjective("money", "§aMoney");
    obj.setScore(p, Math.min(2147483647, DB.eco.get(id, 0)));
  } catch {}
}
export function charge(p, amount, what = "this") {
  if (amount <= 0) return true;
  if (!takeBal(p.id, amount)) { err(p, `You need §e${cur(amount)}§c for ${what}. Balance: §e${cur(bal(p.id))}`); return false; }
  return true;
}

export async function payUI(p) {
  const t = await pickPlayer(p, "§lPay Player");
  if (!t) return;
  const r = await modal(p, "§lPay " + t.name, [
    { type: "label", label: `§7Your balance: §a${cur(bal(p.id))}` },
    { type: "text", key: "amt", label: "Amount", placeholder: "100" },
  ]);
  if (r) pay(p, t, r.amt);
}
function pay(p, t, amtStr) {
  const amt = Math.floor(Number(amtStr));
  if (!amt || amt < cfg().economy.payMin) return err(p, "Invalid amount.");
  if (t.id === p.id) return err(p, "You can't pay yourself.");
  if (!takeBal(p.id, amt)) return err(p, "Not enough money.");
  addBal(t.id, amt);
  ok(p, `Paid §e${t.name} §a${cur(amt)}`);
  ok(t, `You received §e${cur(amt)}§a from §e${p.name}`);
  log("eco", `${p.name} paid ${t.name} ${amt}`);
}

export function topList(n = 10) {
  return DB.eco.entries().sort((a, b) => b[1] - a[1]).slice(0, n);
}
export async function baltopUI(p) {
  const top = topList(10);
  const body = top.map(([id, v], i) => `§e#${i + 1} §f${nameOf(id)} §7- §a${cur(v)}`).join("\n") || "§7No data";
  await menu(p, "§lRichest Players", body, [{ text: "§lClose", icon: "textures/ui/essx/icons/close" }]);
}

cmd({ name: "balance", aliases: ["bal", "money"], module: "economy", desc: "Check balance", usage: "[player]",
  run: (p, a) => {
    if (a[0]) { const id = idByName(a[0]); if (!id) return err(p, "Player not found."); return msg(p, `§e${nameOf(id)}§f: §a${cur(bal(id))}`); }
    msg(p, `§fBalance: §a${cur(bal(p.id))}`);
  } });
cmd({ name: "pay", module: "economy", desc: "Pay a player", usage: "<player> <amount>",
  run: (p, a) => {
    if (!a[0]) return payUI(p);
    const t = findPlayer(a[0]); if (!t) return err(p, "Player not online.");
    pay(p, t, a[1]);
  } });
cmd({ name: "baltop", aliases: ["moneytop"], module: "economy", desc: "Top balances",
  run: (p) => { const top = topList(10); msg(p, "§6---- Richest ----"); top.forEach(([id, v], i) => p.sendMessage(`§e#${i + 1} §f${nameOf(id)} §7- §a${cur(v)}`)); } });
cmd({ name: "eco", admin: true, module: "economy", desc: "Manage money", usage: "<give|take|set|reset> <player> <amount>",
  run: (p, a) => {
    const [op, who, amtS] = a;
    const id = who ? idByName(who) : undefined;
    if (!op || !id) return err(p, "Usage: !eco <give|take|set|reset> <player> <amount>");
    const amt = Math.floor(Number(amtS) || 0);
    if (op === "give") addBal(id, amt);
    else if (op === "take") setBal(id, bal(id) - amt);
    else if (op === "set") setBal(id, amt);
    else if (op === "reset") setBal(id, cfg().startingBalance);
    else return err(p, "Unknown operation.");
    ok(p, `${nameOf(id)} now has ${cur(bal(id))}`);
    log("eco", `${p.name} eco ${op} ${nameOf(id)} ${amt}`);
  } });

async function moneyUI(p) {
  await menu(p, "§lMoney", `§fBalance: §a${cur(bal(p.id))}`, [
    { text: "§lPay Player", icon: "textures/items/gold_ingot", run: () => payUI(p) },
  ]);
}
cmd({ name: "bank", module: "economy", desc: "Money menu", run: moneyUI });
addMember({ text: "§l§2Money\n§r§8Balance & pay", icon: "textures/ui/essx/icons/wallet", module: "economy", run: moneyUI });

addAdmin({ text: "§l§2Economy\n§r§8Give / take / set money", icon: "textures/ui/essx/icons/wallet", module: "economy", run: async (p) => {
  const t = await pickPlayer(p, "§lEconomy - Player", true);
  if (!t) return;
  const r = await modal(p, "§lEconomy: " + t.name, [
    { type: "label", label: `§7Balance: §a${cur(bal(t.id))}` },
    { type: "dropdown", key: "op", label: "Action", options: ["Give", "Take", "Set"] },
    { type: "text", key: "amt", label: "Amount", placeholder: "1000" },
  ]);
  if (!r) return;
  const amt = Math.floor(Number(r.amt) || 0);
  if (r.op === 0) addBal(t.id, amt); else if (r.op === 1) setBal(t.id, bal(t.id) - amt); else setBal(t.id, amt);
  ok(p, `${t.name}: ${cur(bal(t.id))}`);
  log("eco", `${p.name} eco ${["give", "take", "set"][r.op]} ${t.name} ${amt}`);
} });

// Kill rewards
world.afterEvents.entityDie.subscribe((ev) => {
  if (!mod("economy")) return;
  const killer = ev.damageSource?.damagingEntity;
  if (!killer || killer.typeId !== "minecraft:player") return;
  const dead = ev.deadEntity;
  if (dead.typeId === "minecraft:player") {
    if (dead.id === killer.id) return;
    const r = cfg().economy.killReward;
    if (r > 0) { addBal(killer.id, r); actionbar(killer, `§a+${cur(r)} §7(player kill)`); }
  } else {
    const fam = dead.getComponent("minecraft:type_family");
    if (fam?.hasTypeFamily("monster")) {
      const r = cfg().economy.mobKillReward;
      if (r > 0) { addBal(killer.id, r); actionbar(killer, `§a+${cur(r)}`); }
    }
  }
});

world.afterEvents.playerSpawn.subscribe((ev) => { if (ev.initialSpawn) { bal(ev.player.id); syncScore(ev.player.id); } });
