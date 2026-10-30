// Player-only health styles. E8 bitmap artwork is independent of rank badges.
export const PLAYER_HEALTH_STYLES = [
  "Green Bar + HP (image 1)",
  "Small HP + Red Heart (image 2)",
  "Heart + Current / Max (image 3)",
];
export const PLAYER_HEALTH_GLYPHS = {
  shadedHeart: "\ue800", solidHeart: "\ue801", borderedHeart: "\ue802",
  digitStart: 0xe804, barStart: 0xe810, barParts: 4, barSteps: 20,
};
export function playerHealthStyle(value) {
  return Number.isInteger(value) && value >= 0 && value < PLAYER_HEALTH_STYLES.length ? value : 0;
}
export function playerHealthLine(health, settings = {}) {
  if (!health || !Number.isFinite(health.currentValue) || !Number.isFinite(health.effectiveMax) || health.effectiveMax <= 0) return "";
  const maximum = health.effectiveMax;
  const current = Math.max(0, Math.min(maximum, health.currentValue));
  const hp = String(Math.ceil(current)), max = String(Math.ceil(maximum));
  const g = PLAYER_HEALTH_GLYPHS;
  const style = playerHealthStyle(settings.style);
  if (settings.textOnly) {
    if (style === 1) return `§r§f${hp} §c❤§r`;
    return style === 2 ? `§r§c❤ §f${hp}/${max}§r` : `§r§c❤ §a[${"|".repeat(Math.floor(current / maximum * 10))}§8${"|".repeat(10 - Math.floor(current / maximum * 10))}§a] §f${hp}§r`;
  }
  if (style === 1) {
    return `§r§f${hp} ${g.solidHeart}§r`;
  }
  if (style === 2) return `§r§f${g.borderedHeart} ${hp}/${max}§r`;
  const step = Math.floor(current / maximum * g.barSteps);
  const bar = Array.from({ length: g.barParts }, (_, part) => String.fromCharCode(g.barStart + step * g.barParts + part)).join("");
  return `§r§f${g.shadedHeart} ${bar} ${hp}§r`;
}
export function playerHealthNametag(name, health, settings = {}) {
  const line = playerHealthLine(health, settings);
  if (!line) return name;
  return playerHealthStyle(settings.style) === 1 ? name + "\n" + line : line + "\n" + name;
}
