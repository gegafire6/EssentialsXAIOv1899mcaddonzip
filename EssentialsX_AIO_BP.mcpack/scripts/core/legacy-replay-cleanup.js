// Retire old replay viewers and ghosts without deleting saved recording data.
import { world, system } from '@minecraft/server';
import { reserve, release } from './activities.js';
import { isLoggedIn } from '../modules/login.js';
const RETURN = 'essx:replay:return', GHOST = 'essx:replay_ghost';
const tokens = new Map(), warned = new Set();
function recover(p) {
  if (!p?.isValid) return;
  let raw;
  try { raw = p.getDynamicProperty(RETURN); } catch { return; }
  if (raw === undefined) {
    const token = tokens.get(p.id); if (token) { release([p.id], token); tokens.delete(p.id); }
    warned.delete(p.id); return;
  }
  let token = tokens.get(p.id);
  if (!token) { token = {}; if (!reserve([p.id], 'recovery', token)) return; tokens.set(p.id, token); }
  if (!isLoggedIn(p)) return;
  try {
    const b = JSON.parse(raw);
    if (!b || ![b.x,b.y,b.z,b.rx,b.ry].every(Number.isFinite) || typeof b.dim !== 'string' || !['Survival','Creative','Adventure','Spectator'].includes(b.mode)) throw Error('Invalid saved return position');
    p.camera.clear();
    p.teleport({x:b.x,y:b.y,z:b.z},{dimension:world.getDimension(b.dim),rotation:{x:b.rx,y:b.ry},checkForBlocks:true,keepVelocity:false});
    p.setGameMode(b.mode);
    p.setDynamicProperty(RETURN, undefined);
    release([p.id], token); tokens.delete(p.id); warned.delete(p.id);
  } catch (e) {
    if (!warned.has(p.id)) { warned.add(p.id); console.warn('[EssX] Replay viewer return pending for '+p.id+': '+e); }
  }
}
function sweepGhosts() {
  for (const id of ['overworld','nether','the_end']) try {
    for (const ghost of world.getDimension(id).getEntities({type:GHOST})) try { ghost.remove(); } catch {}
  } catch {}
}
world.afterEvents.playerSpawn.subscribe(({player})=>system.run(()=>recover(player)));
world.afterEvents.playerLeave.subscribe(({playerId})=>{const token=tokens.get(playerId);if(token)release([playerId],token);tokens.delete(playerId);warned.delete(playerId);});
world.afterEvents.entityLoad?.subscribe(({entity})=>{if(entity.typeId===GHOST) system.run(()=>{try { if(entity.isValid)entity.remove(); } catch {}});});
system.run(()=>{ for (const p of world.getAllPlayers()) recover(p); sweepGhosts(); });
system.runInterval(()=>{ for (const p of world.getAllPlayers()) recover(p); }, 20);
system.runInterval(sweepGhosts, 100);
