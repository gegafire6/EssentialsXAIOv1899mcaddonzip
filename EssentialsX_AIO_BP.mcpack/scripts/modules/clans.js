// EssentialsX AIO - By Opiar | Simple Clan System
import { world, system } from '@minecraft/server';
import { DB } from '../core/db.js';
import { cfg, mod } from '../core/config.js';
import { cmd, addMember, addAdmin } from '../core/commands.js';
import { Clans, clanRole } from '../core/clans.js';
import { activity, duelPair } from '../core/activities.js';
import { hasDeveloperAccess } from '../core/developer-auth.js';
import { registerPlugin } from '../core/plugins.js';
import { msg, ok, err, nameOf, isAdmin, menu, modal, confirm, pickPlayer, now, online, broadcast, teleport, loc, cur } from '../core/utils.js';
import { bal, setBal } from './economy.js';
import { chatHooks, isMuted, filter } from './chat.js';
import { isLoggedIn } from './login.js';
import { inCombat, canBuild } from './protection.js';

function access(p) {
  if (!p.isValid || !mod('clans')) throw new Error('Clans are disabled or player disconnected.');
  if (p.getComponent?.('minecraft:health')?.currentValue <= 0) throw new Error('Respawn first.');
  if (!isLoggedIn(p)) throw new Error('Log in first.');
  if (activity(p.id)) throw new Error('Finish your current activity first.');
}
const clans = new Clans({ table:DB.clans, access, config:()=>cfg().clans, now, admin:isAdmin, adminAccess:hasDeveloperAccess,
  economy:()=>mod('economy'), balance:bal, setBalance:setBal });
export const clanOf = pid => clans.of(pid);
const clanChat = new Set(), lastChat = new Map();
const playerName = id => online().find(p=>p.id===id)?.name ?? nameOf(id);
const tell = (c,text) => { for(const p of online()) if(c.members.includes(p.id) && isLoggedIn(p)) msg(p,'§8[§bClan§8] §f'+text); };
const attempt = (p,fn) => { try { return fn(); } catch(e) { err(p,e.message??String(e)); } };
const action = (p,fn,text) => attempt(p,()=>{ const m=fn(); if(text)tell(m.c,text); return m; });
const clearChat = id => { if(clanChat.delete(id)) { const p=online().find(p=>p.id===id); if(p)ok(p,'Chat: public (clan membership ended).'); } };
function memberId(m,query) {
  const q=String(query??'').toLowerCase();
  const matches=m.c.members.filter(id=>id===query || playerName(id).toLowerCase()===q);
  if(matches.length!==1)throw new Error('Use the exact name of a clan member (offline supported).');
  return matches[0];
}
function invite(p,t,ref) {
  if(!t)return;
  const m=clans.invite(p,t,ref); ok(p,'Invited '+t.name);
  msg(t,`§bClan invite: ${m.c.name}. Type ${cfg().prefix}clan join ${m.c.tag} within ${cfg().clans.inviteSeconds}s.`);
}
function remove(p,tid,ref) {
  const m=clans.remove(p,tid,ref); clearChat(tid);
  tell(m.c,`${playerName(tid)} ${tid===p.id?'left':'was kicked from'} the clan.`); ok(p,'Membership updated.');
}
function disband(p,ref,admin=false) {
  const m=clans.disband(p,ref,admin); m.c.members.forEach(clearChat);
  broadcast(`§7Clan [${m.c.tag}] ${m.c.name} was disbanded. Bank refunded to the leader.`);
}
function relation(p,query,op,ref) {
  const m=clans.relation(p,query,op,ref), t=clans.find(query);
  const text=op==='ally' ? clans.allied(m,t) ? `${m.c.name} and ${t.c.name} are now allies.` : `${m.c.name} requests an alliance. Leader: use ${cfg().prefix}clan ally ${m.c.tag} to accept within ${cfg().clans.inviteSeconds}s.` : `${m.c.name} and ${t.c.name}: ${op}.`;
  tell(m.c,text); tell(t.c,text);
}
function toggle(p) {
  clans.member(p);
  if(clanChat.has(p.id)) { clanChat.delete(p.id); ok(p,'Chat: public'); }
  else { clanChat.add(p.id); ok(p,'Chat: clan only. Use '+cfg().prefix+'clan chat to return to public.'); }
}
function sendChat(p,text,ref) {
  const m=clans.member(p,ref);
  if(isMuted(p.id))throw new Error('You are muted.');
  if(now()-(lastChat.get(p.id)??-Infinity)<cfg().chat.cooldownMs)throw new Error('Slow down!');
  text=String(text).trim().slice(0,500);
  if(!isAdmin(p))text=text.replace(/§./g,'').replace(/[\uE000-\uF8FF]/g,'');
  text=filter(text); if(!text.trim())throw new Error('Enter a message.');
  lastChat.set(p.id,now()); tell(m.c,`§b[${clanRole(m.c,p.id)}] §e${p.name}§7: §f${text}`);
}
function safeHome(home) {
  if(!home || ![home.x,home.y,home.z].every(Number.isFinite))throw new Error('No valid clan home.');
  const dim=world.getDimension(home.dim), x=Math.floor(home.x), y=Math.floor(home.y), z=Math.floor(home.z);
  const feet=dim.getBlock({x,y,z}), head=dim.getBlock({x,y:y+1,z}), floor=dim.getBlock({x,y:y-1,z});
  if(!feet?.isAir || !head?.isAir || !floor?.isSolid || /lava|fire|magma|cactus|campfire|powder_snow/.test(floor.typeId))throw new Error('Home is obstructed, unsafe or unloaded.');
  return home;
}
function sethome(p,ref) {
  clans.member(p,ref,'Officer'); if(inCombat(p))throw new Error('Cannot set home in combat.');
  const home=loc(p), permission=canBuild(p,p.location,p.dimension.id);
  if(permission!==true)throw new Error(permission);
  clans.sethome(p,safeHome(home),ref); ok(p,'Clan home set.');
}
function home(p,ref) {
  const m=clans.member(p,ref), expected=clans.ref(m);
  if(inCombat(p))throw new Error('Cannot teleport in combat.');
  safeHome(m.c.home);
  return teleport(p,m.c.home,'clan home',{prepare:()=>{
    // Called after the warmup: roles, membership, plugin, activity and destination are live.
    const live=clans.member(p,expected);
    if(inCombat(p))throw new Error('Cannot teleport in combat.');
    return {location:safeHome(live.c.home)};
  }});
}
function infoText(m) {
  const c=m.c, date=Number.isFinite(c.created)?new Date(c.created).toISOString().slice(0,10):'Unknown';
  const names=ids=>(ids??[]).map(id=>DB.clans.get(id)?.name).filter(Boolean).join(', ')||'None';
  return `§fLeader: §e${playerName(c.owner)}\n§fCreated: §e${date}\n§fJoin: §b${c.open?'Open':'Invite only'}\n§fMembers: ${c.members.length}/${cfg().clans.maxMembers}\n§fBank: §a${cur(c.bank??0)} §7| Kills: ${c.kills??0}\n§fAllies: ${names(c.allies)}\n§fEnemies: ${names(c.enemies)}\n§fAlly requests: ${Object.entries(c.requests??{}).filter(([,r])=>r.expires>now()).map(([id])=>DB.clans.get(id)?.name).filter(Boolean).join(', ')||'None'}\n\n`+
    c.members.map(id=>`§f${playerName(id)} §7- ${clanRole(c,id)} ${online().some(p=>p.id===id)?'§aOnline':'§8Offline'}`).join('\n');
}
async function infoUI(p,m) { return menu(p,`§l[${m.c.tag}] ${m.c.name}`,infoText(m),[{text:'Close'}]); }
async function listUI(p) {
  access(p);
  return menu(p,'§lClans','Select a clan for info or join.',DB.clans.entries().sort((a,b)=>(b[1].kills??0)-(a[1].kills??0)).map(([id,c])=>{
    const ref=clans.ref({id,c});
    return {text:`[${c.tag}] ${c.name}\n${c.members.length} members | ${c.open?'Open':'Invite only'}`,run:()=>menu(p,c.name,infoText({id,c}),[
      {text:'Join',run:()=>action(p,()=>clans.join(p,id,ref),`${p.name} joined the clan!`)}, {text:'Close'}])};
  }));
}
async function manage(p,ref,tid) {
  const m=clans.member(p,ref,'Officer');
  return menu(p,playerName(tid),clanRole(m.c,tid),[
    ...['promote','demote','transfer'].map(op=>({text:op,run:async()=>{
      if(op==='transfer' && !await confirm(p,'Transfer','Make '+playerName(tid)+' the leader?'))return;
      action(p,()=>clans.rank(p,tid,op,ref),'Clan ranks updated.');
    }})),
    {text:'Kick',run:()=>attempt(p,()=>remove(p,tid,ref))},
  ]);
}
async function clanUI(p) {
  access(p); const m=clanOf(p.id);
  if(!m)return menu(p,'§lClans','Create cost: '+cur(cfg().clans.createCost),[
    {text:'Create Clan',run:async()=>{const r=await modal(p,'Create Clan',[{type:'text',key:'n',label:'Name (3-20)'},{type:'text',key:'t',label:'Tag (optional, 2-5)'}]); if(r)action(p,()=>clans.create(p,r.n,r.t),'Clan created!');}},
    ...clans.pending(p.id).map(inv=>({text:'Accept: '+inv.c.name,run:()=>action(p,()=>clans.join(p,inv.id,clans.ref(inv)),`${p.name} joined the clan!`)})),
    {text:'Clan List / Join',run:()=>listUI(p)},
  ]);
  const ref=clans.ref(m), c=m.c, mgr=clanRole(c,p.id)!=='Member';
  return menu(p,`§l[${c.tag}] ${c.name}`,infoText(m),[
    {text:'Members / Ranks',run:()=>{const live=clans.member(p,ref); return menu(p,'Members','',live.c.members.map(id=>({text:playerName(id)+' - '+clanRole(live.c,id),run:()=>attempt(p,()=>manage(p,ref,id))})));}},
    {text:'Clan Home',run:()=>attempt(p,()=>home(p,ref))},
    {text:'Clan Chat: '+(clanChat.has(p.id)?'ON':'OFF'),run:()=>attempt(p,()=>{clans.member(p,ref);toggle(p);})},
    {text:'Deposit',run:()=>bankUI(p,ref,false)},
    ...(mgr?[
      {text:'Invite',run:async()=>{const t=await pickPlayer(p,'Invite');attempt(p,()=>invite(p,t,ref));}},
      {text:'Set Home Here',run:()=>attempt(p,()=>sethome(p,ref))},
    ]:[]),
    ...(c.owner===p.id?[
      {text:'Withdraw',run:()=>bankUI(p,ref,true)},
      {text:'Settings / Open Join',run:async()=>{
        const colors=['§b','§a','§c','§e','§d','§6','§9','§f'];
        const r=await modal(p,'Clan Settings',[{type:'text',key:'n',label:'Name',default:c.name},{type:'toggle',key:'o',label:'Open joining',default:!!c.open},{type:'dropdown',key:'color',label:'Tag color',options:colors.map(color=>color+'['+c.tag+']'),default:Math.max(0,colors.indexOf(c.color))}]);
        if(r)action(p,()=>clans.settings(p,{name:r.n,open:r.o,color:colors[r.color]},ref),'Clan settings updated.');
      }},
      {text:'Allies / Enemies',run:async()=>{
        const r=await modal(p,'Relations',[{type:'text',key:'n',label:'Clan name or tag'},{type:'dropdown',key:'op',label:'Action',options:['Request / Accept Ally','Declare Enemy','Neutral / Remove Ally']}]);
        if(r)attempt(p,()=>relation(p,r.n,['ally','enemy','neutral'][r.op],ref));
      }},
      {text:'Disband',run:async()=>{if(await confirm(p,'Disband','Bank is returned to the leader. Disband?'))attempt(p,()=>disband(p,ref));}},
    ]:[{text:'Leave Clan',run:async()=>{if(await confirm(p,'Leave','Leave this clan?'))attempt(p,()=>remove(p,p.id,ref));}}]),
    {text:'Clan List',run:()=>listUI(p)},
  ]);
}
async function bankUI(p,ref,withdraw) {
  const r=await modal(p,withdraw?'Withdraw (Leader only)':'Deposit',[{type:'text',key:'a',label:'Positive whole amount'}]);
  if(r)action(p,()=>clans.bank(p,r.a,withdraw,ref),`${p.name} ${withdraw?'withdrew':'deposited'} ${r.a}.`);
}
chatHooks.format.push(p=>{const m=mod('clans')?clanOf(p.id):undefined; return m?`${m.c.color??'§b'}[${m.c.tag}] `:undefined;});
chatHooks.intercept.push((p,text)=>{
  if(!clanChat.has(p.id))return false;
  const m=clanOf(p.id), ref=m&&clans.ref(m);
  system.run(()=>attempt(p,()=>{if(!ref)throw new Error('No clan. Toggle clan chat off after joining.');sendChat(p,text,ref);}));
  return true; // Never leak a private message to public chat while disabled/locked.
});
world.afterEvents.playerLeave.subscribe(ev=>{clanChat.delete(ev.playerId);lastChat.delete(ev.playerId);});
world.beforeEvents.entityHurt?.subscribe(ev=>{
  if(!mod('clans'))return;
  const a=ev.damageSource?.damagingEntity,v=ev.hurtEntity;
  if(a?.typeId==='minecraft:player' && v.typeId==='minecraft:player' && a.id!==v.id && !duelPair(a.id,v.id) && clans.protected(a.id,v.id))ev.cancel=true;
});
world.afterEvents.entityDie.subscribe(ev=>{
  const a=ev.damageSource?.damagingEntity,v=ev.deadEntity;
  if(!mod('clans') || a?.typeId!=='minecraft:player' || v.typeId!=='minecraft:player' || a.id===v.id || duelPair(a.id,v.id))return;
  const m=clanOf(a.id),t=clanOf(v.id);
  if(m && m.id!==t?.id && !clans.allied(m,t)){const c={...m.c,kills:(m.c.kills??0)+1};DB.clans.set(m.id,c);}
});
cmd({name:'clan',aliases:['c','guild','team'],module:'clans',desc:'Clan menu and management',usage:'[create|join|invite|leave|info|list|chat|home|sethome|bank|promote|demote|kick|transfer|open|ally|enemy|neutral|disband]',run:async(p,args)=>{
  access(p); const a=[...args],op=(a.shift()??'').toLowerCase(),m=clanOf(p.id),ref=m&&clans.ref(m);
  switch(op) {
    case '':return clanUI(p);
    case 'create':return action(p,()=>clans.create(p,a[0],a[1]),'Clan created!');
    case 'join':case 'accept':return action(p,()=>clans.join(p,a.join(' ')),`${p.name} joined the clan!`);
    case 'invite': {const q=a.join(' ').toLowerCase(),t=online().find(t=>t.name.toLowerCase()===q);if(!t)throw new Error('Exact online player name required.');return invite(p,t,ref);}
    case 'leave':return remove(p,p.id,ref);
    case 'home':return home(p,ref);
    case 'sethome':return sethome(p,ref);
    case 'chat':return a.length?sendChat(p,a.join(' '),ref):toggle(p);
    case 'list':case 'top':return listUI(p);
    case 'info': {const target=a.length?clans.find(a.join(' ')):m;if(!target)throw new Error('Clan not found.');return infoUI(p,target);}
    case 'kick':case 'promote':case 'demote':case 'transfer': {
      const live=clans.member(p,ref),tid=memberId(live,a.join(' '));
      if(op==='kick')return remove(p,tid,ref);
      if(op==='transfer' && !await confirm(p,'Transfer','Make '+playerName(tid)+' leader?'))return;
      return action(p,()=>clans.rank(p,tid,op,ref),'Clan ranks updated.');
    }
    case 'open':if(!['on','off'].includes(a[0]))throw new Error('Use open on|off.');return action(p,()=>clans.settings(p,{open:a[0]==='on'},ref),'Join mode updated.');
    case 'bank':if(!a.length)return msg(p,'Clan bank: '+cur(clans.member(p,ref).c.bank??0));if(!['deposit','withdraw'].includes(a[0]))throw new Error('Use bank deposit|withdraw <amount>.');return action(p,()=>clans.bank(p,a[1],a[0]==='withdraw',ref),'Clan bank updated.');
    case 'ally':case 'enemy':case 'neutral':return relation(p,a.join(' '),op,ref);
    case 'disband':clans.member(p,ref,'Leader');if(await confirm(p,'Disband','Disband your clan? Bank refunded to leader.'))return disband(p,ref);return;
    default:throw new Error('Unknown clan subcommand.');
  }
}});
cmd({name:'cc',module:'clans',desc:'Private clan message',usage:'<message>',run:(p,a)=>sendChat(p,a.join(' '))});
addMember({text:'§l§bClan\n§r§8Join or manage a clan',icon:'textures/ui/essx/icons/clan',module:'clans',run:clanUI});
addAdmin({text:'§l§bClan Manager',icon:'textures/ui/essx/icons/clan',module:'clans',run:p=>menu(p,'All Clans','Delete a clan (bank refunded to its leader).',DB.clans.entries().map(([id,c])=>{
  const ref=clans.ref({id,c});return {text:`[${c.tag}] ${c.name}`,run:async()=>{if(await confirm(p,'Delete clan',c.name+'?'))attempt(p,()=>disband(p,ref,true));}};
}))});
registerPlugin({id:'clans',name:'Simple Clan System',module:'clans',icon:'textures/ui/essx/icons/clan',desc:'Clans, ranks, private chat, home, bank and consensual alliances.',fields:c=>[
  {type:'text',key:'cost',label:'Create cost (whole amount)',default:String(c.clans.createCost)},
  {type:'text',key:'max',label:'Max members (1-100)',default:String(c.clans.maxMembers)},
  {type:'text',key:'ttl',label:'Invite / alliance request seconds (30-86400)',default:String(c.clans.inviteSeconds)},
  {type:'toggle',key:'ff',label:'Allow same-clan PvP (allies remain protected)',default:c.clans.friendlyFire},
],apply:(c,r)=>{
  const cost=Number(r.cost),max=Number(r.max),ttl=Number(r.ttl);
  if(!Number.isSafeInteger(cost)||cost<0||!Number.isInteger(max)||max<1||max>100||!Number.isInteger(ttl)||ttl<30||ttl>86400)throw new Error('Invalid clan settings.');
  Object.assign(c.clans,{createCost:cost,maxMembers:max,inviteSeconds:ttl,friendlyFire:!!r.ff});
}});
