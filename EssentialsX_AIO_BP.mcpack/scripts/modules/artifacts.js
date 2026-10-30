// EssentialsX AIO - By Opiar | S-Class artifact abilities
import { world, system, ItemStack, GameMode, EntityDamageCause } from '@minecraft/server';
import { mod } from '../core/config.js';
import { cmd, addMember, addAdmin } from '../core/commands.js';
import { registerPlugin } from '../core/plugins.js';
import { hasDeveloperAccess } from '../core/developer-auth.js';
import { activity } from '../core/activities.js';
import { ARTIFACTS, prepareAbility } from '../core/artifacts.js';
import { menu, pickPlayer, online, ok, err, msg, tpHooks } from '../core/utils.js';
import { isLoggedIn } from './login.js';
import { canBuild } from './protection.js';
import { allowArtifactImpulse } from './anticheat.js';
import '../core/artifact-traps.js';
const attempt=(p,run)=>Promise.resolve().then(run).catch(e=>{if(p?.isValid)err(p,e.message??String(e));});
const epochs=new Map(), cooldowns=new Map();
const epoch=p=>epochs.get(p.id)??0;
function menuAccess(p){if(!p?.isValid||!mod('artifacts')||!isLoggedIn(p))throw Error('Log in and enable Artifacts first.');}
function findArtifact(query){const q=String(query??'').toLowerCase().replace(/^essx:/,'');return Object.entries(ARTIFACTS).find(([id,a])=>id.slice(5)===q||a.name.toLowerCase()===q);}
function inventory(p){return p.getComponent('minecraft:inventory')?.container;}
function hostile(e){return e?.isValid && !e.typeId.startsWith('essx:') && e.typeId!=='minecraft:player' && !!e.getComponent('minecraft:type_family')?.hasTypeFamily('monster');}
function movementAllowed(p){for(const fn of tpHooks.canTeleport){const reason=fn(p);if(reason)throw Error(reason);}}
function blinkDestination(p){
  const v=p.getViewDirection(),length=Math.hypot(v.x,v.z);if(length<0.05)return;
  const origin=p.location,dim=p.dimension,y=Math.floor(origin.y);let best;
  for(let n=1;n<=6;n++){
    const x=Math.floor(origin.x+v.x/length*n),z=Math.floor(origin.z+v.z/length*n);
    const feet=dim.getBlock({x,y,z}),head=dim.getBlock({x,y:y+1,z}),floor=dim.getBlock({x,y:y-1,z});
    if(!feet?.isAir||!head?.isAir)break;
    if(!floor?.isSolid||floor.isLiquid||/lava|magma|cactus|campfire|fire|berry|powder_snow/.test(floor.typeId))continue;
    const pos={x:x+0.5,y,z:z+0.5};
    if(canBuild(p,pos,dim.id)===true)best=pos;
  }
  return best;
}
const api={
  canHeal:p=>{const h=p.getComponent('minecraft:health');return h&&h.currentValue>0&&h.currentValue<h.effectiveMax;},
  heal:(p,n)=>{const h=p.getComponent('minecraft:health');if(h?.currentValue>0)h.setCurrentValue(Math.min(h.effectiveMax,h.currentValue+n));},
  nearby:(p,radius,max)=>p.dimension.getEntities({families:['monster'],location:p.location,maxDistance:radius}).filter(hostile).sort((a,b)=>{
    const d=e=>Math.hypot(e.location.x-p.location.x,e.location.y-p.location.y,e.location.z-p.location.z);return d(a)-d(b);
  }).slice(0,max),
  aimed:(p,distance)=>{const first=p.getEntitiesFromViewDirection({maxDistance:distance})[0]?.entity;return hostile(first)?first:undefined;},
  hurt:(p,e,amount)=>e.applyDamage(amount,{cause:EntityDamageCause.magic,damagingEntity:p}),
  push:(p,e,strength)=>{const dx=e.location.x-p.location.x,dz=e.location.z-p.location.z,len=Math.hypot(dx,dz)||1;e.applyKnockback({x:dx/len*strength,z:dz/len*strength},0.25);},
  pull:(p,e)=>{const dx=p.location.x-e.location.x,dz=p.location.z-e.location.z,len=Math.hypot(dx,dz)||1;e.applyImpulse({x:dx/len*0.8,y:0.1,z:dz/len*0.8});},
  movementAllowed,blinkDestination,
  dash:(p,vector)=>{allowArtifactImpulse(p);p.applyImpulse(vector);},
  blink:(p,pos)=>{for(const fn of tpHooks.beforeTeleport)fn(p);if(!p.tryTeleport(pos,{dimension:p.dimension,checkForBlocks:true,keepVelocity:false}))throw Error('Destination is blocked or unloaded.');for(const fn of tpHooks.afterTeleport)try{fn(p);}catch{}},
  notice:(p,text)=>msg(p,'§b'+text),
  findRepair:p=>{const c=inventory(p);let best;for(let i=0;i<(c?.size??0);i++){
    const item=c.getItem(i);if(!item||ARTIFACTS[item.typeId])continue;
    const d=item.getComponent('minecraft:durability');if(!d||d.maxDurability<=0||d.damage<=0||d.damage>=d.maxDurability)continue;
    if(!best||d.damage/d.maxDurability>best.ratio)best={slot:i,item,ratio:d.damage/d.maxDurability};
  }return best;},
  repair:(p,ref)=>{const item=ref.item.clone(),d=item.getComponent('minecraft:durability');d.damage=Math.max(0,d.damage-Math.max(1,Math.ceil(d.maxDurability*0.25)));inventory(p).setItem(ref.slot,item);},
};
// Effects are cosmetic and must never interrupt an already-paid ability.
function artifactEffects(p,id){
  let dim,pos;try{dim=p.dimension;const loc=p.location;pos={x:loc.x,y:loc.y+1,z:loc.z};}catch{return;}
  try{dim.spawnParticle(id==='essx:eclipse_orb'?'essx:artifact_eclipse':'essx:artifact_burst',pos);}catch{}
  try{dim.playSound('essx.artifact.activate',pos,{volume:1,pitch:id==='essx:eclipse_orb'?0.7:1});}catch{}
}
function quote(p,item){return {slot:p.selectedSlotIndex,type:item?.typeId,damage:item?.getComponent('minecraft:durability')?.damage,epoch:epoch(p),dim:p.dimension.id};}
function activate(p,expected){
  menuAccess(p);
  if(![GameMode.Survival,GameMode.Adventure].includes(p.getGameMode())||p.getComponent('minecraft:health')?.currentValue<=0)throw Error('Use artifacts while alive in Survival or Adventure.');
  if(activity(p.id)||p.getDynamicProperty('essx:replay:return'))throw Error('Finish your current activity first.');
  if((cooldowns.get(p.id)??0)>system.currentTick)throw Error('Artifact is recharging.');
  const c=inventory(p),held=c?.getItem(p.selectedSlotIndex),d=held?.getComponent('minecraft:durability');
  if(!ARTIFACTS[held?.typeId]||held.amount!==1||!d)throw Error('Hold an artifact with durability in your main hand.');
  if(expected&&(expected.slot!==p.selectedSlotIndex||expected.type!==held.typeId||expected.damage!==d.damage||expected.epoch!==epoch(p)||expected.dim!==p.dimension.id))throw Error('Held item or player state changed. Use the artifact again.');
  if(!Number.isInteger(d.damage)||d.damage<0||d.damage>=d.maxDurability)throw Error('Invalid artifact durability.');
  const action=prepareAbility(p,held.typeId,api),next=held.clone(),nextDurability=next.getComponent('minecraft:durability'),broken=d.damage+1>=d.maxDurability;
  if(!broken)nextDurability.damage=d.damage+1;
  // Persist the cost first; no action occurs if the inventory write fails.
  c.setItem(p.selectedSlotIndex,broken?undefined:next);cooldowns.set(p.id,system.currentTick+40);
  try{action();}catch(e){throw Error('Ability interrupted after durability was spent: '+(e.message??e));}
  artifactEffects(p,held.typeId);
  msg(p,'§a'+ARTIFACTS[held.typeId].power+(broken?' — artifact broke!':` — ${d.maxDurability-d.damage-1} uses left.`));
}
async function guide(p,type){
  menuAccess(p);const a=ARTIFACTS[type];if(!a)throw Error('Artifact not found.');
  let recipe='';if(a.ingredients){const [A,B,C]=a.ingredients;recipe=`\n\nCrafting table pattern:\n . A .\n B N B\n . C .\nA: ${A}\nB: ${B} (x2)\nN: nether_star\nC: ${C}`;}
  return menu(p,a.color+'§l[S-Class] '+a.name,`§f${a.power}: ${a.description}\n\nUse while held or type !artifacts use. 10 uses; artifact breaks when depleted. Two-second shared recharge. No potion or status effects.\n\nFound in Nether fortress and bastion chests and Woodland Mansion portal traps.`+recipe,[{text:'Back',run:()=>attempt(p,()=>catalog(p))}]);
}
async function catalog(p){menuAccess(p);return menu(p,'§l§6S-Class Artifacts','Ten artifacts with unique abilities. Select one for details.',Object.entries(ARTIFACTS).map(([id,a])=>({text:a.color+'§l'+a.name+'\n§r§7'+a.power,icon:a.icon,run:()=>attempt(p,()=>guide(p,id))})));}
function grant(p,target,type){
  menuAccess(p);if(!hasDeveloperAccess(p))throw Error('Admin authorization expired. Reopen Admin Menu.');
  if(!ARTIFACTS[type]||!target?.isValid||!online().some(t=>t.id===target.id)||!isLoggedIn(target))throw Error('Choose an online, logged-in player.');
  if(activity(target.id)||target.getDynamicProperty('essx:replay:return'))throw Error('Player is busy. Try again after their activity.');
  const container=inventory(target);if(!container)throw Error('Inventory unavailable.');
  let slot=-1;for(let i=0;i<container.size;i++)if(!container.getItem(i)){slot=i;break;}
  if(slot<0)throw Error('Player inventory is full. Make room first.');
  container.setItem(slot,new ItemStack(type,1));ok(p,'Granted '+ARTIFACTS[type].name+' to '+target.name+'.');
  if(p.id!==target.id)msg(target,'§6You received an S-Class '+ARTIFACTS[type].name+'!');
}
async function vault(p){menuAccess(p);if(!hasDeveloperAccess(p))throw Error('Admin authorization expired.');return menu(p,'§l§6S-Class Artifact Vault','Grant an artifact.',[...Object.entries(ARTIFACTS).map(([id,a])=>({text:a.color+a.name,icon:a.icon,run:()=>attempt(p,async()=>{const target=await pickPlayer(p,'Grant '+a.name,true);if(target)grant(p,target,id);})})),{text:'Artifact Guide',run:()=>attempt(p,()=>catalog(p))}]);}
cmd({name:'artifacts',aliases:['artifact','sclass'],module:'artifacts',desc:'Artifact abilities and sources',usage:'[use|artifact_id]',run:(p,args)=>{
  if(args[0]==='use')return activate(p,quote(p,inventory(p)?.getItem(p.selectedSlotIndex)));
  if(args.length){const found=findArtifact(args.join(' '));if(!found)throw Error('Unknown artifact. Open !artifacts.');return guide(p,found[0]);}return catalog(p);
}});
cmd({name:'artifactgive',admin:true,module:'artifacts',desc:'Grant one S-Class artifact',usage:'<artifact_id> [exact player name]',run:(p,args)=>{
  const found=findArtifact(args[0]);if(!found)throw Error('Unknown artifact. Open !artifacts for the list.');
  const name=args.slice(1).join(' ').toLowerCase(),target=name?online().find(t=>t.name.toLowerCase()===name):p;return grant(p,target,found[0]);
}});
addMember({text:'§l§6S-Class Artifacts\n§r§8Abilities & sources',icon:ARTIFACTS['essx:aegis_heart'].icon,module:'artifacts',category:'games',run:catalog});
addAdmin({text:'§l§6S-Class Artifact Vault\n§r§8Grant artifacts & view guide',icon:ARTIFACTS['essx:aegis_heart'].icon,module:'artifacts',run:vault});
registerPlugin({id:'artifacts',name:'S-Class Artifacts',module:'artifacts',icon:ARTIFACTS['essx:aegis_heart'].icon,desc:'Ten breakable artifacts with unique instant abilities.',actions:[{text:'Artifact guide',run:catalog},{text:'Admin Artifact Vault',run:vault}]});
world.beforeEvents.itemUse.subscribe(ev=>{
  if(!ARTIFACTS[ev.itemStack?.typeId])return;
  const canceled=ev.cancel;ev.cancel=true;if(canceled||!mod('artifacts')||!isLoggedIn(ev.source))return;
  const p=ev.source,expected=quote(p,ev.itemStack);system.run(()=>attempt(p,()=>activate(p,expected)));
});
const invalidate=p=>epochs.set(p.id,epoch(p)+1);
world.afterEvents.playerSpawn.subscribe(ev=>invalidate(ev.player));
world.afterEvents.playerDimensionChange.subscribe(ev=>invalidate(ev.player));
world.afterEvents.entityDie.subscribe(ev=>{if(ev.deadEntity.typeId==='minecraft:player')invalidate(ev.deadEntity);});
world.afterEvents.playerLeave.subscribe(ev=>{epochs.set(ev.playerId,(epochs.get(ev.playerId)??0)+1);cooldowns.delete(ev.playerId);});
