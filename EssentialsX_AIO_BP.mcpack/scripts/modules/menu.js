// EssentialsX AIO - By Opiar | Main menus & menu items
import { world, system, ItemStack } from "@minecraft/server";
import { cfg, saveCfg, mod, CREDITS } from "../core/config.js";
import { cmd, addAdmin, memberMenu, adminMenu } from "../core/commands.js";
import { menu, modal, isAdmin, err, ok, cur, giveItem, online, now } from "../core/utils.js";
import { alphabeticalMenu } from "../core/menu-order.js";
import { bal } from "./economy.js";
import { rankBadge } from "./ranks.js";
import { isLoggedIn } from "./login.js";
import { authenticateDeveloper } from "../core/developer-auth.js";

// Category and feature order use module IDs, independent of names and import order.
const CATEGORIES = [
  { id: "teleport", text: "Teleport", icon: "textures/ui/essx/icons/teleport", modules: ["spawn", "homes", "warps", "tpa", "rtp", "graves"] },
  { id: "land", text: "Land & Clans", icon: "textures/ui/essx/icons/land", modules: ["land", "clans"] },
  { id: "trading", text: "Economy & Trading", icon: "textures/ui/essx/icons/shop", modules: ["economy", "jobs", "shop", "auction", "trade", "repair", "enchant"] },
  { id: "rewards", text: "Rewards & Quests", icon: "textures/ui/essx/icons/gift", modules: ["daily", "quests", "kits", "redeem"] },
  { id: "games", text: "Games & Combat", icon: "textures/ui/essx/icons/games", modules: ["games", "duels", "bounty"] },
  { id: "cosmetics", text: "Cosmetics", icon: "textures/ui/essx/icons/cosmetics", modules: ["cosmetics"] },
  { id: "community", text: "Community Hub", icon: "textures/ui/essx/icons/chat", modules: ["reports", "nightvote"] },
  { id: "settings", text: "My Settings", icon: "textures/ui/essx/icons/settings", modules: [] },
];
const MODULE_CATEGORY = Object.fromEntries(CATEGORIES.flatMap((c) => c.modules.map((id) => [id, c.id])));
const MODULE_ORDER = Object.fromEntries(CATEGORIES.flatMap((c) => c.modules.map((id, index) => [id, index])));
const featureOrder = (button) => button.order ?? MODULE_ORDER[button.module] ?? 1000;

export async function mainMenu(p) {
  const active = memberMenu.filter((b) => !b.module || mod(b.module));
  const groups = new Map(CATEGORIES.map((c) => [c.id, []]));
  for (const button of active) {
    const category = button.category ?? MODULE_CATEGORY[button.module] ?? "community";
    // Future module registrations remain reachable through Community Hub.
    (groups.get(category) ?? groups.get("community")).push(button);
  }
  for (const entries of groups.values()) entries.sort((a, b) => featureOrder(a) - featureOrder(b));
  const btns = CATEGORIES.filter((c) => groups.get(c.id).length).map((category) => ({
    text: "§f" + category.text,
    icon: category.icon,
    run: () => {
      const entries = groups.get(category.id);
      if (entries.length === 1) return entries[0].run(p);
      return menu(p, "§a" + category.text, "§7Choose a feature", entries.map((b) => ({ ...b, run: () => b.run(p) })));
    },
  }));
  await menu(p, cfg().serverName, `§fWelcome §e${p.name} §8| §r${rankBadge(p.id)}\n§7Balance §a${cur(bal(p.id))} §8• §7Online §b${online().length}`, btns);
}
export async function adminPanel(p) {
  if (!isAdmin(p)) return err(p, "You don't have permission.");
  if (!await authenticateDeveloper(p)) return;
  const btns = alphabeticalMenu(adminMenu.filter((b) => !b.module || mod(b.module))).map((b) => ({ ...b, run: () => b.run(p) }));
  await menu(p, "§l§cAdmin Panel", `§7Server management tools\n${CREDITS}`, btns);
}

async function menuNameUI(p) {
  const r = await modal(p, "§lMenu Name", [
    { type: "text", key: "name", label: "Menu name (max 24 visible characters, § colors allowed)", default: cfg().menuName },
    { type: "text", key: "tag", label: "Message tag (max 24 visible characters, § colors allowed)", default: cfg().messageTag ?? "EssX" },
    { type: "label", label: "§7Message tag replaces EssX in system messages. Brackets are added automatically." },
  ], "Save");
  if (!r) return;
  const name = String(r.name ?? "").trim();
  const visible = name.replace(/§./g, "").trim();
  if (!visible || /[\r\n]/.test(name) || [...visible].length > 24) return err(p, "Enter a menu name with 1-24 visible characters on one line.");
  const tag = String(r.tag ?? cfg().messageTag ?? "EssX").trim();
  const visibleTag = tag.replace(/§./g, "").trim();
  if (!visibleTag || /[\r\n]/.test(tag) || [...visibleTag].length > 24) return err(p, "Enter a message tag with 1-24 visible characters on one line.");
  if (!await authenticateDeveloper(p)) return;
  cfg().menuName = name;
  cfg().messageTag = tag;
  saveCfg();
  ok(p, "Menu name and message tag saved. Reopen a menu to see the new heading.");
}
addAdmin({ text: "§l§bMenu Name\n§r§8Edit heading & message tag", icon: "textures/ui/essx/icons/edit", run: menuNameUI });

cmd({ name: "menu", aliases: ["gui", "main"], desc: "Open the main menu", run: mainMenu });
cmd({ name: "adminmenu", aliases: ["ap", "panel", "staff"], admin: true, desc: "Open the admin panel", run: adminPanel });
cmd({ name: "getmenu", desc: "Get the menu item", run: (p) => { giveItem(p, new ItemStack("essx:menu", 1)); ok(p, "Menu item given."); } });

const cd = new Map();
world.beforeEvents.itemUse.subscribe((ev) => {
  const p = ev.source, id = ev.itemStack?.typeId;
  if (id !== "essx:menu" && id !== "essx:admin_menu") return;
  const canceled = ev.cancel;
  ev.cancel = true; // Give the item a Use action without consuming it.
  if (canceled || !isLoggedIn(p)) return;
  if (now() - (cd.get(p.id) ?? 0) < 500) return;
  cd.set(p.id, now());
  const admin = id === "essx:admin_menu" || (p.isSneaking && isAdmin(p));
  system.run(async () => {
    if (!p.isValid || !isLoggedIn(p)) return;
    try { await (admin ? adminPanel(p) : mainMenu(p)); }
    catch (error) { err(p, "Menu failed to open. Try !menu or !adminmenu."); console.warn("[EssX Menu] " + error); }
  });
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cd.delete(playerId);
});
