// Artifact abilities perform immediate actions; none apply potion/status effects.
export const ARTIFACTS = {
  'essx:aegis_heart': { name:'Aegis Heart', color:'§e', power:'Heart of Aegis', description:'Restore 4 hearts.', ingredients:['gold_block','diamond','netherite_ingot'] },
  'essx:phoenix_ember': { name:'Phoenix Ember', color:'§c', power:'Phoenix Nova', description:'Deal 4 hearts of damage to up to 6 nearby hostile mobs.', ingredients:['blaze_powder','ghast_tear','emerald'] },
  'essx:tempest_feather': { name:'Tempest Feather', color:'§b', power:'Tempest Dash', description:'Dash forward from the ground.', ingredients:['feather','phantom_membrane','diamond'] },
  'essx:titan_gauntlet': { name:'Titan Gauntlet', color:'§6', power:'Titan Slam', description:'Damage and push up to 6 nearby hostile mobs.', ingredients:['iron_block','netherite_scrap','diamond'] },
  'essx:void_prism': { name:'Void Prism', color:'§d', power:'Void Step', description:'Blink up to 6 blocks to safe, accessible ground.', ingredients:['ender_pearl','amethyst_shard','diamond'] },
  'essx:astral_compass': { name:'Astral Compass', color:'§b', power:'Astral Search', description:'Find the direction and distance of the nearest loaded hostile mob within 32 blocks.' },
  'essx:dragon_fang': { name:'Dragon Fang', color:'§d', power:'Dragon Bite', description:'Hit the hostile mob you aim at for 7 hearts and restore 2 hearts.' },
  'essx:frost_relic': { name:'Frost Relic', color:'§b', power:'Frost Lance', description:'Hit the hostile mob you aim at for 3 hearts and push it back.' },
  'essx:ancient_crown': { name:'Ancient Crown', color:'§e', power:'Ancient Mending', description:'Repair the most damaged non-artifact item in your inventory by 25% of its maximum durability.' },
  'essx:eclipse_orb': { name:'Eclipse Orb', color:'§5', power:'Eclipse Cataclysm', description:'Pull up to 6 hostile mobs within 8 blocks and deal 8 hearts of damage.' },
};
for (const [id, artifact] of Object.entries(ARTIFACTS)) artifact.icon = 'textures/items/' + id.replace(':', '_');

// Prepare before charging durability. The returned action is synchronous and may
// partially succeed, so a native failure after it starts still spends the use.
export function prepareAbility(p, id, api) {
  switch (id) {
    case 'essx:aegis_heart': {
      if (!api.canHeal(p)) throw Error('Your health is already full.');
      return () => api.heal(p,8);
    }
    case 'essx:phoenix_ember': {
      const targets=api.nearby(p,5,6);if(!targets.length)throw Error('No hostile mobs nearby.');
      return () => { for(const e of targets) api.hurt(p,e,8); };
    }
    case 'essx:tempest_feather': {
      if (!p.isOnGround) throw Error('Stand on the ground before dashing.');
      api.movementAllowed(p);
      const v=p.getViewDirection(), length=Math.hypot(v.x,v.z);if(length<0.05)throw Error('Look toward the horizon to dash.');
      return () => api.dash(p,{x:v.x/length*0.9,y:0.2,z:v.z/length*0.9});
    }
    case 'essx:titan_gauntlet': {
      const targets=api.nearby(p,4,6);if(!targets.length)throw Error('No hostile mobs nearby.');
      return () => { for(const e of targets) if(api.hurt(p,e,6)) api.push(p,e,1.4); };
    }
    case 'essx:void_prism': {
      api.movementAllowed(p);const destination=api.blinkDestination(p);if(!destination)throw Error('No safe accessible ground ahead.');
      return () => api.blink(p,destination);
    }
    case 'essx:astral_compass': {
      const targets=api.nearby(p,32,1);if(!targets.length)throw Error('No loaded hostile mobs within 32 blocks.');
      const e=targets[0],a=p.location,b=e.location,dx=b.x-a.x,dz=b.z-a.z,distance=Math.round(Math.hypot(dx,b.y-a.y,dz));
      const heading=Math.abs(dx)>Math.abs(dz)?(dx>0?'east':'west'):(dz>0?'south':'north');
      return () => api.notice(p,`Nearest hostile: ${e.typeId.replace('minecraft:','')} ~${distance} blocks ${heading}.`);
    }
    case 'essx:dragon_fang': {
      const e=api.aimed(p,12);if(!e)throw Error('Aim at an unobstructed hostile mob within 12 blocks.');
      return () => { if(api.hurt(p,e,14)) api.heal(p,4); };
    }
    case 'essx:frost_relic': {
      const e=api.aimed(p,10);if(!e)throw Error('Aim at an unobstructed hostile mob within 10 blocks.');
      return () => { if(api.hurt(p,e,6)) api.push(p,e,1.3); };
    }
    case 'essx:ancient_crown': {
      const repair=api.findRepair(p);if(!repair)throw Error('No damaged non-artifact item in your inventory.');
      return () => api.repair(p,repair);
    }
    case 'essx:eclipse_orb': {
      const targets=api.nearby(p,8,6);if(!targets.length)throw Error('No hostile mobs nearby.');
      return () => { for(const e of targets) { api.pull(p,e); api.hurt(p,e,16); } };
    }
    default: throw Error('Unknown artifact.');
  }
}
