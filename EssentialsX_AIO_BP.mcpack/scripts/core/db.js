// EssentialsX AIO - By Opiar
// Persistent JSON storage on world dynamic properties (auto-chunked, cached, debounced saves).
import { world, system } from "@minecraft/server";

const CHUNK = 30000;
const PREFIX = "essx:";
const dirty = new Set();
const cache = new Map();

function readRaw(key) {
  const base = PREFIX + key;
  const count = world.getDynamicProperty(base + ":n");
  if (typeof count !== "number") {
    const single = world.getDynamicProperty(base);
    return typeof single === "string" ? single : undefined;
  }
  let out = "";
  for (let i = 0; i < count; i++) {
    const part = world.getDynamicProperty(base + ":" + i);
    if (typeof part === "string") out += part;
  }
  return out;
}

function writeRaw(key, str) {
  const base = PREFIX + key;
  const old = world.getDynamicProperty(base + ":n");
  const n = Math.max(1, Math.ceil(str.length / CHUNK));
  for (let i = 0; i < n; i++) world.setDynamicProperty(base + ":" + i, str.slice(i * CHUNK, (i + 1) * CHUNK));
  if (typeof old === "number") for (let i = n; i < old; i++) world.setDynamicProperty(base + ":" + i, undefined);
  world.setDynamicProperty(base + ":n", n);
}

export class Table {
  /** @param {string} name @param {any} defaults */
  constructor(name, defaults = {}) {
    this.name = name;
    this.defaults = defaults;
  }
  get data() {
    if (!cache.has(this.name)) {
      let parsed;
      try {
        const raw = readRaw(this.name);
        parsed = raw ? JSON.parse(raw) : undefined;
      } catch (e) {
        parsed = undefined;
      }
      cache.set(this.name, parsed ?? structuredCloneSafe(this.defaults));
    }
    return cache.get(this.name);
  }
  set data(v) {
    cache.set(this.name, v);
    this.save();
  }
  get(k, def) {
    const v = this.data[k];
    return v === undefined ? def : v;
  }
  set(k, v) {
    this.data[k] = v;
    this.save();
  }
  delete(k) {
    delete this.data[k];
    this.save();
  }
  has(k) {
    return Object.prototype.hasOwnProperty.call(this.data, k);
  }
  keys() {
    return Object.keys(this.data);
  }
  values() {
    return Object.values(this.data);
  }
  entries() {
    return Object.entries(this.data);
  }
  save() {
    dirty.add(this);
  }
  clear() {
    this.data = structuredCloneSafe(this.defaults);
  }
}

function structuredCloneSafe(o) {
  return JSON.parse(JSON.stringify(o));
}

export function flush() {
  for (const t of dirty) {
    try {
      writeRaw(t.name, JSON.stringify(cache.get(t.name) ?? {}));
    } catch (e) {
      console.warn("[EssX] save failed " + t.name + ": " + e);
    }
  }
  dirty.clear();
}

system.runInterval(flush, 40);

export const DB = {
  jobs: new Table("jobs", {}), // active job and persistent per-job XP
  jobPlaced: new Table("job_placed", {}), // placed ores excluded from mining payouts
  duelStats: new Table("duel_stats", {}), // wins/losses/draws
  duelReturns: new Table("duel_returns", {}), // interrupted match return positions
  gameplay: new Table("gameplay", {}), // per-player hearts, bounties, streaks and reward cooldowns
  config: new Table("config", {}),
  players: new Table("players", {}), // id -> {name, first, last, playtime}
  eco: new Table("eco", {}),
  homes: new Table("homes", {}),
  warps: new Table("warps", {}),
  ranks: new Table("ranks", {}),
  playerRanks: new Table("playerRanks", {}),
  bans: new Table("bans", {}),
  mutes: new Table("mutes", {}),
  logs: new Table("logs", { list: [] }),
  reports: new Table("reports", { list: [] }),
  shop: new Table("shop", { categories: [] }),
  auction: new Table("auction", { list: [], claims: {} }),
  land: new Table("land", {}),
  regions: new Table("regions", {}),
  clans: new Table("clans", {}),
  kits: new Table("kits", {}),
  kitUse: new Table("kitUse", {}),
  codes: new Table("codes", {}),
  daily: new Table("daily", {}),
  stats: new Table("stats", {}),
  npcs: new Table("npcs", {}),
  holo: new Table("holo", {}),
  graves: new Table("graves", {}),
  graveHistory: new Table("grave_history", {}), // owner id -> last 20 collected/expired grave locations
  pdata: new Table("pdata", {}), // misc per player data
  quests: new Table("quests", {}),
  auth: new Table("auth", {}), // id -> {name, hash, salt, reg, lastLogin, lastSeen}
  developerAuth: new Table("developer_auth", {}), // player id -> {expiresAt}
  blockLocks: new Table("block_locks", {}), // dimension/position -> owner and linked door/chest halves
  anticheat: new Table("anticheat", {}), // id -> {name, total, checks:{}, last}
};
