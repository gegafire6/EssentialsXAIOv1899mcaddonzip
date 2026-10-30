// Java-inspired attack timing. Damage, armor and enchantments remain Bedrock-native.
export function attackSpeed(typeId = "") {
  if (!typeId.startsWith("minecraft:")) return 4;
  const item = typeId.slice(10);
  if (/^(wooden|stone|iron|golden|diamond|netherite)_sword$/.test(item)) return 1.6;
  if (item === "trident") return 1.1;
  if (/^(wooden|stone)_axe$/.test(item)) return 0.8;
  if (item === "iron_axe") return 0.9;
  if (/^(golden|diamond|netherite)_axe$/.test(item)) return 1;
  if (/^(wooden|stone|iron|golden|diamond|netherite)_pickaxe$/.test(item)) return 1.2;
  if (/^(wooden|stone|iron|golden|diamond|netherite)_shovel$/.test(item)) return 1;
  if (/^(wooden|golden)_hoe$/.test(item)) return 1;
  if (item === "stone_hoe") return 2;
  if (item === "iron_hoe") return 3;
  return 4;
}

export function cooldownTicks(item, percent = 100) {
  const value = Number(percent);
  const scale = Number.isFinite(value) ? Math.max(25, Math.min(200, value)) / 100 : 1;
  return 20 / attackSpeed(item) * scale;
}

export function damageMultiplier(charge) {
  const c = Math.max(0, Math.min(1, charge));
  return 0.2 + 0.8 * c * c;
}

export class AttackCooldowns {
  states = new Map();

  observe(id, item, tick) {
    let state = this.states.get(id);
    if (!state) {
      state = { item, lastTick: -Infinity, attackTick: -Infinity, charge: 1 };
      this.states.set(id, state);
    } else if (state.item !== item) {
      // Switching weapons starts a new charge; fast items cannot pre-charge an axe.
      Object.assign(state, { item, lastTick: tick, attackTick: -Infinity });
    }
    return state;
  }

  charge(id, item, tick, percent) {
    const state = this.observe(id, item, tick);
    return Math.max(0, Math.min(1, (tick - state.lastTick + 0.5) / cooldownTicks(item, percent)));
  }

  attack(id, item, tick, percent) {
    const state = this.observe(id, item, tick);
    // Swing and damage callbacks can arrive in either order in the same tick.
    if (state.attackTick === tick) return state.charge;
    const charge = this.charge(id, item, tick, percent);
    Object.assign(state, { lastTick: tick, attackTick: tick, charge });
    return charge;
  }

  clear(id) { this.states.delete(id); }
}
