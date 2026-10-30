// Five continuous cosmetics; positions are relative to the wearer's current feet.
export const BODY_PARTICLE_SLOTS = ["above", "crown", "particle_wings"];
export const BODY_PARTICLES = [
  { id: "halo_above", name: "Starlight Halo", tier: "common", slot: "above", particle: "essx:aura_gold", icon: "textures/items/nether_star" },
  { id: "hearts_above", name: "Floating Hearts", tier: "rare", slot: "above", particle: "essx:aura_heart", icon: "textures/ui/essx/icons/heart" },
  { id: "particle_crown", name: "Royal Crown", tier: "vip", slot: "crown", particle: "essx:aura_gold", icon: "textures/items/essx_hat_crown" },
  { id: "particle_angel_wings", name: "Angel Particle Wings", tier: "vip", slot: "particle_wings", particle: "essx:aura_ice", icon: "textures/items/essx_wings_angel" },
  { id: "particle_flame_wings", name: "Flame Particle Wings", tier: "legend", slot: "particle_wings", particle: "essx:aura_flame", icon: "textures/items/essx_wings_dragon" },
];
export const BODY_PARTICLE_INTERVAL = 5;
export const BODY_PARTICLE_BUDGET = 480;
export function bodyParticleFrame(fx, origin, yaw = 0, tick = 0, sneaking = false) {
  if (!BODY_PARTICLES.includes(fx) || ![origin?.x, origin?.y, origin?.z, yaw, tick].every(Number.isFinite)) return [];
  const points = [], lower = sneaking ? 0.3 : 0;
  const angle = yaw * Math.PI / 180, phase = tick * 0.08;
  const add = (x, y, back = 0) => points.push({
    id: fx.particle,
    location: { x: origin.x + Math.cos(angle) * x + Math.sin(angle) * back,
      y: origin.y + y - lower, z: origin.z + Math.sin(angle) * x - Math.cos(angle) * back },
  });
  if (fx.id === "halo_above") {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 + phase;
      add(Math.cos(a) * 0.55, 2.3 + Math.sin(a * 2 + phase) * 0.045, Math.sin(a) * 0.55);
    }
  } else if (fx.id === "hearts_above") {
    for (let i = 0; i < 3; i++) {
      const a = phase + i * Math.PI * 2 / 3;
      add(Math.cos(a) * 0.35, 2.15 + (Math.sin(a * 0.7) + 1) * 0.25, Math.sin(a) * 0.35);
    }
  } else if (fx.id === "particle_crown") {
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; add(Math.cos(a) * 0.4, 1.95, Math.sin(a) * 0.4); }
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      for (let step = 1; step <= 3; step++) {
        const r = 0.4 + step * 0.035;
        add(Math.cos(a) * r, 1.95 + step * 0.11, Math.sin(a) * r);
      }
    }
  } else {
    // Mirrored feather outlines and inner ribs, behind the torso; yaw ignores head pitch.
    const outline = [[0.18,1.45],[0.43,1.85],[0.8,2.12],[1.25,2.3],[1.13,1.96],[1.4,1.65],[1.02,1.63],[1.14,1.25],[0.78,1.4],[0.74,1.0],[0.44,1.18],[0.18,1.45], [0.4,1.48],[0.65,1.64],[0.85,1.86],[1.03,2.05]];
    const flutter = 0.88 + Math.sin(phase) * 0.1;
    for (const side of [-1, 1]) for (const [x, y] of outline) add(side * x * flutter, y, 0.32 + x * (1 - flutter) * 1.1);
  }
  return points;
}
