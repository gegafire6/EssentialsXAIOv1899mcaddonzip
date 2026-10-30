// Personal sidebar formatting; no game API calls. Data belongs to the receiving player.
export const SIDEBAR_MARKER = "§0§r§1§r";
// Formatting-only markers select an RP texture without adding a visible text row.
export const SIDEBAR_BACKGROUNDS = [
  { id: "default", label: "Cyan (reference)", marker: "" },
  { id: "pink", label: "Pink", marker: "§0§r§2§r" },
  { id: "blue", label: "Blue", marker: "§0§r§3§r" },
  { id: "yellow", label: "Yellow", marker: "§0§r§4§r" },
  { id: "green", label: "Green", marker: "§0§r§5§r" },
  { id: "rainbow", label: "Rainbow", marker: "§0§r§6§r" },
  { id: "midnight", label: "Midnight Blue • Moon", marker: "§0§r§7§r", icon: "textures/ui/sidebar/theme_midnight" },
  { id: "emerald", label: "Emerald Glass • Gem", marker: "§0§r§8§r", icon: "textures/ui/sidebar/theme_emerald" },
  { id: "royal", label: "Royal Gold • Crown", marker: "§0§r§9§r", icon: "textures/ui/sidebar/theme_royal" },
];
export const SIDEBAR_ICONS = { user: "\ue600", rank: "\ue601", money: "\ue602", location: "\ue603", kills: "\ue604", deaths: "\ue605", time: "\ue606", online: "\ue607", tps: "\ue608", level: "\ue609", dimension: "\ue60a", ratio: "\ue60b" };
const plain = value => String(value ?? "").replace(/§./g, "").replace(/[\r\n\t]/g, " ");
const short = (value, limit) => { const s = [...plain(value)]; return s.length > limit ? s.slice(0, limit - 1).join("") + "…" : s.join(""); };
function formattedShort(value, limit) {
  let result = "", length = 0;
  for (const token of String(value).replace(/[\r\n\t]/g, " ").match(/§.|[^]/gu) ?? []) {
    if (token.startsWith("§") && token.length === 2) { result += token; continue; }
    if (length++ >= limit) return result + "…§r";
    result += token;
  }
  return result;
}
const count = value => Math.max(0, Math.floor(Number(value) || 0));
export function sidebarTime(ms) {
  const seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
}
export function sidebarMoney(value) {
  const n = Number(value) || 0;
  for (const [unit, suffix] of [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
    if (Math.abs(n) >= unit) return (n / unit).toFixed(1).replace(/\.0$/, "") + suffix;
  }
  return Math.floor(n).toLocaleString("en-US");
}
// Fixed UTF-8 byte fields let JSON UI put each text section inside its own frame.
// Keep these widths in sync with hud.essx_sidebar's %.Ns format expressions.
export const SIDEBAR_FIELDS = [
  { id: "title", bytes: 192 }, { id: "subtitle", bytes: 192 },
  { id: "profile", bytes: 1024 }, { id: "footer", bytes: 192 },
  { id: "server", bytes: 512 },
];
function utf8Bytes(value) {
  let bytes = 0;
  for (const char of value) {
    const point = char.codePointAt(0);
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}
function packField(value, width) {
  // Routing markers must occur only before the packet, never inside stored rank text.
  const text = String(value).replace(/§0§r§[1-9]§r/g, "");
  let output = "", used = 0;
  for (const token of text.match(/§.|[^]/gu) ?? []) {
    const length = utf8Bytes(token);
    if (used + length > width - 3) break; // Reserve a complete §r reset.
    output += token; used += length;
  }
  return output + "§r" + " ".repeat(width - used - 3);
}
export function buildSidebar(data, options = {}) {
  const icon = key => {
    const glyph = key === "rank" ? (data.rankIcon ?? SIDEBAR_ICONS.rank) : SIDEBAR_ICONS[key];
    return options.icons === false || !glyph ? "" : "§f" + glyph + " ";
  };
  const row = (key, label, value, color = "§b") => icon(key) + color + label + ": §r" + value;
  const tps = Math.max(0, Math.min(20, Number(data.tps) || 0));
  const tc = tps >= 18 ? "§a" : tps >= 12 ? "§e" : "§c";
  const pos = data.location ?? { x: 0, y: 0, z: 0 };
  const rank = formattedShort(String(data.rank ?? "§7[Member]").replace(/[\uE500-\uE5FF] ?/g, ""), 20);
  const background = SIDEBAR_BACKGROUNDS.find(b => b.id === options.background) ?? SIDEBAR_BACKGROUNDS[0];
  const extraStats = options.extraStats !== false;
  const dimension = { "minecraft:overworld": "Overworld", "minecraft:nether": "Nether", "minecraft:the_end": "The End" }[data.dimension] ?? short(data.dimension ?? "Unknown", 12);
  const fields = {
    title: "§l§f" + short(options.title || "EssentialsX", 25),
    subtitle: "§l§f" + short(options.subtitle ?? "Your adventure, live", 30),
    profile: [
      row("user", "USER", "§f" + short(data.name, 16)),
      row("rank", "RANK", rank),
      row("money", "MONEY", "§a" + short(data.currency ?? "$", 4) + sidebarMoney(data.balance)),
      row("location", "XYZ", "§f" + [pos.x, pos.y, pos.z].map(v => Math.floor(Number(v) || 0)).join(" ")),
      row("kills", "KILLS", "§f" + count(data.kills)),
      row("deaths", "DEATHS", "§f" + count(data.deaths)),
      ...(extraStats ? [
        row("level", "XP LEVEL", "§e" + count(data.level)),
        row("dimension", "WORLD", "§f" + dimension),
        row("ratio", "K/D", "§f" + (count(data.kills) / Math.max(1, count(data.deaths))).toFixed(2)),
      ] : []),
    ].join("\n"),
    footer: "§l§f" + short(options.footer ?? "By Opiar • !menu", 30),
    server: [
      row("time", "TIME", "§f" + sidebarTime(data.playtime)),
      row("online", "ONLINE", "§f" + count(data.online)),
      row("tps", "TPS", tc + tps.toFixed(1) + "§8 / §720"),
    ].join("\n"),
  };
  return SIDEBAR_MARKER + background.marker + SIDEBAR_FIELDS.map(field => packField(fields[field.id], field.bytes)).join("");
}
