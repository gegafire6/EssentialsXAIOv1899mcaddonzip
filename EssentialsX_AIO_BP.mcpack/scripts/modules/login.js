import { topbarNotice } from "../core/notifications.js";
// EssentialsX AIO - By Opiar | Login system plugin (register / login with salted SHA-256 passwords)
import { world, system, InputPermissionCategory } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod } from "../core/config.js";
import { cmd, hooks } from "../core/commands.js";
import { registerPlugin } from "../core/plugins.js";
import { hashPassword, randomSalt } from "../core/hash.js";
import { msg, ok, err, isAdmin, menu, modal, confirm, pickPlayer, now, log, online, sleep, tpHooks, cmdRun, findPlayer, idByName } from "../core/utils.js";
import { chatHooks } from "./chat.js";
import { spawnLoc, groundedSpawn } from "./teleport.js";

const authed = new Set();
/** id -> { since, attempts, pos, dim } */
const pending = new Map();
const prompting = new Set();
const ALLOWED_WHILE_LOCKED = new Set(["login", "register", "help"]);

const isLocked = (p) => mod("login") && !authed.has(p.id) && !(cfg().login.adminBypass && isAdmin(p));
export const isLoggedIn = (p) => !isLocked(p);

// Movement and camera stay available while authentication restrictions are active.
function releaseLoginLock(p) {
  try { p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true); } catch {}
  try { p.inputPermissions.setPermissionCategory(InputPermissionCategory.Camera, true); } catch {}
  // Clean up only the long-lived effects applied by older login versions.
  for (const [id, amplifier] of [["blindness", 0], ["resistance", 4]]) {
    try {
      const effect = p.getEffect(id);
      if (effect?.amplifier === amplifier && effect.duration > 1200000) p.removeEffect(id);
    } catch {}
  }
}

function returnToLoginSpawn(p, st, force = false) {
  // Retry unloaded spawn terrain on later ticks; retain the entry position until ready.
  try {
    const destination = spawnLoc();
    const dimension = world.getDimension(destination.dim ?? "overworld");
    const landing = groundedSpawn(dimension, destination, !!cfg().spawnLoc);
    if (landing) { st.pos = { x: landing.x, y: landing.y, z: landing.z }; st.dim = dimension.id; }
  } catch {}
  const delta = (p.location.x - st.pos.x) ** 2 + (p.location.y - st.pos.y) ** 2 + (p.location.z - st.pos.z) ** 2;
  if (force || p.dimension.id !== st.dim || delta > 2) {
    p.teleport(st.pos, { dimension: world.getDimension(st.dim), checkForBlocks: true, keepVelocity: false });
    for (const fn of tpHooks.afterTeleport) try { fn(p); } catch {}
  }
}

function loginPromptNotice(p, seconds = cfg().login.timeoutSec, refresh = false) {
  const registered = DB.auth.has(p.id);
  topbarNotice(p, `${registered ? "§c§lLogin" : "§e§lRegister"} Required §r§e${seconds}s`,
    `${cfg().prefix}${registered ? "login <password>" : "register <password> <password>"}`, refresh, registered ? "quest" : "register");
}

function lock(p) {
  if (pending.has(p.id)) return;
  pending.set(p.id, { since: now(), attempts: 0, pos: { ...p.location }, dim: p.dimension.id });
  releaseLoginLock(p);
  try { returnToLoginSpawn(p, pending.get(p.id), true); } catch {}
  loginPromptNotice(p);
  promptForm(p);
}

function unlock(p) {
  pending.delete(p.id);
  authed.add(p.id);
  releaseLoginLock(p);
  topbarNotice(p, "§a§lLogged in", "Welcome back!", false, "welcome");
}

function fail(p, reason) {
  const st = pending.get(p.id);
  const max = cfg().login.maxAttempts;
  if (st) st.attempts++;
  log("login", `${p.name} failed login (${st?.attempts ?? 1}/${max})`);
  if (st && st.attempts >= max) { kickPlayer(p, "Too many failed login attempts."); return "Too many failed attempts."; }
  return `${reason} §7(${st?.attempts ?? 1}/${max})`;
}

function kickPlayer(p, reason) { cmdRun(`kick "${p.name}" ${reason.replace(/§./g, "")}`); }

function register(p, pw, pw2) {
  const c = cfg().login;
  if (DB.auth.has(p.id)) return "You are already registered. Use login.";
  if (!pw || pw.length < c.minPassword) return `Password must be at least ${c.minPassword} characters.`;
  if (/\s/.test(pw)) return "Password can't contain spaces.";
  if (pw.toLowerCase() === p.name.toLowerCase()) return "Password can't be your name.";
  if (pw !== pw2) return "Passwords do not match.";
  const salt = randomSalt();
  DB.auth.set(p.id, { name: p.name, hash: hashPassword(pw, salt), salt, reg: now(), lastLogin: now(), lastSeen: now() });
  log("login", `${p.name} registered`);
  unlock(p);
  return null;
}

function login(p, pw) {
  const a = DB.auth.get(p.id);
  if (!a) return "You are not registered. Use register.";
  if (!pw || hashPassword(pw, a.salt) !== a.hash) return fail(p, "Wrong password.");
  a.lastLogin = now(); a.name = p.name;
  DB.auth.set(p.id, a);
  log("login", `${p.name} logged in`);
  unlock(p);
  return null;
}

async function promptForm(p) {
  if (prompting.has(p.id)) return;
  prompting.add(p.id);
  try {
    await sleep(60);
    while (p.isValid && isLocked(p)) {
      const reg = !DB.auth.has(p.id);
      const fields = [{ type: "label", label: reg ? "§eCreate a password for your account.\n§7Don't share it with anyone." : "§7Enter your password to continue." }, { type: "text", key: "pw", label: "Password", placeholder: "password" }];
      if (reg) fields.push({ type: "text", key: "pw2", label: "Confirm password", placeholder: "password" });
      const r = await modal(p, reg ? "§l§eRegister" : "§l§cLogin", fields, reg ? "Register" : "Login");
      if (!r) { await sleep(80); continue; }
      const res = reg ? register(p, String(r.pw ?? ""), String(r.pw2 ?? "")) : login(p, String(r.pw ?? ""));
      if (res) err(p, res); else ok(p, reg ? "Registered successfully!" : "Logged in successfully!");
    }
  } catch {}
  finally { prompting.delete(p.id); }
}

// ---------- Lifecycle ----------
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn || !mod("login")) return;
  const p = ev.player;
  const a = DB.auth.get(p.id);
  const mins = cfg().login.autoLoginMin;
  if (a && mins > 0 && a.name === p.name && now() - (a.lastSeen ?? 0) < mins * 60000) {
    authed.add(p.id);
    system.runTimeout(() => topbarNotice(p, "§a§lLogged in", "Automatically logged in.", false, "welcome"), 40);
    return;
  }
  authed.delete(p.id);
  lock(p);
});
world.beforeEvents.playerLeave.subscribe((ev) => {
  const id = ev.player.id;
  const a = DB.auth.get(id);
  if (a && authed.has(id)) { a.lastSeen = now(); DB.auth.set(id, a); }
  authed.delete(id);
  pending.delete(id);
});
// Players already online when scripts (re)load are trusted
system.run(() => { for (const p of online()) authed.add(p.id); });

system.runInterval(() => {
  const enabled = mod("login");
  for (const p of online()) {
    if (!enabled) {
      authed.add(p.id);
      if (pending.has(p.id)) { pending.delete(p.id); releaseLoginLock(p); }
      continue;
    }
    if (!isLocked(p)) { if (pending.has(p.id)) { pending.delete(p.id); releaseLoginLock(p); } continue; }
    if (!pending.has(p.id)) { lock(p); continue; }
    const st = pending.get(p.id);
    const left = cfg().login.timeoutSec - Math.floor((now() - st.since) / 1000);
    if (left <= 0) { kickPlayer(p, cfg().login.kickMessage); pending.delete(p.id); continue; }
    try {
      returnToLoginSpawn(p, st);
      loginPromptNotice(p, left, true);
    } catch {}
  }
}, 20);

// ---------- Restrictions while locked ----------
const block = (ev) => { if (isLocked(ev.player ?? ev.source)) ev.cancel = true; };
world.beforeEvents.playerBreakBlock.subscribe(block);
world.beforeEvents.playerPlaceBlock.subscribe(block);
world.beforeEvents.playerInteractWithBlock.subscribe(block);
world.beforeEvents.playerInteractWithEntity.subscribe(block);
world.beforeEvents.itemUse.subscribe(block);
world.beforeEvents.entityHurt?.subscribe((ev) => {
  const v = ev.hurtEntity, a = ev.damageSource?.damagingEntity;
  if ((v.typeId === "minecraft:player" && isLocked(v)) || (a?.typeId === "minecraft:player" && isLocked(a))) ev.cancel = true;
});
hooks.beforeCommand.push((p, c) => (isLocked(p) && !ALLOWED_WHILE_LOCKED.has(c.name) ? `You must login first. Use ${cfg().prefix}${DB.auth.has(p.id) ? "login <password>" : "register <password> <password>"}` : undefined));
chatHooks.intercept.push((p) => {
  if (!isLocked(p)) return false;
  system.run(() => err(p, "You must login before chatting."));
  return true;
});
tpHooks.canTeleport.push((p) => (isLocked(p) ? "You must login first." : undefined));

// ---------- Personal account settings ----------
function accountAccessError(p) {
  if (!mod("login")) return "The login system is disabled on this server.";
  if (isLocked(p)) return "You must login first.";
  if (!DB.auth.has(p.id)) return "You are not registered.";
}

async function resetPasswordUI(p) {
  const reason = accountAccessError(p);
  if (reason) return err(p, reason);
  if (!cfg().login.allowChangePassword) return err(p, "Changing passwords is disabled.");
  const r = await modal(p, "§lReset Password", [
    { type: "label", label: "§7Verify your current password to set a new one." },
    { type: "text", key: "old", label: "Current password", placeholder: "Current password" },
    { type: "text", key: "pw", label: "New password", placeholder: "New password" },
    { type: "text", key: "pw2", label: "Confirm new password", placeholder: "Repeat new password" },
  ], "Reset Password");
  if (!r) return;
  // The session, account and server settings may change while the form is open.
  const currentReason = accountAccessError(p);
  if (currentReason) return err(p, currentReason);
  const c = cfg().login;
  if (!c.allowChangePassword) return err(p, "Changing passwords is disabled.");
  const acc = DB.auth.get(p.id);
  const old = String(r.old ?? ""), pw = String(r.pw ?? ""), pw2 = String(r.pw2 ?? "");
  if (hashPassword(old, acc.salt) !== acc.hash) return err(p, "Current password is wrong.");
  if (pw.length < c.minPassword) return err(p, `Password must be at least ${c.minPassword} characters.`);
  if (/\s/.test(pw)) return err(p, "Password can't contain spaces.");
  if (pw.toLowerCase() === p.name.toLowerCase()) return err(p, "Password can't be your name.");
  if (pw !== pw2) return err(p, "Passwords do not match.");
  const salt = randomSalt();
  DB.auth.set(p.id, { ...acc, salt, hash: hashPassword(pw, salt) });
  log("login", `${p.name} changed password`);
  ok(p, "Password reset successfully.");
}

export async function manageAccountUI(p) {
  const reason = accountAccessError(p);
  if (reason) return err(p, reason);
  await menu(p, "§lManage Account", `§7Account: §f${p.name}`, [
    { text: "§l§eReset Password\n§r§8Change your account password", icon: "textures/ui/lock_color", run: () => resetPasswordUI(p) },
  ]);
}

// ---------- Commands ----------
cmd({
  name: "login", aliases: ["l", "log"], module: "login", sensitive: true, desc: "Login to your account", usage: "<password>",
  run: (p, a) => {
    if (!isLocked(p)) return err(p, "You are already logged in.");
    const res = login(p, a.join(" "));
    if (res) err(p, res); else ok(p, "Logged in successfully!");
  },
});
cmd({
  name: "register", aliases: ["reg"], module: "login", sensitive: true, desc: "Register an account", usage: "<password> <confirm>",
  run: (p, a) => {
    if (DB.auth.has(p.id)) return err(p, `You are already registered. Use ${cfg().prefix}login`);
    const res = register(p, a[0], a[1] ?? a[0]);
    if (res) err(p, res); else ok(p, "Registered successfully!");
  },
});
cmd({
  name: "changepassword", aliases: ["changepass", "cpw"], module: "login", sensitive: true, desc: "Change your password", usage: "<old> <new>",
  run: (p, a) => {
    const c = cfg().login;
    if (!c.allowChangePassword) return err(p, "Changing passwords is disabled.");
    const acc = DB.auth.get(p.id);
    if (!acc) return err(p, "You are not registered.");
    if (a.length < 2) return err(p, `Usage: ${cfg().prefix}changepassword <old> <new>`);
    if (hashPassword(a[0], acc.salt) !== acc.hash) return err(p, "Old password is wrong.");
    if (a[1].length < c.minPassword) return err(p, `Password must be at least ${c.minPassword} characters.`);
    const salt = randomSalt();
    DB.auth.set(p.id, { ...acc, salt, hash: hashPassword(a[1], salt) });
    log("login", `${p.name} changed password`);
    ok(p, "Password changed.");
  },
});
cmd({
  name: "logout", module: "login", desc: "Log out of your account",
  run: (p) => { authed.delete(p.id); pending.delete(p.id); lock(p); },
});
async function resetFor(p, name) {
  const id = idByName(name);
  if (!id || !DB.auth.has(id)) return err(p, "That player has no account.");
  DB.auth.delete(id);
  authed.delete(id);
  log("login", `${p.name} reset password of ${name}`);
  ok(p, `Account of ${name} was reset. They must register again.`);
  const t = findPlayer(name);
  if (t) { err(t, "Your account was reset by staff. Please register again."); pending.delete(t.id); lock(t); }
}
cmd({
  name: "resetpassword", aliases: ["resetpass"], module: "login", admin: true, desc: "Reset a player's account", usage: "<player>",
  run: (p, a) => (a[0] ? resetFor(p, a[0]) : err(p, `Usage: ${cfg().prefix}resetpassword <player>`)),
});

async function loginAdminUI(p) {
  const total = DB.auth.keys().length;
  await menu(p, "§lLogin System", `§7Registered accounts: §e${total}\n§7Waiting to login: §e${pending.size}`, [
    { text: "§l§cReset Player Account", icon: "textures/ui/icon_steve", run: async () => {
      const list = DB.auth.entries().map(([id, a]) => ({ icon: "textures/ui/essx/icons/account", text: "§l" + a.name, id, name: a.name }));
      if (!list.length) return err(p, "No registered accounts.");
      const b = await menu(p, "§lReset Account", "§7Select an account.", list);
      if (b && await confirm(p, "Reset", `Reset account of ${b.name}?`)) resetFor(p, b.name);
    } },
    { text: "§l§eForce Logout Everyone\n§r§8Require re-login", icon: "textures/ui/essx/icons/logout", run: async () => {
      if (!await confirm(p, "Force logout", "Everyone online must login again?")) return;
      for (const o of online()) { if (o.id === p.id) continue; authed.delete(o.id); lock(o); }
      ok(p, "Everyone must login again.");
    } },
  ]);
}

registerPlugin({
  id: "login", name: "Login System", module: "login", icon: "textures/ui/essx/icons/account",
  desc: "Players must register/login before they can play.",
  fields: (c) => [
    { type: "slider", key: "timeoutSec", label: "Login timeout (seconds)", min: 15, max: 300, step: 5, default: c.login.timeoutSec },
    { type: "slider", key: "maxAttempts", label: "Max wrong attempts", min: 1, max: 10, step: 1, default: c.login.maxAttempts },
    { type: "slider", key: "minPassword", label: "Minimum password length", min: 3, max: 16, step: 1, default: c.login.minPassword },
    { type: "slider", key: "autoLoginMin", label: "Auto-login if rejoin within (minutes, 0 = off)", min: 0, max: 120, step: 5, default: c.login.autoLoginMin },
    { type: "toggle", key: "adminBypass", label: "Admins skip login", default: c.login.adminBypass },
    { type: "toggle", key: "allowChangePassword", label: "Allow players to change password", default: c.login.allowChangePassword },
    { type: "text", key: "kickMessage", label: "Timeout kick message", default: c.login.kickMessage },
  ],
  apply: (c, r) => Object.assign(c.login, r),
  actions: [{ text: "§l§bManage Accounts\n§r§8Reset / force logout", icon: "textures/ui/essx/icons/account", run: loginAdminUI }],
});
