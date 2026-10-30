// EssentialsX AIO - By Opiar
import { DB } from "./db.js";

export const VERSION = "1.8.99";
export const CREDITS = "§eEssentialsX AIO §7v" + VERSION + " §f- §bBy Opiar";

export const DEFAULTS = {
  prefix: "!",
  rankTagIcons: true,
  socialRanksVersion: 0, // Set by the one-time social role catalog upgrade.
  serverName: "§l§bEssentials§fX",
  menuName: "EssentialsX Menu",
  messageTag: "EssX",
  currency: "$",
  startingBalance: 500,
  teleportDelay: 3,
  welcomeMessage: "§aWelcome to the server, §e{name}§a! Use §b!menu §aor the §bMenu item§a.",
  firstJoinBroadcast: "§d✦ §e{name} §djoined for the first time! Welcome!",
  joinMessage: "§8[§a+§8] §7{name}",
  leaveMessage: "§8[§c-§8] §7{name}",
  giveMenuItem: true,
  modules: {
    homes: true, warps: true, spawn: true, back: true, tpa: true, rtp: true,
    jobs: true, trade: true, repair: true, enchant: true, duels: true,
    economy: true, shop: true, auction: true, land: true, clans: true, games: true,
    kits: true, daily: true, redeem: true, reports: true, msg: true,
    graves: true, combat: true, chat: true, hud: true, healthbar: true, playerhealth: true,
    nametags: true, clearlag: true, afk: true, regions: true, npc: true,
    artifacts: true, backpack: true, builder: true, holograms: true, announcements: true, quests: true, antispam: true, filter: true,
    veinminer: false, treecapitator: false, login: false, anticheat: true, cosmetics: true,
    lifesteal: false, bounty: false, killstreak: false, antivoid: false, nightvote: false, javaCombat: false, onePlayerSleep: true, celuna: true, scythe: true,
  },
  backpack: { blockInCombat: true, buyPrice: 500, rowPrice: 1000 },
  jobs: { dailyLimit: 10000 },
  duels: { arena: {} },
  lifesteal: { startingHearts: 10, minHearts: 5, maxHearts: 20, transfer: 1, cooldownSec: 300 },
  bounty: { minAmount: 100, maxAmount: 100000, announce: true },
  killstreak: { everyKills: 3, reward: 100, maxReward: 1000, cooldownSec: 300, announce: true },
  antivoid: { margin: 4, cooldownSec: 10, rescuePoints: {} },
  onePlayerSleep: { delaySec: 3, clearWeather: true, announce: true },
  nightvote: { percent: 50, timeoutSec: 120, minPlayers: 1 },
  cosmetics: { rarePrice: 2500, vipPrice: 0, legendPrice: 0, trailTicks: 4 },
  server: {
    maintenance: false, maintenanceMsg: "Server is under maintenance. Please come back later.",
    chatLocked: false, slowModeSec: 0, motd: "",
    rules: ["No hacking or cheating.", "Be respectful to everyone.", "No griefing or stealing."],
  },
  homes: { defaultLimit: 3 },
  playerWarps: { baseSlots: 1, slotPrice: 1000, maxSlots: 10 },
  tpa: { timeout: 60 },
  rtp: { maxRadius: 30, minRadius: 20, origin: "player", cooldown: 300, cost: 0 },
  repair: { price: 100 },
  enchant: { pricePerLevel: 250 },
  economy: { killReward: 10, mobKillReward: 1, payMin: 1 },
  games: { minBet: 10, maxBet: 10000, cooldownSec: 3, coinflip: true, dice: true, slots: true },
  land: { pricePerBlock: 1, maxClaims: 3, maxSize: 101, minSize: 5 },
  clans: { createCost: 1000, maxMembers: 15, friendlyFire: false, inviteSeconds: 300 },
  auction: { maxListings: 5, durationHours: 48, taxPercent: 5 },
  combat: { seconds: 15, killOnLogout: true, blockTeleport: true },
  javaCombat: { cooldownPercent: 100, showIndicator: true, affectPlayers: true, affectMobs: true },
  graves: { protectMinutes: 15, despawnMinutes: 120, defaultStyle: "gravestone", allowPlayerStyles: true },
  clearlag: {
    intervalSec: 600, warnings: [60, 30, 10, 5],
    clearItems: true, clearXp: true, clearArrows: true, clearHostile: false, clearPassive: false,
    clearOtherMobs: false, typeOverrides: {},
    keepNamed: true, maxEntities: 0,
  },
  playerhealth: { style: 0, textOnly: false },
  mobhealth: { style: 0, length: 10, showSeconds: 3, scope: 0, showName: true, showNumber: true, showDamage: true },
  veinminer: { maxBlocks: 64, activation: 0, requireTool: true, useDurability: true, giveXp: true, extraBlocks: [] },
  treecapitator: { maxBlocks: 128, activation: 1, requireAxe: true, useDurability: true, replant: true, instantLeafDecay: false },
  login: {
    timeoutSec: 60, maxAttempts: 5, minPassword: 4, autoLoginMin: 0, adminBypass: false,
    allowChangePassword: true, kickMessage: "You failed to login in time.",
  },
  anticheat: {
    exemptAdmins: true, alertStaff: true, broadcastPunish: true, notifyPlayer: false,
    decaySec: 30, banMinutes: 60, lagGuard: true, detectionVersion: 1,
    checks: {
      spectatorBot: { enabled: true, maxVL: 3, action: 0 },
      killaura: { enabled: true, maxVL: 6, action: 2, angle: 100, multiTargets: 3 },
      hitbox: { enabled: true, maxVL: 8, action: 1, reach: 5, angle: 40 },
      fly: { enabled: true, maxVL: 6, action: 1 },
      speed: { enabled: true, maxVL: 8, action: 1, limit: 1.35 },
      xray: { enabled: true, maxVL: 3, action: 0, minOres: 4, ratio: 12, minVeins: 3, darkLevel: 3 },
      autoclicker: { enabled: true, maxVL: 6, action: 2, maxCps: 12 },
      celunaSwing: { enabled: true, maxVL: 8, action: 0, maxCps: 25 },
      celunaMulti: { enabled: true, maxVL: 8, action: 0, targets: 4 },
      scytheWater: { enabled: true, maxVL: 8, action: 0, samples: 40 },
      scytheJump: { enabled: true, maxVL: 8, action: 0 },
      nuker: { enabled: true, maxVL: 5, action: 1, perSecond: 14, reach: 7.5 },
    },
  },
  chat: {
    format: "{rank} {clan}§f{name} §f{msg}",
    rankBadges: true,
    rankBadgeMode: "icon", // E7 badge + readable rank name for compatible classic chat.
    badgeLayoutVersion: 4,
    cooldownMs: 1200,
    maxCaps: 70,
    filterWords: ["fuck", "shit", "bitch", "putangina", "gago", "tangina"],
  },
  announcements: {
    intervalSec: 300,
    messages: [
      "§bTip: §fType §e!help §ffor all commands.",
      "§bTip: §fClaim land with §e!land claim <size>§f to protect your builds.",
      "§bTip: §fSell items in the §e!ah§f auction house.",
      "§bTip: §fCollect your §e!daily§f reward every day.",
    ],
  },
  daily: { base: 100, streakBonus: 25, maxStreak: 7 },
  afk: { minutes: 5, kick: false, kickMinutes: 30 },
  hud: { title: "§l§bEssentials§fX", sidebar: true, mode: "personal", subtitle: "Your adventure, live", footer: "By Opiar • !menu", icons: true, extraStats: true, background: "default" },
};

function merge(def, cur) {
  if (typeof def !== "object" || def === null || Array.isArray(def)) return cur === undefined ? def : cur;
  const out = {};
  for (const k of Object.keys(def)) out[k] = merge(def[k], cur?.[k]);
  if (cur && typeof cur === "object") for (const k of Object.keys(cur)) if (!(k in out)) out[k] = cur[k];
  return out;
}

let _cfg;
export function cfg() {
  if (!_cfg) {
    const savedModules = DB.config.data.modules;
    const upgradePlayerHealth = savedModules?.playerhealth === undefined;
    const upgradeDetectors = DB.config.data.anticheat?.detectionVersion !== 1;
    _cfg = merge(DEFAULTS, DB.config.data);
    // Split player health from mob health once, preserving existing health/name opt-outs.
    if (upgradePlayerHealth) {
      _cfg.modules.playerhealth = savedModules?.healthbar !== false && savedModules?.nametags !== false;
    }
    // Upgrade the former untouched long-distance preset once; retain custom ranges.
    const savedRtp = DB.config.data.rtp;
    if (savedRtp?.minRadius === 300 && savedRtp?.maxRadius === 5000 && !savedRtp.origin) {
      _cfg.rtp.minRadius = 20;
      _cfg.rtp.maxRadius = 30;
      DB.config.data = _cfg;
    }
    // Update only untouched old detector limits, retaining custom limits and actions.
    if (upgradeDetectors) {
      const checks = _cfg.anticheat.checks;
      if (checks.hitbox.reach === 4.6) checks.hitbox.reach = 5;
      if (checks.speed.limit === 2.6) checks.speed.limit = 1.35;
      if (checks.autoclicker.maxCps === 20) checks.autoclicker.maxCps = 12;
      _cfg.anticheat.detectionVersion = 1;
    }
    // Enable classic badges once after the user-selected renderer change.
    // After this upgrade, preserve later opt-outs using the current layout version.
    if (DB.config.data.chat?.badgeLayoutVersion !== 4) {
      _cfg.chat.rankBadges = true;
      _cfg.chat.rankBadgeMode = "icon";
      _cfg.chat.badgeLayoutVersion = 4;
      DB.config.data = _cfg;
    }
    // Upgrade the untouched built-in layout; preserve every custom format exactly.
    if (_cfg.chat.format === "{clan}{rank} §f{name}§7: §f{msg}") {
      _cfg.chat.format = DEFAULTS.chat.format;
      DB.config.data = _cfg;
    }
    // Persist after the existing upgrades have inspected the original saved settings.
    if (upgradeDetectors || upgradePlayerHealth) DB.config.data = _cfg;
  }
  return _cfg;
}
export function saveCfg() {
  DB.config.data = cfg();
}
export function resetCfg() {
  _cfg = JSON.parse(JSON.stringify(DEFAULTS));
  saveCfg();
}
export function mod(name) {
  return cfg().modules[name] !== false;
}
