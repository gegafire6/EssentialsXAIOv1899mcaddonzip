// EssentialsX AIO | Two-party, revision-confirmed trades; no escrow while editing.
import { world, system, GameMode } from '@minecraft/server';
import { cfg, mod } from '../core/config.js';
import { cmd, addMember, hooks } from '../core/commands.js';
import { activity, reserve, release } from '../core/activities.js';
import { menu, modal, confirm, pickPlayer, byId, inv, ok, err, cur, itemName, log } from '../core/utils.js';
import { bal, setBal } from './economy.js';
import { inCombat } from './protection.js';
import { isLoggedIn } from './login.js';

const sessions = new Map();
let sequence = 0;
const get = id => { const lock = activity(id); return lock?.kind === 'trade' ? sessions.get(lock.token) : undefined; };
const validMoney = n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000000;
// Opaque container data cannot be compared through the API: do not offer shulkers/bundles.
const tool = /^minecraft:(?:(?:wooden|stone|iron|golden|diamond|netherite)_(?:sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots)|(?:leather|chainmail)_(?:helmet|chestplate|leggings|boots)|bow|crossbow|shield|elytra|fishing_rod|shears|brush|trident|mace|flint_and_steel|turtle_helmet|totem_of_undying)$/;
export function tradable(item) {
  return !!item && item.typeId.startsWith('minecraft:') && !/shulker_box|bundle/.test(item.typeId) && item.lockMode === 'none' && (item.isStackable || tool.test(item.typeId));
}
function fingerprint(item) {
  const ench = item.getComponent('minecraft:enchantable')?.getEnchantments().map(e=>[e.type.id,e.level]).sort() ?? [];
  return JSON.stringify([item.typeId,item.amount,item.nameTag ?? '',item.getLore(),item.getCanDestroy().sort(),item.getCanPlaceOn().sort(),item.lockMode,item.keepOnDeath,item.getComponent('minecraft:durability')?.damage ?? 0,ench,item.getDynamicPropertyIds().sort().map(k=>[k,item.getDynamicProperty(k)])]);
}
function sameItem(a,b) {
  if (!a || !b || a.amount !== b.amount) return false;
  return a.isStackable ? a.isStackableWith(b) : tool.test(a.typeId) && fingerprint(a) === fingerprint(b);
}
function ready(p) {
  return p?.isValid && isLoggedIn(p) && !inCombat(p) && [GameMode.Survival,GameMode.Adventure].includes(p.getGameMode());
}
function live(s) {
  const players = s.ids.map(byId);
  return mod('trade') && mod('economy') && Date.now() < s.expires && players.every(ready) && players[0].dimension.id === players[1].dimension.id && (players[0].location.x-players[1].location.x)**2+(players[0].location.y-players[1].location.y)**2+(players[0].location.z-players[1].location.z)**2 <= 100;
}
function notify(s,text) { for (const id of s.ids) { const p=byId(id);if(p) ok(p,text); } }
export function cancelTrade(p, reason = 'Trade cancelled. No items or money were taken.') {
  const s = typeof p === 'string' ? sessions.get(p) : get(p.id);
  if (!s || s.committing || s.repair) return;
  sessions.delete(s.token);release(s.ids,s.token);notify(s,reason);
}
export function requestTrade(p,t) {
  if (!t || t.id===p.id || !ready(p) || !ready(t)) return err(p,'Both players must be online, logged in and out of combat in Survival/Adventure.');
  const token=`trade:${++sequence}`;
  const s={token,ids:[p.id,t.id],offers:{[p.id]:{money:0,items:[]},[t.id]:{money:0,items:[]}},accepted:new Set(),version:0,invited:true,expires:Date.now()+120000};
  if (!mod('trade') || !mod('economy') || !live(s)) return err(p,'Enable economy/trading and stand within 10 blocks in the same dimension.');
  if (!reserve(s.ids,'trade',token)) return err(p,'One player already has a trade or duel request.');
  sessions.set(token,s);ok(p,`Trade request sent to ${t.name}.`);ok(t,`${p.name} wants to trade. Use ${cfg().prefix}trade to accept or decline.`);
  return s;
}
export function editOffer(p, token, version, money, slots) {
  const s=get(p.id);
  if (!s || s.token!==token || s.version!==version || s.invited || s.committing || s.repair || !live(s)) return err(p,'Trade changed or expired. Reopen the trade.');
  if (!validMoney(money) || money>bal(p.id) || !Array.isArray(slots) || slots.length>9 || new Set(slots).size!==slots.length) return err(p,'Use a whole amount you can afford and at most 9 different stacks.');
  const inventory=inv(p),items=[];
  for (const slot of slots) {
    if (!Number.isInteger(slot) || slot<0 || slot>=inventory.size) return err(p,'Invalid inventory slot.');
    const item=inventory.getItem(slot);if(!tradable(item))return err(p,'That item cannot be traded. Containers, locked and custom addon items are excluded.');
    items.push({slot,item:item.clone()});
  }
  s.offers[p.id]={money,items};s.version++;s.accepted.clear();notify(s,'Offer updated. Both players must confirm the new offer.');return true;
}
// Incoming whole stacks use empty slots (including slots freed by outgoing offers).
// No addItem leftovers, dropped items, metadata reconstruction or async inventory writes.
export function confirmTrade(p,token,version) {
  const s=get(p.id);
  if(!s || s.token!==token || s.version!==version || s.invited || s.committing || s.repair || !live(s))return err(p,'Trade changed or expired. Reopen it and confirm again.');
  s.accepted.add(p.id);
  if(s.accepted.size!==2){ok(p,'Confirmed. Waiting for the other player.');return false;}
  const players=s.ids.map(byId),containers=players.map(inv),before=containers.map(c=>Array.from({length:c.size},(_,i)=>c.getItem(i)?.clone()));
  const balances=s.ids.map(bal),after=before.map(items=>items.slice());
  const offers=s.ids.map(id=>s.offers[id]);
  for(let side=0;side<2;side++){
    const offer=offers[side];
    if(!validMoney(offer.money) || balances[side]<offer.money){s.accepted.clear();return err(p,'Balance changed. Both players must confirm again.');}
    for(const entry of offer.items){
      if(!sameItem(before[side][entry.slot],entry.item)){s.accepted.clear();return err(p,'Offered items changed. Edit the offer and confirm again.');}
      after[side][entry.slot]=undefined;
    }
  }
  if(!offers.some(o=>o.money||o.items.length)){s.accepted.clear();return err(p,'Add items or money first.');}
  for(let side=0;side<2;side++){
    for(const entry of offers[1-side].items){const slot=after[side].findIndex(item=>!item);if(slot<0){s.accepted.clear();return err(p,'Not enough empty inventory slots. Both players must make room and confirm again.');}after[side][slot]=entry.item.clone();}
    const result=balances[side]-offers[side].money+offers[1-side].money;
    if(!Number.isSafeInteger(result)){s.accepted.clear();return err(p,'Resulting balance is too large.');}
  }
  s.committing=true;
  const writes=[];
  try{
    for(let side=0;side<2;side++)for(let slot=0;slot<after[side].length;slot++)if(after[side][slot]!==before[side][slot]){
      writes.push([side,slot]);containers[side].setItem(slot,after[side][slot]);
    }
    for(let side=0;side<2;side++)setBal(s.ids[side],balances[side]-offers[side].money+offers[1-side].money);
  }catch(error){
    // Restore every touched slot and both balances before releasing the session.
    // Retain recovery copies if the engine temporarily refuses a rollback write.
    s.repair={containers,before,balances,writes};s.committing=false;
    restoreTrade(s);console.warn('[EssX Trade] transfer failed: '+error);return false;
  }
  s.committing=false;sessions.delete(token);release(s.ids,token);notify(s,'Trade completed.');log('trade',`${players[0].name} traded with ${players[1].name}`);return true;
}
function restoreTrade(s){
  const {before,balances,writes}=s.repair;
  const players=s.ids.map(byId);if(players.some(p=>!p))return;
  try{
    const containers=players.map(inv);
    for(const [side,slot] of writes)containers[side].setItem(slot,before[side][slot]);
    s.ids.forEach((id,i)=>setBal(id,balances[i]));delete s.repair;cancelTrade(s.token,'Trade failed and was rolled back.');
  }catch(error){console.warn('[EssX Trade] rollback pending; session locked: '+error);}
}
function itemSummary(item){
  const enchantments=item.getComponent("minecraft:enchantable")?.getEnchantments().map(e=>`${e.type.id} ${e.level}`).join(", ") ?? "";
  const damage=item.getComponent("minecraft:durability")?.damage;
  return `${itemName(item)} x${item.amount}${enchantments ? " · "+enchantments : ""}${damage!==undefined ? " · wear "+damage : ""}${item.getLore().length ? "\n"+item.getLore().join("\n") : ""}`;
}
function offerText(s,id){const offer=s.offers[id];return `${byId(id)?.name ?? 'Player'}: ${cur(offer.money)}\n${offer.items.map(e=>itemSummary(e.item)).join('\n') || 'No items'}`;}
async function editUI(p,s){
  const version=s.version,c=inv(p),entries=[];
  for(let slot=0;slot<c.size;slot++){const item=c.getItem(slot);if(tradable(item))entries.push({slot,item});}
  const fields=[{type:'text',key:'money',label:'Money to give (whole amount)',default:s.offers[p.id].money},...entries.map(({slot,item})=>({type:'toggle',key:`slot${slot}`,label:`Slot ${slot+1}: ${itemName(item)} x${item.amount}`,default:s.offers[p.id].items.some(e=>e.slot===slot)}))];
  const result=await modal(p,'§lEdit Trade Offer',fields,'Save offer');
  if(result)editOffer(p,s.token,version,Number(result.money),entries.filter(e=>result[`slot${e.slot}`]).map(e=>e.slot));
}
export async function tradeUI(p){
  if(!mod('trade') || !mod('economy') || !isLoggedIn(p))return err(p,'Trading is unavailable.');
  let s=get(p.id);
  if(!s){const t=await pickPlayer(p,'§lTrade With');if(t)requestTrade(p,t);return;}
  if(s.repair)return err(p,'A failed transfer is being restored. Please wait and contact an admin if it persists.');
  if(!live(s)){cancelTrade(s.token,'Trade expired or players became unavailable.');return;}
  if(s.invited){
    if(p.id===s.ids[0])return menu(p,'§lTrade Request','§7Waiting for the other player.',[{text:'§lCancel Request',icon:'textures/ui/essx/icons/close',run:()=>cancelTrade(s.token)}]);
    if(!await confirm(p,'§lTrade Request',`${byId(s.ids[0])?.name} wants to trade. Both players must confirm the final offers.`))return cancelTrade(s.token);
    if(get(p.id)!==s || !live(s))return;
    s.invited=false;s.version++;notify(s,'Trade accepted. Use !trade to edit offers.');
  }
  const version=s.version;
  await menu(p,'§lPlayer Trade',`§f${offerText(s,s.ids[0])}\n\n${offerText(s,s.ids[1])}\n\n§7Confirmations: ${s.accepted.size}/2. Editing resets both.`,[
    {text:'§lEdit My Offer',icon:'textures/ui/essx/icons/edit',run:()=>editUI(p,s)},
    {text:'§lConfirm These Offers',icon:'textures/ui/essx/icons/check',run:()=>confirmTrade(p,s.token,version)},
    {text:'§lCancel Trade',icon:'textures/ui/essx/icons/close',run:()=>cancelTrade(s.token)},
  ]);
}
hooks.beforeCommand.push((p,c)=>get(p.id)?.repair && !['trade','help'].includes(c.name)?'Trade recovery in progress. Please wait.':undefined);
for(const event of ['itemUse','playerBreakBlock','playerPlaceBlock','playerInteractWithBlock','playerInteractWithEntity'])world.beforeEvents[event]?.subscribe(ev=>{const p=ev.player ?? ev.source;if(p && get(p.id)?.repair)ev.cancel=true;});
world.afterEvents.playerLeave.subscribe(ev=>{const s=get(ev.playerId);if(s&&!s.repair)cancelTrade(s.token,'Trade cancelled: a player disconnected.');});
world.afterEvents.entityDie.subscribe(ev=>{const s=get(ev.deadEntity.id);if(s&&!s.repair)cancelTrade(s.token,'Trade cancelled: a player died.');});
system.runInterval(()=>{for(const s of sessions.values()){if(s.repair){restoreTrade(s);continue;}if(!live(s))cancelTrade(s.token,'Trade expired or players moved out of range.');}},20);
cmd({name:'trade',module:'trade',desc:'Trade items and money with another player',run:tradeUI});
addMember({ text: "§l§aPlayer Trade\n§r§8Confirm items & money", icon: "textures/ui/essx/icons/shop", module: "trade", run: tradeUI });
