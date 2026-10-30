// EssentialsX AIO | OnePlayerSleep: one real, continuously sleeping player skips night.
import { world, system, GameMode } from "@minecraft/server";
import { cfg, mod } from "../core/config.js";
import { registerPlugin } from "../core/plugins.js";
import { isLoggedIn } from "./login.js";

const sleepers = new Map();
const delay = (n) => Math.max(1, Math.min(10, Math.floor(Number(n) || 3)));
let night;
system.runInterval(() => {
  if (!mod("onePlayerSleep")) { sleepers.clear(); night = undefined; return; }
  const time = world.getTimeOfDay();
  const day = world.getDay();
  if (time < 12542 || time >= 23460) { sleepers.clear(); night = undefined; return; }
  if (night !== day) { sleepers.clear(); night = day; }
  const current = new Set();
  for (const p of world.getAllPlayers()) {
    try {
      if (!p.isSleeping || p.dimension.id !== "minecraft:overworld" || !isLoggedIn(p) ||
          ![GameMode.Survival, GameMode.Adventure].includes(p.getGameMode())) continue;
      current.add(p.id);
      if (!sleepers.has(p.id)) sleepers.set(p.id, system.currentTick);
      if (system.currentTick - sleepers.get(p.id) < delay(cfg().onePlayerSleep.delaySec) * 20) continue;
      // Advance to the next day, preserving the world's elapsed-day counter.
      world.setAbsoluteTime(world.getAbsoluteTime() + 24000 - time);
      sleepers.clear(); night = undefined;
      if (cfg().onePlayerSleep.clearWeather) {
        try { world.getDimension("overworld").runCommand("weather clear"); }
        catch (e) { console.warn(`[EssX] OnePlayerSleep could not clear weather: ${e}`); }
      }
      if (cfg().onePlayerSleep.announce) world.sendMessage(`§bOnePlayerSleep §8» §e${p.name} §7slept. §aGood morning!`);
      return;
    } catch { /* A player may disconnect during this interval. */ }
  }
  for (const id of sleepers.keys()) if (!current.has(id)) sleepers.delete(id);
}, 5);
world.afterEvents.playerLeave.subscribe(({ playerId }) => sleepers.delete(playerId));
world.afterEvents.playerDimensionChange.subscribe(({ player }) => sleepers.delete(player.id));
world.afterEvents.playerSpawn.subscribe(({ player }) => sleepers.delete(player.id));

registerPlugin({
  id: "onePlayerSleep", name: "OnePlayerSleep", module: "onePlayerSleep", icon: "textures/ui/essx/icons/moon",
  desc: "One logged-in Survival/Adventure player sleeping in an Overworld bed skips night. Works alongside Night Vote; the first successful skip wins.",
  fields: (c) => [
    { type: "slider", key: "delaySec", label: "Continuous sleep before morning (seconds)", min: 1, max: 10, step: 1, default: c.onePlayerSleep.delaySec },
    { type: "toggle", key: "clearWeather", label: "Clear weather after skipping night", default: c.onePlayerSleep.clearWeather },
    { type: "toggle", key: "announce", label: "Announce who slept", default: c.onePlayerSleep.announce },
  ],
  apply: (c, r) => Object.assign(c.onePlayerSleep, { delaySec: delay(r.delaySec), clearWeather: !!r.clearWeather, announce: !!r.announce }),
});
