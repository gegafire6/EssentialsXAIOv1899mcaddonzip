// =====================================================
//  EssentialsX All-in-One for Minecraft Bedrock
//  Credits: By Opiar
//  Version 1.26.60 | @minecraft/server 2.11.0
// =====================================================
import { world, system } from "@minecraft/server";
import { flush } from "./core/db.js";
import { cfg, CREDITS } from "./core/config.js";
import { dispatch } from "./core/commands.js";
import { online, isAdmin, msg } from "./core/utils.js";

import "./modules/ranks.js";
import "./modules/economy.js";
import "./modules/games.js";
import "./modules/jobs.js";
import "./modules/trade.js";
import "./modules/item-services.js";
import "./modules/duels.js";
import "./modules/chat.js";
import "./modules/teleport.js";
import "./modules/shop.js";
import "./modules/protection.js";
import "./modules/locks.js";
import "./modules/clans.js";
import "./modules/rewards.js";
import "./modules/graves.js";
import "./modules/display.js";
import "./modules/admin.js";
import "./modules/npc.js";
import "./modules/backpack.js";
import "./core/legacy-replay-cleanup.js";
import "./modules/artifacts.js";
import "./core/legacy-companion-cleanup.js";
import "./modules/gathering.js";
import "./modules/login.js";
import "./modules/anticheat.js";
import "./modules/one-player-sleep.js";
import "./modules/cosmetics.js";
import "./modules/servertools.js";
import "./modules/gameplay.js";
import "./modules/java-combat.js";
import "./modules/builder.js";
import { mainMenu, adminPanel } from "./modules/menu.js";

// /scriptevent essx:menu | essx:admin | essx:cmd <command>  (for command blocks / other addons)
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const p = ev.sourceEntity;
  if (!p || p.typeId !== "minecraft:player") return;
  if (ev.id === "essx:menu") mainMenu(p);
  else if (ev.id === "essx:admin") adminPanel(p);
  else if (ev.id === "essx:cmd") dispatch(p, ev.message);
});

try { system.beforeEvents.shutdown.subscribe(() => { try { flush(); } catch {} }); } catch {}

system.run(() => {
  console.warn("[EssentialsX AIO] Loaded - By Opiar");
  for (const p of online()) if (isAdmin(p)) msg(p, "§aReloaded. " + CREDITS);
});
