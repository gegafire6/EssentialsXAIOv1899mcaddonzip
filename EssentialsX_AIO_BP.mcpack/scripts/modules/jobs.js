// EssentialsX AIO | One active job with persistent XP, daily quests and payouts.
import { world, system, GameMode, ItemStack } from '@minecraft/server';
import { DB } from '../core/db.js';
import { cfg, mod } from '../core/config.js';
import { cmd, addMember } from '../core/commands.js';
import { activity } from '../core/activities.js';
import { menu, ok, err, cur, nameOf } from '../core/utils.js';
import { actionbar } from '../core/actionbar.js';
import { addBal, bal } from './economy.js';
import { isLoggedIn } from './login.js';

export const JOBS = {
  miner: { name:'Miner', money:4, xp:5, icon:'textures/items/iron_pickaxe', description:'Break natural ores with a pickaxe (no Silk Touch).', quest:'Mine 32 iron ores', goal:32, bonus:150 },
  lumberjack: { name:'Lumberjack', money:3, xp:4, icon:'textures/items/iron_axe', description:'Chop natural logs and stems with an axe.', quest:'Chop 32 natural logs', goal:32, bonus:120 },
  farmer: { name:'Farmer', money:3, xp:3, icon:'textures/items/wheat', description:'Harvest fully grown wheat, carrots, potatoes or beetroot.', quest:'Harvest 32 mature crops', goal:32, bonus:120 },
  hunter: { name:'Hunter', money:8, xp:10, icon:'textures/items/iron_sword', description:'Defeat hostile monsters.', quest:'Defeat 16 hostile mobs', goal:16, bonus:150 },
  fisherman: { name:'Fisherman', money:5, xp:5, icon:'textures/items/fishing_rod_uncast', description:'Catch fish or treasure with a fishing rod.', quest:'Catch 8 fish or treasures', goal:8, bonus:120 },
};
const ORE = /^minecraft:(?:lit_)?(?:deepslate_)?(?:coal|iron|copper|gold|redstone|lapis|diamond|emerald)_ore$|^minecraft:(?:nether_gold_ore|quartz_ore|ancient_debris)$/;
const LOG = /^minecraft:(?:(?:stripped_)?[a-z_]+_(?:log|stem)|log|log2)$/;
const CROPS = new Set(['minecraft:wheat','minecraft:carrots','minecraft:potatoes','minecraft:beetroot']);
const key = block => `${block.dimension.id}:${block.location.x},${block.location.y},${block.location.z}`;
const rates = new Map(), claimedTokens = new Set();
const fishingAvailable = !!world.beforeEvents.entityItemPickup;
export const jobLevel = xp => 1 + Math.floor(Math.max(0, xp) / 100);
export const multiplier = level => 1 + Math.min(2, Math.max(0, level - 1) * 0.1);
export const skillChance = level => level < 5 ? 0 : Math.min(0.20, 0.02 + (level - 5) * 0.005);
const today = () => new Date().toISOString().slice(0,10);
export function jobData(id) {
  const d = DB.jobs.get(id, { active:'', xp:{}, day:'', earned:0 });
  d.xp ??= {};
  return d;
}
function questFor(d, id, day) {
  const saved = d.quests?.[id];
  return saved?.day === day ? saved : { day, count:0, claimed:false };
}
export function chooseJob(p, id) {
  if (!mod('jobs') || !isLoggedIn(p)) return err(p, 'Jobs are unavailable.');
  if (id && !JOBS[id]) return err(p, 'Choose a listed job.');
  if (id === 'fisherman' && !fishingAvailable) return err(p, 'Fisherman requires the item pickup event in this Bedrock runtime.');
  const d = jobData(p.id); d.active = id; DB.jobs.set(p.id, d);
  ok(p, id ? `Joined ${JOBS[id].name}. Your previous job XP is kept.` : 'Left your job. Your XP is kept.');
}
function eligible(p) {
  return p?.isValid && mod('jobs') && mod('economy') && isLoggedIn(p) && !activity(p.id) && [GameMode.Survival, GameMode.Adventure].includes(p.getGameMode());
}
export function rewardJob(p, id, context = {}) {
  if (!eligible(p)) return false;
  const d = jobData(p.id), job = JOBS[id];
  if (!job || d.active !== id) return false;
  const time = Date.now(), previous = rates.get(p.id) ?? -Infinity;
  if (time - previous < 150) return false;
  const day = new Date(time).toISOString().slice(0,10);
  if (d.day !== day) { d.day = day; d.earned = 0; }
  const cap = Math.max(0, Math.min(1000000, Math.floor(Number(cfg().jobs.dailyLimit) || 0)));
  const oldLevel = jobLevel(d.xp[id] ?? 0), salary = Math.round(job.money * multiplier(oldLevel));
  if (d.earned + salary > cap) return false;
  rates.set(p.id, time);
  d.xp[id] = (d.xp[id] ?? 0) + job.xp;
  d.earned += salary;
  const quest = questFor(d, id, day);
  if (context.quest && !quest.claimed) quest.count = Math.min(job.goal, quest.count + 1);
  let questBonus = 0;
  if (!quest.claimed && quest.count >= job.goal) {
    questBonus = Math.min(job.bonus, cap - d.earned);
    d.earned += questBonus; quest.claimed = true;
  }
  d.quests ??= {}; d.quests[id] = quest;
  addBal(p.id, salary + questBonus); DB.jobs.set(p.id, d);
  const level = jobLevel(d.xp[id]);
  actionbar(p, `§e${job.name} §a+${cur(salary)} §b+${job.xp} job XP §7| Lv ${level}`);
  if (level > oldLevel) ok(p, `${job.name} reached level ${level}!`);
  if (quest.count >= job.goal && quest.claimed && context.quest && questBonus) ok(p, `Daily ${job.name} quest complete: +${cur(questBonus)}.`);
  if (context.drop && Math.random() < skillChance(level)) {
    try { p.dimension.spawnItem(new ItemStack(context.drop, 1), context.location ?? p.location); } catch (e) { console.warn('[EssX] Job bonus drop failed: ' + e); }
  }
  return true;
}
function oreDrop(type) {
  const ore = type.replace('minecraft:','').replace('lit_','').replace('deepslate_','');
  return ({coal_ore:'minecraft:coal',iron_ore:'minecraft:raw_iron',copper_ore:'minecraft:raw_copper',gold_ore:'minecraft:raw_gold',redstone_ore:'minecraft:redstone',lapis_ore:'minecraft:lapis_lazuli',diamond_ore:'minecraft:diamond',emerald_ore:'minecraft:emerald',nether_gold_ore:'minecraft:gold_nugget',quartz_ore:'minecraft:quartz',ancient_debris:'minecraft:ancient_debris'})[ore];
}
const cropDrops = {'minecraft:wheat':'minecraft:wheat','minecraft:carrots':'minecraft:carrot','minecraft:potatoes':'minecraft:potato','minecraft:beetroot':'minecraft:beetroot'};
const mobDrops = {'minecraft:zombie':'minecraft:rotten_flesh','minecraft:husk':'minecraft:rotten_flesh','minecraft:skeleton':'minecraft:bone','minecraft:stray':'minecraft:bone','minecraft:creeper':'minecraft:gunpowder','minecraft:spider':'minecraft:string'};
// Track placed ores and logs even while jobs are disabled, including Creative placements.
world.afterEvents.playerPlaceBlock.subscribe(ev => {
  if (ORE.test(ev.block.typeId) || LOG.test(ev.block.typeId)) DB.jobPlaced.set(key(ev.block), true);
});
world.afterEvents.playerBreakBlock.subscribe(ev => {
  const type = ev.brokenBlockPermutation.type.id, p = ev.player;
  if (ORE.test(type) || LOG.test(type)) {
    const k = key(ev.block), placed = DB.jobPlaced.has(k);
    if (placed) { DB.jobPlaced.delete(k); return; }
    const tool = ev.itemStackBeforeBreak;
    if (ORE.test(type)) {
      if (!tool?.typeId.endsWith('_pickaxe') || tool.getComponent('minecraft:enchantable')?.getEnchantment('silk_touch')) return;
      rewardJob(p, 'miner', {quest:/^(?:minecraft:)(?:deepslate_)?iron_ore$/.test(type), drop:oreDrop(type), location:ev.block.location});
    } else {
      if (!tool?.typeId.endsWith('_axe')) return;
      const drop = /^(?:minecraft:)(?:log|log2)$/.test(type) ? undefined : type;
      rewardJob(p, 'lumberjack', {quest:true, drop, location:ev.block.location});
    }
  } else if (CROPS.has(type) && ev.brokenBlockPermutation.getState('growth') === 7) {
    rewardJob(p, 'farmer', {quest:true, drop:cropDrops[type], location:ev.block.location});
  }
});
world.afterEvents.entityDie.subscribe(ev => {
  const p = ev.damageSource?.damagingEntity, dead = ev.deadEntity;
  if (p?.typeId !== 'minecraft:player' || dead.typeId === 'minecraft:player' || dead.typeId.startsWith('essx:')) return;
  if (dead.getComponent('minecraft:type_family')?.hasTypeFamily('monster')) rewardJob(p, 'hunter', {quest:true, drop:mobDrops[dead.typeId], location:dead.location});
});
// Fish and treasure loot pools emit a private marker. Intercept it before pickup,
// remove it on the next tick and attribute the catch to the collecting player.
world.beforeEvents.entityItemPickup?.subscribe(ev => {
  let stack; try { stack = ev.item.getComponent('minecraft:item')?.itemStack; } catch { return; }
  if (stack?.typeId !== 'essx:fishing_job_token') return;
  ev.cancel = true;
  const item = ev.item, player = ev.entity, id = item.id;
  if (claimedTokens.has(id)) return;
  claimedTokens.add(id);
  system.run(() => {
    try {
      if (!item.isValid) return;
      item.remove();
      if (player.typeId === 'minecraft:player') rewardJob(player, 'fisherman', {quest:true});
    } catch (e) { console.warn('[EssX] Fishing marker cleanup failed: ' + e); }
    finally { claimedTokens.delete(id); }
  });
});
if (!fishingAvailable) world.afterEvents.entitySpawn?.subscribe(ev => {
  if (ev.entity.typeId !== 'minecraft:item') return;
  system.run(() => {
    try { if (ev.entity.isValid && ev.entity.getComponent('minecraft:item')?.itemStack?.typeId === 'essx:fishing_job_token') ev.entity.remove(); } catch {}
  });
});
world.afterEvents.playerLeave.subscribe(ev => rates.delete(ev.playerId));
function leaderboardUI(p) {
  return menu(p, '§lJob Leaderboards', '§7Select a job to view its top players.', Object.entries(JOBS).map(([id,j])=>({
    text:`§l${j.name}`, icon:j.icon, run:()=>{
      const leaders=DB.jobs.entries().filter(([,d])=>(d?.xp?.[id] ?? 0)>0).sort((a,b)=>(b[1].xp[id]-a[1].xp[id]) || a[0].localeCompare(b[0])).slice(0,10);
      const body=leaders.map(([who,d],i)=>`§e#${i+1} §f${nameOf(who)} §7— Lv ${jobLevel(d.xp[id])} · ${d.xp[id]} XP`).join('\n') || '§7No job XP yet.';
      return menu(p,`§l${j.name} Leaders`,body,[{text:'§lClose',icon:'textures/ui/essx/icons/close'}]);
    },
  })));
}
export async function jobsUI(p) {
  if (!mod('jobs') || !isLoggedIn(p)) return err(p, 'Jobs are unavailable.');
  const d = jobData(p.id), day = today();
  const balance = mod('economy') ? cur(bal(p.id)) : 'Economy disabled';
  const buttons = Object.entries(JOBS).map(([id,j]) => {
    const xp=d.xp[id] ?? 0, level=jobLevel(xp), quest=questFor(d,id,day), active=d.active===id;
    return {text:`§l${j.name}${active?' §a(ACTIVE)':''}\n§r§7Lv ${level} · ${xp} XP · ${multiplier(level).toFixed(1)}x`,icon:j.icon,run:()=>menu(p,`§l${j.name}`,
      `§7${j.description}\n§7Level: §e${level} §7| XP: §b${xp} §7(${xp%100}/100 to next level)\n§7Salary: §a${cur(Math.round(j.money*multiplier(level)))} §7| Multiplier: §e${multiplier(level).toFixed(1)}x\n§7Bonus resource: ${id==='fisherman'?'§7Unavailable for fishing loot':`§e${Math.round(skillChance(level)*1000)/10}% §7(selected drops)`}\n§7Daily quest: ${j.quest} §e${quest.count}/${j.goal} ${quest.claimed?'§a(complete)':''}\n§7Quest reward: up to §a${cur(j.bonus)} §7within the daily payout limit.${id==='fisherman'&&!fishingAvailable?'\n§cFisherman is unavailable on this runtime.':''}`,
      [{text:active?'§l§cLeave Job':'§l§aJoin / Switch Job',icon:active?'textures/ui/essx/icons/close':j.icon,run:()=>chooseJob(p,active?'':id)}])};
  });
  return menu(p,'§lJobs',`§7Active: §e${JOBS[d.active]?.name ?? 'None'}\n§7Balance: §a${balance}\n§7Daily job payout: §a${cur(d.day===day?d.earned:0)} §7/ §a${cur(cfg().jobs.dailyLimit)}\n§7100 XP per level. Bonus resources start at level 5.\n§7Balance and progress refresh when this menu opens.`,[
    ...buttons,
    {text:'§l§6Job Leaderboards',icon:'textures/ui/essx/icons/trophy',run:()=>leaderboardUI(p)},
    {text:'§l§eRefresh balance & progress',icon:'textures/ui/essx/icons/cycle',run:()=>jobsUI(p)},
  ]);
}
cmd({ name:'jobs', aliases:['job'], module:'jobs', desc:'Choose a job and view job XP', usage:'[miner|lumberjack|farmer|hunter|fisherman|leave]', run:(p,a)=>a[0]?chooseJob(p,a[0].toLowerCase()==='leave'?'':a[0].toLowerCase()):jobsUI(p) });
addMember({ text:'§l§6Jobs\n§r§8Earn money & job XP', icon:'textures/ui/essx/icons/quest', module:'jobs', run:jobsUI });
