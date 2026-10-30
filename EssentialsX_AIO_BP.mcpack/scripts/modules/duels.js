// EssentialsX AIO | Consensual 1v1 with personal gear and nonlethal duel HP.
import { world, system, GameMode } from '@minecraft/server';
import { DB, flush } from '../core/db.js';
import { cfg, mod, saveCfg } from '../core/config.js';
import { cmd, addMember, addAdmin, hooks } from '../core/commands.js';
import { activity, reserve, release, isDueling, duelPair } from '../core/activities.js';
import { menu, modal, confirm, pickPlayer, byId, ok, err, msg, inv, loc, tpHooks, log } from '../core/utils.js';
import { actionbar } from '../core/actionbar.js';
import { inCombat, regionAt, claimAt } from './protection.js';
import { isLoggedIn } from './login.js';

export const DUEL_KITS = {
  sword:{name:'Sword',icon:'textures/items/iron_sword',matches:type=>/_sword$/.test(type)},
  axe:{name:'Axe',icon:'textures/items/iron_axe',matches:type=>/_(?:axe)$/.test(type)},
  bow:{name:'Bow',icon:'textures/items/bow_standby',matches:type=>['minecraft:bow','minecraft:crossbow'].includes(type)},
};
const requests=new Map();let match,sequence=0;
const supported=!!world.beforeEvents.entityHurt;
const held=p=>inv(p).getItem(p.selectedSlotIndex)?.typeId ?? '';
const member=(s,id)=>s?.ids.includes(id);
const distance=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2;
export const duelStats=id=>DB.duelStats.get(id,{wins:0,losses:0,draws:0});
function eligible(p){return p?.isValid && isLoggedIn(p) && !inCombat(p) && !DB.duelReturns.has(p.id) && [GameMode.Survival,GameMode.Adventure].includes(p.getGameMode());}
function arena(){
  const a=cfg().duels.arena;
  if(!a?.a || !a?.b || a.a.dim!==a.b.dim || ![a.a,a.b].every(pos=>[pos.x,pos.y,pos.z].every(Number.isFinite)) || distance(a.a,a.b)<16 || distance(a.a,a.b)>1600)return;
  return a;
}
function allowedPosition(pos){
  const r=mod('regions')?regionAt(pos,pos.dim):undefined;
  const c=mod('land')?claimAt(pos,pos.dim):undefined;
  return r?.flags?.damage!==false && r?.flags?.pvp!==false && (!c || c.flags?.pvp);
}
function notify(s,text){for(const id of s.ids){const p=byId(id);if(p)msg(p,text);}}
function dropRequest(s,text){if(requests.get(s.token)!==s)return;requests.delete(s.token);release(s.ids,s.token);notify(s,text);}
export function challengeDuel(p,t,kit){
  if(!supported || !mod('duels'))return err(p,'Duels need an enabled compatible Beta entityHurt API.');
  if(!DUEL_KITS[kit] || !arena())return err(p,'Choose a kit and ask an admin to set two arena spawns (4–40 blocks apart).');
  if(!t || t.id===p.id || !eligible(p) || !eligible(t))return err(p,'Both players must be logged in, out of combat and in Survival/Adventure.');
  if(!DUEL_KITS[kit].matches(held(p)))return err(p,`Hold your own ${DUEL_KITS[kit].name} weapon before challenging.`);
  const token=`duel:${++sequence}`,s={token,ids:[p.id,t.id],kit,expires:Date.now()+60000};
  if(!reserve(s.ids,'duelRequest',token))return err(p,'One player already has a duel or trade request.');
  requests.set(token,s);ok(p,`Duel challenge sent to ${t.name}.`);msg(t,`§e${p.name} challenged you to ${DUEL_KITS[kit].name}. Bring your own gear and use ${cfg().prefix}duel to respond.`);return s;
}
export function acceptDuel(p,token){
  const s=requests.get(token),a=arena();
  if(!s || s.ids[1]!==p.id || Date.now()>=s.expires)return err(p,'Challenge expired.');
  if(match)return err(p,'Arena is in use. Try again shortly.');
  const players=s.ids.map(byId);
  if(!supported || !mod('duels') || !a || ![a.a,a.b].every(allowedPosition) || !players.every(eligible))return dropRequest(s,'§cDuel cancelled: players or PvP arena unavailable.');
  if(!players.every(x=>DUEL_KITS[s.kit].matches(held(x))))return err(p,`Both players must hold their own ${DUEL_KITS[s.kit].name} weapon.`);
  // Persist return positions before moving either player. Inventory is never replaced.
  for(const x of players)DB.duelReturns.set(x.id,loc(x));
  flush();
  requests.delete(token);release(s.ids,token);reserve(s.ids,'duel',token);
  match={...s,phase:'starting',hp:{[s.ids[0]]:20,[s.ids[1]]:20},arena:JSON.parse(JSON.stringify(a)),ends:Date.now()+180000};
  try{
    for(let i=0;i<2;i++)players[i].teleport(i===0?a.a:a.b,{dimension:world.getDimension(a.a.dim),checkForBlocks:true,keepVelocity:false});
    match.phase='active';notify(s,'§aDuel started! 20 duel HP. Own gear; only the selected weapon kit counts. Use !duel to forfeit.');
  }catch(error){finishDuel(undefined,'Teleport failed; duel cancelled.');console.warn('[EssX Duel] '+error);return false;}
  return true;
}
function returnPlayer(p){
  const pos=DB.duelReturns.get(p.id);if(!pos || !p.isValid || !isLoggedIn(p))return false;
  try{p.teleport(pos,{dimension:world.getDimension(pos.dim),checkForBlocks:true,keepVelocity:false});DB.duelReturns.delete(p.id);return true;}
  catch(error){err(p,'Duel return is blocked. Clear your original spot, then use !duel to retry.');return false;}
}
export function finishDuel(winner,reason){
  const s=match;if(!s || s.phase==='finished')return false;
  const started=s.phase!=='starting';
  if(s.phase==='ending')winner=s.winner;
  s.phase='finished';
  if(winner && !member(s,winner))winner=undefined;
  for(const id of started?s.ids:[]){
    const stats=duelStats(id);
    if(winner){if(id===winner)stats.wins++;else stats.losses++;}else stats.draws++;
    DB.duelStats.set(id,stats);
  }
  notify(s,`§6Duel ended: ${reason}${winner ? ' Winner: '+(byId(winner)?.name ?? 'opponent') : ' No winner.'}`);
  // Keep immunity through this tick, including any already queued damage events.
  system.run(()=>{if(match!==s)return;for(const id of s.ids){const p=byId(id);if(p)returnPlayer(p);}release(s.ids,s.token);match=undefined;flush();});
  log('duel',`${s.kit}: ${s.ids.join(' vs ')}; winner ${winner ?? 'draw'}; ${reason}`);return true;
}
function other(s,id){return s.ids.find(x=>x!==id);}
world.beforeEvents.entityHurt?.subscribe(ev=>{
  const victim=ev.hurtEntity,attacker=ev.damageSource?.damagingEntity;
  if(!isDueling(victim.id) && !isDueling(attacker?.id))return;
  const cancelled=ev.cancel;ev.cancel=true; // Duelists cannot damage outsiders or suffer native damage.
  const s=match;
  if(cancelled || !s || s.phase!=='active' || !duelPair(victim.id,attacker?.id))return;
  const kit=DUEL_KITS[s.kit],projectile=ev.damageSource?.damagingProjectile;
  if(s.kit==='bow' ? !projectile || !kit.matches(held(attacker)) : projectile || ev.damageSource.cause!=='entityAttack' || !kit.matches(held(attacker)))return;
  const damage=Math.max(0,Math.min(20,Number(ev.damage)||0));
  s.hp[victim.id]-=damage;
  if(s.hp[victim.id]<=0){s.winner=attacker.id;s.phase='ending';system.run(()=>{if(match===s)finishDuel(attacker.id,'Opponent reached 0 duel HP.');});}
});
// Block ordinary teleport commands, building and item effects during an active match.
// Native walking/gear durability remain normal; no inventory snapshots or free gear.
tpHooks.canTeleport.push(p=>isDueling(p.id)?'Finish or forfeit your duel before teleporting.':undefined);
tpHooks.beforeTeleport.push(p=>{if(isDueling(p.id))throw new Error('Teleport cancelled: duel in progress.');});
hooks.beforeCommand.push((p,c)=>isDueling(p.id) && !['duel','help','myrank'].includes(c.name)?'Use !duel to forfeit before using other commands.':undefined);
for(const event of ['playerBreakBlock','playerPlaceBlock','itemUse','playerInteractWithBlock','playerInteractWithEntity']){
  world.beforeEvents[event]?.subscribe(ev=>{const p=ev.player ?? ev.source;if(!isDueling(p?.id))return;
    if(event==='itemUse' && match?.kit==='bow' && DUEL_KITS.bow.matches(ev.itemStack?.typeId))return;
    ev.cancel=true;
  });
}
world.afterEvents.playerLeave.subscribe(ev=>{
  const lock=activity(ev.playerId),s=lock?.kind==='duelRequest'?requests.get(lock.token):undefined;
  if(s)dropRequest(s,'§cDuel request cancelled: player disconnected.');
  if(member(match,ev.playerId))finishDuel(other(match,ev.playerId),'Player disconnected (forfeit).');
});
world.afterEvents.entityDie.subscribe(ev=>{if(member(match,ev.deadEntity.id))system.run(()=>{if(member(match,ev.deadEntity.id))finishDuel(other(match,ev.deadEntity.id),'Player died.');});});
world.afterEvents.playerSpawn.subscribe(ev=>{if(ev.initialSpawn)system.run(()=>{if(!isDueling(ev.player.id))returnPlayer(ev.player);});});
system.runInterval(()=>{
  for(const s of requests.values())if(!mod('duels') || Date.now()>=s.expires || !s.ids.map(byId).every(eligible))dropRequest(s,'§cDuel challenge expired.');
  const s=match;
  if(s?.phase==='active'){
    if(!mod('duels') || Date.now()>=s.ends){finishDuel(undefined,'Time limit or duels disabled.');return;}
    const center={x:(s.arena.a.x+s.arena.b.x)/2,y:(s.arena.a.y+s.arena.b.y)/2,z:(s.arena.a.z+s.arena.b.z)/2};
    for(const id of s.ids){const p=byId(id);if(!p || !isLoggedIn(p) || ![GameMode.Survival,GameMode.Adventure].includes(p.getGameMode()) || p.dimension.id!==s.arena.a.dim || distance(p.location,center)>2500){finishDuel(other(s,id),'Player left the arena (forfeit).');return;}
      if(!allowedPosition({...p.location,dim:p.dimension.id})){finishDuel(undefined,'Entered a protected area.');return;}
      actionbar(p,`§cDuel HP: ${Math.max(0,s.hp[id]).toFixed(1)}/20 §7| ${DUEL_KITS[s.kit].name} §7| ${Math.ceil((s.ends-Date.now())/1000)}s`);
    }
  }
  // Also recovers players after script/world reload; personal inventory is untouched.
  for(const p of world.getAllPlayers())if(!isDueling(p.id) && DB.duelReturns.has(p.id)){
    const last=returnsNotice.get(p.id) ?? 0;if(Date.now()-last>10000){returnsNotice.set(p.id,Date.now());returnPlayer(p);}
  }
},5);
const returnsNotice=new Map();
export async function duelUI(p){
  if(!isLoggedIn(p))return err(p,'Login first.');
  if(isDueling(p.id)){
    const s=match;if(!s)return;
    if(await confirm(p,'§lForfeit Duel','Leave the arena and record a loss?'))if(match===s)finishDuel(other(s,p.id),'Player forfeited.');return;
  }
  if(DB.duelReturns.has(p.id)){returnPlayer(p);return;}
  const lock=activity(p.id),request=lock?.kind==='duelRequest'?requests.get(lock.token):undefined;
  if(request){
    if(request.ids[1]===p.id){if(await confirm(p,'§lDuel Challenge',`${byId(request.ids[0])?.name}: ${DUEL_KITS[request.kit].name} kit. Bring your own weapon/armor. 20 separate duel HP, 3 minutes, 50-block arena boundary. No items or normal HP are restored/replaced.`))acceptDuel(p,request.token);else dropRequest(request,'§cDuel declined.');}
    else await menu(p,'§lDuel Request','§7Waiting for your opponent.',[{text:'§lCancel Challenge',icon:'textures/ui/essx/icons/close',run:()=>dropRequest(request,'§cDuel challenge cancelled.')}]);return;
  }
  const stats=duelStats(p.id);
  await menu(p,'§lDuel Arena',`§aWins: ${stats.wins} §cLosses: ${stats.losses} §7Draws: ${stats.draws}\n§7Personal gear kits. Inventory and normal health are not replaced.\n§7No death rewards; matches use separate nonlethal HP.`,Object.entries(DUEL_KITS).map(([kit,d])=>({text:`§l${d.name} Kit\n§r§7Bring your own ${d.name.toLowerCase()} weapon`,icon:d.icon,run:async()=>{const t=await pickPlayer(p,'§lChallenge Player');if(t)challengeDuel(p,t,kit);}})));
}
async function arenaUI(p){
  if(match)return err(p,'Wait for the active match to finish before editing the arena.');
  await menu(p,'§lDuel Arena Setup','§7Build a safe PvP-enabled arena. Set spawns 4–40 blocks apart in one dimension. The boundary is 50 blocks from their midpoint.',[
    ...['a','b'].map(side=>({text:`§lSet Spawn ${side.toUpperCase()} Here`,icon:'textures/ui/essx/icons/coords',run:()=>{if(match)return err(p,'Arena in use.');const pos=loc(p);if(!allowedPosition(pos))return err(p,'Allow PvP and damage in the region/claim first.');cfg().duels.arena={...cfg().duels.arena,[side]:pos};saveCfg();ok(p,`Spawn ${side.toUpperCase()} saved.`);}})),
  ]);
}
cmd({name:'duel',module:'duels',desc:'Challenge, accept or forfeit a 1v1 duel',run:duelUI});
cmd({name:'duelarena',module:'duels',admin:true,desc:'Configure duel arena spawns',run:arenaUI});
addMember({ text: "§l§cDuel Arena\n§r§8Challenge a 1v1 & view stats", icon: "textures/items/iron_sword", module: "duels", run: duelUI });
addAdmin({text:'§l§cDuel Arena Setup',icon:'textures/items/iron_sword',module:'duels',run:arenaUI});
