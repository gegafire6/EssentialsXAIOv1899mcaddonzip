import { actionbar } from "../core/actionbar.js";
// EssentialsX AIO - By Opiar | Land claims, protected regions (lobby protect), combat log, AFK, ClearLag
import { registerPlugin } from "../core/plugins.js";
import { world, system, EntityTypes } from "@minecraft/server";
import { DB } from "../core/db.js";
import { cfg, mod, saveCfg } from "../core/config.js";
import { cmd, addMember, addAdmin, hooks } from "../core/commands.js";
import { msg, ok, err, findPlayer, idByName, nameOf, isAdmin, menu, modal, confirm, pickPlayer, now, fmtTime, log, online, broadcast, tpHooks, cur, sound, cmdRun, dimName, teleport } from "../core/utils.js";
import { charge, addBal } from "./economy.js";
import { isLoggedIn } from "./login.js";
import { scanClearLag, clearLagSummary, clearLagSnapshot, isEssentialType } from "../core/clearlag.js";

const bypassOff = new Set();
const bypass = (p) => isAdmin(p) && !bypassOff.has(p.id);
const INTERACTABLE = /chest|barrel|shulker|furnace|smoker|hopper|dispenser|dropper|door|trapdoor|gate|button|lever|anvil|beacon|brewing|crafter|bed|repeater|comparator|note|jukebox|lectern|campfire|cake|frame|pot|chiseled|vault|composter|daylight|respawn/;

// ================= CORE LOOKUPS =================
function inBox(l, b, dim) {
  if (b.dim !== dim) return false;
  if (l.x < b.x1 || l.x > b.x2 + 0.999 || l.z < b.z1 || l.z > b.z2 + 0.999) return false;
  if (b.y1 !== undefined && (l.y < b.y1 || l.y > b.y2 + 0.999)) return false;
  return true;
}
export function claimAt(l, dim) {
  for (const [id, c] of DB.land.entries()) if (inBox(l, c, dim)) return { id, ...c, ref: c };
  return undefined;
}
export function regionAt(l, dim) {
  let best;
  for (const [id, r] of DB.regions.entries()) if (inBox(l, r, dim) && (!best || (r.priority ?? 0) > (best.priority ?? 0))) best = { id, ...r };
  return best;
}
export function canBuild(p, l, dim) {
  if (bypass(p)) return true;
  if (mod("regions")) { const r = regionAt(l, dim); if (r && r.flags?.build === false) return "§cThis area is protected."; }
  if (mod("land")) { const c = claimAt(l, dim); if (c && c.owner !== p.id && !(c.trusted ?? []).includes(p.id)) return `§cThis land belongs to §e${nameOf(c.owner)}`; }
  return true;
}
export function canInteract(p, l, dim) {
  if (bypass(p)) return true;
  if (mod("regions")) { const r = regionAt(l, dim); if (r && r.flags?.interact === false) return "§cYou can't interact here."; }
  if (mod("land")) { const c = claimAt(l, dim); if (c && c.owner !== p.id && !(c.trusted ?? []).includes(p.id) && !c.flags?.interact) return `§cThis land belongs to §e${nameOf(c.owner)}`; }
  return true;
}
const warnCd = new Map();
function deny(p, reason) {
  system.run(() => { if (now() - (warnCd.get(p.id) ?? 0) > 1500) { warnCd.set(p.id, now()); actionbar(p, reason); } });
}

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  const r = canBuild(ev.player, ev.block.location, ev.block.dimension.id);
  if (r !== true) { ev.cancel = true; deny(ev.player, r); }
});
world.beforeEvents.playerPlaceBlock.subscribe((ev) => {
  const r = canBuild(ev.player, ev.block.location, ev.block.dimension.id);
  if (r !== true) { ev.cancel = true; deny(ev.player, r); }
});
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const t = ev.block.typeId;
  const item = ev.itemStack?.typeId ?? "";
  if (!INTERACTABLE.test(t) && !/bucket|flint|fire_charge|bone_meal|hoe|shovel|axe|egg/.test(item)) return;
  const r = canInteract(ev.player, ev.block.location, ev.block.dimension.id);
  if (r !== true) { ev.cancel = true; if (ev.isFirstEvent) deny(ev.player, r); }
});
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId.startsWith("essx:")) return;
  const r = canInteract(ev.player, ev.target.location, ev.target.dimension.id);
  if (r !== true) { ev.cancel = true; deny(ev.player, r); }
});
world.beforeEvents.explosion.subscribe((ev) => {
  const dim = ev.dimension.id;
  const blocks = ev.getImpactedBlocks();
  const source = ev.source, origin = mod("land") && source?.isValid ? claimAt(source.location, dim) : undefined;
  if (origin && origin.flags?.explosions !== true) { ev.cancel = true; return; }
  const keep = blocks.filter((b) => {
    const c = mod("land") ? claimAt(b.location, dim) : undefined;
    return !(mod("regions") && regionAt(b.location, dim)?.flags?.build === false) && !(c && c.flags?.explosions !== true) && !b.typeId.startsWith("essx:");
  });
  if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
});
world.beforeEvents.entityHurt?.subscribe((ev) => {
  const v = ev.hurtEntity;
  const a = ev.damageSource?.damagingEntity;
  const dim = v.dimension.id;
  if (mod("land") && (ev.damageSource?.cause === "blockExplosion" || ev.damageSource?.cause === "entityExplosion")) {
    const c = claimAt(v.location, dim);
    if (c && c.flags?.explosions !== true) { ev.cancel = true; return; }
  }
  if (v.typeId === "minecraft:player") {
    const r = mod("regions") ? regionAt(v.location, dim) : undefined;
    if (r?.flags?.damage === false) { ev.cancel = true; return; }
    if (a?.typeId === "minecraft:player") {
      if (r && r.flags?.pvp === false) { ev.cancel = true; deny(a, "§cPvP is disabled here."); return; }
      const c = mod("land") ? claimAt(v.location, dim) : undefined;
      if (c && !c.flags?.pvp) { ev.cancel = true; deny(a, "§cPvP is disabled in this claim."); return; }
    }
  } else if (a?.typeId === "minecraft:player" && !bypass(a) && !v.typeId.startsWith("essx:")) {
    // protect animals / armor stands / item frames in claims
    const fam = v.getComponent("minecraft:type_family");
    if (fam?.hasTypeFamily("monster")) return;
    const c = mod("land") ? claimAt(v.location, dim) : undefined;
    if (c && c.owner !== a.id && !(c.trusted ?? []).includes(a.id)) { ev.cancel = true; deny(a, "§cYou can't hurt mobs in this claim."); }
  }
});

// Only new natural monster spawns are removed; loaded and existing entities are untouched.
world.afterEvents.entitySpawn?.subscribe(ev => {
  if (!mod("land") || ev.cause !== "Spawned") return;
  const e = ev.entity;
  try {
    if (!e.isValid || e.typeId.startsWith("essx:") || !e.getComponent("minecraft:type_family")?.hasTypeFamily("monster")) return;
    if (claimAt(e.location, e.dimension.id)?.flags?.mobs === false) e.remove();
  } catch (error) { console.warn("[EssX] Claim mob-spawn check failed: " + error); }
});

// region: remove hostile mobs inside regions with mobs=false
system.runInterval(() => {
  if (!mod("regions")) return;
  for (const [, r] of DB.regions.entries()) {
    if (r.flags?.mobs !== false) continue;
    try {
      const d = world.getDimension(r.dim);
      for (const e of d.getEntities({ families: ["monster"], location: { x: (r.x1 + r.x2) / 2, y: 0, z: (r.z1 + r.z2) / 2 }, maxDistance: Math.max(r.x2 - r.x1, r.z2 - r.z1) })) {
        if (inBox(e.location, r, r.dim)) e.remove();
      }
    } catch {}
  }
}, 40);

// enter / leave messages
const lastArea = new Map();
system.runInterval(() => {
  for (const p of online()) {
    const dim = p.dimension.id;
    const c = mod("land") ? claimAt(p.location, dim) : undefined;
    const r = mod("regions") ? regionAt(p.location, dim) : undefined;
    const key = (c?.id ?? "") + "|" + (r?.id ?? "");
    const prev = lastArea.get(p.id);
    if (prev === key) continue;
    lastArea.set(p.id, key);
    if (prev === undefined) continue;
    if (c && !prev.startsWith(c.id + "|")) actionbar(p, `§aEntering §e${c.name ?? nameOf(c.owner) + "'s land"}${c.flags?.pvp ? " §c[PvP]" : ""}`);
    else if (!c && prev.split("|")[0]) actionbar(p, "§7Leaving claimed land - §2Wilderness");
    if (r && !prev.endsWith("|" + r.id) && r.enter) p.onScreenDisplay.setTitle(" ", { subtitle: r.enter, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 5 });
  }
}, 10);

// ================= LAND CLAIMS =================
function overlaps(a, dim, ignoreId) {
  for (const [id, c] of DB.land.entries()) {
    if (id === ignoreId || c.dim !== dim) continue;
    if (a.x1 <= c.x2 && a.x2 >= c.x1 && a.z1 <= c.z2 && a.z2 >= c.z1) return "§cOverlaps " + nameOf(c.owner) + "'s land.";
  }
  for (const [, r] of DB.regions.entries()) {
    if (r.dim !== dim || r.flags?.claim !== false) continue;
    if (a.x1 <= r.x2 && a.x2 >= r.x1 && a.z1 <= r.z2 && a.z2 >= r.z1) return "§cYou can't claim inside a protected region.";
  }
  return undefined;
}
function myClaims(id) { return DB.land.entries().filter(([, c]) => c.owner === id); }
// Credits are prepaid area blocks, not a new limit on existing claims.
function creditBuckets(p) {
  const buckets = DB.pdata.get(p.id, {}).landCredits;
  return Array.isArray(buckets) ? buckets.filter(b => Number.isSafeInteger(b.count) && b.count > 0 && Number.isSafeInteger(b.unit) && b.unit >= 0) : [];
}
function creditCount(p) { return creditBuckets(p).reduce((sum, b) => sum + b.count, 0); }
function spendCredits(p, amount) {
  let left = amount, paid = 0;
  const buckets = [];
  for (const b of creditBuckets(p)) {
    const used = Math.min(left, b.count); left -= used; paid += used * b.unit;
    if (b.count > used) buckets.push({ count:b.count-used, unit:b.unit });
  }
  return { buckets, used:amount-left, paid };
}
function buyClaimBlocks(p, count) {
  if (!p?.isValid || !isLoggedIn(p) || !mod("land") || !mod("economy")) return err(p, "Log in and enable Land and Economy first.");
  count = Number(count);
  const unit = Number(cfg().land.pricePerBlock);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000000 || creditCount(p) + count > 1000000) return err(p, "Enter 1 to 1,000,000 blocks; your credit cannot exceed 1,000,000.");
  if (!Number.isSafeInteger(unit) || unit < 0 || !Number.isSafeInteger(count * unit)) return err(p, "Ask an admin to set a valid whole-number land price.");
  const cost = count * unit;
  if (!charge(p, cost, "claim blocks")) return;
  const d = DB.pdata.get(p.id, {}), buckets = creditBuckets(p);
  if (buckets.length && buckets[buckets.length - 1].unit === unit) buckets[buckets.length - 1] = { ...buckets[buckets.length - 1], count:buckets[buckets.length - 1].count+count };
  else buckets.push({ count, unit });
  d.landCredits = buckets; DB.pdata.set(p.id, d);
  ok(p, `Bought ${count} prepaid claim blocks for ${cur(cost)}. Total: ${creditCount(p)}.`);
}
function claim(p, size, chunk = false) {
  if (!p?.isValid || !isLoggedIn(p) || !mod("land")) return err(p, "Log in and enable Land first.");
  const c = cfg().land;
  size = Math.floor(size);
  if (!size || size < c.minSize || size > c.maxSize) return err(p, `Size must be ${c.minSize}-${c.maxSize}.`);
  if (myClaims(p.id).length >= c.maxClaims && !isAdmin(p)) return err(p, `Claim limit reached (${c.maxClaims}).`);
  const half = Math.floor(size / 2);
  const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
  const x1 = chunk ? Math.floor(x / 16) * 16 : x - half, z1 = chunk ? Math.floor(z / 16) * 16 : z - half;
  const box = { x1, x2:x1 + size - 1, z1, z2:z1 + size - 1 };
  const o = overlaps(box, p.dimension.id);
  if (o) return err(p, o);
  const blocks = size * size, credit = isAdmin(p) ? { buckets:creditBuckets(p), used:0, paid:0 } : spendCredits(p, blocks);
  const cash = (blocks - credit.used) * c.pricePerBlock, price = cash + credit.paid;
  if (!isAdmin(p) && !charge(p, cash, "this claim")) return;
  if (credit.used) { const d=DB.pdata.get(p.id, {}); d.landCredits=credit.buckets; DB.pdata.set(p.id, d); }
  let id = "L" + now().toString(36), suffix = 0;
  while (DB.land.has(id)) id = "L" + now().toString(36) + "_" + (++suffix);
  DB.land.set(id, { owner:p.id, dim:p.dimension.id, ...box, name:p.name + "'s Land", trusted:[], flags:{pvp:false, interact:false}, created:now(), price });
  ok(p, `Claimed §e${size}x${size}§a. Paid §e${cur(cash)}§a now; used ${credit.used} prepaid blocks.`);
  log("land", `${p.name} claimed ${size}x${size} at ${x},${z}`);
  showBorder(p, DB.land.get(id));
}
function showBorder(p, c) {
  let n = 0;
  const y = p.location.y + 1;
  const h = system.runInterval(() => {
    if (++n > 15 || !p.isValid) return system.clearRun(h);
    const step = Math.max(1, Math.floor((c.x2 - c.x1) / 24));
    for (let x = c.x1; x <= c.x2 + 1; x += step) { spark(p, x, y, c.z1); spark(p, x, y, c.z2 + 1); }
    for (let z = c.z1; z <= c.z2 + 1; z += step) { spark(p, c.x1, y, z); spark(p, c.x2 + 1, y, z); }
  }, 10);
}
function spark(p, x, y, z) { try { p.dimension.spawnParticle("minecraft:villager_happy", { x, y, z }); } catch {} }

function ownedClaim(p, id) {
  const c = DB.land.get(id);
  if (!p?.isValid || !isLoggedIn(p) || !mod("land") || !c || (c.owner !== p.id && !isAdmin(p))) { err(p, "Claim is unavailable or you no longer have permission."); return undefined; }
  return c;
}
function unclaim(p, id) {
  const c = ownedClaim(p, id); if (!c) return;
  addBal(c.owner, Math.floor((c.price ?? 0) / 2)); DB.land.delete(id);
  ok(p, "Unclaimed (50% refunded)."); log("land", p.name + " unclaimed " + c.name);
}
function teleportToClaim(p, id) {
  const access = () => {
    const c = DB.land.get(id);
    if (!p?.isValid || !isLoggedIn(p) || !mod("land") || !c || (c.owner !== p.id && !(c.trusted ?? []).includes(p.id) && !isAdmin(p))) return "Claim is unavailable or you no longer have access.";
  };
  const reason = access(); if (reason) return err(p, reason);
  const c = DB.land.get(id), x = Math.floor((c.x1+c.x2)/2), z = Math.floor((c.z1+c.z2)/2);
  return teleport(p, {x:x+0.5,y:0,z:z+0.5,dim:c.dim}, c.name, {
    validate:access,
    prepare:() => {
      const invalid = access(); if (invalid) throw Error(invalid);
      const live = DB.land.get(id), dim = world.getDimension(live.dim);
      const ground = dim.getTopmostBlock({x,z});
      if (!ground?.isSolid || ground.isLiquid || /lava|magma|cactus|campfire|fire|berry|powder_snow/.test(ground.typeId)) throw Error("No safe loaded ground in this claim.");
      const y = ground.location.y+1, feet=dim.getBlock({x,y,z}), head=dim.getBlock({x,y:y+1,z});
      if (!feet?.isAir || !head?.isAir || canBuild(p,{x:x+0.5,y,z:z+0.5},live.dim)!==true) throw Error("Claim destination is blocked or protected.");
      return {location:{x:x+0.5,y,z:z+0.5,dim:live.dim}};
    },
  });
}
async function claimManage(p, id) {
  if (!p?.isValid || !isLoggedIn(p) || !mod("land")) return err(p, "Log in and enable Land first.");
  const c = DB.land.get(id); if (!c) return err(p, "Claim not found.");
  const own = c.owner === p.id || isAdmin(p), canVisit = own || (c.trusted ?? []).includes(p.id);
  const date = new Date(c.created), created = Number.isFinite(c.created) && Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10) : "Unknown";
  await menu(p, "§l" + c.name, `§fOwner: §e${nameOf(c.owner)}\n§fClaimed: §7${created}\n§fArea: §7${c.x1},${c.z1} -> ${c.x2},${c.z2} (${dimName(c.dim)})\n§fSize: §e${c.x2-c.x1+1}x${c.z2-c.z1+1}\n§fTrusted: §7${(c.trusted ?? []).map(nameOf).join(", ") || "none"}\n§fPvP: ${c.flags?.pvp ? "§aON" : "§cOFF"} §f| Public interact: ${c.flags?.interact ? "§aON" : "§cOFF"}\n§fExplosions: ${c.flags?.explosions ? "§aON" : "§cOFF"} §f| Natural monster spawns: ${c.flags?.mobs === false ? "§cOFF" : "§aON"}`, [
    { text:"§l§bShow Border", icon:"textures/items/blaze_powder", run:()=>showBorder(p,c) },
    ...(canVisit ? [{text:"§l§aTeleport",icon:"textures/ui/essx/icons/teleport",run:()=>teleportToClaim(p,id)}] : []),
    ...(own ? [
      { text:"§l§eTrust Player", icon:"textures/ui/essx/icons/add", run:async()=>{ const t=await pickPlayer(p,"§lTrust"), live=ownedClaim(p,id); if(t && live && t.isValid) {live.trusted=[...new Set([...(live.trusted ?? []),t.id])];DB.land.save();ok(p,"Trusted "+t.name);msg(t,"§aYou were trusted in "+live.name);} } },
      { text:"§l§6Untrust Player", icon:"textures/ui/essx/icons/logout", run:async()=>{const live=ownedClaim(p,id);if(!live)return;const b=await menu(p,"§lUntrust","",(live.trusted ?? []).map(tid=>({icon:"textures/ui/essx/icons/account",text:nameOf(tid),tid})));const current=ownedClaim(p,id);if(b && current) {current.trusted=(current.trusted??[]).filter(x=>x!==b.tid);DB.land.save();ok(p,"Untrusted.");}} },
      { text:"§l§dSettings\n§r§8Name, PvP, explosions, mobs, interact", icon:"textures/ui/essx/icons/settings", run:async()=>{
        const live=ownedClaim(p,id);if(!live)return;
        const r=await modal(p,"§lClaim Settings",[{type:"text",key:"n",label:"Claim name",default:live.name},{type:"toggle",key:"pvp",label:"Allow PvP",default:!!live.flags?.pvp},{type:"toggle",key:"int",label:"Public can use doors and containers",default:!!live.flags?.interact},{type:"toggle",key:"explosions",label:"Allow explosions",default:!!live.flags?.explosions},{type:"toggle",key:"mobs",label:"Allow natural monster spawns",default:live.flags?.mobs!==false}]);
        const current=ownedClaim(p,id);if(r && current){current.name=r.n||current.name;current.flags={...current.flags,pvp:r.pvp,interact:r.int,explosions:r.explosions,mobs:r.mobs};DB.land.save();ok(p,"Saved.");}
      } },
      { text:"§l§9Transfer Ownership", icon:"textures/ui/essx/icons/move", run:async()=>{const t=await pickPlayer(p,"§lTransfer to");if(!t||!await confirm(p,"Transfer","Give this land to "+t.name+"?"))return;const live=ownedClaim(p,id);if(!live||!t.isValid)return;if(!isAdmin(t)&&myClaims(t.id).length>=cfg().land.maxClaims)return err(p,"Recipient has reached their claim limit.");live.owner=t.id;DB.land.save();ok(p,"Transferred.");msg(t,"§aYou received land from "+p.name);} },
      { text:"§l§cUnclaim\n§r§8Refund 50%", icon:"textures/ui/essx/icons/delete", run:async()=>{if(await confirm(p,"Unclaim","Delete this claim? You get 50% refund."))unclaim(p,id);} },
    ] : []),
  ]);
}
async function landUI(p) {
  if (!p?.isValid || !isLoggedIn(p) || !mod("land")) return err(p, "Log in and enable Land first.");
  const c=cfg().land, here=claimAt(p.location,p.dimension.id), mine=myClaims(p.id), credits=creditCount(p);
  await menu(p,"§lLand Claims",`§7Claims: §e${mine.length}/${c.maxClaims} §7(${Math.max(0,c.maxClaims-mine.length)} available)\n§7Prepaid claim blocks: §e${credits}\n§7Price: §a${cur(c.pricePerBlock)}§7 per block\n§7Here: ${here?"§e"+here.name:"§2Wilderness"}`, [
    {text:"§l§aClaim Area Here\n§r§8Choose size",icon:"textures/items/gold_ingot",run:async()=>{const r=await modal(p,"§lClaim Land",[{type:"slider",key:"s",label:"Size (blocks per side)",min:c.minSize,max:c.maxSize,default:Math.min(c.maxSize,21)},{type:"label",label:"§7Prepaid blocks are used before the remaining cost."}]);if(r)claim(p,r.s);}},
    {text:"§l§aClaim Current Chunk\n§r§816x16",icon:"textures/blocks/grass_side_carried",run:()=>claim(p,16,true)},
    ...(here ? [{text:"§l§eClaim Info\n§r§8"+here.name,icon:"textures/items/map_filled",run:()=>claimManage(p,here.id)}] : []),
    ...(here && (here.owner===p.id||isAdmin(p)) ? [{text:"§l§cUnclaim Here\n§r§8Refund 50%",icon:"textures/ui/essx/icons/delete",run:async()=>{if(await confirm(p,"Unclaim","Delete this claim? You get 50% refund.")){if(claimAt(p.location,p.dimension.id)?.id!==here.id)return err(p,"You are no longer in that claim.");unclaim(p,here.id);}}}] : []),
    {text:"§l§bMy Claim List\n§r§8"+mine.length+" claims",icon:"textures/ui/essx/icons/land",run:()=>menu(p,"§lMy Claims","§7Select a claim to manage or teleport.",myClaims(p.id).map(([id,cl])=>({text:`§l${cl.name}\n§r§8${cl.x1},${cl.z1} (${dimName(cl.dim)})`,icon:"textures/blocks/grass_side_carried",run:()=>claimManage(p,id)})))},
    {text:"§l§6Buy Claim Blocks\n§r§8Prepay area blocks",icon:"textures/ui/essx/icons/coinflip",run:async()=>{const r=await modal(p,"§lBuy Claim Blocks",[{type:"label",label:`§7Price per block: ${cur(cfg().land.pricePerBlock)}. Prepaid blocks cover claim cost; claim count limit remains.`},{type:"text",key:"amount",label:"Number of blocks",placeholder:"256"}]);if(r)buyClaimBlocks(p,r.amount);}},
    {text:"§l§7Trusted Lands",icon:"textures/ui/essx/icons/clan",run:()=>menu(p,"§lTrusted Lands","",DB.land.entries().filter(([,x])=>(x.trusted??[]).includes(p.id)).map(([id,x])=>({icon:"textures/ui/essx/icons/land",text:x.name,run:()=>claimManage(p,id)})))},
  ]);
}
cmd({name:"land",aliases:["claim","claims","plot"],module:"land",desc:"Land claim menu",usage:"[claim <size>|chunk|unclaim|info|trust <p>|untrust <p>|show|buy <blocks>]",run:async(p,a)=>{
  const op=(a[0]??"").toLowerCase(),here=claimAt(p.location,p.dimension.id);
  if(!op)return landUI(p);
  if(op==="claim")return claim(p,+a[1]||21);
  if(op==="chunk")return claim(p,16,true);
  if(op==="buy")return buyClaimBlocks(p,a[1]);
  if(op==="info")return here?claimManage(p,here.id):msg(p,"§2Wilderness - unclaimed.");
  if(op==="show")return here?showBorder(p,here):err(p,"Not in a claim.");
  if(!here)return err(p,"Stand in your own claim.");
  if(!ownedClaim(p,here.id))return;
  if(op==="unclaim")return unclaim(p,here.id);
  const t=findPlayer(a[1]);if(!t)return err(p,"Player not found.");
  if(op==="trust"){here.ref.trusted=[...new Set([...(here.ref.trusted??[]),t.id])];DB.land.save();return ok(p,"Trusted "+t.name);}
  if(op==="untrust"){here.ref.trusted=(here.ref.trusted??[]).filter(x=>x!==t.id);DB.land.save();return ok(p,"Untrusted "+t.name);}
  err(p,"Unknown subcommand.");
}});
addMember({ text: "§l§2Land Claims\n§r§8Protect your builds", icon: "textures/ui/essx/icons/land", module: "land", run: landUI });
addAdmin({ text: "§l§2All Land Claims\n§r§8View / delete claims", icon: "textures/ui/essx/icons/land", module: "land", run: (p) => menu(p, "§lAll Claims", `§7${DB.land.keys().length} claims`, DB.land.entries().map(([id, c]) => ({ icon: "textures/ui/essx/icons/land", text: `§l${c.name}\n§r§8${nameOf(c.owner)} | ${c.x1},${c.z1}`, run: () => claimManage(p, id) }))) });

// ================= PROTECTED REGIONS (Lobby Protect) =================
const sel = new Map(); // id -> {p1,p2,dim}
function regionFlagsForm(r) {
  const f = r.flags ?? {};
  return [
    { type: "text", key: "name", label: "Region ID", default: r.id ?? "" },
    { type: "text", key: "enter", label: "Enter message (subtitle)", default: r.enter ?? "" },
    { type: "slider", key: "prio", label: "Priority", min: 0, max: 10, default: r.priority ?? 0 },
    { type: "toggle", key: "build", label: "Allow build / break", default: f.build ?? false },
    { type: "toggle", key: "interact", label: "Allow interact (doors, chests)", default: f.interact ?? false },
    { type: "toggle", key: "pvp", label: "Allow PvP", default: f.pvp ?? false },
    { type: "toggle", key: "damage", label: "Allow player damage (fall, mobs)", default: f.damage ?? false },
    { type: "toggle", key: "mobs", label: "Allow hostile mobs", default: f.mobs ?? false },
    { type: "toggle", key: "claim", label: "Allow land claims", default: f.claim ?? false },
    { type: "toggle", key: "fullY", label: "Full height (ignore Y)", default: r.y1 === undefined },
  ];
}
async function createRegion(p, preset) {
  const s = sel.get(p.id);
  let box;
  if (preset === "radius") {
    const r = await modal(p, "§lRegion Around Me", [{ type: "slider", key: "r", label: "Radius", min: 5, max: 300, default: 50 }]);
    if (!r) return;
    const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
    box = { x1: x - r.r, x2: x + r.r, z1: z - r.r, z2: z + r.r, y1: -64, y2: 320, dim: p.dimension.id };
  } else {
    if (!s?.p1 || !s?.p2) return err(p, "Set §e!pos1§c and §e!pos2§c first (or use radius).");
    box = { x1: Math.min(s.p1.x, s.p2.x), x2: Math.max(s.p1.x, s.p2.x), y1: Math.min(s.p1.y, s.p2.y), y2: Math.max(s.p1.y, s.p2.y), z1: Math.min(s.p1.z, s.p2.z), z2: Math.max(s.p1.z, s.p2.z), dim: s.dim };
  }
  const f = await modal(p, "§lNew Region", regionFlagsForm({ id: preset === "lobby" ? "lobby" : "" }));
  if (!f || !f.name) return;
  const id = String(f.name).toLowerCase().replace(/\s+/g, "_");
  if (f.fullY) { delete box.y1; delete box.y2; }
  DB.regions.set(id, { ...box, enter: f.enter, priority: f.prio, flags: { build: f.build, interact: f.interact, pvp: f.pvp, damage: f.damage, mobs: f.mobs, claim: f.claim } });
  ok(p, "Region §e" + id + "§a created.");
  log("admin", p.name + " created region " + id);
}
async function editRegion(p, id) {
  const r = DB.regions.get(id);
  await menu(p, "§lRegion: " + id, `§7${r.x1},${r.y1 ?? "-"},${r.z1} -> ${r.x2},${r.y2 ?? "-"},${r.z2}\n§7Flags: ${Object.entries(r.flags ?? {}).map(([k, v]) => (v ? "§a" : "§c") + k).join(" ")}`, [
    { text: "§l§eEdit Flags", icon: "textures/ui/essx/icons/settings", run: async () => { const f = await modal(p, "§lEdit " + id, regionFlagsForm({ id, ...r })); if (!f) return; r.enter = f.enter; r.priority = f.prio; r.flags = { build: f.build, interact: f.interact, pvp: f.pvp, damage: f.damage, mobs: f.mobs, claim: f.claim }; DB.regions.save(); ok(p, "Saved."); } },
    { text: "§l§bTeleport", icon: "textures/ui/essx/icons/teleport", run: () => p.teleport({ x: (r.x1 + r.x2) / 2, y: r.y2 !== undefined ? (r.y1 + r.y2) / 2 : p.location.y, z: (r.z1 + r.z2) / 2 }, { dimension: world.getDimension(r.dim) }) },
    { text: "§l§cDelete", icon: "textures/ui/essx/icons/delete", run: async () => { if (await confirm(p, "Delete", "Delete region " + id + "?")) { DB.regions.delete(id); ok(p, "Deleted."); } } },
  ]);
}
async function regionsUI(p) {
  const s = sel.get(p.id);
  await menu(p, "§lProtected Regions", `§7Pos1: ${s?.p1 ? `${s.p1.x},${s.p1.y},${s.p1.z}` : "-"}\n§7Pos2: ${s?.p2 ? `${s.p2.x},${s.p2.y},${s.p2.z}` : "-"}\n§7Bypass: ${bypassOff.has(p.id) ? "§cOFF" : "§aON"}`, [
    { text: "§l§aSet Pos1 Here", icon: "textures/ui/essx/icons/land", run: () => setPos(p, 1) },
    { text: "§l§aSet Pos2 Here", icon: "textures/ui/essx/icons/land", run: () => setPos(p, 2) },
    { text: "§l§eCreate From Selection", icon: "textures/ui/essx/icons/add", run: () => createRegion(p) },
    { text: "§l§6Create Around Me\n§r§8Radius-based", icon: "textures/ui/essx/icons/land", run: () => createRegion(p, "radius") },
    { text: "§l§dLobby Protect\n§r§8Quick spawn region", icon: "textures/ui/essx/icons/shield", run: () => createRegion(p, "radius") },
    { text: "§l§7Toggle Admin Bypass", icon: "textures/ui/essx/icons/shield", run: () => { if (bypassOff.has(p.id)) bypassOff.delete(p.id); else bypassOff.add(p.id); ok(p, "Bypass " + (bypassOff.has(p.id) ? "OFF" : "ON")); } },
    ...DB.regions.keys().map((id) => ({ text: "§l" + id, icon: "textures/blocks/barrier", run: () => editRegion(p, id) })),
  ]);
}
function setPos(p, n) {
  const s = sel.get(p.id) ?? {};
  const l = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  s["p" + n] = l; s.dim = p.dimension.id; sel.set(p.id, s);
  ok(p, `Pos${n} set to ${l.x}, ${l.y}, ${l.z}`);
}
cmd({ name: "pos1", admin: true, module: "regions", desc: "Region selection pos1", run: (p) => setPos(p, 1) });
cmd({ name: "pos2", admin: true, module: "regions", desc: "Region selection pos2", run: (p) => setPos(p, 2) });
cmd({ name: "region", aliases: ["rg"], admin: true, module: "regions", desc: "Protected regions", run: regionsUI });
cmd({ name: "bypass", admin: true, desc: "Toggle protection bypass", run: (p) => { if (bypassOff.has(p.id)) bypassOff.delete(p.id); else bypassOff.add(p.id); ok(p, "Bypass " + (bypassOff.has(p.id) ? "OFF" : "ON")); } });
addAdmin({ text: "§l§4Protected Regions\n§r§8Lobby protect & flags", icon: "textures/ui/essx/icons/shield", module: "regions", run: regionsUI });

// ================= COMBAT LOG =================
const combat = new Map(); // id -> expire ms
export const inCombat = (p) => (combat.get(p.id) ?? 0) > now();
world.afterEvents.entityHurt.subscribe((ev) => {
  if (!mod("combat")) return;
  const v = ev.hurtEntity, a = ev.damageSource?.damagingEntity;
  if (v.typeId !== "minecraft:player" || a?.typeId !== "minecraft:player" || v.id === a.id) return;
  const t = now() + cfg().combat.seconds * 1000;
  for (const x of [v, a]) { if (!inCombat(x)) x.sendMessage("§c⚔ You are in combat! Don't log out."); combat.set(x.id, t); }
});
world.afterEvents.entityDie.subscribe((ev) => { if (ev.deadEntity.typeId === "minecraft:player") combat.delete(ev.deadEntity.id); });
system.runInterval(() => {
  for (const p of online()) {
    const e = combat.get(p.id);
    if (!e) continue;
    if (e < now()) { combat.delete(p.id); actionbar(p, "§aYou are no longer in combat."); }
    else actionbar(p, `§c⚔ Combat: §f${Math.ceil((e - now()) / 1000)}s`);
  }
}, 20);
tpHooks.canTeleport.push((p) => (mod("combat") && cfg().combat.blockTeleport && inCombat(p) && !isAdmin(p) ? "You can't teleport while in combat." : undefined));
hooks.beforeCommand.push((p, c) => (mod("combat") && inCombat(p) && !isAdmin(p) && ["spawn", "home", "warp", "tpa", "rtp", "back", "tpaccept"].includes(c.name) && cfg().combat.blockTeleport ? "Not while in combat." : undefined));
world.afterEvents.playerLeave.subscribe((ev) => {
  const p = ev.player;
  if (!mod("combat") || !inCombat(p) || !cfg().combat.killOnLogout) return;
  const id = p.id, name = p.name;
  system.run(() => {
    combat.delete(id);
    const d = DB.pdata.get(id, {}); d.combatLogged = true; DB.pdata.set(id, d);
    broadcast(`§c${name} logged out during combat and will be punished!`);
    log("death", name + " combat logged");
  });
});
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const d = DB.pdata.get(ev.player.id);
  if (d?.combatLogged) { d.combatLogged = false; DB.pdata.save(); system.runTimeout(() => { try { ev.player.kill(); err(ev.player, "You were killed for combat logging."); } catch {} }, 40); }
});

// ================= AFK =================
const afk = new Map(); // id -> {since, lastLoc, isAfk}
system.runInterval(() => {
  if (!mod("afk")) return;
  const c = cfg().afk;
  for (const p of online()) {
    const a = afk.get(p.id) ?? { since: now(), last: "" };
    const r = p.getRotation();
    const key = `${Math.floor(p.location.x)},${Math.floor(p.location.z)},${Math.floor(r.y / 10)}`;
    if (key !== a.last) {
      if (a.isAfk) broadcast(`§7${p.name} is no longer AFK.`);
      a.since = now(); a.last = key; a.isAfk = false;
    } else if (!a.isAfk && now() - a.since > c.minutes * 60000) { a.isAfk = true; broadcast(`§7${p.name} is now AFK.`); }
    if (a.isAfk && c.kick && now() - a.since > c.kickMinutes * 60000 && !isAdmin(p)) cmdRun(`kick "${p.name}" AFK for too long`);
    afk.set(p.id, a);
  }
}, 100);
export const isAfk = (p) => afk.get(p.id)?.isAfk === true;
cmd({ name: "afk", module: "afk", desc: "Toggle AFK", run: (p) => { const a = afk.get(p.id) ?? {}; a.isAfk = !a.isAfk; a.since = a.isAfk ? 0 : now(); afk.set(p.id, a); broadcast(`§7${p.name} is ${a.isAfk ? "now" : "no longer"} AFK.`); } });

// ================= CLEARLAG / ENTITY MANAGER =================
const cleanSnapshot = () => scanClearLag(world);
function reportClear(result, reason, player) {
  const kept = result.protected + result.named + result.unselected;
  const detail = `Removed ${result.removed}/${result.eligible} eligible entities. Kept ${kept} (${result.named} named, ${result.protected} protected, ${result.unselected} not selected). Failed ${result.failed}.`;
  const incomplete = result.unavailableDimensions.length ? ` Could not scan: ${result.unavailableDimensions.join(", ")}.` : "";
  const invalid = result.invalid ? ` Unreadable/unloaded: ${result.invalid}.` : "";
  if (player) msg(player, "§aClearLag §7" + detail + incomplete + invalid);
  else broadcast(`§a✔ ClearLag §7(${reason}) ${detail}${incomplete}${invalid}`);
  log("clearlag", `${reason}: ${detail}${incomplete}${invalid}`);
}
/** Clear configured targets; preserve the public number-of-removed-entities return contract. */
export function runClearLag(reason = "auto") {
  const result = clearLagSnapshot(cleanSnapshot(), cfg().clearlag);
  reportClear(result, reason);
  return result.removed;
}
function clearScope(p, scope) {
  const result = clearLagSnapshot(cleanSnapshot(), cfg().clearlag, scope);
  reportClear(result, "manual " + scope + ": " + p.name, p);
}
let lagT = 0;
system.runInterval(() => {
  if (!mod("clearlag")) return;
  const c = cfg().clearlag;
  lagT++;
  const left = c.intervalSec - lagT;
  if (c.warnings.includes(left)) broadcast(`§e⚠ ClearLag will remove selected entities in §c${left}s§e!`);
  if (left <= 0) { lagT = 0; runClearLag("timer"); }
}, 20);
let limitCd = 0;
system.runInterval(() => {
  if (!mod("clearlag")) return;
  const max = cfg().clearlag.maxEntities;
  if (!max || limitCd > 0) { limitCd = Math.max(0, limitCd - 1); return; }
  const total = cleanSnapshot().entities.length;
  if (total > max) { limitCd = 3; broadcast(`§e⚠ Loaded entity limit reached (§c${total}§e/${max}).`); runClearLag("entity limit"); }
}, 200);
const typeLabel = (id) => id.replace(/^minecraft:/, "").replace(/_/g, " ");
const typeMode = (settings, id) => Object.hasOwn(settings.typeOverrides ?? {}, id)
  ? settings.typeOverrides[id] === true ? 1 : settings.typeOverrides[id] === false ? 2 : 0 : 0;
async function entityTypesUI(p) {
  let search = "", page = 0;
  while (true) {
    const snapshot = cleanSnapshot(), c = cfg().clearlag;
    let registered = [];
    try { registered = EntityTypes.getAll().map((type) => type.id); } catch {}
    const ids = [...new Set([...registered, ...snapshot.entities.map((e) => e.typeId), ...Object.keys(c.typeOverrides ?? {})])]
      .filter((id) => !isEssentialType(id) && id.toLowerCase().includes(search)).sort();
    const pages = Math.max(1, Math.ceil(ids.length / 10)); page = Math.max(0, Math.min(page, pages - 1));
    const shown = ids.slice(page * 10, page * 10 + 10);
    const loaded = new Map();
    for (const entry of snapshot.entities) loaded.set(entry.typeId, (loaded.get(entry.typeId) ?? 0) + 1);
    const b = await menu(p, "§lClearLag Mob / Entity Types", `§7Default = group switches; Clear = include this type; Keep = exclude it.\n§7Named protection still applies. Players, NPCs and EssentialsX entities stay protected.\n§7Loaded entities only.\n§7Page ${page + 1}/${pages}${search ? " | Search: " + search : ""}`, [
      { text: "§l§bSearch Type", icon: "textures/ui/essx/icons/search", action: "search" },
      ...(search ? [{ text: "§lClear Search", icon: "textures/ui/essx/icons/close", action: "reset" }] : []),
      ...(shown.length ? [{ text: "§l§eConfigure This Page", icon: "textures/ui/essx/icons/settings", action: "edit" }] : []),
      ...shown.map((id) => ({ text: `§l${typeLabel(id)}\n§r${["§7Default", "§aClear", "§cKeep"][typeMode(c, id)]} §8| loaded: ${loaded.get(id) ?? 0}`,
        icon: "textures/items/bone", typeId: id })),
      ...(page > 0 ? [{ text: "§lPrevious", icon: "textures/ui/essx/icons/back", action: "previous" }] : []),
      ...(page < pages - 1 ? [{ text: "§lNext", icon: "textures/ui/essx/icons/next", action: "next" }] : []),
      { text: "§lBack", icon: "textures/ui/essx/icons/back" },
    ]);
    if (!b || (!b.action && !b.typeId)) return;
    if (b.action === "next") { page++; continue; }
    if (b.action === "previous") { page--; continue; }
    if (b.action === "reset") { search = ""; page = 0; continue; }
    if (b.action === "search") {
      const r = await modal(p, "Search Mob / Entity Type", [{ type: "text", key: "search", label: "Type ID (e.g. zombie, cow or addon:mob)", default: search }]);
      if (r) { search = String(r.search ?? "").trim().toLowerCase(); page = 0; }
      continue;
    }
    const edit = b.typeId ? [b.typeId] : shown;
    const r = await modal(p, "ClearLag Type Selection", [
      { type: "label", label: "Default follows group switches. Clear includes this type. Keep always excludes it. Keep named still applies." },
      ...edit.map((id, index) => ({ type: "dropdown", key: "t" + index, label: typeLabel(id) + "\n" + id,
        options: ["Default (group switches)", "Clear this type", "Keep this type"], default: typeMode(cfg().clearlag, id) })),
    ], "Save");
    if (!r) continue;
    const overrides = { ...(cfg().clearlag.typeOverrides ?? {}) };
    edit.forEach((id, index) => { const value = r["t" + index]; if (value === 1) overrides[id] = true; else if (value === 2) overrides[id] = false; else if (value === 0) delete overrides[id]; });
    cfg().clearlag.typeOverrides = overrides; saveCfg(); ok(p, "ClearLag type selection saved.");
  }
}
async function entityUI(p) {
  const snapshot = cleanSnapshot(), s = clearLagSummary(snapshot, cfg().clearlag);
  const body = `§7Loaded non-player entities: §e${s.loaded}\n§7Eligible with current settings: §a${s.eligible}\n§7Kept: §e${s.named} named §7/ §e${s.protected} protected §7/ §e${s.unselected} not selected\n§7Next auto clear: §e${Math.max(0, cfg().clearlag.intervalSec - lagT)}s\n§7Only loaded chunks can be scanned.${s.unavailableDimensions.length ? "\n§cUnavailable: " + s.unavailableDimensions.join(", ") : ""}${s.invalid ? "\n§cUnreadable/unloaded: " + s.invalid : ""}`;
  await menu(p, "§lEntity / ClearLag Manager", body, [
    { text: "§l§aClear Now\n§r§8Use plugin settings", icon: "textures/ui/essx/icons/delete", run: () => runClearLag("manual: " + p.name) },
    { text: "§l§bConfigure Mob / Entity Types", icon: "textures/ui/essx/icons/settings", run: () => entityTypesUI(p) },
    { text: "§l§eClear Ground Items", icon: "textures/items/rotten_flesh", run: () => clearScope(p, "items") },
    { text: "§l§cClear Hostile Mobs", icon: "textures/items/bone", run: () => clearScope(p, "hostile") },
    { text: "§l§6Clear Passive Animals", icon: "textures/items/egg", run: async () => { if (await confirm(p, "Confirm", "Remove passive animals? Named protection and per-type Keep still apply.")) clearScope(p, "passive"); } },
    { text: "§l§7Clear XP & Arrows", icon: "textures/ui/essx/icons/delete", run: () => clearScope(p, "projectiles") },
    { text: "§l§bClear Minecarts & Boats", icon: "textures/ui/essx/icons/delete", run: () => clearScope(p, "vehicles") },
  ]);
}
cmd({ name: "clearlag", aliases: ["lag", "cl"], admin: true, desc: "Entity manager / clear selected entities", usage: "[now]", run: (p, a) => (a[0] === "now" ? runClearLag("manual: " + p.name) : entityUI(p)) });
addAdmin({ text: "§l§6ClearLag & Entities\n§r§8Clean up lag", icon: "textures/ui/essx/icons/delete", run: entityUI });
registerPlugin({
  id: "clearlag", name: "ClearLag", module: "clearlag", icon: "textures/ui/essx/icons/delete",
  desc: "Configure cleanup groups and individual mob/entity types.",
  fields: (c) => [
    { type: "slider", key: "intervalSec", label: "Auto clear interval (seconds)", min: 60, max: 3600, step: 30, default: Math.min(3600, c.clearlag.intervalSec) },
    { type: "slider", key: "maxEntities", label: "Loaded entity limit (0 = off)", min: 0, max: 1000, step: 25, default: Math.min(1000, c.clearlag.maxEntities) },
    { type: "toggle", key: "clearItems", label: "Clear dropped items", default: c.clearlag.clearItems },
    { type: "toggle", key: "clearXp", label: "Clear XP orbs", default: c.clearlag.clearXp },
    { type: "toggle", key: "clearArrows", label: "Clear arrows", default: c.clearlag.clearArrows },
    { type: "toggle", key: "clearHostile", label: "Clear hostile mobs", default: c.clearlag.clearHostile },
    { type: "toggle", key: "clearPassive", label: "Clear passive animals", default: c.clearlag.clearPassive },
    { type: "toggle", key: "clearOtherMobs", label: "Clear other mobs (e.g. villagers / golems)", default: c.clearlag.clearOtherMobs },
    { type: "toggle", key: "keepNamed", label: "Keep custom-named entities (healthbar labels do not count)", default: c.clearlag.keepNamed },
  ],
  apply: (c, r) => Object.assign(c.clearlag, r),
  actions: [
    { text: "§l§bChoose Mob / Entity Types", icon: "textures/ui/essx/icons/settings", run: entityTypesUI },
    { text: "§l§eLoaded Entities & Clear Now", icon: "textures/ui/essx/icons/delete", run: entityUI },
  ],
});
export { entityUI as clearLagUI };
