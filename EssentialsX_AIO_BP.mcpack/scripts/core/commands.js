// EssentialsX AIO - By Opiar
import { system } from "@minecraft/server";
import { cfg, mod } from "./config.js";
import { err, isAdmin, msg, log, menu } from "./utils.js";
import { authenticateDeveloper } from "./developer-auth.js";

/** @type {Map<string, any>} */
export const commands = new Map();
const list = [];

/**
 * cmd({ name, aliases, desc, usage, admin, module, run(player, args, raw) })
 */
export function cmd(def) {
  if (def.admin) {
    const run = def.run;
    def = { ...def, run: async (p, ...args) => {
      if (!await authenticateDeveloper(p)) return;
      return run(p, ...args);
    } };
  }
  list.push(def);
  commands.set(def.name, def);
  for (const a of def.aliases ?? []) commands.set(a, def);
}

export const hooks = { beforeCommand: [] };

export function tokenize(str) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(str))) out.push(m[1] ?? m[2]);
  return out;
}

export function dispatch(p, raw) {
  const parts = tokenize(raw);
  const name = (parts.shift() ?? "").toLowerCase();
  const c = commands.get(name);
  if (!c) return err(p, `Unknown command §e${cfg().prefix}${name}§c. Type §e${cfg().prefix}help`);
  if (c.module && !mod(c.module)) return err(p, "That feature is disabled on this server.");
  if (c.admin && !isAdmin(p)) return err(p, "You don't have permission.");
  for (const h of hooks.beforeCommand) {
    const reason = h(p, c, parts);
    if (reason) return err(p, reason);
  }
  log("cmd", `${p.name}: ${cfg().prefix}${c.sensitive ? c.name + " ***" : raw}`);
  system.run(async () => {
    try { await c.run(p, parts, raw); }
    catch (e) { err(p, "Command error: " + e); console.warn(e?.stack ?? e); }
  });
}

export function helpList(p) {
  const pre = cfg().prefix;
  return list.filter((c) => (!c.admin || isAdmin(p)) && (!c.module || mod(c.module)));
}

cmd({
  name: "help", aliases: ["?", "commands"], desc: "Show all commands",
  run: async (p, args) => {
    const pre = cfg().prefix;
    const all = helpList(p);
    const page = Math.max(1, parseInt(args[0]) || 1);
    const per = 12;
    const pages = Math.ceil(all.length / per);
    msg(p, `§6---- Help §7(${page}/${pages}) §6----`);
    for (const c of all.slice((page - 1) * per, page * per))
      p.sendMessage(`§e${pre}${c.name}${c.usage ? " §7" + c.usage : ""} §8- §f${c.desc ?? ""}${c.admin ? " §c[A]" : ""}`);
    if (page < pages) p.sendMessage(`§7Next page: §e${pre}help ${page + 1}`);
  },
});

// ---- Menu registries (modules plug buttons into main menus) ----
export const memberMenu = []; // {text, icon, module?, category?, order?, run(p)}
export const adminMenu = [];
export function addMember(b) { memberMenu.push(b); }
export function addAdmin(b) {
  adminMenu.push({ ...b, run: async (p) => {
    if (!await authenticateDeveloper(p)) return;
    return b.run(p);
  } });
}
